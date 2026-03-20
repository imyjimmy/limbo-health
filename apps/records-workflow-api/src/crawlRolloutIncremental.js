import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { closePool, query } from './db.js';
import { resolveFromServiceRoot } from './config.js';
import { runCrawl } from './services/crawlService.js';
import { importGeneratedSeeds } from './services/generatedSeedImportService.js';
import { generateStateSeedCandidates } from './services/generatedSeedService.js';
import {
  buildNationalRosterCoverageReport,
  loadOrBuildRoster
} from './services/nationalRosterAuditService.js';
import { getCliIntegerOptionValue, getCliOptionValue } from './utils/cliArgs.js';
import { buildOfficialHospitalIdentities } from './utils/hospitalRoster.js';
import { getRawStorageStateDir } from './utils/rawStorage.js';
import { isRolloutStateCode, normalizeStateCode } from './utils/states.js';

function parseArgs(argv) {
  return {
    state: normalizeStateCode(getCliOptionValue(argv, 'state')),
    chunkSize: getCliIntegerOptionValue(argv, 'chunk-size') || 25,
    concurrency: getCliIntegerOptionValue(argv, 'concurrency') || 2,
    minimumConfidence: getCliOptionValue(argv, 'minimum-confidence') || 'high',
    outputPath:
      getCliOptionValue(argv, 'output') ||
      `logs/reports/${new Date().toISOString().slice(0, 10)}-incremental-rollout.json`
  };
}

function chunkArray(items, chunkSize) {
  const chunks = [];
  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }
  return chunks;
}

function confidenceRank(value) {
  if (value === 'high') return 3;
  if (value === 'medium') return 2;
  return 1;
}

function filterImportableEntries(entries, minimumConfidence) {
  return entries.filter(
    (entry) => confidenceRank(entry.discovery_confidence || 'low') >= confidenceRank(minimumConfidence)
  );
}

async function listRawPdfFiles(state) {
  const directory = getRawStorageStateDir(state);

  try {
    const names = await fs.readdir(directory);
    return names.filter((name) => name.toLowerCase().endsWith('.pdf')).sort();
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

async function getStateDbSnapshot(state) {
  const results = await Promise.all([
    query(
      `select count(*)::int as count
         from hospital_systems
        where state = $1`,
      [state]
    ),
    query(
      `select count(*)::int as count
         from seed_urls su
         join hospital_systems hs on hs.id = su.hospital_system_id
        where hs.state = $1`,
      [state]
    ),
    query(
      `select count(*)::int as count
         from source_documents sd
         join hospital_systems hs on hs.id = sd.hospital_system_id
        where hs.state = $1`,
      [state]
    ),
    query(
      `select count(*)::int as count
         from source_documents sd
         join hospital_systems hs on hs.id = sd.hospital_system_id
        where hs.state = $1
          and sd.source_type = 'pdf'`,
      [state]
    ),
    query(
      `select count(*)::int as count
         from records_workflows rw
         join hospital_systems hs on hs.id = rw.hospital_system_id
        where hs.state = $1`,
      [state]
    )
  ]);

  return {
    systems: results[0].rows[0].count,
    seeds: results[1].rows[0].count,
    source_documents: results[2].rows[0].count,
    pdf_source_documents: results[3].rows[0].count,
    workflows: results[4].rows[0].count
  };
}

async function buildStateSnapshot(state) {
  const [db, rawPdfFiles] = await Promise.all([getStateDbSnapshot(state), listRawPdfFiles(state)]);
  return {
    db,
    raw_pdf_files: rawPdfFiles,
    raw_pdf_file_count: rawPdfFiles.length
  };
}

function summarizeRawDiff(beforeFiles, afterFiles) {
  const before = new Set(beforeFiles);
  const after = new Set(afterFiles);

  return {
    added_files: afterFiles.filter((file) => !before.has(file)),
    removed_files: beforeFiles.filter((file) => !after.has(file))
  };
}

async function writeReport(outputPath, report) {
  const resolvedOutputPath = resolveFromServiceRoot(outputPath, outputPath);
  await fs.mkdir(path.dirname(resolvedOutputPath), { recursive: true });
  await fs.writeFile(resolvedOutputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  return resolvedOutputPath;
}

async function main() {
  const { state, chunkSize, concurrency, minimumConfidence, outputPath } = parseArgs(process.argv.slice(2));
  if (!state) {
    throw new Error('--state is required.');
  }

  if (!isRolloutStateCode(state)) {
    throw new Error(`State ${state} is excluded from nationwide rollout targets.`);
  }

  const { roster, resolvedRosterFilePath } = await loadOrBuildRoster();
  const stateHospitals = buildOfficialHospitalIdentities(roster.hospitals_by_state[state] || []);
  const hospitalChunks = chunkArray(stateHospitals, chunkSize);
  const baseline = await buildStateSnapshot(state);

  const report = {
    generated_at: new Date().toISOString(),
    mode: 'incremental_real_rollout',
    state,
    roster_file_path: resolvedRosterFilePath,
    minimum_confidence: minimumConfidence,
    chunk_size: chunkSize,
    concurrency,
    official_hospital_identities: stateHospitals.length,
    baseline,
    chunks: [],
    final_audit: null,
    final_snapshot: null,
    comparison: null
  };

  const resolvedOutputPath = await writeReport(outputPath, report);

  for (let index = 0; index < hospitalChunks.length; index += 1) {
    const chunkHospitals = hospitalChunks[index];
    const chunkNumber = index + 1;
    const chunkLabel = String(chunkNumber).padStart(3, '0');
    const chunkOutputPath = `data/generated-seeds/${state.toLowerCase()}-systems.generated.chunk-${chunkLabel}.json`;

    const generated = await generateStateSeedCandidates({
      state,
      roster,
      officialHospitals: chunkHospitals,
      outputPath: chunkOutputPath,
      dryRun: false,
      concurrency
    });

    const importableEntries = filterImportableEntries(generated.entries, minimumConfidence);
    const imported = await importGeneratedSeeds({
      state,
      minimumConfidence,
      generatedSystems: generated.entries,
      dryRun: false
    });

    const crawledSystems = [];
    const crawlFailures = [];
    const importedSystemNames = Array.from(new Set(importableEntries.map((entry) => entry.system_name))).sort();

    for (const systemName of importedSystemNames) {
      try {
        const crawlSummary = await runCrawl({ state, systemName });
        crawledSystems.push({
          system_name: systemName,
          crawl_summary: crawlSummary
        });
      } catch (error) {
        crawlFailures.push({
          system_name: systemName,
          error: error.message
        });
      }
    }

    const stateAuditReport = await buildNationalRosterCoverageReport({
      rosterFilePath: resolvedRosterFilePath,
      states: [state],
      includeDbOnlyStates: true
    });

    report.chunks.push({
      chunk_number: chunkNumber,
      official_hospitals_in_chunk: chunkHospitals.length,
      generated_output_path: resolveFromServiceRoot(chunkOutputPath, chunkOutputPath),
      generated_summary: {
        official_hospital_identities: generated.official_hospital_identities,
        generated_systems: generated.generated_systems,
        confidence_summary: generated.confidence_summary
      },
      imported_summary: imported,
      imported_system_names: importedSystemNames,
      crawled_systems: crawledSystems,
      crawl_failures: crawlFailures,
      state_audit: stateAuditReport.state_audits[0] || null
    });

    await writeReport(outputPath, report);
  }

  report.final_audit = await buildNationalRosterCoverageReport({
    rosterFilePath: resolvedRosterFilePath,
    states: [state],
    includeDbOnlyStates: true
  });
  report.final_snapshot = await buildStateSnapshot(state);
  report.comparison = {
    db: {
      systems_added: report.final_snapshot.db.systems - baseline.db.systems,
      seeds_added: report.final_snapshot.db.seeds - baseline.db.seeds,
      source_documents_added: report.final_snapshot.db.source_documents - baseline.db.source_documents,
      pdf_source_documents_added:
        report.final_snapshot.db.pdf_source_documents - baseline.db.pdf_source_documents,
      workflows_added: report.final_snapshot.db.workflows - baseline.db.workflows
    },
    raw_pdf: summarizeRawDiff(baseline.raw_pdf_files, report.final_snapshot.raw_pdf_files)
  };

  await writeReport(outputPath, report);

  console.log(
    JSON.stringify(
      {
        output_path: resolvedOutputPath,
        state,
        chunk_count: report.chunks.length,
        comparison: report.comparison,
        final_verdict: report.final_audit?.state_audits?.[0]?.recommendation || null
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool();
  });

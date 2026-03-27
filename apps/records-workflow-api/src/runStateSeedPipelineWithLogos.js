import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { applyLocalRuntimeDefaults } from './utils/localRuntimeDefaults.js';
import { getCliIntegerOptionValue, getCliOptionValue } from './utils/cliArgs.js';
import { normalizeStateCode } from './utils/states.js';

await applyLocalRuntimeDefaults();

const { closePool, query } = await import('./db.js');
const { ensureDatabaseReady } = await import('./bootstrap.js');
const { resolveFromServiceRoot } = await import('./config.js');
const { readStateSeedFile } = await import('./services/seedEditorService.js');
const { reseedFromFile } = await import('./services/seedService.js');
const { runCrawl } = await import('./services/crawlService.js');
const {
  fetchStateSeedSystemLogos,
  buildDefaultStateLogoFetchReportPath,
} = await import('./services/stateSystemLogoService.js');

function buildTimestampStamp(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, '-');
}

function buildDefaultRunReportPath(state, date = new Date()) {
  const normalizedState = normalizeStateCode(state);
  if (!normalizedState) {
    throw new Error('A valid state code is required.');
  }

  const relativePath = `storage/state-runs/${normalizedState.toLowerCase()}/${buildTimestampStamp(date)}-seed-rerun-with-logos.json`;
  return resolveFromServiceRoot(relativePath, relativePath);
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function resolveCanonicalSystems(state, systems) {
  const names = systems.map((system) => system.system_name);
  const domains = systems.map((system) => system.domain).filter(Boolean);
  const result = await query(
    `select id, system_name, canonical_domain
       from hospital_systems
      where state = $1
        and active = true
        and (
          system_name = any($2::text[])
          or canonical_domain = any($3::text[])
        )
      order by system_name asc`,
    [state, names, domains],
  );

  const byName = new Map(result.rows.map((row) => [row.system_name, row]));
  const byDomain = new Map();
  for (const row of result.rows) {
    const domain = row.canonical_domain || null;
    if (!domain) continue;
    if (!byDomain.has(domain)) {
      byDomain.set(domain, []);
    }
    byDomain.get(domain).push(row);
  }

  const matchedRows = [];
  const unmatchedSystemNames = [];
  for (const system of systems) {
    const exactNameMatch = byName.get(system.system_name);
    if (exactNameMatch) {
      matchedRows.push(exactNameMatch);
      continue;
    }

    const domainRows = system.domain ? byDomain.get(system.domain) || [] : [];
    if (domainRows.length === 1) {
      matchedRows.push(domainRows[0]);
      continue;
    }

    unmatchedSystemNames.push(system.system_name);
  }

  const dedupedRows = Array.from(new Map(matchedRows.map((row) => [row.id, row])).values());
  return {
    rows: dedupedRows,
    unmatchedSystemNames,
  };
}

function parseArgs(argv) {
  const state = normalizeStateCode(getCliOptionValue(argv, 'state'));
  return {
    state,
    maxDepth: getCliIntegerOptionValue(argv, 'max-depth') ?? undefined,
    logoConcurrency: getCliIntegerOptionValue(argv, 'logo-concurrency') || undefined,
    outputPath: getCliOptionValue(argv, 'output') || buildDefaultRunReportPath(state || 'TX'),
    logoOutputPath: getCliOptionValue(argv, 'logo-output') || buildDefaultStateLogoFetchReportPath(state || 'TX'),
  };
}

async function main() {
  const { state, maxDepth, logoConcurrency, outputPath, logoOutputPath } = parseArgs(process.argv.slice(2));
  if (!state) {
    throw new Error('--state is required.');
  }

  console.log(`[state-seed-rerun] ensuring database is ready for ${state}`);
  const readiness = await ensureDatabaseReady();

  console.log(`[state-seed-rerun] loading canonical ${state} seed snapshot`);
  const seedSnapshot = await readStateSeedFile(state);
  console.log(
    `[state-seed-rerun] reseeding ${seedSnapshot.counts?.systems || seedSnapshot.systems.length} systems from ${seedSnapshot.seed_file_path}`,
  );
  const reseedSummary = await reseedFromFile({ state });

  const canonicalSystems = await resolveCanonicalSystems(state, seedSnapshot.systems);
  const canonicalSystemIds = canonicalSystems.rows.map((system) => system.id);
  console.log(
    `[state-seed-rerun] running pipeline for ${canonicalSystemIds.length} canonical ${state} systems`,
  );
  const crawlSummary = await runCrawl({
    state,
    hospitalSystemIds: canonicalSystemIds,
    ...(maxDepth ? { maxDepth } : {}),
  });

  console.log(`[state-seed-rerun] fetching logos for ${seedSnapshot.systems.length} canonical ${state} systems`);
  const logoRun = await fetchStateSeedSystemLogos({
    state,
    systems: seedSnapshot.systems,
    outputPath: logoOutputPath,
    ...(logoConcurrency ? { concurrency: logoConcurrency } : {}),
  });

  const report = {
    generated_at: new Date().toISOString(),
    state,
    seed_file_path: seedSnapshot.seed_file_path,
    seed_system_count: seedSnapshot.systems.length,
    database_ready: readiness,
    reseed_summary: reseedSummary,
    canonical_system_rows: canonicalSystems.rows,
    unmatched_seed_system_names: canonicalSystems.unmatchedSystemNames,
    crawl_summary: crawlSummary,
    logo_report_path: logoRun.reportPath,
    logo_asset_dir: logoRun.assetDir,
    logo_summary: {
      fetched_count: logoRun.summary.fetched_count,
      svg_count: logoRun.summary.svg_count,
      bitmap_count: logoRun.summary.bitmap_count,
      failed_count: logoRun.summary.failed_count,
    },
  };

  const resolvedOutputPath = resolveFromServiceRoot(outputPath, outputPath);
  await writeJson(resolvedOutputPath, report);

  console.log(
    JSON.stringify(
      {
        output_path: resolvedOutputPath,
        state,
        seed_system_count: seedSnapshot.systems.length,
        canonical_system_count: canonicalSystemIds.length,
        crawl_status: crawlSummary.status,
        crawled: crawlSummary.crawled,
        extracted: crawlSummary.extracted,
        failed: crawlSummary.failed,
        logo_report_path: logoRun.reportPath,
        logos_fetched: logoRun.summary.fetched_count,
        svg_logos_fetched: logoRun.summary.svg_count,
      },
      null,
      2,
    ),
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

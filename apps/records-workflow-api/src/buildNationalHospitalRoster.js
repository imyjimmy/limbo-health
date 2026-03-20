import fs from 'node:fs/promises';
import path from 'node:path';
import { closePool } from './db.js';
import { resolveFromServiceRoot } from './config.js';
import {
  buildNationalHospitalRoster,
  CMS_POS_HOSPITAL_ROSTER_URL,
  fetchCmsPosHospitalCsv
} from './utils/hospitalRoster.js';
import { getCliOptionValue } from './utils/cliArgs.js';

const DEFAULT_OUTPUT_PATH = 'data/national-roster/cms-pos-q4-2025-active-hospitals.json';

function parseArgs(argv) {
  return {
    outputPath: getCliOptionValue(argv, 'output') || DEFAULT_OUTPUT_PATH,
    sourceUrl: getCliOptionValue(argv, 'source-url') || CMS_POS_HOSPITAL_ROSTER_URL
  };
}

async function main() {
  const { outputPath, sourceUrl } = parseArgs(process.argv.slice(2));
  const csvText = await fetchCmsPosHospitalCsv(sourceUrl);
  const roster = buildNationalHospitalRoster({ csvText, sourceUrl });

  const resolvedOutputPath = resolveFromServiceRoot(outputPath, outputPath);
  await fs.mkdir(path.dirname(resolvedOutputPath), { recursive: true });
  await fs.writeFile(resolvedOutputPath, `${JSON.stringify(roster, null, 2)}\n`, 'utf8');

  console.log(
    JSON.stringify(
      {
        output_path: resolvedOutputPath,
        total_hospital_category_rows: roster.totals.hospital_category_rows,
        total_active_non_skeleton_hospital_rows: roster.totals.active_non_skeleton_hospital_rows,
        states_included: roster.totals.states_included
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

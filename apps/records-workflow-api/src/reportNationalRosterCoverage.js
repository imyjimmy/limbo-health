import process from 'node:process';
import { closePool } from './db.js';
import {
  buildDefaultAuditOutputPath,
  DEFAULT_ROSTER_FILE,
  writeNationalRosterCoverageReport
} from './services/nationalRosterAuditService.js';
import { getCliOptionValue } from './utils/cliArgs.js';
import { normalizeStateCode } from './utils/states.js';

function parseArgs(argv) {
  const rawStates = getCliOptionValue(argv, 'states');
  return {
    rosterFilePath: getCliOptionValue(argv, 'roster-file') || DEFAULT_ROSTER_FILE,
    outputPath: getCliOptionValue(argv, 'output') || buildDefaultAuditOutputPath(),
    states: rawStates
      ? rawStates
          .split(',')
          .map((value) => normalizeStateCode(value))
          .filter(Boolean)
      : null
  };
}

async function main() {
  const { rosterFilePath, outputPath, states } = parseArgs(process.argv.slice(2));
  const { report, resolvedOutputPath } = await writeNationalRosterCoverageReport({
    rosterFilePath,
    outputPath,
    states
  });

  console.log(
    JSON.stringify(
      {
        output_path: resolvedOutputPath,
        audited_states: report.state_audits.map((state) => ({
          state: state.state,
          recommendation: state.recommendation,
          exact_match_rate: state.coverage.exact_match_rate,
          weighted_match_rate: state.coverage.weighted_match_rate,
          official_unique_hospital_identities: state.coverage.official_unique_hospital_identities
        })),
        overall_decision: report.overall_decision
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

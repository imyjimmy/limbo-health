import process from 'node:process';
import { closePool } from './db.js';
import { loadOrBuildRoster } from './services/nationalRosterAuditService.js';
import { generateStateSeedCandidates } from './services/generatedSeedService.js';
import { determineRolloutStates } from './services/continuousRolloutService.js';
import { getCliIntegerOptionValue, getCliOptionValue } from './utils/cliArgs.js';
import { isRolloutStateCode, normalizeStateCode } from './utils/states.js';
import { buildNationalRosterCoverageReport } from './services/nationalRosterAuditService.js';

function parseArgs(argv) {
  return {
    state: normalizeStateCode(getCliOptionValue(argv, 'state')),
    allRemaining: argv.includes('--all-remaining'),
    dryRun: argv.includes('--dry-run'),
    maxStates: getCliIntegerOptionValue(argv, 'max-states')
  };
}

async function main() {
  const { state, allRemaining, dryRun, maxStates } = parseArgs(process.argv.slice(2));
  if (state && !isRolloutStateCode(state)) {
    throw new Error(`State ${state} is excluded from nationwide rollout targets.`);
  }

  const { roster } = await loadOrBuildRoster();
  const currentAudit =
    state || !allRemaining ? { state_audits: [] } : await buildNationalRosterCoverageReport({ includeDbOnlyStates: true });
  const states = state ? [state] : determineRolloutStates({ roster, currentAudit, allRemaining, maxStates });

  const summaries = [];
  for (const currentState of states) {
    summaries.push(
      await generateStateSeedCandidates({
        state: currentState,
        roster,
        dryRun
      })
    );
  }

  console.log(
    JSON.stringify(
      {
        states,
        dry_run: dryRun,
        summaries: summaries.map((summary) => ({
          state: summary.state,
          official_hospital_identities: summary.official_hospital_identities,
          generated_systems: summary.generated_systems,
          confidence_summary: summary.confidence_summary,
          output_path: summary.output_path
        }))
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

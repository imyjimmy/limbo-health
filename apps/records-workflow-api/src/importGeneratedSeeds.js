import process from 'node:process';
import { closePool } from './db.js';
import { buildNationalRosterCoverageReport, loadOrBuildRoster } from './services/nationalRosterAuditService.js';
import { determineRolloutStates } from './services/continuousRolloutService.js';
import { importGeneratedSeeds } from './services/generatedSeedImportService.js';
import { getCliIntegerOptionValue, getCliOptionValue } from './utils/cliArgs.js';
import { isRolloutStateCode, normalizeStateCode } from './utils/states.js';

function parseArgs(argv) {
  return {
    state: normalizeStateCode(getCliOptionValue(argv, 'state')),
    allRemaining: argv.includes('--all-remaining'),
    dryRun: argv.includes('--dry-run'),
    maxStates: getCliIntegerOptionValue(argv, 'max-states'),
    minimumConfidence: getCliOptionValue(argv, 'minimum-confidence') || 'high'
  };
}

async function main() {
  const { state, allRemaining, dryRun, maxStates, minimumConfidence } = parseArgs(process.argv.slice(2));
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
      await importGeneratedSeeds({
        state: currentState,
        dryRun,
        minimumConfidence
      })
    );
  }

  console.log(JSON.stringify({ states, dry_run: dryRun, minimum_confidence: minimumConfidence, summaries }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool();
  });

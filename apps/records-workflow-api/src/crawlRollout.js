import process from 'node:process';
import { closePool } from './db.js';
import { buildDefaultRolloutOutputPath, runContinuousRollout } from './services/continuousRolloutService.js';
import { getCliIntegerOptionValue, getCliOptionValue } from './utils/cliArgs.js';
import { isRolloutStateCode, normalizeStateCode } from './utils/states.js';

function parseArgs(argv) {
  return {
    state: normalizeStateCode(getCliOptionValue(argv, 'state')),
    allRemaining: argv.includes('--all-remaining'),
    dryRun: argv.includes('--dry-run'),
    maxStates: getCliIntegerOptionValue(argv, 'max-states'),
    outputPath: getCliOptionValue(argv, 'output') || buildDefaultRolloutOutputPath(),
    minimumConfidence: getCliOptionValue(argv, 'minimum-confidence') || 'high',
    concurrency: getCliIntegerOptionValue(argv, 'concurrency')
  };
}

async function main() {
  const { state, allRemaining, dryRun, maxStates, outputPath, minimumConfidence, concurrency } = parseArgs(
    process.argv.slice(2)
  );
  if (state && !isRolloutStateCode(state)) {
    throw new Error(`State ${state} is excluded from nationwide rollout targets.`);
  }

  const { report, resolvedOutputPath } = await runContinuousRollout({
    state,
    allRemaining,
    dryRun,
    maxStates,
    outputPath,
    minimumConfidence,
    generateConcurrency: concurrency
  });

  console.log(
    JSON.stringify(
      {
        output_path: resolvedOutputPath,
        dry_run: dryRun,
        minimum_confidence: minimumConfidence,
        concurrency,
        targeted_states: report.targeted_states,
        national_summary: report.national_summary
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

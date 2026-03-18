import process from 'node:process';
import { closePool } from './db.js';
import { resetCrawlState } from './services/crawlResetService.js';
import { getCliOptionValue } from './utils/cliArgs.js';

function usage() {
  console.log(
    [
      'Usage:',
      '  node src/resetCrawlState.js --state MA --include-derived',
      '',
      'This command deletes crawl-derived data and raw files for a single state only.'
    ].join('\n')
  );
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    usage();
    return;
  }

  const summary = await resetCrawlState({
    state: getCliOptionValue(args, 'state'),
    includeDerived: args.includes('--include-derived')
  });

  console.log('State crawl reset:', JSON.stringify(summary, null, 2));
}

main()
  .catch((error) => {
    console.error('State crawl reset failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool();
  });

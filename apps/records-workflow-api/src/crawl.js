import process from 'node:process';
import { runCrawl } from './services/crawlService.js';
import { closePool } from './db.js';
import { getCliIntegerOptionValue, getCliOptionValue } from './utils/cliArgs.js';

async function crawl() {
  const args = process.argv.slice(2);
  const summary = await runCrawl({
    state: getCliOptionValue(args, 'state'),
    systemName: getCliOptionValue(args, 'system-name'),
    maxDepth: getCliIntegerOptionValue(args, 'max-depth') ?? undefined
  });
  console.log('Crawl finished:', JSON.stringify(summary, null, 2));
}

crawl()
  .catch((error) => {
    console.error('Crawl failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool();
  });

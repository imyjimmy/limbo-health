import { runCrawl } from './services/crawlService.js';
import { closePool } from './db.js';

async function crawl() {
  const summary = await runCrawl({});
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

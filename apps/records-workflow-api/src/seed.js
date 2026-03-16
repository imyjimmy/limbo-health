import process from 'node:process';
import { reseedFromFile } from './services/seedService.js';
import { closePool } from './db.js';
import { getCliOptionValue } from './utils/cliArgs.js';

async function seed() {
  const args = process.argv.slice(2);
  const summary = await reseedFromFile({
    state: getCliOptionValue(args, 'state'),
    seedFilePath: getCliOptionValue(args, 'seed-file')
  });
  console.log('Reseed complete:', summary);
}

seed()
  .catch((error) => {
    console.error('Reseed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool();
  });

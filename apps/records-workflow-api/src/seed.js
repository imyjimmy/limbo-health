import { reseedFromFile } from './services/seedService.js';
import { closePool } from './db.js';

async function seed() {
  const summary = await reseedFromFile();
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

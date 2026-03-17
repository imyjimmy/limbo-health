import { closePool } from './db.js';
import { applySchema } from './bootstrap.js';

async function migrate() {
  await applySchema();
  console.log('Database schema applied successfully.');
}

migrate()
  .catch((error) => {
    console.error('Migration failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool();
  });

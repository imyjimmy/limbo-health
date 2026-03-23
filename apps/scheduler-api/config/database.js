import { resolveCoreDatabaseConfig } from '../../../packages/core-db/config.mjs';
import { createPostgresCompatPool } from '../../../packages/core-db/postgresCompat.mjs';

const getDatabaseUrl = () => {
  return resolveCoreDatabaseConfig().connectionString;
};

const pool = createPostgresCompatPool(resolveCoreDatabaseConfig());

export { pool, getDatabaseUrl };

function asInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function encodeComponent(value) {
  return encodeURIComponent(String(value));
}

export function resolveCoreDatabaseUrl(env = process.env) {
  if (env.DATABASE_URL) {
    return env.DATABASE_URL;
  }

  const host =
    env.POSTGRES_HOST ||
    env.RECORDS_WORKFLOW_DB_HOST ||
    env.DB_HOST ||
    'localhost';
  const port =
    env.POSTGRES_PORT ||
    env.RECORDS_WORKFLOW_DB_PORT ||
    env.DB_PORT ||
    '5433';
  const user =
    env.POSTGRES_USER ||
    env.RECORDS_WORKFLOW_DB_USER ||
    env.DB_USER ||
    'postgres';
  const password =
    env.POSTGRES_PASSWORD ||
    env.RECORDS_WORKFLOW_DB_PASSWORD ||
    env.DB_PASSWORD ||
    'postgres';
  const database =
    env.POSTGRES_DB ||
    env.RECORDS_WORKFLOW_DB_NAME ||
    env.DB_NAME ||
    'records_workflow';

  return `postgres://${encodeComponent(user)}:${encodeComponent(password)}@${host}:${port}/${encodeComponent(database)}`;
}

export function resolveCoreDatabaseConfig(env = process.env) {
  return {
    connectionString: resolveCoreDatabaseUrl(env),
    max: asInt(env.DB_CONNECTION_LIMIT, 10),
  };
}

import pg from 'pg';

const { Pool, types } = pg;

// Parse Postgres bigint counts into JS numbers for mysql2-like ergonomics.
types.setTypeParser(20, (value) => Number.parseInt(value, 10));

function normalizeParams(params = []) {
  return params.map((value) => (value === undefined ? null : value));
}

function translatePlaceholders(sql) {
  let translated = '';
  let index = 0;
  let placeholderIndex = 1;
  let state = 'normal';

  while (index < sql.length) {
    const current = sql[index];
    const next = sql[index + 1];

    if (state === 'normal') {
      if (current === "'") {
        state = 'single-quote';
        translated += current;
        index += 1;
        continue;
      }
      if (current === '"') {
        state = 'double-quote';
        translated += current;
        index += 1;
        continue;
      }
      if (current === '-' && next === '-') {
        state = 'line-comment';
        translated += current + next;
        index += 2;
        continue;
      }
      if (current === '/' && next === '*') {
        state = 'block-comment';
        translated += current + next;
        index += 2;
        continue;
      }
      if (current === '?') {
        translated += `$${placeholderIndex}`;
        placeholderIndex += 1;
        index += 1;
        continue;
      }
      translated += current;
      index += 1;
      continue;
    }

    if (state === 'single-quote') {
      translated += current;
      index += 1;
      if (current === "'" && next === "'") {
        translated += next;
        index += 1;
        continue;
      }
      if (current === "'") {
        state = 'normal';
      }
      continue;
    }

    if (state === 'double-quote') {
      translated += current;
      index += 1;
      if (current === '"' && next === '"') {
        translated += next;
        index += 1;
        continue;
      }
      if (current === '"') {
        state = 'normal';
      }
      continue;
    }

    if (state === 'line-comment') {
      translated += current;
      index += 1;
      if (current === '\n') {
        state = 'normal';
      }
      continue;
    }

    if (state === 'block-comment') {
      translated += current;
      index += 1;
      if (current === '*' && next === '/') {
        translated += next;
        index += 1;
        state = 'normal';
      }
      continue;
    }
  }

  return translated;
}

function getStatementKind(sql, rowCount) {
  const normalized = sql.trim().replace(/^[(/;\s]+/, '').toUpperCase();
  if (normalized.startsWith('SELECT')) return 'select';
  if (normalized.startsWith('WITH') && rowCount === null) return 'select';
  if (normalized.startsWith('INSERT')) return 'insert';
  if (normalized.startsWith('UPDATE')) return 'update';
  if (normalized.startsWith('DELETE')) return 'delete';
  return 'other';
}

function toMysqlLikeResult(sql, pgResult) {
  const rowCount = typeof pgResult?.rowCount === 'number' ? pgResult.rowCount : null;
  const rows = Array.isArray(pgResult?.rows) ? pgResult.rows : [];
  const statementKind = getStatementKind(sql, rowCount);

  if (statementKind === 'select') {
    return [rows, []];
  }

  const result = {
    affectedRows: rowCount ?? 0,
    rowCount: rowCount ?? 0,
    rows,
  };

  if (rows.length > 0 && Object.hasOwn(rows[0], 'id')) {
    result.insertId = rows[0].id;
  } else if (statementKind === 'insert') {
    result.insertId = null;
  }

  return [result, []];
}

async function executeOnQueryable(queryable, sql, params = []) {
  const translated = translatePlaceholders(sql);
  const normalizedParams = normalizeParams(params);
  const result = await queryable.query(translated, normalizedParams);
  return toMysqlLikeResult(sql, result);
}

function wrapClient(client) {
  return {
    async query(sql, params = []) {
      return executeOnQueryable(client, sql, params);
    },
    async execute(sql, params = []) {
      return executeOnQueryable(client, sql, params);
    },
    async beginTransaction() {
      await client.query('BEGIN');
    },
    async commit() {
      await client.query('COMMIT');
    },
    async rollback() {
      await client.query('ROLLBACK');
    },
    release() {
      client.release();
    },
  };
}

export function createPostgresCompatPool(options) {
  const pool = new Pool(options);

  return {
    async query(sql, params = []) {
      return executeOnQueryable(pool, sql, params);
    },
    async execute(sql, params = []) {
      return executeOnQueryable(pool, sql, params);
    },
    async getConnection() {
      const client = await pool.connect();
      return wrapClient(client);
    },
    async end() {
      await pool.end();
    },
    rawPool: pool,
  };
}

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from 'pg';
import { createPostgresCompatPool } from '../../../packages/core-db/postgresCompat.mjs';
import { backfillUserNameFromGoogle } from '../services/googleProfileBackfill.js';

const TEST_DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgres://postgres:postgres@localhost:5433/records_workflow';

describe('backfillUserNameFromGoogle', () => {
  const db = createPostgresCompatPool({ connectionString: TEST_DATABASE_URL });
  const client = new Client({ connectionString: TEST_DATABASE_URL });

  beforeAll(async () => {
    await client.connect();
  });

  afterAll(async () => {
    await client.end();
    await db.end();
  });

  it('does not fail when Google user info is missing first and last names', async () => {
    const email = `google-backfill-${Date.now()}@example.com`;
    const inserted = await client.query(
      `INSERT INTO users (email, create_datetime)
       VALUES ($1, NOW())
       RETURNING id`,
      [email]
    );
    const userId = inserted.rows[0].id;

    try {
      await expect(
        backfillUserNameFromGoogle(db, userId, {
          email,
          givenName: null,
          familyName: null,
          name: null,
        })
      ).resolves.toBeUndefined();

      const updated = await client.query(
        `SELECT email, first_name, last_name
         FROM users
         WHERE id = $1`,
        [userId]
      );

      expect(updated.rows[0]).toEqual({
        email,
        first_name: null,
        last_name: null,
      });
    } finally {
      await client.query('DELETE FROM users WHERE id = $1', [userId]);
    }
  });
});

import { Connection } from 'mysql2/promise';

interface User {
  userId?: number;
  pubkey?: string;
  loginMethod?: string;
  oauthProvider?: string;
}

export async function getUserId(connection: Connection, user: User): Promise<number | null> {
  if (user.loginMethod === 'google' || user.oauthProvider === 'google') {
    // Google users already have userId in JWT
    const [rows] = await connection.execute(
      `SELECT id FROM users WHERE id = ?`,
      [user.userId]
    ) as any;
    return rows.length > 0 ? rows[0].id : null;
  } else {
    // Nostr users need to look up by pubkey
    const [rows] = await connection.execute(
      `SELECT id FROM users WHERE nostr_pubkey = ?`,
      [user.pubkey]
    ) as any;
    return rows.length > 0 ? rows[0].id : null;
  }
}
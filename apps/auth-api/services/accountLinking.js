function uniqueUserIds(values) {
  return [...new Set(values.map((value) => Number(value)).filter((value) => Number.isInteger(value) && value > 0))];
}

async function findLegacyLinkedUserIds(conn, { currentUserId, pubkey, googleId, email }) {
  const legacyIds = [];

  if (pubkey) {
    const [rows] = await conn.query(
      'SELECT id FROM users WHERE nostr_pubkey = ? AND id <> ?',
      [pubkey, currentUserId],
    );
    legacyIds.push(...rows.map((row) => row.id));
  }

  if (googleId) {
    const [rows] = await conn.query(
      `SELECT user_id
         FROM oauth_connections
        WHERE provider = 'google'
          AND provider_user_id = ?
          AND user_id <> ?`,
      [googleId, currentUserId],
    );
    legacyIds.push(...rows.map((row) => row.user_id));
  }

  if (email) {
    const [rows] = await conn.query(
      `SELECT user_id
         FROM oauth_connections
        WHERE provider = 'google'
          AND provider_email = ?
          AND user_id <> ?`,
      [email, currentUserId],
    );
    legacyIds.push(...rows.map((row) => row.user_id));
  }

  return uniqueUserIds(legacyIds);
}

async function transferSingletonTable(conn, tableName, idColumn, fromUserId, toUserId) {
  const [sourceRows] = await conn.query(
    `SELECT 1 FROM ${tableName} WHERE ${idColumn} = ? LIMIT 1`,
    [fromUserId],
  );

  if (sourceRows.length === 0) {
    return;
  }

  const [targetRows] = await conn.query(
    `SELECT 1 FROM ${tableName} WHERE ${idColumn} = ? LIMIT 1`,
    [toUserId],
  );

  if (targetRows.length > 0) {
    await conn.query(`DELETE FROM ${tableName} WHERE ${idColumn} = ?`, [fromUserId]);
    return;
  }

  await conn.query(
    `UPDATE ${tableName} SET ${idColumn} = ? WHERE ${idColumn} = ?`,
    [toUserId, fromUserId],
  );
}

async function transferOauthConnections(conn, fromUserId, toUserId) {
  const [oauthRows] = await conn.query(
    `SELECT id, provider, provider_user_id
       FROM oauth_connections
      WHERE user_id = ?`,
    [fromUserId],
  );

  for (const row of oauthRows) {
    const [existingRows] = await conn.query(
      `SELECT id
         FROM oauth_connections
        WHERE user_id = ?
          AND provider = ?
          AND provider_user_id = ?
        LIMIT 1`,
      [toUserId, row.provider, row.provider_user_id],
    );

    if (existingRows.length > 0) {
      await conn.query('DELETE FROM oauth_connections WHERE id = ?', [row.id]);
      continue;
    }

    await conn.query('UPDATE oauth_connections SET user_id = ? WHERE id = ?', [toUserId, row.id]);
  }
}

async function transferArtifactsFromLegacyUser(conn, fromUserId, toUserId) {
  if (fromUserId === toUserId) {
    return;
  }

  await conn.query(
    'UPDATE repositories SET owner_user_id = ? WHERE owner_user_id = ?',
    [toUserId, fromUserId],
  );

  await conn.query(
    `INSERT INTO repository_access (user_id, repo_id, access_level)
     SELECT ?, repo_id, access_level
       FROM repository_access
      WHERE user_id = ?
     ON CONFLICT (repo_id, user_id) DO UPDATE
       SET access_level = EXCLUDED.access_level`,
    [toUserId, fromUserId],
  );

  await conn.query('DELETE FROM repository_access WHERE user_id = ?', [fromUserId]);

  await conn.query(
    'UPDATE scan_sessions SET patient_user_id = ? WHERE patient_user_id = ?',
    [toUserId, fromUserId],
  );

  await transferOauthConnections(conn, fromUserId, toUserId);
  await transferSingletonTable(conn, 'user_settings', 'id_users', fromUserId, toUserId);
  await transferSingletonTable(conn, 'provider_profiles', 'user_id', fromUserId, toUserId);

  const [existingUsers] = await conn.query('SELECT nostr_pubkey FROM users WHERE id = ?', [fromUserId]);
  if (existingUsers.length === 0) {
    return;
  }

  await conn.query('UPDATE users SET nostr_pubkey = NULL WHERE id = ?', [fromUserId]);
  await conn.query('DELETE FROM users WHERE id = ?', [fromUserId]);
}

export async function repairLinkedAccountArtifacts(
  conn,
  {
    currentUserId,
    googleId = null,
    email = null,
    desiredPubkey = null,
  },
) {
  const legacyUserIds = await findLegacyLinkedUserIds(conn, {
    currentUserId,
    pubkey: desiredPubkey,
    googleId,
    email,
  });

  let resolvedPubkey = desiredPubkey;

  for (const legacyUserId of legacyUserIds) {
    if (!resolvedPubkey) {
      const [legacyUsers] = await conn.query(
        'SELECT nostr_pubkey FROM users WHERE id = ?',
        [legacyUserId],
      );
      resolvedPubkey = legacyUsers[0]?.nostr_pubkey || resolvedPubkey;
    }

    await transferArtifactsFromLegacyUser(conn, legacyUserId, currentUserId);
  }

  if (!resolvedPubkey) {
    const [currentUsers] = await conn.query(
      'SELECT nostr_pubkey FROM users WHERE id = ?',
      [currentUserId],
    );
    resolvedPubkey = currentUsers[0]?.nostr_pubkey || null;
  }

  if (resolvedPubkey) {
    await conn.query(
      'UPDATE users SET nostr_pubkey = ? WHERE id = ?',
      [resolvedPubkey, currentUserId],
    );
  }

  return {
    currentPubkey: resolvedPubkey,
    transferredUserIds: legacyUserIds,
  };
}

import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import 'dotenv/config';
import {
  ensureCoreDatabaseReady,
} from '../../packages/core-db/bootstrap.mjs';
import { resolveCoreDatabaseConfig } from '../../packages/core-db/config.mjs';
import { createPostgresCompatPool } from '../../packages/core-db/postgresCompat.mjs';

import reposRouter from './routes/repos.js';
import scanRouter from './routes/scan.js';
import { NostrAuthService } from './services/NostrAuthService.js';
import { AppleAuthService } from './services/AppleAuthService.js';
import { GoogleAuthService } from './services/GoogleAuthService.js';
import {
  backfillUserNameFromOAuth,
  backfillUserNameFromGoogle,
  resolveOAuthNameParts,
  resolveGoogleNameParts,
} from './services/googleProfileBackfill.js';
import { repairLinkedAccountArtifacts } from './services/accountLinking.js';

const db = createPostgresCompatPool(resolveCoreDatabaseConfig());
const coreDatabaseSummary = await ensureCoreDatabaseReady(db);

const app = express();
const PORT = process.env.PORT || 3010;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

app.set('db', db);
app.use(cors());
app.use(express.json());

const nostrAuth = new NostrAuthService();
const appleAuth = new AppleAuthService();
const googleAuth = new GoogleAuthService();

function oauthTokenExpiry() {
  return Math.floor(Date.now() / 1000) + (60 * 60 * 24 * 7);
}

function buildOAuthJwtPayload({
  userId,
  pubkey = null,
  provider,
  providerUserId,
  email = null,
  role,
}) {
  return {
    userId,
    pubkey,
    oauthProvider: provider,
    oauthProviderUserId: providerUserId,
    email,
    role,
    authMethod: provider,
    ...(provider === 'google' ? { googleId: providerUserId } : {}),
    ...(provider === 'apple' ? { appleUserId: providerUserId } : {}),
    iat: Math.floor(Date.now() / 1000),
    exp: oauthTokenExpiry(),
  };
}

function buildOAuthUserResponse(profile, provider, picture = null) {
  return {
    provider,
    providerUserId: profile.providerUserId,
    email: profile.email || null,
    name: profile.name || null,
    firstName: profile.firstName || null,
    lastName: profile.lastName || null,
    picture: picture || null,
    ...(provider === 'google' ? { googleId: profile.providerUserId } : {}),
    ...(provider === 'apple' ? { appleUserId: profile.providerUserId } : {}),
  };
}

async function completeOAuthMobileLogin({
  provider,
  profile,
  accessToken = null,
  userType = 'patient',
  picture = null,
}) {
  const { firstName, lastName } = resolveOAuthNameParts(profile);

  const [connections] = await db.query(
    `SELECT oc.id AS oauth_connection_id,
            oc.user_id,
            u.id AS resolved_user_id,
            u.id_roles,
            u.nostr_pubkey
       FROM oauth_connections oc
       LEFT JOIN users u ON u.id = oc.user_id
      WHERE oc.provider = ? AND oc.provider_user_id = ?
      ORDER BY CASE WHEN u.id IS NULL THEN 1 ELSE 0 END, oc.id`,
    [provider, profile.providerUserId]
  );

  let userId;
  let userRole;
  let nostrPubkey = null;

  const roleId = userType === 'patient' ? 3 : 2;
  const liveConnection = connections.find((connection) => connection.resolved_user_id);

  if (liveConnection) {
    userId = liveConnection.user_id;
    userRole = liveConnection.id_roles;
    nostrPubkey = liveConnection.nostr_pubkey || null;

    await db.query(
      `UPDATE oauth_connections
          SET access_token = COALESCE(?, access_token),
              provider_email = COALESCE(NULLIF(?, ''), provider_email),
              updated_at = NOW()
        WHERE provider = ? AND provider_user_id = ?`,
      [accessToken, profile.email, provider, profile.providerUserId]
    );

    await backfillUserNameFromOAuth(db, userId, profile);
  } else if (connections.length > 0) {
    const [insertResult] = await db.query(
      `INSERT INTO users (email, first_name, last_name, id_roles, create_datetime)
       VALUES (?, ?, ?, ?, NOW())
       RETURNING id`,
      [profile.email, firstName, lastName, roleId]
    );
    userId = insertResult.insertId;
    userRole = roleId;

    await db.query(
      `UPDATE oauth_connections
          SET user_id = ?,
              provider_email = COALESCE(NULLIF(?, ''), provider_email),
              access_token = COALESCE(?, access_token),
              updated_at = NOW()
        WHERE provider = ? AND provider_user_id = ?`,
      [userId, profile.email, accessToken, provider, profile.providerUserId]
    );
  } else {
    const [insertResult] = await db.query(
      `INSERT INTO users (email, first_name, last_name, id_roles, create_datetime)
       VALUES (?, ?, ?, ?, NOW())
       RETURNING id`,
      [profile.email, firstName, lastName, roleId]
    );
    userId = insertResult.insertId;
    userRole = roleId;

    await db.query(
      `INSERT INTO oauth_connections (user_id, provider, provider_user_id, provider_email, access_token)
       VALUES (?, ?, ?, ?, ?)`,
      [userId, provider, profile.providerUserId, profile.email, accessToken]
    );
  }

  const repairConn = await db.getConnection();
  try {
    await repairConn.beginTransaction();
    const repairResult = await repairLinkedAccountArtifacts(repairConn, {
      currentUserId: userId,
      oauthProvider: provider,
      oauthProviderUserId: profile.providerUserId,
      email: profile.email,
      desiredPubkey: nostrPubkey,
    });
    nostrPubkey = repairResult.currentPubkey;
    await repairConn.commit();
  } catch (repairError) {
    await repairConn.rollback();
    throw repairError;
  } finally {
    repairConn.release();
  }

  const token = jwt.sign(
    buildOAuthJwtPayload({
      userId,
      pubkey: nostrPubkey,
      provider,
      providerUserId: profile.providerUserId,
      email: profile.email,
      role: userRole,
    }),
    JWT_SECRET
  );

  return {
    token,
    user: buildOAuthUserResponse(profile, provider, picture),
    nostrPubkey,
    userId,
  };
}

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'auth-api' });
});

// ========== NOSTR AUTH ==========

app.post('/api/auth/nostr/challenge', (req, res) => {
  console.log('POST /api/auth/nostr/challenge hit');
  const { challenge } = nostrAuth.generateChallenge();
  res.json({ challenge, tag: 'login' });
});

app.post('/api/auth/nostr/verify', async (req, res) => {
  const { signedEvent, userType = 'provider' } = req.body; // ADD userType extraction
  
  try {
    const result = await nostrAuth.verifySignedEvent(signedEvent);
    
    if (!result.valid) {
      return res.status(400).json({ status: 'error', reason: result.error });
    }

    // Step 2: Look up user by nostr_pubkey
    const [users] = await db.query(
      'SELECT id, id_roles FROM users WHERE nostr_pubkey = ?',
      [result.pubkey]
    );
    
    let userId;
    let userRole;
    
    if (users.length === 0) {
      // Step 3: New user - create with role based on userType
      const roleId = userType === 'patient' ? 3 : 2; // Verify these IDs match your roles table
      
      const [insertResult] = await db.query(
        'INSERT INTO users (nostr_pubkey, id_roles) VALUES (?, ?) RETURNING id',
        [result.pubkey, roleId]
      );
      
      userId = insertResult.insertId;
      userRole = roleId;
    } else {
      // Step 4: Existing user - verify role matches login type
      const user = users[0];
      const expectedRole = userType === 'patient' ? 3 : 2;

      if (user.id_roles !== expectedRole) {
        return res.status(400).json({
          status: 'error',
          reason: `This account is registered as a ${user.id_roles === 2 ? 'provider' : 'patient'}. Please use the correct login page.`
        });
      }

      userId = user.id;
      userRole = user.id_roles;
    }
    
    // MODIFY JWT to include userId and role
    const token = jwt.sign({
      userId,
      pubkey: result.pubkey,
      role: userRole,
      authMethod: 'nostr',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + (60 * 60 * 24 * 7) // make token expire in 7 days
    }, JWT_SECRET);
    
    console.log('Nostr login verified for pubkey:', result.pubkey, 'as', userType);
    
    res.json({
      status: 'OK',
      pubkey: result.pubkey,
      metadata: result.metadata,
      token
    });
    
  } catch (error) {
    console.error('Nostr verification error:', error);
    res.status(500).json({ status: 'error', reason: 'Verification failed' });
  }
});

// ========== GOOGLE AUTH ==========
app.get('/api/auth/google/url', (req, res) => {
  const { redirectUri } = req.query;
  const authUrl = googleAuth.generateAuthUrl('login', redirectUri);
  res.json({ url: authUrl });
});

app.post('/api/auth/google/callback', async (req, res) => {
  const { code, redirectUri } = req.body;

  try {
    const tokens = await googleAuth.getTokensFromCode(code, redirectUri);
    const userInfo = await googleAuth.getUserInfo(tokens.accessToken);
    const { firstName, lastName } = resolveGoogleNameParts(userInfo);

    // Look up existing oauth_connection for this Google account
    const [connections] = await db.query(
      `SELECT oc.id AS oauth_connection_id,
              oc.user_id,
              u.id AS resolved_user_id,
              u.id_roles
       FROM oauth_connections oc
       LEFT JOIN users u ON u.id = oc.user_id
       WHERE oc.provider = 'google' AND oc.provider_user_id = ?
       ORDER BY CASE WHEN u.id IS NULL THEN 1 ELSE 0 END, oc.id`,
      [userInfo.googleId]
    );

    let userId;
    let userRole;

    const liveConnection = connections.find((connection) => connection.resolved_user_id);

    if (liveConnection) {
      userId = liveConnection.user_id;
      userRole = liveConnection.id_roles;

      // Update access token
      await db.query(
        `UPDATE oauth_connections SET access_token = ?, updated_at = NOW()
         WHERE provider = 'google' AND provider_user_id = ?`,
        [tokens.accessToken, userInfo.googleId]
      );

      await backfillUserNameFromGoogle(db, userId, userInfo);
    } else if (connections.length > 0) {
      const roleId = 2; // default to provider
      const [insertResult] = await db.query(
        `INSERT INTO users (email, first_name, last_name, id_roles, create_datetime)
         VALUES (?, ?, ?, ?, NOW())
         RETURNING id`,
        [userInfo.email, firstName, lastName, roleId]
      );
      userId = insertResult.insertId;
      userRole = roleId;

      await db.query(
        `UPDATE oauth_connections
            SET user_id = ?, provider_email = ?, access_token = ?, updated_at = NOW()
          WHERE provider = 'google' AND provider_user_id = ?`,
        [userId, userInfo.email, tokens.accessToken, userInfo.googleId]
      );
    } else {
      // New Google user — create user + oauth_connection
      const roleId = 2; // default to provider
      const [insertResult] = await db.query(
        `INSERT INTO users (email, first_name, last_name, id_roles, create_datetime)
         VALUES (?, ?, ?, ?, NOW())
         RETURNING id`,
        [userInfo.email, firstName, lastName, roleId]
      );
      userId = insertResult.insertId;
      userRole = roleId;

      await db.query(
        `INSERT INTO oauth_connections (user_id, provider, provider_user_id, provider_email, access_token)
         VALUES (?, 'google', ?, ?, ?)`,
        [userId, userInfo.googleId, userInfo.email, tokens.accessToken]
      );
    }

    const repairConn = await db.getConnection();
    try {
      await repairConn.beginTransaction();
      await repairLinkedAccountArtifacts(repairConn, {
        currentUserId: userId,
        oauthProvider: 'google',
        oauthProviderUserId: userInfo.googleId,
        email: userInfo.email,
      });
      await repairConn.commit();
    } catch (repairError) {
      await repairConn.rollback();
      throw repairError;
    } finally {
      repairConn.release();
    }

    const token = jwt.sign(
      buildOAuthJwtPayload({
        userId,
        provider: 'google',
        providerUserId: userInfo.googleId,
        email: userInfo.email,
        role: userRole,
      }),
      JWT_SECRET
    );

    console.log('Google login verified for:', userInfo.email);

    res.json({
      status: 'OK',
      token,
      user: userInfo,
      googleTokens: tokens // In case they need refresh token for calendar
    });

  } catch (error) {
    console.error('Google auth error:', error);
    res.status(500).json({ status: 'error', reason: error.message });
  }
});

// ========== GOOGLE AUTH (MOBILE TOKEN EXCHANGE) ==========
// Mobile app sends Google access token obtained via expo-auth-session.
// We verify it with Google, then issue a Limbo JWT.

app.post('/api/auth/google/token', async (req, res) => {
  const { accessToken, userType = 'patient' } = req.body;

  if (!accessToken) {
    return res.status(400).json({ status: 'error', reason: 'Missing accessToken' });
  }

  try {
    const userInfo = await googleAuth.getUserInfo(accessToken);
    const loginResult = await completeOAuthMobileLogin({
      provider: 'google',
      userType,
      accessToken,
      picture: userInfo.picture,
      profile: {
        providerUserId: userInfo.googleId,
        email: userInfo.email,
        name: userInfo.name,
        givenName: userInfo.givenName,
        familyName: userInfo.familyName,
      },
    });

    console.log('Google mobile login verified for:', userInfo.email);

    res.json({
      status: 'OK',
      token: loginResult.token,
      user: loginResult.user,
      nostrPubkey: loginResult.nostrPubkey,
    });
  } catch (error) {
    console.error('Google token auth error:', error);
    res.status(500).json({ status: 'error', reason: error.message });
  }
});

// ========== APPLE AUTH (MOBILE TOKEN EXCHANGE) ==========
// Mobile app sends an Apple identity token obtained via expo-apple-authentication.
// We verify it against Apple's JWKS, then issue a Limbo JWT.

app.post('/api/auth/apple/token', async (req, res) => {
  const {
    identityToken,
    user = null,
    email = null,
    firstName = null,
    lastName = null,
    name = null,
    userType = 'patient',
  } = req.body;

  if (!identityToken) {
    return res.status(400).json({ status: 'error', reason: 'Missing identityToken' });
  }

  try {
    const userInfo = await appleAuth.verifyIdentityToken(identityToken, {
      user,
      email,
      firstName,
      lastName,
      name,
    });
    const loginResult = await completeOAuthMobileLogin({
      provider: 'apple',
      userType,
      profile: userInfo,
    });

    console.log('Apple mobile login verified for:', userInfo.appleUserId);

    res.json({
      status: 'OK',
      token: loginResult.token,
      user: loginResult.user,
      nostrPubkey: loginResult.nostrPubkey,
    });
  } catch (error) {
    console.error('Apple token auth error:', error);
    res.status(500).json({ status: 'error', reason: error.message });
  }
});

// ========== LINK NOSTR KEY TO OAUTH ACCOUNT ==========
// OAuth-authenticated user proves ownership of a Nostr key.
// If an old Nostr-only user exists with that pubkey, merge accounts.

app.post('/api/auth/link-nostr', async (req, res) => {
  // --- Inline JWT auth (same pattern as routes/scan.js) ---
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ status: 'error', reason: 'Missing or invalid Authorization header' });
  }

  let decoded;
  try {
    decoded = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ status: 'error', reason: 'Invalid or expired token' });
  }

  const oauthProvider =
    decoded.oauthProvider ||
    (decoded.authMethod === 'google' || decoded.authMethod === 'apple' ? decoded.authMethod : null);
  const oauthProviderUserId = decoded.oauthProviderUserId || decoded.googleId || decoded.appleUserId || null;

  if (!oauthProvider || decoded.authMethod === 'nostr') {
    return res.status(400).json({ status: 'error', reason: 'Only OAuth-authenticated users can link a Nostr key' });
  }
  if (!oauthProviderUserId) {
    return res.status(400).json({ status: 'error', reason: 'Token missing oauthProviderUserId' });
  }

  const oauthUserId = decoded.userId;
  const { signedEvent } = req.body;

  if (!signedEvent) {
    return res.status(400).json({ status: 'error', reason: 'Missing signedEvent' });
  }

  // --- Verify Nostr signature to prove key ownership ---
  try {
    const result = await nostrAuth.verifySignedEvent(signedEvent);
    if (!result.valid) {
      return res.status(400).json({ status: 'error', reason: result.error });
    }

    const pubkey = result.pubkey;

    // --- Single transaction for the merge ---
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      // Check if the OAuth user already has a nostr_pubkey
      const [currentUser] = await conn.query(
        'SELECT nostr_pubkey FROM users WHERE id = ?',
        [oauthUserId]
      );

      if (currentUser.length === 0) {
        await conn.rollback();
        return res.status(404).json({ status: 'error', reason: 'User not found' });
      }

      const existingPubkey = currentUser[0].nostr_pubkey;
      if (existingPubkey && existingPubkey !== pubkey) {
        // User is switching from a placeholder/old key to the proven key.
        await conn.query(
          'UPDATE users SET nostr_pubkey = NULL WHERE id = ?',
          [oauthUserId]
        );
      }

      const repairResult = await repairLinkedAccountArtifacts(conn, {
        currentUserId: oauthUserId,
        oauthProvider,
        oauthProviderUserId,
        email: decoded.email,
        desiredPubkey: pubkey,
      });

      const merged = repairResult.transferredUserIds.length > 0;

      await conn.commit();

      // Issue fresh JWT with pubkey claim
      const token = jwt.sign(
        buildOAuthJwtPayload({
          userId: oauthUserId,
          pubkey,
          provider: oauthProvider,
          providerUserId: oauthProviderUserId,
          email: decoded.email,
          role: decoded.role,
        }),
        JWT_SECRET
      );

      console.log(`Nostr key linked for ${oauthProvider} user ${oauthUserId}, pubkey: ${pubkey}, merged: ${merged}`);

      res.json({
        status: 'OK',
        token,
        pubkey,
        merged,
        message: merged ? undefined : 'Already linked',
      });

    } catch (txErr) {
      await conn.rollback();
      throw txErr;
    } finally {
      conn.release();
    }

  } catch (error) {
    console.error('Link Nostr error:', error);
    res.status(500).json({ status: 'error', reason: 'Failed to link Nostr key' });
  }
});

// ========== GET PROFILE ==========
// Returns user profile + OAuth connections for the authenticated user.
// Called by mobile app after login to populate Account screen.

app.get('/api/auth/me', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ status: 'error', reason: 'Missing or invalid Authorization header' });
  }

  let decoded;
  try {
    decoded = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ status: 'error', reason: 'Invalid or expired token' });
  }

  const userId = decoded.userId;
  if (!userId) {
    return res.status(400).json({ status: 'error', reason: 'Token does not contain userId' });
  }

  try {
    const [users] = await db.query(
      'SELECT id, first_name, last_name, email, nostr_pubkey, id_roles FROM users WHERE id = ?',
      [userId]
    );

    if (users.length === 0) {
      return res.status(404).json({ status: 'error', reason: 'User not found' });
    }

    const user = users[0];

    const [connections] = await db.query(
      'SELECT provider, provider_email, provider_user_id FROM oauth_connections WHERE user_id = ?',
      [userId]
    );

    res.json({
      status: 'OK',
      user: {
        id: user.id,
        firstName: user.first_name || null,
        lastName: user.last_name || null,
        email: user.email || null,
        nostrPubkey: user.nostr_pubkey || null,
        role: user.id_roles,
      },
      connections: connections.map(c => ({
        provider: c.provider,
        email: c.provider_email || null,
        providerId: c.provider_user_id,
      })),
    });
  } catch (error) {
    console.error('GET /api/auth/me error:', error);
    res.status(500).json({ status: 'error', reason: 'Failed to fetch profile' });
  }
});

// ========== DELETE ACCOUNT ==========
// Permanently removes user and all associated data. CASCADE handles child records.

app.delete('/api/auth/account', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ status: 'error', reason: 'Missing or invalid Authorization header' });
  }

  let decoded;
  try {
    decoded = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ status: 'error', reason: 'Invalid or expired token' });
  }

  const userId = decoded.userId;
  if (!userId) {
    return res.status(400).json({ status: 'error', reason: 'Token does not contain userId' });
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // Fetch repo IDs for the response (before cascade deletes them)
    const [repos] = await conn.query(
      'SELECT id FROM repositories WHERE owner_user_id = ?',
      [userId]
    );
    const repoIds = repos.map(r => r.id);

    // Count oauth connections for the response
    const [oauthRows] = await conn.query(
      'SELECT COUNT(*) AS cnt FROM oauth_connections WHERE user_id = ?',
      [userId]
    );
    const oauthCount = oauthRows[0].cnt;

    // Delete user — CASCADE handles oauth_connections, repositories,
    // repository_access, scan_sessions, user_settings, provider_profiles
    const [result] = await conn.query(
      'DELETE FROM users WHERE id = ?',
      [userId]
    );

    if (result.affectedRows === 0) {
      await conn.rollback();
      return res.status(404).json({ status: 'error', reason: 'User not found' });
    }

    await conn.commit();

    console.log(`Account deleted: userId=${userId}, repos=${repoIds.join(',')}, oauthConns=${oauthCount}`);

    // Filesystem cleanup of bare repos on mgit-api is deferred (v1).
    // Orphaned repo directories will be cleaned up by a future periodic job.

    res.json({
      status: 'OK',
      deleted: {
        userId,
        repositories: repoIds,
        oauthConnections: oauthCount,
      },
    });
  } catch (err) {
    await conn.rollback();
    console.error('Delete account error:', err);
    res.status(500).json({ status: 'error', reason: 'Failed to delete account' });
  } finally {
    conn.release();
  }
});

// ========== INTERNAL: JWT VALIDATION ==========
// Called by other services (scheduler-api, mgit-api) to validate tokens

app.post('/internal/validate', (req, res) => {
  const { token } = req.body;
  
  if (!token) {
    return res.status(400).json({ valid: false, error: 'No token provided' });
  }
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    
    res.json({
      valid: true,
      user: {
        authMethod: decoded.authMethod || (decoded.pubkey ? 'nostr' : 'oauth'),
        pubkey: decoded.pubkey || null,
        userId: decoded.userId || null,
        email: decoded.email || null,
        exp: decoded.exp
      }
    });
    
  } catch (error) {
    res.status(401).json({ valid: false, error: error.message });
  }
});

app.use(reposRouter);
app.use(scanRouter);

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🔐 Auth API running on port ${PORT}`);
  console.log(`✅ Nostr auth: enabled`);
  console.log(`✅ Google auth: ${googleAuth.clientId ? 'enabled' : 'not configured'}`);
  console.log('✅ Core database ready:', coreDatabaseSummary);
});

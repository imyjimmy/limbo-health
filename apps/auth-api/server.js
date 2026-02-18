import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import 'dotenv/config';
import mysql from 'mysql2/promise';

import reposRouter from './routes/repos.js';
import scanRouter from './routes/scan.js';
import { NostrAuthService } from './services/NostrAuthService.js';
import { GoogleAuthService } from './services/GoogleAuthService.js';

const db = mysql.createPool({
  host: process.env.DB_HOST || 'mysql',
  user: process.env.DB_USER || 'user',
  password: process.env.DB_PASSWORD || 'password',
  database: process.env.DB_NAME || process.env.MYSQL_DATABASE ||'limbo_health',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

const app = express();
const PORT = process.env.PORT || 3010;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

app.set('db', db);
app.use(cors());
app.use(express.json());

const nostrAuth = new NostrAuthService();
const googleAuth = new GoogleAuthService();

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
        'INSERT INTO users (nostr_pubkey, id_roles) VALUES (?, ?)',
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

    // Look up existing oauth_connection for this Google account
    const [connections] = await db.query(
      `SELECT oc.user_id, u.id_roles
       FROM oauth_connections oc
       JOIN users u ON u.id = oc.user_id
       WHERE oc.provider = 'google' AND oc.provider_user_id = ?`,
      [userInfo.googleId]
    );

    let userId;
    let userRole;

    if (connections.length === 0) {
      // New Google user — create user + oauth_connection
      const roleId = 2; // default to provider
      const [insertResult] = await db.query(
        'INSERT INTO users (email, id_roles, create_datetime) VALUES (?, ?, NOW())',
        [userInfo.email, roleId]
      );
      userId = insertResult.insertId;
      userRole = roleId;

      await db.query(
        `INSERT INTO oauth_connections (user_id, provider, provider_user_id, provider_email, access_token)
         VALUES (?, 'google', ?, ?, ?)`,
        [userId, userInfo.googleId, userInfo.email, tokens.accessToken]
      );
    } else {
      userId = connections[0].user_id;
      userRole = connections[0].id_roles;

      // Update access token
      await db.query(
        `UPDATE oauth_connections SET access_token = ?, updated_at = NOW()
         WHERE provider = 'google' AND provider_user_id = ?`,
        [tokens.accessToken, userInfo.googleId]
      );
    }

    // Generate JWT with DB userId (integer), not googleId
    const token = jwt.sign({
      userId,
      oauthProvider: 'google',
      googleId: userInfo.googleId,
      email: userInfo.email,
      role: userRole,
      authMethod: 'google',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + (60 * 60 * 24 * 7) // 7 days
    }, JWT_SECRET);

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
  const { accessToken } = req.body;

  if (!accessToken) {
    return res.status(400).json({ status: 'error', reason: 'Missing accessToken' });
  }

  try {
    const userInfo = await googleAuth.getUserInfo(accessToken);

    // Look up existing oauth_connection for this Google account
    const [connections] = await db.query(
      `SELECT oc.user_id, u.id_roles, u.nostr_pubkey
       FROM oauth_connections oc
       JOIN users u ON u.id = oc.user_id
       WHERE oc.provider = 'google' AND oc.provider_user_id = ?`,
      [userInfo.googleId]
    );

    let userId;
    let userRole;
    let nostrPubkey = null;

    if (connections.length === 0) {
      // New Google user — create user + oauth_connection
      const roleId = 2; // default to provider
      const [insertResult] = await db.query(
        'INSERT INTO users (email, id_roles, create_datetime) VALUES (?, ?, NOW())',
        [userInfo.email, roleId]
      );
      userId = insertResult.insertId;
      userRole = roleId;

      await db.query(
        `INSERT INTO oauth_connections (user_id, provider, provider_user_id, provider_email, access_token)
         VALUES (?, 'google', ?, ?, ?)`,
        [userId, userInfo.googleId, userInfo.email, accessToken]
      );
    } else {
      userId = connections[0].user_id;
      userRole = connections[0].id_roles;
      nostrPubkey = connections[0].nostr_pubkey || null;

      // Update access token
      await db.query(
        `UPDATE oauth_connections SET access_token = ?, updated_at = NOW()
         WHERE provider = 'google' AND provider_user_id = ?`,
        [accessToken, userInfo.googleId]
      );
    }

    const token = jwt.sign({
      userId,
      pubkey: nostrPubkey,
      oauthProvider: 'google',
      googleId: userInfo.googleId,
      email: userInfo.email,
      role: userRole,
      authMethod: 'google',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + (60 * 60 * 24 * 7) // 7 days
    }, JWT_SECRET);

    console.log('Google mobile login verified for:', userInfo.email);

    res.json({
      status: 'OK',
      token,
      user: userInfo,
      nostrPubkey
    });
  } catch (error) {
    console.error('Google token auth error:', error);
    res.status(500).json({ status: 'error', reason: error.message });
  }
});

// ========== LINK NOSTR KEY TO GOOGLE ACCOUNT ==========
// Google-authenticated user proves ownership of a Nostr key.
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

  if (decoded.authMethod !== 'google') {
    return res.status(400).json({ status: 'error', reason: 'Only Google-authenticated users can link a Nostr key' });
  }

  const googleUserId = decoded.userId;
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

      // Check if Google user already has a nostr_pubkey
      const [currentUser] = await conn.query(
        'SELECT nostr_pubkey FROM users WHERE id = ?',
        [googleUserId]
      );

      if (currentUser.length === 0) {
        await conn.rollback();
        return res.status(404).json({ status: 'error', reason: 'User not found' });
      }

      const existingPubkey = currentUser[0].nostr_pubkey;
      if (existingPubkey === pubkey) {
        // Idempotent — already linked to this exact key
        await conn.rollback();
        return res.json({ status: 'OK', pubkey, merged: false, message: 'Already linked' });
      }
      // If user had a different key (e.g. auto-generated), clear it so the new one can be set
      if (existingPubkey) {
        await conn.query(
          'UPDATE users SET nostr_pubkey = NULL WHERE id = ?',
          [googleUserId]
        );
      }

      // Find old Nostr-only user by pubkey
      const [oldUsers] = await conn.query(
        'SELECT id FROM users WHERE nostr_pubkey = ?',
        [pubkey]
      );

      let merged = false;

      if (oldUsers.length > 0) {
        const oldUserId = oldUsers[0].id;
        merged = true;

        // Transfer repositories ownership
        await conn.query(
          'UPDATE repositories SET owner_user_id = ? WHERE owner_user_id = ?',
          [googleUserId, oldUserId]
        );

        // Transfer repository_access (handle unique constraint conflicts)
        await conn.query(
          `INSERT INTO repository_access (user_id, repo_id, access_level)
           SELECT ?, repo_id, access_level
           FROM repository_access WHERE user_id = ?
           ON DUPLICATE KEY UPDATE access_level = VALUES(access_level)`,
          [googleUserId, oldUserId]
        );
        await conn.query(
          'DELETE FROM repository_access WHERE user_id = ?',
          [oldUserId]
        );

        // Transfer scan sessions
        await conn.query(
          'UPDATE scan_sessions SET patient_user_id = ? WHERE patient_user_id = ?',
          [googleUserId, oldUserId]
        );

        // Transfer oauth connections (unlikely but safe)
        await conn.query(
          'UPDATE oauth_connections SET user_id = ? WHERE user_id = ?',
          [googleUserId, oldUserId]
        );

        // Clear pubkey on old user (free UNIQUE constraint) then delete
        await conn.query(
          'UPDATE users SET nostr_pubkey = NULL WHERE id = ?',
          [oldUserId]
        );
        await conn.query(
          'DELETE FROM users WHERE id = ?',
          [oldUserId]
        );
      }

      // Set nostr_pubkey on the Google user
      await conn.query(
        'UPDATE users SET nostr_pubkey = ? WHERE id = ?',
        [pubkey, googleUserId]
      );

      await conn.commit();

      // Issue fresh JWT with pubkey claim
      const token = jwt.sign({
        userId: googleUserId,
        pubkey,
        oauthProvider: 'google',
        googleId: decoded.googleId,
        email: decoded.email,
        role: decoded.role,
        authMethod: 'google',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + (60 * 60 * 24 * 7)
      }, JWT_SECRET);

      console.log(`Nostr key linked for Google user ${googleUserId}, pubkey: ${pubkey}, merged: ${merged}`);

      res.json({ status: 'OK', token, pubkey, merged });

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
});
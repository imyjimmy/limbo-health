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
    
    // Generate JWT
    const token = jwt.sign({
      oauthProvider: 'google',
      userId: userInfo.googleId,
      email: userInfo.email,
      authMethod: 'oauth',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + (60 * 60 * 24) // 24h
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
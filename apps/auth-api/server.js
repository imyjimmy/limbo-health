import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import 'dotenv/config';

import { NostrAuthService } from './services/NostrAuthService.js';
import { GoogleAuthService } from './services/GoogleAuthService.js';

const app = express();
const PORT = process.env.PORT || 3010;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

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
  const { signedEvent } = req.body;
  
  try {
    const result = await nostrAuth.verifySignedEvent(signedEvent);
    
    if (!result.valid) {
      return res.status(400).json({ status: 'error', reason: result.error });
    }
    
    // Generate JWT
    const token = jwt.sign({
      pubkey: result.pubkey,
      authMethod: 'nostr',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + (60 * 60 * 24) // 24h
    }, JWT_SECRET);
    
    console.log('Nostr login verified for pubkey:', result.pubkey);
    
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

app.listen(PORT, () => {
  console.log(`🔐 Auth API running on port ${PORT}`);
  console.log(`✅ Nostr auth: enabled`);
  console.log(`✅ Google auth: ${googleAuth.clientId ? 'enabled' : 'not configured'}`);
});
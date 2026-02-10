import { google } from 'googleapis';
import { GoogleAuthService } from '../services/GoogleAuthService.js';
import { authenticateSession } from '../middleware/auth.js';
import mysql from 'mysql2/promise';
import jwt from 'jsonwebtoken';

const googleAuthService = new GoogleAuthService();

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// Database connection pool
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'user',
  password: process.env.DB_PASSWORD || 'password',
  database: process.env.DB_NAME || 'limbo_health',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

/**
 * Helper function to get userId from authenticated session
 */
async function getUserIdFromAuth(auth, connection) {
  if (auth.user.authMethod === 'nostr') {
    const [rows] = await connection.execute(
      'SELECT id FROM users WHERE nostr_pubkey = ?',
      [auth.user.metadata.pubkey]
    );
    return rows.length > 0 ? rows[0].id : null;
  } else if (auth.user.authMethod === 'oauth') {
    return auth.user.metadata.userId;
  }
  return null;
}

export function setupGoogleRoutes(app) {
  
  // ============================================================================
  // PUBLIC ROUTES - Google Sign-In for Authentication (No Auth Required)
  // ============================================================================
  
  /**
   * Initiate Google Sign-In for provider login (no auth required)
   * GET /api/google/login/start
   */
  app.get('/api/google/login/start', async (req, res) => {
    try {
      console.log('🔍 GOOGLE_REDIRECT_URI env var:', process.env.GOOGLE_REDIRECT_URI);
      // Use a special state to indicate this is a login flow
      const userType = req.query.userType || 'patient';

      const state = Buffer.from(JSON.stringify({ 
        flow: 'login',
        role: userType,
        timestamp: Date.now() 
      })).toString('base64url');
      
      // Generate OAuth URL for login flow
      const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3003/api/google/login/callback'
      );

      const authUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: [
          'https://www.googleapis.com/auth/userinfo.email',
          'https://www.googleapis.com/auth/userinfo.profile',
          // 'https://www.googleapis.com/auth/calendar',
          // 'https://www.googleapis.com/auth/calendar.events'
        ],
        prompt: 'consent',
        state: state
      });
      
      return res.json({
        success: true,
        authUrl: authUrl
      });
    } catch (error) {
      console.error('Error generating login URL:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to generate authorization URL'
      });
    }
  });
  
  /**
   * Generate Google OAuth URL for calendar connection (authenticated users)
   * GET /api/google/auth/url
   */
  app.get('/api/google/auth/url', async (req, res) => {
    const auth = authenticateSession(req);
    if (!auth.success) {
      return res.status(401).json({ success: false, error: auth.error });
    }

    const connection = await pool.getConnection();
    
    try {
      const userId = await getUserIdFromAuth(auth, connection);
      if (!userId) {
        return res.status(404).json({ success: false, error: 'User not found' });
      }
      
      const customRedirectUri = req.query?.redirect_uri || null;
      const authUrl = googleAuthService.generateAuthUrl(userId, customRedirectUri);
      
      return res.json({
        success: true,
        authUrl: authUrl
      });
    } catch (error) {
      console.error('Error generating auth URL:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to generate authorization URL'
      });
    } finally {
      connection.release();
    }
  });

  /**
   * Handle Google OAuth callback for login (patient or provider)
   * GET /api/google/login/callback
   * Role is determined by the `state` parameter passed through the OAuth flow
   */
  app.get('/api/google/login/callback', async (req, res) => {
    const frontendUrl = process.env.GOOGLE_REDIRECT_URI_ADMIN || 'http://localhost:3003';

    try {
      const code = req.query.code;
      const state = req.query.state;
      const error = req.query.error;

      if (error) {
        return new Response(null, {
          status: 302,
          headers: { 'Location': `${frontendUrl}/login?error=${encodeURIComponent(error)}` }
        });
      }

      if (!code || !state) {
        return new Response(null, {
          status: 302,
          headers: { 'Location': `${frontendUrl}/login?error=missing_code` }
        });
      }

      // Decode role from state
      let stateData;
      try {
        stateData = JSON.parse(Buffer.from(state, 'base64url').toString());
      } catch {
        // Fallback: treat state as a plain string role
        stateData = { role: state };
      }

      const requestedRole = stateData.role || 'patient';
      const allowedRoles = ['patient', 'provider', 'admin-provider'];
      if (!allowedRoles.includes(requestedRole)) {
        return new Response(null, {
          status: 302,
          headers: { 'Location': `${frontendUrl}/login?error=invalid_role` }
        });
      }

      // Exchange code for tokens
      const tokens = await googleAuthService.getTokensFromCode(code);
      const userInfo = await googleAuthService.getUserInfo(tokens.accessToken);

      console.log('🔍 tokens keys:', Object.keys(tokens));
      console.log('🔍 userInfo keys:', Object.keys(userInfo));
      
      const connection = await pool.getConnection();

      try {
        // Look up user by email — check across all roles
        let [users] = await connection.execute(
          `SELECT u.id, u.first_name, u.last_name, u.email, r.slug as role 
           FROM users u 
           JOIN roles r ON u.id_roles = r.id 
           WHERE u.email = ?`,
          [userInfo.email]
        );

        let userId;
        let isNewUser = false;
        let userRole;

        if (users.length === 0) {
          // Create new user with the requested role
          const [roleResult] = await connection.execute(
            `SELECT id FROM roles WHERE slug = ?`,
            [requestedRole]
          );

          if (roleResult.length === 0) {
            throw new Error(`Role '${requestedRole}' not found`);
          }

          const nameParts = userInfo.name ? userInfo.name.split(' ') : ['', ''];
          const firstName = nameParts[0] || '';
          const lastName = nameParts.slice(1).join(' ') || '';

          const [insertResult] = await connection.execute(
            `INSERT INTO users (id_roles, first_name, last_name, email, create_datetime, update_datetime)
             VALUES (?, ?, ?, ?, NOW(), NOW())`,
            [roleResult[0].id, firstName, lastName, userInfo.email]
          );

          userId = insertResult.insertId;
          isNewUser = true;
          userRole = requestedRole;
        } else {
          userId = users[0].id;
          userRole = users[0].role;
        }

        // Upsert into oauth_connections
        const [existingOauth] = await connection.execute(
          `SELECT id FROM oauth_connections WHERE user_id = ? AND provider = 'google'`,
          [userId]
        );

        if (existingOauth.length === 0) {
          await connection.execute(
            `INSERT INTO oauth_connections (user_id, provider, provider_user_id, provider_email, access_token, refresh_token, token_expires_at)
             VALUES (?, 'google', ?, ?, ?, ?, ?)`,
            [
              userId,
              userInfo.id,
              userInfo.email,
              tokens.accessToken,
              tokens.refreshToken || null,
              tokens.expiresAt ? new Date(tokens.expiresAt) : null
            ]
          );
        } else {
          await connection.execute(
            `UPDATE oauth_connections 
             SET access_token = ?, refresh_token = ?, provider_email = ?, token_expires_at = ?, updated_at = NOW()
             WHERE user_id = ? AND provider = 'google'`,
            [
              tokens.accessToken,
              tokens.refreshToken || null,
              userInfo.email,
              tokens.expiresAt ? new Date(tokens.expiresAt) : null,
              userId
            ]
          );
        }

        // Generate JWT
        const sessionToken = jwt.sign(
          {
            userId,
            email: userInfo.email,
            role: userRole,
            oauthProvider: 'google',
            loginMethod: 'google'
          },
          JWT_SECRET,
          { expiresIn: '7d' }
        );

        const callbackUrl = `${frontendUrl}/login/google-callback?token=${sessionToken}&email=${encodeURIComponent(userInfo.email)}&new_user=${isNewUser}&role=${userRole}`;

        return new Response(null, {
          status: 302,
          headers: { 'Location': callbackUrl }
        });

      } finally {
        connection.release();
      }
    } catch (error) {
      console.error('OAuth login callback error:', error);

      return new Response(null, {
        status: 302,
        headers: { 'Location': `${frontendUrl}/login?error=${encodeURIComponent(error.message)}` }
      });
    }
  });
}
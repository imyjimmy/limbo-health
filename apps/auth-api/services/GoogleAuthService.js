import { google } from 'googleapis';

export class GoogleAuthService {
  constructor() {
    this.clientId = process.env.GOOGLE_CLIENT_ID;
    this.clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    this.redirectUri = process.env.GOOGLE_REDIRECT_URI || 'http://localhost/api/google/login/callback';
    
    // Validate configuration
    if (!this.clientId || !this.clientSecret) {
      console.warn('⚠️  Google OAuth credentials not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in environment variables.');
    }
  }

  /**
   * Create OAuth2 client with optional custom redirect URI
   * @param {string|null} redirectUri - Optional custom redirect URI
   * @returns {OAuth2Client}
   */
  createOAuth2Client(redirectUri = null) {
    return new google.auth.OAuth2(
      this.clientId,
      this.clientSecret,
      redirectUri || this.redirectUri
    );
  }

  /**
   * Generate OAuth URL for user authorization
   * @param {string|number} userId - The provider's user ID (or 'login' for login flow)
   * @param {string|null} redirectUri - Optional custom redirect URI
   * @returns {string} Authorization URL to redirect user to
   */
  generateAuthUrl(userId, redirectUri = null) {
    const oauth2Client = this.createOAuth2Client(redirectUri);

    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline', // Get refresh token
      scope: [
        'https://www.googleapis.com/auth/userinfo.email',
        'https://www.googleapis.com/auth/userinfo.profile',
        // 'https://www.googleapis.com/auth/calendar',
        // 'https://www.googleapis.com/auth/calendar.events'
      ],
      prompt: 'consent', // Force consent screen to ensure we get refresh token
      state: JSON.stringify({ userId }) // Pass userId in state for callback
    });

    return authUrl;
  }

  /**
   * Exchange authorization code for access and refresh tokens
   * @param {string} code - Authorization code from OAuth callback
   * @param {string|null} redirectUri - Optional custom redirect URI (must match the one used to generate auth URL)
   * @returns {Promise<Object>} Token object with accessToken, refreshToken, expiryDate, etc.
   */
  async getTokensFromCode(code, redirectUri = null) {
    const oauth2Client = this.createOAuth2Client(redirectUri);
    
    try {
      const { tokens } = await oauth2Client.getToken(code);
      
      return {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiryDate: tokens.expiry_date,
        scope: tokens.scope,
        tokenType: tokens.token_type
      };
    } catch (error) {
      console.error('Error exchanging code for tokens:', error);
      throw new Error('Failed to exchange authorization code for tokens');
    }
  }

  /**
   * Get user profile information from Google
   * @param {string} accessToken - Google access token
   * @returns {Promise<Object>} User info object with id, email, name, picture, etc.
   */
  async getUserInfo(accessToken) {
    const oauth2Client = this.createOAuth2Client();
    oauth2Client.setCredentials({ access_token: accessToken });
    
    const oauth2 = google.oauth2({
      auth: oauth2Client,
      version: 'v2'
    });
    
    try {
      const { data } = await oauth2.userinfo.get();
      
      return {
        googleId: data.id,
        email: data.email,
        name: data.name,
        givenName: data.given_name,
        familyName: data.family_name,
        picture: data.picture,
        verifiedEmail: data.verified_email
      };
    } catch (error) {
      console.error('Error getting user info:', error);
      throw new Error('Failed to get user information from Google');
    }
  }

  /**
   * Refresh an expired access token using a refresh token
   * @param {string} refreshToken - Google refresh token
   * @returns {Promise<Object>} New token info with accessToken and expiryDate
   */
  async refreshAccessToken(refreshToken) {
    const oauth2Client = this.createOAuth2Client();
    oauth2Client.setCredentials({
      refresh_token: refreshToken
    });

    try {
      const { credentials } = await oauth2Client.refreshAccessToken();
      
      return {
        accessToken: credentials.access_token,
        expiryDate: credentials.expiry_date
      };
    } catch (error) {
      console.error('Error refreshing access token:', error);
      throw new Error('Failed to refresh access token');
    }
  }

  /**
   * Revoke Google access (disconnect/logout)
   * @param {string} accessToken - Google access token to revoke
   * @returns {Promise<boolean>} True if successfully revoked
   */
  async revokeToken(accessToken) {
    try {
      const oauth2Client = this.createOAuth2Client();
      await oauth2Client.revokeToken(accessToken);
      console.log('✅ Google token revoked successfully');
      return true;
    } catch (error) {
      console.error('Error revoking token:', error);
      return false;
    }
  }

  /**
   * Check if tokens are expired and need refresh
   * @param {number} expiryDate - Token expiry timestamp
   * @returns {boolean} True if token is expired or expires within 5 minutes
   */
  isTokenExpired(expiryDate) {
    if (!expiryDate) return true;
    
    const now = Date.now();
    const fiveMinutes = 5 * 60 * 1000;
    
    return expiryDate <= (now + fiveMinutes);
  }
}

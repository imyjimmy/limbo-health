import jwt from 'jsonwebtoken';
const { pool } = require('../config/database');

const JWT_SECRET = process.env.JWT_SECRET;

/**
 * Unified authentication function for Bun (returns result object, not middleware)
 * Checks for Nostr JWT or OAuth token and returns session info
 */
export const authenticateSession = (req) => {
  const authHeader = req.headers?.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { success: false, error: 'No token provided' };
  }

  const token = authHeader.substring(7);

  try {
    // Try to decode as JWT
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Check if it's a Nostr JWT (has pubkey field)
    if (decoded.pubkey) {
      return {
        success: true,
        user: {
          sessionId: decoded.pubkey,
          authMethod: 'nostr',
          trustLevel: 'high',
          metadata: decoded
        }
      };
    }
    
    // Check if it's an OAuth JWT (has oauthProvider and userId fields)
    if (decoded.oauthProvider && decoded.userId) {
      return {
        success: true,
        user: {
          sessionId: `oauth:${decoded.oauthProvider}:${decoded.userId}`,
          authMethod: 'oauth',
          trustLevel: 'high',
          metadata: decoded
        }
      };
    }
    
    // Valid JWT but unknown format
    console.warn('⚠️ Valid JWT but unrecognized format:', decoded);
    return { success: false, error: 'Unrecognized token format' };
    
  } catch (error) {
    console.log('Token validation failed:', error.message);
    return { success: false, error: 'Invalid token' };
  }
};

/**
 * Helper function to get user identifier for WebRTC routes
 * Handles both authenticated users and guests
 * Returns: { userIdentifier, isGuest, user? }
 */
export const getUserIdentifier = async (req, isGuestParam = false) => {
  const { roomId } = req.params;
  
  // Try authentication first (if not explicitly a guest request)
  if (!isGuestParam) {
    const authResult = authenticateSession(req);
    
    if (authResult.success) {
      console.log(`Authenticated user: ${authResult.user.authMethod} - ${authResult.user.sessionId}`);
      return {
        userIdentifier: authResult.user.sessionId,
        isGuest: false,
        user: authResult.user
      };
    }
  }
  
  // Fall back to guest validation
  const guestCheck = await validateGuestAccess(req);
  
  if (!guestCheck.valid) {
    return {
      error: guestCheck.error || 'Unauthorized',
      status: 403
    };
  }
  
  console.log(`Guest user: guest-room-${roomId}`);
  return {
    userIdentifier: `guest-room-${roomId}`,
    isGuest: true
  };
};

/**
 * Legacy function - kept for backward compatibility
 * Routes using this should migrate to authenticateSession
 */
export const validateAuthToken = (req, res) => {
  try {
    const authHeader = req.headers?.authorization;
    console.log('authHeader:', authHeader);

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log('about to return success false, no token provided');
      return { success: false, error: 'No token provided' };
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    return { success: true, user: decoded };
  } catch (error) {
    console.error('Token validation failed:', error);
    return { success: false, error: 'Failed Auth Check, Invalid Token' };
  }
};

export const validateGuestAccess = async (req) => {
  const { roomId } = req.params;
  
  try {
    const connection = await pool.getConnection();
    const [appointments] = await connection.execute(
      'SELECT id, start_datetime, end_datetime FROM appointments WHERE location = ?',
      [roomId]
    );
    connection.release();
    
    if (!Array.isArray(appointments) || appointments.length === 0) {
      return { valid: false, error: 'Invalid meeting room' };
    }
    
    const appointment = appointments[0];
    const now = new Date();
    const startTime = new Date(appointment.start_datetime);
    const endTime = new Date(appointment.end_datetime);
    
    const accessStart = new Date(startTime.getTime() - 15 * 60 * 1000);
    const accessEnd = new Date(endTime.getTime() + 120 * 60 * 1000);
    
    if (now < accessStart || now > accessEnd) {
      return { valid: false, error: 'Meeting not accessible at this time' };
    }
    
    return { valid: true };
  } catch (error) {
    console.error('Guest access validation error:', error);
    return { valid: false, error: 'Server error' };
  }
};
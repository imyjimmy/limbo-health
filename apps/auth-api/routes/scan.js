import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { generateScanToken } from '../utils/tokenGenerator.js';
import { normalizeToHex } from '../utils/pubkey.js';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// JWT auth for patient-facing endpoints (session create, revoke)
function requireJWT(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'JWT required' });
  }

  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Internal service auth for cleanup endpoint
function requireInternalAuth(req, res, next) {
  const secret = req.headers['x-internal-secret'];
  if (!secret || secret !== process.env.INTERNAL_API_SECRET) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
}

/**
 * POST /api/auth/scan/session
 * Patient creates a scan session. Authenticated with patient's JWT.
 */
router.post('/api/auth/scan/session', requireJWT, async (req, res) => {
  try {
    const { stagingRepoId } = req.body;
    console.log('/api/auth/scan/session: ', req.body);
    
    if (!stagingRepoId) {
      return res.status(400).json({ error: 'stagingRepoId is required' });
    }

    if (!stagingRepoId.startsWith('scan-')) {
      return res.status(400).json({ error: 'stagingRepoId must start with "scan-"' });
    }

    const pubkey = normalizeToHex(req.user.pubkey);
    const sessionToken = generateScanToken();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    const db = req.app.get('db');

    await db.execute(
      `INSERT INTO scan_sessions (session_token, staging_repo_id, patient_pubkey, expires_at)
       VALUES (?, ?, ?, ?)`,
      [sessionToken, stagingRepoId, pubkey, expiresAt]
    );

    res.json({
      sessionToken,
      repoId: stagingRepoId,
      expiresAt: Math.floor(expiresAt.getTime() / 1000)
    });
  } catch (err) {
    console.error('scan/session error:', err);
    res.status(500).json({ error: 'Failed to create scan session' });
  }
});

/**
 * POST /api/auth/scan/revoke
 * Patient revokes a scan session. Only the session owner can revoke.
 */
router.post('/api/auth/scan/revoke', requireJWT, async (req, res) => {
  try {
    const { sessionToken } = req.body;

    if (!sessionToken) {
      return res.status(400).json({ error: 'sessionToken is required' });
    }

    const pubkey = normalizeToHex(req.user.pubkey);
    const db = req.app.get('db');

    const [result] = await db.execute(
      `UPDATE scan_sessions SET is_revoked = TRUE
       WHERE session_token = ? AND patient_pubkey = ?`,
      [sessionToken, pubkey]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Session not found or not owned by you' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('scan/revoke error:', err);
    res.status(500).json({ error: 'Failed to revoke session' });
  }
});

/**
 * POST /api/auth/scan/cleanup
 * Called by mgit-api's cleanup job. Returns staging repo IDs that are
 * expired or revoked and safe to delete from disk.
 */
router.post('/api/auth/scan/cleanup', requireInternalAuth, async (req, res) => {
  try {
    const db = req.app.get('db');

    // Expired sessions (with 15-minute grace period)
    const [expired] = await db.execute(
      `SELECT staging_repo_id FROM scan_sessions
       WHERE expires_at < NOW() - INTERVAL 15 MINUTE
       AND is_revoked = FALSE`
    );

    // Revoked sessions (with 5-minute grace period for doctor to finish)
    const [revoked] = await db.execute(
      `SELECT staging_repo_id FROM scan_sessions
       WHERE is_revoked = TRUE
       AND created_at < NOW() - INTERVAL 5 MINUTE`
    );

    const expiredRepos = expired.map(r => r.staging_repo_id);
    const revokedRepos = revoked.map(r => r.staging_repo_id);

    // Delete the session rows
    const allRepoIds = [...new Set([...expiredRepos, ...revokedRepos])];
    if (allRepoIds.length > 0) {
      await db.execute(
        `DELETE FROM scan_sessions WHERE staging_repo_id IN (${allRepoIds.map(() => '?').join(',')})`,
        allRepoIds
      );
    }

    res.json({ expiredRepos, revokedRepos });
  } catch (err) {
    console.error('scan/cleanup error:', err);
    res.status(500).json({ error: 'Cleanup query failed' });
  }
});

export default router;
import { Router } from 'express';
import { normalizeToHex } from '../utils/pubkey.js';

const router = Router();

// Internal service auth — only mgit-api should call these endpoints
function requireInternalAuth(req, res, next) {
  const secret = req.headers['x-internal-secret'];
  if (!secret || secret !== process.env.INTERNAL_API_SECRET) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
}



/**
 * POST /api/auth/register-repo
 * Called by mgit-api after push-to-create or explicit repo creation.
 */
router.post('/api/auth/register-repo', requireInternalAuth, async (req, res) => {
  try {
    const { repoId, ownerPubkey, description, repoType } = req.body;

    if (!repoId || !ownerPubkey) {
      return res.status(400).json({ error: 'repoId and ownerPubkey are required' });
    }

    const hexPubkey = normalizeToHex(ownerPubkey);
    const db = req.app.get('db');

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      await conn.execute(
        `INSERT INTO repositories (id, description, repo_type, owner_pubkey)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE updated_at = NOW()`,
        [repoId, description || '', repoType || 'medical-history', hexPubkey]
      );

      await conn.execute(
        `INSERT INTO repository_access (repo_id, pubkey, access_level)
         VALUES (?, ?, 'admin')
         ON DUPLICATE KEY UPDATE access_level = 'admin'`,
        [repoId, hexPubkey]
      );

      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }

    res.json({ success: true, repoId });
  } catch (err) {
    console.error('register-repo error:', err);
    res.status(500).json({ error: 'Failed to register repository' });
  }
});

/**
 * POST /api/auth/check-access
 * Central authorization endpoint. mgit-api calls this on every git transport request.
 */
router.post('/api/auth/check-access', requireInternalAuth, async (req, res) => {
  try {
    const { pubkey, scanToken, repoId, operation } = req.body;
    const db = req.app.get('db');

    if (!repoId) {
      return res.json({ allowed: false, reason: 'repoId is required' });
    }

    // --- Scan token path (stub for Day 2) ---
    if (scanToken) {
      const [rows] = await db.execute(
        'SELECT * FROM scan_sessions WHERE session_token = ?',
        [scanToken]
      );

      if (rows.length === 0) {
        return res.json({ allowed: false, reason: 'Invalid scan token' });
      }

      const session = rows[0];

      if (session.is_revoked) {
        return res.json({ allowed: false, reason: 'Session revoked' });
      }
      if (new Date(session.expires_at) < new Date()) {
        return res.json({ allowed: false, reason: 'Session expired' });
      }
      if (session.staging_repo_id !== repoId) {
        return res.json({ allowed: false, reason: 'Token not scoped to this repo' });
      }

      return res.json({ allowed: true, access: 'read-write', authMethod: 'scan_token' });
    }

    // --- Pubkey path ---
    if (pubkey) {
      const hexPubkey = normalizeToHex(pubkey);

      const [rows] = await db.execute(
        `SELECT access_level FROM repository_access
         WHERE repo_id = ? AND pubkey = ?`,
        [repoId, hexPubkey]
      );

      if (rows.length === 0) {
        return res.json({ allowed: false, reason: 'Not authorized for this repository' });
      }

      const accessLevel = rows[0].access_level;

      if (operation === 'write' && accessLevel === 'read-only') {
        return res.json({ allowed: false, reason: 'Insufficient permissions' });
      }

      return res.json({ allowed: true, access: accessLevel, authMethod: 'jwt' });
    }

    // --- No credentials ---
    return res.json({ allowed: false, reason: 'No credentials provided' });
  } catch (err) {
    console.error('check-access error:', err);
    res.status(500).json({ error: 'Authorization check failed' });
  }
});

/**
 * GET /api/auth/user/repositories?pubkey={pubkey}
 * Returns repos a pubkey has access to. Called by mgit-api's repo listing endpoint.
 */
router.get('/api/auth/user/repositories', requireInternalAuth, async (req, res) => {
  try {
    const { pubkey } = req.query;

    if (!pubkey) {
      return res.status(400).json({ error: 'pubkey query parameter is required' });
    }

    const hexPubkey = normalizeToHex(pubkey);
    const db = req.app.get('db');

    const [rows] = await db.execute(
      `SELECT r.id AS repoId, r.description, r.repo_type AS repoType,
              ra.access_level AS access, r.created_at AS createdAt
       FROM repositories r
       JOIN repository_access ra ON r.id = ra.repo_id
       WHERE ra.pubkey = ?
       ORDER BY r.created_at DESC`,
      [hexPubkey]
    );

    res.json(rows);
  } catch (err) {
    console.error('user/repositories error:', err);
    res.status(500).json({ error: 'Failed to fetch repositories' });
  }
});

/**
 * DELETE /api/auth/repos/:repoId
 * Removes a repo's auth config. CASCADE deletes repository_access rows.
 */
router.delete('/api/auth/repos/:repoId', requireInternalAuth, async (req, res) => {
  try {
    const { repoId } = req.params;
    const db = req.app.get('db');

    const [result] = await db.execute(
      'DELETE FROM repositories WHERE id = ?',
      [repoId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Repository not found' });
    }

    res.json({ success: true, repoId });
  } catch (err) {
    console.error('delete repo error:', err);
    res.status(500).json({ error: 'Failed to delete repository' });
  }
});

export default router;
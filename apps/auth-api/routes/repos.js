import { Router } from 'express';

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
    const { repoId, ownerUserId, description, repoType } = req.body;

    if (!repoId || !ownerUserId) {
      return res.status(400).json({ error: 'repoId and ownerUserId are required' });
    }

    const db = req.app.get('db');

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      await conn.execute(
        `INSERT INTO repositories (id, description, repo_type, owner_user_id)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE updated_at = NOW()`,
        [repoId, description || '', repoType || 'medical-history', ownerUserId]
      );

      await conn.execute(
        `INSERT INTO repository_access (repo_id, user_id, access_level)
         VALUES (?, ?, 'admin')
         ON DUPLICATE KEY UPDATE access_level = 'admin'`,
        [repoId, ownerUserId]
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
    const { userId, scanToken, repoId, operation } = req.body;
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

    // --- UserId path ---
    if (userId) {
      const [rows] = await db.execute(
        `SELECT access_level FROM repository_access
         WHERE repo_id = ? AND user_id = ?`,
        [repoId, userId]
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
 * GET /api/auth/user/repositories?userId={userId}
 * Returns repos a user has access to. Called by mgit-api's repo listing endpoint.
 */
router.get('/api/auth/user/repositories', requireInternalAuth, async (req, res) => {
  try {
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({ error: 'userId query parameter is required' });
    }

    const db = req.app.get('db');

    const [rows] = await db.execute(
      `SELECT r.id AS repoId, r.description, r.repo_type AS repoType,
              ra.access_level AS access, r.created_at AS createdAt
       FROM repositories r
       JOIN repository_access ra ON r.id = ra.repo_id
       WHERE ra.user_id = ?
       ORDER BY r.created_at DESC`,
      [userId]
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

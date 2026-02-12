const jwt = require('jsonwebtoken');
const authApiClient = require('./authApiClient');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

/**
 * Full auth middleware for git transport routes.
 * Supports JWT (Bearer) and scan tokens (query param or header).
 * Calls auth-api check-access to authorize.
 */
async function authMiddleware(req, res, next) {
  let pubkey = null;
  let scanToken = null;

  // Step 1: Extract credentials
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      pubkey = decoded.pubkey;
    } catch (err) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
  }

  // Check for scan token (query param takes priority if no JWT)
  if (!pubkey) {
    scanToken = req.query.scan_token || null;
    if (authHeader && authHeader.startsWith('ScanToken ')) {
      scanToken = authHeader.split(' ')[1];
    }
  }

  if (!pubkey && !scanToken) {
    return res.status(401).json({ error: 'No authentication provided' });
  }

  // Step 2: Determine operation
  const service = req.query.service || '';
  const isWrite = req.path.includes('git-receive-pack') || service === 'git-receive-pack';
  const operation = isWrite ? 'write' : 'read';

  // Step 3: Call auth-api
  const repoId = req.params.repoId;
  try {
    const result = await authApiClient.checkAccess({
      pubkey,
      scanToken,
      repoId,
      operation
    });

    if (!result.allowed) {
      return res.status(403).json({ error: result.reason || 'Access denied' });
    }

    req.user = {
      pubkey: pubkey || null,
      authMethod: result.authMethod,
      access: result.access
    };

    next();
  } catch (err) {
    console.error('Auth service error:', err.message);
    return res.status(502).json({ error: 'Auth service unavailable' });
  }
}

/**
 * Lightweight JWT-only middleware for routes without a repoId
 * (e.g. user/repositories, repos/create).
 */
function jwtOnly(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'JWT required' });
  }

  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = { pubkey: decoded.pubkey };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

module.exports = { authMiddleware, jwtOnly };
import { pool } from '../config/database.js';
import { validateAuthToken } from '../middleware/auth.js';

export const setupUserKeysRoutes = (app) => {
  // GET /api/user/keys
  app.get('/api/user/keys', async (req, res) => {
    const authResult = validateAuthToken(req, res);
    
    if (!authResult.success) {
      return res.status(401).json({ error: authResult.error });
    }
    
    try {
      const userId = authResult.user.userId;
      
      const connection = await pool.getConnection();
      const [rows] = await connection.execute(
        'SELECT encrypted_ed25519_privkey FROM users WHERE id = ?',
        [userId]
      );
      connection.release();
      
      if (rows.length === 0) {
        return res.json({ encryptedKey: null });
      }
      
      return res.json({ encryptedKey: rows[0].encrypted_ed25519_privkey });
      
    } catch (error) {
      console.error('Error fetching keys:', error);
      return res.status(500).json({ error: 'Failed to fetch keys' });
    }
  });

  // POST /api/user/keys
  app.post('/api/user/keys', async (req, res) => {
    const authResult = validateAuthToken(req, res);
    
    if (!authResult.success) {
      return res.status(401).json({ error: authResult.error });
    }
    
    try {
      const userId = authResult.user.userId;
      const { ed25519_pubkey, encrypted_privkey } = await req.json();
      
      const connection = await pool.getConnection();
      await connection.execute(
        'UPDATE users SET ed25519_pubkey = ?, encrypted_ed25519_privkey = ? WHERE id = ?',
        [ed25519_pubkey, encrypted_privkey, userId]
      );
      connection.release();
      
      return res.json({ success: true });
      
    } catch (error) {
      console.error('Error saving keys:', error);
      return res.status(500).json({ error: 'Failed to save keys' });
    }
  });
};
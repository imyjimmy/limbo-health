import { pool } from '../config/database.js';
import { authenticateSession, validateAuthToken } from '../middleware/auth.js';
import { getUserId } from '../utils/auth.js';

export const setupAdminRoutes = (app) => {
  // Database test endpoint
  app.get('/api/admin/database-test', async (req, res) => {
    const authResult = validateAuthToken(req, res);
    
    if (!authResult.success) {
      return res.status(401).json({ error: authResult.error });
    }
    
    try {
      console.log('Testing database connection...');
      
      const connection = await pool.getConnection();
      console.log('Database connection successful');
      
      const [rows] = await connection.execute('SELECT COUNT(*) as user_count FROM users');
      const userCount = rows[0].user_count;
      
      const [sampleUsers] = await connection.execute(`
        SELECT 
          id, 
          first_name, 
          last_name, 
          email, 
          timezone, 
          language,
          id_roles,
          create_datetime
        FROM users 
        LIMIT 5
      `);
      
      const [roles] = await connection.execute('SELECT id, name, slug FROM roles');
      
      connection.release();
      
      return res.json({
        status: 'success',
        message: 'Database connection successful',
        data: {
          userCount,
          sampleUsers,
          roles,
          timestamp: new Date().toISOString()
        }
      });
      
    } catch (error) {
      console.error('Database connection failed:', error);
      res.status(500).json({
        status: 'error',
        message: 'Database connection failed',
        error: error.message
      });
    }
  });

  // User lookup by Nostr pubkey
  app.get('/api/admin/user-lookup/:pubkey', async (req, res) => {
    console.log('Route handler called with req keys:', Object.keys(req));
    console.log('Route handler req.headers:', req.headers);
    
    const authResult = validateAuthToken(req, res);
    if (authResult && !authResult.success) {
      return authResult; // This will be the error response
    }

    try {
      const { pubkey } = req.params;
      console.log('Looking up user by pubkey:', pubkey);
      
      const connection = await pool.getConnection();
      
      const [rows] = await connection.execute(`
        SELECT 
          id, 
          first_name, 
          last_name, 
          email, 
          timezone, 
          language,
          id_roles,
          nostr_pubkey,
          create_datetime,
          update_datetime
        FROM users 
        WHERE nostr_pubkey = ?
      `, [pubkey]);
      
      connection.release();
      
      if (rows.length > 0) {
        const user = rows[0];
        
        const roleConnection = await pool.getConnection();
        const [roleRows] = await roleConnection.execute(`
          SELECT id, name, slug FROM roles WHERE id = ?
        `, [user.id_roles]);
        roleConnection.release();
        
        return res.json({
          status: 'success',
          isRegistered: true,
          user: {
            ...user,
            role: roleRows[0] || null
          }
        });
      } else {
        return res.json({
          status: 'success',
          isRegistered: false
        });
      }
      
    } catch (error) {
      console.error('User lookup failed:', error);
      return res.status(500).json({
        status: 'error',
        message: 'User lookup failed',
        error: error.message
      });
    }
  });

  // GET /api/admin/me - just returns { username: 'drsmith' | null , userId: 123 // guaranteed to exist }
  app.get('/api/admin/me', async (req, res) => {
    const authResult = validateAuthToken(req, res);
    if (!authResult.success) {
      return res.status(401).json({ error: authResult.error });
    }
    
    const connection = await pool.getConnection();
    try {
      const userId = await getUserId(connection, req.user);
      
      if (!userId) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      const [rows] = await connection.execute(
        `SELECT pp.username, u.id as user_id, u.email, u.nostr_pubkey, u.id_roles,
                r.id as role_id, r.name as role_name, r.slug as role_slug
        FROM users u
        LEFT JOIN provider_profiles pp ON pp.user_id = u.id 
        LEFT JOIN roles r ON u.id_roles = r.id
        WHERE u.id = ?`,
        [userId]
      );

      if (rows.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      const user = rows[0];

      return res.json({ 
        status: 'success',
        user: {
          id: user.user_id,
          username: user.username,
          email: user.email,
          nostrPubkey: user.nostr_pubkey,
          role: user.role_id ? {
            id: user.role_id,
            name: user.role_name,
            slug: user.role_slug
          } : null
        }
      });
    } finally {
      connection.release();
    }
  });

  // User registration endpoint
  app.post('/api/admin/register-user', async (req, res) => {
    const authResult = validateAuthToken(req, res);
    if (!authResult.success) {
      return res.status(401).json({ error: authResult.error });
    }
    
    try {
      const { firstName, lastName, email, phoneNumber } = req.body;
      const { pubkey } = req.user;
      
      console.log('Registering new user:', { firstName, lastName, email, phoneNumber, pubkey });
      
      if (!firstName || !lastName || !email) {
        return res.status(400).json({
          status: 'error',
          message: 'First name, last name, and email are required'
        });
      }
      
      const connection = await pool.getConnection();
      
      const [existingUsers] = await connection.execute(
        'SELECT id, email FROM users WHERE email = ?',
        [email]
      );
      
      if (existingUsers.length > 0) {
        connection.release();
        return res.status(400).json({
          status: 'error',
          message: 'A user with this email already exists'
        });
      }
      
      const [existingPubkey] = await connection.execute(
        'SELECT id, email FROM users WHERE nostr_pubkey = ?',
        [pubkey]
      );
      
      if (existingPubkey.length > 0) {
        connection.release();
        return res.status(400).json({
          status: 'error',
          message: 'This Nostr identity is already registered'
        });
      }
      
      const [roleRows] = await connection.execute(
        'SELECT id FROM roles WHERE slug = ? OR name = ? LIMIT 1',
        ['admin-provider', 'Admin Provider']
      );
      
      const roleId = roleRows.length > 0 ? roleRows[0].id : 5;
      
      const [result] = await connection.execute(`
        INSERT INTO users (
          create_datetime,
          update_datetime, 
          first_name,
          last_name,
          email,
          phone_number,
          timezone,
          language,
          nostr_pubkey,
          id_roles
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        new Date().toISOString().slice(0, 19).replace('T', ' '),
        new Date().toISOString().slice(0, 19).replace('T', ' '),
        firstName,
        lastName,
        email,
        phoneNumber || null,
        'UTC',
        'english',
        pubkey,
        roleId
      ]);
      
      const newUserId = result.insertId;
      
      const [newUserRows] = await connection.execute(`
        SELECT 
          u.id, 
          u.first_name, 
          u.last_name, 
          u.email, 
          u.phone_number,
          u.timezone, 
          u.language,
          u.id_roles,
          u.nostr_pubkey,
          u.create_datetime,
          r.name as role_name,
          r.slug as role_slug
        FROM users u
        LEFT JOIN roles r ON u.id_roles = r.id
        WHERE u.id = ?
      `, [newUserId]);
      
      connection.release();
      
      const newUser = newUserRows[0];
      
      console.log('User registered successfully:', newUser);
      
      return res.json({
        status: 'success',
        message: 'User registered successfully',
        user: {
          id: newUser.id,
          first_name: newUser.first_name,
          last_name: newUser.last_name,
          email: newUser.email,
          phone_number: newUser.phone_number,
          timezone: newUser.timezone,
          language: newUser.language,
          id_roles: newUser.id_roles,
          nostr_pubkey: newUser.nostr_pubkey,
          role: {
            id: newUser.id_roles,
            name: newUser.role_name,
            slug: newUser.role_slug
          }
        }
      });
      
    } catch (error) {
      console.error('User registration failed:', error);
      return res.status(500).json({
        status: 'error',
        message: 'User registration failed',
        error: error.message
      });
    }
  });

  app.put('/api/admin/update-nostr-pubkey', async (req, res) => {

  });

  // Service management endpoints
  app.get('/api/admin/services', async (req, res) => {
    const authResult = validateAuthToken(req, res);
    if (!authResult.success) {
      return res.status(401).json({ error: authResult.error });
    }
    
    const connection = await pool.getConnection();
    try {
      const { sessionId, authMethod } = authResult.user;
      console.log(`Getting services - User: ${authMethod} - ${sessionId}`);

      const userId = await getUserId(connection, req.user);
      
      if (!userId) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      // Now get the services for this provider
      const [services] = await connection.execute(`
        SELECT 
          s.*,
          sc.name as category_name
        FROM services s
        LEFT JOIN service_categories sc ON s.id_service_categories = sc.id
        INNER JOIN services_providers sp ON s.id = sp.id_services
        WHERE sp.id_users = ?
        ORDER BY s.name
      `, [userId]);
      
      connection.release();
      console.log(`Found ${services.length} services for provider ${userId}`);
            
      return res.json({
        status: 'success',
        services: services
      });
      
    } catch (error) {
      if (connection) { 
        connection.release(); 
      }
      
      console.error('Failed to load services:', error);
      return res.status(500).json({
        status: 'error',
        message: 'Failed to load services',
        error: error.message
      });
    }
  });

  // Get service categories
  app.get('/api/admin/service-categories', async (req, res) => {
    const authResult = validateAuthToken(req, res);
    if (!authResult.success) {
      return res.status(401).json({ error: authResult.error });
    }

    try {
      const connection = await pool.getConnection();
      
      const [categories] = await connection.execute(`
        SELECT id, name, description
        FROM service_categories
        ORDER BY name
      `);
      
      connection.release();
      
      return res.json({
        status: 'success',
        categories: categories
      });
      
    } catch (error) {
      console.error('Failed to load service categories:', error);
      return res.status(500).json({
        status: 'success',
        categories: []
      });
    }
  });

  // Create new service
  app.post('/api/admin/services', async (req, res) => {
    const authResult = validateAuthToken(req, res);
    if (!authResult.success) {
      return res.status(401).json({ error: authResult.error });
    }

    const connection = await pool.getConnection();
    
    try {
      const {
        name,
        duration,
        price,
        currency,
        description,
        location,
        color,
        availabilities_type,
        attendants_number,
        id_service_categories,
        is_private
      } = req.body;
      
      if (!name || !duration) {
        connection.release();
        return res.status(400).json({
          status: 'error',
          message: 'Service name and duration are required'
        });
      }
      
      // Start transaction
      await connection.beginTransaction();
      
      // Get user ID (works for both Google and Nostr)
      const userId = await getUserId(connection, req.user);
      
      if (!userId) {
        await connection.rollback();
        connection.release();
        return res.status(400).json({
          status: 'error',
          message: 'User not found in database'
        });
      }

      // Insert the service
      const [result] = await connection.execute(`
        INSERT INTO services (
          create_datetime,
          update_datetime,
          name,
          duration,
          price,
          currency,
          description,
          location,
          color,
          availabilities_type,
          attendants_number,
          id_service_categories
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        new Date().toISOString().slice(0, 19).replace('T', ' '),
        new Date().toISOString().slice(0, 19).replace('T', ' '),
        name,
        duration,
        price || 0,
        currency || 'USD',
        description || '',
        location || '',
        color || '#3fbd5e',
        availabilities_type || 'flexible',
        attendants_number || 1,
        id_service_categories || null
      ]);
      
      const serviceId = result.insertId;

      // Link service to provider
      await connection.execute(`
        INSERT INTO services_providers (id_users, id_services) 
        VALUES (?, ?)
      `, [userId, serviceId]);
      
      await connection.commit();
      connection.release();
      
      return res.json({
        status: 'success',
        message: 'Service created successfully',
        service_id: serviceId
      });
      
    } catch (error) {
      await connection.rollback();
      connection.release();
      console.error('Failed to create service:', error);
      return res.status(500).json({
        status: 'error',
        message: 'Failed to create service',
        error: error.message
      });
    }
  });

  // Update service
  app.put('/api/admin/services/:id', async (req, res) => {
    const authResult = validateAuthToken(req, res);
    if (!authResult.success) {
      return res.status(401).json({ error: authResult.error });
    }
    
    try {
      const { id } = req.params;
      const {
        name,
        duration,
        price,
        currency,
        description,
        location,
        color,
        availabilities_type,
        attendants_number,
        id_service_categories,
        is_private
      } = req.body;
      
      if (!name || !duration) {
        return res.status(400).json({
          status: 'error',
          message: 'Service name and duration are required'
        });
      }
      
      const connection = await pool.getConnection();
      
      const [result] = await connection.execute(`
        UPDATE services SET
          update_datetime = ?,
          name = ?,
          duration = ?,
          price = ?,
          currency = ?,
          description = ?,
          location = ?,
          color = ?,
          availabilities_type = ?,
          attendants_number = ?,
          id_service_categories = ?
        WHERE id = ?
      `, [
        new Date().toISOString().slice(0, 19).replace('T', ' '),
        name,
        duration,
        price || 0,
        currency || 'USD',
        description || '',
        location || '',
        color || '#3fbd5e',
        availabilities_type || 'flexible',
        attendants_number || 1,
        id_service_categories || null,
        id
      ]);
      
      connection.release();
      
      if (result.affectedRows === 0) {
        return res.status(404).json({
          status: 'error',
          message: 'Service not found'
        });
      }
      
      return res.json({
        status: 'success',
        message: 'Service updated successfully'
      });
      
    } catch (error) {
      console.error('Failed to update service:', error);
      return res.status(500).json({
        status: 'error',
        message: 'Failed to update service',
        error: error.message
      });
    }
  });

  // Delete service
  app.delete('/api/admin/services/:id', async (req, res) => {
    const authResult = validateAuthToken(req, res);
    if (!authResult.success) {
      return res.status(401).json({ error: authResult.error });
    }

    try {
      const { id } = req.params;
      
      const connection = await pool.getConnection();
      
      const [appointments] = await connection.execute(
        'SELECT COUNT(*) as count FROM appointments WHERE id_services = ?',
        [id]
      );
      
      if (appointments[0].count > 0) {
        connection.release();
        return res.status(400).json({
          status: 'error',
          message: 'Cannot delete service with existing appointments'
        });
      }
      
      const [result] = await connection.execute(
        'DELETE FROM services WHERE id = ?',
        [id]
      );
      
      connection.release();
      
      if (result.affectedRows === 0) {
        return res.status(404).json({
          status: 'error',
          message: 'Service not found'
        });
      }
      
      return res.json({
        status: 'success',
        message: 'Service deleted successfully'
      });
      
    } catch (error) {
      console.error('Failed to delete service:', error);
      return res.status(500).json({
        status: 'error',
        message: 'Failed to delete service',
        error: error.message
      });
    }
  });

  // Get working plan from settings
  app.get('/api/admin/working-plan', async (req, res) => {
    const authResult = validateAuthToken(req, res);
    if (!authResult.success) {
      return res.status(401).json({ error: authResult.error });
    }

    try {
      console.log('GET /api/admin/working-plan');
      const connection = await pool.getConnection();
      
      const [rows] = await connection.execute(`
        SELECT value FROM settings WHERE name = 'company_working_plan'
      `);
      
      connection.release();
      
      if (rows.length === 0) {
        return res.status(404).json({
          status: 'error',
          message: 'Working plan not found'
        });
      }
      
      const workingPlan = JSON.parse(rows[0].value);
      
      return res.json({
        status: 'success',
        working_plan: workingPlan
      });
      
    } catch (error) {
      console.error('Failed to fetch working plan:', error);
      return res.status(500).json({
        status: 'error',
        message: 'Failed to fetch working plan',
        error: error.message
      });
    }
  });


};
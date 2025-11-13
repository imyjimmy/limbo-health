import { pool } from '../config/database.js';
import { validateAuthToken } from '../middleware/auth.js';
import * as utils from '../utils/availability.js';

export const setupProviderRoutes = (app) => {
  // Get all providers - PUBLIC endpoint
  app.get('/api/admin/providers', async (req, res) => {
    try {
      const connection = await pool.getConnection();
      
      const [providers] = await connection.execute(
        'SELECT id, first_name, last_name, email, id_roles FROM users WHERE id_roles in (2,5)'
      );
      
      const formattedProviders = providers.map(provider => ({
        id: provider.id.toString(),
        name: `${provider.first_name} ${provider.last_name}`,
        email: provider.email,
        role: provider.id_roles === 2 ? 'provider' : 'admin-provider'
      }));

      connection.release();
      return res.json(formattedProviders);
    } catch (error) {
      console.error('Error fetching providers:', error);
      return res.status(500).json({ error: 'Failed to fetch providers' });
    }
  });

  // Get services for a specific provider - PUBLIC endpoint  
  app.get('/api/admin/providers/:providerId/services', async (req, res) => {
    console.log('GET /api/admin/providers/:providerId/services');
    try {
      const { providerId } = req.params;
      
      const connection = await pool.getConnection();
      
      const [services] = await connection.execute(`
        SELECT s.id, s.name, s.duration, s.price, s.description
        FROM services s
        INNER JOIN services_providers sp ON s.id = sp.id_services
        WHERE sp.id_users = ? AND s.is_private = 0
      `, [providerId]);
      
      const formattedServices = services.map(service => ({
        id: service.id.toString(),
        name: service.name,
        duration: service.duration,
        price: service.price || '0'
      }));

      connection.release();
      return res.json(formattedServices);
    } catch (error) {
      console.error('Error fetching services for provider:', error);
      return res.status(500).json({ error: 'Failed to fetch services' });
    }
  });

  // Get available time slots for a provider on a specific date - PUBLIC endpoint
  app.get('/api/providers/:providerId/availability', async (req, res) => {
    console.log('GET /api/providers/:providerId/availability');
    
    let connection;
    try {
      const { providerId } = req.params;
      const { serviceId, date, timezone, currentTime } = req.query;

      if (!serviceId || !date) {
        return res.status(400).json({ 
          error: 'Missing required parameters: serviceId, date' 
        });
      }

      connection = await pool.getConnection();

      // Get basic provider data
      const [providers] = await connection.execute(`
        SELECT id, first_name, last_name, timezone
        FROM users 
        WHERE id = ?
      `, [providerId]);

      if (providers.length === 0) {
        return res.status(404).json({ error: 'Provider not found' });
      }

      const provider = providers[0];

      // Get company working plan from settings
      const [workingPlanRows] = await connection.execute(`
        SELECT value FROM settings WHERE name = 'company_working_plan'
      `);

      // Get service data
      const [services] = await connection.execute(`
        SELECT id, name, duration, availabilities_type, attendants_number
        FROM services 
        WHERE id = ?
      `, [serviceId]);

      if (services.length === 0) {
        return res.status(404).json({ error: 'Service not found' });
      }

      const service = services[0];

      // Get existing appointments for this date and provider
      const [appointments] = await connection.execute(`
        SELECT start_datetime, end_datetime, is_unavailability
        FROM appointments 
        WHERE id_users_provider = ? 
        AND DATE(start_datetime) <= ? 
        AND DATE(end_datetime) >= ?
      `, [providerId, date, date]);

      // Build provider object with working plan
      const workingPlan = workingPlanRows.length > 0 ? workingPlanRows[0].value : null;
      const providerWithPlan = {
        ...provider,
        settings: {
          working_plan: workingPlan,
          working_plan_exceptions: '{}' // No exceptions for now
        }
      };

      console.log('🔍 Working plan:', workingPlan);

      // Calculate available hours
      const availableHours = utils.calculateAvailableHours(date, currentTime, timezone, service, providerWithPlan, appointments);

      return res.json({
        date,
        providerId,
        serviceId,
        providerName: `${provider.first_name} ${provider.last_name}`,
        serviceName: service.name,
        serviceDuration: service.duration,
        availableHours
      });

    } catch (error) {
      console.error('Error fetching provider availability:', error);
      return res.status(500).json({ error: 'Failed to fetch availability' });
    } finally {
      if (connection) connection.release();
    }
  });

  // GET provider profile PUBLIC endpoint by username
  app.get('/api/admin/provider/:username/profile', async (req, res) => {
    try {
      const { username } = req.params;
      const connection = await pool.getConnection();

      // 1. Fetch provider profile via username
      const [rows] = await connection.execute(
        `SELECT * FROM provider_profiles WHERE username = ?`,
        [username]
      );
      
      connection.release();

      if (rows.length === 0) {
        return res.status(404).json({
          status: 'error',
          message: 'Provider profile not found'
        });
      }

      // Transform snake_case to camelCase
      const profileData = rows[0];
      const camelCaseProfile = {
        userId: profileData.user_id,
        username: profileData.username,
        profilePic: profileData.profile_pic_url,
        firstName: profileData.first_name,
        lastName: profileData.last_name,
        suffix: profileData.suffix,
        bio: profileData.bio,
        languages: profileData.languages,
        workingPlan: profileData.working_plan,
        timezone: profileData.timezone,
        yearOfBirth: profileData.year_of_birth,
        placeOfBirth: profileData.place_of_birth,
        gender: profileData.gender,
        licenseNumber: profileData.license_number,
        licenseState: profileData.license_state,
        licenseIssuedDate: profileData.license_issued_date,
        licenseExpirationDate: profileData.license_expiration_date,
        registrationStatus: profileData.registration_status,
        registrationDate: profileData.registration_date,
        methodOfLicensure: profileData.method_of_licensure,
        medicalSchool: profileData.medical_school,
        graduationYear: profileData.graduation_year,
        degreeType: profileData.degree_type,
        primarySpecialty: profileData.primary_specialty,
        secondarySpecialty: profileData.secondary_specialty,
        boardCertifications: profileData.board_certifications,
        createdAt: profileData.created_at,
        updatedAt: profileData.updated_at
      };

      return res.json({
        status: 'success',
        profile: camelCaseProfile
      });
      
    } catch (error) {
      console.error('Failed to load provider profile:', error);
      return res.status(500).json({
        status: 'error',
        message: 'Failed to load profile',
        error: error.message
      });
    }
  });

  // POST (insert or update) provider profile
  app.post('/api/admin/provider/profile', async (req, res) => {
    const authResult = validateAuthToken(req, res);
    if (!authResult.success) {
      return res.status(401).json({ error: authResult.error });
    }

    try {
      const user = req.user; // Get full user object
      const connection = await pool.getConnection();

      // 1. Ensure user exists in users table - handle both Google and Nostr
      let userId;
      
      if (user.loginMethod === 'google' || user.oauthProvider === 'google') {
        // Google users: check if they exist
        const [userRows] = await connection.execute(
          `SELECT id FROM users WHERE id = ?`,
          [user.userId]
        );

        if (userRows.length === 0) {
          // User doesn't exist - create them as a provider (id_roles = 2)
          const [insertResult] = await connection.execute(
            `INSERT INTO users (id_roles, first_name, last_name, email) 
            VALUES (2, ?, ?, ?)`,
            [
              req.body.first_name || '',
              req.body.last_name || '',
              user.email || ''
            ]
          );
          userId = insertResult.insertId;
        } else {
          userId = userRows[0].id;
          
          // Update user role to provider if not already
          await connection.execute(
            `UPDATE users SET id_roles = 5 WHERE id = ? AND id_roles NOT IN (2, 5)`,
            [userId]
          );
        }
      } else {
        // Nostr users: look up by pubkey
        const [userRows] = await connection.execute(
          `SELECT id FROM users WHERE nostr_pubkey = ?`,
          [user.pubkey]
        );

        if (userRows.length === 0) {
          // User doesn't exist - create them as a provider (id_roles = 2)
          const [insertResult] = await connection.execute(
            `INSERT INTO users (nostr_pubkey, id_roles, first_name, last_name, email) 
            VALUES (?, 2, ?, ?, ?)`,
            [
              user.pubkey,
              req.body.first_name || '',
              req.body.last_name || '',
              req.body.email || ''
            ]
          );
          userId = insertResult.insertId;
        } else {
          userId = userRows[0].id;
          
          // Update user role to provider if not already
          await connection.execute(
            `UPDATE users SET id_roles = 5 WHERE id = ? AND id_roles NOT IN (2, 5)`,
            [userId]
          );
        }
      }

      // 2. Gather fields from body
      const {
        username,
        first_name,
        last_name,
        suffix,
        bio,
        license_number,
        license_state,
        license_issued_date,
        license_expiration_date,
        registration_status,
        registration_date,
        method_of_licensure,
        medical_school,
        graduation_year,
        degree_type,
        primary_specialty,
        secondary_specialty,
        board_certifications,
        year_of_birth,
        place_of_birth,
        gender,
        working_plan,
        timezone
      } = req.body;

      const toNull = (value) => value === undefined ? null : value;

      // 3. Upsert into provider_profiles (now we know userId exists)
      await connection.execute(
        `
        INSERT INTO provider_profiles (
          user_id, username, first_name, last_name, suffix, bio,
          license_number, license_state, license_issued_date, license_expiration_date,
          registration_status, registration_date, method_of_licensure,
          medical_school, graduation_year, degree_type,
          primary_specialty, secondary_specialty, board_certifications,
          year_of_birth, place_of_birth, gender, working_plan, timezone
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          username = VALUES(username),
          first_name = VALUES(first_name),
          last_name = VALUES(last_name),
          suffix = VALUES(suffix),
          bio = VALUES(bio),
          license_number = VALUES(license_number),
          license_state = VALUES(license_state),
          license_issued_date = VALUES(license_issued_date),
          license_expiration_date = VALUES(license_expiration_date),
          registration_status = VALUES(registration_status),
          registration_date = VALUES(registration_date),
          method_of_licensure = VALUES(method_of_licensure),
          medical_school = VALUES(medical_school),
          graduation_year = VALUES(graduation_year),
          degree_type = VALUES(degree_type),
          primary_specialty = VALUES(primary_specialty),
          secondary_specialty = VALUES(secondary_specialty),
          board_certifications = VALUES(board_certifications),
          year_of_birth = VALUES(year_of_birth),
          place_of_birth = VALUES(place_of_birth),
          gender = VALUES(gender),
          working_plan = VALUES(working_plan),
          timezone = VALUES(timezone)
        `,
        [
          userId,
          toNull(username),
          toNull(first_name),
          toNull(last_name),
          toNull(suffix),
          toNull(bio),
          toNull(license_number),
          toNull(license_state),
          toNull(license_issued_date),
          toNull(license_expiration_date),
          toNull(registration_status),
          toNull(registration_date),
          toNull(method_of_licensure),
          toNull(medical_school),
          toNull(graduation_year),
          toNull(degree_type),
          toNull(primary_specialty),
          toNull(secondary_specialty),
          toNull(board_certifications),
          toNull(year_of_birth),
          toNull(place_of_birth),
          toNull(gender),
          toNull(working_plan),
          toNull(timezone),
        ]
      );

      connection.release();
      return res.json({ status: 'success', message: 'Profile saved successfully' });
    } catch (error) {
      console.error('Failed to save provider profile:', error);
      return res.status(500).json({
        status: 'error',
        message: 'Failed to save profile',
        error: error.message,
      });
    }
  });

  // POST profile picture upload
  app.post('/api/admin/provider/profile-pic', async (req) => {
    const authResult = validateAuthToken(req);
    if (!authResult.success) {
      return new Response(JSON.stringify({ error: authResult.error }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    try {
      const user = authResult.user; // Get full user object instead of destructuring
      const connection = await pool.getConnection();

      // 1. Get user_id - handle both Google OAuth and Nostr users
      let userId;
      
      if (user.loginMethod === 'google' || user.oauthProvider === 'google') {
        // Google users: verify they're a provider
        const [userRows] = await connection.execute(
          `SELECT id FROM users WHERE id = ? AND id_roles IN (2, 5)`,
          [user.userId]
        );
        
        if (userRows.length === 0) {
          connection.release();
          return new Response(JSON.stringify({ error: 'Provider not found' }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' }
          });
        }
        
        userId = userRows[0].id;
      } else {
        // Nostr users: look up by pubkey
        const [userRows] = await connection.execute(
          `SELECT id FROM users WHERE nostr_pubkey = ? AND id_roles IN (2, 5)`,
          [user.pubkey]
        );
        
        if (userRows.length === 0) {
          connection.release();
          return new Response(JSON.stringify({ error: 'Provider not found' }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' }
          });
        }

        userId = userRows[0].id;
      }

      // 2. Parse multipart form data
      const formData = await req.formData();
      const file = formData.get('profile_pic');
      
      if (!file) {
        connection.release();
        return new Response(JSON.stringify({ error: 'No file uploaded' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // 3. Validate file type
      const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
      if (!allowedTypes.includes(file.type)) {
        connection.release();
        return new Response(JSON.stringify({ 
          error: 'Invalid file type. Only JPEG, PNG, and WebP allowed.' 
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // 4. Validate file size (5MB max)
      const maxSize = 5 * 1024 * 1024;
      if (file.size > maxSize) {
        connection.release();
        return new Response(JSON.stringify({ 
          error: 'File too large. Maximum size is 5MB.' 
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // 5. Generate unique filename
      const ext = file.name.split('.').pop();
      const filename = `user_${userId}_${Date.now()}.${ext}`;
      const filepath = `./uploads/profiles/${filename}`;
      const urlPath = `/api/admin/uploads/profiles/${filename}`;

      // 6. Ensure directory exists
      const fs = require('fs');
      const path = require('path');
      const uploadDir = path.join(process.cwd(), 'uploads', 'profiles');
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }

      // 7. Save file to disk
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      await Bun.write(filepath, buffer);

      // 8. Update database with file path
      await connection.execute(
        `INSERT INTO provider_profiles (user_id, profile_pic_url) 
        VALUES (?, ?)
        ON DUPLICATE KEY UPDATE profile_pic_url = VALUES(profile_pic_url)`,
        [userId, urlPath]
      );

      connection.release();

      return new Response(JSON.stringify({ 
        status: 'success',
        message: 'Profile picture uploaded successfully',
        url: urlPath
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });

    } catch (error) {
      console.error('Error uploading profile picture:', error);
      return new Response(JSON.stringify({ 
        error: 'Failed to upload profile picture',
        details: error.message 
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  });

  // GET profile picture (serves the file)
  app.get('/api/admin/uploads/profiles/:filename', async (req, res) => {
    try {
      const { filename } = req.params;
      const filepath = `./uploads/profiles/${filename}`;
      
      const file = Bun.file(filepath);
      const exists = await file.exists();
      
      if (!exists) {
        return res.status(404).json({ error: 'File not found' });
      }
      
      const ext = filename.split('.').pop().toLowerCase();
      const contentTypes = {
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'png': 'image/png',
        'webp': 'image/webp',
        'gif': 'image/gif'
      };
      
      return new Response(file, {
        headers: {
          'Content-Type': contentTypes[ext] || 'application/octet-stream',
          'Cache-Control': 'public, max-age=31536000'
        }
      });
    } catch (error) {
      console.error('Error serving profile pic:', error);
      return res.status(500).json({ error: 'Failed to serve file' });
    }
  });
};
import { pool } from '../config/database.js';
import { validateEvent, verifyEvent } from 'nostr-tools/pure';
import * as utils from '../utils/availability.js';
import { validateAuthToken } from '../middleware/auth.js';

// In-memory cache for login tokens (consider Redis for production)
const loginTokenCache = new Map();

const generateLoginToken = (pubkey) => {
  const token = Math.random().toString(36).substring(2, 15);
  loginTokenCache.set(token, {
    nostrPubkey: pubkey,
    expires: Date.now() + (5 * 60 * 1000) // 5 minutes
  });
  return token;
};

const createNewCustomer = async (connection, bookingData, signedEvent) => {
  console.log('🆕 Creating new customer user: ', connection, bookingData, signedEvent);
  // Create new customer user (existing code)
  const [customerRole] = await connection.execute(
    'SELECT id FROM roles WHERE slug = "customer"'
  );
  
  if (customerRole.length === 0) {
    throw new Error('Customer role not found');
  }

  const [customerResult] = await connection.execute(
    `INSERT INTO users (id_roles, first_name, last_name, email, phone_number, nostr_pubkey, create_datetime, update_datetime) 
    VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())`,
    [
      customerRole[0].id,
      bookingData.patientInfo.firstName,
      bookingData.patientInfo.lastName,
      bookingData.patientInfo.email || null,
      bookingData.patientInfo.phone || null,
      signedEvent.pubkey
    ]
  );
  
  let customerId = customerResult.insertId;
  console.log(`✅ Created new customer with ID: ${customerId}`);
  return customerId;
}

export const setupAppointmentRoutes = (app) => {
  // Create an appointment with Nostr signature verification
  app.post('/api/appointments/verify-booking', async (req, res) => {
    const { bookingData, signedEvent } = req.body;
  
    try {
      console.log('=== BOOKING VERIFICATION DEBUG ===');
      console.log('Received bookingData:', JSON.stringify(bookingData, null, 2));
      console.log('Received signedEvent:', JSON.stringify(signedEvent, null, 2));
      
      // 1. Verify the Nostr event signature
      if (!validateEvent(signedEvent) || !verifyEvent(signedEvent)) {
        console.log('❌ Signature validation failed');
        return res.status(400).json({ 
          status: 'error', 
          reason: 'Invalid signature' 
        });
      }
      console.log('✅ Signature validation passed');

      // 2. Verify the signed content matches the booking data
      const expectedContent = JSON.stringify(bookingData);
      console.log('Expected content:', expectedContent);
      console.log('Signed content:', signedEvent.content);
      console.log('Contents match:', expectedContent === signedEvent.content);
      
      if (signedEvent.content !== expectedContent) {
        console.log('❌ Content mismatch detected');
        return res.status(400).json({ 
          status: 'error', 
          reason: 'Signed content does not match booking data' 
        });
      }
      console.log('✅ Content verification passed');
      console.log('signedEvent pubkey bech32: ', utils.hexToBech32(signedEvent.pubkey));

      // 3. Create appointment using connection pool
      const connection = await pool.getConnection();
      
      try {
        await connection.beginTransaction();

        // Get the authenticated user from the token instead of assuming new customer
        const authResult = validateAuthToken(req, res);
        if (authResult && !authResult.success) {
          return authResult; // This will be the error response
        }

        let customerId;
        
        // First, try to get the customer ID from the authenticated user
        if (authResult && authResult.user && authResult.user.pubkey === signedEvent.pubkey) {
          // User is already authenticated and pubkeys match
          const [existingUser] = await connection.execute(
            'SELECT u.id FROM users u JOIN roles r ON u.id_roles = r.id WHERE u.nostr_pubkey = ? AND r.slug = "customer"',
            [signedEvent.pubkey]
          );
          
          if (existingUser.length > 0) {
            customerId = existingUser[0].id;
            console.log(`✅ Using authenticated customer with ID: ${customerId}`);
          } else {
            // throw new Error('Authenticated user not found or not a customer');
            customerId = await createNewCustomer(connection, bookingData, signedEvent);
          }
        } else {
          // Fallback: Check if customer exists or create new one (for unauthenticated bookings)
          const [existingCustomers] = await connection.execute(
            'SELECT u.id FROM users u JOIN roles r ON u.id_roles = r.id WHERE u.nostr_pubkey = ? AND r.slug = "customer"',
            [signedEvent.pubkey]
          );

          if (existingCustomers.length > 0) {
            customerId = existingCustomers[0].id;
            console.log(`✅ Found existing customer with ID: ${customerId}`);
          } else {
            customerId = await createNewCustomer(connection, bookingData, signedEvent);
          }
        }

        // Get service duration for end_datetime calculation
        const [serviceResult] = await connection.execute(
          'SELECT duration FROM services WHERE id = ?',
          [bookingData.serviceId]
        );
        
        if (serviceResult.length === 0) {
          throw new Error('Service not found');
        }

        const durationMinutes = serviceResult[0].duration;

        // Central Standard Time (CST) = UTC-6, Central Daylight Time (CDT) = UTC-5
        const centralTime = new Date(bookingData.startTime);
        
        const isDST = bookingData.isDST;
        console.log('isDST: ', isDST);

        const hoursToAdd = isDST ? 5 : 6; // CDT = +5, CST = +6
        
        const utcStartTime = new Date(centralTime.getTime() + (hoursToAdd * 60 * 60 * 1000)); // Add 6 hours for CST
        const utcEndTime = new Date(utcStartTime.getTime() + (durationMinutes * 60000));

        // Create appointment
        const roomId = utils.generateRoomId();
        const [appointmentResult] = await connection.execute(
          `INSERT INTO appointments (
            id_users_provider, id_users_customer, id_services, 
            start_datetime, end_datetime, notes, 
            book_datetime, create_datetime, update_datetime, hash, location
          ) VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW(), NOW(), ?, ?)`,
          [
            bookingData.providerId,
            customerId,
            bookingData.serviceId,
            utcStartTime.toISOString().slice(0, 19).replace('T', ' '),
            utcEndTime.toISOString().slice(0, 19).replace('T', ' '),
            bookingData.patientInfo.notes || null,
            Math.random().toString(36).substring(7), // Simple hash,
            roomId
          ]
        );

        await connection.commit();

        return res.json({ 
          status: 'OK',
          appointmentId: appointmentResult.insertId,
          roomId: roomId,
          message: 'Appointment created successfully'
        });
        
      } catch (dbError) {
        await connection.rollback();
        throw dbError;
      } finally {
        connection.release();
      }
      
    } catch (error) {
      console.error('Booking verification error:', error);
      return res.status(500).json({ 
        status: 'error', 
        reason: error.message || 'Verification failed' 
      });
    }
  });

  // Generate auto-login URL for dashboard
  app.post('/api/appointments/dashboard-login', validateAuthToken, async (req, res) => {
    try {
      const { pubkey } = req.user; // From validated JWT
      
      // Create a one-time login token for the handoff
      const loginToken = generateLoginToken(pubkey);
      
      // Return the login URL
      const loginUrl = `/providers_nostr/nostr_login?token=${loginToken}`;
      
      res.json({
        success: true,
        loginUrl: loginUrl
      });
      
    } catch (error) {
      console.error('Dashboard login error:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Internal server error' 
      });
    }
  });

  // Validate login token
  app.post('/api/appointments/validate-login-token', async (req, res) => {
    try {
      const { token } = req.body;
      
      const tokenData = loginTokenCache.get(token);
      if (!tokenData || tokenData.expires < Date.now()) {
        return res.status(401).json({ error: 'Invalid or expired token' });
      }

      // Remove token (one-time use)
      loginTokenCache.delete(token);

      // Get provider's credentials
      const connection = await pool.getConnection();
      
      const [rows] = await connection.execute(
        'SELECT id, email, first_name, last_name FROM users WHERE nostr_pubkey = ? AND id_roles = 2',
        [tokenData.nostrPubkey]
      );
      
      connection.release();
      
      if (rows.length === 0) {
        return res.status(404).json({ error: 'Provider not found' });
      }

      res.json({
        success: true,
        provider: {
          id: rows[0].id,
          email: rows[0].email,
          firstName: rows[0].first_name,
          lastName: rows[0].last_name
        }
      });

    } catch (error) {
      console.error('Token validation error:', error);
      res.status(500).json({ error: 'Token validation failed' });
    }
  });

  // get upcoming appointments for a given provider
  app.get('/api/admin/appointments', async (req, res) => {
    const authResult = validateAuthToken(req, res);
    if (authResult && !authResult.success) {
      return authResult;
    }

    let connection;
    try {
      console.log('req:', req, 'user: ', req.user);
      const user = req.user;
      
      connection = await pool.getConnection();
      
      let providerId;
      
      if (user.loginMethod === 'google' || user.oauthProvider === 'google') {
        const [providerRows] = await connection.execute(`
          SELECT id FROM users WHERE id = ? AND id_roles IN (2, 5)
        `, [user.userId]);
        
        if (providerRows.length === 0) {
          // ✅ No manual release - let finally handle it
          return res.status(404).json({
            status: 'error',
            message: 'Provider not found'
          });
        }
        
        providerId = providerRows[0].id;
      } else {
        const [providerRows] = await connection.execute(`
          SELECT id FROM users WHERE nostr_pubkey = ? AND id_roles IN (2, 5)
        `, [user.pubkey]);
        
        if (providerRows.length === 0) {
          // ✅ No manual release - let finally handle it
          return res.status(404).json({
            status: 'error',
            message: 'Provider not found'
          });
        }
        
        providerId = providerRows[0].id;
      }
      
      const [appointments] = await connection.execute(`
        SELECT 
          a.id,
          a.start_datetime,
          a.end_datetime,
          a.notes,
          a.status,
          a.location,
          s.name as service_name,
          s.duration as service_duration,
          s.color as service_color,
          CONCAT(c.first_name, ' ', c.last_name) as customer_name,
          c.email as customer_email,
          c.phone_number as customer_phone,
          i.status as invoice_status,
          i.amount_sats as invoice_amount
        FROM appointments a
        LEFT JOIN services s ON a.id_services = s.id
        LEFT JOIN users c ON a.id_users_customer = c.id
        LEFT JOIN invoices i ON a.id = i.appointment_id
        WHERE a.id_users_provider = ?
        ORDER BY a.start_datetime ASC
      `, [providerId]);
      
      return res.json({
        status: 'success',
        appointments: appointments
      });
      
    } catch (error) {
      console.error('Failed to fetch appointments:', error);
      return res.status(500).json({
        status: 'error',
        message: 'Failed to fetch appointments',
        error: error.message
      });
    } finally {
      if (connection) connection.release();
    }
  });

  // Get completed appointments for billing
  app.get('/api/admin/appointments/completed/:providerId', async (req, res) => {
    const authResult = validateAuthToken(req, res);
    if (authResult && !authResult.success) {
      return authResult; // This will be the error response
    }
    
    let connection;
    try {
      const { providerId } = req.params;

      connection = await pool.getConnection();

      const [appointments] = await connection.execute(`
        SELECT 
          a.id,
          a.start_datetime,
          a.end_datetime,
          a.id_services,
          a.id_users_customer,
          a.id_users_provider,
          CONCAT(c.first_name, ' ', c.last_name) as customer_name,
          c.email as customer_email,
          s.name as service_name,
          s.price as service_price,
          s.duration as service_duration
        FROM appointments a
        JOIN users c ON a.id_users_customer = c.id
        JOIN services s ON a.id_services = s.id
        WHERE a.id_users_provider = ?
          AND a.end_datetime < NOW()
          AND a.is_unavailability = 0
        ORDER BY a.start_datetime DESC
        LIMIT 50
      `, [providerId]);

      return res.json({
        status: 'success',
        appointments: appointments
      });

    } catch (error) {
      console.error('Error fetching past appointments:', error);
      return res.status(500).json({
        status: 'error',
        message: 'Failed to fetch past appointments'
      });
    } finally {
      if (connection) connection.release();
    }
  });

  // Mark appointment as invoiced
  app.post('/api/admin/appointments/:id/invoice', async (req, res) => {
    const authResult = validateAuthToken(req, res);
    if (authResult && !authResult.success) {
      return authResult; // This will be the error response
    }

    try {
      const { id } = req.params;
      const { payment_request, amount_sats, invoice_hash } = req.body;
      
      const connection = await pool.getConnection();
      
      // First check if appointment exists and is not already invoiced
      const [existingInvoices] = await connection.execute(
        'SELECT id FROM invoices WHERE appointment_id = ?',
        [id]
      );
      
      if (existingInvoices.length > 0) {
        connection.release();
        return res.status(400).json({
          status: 'error',
          message: 'Appointment already invoiced'
        });
      }
      
      // Create invoice record
      const [result] = await connection.execute(`
        INSERT INTO invoices (
          appointment_id,
          payment_request,
          amount_sats,
          invoice_hash,
          status,
          created_at
        ) VALUES (?, ?, ?, ?, 'pending', NOW())
      `, [id, payment_request, amount_sats, invoice_hash]);
      
      connection.release();
      
      return res.json({
        status: 'success',
        message: 'Invoice created successfully',
        invoice_id: result.insertId
      });
      
    } catch (error) {
      console.error('Failed to create invoice:', error);
      return res.status(500).json({
        status: 'error',
        message: 'Failed to create invoice',
        error: error.message
      });
    }
  });
};
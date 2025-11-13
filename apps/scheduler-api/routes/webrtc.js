const { generateRoomId } = require('../utils/availability');
const sessionManager = require('../utils/webrtc-session-management');
const { pool } = require('../config/database');
const { timeCheck } = require('../utils/availability');
const { authenticateSession, getUserIdentifier } = require('../middleware/auth');

const BASE_URL = process.env.BASE_URL || 'https://plebdoc.com';

// In-memory storage for signaling (use Redis in production)
const sseConnections = new Map(); // roomId -> Set of SSE response objects

export function setupWebRTCRoutes(app) {

  // Endpoint to create a new appointment/room
  app.post('/api/appointments/create', async (req, res) => {
    try {
      // Authenticate user (no guest access for creating appointments)
      const authResult = authenticateSession(req);
      if (!authResult.success) {
        return res.status(401).json({
          success: false,
          error: authResult.error || 'Authentication required'
        });
      }

      const { sessionId, authMethod } = authResult.user;
      console.log(`Creating appointment - User: ${authMethod} - ${sessionId}`);

      const { doctorName, appointmentTime, notes } = req.body;
      const roomId = generateRoomId();
      
      // Store appointment in your system (database, memory, etc.)
      // For now, just return the room ID
      return res.json({
        success: true,
        roomId,
        doctorName,
        appointmentTime,
        webrtcUrl: `${BASE_URL}/api/webrtc/rooms/${roomId}`,
        message: `Appointment room created: ${roomId}`
      });
    } catch (error) {
      console.error('Error creating appointment:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to create appointment'
      });
    }
  });

  // Endpoint for testing room generation
  app.get('/api/patients/appointments', async (req, res) => {
    let connection;

    console.log(`=== GET PATIENT APPOINTMENTS ===`);
    console.log(`Timestamp: ${new Date().toISOString()}`);
    
    try {
      // Authenticate user (no guest access for this endpoint)
      const authResult = authenticateSession(req);
      if (!authResult.success) {
        return res.status(401).json({
          success: false,
          error: authResult.error || 'Authentication required'
        });
      }

      const { sessionId, authMethod, metadata } = authResult.user;
      console.log(`Authenticated user: ${authMethod} - ${sessionId}`);

      // For now, only Nostr users have appointments (OAuth coming later)
      if (authMethod !== 'nostr') {
        return res.status(400).json({
          success: false,
          error: 'Only Nostr-authenticated users can access appointments currently'
        });
      }

      const pubkey = metadata.pubkey;
      
      connection = await pool.getConnection();

      // First, get the user ID from the pubkey
      const [userRows] = await connection.execute(`
        SELECT id FROM users WHERE nostr_pubkey = ?
      `, [pubkey]);

      if (userRows.length === 0) {
        connection.release();
        return res.status(403).json({
          success: false,
          error: 'User not found for this pubkey'
        });
      }

      const userId = userRows[0].id;

      // Now get appointments for this user ID
      const [rows] = await connection.execute(`
        SELECT 
          a.id,
          a.start_datetime,
          a.end_datetime,
          a.location,
          a.notes,
          a.status,
          a.create_datetime,
          doctor.first_name as doctor_first_name,
          doctor.last_name as doctor_last_name,
          doctor.email as doctor_email,
          doctor.timezone as doctor_timezone,
          s.name as service_name,
          s.duration as service_duration
        FROM appointments a 
        JOIN users doctor ON doctor.id = a.id_users_provider
        LEFT JOIN services s ON s.id = a.id_services
        WHERE a.id_users_customer = ?
        ORDER BY a.start_datetime ASC
      `, [userId]);

      // Format the response...
      const appointments = rows.map(appointment => ({
        id: appointment.id,
        datetime: appointment.start_datetime,
        location: appointment.location,
        notes: appointment.notes,
        status: appointment.status,
        createdAt: appointment.created_at,
        doctor: {
          firstName: appointment.doctor_first_name,
          lastName: appointment.doctor_last_name,
          email: appointment.doctor_email,
          timezone: appointment.doctor_timezone
        },
        service: appointment.service_name ? {
          name: appointment.service_name,
          duration: appointment.service_duration
        } : null,
        isVideoAppointment: appointment.location === 'bright-dolphin-swimming',
        videoRoomUrl: appointment.location === 'bright-dolphin-swimming' 
          ? `${process.env.BASE_URL}/video-call?room=${appointment.location}`
          : null
      }));

      console.log(`Found ${rows.length} appointments for patient ${userId} (pubkey: ${pubkey})`);

      connection.release();

      return res.json({
        success: true,
        appointments: appointments,
        count: appointments.length
      });

    } catch (error) {
      if (connection) connection.release();
      
      console.error('Error fetching patient appointments:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch appointments'
      });
    }
  });

  // Endpoint for testing room generation
  app.get('/api/appointments/generate-room', async (req, res) => {
    try {
      // Authenticate user
      const authResult = authenticateSession(req);
      if (!authResult.success) {
        return res.status(401).json({
          success: false,
          error: authResult.error || 'Authentication required'
        });
      }

      const roomId = generateRoomId();
      
      return res.json({
        success: true,
        roomId,
        webrtcUrl: `${BASE_URL}/api/webrtc/rooms/${roomId}`
      });
    } catch (error) {
      console.error('Error generating room:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to generate room'
      });
    }
  });
  
  app.post('/api/webrtc/rooms/:roomId/join', async (req, res) => {
    const { roomId } = req.params;
    const isGuest = req.query.guest === 'true';
    let connection;
    
    console.log(`=== JOIN ROOM REQUEST ===`);
    console.log(`Room ID: ${roomId}`);
    console.log(`Is guest param: ${isGuest}`);
    console.log(`Timestamp: ${new Date().toISOString()}`);
    
    try {
      // Get user identifier (handles both auth and guest)
      const identityResult = await getUserIdentifier(req, isGuest);
      
      if (identityResult.error) {
        return res.status(identityResult.status || 403).json({
          success: false,
          error: identityResult.error
        });
      }
      
      const { userIdentifier, user } = identityResult;
      if (user) req.user = user; // Set req.user for downstream use
      
      console.log(`User identifier: ${userIdentifier}`);
      
      connection = await pool.getConnection();
      let rows;

      /*
      If you're going to assign generated Nostr keypairs to OAuth users anyway, you could simplify the whole thing:
        javascriptif (user) {
          // All users (Nostr + OAuth with generated keys) lookup by user.id
          const userId = user.metadata.userId || user.metadata.id; // Adapt based on your JWT structure
          
          [rows] = await connection.execute(`
            SELECT a.*, u.timezone, u.nostr_pubkey 
            FROM appointments a 
            JOIN users u ON (u.id = a.id_users_provider OR u.id = a.id_users_customer)
            WHERE a.location = ? AND u.id = ?
          `, [roomId, userId]);
        } else {
          // Guest path...
        }
      */
      if (user) {
        // Authenticated user - check they're authorized for this specific room
        if (user.authMethod === 'nostr') {
          // Nostr users: lookup by nostr_pubkey
          [rows] = await connection.execute(`
            SELECT a.*, u.nostr_pubkey, u.timezone 
            FROM appointments a 
            JOIN users u ON (u.id = a.id_users_provider OR u.id = a.id_users_customer)
            WHERE a.location = ? AND u.nostr_pubkey = ?
          `, [roomId, user.metadata.pubkey]);
        } else if (user.authMethod === 'oauth') {
          // OAuth users: lookup by user ID
          const userId = user.metadata.userId;
          [rows] = await connection.execute(`
            SELECT a.*, u.timezone 
            FROM appointments a 
            JOIN users u ON (u.id = a.id_users_provider OR u.id = a.id_users_customer)
            WHERE a.location = ? AND u.id = ?
          `, [roomId, userId]);
        } else {
          connection.release();
          return res.status(400).json({ 
            success: false,
            error: 'Unsupported authentication method' 
          });
        }
      } else {
        // Guest - just verify the room exists (already validated)
        [rows] = await connection.execute(`
          SELECT a.*, u.nostr_pubkey, u.timezone 
          FROM appointments a 
          JOIN users u ON (u.id = a.id_users_provider OR u.id = a.id_users_customer)
          WHERE a.location = ?
          LIMIT 1
        `, [roomId]);
      }

      const isAuthorized = rows.length > 0;
      console.log('Checking appointment rows: ', rows);
      const timeCheckResult = isAuthorized ? timeCheck(rows[0].start_datetime, rows[0].timezone) : false;
      console.log('Time check result: ', timeCheckResult);
      
      if (!isAuthorized) {
        connection.release();
        console.error('Error, not authorized for room: ', roomId, userIdentifier);
        return res.status(403).json({ error: 'Not authorized for this room' });
      }
      
      const room = sessionManager.getRoom(roomId);
      let shouldInitiateOffer = false;
      
      if (room) {
        const currentlyConnectedParticipants = Array.from(room.participants.values())
          .filter(p => p.status === 'connected' && p.pubkey !== userIdentifier);
        
        const connectedCount = currentlyConnectedParticipants.length;
        console.log(`Currently connected participants (excluding joiner): ${connectedCount}`);
        
        if (connectedCount > 0) {
          shouldInitiateOffer = false;
          console.log(`🔥 ROLE ASSIGNMENT: ${userIdentifier} will be ANSWERER (existing connected participants found)`);
        } else {
          shouldInitiateOffer = true;
          console.log(`🔥 ROLE ASSIGNMENT: ${userIdentifier} will be CALLER (first connected participant)`);
        }
      } else {
        shouldInitiateOffer = true;
        console.log(`🔥 ROLE ASSIGNMENT: ${userIdentifier} will be CALLER (new room, first participant)`);
      }

      const joinResult = sessionManager.handleParticipantJoin(roomId, userIdentifier);
      console.log(`Join result:`, joinResult);
      console.log(`Should initiate offer: ${shouldInitiateOffer}`);
      console.log(`Is rejoin: ${joinResult.isRejoin}`);
      
      broadcastParticipantCount(roomId);
      connection.release();
      console.log(`=== JOIN ROOM REQUEST COMPLETED ===`);

      return res.json({ 
        status: 'joined',
        participants: joinResult.participantCount,
        roomInfo: joinResult.roomInfo,
        shouldInitiateOffer: shouldInitiateOffer
      });
      
    } catch (error) {
      if (connection) connection.release();
      console.error('Error in WebRTC join:', error);
      return res.status(500).json({ error: 'Failed to join room' });
    }
  });

  app.post('/api/webrtc/rooms/:roomId/leave', async (req, res) => {
    const { roomId } = req.params;
    const isGuest = req.query.guest === 'true';
    
    console.log(`=== LEAVE ROOM REQUEST ===`);
    console.log(`Room ID: ${roomId}`);
    console.log(`Is guest param: ${isGuest}`);
    console.log(`Timestamp: ${new Date().toISOString()}`);
    
    try {
      // Get user identifier (handles both auth and guest)
      const identityResult = await getUserIdentifier(req, isGuest);
      
      if (identityResult.error) {
        return res.status(identityResult.status || 403).json({
          success: false,
          error: identityResult.error
        });
      }
      
      const { userIdentifier } = identityResult;
      console.log(`User identifier: ${userIdentifier}`);
      
      const leaveResult = sessionManager.handleParticipantLeave(roomId, userIdentifier);
      
      console.log(`Leave result:`, leaveResult);
      console.log('About to broadcast for roomId:', roomId, 'type:', typeof roomId);
      
      broadcastParticipantCount(roomId);

      console.log(`=== LEAVE ROOM REQUEST COMPLETED ===`);
      return res.json({ 
        status: 'left',
        participants: leaveResult.participantCount,
        roomExpiration: leaveResult.roomExpiration
      });
    } catch (error) {
      console.error('Error in WebRTC leave:', error);
      return res.status(500).json({ error: 'Failed to leave room' });
    }
  });

  app.post('/api/webrtc/rooms/:roomId/reset-connection', async (req, res) => {
    const { roomId } = req.params;
    const isGuest = req.query.guest === 'true';
    
    try {
      // Get user identifier (handles both auth and guest)
      const identityResult = await getUserIdentifier(req, isGuest);
      
      if (identityResult.error) {
        return res.status(identityResult.status || 403).json({
          success: false,
          error: identityResult.error
        });
      }
      
      const { userIdentifier } = identityResult;
      console.log(`🔄 CONNECTION RESET REQUEST - Room: ${roomId}, User: ${userIdentifier}`);
      
      const room = sessionManager.getRoom(roomId);
      if (room) {
        console.log(`   Had pending offer: ${!!room.pendingOffer}`);
        console.log(`   Had pending answer: ${!!room.pendingAnswer}`);
        console.log(`   ICE candidates count: ${room.iceCandidates?.length || 0}`);
        console.log(`   Participants count: ${room.participants?.size || 0}`);

        // Clear all connection state but keep participants
        delete room.pendingOffer;
        delete room.pendingAnswer;
        room.iceCandidates = [];
        
        console.log(`✅ Connection reset for room ${roomId}`);
      } else {
        console.log(`⚠️ Room ${roomId} not found for reset`);
      }
      
      return res.json({ status: 'connection-reset' });
    } catch (error) {
      console.error('Error resetting connection:', error);
      return res.status(500).json({ error: 'Failed to reset connection' });
    }
  });

  app.post('/api/webrtc/rooms/:roomId/offer', async (req, res) => {
    const { roomId } = req.params;
    const { offer } = req.body;
    const isGuest = req.query.guest === 'true';
    
    try {
      // Get user identifier (handles both auth and guest)
      const identityResult = await getUserIdentifier(req, isGuest);
      
      if (identityResult.error) {
        return res.status(identityResult.status || 403).json({
          success: false,
          error: identityResult.error
        });
      }
      
      const { userIdentifier } = identityResult;
      
      const room = sessionManager.getRoom(roomId);
      if (!room) {
        return res.status(404).json({ error: 'Room not found' });
      }
      
      const hadPreviousOffer = !!room.pendingOffer;
      if (hadPreviousOffer) {
        const previousOfferAge = Date.now() - room.pendingOffer.timestamp;
        console.log(`⚠️ OVERWRITING EXISTING OFFER - Room: ${roomId}`);
        console.log(`   Previous offer from: ${room.pendingOffer.from}`);
        console.log(`   Previous offer age: ${Math.round(previousOfferAge/1000)}s`);
        console.log(`   New offer from: ${userIdentifier}`);
      } else {
        console.log(`📤 NEW OFFER CREATED - Room: ${roomId}, from: ${userIdentifier}`);
      }

      sessionManager.setOffer(roomId, offer, userIdentifier);
      return res.json({ status: 'offer-sent' });
    } catch (error) {
      console.error('Error sending offer:', error);
      return res.status(500).json({ error: 'Failed to send offer' });
    }
  });

  app.get('/api/webrtc/rooms/:roomId/offer', async (req, res) => {
    const { roomId } = req.params;
    const isGuest = req.query.guest === 'true';
    
    try {
      // Get user identifier (handles both auth and guest)
      const identityResult = await getUserIdentifier(req, isGuest);
      
      if (identityResult.error) {
        return res.status(identityResult.status || 403).json({
          success: false,
          error: identityResult.error
        });
      }
      
      const { userIdentifier } = identityResult;
      
      const room = sessionManager.getRoom(roomId);

      if (room?.pendingOffer) {
        const offerAge = Date.now() - room.pendingOffer.timestamp;
        console.log(`📤 GET OFFER - Room: ${roomId}, User: ${userIdentifier}`);
        console.log(`   Offer age: ${offerAge}ms (${Math.round(offerAge/1000)}s)`);
        console.log(`   Offer from: ${room.pendingOffer.from}`);
        console.log(`   Offer timestamp: ${new Date(room.pendingOffer.timestamp).toISOString()}`);
        
        if (offerAge > 30000) {
          console.warn(`⚠️ STALE OFFER DETECTED: ${Math.round(offerAge/1000)}s old`);
        }
      } else {
        console.log(`📤 GET OFFER - Room: ${roomId}, User: ${userIdentifier} - No offer available`);
      }

      return res.json({ offer: room?.pendingOffer || null });
    } catch (error) {
      console.error('Error getting offer:', error);
      return res.status(500).json({ error: 'Failed to get offer' });
    }
  });

  app.post('/api/webrtc/rooms/:roomId/answer', async (req, res) => {
    const { roomId } = req.params;
    const { answer } = req.body;
    const isGuest = req.query.guest === 'true';

    try {
      // Get user identifier (handles both auth and guest)
      const identityResult = await getUserIdentifier(req, isGuest);
      
      if (identityResult.error) {
        return res.status(identityResult.status || 403).json({
          success: false,
          error: identityResult.error
        });
      }
      
      const { userIdentifier } = identityResult;

      const room = sessionManager.getRoom(roomId);
      if (!room) {
        return res.status(404).json({ error: 'Room not found' });
      }

      const hadPreviousAnswer = !!room.pendingAnswer;
      if (hadPreviousAnswer) {
        const previousAnswerAge = Date.now() - room.pendingAnswer.timestamp;
        console.log(`⚠️ OVERWRITING EXISTING ANSWER - Room: ${roomId}`);
        console.log(`   Previous answer from: ${room.pendingAnswer.from}`);
        console.log(`   Previous answer age: ${Math.round(previousAnswerAge/1000)}s`);
        console.log(`   New answer from: ${userIdentifier}`);
      } else {
        console.log(`📥 NEW ANSWER CREATED - Room: ${roomId}, from: ${userIdentifier}`);
      }

      room.pendingAnswer = { answer, from: userIdentifier, timestamp: Date.now() };
      
      return res.json({ status: 'answer-sent' });
    } catch (error) {
      console.error('Error sending answer:', error);
      return res.status(500).json({ error: 'Failed to send answer' });
    }
  });

  app.get('/api/webrtc/rooms/:roomId/answer', async (req, res) => {
    const { roomId } = req.params;
    const isGuest = req.query.guest === 'true';
    
    try {
      // Get user identifier (handles both auth and guest)
      const identityResult = await getUserIdentifier(req, isGuest);
      
      if (identityResult.error) {
        return res.status(identityResult.status || 403).json({
          success: false,
          error: identityResult.error
        });
      }
      
      const { userIdentifier } = identityResult;
      
      const room = sessionManager.getRoom(roomId);

      if (room?.pendingAnswer) {
        const answerAge = Date.now() - room.pendingAnswer.timestamp;
        console.log(`📥 GET ANSWER - Room: ${roomId}, User: ${userIdentifier}`);
        console.log(`   Answer age: ${answerAge}ms (${Math.round(answerAge/1000)}s)`);
        console.log(`   Answer from: ${room.pendingAnswer.from}`);
        console.log(`   Answer timestamp: ${new Date(room.pendingAnswer.timestamp).toISOString()}`);
        
        if (answerAge > 30000) {
          console.warn(`⚠️ STALE ANSWER DETECTED: ${Math.round(answerAge/1000)}s old`);
        }
      } else {
        console.log(`📥 GET ANSWER - Room: ${roomId}, User: ${userIdentifier} - No answer available`);
      }

      return res.json({ answer: room?.pendingAnswer || null });
    } catch (error) {
      console.error('Error getting answer:', error);
      return res.status(500).json({ error: 'Failed to get answer' });
    }
  });

  app.post('/api/webrtc/rooms/:roomId/ice-candidate', async (req, res) => {
    const { roomId } = req.params;
    const { candidate } = req.body;
    const isGuest = req.query.guest === 'true';
    
    try {
      // Get user identifier (handles both auth and guest)
      const identityResult = await getUserIdentifier(req, isGuest);
      
      if (identityResult.error) {
        return res.status(identityResult.status || 403).json({
          success: false,
          error: identityResult.error
        });
      }
      
      const { userIdentifier } = identityResult;
      
      const room = sessionManager.getRoom(roomId);
      if (!room) {
        return res.status(404).json({ error: 'Room not found' });
      }
      
      if (!room.iceCandidates) room.iceCandidates = [];

      console.log(`🧊 ICE CANDIDATE ADDED - Room: ${roomId}`);
      console.log(`   From: ${userIdentifier}`);
      console.log(`   Total candidates in room: ${room.iceCandidates.length + 1}`);

      room.iceCandidates.push({ candidate, from: userIdentifier, timestamp: Date.now() });
      
      return res.json({ status: 'ice-candidate-sent' });
    } catch (error) {
      console.error('Error sending ICE candidate:', error);
      return res.status(500).json({ error: 'Failed to send ICE candidate' });
    }
  });

  app.get('/api/webrtc/rooms/:roomId/ice-candidates', async (req, res) => {
    const { roomId } = req.params;
    const isGuest = req.query.guest === 'true';
    
    try {
      // Get user identifier (handles both auth and guest)
      const identityResult = await getUserIdentifier(req, isGuest);
      
      if (identityResult.error) {
        return res.status(identityResult.status || 403).json({
          success: false,
          error: identityResult.error
        });
      }
      
      const { userIdentifier } = identityResult;

      const room = sessionManager.getRoom(roomId);
      
      if (!room || !room.iceCandidates) {
        return res.json({ candidates: [] });
      }
      
      // Return candidates from other participants
      const candidates = room.iceCandidates.filter(ic => ic.from !== userIdentifier);
      
      console.log(`🧊 GET ICE CANDIDATES - Room: ${roomId}`);
      console.log(`   Requesting user: ${userIdentifier}`);
      console.log(`   Total candidates in room: ${room.iceCandidates.length}`);
      console.log(`   Candidates being returned: ${candidates.length}`);
      
      if (candidates.length > 0) {
        console.log(`   Candidate details:`);
        candidates.forEach((c, i) => {
          const age = Date.now() - c.timestamp;
          console.log(`     [${i}] from: ${c.from}, age: ${Math.round(age/1000)}s`);
          if (age > 60000) {
            console.warn(`     ⚠️ OLD CANDIDATE: ${Math.round(age/1000)}s`);
          }
        });
      }

      return res.json({ candidates });
    } catch (error) {
      console.error('Error getting ICE candidates:', error);
      return res.status(500).json({ error: 'Failed to get ICE candidates' });
    }
  });

  /* 
  * For SSE (Server-Sent Events), the token is passed as a query parameter because browsers 
  * can't send custom headers with EventSource connections.
  */
  app.get('/api/webrtc/rooms/:roomId/events', async (req, res) => {
    console.log('/api/webrtc/rooms/:roomId/events, roomId:', req.params.roomId);

    const { roomId } = req.params;
    const isGuest = req.query.guest === 'true';
    
    try {
      // For SSE, extract token from query param and temporarily set it in headers
      if (!isGuest && req.query.token) {
        req.headers.authorization = `Bearer ${req.query.token}`;
      }
      
      // Get user identifier (handles both auth and guest)
      const identityResult = await getUserIdentifier(req, isGuest);
      
      if (identityResult.error) {
        return new Response(JSON.stringify({
          success: false,
          error: identityResult.error
        }), {
          status: identityResult.status || 403,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      const { userIdentifier } = identityResult;
      console.log(`📡 SSE Connection - Room: ${roomId}, User: ${userIdentifier}`);
      
      let controller;
      let connectionData;
      
      const stream = new ReadableStream({
        start(controllerRef) {
          controller = controllerRef;
          
          // Send initial participant count
          const room = sessionManager.getRoom(roomId);
          const participantCount = room ? Array.from(room.participants.values()).filter(p => p.status === 'connected').length : 0;
          
          const initialMessage = `data: ${JSON.stringify({ type: 'participant_count', count: participantCount })}\n\n`;
          controller.enqueue(new TextEncoder().encode(initialMessage));

          if (!sseConnections.has(roomId)) {
            sseConnections.set(roomId, new Set());
          }
          
          connectionData = { controller, closed: false, createdAt: Date.now(), userIdentifier };
          sseConnections.get(roomId).add(connectionData);
          
          console.log(`Added SSE connection for ${userIdentifier}, total connections: ${sseConnections.get(roomId).size}`);
        },
        cancel() {
          console.log(`ReadableStream cancelled - cleaning up connection for ${userIdentifier}`);
          if (connectionData) {
            connectionData.closed = true;
            const roomConnections = sseConnections.get(roomId);
            if (roomConnections) {
              roomConnections.delete(connectionData);
              if (roomConnections.size === 0) {
                sseConnections.delete(roomId);
              }
            }
          }
        }
      });

      return new Response(stream, {
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Cache-Control'
        }
      });
    } catch (error) {
      console.error('Error in SSE events route:', error);
      return new Response(JSON.stringify({ 
        status: 'error', 
        reason: 'Failed to establish SSE connection' 
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  });

  function broadcastParticipantCount(roomId) {
    console.log('=== BROADCAST PARTICIPANT COUNT START ===')
    console.log('Input roomId:', roomId, 'type:', typeof roomId);

    const room = sessionManager.getRoom(roomId);
    console.log('Room from sessionManager:', room ? 'EXISTS' : 'NULL');
    
    const participantCount = room ? Array.from(room.participants.values()).filter(p => p.status === 'connected').length : 0;
    console.log('Calculated participantCount:', participantCount);
    
    const connections = sseConnections.get(roomId);
    console.log('SSE connections for room:', connections ? connections.size : 'NO_CONNECTIONS');
    
    if (connections && connections.size > 0) {
      const message = `data: ${JSON.stringify({ type: 'participant_count', count: participantCount })}\n\n`;
      console.log('Message to broadcast:', message);
      
      connections.forEach(connectionData => {
        try {
          if (!connectionData.closed && connectionData.controller) {
            connectionData.controller.enqueue(new TextEncoder().encode(message));
          }
        } catch (error) {
          console.error('Error writing to SSE connection:', error);
          connectionData.closed = true;
          connections.delete(connectionData);
        }
      });
      console.log(`📡 Broadcasted participant count (${participantCount}) to ${connections.size} connected admin(s)`);
    } else {
      console.log('No SSE connections to broadcast to');
    }
    console.log('=== BROADCAST PARTICIPANT COUNT END ===');
  }

  console.log('WebRTC signaling routes initialized');
}
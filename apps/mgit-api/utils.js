const { bech32 } = require('bech32');

/* hex and bech32 helper functions */
function hexToBech32(hexStr, hrp = 'npub') {
  // Validate hex input
  if (!/^[0-9a-fA-F]{64}$/.test(hexStr)) {
    throw new Error('Invalid hex format for Nostr public key');
  }
  
  const bytes = Buffer.from(hexStr, 'hex');
  const words = bech32.toWords(bytes);
  return bech32.encode(hrp, words);
}

function bech32ToHex(bech32Str) {
  const decoded = bech32.decode(bech32Str);
  const bytes = bech32.fromWords(decoded.words);
  if (bytes.length !== 32) throw new Error('Invalid public key length');
  return Buffer.from(bytes).toString('hex');
}

/**
 * Authentication utilities for handling various token formats
 * including double-encoded Basic Auth from go-git clients
 */

/**
 * Extracts JWT token from Authorization header, handling multiple formats:
 * - Bearer tokens: "Bearer eyJhbGciOiJIUzI1NiIs..."
 * - Basic Auth: "Basic base64(username:token)"
 * - Double-encoded Basic Auth (go-git bug): "Basic base64(:Basic base64(:token))"
 * 
 * @param {string} authHeader - The Authorization header value
 * @returns {object} - { success: boolean, token: string|null, error: string|null }
 */
function extractTokenFromAuthHeader(authHeader) {
  if (!authHeader) {
    return {
      success: false,
      token: null,
      error: 'No authorization header provided'
    };
  }

  let token = null;
  // console.log('extractTokenFromAuthHeader: ', authHeader);
  try {
    // Handle Bearer token (standard format)
    if (authHeader.startsWith('Bearer ')) {
      // console.log('✅ Bearer token detected');
      token = authHeader.split(' ')[1];
      return {
        success: true,
        token: token,
        error: null
      };
    }
    
    // Handle Basic Auth (for go-git compatibility)
    else if (authHeader.startsWith('Basic ')) {
      console.log('✅ Basic Auth detected');
      
      const base64Credentials = authHeader.split(' ')[1];
      const credentials = Buffer.from(base64Credentials, 'base64').toString('ascii');
      const [username, password] = credentials.split(':');
      
      console.log('Basic Auth username:', username);
      console.log('Basic Auth password length:', password?.length || 0);
      
      // Check for double-encoded Basic Auth (go-git bug)
      if (credentials.startsWith('Basic ')) {
        console.log('🔧 Detected double-encoded Basic Auth, fixing...');
        // Extract the inner base64 part
        const innerBase64 = credentials.substring(6); // Remove "Basic "
        const innerCredentials = Buffer.from(innerBase64, 'base64').toString('ascii');
        const [innerUsername, innerPassword] = innerCredentials.split(':');
        token = innerPassword;
        console.log('🔧 Using inner JWT token from double-encoded auth');
      } else {
        // "Normal" Basic Auth but password might still have "Basic " prefix due to go-git double-encoding
        if (password && password.startsWith('Basic ')) {
          token = password.substring(6); // Remove "Basic " prefix
          console.log('🔧 Removed Basic prefix from password field, using JWT token');
        } else {
          token = password;
          console.log('Using password as JWT token');
        }
      }
      
      return {
        success: true,
        token: token,
        error: null
      };
    }
    
    // Unknown format
    else {
      console.log('❌ Unknown auth format');
      return {
        success: false,
        token: null,
        error: 'Invalid authentication format. Use Bearer or Basic Auth.'
      };
    }
    
  } catch (error) {
    console.log('❌ Token extraction failed:', error.message);
    return {
      success: false,
      token: null,
      error: `Token extraction failed: ${error.message}`
    };
  }
}

/**
 * Validates a JWT token and returns the decoded payload
 * 
 * @param {string} token - The JWT token to validate
 * @param {string} jwtSecret - The secret used to sign the JWT
 * @returns {object} - { success: boolean, decoded: object|null, error: string|null }
 */
function validateJWTToken(token, jwtSecret) {
  try {
    // console.log('🔍 Validating JWT token...');
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, jwtSecret);
    // console.log('✅ JWT validation successful for user:', decoded.pubkey);
    
    return {
      success: true,
      decoded: decoded,
      error: null
    };
  } catch (error) {
    console.log('❌ JWT validation failed:', error.message, error.name);
    
    let errorMessage = 'Invalid token';
    if (error.name === 'TokenExpiredError') {
      errorMessage = 'Token expired';
    }
    
    return {
      success: false,
      decoded: null,
      error: errorMessage
    };
  }
}

/**
 * Complete token processing: extract from header and validate
 * 
 * @param {string} authHeader - The Authorization header value
 * @param {string} jwtSecret - The secret used to sign the JWT
 * @returns {object} - { success: boolean, decoded: object|null, error: string|null }
 */
function processAuthToken(authHeader, jwtSecret) {
  // Step 1: Extract token from header
  // console.log("about to extract token from auth header")
  const extractResult = extractTokenFromAuthHeader(authHeader);
  if (!extractResult.success) {
    return extractResult;
  }
  
  // Step 2: Validate the JWT
  return validateJWTToken(extractResult.token, jwtSecret);
}

/**
 * Complete availability calculation with working plan, breaks, appointments, and time filtering
 */
function calculateAvailableHours(date, clientCurrentTime, clientTimezone, service, provider, appointments) {
  try {
    console.log('🚀 calculateAvailableHours called with:', { 
      date, 
      serviceName: service.name, 
      providerName: provider.first_name,
      clientTimezone 
    });
    
    if (!provider.settings.working_plan) {
      console.log('❌ No working plan found');
      return [];
    }

    const workingPlan = JSON.parse(provider.settings.working_plan);
    const workingPlanExceptions = JSON.parse(provider.settings.working_plan_exceptions || '{}');
    
    console.log('📋 Working plan:', workingPlan);
    
    // Get day of week and working plan
    const dayOfWeek = new Date(date).toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
    const dayPlan = workingPlanExceptions[date] || workingPlan[dayOfWeek];
    
    console.log('📅 Day of week:', dayOfWeek);
    console.log('📋 Day plan:', dayPlan);
    
    if (!dayPlan || !dayPlan.start || !dayPlan.end) {
      console.log('❌ No day plan found for', dayOfWeek);
      return [];
    }

    // Check if it's today for time filtering
    const today = new Date().toLocaleDateString('en-CA', { timeZone: clientTimezone });
    const isToday = date === today;
    
    let currentMinutes = 0;
    if (isToday && clientCurrentTime) {
      const [hours, minutes] = clientCurrentTime.split(':');
      currentMinutes = parseInt(hours) * 60 + parseInt(minutes) + 15; // 15 min buffer
    }

    console.log('🕐 Time filtering info:');
    console.log('  Client timezone:', clientTimezone);
    console.log('  Client current time:', clientCurrentTime);
    console.log('  Today (client timezone):', today);
    console.log('  Requested date:', date);
    console.log('  Is today?', isToday);
    console.log('  Current minutes + buffer:', currentMinutes);

    // Generate time slots
    const slots = [];
    const duration = parseInt(service.duration);
    const interval = service.availabilities_type === 'flexible' ? 15 : Math.min(duration, 30);
    const startMinutes = timeToMinutes(dayPlan.start);
    const endMinutes = timeToMinutes(dayPlan.end);

    console.log('⚙️ Slot generation settings:');
    console.log('  Duration:', duration, 'minutes');
    console.log('  Interval:', interval, 'minutes');
    console.log('  Start time:', dayPlan.start, '-> minutes:', startMinutes);
    console.log('  End time:', dayPlan.end, '-> minutes:', endMinutes);
    console.log('  Appointments to check:', appointments.length);

    for (let time = startMinutes; time + duration <= endMinutes; time += interval) {
      const slotTime = minutesToTime(time);
      const slotEndTime = minutesToTime(time + duration);
      
      console.log(`\n🔄 Checking slot: ${slotTime} - ${slotEndTime} (${time} minutes)`);
      
      // Skip past times if it's today
      if (isToday && time <= currentMinutes) {
        console.log('  ⏭️ SKIPPING: Past time (', time, '<=', currentMinutes, ')');
        continue;
      }

      // Check conflicts with breaks
      const conflictsWithBreak = dayPlan.breaks?.some(breakPeriod => {
        const breakStart = timeToMinutes(breakPeriod.start);
        const breakEnd = timeToMinutes(breakPeriod.end);
        const hasConflict = time < breakEnd && (time + duration) > breakStart;
        console.log(`    🛑 Break check: ${breakPeriod.start}-${breakPeriod.end} (${breakStart}-${breakEnd}) conflicts? ${hasConflict}`);
        return hasConflict;
      });

      console.log('  🛑 Conflicts with break?', conflictsWithBreak);

      // Check conflicts with appointments
      const conflictsWithAppointment = appointments.some(apt => {
        const aptStart = new Date(apt.start_datetime);
        const aptEnd = new Date(apt.end_datetime);
        const slotStart = new Date(`${date} ${slotTime}`);
        const slotEnd = new Date(`${date} ${slotEndTime}`);
        const hasConflict = slotStart < aptEnd && slotEnd > aptStart;
        console.log(`    📅 Appointment check: ${apt.start_datetime} to ${apt.end_datetime} conflicts? ${hasConflict}`);
        return hasConflict;
      });

      console.log('  📅 Conflicts with appointment?', conflictsWithAppointment);

      if (!conflictsWithBreak && !conflictsWithAppointment) {
        console.log('  ✅ ADDING slot:', slotTime);
        slots.push(slotTime);
      } else {
        console.log('  ❌ SKIPPING slot due to conflicts');
      }
    }

    console.log('\n🎯 Final available slots:', slots);
    console.log('🎯 Total slots found:', slots.length);
    
    return slots;

  } catch (error) {
    console.error('❌ Error calculating available hours:', error);
    return [];
  }
}

// check an appointment time against current time
function timeCheck(appointmentDateTime, doctorTimezone = 'UTC') {
  try {
    console.log('🕐 Time check debug:');
    console.log('  Appointment datetime:', appointmentDateTime);
    console.log('  Doctor timezone:', doctorTimezone);
    
    // Get current time in doctor's timezone (following your existing pattern)
    const today = new Date();
    const utcTime = today.getTime();
    
    // Determine timezone offset (expanding your existing pattern)
    let timezoneOffset;
    switch(doctorTimezone.toLowerCase()) {
      case 'UTC':
      case 'america/chicago':
        timezoneOffset = -5 * 60 * 60 * 1000; // CDT is UTC-5
        break;
      case 'eastern':
      case 'america/new_york':
        timezoneOffset = -4 * 60 * 60 * 1000; // EDT is UTC-4
        break;
      case 'pacific':
      case 'america/los_angeles':
        timezoneOffset = -7 * 60 * 60 * 1000; // PDT is UTC-7
        break;
      case 'utc':
      default:
        timezoneOffset = 0; // UTC
    }
    
    const doctorTime = new Date(utcTime + timezoneOffset);
    
    // Parse appointment datetime
    const appointmentTime = new Date(appointmentDateTime);
    
    // Calculate 15 minutes before appointment in doctor's timezone
    const appointmentTimeInDoctorTz = new Date(appointmentTime.getTime() + timezoneOffset);
    const earliestJoinTime = new Date(appointmentTimeInDoctorTz.getTime() - (15 * 60 * 1000)); // 15 minutes before
    
    console.log('  UTC time:', today.toISOString());
    console.log('  Doctor time:', doctorTime.toISOString());
    console.log('  Appointment time:', appointmentTime.toISOString());
    console.log('  Earliest join time:', earliestJoinTime.toISOString());
    
    const canJoin = doctorTime >= earliestJoinTime;
    console.log('  Can join?', canJoin);
    
    // Optional: Check if appointment is too far in the past (2 hours after)
    const maxTimeAfter = new Date(appointmentTimeInDoctorTz.getTime() + (2 * 60 * 60 * 1000));
    const tooLate = doctorTime > maxTimeAfter;
    
    if (tooLate) {
      console.log('  Appointment has ended');
      return false;
    }
    
    return canJoin;
    
  } catch (error) {
    console.error('Error in timeCheck:', error);
    return false; // Fail closed - don't allow access on error
  }
}

// Helper functions
function timeToMinutes(timeStr) {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 60 + minutes;
}

function minutesToTime(minutes) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
}

module.exports = {
  hexToBech32,
  bech32ToHex,
  extractTokenFromAuthHeader,
  validateJWTToken,
  processAuthToken,
  calculateAvailableHours,
  timeCheck
}
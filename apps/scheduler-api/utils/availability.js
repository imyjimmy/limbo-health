/**
 * Complete availability calculation with working plan, breaks, appointments, and time filtering
 */
export function calculateAvailableHours(date, clientCurrentTime, clientTimezone, service, provider, appointments) {
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
      currentMinutes = parseInt(hours) * 60 + parseInt(minutes) + 2; // 2 min buffer
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
export function timeCheck(appointmentDateTime, doctorTimezone = 'UTC') {
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

// export const isDST = () => {
//   const now = new Date();
//   const january = new Date(now.getFullYear(), 0, 1); // January 1st of the current year
//   const july = new Date(now.getFullYear(), 6, 1);    // July 1st of the current year

//   const janOffset = january.getTimezoneOffset();
//   const julOffset = july.getTimezoneOffset();
//   const currentOffset = now.getTimezoneOffset();

//   // In the Northern Hemisphere, DST typically means a smaller (more negative) offset.
//   // In the Southern Hemisphere, DST typically means a smaller (more negative) offset as well,
//   // but the standard time might be during their winter (our summer).
//   // The key is that the offset during DST will be different from the standard offset.

//   // We find the maximum of the two offsets (Jan and Jul) to represent the standard time offset.
//   // If the current offset is different from this standard offset, it indicates DST.
//   return Math.max(janOffset, julOffset) !== currentOffset;
// }

export const generateRoomId = () => {
  const adjectives = [
    'bright', 'calm', 'gentle', 'happy', 'peaceful',
    'swift', 'quiet', 'bold', 'wise', 'kind'
  ];
  
  const animals = [
    'dolphin', 'eagle', 'fox', 'owl', 'deer',
    'wolf', 'bear', 'hawk', 'lion', 'otter'
  ];
  
  const verbs = [
    'swimming', 'flying', 'running', 'jumping', 'dancing',
    'gliding', 'climbing', 'soaring', 'diving', 'wandering'
  ];
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const animal = animals[Math.floor(Math.random() * animals.length)];
  const verb = verbs[Math.floor(Math.random() * verbs.length)];
  
  return `${adj}-${animal}-${verb}`;
  // return `bright-dolphin-swimming`;
}

export const hexToBech32 = (hex) => {
  // TODO: Implement proper hex to bech32 conversion
  return `npub${hex.substring(0, 8)}...`;
};
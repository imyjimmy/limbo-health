import React, { useState, useRef, useEffect } from 'react';
import { ChevronLeftIcon, ChevronRightIcon, CalendarIcon, ArrowPathIcon, Squares2X2Icon, XMarkIcon } from '@heroicons/react/24/outline';

interface TimeSlot {
  time: string;
  hour: number;
  minute: number;
}

interface ApptProps {
  token: string;
}

// interface CalendarEvent {
//   id: string;
//   title: string;
//   start: Date;
//   end: Date;
//   type: 'appointment' | 'unavailability';
// }

interface AddEventModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedDate: Date | null;
  selectedTime: string | null;
}

const AddEventModal: React.FC<AddEventModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-card rounded-2xl shadow-xl max-w-md w-full mx-4 border border-border">
        {/* Header */}
        <div className="bg-muted text-foreground px-6 py-4 rounded-t-2xl flex justify-between items-center border-b border-border">
          <h2 className="text-lg font-semibold tracking-wide">ADD NEW EVENT</h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <XMarkIcon className="w-6 h-8" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          <h3 className="text-foreground text-lg mb-6">What kind of event would you like to add?</h3>

          <div className="space-y-3">
            <button className="w-full py-3 px-4 border-2 border-primary text-primary rounded-lg hover:bg-primary/10 transition-colors font-medium">
              UNAVAILABILITY
            </button>

            <button className="w-full py-3 px-4 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors font-medium">
              APPOINTMENT
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export const isDST = () => {
  const now = new Date();
  const january = new Date(now.getFullYear(), 0, 1); // January 1st of the current year
  const july = new Date(now.getFullYear(), 6, 1);    // July 1st of the current year

  const janOffset = january.getTimezoneOffset();
  const julOffset = july.getTimezoneOffset();
  const currentOffset = now.getTimezoneOffset();

  // In the Northern Hemisphere, DST typically means a smaller (more negative) offset.
  // In the Southern Hemisphere, DST typically means a smaller (more negative) offset as well,
  // but the standard time might be during their winter (our summer).
  // The key is that the offset during DST will be different from the standard offset.
  
  // We find the maximum of the two offsets (Jan and Jul) to represent the standard time offset.
  // If the current offset is different from this standard offset, it indicates DST.
  return Math.max(janOffset, julOffset) !== currentOffset;
}

export const CalendarPage: React.FC<ApptProps> = ({ token }) => {
  const [currentWeek, setCurrentWeek] = useState(new Date());
  const [viewType, setViewType] = useState<'Day' | 'Week' | 'Month'>('Week');
  const [nostrUsername] = useState(() => {
    try {
      const adminProfile = localStorage.getItem('admin_profile');
      if (adminProfile) {
        const profile = JSON.parse(adminProfile);
        return profile.display_name || profile.name || 'Unknown';
      }
    } catch (error) {
      console.error('Error parsing admin_profile:', error);
    }
    return 'Unknown';
  });
  const [showAddEventModal, setShowAddEventModal] = useState(false);
  const [selectedDateTime, setSelectedDateTime] = useState<{ date: Date | null, time: string | null }>({
    date: null,
    time: null
  });

  const [currentTime, setCurrentTime] = useState(new Date());
  useEffect(() => {
    // Update current time every minute
    const updateCurrentTime = () => {
      setCurrentTime(new Date());
    };

    // Update immediately
    updateCurrentTime();

    // Set up interval to update every minute
    const interval = setInterval(updateCurrentTime, 60000);

    return () => clearInterval(interval);
  }, []);

  /** Appointments */
  const [appointments, setAppointments] = useState<any[]>([]);
  const [, setLoading] = useState(false);
  useEffect(() => {
    const fetchAppointments = async () => {
      if (!token) return;

      setLoading(true);
      try {
        const response = await fetch('/api/admin/appointments', {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        const data = await response.json();
        if (data.status === 'success') {
          setAppointments(data.appointments);
        } else {
          console.error('Failed to fetch appointments:', data.message);
        }
      } catch (error) {
        console.error('Error fetching appointments:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchAppointments();
  }, [token]);

  /** Dark Mode / Light Mode Detector */
  const [isDarkMode, setIsDarkMode] = useState(false);
  useEffect(() => {
    const checkTheme = () => {
      // Check for dark class
      const hasDarkClass = document.documentElement.classList.contains('dark') ||
        document.body.classList.contains('dark');

      // Check data attribute
      const hasDarkData = document.documentElement.getAttribute('data-theme') === 'dark';

      // Check CSS variable
      const computedStyle = getComputedStyle(document.documentElement);
      const bgColor = computedStyle.getPropertyValue('--background').trim();
      const isDarkBg = bgColor.includes('0 0 0') || bgColor.includes('black');

      setIsDarkMode(hasDarkClass || hasDarkData || isDarkBg);
    };

    checkTheme();

    const observer = new MutationObserver(checkTheme);
    observer.observe(document.documentElement, { attributes: true });

    return () => observer.disconnect();
  }, []);

  /**
   * Working Plan
   */
  const [workingPlan, setWorkingPlan] = useState<any>(null);

  useEffect(() => {
    const fetchWorkingPlan = async () => {
      try {
        const response = await fetch('/api/admin/working-plan', {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        const data = await response.json();
        if (data.status === 'success') {
          setWorkingPlan(data.working_plan);
        }
      } catch (error) {
        console.error('Failed to fetch working plan:', error);
      }
    };

    fetchWorkingPlan();
  }, [token]);

  /**
   * Scroll Container Ref
   */
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Scroll to current time on component mount and when view changes
  useEffect(() => {
    if (scrollContainerRef.current) {
      const now = new Date();
      const currentHour = now.getHours();
      const currentMinute = now.getMinutes();

      // Calculate the position based on current time
      // Each hour is 4 slots (15-minute increments) * 32px height = 128px per hour
      // Add current minutes as fraction of hour
      const hourPixels = currentHour * 128; // 4 slots * 32px per slot
      const minutePixels = (currentMinute / 60) * 128;
      const scrollTo = hourPixels + minutePixels - 200; // Offset to center current time

      scrollContainerRef.current.scrollTop = Math.max(0, scrollTo);
    }
  }, [viewType]);

  // Generate time slots for 24 hours in 15-minute increments
  const timeSlots: TimeSlot[] = [];
  for (let hour = 0; hour < 24; hour++) {
    for (let minute = 0; minute < 60; minute += 15) {
      // const timeString = hour === 0 && minute === 0 ? '12 am' : 
      //                   hour < 12 ? `${hour}:${minute.toString().padStart(2, '0')} am` :
      //                   hour === 12 ? `12:${minute.toString().padStart(2, '0')} pm` :
      //                   `${hour - 12}:${minute.toString().padStart(2, '0')} pm`;

      timeSlots.push({
        time: minute === 0 ? (hour === 0 ? '12 am' : hour <= 12 ? `${hour} am` : `${hour - 12} pm`) : '',
        hour,
        minute
      });
    }
  }

  // Get week dates
  const getWeekDates = (date: Date) => {
    const week = [];
    const startDate = new Date(date);
    const day = startDate.getDay();
    const diff = startDate.getDate() - day;
    startDate.setDate(diff);

    for (let i = 0; i < 7; i++) {
      const currentDate = new Date(startDate);
      currentDate.setDate(startDate.getDate() + i);
      week.push(currentDate);
    }
    return week;
  };

  const weekDates = getWeekDates(currentWeek);
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // Format week range
  const formatWeekRange = () => {
    const start = weekDates[0];
    const end = weekDates[6];
    const startMonth = start.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
    const endMonth = end.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();

    if (start.getMonth() === end.getMonth()) {
      return `${startMonth} ${start.getDate()} – ${end.getDate()}, ${start.getFullYear()}`;
    } else {
      return `${startMonth} ${start.getDate()} – ${endMonth} ${end.getDate()}, ${start.getFullYear()}`;
    }
  };

  // Navigation functions
  const goToPreviousWeek = () => {
    const newDate = new Date(currentWeek);
    newDate.setDate(currentWeek.getDate() - 7);
    setCurrentWeek(newDate);
  };

  const goToNextWeek = () => {
    const newDate = new Date(currentWeek);
    newDate.setDate(currentWeek.getDate() + 7);
    setCurrentWeek(newDate);
  };

  const goToToday = () => {
    setCurrentWeek(new Date());
  };

  // Handle time slot click
  const handleTimeSlotClick = (date: Date, time: string) => {
    setSelectedDateTime({ date, time });
    setShowAddEventModal(true);
  };

  // Check if a time slot is unavailable check against working plan
  const isUnavailable = (date: Date, hour: number, minute: number) => {
    // Check working plan availability first
    if (!workingPlan) return false;
    
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const dayName = dayNames[date.getDay()];
    const dayPlan = workingPlan[dayName];
    
    if (!dayPlan) return false;
    
    const currentTime = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
    const startTime = dayPlan.start;
    const endTime = dayPlan.end;
    
    // Check if outside working hours
    if (currentTime < startTime || currentTime >= endTime) {
      return true;
    }
    
    // Check if during break time
    if (dayPlan.breaks) {
      for (const breakTime of dayPlan.breaks) {
        if (currentTime >= breakTime.start && currentTime < breakTime.end) {
          return true;
        }
      }
    }
    
    // NEW: Check if this slot is occupied by an appointment
    const slotAppointments = getAppointmentsForSlot(date, hour, minute);
    if (slotAppointments.length > 0) {
      // Check if this is NOT the starting slot of any appointment
      const slotStart = new Date(date);
      slotStart.setHours(hour, minute, 0, 0);
      
      const isStartingSlot = slotAppointments.some(appointment => {
        const appointmentStart = new Date(appointment.start_datetime);
        return Math.abs(appointmentStart.getTime() - slotStart.getTime()) < 15 * 60 * 1000;
      });
      
      // If not the starting slot, mark as unavailable
      return !isStartingSlot;
    }
    
    return false;
  };

  const getAppointmentsForSlot = (date: Date, hour: number, minute: number) => {
    const slotAppointments = appointments.filter(appointment => {
      const appointmentStart = new Date(appointment.start_datetime);
      const appointmentEnd = new Date(appointment.end_datetime);

      // Check if this time slot overlaps with the appointment
      const slotStart = new Date(date);
      slotStart.setHours(hour, minute, 0, 0);
      const slotEnd = new Date(slotStart);
      slotEnd.setMinutes(slotEnd.getMinutes() + 15);

      const overlaps = appointmentStart < slotEnd && appointmentEnd > slotStart;
      
      // Debug logging for the appointment that should show
      if (appointment.id === 8) {
        console.log('Debugging appointment 8:', {
          appointmentStart: appointmentStart.toISOString(),
          appointmentEnd: appointmentEnd.toISOString(),
          slotStart: slotStart.toISOString(),
          slotEnd: slotEnd.toISOString(),
          slotDate: date.toDateString(),
          slotHour: hour,
          slotMinute: minute,
          overlaps
        });
      }

      return overlaps;
    });
    
    console.log('slot appts: ', slotAppointments);
    console.log('isdst: ', isDST());
    return slotAppointments;
  };

  return (
    <div className="bg-card rounded-xl border border-border h-[calc(100vh-100px)] flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between mb-4">
          {/* Provider Dropdown */}
          <div className="relative">
            <select
              value={nostrUsername}
              className="bg-background border border-input rounded-lg px-4 py-2 pr-8 focus:outline-none focus:ring-2 focus:ring-ring text-foreground"
            >
              <option value={nostrUsername}>{nostrUsername}</option>
            </select>
          </div>

          {/* View Options */}
          <div className="flex items-center space-x-2">
            <button className="p-2 text-muted-foreground hover:text-foreground bg-muted rounded">
              <CalendarIcon className="w-4 h-8" />
            </button>
            <button className="p-2 text-muted-foreground hover:text-foreground bg-muted rounded">
              <ArrowPathIcon className="w-4 h-8" />
            </button>
            <button className="p-2 text-muted-foreground hover:text-foreground bg-muted rounded">
              <Squares2X2Icon className="w-4 h-8" />
            </button>
          </div>
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <button
              onClick={goToPreviousWeek}
              className="p-2 text-muted-foreground hover:text-foreground"
            >
              <ChevronLeftIcon className="w-5 h-5" />
            </button>
            <button
              onClick={goToNextWeek}
              className="p-2 text-muted-foreground hover:text-foreground"
            >
              <ChevronRightIcon className="w-5 h-5" />
            </button>
            <button
              onClick={goToToday}
              className="px-3 py-1 text-sm text-muted-foreground hover:text-foreground border border-border rounded"
            >
              Today
            </button>
          </div>

          <div className="text-foreground font-medium">
            {formatWeekRange()}
          </div>

          <div className="flex items-center space-x-1">
            {(['Day', 'Week', 'Month'] as const).map((view) => (
              <button
                key={view}
                onClick={() => setViewType(view)}
                className={`px-3 py-1 text-sm rounded ${viewType === view
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                  }`}
              >
                {view}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Day Headers */}
        <div className="flex border-b border-border bg-card">
          <div className="w-20 p-3 text-sm text-muted-foreground border-r border-border">
            All Day
          </div>
          {weekDates.map((date, index) => {
            const isToday = date.toDateString() === new Date().toDateString();
            return (
              <div key={index} className="flex-1 p-3 text-center border-r border-border last:border-r-0">
                <div className={`text-sm ${isToday ? 'text-primary font-semibold' : 'text-muted-foreground'}`}>
                  {dayNames[index]} {date.getMonth() + 1}/{date.getDate()}
                </div>
              </div>
            );
          })}
        </div>

        {/* Scrollable Time Grid */}
        <div
          ref={scrollContainerRef}
          className="flex-1 overflow-auto"
        >
          <div className="flex">
            {/* Time Column */}
            <div className="w-20 bg-card">
              {timeSlots.map((slot) => (
                <div
                  key={slot.hour}
                  className="h-8 flex items-start justify-end pr-2 pt-1 text-xs text-muted-foreground border-b border-r border-border"
                >
                  {slot.time}
                </div>
              ))}
            </div>

            {/* Day Columns */}
            {weekDates.map((date, dayIndex) => {
              const isToday = date.toDateString() === new Date().toDateString();

              const getUnavailableStyle = () => ({
                backgroundImage: `repeating-linear-gradient(
                  45deg,
                  transparent,
                  transparent 4px,
                  ${isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'} 4px,
                  ${isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'} 12px
                )`
              });

              return (
                <div key={dayIndex} className={`flex-1 border-r border-border last:border-r-0 relative ${isToday ? 'bg-primary/10' : ''}`}>
                  {timeSlots.map((slot, slotIndex) => {
                    const unavailable = isUnavailable(date, slot.hour, slot.minute);
                    const now = currentTime;
                    const currentHour = now.getHours();
                    const currentMinute = now.getMinutes();

                    // Check if this slot contains the current time
                    const isCurrentTimeSlot = isToday &&
                      slot.hour === currentHour &&
                      currentMinute >= slot.minute &&
                      currentMinute < slot.minute + 15;

                    const slotAppointments = getAppointmentsForSlot(date, slot.hour, slot.minute);
                    const hasAppointment = slotAppointments.length > 0;

                    return (
                      <div
                        key={`${dayIndex}-${slotIndex}`}
                        onClick={() => !unavailable && !hasAppointment && handleTimeSlotClick(date, slot.time)}
                        className={`h-8 border-b border-border relative ${unavailable
                            ? `${isDarkMode ? 'bg-gray-900 opacity-80' : 'bg-gray-200'} cursor-not-allowed striped-unavailable`
                            : hasAppointment
                              ? 'bg-blue-100 cursor-pointer'
                              : 'hover:bg-muted cursor-pointer'
                          }`}
                        style={unavailable ? getUnavailableStyle() : undefined}
                      >
                        {/* Render appointment info if present */}
                        {hasAppointment && slotAppointments.map(appointment => {
                          // Only render if this is the appointment's starting slot
                          const appointmentStart = new Date(appointment.start_datetime);
                          const slotStart = new Date(date);
                          slotStart.setHours(slot.hour, slot.minute, 0, 0);
                          
                          const isStartingSlot = Math.abs(appointmentStart.getTime() - slotStart.getTime()) < 15 * 60 * 1000;
                          
                          if (!isStartingSlot) return null;
                          
                          return (<div
                            key={appointment.id}
                            className="absolute inset-0 bg-blue-500 text-white text-xs p-1 rounded overflow-hidden z-10"
                            style={{ 
                              backgroundColor: appointment.service_color || '#3b82f6',
                              height: `${Math.ceil(appointment.service_duration / 15) * 32}px` // Span multiple 32px slots
                            }}
                          >
                            <div className="font-semibold truncate">{appointment.customer_name}</div>
                            <div className="truncate">{appointment.service_name}</div>
                          </div>)
                        })}
                        {/* Current time line - positioned within the current time slot */}
                        {isCurrentTimeSlot && (
                          (() => {
                            // Calculate position within this 32px slot
                            const minutesIntoSlot = currentMinute - slot.minute;
                            const pixelsFromTop = (minutesIntoSlot / 15) * 32;

                            console.log('Current time in slot:', slot.hour, slot.minute);
                            console.log('Minutes into slot:', minutesIntoSlot);
                            console.log('Pixels from top:', pixelsFromTop);

                            return (
                              <div
                                className="absolute left-0 right-0 bg-red-500 z-20 pointer-events-none"
                                style={{
                                  top: `${pixelsFromTop}px`,
                                  height: '2px',
                                  boxShadow: '0 0 4px rgba(239, 68, 68, 0.6)'
                                }}
                              >
                              </div>
                            );
                          })()
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Add Event Modal */}
      <AddEventModal
        isOpen={showAddEventModal}
        onClose={() => setShowAddEventModal(false)}
        selectedDate={selectedDateTime.date}
        selectedTime={selectedDateTime.time}
      />
    </div>
  );
};
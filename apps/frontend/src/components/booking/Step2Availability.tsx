import { useState, useEffect } from 'react';
import { BookingData } from './BookingWorkflow';

interface Step2Props {
  data: BookingData;
  onNext: () => void;
  onPrev: () => void;
  onUpdate: (updates: Partial<BookingData>) => void;
}

interface AvailabilityData {
  date: string;
  providerId: string;
  serviceId: string;
  providerName: string;
  serviceName: string;
  serviceDuration: number;
  availableHours: string[];
}

const formatDate = (dateString: string) => {
  const [year, month, day] = dateString.split('-');
  return `${month}/${day}/${year}`;
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

export function Step2Availability({ data, onNext, onPrev, onUpdate }: Step2Props) {
  const [selectedDate, setSelectedDate] = useState<string>(
    data.appointment?.date || new Date().toLocaleDateString('en-CA')
  );
  const [selectedTime, setSelectedTime] = useState<string>(data.appointment?.time || '');
  const [availability, setAvailability] = useState<AvailabilityData | null>(null);
  const [loadingAvailability, setLoadingAvailability] = useState(false);

  useEffect(() => {
    if (data.provider && data.service && selectedDate) {
      loadAvailability(selectedDate);
    }
  }, [data.provider, data.service, selectedDate]);

  const loadAvailability = async (date: string) => {
    if (!data.provider || !data.service) return;

    setLoadingAvailability(true);
    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const currentTime = new Date().toLocaleTimeString('en-CA', { hour12: false }); // HH:MM:SS format
      const response = await fetch(
        `/api/providers/${data.provider.id}/availability?serviceId=${data.service.id}&date=${date}&timezone=${encodeURIComponent(timezone)}&currentTime=${encodeURIComponent(currentTime)}`
      );

      if (response.ok) {
        const availabilityData = await response.json();
        console.log('📅 Availability data:', availabilityData);
        setAvailability(availabilityData);
        
        // Clear selected time if it's no longer available
        if (selectedTime && !availabilityData.availableHours.includes(selectedTime)) {
          setSelectedTime('');
          updateAppointment(date, '');
        }
      } else {
        console.error('Failed to load availability');
        setAvailability(null);
      }
    } catch (error) {
      console.error('Error loading availability:', error);
      setAvailability(null);
    } finally {
      setLoadingAvailability(false);
    }
  };

  const updateAppointment = (date: string, time: string) => {
    const datetime = time ? `${date} ${time}:00` : '';
    const dst = isDST();
    onUpdate({
      appointment: {
        date,
        time,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        isDST: dst,
        datetime
      }
    });
  };

  const handleDateChange = (date: string) => {
    setSelectedDate(date);
    setSelectedTime('');
    updateAppointment(date, '');
  };

  const handleTimeSelect = (time: string) => {
    setSelectedTime(time);
    updateAppointment(selectedDate, time);
  };

  const canContinue = selectedDate && selectedTime;

  const handleNext = () => {
    if (canContinue) {
      onNext();
    }
  };

  if (!data.provider || !data.service) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-500 dark:text-gray-400">
          Please select a provider and service first.
        </p>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-6">
        Select Date & Time
      </h2>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left side - Calendar placeholder */}
        <div className="space-y-4">
          <h3 className="text-sm font-medium text-gray-900 dark:text-white">
            Select Date
          </h3>
          
          {/* STUB: Monthly calendar placeholder */}
          <div className="border border-gray-300 dark:border-gray-600 rounded-lg p-4 bg-gray-50 dark:bg-gray-700">
            <div className="text-center text-gray-500 dark:text-gray-400 py-8">
              Monthly Calendar Component Goes Here
            </div>
            
            {/* Temporary date input for testing */}
            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Selected Date (temporary input):
              </label>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => handleDateChange(e.target.value)}
                min={new Date().toLocaleDateString('en-CA')}
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 dark:bg-gray-800 dark:border-gray-600 dark:text-white"
              />
            </div>
          </div>
        </div>

        {/* Right side - Available times */}
        <div className="space-y-4">
          <h3 className="text-sm font-medium text-gray-900 dark:text-white">
            Available Times
          </h3>
          
          {selectedDate && (
            <div className="text-sm text-gray-600 dark:text-gray-300 mb-4">
              <p>Provider: {data.provider.name}</p>
              <p>Service: {data.service.name} ({data.service.duration} min)</p>
              <p>Date: {formatDate(selectedDate)}</p>
            </div>
          )}

          {loadingAvailability ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin h-8 w-8 border-2 border-indigo-600 border-t-transparent rounded-full"></div>
              <span className="ml-2 text-gray-600 dark:text-gray-300">Loading available times...</span>
            </div>
          ) : availability && availability.availableHours.length > 0 ? (
            <div className="grid grid-cols-3 gap-2">
              {availability.availableHours.map((time) => (
                <button
                  key={time}
                  onClick={() => handleTimeSelect(time)}
                  className={`py-2 px-3 text-sm rounded-md border transition-colors ${
                    selectedTime === time
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                >
                  {time}
                </button>
              ))}
            </div>
          ) : selectedDate ? (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              No available times for this date
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              Please select a date to see available times
            </div>
          )}
        </div>
      </div>

      {/* Selected appointment summary */}
      {selectedDate && selectedTime && (
        <div className="mt-8 bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
          <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-2">
            Appointment Summary:
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-300">
            {data.provider.name} - {data.service.name}
          </p>
          <p className="text-sm text-gray-600 dark:text-gray-300">
            {new Date(selectedDate).toLocaleDateString()} at {selectedTime}
          </p>
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Duration: {data.service.duration} minutes
          </p>
        </div>
      )}

      {/* Navigation buttons */}
      <div className="mt-8 flex justify-between">
        <button
          onClick={onPrev}
          className="rounded-md bg-gray-300 dark:bg-gray-600 px-3 py-2 text-sm font-semibold text-gray-900 dark:text-white shadow-sm hover:bg-gray-400 dark:hover:bg-gray-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-500"
        >
          Back: Provider & Service
        </button>
        
        <button
          onClick={handleNext}
          disabled={!canContinue}
          className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-indigo-500 dark:hover:bg-indigo-400"
        >
          Next: Your Information
        </button>
      </div>
    </div>
  );
}
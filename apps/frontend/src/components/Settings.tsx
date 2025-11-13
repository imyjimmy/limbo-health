import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { profileService } from '@/services/profile';

interface SettingsProps {
  token: string;
}

const TIMEZONES = [
  // US Timezones
  { value: 'America/New_York', label: 'Eastern Time (ET) - New York' },
  { value: 'America/Chicago', label: 'Central Time (CT) - Chicago' },
  { value: 'America/Denver', label: 'Mountain Time (MT) - Denver' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (PT) - Los Angeles' },
  { value: 'America/Phoenix', label: 'Arizona (MT - No DST)' },
  { value: 'America/Anchorage', label: 'Alaska Time (AKT)' },
  { value: 'Pacific/Honolulu', label: 'Hawaii Time (HT)' },
  
  // Mexico
  { value: 'America/Mexico_City', label: 'Mexico City Time (CST)' },
  { value: 'America/Cancun', label: 'Cancun Time (EST)' },
  { value: 'America/Tijuana', label: 'Tijuana Time (PST)' },
  { value: 'America/Mazatlan', label: 'Mazatlán Time (MST)' },
  
  // Central America
  { value: 'America/Guatemala', label: 'Guatemala (CST)' },
  { value: 'America/El_Salvador', label: 'El Salvador (CST)' },
  { value: 'America/Tegucigalpa', label: 'Honduras (CST)' },
  { value: 'America/Managua', label: 'Nicaragua (CST)' },
  { value: 'America/Costa_Rica', label: 'Costa Rica (CST)' },
  { value: 'America/Panama', label: 'Panama (EST)' },
  
  // South America
  { value: 'America/Bogota', label: 'Colombia - Bogotá (COT)' },
  { value: 'America/Lima', label: 'Peru - Lima (PET)' },
  { value: 'America/Caracas', label: 'Venezuela - Caracas (VET)' },
  { value: 'America/Santiago', label: 'Chile - Santiago (CLT)' },
  { value: 'America/Argentina/Buenos_Aires', label: 'Argentina - Buenos Aires (ART)' },
  { value: 'America/Sao_Paulo', label: 'Brazil - São Paulo (BRT)' },
  { value: 'America/Montevideo', label: 'Uruguay - Montevideo (UYT)' },
];

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const DAY_LABELS = {
  monday: 'Monday',
  tuesday: 'Tuesday',
  wednesday: 'Wednesday',
  thursday: 'Thursday',
  friday: 'Friday',
  saturday: 'Saturday',
  sunday: 'Sunday',
};

interface WorkingPlanDay {
  start: string;
  end: string;
  breaks: Array<{ start: string; end: string }>;
}

type WorkingPlan = {
  [key: string]: WorkingPlanDay | null;
};

const DEFAULT_WORKING_HOURS: WorkingPlanDay = {
  start: '09:00',
  end: '17:00',
  breaks: [],
};

export const Settings: React.FC<SettingsProps> = ({ token }) => {
  const [timezone, setTimezone] = useState('America/Chicago');
  const [workingPlan, setWorkingPlan] = useState<WorkingPlan>({
    monday: DEFAULT_WORKING_HOURS,
    tuesday: DEFAULT_WORKING_HOURS,
    wednesday: DEFAULT_WORKING_HOURS,
    thursday: DEFAULT_WORKING_HOURS,
    friday: DEFAULT_WORKING_HOURS,
    saturday: null,
    sunday: null,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const profile = await profileService.getProfile(token);
      if (profile.timezone) {
        setTimezone(profile.timezone);
      }
      if (profile.workingPlan) {
        setWorkingPlan(profile.workingPlan);
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await profileService.updateProfile(token, {
        timezone,
        working_plan: JSON.stringify(workingPlan),
      });
      alert('Settings saved successfully!');
    } catch (error) {
      console.error('Failed to save settings:', error);
      alert('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const toggleDay = (day: string) => {
    setWorkingPlan({
      ...workingPlan,
      [day]: workingPlan[day] ? null : DEFAULT_WORKING_HOURS,
    });
  };

  const updateDayHours = (day: string, field: 'start' | 'end', value: string) => {
    if (!workingPlan[day]) return;
    setWorkingPlan({
      ...workingPlan,
      [day]: {
        ...workingPlan[day]!,
        [field]: value,
      },
    });
  };

  const addBreak = (day: string) => {
    if (!workingPlan[day]) return;
    setWorkingPlan({
      ...workingPlan,
      [day]: {
        ...workingPlan[day]!,
        breaks: [...workingPlan[day]!.breaks, { start: '12:00', end: '13:00' }],
      },
    });
  };

  const updateBreak = (day: string, breakIndex: number, field: 'start' | 'end', value: string) => {
    if (!workingPlan[day]) return;
    const updatedBreaks = [...workingPlan[day]!.breaks];
    updatedBreaks[breakIndex][field] = value;
    setWorkingPlan({
      ...workingPlan,
      [day]: {
        ...workingPlan[day]!,
        breaks: updatedBreaks,
      },
    });
  };

  const removeBreak = (day: string, breakIndex: number) => {
    if (!workingPlan[day]) return;
    setWorkingPlan({
      ...workingPlan,
      [day]: {
        ...workingPlan[day]!,
        breaks: workingPlan[day]!.breaks.filter((_, i) => i !== breakIndex),
      },
    });
  };

  const copyDayToAll = (sourceDay: string) => {
    if (!workingPlan[sourceDay]) return;
    
    const sourcePlan = workingPlan[sourceDay]!;
    const updatedPlan = { ...workingPlan };
    
    // Copy to all enabled days
    DAYS.forEach(day => {
      if (updatedPlan[day]) {  // Only copy to days that are enabled
        updatedPlan[day] = {
          start: sourcePlan.start,
          end: sourcePlan.end,
          breaks: [...sourcePlan.breaks],  // Deep copy breaks array
        };
      }
    });
    
    setWorkingPlan(updatedPlan);
  };

  if (loading) {
    return (
      <Card className="p-6">
        <div className="text-center">Loading settings...</div>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Timezone Settings */}
      <Card className="p-6">
        <h3 className="text-xl font-semibold mb-4">Timezone</h3>
        <div className="max-w-md">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Working Timezone
          </label>
          <select
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:border-blue-500"
          >
            {TIMEZONES.map((tz) => (
              <option key={tz.value} value={tz.value}>
                {tz.label}
              </option>
            ))}
          </select>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            All appointment times will be shown in this timezone
          </p>
        </div>
      </Card>

      {/* Working Hours */}
      <Card className="p-6">
        <h3 className="text-xl font-semibold mb-4">Working Hours</h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
          Set your available hours for each day of the week
        </p>

        <div className="space-y-4">
          {DAYS.map((day) => (
            <div key={day} className="flex items-center gap-4">
              <div className="w-32">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!workingPlan[day]}
                    onChange={() => toggleDay(day)}
                    className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                  />
                  <span className="text-sm font-medium text-gray-900 dark:text-white">
                    {DAY_LABELS[day as keyof typeof DAY_LABELS]}
                  </span>
                </label>
              </div>

              {workingPlan[day] ? (
                <div className="flex-1 space-y-2">
                  {/* Working hours */}
                  <div className="flex items-center gap-2">
                    <input
                      type="time"
                      value={workingPlan[day]!.start}
                      onChange={(e) => updateDayHours(day, 'start', e.target.value)}
                      className="px-3 py-1 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded text-gray-900 dark:text-white focus:outline-none focus:border-blue-500"
                    />
                    <span className="text-gray-500">to</span>
                    <input
                      type="time"
                      value={workingPlan[day]!.end}
                      onChange={(e) => updateDayHours(day, 'end', e.target.value)}
                      className="px-3 py-1 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded text-gray-900 dark:text-white focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  {/* Breaks */}
                  {workingPlan[day]!.breaks.map((breakTime, breakIndex) => (
                    <div key={breakIndex} className="flex items-center gap-2 pl-4">
                      <span className="text-xs text-gray-500">Break:</span>
                      <input
                        type="time"
                        value={breakTime.start}
                        onChange={(e) => updateBreak(day, breakIndex, 'start', e.target.value)}
                        className="px-2 py-1 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded text-gray-900 dark:text-white focus:outline-none focus:border-blue-500"
                      />
                      <span className="text-gray-500 text-sm">to</span>
                      <input
                        type="time"
                        value={breakTime.end}
                        onChange={(e) => updateBreak(day, breakIndex, 'end', e.target.value)}
                        className="px-2 py-1 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded text-gray-900 dark:text-white focus:outline-none focus:border-blue-500"
                      />
                      <button
                        onClick={() => removeBreak(day, breakIndex)}
                        className="text-red-500 hover:text-red-700 text-sm"
                      >
                        Remove
                      </button>
                    </div>
                  ))}

                  {/* Add break button */}
                  <button
                    onClick={() => addBreak(day)}
                    className="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400 pl-4"
                  >
                    + Add break
                  </button>
                  <button
                    onClick={() => copyDayToAll(day)}
                    className="text-xs text-purple-600 hover:text-purple-700 dark:text-purple-400 pl-4"
                  >
                    📋 Copy to all working days
                  </button>
                </div>
              ) : (
                <span className="text-sm text-gray-500 dark:text-gray-400">Unavailable</span>
              )}
            </div>
          ))}
        </div>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>
    </div>
  );
};
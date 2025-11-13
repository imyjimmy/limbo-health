import { useState, useEffect } from 'react';
import { BookingData } from './BookingWorkflow';

interface Step3Props {
  data: BookingData;
  onNext: () => void;
  onPrev: () => void;
  onUpdate: (updates: Partial<BookingData>) => void;
}

const Step3PatientInfo: React.FC<Step3Props> = ({ data, onNext, onPrev, onUpdate }) => {
  const [firstName, setFirstName] = useState(data.patient?.firstName || '');
  const [lastName, setLastName] = useState(data.patient?.lastName || '');
  const [email, setEmail] = useState(data.patient?.email || '');
  const [phone, setPhone] = useState(data.patient?.phone || '');
  const [notes, setNotes] = useState(data.patient?.notes || '');

  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  // Update booking data whenever form fields change
  useEffect(() => {
    const adminData = {
      firstName,
      lastName,
      email: email || undefined,
      phone: phone || undefined,
      notes: notes || undefined,
    };

    onUpdate({ patient: adminData });
  }, [firstName, lastName, email, phone, notes]);

  const validateForm = () => {
    const newErrors: { [key: string]: string } = {};

    if (!firstName.trim()) {
      newErrors.firstName = 'First name is required';
    }

    if (!lastName.trim()) {
      newErrors.lastName = 'Last name is required';
    }

    if (email && email.trim() && !isValidEmail(email)) {
      newErrors.email = 'Please enter a valid email address';
    }

    if (phone && phone.trim() && !isValidPhone(phone)) {
      newErrors.phone = 'Please enter a valid phone number';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const isValidEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const isValidPhone = (phone: string) => {
    const phoneRegex = /^[\+]?[1-9][\d]{0,15}$/;
    return phoneRegex.test(phone.replace(/[\s\-\(\)]/g, ''));
  };

  const canContinue = firstName.trim() && lastName.trim() && Object.keys(errors).length === 0;

  const handleNext = () => {
    if (validateForm() && canContinue) {
      onNext();
    }
  };

  return (
    <div>
      <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-6">
        Your Information
      </h2>

      {/* Appointment Summary */}
      {data.provider && data.service && data.appointment && (
        <div className="mb-6 bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
          <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-2">
            Appointment Details:
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-300">
            <strong>Provider:</strong> {data.provider.name}
          </p>
          <p className="text-sm text-gray-600 dark:text-gray-300">
            <strong>Service:</strong> {data.service.name} ({data.service.duration} minutes)
          </p>
          <p className="text-sm text-gray-600 dark:text-gray-300">
            <strong>Date & Time:</strong> {new Date(data.appointment.date).toLocaleDateString()} at {data.appointment.time}
          </p>
        </div>
      )}

      <div className="space-y-6">
        {/* Required Fields */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* First Name */}
          <div>
            <label htmlFor="firstName" className="block text-sm font-medium text-gray-900 dark:text-white">
              First Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              id="firstName"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className={`block w-full rounded-md bg-white px-3 py-1.5 text-base text-gray-900 outline outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6 dark:bg-white/5 dark:text-white dark:outline-white/10 dark:placeholder:text-gray-500 dark:focus:outline-indigo-500 ${
                errors.firstName ? 'border-red-500' : ''
              }`}
              placeholder="Enter your first name"
            />
            {errors.firstName && (
              <p className="mt-1 text-sm text-red-500">{errors.firstName}</p>
            )}
          </div>

          {/* Last Name */}
          <div>
            <label htmlFor="lastName" className="block text-sm font-medium text-gray-900 dark:text-white">
              Last Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              id="lastName"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className={`block w-full rounded-md bg-white px-3 py-1.5 text-base text-gray-900 outline outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6 dark:bg-white/5 dark:text-white dark:outline-white/10 dark:placeholder:text-gray-500 dark:focus:outline-indigo-500 ${
                errors.lastName ? 'border-red-500' : ''
              }`}
              placeholder="Enter your last name"
            />
            {errors.lastName && (
              <p className="mt-1 text-sm text-red-500">{errors.lastName}</p>
            )}
          </div>
        </div>

        {/* Optional Fields */}
        <div className="border-t border-gray-200 dark:border-gray-600 pt-6">
          <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-4">
            Optional Contact Information
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Email */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-900 dark:text-white">
                Email Address
              </label>
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={`mt-2 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 dark:bg-gray-800 dark:border-gray-600 dark:text-white ${
                  errors.email ? 'border-red-500' : ''
                }`}
                placeholder="your.email@example.com"
              />
              {errors.email && (
                <p className="mt-1 text-sm text-red-500">{errors.email}</p>
              )}
            </div>

            {/* Phone */}
            <div>
              <label htmlFor="phone" className="block text-sm font-medium text-gray-900 dark:text-white">
                Phone Number
              </label>
              <input
                type="tel"
                id="phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className={`mt-2 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 dark:bg-gray-800 dark:border-gray-600 dark:text-white ${
                  errors.phone ? 'border-red-500' : ''
                }`}
                placeholder="+1 (555) 123-4567"
              />
              {errors.phone && (
                <p className="mt-1 text-sm text-red-500">{errors.phone}</p>
              )}
            </div>
          </div>
        </div>

        {/* Notes */}
        <div>
          <label htmlFor="notes" className="block text-sm font-medium text-gray-900 dark:text-white">
            Additional Notes
          </label>
          <textarea
            id="notes"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="mt-2 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 dark:bg-gray-800 dark:border-gray-600 dark:text-white"
            placeholder="Any additional information about your appointment..."
          />
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Optional: Include any symptoms, concerns, or special requests
          </p>
        </div>
      </div>

      {/* Navigation buttons */}
      <div className="mt-8 flex justify-between">
        <button
          onClick={onPrev}
          className="rounded-md bg-gray-300 dark:bg-gray-600 px-3 py-2 text-sm font-semibold text-gray-900 dark:text-white shadow-sm hover:bg-gray-400 dark:hover:bg-gray-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-500"
        >
          Back: Select Time
        </button>
        
        <button
          onClick={handleNext}
          disabled={!canContinue}
          className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-indigo-500 dark:hover:bg-indigo-400"
        >
          Review & Confirm
        </button>
      </div>
    </div>
  );
}

export { Step3PatientInfo }
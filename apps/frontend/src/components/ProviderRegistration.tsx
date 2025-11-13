import React, { useState } from 'react';

export interface ProviderFormData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
}

interface ProviderRegistrationFormProps {
  onSubmit: (formData: ProviderFormData) => Promise<void>;
}

export const ProviderRegistrationForm: React.FC<ProviderRegistrationFormProps> = ({ onSubmit }) => {
  const [formData, setFormData] = useState<ProviderFormData>({
    firstName: '',
    lastName: '',
    email: '',
    phone: ''
  });
  const [loading, setLoading] = useState<boolean>(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setLoading(true);
    
    try {
      await onSubmit(formData);
    } catch (error) {
      console.error('Registration submission failed:', error);
    } finally {
      setLoading(false);
    }
  }

  function handleInputChange(field: keyof ProviderFormData, value: string): void {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  }

  return (
    <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
      <h3 className="text-xl font-semibold text-white mb-4">Register as Healthcare Provider</h3>
      
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-gray-300 text-sm font-medium mb-1">
            First Name *
          </label>
          <input
            type="text"
            value={formData.firstName}
            onChange={(e) => handleInputChange('firstName', e.target.value)}
            required
            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
          />
        </div>

        <div>
          <label className="block text-gray-300 text-sm font-medium mb-1">
            Last Name *
          </label>
          <input
            type="text"
            value={formData.lastName}
            onChange={(e) => handleInputChange('lastName', e.target.value)}
            required
            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
          />
        </div>

        <div>
          <label className="block text-gray-300 text-sm font-medium mb-1">
            Email Address *
          </label>
          <input
            type="email"
            value={formData.email}
            onChange={(e) => handleInputChange('email', e.target.value)}
            required
            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
          />
        </div>

        <div>
          <label className="block text-gray-300 text-sm font-medium mb-1">
            Phone Number
          </label>
          <input
            type="tel"
            value={formData.phone}
            onChange={(e) => handleInputChange('phone', e.target.value)}
            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
          />
        </div>

        <div className="pt-4">
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white py-2 px-4 rounded-lg transition-colors"
          >
            {loading ? 'Registering...' : 'Register as Provider'}
          </button>
        </div>
      </form>

      <p className="text-gray-400 text-sm mt-4">
        After registration, you'll be able to access the full EasyAppointments provider dashboard to manage your schedule and admins.
      </p>
    </div>
  );
};
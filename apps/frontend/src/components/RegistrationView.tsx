import React, { useState } from 'react';
import { NostrAuthService } from '../services/auth';

interface RegistrationViewProps {
  pubkey: string;
  onRegistrationComplete?: (user: any) => void;
}

interface RegistrationForm {
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
}

export const RegistrationView: React.FC<RegistrationViewProps> = ({ 
  pubkey, 
  onRegistrationComplete 
}) => {
  const [form, setForm] = useState<RegistrationForm>({
    firstName: '',
    lastName: '',
    email: '',
    phoneNumber: ''
  });
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setForm(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // Validate required fields
      if (!form.firstName.trim() || !form.lastName.trim() || !form.email.trim()) {
        throw new Error('Please fill in all required fields');
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(form.email)) {
        throw new Error('Please enter a valid email address');
      }

      const token = localStorage.getItem('admin_token');
      if (!token) {
        throw new Error('Authentication token not found');
      }

      // Use the auth service method instead of raw fetch
      const user = await NostrAuthService.registerUser({
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim(),
        phoneNumber: form.phoneNumber.trim() || undefined,
        nostr_pubkey: pubkey
      }, token);

      // Registration successful
      if (onRegistrationComplete) {
        onRegistrationComplete(user);
      }

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
      <div className="bg-gray-800 rounded-xl shadow-xl border border-gray-700 max-w-md w-full">
        <div className="p-8">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold text-white mb-2">🏥 Complete Registration</h1>
            <p className="text-gray-400">Register as an admin user</p>
          </div>
          
          <div className="mb-6">
            <div className="bg-gray-700 p-4 rounded-lg">
              <h3 className="text-white font-semibold mb-2">Authenticated Identity</h3>
              <p className="text-gray-300 text-xs break-all font-mono">{pubkey}</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                First Name *
              </label>
              <input
                type="text"
                name="firstName"
                value={form.firstName}
                onChange={handleInputChange}
                required
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Enter your first name"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Last Name *
              </label>
              <input
                type="text"
                name="lastName"
                value={form.lastName}
                onChange={handleInputChange}
                required
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Enter your last name"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Email Address *
              </label>
              <input
                type="email"
                name="email"
                value={form.email}
                onChange={handleInputChange}
                required
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Enter your email address"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Phone Number
              </label>
              <input
                type="tel"
                name="phoneNumber"
                value={form.phoneNumber}
                onChange={handleInputChange}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Enter your phone number"
              />
            </div>

            {error && (
              <div className="bg-red-900 border border-red-600 p-3 rounded-lg">
                <p className="text-red-200 text-sm">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-medium py-3 px-4 rounded-lg transition-colors"
            >
              {loading ? 'Registering...' : 'Complete Registration'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-gray-400 text-xs">
              * Required fields
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
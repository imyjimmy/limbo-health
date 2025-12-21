import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { NostrAuthService } from '@/services/auth';

export function LoginPage() {
  const { setSession } = useAuth()
  const [activeTab, ] = useState<'patient' | 'doctor'>('patient');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      // TODO: Implement email/password authentication
      console.log('Email login attempt:', { email, password, userType: activeTab });
      
      // Simulate login for now
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Call parent's onLogin callback
      // onLogin();
    } catch (error) {
      console.error('Login failed:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleNostrLogin = async () => {
    try {
      const { metadata, pubkey, token } = await NostrAuthService.login('provider');
      
      // Store credentials
      localStorage.setItem('admin_token', token);
      localStorage.setItem('admin_pubkey', pubkey);
      localStorage.setItem('admin_profile', JSON.stringify(metadata));

      // Check if user is registered
      const registrationCheck = await NostrAuthService.checkUserRegistration(pubkey, token);
      
      if (registrationCheck.isRegistered) {
      // Existing user - login normally
        setSession(token, pubkey, { ...metadata, pubkey }, 'provider', {
          dashboard: false,
          billing: false,
          services: false,
          telehealth: false
        });
      } else {
        // New user - login but flag needs onboarding
        setSession(token, pubkey, { ...metadata, pubkey }, 'provider', {
          dashboard: true,
          billing: true,
          services: true,
          telehealth: true
        });
      }
    } catch (error) {
      console.error('Nostr login failed:', error);
      alert('Please install a Nostr browser extension like nos2x');
    }
  };

  const handleGoogleLogin = async () => {
    try {
      const response = await fetch('/api/google/login/start?userType=provider');
      
      const data = await response.json();
      
      if (data.success && data.authUrl) {
        // Redirect to Google OAuth
        window.location.href = data.authUrl;
      } else {
        console.error('Failed to get Google auth URL');
        // Could show error toast/alert here
      }
    } catch (error) {
      console.error('Google login error:', error);
      // Could show error toast/alert here
    }
  };

  return (
    <div className="min-h-screen bg-[#F7F5F3] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-[#37322F] mb-2">Welcome to Limbo Health</h1>
          <p className="text-[rgba(55,50,47,0.80)]">Sign in to your Doctor Dashboard</p>
        </div>

        {/* Login Form Card */}
        <div className="bg-white rounded-xl shadow-lg border border-[rgba(55,50,47,0.06)] overflow-hidden">
          {/* Form Content */}
          <div className="p-6">
            <form onSubmit={handleEmailLogin} className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-[#37322F] mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  id="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-2 border border-[rgba(55,50,47,0.20)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#37322F] focus:border-transparent"
                  placeholder="Enter your email"
                  required
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-[#37322F] mb-1">
                  Password
                </label>
                <input
                  type="password"
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3 py-2 border border-[rgba(55,50,47,0.20)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#37322F] focus:border-transparent"
                  placeholder="Enter your password"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-[#37322F] text-white py-2.5 px-4 rounded-lg font-medium hover:bg-[rgba(55,50,47,0.90)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Signing in...' : 'Sign In'}
              </button>
            </form>
            
            {/* Sign Up Link */}
            <div className="mt-6">
              <p className="text-sm text-[rgba(55,50,47,0.60)]">
                New user?{' '}
                <Link to="/signup" className="text-[#37322F] font-medium hover:underline">
                  Sign Up
                </Link>
              </p>
            </div>

            {/* Divider */}
            <div className="my-6 flex items-center">
              <div className="flex-1 border-t border-[rgba(55,50,47,0.12)]"></div>
              <span className="px-4 text-sm text-[rgba(55,50,47,0.60)]">or continue with</span>
              <div className="flex-1 border-t border-[rgba(55,50,47,0.12)]"></div>
            </div>

            {/* Alternative Login Options */}
            <div className="space-y-3 flex flex-col items-center">
              <button
                onClick={handleNostrLogin}
                className="w-full flex items-center justify-center gap-3 py-2.5 px-4 border-2 border-[#8d45dd] rounded-lg hover:bg-[#f2f2f2] transition-colors"
              >
                <span className="text-lg">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 875 875" width="24" height="24" className="me-3" >
                  <path className="cls-1" fill="#8d45dd" d="M684.72 485.57c.22 12.59-11.93 51.47-38.67 81.3s-56.02 20.85-58.42 20.16-3.09-4.46-7.89-3.77-9.6 6.17-18.86 7.2-17.49 
                  1.71-26.06-1.37c-4.46.69-5.14.71-7.2 2.24s-17.83 10.79-21.6 11.47c0 7.2-1.37 44.57 0 55.89s3.77 25.71 7.54 36 2.74 10.63 7.54 
                  9.94 13.37.34 15.77 4.11 1.37 6.51 5.49 8.23 60.69 17.14 99.43 19.2c26.74.69 42.86 2.74 52.12 19.54 1.37 7.89 7.54 13.03 11.31 
                  14.06s8.23 2.06 12 5.83 1.03 8.23 5.49 11.66 14.74 8.57 25.37 13.71 15.09 13.37 15.77 16.11 1.71 10.97 1.71 10.97-8.91 
                  0-10.97-2.06-2.74-5.83-2.74-5.83-6.17 1.03-7.54 3.43.69 2.74-7.89.69-11.66-3.77-18.17-8.57-16.46-17.14-25.03-16.8c4.11 8.23 5.83 
                  8.23 10.63 10.97s8.23 5.83 8.23 5.83l-7.2 4.46s-4.46 2.06-14.74-.69-11.66-4.46-12.69-10.63 
                  0-9.26-2.74-14.4-4.11-15.77-22.29-21.26c-18.17-5.49-66.52-21.26-100.12-24.69s-22.63-2.74-28.11-1.37-15.77 
                  4.46-26.4-1.37-16.8-13.71-17.49-20.23-1.71-10.97 0-19.2 3.43-19.89 1.71-26.74-14.06-55.89-19.89-64.12c-13.03 
                  1.03-50.74-.69-50.74-.69s-2.4-.69-17.49 5.83-36.48 13.76-46.77 19.93-14.4 9.7-16.12 13.13c.12 3-1.23 7.72-2.79 9.06s-12.48 
                  2.42-12.48 2.42-5.85 5.86-8.25 9.97c-6.86 9.6-55.2 125.14-66.52 149.83-13.54 32.57-9.77 27.43-37.71 27.43s-8.06.3-8.06.3-12.34 
                  5.88-16.8 5.88-18.86-2.4-26.4 0-16.46 9.26-23.31 10.29-4.95-1.34-8.38-3.74c-4-.21-14.27-.12-14.27-.12s1.74-6.51 7.91-10.88c8.23-5.83 
                  25.37-16.11 34.63-21.26s17.49-7.89 23.31-9.26 18.51-6.17 30.51-9.94 19.54-8.23 29.83-31.54 50.4-111.43 51.43-116.23c.63-2.96 
                  3.73-6.48 4.8-15.09.66-5.35-2.49-13.04 1.71-22.63 10.97-25.03 21.6-20.23 26.4-20.23s17.14.34 26.4-1.37 15.43-2.74 24.69-7.89 
                  11.31-8.91 11.31-8.91l-19.89-3.43s-18.51.69-25.03-4.46-15.43-15.77-15.43-15.77l-7.54-7.2 1.03 
                  8.57s-5.14-8.91-6.51-10.29-8.57-6.51-11.31-11.31-7.54-25.03-7.54-25.03l-6.17 13.03-1.71-18.86-5.14 7.2-2.74-16.11-4.8 
                  8.23-3.43-14.4-5.83 4.46-2.4-10.29-5.83-3.43s-14.06-9.26-16.46-9.6-4.46 3.43-4.46 3.43l1.37 12-12.2-6.27-7-11.9s2.36 4.01-9.62 
                  7.53c-20.55 0-21.89-2.28-24.93-3.94-1.31-6.56-5.57-10.11-5.57-10.11h-20.57l-.34-6.86-7.89 3.09.69-10.29h-14.06l1.03-11.31h-8.91s3.09-9.26 
                  25.71-22.97 25.03-16.46 46.29-17.14c21.26-.69 32.91 2.74 46.29 8.23s38.74 13.71 43.89 17.49c11.31-9.94 28.46-19.89 34.29-19.89 1.03-2.4 6.19-12.33 17.96-17.6 
                  35.31-15.81 108.13-34 131.53-35.54 31.2-2.06 7.89-1.37 39.09 2.06s54.17 7.54 69.6 12.69c12.58 4.19 25.03 9.6 34.29 2.06 4.33-1.81 11.81-1.34 17.83-5.14 
                  30.69-25.09 34.72-32.35 43.63-41.95s20.14-24.91 22.54-45.14 4.46-58.29-10.63-88.12-28.8-45.26-34.63-69.26-8.23-61.03-6.17-73.03 5.14-22.29 6.86-30.51 9.94-14.74 
                  19.89-16.46c9.94-1.71 17.83 1.37 22.29 4.8s11.65 6.28 13.37 10.29c.34 1.71-1.37 6.51 8.23 8.23 9.6 1.71 16.05 4.16 16.05 4.16s15.64 4.29 3.11 7.73c-12.69 
                  2.06-20.52-.71-24.29 1.69s-7.21 10.08-9.61 11.1-7.2.34-12 4.11-9.6 6.86-12.69 14.4-5.49 15.77-3.43 26.74 8.57 31.54 14.4 43.2 20.23 40.8 24.34 47.66 15.77 29.49 
                  16.8 53.83 1.03 44.23 0 54.86-10.84 51.65-35.53 85.94c-8.16 14.14-23.21 31.9-24.67 35.03-1.45 3.13-3.02 4.88-1.61 7.65 4.62 9.05 12.87 22.13 14.71 29.22 2.29 
                  6.64 6.99 16.13 7.22 28.72Z">
                    </path>
                  </svg>
                </span>
                <span className="text-sm font-medium text-gray-700">Login with Nostr</span>
              </button>

              <button
                onClick={handleGoogleLogin}
                className="w-full flex items-center justify-center gap-3 py-2.5 px-4 border-2 border-gray-500 rounded-lg hover:border-gray-600 hover:bg-[#f2f2f2] transition-colors"
              >
                <span className="text-lg">
                  <svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 0 24 24" width="24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  <path d="M1 1h22v22H1z" fill="none"/>
                  </svg>
                </span>
                <span className="text-sm font-medium text-[#37322F]">Login with Google</span>
              </button>

              {/* <button
                onClick={handleLinkedInLogin}
                className="w-full flex items-center justify-center gap-3 py-2.5 px-4 border-2 border-[#0072b1] rounded-lg hover:bg-[#f2f2f2] transition-colors" 
              >
                <span>
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" data-supported-dps="24x24" fill="#0072b1" className="mercado-match" width="24" height="24" focusable="false">
                    <path d="M20.5 2h-17A1.5 1.5 0 002 3.5v17A1.5 1.5 0 003.5 22h17a1.5 1.5 0 001.5-1.5v-17A1.5 1.5 0 0020.5 2zM8 19H5v-9h3zM6.5 8.25A1.75 1.75 0 118.3 6.5a1.78 1.78 0 01-1.8 1.75zM19 19h-3v-4.74c0-1.42-.6-1.93-1.38-1.93A1.74 1.74 0 0013 14.19a.66.66 0 000 .14V19h-3v-9h2.9v1.3a3.11 3.11 0 012.7-1.4c1.55 0 3.36.86 3.36 3.66z"></path>
                  </svg>
                </span>
                <span className="text-sm font-medium text-gray-700">Sign in with LinkedIn</span>
              </button> */}
            </div>

            {/* Patient Portal Link */}
            <div className="mt-4 text-center">
              <p className="text-sm text-[rgba(55,50,47,0.60)]">
                Are you a patient?{' '}
                <a href="/patient" className="text-[#37322F] font-medium hover:underline">
                  Sign in here
                </a>
              </p>
            </div>
          </div>
        </div>

        {/* Back to Landing */}
        <div className="mt-6 text-center">
          <Link to="/" className="text-sm text-[rgba(55,50,47,0.60)] hover:text-[#37322F] hover:underline">
            ← Back to Plebdoc
          </Link>
        </div>
      </div>
    </div>
  );
}
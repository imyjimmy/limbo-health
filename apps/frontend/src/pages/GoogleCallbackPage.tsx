import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

export function GoogleCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { role, setSession } = useAuth();

  useEffect(() => {
    const token = searchParams.get('token');
    const email = searchParams.get('email');
    const isNewUser = searchParams.get('new_user') === 'true';
    const error = searchParams.get('error');

    console.log('🔍 GoogleCallbackPage params:', { token: token?.substring(0, 20), email, isNewUser, error });

    if (error) {
      console.error('Google login error:', error);
      navigate('/login?error=' + encodeURIComponent(error));
      return;
    }

    if (token && email) {
      console.log('✅ Logging in with Google token');
      // Login with Google token
      // Note: pubkey is empty string for Google OAuth users
      setSession(token, '', { 
          email, 
          loginMethod: 'google',
          isNewUser 
        }, 
        role, 
        isNewUser ? ({
          dashboard: true,
          billing: true,
          services: true,
          telehealth: true
        }) : ({
          dashboard: false,
          billing: false,
          services: false,
          telehealth: false
        }));
      console.log('✅ Navigating to dashboard');
      // Redirect to dashboard
      navigate('/dashboard');
    } else {
      console.log('❌ Missing token or email, redirecting to login');
      navigate('/login?error=invalid_callback');
    }
  }, []);

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto"></div>
        <p className="mt-4 text-gray-600 font-medium">Completing Google sign-in...</p>
      </div>
    </div>
  );
}
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { GoogleProfile, NostrProfile } from '@/types';
import { getDisplayName, getProfilePicture } from '@/lib/utils';

interface HeaderProps {
  isAuthenticated: boolean;
  profile: GoogleProfile | NostrProfile | null;
  onLogout: () => void;
  compact?: boolean;
}

export const Header: React.FC<HeaderProps> = ({ 
  isAuthenticated, 
  profile, 
  onLogout, 
  compact = true 
}) => {
  const navigate = useNavigate();

  const handleNavigateToLogin = () => {
    console.log('handleGetStarted');
    navigate('/login');
  };

  const displayName = getDisplayName(profile);
  const profilePic = getProfilePicture(profile);

  const getInitials = (name: string) => {
    if (!name) return 'A';
    return name
      .split(' ')
      .map(word => word.charAt(0))
      .join('')
      .substring(0, 2)
      .toUpperCase();
  };
  
  const ProfilePicture = () => {
    if (profilePic) {
      return (
        <img
          className={`${compact ? 'w-6 h-6' : 'w-8 h-8'} rounded-full object-cover`}
          src={profilePic}
          alt="admin Profile"
          onError={(e) => {
            const target = e.target as HTMLImageElement;
            target.style.display = 'none';
            target.nextElementSibling?.classList.remove('hidden');
          }}
        />
      );
    }
    
    return (
      <div className={`${compact ? 'w-6 h-6 text-xs' : 'w-8 h-8 text-sm'} rounded-full bg-gradient-to-br from-blue-500 to-purple-600 text-white flex items-center justify-center font-semibold`}>
        {getInitials(displayName)}
      </div>
    );
  };
  
  return (
    <div className="flex items-center gap-2 justify-end m-4">
      {isAuthenticated ? (
        <>
          <ProfilePicture />
          <span className="text-sm hidden sm:inline">{displayName}</span>
          <button
            onClick={onLogout}
            className="text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 px-2 py-1 rounded transition-colors"
          >
            Logout
          </button>
        </>
      ) : (
        <button
          onClick={handleNavigateToLogin}
          className="text-xs bg-[#37322F] hover:bg-[#262320] text-white px-3 py-1 rounded transition-colors"
        >
          Doctor Portal
        </button>
      )}
    </div>
  );
};
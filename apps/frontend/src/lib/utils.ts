import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { GoogleProfile, NostrProfile } from '@/types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function isNostrProfile(profile: any): profile is NostrProfile {
  // Check if profile came from Nostr login
  return profile.pubkey !== undefined;
}

export function isGoogleProfile(profile: any): profile is GoogleProfile {
  // Check if profile came from Google login
  return profile.loginMethod === 'google' || 
         profile.oauthProvider === 'google' ||
         (!profile.pubkey && profile.email);  // Has email but no pubkey
}

export function getDisplayName(profile: GoogleProfile | NostrProfile | null): string {
  if (!profile) return 'User';
  
  // Google profiles
  if (isGoogleProfile(profile)) {
    // Try full name first
    const fullName = `${profile.firstName || ''} ${profile.lastName || ''}`.trim();
    if (fullName) return fullName;
    
    // Fallback to email prefix
    if (profile.email) {
      return profile.email.split('@')[0];  // "imyjimmy" from "imyjimmy@gmail.com"
    }
  }
  
  // Nostr profiles
  if (isNostrProfile(profile)) {
    return profile.display_name || profile.name || 'User';
  }
  
  return 'User';
}

export function getInitials(profile: GoogleProfile | NostrProfile | null): string {
  if (!profile) return 'U';
  
  if (isGoogleProfile(profile)) {
    const firstInitial = profile.firstName?.[0]?.toUpperCase() || '';
    const lastInitial = profile.lastName?.[0]?.toUpperCase() || '';
    return `${firstInitial}${lastInitial}` || profile.email.slice(0,2).toUpperCase() || 'U';
  }
  
  // For Nostr profile, take first 2 letters of display_name or name
  const name = profile.display_name || profile.name || 'User';
  return name.slice(0, 2).toUpperCase();
}

export function getProfilePicture(profile: GoogleProfile | NostrProfile | null): string | undefined {
  console.log('getProfilePicture: ', profile);
  if (!profile) return undefined;
  
  if (isGoogleProfile(profile)) {
    const localProfile = localStorage.getItem('admin_profile') || '';
    return profile.profilePic || JSON.parse(localProfile).picture || '';
  }
  
  return profile.picture;
}

export function getEmail(profile: GoogleProfile | NostrProfile | null): string {
  if (!profile) return '';
  
  if (isGoogleProfile(profile)) {
    return profile.email || '';
  }
  
  // For Nostr, could show npub or nip05 if available
  return '';
}
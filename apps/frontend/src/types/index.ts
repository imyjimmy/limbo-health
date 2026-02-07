export interface GoogleProfile {
  id?: string;
  userId: number;
  profilePic?: string;
  picture?: string;
  email: string;
  loginMethod: 'google';
  oauthProvider?: 'google';
  firstName?: string;
  lastName?: string;
  username?: string;
};

export interface NostrProfile {
  display_name?: string;
  name?: string;
  picture?: string;
  pubkey: string;
  nip05?: string;
}

export type Profile = GoogleProfile | NostrProfile;

export interface AuthState {
  isAuthenticated: boolean;
  token: string | null;
  pubkey: string | null;
  profile: GoogleProfile | NostrProfile | null;
  role: 'patient' | 'provider' | null;
  needsOnboarding: {
    dashboard: boolean;
    billing: boolean;
    services: boolean;
    telehealth: boolean;
  };
}

export function isGoogleProfile(profile: GoogleProfile | NostrProfile | null): profile is GoogleProfile {
  if (!profile) return false;
  return 'email' in profile && 'firstName' in profile;
}

export function isNostrProfile(profile: GoogleProfile | NostrProfile | null): profile is NostrProfile {
  if (!profile) return false;
  return 'name' in profile || 'display_name' in profile;
}

export function getDisplayName(profile: GoogleProfile | NostrProfile | null): string {
  if (!profile) return 'Unknown User';
  
  if (isGoogleProfile(profile)) {
    return `${profile.firstName} ${profile.lastName}`.trim();
  }
  
  if (isNostrProfile(profile)) {
    return profile.display_name || profile.name || 'Nostr User';
  }
  
  return 'Unknown User';
}

export function getEmail(profile: GoogleProfile | NostrProfile | null): string | null {
  if (!profile) return null;
  
  if (isGoogleProfile(profile)) {
    return profile.email;
  }
  
  // Nostr profiles might have nip05
  if (isNostrProfile(profile) && profile.nip05) {
    return profile.nip05;
  }
  
  return null;
}

export function getProfilePicture(profile: GoogleProfile | NostrProfile | null): string | null {
  if (!profile) return null;
  
  if (isGoogleProfile(profile)) {
    return profile.profilePic || profile.picture || null;
  }
  
  if (isNostrProfile(profile)) {
    return profile.picture || null;
  }
  
  return null;
}

export interface WebRTCState {
  isInRoom: boolean;
  connectionStatus: string;
  participantCount: number;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
}

export interface NostrEvent {
  kind: number;
  created_at: number;
  tags: string[][];
  content: string;
}

export interface SignedNostrEvent extends NostrEvent {
  id: string;
  sig: string;
}

declare global {
  interface Window {
    nostr?: {
      getPublicKey(): Promise<string>;
      signEvent(event: NostrEvent): Promise<SignedNostrEvent>;
      nip04: {
        encrypt(pubkey: string, plaintext: string): Promise<string>;
        decrypt(pubkey: string, ciphertext: string): Promise<string>;
      };
      nip44: {  // ← Add this
        encrypt(pubkey: string, plaintext: string): Promise<string>;
        decrypt(pubkey: string, ciphertext: string): Promise<string>;
      };
    };
  }
}

export interface UserInfo {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  timezone: string;
  language: string;
  id_roles: number;
  nostrPubkey: string;
  role?: {
    id: number;
    name: string;
    slug: string;
  };
}
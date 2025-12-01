export interface GoogleProfile {
  id?: string;
  userId: number;
  profilePic?: string;
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
}

export interface AuthState {
  isAuthenticated: boolean;
  token: string | null;
  pubkey: string | null;
  profile: GoogleProfile | NostrProfile | null;
  needsOnboarding: {
    dashboard: boolean;
    billing: boolean;
    services: boolean;
    telehealth: boolean;
  };
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
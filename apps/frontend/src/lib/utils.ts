import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { GoogleProfile, NostrProfile } from '@/types';
import * as ed from '@noble/ed25519';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';

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

export async function generateOrRetrieveEd25519Keys(
  nostrPubkey: string,
  token: string
): Promise<{ privateKey: string; publicKey: string }> {
  
  if (!window.nostr) {
    throw new Error('Nostr signer not available');
  }

  // Check sessionStorage first
  const cachedPrivKey = sessionStorage.getItem('mgit_ed25519_privkey');
  const cachedPubKey = sessionStorage.getItem('mgit_ed25519_pubkey');
  
  if (cachedPrivKey && cachedPubKey) {
    return { privateKey: cachedPrivKey, publicKey: cachedPubKey };
  }

  // Check if server has encrypted blob
  const response = await fetch('/api/mgit/keys', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  if (!response.ok) {
    throw new Error('Failed to fetch keys from server');
  }
  
  const data = await response.json();
  
  if (data.encryptedKey) {
    // Decrypt existing key (comes back as hex string)
    const privateKey = await window.nostr.nip04.decrypt(
      nostrPubkey,
      data.encryptedKey
    );
    
    // Get public key from private key
    const privateKeyBytes = hexToBytes(privateKey);
    const publicKeyBytes = await ed.getPublicKey(privateKeyBytes);
    const publicKey = bytesToHex(publicKeyBytes);
    
    // Cache in sessionStorage
    sessionStorage.setItem('mgit_ed25519_privkey', privateKey);
    sessionStorage.setItem('mgit_ed25519_pubkey', publicKey);
    
    return { privateKey, publicKey };
    
  } else {
    // First login - generate new keypair
    const privateKeyBytes = ed.utils.randomSecretKey(); // Generate as bytes
    const privateKey = bytesToHex(privateKeyBytes);
    
    const publicKeyBytes = await ed.getPublicKey(privateKeyBytes); // Pass bytes
    const publicKey = bytesToHex(publicKeyBytes);
    
    // Encrypt private key (hex string) with Nostr
    const encrypted = await window.nostr.nip04.encrypt(
      nostrPubkey,
      privateKey
    );
    
    // Send to server
    const saveResponse = await fetch('/api/mgit/keys', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        ed25519_pubkey: publicKey,
        encrypted_privkey: encrypted
      })
    });
    
    if (!saveResponse.ok) {
      throw new Error('Failed to save keys to server');
    }
    
    // Cache in sessionStorage
    sessionStorage.setItem('mgit_ed25519_privkey', privateKey);
    sessionStorage.setItem('mgit_ed25519_pubkey', publicKey);
    
    return { privateKey, publicKey };
  }
}
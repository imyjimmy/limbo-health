import crypto from 'crypto';
import { validateEvent, verifyEvent } from 'nostr-tools/pure';
import { fetchNostrMetadata } from '../utils/nostr-metadata.js';

export class NostrAuthService {
  constructor() {
    this.pendingChallenges = new Map();
    
    // Clean up old challenges every 5 minutes
    setInterval(() => this.cleanupChallenges(), 5 * 60 * 1000);
  }
  
  generateChallenge() {
    const challenge = crypto.randomBytes(32).toString('hex');
    
    this.pendingChallenges.set(challenge, {
      timestamp: Date.now(),
      verified: false
    });
    
    console.log('Generated Nostr challenge:', challenge);
    
    return { challenge };
  }
  
  async verifySignedEvent(signedEvent) {
    console.log('Received Signed Event:', signedEvent);
    
    // Validate event format
    if (!validateEvent(signedEvent)) {
      return { valid: false, error: 'Invalid event format' };
    }
    
    // Verify signature
    if (!verifyEvent(signedEvent)) {
      return { valid: false, error: 'Invalid signature' };
    }
    
    // Fetch metadata (optional, don't fail if unavailable)
    let metadata = null;
    try {
      console.log(`Fetching metadata for pubkey: ${signedEvent.pubkey}`);
      metadata = await fetchNostrMetadata(signedEvent.pubkey);
      
      if (metadata) {
        console.log('✅ Successfully fetched user metadata:', {
          name: metadata.name,
          display_name: metadata.display_name,
          has_picture: !!metadata.picture
        });
      }
    } catch (error) {
      console.warn('Failed to fetch Nostr metadata:', error.message);
    }
    
    return {
      valid: true,
      pubkey: signedEvent.pubkey,
      metadata
    };
  }
  
  cleanupChallenges() {
    const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
    
    for (const [challenge, data] of this.pendingChallenges.entries()) {
      if (data.timestamp < fiveMinutesAgo) {
        this.pendingChallenges.delete(challenge);
      }
    }
  }
}
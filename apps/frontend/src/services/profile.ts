import { ProviderProfile } from '../types/profile';
import { UserInfo } from '@/types';

class ProfileService {
  private baseUrl = window.location.origin;
  
  // Get current user's username
  async getCurrentUsername(token: string): Promise<{ username?: string, userId: string, email?: string, nostrPubkey?: string }> {
    const response = await fetch(`${this.baseUrl}/api/admin/me`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    // Handle 404 as "user exists but no profile yet"
    if (response.status === 404) {
      const errorData = await response.json();
      console.log('errorData: ', errorData);
      return { userId: '' };
    }
    
    // Handle other error statuses (401, 403, 500, etc.)
    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Failed to fetch user info: ${response.status} - ${error.error || 'Unknown error'}`);
    }
    
    return await response.json();
  }
  
  // Get profile (uses the same public endpoint OR creates empty profile)
  async getProfile(token: string): Promise<Partial<ProviderProfile & UserInfo>> {
    const meData = await this.getCurrentUsername(token);
    
    // If no username exists yet, return empty profile structure
    if (!meData.username) {
      const cachedProfile = JSON.parse(localStorage.getItem('admin_profile') || '{}');

      return {
        userId: Number(meData.userId),
        email: meData.email,
        nostrPubkey: meData.nostrPubkey,
        ...cachedProfile
      };
    }
    
    // If username exists, fetch full profile
    const profile = await this.getPublicProfile(meData.username);
    return { ...profile, email: meData.email, nostrPubkey: meData.nostrPubkey };
  }
  
  // Get public profile by username
  async getPublicProfile(username: string): Promise<ProviderProfile> {
    const response = await fetch(`${this.baseUrl}/api/admin/provider/${username}/profile`);
    
    if (!response.ok) {
      throw new Error('Failed to fetch public profile');
    }
    
    const data = await response.json();
    // Backend returns { status: 'success', profile: {...} }
    return data.profile || data;
  }
  
  // Update profile
  async updateProfile(token: string, profile: any): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/admin/provider/profile`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(profile)
    });

    if (!response.ok) {
      throw new Error('Failed to update profile');
    }
  }
}

export const profileService = new ProfileService();
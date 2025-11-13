// File: admin/src/services/settingsService.ts

interface UserSettings {
  id: number;
  first_name: string;
  last_name: string;
  email?: string;
  nwc_connection_string?: string;
  nostr_pubkey?: string;
}

interface NwcTestResult {
  success: boolean;
  error?: string;
  walletInfo?: {
    node?: {
      alias: string;
      pubkey: string;
    };
    balance?: number;
  };
}

class SettingsService {
  
  async getUserSettings(token: string): Promise<UserSettings> {
    const response = await fetch('/api/admin/user/settings', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error('Failed to fetch user settings');
    }

    return await response.json();
  }

  async updateNwcConnectionString(token: string, nwcString: string): Promise<void> {
    const response = await fetch('/api/admin/user/nwc-connection', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        nwc_connection_string: nwcString
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to update NWC connection string');
    }
  }

  async testNwcConnection(token: string, nwcString: string): Promise<NwcTestResult> {
    // Use the backend billing service for testing instead of frontend
    const response = await fetch('http://localhost:3005/api/admin/billing/test-nwc', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        nwc_connection_string: nwcString
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to test NWC connection');
    }

    return await response.json();
  }

  async getNwcConnectionString(token: string): Promise<string | null> {
    try {
      const settings = await this.getUserSettings(token);
      return settings.nwc_connection_string || null;
    } catch (error) {
      console.error('Failed to get NWC connection string:', error);
      return null;
    }
  }
}

export const settingsService = new SettingsService();
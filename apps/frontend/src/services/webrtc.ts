class WebRTCService {
  private baseUrl = window.location.origin;
  private isGuestMode = false;

  setGuestMode(enabled: boolean) {
    this.isGuestMode = enabled;
  }

  private getUrl(path: string): string {
    const url = `${this.baseUrl}${path}`;
    return this.isGuestMode ? `${url}?guest=true` : url;
  }

  async joinRoom(roomId: string, token: string): Promise<{ participants: number, shouldInitiateOffer: boolean, userRole: any, joinOrder: number }> {
    const response = await fetch(this.getUrl(`/api/webrtc/rooms/${roomId}/join`), {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    const result = await response.json();
    
    return {
      participants: result.participants,
      shouldInitiateOffer: result.shouldInitiateOffer, // Use backend's determination
      userRole: result.userRole,
      joinOrder: result.joinOrder
    };
  }
  
  async leaveRoom(roomId: string, token: string): Promise<{ status: string, participants: number }> {
    const response = await fetch(this.getUrl(`/api/webrtc/rooms/${roomId}/leave`), {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    const result = await response.json();
    
    return {
      status: result.status,
      participants: result.participants
    };
  }

  async sendIceCandidate(roomId: string, candidate: RTCIceCandidate, token: string): Promise<void> {
    await fetch(this.getUrl(`/api/webrtc/rooms/${roomId}/ice-candidate`), {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ candidate })
    });
  }
  
  async getIceCandidates(roomId: string, token: string): Promise<{ candidates: any[] }> {
    const response = await fetch(this.getUrl(`/api/webrtc/rooms/${roomId}/ice-candidates`), {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    return await response.json();
  }
  
  async sendOffer(roomId: string, offer: RTCSessionDescriptionInit, token: string): Promise<void> {
    await fetch(this.getUrl(`/api/webrtc/rooms/${roomId}/offer`), {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ offer })
    });
  }

  async getOffer(roomId: string, token: string): Promise<{ offer: any }> {
    const response = await fetch(this.getUrl(`/api/webrtc/rooms/${roomId}/offer`), {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    return await response.json();
  }
  
  async getAnswer(roomId: string, token: string): Promise<{ answer: any }> {
    const response = await fetch(this.getUrl(`/api/webrtc/rooms/${roomId}/answer`), {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    return await response.json();
  }

  async sendAnswer(roomId: string, answer: RTCSessionDescriptionInit, token: string): Promise<void> {
    await fetch(this.getUrl(`/api/webrtc/rooms/${roomId}/answer`), {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ answer })
    });
  }
  
  createEventSource(roomId: string, token: string): EventSource {
    const baseUrl = this.getUrl(`/api/webrtc/rooms/${roomId}/events`);
    const separator = baseUrl.includes('?') ? '&' : '?';
    const eventSourceUrl = `${baseUrl}${separator}token=${encodeURIComponent(token)}`;
    console.log('🔗 EventSource URL:', eventSourceUrl);
    return new EventSource(eventSourceUrl);
  }
}

export const webrtcService = new WebRTCService();
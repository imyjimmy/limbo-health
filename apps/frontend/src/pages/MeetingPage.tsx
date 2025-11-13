import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { WebRTCTest } from '@/components/WebRTCTest';
import { webrtcService } from '@/services/webrtc';

interface MeetingPageProps {
  token: string;
}

export const MeetingPage = ({ token }: MeetingPageProps) => {
  const { roomId } = useParams();
  
  useEffect(() => {
    // Enable guest mode for public meeting access
    webrtcService.setGuestMode(true);
    
    return () => {
      // Disable guest mode on cleanup
      webrtcService.setGuestMode(false);
    };
  }, []);

  return (
    <div className="h-screen">
      <WebRTCTest 
        token={token} 
        initialRoomId={roomId}
        viewMode={'guest'}
      />
    </div>
  );
};
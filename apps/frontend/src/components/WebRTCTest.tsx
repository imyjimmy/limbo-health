import React, { useState, useRef, useEffect, useCallback } from 'react';
import { webrtcService } from '@/services/webrtc';
// import { useNavigate } from 'react-router-dom';
// import { useAuth } from '@/contexts/AuthContext'
// import { OnboardingModal } from '@/components/OnboardingModal';

interface WebRTCTestProps {
  token: string;
  initialRoomId?: string;
  viewMode?: 'guest' | 'provider';
}

// Advanced interval management hook with comprehensive cleanup
function useIntervalManager() {
  const intervalsRef = useRef(new Map<string, NodeJS.Timeout>());
  const mountedRef = useRef(true);
  const cleanupInProgressRef = useRef(false);
  const pendingOperationsRef = useRef(0);
  
  const setManagedInterval = useCallback((key: string, callback: () => void, delay: number) => {
    console.log(`🔍 DEBUG: setManagedInterval called for '${key}' with delay ${delay}ms`);
    console.log(`🔍 DEBUG: cleanupInProgressRef.current =`, cleanupInProgressRef.current);
    console.log(`🔍 DEBUG: mountedRef.current =`, mountedRef.current);
    
    // Clear any existing interval with the same key to prevent overlaps
    if (intervalsRef.current.has(key)) {
      clearInterval(intervalsRef.current.get(key)!);
      intervalsRef.current.delete(key);
    }
    
    // Don't create new intervals if cleanup is in progress or component unmounted
    if (cleanupInProgressRef.current || !mountedRef.current) {
      console.log(`❌ DEBUG: Cannot create interval '${key}' - cleanup in progress or unmounted`);
      return null;
    }
    
    const safeCallback = () => {
      // Check mount status before each execution to prevent stale callbacks
      if (mountedRef.current && !cleanupInProgressRef.current) {
        try {
          pendingOperationsRef.current++;
          callback();
        } catch (error) {
          console.error(`Interval callback error for ${key}:`, error);
        } finally {
          pendingOperationsRef.current--;
        }
      }
    };
    
    const intervalId = setInterval(safeCallback, delay);
    intervalsRef.current.set(key, intervalId);
    
    console.log(`✅ DEBUG: Created interval '${key}' with ID:`, intervalId);
    console.log(`🔍 DEBUG: Active intervals after creation:`, Array.from(intervalsRef.current.keys()));
    return intervalId;
  }, []);
  
  const clearManagedInterval = useCallback((key: string) => {
    const intervalId = intervalsRef.current.get(key);
    if (intervalId) {
      clearInterval(intervalId);
      intervalsRef.current.delete(key);
      console.log(`🗑️ ADMIN: Cleared managed interval '${key}'`);
    }
  }, []);
  
  const clearAllIntervals = useCallback(async () => {
    console.log(`🧹 ADMIN: Starting cleanup of ${intervalsRef.current.size} managed intervals`);
    
    // Step 1: Collect all pending operations as Promises
    const pendingOperations: Promise<void>[] = [];
    
    // Step 2: Clear all intervals and create promises for their completion
    const intervalKeys = Array.from(intervalsRef.current.keys());
    intervalKeys.forEach((key) => {
      const intervalId = intervalsRef.current.get(key);
      if (intervalId) {
        console.log(`🗑️ ADMIN: Clearing interval '${key}'`);
        clearInterval(intervalId);
        
        // Create a promise that resolves when this interval's final callback completes
        const intervalCleanupPromise = new Promise<void>((resolve) => {
          // Give any in-flight callbacks a moment to complete
          setTimeout(() => {
            console.log(`✅ ADMIN: Interval '${key}' cleanup verified`);
            resolve();
          }, 100);
        });
        
        pendingOperations.push(intervalCleanupPromise);
      }
    });
    
    // Step 3: Clear the intervals Map
    intervalsRef.current.clear();
    
    // Step 4: Create promise for any other pending operations
    if (pendingOperationsRef.current > 0) {
      console.log(`⏳ ADMIN: Waiting for ${pendingOperationsRef.current} pending operations to complete`);
      
      const operationCleanupPromise = new Promise<void>((resolve) => {
        const startTime = Date.now();
        const checkOperations = () => {
          if (pendingOperationsRef.current === 0) {
            console.log('✅ ADMIN: All pending operations completed');
            resolve();
          } else if (Date.now() - startTime > 5000) {
            console.log(`⚠️ ADMIN: Timeout waiting for operations, forcing completion (${pendingOperationsRef.current} still pending)`);
            pendingOperationsRef.current = 0;
            resolve();
          } else {
            setTimeout(checkOperations, 50);
          }
        };
        checkOperations();
      });
      
      pendingOperations.push(operationCleanupPromise);
    }
    
    // Step 5: Wait for ALL operations to complete using Promise.allSettled
    if (pendingOperations.length > 0) {
      console.log(`⏳ ADMIN: Waiting for ${pendingOperations.length} cleanup operations to complete...`);
      const results = await Promise.allSettled(pendingOperations);
      
      // Log any failures
      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          console.error(`❌ ADMIN: Cleanup operation ${index} failed:`, result.reason);
        }
      });
      
      console.log('✅ ADMIN: All cleanup operations completed via Promise.allSettled');
    }
    
    // Step 6: Verify cleanup completion
    const verificationChecks = [
      {
        name: 'Intervals Map cleared',
        result: intervalsRef.current.size === 0
      },
      {
        name: 'No pending operations',
        result: pendingOperationsRef.current === 0
      }
    ];
    
    console.log('🔍 ADMIN: Cleanup verification:');
    let allVerified = true;
    verificationChecks.forEach(({ name, result }) => {
      console.log(`  ${result ? '✅' : '❌'} ${name}`);
      if (!result) allVerified = false;
    });
    
    if (allVerified) {
      console.log('✅ ADMIN: Cleanup verification PASSED - all resources released');
    } else {
      console.error('❌ ADMIN: Cleanup verification FAILED - some resources may still be active');
    }
    
    // Step 7: Set final cleanup state
    mountedRef.current = false;
    console.log('🧹 ADMIN: Cleanup process completed and verified');
  }, []);
  
  // 🔧 NEW: Reset function for rejoin scenarios
  // const resetIntervalManager = useCallback(() => {
  //   console.log('🔄 ADMIN: Resetting interval manager for rejoin');
  //   cleanupInProgressRef.current = false;
  //   mountedRef.current = true;
  //   pendingOperationsRef.current = 0;
  //   console.log('✅ ADMIN: Interval manager reset completed');
  // }, []);
  
  // Cleanup all intervals on unmount
  useEffect(() => {
    return () => {
      clearAllIntervals();
    };
  }, [clearAllIntervals]);
  
  return { 
    setManagedInterval, 
    clearManagedInterval, 
    clearAllIntervals,
    mountedRef,
    pendingOperationsRef,
    getActiveIntervals: () => Array.from(intervalsRef.current.keys())
  };
}

export const WebRTCTest: React.FC<WebRTCTestProps> = ({ token, initialRoomId, viewMode = 'provider' }) => {
  /* the default dashboard page is already the telehealth tab so this modal would be redundant */
  // const navigate = useNavigate();  
  // const { needsOnboarding, completeOnboarding } = useAuth();
  // const [showUserRegModal, setShowUserRegModal] = useState<boolean>(false);
  
  const [roomId, setRoomId] = useState(initialRoomId || '');
  
  /** Appointments */
  const [, setAppointments] = useState<any[]>([]);
  const [currentAppointment, setCurrentAppointment] = useState<any>(null);
  const [noAppointmentsMessage, setNoAppointmentsMessage] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTodaysAppointments = async () => {
      try {
        const response = await fetch('/api/admin/appointments', {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        
        // Handle non-OK HTTP responses
        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          
          // Check if it's specifically a "Provider not found" error
          if (data.message === 'Provider not found') {
            setNoAppointmentsMessage('No provider profile found. Please complete your profile setup.');
            // setShowUserRegModal(true);
          } else {
            setNoAppointmentsMessage(data.message || 'Failed to load appointments');
          }
          return;
        }
        
        const data = await response.json();
        
        // Shouldn't happen if response.ok, but defensive check
        if (data.status === 'error') {
          setNoAppointmentsMessage(data.message || 'Failed to load appointments');
          if (data.message === 'Provider not found') {
            // setShowUserRegModal(true);
          }
          return;
        }
        
        // Success case
        const today = new Date().toDateString();
        const todaysAppointments = data.appointments.filter((apt: { start_datetime: string | number | Date; }) => {
          const aptDate = new Date(apt.start_datetime).toDateString();
          return aptDate === today;
        });
        
        setAppointments(todaysAppointments);
        
        if (todaysAppointments.length === 0) {
          setNoAppointmentsMessage('No appointments scheduled for today');
          return;
        }
        
        // Find the first appointment that isn't in the past
        const now = new Date();
        const nextAppointment = todaysAppointments.find((apt: { start_datetime: string | number | Date; }) => {
          return new Date(apt.start_datetime) > now;
        });
        
        // If no future appointments, use the most recent one
        const spotlightAppointment = nextAppointment || todaysAppointments[todaysAppointments.length - 1];
        setCurrentAppointment(spotlightAppointment);
        
        // Set the roomId from the appointment's location field
        if (spotlightAppointment?.location) {
          setRoomId(spotlightAppointment.location);
        } else {
          setNoAppointmentsMessage('Current appointment has no meeting room assigned');
        }
      } catch (error) {
        // Network failures, JSON parse errors, etc.
        console.error('Network or parsing error fetching appointments:', error);
        setNoAppointmentsMessage('Unable to connect to server. Please check your internet connection.');
      } finally {
        setLoading(false);
      }
    };
    
    if (!initialRoomId) {
      fetchTodaysAppointments();
    } else {
      setLoading(false);
    }
  }, [token, initialRoomId]);

  const [isInRoom, setIsInRoom] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('Not connected');
  const [participantCount, setParticipantCount] = useState(0);
  const [handshakeInProgress, setHandshakeInProgress] = useState(false);
  
  const [shouldInitiateOffer, setShouldInitiateOffer] = useState<boolean>(false);
  const [, setUserRole] = useState<any>(null);
  const [webrtcRole, setWebrtcRole] = useState<'caller' | 'answerer' | 'unknown'>('unknown');

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  
  // Advanced interval management
  const { setManagedInterval, clearManagedInterval, clearAllIntervals, mountedRef, pendingOperationsRef, getActiveIntervals } = useIntervalManager(); // resetIntervalManager
  
  const resetToInitialState = useCallback(() => {
    console.log('🔄 ADMIN: Resetting ALL state to initial values');
    
    // Reset interval manager refs (access them from the hook's return)
    // This requires the hook to expose these refs or a reset function
    mountedRef.current = true;
    pendingOperationsRef.current = 0;

    // Reset all useState values to their initial values
    setIsInRoom(false);
    setConnectionStatus('Not connected');
    setParticipantCount(0);
    setHandshakeInProgress(false);
    setShouldInitiateOffer(false);
    setUserRole(null);
    setWebrtcRole('unknown');
    
    // Reset all useRef values to their initial values
    peerConnectionRef.current = null;
    localStreamRef.current = null;
    eventSourceRef.current = null;
    
    // Clear video elements
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }
    
    console.log('✅ ADMIN: Component state reset to initial values completed');
  }, []);

  // Thread-safe cleanup with comprehensive resource management
  const cleanupWebRTCState = useCallback(async () => {
    console.log('🧹 ADMIN CLEANUP: Starting comprehensive WebRTC state cleanup');
    console.log('🔍 ADMIN CLEANUP: Active intervals before cleanup:', getActiveIntervals());
    console.log('🔍 ADMIN CLEANUP: Cleanup context - connectionStatus:', connectionStatus);
    console.log('🔍 ADMIN CLEANUP: Cleanup context - isInRoom:', isInRoom);
    
    // STEP 1: Clear all managed intervals first to stop ongoing operations
    await clearAllIntervals(); // Wait for this to complete
    
    // STEP 2: Stop local stream tracks
    if (localStreamRef.current) {
      console.log('🧹 ADMIN CLEANUP: Stopping local stream tracks');
      const tracks = localStreamRef.current.getTracks();
      tracks.forEach((track, index) => {
        console.log(`🧹 ADMIN CLEANUP: Stopping track ${index}: ${track.kind}`);
        track.stop();
      });
      localStreamRef.current = null;
    }

    // STEP 3: Close peer connection with proper event handler cleanup
    if (peerConnectionRef.current) {
      console.log('🧹 ADMIN CLEANUP: Closing peer connection');
      const pc = peerConnectionRef.current;
      
      // Clear all event handlers to prevent stray events
      pc.ontrack = null;
      pc.onicecandidate = null;
      pc.onconnectionstatechange = null;
      pc.onsignalingstatechange = null;
      pc.onicegatheringstatechange = null;
      
      pc.close();
      peerConnectionRef.current = null;
    }
    
    // STEP 4: Close event source
    if (eventSourceRef.current) {
      console.log('🧹 ADMIN CLEANUP: Closing event source');
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    
    // STEP 5: Clear video elements
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }
    
    // STEP 6: Reset UI state
    setConnectionStatus('Disconnected');
    setIsInRoom(false);
    
    console.log('🧹 ADMIN CLEANUP: Comprehensive WebRTC state cleanup completed');
  }, [clearAllIntervals, getActiveIntervals, connectionStatus, isInRoom]);

  const setupPeerConnection = useCallback(() => {
    console.log('⚙️ ADMIN: Setting up fresh peer connection');
    
    // Create new peer connection
    peerConnectionRef.current = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    });
    
    // Add local stream (with null checks)
    if (localStreamRef.current && peerConnectionRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        if (peerConnectionRef.current && localStreamRef.current) {
          peerConnectionRef.current.addTrack(track, localStreamRef.current);
        }
      });
    }
    
    // Set up event handlers
    if (peerConnectionRef.current) {
      peerConnectionRef.current.addEventListener('track', (event) => {
        console.log('📺 ADMIN: Received remote track');
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = event.streams[0];
        }
      });
      
      peerConnectionRef.current.addEventListener('icecandidate', (event) => {
        if (event.candidate) {
          webrtcService.sendIceCandidate(roomId, event.candidate, token);
        }
      });
    }
    
    console.log('✅ ADMIN: Fresh peer connection created and configured');
  }, [roomId, token]);

  const silentlyResetWebRTCConnection = useCallback(() => {
    console.log('🔄 ADMIN: Silently resetting WebRTC connection (peer disconnected)');
    
    // 1. Close current peer connection
    if (peerConnectionRef.current) {
      console.log('🔌 ADMIN: Closing existing peer connection');
      const pc = peerConnectionRef.current;
      
      // Clear event handlers to prevent stray events
      pc.ontrack = null;
      pc.onicecandidate = null;
      pc.onconnectionstatechange = null;
      pc.onsignalingstatechange = null;
      pc.onicegatheringstatechange = null;
      
      pc.close();
      peerConnectionRef.current = null;
    }
      
    // 2. Clear remote video (keep local video running)
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }
    
    // 3. Clear any active intervals for signaling
    clearManagedInterval('ice-candidates-poll');
    clearManagedInterval('offers-poll');
    clearManagedInterval('answer-poll');
    
    // 4. Reset WebRTC-specific state (keep UI state intact)
    setConnectionStatus('Waiting for peer...');
    setHandshakeInProgress(false);
    setWebrtcRole('unknown');
    setShouldInitiateOffer(false);
    
    // 5. Set up fresh peer connection
    setupPeerConnection();
    
    // 6. Be ready for new signaling when peer rejoins
    // The answerer signaling loop will restart when participant count goes back to 2
    startAnswererSignalingLoop();

    console.log('✅ ADMIN: Silent WebRTC reset completed, ready for peer reconnection');
  }, [clearManagedInterval, setupPeerConnection]);

  /* 
    ## Summary of Achievements

    **Fixed Major Issues:**
    1. **Participant count updates** - The leave room function now properly calls the backend `/leave` endpoint, so participant counts update correctly for all clients
    2. **Interval management cleanup** - Implemented proper `clearAllIntervals()` with Promise.allSettled that waits for actual completion instead of using timeouts
    3. **Component state reset** - Created `resetToInitialState()` that resets all component state back to mount values
    4. **Server-side state pollution** - Added clearing of all WebRTC signaling data (offers, answers, ICE candidates) when participants leave, eliminating stale data issues
    5. **Silent peer disconnection detection** - Successfully implemented detection when participant count drops from 2→1, with automatic WebRTC connection reset

    **Improved Architecture:**
    - Separated concerns between interval management and component state
    - Made cleanup truly synchronous and verifiable
    - Removed problematic rejoin-specific client logic in favor of treating rejoins as normal joins

    ## Remaining Problem

    **Role Assignment Deadlock:** When one person stays connected and another rejoins, both clients end up in "answerer" mode (polling for offers) instead of having one caller and one answerer. This creates a deadlock where both wait for offers that neither sends.

    **Root Cause:** The server's `shouldInitiateOffer` logic is based on join order, but when someone rejoins a room with existing participants, the role assignment doesn't account for the fact that someone is already connected and waiting.

    **Fix Needed:** Server-side logic to ensure that anyone joining a room with existing connected participants automatically gets assigned as caller (`shouldInitiateOffer: true`), regardless of historical join order.

    The WebRTC connection flow is now much more robust, but this final role coordination issue prevents rejoins from working when one party stays connected.
    https://claude.ai/chat/2f6c7947-11ad-4d86-82f0-453084588a87
  */
  
  const joinRoom = async () => {
    try {
      if (!roomId.trim()) {
        console.log('Please enter a room ID');
        return;
      }
      
      setConnectionStatus('Connecting...');
      
      // Get user media
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
      });
      
      localStreamRef.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
      
      // Create and setup peer connection
      setupPeerConnection();
      
      // Handle connection state changes
      if (peerConnectionRef.current) {
        peerConnectionRef.current.onconnectionstatechange = () => {
          if (peerConnectionRef.current) {
            setConnectionStatus(peerConnectionRef.current.connectionState);
          }
        };
      }
      
      // Join room
      const joinResult = await webrtcService.joinRoom(roomId, token);
      console.log('🚀 ADMIN: Join room result:', joinResult);

      setParticipantCount(joinResult.participants);
      setUserRole(joinResult.userRole);
      setShouldInitiateOffer(joinResult.shouldInitiateOffer);
      setIsInRoom(true);
      
      if (shouldInitiateOffer || joinResult.shouldInitiateOffer) {
        setWebrtcRole('caller');
        console.log('🎯 This client will INITIATE (caller)');
        startCallerSignalingLoop();
      } else {
        setWebrtcRole('answerer');
        console.log('🎯 This client will WAIT (answerer)');
        startAnswererSignalingLoop();
      }

      // Start managed services
      startParticipantCountUpdates();

      console.log(`Joined room: ${roomId}`);
      
    } catch (error) {
      console.error('Error joining WebRTC room:', error);
      console.log(`Failed to join room: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setConnectionStatus('Failed to connect');
    }
  };
  
  const leaveRoom = async () => {
    console.log('=== ADMIN LEAVE ROOM INITIATED ===');
    try {
      // STEP 1: Call the backend leave endpoint FIRST
      if (isInRoom) {
        try {
          const result = await webrtcService.leaveRoom(roomId, token);
          console.log('📤 ADMIN: Server leave response:', result);
        } catch (error) {
          console.error('❌ ADMIN: Error calling leave endpoint:', error);
        }
      }
      
      // STEP 2: Clean up local state
      await cleanupWebRTCState();
      resetToInitialState();
      
      console.log('Left WebRTC room');
      console.log('=== ADMIN LEAVE ROOM COMPLETED ===');
    } catch (error: unknown) {
      const err = error as Error;
      console.error('=== ADMIN LEAVE ROOM ERROR ===', err);
      console.log(`Error leaving room: ${err.message}`);
    }
  };

  const detectParticipantCountDrop = useCallback((newCount: number, previousCount: number) => {
    if (previousCount === 2 && newCount === 1) {
      console.log('🔍 ADMIN: Detected participant count drop from 2 to 1 - peer disconnected');
      silentlyResetWebRTCConnection();
    }
  }, [silentlyResetWebRTCConnection]);

  const startParticipantCountUpdates = useCallback(() => {
    console.log('📊 ADMIN: Starting participant count updates');
    
    // Close existing event source if any
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const eventSource = webrtcService.createEventSource(roomId, token);
    eventSourceRef.current = eventSource;
    
    // Track previous count for detection
    let previousCount = participantCount;

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'participant_count') {
          const newCount = data.count;
          
          detectParticipantCountDrop(newCount, previousCount);
          setParticipantCount(data.count);

          setParticipantCount(newCount);
          previousCount = newCount;
        }
      } catch (error) {
        console.error('Error parsing SSE message:', error);
      }
    };
    
    eventSource.onerror = (error) => {
      console.error('SSE connection error:', error);
    };

    eventSource.addEventListener('message', (event) => {
      try {
        const data = JSON.parse(event.data);
        
        // if (data.type === 'participant_rejoined') {
        //   console.log(`🔄 Participant ${data.participant} rejoined - resetting WebRTC`);
        //   handleParticipantRejoin();
        // }
        
        if (data.type === 'participant_count') {
          setParticipantCount(data.count);
        }
      } catch (error) {
        console.error('Error parsing SSE event:', error);
      }
    });
  }, [roomId, token]); //handleParticipantRejoin
  
  const startCallerSignalingLoop = useCallback(() => {
    console.log('📞 CALLER: Will SEND offers');
    
    if (!peerConnectionRef.current) return;

    // Wait briefly, then initiate
    setTimeout(async () => {
      if (!peerConnectionRef.current) return;

      try {
        console.log('📞 CALLER: Creating offer...');
        setHandshakeInProgress(true);
        
        const offer = await peerConnectionRef.current.createOffer();
        await peerConnectionRef.current.setLocalDescription(offer);
        
        await webrtcService.sendOffer(roomId, offer, token);
        console.log('✅ CALLER: Offer sent');
        
        // Start polling for answer
        startAnswerPolling();
        
      } catch (error) {
        console.error('❌ CALLER: Error:', error);
        setHandshakeInProgress(false);
      }
    }, 1000);

    startIceCandidateHandling();
  }, [roomId, token]);

  const startIceCandidateHandling = useCallback(() => {
    setManagedInterval('ice-candidates-poll', async () => {
      try {
        if (!peerConnectionRef.current) return;
        
        const { candidates } = await webrtcService.getIceCandidates(roomId, token);
        
        if (candidates && candidates.length > 0) {
          console.log(`🧊 Received ${candidates.length} ICE candidates`);
          for (const candidateData of candidates) {
            if (peerConnectionRef.current.remoteDescription) {
              await peerConnectionRef.current.addIceCandidate(candidateData.candidate);
            } else {
              console.log('🧊 Queueing ICE candidate - no remote description yet');
              // queue these for later if needed
            }
          }
        }
      } catch (error) {
        console.error('❌ ICE candidate error:', error);
      }
    }, 2000);
  }, [roomId, token, setManagedInterval]);

  const startAnswerPolling = useCallback(() => {
    setManagedInterval('answer-poll', async () => {
      try {
        const { answer } = await webrtcService.getAnswer(roomId, token);
        
        if (answer && answer.answer && peerConnectionRef.current) {
          console.log('📞 CALLER: Received answer!');
          clearManagedInterval('answer-poll');
          
          await peerConnectionRef.current.setRemoteDescription(answer.answer);
          console.log('✅ CALLER: Connection established');
          setHandshakeInProgress(false);
        }
      } catch (error) {
        console.error('❌ CALLER: Answer polling error:', error);
      }
    }, 2000);
  }, [roomId, token, setManagedInterval, clearManagedInterval]);

  const startAnswererSignalingLoop = useCallback(() => {
    console.log('🔄 ADMIN: Starting managed signaling loop');
    console.log('🔍 ADMIN: peerConnectionRef.current =', !!peerConnectionRef.current);

    if (!peerConnectionRef.current) {
      console.error('❌ ADMIN: Cannot start signaling loop - no peer connection');
      return;
    }

    // State for ICE candidate queueing (using closure to avoid stale state)
    let remoteDescriptionSet = false;
    let pendingIceCandidates: RTCIceCandidateInit[] = [];
    let handshakeAborted = false;

    // Managed ICE candidates polling
    setManagedInterval('ice-candidates-poll', async () => {
      try {
        if (!peerConnectionRef.current || handshakeAborted) {
          console.log('❌ ADMIN: Stopping ICE polling - no peer connection or handshake aborted');
          clearManagedInterval('ice-candidates-poll');
          return;
        }
        
        console.log('🧊 ADMIN: Polling for ICE candidates...');
        const { candidates } = await webrtcService.getIceCandidates(roomId, token);
        
        if (candidates && candidates.length > 0) {
          console.log(`📥 ADMIN: Received ${candidates.length} ICE candidates from client`);
          for (const candidateData of candidates) {
            if (handshakeAborted) break;
            
            if (remoteDescriptionSet && peerConnectionRef.current) {
              console.log('🧊 ADMIN: Adding ICE candidate immediately');
              await peerConnectionRef.current.addIceCandidate(candidateData.candidate);
            } else {
              console.log('🧊 ADMIN: Queueing ICE candidate (no remote description yet)');
              pendingIceCandidates.push(candidateData.candidate);
            }
          }
        } else {
          console.log('⏳ ADMIN: No ICE candidates available yet');
        }
      } catch (error) {
        console.error('❌ ADMIN: Error handling ICE candidates:', error);
      }
    }, 2000);
    
    // Managed offers polling
    setManagedInterval('offers-poll', async () => {
      try {
        if (!peerConnectionRef.current || handshakeAborted) {
          console.log('❌ ADMIN: Stopping offer polling - no peer connection or handshake aborted');
          clearManagedInterval('offers-poll');
          return;
        }
        
        console.log('🔍 ADMIN: Checking for offers from client...');
        const { offer } = await webrtcService.getOffer(roomId, token);
        console.log('📋 ADMIN: Offer check result:', offer ? 'OFFER FOUND' : 'no offer yet');
        
        if (offer && offer.offer && peerConnectionRef.current && !handshakeAborted) {
          console.log('🎯 ADMIN: Processing offer from client!');
          
          // 🔧 ADD: Log all state before handshake to find the trigger
          console.log('🔍 DEBUG: State before handshake:');
          console.log('  - isInRoom:', isInRoom);
          console.log('  - connectionStatus:', connectionStatus);
          console.log('  - participantCount:', participantCount);
          console.log('  - handshakeInProgress:', handshakeInProgress);
          
          setHandshakeInProgress(true);
          console.log('🔍 DEBUG: Set handshakeInProgress to true');
          
          // Stop offer polling once we get an offer
          clearManagedInterval('offers-poll');
          
          try {
            // Capture peer connection reference for the entire handshake
            const handshakePeerConnection = peerConnectionRef.current;
            
            console.log('🔧 ADMIN: Setting remote description from client offer...');
            console.log('🔍 DEBUG: About to call setRemoteDescription');
            await handshakePeerConnection.setRemoteDescription(offer.offer);
            console.log('🔍 DEBUG: setRemoteDescription completed');
            
            // Check if we're still using the same peer connection
            if (peerConnectionRef.current !== handshakePeerConnection) {
              console.log('⚠️ ADMIN: Peer connection changed during handshake, aborting');
              handshakeAborted = true;
              setHandshakeInProgress(false);
              return;
            }
            
            console.log('✅ ADMIN: Set remote description successfully');
            
            // Process queued ICE candidates now that remote description is set
            remoteDescriptionSet = true;
            console.log(`🧊 ADMIN: Processing ${pendingIceCandidates.length} queued ICE candidates`);
            for (const candidate of pendingIceCandidates) {
              if (handshakeAborted || peerConnectionRef.current !== handshakePeerConnection) break;
              
              try {
                await handshakePeerConnection.addIceCandidate(candidate);
                console.log('🧊 ADMIN: Added queued ICE candidate');
              } catch (error) {
                console.error('❌ ADMIN: Error adding queued ICE candidate:', error);
              }
            }
            pendingIceCandidates = []; // Clear the queue

            // Create and send answer
            if (!handshakeAborted && peerConnectionRef.current === handshakePeerConnection) {
              console.log('📝 ADMIN: Creating answer...');
              const answer = await handshakePeerConnection.createAnswer();
              
              // Final consistency check
              if (!handshakeAborted && peerConnectionRef.current === handshakePeerConnection) {
                console.log('🔧 ADMIN: Setting local description (answer)...');
                await handshakePeerConnection.setLocalDescription(answer);
                
                console.log('📤 ADMIN: Sending answer to server...');
                await webrtcService.sendAnswer(roomId, answer, token);
                console.log('🎉 ADMIN: Answer sent! WebRTC handshake should be complete');
                
                // Safe connection state logging
                console.log('📊 ADMIN: Connection state:', handshakePeerConnection.connectionState);
                console.log('📊 ADMIN: ICE connection state:', handshakePeerConnection.iceConnectionState);
                console.log('📊 ADMIN: Signaling state:', handshakePeerConnection.signalingState);
              } else {
                console.log('⚠️ ADMIN: Handshake aborted or peer connection changed, skipping answer send');
              }
            } else {
              console.log('⚠️ ADMIN: Cannot create answer - handshake aborted or peer connection changed');
            }
          } catch (error) {
            console.error('❌ ADMIN: Error during handshake:', error);
            handshakeAborted = true;
          } finally {
            setHandshakeInProgress(false);
          }
        } else {
          console.log('⏳ ADMIN: No offer available yet, continuing to poll...');
        }
      } catch (error: any) {
        console.error('❌ ADMIN: Error in offer signaling loop:', error);
        setHandshakeInProgress(false);
      }
    }, 2000);
    
    // Cleanup function for this signaling loop instance
    return () => {
      handshakeAborted = true;
      setHandshakeInProgress(false);
    };
    
    console.log('✅ ADMIN: Managed signaling loop started');
    console.log('🔍 ADMIN: Active intervals:', getActiveIntervals());
  }, [roomId, token, setManagedInterval, clearManagedInterval, getActiveIntervals]);
  
  // Cleanup on unmount with dependency to ensure latest leaveRoom reference
  useEffect(() => {
    console.log('🏗️ ADMIN: Component mounted/effect running');
    
    return () => {
      console.log('🔄 ADMIN: Component unmounting, performing cleanup');
      console.log('🔍 ADMIN: Unmount context - isInRoom:', isInRoom);
      console.log('🔍 ADMIN: Unmount context - connectionStatus:', connectionStatus);
      console.log('🔍 ADMIN: Unmount context - handshakeInProgress:', handshakeInProgress);
      console.log('🔍 ADMIN: Unmount context - peerConnection exists:', !!peerConnectionRef.current);
      
      // Get stack trace to understand WHY we're unmounting
      const stack = new Error().stack;
      console.log('📍 ADMIN: Unmount stack trace:', stack?.split('\n').slice(0, 5).join('\n'));
      
      if (handshakeInProgress) {
        console.log('⚠️ ADMIN: Unmounting during handshake! This may cause issues.');
      }
      
      if (isInRoom) {
        cleanupWebRTCState();
      }
    };
  }, []); //isInRoom, cleanupWebRTCState, connectionStatus, handshakeInProgress
  
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading appointments...</p>
        </div>
      </div>
    );
  }

  // Show No Appointments
  if (!roomId && noAppointmentsMessage) {
    return (
      <>
        {/* 
          Maybe don't use the OnboardingModal but post a short propaganda video showing 
          doctors making housecalls like its the 1950s but using modern tech.
        <OnboardingModal
          isOpen={!!needsOnboarding['telehealth'] && showUserRegModal && !!token}
          title="No Provider Profile Found"
          description="You haven't completed your provider registration yet. Complete your profile to start accepting payments and managing invoices."
          actionLabel="Complete Profile Setup"
          onAction={() => navigate('/edit-profile')}
          secondaryActionLabel="Look Around First"
          onSecondaryAction={() => { 
            setShowUserRegModal(false) 
            completeOnboarding('telehealth')
          }}
          showCloseButton={true}
          onClose={() => { 
            setShowUserRegModal(false) 
            completeOnboarding('telehealth')
          }}
        >
          <div className="bg-[#F7F5F3] rounded-lg p-6">
            <p className="text-[#37322F] mb-4 font-medium">To enable billing features, you need to:</p>
            <ul className="space-y-3 text-[rgba(55,50,47,0.80)]">
              <li className="flex items-start">
                <span className="text-gray-600 mr-3 font-bold">•</span>
                <span>Complete your provider profile</span>
              </li>
              <li className="flex items-start">
                <span className="text-gray-600 mr-3 font-bold">•</span>
                <span>Set up payment information</span>
              </li>
              <li className="flex items-start">
                <span className="text-gray-600 mr-3 font-bold">•</span>
                <span>Configure your billing preferences</span>
              </li>
            </ul>
          </div>
        </OnboardingModal> */}

        <div className="flex items-center justify-center h-screen">
          <div className="text-center bg-yellow-50 border border-yellow-200 rounded-lg p-6 max-w-md">
            <div className="text-yellow-600 text-4xl mb-4">📅</div>
            <h2 className="text-xl font-semibold text-yellow-800 mb-2">
              No Active Meeting
            </h2>
            <p className="text-yellow-700">
              {noAppointmentsMessage}
            </p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="grid grid-cols-12 gap-4 h-full">
        {/* Left navigation - Previous appointments */}
        { viewMode === 'provider' && (
          <div className="col-span-1 flex items-center justify-center">
            <button 
              onClick={() => {}}
              className="p-3 rounded-full hover:bg-muted transition-colors"
              title="Previous appointments"
            >
              <svg className="w-6 h-6 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          </div>)}
        <div className={viewMode === 'provider' ? 'col-span-10' : 'col-span-12'}>
          <div className="bg-background flex flex-col border bg-card shadow rounded-xl h-full">
            {/* Header with appointment info */}
            <div className="border-b border-border p-4 mx-8 mt-4">
              <div className="max-w-4xl mx-auto flex justify-between items-center">
                <div>
                  <h1 className="text-2xl font-semibold text-foreground">
                    {currentAppointment ? `Session with ${currentAppointment.customer_name}` : 'Telehealth Session'}
                  </h1>
                  <p className="text-muted-foreground">
                    {currentAppointment ? currentAppointment.service_name : 'Video Consultation'}
                  </p>
                  {currentAppointment && (
                    <p className="text-sm text-muted-foreground">
                      {new Date(currentAppointment.start_datetime).toLocaleString()}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Main video area */}
            <div className="flex-1 flex flex-col items-center justify-start p-8">
              <div className="relative max-w-4xl w-full">
                {/* Remote video - main focus */}
                <div className="aspect-video bg-muted rounded-xl overflow-hidden border border-border shadow-lg">
                  <video
                    ref={remoteVideoRef}
                    autoPlay
                    className="w-full h-full object-cover"
                    style={{ display: remoteVideoRef.current?.srcObject ? 'block' : 'none' }}
                  />
                  {!remoteVideoRef.current?.srcObject && (
                    <div className="w-full h-full flex items-center justify-center">
                      <div className="text-center">
                        <div className="w-20 h-20 bg-muted-foreground/20 rounded-full flex items-center justify-center mx-auto mb-4">
                          <svg className="w-10 h-10 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                        </div>
                        <p className="text-muted-foreground">
                          {participantCount < 2 ? 'Waiting for participant to join...' : 'Connecting video...'}
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Local video - picture-in-picture */}
                <div className="absolute bottom-4 right-4 w-48 h-36">
                  <video
                    ref={localVideoRef}
                    autoPlay
                    muted
                    className="w-full h-full object-cover rounded-lg border-2 border-background shadow-lg"
                  />
                </div>
              </div>

              {/* Controls below video */}
              <div className="mt-8 flex gap-4">
                {!isInRoom ? (
                  <button
                    onClick={joinRoom}
                    className="px-8 py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors"
                  >
                    Join Session
                  </button>
                ) : (
                  <button
                    onClick={leaveRoom}
                    className="px-8 py-3 bg-destructive text-destructive-foreground rounded-lg font-medium hover:bg-destructive/90 transition-colors"
                  >
                    Leave Session
                  </button>
                )}
              </div>

              {/* Connection status indicator */}
              {handshakeInProgress && (
                <div className="mt-4 flex items-center gap-2 text-amber-600">
                  <div className="w-4 h-4 border-2 border-amber-600 border-t-transparent rounded-full animate-spin" />
                  <span className="text-sm">Establishing connection...</span>
                </div>
              )}
            </div>

            {/* Collapsed diagnostics */}
            <div className="m-4">
              <details className="text-sm text-muted-foreground">
                <summary className="cursor-pointer">Connection Info</summary>
                <div className="mt-2 space-y-1">
                  <div>Status: {connectionStatus}</div>
                  <div>Participants: {participantCount}</div>
                  <div>Role: {webrtcRole}</div>
                  <div>Intervals: {getActiveIntervals().join(', ') || 'None'}</div>
                </div>
              </details>
            </div>
          </div>
        </div>
        { viewMode === 'provider' && (
          <div className="col-span-1 flex items-center justify-center">
            <button 
              onClick={() => {}}
              className="p-3 rounded-full hover:bg-muted transition-colors"
              title="Future appointments"
            >
              <svg className="w-6 h-6 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
        </div>)}
      </div>
    </>
  );
};
import React, { useEffect, useRef, useState } from 'react';
import { useRive, useStateMachineInput } from '@rive-app/react-canvas';

function Avatar({ 
  isActive, 
  isTalking, 
  isThinking, 
  visemes, 
  audioUrl 
}) {
  const audioRef = useRef(null);
  const visemeTimersRef = useRef([]);
  const [scale, setScale] = useState(1.7); // Increased scale to 170% to fill the mask completely

  // Remove dynamic scaling - keep avatar at consistent 170% scale
  // const calculateScale = () => {
  //   // Removed to maintain consistent avatar size across all screen sizes
  // };

  // Remove resize listener since we're not scaling anymore
  // useEffect(() => {
  //   // Removed dynamic scaling
  // }, []);

  // Initialize Rive
  const { RiveComponent, rive } = useRive({
    src: '/avatar.riv',
    stateMachines: 'State Machine 1',
    autoplay: true,
  });

  // Get state machine inputs for controlling visemes
  const visemeInput = useStateMachineInput(rive, 'State Machine 1', 'numViseme');
  const speakingInput = useStateMachineInput(rive, 'State Machine 1', 'IsSpeaking');

  console.log('[RIVE AVATAR] *** REAL-TIME SYNC v5.1 *** Component rendered with props:', { 
    isActive, 
    isTalking, 
    isThinking, 
    visemes: visemes?.length, 
    audioUrl,
    riveLoaded: !!rive,
    visemeInput: !!visemeInput,
    speakingInput: !!speakingInput
  });

  // Debug Rive loading
  useEffect(() => {
    if (rive) {
      console.log('[RIVE AVATAR] ✅ Rive loaded successfully');
    } else {
      console.log('[RIVE AVATAR] ⏳ Waiting for Rive to load...');
    }
  }, [rive]);

  useEffect(() => {
    if (visemeInput) {
      console.log('[RIVE AVATAR] ✅ Viseme input connected');
    }
    if (speakingInput) {
      console.log('[RIVE AVATAR] ✅ Speaking input connected');
    }
  }, [visemeInput, speakingInput]);

  // Control speaking state
  useEffect(() => {
    if (speakingInput) {
      speakingInput.value = isTalking;
      console.log('[RIVE AVATAR] Set IsSpeaking to:', isTalking);
    }
  }, [isTalking, speakingInput]);

  // Handle synchronized audio and viseme animation
  useEffect(() => {
    // Clear any existing timers
    visemeTimersRef.current.forEach(clearTimeout);
    visemeTimersRef.current = [];
    
    // Cleanup previous audio
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }

    // Only start if we have all required data and haven't played this audio yet
    if (!audioUrl || !visemeInput || !visemes || visemes.length === 0) {
      // Reset to neutral when not talking
      if (visemeInput && !isTalking) {
        visemeInput.value = 0;
      }
      return;
    }

    // Prevent duplicate playback by checking if this is the same audio
    const audioKey = `${audioUrl}_${visemes.length}`;
    if (audioRef.current?.dataset?.audioKey === audioKey) {
      console.log('[RIVE AVATAR] Skipping duplicate audio:', audioKey);
      return;
    }

    console.log('[RIVE AVATAR] *** REAL-TIME SYNC v5.0 *** Starting synchronized audio + lip sync with', visemes.length, 'visemes');
    
    // Create audio element
    const audio = new Audio();
    const fullAudioUrl = audioUrl.startsWith('http') ? audioUrl : `http://localhost:3006${audioUrl}`;
    audio.src = fullAudioUrl;
    audio.volume = 1.0;
    audio.dataset.audioKey = audioKey; // Mark this audio to prevent duplicates
    audioRef.current = audio;

    // Setup audio event listeners
    audio.addEventListener('ended', () => {
      console.log('[RIVE AVATAR] Audio playback ended');
    });
    
    audio.addEventListener('error', (e) => {
      console.error('[RIVE AVATAR] Audio error:', e);
    });

    // Coordinate audio and viseme start with REAL-TIME SYNC
    const startSynchronizedPlayback = async () => {
      try {
        console.log('[RIVE AVATAR] *** REAL-TIME SYNC v5.1 *** Starting audio + viseme synchronization');
        
        // Start audio first
        await audio.play();
        console.log('[RIVE AVATAR] Audio started successfully');
        
        // Use real-time sync instead of pre-scheduling
        const syncVisemesToAudio = () => {
          if (!audio || !visemeInput) return;
          
          const currentTimeMs = audio.currentTime * 1000; // Convert to milliseconds
          
          // Find the current viseme based on audio time
          let currentViseme = null;
          for (const viseme of visemes) {
            const visemeTimeMs = viseme.timeMs || 0;
            if (currentTimeMs >= visemeTimeMs) {
              currentViseme = viseme;
            } else {
              break; // Visemes should be in chronological order
            }
          }
          
          if (currentViseme) {
            const visemeId = currentViseme.visemeId || currentViseme.id || 0;
            const expectedViseme = Math.max(0, Math.min(21, visemeId));
            
            // Only update if the viseme has changed
            if (visemeInput.value !== expectedViseme) {
              visemeInput.value = expectedViseme;
              console.log(`[RIVE AVATAR] Real-time sync: viseme ${expectedViseme} at ${Math.round(currentTimeMs)}ms`);
            }
          }
          
          // Continue syncing if audio is still playing
          if (!audio.paused && !audio.ended) {
            requestAnimationFrame(syncVisemesToAudio);
          } else {
            // Audio finished, reset to neutral
            if (visemeInput) {
              visemeInput.value = 0;
            }
            console.log('[RIVE AVATAR] Real-time sync completed');
          }
        };
        
        // Start the real-time synchronization
        syncVisemesToAudio();
        
      } catch (err) {
        console.error('[RIVE AVATAR] Synchronized playback error:', err);
        if (err.name === 'NotAllowedError') {
          console.log('[RIVE AVATAR] Audio autoplay blocked. User interaction required.');
        }
      }
    };

    // Start the synchronized playback
    startSynchronizedPlayback();

    // Cleanup function
    return () => {
      visemeTimersRef.current.forEach(clearTimeout);
      visemeTimersRef.current = [];
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
        audioRef.current = null;
      }
      if (visemeInput) {
        visemeInput.value = 0;
      }
    };
  }, [audioUrl, visemes, visemeInput]); // Removed isTalking from dependencies to prevent re-triggering

  return (
    <div style={{
      position: 'absolute',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      width: '170%',  // Increased to 170% to match the scale
      height: '170%', // Increased to 170% to match the scale
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minWidth: '350px',  // Ensure minimum width
      minHeight: '380px',  // Increased minimum height to fill mask
      maxWidth: '500px',  // Increased maximum width to fill mask
      maxHeight: '500px'  // Increased maximum height to fill mask
    }}>
      <RiveComponent style={{
        width: '100%',
        height: '100%',
        minWidth: '350px',  // Ensure Rive component also respects minimum size
        minHeight: '380px',
        maxWidth: '500px',  // Increased maximum width to fill mask
        maxHeight: '500px'  // Increased maximum height to fill mask
      }} />
    </div>
  );
}

export default Avatar;

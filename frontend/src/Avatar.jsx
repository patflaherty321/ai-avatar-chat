import React, { useEffect, useRef, useState } from 'react';
import { useRive, useStateMachineInput } from '@rive-app/react-canvas';

function Avatar({ 
  isActive, 
  isTalking, 
  isThinking, 
  visemes, 
  audioUrl,
  scale = 1.5 // Default to 150%, can be overridden
}) {
  console.log(`🎭 Avatar Component: Received scale=${scale}`);
  
  const audioRef = useRef(null);
  const visemeTimersRef = useRef([]);
  const lastAudioKeyRef = useRef(null); // Track the last played audio to prevent duplicates
  const [internalTalking, setInternalTalking] = useState(false); // Internal talking state controlled by audio
  const [audioPreloaded, setAudioPreloaded] = useState(false);

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
    src: '/avatar-1.riv',
    stateMachines: 'State Machine 1',
    autoplay: true,
  });

  // Get state machine inputs for controlling visemes
  const visemeInput = useStateMachineInput(rive, 'State Machine 1', 'numViseme');
  const speakingInput = useStateMachineInput(rive, 'State Machine 1', 'IsSpeaking');

  console.log('[RIVE AVATAR] *** ENHANCED SYNC v6.0 *** Component rendered with props:', { 
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

  // Control speaking state based on internal audio-driven state
  useEffect(() => {
    if (speakingInput) {
      speakingInput.value = internalTalking;
      console.log('[RIVE AVATAR] Set IsSpeaking to:', internalTalking, '(internal state)');
    }
  }, [internalTalking, speakingInput]);

  // Handle synchronized audio and viseme animation
  useEffect(() => {
    // Clear any existing timers
    visemeTimersRef.current.forEach(clearTimeout);
    visemeTimersRef.current = [];
    
    // Only start if we have all required data
    if (!audioUrl || !visemeInput || !visemes || visemes.length === 0) {
      // Cleanup previous audio if no new audio to play
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
        audioRef.current = null;
      }
      // Reset to neutral and stop talking when no audio
      setInternalTalking(false);
      if (visemeInput) {
        visemeInput.value = 0;
      }
      setAudioPreloaded(false);
      return;
    }

    // Prevent duplicate playback by checking if this is the same audio
    const audioKey = `${audioUrl}_${visemes.length}`;
    if (lastAudioKeyRef.current === audioKey) {
      console.log('[RIVE AVATAR] 🚫 Skipping duplicate audio:', audioKey);
      return;
    }

    // Cleanup previous audio before starting new one
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }

    // Mark this audio as being played
    lastAudioKeyRef.current = audioKey;
    console.log('[RIVE AVATAR] *** ENHANCED SYNC v6.0 *** Starting synchronized audio + lip sync with', visemes.length, 'visemes for key:', audioKey);
    
    // Create audio element
    const audio = new Audio();
    
    // Normalize URL based on source
    const fullAudioUrl = audioUrl.startsWith('http') ? audioUrl : `http://localhost:3006${audioUrl}`;
    audio.src = fullAudioUrl;
    audio.volume = 1.0;
    audioRef.current = audio;
    
    // Sort visemes by time to ensure proper sequence
    const sortedVisemes = [...visemes].sort((a, b) => 
      (a.timeMs || 0) - (b.timeMs || 0)
    );

    // Debug log the viseme data
    console.log('[RIVE AVATAR] First 5 visemes:', sortedVisemes.slice(0, 5));
    console.log('[RIVE AVATAR] Last 5 visemes:', sortedVisemes.slice(-5));

    // Setup audio event listeners
    audio.addEventListener('canplaythrough', () => {
      setAudioPreloaded(true);
      console.log('[RIVE AVATAR] Audio preloaded and ready to play');
    });
    
    audio.addEventListener('ended', () => {
      console.log('[RIVE AVATAR] Audio playback ended for key:', audioKey);
      // Stop talking when audio actually ends
      setInternalTalking(false);
      console.log('[RIVE AVATAR] Internal talking state set to: false (audio ended)');
      // Clear the audio key when playback completes
      if (lastAudioKeyRef.current === audioKey) {
        lastAudioKeyRef.current = null;
      }
      // Reset to neutral position
      if (visemeInput) {
        visemeInput.value = 0;
      }
    });
    
    audio.addEventListener('error', (e) => {
      console.error('[RIVE AVATAR] Audio error:', e);
      // Stop talking on error
      setInternalTalking(false);
      // Reset viseme
      if (visemeInput) {
        visemeInput.value = 0;
      }
    });

    // Preload the audio but don't start playback yet
    audio.load();

    // Define the enhanced synchronization function
    const startEnhancedSync = async () => {
      try {
        // Start audio playback
        await audio.play();
        console.log('[RIVE AVATAR] Audio started successfully - duration:', Math.round(audio.duration * 1000), 'ms');
        
        // Set internal talking state to true when audio starts
        setInternalTalking(true);
        
        // Define last tracked viseme for logging
        let lastVisemeId = -1;
        
        // Improved real-time sync using requestAnimationFrame
        const syncVisemesToAudio = () => {
          if (!audio || audio.paused || audio.ended) {
            if (visemeInput) {
              visemeInput.value = 0; // Reset to neutral when not playing
            }
            return;
          }
          
          const currentTimeMs = audio.currentTime * 1000; // Convert to milliseconds
          
          // Find the current viseme based on audio time
          let currentViseme = null;
          let lastViseme = null;
          
          // More accurate viseme finding algorithm
          for (const viseme of sortedVisemes) {
            const visemeTimeMs = viseme.timeMs || 0;
            if (currentTimeMs >= visemeTimeMs) {
              currentViseme = viseme;
              lastViseme = viseme; // Keep track of the last viseme we've seen
            } else {
              break; // Visemes are sorted, so we can stop once we've gone too far
            }
          }
          
          // If we're past all visemes but audio is still playing, use the last viseme
          if (!currentViseme && lastViseme && sortedVisemes.length > 0) {
            currentViseme = lastViseme;
          }
          
          if (currentViseme) {
            const visemeId = currentViseme.visemeId || currentViseme.id || 0;
            const expectedViseme = Math.max(0, Math.min(21, visemeId));
            
            // Only update if the viseme has changed (reduces unnecessary updates)
            if (visemeInput.value !== expectedViseme) {
              visemeInput.value = expectedViseme;
              
              // Log viseme changes for debugging
              if (expectedViseme !== lastVisemeId) {
                console.log(`[RIVE AVATAR] Viseme change: ${lastVisemeId} → ${expectedViseme} at ${Math.round(currentTimeMs)}ms`);
                lastVisemeId = expectedViseme;
              }
            }
          } else if (currentTimeMs < 100) {
            // Only reset to neutral if no visemes found and we're early in the audio
            if (visemeInput.value !== 0) {
              visemeInput.value = 0;
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
          }
        };
        
        // Start the real-time synchronization
        requestAnimationFrame(syncVisemesToAudio);
        
      } catch (err) {
        console.error('[RIVE AVATAR] Synchronized playback error:', err);
        if (err.name === 'NotAllowedError') {
          console.log('[RIVE AVATAR] Audio autoplay blocked. User interaction required.');
        }
      }
    };

    // Only start playback once audio is preloaded
    if (audioPreloaded) {
      startEnhancedSync();
    } else {
      // Add event listener for when audio is ready
      audio.addEventListener('canplaythrough', () => {
        // Only start if this is still the current audio
        if (lastAudioKeyRef.current === audioKey) {
          startEnhancedSync();
        }
      }, { once: true });
    }

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
  }, [audioUrl, visemes, visemeInput, audioPreloaded]); // Added audioPreloaded to dependency array

  return (
    <div style={{
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      width: '100%',
      height: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 'inherit', // Inherit the border radius from parent
      overflow: 'hidden' // Ensure content is clipped to rounded corners
    }}>
      <RiveComponent style={{
        width: `${scale * 100}%`,  // Use dynamic scale
        height: `${scale * 100}%`, // Use dynamic scale
        minWidth: '120%', // Ensure minimum coverage
        minHeight: '120%', // Ensure minimum coverage
        objectFit: 'cover', // Cover the entire container
        borderRadius: 'inherit', // Inherit the border radius
        transform: 'scale(1.1)' // Additional scale to eliminate any remaining gaps
      }} />
    </div>
  );
}

export default Avatar;

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
    
    // Enhanced validation with detailed logging
    if (!audioUrl || !visemeInput || !visemes || visemes.length === 0) {
      console.log('[RIVE AVATAR] 🚫 Missing required data:', { 
        audioUrl: !!audioUrl, 
        visemeInput: !!visemeInput, 
        visemes: visemes?.length || 0,
        actualAudioUrl: audioUrl,
        actualVisemes: visemes
      });
      
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
    
    // These guards belong to this effect, including callbacks already queued by the browser.
    let disposed = false;
    let started = false;
    let animationFrame = null;

    // Create audio element
    const audio = new Audio();
    
    // Normalize URL based on source - fix for production deployment
    let fullAudioUrl;
    if (audioUrl.startsWith('http')) {
      fullAudioUrl = audioUrl;
    } else {
      // Use the same backend URL that the app is already using
      const backendUrl = process.env.REACT_APP_BACKEND_URL || 'https://ai-avatar-chat-backend.onrender.com';
      fullAudioUrl = `${backendUrl}${audioUrl}`;
    }
    
    console.log('[RIVE AVATAR] Full audio URL:', fullAudioUrl);
    audio.src = fullAudioUrl;
    audio.volume = 1.0;
    audio.crossOrigin = 'anonymous'; // Add CORS support
    audioRef.current = audio;
    
    // Sort visemes by time to ensure proper sequence
    const sortedVisemes = [...visemes].sort((a, b) => 
      (a.timeMs || 0) - (b.timeMs || 0)
    );

    // Debug log the viseme data with enhanced details
    console.log('[RIVE AVATAR] 📊 VISEME ANALYSIS:');
    console.log('[RIVE AVATAR] Total visemes:', sortedVisemes.length);
    console.log('[RIVE AVATAR] First 5 visemes:', sortedVisemes.slice(0, 5));
    console.log('[RIVE AVATAR] Last 5 visemes:', sortedVisemes.slice(-5));
    console.log('[RIVE AVATAR] Time span:', sortedVisemes[0]?.timeMs || 0, 'to', sortedVisemes[sortedVisemes.length - 1]?.timeMs || 0, 'ms');
    console.log('[RIVE AVATAR] Expected duration:', ((sortedVisemes[sortedVisemes.length - 1]?.timeMs || 0) / 1000).toFixed(2), 'seconds');

    // Setup audio event listeners
    const onCanPlayThrough = () => {
      if (disposed) return;
      console.log('[RIVE AVATAR] Audio preloaded and ready to play');
      // Start playback immediately when audio is ready
      if (lastAudioKeyRef.current === audioKey) {
        startEnhancedSync();
      }
    };
    
    const onLoadStart = () => {
      console.log('[RIVE AVATAR] Audio load started');
    };
    
    const onLoadedData = () => {
      console.log('[RIVE AVATAR] ✅ Audio data loaded, duration:', audio.duration ? audio.duration.toFixed(2) + 's' : 'unknown');
    };
    
    const onEnded = () => {
      if (disposed) return;
      cancelAnimationFrame(animationFrame);
      animationFrame = null;
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
    };
    
    const onError = (e) => {
      if (disposed) return;
      cancelAnimationFrame(animationFrame);
      animationFrame = null;
      console.error('[RIVE AVATAR] Audio error:', e);
      console.error('[RIVE AVATAR] Audio error details:', audio.error);
      // Stop talking on error
      setInternalTalking(false);
      // Reset viseme
      if (visemeInput) {
        visemeInput.value = 0;
      }
    };

    // Define the enhanced synchronization function
    const startEnhancedSync = async () => {
      if (disposed || started) return;
      started = true;
      try {
        // Ensure user interaction has occurred
        console.log('[RIVE AVATAR] Attempting to start audio playback...');
        
        // Start audio playback
        await audio.play();
        if (disposed) return;
        console.log('[RIVE AVATAR] ✅ Audio started successfully');
        console.log('[RIVE AVATAR] 📊 Audio duration:', Math.round(audio.duration * 1000), 'ms');
        console.log('[RIVE AVATAR] 📊 Viseme duration:', sortedVisemes[sortedVisemes.length - 1]?.timeMs || 0, 'ms');
        console.log('[RIVE AVATAR] 📊 Duration match:', Math.abs((audio.duration * 1000) - (sortedVisemes[sortedVisemes.length - 1]?.timeMs || 0)) < 500 ? 'GOOD' : 'MISMATCH');
        
        // Set internal talking state to true when audio starts
        setInternalTalking(true);
        
        // Define last tracked viseme for logging
        let lastVisemeId = -1;
        
        // Remove the sync count limit - let it run until audio actually ends
        const syncVisemesToAudio = () => {
          if (disposed) return;
          // Only stop if the audio is paused/ended or the component unmounted
          if (!audio || audio.paused || audio.ended || !visemeInput) {
            if (visemeInput) {
              visemeInput.value = 0; // Reset to neutral when not playing
            }
            return;
          }
          
          const currentTimeMs = audio.currentTime * 1000; // Convert to milliseconds
          
          // Reduce logging frequency to improve performance - log only every 500ms
          if (Math.round(currentTimeMs) % 500 === 0) {
            console.log(`[RIVE AVATAR] Sync at ${Math.round(currentTimeMs)}ms`);
          }
          
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
          
          // CRITICAL FIX: Always use the last viseme if we're past all defined visemes
          // This ensures animation continues until audio actually ends
          if (!currentViseme && lastViseme && currentTimeMs > (sortedVisemes[sortedVisemes.length - 1]?.timeMs || 0)) {
            currentViseme = lastViseme;
            
            // If we're significantly past the last viseme time, log it once
            if (currentTimeMs > (sortedVisemes[sortedVisemes.length - 1]?.timeMs || 0) + 1000 && 
                Math.round(currentTimeMs) % 2000 === 0) {
              console.log(`[RIVE AVATAR] ⚠️ Using last viseme at ${Math.round(currentTimeMs)}ms, exceeding last defined viseme time`);
            }
          }
          
          if (currentViseme) {
            const visemeId = currentViseme.visemeId || currentViseme.id || 0;
            const expectedViseme = Math.max(0, Math.min(21, visemeId));
            
            // Only update and log if the viseme has changed
            if (visemeInput.value !== expectedViseme) {
              visemeInput.value = expectedViseme;
              console.log(`[RIVE AVATAR] Viseme change: ${lastVisemeId} → ${expectedViseme} at ${Math.round(currentTimeMs)}ms`);
              lastVisemeId = expectedViseme;
            }
          } else if (currentTimeMs < 100) {
            // Only reset to neutral if no visemes found and we're early in the audio
            visemeInput.value = 0;
            if (lastVisemeId !== 0) {
              console.log(`[RIVE AVATAR] Reset to neutral at ${Math.round(currentTimeMs)}ms`);
              lastVisemeId = 0;
            }
          }
          
          // Always continue syncing if audio is still playing
          if (!audio.paused && !audio.ended) {
            animationFrame = requestAnimationFrame(syncVisemesToAudio);
          } else {
            // Audio finished, reset to neutral
            if (visemeInput) {
              visemeInput.value = 0;
            }
            console.log('[RIVE AVATAR] Sync stopped - audio ended');
          }
        };
        
        // Start the real-time synchronization
        animationFrame = requestAnimationFrame(syncVisemesToAudio);
        
      } catch (err) {
        if (disposed) return;
        console.error('[RIVE AVATAR] Synchronized playback error:', err);
        if (err.name === 'NotAllowedError') {
          console.log('[RIVE AVATAR] Audio autoplay blocked. User interaction required.');
        }
      }
    };

    const listeners = {
      canplaythrough: onCanPlayThrough,
      loadstart: onLoadStart,
      loadeddata: onLoadedData,
      ended: onEnded,
      error: onError,
    };
    Object.entries(listeners).forEach(([event, handler]) => audio.addEventListener(event, handler));
    // Preload only after all playback callbacks have been initialized.
    audio.load();

    return () => {
      disposed = true;
      cancelAnimationFrame(animationFrame);
      Object.entries(listeners).forEach(([event, handler]) => audio.removeEventListener(event, handler));
      visemeTimersRef.current.forEach(clearTimeout);
      visemeTimersRef.current = [];
      audio.pause();
      audio.currentTime = 0;
      if (audioRef.current === audio) audioRef.current = null;
      if (lastAudioKeyRef.current === audioKey) lastAudioKeyRef.current = null;
      // useRive may already have disposed its native inputs. Never write them here.
    };
  }, [audioUrl, visemes, visemeInput]); // Removed audioPreloaded from dependency array

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

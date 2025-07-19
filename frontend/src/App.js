import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import Avatar from './Avatar';
import './App.css';

function App() {
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'Hello! I\'m your AI companion. How can I help you today?' }
  ]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [audioUrl, setAudioUrl] = useState('');
  const [visemes, setVisemes] = useState([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMicActive, setIsMicActive] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [recognition, setRecognition] = useState(null);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [horizontalPadding, setHorizontalPadding] = useState(20); // Changed from 60 to 20 for mobile
  const [maxWidth, setMaxWidth] = useState('100%');
  const [windowWidth, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1200);

  // Ref for auto-scrolling chat messages
  const messagesEndRef = useRef(null);

  // Debug render state
  console.log('🔄 App render state:', {
    inputMessage: inputMessage.length,
    isLoading,
    isListening,
    audioEnabled,
    recognition: !!recognition,
    messagesCount: messages.length
  });

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isLoading]);

  // Calculate responsive layout based on screen width
  const calculateLayout = useCallback(() => {
    const screenWidth = typeof window !== 'undefined' ? window.innerWidth : 1200;
    
    // Only update if width has changed significantly (prevent micro-adjustments)
    if (Math.abs(screenWidth - windowWidth) < 5) {
      return; // Skip update if change is less than 5px
    }
    
    setWindowWidth(screenWidth);
    
    const fixedPadding = 20; // Changed from 60 to 20 for mobile screens
    const maxContentWidth = 1080; // Fixed content width when centered
    
    if (screenWidth < 1080) {
      // Mobile layout: stack vertically with full width
      setHorizontalPadding(fixedPadding);
      setMaxWidth('100%');
      console.log(`📱 MOBILE MODE: Width=${screenWidth}px, Padding=${fixedPadding}px, MaxWidth=100%, Layout=Vertical`);
    } else {
      // Desktop layout: center the UI with fixed max width
      setHorizontalPadding(fixedPadding);
      setMaxWidth(`${maxContentWidth}px`);
      console.log(`🖥️ DESKTOP MODE: Width=${screenWidth}px, Padding=${fixedPadding}px, MaxWidth=${maxContentWidth}px, Layout=Horizontal`);
    }
  }, [windowWidth]);

  // Calculate avatar scale to completely fill the Avatar-MAIN panel
  const calculateAvatarScale = useMemo(() => {
    // Use current window width directly if windowWidth state isn't ready
    const currentWidth = windowWidth || (typeof window !== 'undefined' ? window.innerWidth : 1200);
    
    let scale;
    if (currentWidth >= 1080) {
      // Desktop: increased scale to completely eliminate borders
      scale = 2.5; // Keep desktop at 2.5x
    } else {
      // Mobile and tablet: increased scale to 3.5x to eliminate remaining borders
      scale = 3.5; // Increased to 3.5x to eliminate any remaining borders
    }
    
    console.log(`🔧 Avatar Scale Calculation (4000px Rive): windowWidth=${windowWidth}, currentWidth=${currentWidth}, scale=${scale}`);
    return scale;
  }, [windowWidth]);

  // Update layout on mount and window resize
  useEffect(() => {
    // Ensure layout is calculated immediately on mount
    calculateLayout();
    
    // Throttle resize events to prevent excessive re-renders
    let resizeTimeout;
    const handleResize = () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        calculateLayout();
      }, 100); // Debounce resize events by 100ms
    };
    
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      clearTimeout(resizeTimeout);
    };
  }, [calculateLayout]);

  const enableAudio = useCallback(async () => {
    try {
      console.log('🔊 Attempting to enable audio...');
      
      // Mobile-specific audio enablement with more aggressive approach
      const audioPromise = new Promise(async (resolve, reject) => {
        try {
          // Create audio context with mobile compatibility
          const AudioContextClass = window.AudioContext || window.webkitAudioContext;
          if (AudioContextClass) {
            const audioContext = new AudioContextClass();
            if (audioContext.state === 'suspended') {
              await audioContext.resume();
              console.log('🔊 Audio context resumed');
            }
          }
          
          // Create and play multiple silent audio attempts for mobile compatibility
          const audio1 = new Audio();
          const audio2 = new Audio();
          
          // Try different audio sources for maximum compatibility
          audio1.src = 'data:audio/wav;base64,UklGRnoAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';
          audio2.src = 'data:audio/mpeg;base64,SUQzBAAAAAABEVRYWFgAAAAtAAADY29tbWVudABCaWdTb3VuZEJhbmsuY29tIC8gTGFTb25vdGhlcXVlLm9yZwBURU5DAAAAHQAAATNTAG1wM1BST1YuNi4xLjEgKGNkYzIwMTEwKVRTU0UAAAAHAAABAEZ4Q0FQAAAAHQAAAQRFQVNUX0VYVEVOREVEXwhNUElNUVBNUUJFX0NQRU5DAAAA=';
          
          audio1.volume = 0.01;
          audio2.volume = 0.01;
          
          // Mobile requires multiple attempts and different events
          let resolved = false;
          
          const resolveOnce = (success) => {
            if (!resolved) {
              resolved = true;
              resolve(success);
            }
          };
          
          // Try playing multiple audio sources
          const tryPlay = async (audio, label) => {
            try {
              audio.load(); // Force load on mobile
              await audio.play();
              console.log(`🔊 ${label} audio play succeeded`);
              resolveOnce(true);
            } catch (error) {
              console.warn(`🔇 ${label} audio play failed:`, error);
            }
          };
          
          // Set up event listeners for both audio elements
          audio1.oncanplaythrough = () => tryPlay(audio1, 'Primary');
          audio2.oncanplaythrough = () => tryPlay(audio2, 'Secondary');
          
          audio1.onerror = () => console.warn('🔇 Primary audio load failed');
          audio2.onerror = () => console.warn('🔇 Secondary audio load failed');
          
          // Also try immediate play without waiting for canplaythrough
          setTimeout(() => {
            tryPlay(audio1, 'Primary-Immediate');
            tryPlay(audio2, 'Secondary-Immediate');
          }, 100);
          
          // Fallback timeout - consider it enabled even if silent play fails
          setTimeout(() => {
            console.log('🔊 Audio enablement timeout - continuing anyway for mobile compatibility');
            resolveOnce(true);
          }, 1500);
          
        } catch (error) {
          reject(error);
        }
      });
      
      // Shorter timeout for mobile responsiveness
      const timeoutPromise = new Promise((resolve) => {
        setTimeout(() => {
          console.warn('⏰ Audio enablement timed out - enabling anyway for mobile');
          resolve(true);
        }, 2000);
      });
      
      await Promise.race([audioPromise, timeoutPromise]);
      
      setAudioEnabled(true);
      console.log('✅ Audio enabled for mobile compatibility');
    } catch (error) {
      console.warn('❌ Could not enable audio:', error);
      setAudioEnabled(true); // Always enable for mobile compatibility
    }
  }, []);

  const sendMessageToAI = useCallback(async (messageText) => {
    console.log('📤 sendMessageToAI called with:', messageText);
    if (!messageText.trim() || isLoading) {
      console.log('❌ Message rejected - empty or loading');
      return;
    }

    setIsLoading(true);

    try {
      console.log('🚀 Sending message to API:', messageText);
      const backendUrl = process.env.REACT_APP_BACKEND_URL || 'https://ai-avatar-chat-backend.onrender.com';
      
      // Always request audio if user has interacted with the app (mobile fix)
      const requestBody = {
        message: messageText,
        includeAudio: audioEnabled || true, // Force audio request for mobile compatibility
        userAgent: navigator.userAgent // Send user agent for mobile detection
      };
      
      console.log('📤 Request body:', requestBody);
      
      const response = await fetch(`${backendUrl}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      console.log('📡 Response status:', response.status, response.statusText);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ API Error Response:', errorText);
        throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
      }

      const data = await response.json();
      console.log('✅ API Response data:', data);
      console.log('🔍 FORCE DEBUG - Audio/Viseme check:', {
        audioEnabled,
        hasAudioUrl: !!data.audioUrl,
        hasVisemeData: !!data.visemes,
        audioUrl: data.audioUrl,
        visemeDataLength: data.visemes?.length,
        visemeDataType: typeof data.visemes,
        visemeDataValue: data.visemes
      });
      
      // Add AI response to chat
      const aiMessage = { role: 'assistant', content: data.response || data.text || data.message };
      setMessages(prev => [...prev, aiMessage]);

      // Check if response includes audio and visemes (new format from our backend)
      // Always process audio if available, since user has already enabled it by sending a message
      if (data.audioUrl && data.visemes) {
        try {
          console.log('🎵 Processing response with audio and visemes...');
          console.log('🎵 Audio URL:', data.audioUrl);
          console.log('🎵 Viseme data count:', data.visemes?.length || 0);
          
          // Create full audio URL from relative path
          const backendUrl = process.env.REACT_APP_BACKEND_URL || 'https://ai-avatar-chat-backend.onrender.com';
          const fullAudioUrl = `${backendUrl}${data.audioUrl}`;
          
          // Convert viseme format to the format expected by Avatar component
          const convertedVisemes = data.visemes.map(viseme => ({
            timeMs: viseme.timeMs,
            visemeId: viseme.visemeId
          }));
          
          console.log('🎵 Setting audio and visemes:', fullAudioUrl, convertedVisemes.length, 'visemes');
          setAudioUrl(fullAudioUrl);
          setVisemes(convertedVisemes);
          setIsPlaying(true);
          
          // Reset playing state after audio duration (estimated from last viseme)
          const lastVisemeTime = convertedVisemes[convertedVisemes.length - 1]?.timeMs || 3000;
          setTimeout(() => {
            setIsPlaying(false);
          }, lastVisemeTime + 1000);
          
        } catch (audioError) {
          console.error('❌ Error processing audio/visemes:', audioError);
        }
      } else {
        console.log('💬 No audio/visemes in response - text-only chat mode');
        console.log('🔍 Detailed debugging:', {
          audioEnabled: audioEnabled,
          audioEnabledType: typeof audioEnabled,
          hasAudioUrl: !!data.audioUrl,
          hasVisemeData: !!data.visemes,
          audioUrlType: typeof data.audioUrl,
          visemeDataType: typeof data.visemes,
          audioUrl: data.audioUrl || 'none',
          visemeDataLength: data.visemes?.length || 0,
          responseKeys: Object.keys(data),
          conditionResults: {
            audioEnabled_check: !!audioEnabled,
            audioUrl_check: !!data.audioUrl,
            visemeData_check: !!data.visemes,
            overallCondition: !!(audioEnabled && data.audioUrl && data.visemes)
          }
        });
      }

    } catch (error) {
      console.error('❌ Error sending message - Full error object:', error);
      console.error('❌ Error name:', error.name);
      console.error('❌ Error message:', error.message);
      console.error('❌ Error stack:', error.stack);
      const errorMessage = { role: 'assistant', content: `Sorry, I encountered an error: ${error.message}. Please try again.` };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, audioEnabled]);

  // Initialize speech recognition
  useEffect(() => {
    console.log('🎤 Initializing speech recognition...');
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      const recognitionInstance = new SpeechRecognition();
      
      recognitionInstance.continuous = false;
      recognitionInstance.interimResults = false;
      recognitionInstance.lang = 'en-US';
      
      recognitionInstance.onstart = () => {
        console.log('🎤 Speech recognition started');
        setIsListening(true);
      };
      
      recognitionInstance.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        console.log('🗣️ Speech recognition result:', transcript);
        
        // Instead of setting input, directly send the message
        if (transcript.trim()) {
          // Add user message to chat immediately
          const userMessage = { role: 'user', content: transcript };
          setMessages(prev => [...prev, userMessage]);
          
          // Send to AI backend
          sendMessageToAI(transcript);
        }
        
        setIsListening(false);
        setIsMicActive(false);
      };
      
      recognitionInstance.onerror = (event) => {
        console.error('❌ Speech recognition error:', event.error);
        setIsListening(false);
        setIsMicActive(false);
      };
      
      recognitionInstance.onend = () => {
        console.log('🛑 Speech recognition ended');
        setIsListening(false);
        setIsMicActive(false);
      };
      
      setRecognition(recognitionInstance);
      console.log('✅ Speech recognition initialized');
    } else {
      console.warn('⚠️ Speech recognition not supported in this browser');
    }
  }, [sendMessageToAI]);

  const sendMessage = useCallback(async () => {
    console.log('📝 sendMessage called with inputMessage:', inputMessage);
    if (!inputMessage.trim() || isLoading) {
      console.log('❌ sendMessage rejected - empty or loading');
      return;
    }

    // Enable audio on user interaction (immediately, don't wait)
    if (!audioEnabled) {
      console.log('🔊 First interaction - enabling audio immediately...');
      setAudioEnabled(true); // Set immediately for faster response
      enableAudio().catch(error => {
        console.warn('🔇 Audio enabling failed but continuing:', error);
      });
    }

    // Add user message to chat
    const userMessage = { role: 'user', content: inputMessage };
    setMessages(prev => [...prev, userMessage]);
    
    // Send to AI and clear input
    const messageToSend = inputMessage;
    setInputMessage('');
    
    // Don't await audio enabling, just continue
    console.log('🚀 Proceeding to send message to AI...');
    await sendMessageToAI(messageToSend);
  }, [inputMessage, isLoading, audioEnabled, enableAudio, sendMessageToAI]);

  const handleKeyPress = useCallback((e) => {
    console.log('⌨️ Key pressed:', e.key);
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }, [sendMessage]);

  const toggleMicrophone = useCallback(async () => {
    console.log('🎤 toggleMicrophone called, recognition available:', !!recognition);
    if (!recognition) {
      alert('Speech recognition is not supported in this browser. Please use Chrome, Safari, or Edge.');
      return;
    }

    // Force enable audio on microphone interaction (critical for mobile)
    console.log('🔊 Microphone interaction - force enabling audio for mobile...');
    setAudioEnabled(true); // Set immediately
    
    // Force audio enablement in the background without waiting
    enableAudio().then(() => {
      console.log('✅ Audio enablement completed during microphone interaction');
    }).catch(error => {
      console.warn('🔇 Audio enabling failed but continuing (mobile compatibility):', error);
    });

    if (isListening) {
      // Stop listening
      console.log('🛑 Stopping speech recognition');
      recognition.stop();
      setIsListening(false);
      setIsMicActive(false);
    } else {
      // Start listening
      try {
        console.log('🎤 Starting speech recognition for mobile device');
        recognition.start();
        setIsMicActive(true);
      } catch (error) {
        console.error('❌ Error starting speech recognition:', error);
        alert('Error starting microphone. Please check your microphone permissions.');
        setIsMicActive(false);
      }
    }
  }, [recognition, enableAudio, isListening]);

  return (
    <div className="App">
      
      {/* Exact Figma Design Implementation */}
      <div style={{
        width: '100%', 
        minHeight: '100vh', // Changed from height to minHeight to allow natural sizing
        background: '#7C7C7C', 
        flexDirection: 'column', 
        justifyContent: 'flex-start', 
        alignItems: 'center', 
        display: 'flex',
        boxSizing: 'border-box',
        paddingBottom: '20px' // Add bottom padding for spacing
      }}>
        
        {/* Main Section - Avatar and Chat Panel */}
        <div style={{
          width: '100%',
          position: 'relative',
          flex: '0 0 auto', // Changed from flex: 1 to not take all available space
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          paddingTop: '0px' // Removed extra top padding for tighter layout
        }}>
          <div style={{
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
            width: '100%',
            height: '100%'
          }}>
            <div style={{
              boxSizing: 'border-box',
              display: 'flex',
              flexDirection: windowWidth < 1080 ? 'column' : 'row', // Stack vertically on mobile
              gap: 20,
              alignItems: windowWidth < 1080 ? 'stretch' : 'center', // Stretch full width on mobile
              justifyContent: 'center',
              paddingLeft: horizontalPadding,
              paddingRight: horizontalPadding,
              paddingTop: 20,
              paddingBottom: 20,
              position: 'relative',
              width: '100%',
              maxWidth: maxWidth,
              margin: '0 auto'
            }}>
              
              {/* Avatar-MAIN */}
              <div style={{
                flex: windowWidth < 1080 ? '0 0 auto' : '0 0 450px',
                height: windowWidth < 1080 ? 275 : 460, // Changed from 300 to 275 for mobile
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                justifyContent: 'center',
                padding: 0,
                position: 'relative',
                minHeight: windowWidth < 1080 ? '275px' : '350px', // Changed from 300px to 275px
                minWidth: windowWidth < 1080 ? '100%' : '330px',
                width: windowWidth < 1080 ? '100%' : 'auto'
              }}>
                <div style={{
                  alignSelf: 'stretch',
                  height: windowWidth < 1080 ? 275 : 460, // Changed from 300 to 275 for mobile
                  borderRadius: 32,
                  overflow: 'hidden',
                  position: 'relative',
                  width: '100%',
                  flexGrow: 1,
                  flexShrink: 0,
                  flexBasis: 0,
                  minHeight: windowWidth < 1080 ? '275px' : '380px', // Changed from 300px to 275px
                  minWidth: windowWidth < 1080 ? '100%' : '350px',
                  maxWidth: windowWidth < 1080 ? '100%' : '450px',
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                  backgroundRepeat: 'no-repeat'
                }}>
                  <Avatar
                    key={`avatar-${calculateAvatarScale}`} // Force re-render when scale changes
                    isActive={true}
                    isTalking={isPlaying}
                    isThinking={isLoading}
                    visemes={visemes}
                    audioUrl={audioUrl}
                    audioEnabled={audioEnabled}
                    scale={calculateAvatarScale}
                  />
                </div>
              </div>
              
              {/* Main-Panel */}
              <div style={{
                flex: windowWidth < 1080 ? '0 0 auto' : '1 1 0',
                height: windowWidth < 1080 ? 275 : 460, // Changed from 300 to 275 for mobile
                background: '#D9D9D9',
                borderRadius: 32,
                minHeight: windowWidth < 1080 ? '275px' : '460px', // Changed from 300px to 275px for mobile
                minWidth: windowWidth < 1080 ? '100%' : '1px',
                width: windowWidth < 1080 ? '100%' : 'auto',
                padding: windowWidth < 1080 ? '0px' : '0px 20px',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden'
              }}>
                
                {/* Chat Messages Area */}
                <div style={{
                  flex: 1,
                  overflowY: 'auto',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                  marginTop: '20px',
                  marginBottom: '20px',
                  paddingLeft: windowWidth < 1080 ? '20px' : '0px',
                  paddingRight: windowWidth < 1080 ? '20px' : '0px'
                }}>
                  {messages.map((message, index) => (
                    <div key={index} style={{
                      display: 'flex',
                      justifyContent: message.role === 'user' ? 'flex-end' : 'flex-start',
                      alignItems: 'flex-start'
                    }}>
                      <div style={{
                        maxWidth: '80%',
                        padding: '12px 16px',
                        borderRadius: message.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                        backgroundColor: message.role === 'user' ? '#007AFF' : 'white',
                        color: message.role === 'user' ? 'white' : '#333',
                        fontSize: '14px',
                        lineHeight: '1.4',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                        textAlign: message.role === 'user' ? 'right' : 'left'
                      }}>
                        {message.content}
                      </div>
                    </div>
                  ))}
                  
                  {isLoading && (
                    <div style={{
                      display: 'flex',
                      justifyContent: 'flex-start',
                      alignItems: 'flex-start'
                    }}>
                      <div style={{
                        padding: '12px 16px',
                        borderRadius: '16px 16px 16px 4px',
                        backgroundColor: 'white',
                        color: '#666',
                        fontSize: '14px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                      }}>
                        <div style={{
                          width: '4px',
                          height: '4px',
                          borderRadius: '50%',
                          backgroundColor: '#666',
                          animation: 'pulse 1.5s infinite'
                        }} />
                        <div style={{
                          width: '4px',
                          height: '4px',
                          borderRadius: '50%',
                          backgroundColor: '#666',
                          animation: 'pulse 1.5s infinite 0.2s'
                        }} />
                        <div style={{
                          width: '4px',
                          height: '4px',
                          borderRadius: '50%',
                          backgroundColor: '#666',
                          animation: 'pulse 1.5s infinite 0.4s'
                        }} />
                        <span style={{ marginLeft: '6px' }}>Thinking...</span>
                      </div>
                    </div>
                  )}
                  
                  {/* Invisible element to scroll to */}
                  <div ref={messagesEndRef} style={{ height: '1px' }} />
                </div>
              </div>
            </div>
          </div>
        </div>
        
        {/* Composer Section */}
        <div style={{
          width: '100%',
          position: 'relative',
          flexShrink: 0,
          marginTop: '0px' // Removed extra 20px spacing for tighter layout
        }}>
          <div style={{
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            position: 'relative',
            width: '100%',
            height: '100%'
          }}>
            <div style={{
              boxSizing: 'border-box',
              display: 'flex',
              flexDirection: 'row',
              gap: 11,
              alignItems: 'center',
              justifyContent: 'flex-start',
              paddingLeft: horizontalPadding,
              paddingRight: horizontalPadding,
              paddingTop: 0,
              paddingBottom: 20,
              position: 'relative',
              width: '100%',
              maxWidth: maxWidth,
              margin: '0 auto'
            }}>
              
              {/* Search Button */}
              <div style={{
                position: 'relative',
                flexShrink: 0,
                width: 48,
                height: 48
              }}>
                <button style={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  width: 48,
                  height: 48,
                  background: 'transparent',
                  borderRadius: 24,
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <svg 
                    width="25" 
                    height="25" 
                    viewBox="0 0 25 25" 
                    fill="none" 
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path 
                      d="M24.6266 22.823C25.1243 23.3209 25.1243 24.1287 24.6266 24.6266C24.1287 25.1245 23.321 25.1243 22.823 24.6266L24.6266 22.823ZM11.1575 0.0138357C16.7639 0.298223 21.222 4.93396 21.222 10.611L21.2082 11.1575C21.0936 13.4163 20.2716 15.4878 18.9609 17.1573L19.5262 17.7236L24.6266 22.823L23.7243 23.7243L22.823 24.6266L17.7236 19.5262L17.1573 18.9609C15.354 20.3766 13.0815 21.222 10.611 21.222L10.0655 21.2082C4.63969 20.9334 0.289055 16.5832 0.0138357 11.1575L0 10.611C4.90281e-05 4.75073 4.75073 4.64216e-05 10.611 0L11.1575 0.0138357ZM10.611 1.60297C5.63604 1.60301 1.60302 5.63603 1.60297 10.611C1.60297 15.586 5.63601 19.619 10.611 19.619C15.586 19.619 19.619 15.5861 19.619 10.611C19.619 5.636 15.586 1.60297 10.611 1.60297Z" 
                      fill="url(#paint0_linear_12_78)"
                    />
                    <defs>
                      <linearGradient 
                        id="paint0_linear_12_78" 
                        x1="4.59026" 
                        y1="3.98128" 
                        x2="18.4429" 
                        y2="19.5244" 
                        gradientUnits="userSpaceOnUse"
                      >
                        <stop stopColor="white"/>
                        <stop offset="1" stopColor="#E8E8E8"/>
                      </linearGradient>
                    </defs>
                  </svg>
                </button>
              </div>
              
              {/* Input Field */}
              <div style={{
                flexGrow: 1,
                flexShrink: 0,
                flexBasis: 0,
                height: 56,
                background: '#FFFFFF',
                borderRadius: 28,
                minHeight: '1px',
                minWidth: '1px',
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
              }}>
                <input
                  type="text"
                  value={inputMessage}
                  onChange={(e) => {
                    console.log('📝 Input changed:', e.target.value);
                    setInputMessage(e.target.value);
                  }}
                  onKeyPress={handleKeyPress}
                  onFocus={() => console.log('🎯 Input focused')}
                  onBlur={() => console.log('👋 Input blurred')}
                  onClick={() => console.log('🖱️ Input clicked')}
                  placeholder={
                    isListening 
                      ? "Listening..." 
                      : "Ask me anything..."
                  }
                  disabled={isLoading || isListening}
                  style={{
                    width: '100%',
                    height: '100%',
                    padding: '0px 20px 0px 20px', // Changed from 60px to 20px for consistent mobile padding
                    border: 'none',
                    borderRadius: 32,
                    fontSize: '16px',
                    lineHeight: '24px',
                    outline: 'none',
                    fontFamily: 'inherit',
                    backgroundColor: 'transparent',
                    color: '#333'
                  }}
                />
                
                {/* Send Button inside input */}
                <button
                  onClick={() => {
                    console.log('📤 Send button clicked');
                    sendMessage();
                  }}
                  disabled={!inputMessage.trim() || isLoading || isListening}
                  style={{
                    position: 'absolute',
                    right: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    border: 'none',
                    background: (!inputMessage.trim() || isLoading || isListening) ? '#999' : '#007AFF',
                    cursor: (!inputMessage.trim() || isLoading || isListening) ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.2s ease',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                  }}
                  onMouseEnter={(e) => {
                    if (inputMessage.trim() && !isLoading && !isListening) {
                      e.target.style.transform = 'translateY(-50%) scale(1.1)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (inputMessage.trim() && !isLoading && !isListening) {
                      e.target.style.transform = 'translateY(-50%)';
                    }
                  }}
                >
                  {isLoading ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="10" stroke="white" strokeWidth="2" opacity="0.3" />
                      <path 
                        d="M12 2C13.3132 2 14.6136 2.25866 15.8268 2.7612C17.0401 3.26375 18.1425 4.00035 19.0711 4.92893C19.9997 5.85752 20.7362 6.95991 21.2388 8.17317C21.7413 9.38642 22 10.6868 22 12"
                        stroke="white" 
                        strokeWidth="2"
                        strokeLinecap="round"
                      >
                        <animateTransform
                          attributeName="transform"
                          attributeType="XML"
                          type="rotate"
                          from="0 12 12"
                          to="360 12 12"
                          dur="1s"
                          repeatCount="indefinite"
                        />
                      </path>
                    </svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                      <path 
                        d="M5 12H19M19 12L13 6M19 12L13 18" 
                        stroke="white" 
                        strokeWidth="2" 
                        strokeLinecap="round" 
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </button>
              </div>
              
              {/* Right Buttons Group */}
              <div style={{
                boxSizing: 'border-box',
                display: 'flex',
                flexDirection: 'row',
                gap: 11,
                alignItems: 'center',
                justifyContent: 'flex-end',
                padding: 0,
                position: 'relative',
                flexShrink: 0
              }}>
                {/* Microphone Button */}
                <div style={{
                  position: 'relative',
                  flexShrink: 0,
                  width: 48,
                  height: 48
                }}>
                  <button 
                    onClick={() => {
                      console.log('🎤 Microphone button clicked');
                      toggleMicrophone();
                    }}
                    style={{
                      position: 'absolute',
                      background: isListening ? '#FF3B30' : '#FFFFFF',
                      left: 0,
                      top: 0,
                      borderRadius: 24,
                      width: 48,
                      height: 48,
                      border: 'none',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      boxShadow: isListening ? '0 4px 12px rgba(255, 59, 48, 0.3)' : '0 2px 4px rgba(0,0,0,0.1)',
                      transition: 'all 0.2s ease',
                      transform: isListening ? 'scale(1.1)' : 'scale(1)',
                      overflow: 'hidden' // Ensure the pulse animation is masked by the circular button
                    }}
                  >
                    {/* Pulsating background animation */}
                    {(isMicActive || isListening) && (
                      <div
                        style={{
                          position: 'absolute',
                          top: '50%',
                          left: '50%',
                          width: '20px',
                          height: '20px',
                          background: isListening ? 'rgba(255, 255, 255, 0.3)' : 'rgba(0, 122, 255, 0.3)',
                          borderRadius: '50%',
                          transform: 'translate(-50%, -50%)',
                          animation: 'micPulse 2s infinite ease-in-out',
                          zIndex: 1
                        }}
                      />
                    )}
                    
                    <svg 
                      width="23" 
                      height="27" 
                      viewBox="0 0 23 27" 
                      fill="none" 
                      xmlns="http://www.w3.org/2000/svg"
                      style={{ position: 'relative', zIndex: 2 }}
                    >
                      <path 
                        fillRule="evenodd" 
                        clipRule="evenodd" 
                        d="M17.7428 6.24286C17.7428 2.79501 14.9478 0 11.4999 0C8.05215 0 5.25714 2.79503 5.25714 6.24286V15.4428C5.25714 18.8907 8.05215 21.6857 11.4999 21.6857C14.9478 21.6857 17.7428 18.8907 17.7428 15.4428V6.24286ZM11.4999 1.97143C13.8591 1.97143 15.7714 3.88381 15.7714 6.24286V15.4428C15.7714 17.8018 13.8591 19.7143 11.4999 19.7143C9.14093 19.7143 7.22856 17.8018 7.22856 15.4428V6.24286C7.22856 3.88381 9.14093 1.97143 11.4999 1.97143Z" 
                        fill={isListening ? "#FFFFFF" : "#33302E"}
                      />
                      <path 
                        fillRule="evenodd" 
                        clipRule="evenodd" 
                        d="M22.0142 9.19999C21.4698 9.19999 21.0285 9.64131 21.0285 10.1857V15.4428C21.0285 20.7053 16.7624 24.9714 11.4999 24.9714C6.23751 24.9714 1.97143 20.7053 1.97143 15.4428V10.1857C1.97143 9.64131 1.5301 9.19999 0.985708 9.19999C0.441311 9.19999 0 9.64131 0 10.1857V15.4428C0 21.7941 5.14872 26.9429 11.4999 26.9429C17.8512 26.9429 23 21.7941 23 15.4428V10.1857C23 9.64131 22.5587 9.19999 22.0142 9.19999Z" 
                        fill={isListening ? "#FFFFFF" : "#33302E"}
                      />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
        
      </div>

      {/* CSS for animations and exact Figma styling */}
      <style>{`
        .App {
          width: 100vw;
          height: 100vh;
          margin: 0;
          padding: 0;
        }
        
        body {
          margin: 0;
          padding: 0;
          width: 100%;
          height: 100%;
        }
        
        #root {
          width: 100%;
          height: 100%;
        }
        
        @keyframes pulse {
          0%, 100% { opacity: 0.5; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.2); }
        }
        
        @keyframes micPulse {
          0% { 
            transform: translate(-50%, -50%) scale(1);
            opacity: 0.7;
          }
          50% { 
            transform: translate(-50%, -50%) scale(2.4);
            opacity: 0.3;
          }
          100% { 
            transform: translate(-50%, -50%) scale(1);
            opacity: 0.7;
          }
        }
        
        /* Custom scrollbar for chat */
        ::-webkit-scrollbar {
          width: 4px;
        }
        ::-webkit-scrollbar-track {
          background: rgba(0, 0, 0, 0.1);
          border-radius: 2px;
        }
        ::-webkit-scrollbar-thumb {
          background: rgba(0, 0, 0, 0.3);
          border-radius: 2px;
        }
        ::-webkit-scrollbar-thumb:hover {
          background: rgba(0, 0, 0, 0.5);
        }
        
        /* Placeholder styling */
        textarea::placeholder {
          color: #666;
        }
      `}</style>
    </div>
  );
}

export default App;

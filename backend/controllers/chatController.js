/**
 * Azure Speech Service Viseme Reference
 * Complete mapping from Microsoft documentation:
 * 
 * ID | Viseme | Example words
 * ---|--------|---------------
 * 0  | sil    | silence
 * 1  | ae     | cat, map
 * 2  | aa     | father, palm  
 * 3  | ao     | dog, caught
 * 4  | eh     | bed, men
 * 5  | er     | bird, hurt
 * 6  | ih     | bit, fill
 * 7  | iy     | beat, feel
 * 8  | uh     | book, good
 * 9  | ah     | but, cut
 * 10 | uw     | boot, cool
 * 11 | aw     | cow, out
 * 12 | ay     | hide, my
 * 13 | r      | red, car
 * 14 | l      | lid, feel
 * 15 | s      | sit, less
 * 16 | sh     | she, leash
 * 17 | ch     | chin, nature
 * 18 | f      | fork, rough
 * 19 | th     | think, math
 * 20 | k      | call, black
 * 21 | p      | put, book
 */

const OpenAI = require('openai');
const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const getAudioDurationInSeconds = require('mp3-duration');
const sdk = require('microsoft-cognitiveservices-speech-sdk');

// Initialize OpenAI client
let openaiClient = null;
if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'your_openai_api_key_here') {
  openaiClient = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
}

// Azure Speech Service configuration
const AZURE_SPEECH_KEY = process.env.AZURE_SPEECH_KEY;
const AZURE_SPEECH_REGION = process.env.AZURE_SPEECH_REGION;

/**
 * Generate AI response using OpenAI GPT
 */
async function generateAIResponse(message) {
  if (!openaiClient) {
    throw new Error('OpenAI API key not configured');
  }

  try {
    const prompt = `You are Echo, a friendly and helpful AI assistant with a bit of a playful personality. You are concise but warm in your responses. Keep responses under 100 words. Respond to: ${message}`;

    const completion = await openaiClient.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 150,
      temperature: 0.7,
    });

    return completion.choices[0].message.content.trim();
  } catch (error) {
    console.error('OpenAI error:', error);
    throw new Error('Failed to generate AI response');
  }
}

/**
 * Convert text to speech using Azure Speech SDK with REAL viseme data
 */
async function textToSpeechWithVisemes(text) {
  if (!AZURE_SPEECH_KEY || !AZURE_SPEECH_REGION || 
      AZURE_SPEECH_KEY === 'your_azure_speech_key_here' || 
      AZURE_SPEECH_REGION === 'your_azure_region_here') {
    throw new Error('Azure Speech Service not configured');
  }

  return new Promise((resolve, reject) => {
    try {
      // Create speech config
      const speechConfig = sdk.SpeechConfig.fromSubscription(AZURE_SPEECH_KEY, AZURE_SPEECH_REGION);
      speechConfig.speechSynthesisOutputFormat = sdk.SpeechSynthesisOutputFormat.Audio24Khz160KBitRateMonoMp3;
      speechConfig.speechSynthesisVoiceName = "en-US-EchoTurboMultilingualNeural";

      // Create SSML with viseme events enabled
      const ssml = `
        <speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" 
               xmlns:mstts="http://www.w3.org/2001/mstts" xml:lang="en-US">
          <voice name="en-US-EchoTurboMultilingualNeural">
            <mstts:viseme type="redlips_front"/>
            ${text}
          </voice>
        </speak>
      `;

      // Create synthesizer
      const synthesizer = new sdk.SpeechSynthesizer(speechConfig);

      // Arrays to collect real Azure viseme data
      const realVisemes = [];
      let audioData = null;

      // Listen for viseme events (REAL DATA FROM AZURE!)
      synthesizer.visemeReceived = function (s, e) {
        console.log(`[REAL VISEME] 🎯 Received: visemeId=${e.visemeId}, time=${e.audioOffset / 10000}ms`);
        realVisemes.push({
          visemeId: e.visemeId,
          timeMs: Math.round(e.audioOffset / 10000), // Convert from 100ns units to milliseconds
          duration: 50 // Default duration, will be calculated properly
        });
      };

      // Synthesize speech with REAL viseme data
      synthesizer.speakSsmlAsync(
        ssml,
        async function (result) {
          try {
            if (result.reason === sdk.ResultReason.SynthesizingAudioCompleted) {
              console.log(`[REAL VISEME] ✅ Synthesis completed with ${realVisemes.length} real visemes`);
              
              // Save audio file
              const audioFilename = `echo_${Date.now()}_${uuidv4().substring(0, 8)}.mp3`;
              const audioPath = path.join(__dirname, '..', 'audio', audioFilename);
              
              await fs.writeFile(audioPath, Buffer.from(result.audioData));
              console.log(`[REAL VISEME] 💾 Audio saved: ${audioFilename}`);

              // Process real visemes for proper duration calculation
              const processedVisemes = processRealVisemes(realVisemes);
              
              // Get actual audio duration for validation
              const actualDurationMs = await getAudioDurationMs(audioPath);
              console.log(`[REAL VISEME] ⏱️ Audio duration: ${actualDurationMs}ms`);
              console.log(`[REAL VISEME] 📊 Viseme span: 0ms to ${processedVisemes[processedVisemes.length - 1]?.timeMs || 0}ms`);

              synthesizer.close();
              resolve({
                audioFilename,
                audioPath,
                visemes: processedVisemes
              });

            } else {
              console.error(`[REAL VISEME] ❌ Synthesis failed: ${result.errorDetails}`);
              synthesizer.close();
              reject(new Error(`Speech synthesis failed: ${result.errorDetails}`));
            }
          } catch (error) {
            console.error('[REAL VISEME] ❌ Processing error:', error);
            synthesizer.close();
            reject(error);
          }
        },
        function (error) {
          console.error('[REAL VISEME] ❌ Synthesis error:', error);
          synthesizer.close();
          reject(new Error(`Speech synthesis error: ${error}`));
        }
      );

    } catch (error) {
      console.error('[REAL VISEME] ❌ Setup error:', error);
      reject(new Error(`Failed to setup speech synthesis: ${error.message}`));
    }
  });
}

/**
 * Process real Azure visemes for proper duration and timing
 * @param {Array} realVisemes - Real viseme data from Azure Speech SDK
 * @returns {Array} Processed viseme array with proper durations
 */
function processRealVisemes(realVisemes) {
  if (!realVisemes || realVisemes.length === 0) {
    console.warn('[REAL VISEME] ⚠️ No real visemes received, creating fallback');
    return [{
      visemeId: 0,
      timeMs: 0,
      duration: 100
    }];
  }

  // Sort by time to ensure proper order
  realVisemes.sort((a, b) => a.timeMs - b.timeMs);

  // Calculate durations based on gaps between visemes
  for (let i = 0; i < realVisemes.length - 1; i++) {
    const currentViseme = realVisemes[i];
    const nextViseme = realVisemes[i + 1];
    
    // Duration is the time until next viseme (minimum 30ms, maximum 200ms)
    const calculatedDuration = Math.max(30, Math.min(200, nextViseme.timeMs - currentViseme.timeMs));
    currentViseme.duration = calculatedDuration;
  }

  // Last viseme gets a default duration
  if (realVisemes.length > 0) {
    realVisemes[realVisemes.length - 1].duration = 100;
  }

  // Add initial silence if first viseme doesn't start at 0
  if (realVisemes[0]?.timeMs > 0) {
    realVisemes.unshift({
      visemeId: 0,
      timeMs: 0,
      duration: realVisemes[0].timeMs
    });
  }

  // Add final silence
  const lastViseme = realVisemes[realVisemes.length - 1];
  realVisemes.push({
    visemeId: 0,
    timeMs: lastViseme.timeMs + lastViseme.duration,
    duration: 100
  });

  console.log(`[REAL VISEME] 📊 Processed ${realVisemes.length} real visemes`);
  console.log(`[REAL VISEME] First 3:`, realVisemes.slice(0, 3));
  console.log(`[REAL VISEME] Last 3:`, realVisemes.slice(-3));
  
  return realVisemes;
}

/**
 * Generate improved viseme data for lip sync using Azure Speech Service viseme IDs
 * Enhanced version for more accurate timing and proper pauses
 */
function generateMockVisemes(text) {
  const visemes = [];
  const words = text.split(/\s+/).filter(word => word.length > 0);
  let currentTime = 30; // Initial delay (shorter for responsiveness)
  
  // Azure Speech Service viseme mapping (IDs 0-21)
  const visemeMap = {
    // Vowels
    'a': 2,  // aa (as in "father")
    'e': 4,  // eh (as in "bed") 
    'i': 6,  // ih (as in "bit")
    'o': 3,  // ao (as in "bought")
    'u': 10, // uw (as in "boot")
    'y': 7,  // iy (as in "beat")
    
    // Consonants - Bilabials (lips together)
    'b': 21, 'p': 21, 'm': 21,
    
    // Consonants - Labiodentals (lip to teeth)
    'f': 18, 'v': 18,
    
    // Consonants - Dental/Alveolar (tongue to teeth/ridge)
    't': 19, 'd': 19, 'n': 19, 
    'l': 14, 'r': 13,
    's': 15, 'z': 15,
    
    // Consonants - Palatal/Velar
    'sh': 16, 'ch': 17, 'j': 17,
    'k': 20, 'g': 20,
    
    // Special cases
    'w': 21, // Similar to 'uw' but with lip rounding
    'h': 0,  // Neutral/rest position for 'h' sounds
    
    // Silence/Rest
    'default': 0  // Neutral/rest position
  };

  // Add initial silence/neutral position
  visemes.push({
    visemeId: 0,
    timeMs: 0,
    duration: 30
  });

  words.forEach((word, wordIndex) => {
    // Add silence before each word (except the first one)
    if (wordIndex > 0) {
      visemes.push({
        visemeId: 0,  // Silence/neutral
        timeMs: Math.round(currentTime),
        duration: 50  // Short pause between words
      });
      currentTime += 50;
    }

    // More realistic timing calculations
    // Average speech rate: ~150 words per minute = ~400ms per word
    // But TTS is often faster, so we adjust accordingly
    const baseWordDuration = 100;  // Base duration per word
    const wordDuration = baseWordDuration + (word.length * 30);  // Scale with word length
    const phonemeDuration = Math.max(30, Math.min(100, wordDuration / Math.max(1, word.length)));  // Constrain to reasonable range
    
    // Process each character in the word (simplistic phoneme approximation)
    for (let i = 0; i < word.length; i++) {
      let char = word[i].toLowerCase();
      
      // Handle digraphs (two-character phonemes)
      if (i < word.length - 1) {
        const digraph = char + word[i+1].toLowerCase();
        if (digraph === 'sh' || digraph === 'ch' || digraph === 'th') {
          char = digraph;
          i++; // Skip the next character since we used it
        }
      }
      
      const visemeId = visemeMap[char] || visemeMap['default'];
      const phonemeTime = currentTime + (i * phonemeDuration);
      
      visemes.push({
        visemeId: visemeId,
        timeMs: Math.round(phonemeTime),
        duration: Math.round(phonemeDuration)
      });
    }
    
    currentTime += wordDuration;
  });

  // Add final silence/neutral position
  visemes.push({
    visemeId: 0,
    timeMs: Math.round(currentTime),
    duration: 100
  });

  // Validation and cleanup
  const validVisemes = visemes.filter(v => v.visemeId >= 0 && v.visemeId <= 21 && v.timeMs >= 0);
  if (validVisemes.length !== visemes.length) {
    console.warn(`[VISEME] ⚠️ Filtered ${visemes.length - validVisemes.length} invalid visemes`);
  }

  // Ensure we have at least a minimum sequence
  if (visemes.length <= 2) { // If we only have initial and final silence
    visemes.push({
      visemeId: 2, // Generic open mouth
      timeMs: 50,
      duration: 200
    });
  }

  // Detailed logging for debugging
  console.log(`[VISEME] 📊 Enhanced generator for text length: ${text.length} chars`);
  console.log(`[VISEME] 📊 Created ${validVisemes.length} visemes spanning ${currentTime}ms (${(currentTime/1000).toFixed(2)}s)`);
  console.log(`[VISEME] 📊 Words processed: ${words.length}`);
  console.log(`[VISEME] First 3 visemes:`, validVisemes.slice(0, 3));
  console.log(`[VISEME] Last 3 visemes:`, validVisemes.slice(-3));
  console.log(`[VISEME] Time distribution: every ${(currentTime/validVisemes.length).toFixed(1)}ms average`);
  
  return validVisemes;
}

/**
 * Get the actual duration of an MP3 file in milliseconds
 * @param {string} audioPath - Path to the MP3 file
 * @returns {Promise<number>} Duration in milliseconds
 */
async function getAudioDurationMs(audioPath) {
  try {
    const durationInSeconds = await getAudioDurationInSeconds(audioPath);
    const durationMs = Math.round(durationInSeconds * 1000);
    console.log(`[DURATION] 🎵 Audio file duration: ${durationMs}ms (${durationInSeconds.toFixed(2)}s)`);
    return durationMs;
  } catch (error) {
    console.error(`[DURATION] ❌ Failed to get audio duration for ${audioPath}:`, error);
    // Fallback: estimate based on text length (rough approximation)
    const estimatedMs = 3000; // Default fallback
    console.log(`[DURATION] ⚠️ Using fallback duration: ${estimatedMs}ms`);
    return estimatedMs;
  }
}

/**
 * Scale mock viseme timings to match actual audio duration
 * @param {Array} mockVisemes - Array of mock viseme objects with timeMs property
 * @param {number} actualDurationMs - Actual audio duration in milliseconds
 * @returns {Array} Scaled viseme array matching audio duration
 */
function generateDurationMatchedVisemes(mockVisemes, actualDurationMs) {
  if (!mockVisemes || mockVisemes.length === 0) {
    console.warn('[DURATION] ⚠️ No mock visemes provided for scaling');
    return [];
  }

  // Find the last viseme's end time (timeMs + duration) to determine mock duration
  const lastViseme = mockVisemes[mockVisemes.length - 1];
  const mockDurationMs = lastViseme.timeMs + (lastViseme.duration || 0);
  
  console.log(`[DURATION] 📏 Mock duration: ${mockDurationMs}ms, Actual duration: ${actualDurationMs}ms`);
  
  if (mockDurationMs <= 0) {
    console.error('[DURATION] ❌ Invalid mock duration, returning original visemes');
    return mockVisemes;
  }

  // Calculate scaling factor with slight extension for frontend sync
  // Add 150ms buffer to ensure visemes extend slightly past audio for perfect sync
  const extendedDurationMs = actualDurationMs + 150;
  const scaleFactor = extendedDurationMs / mockDurationMs;
  console.log(`[DURATION] 📐 Scaling factor: ${scaleFactor.toFixed(3)} (with 150ms sync buffer)`);

  // Scale all viseme timings
  const scaledVisemes = mockVisemes.map((viseme, index) => {
    const scaledTimeMs = Math.round(viseme.timeMs * scaleFactor);
    const scaledDuration = Math.round((viseme.duration || 50) * scaleFactor);
    
    return {
      ...viseme,
      timeMs: scaledTimeMs,
      duration: scaledDuration
    };
  });

  // Validation - ensure we don't exceed extended duration
  const maxAllowedTime = extendedDurationMs - 25; // Leave minimal buffer
  const validatedVisemes = scaledVisemes.filter(v => v.timeMs <= maxAllowedTime);
  
  if (validatedVisemes.length !== scaledVisemes.length) {
    console.warn(`[DURATION] ⚠️ Filtered ${scaledVisemes.length - validatedVisemes.length} visemes that exceeded audio duration`);
  }

  console.log(`[DURATION] ✅ Duration matching complete: ${validatedVisemes.length} visemes scaled to ${extendedDurationMs}ms (${actualDurationMs}ms audio + 150ms sync buffer)`);
  console.log(`[DURATION] First scaled viseme:`, validatedVisemes[0]);
  console.log(`[DURATION] Last scaled viseme:`, validatedVisemes[validatedVisemes.length - 1]);
  
  return validatedVisemes;
}

/**
 * Main chat endpoint handler
 */
async function handleChatMessage(req, res) {
  try {
    const { message } = req.body;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'Message is required and must be a string'
      });
    }

    console.log(`[CHAT] Received message: ${message.substring(0, 50)}...`);

    // Generate AI response
    console.log('[CHAT] Generating AI response...');
    const aiResponse = await generateAIResponse(message);
    console.log(`[CHAT] AI response: ${aiResponse.substring(0, 50)}...`);

    // Generate speech and visemes
    console.log('[CHAT] Generating speech and visemes...');
    const { audioFilename, visemes } = await textToSpeechWithVisemes(aiResponse);
    
    const response = {
      text: aiResponse,
      audioUrl: `/audio/${audioFilename}`,
      visemes: visemes,
      success: true
    };

    console.log(`[CHAT] Response ready with ${visemes.length} visemes`);
    res.json(response);

  } catch (error) {
    console.error('[CHAT] Error:', error);
    
    // Return error response
    res.status(500).json({
      error: 'Chat service error',
      message: error.message,
      success: false
    });
  }
}

module.exports = {
  handleChatMessage
};

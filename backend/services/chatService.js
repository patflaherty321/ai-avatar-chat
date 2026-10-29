const OpenAI = require('openai');
const sdk = require('microsoft-cognitiveservices-speech-sdk');
const fs = require('fs-extra');
const path = require('path');
const { randomUUID } = require('node:crypto');
const { ChatError, abortError, mapAIError } = require('./chatErrors');

const DEFAULT_MODEL = 'gpt-6-luna';
const TIMEOUT_MS = 25000;
const VOICE = 'en-US-EchoTurboMultilingualNeural';
const PERSONA = 'You are Echo, a friendly and helpful AI assistant with a playful personality. Be concise and warm. Keep every response under 100 words.';

function configured(value) {
  return typeof value === 'string' && value.trim() !== '' && !/^your_.*_here$/i.test(value.trim());
}

function normalizeMessage(message) {
  if (typeof message !== 'string' || !message.trim()) throw new ChatError('INVALID_REQUEST');
  return message.trim();
}

function escapeXml(text) {
  return text.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character]);
}

function processRealVisemes(visemes) {
  if (!visemes.length) return [{ visemeId: 0, timeMs: 0, duration: 100 }];
  const result = visemes.map(viseme => ({ ...viseme })).sort((a, b) => a.timeMs - b.timeMs);
  for (let index = 0; index < result.length - 1; index++) {
    result[index].duration = Math.max(30, Math.min(200, result[index + 1].timeMs - result[index].timeMs));
  }
  result[result.length - 1].duration = 100;
  if (result[0].timeMs > 0) result.unshift({ visemeId: 0, timeMs: 0, duration: result[0].timeMs });
  const last = result[result.length - 1];
  result.push({ visemeId: 0, timeMs: last.timeMs + last.duration, duration: 100 });
  return result;
}

function createChatService({
  env = process.env,
  OpenAIClient = OpenAI,
  speechSdk = sdk,
  fileSystem = fs,
  timers = { setTimeout, clearTimeout },
  aiTimeoutMs = TIMEOUT_MS,
  speechTimeoutMs = TIMEOUT_MS,
  audioDir = path.join(__dirname, '..', 'audio')
} = {}) {
  const model = typeof env.OPENAI_MODEL === 'string' && env.OPENAI_MODEL.trim() ? env.OPENAI_MODEL.trim() : DEFAULT_MODEL;
  let client;

  function validateConfiguration() {
    if (![env.OPENAI_API_KEY, env.AZURE_SPEECH_KEY, env.AZURE_SPEECH_REGION].every(configured)) {
      throw new ChatError('CONFIGURATION_ERROR');
    }
  }

  async function generateResponse(message, { signal } = {}) {
    const content = normalizeMessage(message);
    if (!configured(env.OPENAI_API_KEY)) throw new ChatError('CONFIGURATION_ERROR');
    if (signal?.aborted) throw abortError();
    try {
      if (!client) client = new OpenAIClient({ apiKey: env.OPENAI_API_KEY, maxRetries: 0, timeout: aiTimeoutMs });
      const completion = await new Promise((resolve, reject) => {
        const upstreamAbort = new AbortController();
        let settled = false;
        let timer;
        const settle = (error, result) => {
          if (settled) return;
          settled = true;
          timers.clearTimeout(timer);
          signal?.removeEventListener('abort', disconnect);
          if (error) reject(error); else resolve(result);
        };
        const cancel = error => {
          settle(error);
          upstreamAbort.abort();
        };
        const disconnect = () => cancel(abortError());
        signal?.addEventListener('abort', disconnect, { once: true });
        timer = timers.setTimeout(() => cancel(new ChatError('AI_TIMEOUT')), aiTimeoutMs);
        Promise.resolve().then(() => {
          if (settled) return;
          return client.chat.completions.create({
            model,
            messages: [{ role: 'system', content: PERSONA }, { role: 'user', content }],
            reasoning_effort: 'none',
            max_completion_tokens: 256,
            temperature: 0.7
          }, { signal: upstreamAbort.signal, timeout: aiTimeoutMs, maxRetries: 0 });
        }).then(result => settle(null, result), error => settle(mapAIError(error)));
      });
      const text = completion?.choices?.[0]?.message?.content;
      if (typeof text !== 'string' || !text.trim()) throw new ChatError('EMPTY_RESPONSE');
      return text.trim();
    } catch (error) {
      if (signal?.aborted) throw abortError();
      throw mapAIError(error);
    }
  }

  function synthesizeSpeech(text, { signal } = {}) {
    if (!configured(env.AZURE_SPEECH_KEY) || !configured(env.AZURE_SPEECH_REGION)) {
      return Promise.reject(new ChatError('CONFIGURATION_ERROR'));
    }
    if (signal?.aborted) return Promise.reject(abortError());
    return new Promise((resolve, reject) => {
      let synthesizer;
      let closed = false;
      let settled = false;
      let synthesisComplete = false;
      let timer;
      const visemes = [];
      const close = () => {
        if (!synthesizer || closed) return;
        closed = true;
        synthesizer.visemeReceived = undefined;
        try { synthesizer.close(); } catch { /* Cleanup must not replace the stable result. */ }
      };
      const settle = (error, result) => {
        if (settled) return;
        settled = true;
        timers.clearTimeout(timer);
        signal?.removeEventListener('abort', disconnect);
        close();
        if (error) reject(error); else resolve(result);
      };
      const disconnect = () => settle(abortError());
      const removeAudio = async audioPath => {
        try { await fileSystem.remove(audioPath); } catch { /* Best effort for an unsent artifact. */ }
      };
      const cancellationError = result => {
        let code;
        try { code = speechSdk.CancellationDetails.fromResult(result).ErrorCode; } catch { /* No safe diagnostic is available. */ }
        const codes = speechSdk.CancellationErrorCode;
        let classification = 'SPEECH_UNAVAILABLE';
        if (code === codes?.AuthenticationFailure) classification = 'CONFIGURATION_ERROR';
        else if (code === codes?.TooManyRequests || code === codes?.Forbidden) classification = 'RATE_LIMITED';
        else if (code === codes?.ServiceTimeout) classification = 'SPEECH_TIMEOUT';
        return new ChatError(classification, { code });
      };
      signal?.addEventListener('abort', disconnect, { once: true });
      timer = timers.setTimeout(() => settle(new ChatError('SPEECH_TIMEOUT')), speechTimeoutMs);
      try {
        const config = speechSdk.SpeechConfig.fromSubscription(env.AZURE_SPEECH_KEY, env.AZURE_SPEECH_REGION);
        config.speechSynthesisOutputFormat = speechSdk.SpeechSynthesisOutputFormat.Audio24Khz160KBitRateMonoMp3;
        config.speechSynthesisVoiceName = VOICE;
        synthesizer = new speechSdk.SpeechSynthesizer(config);
        synthesizer.visemeReceived = (sender, event) => {
          if (!settled && !synthesisComplete) {
            visemes.push({ visemeId: event.visemeId, timeMs: Math.round(event.audioOffset / 10000), duration: 50 });
          }
        };
        const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="http://www.w3.org/2001/mstts" xml:lang="en-US"><voice name="${VOICE}"><mstts:viseme type="redlips_front"/>${escapeXml(text)}</voice></speak>`;
        synthesizer.speakSsmlAsync(ssml, async result => {
          if (settled || synthesisComplete) return;
          synthesisComplete = true;
          close();
          if (result.reason !== speechSdk.ResultReason.SynthesizingAudioCompleted) {
            settle(cancellationError(result));
            return;
          }
          const audioFilename = `echo_${Date.now()}_${randomUUID().slice(0, 8)}.mp3`;
          const audioPath = path.join(audioDir, audioFilename);
          try {
            await fileSystem.writeFile(audioPath, Buffer.from(result.audioData));
            if (settled) {
              await removeAudio(audioPath);
              return;
            }
            settle(null, { audioFilename, audioPath, visemes: processRealVisemes(visemes) });
          } catch {
            await removeAudio(audioPath);
            settle(new ChatError('SPEECH_UNAVAILABLE'));
          }
        }, () => {
          if (!synthesisComplete) settle(new ChatError('SPEECH_UNAVAILABLE'));
        });
      } catch {
        settle(new ChatError('SPEECH_UNAVAILABLE'));
      }
    });
  }

  return { model, validateConfiguration, generateResponse, synthesizeSpeech };
}

module.exports = { createChatService, normalizeMessage, DEFAULT_MODEL };

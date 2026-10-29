const { randomUUID } = require('node:crypto');
const { performance } = require('node:perf_hooks');
const { createChatService, normalizeMessage } = require('../services/chatService');
const { ChatError, errorBody } = require('../services/chatErrors');

function createChatController({ service = createChatService(), logger = console, now = () => performance.now(), requestId = randomUUID } = {}) {
  return async function handleChatMessage(req, res) {
    const id = req.requestId || requestId();
    const started = now();
    const cancellation = new AbortController();
    const timings = { aiMs: 0, speechMs: 0 };
    let outcome = 'success';
    let failure;
    const disconnect = () => cancellation.abort();
    const responseClosed = () => { if (!res.writableEnded) disconnect(); };
    req.once('aborted', disconnect);
    res.once('close', responseClosed);
    if (req.aborted || res.destroyed) disconnect();
    res.set('X-Request-Id', id);
    try {
      if (cancellation.signal.aborted) return;
      const message = normalizeMessage(req.body?.message);
      service.validateConfiguration();
      const aiStarted = now();
      let text;
      try {
        text = await service.generateResponse(message, { signal: cancellation.signal });
      } finally {
        timings.aiMs = Math.round(now() - aiStarted);
      }
      if (cancellation.signal.aborted) return;
      const speechStarted = now();
      let speech;
      try {
        speech = await service.synthesizeSpeech(text, { signal: cancellation.signal });
      } finally {
        timings.speechMs = Math.round(now() - speechStarted);
      }
      if (!cancellation.signal.aborted && !res.destroyed) {
        res.json({ text, audioUrl: `/audio/${speech.audioFilename}`, visemes: speech.visemes, success: true });
      }
    } catch (error) {
      if (!cancellation.signal.aborted) {
        outcome = 'error';
        failure = error instanceof ChatError ? error : new ChatError('INTERNAL_ERROR');
        if (!res.headersSent && !res.destroyed) res.status(failure.status).json(errorBody(failure, id));
      }
    } finally {
      req.removeListener('aborted', disconnect);
      res.removeListener('close', responseClosed);
      if (cancellation.signal.aborted) outcome = 'disconnected';
      const record = {
        event: 'chat.request', requestId: id,
        model: /^[A-Za-z0-9._:-]{1,128}$/.test(service.model) ? service.model : 'unknown',
        outcome, code: failure?.code || (outcome === 'success' ? 'OK' : 'CLIENT_DISCONNECTED'),
        upstreamStatus: failure?.upstreamStatus ?? null, upstreamCode: failure?.upstreamCode ?? null,
        ...timings, totalMs: Math.round(now() - started)
      };
      try { logger.info(JSON.stringify(record)); } catch { /* Logging must not change the response. */ }
    }
  };
}

module.exports = { handleChatMessage: createChatController(), createChatController };

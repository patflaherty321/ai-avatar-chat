const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs-extra');
const { randomUUID } = require('node:crypto');
const { performance } = require('node:perf_hooks');
require('dotenv').config();

const { createChatRoutes } = require('./routes/chatRoute');
const { createChatController } = require('./controllers/chatController');
const { createChatService } = require('./services/chatService');
const { ChatError, errorBody } = require('./services/chatErrors');

function createApp({ env = process.env, chatService = createChatService({ env }), chatHandler, logger = console } = {}) {
  const app = express();
  const audioDir = path.join(__dirname, 'audio');
  fs.ensureDirSync(audioDir);
  const model = /^[A-Za-z0-9._:-]{1,128}$/.test(chatService.model) ? chatService.model : 'unknown';

  app.use(cors({ origin: env.FRONTEND_URL || 'http://localhost:3002', credentials: true }));
  app.use((req, res, next) => {
    req.requestId = randomUUID();
    req.startedAt = performance.now();
    res.set('X-Request-Id', req.requestId);
    next();
  });
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  app.use('/audio', express.static(audioDir));
  app.get('/health', (req, res) => {
    res.json({ status: 'healthy', check: 'liveness', model, timestamp: new Date().toISOString(), version: '1.0.0' });
  });
  app.use('/api', createChatRoutes({ model, chatHandler: chatHandler || createChatController({ service: chatService, logger }) }));

  app.use((error, req, res, next) => {
    const failure = new ChatError(error.status >= 400 && error.status < 500 ? 'INVALID_REQUEST' : 'INTERNAL_ERROR');
    try {
      logger.info(JSON.stringify({
        event: 'chat.request', requestId: req.requestId, model, outcome: 'error', code: failure.code,
        upstreamStatus: null, upstreamCode: null, aiMs: 0, speechMs: 0,
        totalMs: Math.round(performance.now() - req.startedAt)
      }));
    } catch { /* Logging must not change the response. */ }
    if (res.headersSent) {
      res.destroy();
      return;
    }
    res.status(failure.status).json(errorBody(failure, req.requestId));
  });
  app.use('*', (req, res) => {
    res.status(404).json({ error: 'Not found', message: 'The requested endpoint does not exist' });
  });
  return app;
}

const app = createApp();
if (require.main === module) {
  const port = process.env.PORT || 3006;
  app.listen(port, () => console.info(JSON.stringify({ event: 'server.started', port })));
}
module.exports = app;
module.exports.createApp = createApp;

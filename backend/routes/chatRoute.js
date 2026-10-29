const express = require('express');
const { handleChatMessage } = require('../controllers/chatController');
const { DEFAULT_MODEL } = require('../services/chatService');

function createChatRoutes({ chatHandler = handleChatMessage, model = DEFAULT_MODEL } = {}) {
  const router = express.Router();
  router.post('/chat', chatHandler);
  router.get('/chat/health', (req, res) => {
    res.json({ service: 'chat', status: 'healthy', check: 'liveness', model, timestamp: new Date().toISOString() });
  });
  return router;
}

module.exports = createChatRoutes();
module.exports.createChatRoutes = createChatRoutes;

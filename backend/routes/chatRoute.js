const express = require('express');
const { handleChatMessage } = require('../controllers/chatController');

const router = express.Router();

// Main chat endpoint
router.post('/chat', handleChatMessage);

// Health check specific to chat service
router.get('/chat/health', (req, res) => {
  res.json({
    service: 'chat',
    status: 'healthy',
    timestamp: new Date().toISOString(),
    features: {
      openai: !!process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'your_openai_api_key_here',
      azure_tts: !!process.env.AZURE_SPEECH_KEY && process.env.AZURE_SPEECH_KEY !== 'your_azure_speech_key_here'
    }
  });
});

module.exports = router;

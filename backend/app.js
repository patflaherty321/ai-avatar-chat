const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs-extra');
require('dotenv').config();

const chatRoutes = require('./routes/chatRoute');

const app = express();
const PORT = process.env.PORT || 3006;

// Ensure audio directory exists
const audioDir = path.join(__dirname, 'audio');
fs.ensureDirSync(audioDir);

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve static audio files
app.use('/audio', express.static(audioDir));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// API routes
app.use('/api', chatRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Not found',
    message: 'The requested endpoint does not exist'
  });
});

app.listen(PORT, () => {
  console.log(`🚀 AI Avatar Chat Backend running on port ${PORT}`);
  console.log(`📁 Audio files served from: ${audioDir}`);
  console.log(`🌐 CORS enabled for: ${process.env.FRONTEND_URL || 'http://localhost:3002'}`);
  console.log(`🔧 Environment: ${process.env.NODE_ENV || 'development'}`);
  
  // Check environment variables
  if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'your_openai_api_key_here') {
    console.warn('⚠️  OpenAI API key not configured');
  } else {
    console.log('✅ OpenAI API key configured');
  }
  
  if (!process.env.AZURE_SPEECH_KEY || process.env.AZURE_SPEECH_KEY === 'your_azure_speech_key_here') {
    console.warn('⚠️  Azure Speech key not configured');
  } else {
    console.log('✅ Azure Speech service configured');
  }
});

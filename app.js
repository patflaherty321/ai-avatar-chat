// Add comprehensive debugging
console.log('🚀 App.js is starting...');
console.log('Current directory:', __dirname);
console.log('Environment variables:', {
    NODE_ENV: process.env.NODE_ENV,
    PORT: process.env.PORT,
    RAILWAY_ENVIRONMENT: process.env.RAILWAY_ENVIRONMENT
});

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs-extra');
require('dotenv').config();

const chatRoutes = require('./routes/chatRoute');

const app = express();
const PORT = process.env.PORT || 3006;
const HOST = '0.0.0.0'; // Important for Railway

console.log(`📡 Server will run on ${HOST}:${PORT}`);

// Ensure audio directory exists
const audioDir = path.join(__dirname, 'audio');
fs.ensureDirSync(audioDir);

// CORS configuration - UPDATED with all Vercel URLs
const corsOptions = {
  origin: function (origin, callback) {
    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:3002',
      'https://ai-avatar-chat-dusky.vercel.app',
      'https://ai-avatar-chat-k3y3ek3st-patflaherty321s-projects.vercel.app',
      'https://ai-avatar-chat-77fsx4op6-patflaherty321s-projects.vercel.app',
      'https://ai-avatar-chat-fsjkb9ye1-patflaherty321s-projects.vercel.app',
      process.env.FRONTEND_URL
    ].filter(Boolean);
    
    // Check if origin matches any allowed origin or use regex for all Vercel preview deployments
    const isAllowed = !origin || allowedOrigins.some(allowed => allowed === origin) || 
                     /https:\/\/ai-avatar-chat-.*\.vercel\.app$/.test(origin);
    
    if (isAllowed) {
      callback(null, true);
    } else {
      console.warn('CORS blocked origin:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400 // 24 hours
};

app.use(cors(corsOptions));

// Add explicit OPTIONS handler for preflight requests
app.options('*', cors(corsOptions));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve static audio files
app.use('/audio', express.static(audioDir));

// Health check endpoint
app.get('/health', (req, res) => {
  console.log('🏥 Health check endpoint called');
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    platform: process.env.RAILWAY_ENVIRONMENT ? 'Railway' : 'Local',
    port: PORT,
    host: HOST,
    environment: process.env.NODE_ENV || 'development'
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

// Start server with comprehensive logging
app.listen(PORT, HOST, () => {
  console.log(`🚀 AI Avatar Chat Backend running on http://${HOST}:${PORT}`);
  console.log(`📁 Audio files served from: ${audioDir}`);
  console.log(`🌐 CORS enabled for: ${process.env.FRONTEND_URL || 'http://localhost:3002'}`);
  console.log(`🔧 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log('🐳 Platform:', process.env.RAILWAY_ENVIRONMENT ? 'Railway' : 'Local');
  
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

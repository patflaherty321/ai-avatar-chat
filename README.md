# AI Avatar Chat Backend

Express.js backend providing OpenAI GPT conversation and Azure TTS with viseme data for the AI Avatar Chat application.

## 🚀 Features

- **OpenAI GPT Integration**: Conversational AI responses
- **Azure Text-to-Speech**: High-quality voice synthesis
- **Viseme Generation**: Lip-sync data for Rive avatar animation
- **Audio File Management**: Serves generated audio files
- **CORS Enabled**: Frontend integration ready
- **Error Handling**: Comprehensive error management

## 📦 Installation

```bash
cd backend
npm install
```

## ⚙️ Configuration

Create a `.env` file with your API credentials:

```bash
# OpenAI Configuration
OPENAI_API_KEY=your_actual_openai_api_key

# Azure Speech Service Configuration  
AZURE_SPEECH_KEY=your_actual_azure_speech_key
AZURE_SPEECH_REGION=your_actual_azure_region

# Server Configuration
PORT=3005
NODE_ENV=development

# Frontend URL for CORS
FRONTEND_URL=http://localhost:3000
```

## 🎯 API Endpoints

### POST `/api/chat`
Main chat endpoint for AI conversation with speech generation.

**Request:**
```json
{
  "message": "Hello, how are you?"
}
```

**Response:**
```json
{
  "text": "Hello! I'm doing great, thank you for asking!",
  "audioUrl": "/audio/echo_1673123456_abc123.mp3", 
  "visemes": [
    {"visemeId": 2, "timeMs": 0, "duration": 150},
    {"visemeId": 4, "timeMs": 150, "duration": 100}
  ],
  "success": true
}
```

### GET `/api/chat/health`
Check chat service health and configuration status.

### GET `/health`
General server health check.

### GET `/audio/:filename`
Serve generated audio files.

## 🏃‍♂️ Running

```bash
# Development mode with auto-restart
npm run dev

# Production mode
npm start
```

## 🔧 Architecture

```
backend/
├── controllers/
│   └── chatController.js    # Main chat logic
├── routes/
│   └── chatRoute.js         # API routes
├── audio/                   # Generated audio files
├── app.js                   # Express app setup
├── package.json
└── .env                     # Environment variables
```

## 📝 Notes

- Audio files are automatically cleaned up (implement cleanup job if needed)
- Viseme data currently uses mock generation - integrate Azure Speech SDK for real visemes
- Supports both development and production environments
- CORS configured for frontend integration

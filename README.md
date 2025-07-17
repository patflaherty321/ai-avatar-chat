# AI Avatar Chat

A modern AI-powered avatar chat application featuring real-time lip-sync animation, voice interaction, and responsive design.

## Features

- 🤖 **AI-Powered Conversations** - Integrated with OpenAI GPT for intelligent responses
- 🎤 **Voice Interaction** - Speech-to-text input and text-to-speech output
- 👄 **Real-time Lip Sync** - Azure Speech Service provides viseme data for natural mouth movements
- 🎨 **Rive Animations** - High-quality 4000x4000 avatar animations using Rive
- 📱 **Responsive Design** - Optimized for both desktop and mobile devices
- 🔊 **Audio Playback** - Full audio responses with synchronized lip movements

## Architecture

- **Frontend**: React application with modern UI components
- **Backend**: Node.js/Express server with AI and speech services
- **Animation**: Rive avatar with real-time lip-sync capabilities
- **AI Services**: OpenAI GPT-4 integration
- **Speech Services**: Azure Cognitive Services for TTS and viseme generation

## Quick Start

### Prerequisites

- Node.js 16+ and npm
- OpenAI API key
- Azure Speech Service key

### Installation

1. Clone the repository:
```bash
git clone https://github.com/patflaherty321/ai-avatar-chat.git
cd ai-avatar-chat
```

2. Install dependencies:
```bash
npm run install-all
```

3. Configure environment variables:

Create `backend/.env`:
```env
OPENAI_API_KEY=your_openai_api_key_here
AZURE_SPEECH_KEY=your_azure_speech_key_here
AZURE_SPEECH_REGION=your_azure_region_here
PORT=3006
```

Create `frontend/.env`:
```env
REACT_APP_BACKEND_URL=http://localhost:3006
```

4. Start the application:
```bash
npm run dev
```

The application will be available at:
- Frontend: http://localhost:3000
- Backend: http://localhost:3006

## Usage

1. **Text Chat**: Type messages in the input field and press Enter
2. **Voice Chat**: Click the microphone button to speak your message
3. **AI Responses**: The avatar will respond with both text and speech, featuring synchronized lip movements

## Development

### Project Structure

```
ai-avatar-chat/
├── frontend/          # React frontend application
│   ├── src/
│   │   ├── App.js     # Main application component
│   │   ├── Avatar.jsx # Rive avatar component with lip-sync
│   │   └── App.css    # Styling
│   ├── public/        # Static assets including Rive files
│   └── package.json
├── backend/           # Node.js backend server
│   ├── app.js         # Express server with API endpoints
│   ├── routes/        # API route handlers
│   └── package.json
└── package.json       # Root package with scripts
```

### Available Scripts

- `npm run dev` - Start both frontend and backend in development mode
- `npm run frontend` - Start only the React frontend
- `npm run backend` - Start only the Node.js backend
- `npm run build` - Build the frontend for production
- `npm run install-all` - Install dependencies for all components

### API Endpoints

- `POST /api/chat` - Send message to AI and get response with audio/visemes
- `GET /api/health` - Health check endpoint

## Configuration

### Frontend Configuration

The frontend can be configured via environment variables in `frontend/.env`:

- `REACT_APP_BACKEND_URL` - Backend server URL (default: http://localhost:3006)

### Backend Configuration

The backend requires these environment variables in `backend/.env`:

- `OPENAI_API_KEY` - Your OpenAI API key
- `AZURE_SPEECH_KEY` - Your Azure Speech Service key
- `AZURE_SPEECH_REGION` - Your Azure region (e.g., "eastus")
- `PORT` - Server port (default: 3006)

## Deployment

### Frontend Deployment

The React frontend can be deployed to any static hosting service:

```bash
cd frontend
npm run build
# Deploy the 'build' folder to your hosting service
```

### Backend Deployment

The Node.js backend can be deployed to services like Railway, Heroku, or Vercel:

1. Ensure environment variables are set in your deployment platform
2. The backend serves static files from the frontend build folder
3. Configure CORS settings for your domain

## Technologies Used

- **React** - Frontend framework
- **Rive** - Animation and avatar system
- **Node.js/Express** - Backend server
- **OpenAI GPT-4** - AI conversation engine
- **Azure Speech Services** - Text-to-speech and viseme generation
- **Web Speech API** - Speech recognition for voice input

## License

MIT License - see LICENSE file for details.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## Support

For issues and questions, please open a GitHub issue or contact the maintainer.

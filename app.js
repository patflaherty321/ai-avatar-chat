// Railway entry point - proxy to backend/app.js
console.log('🚀 Starting Railway deployment...');
console.log('📁 Current directory:', __dirname);
console.log('📦 Node version:', process.version);
console.log('🌍 Environment:', process.env.NODE_ENV || 'development');
console.log('🚪 Port:', process.env.PORT || '3006');

try {
  require('./backend/app.js');
  console.log('✅ Backend app loaded successfully');
} catch (error) {
  console.error('❌ Failed to load backend app:', error);
  process.exit(1);
}

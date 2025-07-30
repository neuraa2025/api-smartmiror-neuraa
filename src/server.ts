import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// Load environment variables
dotenv.config();

import corsMiddleware from './middleware/cors';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import routes from './routes';
import { autoSeedDatabase } from './utils/autoSeed';

const app = express();
const PORT = process.env.PORT || 5003;

// Create temp directory if it doesn't exist
const tempDir = path.join(__dirname, '../temp');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
  console.log('📁 Created temp directory:', tempDir);
}

// Middleware
app.use(corsMiddleware);

// Additional CORS headers for dev tunnels and complex scenarios
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH, HEAD');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, Cache-Control, X-Forwarded-For, X-Forwarded-Proto, X-Forwarded-Host');
  res.header('Access-Control-Allow-Credentials', 'true');
  
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
    return;
  }
  next();
});

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Request logging
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`📡 ${timestamp} - ${req.method} ${req.url}`);
  
  // Log request body for POST requests (excluding file uploads)
  if (req.method === 'POST' && !req.url.includes('virtual-tryon')) {
    console.log('📦 Request body:', JSON.stringify(req.body, null, 2));
  }
  
  next();
});

// Routes
app.use('/', routes);

// Serve static files from temp directory (for testing)
app.use('/temp', express.static(tempDir));

// Serve static images from dbdata directory
const dbDataDir = path.join(__dirname, '../prisma/dbdata');
app.use('/images', express.static(dbDataDir));

// Error handling
app.use(notFoundHandler);
app.use(errorHandler);

// Start server with auto-seeding
app.listen(PORT, async () => {
  console.log('🚀 AI Mirror Backend Server Started!');
  console.log(`📍 Server running on: http://localhost:${PORT}`);
  console.log(`🔗 API Documentation: http://localhost:${PORT}/api`);
  console.log(`💚 Health Check: http://localhost:${PORT}/health`);
  console.log('🎯 Available Endpoints:');
  console.log('   POST /api/tryon/virtual-tryon - Virtual try-on');
  console.log('   GET  /api/outfits/gender/:gender - Get outfits by gender');
  console.log('   GET  /api/outfits/filter - Filter outfits');
  console.log('   POST /api/users - Create/get user');
  console.log('');
  console.log('🔧 Environment:');
  console.log(`   PORT: ${PORT}`);
  console.log(`   FITROOM_API_KEY: ${process.env.FITROOM_API_KEY ? '✅ Configured' : '❌ Missing'}`);
  console.log(`   DATABASE_URL: ${process.env.DATABASE_URL ? '✅ Configured' : '❌ Missing'}`);
  console.log('');
  
  // Auto-seed database if empty
  console.log('🔄 Initializing database...');
  await autoSeedDatabase();
  
  console.log('');
  console.log('🎉 Server initialization complete!');
  console.log('💡 API is ready to use');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('👋 SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('👋 SIGINT received, shutting down gracefully...');
  process.exit(0);
});

export default app;

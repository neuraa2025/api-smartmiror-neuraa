import { Router } from "express";
import outfitRoutes from "./outfits";
import tryonRoutes from "./tryon";
import userRoutes from "./user.routes";

const router = Router();

// API Routes
router.use('/api/outfits', outfitRoutes);   // Outfit management routes
router.use('/api/tryon', tryonRoutes);      // Try-on processing routes
router.use('/api/users', userRoutes);       // User management routes

// Health check
router.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    message: 'AI Mirror Backend is running',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// API documentation
router.get('/api', (req, res) => {
  res.json({
    name: 'AI Mirror API',
    version: '2.0.0',
    description: 'Virtual Try-On Backend API with Structured Database',
    endpoints: {
      outfits: {
        'GET /api/outfits/genders': 'Get all available genders with banners',
        'GET /api/outfits/categories/:gender': 'Get categories for specific gender',
        'GET /api/outfits/:gender/:category': 'Get outfits with pagination (9 per page)',
        'GET /api/outfits/outfit/:id': 'Get single outfit details'
      },
      tryOn: {
        'POST /api/tryon/start': 'Start try-on process with selected outfits',
        'GET /api/tryon/results/:batchId': 'Get try-on results with pagination',
        'GET /api/tryon/status/:batchId': 'Get batch processing status'
      },
      users: {
        'POST /api/users': 'Create or get user',
        'GET /api/users/:id': 'Get user by ID'
      },
      health: {
        'GET /health': 'Health check and system status'
      }
    },
    flow: {
      '1': 'GET /api/outfits/genders → Select gender',
      '2': 'GET /api/outfits/categories/:gender → Select category', 
      '3': 'GET /api/outfits/:gender/:category → Browse outfits (pagination)',
      '4': 'POST /api/tryon/start → Send selected outfits + user photo',
      '5': 'GET /api/tryon/results/:batchId → Receive FitRoom results'
    }
  });
});

export default router;

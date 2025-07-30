import { Router } from 'express';
import { OutfitController } from '../controllers/outfit.controller';

const router = Router();

// GET /api/outfits/genders - Get all genders with banner images
router.get('/genders', OutfitController.getGenders);

// GET /api/outfits/categories/:genderName - Get categories for a gender
router.get('/categories/:genderName', OutfitController.getCategories);

// GET /api/outfits/price-range/:categoryName - Get price range for a category
router.get('/price-range/:categoryName', OutfitController.getPriceRange);

// GET /api/outfits/:genderName/:categoryName - Get outfits with pagination and price filtering
router.get('/:genderName/:categoryName', OutfitController.getOutfits);

// GET /api/outfits/outfit/:id - Get single outfit details
router.get('/outfit/:id', OutfitController.getOutfitById);

export default router;

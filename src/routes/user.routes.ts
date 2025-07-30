import { Router } from "express";
import {
  createOrGetUser,
  getUserById,
  updateUser,
  getUserStats,
  getAllUsers
} from "../controllers/user.controller";

const router = Router();

// Create or get user
router.post('/', createOrGetUser);

// Get all users (admin)
router.get('/', getAllUsers);

// Get user by ID
router.get('/:id', getUserById);

// Update user
router.put('/:id', updateUser);

// Get user statistics
router.get('/:id/stats', getUserStats);

export default router;

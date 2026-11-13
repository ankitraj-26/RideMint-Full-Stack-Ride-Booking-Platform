import express from 'express';
import { registerUser, loginUser, getCurrentUser, logoutUser, updateProfile } from '../controllers/authController.js';
import protect from '../middleware/authMiddleware.js';

const router = express.Router();

router.post('/register', registerUser);
router.post('/login', loginUser);
router.get('/me', protect, getCurrentUser);
router.put('/profile', protect, updateProfile);
router.post('/logout', protect, logoutUser);

export default router;

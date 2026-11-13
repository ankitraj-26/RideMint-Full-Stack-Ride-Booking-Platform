import express from 'express';
import {
  approveDriverVerification,
  getAdminActivity,
  getAdminNotificationStatus,
  getAdminRides,
  getAdminStats,
  getAdminUsers,
  getPendingDriverVerifications,
  getRideById,
  rejectDriverVerification,
  retryAdminNotification,
  testAdminSmtpEmail,
  updateRideStatusByAdmin,
  updateUserStatusByAdmin,
} from '../controllers/adminController.js';
import protect from '../middleware/authMiddleware.js';
import authorize from '../middleware/roleMiddleware.js';

const router = express.Router();

router.use(protect, authorize('admin'));
router.get('/stats', getAdminStats);
router.get('/events', getAdminActivity);
router.get('/notifications/status', getAdminNotificationStatus);
router.post('/notifications/test-email', testAdminSmtpEmail);
router.post('/notifications/:id/retry', retryAdminNotification);
router.get('/rides', getAdminRides);
router.get('/rides/:id', getRideById);
router.patch('/rides/:id/status', updateRideStatusByAdmin);
router.get('/users', getAdminUsers);
router.patch('/users/:id/status', updateUserStatusByAdmin);
router.get('/verification/pending', getPendingDriverVerifications);
router.patch('/verification/:id/approve', approveDriverVerification);
router.patch('/verification/:id/reject', rejectDriverVerification);

export default router;

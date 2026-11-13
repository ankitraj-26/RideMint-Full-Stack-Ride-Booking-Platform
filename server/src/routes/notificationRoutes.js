import express from 'express';
import {
  getNotificationCount,
  getNotificationPreferences,
  getNotifications,
  markAllNotificationsAsRead,
  markNotificationAsRead,
  updateNotificationPreferences,
} from '../controllers/notificationController.js';
import protect from '../middleware/authMiddleware.js';

const router = express.Router();

router.use(protect);
router.get('/', getNotifications);
router.get('/count', getNotificationCount);
router.get('/preferences', getNotificationPreferences);
router.patch('/preferences', updateNotificationPreferences);
router.patch('/read-all', markAllNotificationsAsRead);
router.patch('/:id/read', markNotificationAsRead);

export default router;

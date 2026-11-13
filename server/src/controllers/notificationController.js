import Notification from '../models/Notification.js';
import User from '../models/User.js';
import { getUnreadCount, markAllNotificationsRead, markNotificationRead } from '../utils/notificationService.js';

const getSafeNotification = (notification) => ({
  _id: notification._id,
  userId: notification.userId,
  role: notification.role,
  rideId: notification.rideId,
  notificationType: notification.notificationType,
  title: notification.title,
  message: notification.message,
  channel: notification.channel,
  status: notification.status,
  isRead: notification.isRead,
  createdAt: notification.createdAt,
  sentAt: notification.sentAt,
  errorDetails: notification.errorDetails,
});

export const getNotifications = async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
    const skip = (page - 1) * limit;
    const unreadOnly = String(req.query.unreadOnly || '').toLowerCase() === 'true';

    const filters = { userId: req.user._id };
    if (unreadOnly) {
      filters.isRead = false;
    }

    const [notifications, totalCount, unreadCount] = await Promise.all([
      Notification.find(filters).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Notification.countDocuments(filters),
      getUnreadCount(req.user._id),
    ]);

    return res.status(200).json({
      success: true,
      page,
      limit,
      count: notifications.length,
      totalCount,
      unreadCount,
      notifications: notifications.map(getSafeNotification),
    });
  } catch (error) {
    return next(error);
  }
};

export const getNotificationPreferences = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).select('notificationPreferences');
    return res.status(200).json({
      success: true,
      preferences: user?.notificationPreferences || {
        email: true,
        sms: true,
        whatsapp: false,
        inApp: true,
      },
    });
  } catch (error) {
    return next(error);
  }
};

export const updateNotificationPreferences = async (req, res, next) => {
  try {
    const { email, sms, whatsapp, inApp } = req.body || {};
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    const preferences = {
      ...(user.notificationPreferences || {}),
      email: typeof email === 'boolean' ? email : user.notificationPreferences?.email ?? true,
      sms: typeof sms === 'boolean' ? sms : user.notificationPreferences?.sms ?? true,
      whatsapp: typeof whatsapp === 'boolean' ? whatsapp : user.notificationPreferences?.whatsapp ?? false,
      inApp: typeof inApp === 'boolean' ? inApp : user.notificationPreferences?.inApp ?? true,
    };

    user.notificationPreferences = preferences;
    await user.save();

    return res.status(200).json({
      success: true,
      message: 'Notification preferences updated successfully.',
      preferences,
    });
  } catch (error) {
    return next(error);
  }
};

export const markNotificationAsRead = async (req, res, next) => {
  try {
    const notification = await Notification.findOne({ _id: req.params.id, userId: req.user._id });
    if (!notification) {
      return res.status(404).json({ success: false, message: 'Notification not found.' });
    }

    notification.isRead = true;
    await notification.save();

    return res.status(200).json({
      success: true,
      message: 'Notification marked as read.',
      notification: getSafeNotification(notification),
    });
  } catch (error) {
    return next(error);
  }
};

export const markAllNotificationsAsRead = async (req, res, next) => {
  try {
    const notifications = await markAllNotificationsRead(req.user._id);
    return res.status(200).json({
      success: true,
      message: 'All notifications marked as read.',
      count: notifications.length,
    });
  } catch (error) {
    return next(error);
  }
};

export const getNotificationCount = async (req, res, next) => {
  try {
    const unreadCount = await getUnreadCount(req.user._id);
    return res.status(200).json({ success: true, count: unreadCount });
  } catch (error) {
    return next(error);
  }
};

import crypto from 'crypto';
import Notification from '../models/Notification.js';
import User from '../models/User.js';
import { sendEmailNotification, sendSmsNotification, sendWhatsAppNotification } from './notificationDelivery.js';
import { emitNotificationToAdmins, emitNotificationToUser } from './socket.js';

const defaultMaxAttempts = Number(process.env.NOTIFICATION_MAX_ATTEMPTS || 4);
const defaultRetryDelayMs = Number(process.env.NOTIFICATION_RETRY_DELAY_MS || 60000);

const criticalNotificationTypes = new Set([
  'ride_booking',
  'ride_booking_confirmation',
  'ride_status',
  'driver_assignment',
  'driver_verification',
  'payment_receipt',
  'ride_cancelled',
  'admin_alert',
]);

const normalizeChannelList = (channel) => {
  if (Array.isArray(channel)) {
    return channel.filter(Boolean);
  }

  if (!channel) {
    return ['in_app'];
  }

  if (channel === 'combined') {
    return ['email', 'sms', 'in_app'];
  }

  return [channel];
};

const resolveDefaultUserPreferences = (user) => ({
  email: user?.notificationPreferences?.email ?? true,
  sms: user?.notificationPreferences?.sms ?? true,
  whatsapp: user?.notificationPreferences?.whatsapp ?? false,
  inApp: user?.notificationPreferences?.inApp ?? true,
});

export const shouldSendChannel = (user, channel, notificationType) => {
  const preferences = resolveDefaultUserPreferences(user);

  if (channel === 'in_app') {
    return preferences.inApp !== false;
  }

  if (channel === 'email') {
    return criticalNotificationTypes.has(notificationType) || preferences.email !== false;
  }

  if (channel === 'sms') {
    return criticalNotificationTypes.has(notificationType) || preferences.sms !== false;
  }

  if (channel === 'whatsapp') {
    return criticalNotificationTypes.has(notificationType) || preferences.whatsapp === true;
  }

  return true;
};

const buildEmailDetails = (notificationType, details = {}) => {
  switch (notificationType) {
    case 'ride_booking':
      return {
        pickup: details.pickup || 'Pickup location',
        destination: details.destination || 'Destination',
        cabType: details.cabType || 'Mini',
        fare: details.fare || 0,
        status: details.status || 'Pending',
        rideId: details.rideId || 'N/A',
      };
    case 'ride_status':
      return {
        statusLabel: details.statusLabel || 'Updated',
        rideId: details.rideId || 'N/A',
      };
    case 'payment_receipt':
      return {
        amount: details.amount || 0,
        method: details.method || 'UPI',
        transactionId: details.transactionId || 'TXN',
        rideId: details.rideId || 'N/A',
      };
    case 'driver_verification':
      return {
        status: details.status || 'Updated',
        reason: details.reason || 'Your verification status was updated.',
        nextSteps: details.nextSteps || 'Please contact support if you need help.',
      };
    case 'admin_alert':
      return {
        actorName: details.actorName || 'System',
      };
    default:
      return {};
  }
};

export const createNotificationIdempotencyKey = ({ userId, role, rideId, notificationType, channel, message, title }) => {
  const baseValue = [userId, role, rideId || '', notificationType, Array.isArray(channel) ? channel.join(',') : channel || '', title || '', message || ''].join(':');
  return crypto.createHash('sha256').update(baseValue).digest('hex');
};

export const queueNotification = async ({ userId, role, rideId, notificationType, title, message, channel = 'in_app', details = {} }) => {
  if (!userId || !role || !notificationType || !title || !message) {
    return null;
  }

  const idempotencyKey = createNotificationIdempotencyKey({
    userId,
    role,
    rideId,
    notificationType,
    channel,
    message,
    title,
  });

  const existingNotification = await Notification.findOne({ idempotencyKey });
  if (existingNotification) {
    return existingNotification;
  }

  const normalizedChannel = normalizeChannelList(channel);
  const record = await Notification.create({
    userId,
    role,
    rideId,
    notificationType,
    title,
    message,
    channel: normalizedChannel.length > 1 ? 'combined' : normalizedChannel[0],
    provider: normalizedChannel.length > 1 ? 'combined' : normalizedChannel[0],
    status: 'queued',
    providerStatus: 'pending',
    isRead: false,
    attempts: 0,
    maxAttempts: defaultMaxAttempts,
    nextRetryAt: null,
    idempotencyKey,
    errorDetails: '',
    details,
  });

  setImmediate(() => processNotificationQueue(record._id.toString()));
  return record;
};

export const queueAdminNotification = async ({ title, message, notificationType = 'admin_alert', rideId = null, details = {} }) => {
  const admins = await User.find({ role: 'admin' }).select('_id role email phone notificationPreferences');

  const promises = admins.map(async (admin) => {
    const notification = await queueNotification({
      userId: admin._id,
      role: 'admin',
      rideId,
      notificationType,
      title,
      message,
      channel: 'combined',
      details,
    });
    return notification;
  });

  return Promise.all(promises);
};

export const processNotificationQueue = async (notificationId) => {
  const notification = await Notification.findById(notificationId);
  if (!notification) {
    return null;
  }

  if (notification.status === 'sent') {
    return notification;
  }

  const maxAttempts = Number(notification.maxAttempts || defaultMaxAttempts);
  if ((notification.attempts || 0) >= maxAttempts && notification.status !== 'sent') {
    notification.status = 'failed';
    notification.providerStatus = 'failed';
    notification.nextRetryAt = null;
    await notification.save();
    return notification;
  }

  const user = await User.findById(notification.userId).select('-password');
  if (!user) {
    notification.status = 'failed';
    notification.providerStatus = 'failed';
    notification.errorDetails = 'User no longer exists.';
    await notification.save();
    return notification;
  }

  notification.attempts = (notification.attempts || 0) + 1;
  notification.status = 'queued';
  notification.providerStatus = 'pending';
  notification.errorDetails = '';
  await notification.save();

  const channels = normalizeChannelList(notification.channel);
  const deliveryErrors = [];
  const hasExternalChannels = channels.some((channel) => channel !== 'in_app');
  let sentAtLeastOne = false;

  for (const channel of channels) {
    if (!shouldSendChannel(user, channel, notification.notificationType)) {
      continue;
    }

    if (channel === 'in_app') {
      if (hasExternalChannels) {
        notification.provider = 'combined';
        continue;
      }

      sentAtLeastOne = true;
      notification.provider = 'in_app';
      notification.providerStatus = 'accepted';
      continue;
    }

    try {
      if (channel === 'email') {
        notification.provider = 'email';
        const result = await sendEmailNotification({
          to: user.email,
          title: notification.title,
          message: notification.message,
          userName: user.name,
          notificationType: notification.notificationType,
          details: {
            ...(notification.details || {}),
            ...buildEmailDetails(notification.notificationType, notification.details || {}),
          },
        });

        if (result.ok) {
          sentAtLeastOne = true;
          notification.providerStatus = 'delivered';
          notification.providerMessageId = result.messageId || notification.providerMessageId || '';
        } else {
          deliveryErrors.push(result.reason || 'Email delivery failed.');
          notification.providerStatus = 'failed';
        }
      }

      if (channel === 'sms') {
        notification.provider = 'sms';
        if (!user.phone) {
          deliveryErrors.push('No phone number set for SMS delivery.');
          notification.providerStatus = 'failed';
          continue;
        }

        const result = await sendSmsNotification({ phone: user.phone, message: notification.message });
        if (result.ok) {
          sentAtLeastOne = true;
          notification.providerStatus = 'delivered';
          notification.providerMessageId = result.sid || result.messageId || notification.providerMessageId || '';
        } else {
          deliveryErrors.push(result.reason || 'SMS delivery failed.');
          notification.providerStatus = 'failed';
        }
      }

      if (channel === 'whatsapp') {
        notification.provider = 'whatsapp';
        if (!user.phone) {
          deliveryErrors.push('No phone number set for WhatsApp delivery.');
          notification.providerStatus = 'failed';
          continue;
        }

        const result = await sendWhatsAppNotification({ phone: user.phone, message: notification.message });
        if (result.ok) {
          sentAtLeastOne = true;
          notification.providerStatus = 'delivered';
          notification.providerMessageId = result.messageId || notification.providerMessageId || '';
        } else {
          deliveryErrors.push(result.reason || 'WhatsApp delivery failed.');
          notification.providerStatus = 'failed';
        }
      }
    } catch (error) {
      deliveryErrors.push(error?.message || 'Provider delivery failed.');
      notification.providerStatus = 'failed';
    }
  }

  if (hasExternalChannels) {
    if (sentAtLeastOne) {
      notification.status = 'sent';
      notification.sentAt = notification.sentAt || new Date();
      notification.nextRetryAt = null;
    } else if (deliveryErrors.length > 0) {
      notification.status = 'failed';
      const retryDelay = Math.min(defaultRetryDelayMs * (2 ** Math.max(0, (notification.attempts || 1) - 1)), 3600000);
      notification.nextRetryAt = new Date(Date.now() + retryDelay);
    } else {
      notification.status = 'skipped';
      notification.providerStatus = 'skipped';
      notification.nextRetryAt = null;
    }
  } else if (channels.includes('in_app')) {
    notification.status = 'sent';
    notification.sentAt = notification.sentAt || new Date();
    notification.nextRetryAt = null;
  } else {
    notification.status = 'skipped';
    notification.providerStatus = 'skipped';
    notification.nextRetryAt = null;
  }

  notification.errorDetails = deliveryErrors.join('; ') || '';
  notification.isRead = false;
  await notification.save();

  const responsePayload = notification.toObject();
  emitNotificationToUser(responsePayload.userId, responsePayload);
  if (responsePayload.role === 'admin') {
    emitNotificationToAdmins(responsePayload);
  }

  return notification;
};

export const markNotificationRead = async (notificationId, userId) => {
  const notification = await Notification.findOne({ _id: notificationId, userId });
  if (!notification) {
    return null;
  }

  notification.isRead = true;
  await notification.save();
  return notification;
};

export const markAllNotificationsRead = async (userId) => {
  await Notification.updateMany({ userId }, { $set: { isRead: true } });
  return Notification.find({ userId }).sort({ createdAt: -1 });
};

export const getUnreadCount = async (userId) => Notification.countDocuments({ userId, isRead: false });

export const getNotificationProviderStatus = () => {
  const emailConfigured = Boolean(process.env.EMAIL_HOST && (process.env.EMAIL_USER || process.env.EMAIL_PASS));
  const smsConfigured = Boolean((process.env.SMS_PROVIDER && process.env.SMS_API_KEY) || (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN));
  const whatsappConfigured = Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER && process.env.WHATSAPP_PROVIDER);

  return {
    email: {
      configured: emailConfigured,
      provider: emailConfigured ? 'smtp' : 'not_configured',
      safeStatus: emailConfigured ? 'configured' : 'not_configured',
      liveDeliveryEnabled: process.env.ENABLE_LIVE_EMAIL === 'true',
    },
    sms: {
      configured: smsConfigured,
      provider: process.env.SMS_PROVIDER || (process.env.TWILIO_ACCOUNT_SID ? 'twilio' : 'not_configured'),
      safeStatus: smsConfigured ? 'configured' : 'not_configured',
    },
    whatsapp: {
      configured: whatsappConfigured,
      provider: process.env.WHATSAPP_PROVIDER || 'not_configured',
      safeStatus: whatsappConfigured ? 'configured' : 'not_configured',
    },
  };
};

export const getAdminNotificationSummary = async () => {
  const [pending, failed, sent, queued] = await Promise.all([
    Notification.countDocuments({ status: 'queued' }),
    Notification.countDocuments({ status: 'failed' }),
    Notification.countDocuments({ status: 'sent' }),
    Notification.countDocuments({ status: 'queued', nextRetryAt: { $ne: null } }),
  ]);

  return {
    pending,
    failed,
    sent,
    queued,
    providerStatus: getNotificationProviderStatus(),
  };
};

export const retryFailedNotification = async (notificationId) => {
  const notification = await Notification.findById(notificationId);
  if (!notification) {
    return null;
  }

  notification.status = 'queued';
  notification.providerStatus = 'pending';
  notification.errorDetails = '';
  notification.nextRetryAt = null;
  notification.attempts = Math.max(0, (notification.attempts || 0) - 1);
  await notification.save();

  setImmediate(() => processNotificationQueue(notification._id.toString()));
  return notification;
};

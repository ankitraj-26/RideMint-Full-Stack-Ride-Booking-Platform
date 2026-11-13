import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    role: {
      type: String,
      enum: ['customer', 'driver', 'admin'],
      required: true,
      index: true,
    },
    rideId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Ride',
      default: null,
      index: true,
    },
    notificationType: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
    },
    channel: {
      type: String,
      enum: ['email', 'sms', 'whatsapp', 'in_app', 'combined'],
      default: 'in_app',
      index: true,
    },
    status: {
      type: String,
      enum: ['queued', 'sent', 'failed', 'skipped'],
      default: 'queued',
      index: true,
    },
    provider: {
      type: String,
      enum: ['email', 'sms', 'whatsapp', 'in_app', 'combined'],
      default: 'in_app',
      index: true,
    },
    providerStatus: {
      type: String,
      enum: ['pending', 'accepted', 'delivered', 'failed', 'skipped'],
      default: 'pending',
      index: true,
    },
    providerMessageId: {
      type: String,
      default: '',
      trim: true,
    },
    attempts: {
      type: Number,
      default: 0,
      min: 0,
    },
    maxAttempts: {
      type: Number,
      default: 4,
      min: 1,
    },
    nextRetryAt: {
      type: Date,
      default: null,
    },
    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },
    sentAt: {
      type: Date,
      default: null,
    },
    errorDetails: {
      type: String,
      default: '',
    },
    details: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    idempotencyKey: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, isRead: 1 });

const Notification = mongoose.model('Notification', notificationSchema);

export default Notification;

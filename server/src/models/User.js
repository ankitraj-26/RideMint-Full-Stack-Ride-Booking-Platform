import mongoose from 'mongoose';

const verificationSchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: ['not_started', 'pending_review', 'approved', 'rejected'],
      default: 'not_started',
    },
    personalId: {
      type: String,
      default: '',
      trim: true,
    },
    documents: [
      {
        type: { type: String, trim: true },
        url: { type: String, trim: true },
        status: { type: String, trim: true },
        uploadedAt: { type: Date, default: Date.now },
      },
    ],
    vehicle: {
      make: { type: String, trim: true, default: '' },
      model: { type: String, trim: true, default: '' },
      registrationNumber: { type: String, trim: true, default: '' },
      color: { type: String, trim: true, default: '' },
    },
    videoKyc: {
      provider: { type: String, trim: true, default: 'zego' },
      sessionId: { type: String, trim: true, default: '' },
      status: {
        type: String,
        enum: ['not_started', 'pending', 'completed', 'failed'],
        default: 'not_started',
      },
      token: { type: String, trim: true, default: '' },
      createdAt: { type: Date, default: Date.now },
    },
    reviewNotes: {
      type: String,
      default: '',
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    reviewedAt: { type: Date, default: null },
    updatedAt: { type: Date, default: Date.now },
    auditTrail: [
      {
        action: { type: String, trim: true },
        notes: { type: String, trim: true, default: '' },
        actor: { type: String, trim: true, default: '' },
        createdAt: { type: Date, default: Date.now },
      },
    ],
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email address'],
    },
    phone: {
      type: String,
      default: '',
      trim: true,
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: 8,
    },
    photo: {
      type: String,
      default: '',
      trim: true,
    },
    notificationPreferences: {
      email: { type: Boolean, default: true },
      sms: { type: Boolean, default: true },
      whatsapp: { type: Boolean, default: false },
      inApp: { type: Boolean, default: true },
    },
    role: {
      type: String,
      enum: ['customer', 'driver', 'admin'],
      default: 'customer',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    verification: {
      type: verificationSchema,
      default: () => ({
        status: 'not_started',
        documents: [],
        vehicle: {},
        videoKyc: { provider: 'zego', status: 'not_started', token: '' },
        auditTrail: [],
      }),
    },
  },
  {
    timestamps: true,
  }
);

userSchema.methods.toJSON = function toJSON() {
  const userObject = this.toObject();
  delete userObject.password;
  return userObject;
};

const User = mongoose.model('User', userSchema);

export default User;

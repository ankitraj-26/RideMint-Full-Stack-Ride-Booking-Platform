import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import generateToken from '../utils/generateToken.js';
import { queueAdminNotification } from '../utils/notificationService.js';

const isValidEmail = (value) => /^\S+@\S+\.\S+$/.test(value);
const normalizeRole = (value) => {
  if (!value || typeof value !== 'string') return null;

  const cleaned = value.trim().toLowerCase();
  const aliases = {
    rider: 'customer',
    customer: 'customer',
    driver: 'driver',
    admin: 'admin',
  };

  return aliases[cleaned] || cleaned;
};

export const registerUser = async (req, res, next) => {
  try {
    const { name, email, password, role, phone } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: 'Name, email, and password are required.' });
    }

    if (password.length < 8) {
      return res.status(400).json({ success: false, message: 'Password must be at least 8 characters long.' });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ success: false, message: 'Please provide a valid email address.' });
    }

    const allowedRoles = ['customer', 'driver', 'admin'];
    const normalizedRole = allowedRoles.includes(normalizeRole(role)) ? normalizeRole(role) : 'customer';

    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(409).json({ success: false, message: 'A user with this email already exists.' });
    }

    const normalizedPhone = typeof phone === 'string' ? phone.trim() : '';
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({
      name,
      email: email.toLowerCase(),
      phone: normalizedPhone,
      password: hashedPassword,
      role: normalizedRole,
      notificationPreferences: {
        email: true,
        sms: true,
        whatsapp: false,
        inApp: true,
      },
    });

    const token = generateToken(user._id);

    if (normalizedRole === 'driver') {
      await queueAdminNotification({
        title: 'New driver registration',
        message: `${user.name} has registered as a driver and is awaiting verification review.`,
        notificationType: 'driver_registration',
        details: { actorName: user.name },
      });
    }

    return res.status(201).json({
      success: true,
      token,
      user: user.toJSON(),
    });
  } catch (error) {
    return next(error);
  }
};

export const loginUser = async (req, res, next) => {
  try {
    const { email, password, role } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required.' });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    const normalizedRole = normalizeRole(role);
    if (normalizedRole && normalizedRole !== user.role) {
      const expectedRoleLabel = user.role === 'driver' ? 'Driver' : 'Rider';
      return res.status(401).json({
        success: false,
        message: `This account is registered as a ${expectedRoleLabel.toLowerCase()}. Please choose ${expectedRoleLabel} login.`,
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    if (!user.isActive) {
      return res.status(403).json({ success: false, message: 'This account has been deactivated by an administrator.' });
    }

    const token = generateToken(user._id);

    return res.status(200).json({
      success: true,
      token,
      user: user.toJSON(),
    });
  } catch (error) {
    return next(error);
  }
};

export const getCurrentUser = async (req, res) => {
  res.status(200).json({
    success: true,
    user: req.user,
  });
};

export const logoutUser = async (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Logged out successfully. Please remove the token from the client.',
  });
};

export const updateProfile = async (req, res, next) => {
  try {
    const { name, photo, phone, notificationPreferences } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Name is required.' });
    }

    const normalizedPhoto = typeof photo === 'string' ? photo.trim() : '';
    if (normalizedPhoto && !/^data:image\//i.test(normalizedPhoto) && !/^https?:\/\//i.test(normalizedPhoto)) {
      return res.status(400).json({
        success: false,
        message: 'Profile photo must be a valid image data URL or URL.',
      });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    const normalizedPhone = typeof phone === 'string' ? phone.trim() : user.phone || '';
    user.name = name.trim();
    user.photo = normalizedPhoto;
    user.phone = normalizedPhone;

    if (notificationPreferences && typeof notificationPreferences === 'object') {
      user.notificationPreferences = {
        ...(user.notificationPreferences || {}),
        email: typeof notificationPreferences.email === 'boolean' ? notificationPreferences.email : user.notificationPreferences?.email ?? true,
        sms: typeof notificationPreferences.sms === 'boolean' ? notificationPreferences.sms : user.notificationPreferences?.sms ?? true,
        whatsapp: typeof notificationPreferences.whatsapp === 'boolean' ? notificationPreferences.whatsapp : user.notificationPreferences?.whatsapp ?? false,
        inApp: typeof notificationPreferences.inApp === 'boolean' ? notificationPreferences.inApp : user.notificationPreferences?.inApp ?? true,
      };
    }

    await user.save();

    return res.status(200).json({
      success: true,
      message: 'Profile updated successfully.',
      user: user.toJSON(),
    });
  } catch (error) {
    return next(error);
  }
};

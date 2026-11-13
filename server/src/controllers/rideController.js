import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import mongoose from 'mongoose';
import Ride from '../models/Ride.js';
import User from '../models/User.js';
import { calculateDistanceKm, calculateFare, validCabTypes } from '../utils/fareCalculator.js';
import { createWeatherQuote, getWeatherContext } from '../utils/weatherAssistant.js';
import { queueAdminNotification, queueNotification } from '../utils/notificationService.js';

const populateRide = (query) =>
  query
    .populate('customer', 'name email')
    .populate('driver', 'name email')
    .sort({ createdAt: -1 });

const isValidLocation = (location) =>
  location &&
  typeof location.address === 'string' &&
  location.address.trim().length > 0 &&
  Number.isFinite(location.latitude) &&
  location.latitude >= -90 &&
  location.latitude <= 90 &&
  Number.isFinite(location.longitude) &&
  location.longitude >= -180 &&
  location.longitude <= 180;

const isValidLiveLocation = (location) =>
  location &&
  Number.isFinite(location.latitude) &&
  location.latitude >= -90 &&
  location.latitude <= 90 &&
  Number.isFinite(location.longitude) &&
  location.longitude >= -180 &&
  location.longitude <= 180 &&
  (location.accuracy === undefined || (Number.isFinite(location.accuracy) && location.accuracy >= 0));

const verificationUploadRoot = path.resolve(process.cwd(), 'uploads', 'verification');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const userDir = path.join(verificationUploadRoot, req.user._id.toString());
    fs.mkdirSync(userDir, { recursive: true });
    cb(null, userDir);
  },
  filename: (req, file, cb) => {
    const safeName = `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    cb(null, safeName);
  },
});

export const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (!allowed.includes(file.mimetype)) {
      return cb(new Error('Only JPEG, PNG, WebP, and PDF documents are allowed.'));
    }
    cb(null, true);
  },
});

const getDriverVerificationStatus = (user) => user?.verification?.status || 'not_started';

const ensureDriverIsVerified = (user) => {
  const status = getDriverVerificationStatus(user);
  if (status !== 'approved') {
    return {
      allowed: false,
      status,
      message: 'Driver verification is required and must be approved by the admin before rides can be accepted.',
    };
  }

  return { allowed: true, status };
};

export const getDriverVerification = async (req, res, next) => {
  try {
    if (req.user.role !== 'driver') {
      return res.status(403).json({ success: false, message: 'Only drivers can access verification details.' });
    }

    const user = await User.findById(req.user._id).select('-password');
    const verification = user?.verification || {
      status: 'not_started',
      documents: [],
      vehicle: {},
      videoKyc: { provider: 'zego', status: 'not_started', token: '' },
      auditTrail: [],
    };

    return res.status(200).json({
      success: true,
      verification,
    });
  } catch (error) {
    return next(error);
  }
};

export const submitDriverVerification = async (req, res, next) => {
  try {
    if (req.user.role !== 'driver') {
      return res.status(403).json({ success: false, message: 'Only drivers can submit verification details.' });
    }

    const { personalId, documents, vehicle, videoKyc } = req.body;

    if (!personalId || !String(personalId).trim()) {
      return res.status(400).json({ success: false, message: 'Driver personal ID is required.' });
    }

    const safeDocuments = Array.isArray(documents) ? documents.filter((doc) => doc && doc.url) : [];
    if (safeDocuments.length === 0) {
      return res.status(400).json({ success: false, message: 'At least one document upload is required.' });
    }

    if (!vehicle || !vehicle.registrationNumber) {
      return res.status(400).json({ success: false, message: 'Vehicle registration details are required.' });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'Driver account not found.' });
    }

    const auditTrail = user.verification?.auditTrail || [];
    user.verification = {
      ...user.verification,
      status: 'pending_review',
      personalId: String(personalId).trim(),
      documents: safeDocuments.map((doc) => ({
        type: doc.type || 'document',
        url: doc.url,
        status: doc.status || 'uploaded',
        uploadedAt: new Date(),
      })),
      vehicle: {
        make: vehicle.make || '',
        model: vehicle.model || '',
        registrationNumber: vehicle.registrationNumber,
        color: vehicle.color || '',
      },
      videoKyc: {
        provider: videoKyc?.provider || 'zego',
        sessionId: videoKyc?.sessionId || '',
        status: videoKyc?.status || 'pending',
        token: videoKyc?.token || '',
        createdAt: new Date(),
      },
      reviewNotes: '',
      reviewedBy: null,
      reviewedAt: null,
      updatedAt: new Date(),
      auditTrail: [
        ...auditTrail,
        {
          action: 'submitted',
          notes: 'Driver submitted verification documents for admin review.',
          actor: req.user._id.toString(),
          createdAt: new Date(),
        },
      ],
    };

    await user.save();

    await queueNotification({
      userId: user._id,
      role: 'driver',
      notificationType: 'driver_verification',
      title: 'Verification submitted',
      message: 'Your driver verification documents have been submitted and are now under review.',
      channel: 'combined',
      details: {
        status: 'Submitted',
        reason: 'Application received for review.',
        nextSteps: 'Our admin team will review your documents and get back to you shortly.',
      },
    });

    await queueAdminNotification({
      title: 'New driver verification submitted',
      message: `${user.name} submitted a driver verification application for review.`,
      notificationType: 'driver_verification',
      details: { actorName: user.name },
    });

    return res.status(200).json({
      success: true,
      message: 'Driver verification submitted successfully.',
      verification: user.verification,
    });
  } catch (error) {
    return next(error);
  }
};

export const uploadDriverVerificationDocument = async (req, res, next) => {
  try {
    if (req.user.role !== 'driver') {
      return res.status(403).json({ success: false, message: 'Only drivers can upload verification documents.' });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, message: 'A document file is required.' });
    }

    const fileUrl = `/api/driver/verification/files/${req.user._id.toString()}/${encodeURIComponent(req.file.filename)}`;

    return res.status(200).json({
      success: true,
      file: {
        filename: req.file.filename,
        originalName: req.file.originalname,
        size: req.file.size,
        mimeType: req.file.mimetype,
        url: fileUrl,
      },
    });
  } catch (error) {
    return next(error);
  }
};

export const getDriverDocument = async (req, res, next) => {
  try {
    const { userId, filename } = req.params;
    if (!req.user || !['driver', 'admin'].includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }

    if (req.user.role !== 'admin' && req.user._id.toString() !== userId) {
      return res.status(403).json({ success: false, message: 'You can only access your own verification documents.' });
    }

    const safeName = path.basename(filename);
    const filePath = path.resolve(process.cwd(), 'uploads', 'verification', userId, safeName);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, message: 'Document not found.' });
    }

    res.sendFile(filePath);
  } catch (error) {
    return next(error);
  }
};

export const generateDriverVideoKycToken = async (req, res, next) => {
  try {
    if (req.user.role !== 'driver') {
      return res.status(403).json({ success: false, message: 'Only drivers can request a video KYC token.' });
    }

    const appId = Number(process.env.ZEGOCLOUD_APP_ID || 0);
    const appSecret = process.env.ZEGOCLOUD_APP_SECRET;

    if (!appId || !appSecret) {
      return res.status(503).json({
        success: false,
        message: 'Video KYC is not configured. Set ZEGOCLOUD_APP_ID and ZEGOCLOUD_APP_SECRET before enabling live verification.',
      });
    }

    const userId = req.user._id.toString();
    const nonce = Math.floor(Math.random() * 1000000);
    const timestamp = Math.floor(Date.now() / 1000);
    const payload = `${appId}${userId}${nonce}${timestamp}`;
    const signature = crypto.createHmac('sha256', appSecret).update(payload).digest('hex');

    const tokenPayload = {
      appId,
      userId,
      nonce,
      timestamp,
      signature,
    };

    const token = Buffer.from(JSON.stringify(tokenPayload)).toString('base64');

    const user = await User.findById(req.user._id);
    if (user) {
      user.verification = {
        ...user.verification,
        videoKyc: {
          ...(user.verification?.videoKyc || {}),
          provider: 'zego',
          status: 'pending',
          token,
          createdAt: new Date(),
        },
        updatedAt: new Date(),
      };
      await user.save();
    }

    return res.status(200).json({
      success: true,
      token,
      provider: 'zego',
    });
  } catch (error) {
    return next(error);
  }
};

export const updateRideLocation = async (req, res, next) => {
  try {
    const isDriver = req.user.role === 'driver';
    if (!isDriver && req.user.role !== 'customer') {
      return res.status(403).json({ success: false, message: 'Only ride participants can share live location.' });
    }

    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid ride ID.' });
    }

    const { latitude, longitude, accuracy } = req.body;
    if (!isValidLiveLocation({ latitude, longitude, accuracy })) {
      return res.status(400).json({ success: false, message: 'Provide valid latitude, longitude, and optional accuracy.' });
    }

    const participantFilter = isDriver
      ? { driver: req.user._id }
      : { customer: req.user._id };
    const ride = await Ride.findOne({ _id: req.params.id, ...participantFilter });

    if (!ride) {
      return res.status(404).json({ success: false, message: 'Ride not found for this account.' });
    }

    if (!['accepted', 'in_progress'].includes(ride.status)) {
      return res.status(400).json({ success: false, message: 'Live location is available after a driver accepts the ride.' });
    }

    const field = isDriver ? 'driverLocation' : 'riderLocation';
    ride.set(field, { latitude, longitude, accuracy, updatedAt: new Date() });
    await ride.save();

    return res.status(200).json({ success: true, location: ride[field] });
  } catch (error) {
    return next(error);
  }
};

export const createRide = async (req, res, next) => {
  try {
    if (req.user.role !== 'customer') {
      return res.status(403).json({ success: false, message: 'Only customers can book rides.' });
    }

    const { pickup, dropoff, cabType } = req.body;

    if (!isValidLocation(pickup) || !isValidLocation(dropoff)) {
      return res.status(400).json({
        success: false,
        message: 'Pickup and drop-off need an address and valid geographic coordinates.',
      });
    }

    if (!validCabTypes.includes(cabType)) {
      return res.status(400).json({ success: false, message: 'Cab type must be Mini, Sedan or SUV.' });
    }

    const distanceKm = calculateDistanceKm({
      latitude1: pickup.latitude,
      longitude1: pickup.longitude,
      latitude2: dropoff.latitude,
      longitude2: dropoff.longitude,
    });

    const weather = await getWeatherContext(pickup);
    const fare = calculateFare({
      latitude1: pickup.latitude,
      longitude1: pickup.longitude,
      latitude2: dropoff.latitude,
      longitude2: dropoff.longitude,
      cabType,
      weatherMultiplier: weather.multiplier,
    });

    const ride = await Ride.create({
      customer: req.user._id,
      pickup: {
        address: pickup.address,
        latitude: pickup.latitude,
        longitude: pickup.longitude,
      },
      dropoff: {
        address: dropoff.address,
        latitude: dropoff.latitude,
        longitude: dropoff.longitude,
      },
      cabType,
      distanceKm,
      fare,
      weatherSnapshot: {
        condition: weather.condition,
        multiplier: weather.multiplier,
        temperatureC: weather.temperatureC,
        precipitationProbability: weather.precipitationProbability,
        fetchedAt: new Date(),
      },
      status: 'pending',
    });

    const savedRide = await populateRide(Ride.findById(ride._id)).exec();

    await queueNotification({
      userId: req.user._id,
      role: 'customer',
      rideId: savedRide._id,
      notificationType: 'ride_booking',
      title: 'Ride booking confirmed',
      message: `Your ride to ${savedRide.dropoff.address} has been booked successfully. Ride ID #${savedRide._id}.`,
      channel: 'combined',
      details: {
        rideId: String(savedRide._id),
        pickup: savedRide.pickup.address,
        destination: savedRide.dropoff.address,
        cabType: savedRide.cabType,
        fare: Number(savedRide.fare || 0),
        status: 'Pending',
      },
    });

    await queueAdminNotification({
      title: 'New ride booking pending',
      message: `${req.user.name} booked a ${savedRide.cabType} ride from ${savedRide.pickup.address} to ${savedRide.dropoff.address}.`,
      notificationType: 'ride_booking_admin',
      rideId: savedRide._id,
      details: { actorName: req.user.name },
    });

    return res.status(201).json({
      success: true,
      message: 'Ride booked successfully.',
      ride: savedRide,
    });
  } catch (error) {
    return next(error);
  }
};

export const getRideQuote = async (req, res, next) => {
  try {
    const { pickup, dropoff } = req.body;
    if (!isValidLocation(pickup) || !isValidLocation(dropoff)) {
      return res.status(400).json({ success: false, message: 'Pickup and drop-off need an address and valid geographic coordinates.' });
    }

    const weather = await getWeatherContext(pickup);
    const quote = createWeatherQuote({ pickup, dropoff, weather });
    return res.status(200).json({ success: true, quote });
  } catch (error) {
    return next(error);
  }
};

export const getMyRides = async (req, res, next) => {
  try {
    const rides = await populateRide(Ride.find({ customer: req.user._id }));
    return res.status(200).json({
      success: true,
      count: rides.length,
      rides,
    });
  } catch (error) {
    return next(error);
  }
};

export const getRides = async (req, res, next) => {
  try {
    if (req.user.role !== 'customer') {
      return res.status(403).json({ success: false, message: 'Use the role-specific ride endpoints.' });
    }

    return getMyRides(req, res, next);
  } catch (error) {
    return next(error);
  }
};

export const cancelRide = async (req, res, next) => {
  try {
    if (req.user.role !== 'customer') {
      return res.status(403).json({ success: false, message: 'Only customers can cancel rides.' });
    }

    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid ride ID.' });
    }

    const ride = await Ride.findById(req.params.id);
    if (!ride) {
      return res.status(404).json({ success: false, message: 'Ride not found.' });
    }

    if (ride.customer.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'You cannot cancel another customer\'s ride.' });
    }

    if (ride.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'Only pending rides can be cancelled.',
      });
    }

    const updatedRide = await Ride.findOneAndUpdate(
      { _id: ride._id, customer: req.user._id, status: 'pending' },
      { $set: { status: 'cancelled' } },
      { new: true, runValidators: true }
    );

    if (!updatedRide) {
      return res.status(409).json({ success: false, message: 'Ride status changed before cancellation completed.' });
    }

    await updatedRide.populate('customer', 'name email phone');
    await updatedRide.populate('driver', 'name email phone');

    if (updatedRide.driver) {
      await queueNotification({
        userId: updatedRide.driver._id,
        role: 'driver',
        rideId: updatedRide._id,
        notificationType: 'ride_cancelled',
        title: 'Ride cancelled',
        message: `Ride #${updatedRide._id} was cancelled by the rider before assignment.`,
        channel: 'combined',
        details: {
          rideId: String(updatedRide._id),
          statusLabel: 'Cancelled',
        },
      });
    }

    await queueNotification({
      userId: updatedRide.customer._id,
      role: 'customer',
      rideId: updatedRide._id,
      notificationType: 'ride_cancelled',
      title: 'Ride cancelled',
      message: `Your ride to ${updatedRide.dropoff.address} has been cancelled successfully.`,
      channel: 'combined',
      details: {
        rideId: String(updatedRide._id),
        statusLabel: 'Cancelled',
      },
    });

    await queueAdminNotification({
      title: 'Ride cancelled',
      message: `Ride #${updatedRide._id} was cancelled by rider ${req.user.name}.`,
      notificationType: 'ride_cancelled',
      rideId: updatedRide._id,
      details: { actorName: req.user.name },
    });

    return res.status(200).json({
      success: true,
      message: 'Ride cancelled successfully.',
      ride: updatedRide,
    });
  } catch (error) {
    return next(error);
  }
};

export const recordRidePayment = async (req, res, next) => {
  try {
    if (req.user.role !== 'customer') {
      return res.status(403).json({ success: false, message: 'Only the rider can submit ride payment.' });
    }

    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid ride ID.' });
    }

    const { method } = req.body;
    if (!['cash', 'upi', 'card'].includes(method)) {
      return res.status(400).json({ success: false, message: 'Choose cash, UPI, or card as the payment method.' });
    }

    const ride = await Ride.findOne({ _id: req.params.id, customer: req.user._id });
    if (!ride) {
      return res.status(404).json({ success: false, message: 'Ride not found for this account.' });
    }

    if (ride.status !== 'completed') {
      return res.status(400).json({ success: false, message: 'Payment is available after the trip is completed.' });
    }

    if (ride.payment?.status === 'paid') {
      return res.status(409).json({ success: false, message: 'Payment has already been recorded.' });
    }

    ride.payment = { status: 'paid', method, paidAt: new Date() };
    await ride.save();

    const transactionId = `RIDE-${ride._id.toString().slice(-8).toUpperCase()}`;
    await queueNotification({
      userId: ride.customer,
      role: 'customer',
      rideId: ride._id,
      notificationType: 'payment_receipt',
      title: 'Payment successful',
      message: `Payment received for ride #${ride._id}. Thank you for riding with RideGo.`,
      channel: 'combined',
      details: {
        rideId: String(ride._id),
        amount: Number(ride.fare || 0),
        method,
        transactionId,
        date: new Date().toISOString(),
      },
    });

    await queueAdminNotification({
      title: 'Payment captured',
      message: `Ride #${ride._id} was paid successfully via ${method}.`,
      notificationType: 'payment_receipt',
      rideId: ride._id,
      details: { actorName: req.user.name },
    });

    return res.status(200).json({
      success: true,
      message: 'Demo payment recorded. No real payment was processed.',
      ride,
    });
  } catch (error) {
    return next(error);
  }
};

export const getAvailableRides = async (req, res, next) => {
  try {
    if (!req.user.isActive) {
      return res.status(403).json({ success: false, message: 'This driver account is suspended and cannot view ride requests.' });
    }

    const verificationState = ensureDriverIsVerified(req.user);
    if (!verificationState.allowed) {
      return res.status(403).json({ success: false, message: verificationState.message });
    }

    const rides = await populateRide(Ride.find({ status: 'pending', driver: null }));
    return res.status(200).json({ success: true, count: rides.length, rides });
  } catch (error) {
    return next(error);
  }
};

export const getAssignedRides = async (req, res, next) => {
  try {
    if (!req.user.isActive) {
      return res.status(403).json({ success: false, message: 'This driver account is suspended and cannot access assigned rides.' });
    }

    const verificationState = ensureDriverIsVerified(req.user);
    if (!verificationState.allowed) {
      return res.status(403).json({ success: false, message: verificationState.message });
    }

    const rides = await populateRide(Ride.find({ driver: req.user._id }));
    return res.status(200).json({ success: true, count: rides.length, rides });
  } catch (error) {
    return next(error);
  }
};

export const acceptRide = async (req, res, next) => {
  try {
    if (req.user.role !== 'driver') {
      return res.status(403).json({ success: false, message: 'Only drivers can accept rides.' });
    }

    const verificationState = ensureDriverIsVerified(req.user);
    if (!verificationState.allowed) {
      return res.status(403).json({ success: false, message: verificationState.message });
    }

    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid ride ID.' });
    }

    const updatedRide = await Ride.findOneAndUpdate(
      { _id: req.params.id, status: 'pending', driver: null },
      { driver: req.user._id, status: 'accepted' },
      { new: true, runValidators: true }
    )
      .populate('customer', 'name email phone')
      .populate('driver', 'name email phone');

    if (!updatedRide) {
      return res.status(409).json({ success: false, message: 'This ride is not available or already assigned.' });
    }

    await queueNotification({
      userId: updatedRide.customer._id,
      role: 'customer',
      rideId: updatedRide._id,
      notificationType: 'driver_assignment',
      title: 'Driver assigned',
      message: `Driver ${updatedRide.driver.name} has accepted your ride to ${updatedRide.dropoff.address}.`,
      channel: 'combined',
      details: {
        rideId: String(updatedRide._id),
        statusLabel: 'Accepted',
      },
    });

    await queueNotification({
      userId: updatedRide.driver._id,
      role: 'driver',
      rideId: updatedRide._id,
      notificationType: 'ride_assignment_received',
      title: 'New ride assigned',
      message: `You have been assigned a new trip from ${updatedRide.pickup.address} to ${updatedRide.dropoff.address}.`,
      channel: 'combined',
      details: {
        rideId: String(updatedRide._id),
        statusLabel: 'Assigned',
      },
    });

    return res.status(200).json({
      success: true,
      message: 'Ride accepted successfully.',
      ride: updatedRide,
    });
  } catch (error) {
    return next(error);
  }
};

export const updateRideStatus = async (req, res, next) => {
  try {
    if (req.user.role !== 'driver') {
      return res.status(403).json({ success: false, message: 'Only drivers can update ride status.' });
    }

    const verificationState = ensureDriverIsVerified(req.user);
    if (!verificationState.allowed) {
      return res.status(403).json({ success: false, message: verificationState.message });
    }

    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid ride ID.' });
    }

    const { status } = req.body;
    const ride = await Ride.findOne({ _id: req.params.id, driver: req.user._id });

    if (!ride) {
      return res.status(404).json({ success: false, message: 'Assigned ride not found.' });
    }

    const validTransitions = {
      accepted: ['in_progress'],
      in_progress: ['completed'],
      completed: [],
      cancelled: [],
      pending: [],
    };

    if (!validTransitions[ride.status] || !validTransitions[ride.status].includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status transition from ${ride.status} to ${status}.`,
      });
    }

    const updatedRide = await Ride.findOneAndUpdate(
      { _id: ride._id, driver: req.user._id, status: ride.status },
      { $set: { status } },
      { new: true, runValidators: true }
    );

    if (!updatedRide) {
      return res.status(409).json({ success: false, message: 'Ride status changed before this update completed.' });
    }

    await updatedRide.populate('customer', 'name email phone');
    await updatedRide.populate('driver', 'name email phone');

    const statusCopy = {
      accepted: 'Driver accepted the ride',
      in_progress: 'Ride started',
      completed: 'Ride completed',
    };

    const notificationStatus = statusCopy[status] || 'Ride status updated';
    await queueNotification({
      userId: updatedRide.customer._id,
      role: 'customer',
      rideId: updatedRide._id,
      notificationType: 'ride_status',
      title: notificationStatus,
      message: `Your ride with driver ${updatedRide.driver.name} is now ${status === 'in_progress' ? 'in progress' : status === 'completed' ? 'completed' : 'accepted'}.`,
      channel: 'combined',
      details: {
        rideId: String(updatedRide._id),
        statusLabel: notificationStatus,
      },
    });

    await queueNotification({
      userId: updatedRide.driver._id,
      role: 'driver',
      rideId: updatedRide._id,
      notificationType: 'ride_status',
      title: notificationStatus,
      message: `Ride #${updatedRide._id} status updated to ${status === 'in_progress' ? 'in progress' : status === 'completed' ? 'completed' : 'accepted'}.`,
      channel: 'combined',
      details: {
        rideId: String(updatedRide._id),
        statusLabel: notificationStatus,
      },
    });

    await queueAdminNotification({
      title: 'Ride status update',
      message: `Ride #${updatedRide._id} status changed to ${status}.`,
      notificationType: 'ride_status',
      rideId: updatedRide._id,
      details: { actorName: updatedRide.driver.name },
    });

    return res.status(200).json({
      success: true,
      message: 'Ride status updated successfully.',
      ride: updatedRide,
    });
  } catch (error) {
    return next(error);
  }
};

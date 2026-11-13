import Ride from '../models/Ride.js';
import User from '../models/User.js';
import { sendEmailNotification, verifyEmailConnection } from '../utils/notificationDelivery.js';
import { getAdminNotificationSummary, queueAdminNotification, queueNotification, retryFailedNotification } from '../utils/notificationService.js';

const maskEmail = (email = '') => {
  if (!email) return 'not configured';
  const [localPart, domainPart] = String(email).split('@');
  if (!domainPart) return email;
  const visibleLocal = localPart.length <= 2 ? localPart.slice(0, 1) : `${localPart.slice(0, 2)}***`;
  return `${visibleLocal}@${domainPart}`;
};

const populateRide = (query) =>
  query
    .populate('customer', 'name email')
    .populate('driver', 'name email')
    .sort({ createdAt: -1 });

export const getAdminStats = async (req, res, next) => {
  try {
    const [
      totalUsers,
      totalCustomers,
      totalDrivers,
      totalRides,
      pendingRides,
      acceptedRides,
      activeRides,
      completedRides,
      cancelledRides,
      totalRevenue,
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ role: 'customer' }),
      User.countDocuments({ role: 'driver' }),
      Ride.countDocuments(),
      Ride.countDocuments({ status: 'pending' }),
      Ride.countDocuments({ status: 'accepted' }),
      Ride.countDocuments({ status: { $in: ['accepted', 'in_progress'] } }),
      Ride.countDocuments({ status: 'completed' }),
      Ride.countDocuments({ status: 'cancelled' }),
      Ride.aggregate([
        { $match: { status: 'completed' } },
        { $group: { _id: null, total: { $sum: '$fare' } } },
      ]).then((result) => (result[0]?.total || 0)),
    ]);

    return res.status(200).json({
      success: true,
      stats: {
        totalUsers,
        totalCustomers,
        totalDrivers,
        totalRides,
        pendingRides,
        acceptedRides,
        activeRides,
        completedRides,
        cancelledRides,
        totalRevenue,
      },
    });
  } catch (error) {
    return next(error);
  }
};

export const getAdminRides = async (req, res, next) => {
  try {
    const { status, search } = req.query;
    const filters = {};

    if (status) {
      filters.status = status;
    }

    if (search) {
      const searchValue = search.trim();
      const matchingUsers = await User.find({ name: { $regex: searchValue, $options: 'i' } }).select('_id');

      filters.$or = [
        { 'pickup.address': { $regex: searchValue, $options: 'i' } },
        { 'dropoff.address': { $regex: searchValue, $options: 'i' } },
        { cabType: { $regex: searchValue, $options: 'i' } },
        { customer: { $in: matchingUsers.map((user) => user._id) } },
        { driver: { $in: matchingUsers.map((user) => user._id) } },
      ];
    }

    const rides = await populateRide(Ride.find(filters));

    return res.status(200).json({
      success: true,
      count: rides.length,
      rides,
    });
  } catch (error) {
    return next(error);
  }
};

export const getAdminUsers = async (req, res, next) => {
  try {
    const users = await User.find().select('-password').sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: users.length,
      users,
    });
  } catch (error) {
    return next(error);
  }
};

export const updateRideStatusByAdmin = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const validStatuses = ['pending', 'accepted', 'in_progress', 'completed', 'cancelled'];

    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid ride status provided.' });
    }

    const ride = await Ride.findById(id);
    if (!ride) {
      return res.status(404).json({ success: false, message: 'Ride not found.' });
    }

    ride.status = status;
    await ride.save();

    return res.status(200).json({
      success: true,
      message: 'Ride status updated successfully.',
      ride,
    });
  } catch (error) {
    return next(error);
  }
};

export const updateUserStatusByAdmin = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;

    if (typeof isActive !== 'boolean') {
      return res.status(400).json({ success: false, message: 'isActive must be a boolean value.' });
    }

    const user = await User.findById(id).select('-password');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    user.isActive = isActive;
    await user.save();

    return res.status(200).json({
      success: true,
      message: 'User status updated successfully.',
      user,
    });
  } catch (error) {
    return next(error);
  }
};

export const getPendingDriverVerifications = async (req, res, next) => {
  try {
    const users = await User.find({
      role: 'driver',
      'verification.status': { $in: ['pending_review', 'rejected'] },
    })
      .select('-password')
      .sort({ updatedAt: -1 });

    return res.status(200).json({
      success: true,
      count: users.length,
      users,
    });
  } catch (error) {
    return next(error);
  }
};

export const getAdminActivity = async (req, res, next) => {
  try {
    const [rides, users] = await Promise.all([
      Ride.find({})
        .populate('customer', 'name email')
        .populate('driver', 'name email')
        .sort({ updatedAt: -1, createdAt: -1 })
        .limit(12)
        .lean(),
      User.find({})
        .select('name email role isActive verification.status createdAt updatedAt')
        .sort({ updatedAt: -1, createdAt: -1 })
        .limit(12)
        .lean(),
    ]);

    const events = [];

    rides.forEach((ride) => {
      const customerName = ride.customer?.name || 'Customer';
      const driverName = ride.driver?.name || 'Unassigned';
      const title =
        ride.status === 'completed'
          ? 'Ride completed'
          : ride.status === 'cancelled'
            ? 'Ride cancelled'
            : ride.status === 'accepted'
              ? 'Ride accepted'
              : 'Ride created';

      events.push({
        id: `ride-${ride._id}`,
        type: 'ride',
        category: 'ride',
        title,
        message: `${customerName} → ${ride.dropoff?.address || 'Destination'} via ${driverName} (${ride.status})`,
        timestamp: ride.updatedAt || ride.createdAt,
        meta: {
          rideId: ride._id,
          status: ride.status,
          fare: Number(ride.fare || 0),
          customer: customerName,
          driver: driverName,
        },
      });

      if (ride.payment?.status === 'paid') {
        events.push({
          id: `payment-${ride._id}`,
          type: 'payment',
          category: 'payment',
          title: 'Payment captured',
          message: `${customerName} paid ₹${Number(ride.fare || 0).toFixed(2)} for ${ride.cabType || 'ride'}`,
          timestamp: ride.payment?.updatedAt || ride.updatedAt || ride.createdAt,
          meta: {
            rideId: ride._id,
            amount: Number(ride.fare || 0),
            method: ride.payment?.method || 'upi',
          },
        });
      }
    });

    users.forEach((user) => {
      if (user.verification?.status && user.verification.status !== 'not_started') {
        events.push({
          id: `verification-${user._id}`,
          type: 'verification',
          category: 'verification',
          title: `${user.role === 'driver' ? 'Driver' : 'User'} verification ${user.verification.status}`,
          message: `${user.name} is marked as ${user.verification.status}.`,
          timestamp: user.verification.updatedAt || user.updatedAt || user.createdAt,
          meta: {
            userId: user._id,
            role: user.role,
            verificationStatus: user.verification.status,
          },
        });
      }

      events.push({
        id: `user-${user._id}`,
        type: 'user',
        category: 'user',
        title: user.isActive ? 'User active' : 'User deactivated',
        message: `${user.name} (${user.role}) is ${user.isActive ? 'active' : 'inactive'} in the system.`,
        timestamp: user.updatedAt || user.createdAt,
        meta: {
          userId: user._id,
          role: user.role,
          isActive: !!user.isActive,
        },
      });
    });

    const sortedEvents = events
      .sort((first, second) => new Date(second.timestamp || 0) - new Date(first.timestamp || 0))
      .slice(0, 20);

    return res.status(200).json({
      success: true,
      count: sortedEvents.length,
      events: sortedEvents,
    });
  } catch (error) {
    return next(error);
  }
};

const updateVerificationStatus = async (req, res, next, decision) => {
  try {
    const { id } = req.params;
    const { notes } = req.body;

    const user = await User.findById(id).select('-password');
    if (!user) {
      return res.status(404).json({ success: false, message: 'Driver account not found.' });
    }

    if (user.role !== 'driver') {
      return res.status(400).json({ success: false, message: 'Only driver accounts can be verified.' });
    }

    const nextStatus = decision === 'approve' ? 'approved' : 'rejected';
    const reviewNotes = notes && typeof notes === 'string' ? notes.trim() : '';
    const auditTrail = user.verification?.auditTrail || [];

    user.verification = {
      ...user.verification,
      status: nextStatus,
      reviewNotes,
      reviewedBy: req.user._id,
      reviewedAt: new Date(),
      updatedAt: new Date(),
      auditTrail: [
        ...auditTrail,
        {
          action: nextStatus,
          notes: reviewNotes || `Driver verification ${nextStatus} by admin.`,
          actor: req.user._id.toString(),
          createdAt: new Date(),
        },
      ],
    };

    if (nextStatus === 'approved') {
      user.verification.videoKyc = { ...user.verification.videoKyc, status: 'completed' };
    }

    await user.save();

    const statusTitle = nextStatus === 'approved' ? 'Verification approved' : 'Verification rejected';
    const statusMessage = nextStatus === 'approved'
      ? 'Your driver verification has been approved. You can now accept rides.'
      : `Your driver verification could not be approved yet. Reason: ${reviewNotes || 'Please resubmit the required documents.'}`;

    await queueNotification({
      userId: user._id,
      role: 'driver',
      notificationType: 'driver_verification',
      title: statusTitle,
      message: statusMessage,
      channel: 'combined',
      details: {
        status: nextStatus,
        reason: reviewNotes || 'No additional reason provided.',
        nextSteps: nextStatus === 'approved'
          ? 'You are now eligible to accept ride requests.'
          : 'Please fix the issue mentioned and submit the verification again.',
      },
    });

    await queueAdminNotification({
      title: nextStatus === 'approved' ? 'Driver verification approved' : 'Driver verification rejected',
      message: `${user.name} verification status changed to ${nextStatus}.`,
      notificationType: 'driver_verification',
      details: { actorName: req.user.name },
    });

    return res.status(200).json({
      success: true,
      message: `Driver verification ${nextStatus} successfully.`,
      verification: user.verification,
      user: user.toJSON(),
    });
  } catch (error) {
    return next(error);
  }
};

export const approveDriverVerification = async (req, res, next) => updateVerificationStatus(req, res, next, 'approve');
export const rejectDriverVerification = async (req, res, next) => updateVerificationStatus(req, res, next, 'reject');

export const getAdminNotificationStatus = async (req, res, next) => {
  try {
    const summary = await getAdminNotificationSummary();
    return res.status(200).json({
      success: true,
      summary,
    });
  } catch (error) {
    return next(error);
  }
};

export const retryAdminNotification = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (id === 'test' || id === 'sample') {
      const summary = await getAdminNotificationSummary();
      return res.status(200).json({
        success: true,
        message: 'No failed notification chosen for retry. Provider state is reported safely without exposing secrets.',
        summary,
      });
    }

    const notification = await retryFailedNotification(id);
    if (!notification) {
      return res.status(404).json({ success: false, message: 'Notification not found.' });
    }

    return res.status(200).json({
      success: true,
      message: 'Retry queued successfully.',
      notification,
      summary: await getAdminNotificationSummary(),
    });
  } catch (error) {
    return next(error);
  }
};

export const testAdminSmtpEmail = async (req, res, next) => {
  try {
    const to = (req.body?.to || process.env.EMAIL_FROM || process.env.SUPPORT_EMAIL || req.user.email || '').trim();
    const subject = (req.body?.subject || 'RideGo SMTP verification').trim();
    const message = (req.body?.message || 'This is a live SMTP verification email sent from the RideGo admin test endpoint.').trim();

    if (!to) {
      return res.status(400).json({
        success: false,
        reason: 'No test recipient was provided and no default email address is configured.',
      });
    }

    const connectionResult = await verifyEmailConnection();
    if (!connectionResult.ok) {
      return res.status(400).json({
        success: false,
        reason: connectionResult.reason || 'SMTP verification is unavailable right now.',
        recipient: maskEmail(to),
      });
    }

    const emailResult = await sendEmailNotification({
      to,
      title: subject || 'RideGo SMTP verification',
      message,
      userName: req.user?.name || 'Admin',
      notificationType: 'admin_alert',
      details: {
        actorName: req.user?.name || 'Admin',
        emailType: 'smtp_test',
      },
    });

    if (!emailResult.ok) {
      return res.status(502).json({
        success: false,
        reason: emailResult.reason || 'SMTP delivery failed.',
        recipient: maskEmail(to),
      });
    }

    return res.status(200).json({
      success: true,
      reason: 'SMTP connection verified and test email was accepted by the provider.',
      recipient: maskEmail(to),
      messageId: emailResult.messageId || null,
    });
  } catch (error) {
    return next(error);
  }
};

export const getRideById = async (req, res, next) => {
  try {
    const ride = await populateRide(Ride.findById(req.params.id));

    if (!ride) {
      return res.status(404).json({ success: false, message: 'Ride not found.' });
    }

    return res.status(200).json({ success: true, ride });
  } catch (error) {
    return next(error);
  }
};

import net from 'net';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import app from './app.js';
import Notification from './models/Notification.js';
import { validateEmailConfiguration } from './utils/notificationDelivery.js';
import { findAvailablePort } from './utils/portFinder.js';

describe('RideGo API smoke tests', () => {
  it('returns API health status', async () => {
    const response = await request(app).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });

  it('validates missing Gmail SMTP configuration before sending email', () => {
    const originalHost = process.env.EMAIL_HOST;
    const originalUser = process.env.EMAIL_USER;
    const originalPass = process.env.EMAIL_PASS;
    const originalFrom = process.env.EMAIL_FROM;

    delete process.env.EMAIL_HOST;
    delete process.env.EMAIL_USER;
    delete process.env.EMAIL_PASS;
    delete process.env.EMAIL_FROM;

    try {
      const result = validateEmailConfiguration();
      expect(result.ok).toBe(false);
      expect(result.reason).toMatch(/EMAIL_HOST|EMAIL_USER|EMAIL_PASS|EMAIL_FROM/i);
    } finally {
      if (originalHost) process.env.EMAIL_HOST = originalHost;
      if (originalUser) process.env.EMAIL_USER = originalUser;
      if (originalPass) process.env.EMAIL_PASS = originalPass;
      if (originalFrom) process.env.EMAIL_FROM = originalFrom;
    }
  });

  it('requires login role to match the account role', async () => {
    const email = `role.mismatch.${Date.now()}@test.com`;

    await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Role Mismatch Driver',
        email,
        password: 'Driver@123',
        role: 'driver',
      });

    const response = await request(app)
      .post('/api/auth/login')
      .send({
        email,
        password: 'Driver@123',
        role: 'customer',
      });

    expect(response.status).toBe(401);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toMatch(/role|driver|rider/i);
  });

  it('accepts driver registration in the role-based onboarding flow', async () => {
    const email = `workflow.driver.${Date.now()}@test.com`;

    const response = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Workflow Driver',
        email,
        password: 'Driver@123',
        role: 'driver',
      });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.user.role).toBe('driver');
  });

  it('creates a real default admin account for role-based admin login', async () => {
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@ridego.com';
    const adminPassword = process.env.ADMIN_PASSWORD || 'Admin@123';

    const response = await request(app)
      .post('/api/auth/login')
      .send({
        email: adminEmail,
        password: adminPassword,
        role: 'admin',
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.user.role).toBe('admin');
  });

  it('allows a rider to fetch a quote before login so the booking assistant can show live weather and pricing', async () => {
    const response = await request(app)
      .post('/api/rides/quote')
      .send({
        pickup: { address: 'Connaught Place, New Delhi', latitude: 28.6304, longitude: 77.2167 },
        dropoff: { address: 'India Gate, New Delhi', latitude: 28.6129, longitude: 77.2295 },
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.quote).toHaveProperty('fares');
    expect(response.body.quote).toHaveProperty('weather');
  });

  it('lets a rider update their basic profile details', async () => {
    const suffix = `${Date.now()}`;
    const registerResponse = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Profile Rider',
        email: `profile.rider.${suffix}@test.com`,
        password: 'Rider@123',
        role: 'customer',
      });

    const response = await request(app)
      .put('/api/auth/profile')
      .set('Authorization', `Bearer ${registerResponse.body.token}`)
      .send({
        name: 'Profile Rider Updated',
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.user.name).toBe('Profile Rider Updated');
  });

  it('persists a direct profile photo for the authenticated user', async () => {
    const suffix = `${Date.now()}`;
    const registerResponse = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Photo Rider',
        email: `photo.rider.${suffix}@test.com`,
        password: 'Rider@123',
        role: 'customer',
      });

    const photo = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAF';
    const response = await request(app)
      .put('/api/auth/profile')
      .set('Authorization', `Bearer ${registerResponse.body.token}`)
      .send({
        name: 'Photo Rider',
        photo,
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.user.photo).toBe(photo);
  });

  it('shares persisted live locations only between participants of an accepted ride', async () => {
    const suffix = `${Date.now()}`;
    const riderResponse = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Location Rider', email: `location.rider.${suffix}@test.com`, password: 'Rider@123', role: 'customer' });
    const driverResponse = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Location Driver', email: `location.driver.${suffix}@test.com`, password: 'Driver@123', role: 'driver' });
    const adminResponse = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Location Admin', email: `location.admin.${suffix}@test.com`, password: 'Admin@123', role: 'admin' });

    await request(app)
      .post('/api/driver/verification/submit')
      .set('Authorization', `Bearer ${driverResponse.body.token}`)
      .send({
        personalId: 'DL-LOCATION',
        documents: [{ type: 'license', url: 'https://example.com/license.jpg', status: 'uploaded' }],
        vehicle: { make: 'Maruti', model: 'Swift', registrationNumber: 'DL01AA1111', color: 'White' },
        videoKyc: { provider: 'zego', sessionId: 'location-video', status: 'completed' },
      });

    await request(app)
      .patch(`/api/admin/verification/${driverResponse.body.user._id}/approve`)
      .set('Authorization', `Bearer ${adminResponse.body.token}`)
      .send({ notes: 'Location driver documentation verified.' });

    const rideResponse = await request(app)
      .post('/api/rides')
      .set('Authorization', `Bearer ${riderResponse.body.token}`)
      .send({
        pickup: { address: 'Pickup', latitude: 28.6304, longitude: 77.2167 },
        dropoff: { address: 'Dropoff', latitude: 28.6129, longitude: 77.2295 },
        cabType: 'Mini',
      });
    const rideId = rideResponse.body.ride._id;
    const coordinates = { latitude: 28.62, longitude: 77.22, accuracy: 10 };

    const prematureUpdate = await request(app)
      .patch(`/api/rides/${rideId}/location`)
      .set('Authorization', `Bearer ${riderResponse.body.token}`)
      .send(coordinates);
    expect(prematureUpdate.status).toBe(400);

    const acceptedResponse = await request(app)
      .patch(`/api/driver/rides/${rideId}/accept`)
      .set('Authorization', `Bearer ${driverResponse.body.token}`);
    expect(acceptedResponse.status).toBe(200);

    const riderUpdate = await request(app)
      .patch(`/api/rides/${rideId}/location`)
      .set('Authorization', `Bearer ${riderResponse.body.token}`)
      .send(coordinates);
    expect(riderUpdate.status).toBe(200);

    const driverUpdate = await request(app)
      .patch(`/api/rides/${rideId}/location`)
      .set('Authorization', `Bearer ${driverResponse.body.token}`)
      .send({ latitude: 28.621, longitude: 77.221, accuracy: 8 });
    expect(driverUpdate.status).toBe(200);

    const riderRidesResponse = await request(app)
      .get('/api/rides/my-rides')
      .set('Authorization', `Bearer ${riderResponse.body.token}`);
    const sharedRide = riderRidesResponse.body.rides.find((ride) => ride._id === rideId);
    expect(sharedRide.riderLocation.latitude).toBe(coordinates.latitude);
    expect(sharedRide.driverLocation.latitude).toBe(28.621);
  });

  it('records a one-time rider payment only after the trip is completed', async () => {
    const suffix = `${Date.now()}`;
    const riderResponse = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Payment Rider', email: `payment.rider.${suffix}@test.com`, password: 'Rider@123', role: 'customer' });
    const driverResponse = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Payment Driver', email: `payment.driver.${suffix}@test.com`, password: 'Driver@123', role: 'driver' });
    const adminResponse = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Payment Admin', email: `payment.admin.${suffix}@test.com`, password: 'Admin@123', role: 'admin' });

    await request(app)
      .post('/api/driver/verification/submit')
      .set('Authorization', `Bearer ${driverResponse.body.token}`)
      .send({
        personalId: 'DL-PAYMENT',
        documents: [{ type: 'license', url: 'https://example.com/payment-license.jpg', status: 'uploaded' }],
        vehicle: { make: 'Hyundai', model: 'i20', registrationNumber: 'HR01CC9999', color: 'Blue' },
        videoKyc: { provider: 'zego', sessionId: 'payment-video', status: 'completed' },
      });

    await request(app)
      .patch(`/api/admin/verification/${driverResponse.body.user._id}/approve`)
      .set('Authorization', `Bearer ${adminResponse.body.token}`)
      .send({ notes: 'Payment driver verification approved.' });

    const rideResponse = await request(app)
      .post('/api/rides')
      .set('Authorization', `Bearer ${riderResponse.body.token}`)
      .send({
        pickup: { address: 'Pickup', latitude: 28.6304, longitude: 77.2167 },
        dropoff: { address: 'Dropoff', latitude: 28.6129, longitude: 77.2295 },
        cabType: 'Mini',
      });
    const rideId = rideResponse.body.ride._id;
    const riderAuth = `Bearer ${riderResponse.body.token}`;
    const driverAuth = `Bearer ${driverResponse.body.token}`;

    const earlyPayment = await request(app)
      .post(`/api/rides/${rideId}/payment`)
      .set('Authorization', riderAuth)
      .send({ method: 'upi' });
    expect(earlyPayment.status).toBe(400);

    await request(app).patch(`/api/driver/rides/${rideId}/accept`).set('Authorization', driverAuth).expect(200);
    await request(app).patch(`/api/driver/rides/${rideId}/status`).set('Authorization', driverAuth).send({ status: 'in_progress' }).expect(200);
    await request(app).patch(`/api/driver/rides/${rideId}/status`).set('Authorization', driverAuth).send({ status: 'completed' }).expect(200);

    const paymentResponse = await request(app)
      .post(`/api/rides/${rideId}/payment`)
      .set('Authorization', riderAuth)
      .send({ method: 'upi' });
    expect(paymentResponse.status).toBe(200);
    expect(paymentResponse.body.ride.payment.status).toBe('paid');
    expect(paymentResponse.body.ride.payment.method).toBe('upi');
    expect(paymentResponse.body.message).toMatch(/demo payment|no real payment/i);

    const duplicatePayment = await request(app)
      .post(`/api/rides/${rideId}/payment`)
      .set('Authorization', riderAuth)
      .send({ method: 'upi' });
    expect(duplicatePayment.status).toBe(409);
  }, 20000);

  it('exposes a safe admin-only SMTP verification endpoint', async () => {
    const adminResponse = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'SMTP Admin',
        email: `smtp.admin.${Date.now()}@test.com`,
        password: 'Admin@123',
        role: 'admin',
      });

    const response = await request(app)
      .post('/api/admin/notifications/test-email')
      .set('Authorization', `Bearer ${adminResponse.body.token}`)
      .send({
        to: 'support@ridego.com',
        subject: 'RideGo SMTP health check',
        message: 'This is a test message from the admin SMTP verification endpoint.',
      });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.reason).toMatch(/disabled|configured|missing|smtp/i);
  });

  it('keeps combined ride notifications failed when SMTP delivery is rejected', async () => {
    const previousLiveEmail = process.env.ENABLE_LIVE_EMAIL;
    process.env.ENABLE_LIVE_EMAIL = 'true';

    try {
      const suffix = `${Date.now()}`;
      const riderResponse = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'SMTP Notification Rider',
          email: `smtp.notification.${suffix}@test.com`,
          password: 'Rider@123',
          role: 'customer',
        });

      const rideResponse = await request(app)
        .post('/api/rides')
        .set('Authorization', `Bearer ${riderResponse.body.token}`)
        .send({
          pickup: { address: 'Connaught Place, New Delhi', latitude: 28.6304, longitude: 77.2167 },
          dropoff: { address: 'India Gate, New Delhi', latitude: 28.6129, longitude: 77.2295 },
          cabType: 'Mini',
        });

      expect(rideResponse.status).toBe(201);

      await new Promise((resolve) => setTimeout(resolve, 2500));

      const notification = await Notification.findOne({
        userId: riderResponse.body.user._id,
        notificationType: 'ride_booking',
      }).sort({ createdAt: -1 });

      expect(notification).toBeTruthy();
      expect(notification.status).toBe('failed');
      expect(notification.providerStatus).toBe('failed');
    } finally {
      if (previousLiveEmail === undefined) {
        delete process.env.ENABLE_LIVE_EMAIL;
      } else {
        process.env.ENABLE_LIVE_EMAIL = previousLiveEmail;
      }
    }
  });

  it('includes richer operational metrics in the admin dashboard summary', async () => {
    const adminResponse = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Admin Stats User',
        email: `admin.stats.${Date.now()}@test.com`,
        password: 'Admin@123',
        role: 'admin',
      });

    const riderResponse = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Admin Ride Rider',
        email: `admin.rider.${Date.now()}@test.com`,
        password: 'Rider@123',
        role: 'customer',
      });

    const driverResponse = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Admin Ride Driver',
        email: `admin.driver.${Date.now()}@test.com`,
        password: 'Driver@123',
        role: 'driver',
      });

    await request(app)
      .post('/api/driver/verification/submit')
      .set('Authorization', `Bearer ${driverResponse.body.token}`)
      .send({
        personalId: 'DL-ADMIN-STATS',
        documents: [{ type: 'license', url: 'https://example.com/stats-license.jpg', status: 'uploaded' }],
        vehicle: { make: 'Tata', model: 'Nexon', registrationNumber: 'MH14XX1234', color: 'Black' },
        videoKyc: { provider: 'zego', sessionId: 'stats-video', status: 'completed' },
      });

    await request(app)
      .patch(`/api/admin/verification/${driverResponse.body.user._id}/approve`)
      .set('Authorization', `Bearer ${adminResponse.body.token}`)
      .send({ notes: 'Admin stats driver approved.' });

    const rideResponse = await request(app)
      .post('/api/rides')
      .set('Authorization', `Bearer ${riderResponse.body.token}`)
      .send({
        pickup: { address: 'Pickup A', latitude: 28.6304, longitude: 77.2167 },
        dropoff: { address: 'Dropoff A', latitude: 28.6129, longitude: 77.2295 },
        cabType: 'Mini',
      });

    await request(app)
      .patch(`/api/driver/rides/${rideResponse.body.ride._id}/accept`)
      .set('Authorization', `Bearer ${driverResponse.body.token}`)
      .expect(200);

    const statsResponse = await request(app)
      .get('/api/admin/stats')
      .set('Authorization', `Bearer ${adminResponse.body.token}`);

    expect(statsResponse.status).toBe(200);
    expect(statsResponse.body.success).toBe(true);
    expect(statsResponse.body.stats).toHaveProperty('totalDrivers');
    expect(statsResponse.body.stats).toHaveProperty('totalCustomers');
    expect(statsResponse.body.stats).toHaveProperty('activeRides');
    expect(statsResponse.body.stats).toHaveProperty('totalRevenue');
    expect(statsResponse.body.stats.activeRides).toBeGreaterThanOrEqual(1);
    expect(statsResponse.body.stats.totalRevenue).toBeGreaterThanOrEqual(0);
  });

  it('exposes a real admin event stream for operational workflow tracking', async () => {
    const adminResponse = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Admin Event User',
        email: `admin.events.${Date.now()}@test.com`,
        password: 'Admin@123',
        role: 'admin',
      });

    const riderResponse = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Event Rider',
        email: `event.rider.${Date.now()}@test.com`,
        password: 'Rider@123',
        role: 'customer',
      });

    const driverResponse = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Event Driver',
        email: `event.driver.${Date.now()}@test.com`,
        password: 'Driver@123',
        role: 'driver',
      });

    const rideResponse = await request(app)
      .post('/api/rides')
      .set('Authorization', `Bearer ${riderResponse.body.token}`)
      .send({
        pickup: { address: 'Event Pickup', latitude: 28.6304, longitude: 77.2167 },
        dropoff: { address: 'Event Dropoff', latitude: 28.6129, longitude: 77.2295 },
        cabType: 'Mini',
      });

    await request(app)
      .post('/api/driver/verification/submit')
      .set('Authorization', `Bearer ${driverResponse.body.token}`)
      .send({
        personalId: 'DL-EVENT-TRACKING',
        documents: [{ type: 'license', url: 'https://example.com/event-license.jpg', status: 'uploaded' }],
        vehicle: { make: 'Hyundai', model: 'Creta', registrationNumber: 'DL09EE2323', color: 'Silver' },
        videoKyc: { provider: 'zego', sessionId: 'event-video', status: 'completed' },
      });

    await request(app)
      .patch(`/api/admin/verification/${driverResponse.body.user._id}/approve`)
      .set('Authorization', `Bearer ${adminResponse.body.token}`)
      .send({ notes: 'Verified for event tracking.' });

    const response = await request(app)
      .get('/api/admin/events')
      .set('Authorization', `Bearer ${adminResponse.body.token}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.events.length).toBeGreaterThan(0);
    expect(response.body.events.some((event) => event.type === 'verification' || event.type === 'ride')).toBe(true);
    expect(response.body.events[0]).toHaveProperty('title');
  });

  it('lets admin resolve a ride and toggle a user status', async () => {
    const adminResponse = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Admin Control User',
        email: `admin.control.${Date.now()}@test.com`,
        password: 'Admin@123',
        role: 'admin',
      });

    const riderResponse = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Admin Control Rider',
        email: `admin.control.rider.${Date.now()}@test.com`,
        password: 'Rider@123',
        role: 'customer',
      });

    const rideResponse = await request(app)
      .post('/api/rides')
      .set('Authorization', `Bearer ${riderResponse.body.token}`)
      .send({
        pickup: { address: 'Rider', latitude: 28.6304, longitude: 77.2167 },
        dropoff: { address: 'Dropper', latitude: 28.6129, longitude: 77.2295 },
        cabType: 'Mini',
      });

    const updateRide = await request(app)
      .patch(`/api/admin/rides/${rideResponse.body.ride._id}/status`)
      .set('Authorization', `Bearer ${adminResponse.body.token}`)
      .send({ status: 'cancelled' });

    expect(updateRide.status).toBe(200);
    expect(updateRide.body.ride.status).toBe('cancelled');

    const userStatus = await request(app)
      .patch(`/api/admin/users/${riderResponse.body.user._id}/status`)
      .set('Authorization', `Bearer ${adminResponse.body.token}`)
      .send({ isActive: false });

    expect(userStatus.status).toBe(200);
    expect(userStatus.body.user.isActive).toBe(false);
  });

  it('requires a driver to complete verification before accepting rides and lets admin approve them', async () => {
    const adminResponse = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Verification Admin',
        email: `verification.admin.${Date.now()}@test.com`,
        password: 'Admin@123',
        role: 'admin',
      });

    const driverResponse = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Verification Driver',
        email: `verification.driver.${Date.now()}@test.com`,
        password: 'Driver@123',
        role: 'driver',
      });

    const submit = await request(app)
      .post('/api/driver/verification/submit')
      .set('Authorization', `Bearer ${driverResponse.body.token}`)
      .send({
        personalId: 'DL-12345',
        documents: [
          { type: 'license', url: 'https://cdn.example.com/license.jpg', status: 'uploaded' },
          { type: 'id', url: 'https://cdn.example.com/id.jpg', status: 'uploaded' },
        ],
        vehicle: {
          make: 'Maruti',
          model: 'Swift',
          registrationNumber: 'DL01AB1234',
          color: 'White',
        },
        videoKyc: { provider: 'zego', sessionId: 'zego-session-123' },
      });

    expect(submit.status).toBe(200);
    expect(submit.body.success).toBe(true);
    expect(submit.body.verification.status).toBe('pending_review');

    const ride = await request(app)
      .post('/api/rides')
      .set('Authorization', `Bearer ${driverResponse.body.token}`)
      .send({
        pickup: { address: 'Pickup', latitude: 28.6304, longitude: 77.2167 },
        dropoff: { address: 'Destination', latitude: 28.6129, longitude: 77.2295 },
        cabType: 'Mini',
      });
    expect(ride.status).toBe(403);

    const adminQueue = await request(app)
      .get('/api/admin/verification/pending')
      .set('Authorization', `Bearer ${adminResponse.body.token}`);
    expect(adminQueue.status).toBe(200);
    expect(adminQueue.body.count).toBeGreaterThanOrEqual(1);

    const approval = await request(app)
      .patch(`/api/admin/verification/${driverResponse.body.user._id}/approve`)
      .set('Authorization', `Bearer ${adminResponse.body.token}`)
      .send({ notes: 'Identity and vehicle documents verified.' });

    expect(approval.status).toBe(200);
    expect(approval.body.verification.status).toBe('approved');

    const driverStatus = await request(app)
      .get('/api/driver/verification')
      .set('Authorization', `Bearer ${driverResponse.body.token}`);
    expect(driverStatus.status).toBe(200);
    expect(driverStatus.body.verification.status).toBe('approved');
  });

  it('creates notification records for ride booking and keeps them scoped to the owning user', async () => {
    const riderResponse = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Notification Rider',
        email: `notify.rider.${Date.now()}@test.com`,
        password: 'Rider@123',
        role: 'customer',
      });

    const driverResponse = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Notification Driver',
        email: `notify.driver.${Date.now()}@test.com`,
        password: 'Driver@123',
        role: 'driver',
      });

    await request(app)
      .post('/api/driver/verification/submit')
      .set('Authorization', `Bearer ${driverResponse.body.token}`)
      .send({
        personalId: 'DL-NOTIFY',
        documents: [{ type: 'license', url: 'https://example.com/notify-license.jpg', status: 'uploaded' }],
        vehicle: { make: 'Kia', model: 'Seltos', registrationNumber: 'MH20AB1234', color: 'Red' },
        videoKyc: { provider: 'zego', sessionId: 'notify-video', status: 'completed' },
      });

    const adminResponse = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Notification Admin',
        email: `notify.admin.${Date.now()}@test.com`,
        password: 'Admin@123',
        role: 'admin',
      });

    await request(app)
      .patch(`/api/admin/verification/${driverResponse.body.user._id}/approve`)
      .set('Authorization', `Bearer ${adminResponse.body.token}`)
      .send({ notes: 'Approved for notification workflow.' });

    const rideResponse = await request(app)
      .post('/api/rides')
      .set('Authorization', `Bearer ${riderResponse.body.token}`)
      .send({
        pickup: { address: 'Pickup', latitude: 28.6304, longitude: 77.2167 },
        dropoff: { address: 'Destination', latitude: 28.6129, longitude: 77.2295 },
        cabType: 'Mini',
      });

    expect(rideResponse.status).toBe(201);

    const riderNotifications = await request(app)
      .get('/api/notifications')
      .set('Authorization', `Bearer ${riderResponse.body.token}`);
    expect(riderNotifications.status).toBe(200);
    expect(riderNotifications.body.success).toBe(true);
    expect(riderNotifications.body.count).toBeGreaterThan(0);
    expect(riderNotifications.body.notifications.some((item) => item.title?.toLowerCase().includes('book') || item.message?.toLowerCase().includes('book'))).toBe(true);

    const driverNotifications = await request(app)
      .get('/api/notifications')
      .set('Authorization', `Bearer ${driverResponse.body.token}`);
    expect(driverNotifications.status).toBe(200);
    expect(driverNotifications.body.success).toBe(true);
    expect(driverNotifications.body.notifications.some((item) => item.userId === riderResponse.body.user._id)).toBe(false);
  });

  it('exposes admin-safe notification provider status and retry controls', async () => {
    const adminResponse = await request(app)
      .post('/api/auth/login')
      .send({
        email: process.env.ADMIN_EMAIL || 'admin@ridego.com',
        password: process.env.ADMIN_PASSWORD || 'Admin@123',
        role: 'admin',
      });

    expect(adminResponse.status).toBe(200);

    const statusResponse = await request(app)
      .get('/api/admin/notifications/status')
      .set('Authorization', `Bearer ${adminResponse.body.token}`);

    expect(statusResponse.status).toBe(200);
    expect(statusResponse.body.success).toBe(true);
    expect(statusResponse.body.summary).toHaveProperty('providerStatus');
    expect(statusResponse.body.summary.providerStatus.email).toHaveProperty('configured');

    const retryResponse = await request(app)
      .post('/api/admin/notifications/test/retry')
      .set('Authorization', `Bearer ${adminResponse.body.token}`);

    expect(retryResponse.status).toBe(200);
    expect(retryResponse.body.success).toBe(true);
  });

  it('finds the next free port when the default port is already in use', async () => {
    const reservedServer = net.createServer();
    const preferredPort = 5055;

    await new Promise((resolve) => reservedServer.listen(preferredPort, resolve));

    try {
      const port = await findAvailablePort(preferredPort, 10);
      expect(port).toBeGreaterThanOrEqual(preferredPort + 1);
    } finally {
      await new Promise((resolve, reject) => {
        reservedServer.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });

  it.each([
    '/api/rides',
    '/api/driver/rides/available',
    '/api/admin/stats',
  ])('rejects unauthenticated access to %s', async (path) => {
    const response = await request(app).get(path);

    expect(response.status).toBe(401);
    expect(response.body.success).toBe(false);
  });
});

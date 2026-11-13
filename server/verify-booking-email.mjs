import dotenv from 'dotenv';
dotenv.config();
process.env.ENABLE_LIVE_EMAIL = 'true';

const { default: request } = await import('supertest');
const { default: app } = await import('./src/app.js');
import Notification from './src/models/Notification.js';

const suffix = Date.now();
const rider = await request(app)
  .post('/api/auth/register')
  .send({ name: 'SMTP Rider', email: `smtp.rider.${suffix}@test.com`, password: 'Rider@123', role: 'customer' });

const ride = await request(app)
  .post('/api/rides')
  .set('Authorization', `Bearer ${rider.body.token}`)
  .send({
    pickup: { address: 'Connaught Place, New Delhi', latitude: 28.6304, longitude: 77.2167 },
    dropoff: { address: 'India Gate, New Delhi', latitude: 28.6129, longitude: 77.2295 },
    cabType: 'Mini',
  });

await new Promise((resolve) => setTimeout(resolve, 2500));

const notification = await Notification.findOne({ userId: rider.body.user._id, notificationType: 'ride_booking' }).sort({ createdAt: -1 }).lean();

console.log(`ride status: ${ride.status}`);
console.log(`ride created: ${Boolean(ride.body && ride.body.ride)}`);
console.log(`notification exists: ${Boolean(notification)}`);
console.log(`notification status: ${notification ? notification.status : 'none'}`);
console.log(`provider status: ${notification ? notification.providerStatus : 'none'}`);
console.log(`error details: ${notification && notification.errorDetails ? notification.errorDetails.replace(/\s+/g, ' ').slice(0, 180) : 'none'}`);

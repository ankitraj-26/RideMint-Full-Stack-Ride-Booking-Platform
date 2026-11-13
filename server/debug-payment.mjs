import request from 'supertest';
import app from './src/app.js';

const suffix = Date.now();
let riderResponse;
let driverResponse;
let adminResponse;
let rideResponse;

try {
  riderResponse = await request(app).post('/api/auth/register').send({ name: 'Payment Rider', email: `payment.rider.${suffix}@test.com`, password: 'Rider@123', role: 'customer' });
  console.log('rider ok', riderResponse.status, !!riderResponse.body.token);

  driverResponse = await request(app).post('/api/auth/register').send({ name: 'Payment Driver', email: `payment.driver.${suffix}@test.com`, password: 'Driver@123', role: 'driver' });
  console.log('driver ok', driverResponse.status, !!driverResponse.body.token);

  adminResponse = await request(app).post('/api/auth/register').send({ name: 'Payment Admin', email: `payment.admin.${suffix}@test.com`, password: 'Admin@123', role: 'admin' });
  console.log('admin ok', adminResponse.status, !!adminResponse.body.token);

  const driverSubmit = await request(app).post('/api/driver/verification/submit').set('Authorization', `Bearer ${driverResponse.body.token}`).send({ personalId: 'DL-PAYMENT', documents: [{ type: 'license', url: 'https://example.com/payment-license.jpg', status: 'uploaded' }], vehicle: { make: 'Hyundai', model: 'i20', registrationNumber: 'HR01CC9999', color: 'Blue' }, videoKyc: { provider: 'zego', sessionId: 'payment-video', status: 'completed' } });
  console.log('driver submit', driverSubmit.status, driverSubmit.body.message);

  const adminApprove = await request(app).patch(`/api/admin/verification/${driverResponse.body.user._id}/approve`).set('Authorization', `Bearer ${adminResponse.body.token}`).send({ notes: 'Payment driver verification approved.' });
  console.log('admin approve', adminApprove.status, adminApprove.body.message);

  rideResponse = await request(app).post('/api/rides').set('Authorization', `Bearer ${riderResponse.body.token}`).send({ pickup: { address: 'Pickup', latitude: 28.6304, longitude: 77.2167 }, dropoff: { address: 'Dropoff', latitude: 28.6129, longitude: 77.2295 }, cabType: 'Mini' });
  console.log('ride create', rideResponse.status, rideResponse.body.message, rideResponse.body.ride?._id);

  const rideId = rideResponse.body.ride._id;
  const earlyPayment = await request(app).post(`/api/rides/${rideId}/payment`).set('Authorization', `Bearer ${riderResponse.body.token}`).send({ method: 'upi' });
  console.log('early payment', earlyPayment.status, earlyPayment.body.message);

  const accept = await request(app).patch(`/api/driver/rides/${rideId}/accept`).set('Authorization', `Bearer ${driverResponse.body.token}`);
  console.log('accept', accept.status, accept.body.message);

  const start = await request(app).patch(`/api/driver/rides/${rideId}/status`).set('Authorization', `Bearer ${driverResponse.body.token}`).send({ status: 'in_progress' });
  console.log('start', start.status, start.body.message);

  const complete = await request(app).patch(`/api/driver/rides/${rideId}/status`).set('Authorization', `Bearer ${driverResponse.body.token}`).send({ status: 'completed' });
  console.log('complete', complete.status, complete.body.message);

  const pay = await request(app).post(`/api/rides/${rideId}/payment`).set('Authorization', `Bearer ${riderResponse.body.token}`).send({ method: 'upi' });
  console.log('pay', pay.status, pay.body.message, pay.body.ride?.payment?.status);

} catch (error) {
  console.error('ERR', error && error.message);
  console.error(error && error.stack);
  process.exitCode = 1;
}

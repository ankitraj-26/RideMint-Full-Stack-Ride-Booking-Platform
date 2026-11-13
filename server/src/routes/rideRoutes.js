import express from 'express';
import { createRide, getMyRides, getRides, cancelRide, getRideQuote, recordRidePayment, updateRideLocation } from '../controllers/rideController.js';
import protect from '../middleware/authMiddleware.js';

const router = express.Router();

router.post('/quote', getRideQuote);
router.use(protect);
router.get('/', getRides);
router.get('/my-rides', getMyRides);
router.post('/', createRide);
router.patch('/:id/location', updateRideLocation);
router.post('/:id/payment', recordRidePayment);
router.patch('/:id/cancel', cancelRide);

export default router;

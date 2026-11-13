import express from 'express';
import {
  acceptRide,
  generateDriverVideoKycToken,
  getAssignedRides,
  getAvailableRides,
  getDriverDocument,
  getDriverVerification,
  submitDriverVerification,
  updateRideStatus,
  uploadDriverVerificationDocument,
  upload,
} from '../controllers/rideController.js';
import protect from '../middleware/authMiddleware.js';
import authorize from '../middleware/roleMiddleware.js';

const router = express.Router();

router.use(protect);
router.get('/verification', authorize('driver'), getDriverVerification);
router.post('/verification/submit', authorize('driver'), submitDriverVerification);
router.post('/verification/upload', authorize('driver'), upload.single('file'), uploadDriverVerificationDocument);
router.get('/verification/files/:userId/:filename', getDriverDocument);
router.get('/verification/video-token', authorize('driver'), generateDriverVideoKycToken);
router.get('/rides/available', authorize('driver'), getAvailableRides);
router.get('/rides/assigned', authorize('driver'), getAssignedRides);
router.patch('/rides/:id/accept', authorize('driver'), acceptRide);
router.patch('/rides/:id/status', authorize('driver'), updateRideStatus);

export default router;

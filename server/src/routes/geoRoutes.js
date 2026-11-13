import express from 'express';
import { reverseGeocode, searchPlaces } from '../controllers/geoController.js';

const router = express.Router();

router.get('/search', searchPlaces);
router.get('/reverse', reverseGeocode);

export default router;

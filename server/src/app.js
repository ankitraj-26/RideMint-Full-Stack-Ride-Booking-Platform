import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/authRoutes.js';
import rideRoutes from './routes/rideRoutes.js';
import driverRoutes from './routes/driverRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import geoRoutes from './routes/geoRoutes.js';
import notificationRoutes from './routes/notificationRoutes.js';
import { notFoundMiddleware, errorMiddleware } from './middleware/errorMiddleware.js';

dotenv.config();

const app = express();

const parseAllowedOrigins = () => {
  const configured = (process.env.CLIENT_URL || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  const localOrigins = [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:5174',
    'http://127.0.0.1:5174',
    'http://localhost:5175',
    'http://127.0.0.1:5175',
    'http://localhost:5176',
    'http://127.0.0.1:5176',
    'http://localhost:5177',
    'http://127.0.0.1:5177',
  ];

  return [...new Set([...configured, ...localOrigins])].filter(Boolean);
};

const allowedOrigins = parseAllowedOrigins();

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) {
        callback(null, true);
        return;
      }

      if (allowedOrigins.includes(origin) || /^http:\/\/(localhost|127\.0\.0\.1):517[3-9]$/.test(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error('CORS policy restriction'));
    },
    credentials: true,
  })
);

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

app.get('/api/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'RideGo API is running',
    timestamp: new Date().toISOString(),
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/rides', rideRoutes);
app.use('/api/driver', driverRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/geo', geoRoutes);
app.use('/api/notifications', notificationRoutes);

app.use(notFoundMiddleware);
app.use(errorMiddleware);

export default app;

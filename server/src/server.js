import http from 'http';
import dotenv from 'dotenv';
import app from './app.js';
import connectDB from './config/db.js';
import ensureDefaultAdmin from './config/bootstrapAdmin.js';
import { findAvailablePort } from './utils/portFinder.js';
import { initializeSocket } from './utils/socket.js';

dotenv.config();

const startServer = async () => {
  try {
    if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
      throw new Error('Configure JWT_SECRET with at least 32 characters in server/.env.');
    }

    const preferredPort = Number(process.env.PORT) || 5000;
    const PORT = await findAvailablePort(preferredPort);
    process.env.PORT = String(PORT);

    await connectDB();
    await ensureDefaultAdmin();
    const httpServer = http.createServer(app);
    initializeSocket(httpServer);
    httpServer.listen(PORT, () => {
      console.log(`RideGo server running on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error.message);
    process.exit(1);
  }
};

startServer();

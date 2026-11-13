import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

const getMongoUris = () => {
  const configured = process.env.MONGO_URI && process.env.MONGO_URI.trim();
  const candidates = ['mongodb://127.0.0.1:27017/ridego', configured].filter(Boolean);

  return [...new Set(candidates)];
};

const connectDB = async () => {
  if (mongoose.connection.readyState === 1) {
    return;
  }

  const mongoUris = getMongoUris();
  let lastError;

  mongoose.set('strictQuery', true);

  for (const mongoUri of mongoUris) {
    try {
      await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 5000 });
      console.log(`MongoDB connected via ${mongoUri === 'mongodb://127.0.0.1:27017/ridego' ? 'local fallback' : 'configured URI'}`);
      return;
    } catch (error) {
      lastError = error;
      console.warn(`MongoDB connection failed for ${mongoUri}: ${error.message}`);
    }
  }

  try {
    const downloadDir = process.env.MONGOMS_DOWNLOAD_DIR || 'D:/Uber/server/.mongo-binaries';
    const memoryServer = await MongoMemoryServer.create({
      binary: {
        version: process.env.MONGOMS_VERSION || '7.0.14',
      },
      downloadDir,
    });

    const memoryUri = memoryServer.getUri();
    await mongoose.connect(memoryUri, { serverSelectionTimeoutMS: 20000 });
    console.log('MongoDB connected via in-memory fallback');
    return;
  } catch (memoryError) {
    console.error('MongoDB connection error:', lastError?.message || memoryError.message || 'No MongoDB connection available');
    console.error('In-memory fallback failed:', memoryError.message);
    throw memoryError || lastError || new Error('MongoDB connection failed for all configured endpoints.');
  }
};

export default connectDB;

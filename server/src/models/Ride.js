import mongoose from 'mongoose';

const rideSchema = new mongoose.Schema(
  {
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    driver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    pickup: {
      address: { type: String, required: true, trim: true },
      latitude: { type: Number, required: true },
      longitude: { type: Number, required: true },
    },
    dropoff: {
      address: { type: String, required: true, trim: true },
      latitude: { type: Number, required: true },
      longitude: { type: Number, required: true },
    },
    riderLocation: {
      latitude: { type: Number, min: -90, max: 90 },
      longitude: { type: Number, min: -180, max: 180 },
      accuracy: { type: Number, min: 0 },
      updatedAt: { type: Date },
    },
    driverLocation: {
      latitude: { type: Number, min: -90, max: 90 },
      longitude: { type: Number, min: -180, max: 180 },
      accuracy: { type: Number, min: 0 },
      updatedAt: { type: Date },
    },
    cabType: {
      type: String,
      enum: ['Mini', 'Sedan', 'SUV'],
      required: true,
    },
    distanceKm: {
      type: Number,
      required: true,
      min: 0,
    },
    fare: {
      type: Number,
      required: true,
      min: 0,
    },
    weatherSnapshot: {
      condition: { type: String, default: 'Weather unavailable' },
      multiplier: { type: Number, default: 1, min: 1 },
      temperatureC: { type: Number, default: null },
      precipitationProbability: { type: Number, default: null },
      fetchedAt: { type: Date, default: Date.now },
    },
    payment: {
      status: { type: String, enum: ['unpaid', 'paid'], default: 'unpaid' },
      method: { type: String, enum: ['cash', 'upi', 'card'], default: null },
      paidAt: { type: Date, default: null },
    },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'in_progress', 'completed', 'cancelled'],
      default: 'pending',
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

rideSchema.index({ customer: 1, createdAt: -1 });
rideSchema.index({ driver: 1, status: 1 });

const Ride = mongoose.model('Ride', rideSchema);

export default Ride;

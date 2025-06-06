import mongoose from 'mongoose';

const settingsSchema = new mongoose.Schema({
  userId: {
    type: Number,
    required: true,
    unique: true
  },
  solBuyAmount: {
    type: Number,
    required: true,
    default: 0.1
  },
  usdtBuyAmount: {
    type: Number,
    required: true,
    default: 1
  },
  currency: {
    type: String,
    enum: ['SOL', 'USDT'],
    default: 'SOL'
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Update the updatedAt timestamp before saving
settingsSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

export const Settings = mongoose.model('Settings', settingsSchema); 
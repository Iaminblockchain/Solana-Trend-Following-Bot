import mongoose from 'mongoose';

const priceHistorySchema = new mongoose.Schema({
  tokenMint: { type: String, required: true },
  priceInSOL: { type: Number, required: true },
  priceInUSD: { type: Number, required: true },
  createdAt: { type: Date, default: Date.now }
});

// Index for efficient querying
priceHistorySchema.index({ tokenMint: 1, createdAt: -1 });

export const PriceHistory = mongoose.model('PriceHistory', priceHistorySchema); 
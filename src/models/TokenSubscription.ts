import mongoose from 'mongoose';

const tokenSubscriptionSchema = new mongoose.Schema({
  userId: { 
    type: Number, 
    required: true 
  },
  tokenMint: { 
    type: String, 
    required: true 
  },
  autoBuy: {
    type: Boolean,
    default: false
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  }
});

// Compound index for efficient querying
tokenSubscriptionSchema.index({ userId: 1, tokenMint: 1 }, { unique: true });

export const TokenSubscription = mongoose.model('TokenSubscription', tokenSubscriptionSchema); 
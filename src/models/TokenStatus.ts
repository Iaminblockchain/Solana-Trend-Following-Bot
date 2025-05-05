import mongoose from 'mongoose';

const tokenStatusSchema = new mongoose.Schema({
  tokenMint: { 
    type: String, 
    required: true, 
    unique: true,
    index: true  // This creates an index
  },
  trend: { 
    type: String, 
    enum: ['Bullish', 'Bearish', 'None'],
    default: 'None'
  },
  buyEnable: { 
    type: Boolean, 
    default: false 
  },
  updatedAt: { 
    type: Date, 
    default: Date.now 
  }
});

// Remove the duplicate index definition
// tokenStatusSchema.index({ tokenMint: 1 });

export const TokenStatus = mongoose.model('TokenStatus', tokenStatusSchema); 
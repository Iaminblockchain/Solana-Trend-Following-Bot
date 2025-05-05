import mongoose from 'mongoose';

const tokenSchema = new mongoose.Schema({
  mintAddress: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  ticker: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

export const Token = mongoose.model('Token', tokenSchema); 
import mongoose from 'mongoose';

const whitelistSchema = new mongoose.Schema({
  userId: { 
    type: Number, 
    required: true, 
    unique: true 
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  }
});

export const Whitelist = mongoose.model('Whitelist', whitelistSchema); 
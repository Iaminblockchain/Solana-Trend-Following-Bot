import mongoose from 'mongoose';

const walletSchema = new mongoose.Schema({
  userId: {
    type: Number,
    required: true,
    unique: true
  },
  publicKey: {
    type: String,
    required: true
  },
  privateKey: {
    type: String,
    required: true
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
walletSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

export const Wallet = mongoose.model('Wallet', walletSchema);

export const getWalletByChatId = async (chatId: number) => {
  return await Wallet.findOne({ userId: chatId });
}; 
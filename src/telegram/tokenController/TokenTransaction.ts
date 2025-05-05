import { Connection, PublicKey } from '@solana/web3.js';
import { jupiter_swap } from '../../utils/jupiter';
import { WSOL_ADDRESS } from '../../utils/constants';
import { getWalletByChatId } from '../../models/Wallet';
import { getAllTokensWithBalance } from '../../utils/token';

export class TokenTransaction {
  private connection: Connection;

  constructor(connection: Connection) {
    this.connection = connection;
  }

  async buyToken(chatId: number, tokenMint: string, solAmount: number, useJito: boolean = true) {
    try {
      // Get user's wallet
      const wallet = await getWalletByChatId(chatId);
      if (!wallet) {
        throw new Error('Wallet not found');
      }

      // Convert SOL amount to lamports
      const amountInLamports = Math.floor(solAmount * 1e9);

      // Execute swap from SOL to token
      const result = await jupiter_swap(
        this.connection,
        wallet.privateKey,
        WSOL_ADDRESS,
        tokenMint,
        amountInLamports,
        'ExactIn',
        useJito
      );

      return result;
    } catch (error) {
      console.error('Error buying token:', error);
      throw error;
    }
  }

  async sellToken(chatId: number, tokenMint: string, useJito: boolean = true) {
    try {
      // Get user's wallet
      const wallet = await getWalletByChatId(chatId);
      if (!wallet) {
        throw new Error('Wallet not found');
      }

      // Get token balance
      const tokens = await getAllTokensWithBalance(
        this.connection,
        new PublicKey(wallet.publicKey)
      );

      const token = tokens.find(t => t.address === tokenMint);
      if (!token) {
        throw new Error('Token not found in wallet');
      }

      // Convert token amount to raw amount
      const amount = Math.floor(token.balance * Math.pow(10, token.decimals));

      // Execute swap from token to SOL
      const result = await jupiter_swap(
        this.connection,
        wallet.privateKey,
        tokenMint,
        WSOL_ADDRESS,
        amount,
        'ExactIn',
        useJito
      );

      return result;
    } catch (error) {
      console.error('Error selling token:', error);
      throw error;
    }
  }
} 
import { Connection, PublicKey } from '@solana/web3.js';
import { jupiter_swap } from '../../utils/jupiter';
import { WSOL_ADDRESS, USDT_MINT } from '../../utils/constants';
import { getWalletByChatId } from '../../models/Wallet';
import { getAllTokensWithBalance } from '../../utils/token';

interface TransactionResult {
  confirmed: boolean;
  txSignature: string | null;
  tokenAmount: number;
  txLink?: string;
  error?: string;
}

export class TokenTransaction {
  private connection: Connection;

  constructor(connection: Connection) {
    this.connection = connection;
  }

  async buyToken(chatId: number, tokenMint: string, amount: number, useJito: boolean = true, currencyMint?: string): Promise<TransactionResult> {
    try {
      // Get user's wallet
      const wallet = await getWalletByChatId(chatId);
      if (!wallet) {
        return { confirmed: false, txSignature: null, tokenAmount: 0, error: 'Wallet not found' };
      }

      // Use specified currency or default to SOL
      const inputMint = currencyMint || WSOL_ADDRESS;
      
      // Convert amount to raw amount (lamports for SOL, 6 decimals for USDT)
      const decimals = inputMint === WSOL_ADDRESS ? 9 : 6;
      const rawAmount = Math.floor(amount * Math.pow(10, decimals));

      // Execute swap from currency to token
      const result = await jupiter_swap(
        this.connection,
        wallet.privateKey,
        inputMint,
        tokenMint,
        rawAmount,
        'ExactIn',
        useJito
      );

      return result;
    } catch (error: any) {
      console.error('Error buying token:', error);
      return { 
        confirmed: false, 
        txSignature: null, 
        tokenAmount: 0, 
        error: error?.message || 'Failed to execute buy transaction' 
      };
    }
  }

  async sellToken(chatId: number, tokenMint: string, useJito: boolean = true, currencyMint?: string): Promise<TransactionResult> {
    try {
      // Get user's wallet
      const wallet = await getWalletByChatId(chatId);
      if (!wallet) {
        return { confirmed: false, txSignature: null, tokenAmount: 0, error: 'Wallet not found' };
      }

      // Get token balance
      const tokens = await getAllTokensWithBalance(
        this.connection,
        new PublicKey(wallet.publicKey)
      );

      const token = tokens.find(t => t.address === tokenMint);
      if (!token) {
        return { confirmed: false, txSignature: null, tokenAmount: 0, error: 'Token not found in wallet' };
      }

      // Convert token amount to raw amount
      const amount = Math.floor(token.balance * Math.pow(10, token.decimals));

      // Use specified currency or default to SOL
      const outputMint = currencyMint || WSOL_ADDRESS;

      // Execute swap from token to currency
      const result = await jupiter_swap(
        this.connection,
        wallet.privateKey,
        tokenMint,
        outputMint,
        amount,
        'ExactIn',
        useJito
      );

      return result;
    } catch (error: any) {
      console.error('Error selling token:', error);
      return { 
        confirmed: false, 
        txSignature: null, 
        tokenAmount: 0, 
        error: error?.message || 'Failed to execute sell transaction' 
      };
    }
  }
} 
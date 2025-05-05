import TelegramBot from 'node-telegram-bot-api';
import { Wallet } from '../../models/Wallet';
import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import { config } from '../../config/config';
import bs58 from 'bs58';

export class WalletController {
  private bot: TelegramBot;
  private connection: Connection;
  private userStates: Map<number, { action: string }> = new Map();

  constructor(bot: TelegramBot) {
    this.bot = bot;
    this.connection = new Connection(config.solanaRpcUrl);
    this.setupHandlers();
  }

  private setupHandlers() {
    this.bot.on('message', async (msg) => {
      const chatId = msg.chat.id;
      const userId = msg.from?.id;
      const text = msg.text;

      if (!userId || !text) return;

      const userState = this.userStates.get(userId);
      if (userState) {
        if (userState.action === 'add_wallet' || userState.action === 'update_wallet') {
          await this.handlePrivateKeyInput(userId, chatId, text);
        }
        this.userStates.delete(userId);
      }
    });
  }

  private async handlePrivateKeyInput(userId: number, chatId: number, privateKey: string) {
    try {
      const userState = this.userStates.get(userId);
      if (!userState) return;

      // Convert base58 private key to Uint8Array
      const secretKey = bs58.decode(privateKey);
      const keypair = Keypair.fromSecretKey(secretKey);
      const publicKey = keypair.publicKey.toString();

      // Get SOL balance
      const balance = await this.connection.getBalance(keypair.publicKey);
      const solBalance = balance / 1e9; // Convert lamports to SOL

      // Save or update wallet
      await Wallet.findOneAndUpdate(
        { userId },
        {
          userId,
          publicKey,
          privateKey: privateKey,
          updatedAt: new Date()
        },
        { upsert: true }
      );

      await this.bot.sendMessage(
        chatId,
        `✅ Wallet ${userState.action === 'add_wallet' ? 'added' : 'updated'} successfully!`
      );

      // Show updated wallet menu
      await this.showWalletMenu(chatId, userId);
    } catch (error) {
      console.error('Error handling private key:', error);
      await this.bot.sendMessage(
        chatId,
        '❌ Invalid private key. Please make sure you entered a valid Solana private key in base58 format.'
      );
    }
  }

  public async showWalletMenu(chatId: number, userId: number) {
    try {
      const wallet = await Wallet.findOne({ userId });
      
      if (!wallet) {
        await this.bot.sendMessage(
          chatId,
          '👛 Wallet Management\n\n' +
          'Connect your Solana wallet to enable trading features and manage your funds.\n\n' +
          'You can:\n' +
          '• Add a new wallet using your private key\n' +
          '• View your wallet balance and transactions\n' +
          '• Manage your trading positions\n\n' +
          'No wallet connected. Please add a wallet to manage your funds.',
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: '➕ Add Wallet', callback_data: 'add_wallet' }],
                [{ text: '🔙 Back', callback_data: 'back' }]
              ]
            }
          }
        );
        return;
      }

      // Get SOL balance
      const publicKey = new PublicKey(wallet.publicKey);
      const balance = await this.connection.getBalance(publicKey);
      const solBalance = balance / 1e9; // Convert lamports to SOL

      await this.bot.sendMessage(
        chatId,
        `👛 Wallet Management\n\n` +
        `Your connected Solana wallet allows you to:\n` +
        `• View real-time balance and transactions\n` +
        `• Execute trades and manage positions\n` +
        `• Monitor your portfolio performance\n\n` +
        `Current Wallet Information:\n` +
        `Public Key: \`${wallet.publicKey}\`\n` +
        `SOL Balance: ${solBalance.toFixed(4)} SOL\n\n` +
        `Last Updated: ${wallet.updatedAt.toLocaleString()}`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔄 Update Wallet', callback_data: 'update_wallet' }],
              [{ text: '🗑️ Remove Wallet', callback_data: 'remove_wallet' }],
              [{ text: '🔙 Back', callback_data: 'back' }]
            ]
          }
        }
      );
    } catch (error) {
      console.error('Error showing wallet menu:', error);
      await this.bot.sendMessage(chatId, '❌ Error fetching wallet information. Please try again.');
    }
  }

  public async handleCallback(callbackQuery: TelegramBot.CallbackQuery) {
    const chatId = callbackQuery.message?.chat.id;
    const userId = callbackQuery.from?.id;
    const data = callbackQuery.data;

    if (!chatId || !userId || !data) return;

    switch (data) {
      case 'add_wallet':
        this.userStates.set(userId, { action: 'add_wallet' });
        await this.bot.sendMessage(
          chatId,
          'Please enter your wallet private key:'
        );
        break;
      case 'update_wallet':
        this.userStates.set(userId, { action: 'update_wallet' });
        await this.bot.sendMessage(
          chatId,
          'Please enter your new wallet private key:'
        );
        break;
      case 'remove_wallet':
        await this.removeWallet(chatId, userId);
        break;
    }
  }

  private async removeWallet(chatId: number, userId: number) {
    try {
      await Wallet.deleteOne({ userId });
      await this.bot.sendMessage(
        chatId,
        '✅ Wallet removed successfully!'
      );
      // Show wallet menu after removal
      await this.showWalletMenu(chatId, userId);
    } catch (error) {
      console.error('Error removing wallet:', error);
      await this.bot.sendMessage(chatId, '❌ Error removing wallet. Please try again.');
    }
  }
} 
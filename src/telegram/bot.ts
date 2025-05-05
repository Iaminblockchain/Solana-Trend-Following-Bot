import TelegramBot from 'node-telegram-bot-api';
import mongoose from 'mongoose';
import { config } from '../config/config';
import { TokenController } from './tokenController/TokenController';
import { WalletController } from './walletController/WalletController';
import { Whitelist } from '../models/Whitelist';
import { SettingsController } from './settingsController/SettingsController';

class TelegramBotHandler {
  private bot: TelegramBot;
  private tokenController: TokenController;
  private walletController: WalletController;
  private settingsController: SettingsController;

  constructor() {
    this.bot = new TelegramBot(config.telegramBotToken, { polling: true });
    this.tokenController = new TokenController(this.bot);
    this.walletController = new WalletController(this.bot);
    this.settingsController = new SettingsController(this.bot);
    this.connectToMongoDB();
    this.setupCommands();
    this.setupHandlers();
    this.initializeWhitelist();
  }

  private async initializeWhitelist() {
    try {
      // Add the initial whitelisted user if not exists
      await Whitelist.findOneAndUpdate(
        { userId: 6765834362 },
        { userId: 6765834362 },
        { upsert: true }
      );
      console.log('Whitelist initialized');
    } catch (error) {
      console.error('Error initializing whitelist:', error);
    }
  }

  private async isUserWhitelisted(userId: number): Promise<boolean> {
    try {
      const whitelisted = await Whitelist.findOne({ userId });
      return !!whitelisted;
    } catch (error) {
      console.error('Error checking whitelist:', error);
      return false;
    }
  }

  private async connectToMongoDB() {
    try {
      await mongoose.connect(config.mongodbUrl);
      console.log('Connected to MongoDB');
    } catch (error) {
      console.error('MongoDB connection error:', error);
    }
  }

  private async setupCommands() {
    await this.bot.setMyCommands([
      { command: 'start', description: 'Start the bot' }
    ]);
  }

  private setupHandlers() {
    // Handle /start command
    this.bot.onText(/\/start/, async (msg) => {
      const chatId = msg.chat.id;
      const userId = msg.from?.id;

      if (!userId || !(await this.isUserWhitelisted(userId))) {
        await this.bot.sendMessage(chatId, '⛔ You are not authorized to use this bot.');
        return;
      }

      this.bot.sendMessage(
        chatId,
        '🌟 Welcome to the Trend Following Bot! 🌟\n\n' +
        'I am your automated trading assistant that helps you follow market trends and make informed trading decisions.\n\n' +
        'I can help you with:\n' +
        '• Market trend analysis\n' +
        '• Trading signals and alerts\n' +
        '• Portfolio tracking\n' +
        '• Risk management suggestions\n\n',
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '📊 Tokens', callback_data: 'tokens' }],
              [{ text: '👛 Wallet', callback_data: 'wallet' }],
              [{ text: '📈 History', callback_data: 'history' }],
              [{ text: '⚙️ Settings', callback_data: 'settings' }]
            ]
          }
        }
      );
    });

    // Handle callback queries
    this.bot.on('callback_query', async (query) => {
      const chatId = query.message?.chat.id;
      const userId = query.from?.id;
      const data = query.data;

      if (!chatId || !userId || !data) return;

      switch (data) {
        case 'tokens':
          await this.tokenController.showTokens(chatId);
          break;
        case 'wallet':
          await this.walletController.showWalletMenu(chatId, userId);
          break;
        case 'history':
          await this.showHistory(chatId);
          break;
        case 'back':
          await this.showMainMenu(chatId);
          break;
        case 'settings':
          await this.settingsController.showSettingsMenu(chatId, userId);
          break;
        case 'set_buy_amount':
        case 'change_currency':
        case 'currency_SOL':
        case 'set_amount_SOL':
          await this.settingsController.handleCallback(query);
          break;
        default:
          if (data?.startsWith('token_')) {
            const mintAddress = data.replace('token_', '');
            await this.tokenController.showTokenDetails(chatId, mintAddress);
          } else if (data?.startsWith('trend_') || 
                    data?.startsWith('subscribe_') || 
                    data?.startsWith('unsubscribe_') ||
                    data?.startsWith('enable_autobuy_') ||
                    data?.startsWith('disable_autobuy_') ||
                    data?.startsWith('buy_') ||
                    data?.startsWith('sell_')) {
            await this.tokenController.handleCallback(query);
          } else if (data?.startsWith('add_wallet') ||
                    data?.startsWith('update_wallet') ||
                    data?.startsWith('remove_wallet')) {
            await this.walletController.handleCallback(query);
          }
      }
    });

    // Handle any other message
    this.bot.on('message', async (msg) => {
      const chatId = msg.chat.id;
      const userId = msg.from?.id;

      if (!userId || !(await this.isUserWhitelisted(userId))) {
        await this.bot.sendMessage(chatId, '⛔ You are not authorized to use this bot.');
        return;
      }

      if (!msg.text?.startsWith('/')) {
        await this.tokenController.handleMessage(msg);
      }
    });
  }

  private async showMainMenu(chatId: number) {
    await this.bot.sendMessage(
      chatId,
      'Welcome to the Trend Following Bot!\n\n' +
      'Please select an option from the menu below to get started with your trading journey.',
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '📊 Tokens', callback_data: 'tokens' }],
            [{ text: '👛 Wallet', callback_data: 'wallet' }],
            [{ text: '📈 History', callback_data: 'history' }],
            [{ text: '⚙️ Settings', callback_data: 'settings' }]
          ]
        }
      }
    );
  }

  private async showHistory(chatId: number) {
    await this.bot.sendMessage(
      chatId,
      '📈 History feature coming soon!',
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔙 Back', callback_data: 'back' }]
          ]
        }
      }
    );
  }

  public sendMessage(chatId: number, message: string) {
    return this.bot.sendMessage(chatId, message);
  }
}

// Export a single instance
export const telegramBot = new TelegramBotHandler(); 
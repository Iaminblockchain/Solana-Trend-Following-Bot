import TelegramBot from 'node-telegram-bot-api';
import { Settings } from '../../models/Settings';

export class SettingsController {
  private bot: TelegramBot;
  private userStates: Map<number, { action: string }> = new Map();

  constructor(bot: TelegramBot) {
    this.bot = bot;
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
        if (userState.action === 'set_buy_amount') {
          await this.handleBuyAmountInput(userId, chatId, text);
        }
        this.userStates.delete(userId);
      }
    });
  }

  private async handleBuyAmountInput(userId: number, chatId: number, amount: string) {
    try {
      const buyAmount = parseFloat(amount);
      
      if (isNaN(buyAmount) || buyAmount <= 0) {
        await this.bot.sendMessage(
          chatId,
          '❌ Please enter a valid positive number for the buy amount.'
        );
        return;
      }

      // Save or update settings
      await Settings.findOneAndUpdate(
        { userId },
        {
          userId,
          buyAmount,
          updatedAt: new Date()
        },
        { upsert: true }
      );

      await this.bot.sendMessage(
        chatId,
        `✅ Buy amount updated successfully to ${buyAmount} SOL!`
      );

      // Show updated settings menu
      await this.showSettingsMenu(chatId, userId);
    } catch (error) {
      console.error('Error handling buy amount:', error);
      await this.bot.sendMessage(
        chatId,
        '❌ Error updating buy amount. Please try again.'
      );
    }
  }

  public async showSettingsMenu(chatId: number, userId: number) {
    try {
      const settings = await Settings.findOne({ userId });
      const buyAmount = settings?.buyAmount || 0.1;

      await this.bot.sendMessage(
        chatId,
        '⚙️ Settings\n\n' +
        'Configure your trading parameters and preferences.\n\n' +
        'Current Settings:\n' +
        `• Buy Amount: ${buyAmount} SOL\n\n` +
        'Last Updated: ' + (settings?.updatedAt || new Date()).toLocaleString(),
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '💰 Set Buy Amount', callback_data: 'set_buy_amount' }],
              [{ text: '🔙 Back', callback_data: 'back' }]
            ]
          }
        }
      );
    } catch (error) {
      console.error('Error showing settings menu:', error);
      await this.bot.sendMessage(chatId, '❌ Error fetching settings. Please try again.');
    }
  }

  public async handleCallback(callbackQuery: TelegramBot.CallbackQuery) {
    const chatId = callbackQuery.message?.chat.id;
    const userId = callbackQuery.from?.id;
    const data = callbackQuery.data;

    if (!chatId || !userId || !data) return;

    switch (data) {
      case 'set_buy_amount':
        this.userStates.set(userId, { action: 'set_buy_amount' });
        await this.bot.sendMessage(
          chatId,
          'Please enter the buy amount in SOL (e.g., 0.1):'
        );
        break;
    }
  }
} 
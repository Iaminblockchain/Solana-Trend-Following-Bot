import TelegramBot from 'node-telegram-bot-api';
import { Settings } from '../../models/Settings';

export class SettingsController {
  private bot: TelegramBot;
  private userStates: Map<number, { action: string, currency?: string }> = new Map();

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
      const userState = this.userStates.get(userId);
      const currency = userState?.currency || 'SOL';
      
      if (isNaN(buyAmount) || buyAmount <= 0) {
        await this.bot.sendMessage(
          chatId,
          `❌ Please enter a valid positive number for the buy amount in ${currency}.`
        );
        return;
      }

      // Save or update settings with the appropriate amount field
      const updateData: any = {
        userId,
        updatedAt: new Date()
      };
      
      if (currency === 'SOL') {
        updateData.solBuyAmount = buyAmount;
      } else {
        updateData.usdtBuyAmount = buyAmount;
      }

      await Settings.findOneAndUpdate(
        { userId },
        updateData,
        { upsert: true }
      );

      await this.bot.sendMessage(
        chatId,
        `✅ Buy amount updated successfully to ${buyAmount} ${currency}!`
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
      const currency = settings?.currency || 'SOL';
      const buyAmount = currency === 'SOL' ? settings?.solBuyAmount || 0.1 : settings?.usdtBuyAmount || 1;

      await this.bot.sendMessage(
        chatId,
        '⚙️ Settings\n\n' +
        'Configure your trading parameters and preferences.\n\n' +
        'Current Settings:\n' +
        `• Buy Amount: ${buyAmount} ${currency}\n` +
        `• Currency: ${currency}\n\n` +
        'Last Updated: ' + (settings?.updatedAt || new Date()).toLocaleString(),
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '💰 Set Buy Amount', callback_data: 'set_buy_amount' }],
              [{ text: '💱 Change Currency', callback_data: 'change_currency' }],
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
        await this.showBuyAmountCurrencySelection(chatId, userId);
        break;
      case 'change_currency':
        await this.showCurrencySelection(chatId, userId);
        break;
      case 'currency_SOL':
        await this.handleCurrencySelection(userId, chatId, 'SOL');
        break;
      case 'currency_USDT':
        await this.handleCurrencySelection(userId, chatId, 'USDT');
        break;
      case 'set_amount_SOL':
        this.userStates.set(userId, { action: 'set_buy_amount', currency: 'SOL' });
        await this.bot.sendMessage(chatId, 'Please enter the buy amount in SOL:');
        break;
      case 'set_amount_USDT':
        this.userStates.set(userId, { action: 'set_buy_amount', currency: 'USDT' });
        await this.bot.sendMessage(chatId, 'Please enter the buy amount in USDT:');
        break;
    }
  }

  private async showBuyAmountCurrencySelection(chatId: number, userId: number) {
    await this.bot.sendMessage(
      chatId,
      'Select currency to set buy amount:',
      {
        reply_markup: {
          inline_keyboard: [
            [
              { text: 'SOL', callback_data: 'set_amount_SOL' },
              { text: 'USDT', callback_data: 'set_amount_USDT' }
            ],
            [{ text: '🔙 Back', callback_data: 'settings' }]
          ]
        }
      }
    );
  }

  private async showCurrencySelection(chatId: number, userId: number) {
    const settings = await Settings.findOne({ userId });
    const currentCurrency = settings?.currency || 'SOL';

    await this.bot.sendMessage(
      chatId,
      `Select your preferred trading currency:\nCurrent: ${currentCurrency}`,
      {
        reply_markup: {
          inline_keyboard: [
            [
              { text: 'SOL', callback_data: 'currency_SOL' },
              { text: 'USDT', callback_data: 'currency_USDT' }
            ],
            [{ text: '🔙 Back', callback_data: 'settings' }]
          ]
        }
      }
    );
  }

  private async handleCurrencySelection(userId: number, chatId: number, currency: string) {
    try {
      await Settings.findOneAndUpdate(
        { userId },
        {
          userId,
          currency,
          updatedAt: new Date()
        },
        { upsert: true }
      );

      await this.bot.sendMessage(
        chatId,
        `✅ Currency updated successfully to ${currency}!`
      );

      // Show updated settings menu
      await this.showSettingsMenu(chatId, userId);
    } catch (error) {
      console.error('Error updating currency:', error);
      await this.bot.sendMessage(
        chatId,
        '❌ Error updating currency. Please try again.'
      );
    }
  }
} 
import TelegramBot from 'node-telegram-bot-api';
import { Token } from '../../models/Token';
import { TokenStatus } from '../../models/TokenStatus';
import { TokenSubscription } from '../../models/TokenSubscription';
import { calculateIndicators } from './indicators';

export class TokenController {
  private bot: TelegramBot;
  private trackingIntervals: Map<string, NodeJS.Timeout> = new Map();

  constructor(bot: TelegramBot) {
    this.bot = bot;
    this.startTrackingAllTokens();
  }

  private async startTrackingAllTokens() {
    try {
      const tokens = await Token.find();
      for (const token of tokens) {
        this.startTracking(token.mintAddress);
      }
    } catch (error) {
      console.error('Error starting token tracking:', error);
    }
  }

  private startTracking(mintAddress: string) {
    if (this.trackingIntervals.has(mintAddress)) {
      return; // Already tracking
    }

    const interval = setInterval(async () => {
      try {
        // Get current status before calculating new indicators
        const currentStatus = await TokenStatus.findOne({ tokenMint: mintAddress });
        const oldTrend = currentStatus?.trend;

        // Calculate new indicators and update status
        const indicators = await calculateIndicators(mintAddress);
        
        // Get updated status
        const newStatus = await TokenStatus.findOne({ tokenMint: mintAddress });
        const token = await Token.findOne({ mintAddress });
        
        // Only send message if trend has changed
        if (newStatus && token && oldTrend !== newStatus.trend) {
          const message = 
            `${newStatus.trend === 'Bullish' ? '🟢 Buy Signal' : '🔴 Sell Signal'} for ${token.name} (${token.ticker})\n` +
            `Mint Address: ${token.mintAddress}\n\n` +
            `📈 Current Indicators:\n` +
            `• SMA (9): ${indicators.sma1.toFixed(10)}\n` +
            `• SMA (20): ${indicators.sma2.toFixed(10)}\n` +
            `• EMA (9): ${indicators.ema1.toFixed(10)}\n` +
            `• EMA (20): ${indicators.ema2.toFixed(10)}\n` +
            `• RSI: ${indicators.rsi.toFixed(2)}\n\n` +
            `💡 Analysis:\n` +
            `• Short-term (9) vs Long-term (20) moving averages show the current trend\n` +
            `• RSI indicates if the token is overbought (>70) or oversold (<30)\n\n` +
            `Updated: ${newStatus.updatedAt.toLocaleString()}`;

          // Get all subscribers for this token
          const subscriptions = await TokenSubscription.find({ tokenMint: mintAddress });
          for (const subscription of subscriptions) {
            try {
              await this.bot.sendMessage(subscription.userId, message);
            } catch (error) {
              console.error(`Error sending message to user ${subscription.userId}:`, error);
            }
          }
        }
      } catch (error) {
        console.error('Error calculating indicators:', error);
      }
    }, 60000); // Every minute

    this.trackingIntervals.set(mintAddress, interval);
  }

  private async updateTokenStatus(mintAddress: string, indicators: any): Promise<boolean> {
    const status = await TokenStatus.findOne({ tokenMint: mintAddress });
    return !!status; // Return true if status exists (indicating a change occurred)
  }

  private async sendTrendMessage(chatId: number, mintAddress: string) {
    const status = await TokenStatus.findOne({ tokenMint: mintAddress });
    const token = await Token.findOne({ mintAddress });

    if (!status || !token) return;

    // Get current indicators
    const indicators = await calculateIndicators(mintAddress);

    const message = 
      `📊 Current Trend for ${token.name} (${token.ticker}):\n\n` +
      `Trend: ${status.trend}\n` +
      `Last Updated: ${status.updatedAt.toLocaleString()}\n\n` +
      `📈 Current Indicators:\n` +
      `• SMA (9): ${indicators.sma1.toFixed(10)}\n` +
      `• SMA (20): ${indicators.sma2.toFixed(10)}\n` +
      `• EMA (9): ${indicators.ema1.toFixed(10)}\n` +
      `• EMA (20): ${indicators.ema2.toFixed(10)}\n` +
      `• RSI: ${indicators.rsi.toFixed(2)}\n\n` +
      `💡 Analysis:\n` +
      `• Short-term (9) vs Long-term (20) moving averages show the current trend\n` +
      `• RSI indicates if the token is overbought (>70) or oversold (<30)`;

    await this.bot.sendMessage(chatId, message);
  }

  public async showTokens(chatId: number) {
    try {
      const tokens = await Token.find().sort({ createdAt: -1 });
      
      if (tokens.length === 0) {
        await this.bot.sendMessage(
          chatId,
          'No tokens found.',
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: '🔙 Back', callback_data: 'back' }]
              ]
            }
          }
        );
        return;
      }

      const buttons = tokens.map(token => [
        { 
          text: `${token.name} (${token.ticker})`, 
          callback_data: `token_${token.mintAddress}` 
        }
      ]);

      buttons.push([{ text: '🔙 Back', callback_data: 'back' }]);

      await this.bot.sendMessage(
        chatId,
        '📊 Available Tokens:\nSelect a token to view details:',
        {
          reply_markup: {
            inline_keyboard: buttons
          }
        }
      );
    } catch (error) {
      console.error('Error fetching tokens:', error);
      await this.bot.sendMessage(chatId, 'Error fetching tokens. Please try again later.');
    }
  }

  public async showTokenDetails(chatId: number, mintAddress: string) {
    try {
      const token = await Token.findOne({ mintAddress });
      const userId = chatId; // In Telegram, chatId is the same as userId for private chats
      
      if (!token) {
        await this.bot.sendMessage(chatId, 'Token not found.');
        return;
      }

      // Check if user is subscribed
      const subscription = await TokenSubscription.findOne({ userId, tokenMint: mintAddress });
      const subscriptionButton = subscription 
        ? [{ text: '🔕 Unsubscribe from Alerts', callback_data: `unsubscribe_${mintAddress}` }]
        : [{ text: '🔔 Subscribe to Alerts', callback_data: `subscribe_${mintAddress}` }];

      const message = 
        `🔍 Token Details:\n\n` +
        `Name: ${token.name}\n` +
        `Ticker: ${token.ticker}\n` +
        `Mint Address: ${token.mintAddress}\n` +
        `Created: ${token.createdAt.toLocaleDateString()}\n\n` +
        `Alert Status: ${subscription ? '🔔 Subscribed' : '🔕 Not Subscribed'}`;

      await this.bot.sendMessage(
        chatId,
        message,
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '📈 Current Trend', callback_data: `trend_${mintAddress}` }],
              subscriptionButton,
              [{ text: '🔙 Back to Tokens', callback_data: 'tokens' }],
              [{ text: '🔙 Back to Main Menu', callback_data: 'back' }]
            ]
          }
        }
      );
    } catch (error) {
      console.error('Error fetching token details:', error);
      await this.bot.sendMessage(chatId, 'Error fetching token details. Please try again later.');
    }
  }

  public async handleCallback(callbackQuery: TelegramBot.CallbackQuery) {
    const chatId = callbackQuery.message?.chat.id;
    const userId = callbackQuery.from?.id;
    if (!chatId || !userId) {
      console.log('Missing chatId or userId:', { chatId, userId });
      return;
    }

    const data = callbackQuery.data;
    if (!data) {
      console.log('No callback data received');
      return;
    }

    console.log('Handling callback:', { data, userId, chatId });

    if (data.startsWith('trend_')) {
      const mintAddress = data.replace('trend_', '');
      await this.sendTrendMessage(chatId, mintAddress);
    } else if (data.startsWith('subscribe_')) {
      const mintAddress = data.replace('subscribe_', '');
      const success = await this.subscribeToToken(userId, mintAddress);
      if (success) {
        await this.bot.sendMessage(chatId, '✅ Successfully subscribed to token alerts!');
        // Refresh token details to show updated subscription status
        await this.showTokenDetails(chatId, mintAddress);
      } else {
        await this.bot.sendMessage(chatId, '❌ Failed to subscribe to token alerts. Please try again.');
      }
    } else if (data.startsWith('unsubscribe_')) {
      const mintAddress = data.replace('unsubscribe_', '');
      console.log('Unsubscribing from token:', { mintAddress, userId });
      const success = await this.unsubscribeFromToken(userId, mintAddress);
      console.log('Unsubscription result:', success);
      if (success) {
        await this.bot.sendMessage(chatId, '✅ Successfully unsubscribed from token alerts!');
        // Refresh token details to show updated subscription status
        await this.showTokenDetails(chatId, mintAddress);
      } else {
        await this.bot.sendMessage(chatId, '❌ Failed to unsubscribe from token alerts. Please try again.');
      }
    }
  }

  public async subscribeToToken(userId: number, mintAddress: string) {
    try {
      console.log('Creating subscription:', { userId, mintAddress });
      const result = await TokenSubscription.findOneAndUpdate(
        { userId, tokenMint: mintAddress },
        { userId, tokenMint: mintAddress },
        { upsert: true, new: true }
      );
      console.log('Subscription created:', result);
      return true;
    } catch (error) {
      console.error('Error subscribing to token:', error);
      return false;
    }
  }

  public async unsubscribeFromToken(userId: number, mintAddress: string) {
    try {
      await TokenSubscription.deleteOne({ userId, tokenMint: mintAddress });
      return true;
    } catch (error) {
      console.error('Error unsubscribing from token:', error);
      return false;
    }
  }
} 
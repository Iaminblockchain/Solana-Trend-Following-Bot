import TelegramBot from 'node-telegram-bot-api';
import { Token } from '../../models/Token';
import { TokenStatus } from '../../models/TokenStatus';
import { TokenSubscription } from '../../models/TokenSubscription';
import { calculateIndicators } from './indicators';
import { TokenTransaction } from './TokenTransaction';
import { Connection, PublicKey } from '@solana/web3.js';
// import { getWalletByChatId, getAllTokensWithBalance } from '../../utils/walletUtils';
import { SOLANA_CONNECTION } from '../../utils';
import { getWalletByChatId } from '../../models/Wallet';
import { getAllTokensWithBalance } from '../../utils/token';
import { Settings } from '../../models/Settings';
import { USDT_MINT } from '../../utils/constants';

export class TokenController {
  private bot: TelegramBot;
  private trackingIntervals: Map<string, NodeJS.Timeout> = new Map();
  private tokenTransaction: TokenTransaction;
  private userStates: Map<number, { action: string; tokenMint: string }>;

  constructor(bot: TelegramBot) {
    this.bot = bot;
    this.tokenTransaction = new TokenTransaction(new Connection(process.env.SOLANA_RPC_ENDPOINT || ''));
    this.userStates = new Map();
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
            // `💡 Analysis:\n` +
            // `• Short-term (9) vs Long-term (20) moving averages show the current trend\n` +
            // `• RSI indicates if the token is overbought (>70) or oversold (<30)\n\n` +
            `Updated: ${newStatus.updatedAt.toLocaleString()}`;

          // Get all subscribers for this token
          const subscriptions = await TokenSubscription.find({ tokenMint: mintAddress });
          for (const subscription of subscriptions) {
            try {
              // Send alert message
              await this.bot.sendMessage(subscription.userId, message);

              // Handle auto-buy/sell if enabled
              if (subscription.autoBuy) {
                const settings = await Settings.findOne({ userId: subscription.userId });
                const currency = settings?.currency || 'SOL';
                const buyAmount = currency === 'SOL' ? settings?.solBuyAmount || 0.1 : settings?.usdtBuyAmount || 1;

                if (newStatus.trend === 'Bullish') {
                  // Auto-buy on bullish signal
                  await this.bot.sendMessage(subscription.userId, `🔄 Executing auto-buy for ${token.name}...`);
                  const result = await this.tokenTransaction.buyToken(
                    subscription.userId, 
                    mintAddress, 
                    buyAmount,
                    true,
                    currency === 'USDT' ? USDT_MINT : undefined
                  );
                  if (result.confirmed) {
                    await this.bot.sendMessage(subscription.userId, 
                      `✅ Auto-buy executed successfully!\nTransaction: https://solscan.io/tx/${result.txSignature}`
                    );
                  } else {
                    await this.bot.sendMessage(subscription.userId, '❌ Auto-buy failed');
                  }
                } else if (newStatus.trend === 'Bearish') {
                  // Auto-sell on bearish signal
                  await this.bot.sendMessage(subscription.userId, `🔄 Executing auto-sell for ${token.name}...`);
                  const result = await this.tokenTransaction.sellToken(
                    subscription.userId, 
                    mintAddress,
                    true,
                    currency === 'USDT' ? USDT_MINT : undefined
                  );
                  if (result.confirmed) {
                    await this.bot.sendMessage(subscription.userId, 
                      `✅ Auto-sell executed successfully!\nTransaction: https://solscan.io/tx/${result.txSignature}`
                    );
                  } else {
                    await this.bot.sendMessage(subscription.userId, '❌ Auto-sell failed');
                  }
                }
              }
            } catch (error) {
              console.error(`Error processing subscription for user ${subscription.userId}:`, error);
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
        '📊 Available Tokens:\n\n' +
        'Select a token to view its detailed information, including:\n' +
        '• Current price and market data\n' +
        '• Trading signals and trends\n' +
        '• Subscription status for alerts\n' +
        '• Historical performance',
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
      if (!token) {
        await this.bot.sendMessage(chatId, 'Token not found');
        return;
      }

      const subscription = await TokenSubscription.findOne({
        userId: chatId,
        tokenMint: mintAddress
      });

      // Get wallet and token balance
      const wallet = await getWalletByChatId(chatId);
      let balance = '0';
      if (wallet) {
        const tokens = await getAllTokensWithBalance(
          SOLANA_CONNECTION,
          new PublicKey(wallet.publicKey)
        );
        const tokenInfo = tokens.find((t: any) => t.address === mintAddress);
        if (tokenInfo) {
          balance = tokenInfo.balance.toFixed(tokenInfo.decimals);
        }
      }

      const message = `Token Details:\n\n` +
        `Name: ${token.name}\n` +
        `Ticker: ${token.ticker}\n` +
        `Mint Address: ${mintAddress}\n` +
        `Your Balance: ${balance} ${token.ticker}\n` +
        `Subscription Status: ${subscription ? '✅ Subscribed' : '❌ Not Subscribed'}\n` +
        `Auto-buy: ${subscription?.autoBuy ? '✅ Enabled' : '❌ Disabled'}`;

      const keyboard = [
        [
          { text: subscription ? '❌ Unsubscribe' : '✅ Subscribe', callback_data: subscription ? `unsubscribe_${mintAddress}` : `subscribe_${mintAddress}` },
          { text: subscription?.autoBuy ? '❌ Disable Auto-buy' : '✅ Enable Auto-buy', callback_data: subscription?.autoBuy ? `disable_autobuy_${mintAddress}` : `enable_autobuy_${mintAddress}` }
        ],
        [
          { text: '💰 Buy', callback_data: `buy_${mintAddress}` },
          { text: '💸 Sell', callback_data: `sell_${mintAddress}` }
        ],
        [{ text: '🔙 Back to Tokens', callback_data: 'tokens' }]
      ];

      await this.bot.sendMessage(chatId, message, {
        reply_markup: { inline_keyboard: keyboard }
      });
    } catch (error) {
      console.error('Error showing token details:', error);
      await this.bot.sendMessage(chatId, 'Error showing token details');
    }
  }

  public async handleCallback(query: TelegramBot.CallbackQuery) {
    const chatId = query.message?.chat.id;
    const data = query.data;
    if (!chatId || !data) return;

    try {
      if (data.startsWith('buy_')) {
        const mintAddress = data.replace('buy_', '');
        // Get user's settings to determine currency
        const settings = await Settings.findOne({ userId: chatId });
        const currency = settings?.currency || 'SOL';
        this.userStates.set(chatId, { action: 'buy', tokenMint: mintAddress });
        await this.bot.sendMessage(chatId, `Please enter the amount of ${currency} to buy:`);
      } else if (data.startsWith('sell_')) {
        const mintAddress = data.replace('sell_', '');
        await this.handleSellToken(chatId, mintAddress);
      } else if (data.startsWith('subscribe_')) {
        const mintAddress = data.replace('subscribe_', '');
        const success = await this.subscribeToToken(chatId, mintAddress);
        if (success) {
          await this.bot.sendMessage(chatId, '✅ Successfully subscribed to token alerts!');
          await this.showTokenDetails(chatId, mintAddress);
        } else {
          await this.bot.sendMessage(chatId, '❌ Failed to subscribe. Please try again.');
        }
      } else if (data.startsWith('unsubscribe_')) {
        const mintAddress = data.replace('unsubscribe_', '');
        const success = await this.unsubscribeFromToken(chatId, mintAddress);
        if (success) {
          await this.bot.sendMessage(chatId, '✅ Successfully unsubscribed from token alerts!');
          await this.showTokenDetails(chatId, mintAddress);
        } else {
          await this.bot.sendMessage(chatId, '❌ Failed to unsubscribe. Please try again.');
        }
      } else if (data.startsWith('enable_autobuy_')) {
        const mintAddress = data.replace('enable_autobuy_', '');
        const success = await this.toggleAutoBuy(chatId, mintAddress, true);
        if (success) {
          await this.bot.sendMessage(chatId, '✅ Auto-buy enabled for this token!');
          await this.showTokenDetails(chatId, mintAddress);
        } else {
          await this.bot.sendMessage(chatId, '❌ Failed to enable auto-buy. Please try again.');
        }
      } else if (data.startsWith('disable_autobuy_')) {
        const mintAddress = data.replace('disable_autobuy_', '');
        const success = await this.toggleAutoBuy(chatId, mintAddress, false);
        if (success) {
          await this.bot.sendMessage(chatId, '✅ Auto-buy disabled for this token!');
          await this.showTokenDetails(chatId, mintAddress);
        } else {
          await this.bot.sendMessage(chatId, '❌ Failed to disable auto-buy. Please try again.');
        }
      }
    } catch (error) {
      console.error('Error handling callback:', error);
      await this.bot.sendMessage(chatId, 'Error processing your request');
    }
  }

  public async subscribeToToken(userId: number, mintAddress: string) {
    try {
      console.log('Creating subscription:', { userId, mintAddress });
      const result = await TokenSubscription.findOneAndUpdate(
        { userId, tokenMint: mintAddress },
        { 
          userId, 
          tokenMint: mintAddress,
          autoBuy: false // Explicitly set autoBuy to false for new subscriptions
        },
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

  private async toggleAutoBuy(userId: number, mintAddress: string, enable: boolean): Promise<boolean> {
    try {
      console.log('Toggling auto-buy:', { userId, mintAddress, enable });
      const subscription = await TokenSubscription.findOne({ userId, tokenMint: mintAddress });
      console.log('Found subscription:', subscription);
      
      if (!subscription) {
        console.log('No subscription found');
        return false;
      }

      subscription.autoBuy = enable;
      await subscription.save();
      console.log('Updated subscription:', subscription);
      return true;
    } catch (error) {
      console.error('Error toggling auto-buy:', error);
      return false;
    }
  }

  public async handleMessage(msg: TelegramBot.Message) {
    const chatId = msg.chat.id;
    const text = msg.text;

    if (!text) return;

    const userState = this.userStates.get(chatId);
    if (userState?.action === 'buy') {
      const amount = parseFloat(text);
      if (isNaN(amount) || amount <= 0) {
        await this.bot.sendMessage(chatId, 'Please enter a valid amount greater than 0');
        return;
      }

      try {
        // Get user's settings to determine currency
        const settings = await Settings.findOne({ userId: chatId });
        const currency = settings?.currency || 'SOL';

        await this.bot.sendMessage(chatId, 'Processing buy order...');
        const result = await this.tokenTransaction.buyToken(
          chatId, 
          userState.tokenMint, 
          amount,
          true,
          currency === 'USDT' ? USDT_MINT : undefined
        );
        
        if (result.confirmed) {
          await this.bot.sendMessage(chatId, `✅ Successfully bought tokens!\nTransaction: https://solscan.io/tx/${result.txSignature}`);
        } else {
          const errorMessage = result.error || 'Unknown error occurred';
          await this.bot.sendMessage(chatId, `❌ Transaction failed: ${errorMessage}`);
        }
      } catch (error: any) {
        console.error('Error buying token:', error);
        const errorMessage = error?.message || 'Unknown error occurred';
        await this.bot.sendMessage(chatId, `❌ Transaction failed: ${errorMessage}`);
      }

      this.userStates.delete(chatId);
    }
  }

  private async handleSellToken(chatId: number, mintAddress: string) {
    try {
      await this.bot.sendMessage(chatId, 'Processing sell order...');
      const result = await this.tokenTransaction.sellToken(chatId, mintAddress);
      
      if (result.confirmed) {
        await this.bot.sendMessage(chatId, `✅ Successfully sold all tokens!\nTransaction: https://solscan.io/tx/${result.txSignature}`);
      } else {
        const errorMessage = result.error || 'Unknown error occurred';
        await this.bot.sendMessage(chatId, `❌ Transaction failed: ${errorMessage}`);
      }
    } catch (error: any) {
      console.error('Error selling token:', error);
      const errorMessage = error?.message || 'Unknown error occurred';
      await this.bot.sendMessage(chatId, `❌ Transaction failed: ${errorMessage}`);
    }
  }

  private async handleSignal(tokenMint: string, signal: 'Bullish' | 'Bearish') {
    try {
      // Get token info first
      const token = await Token.findOne({ mintAddress: tokenMint });
      if (!token) return;

      // Get all subscribers for this token
      const subscribers = await TokenSubscription.find({ tokenMint });
      
      for (const subscriber of subscribers) {
        // Send signal alert
        await this.bot.sendMessage(
          subscriber.userId,
          `🚨 Signal Alert for ${token.ticker}!\n\nSignal: ${signal === 'Bullish' ? '🟢 Bullish' : '🔴 Bearish'}`
        );

        // Check if auto-buy is enabled
        if (subscriber.autoBuy) {
          try {
            // Get user's settings
            const settings = await Settings.findOne({ chatId: subscriber.userId });
            const currency = settings?.currency || 'SOL';
            const buyAmount = currency === 'SOL' ? settings?.solBuyAmount || 0.1 : settings?.usdtBuyAmount || 1;

            if (signal === 'Bullish') {
              // Execute buy order
              const result = await this.tokenTransaction.buyToken(
                subscriber.userId,
                tokenMint,
                buyAmount,
                true,
                currency === 'USDT' ? USDT_MINT : undefined
              );

              if (result.confirmed) {
                await this.bot.sendMessage(
                  subscriber.userId,
                  `✅ Auto-buy executed successfully!\n\nAmount: ${buyAmount} ${currency}\nToken: ${token.ticker}\n\nView transaction: ${result.txLink}`
                );
              }
            } else {
              // Execute sell order
              const result = await this.tokenTransaction.sellToken(
                subscriber.userId,
                tokenMint,
                true,
                currency === 'USDT' ? USDT_MINT : undefined
              );

              if (result.confirmed) {
                await this.bot.sendMessage(
                  subscriber.userId,
                  `✅ Auto-sell executed successfully!\n\nToken: ${token.ticker}\n\nView transaction: ${result.txLink}`
                );
              }
            }
          } catch (error: any) {
            console.error('Error executing auto-trade:', error);
            await this.bot.sendMessage(
              subscriber.userId,
              `❌ Error executing auto-trade: ${error.message}`
            );
          }
        }
      }
    } catch (error) {
      console.error('Error handling signal:', error);
    }
  }
} 
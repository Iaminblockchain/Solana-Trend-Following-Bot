import { PriceHistory } from '../../models/PriceHistory';
import { TokenStatus } from '../../models/TokenStatus';
import { Token } from '../../models/Token';
import { SMA, EMA, RSI } from 'technicalindicators';

interface Indicators {
  sma1: number;
  sma2: number;
  ema1: number;
  ema2: number;
  rsi: number;
}

export async function calculateIndicators(tokenMint: string): Promise<Indicators> {
  // Get the last 30 minutes of price data
  const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
  const prices = await PriceHistory.find({
    tokenMint,
    createdAt: { $gte: thirtyMinutesAgo }
  }).sort({ createdAt: 1 });

  // console.log("prices", prices);

  if (prices.length < 14) {
    throw new Error('Not enough price data for calculations');
  }

  const priceValues = prices.map(price => price.priceInUSD);
  const period = 14;

  // Calculate SMA
  const sma1 = SMA.calculate({
    period: 9,
    values: priceValues
  });

  const sma2 = SMA.calculate({
    period: 20,
    values: priceValues
  });

  // Calculate EMA
  const ema1 = EMA.calculate({
    period: 9,
    values: priceValues
  });

  const ema2 = EMA.calculate({
    period: 20,
    values: priceValues
  });

  // Calculate RSI
  const rsi = RSI.calculate({
    period: 14,
    values: priceValues
  });

  // Get the last calculated values
  const indicators = {
    sma1: sma1[sma1.length - 1],
    sma2: sma2[sma2.length - 1],
    ema1: ema1[ema1.length - 1],
    ema2: ema2[ema2.length - 1],
    rsi: rsi[rsi.length - 1]
  };

  // Get current status and token info for logging
  const currentStatus = await TokenStatus.findOne({ tokenMint });
  const token = await Token.findOne({ mintAddress: tokenMint });
  
  // Get current trend from database, default to 'None' if no status exists
  let newTrend: 'Bullish' | 'Bearish' | 'None' = currentStatus?.trend || 'None';
  
  // Update trend based on indicators
  if (indicators.sma1 > indicators.sma2 && indicators.rsi > 70) {
    newTrend = 'Bullish';
  } else if (indicators.sma1 < indicators.sma2 || indicators.rsi < 30) {
    newTrend = 'Bearish';
  }

  // Log trend change
  if (token) {
    const arrow = newTrend === 'Bullish' ? '📈' : newTrend === 'Bearish' ? '📉' : '➡️';
    console.log(`${arrow} ${token.name} (${token.ticker}) - ${tokenMint} - ${newTrend}`);
  }

  // Update trend status in database
  await TokenStatus.findOneAndUpdate(
    { tokenMint },
    { 
      trend: newTrend,
      updatedAt: new Date()
    },
    { upsert: true }
  );

  return indicators;
}

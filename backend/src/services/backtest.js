/**
 * Backtesting Engine
 * Simulates strategy on historical candles
 */

const { analyzeSetup } = require('./strategy');

function runBacktest(historicalCandles5m, historicalCandles15m, dailyCandles) {
  if (!dailyCandles || dailyCandles.length < 2) {
    return { error: 'Insufficient daily data for backtesting' };
  }

  const trades = [];
  let totalPnl = 0;

  // Iterate through daily candles (excluding last day as we need previous day HLC)
  for (let d = 1; d < dailyCandles.length; d++) {
    const prevDay = dailyCandles[d - 1];
    const previousDayHLC = {
      high: prevDay.high,
      low: prevDay.low,
      close: prevDay.close,
    };

    // Get intraday candles for this day
    const dayStart = dailyCandles[d].time;
    const dayEnd = dayStart + 24 * 60 * 60 * 1000;

    const day5m = historicalCandles5m.filter(
      (c) => c.time >= dayStart && c.time < dayEnd
    );
    const day15m = historicalCandles15m.filter(
      (c) => c.time >= dayStart && c.time < dayEnd
    );

    if (day5m.length < 15) continue;

    let tradeTakenToday = false;

    // Slide through the day's candles
    for (let i = 15; i < day5m.length && !tradeTakenToday; i++) {
      const windowEnd = i + 1;
      const candles5m = day5m.slice(0, windowEnd);
      const candles15m = day15m.filter((c) => c.time <= day5m[i].time);

      const analysis = analyzeSetup(candles5m, candles15m, previousDayHLC);

      if (analysis?.signal && analysis.scoring.tradeable) {
        const signal = analysis.signal;
        tradeTakenToday = true;

        // Simulate trade outcome
        const result = simulateTrade(signal, day5m.slice(i + 1));
        if (result) {
          totalPnl += result.pnl;
          trades.push({
            date: new Date(dayStart).toISOString().split('T')[0],
            ...signal,
            ...result,
            score: analysis.scoring.score,
            grade: analysis.scoring.grade,
          });
        }
      }
    }
  }

  const wins = trades.filter((t) => t.result === 'WIN').length;

  return {
    totalTrades: trades.length,
    wins,
    losses: trades.length - wins,
    winRate: trades.length > 0 ? Math.round((wins / trades.length) * 100) : 0,
    totalPnl: Math.round(totalPnl * 100) / 100,
    avgPnl: trades.length > 0 ? Math.round((totalPnl / trades.length) * 100) / 100 : 0,
    trades,
  };
}

function simulateTrade(signal, remainingCandles) {
  for (const candle of remainingCandles) {
    if (signal.type === 'CALL') {
      if (candle.low <= signal.stopLoss) {
        return {
          exitPrice: signal.stopLoss,
          pnl: Math.round((signal.stopLoss - signal.entry) * 100) / 100,
          result: 'LOSS',
          reason: 'STOP_LOSS',
        };
      }
      if (candle.high >= signal.target) {
        return {
          exitPrice: signal.target,
          pnl: Math.round((signal.target - signal.entry) * 100) / 100,
          result: 'WIN',
          reason: 'TARGET_HIT',
        };
      }
    } else {
      if (candle.high >= signal.stopLoss) {
        return {
          exitPrice: signal.stopLoss,
          pnl: Math.round((signal.entry - signal.stopLoss) * 100) / 100,
          result: 'LOSS',
          reason: 'STOP_LOSS',
        };
      }
      if (candle.low <= signal.target) {
        return {
          exitPrice: signal.target,
          pnl: Math.round((signal.entry - signal.target) * 100) / 100,
          result: 'WIN',
          reason: 'TARGET_HIT',
        };
      }
    }
  }

  // Trade expired (end of day)
  const lastCandle = remainingCandles[remainingCandles.length - 1];
  if (!lastCandle) return null;
  
  const exitPrice = lastCandle.close;
  const pnl =
    signal.type === 'CALL'
      ? Math.round((exitPrice - signal.entry) * 100) / 100
      : Math.round((signal.entry - exitPrice) * 100) / 100;

  return {
    exitPrice,
    pnl,
    result: pnl >= 0 ? 'WIN' : 'LOSS',
    reason: 'EXPIRED',
  };
}

module.exports = { runBacktest };

/**
 * Candle Builder
 * Builds OHLC candles from live ticks
 */

class CandleBuilder {
  constructor(maxCandles = 100) {
    this.maxCandles = maxCandles;
    this.candles = {
      '1m': [],
      '3m': [],
      '5m': [],
      '15m': [],
    };
    this.currentCandle = {
      '1m': null,
      '3m': null,
      '5m': null,
      '15m': null,
    };
    this.intervals = {
      '1m': 60 * 1000,
      '3m': 3 * 60 * 1000,
      '5m': 5 * 60 * 1000,
      '15m': 15 * 60 * 1000,
    };
  }

  processTick(price, volume = 0, timestamp = Date.now()) {
    const updates = {};

    for (const tf of Object.keys(this.intervals)) {
      const interval = this.intervals[tf];
      const candleTime = Math.floor(timestamp / interval) * interval;

      if (!this.currentCandle[tf] || this.currentCandle[tf].time !== candleTime) {
        // Close previous candle
        if (this.currentCandle[tf]) {
          this.candles[tf].push({ ...this.currentCandle[tf] });
          if (this.candles[tf].length > this.maxCandles) {
            this.candles[tf].shift();
          }
        }

        // Start new candle
        this.currentCandle[tf] = {
          time: candleTime,
          open: price,
          high: price,
          low: price,
          close: price,
          volume: volume,
        };
        updates[tf] = 'new';
      } else {
        // Update current candle
        this.currentCandle[tf].high = Math.max(this.currentCandle[tf].high, price);
        this.currentCandle[tf].low = Math.min(this.currentCandle[tf].low, price);
        this.currentCandle[tf].close = price;
        this.currentCandle[tf].volume += volume;
        updates[tf] = 'update';
      }
    }

    return updates;
  }

  getCandles(timeframe) {
    const closed = [...this.candles[timeframe]];
    if (this.currentCandle[timeframe]) {
      closed.push({ ...this.currentCandle[timeframe] });
    }
    return closed;
  }

  getAllCandles() {
    return {
      '1m': this.getCandles('1m'),
      '3m': this.getCandles('3m'),
      '5m': this.getCandles('5m'),
      '15m': this.getCandles('15m'),
    };
  }

  getLastPrice() {
    const c = this.currentCandle['1m'];
    return c ? c.close : null;
  }

  loadHistorical(timeframe, candles) {
    this.candles[timeframe] = candles.slice(-this.maxCandles);
  }
}

module.exports = CandleBuilder;

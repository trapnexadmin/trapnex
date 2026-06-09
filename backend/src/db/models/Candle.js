/**
 * Candle Model - Stores OHLCV candle data
 */

const mongoose = require('mongoose');

const candleSchema = new mongoose.Schema({
  symbol: {
    type: String,
    required: true,
    index: true,
  },
  timeframe: {
    type: String,
    required: true,
    enum: ['1m', '3m', '5m', '15m', '1h', '1d'],
    index: true,
  },
  time: {
    type: Date,
    required: true,
    index: true,
  },
  open: {
    type: Number,
    required: true,
  },
  high: {
    type: Number,
    required: true,
  },
  low: {
    type: Number,
    required: true,
  },
  close: {
    type: Number,
    required: true,
  },
  volume: {
    type: Number,
    default: 0,
  },
  metadata: {
    source: String,
    isBuilt: Boolean, // True if built from smaller timeframe
  }
}, {
  timestamps: true,
  collection: 'candles'
});

// Compound index for efficient queries
candleSchema.index({ symbol: 1, timeframe: 1, time: 1 }, { unique: true });
candleSchema.index({ symbol: 1, timeframe: 1, time: -1 });

// Static method to bulk upsert candles
candleSchema.statics.bulkUpsertCandles = async function(candles) {
  const operations = candles.map(candle => ({
    updateOne: {
      filter: { 
        symbol: candle.symbol, 
        timeframe: candle.timeframe, 
        time: candle.time 
      },
      update: { $set: candle },
      upsert: true
    }
  }));

  if (operations.length > 0) {
    return await this.bulkWrite(operations);
  }
  return { ok: 1 };
};

// Static method to get candles for date range
candleSchema.statics.getCandlesInRange = async function(symbol, timeframe, startDate, endDate) {
  return await this.find({
    symbol,
    timeframe,
    time: { $gte: startDate, $lte: endDate }
  }).sort({ time: 1 }).lean();
};

module.exports = mongoose.model('Candle', candleSchema);

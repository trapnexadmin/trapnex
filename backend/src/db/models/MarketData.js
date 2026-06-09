/**
 * Market Data Model - Stores daily market levels (CPR, S/R, etc.)
 */

const mongoose = require('mongoose');

const marketDataSchema = new mongoose.Schema({
  symbol: {
    type: String,
    required: true,
    index: true,
  },
  date: {
    type: Date,
    required: true,
    index: true,
  },
  previousDay: {
    high: Number,
    low: Number,
    close: Number,
    volume: Number,
  },
  cpr: {
    pivot: Number,
    tc: Number,
    bc: Number,
    width: Number,
    upper: Number,
    lower: Number,
    widthType: String,
    widthDescription: String,
  },
  supportResistance: {
    pivot: Number,
    R1: Number,
    R2: Number,
    R3: Number,
    R4: Number,
    R5: Number,
    R6: Number,
    S1: Number,
    S2: Number,
    S3: Number,
    S4: Number,
    S5: Number,
    S6: Number,
  },
  atr: Number,
  bias: {
    type: String,
    enum: ['BULLISH', 'BEARISH', 'NEUTRAL'],
  }
}, {
  timestamps: true,
  collection: 'market_data'
});

// Compound unique index
marketDataSchema.index({ symbol: 1, date: 1 }, { unique: true });

// Static method to get latest market data
marketDataSchema.statics.getLatest = async function(symbol) {
  return await this.findOne({ symbol }).sort({ date: -1 }).lean();
};

// Static method to upsert market data
marketDataSchema.statics.upsertMarketData = async function(data) {
  return await this.findOneAndUpdate(
    { symbol: data.symbol, date: data.date },
    { $set: data },
    { upsert: true, new: true }
  );
};

module.exports = mongoose.model('MarketData', marketDataSchema);

/**
 * Trade Model - Stores executed trades and P&L tracking
 */

const mongoose = require('mongoose');

const tradeSchema = new mongoose.Schema({
  symbol: {
    type: String,
    required: true,
    index: true,
  },
  signalId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Signal',
    index: true,
  },
  type: {
    type: String,
    required: true,
    enum: ['CALL', 'PUT'],
  },
  entry: {
    price: Number,
    time: Date,
  },
  exit: {
    price: Number,
    time: Date,
    reason: {
      type: String,
      enum: ['TARGET', 'TARGET_HIT', 'STOP_LOSS', 'MANUAL', 'EOD', 'MARKET_CLOSED'],
    }
  },
  exits: [{
    price: Number,
    time: Date,
    reason: {
      type: String,
      enum: ['TARGET', 'TARGET_HIT', 'STOP_LOSS', 'MANUAL', 'EOD', 'MARKET_CLOSED'],
    }
  }],
  stopLoss: Number,
  initialSL: Number,
  target: Number,       // primary (last) target
  t1: Number,           // first target
  targets: [Number],    // all target levels array
  targetPoints: [Number], // fixed points array e.g. [25, 50, 75]
  targetsHit: [Number], // which target indices were hit
  riskReward: Number,
  pnl: {
    points: { type: Number, default: 0 },
    amount:  { type: Number, default: 0 },
    percentage: { type: Number, default: 0 },
  },
  quantity: {
    type: Number,
    default: 1,
  },
  result: {
    type: String,
    enum: ['WIN', 'LOSS', null],
    default: null,
  },
  status: {
    type: String,
    enum: ['OPEN', 'CLOSED'],
    default: 'OPEN',
    index: true,
  },
  maxProfit: Number,
  maxLoss: Number,
  duration: Number, // in milliseconds
  score: Number,
  grade: String,
  metadata: {
    platform: String,
    mode: String, // 'LIVE' or 'BACKTEST'
    source: String,
  }
}, {
  timestamps: true,
  collection: 'trades'
});

tradeSchema.index({ symbol: 1, createdAt: -1 });
tradeSchema.index({ status: 1, createdAt: -1 });
tradeSchema.index({ 'entry.time': -1 });

// Static method to get trade statistics
tradeSchema.statics.getStats = async function(filter = {}) {
  const trades = await this.find({ ...filter, status: 'CLOSED' }).lean();

  if (trades.length === 0) {
    return {
      total: 0,
      winners: 0,
      losers: 0,
      winRate: 0,
      totalPnL: 0,
      avgPnL: 0,
      maxProfit: 0,
      maxLoss: 0,
    };
  }

  const winners = trades.filter(t => (t.pnl?.points || 0) > 0).length;
  const losers = trades.filter(t => (t.pnl?.points || 0) < 0).length;
  const totalPnL = trades.reduce((sum, t) => sum + (t.pnl?.points || 0), 0);
  const maxProfit = Math.max(...trades.map(t => t.pnl?.points || 0));
  const maxLoss = Math.min(...trades.map(t => t.pnl?.points || 0));

  return {
    totalTrades: trades.length,
    wins: winners,
    losses: losers,
    winRate: (winners / trades.length) * 100,
    totalPnL,
    avgPnL: totalPnL / trades.length,
    bestTrade: maxProfit,
    worstTrade: maxLoss,
    maxDrawdown: Math.abs(maxLoss),
  };
};

module.exports = mongoose.model('Trade', tradeSchema);

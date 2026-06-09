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
      enum: ['TARGET', 'STOP_LOSS', 'MANUAL', 'EOD'],
    }
  },
  stopLoss: Number,
  target: Number,
  riskReward: Number,
  pnl: {
    points: Number,
    amount: Number,
    percentage: Number,
  },
  quantity: {
    type: Number,
    default: 1,
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
  }
}, {
  timestamps: true,
  collection: 'trades'
});

tradeSchema.index({ symbol: 1, createdAt: -1 });
tradeSchema.index({ status: 1, createdAt: -1 });
tradeSchema.index({ 'entry.time': -1 });

// Virtual for calculating actual duration
tradeSchema.virtual('actualDuration').get(function() {
  if (this.exit.time && this.entry.time) {
    return this.exit.time - this.entry.time;
  }
  return null;
});

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

  const winners = trades.filter(t => t.pnl.points > 0).length;
  const losers = trades.filter(t => t.pnl.points < 0).length;
  const totalPnL = trades.reduce((sum, t) => sum + (t.pnl.points || 0), 0);
  const maxProfit = Math.max(...trades.map(t => t.pnl.points || 0));
  const maxLoss = Math.min(...trades.map(t => t.pnl.points || 0));

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

/**
 * Live PnL Tracker
 * Tracks active trade profit/loss in real-time
 */

class PnLTracker {
  constructor() {
    this.activeTrade = null;
    this.tradeHistory = [];
  }

  openTrade({ type, entry, stopLoss, target, score, grade, timestamp }) {
    if (this.activeTrade) return null;

    this.activeTrade = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      type, // 'CALL' or 'PUT'
      entry,
      stopLoss,
      target,
      score,
      grade,
      openTime: timestamp || Date.now(),
      currentPrice: entry,
      pnl: 0,
      pnlPercent: 0,
      status: "OPEN",
    };

    return this.activeTrade;
  }

  updatePrice(currentPrice) {
    if (!this.activeTrade) return null;

    this.activeTrade.currentPrice = currentPrice;

    if (this.activeTrade.type === "CALL") {
      this.activeTrade.pnl = round(currentPrice - this.activeTrade.entry);
    } else {
      this.activeTrade.pnl = round(this.activeTrade.entry - currentPrice);
    }

    this.activeTrade.pnlPercent = round(
      (this.activeTrade.pnl / this.activeTrade.entry) * 100,
    );

    // Check stop loss
    if (
      this.activeTrade.type === "CALL" &&
      currentPrice <= this.activeTrade.stopLoss
    ) {
      return this.closeTrade("STOP_LOSS", currentPrice);
    }
    if (
      this.activeTrade.type === "PUT" &&
      currentPrice >= this.activeTrade.stopLoss
    ) {
      return this.closeTrade("STOP_LOSS", currentPrice);
    }

    // Check target
    if (
      this.activeTrade.type === "CALL" &&
      currentPrice >= this.activeTrade.target
    ) {
      return this.closeTrade("TARGET_HIT", currentPrice);
    }
    if (
      this.activeTrade.type === "PUT" &&
      currentPrice <= this.activeTrade.target
    ) {
      return this.closeTrade("TARGET_HIT", currentPrice);
    }

    return { event: "UPDATE", trade: this.activeTrade };
  }

  closeTrade(reason, exitPrice) {
    if (!this.activeTrade) return null;

    const trade = {
      ...this.activeTrade,
      exitPrice,
      closeTime: Date.now(),
      reason,
      status: "CLOSED",
      result: this.activeTrade.pnl >= 0 ? "WIN" : "LOSS",
    };

    // Final PnL calc
    if (trade.type === "CALL") {
      trade.pnl = round(exitPrice - trade.entry);
    } else {
      trade.pnl = round(trade.entry - exitPrice);
    }
    trade.pnlPercent = round((trade.pnl / trade.entry) * 100);
    trade.result = trade.pnl >= 0 ? "WIN" : "LOSS";

    this.tradeHistory.push(trade);
    this.activeTrade = null;

    return { event: "CLOSED", trade };
  }

  getActiveTrade() {
    return this.activeTrade;
  }

  getHistory() {
    return this.tradeHistory;
  }

  getStats() {
    const trades = this.tradeHistory;
    if (trades.length === 0) {
      return { total: 0, wins: 0, losses: 0, winRate: 0, totalPnl: 0 };
    }

    const wins = trades.filter((t) => t.result === "WIN").length;
    const losses = trades.length - wins;
    const totalPnl = round(trades.reduce((sum, t) => sum + t.pnl, 0));

    return {
      total: trades.length,
      wins,
      losses,
      winRate: round((wins / trades.length) * 100),
      totalPnl,
      avgPnl: round(totalPnl / trades.length),
    };
  }
}

function round(val) {
  return Math.round(val * 100) / 100;
}

module.exports = PnLTracker;

/**
 * Trade Journal
 * In-memory trade storage and stats
 */

class TradeJournal {
  constructor() {
    this.trades = [];
  }

  addTrade(trade) {
    this.trades.push({
      ...trade,
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      createdAt: Date.now(),
    });
    return this.trades[this.trades.length - 1];
  }

  getTrades(limit = 50) {
    return this.trades.slice(-limit).reverse();
  }

  getStats() {
    if (this.trades.length === 0) {
      return {
        total: 0,
        wins: 0,
        losses: 0,
        winRate: 0,
        totalPnl: 0,
        avgPnl: 0,
        bestTrade: null,
        worstTrade: null,
        byGrade: {},
      };
    }

    const wins = this.trades.filter((t) => t.result === 'WIN');
    const losses = this.trades.filter((t) => t.result === 'LOSS');
    const totalPnl = this.trades.reduce((sum, t) => sum + (t.pnl || 0), 0);

    const sorted = [...this.trades].sort((a, b) => (b.pnl || 0) - (a.pnl || 0));

    // Stats by grade
    const byGrade = {};
    for (const t of this.trades) {
      const g = t.grade || 'Unknown';
      if (!byGrade[g]) byGrade[g] = { total: 0, wins: 0, pnl: 0 };
      byGrade[g].total++;
      if (t.result === 'WIN') byGrade[g].wins++;
      byGrade[g].pnl += t.pnl || 0;
    }

    return {
      total: this.trades.length,
      wins: wins.length,
      losses: losses.length,
      winRate: round((wins.length / this.trades.length) * 100),
      totalPnl: round(totalPnl),
      avgPnl: round(totalPnl / this.trades.length),
      bestTrade: sorted[0] || null,
      worstTrade: sorted[sorted.length - 1] || null,
      byGrade,
    };
  }
}

function round(val) {
  return Math.round(val * 100) / 100;
}

module.exports = TradeJournal;

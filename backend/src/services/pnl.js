/**
 * Live PnL Tracker - V3
 * Multi-target tracking with trailing stop logic
 * 
 * Trailing SL Rules (per grade):
 * After T1: SL moves to Entry +5 (lock trade)
 * After T2: SL moves to T1
 * After T3: SL moves to T2
 * After T4+: SL moves to previous target
 * 
 * Position reduction at each target (equal portions):
 * 20% booked at each target
 */

class PnLTracker {
  constructor() {
    this.activeTrade = null;
    this.tradeHistory = [];
  }

  openTrade({ type, entry, stopLoss, target, t1, targets, targetPoints, score, grade, timestamp }) {
    if (this.activeTrade) return null;

    // Support both old single-target and new multi-target signals
    const allTargets = targets || (target ? [target] : []);
    const firstTarget = t1 || allTargets[0] || target;

    this.activeTrade = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      type,           // 'CALL' or 'PUT'
      entry,
      stopLoss,
      initialSL: stopLoss,  // store original SL
      target: target || (allTargets[allTargets.length - 1]),
      t1: firstTarget,
      targets: allTargets,  // array of all targets
      targetPoints: targetPoints || [],
      score,
      grade,
      openTime: timestamp || Date.now(),
      currentPrice: entry,
      pnl: 0,
      pnlPercent: 0,
      status: "OPEN",
      // Multi-target tracking
      targetsHit: [],       // which targets have been hit
      currentTargetIdx: 0,  // next target to hit
      positionSize: 100,    // 100% of position remaining
      trailActive: false,
    };

    return this.activeTrade;
  }

  updatePrice(currentPrice) {
    if (!this.activeTrade) return null;

    const trade = this.activeTrade;
    trade.currentPrice = currentPrice;

    // Calculate P&L correctly for CALL and PUT
    if (trade.type === "CALL") {
      trade.pnl = round(currentPrice - trade.entry);
    } else {
      // PUT: profit when price falls
      trade.pnl = round(trade.entry - currentPrice);
    }

    trade.pnlPercent = trade.entry > 0
      ? round((trade.pnl / trade.entry) * 100)
      : 0;

    // Check stop loss
    if (trade.type === "CALL" && currentPrice <= trade.stopLoss) {
      return this.closeTrade("STOP_LOSS", currentPrice);
    }
    if (trade.type === "PUT" && currentPrice >= trade.stopLoss) {
      return this.closeTrade("STOP_LOSS", currentPrice);
    }

    // Multi-target check and trailing SL
    if (trade.targets && trade.targets.length > 0) {
      for (let i = trade.currentTargetIdx; i < trade.targets.length; i++) {
        const targetPrice = trade.targets[i];
        const targetHit =
          trade.type === "CALL"
            ? currentPrice >= targetPrice
            : currentPrice <= targetPrice;

        if (targetHit && !trade.targetsHit.includes(i)) {
          trade.targetsHit.push(i);
          trade.currentTargetIdx = i + 1;

          // Position reduction: book 20% at each target
          trade.positionSize = Math.max(0, trade.positionSize - 20);

          // Trailing SL updates
          this._updateTrailingSL(trade, i);

          const isLastTarget = i === trade.targets.length - 1;
          if (isLastTarget || trade.positionSize <= 0) {
            return this.closeTrade("TARGET_HIT", currentPrice);
          }

          return {
            event: "TARGET_HIT",
            targetIdx: i,
            targetPrice,
            targetLabel: `T${i + 1}`,
            remainingPosition: trade.positionSize,
            newSL: trade.stopLoss,
            trade,
          };
        }
      }
    } else {
      // Legacy single-target check
      if (trade.type === "CALL" && currentPrice >= trade.target) {
        return this.closeTrade("TARGET_HIT", currentPrice);
      }
      if (trade.type === "PUT" && currentPrice <= trade.target) {
        return this.closeTrade("TARGET_HIT", currentPrice);
      }
    }

    return { event: "UPDATE", trade };
  }

  _updateTrailingSL(trade, targetIdx) {
    // After T1 (idx=0): SL = Entry + 5 (lock trade, small profit buffer)
    // After T2 (idx=1): SL = T1
    // After T3+: SL = previous target
    if (targetIdx === 0) {
      // After first target: lock at entry + 5pts
      const lockPrice = trade.type === "CALL"
        ? round(trade.entry + 5)
        : round(trade.entry - 5);
      trade.stopLoss = lockPrice;
      trade.trailActive = true;
    } else {
      // After subsequent targets: move SL to previous target
      const prevTarget = trade.targets[targetIdx - 1];
      trade.stopLoss = prevTarget;
    }
  }

  closeTrade(reason, exitPrice) {
    if (!this.activeTrade) return null;

    const ep = exitPrice || this.activeTrade.currentPrice;

    const trade = {
      ...this.activeTrade,
      exitPrice: ep,
      closeTime: Date.now(),
      reason,
      status: "CLOSED",
    };

    // Final P&L calc
    if (trade.type === "CALL") {
      trade.pnl = round(ep - trade.entry);
    } else {
      trade.pnl = round(trade.entry - ep);
    }
    trade.pnlPercent = trade.entry > 0
      ? round((trade.pnl / trade.entry) * 100)
      : 0;
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

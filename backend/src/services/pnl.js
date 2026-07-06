/**
 * Live PnL Tracker - V3
 * Multi-target tracking with trailing stop logic
 *
 * Trailing SL Rules (per grade):
 * After T1: SL moves to Entry +10
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

  hydrateActiveTrade(trade) {
    if (!trade) return null;

    const entryPrice = trade.entry?.price ?? trade.entry ?? 0;
    const targets = trade.targets || (trade.target ? [trade.target] : []);
    const targetsHit = Array.isArray(trade.targetsHit) ? trade.targetsHit : [];

    this.activeTrade = {
      id: trade.id || trade._id?.toString?.() || trade._id || Date.now().toString(36),
      _dbId: trade._id?.toString?.() || trade._id || trade.id || null,
      type: trade.type,
      entry: entryPrice,
      stopLoss: trade.stopLoss ?? trade.initialSL ?? 0,
      initialSL: trade.initialSL ?? trade.stopLoss ?? 0,
      target: trade.target ?? targets[targets.length - 1] ?? null,
      t1: trade.t1 ?? targets[0] ?? trade.target ?? null,
      targets,
      targetPoints: trade.targetPoints || [],
      strikes: trade.strikes || {},
      strikeSelection: trade.strikeSelection || null,
      decision: trade.decision || null,
      optionTrade: trade.optionTrade || null,
      optionEntry: trade.optionEntry ?? null,
      optionStopLoss: trade.optionStopLoss ?? null,
      optionTargets: trade.optionTargets || [],
      optionTargetPoints: trade.optionTargetPoints || [],
      optionSymbol: trade.optionSymbol || null,
      optionToken: trade.optionToken || null,
      score: trade.score ?? 0,
      grade: trade.grade ?? null,
      source: trade.source || trade.metadata?.source || null,
      level: trade.level || null,
      levelPrice: trade.levelPrice ?? null,
      openTime:
        trade.openTime ||
        (trade.entry?.time ? new Date(trade.entry.time).getTime() : null) ||
        (trade.createdAt ? new Date(trade.createdAt).getTime() : Date.now()),
      currentPrice: trade.currentPrice ?? entryPrice,
      pnl: trade.pnl?.points ?? trade.pnl ?? 0,
      pnlPercent: trade.pnlPercent ?? trade.pnl?.percentage ?? 0,
      status: trade.status || "OPEN",
      targetsHit,
      currentTargetIdx:
        typeof trade.currentTargetIdx === "number"
          ? trade.currentTargetIdx
          : targetsHit.length,
      positionSize:
        typeof trade.positionSize === "number"
          ? trade.positionSize
          : Math.max(0, 100 - targetsHit.length * 20),
      trailActive: Boolean(trade.trailActive || trade.stopLoss !== trade.initialSL),
      lifecycle: trade.lifecycle || trade.status || "OPEN",
      signalId: trade.signalId || null,
      createdAt: trade.createdAt || null,
      updatedAt: trade.updatedAt || null,
    };

    return this.activeTrade;
  }

  openTrade({
    type,
    entry,
    stopLoss,
    target,
    t1,
    targets,
    targetPoints,
    strikes,
    strikeSelection,
    decision,
    optionTrade,
    optionEntry,
    optionStopLoss,
    optionTargets,
    optionTargetPoints,
    optionSymbol,
    optionToken,
    score,
    grade,
    timestamp,
    source,
    level,
    levelPrice,
    lifecycle,
    quantity,
  }) {
    if (this.activeTrade) return null;

    // Support both old single-target and new multi-target signals
    const allTargets = targets || (target ? [target] : []);
    const firstTarget = t1 || allTargets[0] || target;

    this.activeTrade = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      type, // 'CALL' or 'PUT'
      entry,
      stopLoss,
      initialSL: stopLoss, // store original SL
      manualSL: false,
      target: target || allTargets[allTargets.length - 1],
      t1: firstTarget,
      targets: allTargets, // array of all targets
      targetPoints: targetPoints || [],
      strikes: strikes || {},
      strikeSelection: strikeSelection || null,
      decision: decision || null,
      optionTrade: optionTrade || null,
      optionEntry: optionEntry ?? null,
      optionStopLoss: optionStopLoss ?? null,
      optionTargets: optionTargets || [],
      optionTargetPoints: optionTargetPoints || [],
      optionSymbol: optionSymbol || null,
      optionToken: optionToken || null,
      score,
      grade,
      source,
      level,
      levelPrice,
      lifecycle: lifecycle || "OPEN",
      quantity: typeof quantity === "number" ? quantity : 1,
      openTime: timestamp || Date.now(),
      currentPrice: entry,
      pnl: 0,
      pnlPercent: 0,
      status: "OPEN",
      // Multi-target tracking
      targetsHit: [], // which targets have been hit
      currentTargetIdx: 0, // next target to hit
      positionSize: 100, // 100% of position remaining
      trailActive: false,
    };

    return this.activeTrade;
  }

  adjustStopLoss(newStopLoss) {
    if (!this.activeTrade) return null;

    const parsedStopLoss = Number(newStopLoss);
    if (!Number.isFinite(parsedStopLoss) || parsedStopLoss <= 0) {
      return null;
    }

    this.activeTrade.stopLoss = round(parsedStopLoss);
    this.activeTrade.manualSL = true;
    this.activeTrade.trailActive = false;

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

    trade.pnlPercent =
      trade.entry > 0 ? round((trade.pnl / trade.entry) * 100) : 0;

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
    // After T1 (idx=0): trail SL just below S/R level (support for CALL, resistance for PUT)
    // For B+, A, A+ grades: use levelPrice with buffer
    // After T2 (idx=1): SL = T1
    // After T3+: SL = previous target
    if (targetIdx === 0) {
      let lockPrice;
      
      // Use S/R level if available, otherwise fallback to entry +10
      if (trade.levelPrice) {
        // For CALL: place SL slightly below support level
        // For PUT: place SL slightly above resistance level
        const buffer = 2; // 2-point buffer from S/R level
        lockPrice = trade.type === "CALL"
          ? round(trade.levelPrice - buffer)
          : round(trade.levelPrice + buffer);
      } else {
        // Fallback: entry +10 buffer
        lockPrice = trade.type === "CALL"
          ? round(trade.entry + 10)
          : round(trade.entry - 10);
      }

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
    const exitRecord = {
      price: ep,
      time: Date.now(),
      reason,
    };

    const trade = {
      ...this.activeTrade,
      exitPrice: ep,
      exit: exitRecord,
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
    trade.pnlPercent =
      trade.entry > 0 ? round((trade.pnl / trade.entry) * 100) : 0;
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

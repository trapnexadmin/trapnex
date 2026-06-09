/**
 * Strategy Runner
 * Runs continuously, processes ticks, and generates signals
 */

const { analyzeSetup } = require("../services/strategy");
const { sendAlert } = require("../services/telegram");
const dbService = require("../db/service");

class StrategyRunner {
  constructor(candleBuilder, pnlTracker, journal) {
    this.candleBuilder = candleBuilder;
    this.pnlTracker = pnlTracker;
    this.journal = journal;
    this.previousDayHLC = null;
    this.lastAnalysis = null;
    this.lastSignalTime = 0;
    this.onSignal = null;
    this.onAnalysis = null;
    this.analysisInterval = null;
    this.lastSignalId = null; // Track last saved signal ID for trade linkage
  }

  setPreviousDayHLC(high, low, close) {
    this.previousDayHLC = { high, low, close };
    console.log("[Strategy] ✓ Previous Day HLC set:", this.previousDayHLC);

    // Immediately run analysis if we have enough 3m candles (faster timeframe)
    if (this.candleBuilder.getCandles("3m").length >= 5) {
      console.log("[Strategy] Running initial analysis with CPR data...");
      this.runAnalysis();
    }
  }

  processTick(tick) {
    const updates = this.candleBuilder.processTick(
      tick.price,
      tick.volume,
      tick.timestamp,
    );

    // Update PnL if trade active
    const pnlUpdate = this.pnlTracker.updatePrice(tick.price);
    if (pnlUpdate?.event === "CLOSED") {
      this.journal.addTrade(pnlUpdate.trade);

      // Update trade in MongoDB (async, non-blocking)
      if (pnlUpdate.trade._dbId) {
        dbService
          .updateTrade(pnlUpdate.trade._dbId, {
            exit: {
              price: pnlUpdate.trade.exitPrice,
              time: new Date(pnlUpdate.trade.closeTime),
            },
            status: "CLOSED",
            result: pnlUpdate.trade.result,
            pnl: pnlUpdate.trade.pnl,
            pnlPercent: pnlUpdate.trade.pnlPercent,
            closeReason: pnlUpdate.trade.reason,
            "metadata.duration":
              pnlUpdate.trade.closeTime - pnlUpdate.trade.openTime,
          })
          .then((result) => {
            if (result.updated) {
              console.log(
                `[Strategy] ✓ Trade updated in MongoDB: ${pnlUpdate.trade.reason} | P&L: ${pnlUpdate.trade.pnl}`,
              );
            } else {
              console.log(
                `[Strategy] ⚠ Trade update failed: ${result.reason || result.error}`,
              );
            }
          })
          .catch((err) => {
            console.error(`[Strategy] ✗ Trade update error:`, err.message);
          });
      }
    }

    return { updates, pnlUpdate };
  }

  runAnalysis() {
    if (!this.previousDayHLC) {
      console.log("[Strategy] ⚠ Waiting for previous day HLC data...");
      return null;
    }
    const candles3m = this.candleBuilder.getCandles("3m");
    const candles5m = this.candleBuilder.getCandles("5m");
    const candles15m = this.candleBuilder.getCandles("15m");

    // Run analysis even with few candles - it will return CPR/SR levels only
    const analysis = analyzeSetup(candles3m,candles5m, candles15m, this.previousDayHLC);
    this.lastAnalysis = analysis;

    if (analysis) {
      // Always log CPR levels (most important info)
      console.log("[Strategy] ✓ CPR Levels:", {
        tc: analysis.cpr.tc,
        pivot: analysis.cpr.pivot,
        bc: analysis.cpr.bc,
        bias: analysis.bias,
        lastPrice: analysis.lastPrice,
      });

      // Log full analysis details only if we have enough candles
      if (candles3m.length >= 10) {
        console.log("[Strategy] ✓ Full analysis complete:", {
          sr: analysis.supportResistance,
          narrowCPR: analysis.narrowCPR,
          widthType: analysis.cprWidthType,
          levelOpportunities: analysis.levelInteraction?.totalOpportunities || 0,
          nearestSupport: analysis.levelInteraction?.nearestSupport,
          nearestResistance: analysis.levelInteraction?.nearestResistance,
        });
      }

      // Log all available signals
      if (analysis.signals && analysis.signals.length > 0) {
        console.log(
          `[Strategy] 📊 Found ${analysis.signals.length} trading opportunities:`,
        );
        analysis.signals.forEach((sig, idx) => {
          const tradeableIcon = sig.tradeable ? "✅" : "⏳";
          const status = sig.tradeable ? "TRADEABLE" : "WATCHLIST";
          console.log(
            `  ${tradeableIcon} [${idx + 1}] ${sig.source} @ ${sig.level || "CPR"}: ${sig.type} | Entry=${sig.entry} SL=${sig.stopLoss} Target=${sig.target} | RR=${sig.riskReward?.toFixed(2) || 'N/A'} | Grade=${sig.grade} Score=${sig.score}/10 | Conf=${(sig.confidence * 100).toFixed(0)}% | Status=${status}`,
          );
        });
      }
    }

    if (this.onAnalysis) {
      this.onAnalysis(analysis);
    }

    // Generate signals (throttle: min 5 min between signals)
    // Execute trades on highest scored tradeable signals
    if (
      analysis?.signals &&
      analysis.signals.length > 0 &&
      Date.now() - this.lastSignalTime > 5 * 60 * 1000 &&
      !this.pnlTracker.getActiveTrade()
    ) {
      // Filter only tradeable signals
      const tradeableSignals = analysis.signals.filter((s) => s.tradeable);

      if (tradeableSignals.length > 0) {
        // Sort by score (highest first), then by confidence
        const sortedSignals = tradeableSignals.sort(
          (a, b) =>
            (b.score || 0) - (a.score || 0) ||
            (b.confidence || 0) - (a.confidence || 0),
        );

        // Execute the highest scored signal
        const bestSignal = sortedSignals[0];
        this.lastSignalTime = Date.now();

        // Save signal to MongoDB (async, non-blocking)
        dbService
          .saveSignal(bestSignal, analysis, {
            score: bestSignal.score,
            grade: bestSignal.grade,
            breakdown: bestSignal.breakdown,
            tradeable: true,
          })
          .then((result) => {
            if (result.saved) {
              this.lastSignalId = result.signalId;
              console.log(
                `[Strategy] ✓ Signal saved to MongoDB (ID: ${result.signalId})`,
              );
            } else {
              console.log(
                `[Strategy] ⚠ Signal not saved: ${result.reason || result.error}`,
              );
            }
          })
          .catch((err) => {
            console.error(`[Strategy] ✗ Signal save error:`, err.message);
          });

        // Open trade
        const trade = this.pnlTracker.openTrade({
          ...bestSignal,
          score: bestSignal.score,
          grade: bestSignal.grade,
        });

        // Save trade to MongoDB (async, non-blocking)
        dbService
          .saveTrade(trade, this.lastSignalId)
          .then((result) => {
            if (result.saved) {
              console.log(
                `[Strategy] ✓ Trade saved to MongoDB (ID: ${result.tradeId})`,
              );
              // Store trade ID for future updates (SL/Target hits)
              if (trade && typeof trade === "object") {
                trade._dbId = result.tradeId;
              }
            } else {
              console.log(
                `[Strategy] ⚠ Trade not saved: ${result.reason || result.error}`,
              );
            }
          })
          .catch((err) => {
            console.error(`[Strategy] ✗ Trade save error:`, err.message);
          });

        console.log(
          `[Strategy] 🎯 Executing signal: ${bestSignal.source} @ ${bestSignal.level || "CPR"} | Grade: ${bestSignal.grade} (${bestSignal.score}/10) | Confidence: ${(bestSignal.confidence * 100).toFixed(0)}%`,
        );

        if (this.onSignal) {
          this.onSignal(bestSignal, {
            score: bestSignal.score,
            grade: bestSignal.grade,
            breakdown: bestSignal.breakdown,
            tradeable: true,
          });
        }

        // Send Telegram alert (async, non-blocking)
        sendAlert(bestSignal, {
          score: bestSignal.score,
          grade: bestSignal.grade,
          breakdown: bestSignal.breakdown,
        }).catch(() => {});

        return { signal: bestSignal, trade, allSignals: analysis.signals };
      }
    }

    return { analysis };
  }

  startPeriodicAnalysis(intervalMs = 15000) {
    this.stopPeriodicAnalysis();
    this.analysisInterval = setInterval(() => {
      this.runAnalysis();
    }, intervalMs);
    console.log(`[Strategy] Periodic analysis started (${intervalMs}ms)`);
  }

  stopPeriodicAnalysis() {
    if (this.analysisInterval) {
      clearInterval(this.analysisInterval);
      this.analysisInterval = null;
    }
  }

  getState() {
    return {
      analysis: this.lastAnalysis,
      activeTrade: this.pnlTracker.getActiveTrade(),
      stats: this.pnlTracker.getStats(),
      candles: this.candleBuilder.getAllCandles(),
      previousDayHLC: this.previousDayHLC,
      availableSignals: this.lastAnalysis?.signals || [],
      levelInteraction: this.lastAnalysis?.levelInteraction || null,
    };
  }
}

module.exports = StrategyRunner;

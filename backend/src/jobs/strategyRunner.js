/**
 * Strategy Runner
 * Runs continuously, processes ticks, and generates signals
 */

const { analyzeSetup } = require("../services/strategy");
const { sendAlert, sendDailyPnLSummary } = require("../services/telegram");
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
    this.watchlistSignals = []; // Track B-grade signals that can upgrade
    this.marketCloseCheckInterval = null; // Check for market close
    this.tradeClosedAtMarketClose = false; // Track if trade was closed today
    this.dailyPnLSent = false; // Track if daily P&L summary was sent today
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
              reason: pnlUpdate.trade.reason,
            },
            status: "CLOSED",
            result: pnlUpdate.trade.result,
            "pnl.points": pnlUpdate.trade.pnl,
            "pnl.percentage": pnlUpdate.trade.pnlPercent,
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
    const analysis = analyzeSetup(
      candles3m,
      candles5m,
      candles15m,
      this.previousDayHLC,
    );
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
          levelOpportunities:
            analysis.levelInteraction?.totalOpportunities || 0,
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
            `  ${tradeableIcon} [${idx + 1}] ${sig.source} @ ${sig.level || "CPR"}: ${sig.type} | Entry=${sig.entry} SL=${sig.stopLoss} Target=${sig.target} | RR=${sig.riskReward?.toFixed(2) || "N/A"} | Grade=${sig.grade} Score=${sig.score}/10 | Conf=${(sig.confidence * 100).toFixed(0)}% | Status=${status}`,
          );
        });

        // Check for watchlist signals (B grade: score 7-9) and add to tracking
        const watchlistSignals = analysis.signals.filter(
          (s) => !s.tradeable && s.grade === "B",
        );
        watchlistSignals.forEach((sig) => {
          // Check if not already in watchlist
          const existing = this.watchlistSignals.find(
            (w) =>
              w.level === sig.level &&
              w.type === sig.type &&
              Date.now() - w.addedAt < 10 * 60 * 1000,
          );
          if (!existing) {
            this.watchlistSignals.push({ ...sig, addedAt: Date.now() });
            console.log(
              `[Strategy] 📋 Added to watchlist: ${sig.type} @ ${sig.level} (Grade ${sig.grade}, Score ${sig.score})`,
            );
          }
        });

        // Check if any watchlist signals have upgraded to B+ or A
        this.watchlistSignals = this.watchlistSignals.filter((watchSig) => {
          // Remove if too old (10 minutes)
          if (Date.now() - watchSig.addedAt > 10 * 60 * 1000) {
            console.log(
              `[Strategy] ⏰ Watchlist expired: ${watchSig.type} @ ${watchSig.level}`,
            );
            return false;
          }

          // Check if this signal has upgraded
          const upgraded = analysis.signals.find(
            (s) =>
              s.level === watchSig.level &&
              s.type === watchSig.type &&
              s.tradeable &&
              (s.grade === "B+" || s.grade === "A" || s.grade === "A+"),
          );

          if (upgraded) {
            console.log(
              `[Strategy] ⬆️ UPGRADED! ${watchSig.type} @ ${watchSig.level}: ${watchSig.grade} (${watchSig.score}) → ${upgraded.grade} (${upgraded.score})`,
            );
            console.log(`[Strategy] ✅ Watchlist signal is now TRADEABLE!`);
            // Don't remove yet - let the normal signal execution handle it
          }

          return true; // Keep in watchlist for now
        });
      }
    }

    if (this.onAnalysis) {
      this.onAnalysis(analysis);
    }

    // Generate signals (throttle: min 5 min between signals)
    // Execute trades on highest scored tradeable signals (B+ and above)
    if (
      analysis?.signals &&
      analysis.signals.length > 0 &&
      Date.now() - this.lastSignalTime > 5 * 60 * 1000 &&
      !this.pnlTracker.getActiveTrade()
    ) {
      // V3 STRICT: Filter tradeable signals (B+ requires score >= 12)
      const tradeableSignals = analysis.signals.filter(
        (s) => s.tradeable && s.score >= 12,
      );

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
          targets: bestSignal.targets,
          t1: bestSignal.t1,
          targetPoints: bestSignal.targetPoints,
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

    // Start market close monitoring (check every 30 seconds)
    this.startMarketCloseMonitoring();
  }

  stopPeriodicAnalysis() {
    if (this.analysisInterval) {
      clearInterval(this.analysisInterval);
      this.analysisInterval = null;
    }
    this.stopMarketCloseMonitoring();
  }

  /**
   * Check if market is closing and auto-close active trades
   */
  isMarketClosing() {
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000; // IST is UTC+5:30
    const istDate = new Date(now.getTime() + istOffset);

    const day = istDate.getUTCDay(); // 0 = Sunday, 6 = Saturday
    // Skip weekends
    if (day === 0 || day === 6) return false;

    const hours = istDate.getUTCHours();
    const minutes = istDate.getUTCMinutes();

    // Market closes at 15:30 IST
    // Close trades at 15:25 (5 minutes before market close)
    if (hours === 15 && minutes >= 25) {
      return true;
    }

    return false;
  }

  /**
   * Start monitoring for market close
   */
  startMarketCloseMonitoring() {
    this.stopMarketCloseMonitoring();

    // Reset flag at start of new day
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istDate = new Date(now.getTime() + istOffset);
    if (istDate.getUTCHours() < 15) {
      this.tradeClosedAtMarketClose = false;
      this.dailyPnLSent = false;
    }

    // Check every 30 seconds
    this.marketCloseCheckInterval = setInterval(() => {
      const nowIST = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
      const h = nowIST.getUTCHours();
      const m = nowIST.getUTCMinutes();
      const day = nowIST.getUTCDay();
      const isWeekday = day >= 1 && day <= 5;

      // 3:25 PM: Send daily P&L summary via Telegram
      if (isWeekday && h === 15 && m >= 25 && m < 26 && !this.dailyPnLSent) {
        this.dailyPnLSent = true;
        console.log("[Strategy] 📊 Sending daily P&L summary to Telegram...");
        const history = this.journal.getTrades
          ? this.journal.getTrades()
          : this.journal.trades || [];
        const todayTrades = history.filter((t) => {
          const tradeDate = new Date(t.openTime || t.closeTime);
          return tradeDate.toDateString() === new Date().toDateString();
        });
        const stats = this.pnlTracker.getStats();
        sendDailyPnLSummary(stats, todayTrades).catch(() => {});
      }

      if (this.isMarketClosing() && !this.tradeClosedAtMarketClose) {
        const activeTrade = this.pnlTracker.getActiveTrade();

        if (activeTrade) {
          console.log(
            "[Strategy] ⏰ Market closing in 1 minute - Closing active trade...",
          );

          // Get current price from last candle
          const candles3m = this.candleBuilder.getCandles("3m");
          const currentPrice =
            candles3m.length > 0
              ? candles3m[candles3m.length - 1].close
              : activeTrade.entry;

          // Close trade with MARKET_CLOSED reason
          const pnlUpdate = this.pnlTracker.closeTrade(
            "MARKET_CLOSED",
            currentPrice,
          );

          if (pnlUpdate) {
            this.journal.addTrade(pnlUpdate.trade);
            console.log(
              `[Strategy] ✓ Trade closed at market close | P&L: ${pnlUpdate.trade.pnl} (${pnlUpdate.trade.pnlPercent}%)`,
            );

            // Update trade in MongoDB
            if (pnlUpdate.trade._dbId) {
              dbService
                .updateTrade(pnlUpdate.trade._dbId, {
                  exit: {
                    price: pnlUpdate.trade.exitPrice,
                    time: new Date(pnlUpdate.trade.closeTime),
                    reason: "MARKET_CLOSED",
                  },
                  status: "CLOSED",
                  result: pnlUpdate.trade.result,
                  "pnl.points": pnlUpdate.trade.pnl,
                  "pnl.percentage": pnlUpdate.trade.pnlPercent,
                  closeReason: "MARKET_CLOSED",
                  "metadata.duration":
                    pnlUpdate.trade.closeTime - pnlUpdate.trade.openTime,
                })
                .then((result) => {
                  if (result.updated) {
                    console.log(
                      "[Strategy] ✓ Trade updated in MongoDB (Market Closed)",
                    );
                  }
                })
                .catch((err) => {
                  console.error(
                    "[Strategy] ✗ Trade update error:",
                    err.message,
                  );
                });
            }

            this.tradeClosedAtMarketClose = true;
          }
        }
      }
    }, 30000); // Check every 30 seconds

    console.log("[Strategy] ⏰ Market close monitoring started");
  }

  /**
   * Stop market close monitoring
   */
  stopMarketCloseMonitoring() {
    if (this.marketCloseCheckInterval) {
      clearInterval(this.marketCloseCheckInterval);
      this.marketCloseCheckInterval = null;
      console.log("[Strategy] ⏰ Market close monitoring stopped");
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

/**
 * Database Service Layer
 * Handles data persistence with graceful degradation
 */

const { isDBConnected } = require("./connection");
const { Candle, MarketData, Signal, Trade, Cache } = require("./models");

class DatabaseService {
  constructor() {
    this.symbol = "NIFTY50";
  }

  // ===== Candle Operations =====

  async saveCandles(timeframe, candles) {
    if (!isDBConnected()) return { saved: false, reason: "DB offline" };

    try {
      const candleData = candles.map((c) => ({
        symbol: this.symbol,
        timeframe,
        time: new Date(c.time),
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume || 0,
        metadata: c.metadata || {},
      }));

      const result = await Candle.bulkUpsertCandles(candleData);
      return { saved: true, count: candleData.length };
    } catch (err) {
      console.error("[DB] Error saving candles:", err.message);
      return { saved: false, error: err.message };
    }
  }

  async getCandles(timeframe, startDate, endDate) {
    if (!isDBConnected()) return [];

    try {
      return await Candle.getCandlesInRange(
        this.symbol,
        timeframe,
        startDate,
        endDate,
      );
    } catch (err) {
      console.error("[DB] Error loading candles:", err.message);
      return [];
    }
  }

  // ===== Market Data Operations =====

  async saveMarketData(data) {
    if (!isDBConnected()) return { saved: false, reason: "DB offline" };

    try {
      const marketData = {
        symbol: this.symbol,
        date: new Date(data.date || Date.now()),
        previousDay: data.previousDay,
        cpr: data.cpr,
        supportResistance: data.supportResistance,
        atr: data.atr,
        bias: data.bias,
      };

      const result = await MarketData.upsertMarketData(marketData);
      return { saved: true, data: result };
    } catch (err) {
      console.error("[DB] Error saving market data:", err.message);
      return { saved: false, error: err.message };
    }
  }

  async getLatestMarketData() {
    if (!isDBConnected()) return null;

    try {
      return await MarketData.getLatest(this.symbol);
    } catch (err) {
      console.error("[DB] Error loading market data:", err.message);
      return null;
    }
  }

  // ===== Signal Operations =====

  async saveSignal(signal, analysis, scoring) {
    if (!isDBConnected()) {
      console.log("[DB] Cannot save signal - DB offline");
      return { saved: false, reason: "DB offline" };
    }

    if (!signal || !analysis) {
      console.log("[DB] Cannot save signal - missing signal or analysis");
      return { saved: false, reason: "Missing signal or analysis data" };
    }

    try {
      console.log("[DB] Saving signal:", {
        type: signal.type,
        entry: signal.entry,
        source: signal.source,
        grade: scoring?.grade,
      });

      const signalData = new Signal({
        symbol: this.symbol,
        timestamp: new Date(signal.timestamp || Date.now()),
        type: signal.type,
        entry: signal.entry,
        stopLoss: signal.stopLoss,
        target: signal.target,
        riskReward: signal.riskReward,
        strikes: signal.strikes || {},
        analysis: {
          cpr: analysis.cpr || {},
          supportResistance: analysis.supportResistance || {},
          bias: analysis.bias || "NEUTRAL",
          narrowCPR: analysis.narrowCPR || false,
          cprWidthType: analysis.cprWidthType || "MODERATE",
          amZone: analysis.amZone || null,
          manipulation: analysis.manipulation || null,
          strongCandle: analysis.strongCandle || null,
          volumeSpike: analysis.volumeSpike || false,
          mtfConfirmed: analysis.mtfConfirmed || false,
          atr: analysis.atr || 0,
        },
        scoring: scoring || {},
        status: "GENERATED",
      });

      const result = await signalData.save();
      console.log("[DB] ✓ Signal saved successfully:", result._id);
      return { saved: true, signalId: result._id };
    } catch (err) {
      console.error("[DB] ✗ Error saving signal:", err.message);
      console.error("[DB] Error details:", err);
      return { saved: false, error: err.message };
    }
  }

  async getRecentSignals(limit = 10) {
    if (!isDBConnected()) return [];

    try {
      return await Signal.find({ symbol: this.symbol })
        .sort({ timestamp: -1 })
        .limit(limit)
        .lean();
    } catch (err) {
      console.error("[DB] Error loading signals:", err.message);
      return [];
    }
  }

  // ===== Trade Operations =====

  async saveTrade(trade, signalId = null) {
    if (!isDBConnected()) return { saved: false, reason: "DB offline" };

    if (!trade) {
      console.log("[DB] Cannot save trade - missing trade data");
      return { saved: false, reason: "Missing trade data" };
    }

    try {
      const tradeData = new Trade({
        symbol: this.symbol,
        signalId,
        type: trade.type,
        entry: {
          price: trade.entry,
          time: new Date(trade.openTime || trade.timestamp || Date.now()),
        },
        exit: trade.exit
          ? {
              price: trade.exit.price,
              time: new Date(trade.exit.time || trade.closeTime || Date.now()),
              reason: trade.exit.reason || trade.reason || null,
            }
          : undefined,
        stopLoss: trade.stopLoss,
        initialSL: trade.initialSL || trade.stopLoss,
        target: trade.target,
        t1: trade.t1,
        targets: trade.targets || [],
        targetPoints: trade.targetPoints || [],
        strikes: trade.strikes || {},
        optionEntry: trade.optionEntry ?? null,
        optionStopLoss: trade.optionStopLoss ?? null,
        optionTargets: trade.optionTargets || [],
        optionTargetPoints: trade.optionTargetPoints || [],
        optionSymbol: trade.optionSymbol || null,
        optionToken: trade.optionToken || null,
        riskReward: trade.riskReward,
        status: trade.status || "OPEN",
        score: trade.score,
        grade: trade.grade,
        result: null,
        pnl: { points: 0, amount: 0, percentage: 0 },
        metadata: {
          platform: "TRAPNEX",
          mode: "LIVE",
          source: trade.source || "SIGNAL",
        },
      });

      const result = await tradeData.save();
      console.log("[DB] ✓ Trade saved successfully:", result._id);
      return { saved: true, tradeId: result._id };
    } catch (err) {
      console.error("[DB] ✗ Error saving trade:", err.message);
      return { saved: false, error: err.message };
    }
  }

  async updateTrade(tradeId, updates) {
    if (!isDBConnected()) return { updated: false, reason: "DB offline" };

    try {
      const result = await Trade.findByIdAndUpdate(
        tradeId,
        { $set: updates },
        { new: true },
      );
      return { updated: true, trade: result };
    } catch (err) {
      console.error("[DB] Error updating trade:", err.message);
      return { updated: false, error: err.message };
    }
  }

  async getTradeStats() {
    if (!isDBConnected()) return null;

    try {
      return await Trade.getStats({ symbol: this.symbol });
    } catch (err) {
      console.error("[DB] Error loading trade stats:", err.message);
      return null;
    }
  }

  async getRecentTrades(limit = 20) {
    if (!isDBConnected()) return [];

    try {
      return await Trade.find({ symbol: this.symbol })
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean();
    } catch (err) {
      console.error("[DB] Error loading trades:", err.message);
      return [];
    }
  }

  async getLatestOpenTrade() {
    if (!isDBConnected()) return null;

    try {
      return await Trade.findOne({ symbol: this.symbol, status: "OPEN" })
        .sort({ "entry.time": -1, createdAt: -1 })
        .lean();
    } catch (err) {
      console.error("[DB] Error loading latest open trade:", err.message);
      return null;
    }
  }

  async getTradesWithFilter(filter, limit = 50) {
    if (!isDBConnected()) return [];

    try {
      return await Trade.find({ symbol: this.symbol, ...filter })
        .sort({ "entry.time": -1 })
        .limit(limit)
        .lean();
    } catch (err) {
      console.error("[DB] Error loading filtered trades:", err.message);
      return [];
    }
  }

  async getTradeStatsWithFilter(filter) {
    if (!isDBConnected()) return null;

    try {
      return await Trade.getStats({ symbol: this.symbol, ...filter });
    } catch (err) {
      console.error("[DB] Error loading filtered trade stats:", err.message);
      return null;
    }
  }

  // ===== Cache Operations =====

  async cacheFullState(state) {
    if (!isDBConnected()) return { cached: false, reason: "DB offline" };

    try {
      await Cache.setCache(
        `${this.symbol}:full_state`,
        "FULL_STATE",
        state,
        3600, // 1 hour TTL
      );
      return { cached: true };
    } catch (err) {
      console.error("[DB] Error caching state:", err.message);
      return { cached: false, error: err.message };
    }
  }

  async getCachedState() {
    if (!isDBConnected()) return null;

    try {
      return await Cache.getCache(`${this.symbol}:full_state`);
    } catch (err) {
      console.error("[DB] Error loading cached state:", err.message);
      return null;
    }
  }
}

module.exports = new DatabaseService();

/**
 * API Controllers
 */

const express = require('express');
const router = express.Router();
const dbService = require('../db/service');
const { sendTradeClosedSummary } = require('../services/telegram');

function normalizeTrade(trade) {
  if (!trade) return null;

  const entryPrice = trade.entry?.price ?? trade.entry ?? 0;
  const entryTime = trade.entry?.time ?? trade.openTime ?? trade.timestamp ?? trade.createdAt ?? null;
  const exitPrice = trade.exit?.price ?? trade.exitPrice ?? null;
  const exitTime = trade.exit?.time ?? trade.closeTime ?? null;
  const reason = trade.exit?.reason ?? trade.reason ?? null;
  const exits = trade.exits ?? (trade.exit ? [trade.exit] : []);
  const pnlPoints = typeof trade.pnl === 'number' ? trade.pnl : trade.pnl?.points ?? 0;
  const pnlPercent = trade.pnlPercent ?? trade.pnl?.percentage ?? 0;

  return {
    ...trade,
    id: trade.id || trade._id?.toString?.() || null,
    entry: entryPrice,
    entryPrice,
    entryTime,
    exitPrice,
    exitTime,
    reason,
    exits,
    pnl: pnlPoints,
    pnlPercent,
    openTime: trade.openTime ?? entryTime,
    closeTime: trade.closeTime ?? exitTime,
    target: trade.target ?? trade.targets?.[trade.targets.length - 1] ?? null,
    score: trade.score ?? 0,
    grade: trade.grade ?? null,
    targets: trade.targets ?? [],
    targetPoints: trade.targetPoints ?? [],
    targetsHit: trade.targetsHit ?? [],
    result:
      trade.result ||
      (pnlPoints > 0 ? 'WIN' : pnlPoints < 0 ? 'LOSS' : null),
  };
}

function buildGradeStats(trades) {
  return trades.reduce((acc, trade) => {
    const grade = trade.grade || 'Unknown';
    if (!acc[grade]) acc[grade] = { total: 0, wins: 0, pnl: 0 };
    acc[grade].total += 1;
    if (trade.result === 'WIN') acc[grade].wins += 1;
    acc[grade].pnl += trade.pnl || 0;
    return acc;
  }, {});
}

function normalizeStats(stats, trades = []) {
  const normalizedTrades = trades.map(normalizeTrade).filter(Boolean);
  const total = stats?.total ?? stats?.totalTrades ?? normalizedTrades.length ?? 0;
  const wins = stats?.wins ?? stats?.winners ?? normalizedTrades.filter((trade) => trade.result === 'WIN').length;
  const losses = stats?.losses ?? stats?.losers ?? Math.max(0, total - wins);
  const totalPnl = stats?.totalPnl ?? 0;
  const avgPnl = stats?.avgPnl ?? (total > 0 ? totalPnl / total : 0);

  return {
    ...stats,
    total,
    totalTrades: total,
    wins,
    losses,
    winRate: stats?.winRate ?? (total > 0 ? (wins / total) * 100 : 0),
    totalPnl,
    avgPnl,
    bestTrade: stats?.bestTrade ?? 0,
    worstTrade: stats?.worstTrade ?? 0,
    maxDrawdown: stats?.maxDrawdown ?? Math.abs(stats?.worstTrade ?? 0),
    byGrade: stats?.byGrade || buildGradeStats(normalizedTrades),
  };
}

function createControllers(strategyRunner, journal) {
  // Get current state (candles, analysis, trade)
  router.get('/state', (req, res) => {
    res.json(strategyRunner.getState());
  });
  
  // Get cached state (for offline viewing)
  router.get('/state/cached', async (req, res) => {
    try {
      const cachedState = await dbService.getCachedState();
      if (cachedState) {
        res.json({ cached: true, ...cachedState });
      } else {
        // Fallback to current state
        res.json({ cached: false, ...strategyRunner.getState() });
      }
    } catch (err) {
      res.status(500).json({ error: 'Failed to load cached state' });
    }
  });

  // Get candles for a specific timeframe
  router.get('/candles/:timeframe', (req, res) => {
    const tf = req.params.timeframe;
    if (!['1m', '5m', '15m'].includes(tf)) {
      return res.status(400).json({ error: 'Invalid timeframe' });
    }
    const candles = strategyRunner.candleBuilder.getCandles(tf);
    res.json({ timeframe: tf, candles });
  });

  // Get analysis
  router.get('/analysis', (req, res) => {
    const analysis = strategyRunner.lastAnalysis;
    res.json(analysis || { message: 'No analysis yet' });
  });

  // Get active trade
  router.get('/trade', (req, res) => {
    const trade = strategyRunner.pnlTracker.getActiveTrade();
    res.json(trade || { message: 'No active trade' });
  });

  // Close active trade manually
  router.post('/trade/close', async (req, res) => {
    const lastPrice = strategyRunner.candleBuilder.getLastPrice();
    if (!lastPrice) return res.status(400).json({ error: 'No price data' });

    const result = strategyRunner.pnlTracker.closeTrade('MANUAL', lastPrice);

    if (result) {
      journal.addTrade(result.trade);
      sendTradeClosedSummary(result.trade).catch(() => {});

      if (result.trade._dbId) {
        await dbService.updateTrade(result.trade._dbId, {
          exit: {
            price: result.trade.exitPrice,
            time: new Date(result.trade.closeTime),
            reason: result.trade.reason,
          },
          exits: Array.isArray(result.trade.exits)
            ? result.trade.exits.map((exit) => ({
                price: exit.price,
                time: new Date(exit.time || result.trade.closeTime),
                reason: exit.reason || result.trade.reason,
              }))
            : [{
                price: result.trade.exitPrice,
                time: new Date(result.trade.closeTime),
                reason: result.trade.reason,
              }],
          status: 'CLOSED',
          result: result.trade.result,
          'pnl.points': result.trade.pnl,
          'pnl.percentage': result.trade.pnlPercent,
          closeReason: result.trade.reason,
          'metadata.duration': result.trade.closeTime - result.trade.openTime,
        });
      }

      return res.json(result);
    }

    const dbOpenTrade = await dbService.getLatestOpenTrade();
    if (!dbOpenTrade) {
      return res.status(400).json({ error: 'No active trade to close' });
    }

    const exitRecord = {
      price: lastPrice,
      time: new Date(),
      reason: 'MANUAL',
    };

    const closedTrade = {
      ...dbOpenTrade,
      exitPrice: lastPrice,
      exit: exitRecord,
      exits: [...(dbOpenTrade.exits || []), exitRecord],
      closeTime: Date.now(),
      reason: 'MANUAL',
      status: 'CLOSED',
      pnl: dbOpenTrade.type === 'CALL'
        ? Math.round((lastPrice - (dbOpenTrade.entry?.price ?? dbOpenTrade.entry ?? 0)) * 100) / 100
        : Math.round(((dbOpenTrade.entry?.price ?? dbOpenTrade.entry ?? 0) - lastPrice) * 100) / 100,
    };
    closedTrade.pnlPercent = closedTrade.entry?.price || closedTrade.entry
      ? Math.round((closedTrade.pnl / (closedTrade.entry?.price ?? closedTrade.entry)) * 10000) / 100
      : 0;
    closedTrade.result = closedTrade.pnl >= 0 ? 'WIN' : 'LOSS';

    await dbService.updateTrade(dbOpenTrade._id, {
      exit: exitRecord,
      exits: closedTrade.exits,
      status: 'CLOSED',
      reason: 'MANUAL',
      result: closedTrade.result,
      'pnl.points': closedTrade.pnl,
      'pnl.percentage': closedTrade.pnlPercent,
      closeReason: 'MANUAL',
      'metadata.duration': closedTrade.closeTime - (dbOpenTrade.entry?.time ? new Date(dbOpenTrade.entry.time).getTime() : new Date(dbOpenTrade.createdAt || Date.now()).getTime()),
    });

    journal.addTrade(closedTrade);
    sendTradeClosedSummary(closedTrade).catch(() => {});
    return res.json({ event: 'CLOSED', trade: closedTrade });
  });

  // Trade journal
  router.get('/journal', async (req, res) => {
    try {
      const limit = parseInt(req.query.limit) || 50;
      let trades = journal.getTrades(limit).map(normalizeTrade);
      let stats = normalizeStats(journal.getStats(), trades);

      if (trades.length === 0) {
        const persistedTrades = await dbService.getTradesWithFilter({}, limit);
        trades = persistedTrades.map(normalizeTrade);
        const persistedStats = await dbService.getTradeStatsWithFilter({});
        stats = normalizeStats(persistedStats, trades);
      }

      res.json({ trades, stats });
    } catch (err) {
      res.status(500).json({ error: 'Failed to load journal' });
    }
  });

  // Journal stats
  router.get('/journal/stats', async (req, res) => {
    try {
      const trades = journal.getTrades(200).map(normalizeTrade);
      if (trades.length > 0) {
        return res.json(normalizeStats(journal.getStats(), trades));
      }

      const persistedTrades = (await dbService.getTradesWithFilter({}, 200)).map(normalizeTrade);
      const persistedStats = await dbService.getTradeStatsWithFilter({});
      res.json(normalizeStats(persistedStats, persistedTrades));
    } catch (err) {
      res.status(500).json({ error: 'Failed to load journal stats' });
    }
  });

  // Set previous day HLC
  router.post('/hlc', (req, res) => {
    const { high, low, close } = req.body;
    if (!high || !low || !close) {
      return res.status(400).json({ error: 'high, low, close required' });
    }
    strategyRunner.setPreviousDayHLC(
      parseFloat(high),
      parseFloat(low),
      parseFloat(close)
    );
    res.json({ message: 'HLC set', hlc: strategyRunner.previousDayHLC });
  });

  // Test Telegram Alert
  router.post('/test-telegram', async (req, res) => {
    const { sendAlert } = require('../services/telegram');
    const mockSignal = {
      type: 'CALL',
      entry: 22500,
      stopLoss: 22450,
      target: 22600,
      riskReward: 2.0,
      strikes: {
        atm: { strike: 22500 },
        itm: { strike: 22400 },
        otm: { strike: 22600 },
      }
    };
    const mockScoring = { grade: 'A', score: 9 };
    
    try {
      await sendAlert(mockSignal, mockScoring);
      res.json({ message: 'Test alert sent successfully' });
    } catch (error) {
      res.status(500).json({ error: 'Failed to send alert', details: error.message });
    }
  });
  
  // ===== Database Endpoints =====
  
  // Get historical candles from database
  router.get('/db/candles/:timeframe', async (req, res) => {
    try {
      const { timeframe } = req.params;
      const { start, end } = req.query;
      
      const startDate = start ? new Date(start) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const endDate = end ? new Date(end) : new Date();
      
      const candles = await dbService.getCandles(timeframe, startDate, endDate);
      res.json({ timeframe, count: candles.length, candles });
    } catch (err) {
      res.status(500).json({ error: 'Failed to load candles from database' });
    }
  });
  
  // Get recent signals
  router.get('/db/signals', async (req, res) => {
    try {
      const limit = parseInt(req.query.limit) || 10;
      const signals = await dbService.getRecentSignals(limit);
      res.json({ count: signals.length, signals });
    } catch (err) {
      res.status(500).json({ error: 'Failed to load signals from database' });
    }
  });
  
  // Get recent trades from database
  router.get('/db/trades', async (req, res) => {
    try {
      const limit = parseInt(req.query.limit) || 50;
      const { startDate, endDate } = req.query;
      
      const filter = {};
      if (startDate || endDate) {
        filter['entry.time'] = {};
        if (startDate) filter['entry.time'].$gte = new Date(startDate);
        if (endDate) filter['entry.time'].$lte = new Date(endDate);
      }
      
      const trades = await dbService.getTradesWithFilter(filter, limit);
      res.json(trades.map(normalizeTrade));
    } catch (err) {
      res.status(500).json({ error: 'Failed to load trades from database' });
    }
  });

  // Get trade statistics
  router.get('/db/trades/stats', async (req, res) => {
    try {
      const { startDate, endDate } = req.query;
      
      const filter = {};
      if (startDate || endDate) {
        filter['entry.time'] = {};
        if (startDate) filter['entry.time'].$gte = new Date(startDate);
        if (endDate) filter['entry.time'].$lte = new Date(endDate);
      }
      
      const trades = await dbService.getTradesWithFilter(filter, 500);
      const stats = await dbService.getTradeStatsWithFilter(filter);
      res.json(normalizeStats(stats || {}, trades));
    } catch (err) {
      res.status(500).json({ error: 'Failed to load trade stats' });
    }
  });
  
  // Get market data (CPR, S/R levels)
  router.get('/db/market-data', async (req, res) => {
    try {
      const marketData = await dbService.getLatestMarketData();
      if (marketData) {
        res.json(marketData);
      } else {
        res.status(404).json({ error: 'No market data available' });
      }
    } catch (err) {
      res.status(500).json({ error: 'Failed to load market data from database' });
    }
  });

  // Health check
  router.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      uptime: process.uptime(),
      timestamp: Date.now(),
    });
  });

  return router;
}

module.exports = createControllers;

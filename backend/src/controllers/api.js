/**
 * API Controllers
 */

const express = require('express');
const router = express.Router();
const dbService = require('../db/service');

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
  router.post('/trade/close', (req, res) => {
    const lastPrice = strategyRunner.candleBuilder.getLastPrice();
    if (!lastPrice) return res.status(400).json({ error: 'No price data' });

    const result = strategyRunner.pnlTracker.closeTrade('MANUAL', lastPrice);
    if (result) {
      journal.addTrade(result.trade);
      res.json(result);
    } else {
      res.status(400).json({ error: 'No active trade to close' });
    }
  });

  // Trade journal
  router.get('/journal', (req, res) => {
    const limit = parseInt(req.query.limit) || 50;
    res.json({
      trades: journal.getTrades(limit),
      stats: journal.getStats(),
    });
  });

  // Journal stats
  router.get('/journal/stats', (req, res) => {
    res.json(journal.getStats());
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
      res.json(trades);
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
      
      const stats = await dbService.getTradeStatsWithFilter(filter);
      res.json(stats || {});
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

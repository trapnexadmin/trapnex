/**
 * Trapnex Backend Server
 * Real-time trading platform with AM + CPR strategy
 */

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const { WebSocketServer } = require("ws");
const http = require("http");

const { connectDB } = require("./db/connection");
const dbService = require("./db/service");
const CandleBuilder = require("./services/candleBuilder");
const PnLTracker = require("./services/pnl");
const TradeJournal = require("./services/journal");
const StrategyRunner = require("./jobs/strategyRunner");
const FeedFactory = require("./websocket/feedFactory");
const createControllers = require("./controllers/api");

const PORT = process.env.PORT || 3001;

// ---- Initialize Services ----
const candleBuilder = new CandleBuilder(100);
const pnlTracker = new PnLTracker();
const journal = new TradeJournal();
const strategyRunner = new StrategyRunner(candleBuilder, pnlTracker, journal);

// Store live feed reference for symbol switching
let liveFeed = null;

// ---- Express App ----
const app = express();
app.use(cors());
app.use(express.json());
app.use("/api", createControllers(strategyRunner, journal));

// ---- HTTP + WebSocket Server ----
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });

const clients = new Set();

wss.on("connection", (ws) => {
  clients.add(ws);
  console.log(`[WS] Client connected (${clients.size} total)`);

  // Send initial state
  ws.send(JSON.stringify({ type: "INIT", data: strategyRunner.getState() }));

  ws.on("message", async (message) => {
    try {
      const data = JSON.parse(message);

      if (data.type === "CHANGE_SYMBOL") {
        console.log(`[WS] Symbol change request:`, data.data);

        // Get instrument token for the selected symbol
        const symbolData = data.data;
        const newToken = symbolData.token;

        if (liveFeed && typeof liveFeed.changeInstrument === "function") {
          const success = await liveFeed.changeInstrument(
            newToken,
            symbolData.exchange,
          );

          if (success) {
            console.log(`[WS] ✓ Symbol changed to ${symbolData.label}`);
            broadcast("SYMBOL_CHANGED", {
              symbol: symbolData.label,
              token: newToken,
              exchange: symbolData.exchange,
            });
          } else {
            console.error(`[WS] ✗ Failed to change symbol`);
            ws.send(
              JSON.stringify({
                type: "ERROR",
                message: "Failed to change symbol",
              }),
            );
          }
        } else {
          console.log(`[WS] ⚠ Symbol change not supported in demo mode`);
          ws.send(
            JSON.stringify({
              type: "ERROR",
              message: "Symbol change not available in demo mode",
            }),
          );
        }
      }
    } catch (err) {
      console.error(`[WS] Message handling error:`, err.message);
    }
  });

  ws.on("close", () => {
    clients.delete(ws);
    console.log(`[WS] Client disconnected (${clients.size} total)`);
  });
});

function broadcast(type, data) {
  const msg = JSON.stringify({ type, data });
  for (const client of clients) {
    if (client.readyState === 1) {
      client.send(msg);
    }
  }
}

function normalizeTradeEventTrade(trade) {
  if (!trade) return null;

  return {
    ...trade,
    entryPrice: trade.entry,
    entryTime: trade.openTime ?? trade.timestamp ?? null,
    pnlPercent: trade.pnlPercent ?? 0,
  };
}

// ---- Demo Mode (simulated data when no Upstox token) ----
function startDemoMode() {
  console.log("[Demo] Starting demo mode with simulated data...");

  // Set previous day HLC for NIFTY-like data
  strategyRunner.setPreviousDayHLC(22550, 22350, 22480);

  let price = 22480;
  let tick = 0;
  const baseTime = new Date();
  baseTime.setHours(9, 15, 0, 0);

  // Generate initial historical candles
  for (let i = 0; i < 60; i++) {
    const t = baseTime.getTime() + i * 60000;
    const change = (Math.random() - 0.48) * 15;
    price += change;
    const vol = Math.floor(Math.random() * 10000) + 5000;
    candleBuilder.processTick(price, vol, t);
  }

  // Simulate live ticks
  const interval = setInterval(() => {
    tick++;
    const volatility = Math.sin(tick / 50) * 5 + 10;
    const change = (Math.random() - 0.48) * volatility;
    price = Math.max(22200, Math.min(22700, price + change));
    const vol = Math.floor(Math.random() * 10000) + 3000;
    const timestamp = Date.now();

    // Calculate candle close time (1-minute candles)
    const candleStart = Math.floor(timestamp / 60000) * 60000;
    const candleClose = candleStart + 60000;
    const closingSeconds = Math.max(
      0,
      Math.ceil((candleClose - timestamp) / 1000),
    );

    const result = strategyRunner.processTick({
      price: Math.round(price * 100) / 100,
      volume: vol,
      timestamp: timestamp,
    });

    // Broadcast candle updates
    broadcast("TICK", {
      price: Math.round(price * 100) / 100,
      volume: vol,
      candles: candleBuilder.getAllCandles(),
      activeTrade: pnlTracker.getActiveTrade(),
      closingSeconds: closingSeconds,
      candleCloseTime: candleClose,
    });

    if (result?.pnlUpdate) {
      broadcast("TRADE_UPDATE", {
        ...result.pnlUpdate,
        trade: normalizeTradeEventTrade(result.pnlUpdate.trade),
        activeTrade: pnlTracker.getActiveTrade(),
      });
    }
  }, 1000);

  // Set up analysis callbacks BEFORE starting periodic analysis
  strategyRunner.onAnalysis = (analysis) => {
    broadcast("ANALYSIS", analysis);
  };

  strategyRunner.onSignal = (signal, scoring) => {
    broadcast("SIGNAL", { signal, scoring });
  };

  // Run initial analysis with CPR data
  console.log("[Demo] Running initial analysis...");
  strategyRunner.runAnalysis();

  // Run analysis every 15 seconds
  strategyRunner.startPeriodicAnalysis(15000);

  return interval;
}

// ---- Live Mode (Multi-Platform WebSocket) ----
async function startLiveMode() {
  const { platform, config } = FeedFactory.getConfigFromEnv();

  console.log(`[Platform] ${platform.toUpperCase()}`);

  const feed = FeedFactory.createFeed(platform, config);
  liveFeed = feed; // Store for symbol switching

  let lastCandleSaveTime = 0;
  let lastCacheTime = 0;
  let signalTradeIdMap = new Map(); // Track signal to trade mapping

  feed.onPreviousDayHLC = async ({ high, low, close }) => {
    strategyRunner.setPreviousDayHLC(high, low, close);

    // Save market data to DB
    await dbService.saveMarketData({
      date: new Date(),
      previousDay: { high, low, close },
    });
  };

  feed.onHistoricalCandles = async (candlesByTimeframe) => {
    // Check for empty data and try DB fallback
    const emptyTimeframes = [];

    for (const [timeframe, candles] of Object.entries(candlesByTimeframe)) {
      if (candles.length > 0) {
        candleBuilder.loadHistorical(timeframe, candles);
        // Save historical candles to DB
        await dbService.saveCandles(timeframe, candles);
        console.log(
          `[Live] ✓ Loaded ${candles.length} ${timeframe} candles from API`,
        );
      } else {
        emptyTimeframes.push(timeframe);
      }
    }

    // Try to load empty timeframes from database
    if (emptyTimeframes.length > 0) {
      console.log(
        `[Live] ⚠ API returned no data for ${emptyTimeframes.join(", ")}, trying database fallback...`,
      );

      const now = new Date();
      const startOfDay = new Date(now);
      startOfDay.setHours(0, 0, 0, 0);

      for (const timeframe of emptyTimeframes) {
        try {
          const dbCandles = await dbService.getCandles(
            timeframe,
            startOfDay,
            now,
          );
          if (dbCandles.length > 0) {
            // Convert DB format to candle format
            const formattedCandles = dbCandles.map((c) => ({
              time: new Date(c.time).getTime(),
              open: c.open,
              high: c.high,
              low: c.low,
              close: c.close,
              volume: c.volume || 0,
            }));

            candleBuilder.loadHistorical(timeframe, formattedCandles);
            candlesByTimeframe[timeframe] = formattedCandles;
            console.log(
              `[Live] ✓ Loaded ${formattedCandles.length} ${timeframe} candles from database`,
            );
          } else {
            console.log(`[Live] ⚠ No cached ${timeframe} candles in database`);
          }
        } catch (err) {
          console.error(
            `[Live] ✗ Failed to load ${timeframe} from database:`,
            err.message,
          );
        }
      }
    }

    strategyRunner.runAnalysis();

    const state = strategyRunner.getState();
    broadcast("INIT", state);

    // Also broadcast analysis separately to ensure CPR lines are drawn
    if (state.analysis) {
      console.log("[Live] Broadcasting CPR analysis:", {
        cpr: state.analysis.cpr,
        bias: state.analysis.bias,
      });
      broadcast("ANALYSIS", state.analysis);
    }

    // Cache initial state
    await dbService.cacheFullState(state);

    console.log(
      `[Live] Historical candles ready: ${Object.entries(candlesByTimeframe)
        .map(([timeframe, candles]) => `${timeframe}=${candles.length}`)
        .join(", ")}`,
    );
  };

  feed.onTick = async (tick) => {
    const result = strategyRunner.processTick(tick);

    broadcast("TICK", {
      price: tick.price,
      volume: tick.volume,
      candles: candleBuilder.getAllCandles(),
      activeTrade: pnlTracker.getActiveTrade(),
      closingSeconds: tick.closingSeconds || 0,
      candleCloseTime: tick.candleCloseTime || null,
    });

    if (result?.pnlUpdate) {
      broadcast("TRADE_UPDATE", {
        ...result.pnlUpdate,
        trade: normalizeTradeEventTrade(result.pnlUpdate.trade),
        activeTrade: pnlTracker.getActiveTrade(),
      });
    }

    // Save candles periodically (every 5 minutes)
    const now = Date.now();
    if (now - lastCandleSaveTime > 5 * 60 * 1000) {
      const allCandles = candleBuilder.getAllCandles();
      for (const [timeframe, candles] of Object.entries(allCandles)) {
        if (candles.length > 0) {
          await dbService.saveCandles(timeframe, candles.slice(-100)); // Save last 100 candles
        }
      }
      lastCandleSaveTime = now;
    }

    // Cache state periodically (every 30 seconds)
    if (now - lastCacheTime > 30 * 1000) {
      await dbService.cacheFullState(strategyRunner.getState());
      lastCacheTime = now;
    }
  };

  // Set up analysis callbacks BEFORE connecting feed
  strategyRunner.onAnalysis = async (analysis) => {
    broadcast("ANALYSIS", analysis);

    // Save market data with analysis
    if (analysis && analysis.cpr) {
      await dbService.saveMarketData({
        date: new Date(),
        cpr: analysis.cpr,
        supportResistance: analysis.supportResistance,
        atr: analysis.atr,
        bias: analysis.bias,
      });
    }
  };

  strategyRunner.onSignal = async (signal, scoring) => {
    broadcast("SIGNAL", { signal, scoring });

    // Save signal to DB
    const analysis = strategyRunner.lastAnalysis;
    const result = await dbService.saveSignal(signal, analysis, scoring);

    if (result.saved && result.signalId) {
      // Track signal ID for later trade association
      signalTradeIdMap.set(signal.timestamp, result.signalId);
      console.log(`[DB] Signal saved: ${result.signalId}`);
    }
  };

  // Start periodic analysis and connect feed
  strategyRunner.startPeriodicAnalysis(15000);
  feed.connect();
}

// ---- Start Server ----
server.listen(PORT, async () => {
  // Connect to MongoDB
  await connectDB();

  const selectedPlatform = process.env.MARKET_PLATFORM || "angelone";
  const hasCredentials = FeedFactory.hasCredentials(selectedPlatform);

  console.log(`
  ╔══════════════════════════════════════╗
  ║         TRAPNEX Trading Engine       ║
  ║     AM + CPR Strategy Platform       ║
  ╠══════════════════════════════════════╣
  ║  HTTP:  http://localhost:${PORT}        ║
  ║  WS:    ws://localhost:${PORT}/ws       ║
  ║  Platform: ${selectedPlatform.toUpperCase().padEnd(26)}║
  ╚══════════════════════════════════════╝
  `);

  if (hasCredentials) {
    console.log(`[Mode] Live (${selectedPlatform.toUpperCase()} WebSocket)`);
    await startLiveMode();
  } else {
    console.log("[Mode] Demo (Simulated Data)");
    console.log(
      `[Info] Set ${selectedPlatform.toUpperCase()} credentials in .env to enable live mode`,
    );
    startDemoMode();
  }
});

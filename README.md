# Trapnex — Smart Money Trading Platform

A real-time NIFTY intraday trading platform using **AM (Accumulation-Manipulation) + CPR (Central Pivot Range)** strategy.

**Multi-Platform Support:** TradingView, AngelOne, Upstox, Zerodha

## Architecture

```
trapnex/
├── backend/          Node.js + Express + WebSocket
│   └── src/
│       ├── services/     CPR, AM, Strategy, Scoring, PnL, Options
│       ├── websocket/    Multi-Platform Feed (AngelOne/Upstox/Zerodha)
│       ├── jobs/         Strategy Runner
│       └── controllers/  REST API
└── frontend/         React + Vite + TailwindCSS
    └── src/
        ├── components/   Dashboard UI (Chart, Signal, PnL, CPR, etc.)
        └── hooks/        WebSocket connection
```

## Features

- 🔄 **Multi-Platform Support**: TradingView, AngelOne, Upstox, Zerodha
- 📊 **Real-Time Data**: Live market feed with auto-reconnection
- 🎯 **Smart Strategy**: AM + CPR with intelligent scoring
- 📈 **Live Charts**: Real-time candlestick visualization
- 💰 **PnL Tracking**: Trade journal and performance analytics
- 🎮 **Demo Mode**: Test strategies with simulated data (works instantly with TradingView)

### Frontend
```bash
cd frontend
npm install
npm run dev
```

## Platform Configuration

✅ **Supported & Ready to Use:**

| Platform | Cost | Setup Time | Status | Demo Mode |
|----------|------|-----------|--------|-----------|
| **TradingView** (Recommended) | Free | 0 min | ✅ Ready | ✅ Built-in |
| **AngelOne** | Free | 5 min | ✅ Ready | ❌ Needs Creds |
| **Upstox** | Free | 5 min | ✅ Ready | ❌ Needs Creds |
| **Zerodha** | Free | 10 min | ✅ Ready | ❌ Needs Creds |

**Recommended:** Start with TradingView - works instantly without any credentials!

**Detailed Setup Guides:** 
- [TradingView Setup](TRADINGVIEW_SETUP.md) - **Easiest option!**
- [All Platforms](PLATFORM_SETUP.md)
- [Quick Platform Switch](SWITCH_PLATFORMS.md)

### Quick Config

```env
# Choose platform (tradingview/angelone/upstox/zerodha)
MARKET_PLATFORM=tradingview

# TradingView (Recommended - Works Instantly!)
TRADINGVIEW_SYMBOL=NSE:NIFTY  # or BINANCE:BTCUSDT, NASDAQ:AAPL, etc.
TRADINGVIEW_API_KEY=          # Optional - demo mode works without this

# AngelOne
ANGELONE_API_KEY=your_api_key
ANGELONE_CLIENT_ID=your_client_id
ANGELONE_PASSWORD=your_password
```

**Demo Mode:** If no credentials are configured, the system runs in demo mode with simulated NIFTY data.

Open http://localhost:5173

## Strategy Logic

- **CPR**: Pivot = (H+L+C)/3, BC = (H+L)/2, TC = Pivot + (Pivot - BC)
- **AM Detection**: Consolidation → Manipulation (fake breakout) → Entry
- **Scoring**: Narrow CPR (+2), AM Zone (+2), Manipulation (+3), Strong Candle (+2), Volume Spike (+1)
- **Only trades A+ setups** (score ≥ 8)

## Deployment

- **Backend**: Deploy to Render/Railway (Node.js)
- **Frontend**: Deploy to Vercel (Vite build)

Set `VITE_WS_URL` environment variable for production WebSocket URL.

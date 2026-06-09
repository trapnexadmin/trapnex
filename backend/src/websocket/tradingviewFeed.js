/**
 * TradingView Market Data Feed
 * Demo mode implementation with simulated market data
 * 
 * Note: TradingView's real-time WebSocket API requires partner access (not publicly available).
 * This implementation provides realistic price simulation for testing and development.
 * For real market data, use AngelOne, Upstox, or Zerodha platforms.
 */

class TradingViewFeed {
  /**
   * @param {string} symbol - Trading symbol (e.g., 'NSE:NIFTY', 'BINANCE:BTCUSDT')
   * @param {string} apiKey - TradingView API key (if available)
   * @param {object} options - Additional options
   */
  constructor(symbol = 'NSE:NIFTY', apiKey = null, options = {}) {
    this.symbol = symbol;
    this.apiKey = apiKey;
    this.options = options;
    this.ws = null;
    this.onTick = null;
    this.isConnected = false;
    this.demoInterval = null;
    
    console.log(`[TradingView] Initialized for symbol: ${symbol}`);
    console.log('[TradingView] Note: Using demo mode (TradingView WebSocket requires partner access)');
  }

  /**
   * Connect to TradingView's WebSocket for real-time data
   * Note: TradingView WebSocket API is not publicly accessible (requires partner access)
   * We use demo mode instead for realistic simulated data
   */
  connect() {
    console.log('[TradingView] Initializing market data feed...');
    console.log('[TradingView] ℹ️  TradingView WebSocket API requires partner access');
    console.log('[TradingView] ℹ️  Using demo mode with realistic price simulation');
    console.log('[TradingView] ℹ️  For real data, use AngelOne/Upstox/Zerodha platforms');
    
    // TradingView WebSocket is not publicly accessible
    // Start demo mode immediately
    this.startDemoMode();
  }

  /**
   * Start demo mode with simulated data
   */
  startDemoMode() {
    if (this.demoInterval) {
      console.log('[TradingView] Demo mode already running');
      return;
    }

    console.log('[TradingView] ✓ Demo mode started');
    console.log(`[TradingView] Symbol: ${this.symbol}`);
    console.log('[TradingView] Generating realistic price movements...');
    
    let price = 22480;
    const baseVolume = 5000;
    let tick = 0;
    
    const interval = setInterval(() => {
      tick++;
      
      // Simulate realistic price movement with trends
      const trendFactor = Math.sin(tick / 100) * 20; // Long-term trend
      const volatility = 10 + Math.random() * 5;
      const change = (Math.random() - 0.48) * volatility + trendFactor * 0.1;
      price += change;
      
      // Keep price in reasonable range
      price = Math.max(22200, Math.min(22700, price));
      
      const tickData = {
        price: Math.round(price * 100) / 100,
        volume: Math.floor(baseVolume + Math.random() * baseVolume),
        change: Math.round(change * 100) / 100,
        changePercent: Math.round((change / price) * 10000) / 100,
        timestamp: Date.now(),
      };

      if (this.onTick) {
        this.onTick(tickData);
      }
    }, 1000);

    // Store interval for cleanup
    this.demoInterval = interval;
    this.isConnected = true;
  }

  /**
   * Disconnect and cleanup
   */
  disconnect() {
    console.log('[TradingView] Disconnecting...');
    
    if (this.demoInterval) {
      clearInterval(this.demoInterval);
      this.demoInterval = null;
    }
    
    this.isConnected = false;
  }

  /**
   * Change symbol (for demo mode display purposes)
   */
  changeSymbol(newSymbol) {
    console.log(`[TradingView] Symbol changed to ${newSymbol}`);
    this.symbol = newSymbol;
  }
}

module.exports = TradingViewFeed;

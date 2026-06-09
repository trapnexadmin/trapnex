/**
 * Market Data Feed Factory
 * Creates and configures the appropriate feed based on platform selection
 */

const UpstoxFeed = require('./upstoxFeed');
const AngelOneFeed = require('./angeloneFeed');
const ZerodhaFeed = require('./zerodhaFeed');
const TradingViewFeed = require('./tradingviewFeed');

class FeedFactory {
  /**
   * Create a market data feed based on platform
   * @param {string} platform - 'angelone', 'upstox', or 'zerodha'
   * @param {object} config - Platform-specific configuration
   * @returns {Object} Feed instance with standardized interface
   */
  static createFeed(platform, config) {
    const platformLower = (platform || 'angelone').toLowerCase();

    console.log(`[FeedFactory] Creating feed for platform: ${platformLower}`);

    switch (platformLower) {
      case 'angelone':
      case 'angel':
        return new AngelOneFeed(
          config.apiKey,
          config.clientId,
          config.password,
          config.totpSecret,
          config.instrumentToken
        );

      case 'upstox':
        return new UpstoxFeed(
          config.accessToken,
          config.instrumentKey
        );

      case 'zerodha':
      case 'kite':
        return new ZerodhaFeed(
          config.apiKey,
          config.accessToken,
          config.instrumentToken
        );

      case 'tradingview':
      case 'tv':
        return new TradingViewFeed(
          config.symbol,
          config.apiKey,
          config.options
        );

      default:
        throw new Error(`Unsupported platform: ${platform}. Use 'angelone', 'upstox', 'zerodha', or 'tradingview'`);
    }
  }

  /**
   * Get platform configuration from environment variables
   * @returns {object} { platform, config }
   */
  static getConfigFromEnv() {
    const platform = process.env.MARKET_PLATFORM || 'angelone';

    const configs = {
      angelone: {
        apiKey: process.env.ANGELONE_API_KEY,
        clientId: process.env.ANGELONE_CLIENT_ID,
        password: process.env.ANGELONE_PASSWORD,
        totpSecret: process.env.ANGELONE_TOTP_SECRET,
        instrumentToken: process.env.ANGELONE_INSTRUMENT_TOKEN || '99926000', // NIFTY 50
      },
      upstox: {
        accessToken: process.env.UPSTOX_ACCESS_TOKEN,
        instrumentKey: process.env.UPSTOX_INSTRUMENT_KEY || 'NSE_INDEX|Nifty 50',
      },
      zerodha: {
        apiKey: process.env.ZERODHA_API_KEY,
        accessToken: process.env.ZERODHA_ACCESS_TOKEN,
        instrumentToken: process.env.ZERODHA_INSTRUMENT_TOKEN || '256265', // NIFTY 50
      },
      tradingview: {
        symbol: process.env.TRADINGVIEW_SYMBOL || 'NSE:NIFTY',
        apiKey: process.env.TRADINGVIEW_API_KEY,
        options: {
          resolution: process.env.TRADINGVIEW_RESOLUTION || '1',
        },
      },
    };

    const config = configs[platform.toLowerCase()] || configs.angelone;
    
    // Validate and show warnings
    this.validateConfig(platform, config);

    return {
      platform: platform.toLowerCase(),
      config: config,
    };
  }

  /**
   * Validate platform configuration
   */
  static validateConfig(platform, config) {
    const platformLower = platform.toLowerCase();
    
    switch (platformLower) {
      case 'angelone':
      case 'angel':
        if (!config.apiKey) console.warn('[FeedFactory] ⚠️  Missing ANGELONE_API_KEY');
        if (!config.clientId) console.warn('[FeedFactory] ⚠️  Missing ANGELONE_CLIENT_ID');
        if (!config.password) console.warn('[FeedFactory] ⚠️  Missing ANGELONE_PASSWORD');
        if (!config.totpSecret) console.warn('[FeedFactory] ⚠️  Missing ANGELONE_TOTP_SECRET');
        break;
      case 'upstox':
        if (!config.accessToken) console.warn('[FeedFactory] ⚠️  Missing UPSTOX_ACCESS_TOKEN');
        break;
      case 'zerodha':
        if (!config.apiKey) console.warn('[FeedFactory] ⚠️  Missing ZERODHA_API_KEY');
        if (!config.accessToken) console.warn('[FeedFactory] ⚠️  Missing ZERODHA_ACCESS_TOKEN');
        break;
      case 'tradingview':
      case 'tv':
        if (!config.symbol) console.warn('[FeedFactory] ⚠️  Missing TRADINGVIEW_SYMBOL, using default: NSE:NIFTY');
        if (!config.apiKey) console.warn('[FeedFactory] ℹ️  No TRADINGVIEW_API_KEY - will use demo mode');
        break;
    }
  }

  /**
   * Check if platform credentials are configured
   * @param {string} platform
   * @returns {boolean}
   */
  static hasCredentials(platform) {
    const platformLower = (platform || 'angelone').toLowerCase();

    switch (platformLower) {
      case 'angelone':
      case 'angel':
        return !!(
          process.env.ANGELONE_API_KEY &&
          process.env.ANGELONE_CLIENT_ID &&
          process.env.ANGELONE_PASSWORD &&
          process.env.ANGELONE_TOTP_SECRET
        );

      case 'upstox':
        return !!process.env.UPSTOX_ACCESS_TOKEN;

      case 'zerodha':
      case 'kite':
        return !!(
          process.env.ZERODHA_API_KEY &&
          process.env.ZERODHA_ACCESS_TOKEN
        );

      case 'tradingview':
      case 'tv':
        // TradingView can work with just a symbol (demo mode)
        // or with API key for live data
        return true; // Always return true, will fallback to demo if no API key

      default:
        return false;
    }
  }
}

module.exports = FeedFactory;

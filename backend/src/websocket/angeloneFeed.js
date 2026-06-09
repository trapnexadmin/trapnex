/**
 * AngelOne (SmartAPI) WebSocket Market Feed
 * Connects to AngelOne SmartAPI for live market data
 */

const { SmartAPI, WebSocketV2 } = require("smartapi-javascript");
const { TOTP } = require("totp-generator");

class AngelOneFeed {
  constructor(apiKey, clientId, password, totpSecret, instrumentToken) {
    this.apiKey = apiKey;
    this.clientId = clientId;
    this.password = password;
    this.totpSecret = totpSecret;
    this.instrumentToken = instrumentToken; // e.g., "99926000" for NIFTY 50
    this.smartApi = null;
    this.onTick = null;
    this.onHistoricalCandles = null;
    this.onPreviousDayHLC = null;
    this.isConnected = false;
    this.reconnectTimer = null;
    this.firstTickLogged = false; // For debugging volume fields
  }

  async authenticate() {
    try {
      console.log("[AngelOneFeed] Authenticating...");
      console.log(`[AngelOneFeed] Client ID: ${this.clientId}`);

      // Initialize SmartAPI
      this.smartApi = new SmartAPI({ api_key: this.apiKey?.trim() });

      const cleanSecret = this.totpSecret?.trim().replace(/\s+/g, "");
      const cleanClientId = this.clientId?.trim();
      const cleanPassword = this.password?.trim();

      // Generate TOTP
      const totpResult = await TOTP.generate(cleanSecret);
      const totpToken = totpResult.otp;
      console.log("[AngelOneFeed] Generated TOTP");

      // Generate session with clientId, password, and totp
      console.log("[AngelOneFeed] Calling generateSession...");
      const session = await this.smartApi.generateSession(
        cleanClientId,
        cleanPassword,
        totpToken,
      );

      if (session && session.status === "success" && session.data) {
        console.log("[AngelOneFeed] ✓ Authentication successful");
        this.authToken = session.data.authToken;
        this.feedToken = session.data.feedToken;
        this.userId = session.data.userId;
        return true;
      } else if (session && session.data) {
        // Try alternate response format
        console.log(
          "[AngelOneFeed] ✓ Authentication successful (alternate format)",
        );
        this.authToken = session.data.authToken || session.data.jwtToken;
        this.feedToken = session.data.feedToken;
        this.userId = session.data.user_id || session.data.userId;
        return true;
      } else {
        const errorMsg = session?.message || session?.error || "Unknown error";
        console.error("[AngelOneFeed] ✗ Session failed:", errorMsg);
        console.error("[AngelOneFeed] Full response:", session);
        throw new Error(`Session failed: ${errorMsg}`);
      }
    } catch (err) {
      console.error("[AngelOneFeed] ✗ Auth error:", err.message);
      console.error("[AngelOneFeed] Error details:", err);
      return false;
    }
  }

  async connect() {
    // Authenticate first
    const authenticated = await this.authenticate();
    if (!authenticated) {
      console.log("[AngelOneFeed] Authentication failed, retrying in 10s...");
      this.scheduleReconnect();
      return;
    }

    try {
      console.log("[AngelOneFeed] Connecting to WebSocket...");

      await this.loadInitialMarketData();

      // Initialize WebSocket Version 2
      const jwtToken = this.authToken.startsWith("Bearer")
        ? this.authToken
        : `Bearer ${this.authToken}`;

      this.ws = new WebSocketV2({
        jwttoken: jwtToken,
        clientcode: this.clientId?.trim(),
        apikey: this.apiKey?.trim(),
        feedtype: this.feedToken,
      });

      // Setup event handlers
      this.ws.on("tick", (data) => {
        // data comes back as an array with tick message at 0th index if passed properly, or as object directly.
        const tick = Array.isArray(data) ? data[0] : data;
        this.handleTick(tick);
      });

      // Connect WebSocket
      await this.ws.connect();
      console.log("[AngelOneFeed] WebSocket connected");
      this.isConnected = true;
      this.subscribe();
    } catch (err) {
      console.error("[AngelOneFeed] Connection error:", err.message);
      this.scheduleReconnect();
    }
  }

  async loadInitialMarketData() {
    try {
      let previousDayHLC = null;

      if (this.onPreviousDayHLC) {
        previousDayHLC = await this.fetchPreviousDayHLC();
      }

      if (this.onHistoricalCandles) {
        const candles = await this.fetchHistoricalCandles();

        // If no previous day HLC, estimate from today's candles
        if (!previousDayHLC && candles["1m"] && candles["1m"].length > 5) {
          console.log(
            "[AngelOneFeed] Using today's data for CPR estimation...",
          );
          const todayCandles = candles["1m"];
          const high = Math.max(...todayCandles.map((c) => c.high));
          const low = Math.min(...todayCandles.map((c) => c.low));
          const close = todayCandles[todayCandles.length - 1].close;

          previousDayHLC = { high, low, close };
          console.log(
            "[AngelOneFeed] ✓ Estimated HLC from today:",
            previousDayHLC,
          );
        }

        if (previousDayHLC && this.onPreviousDayHLC) {
          this.onPreviousDayHLC(previousDayHLC);
        }

        if (Object.values(candles).some((tfCandles) => tfCandles.length > 0)) {
          this.onHistoricalCandles(candles);
        }
      }
    } catch (err) {
      console.error("[AngelOneFeed] Historical load error:", err.message);
    }
  }

  async fetchHistoricalCandles() {
    const intervals = {
      "1m": "ONE_MINUTE",
      "3m": "THREE_MINUTE",
      "5m": "FIVE_MINUTE",
      "15m": "FIFTEEN_MINUTE",
    };

    console.log("[AngelOneFeed] Loading historical candles...");

    const entries = await Promise.all(
      Object.entries(intervals).map(async ([timeframe, interval]) => {
        try {
          // Retry up to 3 times with exponential backoff
          const candles = await this.retryWithBackoff(
            () => this.fetchRecentIntradayCandles(interval),
            3,
            `${timeframe} historical candles`,
          );

          if (candles.length > 0) {
            const firstTime = new Date(candles[0].time);
            const lastTime = new Date(candles[candles.length - 1].time);
            console.log(
              `[AngelOneFeed] ✓ ${timeframe}: ${candles.length} candles (${this.formatDateTime(firstTime)} to ${this.formatDateTime(lastTime)})`,
            );
          } else {
            console.log(`[AngelOneFeed] ⚠ ${timeframe}: No data from API`);
          }
          return [timeframe, candles];
        } catch (err) {
          console.error(`[AngelOneFeed] ✗ ${timeframe}: ${err.message}`);
          return [timeframe, []];
        }
      }),
    );

    const result = Object.fromEntries(entries);

    // Build missing timeframes from 1m data
    if (result["1m"].length > 0) {
      console.log(
        "[AngelOneFeed] Building multi-timeframe candles from 1m data...",
      );

      if (result["3m"].length === 0) {
        result["3m"] = this.buildCandlesFromMinute(result["1m"], 3);
        console.log(
          `[AngelOneFeed] ✓ Built ${result["3m"].length} 3m candles from 1m data`,
        );
      }

      if (result["5m"].length === 0) {
        result["5m"] = this.buildCandlesFromMinute(result["1m"], 5);
        console.log(
          `[AngelOneFeed] ✓ Built ${result["5m"].length} 5m candles from 1m data`,
        );
      }

      if (result["15m"].length === 0) {
        result["15m"] = this.buildCandlesFromMinute(result["1m"], 15);
        console.log(
          `[AngelOneFeed] ✓ Built ${result["15m"].length} 15m candles from 1m data`,
        );
      }
    }

    const totalCandles = Object.values(result).reduce(
      (sum, arr) => sum + arr.length,
      0,
    );
    console.log(
      `[AngelOneFeed] Historical load complete: ${totalCandles} total candles`,
    );

    return result;
  }

  /**
   * Retry a function with exponential backoff
   */
  async retryWithBackoff(fn, maxRetries = 3, description = "operation") {
    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const result = await fn();
        if (attempt > 1) {
          console.log(
            `[AngelOneFeed] ✓ ${description} succeeded on attempt ${attempt}`,
          );
        }
        return result;
      } catch (err) {
        lastError = err;

        if (attempt < maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000); // Max 5 seconds
          console.log(
            `[AngelOneFeed] ⚠ ${description} failed (attempt ${attempt}/${maxRetries}), retrying in ${delay}ms... Error: ${err.message}`,
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    throw new Error(
      `${description} failed after ${maxRetries} attempts: ${lastError.message}`,
    );
  }

  buildCandlesFromMinute(minuteCandles, interval) {
    const intervalMs = interval * 60 * 1000;
    const grouped = new Map();

    for (const candle of minuteCandles) {
      const bucketTime = Math.floor(candle.time / intervalMs) * intervalMs;

      if (!grouped.has(bucketTime)) {
        grouped.set(bucketTime, {
          time: bucketTime,
          open: candle.open,
          high: candle.high,
          low: candle.low,
          close: candle.close,
          volume: candle.volume || 0,
        });
      } else {
        const bucket = grouped.get(bucketTime);
        bucket.high = Math.max(bucket.high, candle.high);
        bucket.low = Math.min(bucket.low, candle.low);
        bucket.close = candle.close;
        bucket.volume += candle.volume || 0;
      }
    }

    return Array.from(grouped.values()).sort((a, b) => a.time - b.time);
  }

  async fetchRecentIntradayCandles(interval) {
    const ranges = this.getRecentIntradayRanges(interval);
    const allCandles = [];
    let successCount = 0;

    for (const range of ranges) {
      try {
        const candles = await this.fetchCandles(interval, range);

        if (candles.length > 0) {
          console.log(
            `[AngelOneFeed] ${interval} loaded ${candles.length} candles: ${this.formatDateTime(range.from)} to ${this.formatDateTime(range.to)}`,
          );
          allCandles.push(...candles);
          successCount++;
        } else {
          console.log(
            `[AngelOneFeed] ${interval} no data for range: ${this.formatDateTime(range.from)} to ${this.formatDateTime(range.to)}`,
          );
        }
      } catch (err) {
        console.warn(
          `[AngelOneFeed] ${interval} fetch failed for range ${this.formatDateTime(range.from)}-${this.formatDateTime(range.to)}:`,
          err.message,
        );
        continue;
      }
    }

    if (allCandles.length === 0) {
      console.warn(`[AngelOneFeed] No ${interval} data available in any range`);
      return [];
    }

    // Remove duplicates and sort by time
    const uniqueCandles = Array.from(
      new Map(allCandles.map((c) => [c.time, c])).values(),
    ).sort((a, b) => a.time - b.time);

    console.log(
      `[AngelOneFeed] ${interval} total: ${uniqueCandles.length} candles from ${successCount} day(s)`,
    );
    return uniqueCandles;
  }

  async fetchPreviousDayHLC() {
    try {
      // Try method 1: Daily candles
      console.log("[AngelOneFeed] Attempting to fetch previous day HLC...");
      const candles = await this.fetchCandles("ONE_DAY", this.getDailyRange());

      if (candles && candles.length > 0) {
        const todayStart = this.startOfDay(new Date()).getTime();
        const completedDays = candles.filter(
          (candle) => candle.time < todayStart,
        );
        const previousDay = completedDays[completedDays.length - 1];

        if (previousDay) {
          console.log("[AngelOneFeed] ✓ Loaded previous day HLC:", {
            high: previousDay.high,
            low: previousDay.low,
            close: previousDay.close,
          });
          return {
            high: previousDay.high,
            low: previousDay.low,
            close: previousDay.close,
          };
        }
      }

      // Method 2: Use previous day's intraday candles
      console.log(
        "[AngelOneFeed] Trying alternate method: using previous day intraday data...",
      );
      const previousDayRange = this.getPreviousDayRange();
      if (previousDayRange) {
        const intradayCandles = await this.fetchCandles(
          "FIVE_MINUTE",
          previousDayRange,
        );

        if (intradayCandles && intradayCandles.length > 0) {
          const high = Math.max(...intradayCandles.map((c) => c.high));
          const low = Math.min(...intradayCandles.map((c) => c.low));
          const close = intradayCandles[intradayCandles.length - 1].close;

          console.log("[AngelOneFeed] ✓ Calculated HLC from intraday:", {
            high,
            low,
            close,
          });
          return { high, low, close };
        }
      }

      console.warn(
        "[AngelOneFeed] ⚠ Could not fetch previous day HLC, using fallback",
      );
      return null;
    } catch (err) {
      console.error(
        "[AngelOneFeed] ✗ Failed to load previous day HLC:",
        err.message,
      );
      return null;
    }
  }

  getPreviousDayRange() {
    const now = new Date();
    let daysBack = 1;

    // Find the most recent trading day
    for (let i = 1; i <= 5; i++) {
      const day = new Date(now);
      day.setDate(day.getDate() - i);

      if (!this.isWeekend(day)) {
        const from = new Date(day);
        from.setHours(9, 15, 0, 0);
        const to = new Date(day);
        to.setHours(15, 30, 0, 0);

        console.log(
          `[AngelOneFeed] Previous trading day: ${this.formatDateTime(from)}`,
        );
        return { from, to };
      }
    }

    return null;
  }

  async fetchCandles(interval, range) {
    try {
      const requestParams = {
        exchange: "NSE",
        symboltoken: this.instrumentToken,
        interval,
        fromdate: this.formatDateTime(range.from),
        todate: this.formatDateTime(range.to),
      };

      const response = await this.smartApi.getCandleData(requestParams);

      // Handle empty or invalid response
      if (!response) {
        console.warn(`[AngelOneFeed] No response from API for ${interval}`);
        return [];
      }

      // Check if status indicates failure
      if (response.status === false || response.status === "false") {
        const errorMsg =
          response.message || response.error || "API returned error status";
        console.warn(
          `[AngelOneFeed] API error for ${interval} (${requestParams.fromdate} to ${requestParams.todate}): ${errorMsg}`,
        );
        return [];
      }

      // Handle missing or invalid data
      if (!response.data) {
        console.warn(
          `[AngelOneFeed] No data field for ${interval} (${requestParams.fromdate} to ${requestParams.todate})`,
        );
        return [];
      }

      if (!Array.isArray(response.data)) {
        console.warn(
          `[AngelOneFeed] Invalid data type for ${interval}: ${typeof response.data}`,
        );
        return [];
      }

      // Empty data is valid, just return empty array
      if (response.data.length === 0) {
        return [];
      }

      const intervalMs = this.getIntervalMs(interval);
      const currentBucket = Math.floor(Date.now() / intervalMs) * intervalMs;

      return response.data
        .map((row) => this.parseCandle(row))
        .filter((candle) => candle && candle.time < currentBucket)
        .sort((a, b) => a.time - b.time);
    } catch (err) {
      console.warn(
        `[AngelOneFeed] Fetch error for ${interval}: ${err.message}`,
      );
      return [];
    }
  }

  parseCandle(row) {
    if (!Array.isArray(row) || row.length < 5) {
      return null;
    }

    const [time, openRaw, highRaw, lowRaw, closeRaw, volumeRaw = 0] = row;
    const timestamp = new Date(time).getTime();
    const open = Number(openRaw);
    const high = Number(highRaw);
    const low = Number(lowRaw);
    const close = Number(closeRaw);
    const volume = Number(volumeRaw);

    if (![timestamp, open, high, low, close].every(Number.isFinite)) {
      return null;
    }

    // Calculate candle close time (1 minute after open)
    const closeTime = timestamp + 60000;

    return {
      time: timestamp,
      open,
      high,
      low,
      close,
      volume: Number.isFinite(volume) ? volume : 0,
      closeTime, // Timestamp when candle closes
      closingSeconds: Math.max(0, Math.ceil((closeTime - Date.now()) / 1000)), // Seconds until close
    };
  }

  getRecentIntradayRanges(interval) {
    const now = new Date();
    const ranges = [];

    // For 15m interval, need at least 45 minutes of data, skip if too early
    const isLargerInterval = interval === "FIFTEEN_MINUTE";
    const minMinutesNeeded = isLargerInterval ? 45 : 15;

    // Only fetch today's data - AngelOne API seems to have limited historical data
    const today = this.startOfDay(now);

    if (!this.isWeekend(today)) {
      const from = new Date(today);
      from.setHours(9, 15, 0, 0);

      const marketClose = new Date(today);
      marketClose.setHours(15, 30, 0, 0);

      // Skip if market hasn't opened
      if (now > from) {
        const to = now < marketClose ? now : marketClose;

        // For larger intervals, check if enough time has passed
        if (isLargerInterval) {
          const minutesSinceOpen = (to - from) / (60 * 1000);
          if (minutesSinceOpen >= minMinutesNeeded) {
            ranges.push({ from, to });
          }
        } else {
          ranges.push({ from, to });
        }
      }
    }

    return ranges;
  }

  getDailyRange() {
    const to = new Date();
    const from = this.startOfDay(to);
    from.setDate(from.getDate() - 10);
    return { from, to };
  }

  startOfDay(date) {
    const value = new Date(date);
    value.setHours(0, 0, 0, 0);
    return value;
  }

  isWeekend(date) {
    const day = date.getDay();
    return day === 0 || day === 6;
  }

  formatDateTime(date) {
    const pad = (value) => String(value).padStart(2, "0");
    return (
      [date.getFullYear(), pad(date.getMonth() + 1), pad(date.getDate())].join(
        "-",
      ) + ` ${pad(date.getHours())}:${pad(date.getMinutes())}`
    );
  }

  getIntervalMs(interval) {
    const intervals = {
      ONE_MINUTE: 60 * 1000,
      THREE_MINUTE: 3 * 60 * 1000,
      FIVE_MINUTE: 5 * 60 * 1000,
      FIFTEEN_MINUTE: 15 * 60 * 1000,
      ONE_DAY: 24 * 60 * 60 * 1000,
    };

    return intervals[interval] || 60 * 1000;
  }

  normalizeTimestamp(timestamp) {
    const value = Number(timestamp);

    if (!Number.isFinite(value) || value <= 0) {
      return Date.now();
    }

    return value < 1e12 ? value * 1000 : value;
  }

  subscribe() {
    try {
      console.log(
        "[AngelOneFeed] Subscribing to instrument:",
        this.instrumentToken,
      );

      this.ws.fetchData({
        correlationID: "trapnex-123",
        action: 1, // Subscribe
        mode: 1, // LTP
        exchangeType: 1, // nse_cm
        tokens: [this.instrumentToken],
      });

      console.log("[AngelOneFeed] Subscribed successfully");
    } catch (err) {
      console.error("[AngelOneFeed] Subscription error:", err.message);
    }
  }

  unsubscribe() {
    try {
      console.log(
        "[AngelOneFeed] Unsubscribing from instrument:",
        this.instrumentToken,
      );

      this.ws.fetchData({
        correlationID: "trapnex-123",
        action: 0, // Unsubscribe
        mode: 1, // LTP
        exchangeType: 1, // nse_cm
        tokens: [this.instrumentToken],
      });

      console.log("[AngelOneFeed] Unsubscribed successfully");
    } catch (err) {
      console.error("[AngelOneFeed] Unsubscription error:", err.message);
    }
  }

  async changeInstrument(newToken, exchange = 'NSE') {
    try {
      console.log(`[AngelOneFeed] Changing instrument from ${this.instrumentToken} to ${newToken}`);
      
      // Unsubscribe from current instrument
      if (this.ws && this.isConnected) {
        this.unsubscribe();
      }

      // Update instrument token
      const oldToken = this.instrumentToken;
      this.instrumentToken = newToken;
      this.firstTickLogged = false; // Reset for new symbol debug logging

      // Subscribe to new instrument
      if (this.ws && this.isConnected) {
        this.subscribe();
      }

      // Load new historical data
      await this.loadInitialMarketData();

      console.log(`[AngelOneFeed] ✓ Successfully switched to instrument ${newToken}`);
      return true;
    } catch (err) {
      console.error("[AngelOneFeed] ✗ Failed to change instrument:", err.message);
      // Rollback to old token
      this.instrumentToken = oldToken;
      return false;
    }
  }

  handleMessage(data) {
    try {
      if (!data) return;

      // Parse different message formats from SmartAPI
      let tickData = data;

      // If it's a string, parse it
      if (typeof data === "string") {
        tickData = JSON.parse(data);
      }

      if (tickData.ltp) {
        // Single tick data
        this.handleTick(tickData);
      } else if (Array.isArray(tickData)) {
        // Array of ticks
        for (const tick of tickData) {
          this.handleTick(tick);
        }
      }
    } catch (err) {
      // Silently handle non-parseable messages
    }
  }

  handleTick(tickData) {
    try {
      if (!tickData) return;

      // AngelOne WebSocketV2 returns:
      // { last_traded_price: 2200000, ... } or { ltp: ... }

      // Debug: Log first tick to see all available fields
      if (!this.firstTickLogged) {
        console.log(
          "[AngelOneFeed] Sample tick data:",
          JSON.stringify(tickData, null, 2),
        );
        this.firstTickLogged = true;
      }

      const priceRaw = tickData.last_traded_price || tickData.ltp;
      // Price is divided by 100 to get decimal
      const price = priceRaw ? priceRaw / 100 : null;

      // Try multiple volume field names from AngelOne API
      const volume =
        tickData.volume_trade_for_the_day ||
        tickData.volume ||
        tickData.vol_traded_today ||
        tickData.volumeTradedToday ||
        tickData.last_traded_quantity ||
        tickData.ltq ||
        0;

      const timestamp = this.normalizeTimestamp(
        tickData.exchange_timestamp || tickData.timestamp,
      );

      // Calculate candle close time (1-minute candles)
      const candleStart = Math.floor(timestamp / 60000) * 60000;
      const candleClose = candleStart + 60000;
      const closingSeconds = Math.max(
        0,
        Math.ceil((candleClose - timestamp) / 1000),
      );

      if (priceRaw && this.onTick) {
        this.onTick({
          price: price,
          volume: volume,
          timestamp,
          instrument: this.instrumentToken,
          candleCloseTime: candleClose,
          closingSeconds: closingSeconds, // Seconds until current candle closes
        });
      }
    } catch (err) {
      console.error("[AngelOneFeed] Tick processing error:", err.message);
    }
  }

  scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 10000);
  }

  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.smartApi) {
      this.smartApi.disconnect();
    }
    this.isConnected = false;
  }
}

module.exports = AngelOneFeed;

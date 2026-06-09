/**
 * Upstox WebSocket Market Feed
 * Connects to Upstox WebSocket for live market data
 */

const WebSocket = require('ws');
const fetch = require('node-fetch');

class UpstoxFeed {
  constructor(accessToken, instrumentKey) {
    this.accessToken = accessToken;
    this.instrumentKey = instrumentKey;
    this.ws = null;
    this.onTick = null;
    this.reconnectTimer = null;
    this.isConnected = false;
  }

  async getAuthorizedUrl() {
    try {
      const resp = await fetch(
        'https://api.upstox.com/v2/feed/market-data-feed/authorize',
        {
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            Accept: 'application/json',
          },
        }
      );
      const data = await resp.json();
      if (data.status === 'success') {
        return data.data.authorizedRedirectUri;
      }
      throw new Error(data.message || 'Auth failed');
    } catch (err) {
      console.error('[UpstoxFeed] Auth error:', err.message);
      return null;
    }
  }

  async connect() {
    const url = await this.getAuthorizedUrl();
    if (!url) {
      console.log('[UpstoxFeed] No URL, retrying in 10s...');
      this.scheduleReconnect();
      return;
    }

    console.log('[UpstoxFeed] Connecting...');
    this.ws = new WebSocket(url, {
      headers: { Authorization: `Bearer ${this.accessToken}` },
    });

    this.ws.binaryType = 'arraybuffer';

    this.ws.on('open', () => {
      console.log('[UpstoxFeed] Connected');
      this.isConnected = true;

      // Subscribe to instrument
      const subscribeMsg = JSON.stringify({
        guid: 'trapnex-sub',
        method: 'sub',
        data: {
          mode: 'full',
          instrumentKeys: [this.instrumentKey],
        },
      });
      this.ws.send(Buffer.from(subscribeMsg));
    });

    this.ws.on('message', (data) => {
      try {
        this.handleMessage(data);
      } catch (err) {
        console.error('[UpstoxFeed] Parse error:', err.message);
      }
    });

    this.ws.on('close', () => {
      console.log('[UpstoxFeed] Disconnected');
      this.isConnected = false;
      this.scheduleReconnect();
    });

    this.ws.on('error', (err) => {
      console.error('[UpstoxFeed] Error:', err.message);
    });
  }

  handleMessage(rawData) {
    try {
      // Try JSON parse first (for text messages)
      let parsed;
      if (typeof rawData === 'string') {
        parsed = JSON.parse(rawData);
      } else {
        // Binary protobuf data - try to decode as JSON for now
        const text = Buffer.from(rawData).toString('utf8');
        try {
          parsed = JSON.parse(text);
        } catch {
          // Binary protobuf - extract what we can
          // In production, use protobufjs to decode
          return;
        }
      }

      if (parsed?.feeds) {
        for (const [key, feed] of Object.entries(parsed.feeds)) {
          const ff = feed?.ff || feed?.ltpc;
          if (!ff) continue;

          const ltp = ff?.ltpc?.ltp || ff?.ltp;
          const volume = ff?.marketOHLC?.ohlc?.[0]?.volume || 0;

          if (ltp && this.onTick) {
            this.onTick({
              price: ltp,
              volume,
              timestamp: Date.now(),
              instrument: key,
            });
          }
        }
      }
    } catch (err) {
      // Silently handle non-parseable messages
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
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.isConnected = false;
  }
}

module.exports = UpstoxFeed;

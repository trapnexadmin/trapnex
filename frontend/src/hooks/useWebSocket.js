import { useState, useEffect, useRef, useCallback } from 'react';

function getDefaultWsUrl() {
  const isLocalDev =
    import.meta.env.DEV &&
    ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);

  if (isLocalDev) {
    return 'ws://localhost:3001/ws';
  }

  return `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws`;
}

function getDefaultApiUrl() {
  const isLocalDev =
    import.meta.env.DEV &&
    ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);

  if (isLocalDev) {
    return 'http://localhost:3001/api';
  }

  return `${window.location.protocol}//${window.location.host}/api`;
}

const WS_URL = import.meta.env.VITE_WS_URL || getDefaultWsUrl();
const API_URL = import.meta.env.VITE_API_URL || getDefaultApiUrl();

// Local storage keys
const CACHE_KEY = 'trapnex_cached_state';
const CACHE_TIMESTAMP_KEY = 'trapnex_cache_timestamp';
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

export function useWebSocket() {
  const [connected, setConnected] = useState(false);
  const [data, setData] = useState({
    candles: { '1m': [], '3m': [], '5m': [], '15m': [] },
    analysis: null,
    activeTrade: null,
    signal: null,
    price: 0,
    volume: 0,
    stats: null,
    closingSeconds: 0,
    candleCloseTime: null,
  });

  const wsRef = useRef(null);
  const reconnectRef = useRef(null);
  const shouldReconnectRef = useRef(true);
  const lastSaveRef = useRef(0);
  
  // Load cached state on mount
  useEffect(() => {
    const loadCache = () => {
      try {
        const cachedData = localStorage.getItem(CACHE_KEY);
        const cacheTimestamp = localStorage.getItem(CACHE_TIMESTAMP_KEY);
        
        if (cachedData && cacheTimestamp) {
          const age = Date.now() - parseInt(cacheTimestamp, 10);
          if (age < CACHE_TTL) {
            const parsed = JSON.parse(cachedData);
            setData(parsed);
            console.log('[Cache] Loaded cached state from localStorage');
            return true;
          } else {
            console.log('[Cache] Cached state expired');
          }
        }
      } catch (err) {
        console.error('[Cache] Failed to load cached state:', err);
      }
      return false;
    };
    
    // Try localStorage first
    const hasCache = loadCache();
    
    // If no valid cache, try to fetch from API
    if (!hasCache) {
      fetch(`${API_URL}/state/cached`)
        .then(res => res.json())
        .then(cachedState => {
          if (cachedState && cachedState.candles) {
            setData(cachedState);
            console.log('[Cache] Loaded cached state from API');
          }
        })
        .catch(err => {
          console.log('[Cache] No cached state available');
        });
    }
  }, []);
  
  // Save state to localStorage periodically
  const saveToCache = useCallback((state) => {
    const now = Date.now();
    // Save every 30 seconds
    if (now - lastSaveRef.current < 30000) return;
    
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(state));
      localStorage.setItem(CACHE_TIMESTAMP_KEY, now.toString());
      lastSaveRef.current = now;
    } catch (err) {
      console.error('[Cache] Failed to save state:', err);
    }
  }, []);

  const connect = useCallback(() => {
    if (!shouldReconnectRef.current) return;

    if (
      wsRef.current?.readyState === WebSocket.OPEN ||
      wsRef.current?.readyState === WebSocket.CONNECTING
    ) {
      return;
    }

    if (reconnectRef.current) {
      clearTimeout(reconnectRef.current);
      reconnectRef.current = null;
    }

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      console.log('[WS] Connected');
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);

        setData((prev) => {
          let newData;
          
          switch (msg.type) {
            case 'INIT':
              newData = {
                ...prev,
                candles: msg.data.candles || prev.candles,
                analysis: msg.data.analysis,
                activeTrade: msg.data.activeTrade,
                stats: msg.data.stats,
                price: msg.data.candles?.['1m']?.slice(-1)[0]?.close || prev.price,
              };
              break;

            case 'TICK':
              newData = {
                ...prev,
                price: msg.data.price,
                volume: msg.data.volume,
                candles: msg.data.candles || prev.candles,
                activeTrade: msg.data.activeTrade || prev.activeTrade,
                closingSeconds: msg.data.closingSeconds || 0,
                candleCloseTime: msg.data.candleCloseTime || null,
              };
              break;

            case 'ANALYSIS':
              newData = { ...prev, analysis: msg.data };
              break;

            case 'SIGNAL':
              newData = {
                ...prev,
                signal: msg.data.signal,
                analysis: { ...prev.analysis, scoring: msg.data.scoring },
              };
              break;

            default:
              newData = prev;
          }
          
          // Save to cache whenever state updates
          saveToCache(newData);
          return newData;
        });
      } catch (err) {
        console.error('[WS] Parse error:', err);
      }
    };

    ws.onclose = () => {
      if (wsRef.current === ws) {
        wsRef.current = null;
      }

      setConnected(false);

      if (shouldReconnectRef.current) {
        console.log('[WS] Disconnected, reconnecting...');
        reconnectRef.current = setTimeout(connect, 3000);
      }
    };

    ws.onerror = (event) => {
      console.error('[WS] Error:', event);
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
    };
  }, []);

  useEffect(() => {
    shouldReconnectRef.current = true;
    connect();

    return () => {
      shouldReconnectRef.current = false;

      if (reconnectRef.current) {
        clearTimeout(reconnectRef.current);
        reconnectRef.current = null;
      }

      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect]);

  return { connected, ...data };
}

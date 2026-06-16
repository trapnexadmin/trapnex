/**
 * AM (Accumulation-Manipulation) Detection
 * Detects consolidation zones and fake breakouts
 * 
 * Note: Best used with 5m+ candles for reliable accumulation detection
 * Lookback of 8 candles = 40 minutes on 5m, 24 minutes on 3m
 */

function detectAccumulation(candles, lookback = 8) {
  if (candles.length < lookback) return null;

  const recent = candles.slice(-lookback);
  const highs = recent.map((c) => c.high);
  const lows = recent.map((c) => c.low);

  const zoneHigh = Math.max(...highs);
  const zoneLow = Math.min(...lows);
  const range = zoneHigh - zoneLow;

  // Calculate average candle body size
  const avgBody =
    recent.reduce((sum, c) => sum + Math.abs(c.close - c.open), 0) / lookback;

  // Calculate average candle range
  const avgRange =
    recent.reduce((sum, c) => sum + (c.high - c.low), 0) / lookback;

  // Check for overlapping candles (consolidation indicator)
  let overlapCount = 0;
  for (let i = 1; i < recent.length; i++) {
    const prev = recent[i - 1];
    const curr = recent[i];
    if (curr.low <= prev.high && curr.high >= prev.low) {
      overlapCount++;
    }
  }

  const overlapRatio = overlapCount / (lookback - 1);
  const isSmallRange = range < avgRange * 2.5;
  const isLowVolatility = avgBody < avgRange * 0.5;
  const isConsolidating = overlapRatio > 0.6;

  const detected = isSmallRange && isConsolidating;

  return {
    detected,
    zoneHigh: round(zoneHigh),
    zoneLow: round(zoneLow),
    range: round(range),
    overlapRatio: round(overlapRatio),
    isSmallRange,
    isLowVolatility,
    confidence: detected ? Math.min(overlapRatio + (isLowVolatility ? 0.2 : 0), 1) : 0,
  };
}

function detectManipulation(candles, amZone) {
  if (!amZone || !amZone.detected || candles.length < 2) return null;

  const lastCandle = candles[candles.length - 1];
  const prevCandle = candles[candles.length - 2];

  // Fake breakout above AM high
  const fakeBreakoutUp =
    prevCandle.high > amZone.zoneHigh &&
    prevCandle.close < amZone.zoneHigh &&
    lastCandle.close < amZone.zoneHigh;

  // Fake breakdown below AM low
  const fakeBreakoutDown =
    prevCandle.low < amZone.zoneLow &&
    prevCandle.close > amZone.zoneLow &&
    lastCandle.close > amZone.zoneLow;

  if (fakeBreakoutUp) {
    return {
      type: 'FAKE_BREAKOUT_UP',
      direction: 'SELL',
      triggerCandle: prevCandle,
      confirmCandle: lastCandle,
    };
  }

  if (fakeBreakoutDown) {
    return {
      type: 'FAKE_BREAKDOWN',
      direction: 'BUY',
      triggerCandle: prevCandle,
      confirmCandle: lastCandle,
    };
  }

  return null;
}

function isStrongCandle(candle, candles = []) {
  const body = Math.abs(candle.close - candle.open);
  const range = candle.high - candle.low;
  if (range === 0) return false;
  
  const bodyRatio = body / range;
  
  // Basic strong candle: body > 60% of range
  if (bodyRatio <= 0.6) return false;

  // Enhanced: Check if body > 1.5x average body size
  if (candles.length >= 10) {
    const recent = candles.slice(-10);
    const avgBody = recent.reduce((sum, c) => sum + Math.abs(c.close - c.open), 0) / 10;
    
    if (body > avgBody * 1.5) {
      // Check if close above/below previous high/low
      const prevCandle = candles[candles.length - 2];
      if (prevCandle) {
        const bullishBreak = candle.close > candle.open && candle.close > prevCandle.high;
        const bearishBreak = candle.close < candle.open && candle.close < prevCandle.low;
        
        return {
          isStrong: true,
          enhanced: true,
          bodyRatio,
          breaksPrevious: bullishBreak || bearishBreak,
          direction: candle.close > candle.open ? 'BULLISH' : 'BEARISH',
        };
      }
    }
  }

  return { isStrong: true, enhanced: false, bodyRatio };
}

/**
 * Enhanced Rejection Candle Detection
 * Bullish: Lower wick > body, close near high, green candle (+2 score)
 * Bearish: Upper wick > body, close near low, red candle (+2 score)
 */
function detectRejectionCandle(candle, expectedDirection = null) {
  const body = Math.abs(candle.close - candle.open);
  const range = candle.high - candle.low;
  
  if (range === 0) return { detected: false };

  const lowerWick = Math.min(candle.open, candle.close) - candle.low;
  const upperWick = candle.high - Math.max(candle.open, candle.close);
  const bullishRejection = lowerWick > body && (candle.high - candle.close) / range < 0.3;
  const bearishRejection = upperWick > body && (candle.close - candle.low) / range < 0.3;
  
  if (expectedDirection === 'BULLISH') {
    if (bullishRejection) {
      const wickRatio = body > 0 ? lowerWick / body : lowerWick;
      return {
        detected: true,
        type: 'BULLISH_REJECTION',
        score: 2,
        strength: round(wickRatio),
        direction: 'BULLISH',
        wick: 'LOWER',
        description: 'Strong bullish rejection - buyers defended level',
      };
    }
  } else if (expectedDirection === 'BEARISH') {
    if (bearishRejection) {
      const wickRatio = body > 0 ? upperWick / body : upperWick;
      return {
        detected: true,
        type: 'BEARISH_REJECTION',
        score: 2,
        strength: round(wickRatio),
        direction: 'BEARISH',
        wick: 'UPPER',
        description: 'Strong bearish rejection - sellers defended level',
      };
    }
  } else {
    // Direction-agnostic fallback for wick-based rejection detection.
    if (bullishRejection && lowerWick >= upperWick) {
      const wickRatio = body > 0 ? lowerWick / body : lowerWick;
      return {
        detected: true,
        type: 'BULLISH_REJECTION',
        score: 2,
        strength: round(wickRatio),
        direction: 'BULLISH',
        wick: 'LOWER',
        description: 'Strong bullish rejection - buyers defended level',
      };
    }

    if (bearishRejection && upperWick >= lowerWick) {
      const wickRatio = body > 0 ? upperWick / body : upperWick;
      return {
        detected: true,
        type: 'BEARISH_REJECTION',
        score: 2,
        strength: round(wickRatio),
        direction: 'BEARISH',
        wick: 'UPPER',
        description: 'Strong bearish rejection - sellers defended level',
      };
    }
  }

  return { detected: false };
}

/**
 * Volume Confirmation Logic
 * Current Volume > 1.5x average of last 10 candles (+1 score)
 */
function hasVolumeConfirmation(candle, candles) {
  if (!candle.volume || candles.length < 5) return { confirmed: false };

  const recent = candles.slice(-6, -1); // Get previous 5 candles
  const avgVolume = recent.reduce((sum, c) => sum + (c.volume || 0), 0) / 5;

  if (avgVolume === 0) return { confirmed: false };

  const volumeRatio = candle.volume / avgVolume;
  const confirmed = volumeRatio > 1.5;

  return {
    confirmed,
    score: confirmed ? 1 : 0,
    volumeRatio: round(volumeRatio),
    description: confirmed ? 'Volume spike detected' : 'Normal volume',
  };
}

function round(val) {
  return Math.round(val * 100) / 100;
}

module.exports = { 
  detectAccumulation, 
  detectManipulation, 
  isStrongCandle,
  detectRejectionCandle,
  hasVolumeConfirmation,
};

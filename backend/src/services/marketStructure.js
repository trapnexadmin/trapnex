/**
 * Market Structure Engine V2
 * Tracks CPR states, level breakouts, retests, and holds
 * 
 * Core Logic:
 * Break → Retest → Rejection → Continuation
 * 
 * Optimized for 3m candles:
 * - Faster breakout detection
 * - Quicker retest identification
 * - Reduced wait time for confirmation (3-4 candles = 9-12 minutes)
 */

/**
 * Determine CPR State
 * Returns: INSIDE, ACCEPTANCE, REJECTION, ABOVE, BELOW
 * 
 * Requires minimum 5 candles (15 minutes on 3m timeframe)
 */
function getCPRState(candles, cpr, currentPrice) {
  if (!cpr || !candles || candles.length < 5) {
    return { state: 'UNKNOWN', score: 0, details: null };
  }

  const { tc, pivot, bc } = cpr;
  const cprTop = Math.max(tc, bc);
  const cprBottom = Math.min(tc, bc);

  // Check if current price is INSIDE CPR (penalty zone)
  if (currentPrice >= cprBottom && currentPrice <= cprTop) {
    return {
      state: 'INSIDE',
      score: -5, // Penalty
      details: 'Price inside CPR - No directional edge',
      signalAllowed: false,
    };
  }

  // Check for CPR ACCEPTANCE pattern
  // Price enters → 3+ closes inside → breaks edge → continues
  const acceptance = detectCPRAcceptance(candles, cpr);
  if (acceptance.detected) {
    return {
      state: 'ACCEPTANCE',
      score: 3,
      details: acceptance,
      signalAllowed: true,
    };
  }

  // Check for CPR REJECTION pattern
  // Price enters → fails to stay → strong rejection → moves away
  const rejection = detectCPRRejection(candles, cpr);
  if (rejection.detected) {
    return {
      state: 'REJECTION',
      score: 3,
      details: rejection,
      signalAllowed: true,
    };
  }

  // Price ABOVE CPR (bullish bias)
  if (currentPrice > cprTop) {
    return {
      state: 'ABOVE',
      score: 2,
      details: 'Bullish bias - Price above CPR',
      bias: 'BULLISH',
      signalAllowed: true,
    };
  }

  // Price BELOW CPR (bearish bias)
  if (currentPrice < cprBottom) {
    return {
      state: 'BELOW',
      score: 2,
      details: 'Bearish bias - Price below CPR',
      bias: 'BEARISH',
      signalAllowed: true,
    };
  }

  return { state: 'UNKNOWN', score: 0, details: null };
}

/**
 * Detect CPR Acceptance Pattern
 * Entry → 3+ closes inside → breakout → continuation
 */
function detectCPRAcceptance(candles, cpr) {
  const { tc, pivot, bc } = cpr;
  const cprTop = Math.max(tc, bc);
  const cprBottom = Math.min(tc, bc);

  // Need at least 10 candles to detect pattern
  if (candles.length < 10) return { detected: false };

  const recent = candles.slice(-10);
  let insideCount = 0;
  let brokeOut = false;
  let breakoutDirection = null;

  for (let i = 0; i < recent.length; i++) {
    const c = recent[i];
    const isInside = c.close >= cprBottom && c.close <= cprTop;

    if (isInside) {
      insideCount++;
    } else if (insideCount >= 3) {
      // Had 3+ inside closes, now broke out
      brokeOut = true;
      breakoutDirection = c.close > cprTop ? 'BULLISH' : 'BEARISH';
      break;
    } else {
      // Reset if didn't accumulate 3
      insideCount = 0;
    }
  }

  if (brokeOut && insideCount >= 3) {
    return {
      detected: true,
      insideCandles: insideCount,
      direction: breakoutDirection,
      description: `CPR accepted → ${breakoutDirection} breakout`,
    };
  }

  return { detected: false };
}

/**
 * Detect CPR Rejection Pattern
 * Entry → fails to stay → rejection candle → moves away
 */
function detectCPRRejection(candles, cpr) {
  const { tc, pivot, bc } = cpr;
  const cprTop = Math.max(tc, bc);
  const cprBottom = Math.min(tc, bc);

  if (candles.length < 5) return { detected: false };

  const recent = candles.slice(-5);
  
  // Look for: entered CPR recently but rejected
  for (let i = 0; i < recent.length - 1; i++) {
    const c = recent[i];
    const next = recent[i + 1];

    // Check if candle touched CPR
    const touchedCPR =
      (c.high >= cprBottom && c.low <= cprTop) ||
      (c.close >= cprBottom && c.close <= cprTop);

    if (touchedCPR) {
      // Check if next candle rejected strongly
      const rejectedUp = next.close > cprTop && next.open < cprTop;
      const rejectedDown = next.close < cprBottom && next.open > cprBottom;

      if (rejectedUp || rejectedDown) {
        return {
          detected: true,
          direction: rejectedUp ? 'BULLISH' : 'BEARISH',
          description: `CPR rejected → Strong ${rejectedUp ? 'bullish' : 'bearish'} move`,
        };
      }
    }
  }

  return { detected: false };
}

/**
 * Track Level Breakout → Retest → Hold
 * This is the CORE edge of the system
 */
class LevelRetestTracker {
  constructor() {
    this.activeBreakouts = []; // Track recent breakouts waiting for retest
    this.activeRetests = []; // Track retests waiting for confirmation
  }

  /**
   * Step 1: Detect Level Breakout
   * Price closes decisively above/below a level
   */
  detectBreakout(candles, levels, currentPrice) {
    if (!candles || candles.length < 4 || !levels) return null;

    const lastCandle = candles[candles.length - 1];
    const prevCandle = candles[candles.length - 2];

    const allLevels = [
      { price: levels.R4, name: 'R4', type: 'RESISTANCE' },
      { price: levels.R3, name: 'R3', type: 'RESISTANCE' },
      { price: levels.R2, name: 'R2', type: 'RESISTANCE' },
      { price: levels.R1, name: 'R1', type: 'RESISTANCE' },
      { price: levels.S1, name: 'S1', type: 'SUPPORT' },
      { price: levels.S2, name: 'S2', type: 'SUPPORT' },
      { price: levels.S3, name: 'S3', type: 'SUPPORT' },
      { price: levels.S4, name: 'S4', type: 'SUPPORT' },
    ].filter((l) => l.price);

    for (const level of allLevels) {
      // Bullish breakout: was below, now closed above
      if (
        prevCandle.close < level.price &&
        lastCandle.close > level.price &&
        level.type === 'RESISTANCE'
      ) {
        const breakout = {
          level: level.name,
          price: level.price,
          direction: 'BULLISH',
          type: level.type,
          breakoutCandle: lastCandle.time,
          timestamp: Date.now(),
          score: 1,
        };

        this.activeBreakouts.push(breakout);
        return breakout;
      }

      // Bearish breakdown: was above, now closed below
      if (
        prevCandle.close > level.price &&
        lastCandle.close < level.price &&
        level.type === 'SUPPORT'
      ) {
        const breakout = {
          level: level.name,
          price: level.price,
          direction: 'BEARISH',
          type: level.type,
          breakoutCandle: lastCandle.time,
          timestamp: Date.now(),
          score: 1,
        };

        this.activeBreakouts.push(breakout);
        return breakout;
      }
    }

    return null;
  }

  /**
   * Step 2 & 3: Detect Retest
   * Price returns to level + rejection candle forms
   */
  detectRetest(candles, currentPrice) {
    if (!candles || candles.length < 3) return null;

    const lastCandle = candles[candles.length - 1];
    const retestThreshold = 0.15; // 0.15% tolerance

    // Check active breakouts for retest
    for (let i = this.activeBreakouts.length - 1; i >= 0; i--) {
      const breakout = this.activeBreakouts[i]; = 60 minutes on 3m

      // Skip if too old (more than 20 candles ago)
      if (candles.length - breakout.breakoutCandle > 20) {
        this.activeBreakouts.splice(i, 1);
        continue;
      }

      const levelPrice = breakout.price;
      const priceDistance = Math.abs(currentPrice - levelPrice);
      const distancePercent = (priceDistance / levelPrice) * 100;

      // Check if price returned to level
      if (distancePercent <= retestThreshold) {
        // Check for rejection candle
        const rejection = this.detectRejectionCandle(lastCandle, breakout.direction);

        if (rejection.detected) {
          const retest = {
            ...breakout,
            retestDetected: true,
            retestCandle: lastCandle.time,
            rejectionType: rejection.type,
            rejectionStrength: rejection.strength,
            score: 2, // Retest success score
          };

          this.activeRetests.push(retest);
          this.activeBreakouts.splice(i, 1); // Remove from breakouts
          return retest;
        }
      }
    }

    return null;
  }

  /**
   * Step 4: Confirm Hold
   * Next candle confirms the rejection held
   * 
   * Wait time: 1-4 candles = 3-12 minutes on 3m timeframe
   */
  confirmHold(candles, currentPrice) {
    if (!candles || candles.length < 3) return null;

    const lastCandle = candles[candles.length - 1];

    // Check active retests for hold confirmation
    for (let i = this.activeRetests.length - 1; i >= 0; i--) {
      const retest = this.activeRetests[i];

      // Skip if already confirmed or too old
      if (retest.confirmed || candles.length - retest.retestCandle > 4) {
        this.activeRetests.splice(i, 1);
        continue;
      }

      const levelPrice = retest.price;

      // Bullish hold: price stays above level
      if (retest.direction === 'BULLISH' && lastCandle.close > levelPrice) {
        retest.confirmed = true;
        retest.confirmCandle = lastCandle.time;
        retest.score += 3; // Hold confirmation score
        return retest;
      }

      // Bearish hold: price stays below level
      if (retest.direction === 'BEARISH' && lastCandle.close < levelPrice) {
        retest.confirmed = true;
        retest.confirmCandle = lastCandle.time;
        retest.score += 3; // Hold confirmation score
        return retest;
      }
    }

    return null;
  }

  /**
   * Detect Rejection Candle
   * Bullish: Lower wick > body, close near high
   * Bearish: Upper wick > body, close near low
   */
  detectRejectionCandle(candle, expectedDirection) {
    const body = Math.abs(candle.close - candle.open);
    const range = candle.high - candle.low;
    const lowerWick = Math.min(candle.open, candle.close) - candle.low;
    const upperWick = candle.high - Math.max(candle.open, candle.close);

    if (expectedDirection === 'BULLISH') {
      // Bullish rejection: lower wick > body, close near high, green candle
      const isBullish = candle.close > candle.open;
      const strongLowerWick = lowerWick > body;
      const closeNearHigh = (candle.high - candle.close) / range < 0.3;

      if (isBullish && strongLowerWick && closeNearHigh) {
        return {
          detected: true,
          type: 'BULLISH_REJECTION',
          strength: lowerWick / body,
        };
      }
    }

    if (expectedDirection === 'BEARISH') {
      // Bearish rejection: upper wick > body, close near low, red candle
      const isBearish = candle.close < candle.open;
      const strongUpperWick = upperWick > body;
      const closeNearLow = (candle.close - candle.low) / range < 0.3;

      if (isBearish && strongUpperWick && closeNearLow) {
        return {
          detected: true,
          type: 'BEARISH_REJECTION',
          strength: upperWick / body,
        };
      }
    }

    return { detected: false };
  }

  /**
   * Get all active market structure opportunities
   */
  getActiveOpportunities() {
    return {
      breakouts: this.activeBreakouts,
      retests: this.activeRetests,
      confirmed: this.activeRetests.filter((r) => r.confirmed),
    };
  }

  /**
   * Clear old tracking data
   */
  cleanup() {
    const now = Date.now();
    const maxAge = 30 * 60 * 1000; // 30 minutes

    this.activeBreakouts = this.activeBreakouts.filter(
      (b) => now - b.timestamp < maxAge
    );
    this.activeRetests = this.activeRetests.filter(
      (r) => now - r.timestamp < maxAge
    );
  }
}

module.exports = {
  getCPRState,
  LevelRetestTracker,
};

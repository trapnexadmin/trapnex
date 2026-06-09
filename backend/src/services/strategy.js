/**
 * TRAPNEX V2 - Market Structure Strategy Engine
 * Focus: Break → Retest → Rejection → Continuation
 *
 * DO NOT trade breakouts blindly.
 * WAIT FOR: Break → Retest → Rejection → Confirmation → Entry
 *
 * TIMEFRAME STRATEGY:
 * - 3m candles: Primary analysis (faster signals, quicker decisions)
 * - 5m candles: AM detection (needs longer lookback for accumulation zones)
 * - 15m candles: Trend confirmation (ensures directional alignment)
 *
 * Benefits of 3m primary:
 * - Faster signal generation (2x faster than 5m)
 * - Earlier detection of breakout + retest
 * - Reduced decision latency
 * - Still maintains multi-timeframe confirmation
 */

const {
  calculateCPR,
  isNarrowCPR,
  getCPRBias,
  getCPRWidthType,
  getCPRWidthDescription,
} = require("./cpr");
const {
  detectAccumulation,
  detectManipulation,
  isStrongCandle,
  detectRejectionCandle,
  hasVolumeConfirmation,
} = require("./am");
const {
  scoreMarketStructure,
  scoreSetup,
  scoreSRSignal,
  scoreOverallSetup,
} = require("./scoring");
const { getStrikes } = require("./options");
const { calculateSupportResistance } = require("./supportResistance");
const { getCPRState, LevelRetestTracker } = require("./marketStructure");

// Global market structure tracker (maintains state across ticks)
const retestTracker = new LevelRetestTracker();

function analyzeSetup(candles3m, candles5m, candles15m, previousDayHLC) {
  if (!previousDayHLC) return null;

  const { high, low, close } = previousDayHLC;
  const cpr = calculateCPR(high, low, close);
  const supportResistance = calculateSupportResistance(high, low, close);

  // If we don't have enough candles, try to detect simple breakout + retest
  // Using 3m candles allows for faster signal generation
  if (!candles3m || candles3m.length < 5) {
    const lastPrice = candles3m?.[candles3m.length - 1]?.close || close;
    const bias = getCPRBias(lastPrice, cpr);

    let signals = [];

    // Even with few candles, try to detect breakout + retest for quick signals
    if (candles3m && candles3m.length >= 4) {
      const breakoutDetected = retestTracker.detectBreakout(
        candles3m,
        supportResistance,
        lastPrice,
      );

      const retestDetected = retestTracker.detectRetest(candles3m, lastPrice);

      // Generate signal if there's a clear retest after breakout
      if (retestDetected) {
        const type = retestDetected.direction === "BULLISH" ? "CALL" : "PUT";
        const levelPrice = retestDetected.price;

        // Calculate proper scoring for breakout + retest pattern
        let earlyScore = 0;
        const earlyBreakdown = {};

        // Base score for market structure
        if (breakoutDetected) {
          earlyScore += 1;
          earlyBreakdown.breakout = "✓ Detected (+1)";
        }
        if (retestDetected) {
          earlyScore += 3; // Retest is the key pattern
          earlyBreakdown.retest = "✓ Active (+3)";
        }

        // CPR position scoring
        if (bias === "BULLISH" && type === "CALL") {
          earlyScore += 2;
          earlyBreakdown.cprBias = "✓ Above CPR (+2)";
        } else if (bias === "BEARISH" && type === "PUT") {
          earlyScore += 2;
          earlyBreakdown.cprBias = "✓ Below CPR (+2)";
        }

        // Candle strength bonus (based on last candle)
        const lastCandleForEarly = candles3m[candles3m.length - 1];
        const body = Math.abs(
          lastCandleForEarly.close - lastCandleForEarly.open,
        );
        const range = lastCandleForEarly.high - lastCandleForEarly.low;
        if (range > 0 && body / range > 0.6) {
          earlyScore += 2;
          earlyBreakdown.strongCandle = "✓ Strong body (+2)";
        }

        // Level importance
        const levelNum = parseInt(
          retestDetected.level.match(/\d+/)?.[0] || "0",
        );
        if (levelNum <= 2) {
          earlyScore += 1.5;
          earlyBreakdown.levelImportance = "✓ Major level (+1.5)";
        } else if (levelNum <= 3) {
          earlyScore += 1;
          earlyBreakdown.levelImportance = "✓ Important level (+1)";
        }

        // Determine grade and tradeable status
        let grade, tradeable, autoExecute, confidence;
        if (earlyScore >= 11) {
          grade = "A";
          tradeable = true;
          autoExecute = true;
          confidence = 0.85;
        } else if (earlyScore >= 8) {
          grade = "B+";
          tradeable = true; // B+ is now tradeable!
          autoExecute = false; // Manual confirmation recommended
          confidence = 0.75;
        } else if (earlyScore >= 6) {
          grade = "B";
          tradeable = false; // Watchlist - can upgrade
          autoExecute = false;
          confidence = 0.65;
        } else {
          grade = "C";
          tradeable = false;
          autoExecute = false;
          confidence = 0.5;
        }

        console.log(
          `[Strategy] 🔔 Breakout + Retest detected (${candles3m.length} candles): ${type} @ ${retestDetected.level} | Score: ${earlyScore} (${grade}) | ${tradeable ? "TRADEABLE" : "WATCHLIST"}`,
        );

        signals.push({
          type,
          entry: round(levelPrice),
          stopLoss: round(
            retestDetected.direction === "BULLISH"
              ? levelPrice - cpr.width * 0.5
              : levelPrice + cpr.width * 0.5,
          ),
          target: round(
            retestDetected.direction === "BULLISH"
              ? levelPrice + cpr.width * 1.5
              : levelPrice - cpr.width * 1.5,
          ),
          riskReward: 1.5,
          strikes: [],
          timestamp: Date.now(),
          source: "BREAKOUT_RETEST",
          level: retestDetected.level,
          confidence,
          score: earlyScore,
          grade,
          breakdown: earlyBreakdown,
          tradeable,
          autoExecute,
          description: `${type} on ${retestDetected.level} retest (${grade} grade - ${tradeable ? "Ready to trade" : "Watchlist"})`,
        });
      }
    }

    console.log(
      `[Strategy] ⚠ Only ${candles3m?.length || 0} 3m candles - showing CPR/SR levels only (need 10 for full analysis)`,
    );

    return {
      cpr,
      supportResistance,
      bias,
      lastPrice,
      narrowCPR: false,
      cprWidthType: "MODERATE",
      cprWidthDesc: "Waiting for more data...",
      signals,
      scoring: { score: 0, grade: "F", tradeable: false, breakdown: {} },
    };
  }

  const lastPrice = candles3m[candles3m.length - 1].close;
  const lastCandle = candles3m[candles3m.length - 1];
  const bias = getCPRBias(lastPrice, cpr);

  // Calculate ATR for narrow CPR check
  const atr = calculateATR(candles3m, 14);
  const narrowCPR = isNarrowCPR(cpr, atr);
  const cprWidthType = getCPRWidthType(cpr, atr);
  const cprWidthDesc = getCPRWidthDescription(cprWidthType);

  // === V2 MARKET STRUCTURE ANALYSIS ===

  // 1. CPR State Detection
  const cprState = getCPRState(candles3m, cpr, lastPrice);

  // 2. Track Level Breakouts, Retests, Holds
  const breakoutDetected = retestTracker.detectBreakout(
    candles3m,
    supportResistance,
    lastPrice,
  );

  const retestDetected = retestTracker.detectRetest(candles3m, lastPrice);

  const holdConfirmed = retestTracker.confirmHold(candles3m, lastPrice);

  // 3. Enhanced Rejection Candle Detection
  const rejectionCandle = detectRejectionCandle(lastCandle);

  // 4. Enhanced Strong Candle Detection
  const strongCandle = isStrongCandle(lastCandle, candles3m);

  // 5. Volume Confirmation
  const volumeConfirmation = hasVolumeConfirmation(lastCandle, candles3m);

  // === LEGACY AM DETECTION (uses 5m for longer lookback) ===
  const amZone =
    candles5m && candles5m.length >= 8 ? detectAccumulation(candles5m) : null;
  const manipulation = amZone ? detectManipulation(candles5m, amZone) : null;

  // === LEGACY VOLUME SPIKE (uses 3m candles) ===
  const avgVolume =
    candles3m.slice(-20).reduce((sum, c) => sum + (c.volume || 0), 0) / 20;
  const volumeSpike = lastCandle.volume > avgVolume * 1.5;

  // === S/R LEVEL PROXIMITY (uses 3m for faster detection) ===
  const levelInteraction = analyzeSRLevels(
    candles3m,
    supportResistance,
    lastPrice,
    atr,
  );

  // === V2 SCORING SYSTEM (20+ points) ===
  const scoring = scoreMarketStructure({
    // CPR State
    cprState,
    narrowCPR,

    // AM Detection
    amDetected: amZone?.detected || false,
    manipulation: !!manipulation,

    // Market Structure (Core)
    breakoutDetected,
    retestDetected,
    holdConfirmed,

    // Candle Analysis
    rejectionCandle,
    strongCandle,

    // Volume
    volumeConfirmation,

    // S/R Proximity
    nearLevel: !!(
      levelInteraction?.nearestSupport || levelInteraction?.nearestResistance
    ),
    levelImportance: getLevelImportance(levelInteraction),
  });

  // === MULTI-TIMEFRAME CONFIRMATION ===
  // Check if 3m and 15m trends align for higher confidence
  let mtfConfirmed = true;
  if (candles15m && candles15m.length >= 3) {
    const tf15Trend = getTrend(candles15m);
    const tf3Trend = getTrend(candles3m);
    const tf5Trend =
      candles5m && candles5m.length >= 3 ? getTrend(candles5m) : tf3Trend;

    // Require 3m to align with 15m, 5m as additional confirmation
    mtfConfirmed =
      tf3Trend === tf15Trend &&
      (tf5Trend === tf15Trend || !candles5m || candles5m.length < 3);
  }

  // === SIGNAL GENERATION ===
  let signals = [];

  // Helper to find nearest level for fallback signal
  const nearestResistance = levelInteraction?.nearestResistance || "R1";
  const nearestSupport = levelInteraction?.nearestSupport || "S1";

  // **GOLDEN RULE**: Only generate signals on CONFIRMED RETESTS
  // DO NOT trade breakouts blindly

  if (holdConfirmed && cprState.signalAllowed !== false && mtfConfirmed) {
    // HIGH QUALITY SETUP: Breakout → Retest → Hold Confirmed

    const type = holdConfirmed.direction === "BULLISH" ? "CALL" : "PUT";
    const entry = lastPrice;

    // Calculate SL/Target based on confirmed retest level
    const levelPrice = holdConfirmed.price;
    const slDistance = Math.abs(entry - levelPrice) + atr * 0.5;
    const slMultiplier = type === "CALL" ? -1 : 1;
    const stopLoss = round(entry + slMultiplier * slDistance);
    const target = round(entry - slMultiplier * slDistance * 2.5); // 2.5R target

    signals.push({
      type,
      entry: round(entry),
      stopLoss,
      target,
      riskReward: round(Math.abs(target - entry) / Math.abs(stopLoss - entry)),
      strikes: getStrikes(entry, type),
      timestamp: Date.now(),
      source: "RETEST_CONFIRMED",
      level: holdConfirmed.level,
      confidence: 0.9,
      score: scoring.score,
      grade: scoring.grade,
      breakdown: scoring.breakdown,
      tradeable: scoring.tradeable,
      autoExecute: scoring.autoExecute,
      description: `${type} - ${holdConfirmed.level} retest confirmed`,
    });
  }

  // Secondary signals: Retest detected but not yet confirmed
  // Tradeable if score >= 8 (B+), otherwise watchlist (B) or ignore (C/D/F)
  if (retestDetected && !holdConfirmed && cprState.signalAllowed !== false) {
    const type = retestDetected.direction === "BULLISH" ? "CALL" : "PUT";
    const entry = lastPrice;
    const levelPrice = retestDetected.price;
    const slDistance = Math.abs(entry - levelPrice) + atr * 0.5;
    const slMultiplier = type === "CALL" ? -1 : 1;
    const stopLoss = round(entry + slMultiplier * slDistance);
    const target = round(entry - slMultiplier * slDistance * 2.5);

    // Determine tradeable status based on score
    // B+ and above (score >= 8): tradeable
    // B (score 6-7): watchlist only
    // C and below (score < 6): ignore
    const isTradeableScore = scoring.score >= 8;
    const isWatchlistScore = scoring.score >= 6 && scoring.score < 8;

    signals.push({
      type,
      entry: round(entry),
      stopLoss,
      target,
      riskReward: round(Math.abs(target - entry) / Math.abs(stopLoss - entry)),
      strikes: getStrikes(entry, type),
      timestamp: Date.now(),
      source: "RETEST_PENDING",
      level: retestDetected.level,
      confidence: 0.75,
      score: scoring.score,
      grade: scoring.grade,
      breakdown: scoring.breakdown,
      tradeable: isTradeableScore, // B+ and above are tradeable
      autoExecute: false,
      description: `${type} - ${retestDetected.level} retest pending confirmation`,
    });
  }

  // Legacy CPR + Manipulation signal (only if score is high enough)
  if (
    manipulation &&
    bias !== "NEUTRAL" &&
    mtfConfirmed &&
    scoring.score >= 11
  ) {
    const type =
      manipulation.direction === "BUY" && bias === "BULLISH"
        ? "CALL"
        : manipulation.direction === "SELL" && bias === "BEARISH"
          ? "PUT"
          : null;

    if (type) {
      const entry = lastPrice;
      const slMultiplier = type === "CALL" ? -1 : 1;
      const stopLoss = round(entry + slMultiplier * atr * 1.2);
      const target = round(entry - slMultiplier * atr * 2.0);

      signals.push({
        type,
        entry: round(entry),
        stopLoss,
        target,
        riskReward: round(
          Math.abs(target - entry) / Math.abs(stopLoss - entry),
        ),
        strikes: getStrikes(entry, type),
        timestamp: Date.now(),
        source: "CPR_AM_MANIPULATION",
        confidence: 0.8,
        score: scoring.score,
        grade: scoring.grade,
        breakdown: scoring.breakdown,
        tradeable: scoring.tradeable,
      });
    }
  }

  // Fallback: Generate signal if score is B+ or above (≥8) even without specific pattern
  // This ensures high-quality setups don't get missed
  if (
    signals.length === 0 &&
    scoring.score >= 8 &&
    bias !== "NEUTRAL" &&
    cprState.signalAllowed !== false &&
    mtfConfirmed
  ) {
    const type = bias === "BULLISH" ? "CALL" : "PUT";
    const entry = lastPrice;
    const slMultiplier = type === "CALL" ? -1 : 1;
    const stopLoss = round(entry + slMultiplier * atr * 1.5);
    const target = round(entry - slMultiplier * atr * 3.0);

    console.log(
      `[Strategy] 🎯 High Quality Setup: ${type} | Score: ${scoring.score} (${scoring.grade}) | ${scoring.tradeable ? "TRADEABLE" : "WATCHLIST"}`,
    );

    signals.push({
      type,
      entry: round(entry),
      stopLoss,
      target,
      riskReward: round(Math.abs(target - entry) / Math.abs(stopLoss - entry)),
      strikes: getStrikes(entry, type),
      timestamp: Date.now(),
      source: "HIGH_QUALITY_SETUP",
      level: bias === "BULLISH" ? nearestResistance : nearestSupport,
      confidence: scoring.score >= 11 ? 0.85 : 0.75,
      score: scoring.score,
      grade: scoring.grade,
      breakdown: scoring.breakdown,
      tradeable: scoring.tradeable,
      autoExecute: scoring.autoExecute,
      description: `${type} - High quality setup (${scoring.grade} grade)`,
    });
  }

  // Clean up old tracking data
  retestTracker.cleanup();

  // Get active market structure opportunities
  const marketStructure = retestTracker.getActiveOpportunities();

  return {
    // CPR Analysis
    cpr,
    supportResistance,
    bias,
    narrowCPR,
    cprWidthType,
    cprWidthDesc,

    // Legacy AM
    amZone,
    manipulation,

    // V2 Market Structure
    cprState,
    marketStructure,
    breakoutDetected,
    retestDetected,
    holdConfirmed,
    rejectionCandle,

    // Candle & Volume
    strongCandle,
    volumeSpike,
    volumeConfirmation,

    // S/R Levels
    levelInteraction,

    // Scoring
    scoring, // V2 Score (20+ points)

    // Multi-timeframe
    mtfConfirmed,

    // Signals
    signal: signals.length > 0 ? signals[0] : null, // Primary signal
    signals: signals, // All signals

    // Price & ATR
    lastPrice,
    atr: round(atr),
  };
}

function getLevelImportance(levelInteraction) {
  if (!levelInteraction) return 0;

  const { nearestSupport, nearestResistance } = levelInteraction;
  const level = nearestSupport || nearestResistance;

  if (!level) return 0;

  const levelNum = parseInt(level.match(/\d+/)?.[0] || "0");
  if (levelNum <= 2) return 1.5; // Major levels
  if (levelNum <= 3) return 1.0;
  return 0.5; // Extended levels
}

function getTrend(candles) {
  if (candles.length < 3) return "NEUTRAL";
  const recent = candles.slice(-3);
  const closes = recent.map((c) => c.close);
  if (closes[2] > closes[0]) return "BULLISH";
  if (closes[2] < closes[0]) return "BEARISH";
  return "NEUTRAL";
}

/**
 * Analyze Support & Resistance level interactions
 * Simplified for V2 - main logic moved to marketStructure.js
 */
function analyzeSRLevels(candles, sr, currentPrice, atr) {
  const levels = [
    { name: "R4", price: sr.R4, type: "RESISTANCE", level: 4 },
    { name: "R3", price: sr.R3, type: "RESISTANCE", level: 3 },
    { name: "R2", price: sr.R2, type: "RESISTANCE", level: 2 },
    { name: "R1", price: sr.R1, type: "RESISTANCE", level: 1 },
    { name: "S1", price: sr.S1, type: "SUPPORT", level: 1 },
    { name: "S2", price: sr.S2, type: "SUPPORT", level: 2 },
    { name: "S3", price: sr.S3, type: "SUPPORT", level: 3 },
    { name: "S4", price: sr.S4, type: "SUPPORT", level: 4 },
  ].filter((l) => l.price);

  // Find nearest levels
  const nearestSupport = levels
    .filter((l) => l.type === "SUPPORT" && l.price < currentPrice)
    .sort((a, b) => b.price - a.price)[0];

  const nearestResistance = levels
    .filter((l) => l.type === "RESISTANCE" && l.price > currentPrice)
    .sort((a, b) => a.price - b.price)[0];

  return {
    nearestSupport: nearestSupport?.name || null,
    nearestResistance: nearestResistance?.name || null,
    signals: [],
    totalOpportunities: 0,
  };
}

function calculateATR(candles, period = 14) {
  if (candles.length < period + 1) {
    // Fallback: use average range
    const avg =
      candles.reduce((sum, c) => sum + (c.high - c.low), 0) / candles.length;
    return avg;
  }

  let trSum = 0;
  for (let i = candles.length - period; i < candles.length; i++) {
    const c = candles[i];
    const prev = candles[i - 1];
    const tr = Math.max(
      c.high - c.low,
      Math.abs(c.high - prev.close),
      Math.abs(c.low - prev.close),
    );
    trSum += tr;
  }
  return trSum / period;
}

function round(val) {
  return Math.round(val * 100) / 100;
}

module.exports = { analyzeSetup };

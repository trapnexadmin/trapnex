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
const MIN_TRADE_SCORE = 10;
const EXPLOSIVE_BREAKOUT_THRESHOLD = 80;
const RANGE_REJECTION_SCORE_BOOST = 3.5;
const MIN_RANGE_REJECTIONS = 2;
const TRIANGLE_LOOKBACK_CANDLES = 8;
const TRIANGLE_TOLERANCE_POINTS = 3;
const TRIANGLE_BREAKOUT_BUFFER = 10;
const ROUND_NUMBER_STEP = 500;
const ROUND_NUMBER_TOLERANCE = 20;

function analyzeSetup(candles3m, candles5m, candles15m, previousDayHLC) {
  if (!previousDayHLC) return null;

  candles3m = getClosedCandles(candles3m, 3);
  candles5m = getClosedCandles(candles5m, 5);
  candles15m = getClosedCandles(candles15m, 15);

  const { high, low, close } = previousDayHLC;
  const cpr = calculateCPR(high, low, close);
  const supportResistance = calculateSupportResistance(high, low, close);

  // If we don't have enough candles, try to detect simple breakout + retest
  // Using 3m candles allows for faster signal generation
  if (!candles3m || candles3m.length < 5) {
    const lastPrice = candles3m?.[candles3m.length - 1]?.close || close;
    const cprBias = getCPRBias(lastPrice, cpr);

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
        // V3 FIX: Use breakout direction, not CPR bias
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

        // V3 FIX: Check if breakout direction aligns with CPR bias
        const biasAligned =
          (cprBias === "BULLISH" && type === "CALL") ||
          (cprBias === "BEARISH" && type === "PUT");

        if (biasAligned) {
          earlyScore += 2;
          earlyBreakdown.cprBias = `✓ Aligns with CPR (+2)`;
        } else {
          earlyBreakdown.cprBias = `⚠️ Opposite to CPR (0)`;
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
          `[Strategy] 🔔 Breakout + Retest detected (${candles3m.length} candles): ${type} @ ${retestDetected.level} | Score: ${earlyScore} (${grade}) | ${tradeable ? "TRADEABLE" : "WATCHLIST"} | ${biasAligned ? "✓ CPR aligned" : "⚠️ Opposite CPR"}`,
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
      bias: cprBias,
      biasSource: "CPR",
      biasConflict: false,
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
  const cprBias = getCPRBias(lastPrice, cpr);

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
  const explosiveBreakoutDetected =
    breakoutDetected &&
    Math.abs(lastPrice - breakoutDetected.price) >= EXPLOSIVE_BREAKOUT_THRESHOLD
      ? {
          ...breakoutDetected,
          explosiveDistance: round(
            Math.abs(lastPrice - breakoutDetected.price),
          ),
          description: `${breakoutDetected.level} explosive ${breakoutDetected.direction.toLowerCase()} breakout`,
        }
      : null;

  const retestDetected = retestTracker.detectRetest(candles3m, lastPrice);

  const holdConfirmed = retestTracker.confirmHold(candles3m, lastPrice);
  const continuationDetected = retestTracker.detectContinuationEntry(candles3m);

  // === V3 FIX: DETECT PRICE STRUCTURE ===
  const priceStructure = detectPriceStructure(candles3m);

  // === V3 FIX: DETERMINE DOMINANT BIAS ===
  // Priority: 1) Breakout/Retest, 2) Price Structure, 3) CPR Bias
  const dominantBiasResult = getDominantBias(
    breakoutDetected,
    retestDetected,
    priceStructure,
    cprBias,
  );
  const bias = dominantBiasResult.bias; // This becomes the primary bias
  const biasSource = dominantBiasResult.source;
  const biasConflict = dominantBiasResult.conflictDetected;

  // Log bias determination
  if (biasConflict) {
    console.log(
      `[Strategy] ⚠️ BIAS CONFLICT: Structure=${priceStructure?.direction} vs CPR=${cprBias} | Using: ${bias} (${biasSource})`,
    );
  } else if (biasSource !== "CPR") {
    console.log(
      `[Strategy] 🎯 Dominant Bias: ${bias} from ${biasSource} (confidence: ${(dominantBiasResult.confidence * 100).toFixed(0)}%)`,
    );
  }

  // 3. Enhanced Rejection Candle Detection
  const rejectionCandle = detectRejectionCandle(lastCandle);

  // 3B. Round-number wick rejection detection
  const roundRejectionSetup = detectRoundNumberRejection(candles3m);

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
  const rangeRejectionSetup = detectRangeRejectionSetup(
    candles3m,
    supportResistance,
    levelInteraction,
    atr,
    strongCandle,
  );
  const quickReversalSetup = detectQuickReversalContinuation(
    candles3m,
    supportResistance,
    levelInteraction,
    atr,
    strongCandle,
  );
  const breakoutMomentumSetup = detectBreakoutMomentumSetup(
    candles3m,
    breakoutDetected,
    atr,
    strongCandle,
  );
  const cprRangeRejectionSetup = detectCPRRangeRejectionSetup(
    candles3m,
    cpr,
    atr,
    strongCandle,
  );
  const compressionZone = detectCompressionZone(
    candles3m,
    supportResistance,
    levelInteraction,
    atr,
    volumeConfirmation,
  );
  const triangleRetestSetup = detectTriangleRetestSetup(
    candles3m,
    compressionZone,
    atr,
  );
  const triangleContinuationSetup = detectTriangleContinuationSetup(
    candles3m,
    compressionZone,
    atr,
    strongCandle,
  );

  // === MULTI-TIMEFRAME CONFIRMATION ===
  // Check if 3m and 15m trends align for higher confidence
  let mtfConfirmed = true;
  if (candles15m && candles15m.length >= 3) {
    const tf15Trend = getTrend(candles15m);
    const tf3Trend = getTrend(candles3m);
    const tf5Trend =
      candles5m && candles5m.length >= 3 ? getTrend(candles5m) : tf3Trend;
    mtfConfirmed =
      tf3Trend === tf15Trend &&
      (tf5Trend === tf15Trend || !candles5m || candles5m.length < 3);
  }

  // === V3 SCORING SYSTEM ===
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

    // V3 Additions
    cprSROverlap: detectCPRSROverlap(cpr, supportResistance),
    mtfAligned: mtfConfirmed,

    // V3 FIX: Add price structure score
    priceStructure: priceStructure?.score || 0,

    // V3: Compression / triangle pattern scoring
    compressionZone,
  });

  // === SIGNAL GENERATION ===
  let signals = [];

  // Helper to find nearest level for fallback signal
  const nearestResistance = levelInteraction?.nearestResistance || "R1";
  const nearestSupport = levelInteraction?.nearestSupport || "S1";

  // === V3 FIXED-POINT TARGETS + STRUCTURE SL ===
  // Grade-based target steps. Option premium enrichment converts these to
  // premium targets, e.g. 120 -> 132/144/156/168.
  // Thursday (expiry): Max T2 only
  function getTargetsForGrade(grade, profile = "default") {
    const now = new Date();
    const istDate = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
    const isTuesday = istDate.getUTCDay() === 2; // Tuesday = expiry day

    if (profile === "micro") {
      return isTuesday ? [6, 12] : [6, 12, 18];
    }

    if (profile === "compact") {
      return isTuesday ? [12, 24] : [12, 24, 36];
    }

    if (grade === "A+") {
      return isTuesday ? [12, 24] : [12, 24, 36, 48, 60];
    }

    if (grade === "A") {
      return isTuesday ? [12, 24] : [12, 24, 36, 48];
    }

    return isTuesday ? [12, 24] : [12, 24, 36];
  }

  // Structure SL: use retest level + buffer; floor with fixed SL per grade
  function calculateStructureSL(type, entryPrice, levelPrice, grade, atr) {
    const buffer = atr * 0.3;
    let structureSL;
    if (type === "CALL") {
      structureSL = round(Math.min(levelPrice, entryPrice) - buffer);
    } else {
      structureSL = round(Math.max(levelPrice, entryPrice) + buffer);
    }

    // Fixed SL floor per grade
    const fixedSLPts = grade === "A+" ? 18 : grade === "A" ? 16 : 14;
    const fixedSL =
      type === "CALL"
        ? round(entryPrice - fixedSLPts)
        : round(entryPrice + fixedSLPts);

    // Use MAX distance (most protective)
    if (type === "CALL") {
      return Math.min(structureSL, fixedSL); // lower of the two = wider SL for call
    } else {
      return Math.max(structureSL, fixedSL); // higher of the two = wider SL for put
    }
  }

  function detectRoundNumberRejection(candles) {
    if (!candles || candles.length < 1) return null;

    const recent = candles.slice(-3).reverse();

    for (const candle of recent) {
      const body = Math.abs(candle.close - candle.open);
      const range = Math.max(candle.high - candle.low, 0.01);
      const lowerWick = Math.min(candle.open, candle.close) - candle.low;
      const upperWick = candle.high - Math.max(candle.open, candle.close);
      const roundLevel = Math.round(candle.close / ROUND_NUMBER_STEP) * ROUND_NUMBER_STEP;
      const touchedRoundLevel =
        Math.abs(candle.high - roundLevel) <= ROUND_NUMBER_TOLERANCE ||
        Math.abs(candle.low - roundLevel) <= ROUND_NUMBER_TOLERANCE ||
        Math.abs(candle.close - roundLevel) <= ROUND_NUMBER_TOLERANCE;

      if (!touchedRoundLevel) continue;

      const bearishRejection =
        candle.high >= roundLevel - ROUND_NUMBER_TOLERANCE &&
        candle.high <= roundLevel + ROUND_NUMBER_TOLERANCE &&
        candle.close < roundLevel &&
        upperWick > body;

      if (bearishRejection) {
        return {
          detected: true,
          direction: "BEARISH",
          type: "ROUND_NUMBER_REJECTION",
          level: roundLevel,
          price: roundLevel,
          wick: "UPPER",
          strength: round((upperWick / Math.max(body, 0.01)) * (body / range)),
          candleTime: candle.time || null,
          description: `Upper wick rejection near round level ${roundLevel}`,
        };
      }

      const bullishRejection =
        candle.low >= roundLevel - ROUND_NUMBER_TOLERANCE &&
        candle.low <= roundLevel + ROUND_NUMBER_TOLERANCE &&
        candle.close > roundLevel &&
        lowerWick > body;

      if (bullishRejection) {
        return {
          detected: true,
          direction: "BULLISH",
          type: "ROUND_NUMBER_REJECTION",
          level: roundLevel,
          price: roundLevel,
          wick: "LOWER",
          strength: round((lowerWick / Math.max(body, 0.01)) * (body / range)),
          candleTime: candle.time || null,
          description: `Lower wick rejection near round level ${roundLevel}`,
        };
      }
    }

    return null;
  }

  function elevateScoringForRoundRejectionSetup(scoringResult, setup) {
    const boostedScore = Math.max(
      MIN_TRADE_SCORE,
      round((scoringResult?.score || 0) + 3),
    );
    let grade = "B+";

    if (boostedScore >= 16) {
      grade = "A+";
    } else if (boostedScore >= 13) {
      grade = "A";
    }

    return {
      ...scoringResult,
      score: boostedScore,
      grade,
      tradeable: true,
      autoExecute: false,
      breakdown: [
        ...(Array.isArray(scoringResult?.breakdown) ? scoringResult.breakdown : []),
        {
          factor: `Round Level ${setup.level}`,
          points: 3,
          critical: true,
          description: setup.description,
        },
      ],
    };
  }

  // Build a V3 signal object
  function buildV3Signal(
    type,
    entry,
    levelPrice,
    source,
    level,
    atr,
    scoringResult,
    isOpposite = false,
    signalOptions = {},
  ) {
    let adjustedScoring = { ...scoringResult };
    const isCompressionPattern = signalOptions.patternType === "COMPRESSION";
    let grade = adjustedScoring.grade;
    const isCprSignal = typeof source === "string" && source.startsWith("CPR");
    const isSrLevel = typeof level === "string" && /^[RS]\d$/.test(level);
    const levelType =
      signalOptions.levelType ||
      (isCprSignal ? "CPR" : isSrLevel ? "S/R" : "STRUCTURE");
    const levelLabel =
      signalOptions.levelLabel ||
      (isCprSignal ? (type === "CALL" ? "BC" : "TC") : level || "N/A");
    const levelSide =
      signalOptions.levelSide ||
      (isCprSignal
        ? type === "CALL"
          ? "SUPPORT"
          : "RESISTANCE"
        : isSrLevel
          ? level.startsWith("R")
            ? "RESISTANCE"
            : "SUPPORT"
          : null);

    // V3 FIX: Apply score penalty for opposite direction trades
    if (isOpposite) {
      const penalty = 4; // Reduce score by 4 points for opposite direction
      adjustedScoring.score = Math.max(0, scoringResult.score - penalty);
      adjustedScoring.breakdown = {
        ...scoringResult.breakdown,
        oppositeDirection: `⚠️ Opposite to structure (-${penalty})`,
      };

      // V3 STRICT: Recalculate grade based on new score (min 10 for B+)
      if (adjustedScoring.score >= 16) {
        adjustedScoring.grade = "A+";
        adjustedScoring.tradeable = true;
        adjustedScoring.autoExecute = true;
      } else if (adjustedScoring.score >= 13) {
        adjustedScoring.grade = "A";
        adjustedScoring.tradeable = true;
        adjustedScoring.autoExecute = false;
      } else if (adjustedScoring.score >= MIN_TRADE_SCORE) {
        adjustedScoring.grade = "B+";
        adjustedScoring.tradeable = true;
        adjustedScoring.autoExecute = false;
      } else if (adjustedScoring.score >= 7) {
        adjustedScoring.grade = "B";
        adjustedScoring.tradeable = false;
        adjustedScoring.autoExecute = false;
      } else {
        adjustedScoring.grade = "C";
        adjustedScoring.tradeable = false;
        adjustedScoring.autoExecute = false;
      }

      console.log(
        `[Strategy] ⚠️ Opposite trade penalty: ${scoringResult.score} → ${adjustedScoring.score} (${scoringResult.grade} → ${adjustedScoring.grade})`,
      );
    }

    let tradeable = adjustedScoring.tradeable;
    let autoExecute = adjustedScoring.autoExecute;

    if (
      isCompressionPattern &&
      (signalOptions.patternConfirmed || source === "TRIANGLE_BREAKOUT")
    ) {
      adjustedScoring.score = Math.max(13, adjustedScoring.score + 3);
      adjustedScoring.grade = adjustedScoring.score >= 16 ? "A+" : "A";
      tradeable = true;
      autoExecute = false;
      adjustedScoring.breakdown = [
        ...(Array.isArray(adjustedScoring.breakdown)
          ? adjustedScoring.breakdown
          : []),
        {
          factor: "⚠️ Triangle Grade Gate",
          points: 0,
          critical: true,
          description: "Triangle setup promoted to A after confirmed breakout",
        },
      ];
    }

    grade = adjustedScoring.grade;
    const targets = getTargetsForGrade(
      grade,
      signalOptions.targetProfile || "default",
    );

    const stopLoss = calculateStructureSL(type, entry, levelPrice, grade, atr);
    const slDistance = Math.abs(entry - stopLoss);

    // Primary target is T1 for conservative R:R display; targets[] has all levels
    const primaryTarget =
      type === "CALL"
        ? round(entry + targets[targets.length - 1])
        : round(entry - targets[targets.length - 1]);
    const t1 =
      type === "CALL" ? round(entry + targets[0]) : round(entry - targets[0]);

    const riskReward =
      slDistance > 0 ? round(Math.abs(primaryTarget - entry) / slDistance) : 0;

    return {
      type,
      entry: round(entry),
      stopLoss,
      target: primaryTarget, // primary (last target)
      t1, // first target for trailing
      targets: targets.map((pt) =>
        type === "CALL" ? round(entry + pt) : round(entry - pt),
      ),
      targetPoints: targets, // e.g. [25, 50, 75, 100, 120]
      riskReward,
      strikes: getStrikes(entry, type),
      timestamp: Date.now(),
      source,
      level,
      levelType,
      levelLabel,
      levelSide,
      levelPrice: round(levelPrice),
      confidence:
        adjustedScoring.grade === "A+"
          ? 0.9
          : adjustedScoring.grade === "A"
            ? 0.82
            : 0.75,
      score: adjustedScoring.score,
      grade: adjustedScoring.grade,
      breakdown: adjustedScoring.breakdown,
      tradeable,
      autoExecute,
      targetProfile: signalOptions.targetProfile || "default",
      description: `${type} ${source} @ ${levelLabel} | Grade ${grade} | SL:${targets[0]}pt T:${targets.join("/")}pt${isOpposite ? " (OPPOSITE)" : ""}${isCompressionPattern ? " (TRIANGLE)" : ""}`,
    };
  }

  function elevateScoringForExplosiveBreakout(
    scoringResult,
    explosiveBreakout,
  ) {
    const boostedScore = Math.max(
      MIN_TRADE_SCORE,
      (scoringResult?.score || 0) + 3,
    );
    let grade = "B+";
    let autoExecute = false;

    if (boostedScore >= 16) {
      grade = "A+";
      autoExecute = true;
    } else if (boostedScore >= 13) {
      grade = "A";
    }

    return {
      ...scoringResult,
      score: boostedScore,
      grade,
      tradeable: true,
      autoExecute,
      breakdown: [
        ...(Array.isArray(scoringResult?.breakdown)
          ? scoringResult.breakdown
          : []),
        {
          factor: "Explosive Breakout",
          points: 3,
          critical: true,
          description: `${explosiveBreakout.level} moved ${explosiveBreakout.explosiveDistance} pts in one candle (threshold ${EXPLOSIVE_BREAKOUT_THRESHOLD})`,
        },
      ],
    };
  }

  function elevateScoringForRangeRejectionSetup(scoringResult, setup) {
    const boostedScore = Math.max(
      MIN_TRADE_SCORE,
      round((scoringResult?.score || 0) + RANGE_REJECTION_SCORE_BOOST),
    );
    let grade = "B+";
    let autoExecute = false;

    if (boostedScore >= 16) {
      grade = "A+";
      autoExecute = true;
    } else if (boostedScore >= 13) {
      grade = "A";
    }

    return {
      ...scoringResult,
      score: boostedScore,
      grade,
      tradeable: true,
      autoExecute,
      breakdown: [
        ...(Array.isArray(scoringResult?.breakdown)
          ? scoringResult.breakdown
          : []),
        {
          factor: "Range Rejection Cluster",
          points: RANGE_REJECTION_SCORE_BOOST,
          critical: true,
          description: `${setup.level} had ${setup.rejectionCount} rejections, shallow pullback and strong ${setup.direction.toLowerCase()} continuation`,
        },
      ],
    };
  }

  function elevateScoringForQuickReversalSetup(scoringResult, setup) {
    const boostedScore = Math.max(
      MIN_TRADE_SCORE,
      round((scoringResult?.score || 0) + 4.5),
    );
    let grade = "B+";
    let autoExecute = false;

    if (boostedScore >= 16) {
      grade = "A+";
      autoExecute = true;
    } else if (boostedScore >= 13) {
      grade = "A";
    }

    return {
      ...scoringResult,
      score: boostedScore,
      grade,
      tradeable: true,
      autoExecute,
      breakdown: [
        ...(Array.isArray(scoringResult?.breakdown)
          ? scoringResult.breakdown
          : []),
        {
          factor: "Quick Reversal Continuation",
          points: 4.5,
          critical: true,
          description: `${setup.level} showed a strong wick reversal and immediate continuation`,
        },
      ],
    };
  }

  // **V3 STRICT RULE**: Only generate signals on CONFIRMED STRUCTURE
  // REQUIREMENT: Must have breakout → retest/consolidation → rejection → confirmation
  // NO FALLBACK SIGNALS without proper market structure

  // V3 STRICT: Check if inside CPR (block unless wide CPR)
  const isInsideCPR = cprState?.state === "INSIDE";
  const isWideCPR = cpr.width > 50; // Wide CPR exception (50+ points)
  const allowInsideCPR = isInsideCPR && isWideCPR;
  const compressionBlocked =
    compressionZone?.detected &&
    !triangleRetestSetup &&
    !holdConfirmed &&
    !retestDetected &&
    !continuationDetected &&
    !explosiveBreakoutDetected &&
    !rangeRejectionSetup &&
    !quickReversalSetup &&
    !roundRejectionSetup;

  if (isInsideCPR && !isWideCPR) {
    console.log(
      `[Strategy] ❌ BLOCKED: Inside CPR (width: ${round(cpr.width)}pts < 50pts) - No edge, waiting for breakout`,
    );
    // Don't generate any signals when inside narrow CPR
    signals = [];
  } else if (compressionBlocked) {
    console.log(
      `[Strategy] ❌ BLOCKED: ${compressionZone.patternLabel || "Compression"} - wait for breakout and retest outside the zone`,
    );
    signals = [];
  } else {
    // V3 STRICT: All signals MUST have retest or hold confirmation
    const hasProperStructure =
      retestDetected ||
      holdConfirmed ||
      continuationDetected ||
      breakoutMomentumSetup ||
      explosiveBreakoutDetected ||
      rangeRejectionSetup ||
      cprRangeRejectionSetup ||
      quickReversalSetup ||
      roundRejectionSetup ||
      triangleRetestSetup ||
      triangleContinuationSetup;

    if (!hasProperStructure) {
      console.log(
        `[Strategy] ❌ BLOCKED: No proper structure detected - Waiting for breakout + retest + confirmation`,
      );
      signals = [];
    } else {
      if (allowInsideCPR) {
        console.log(
          `[Strategy] ✅ Wide CPR detected (${round(cpr.width)}pts) - Inside CPR signals allowed`,
        );
      }

      // Setup 1: Hold Confirmed (Highest Confidence) - STRICT: Score >= 10
      if (holdConfirmed && scoring.score >= MIN_TRADE_SCORE && mtfConfirmed) {
        const type = holdConfirmed.direction === "BULLISH" ? "CALL" : "PUT";
        const entry = lastPrice;
        const levelPrice = holdConfirmed.price;

        // V3 FIX: Validate rejection alignment
        const rejectionAligned = validateRejectionAlignment(
          rejectionCandle,
          holdConfirmed.direction,
        );
        const strongRejectionConfirmed =
          hasStrongRejectionConfirmation(rejectionCandle);

        if (
          rejectionAligned &&
          (scoring.score >= MIN_TRADE_SCORE || strongRejectionConfirmed)
        ) {
          console.log(
            `[Strategy] ✅ RETEST_CONFIRMED: ${type} @ ${holdConfirmed.level} | Score: ${scoring.score} | ${scoring.grade}${strongRejectionConfirmed && scoring.score < MIN_TRADE_SCORE ? " | Strong rejection override" : ""}`,
          );
          signals.push(
            buildV3Signal(
              type,
              entry,
              levelPrice,
              "RETEST_CONFIRMED",
              holdConfirmed.level,
              atr,
              scoring,
              false,
            ),
          );
        } else {
          console.log(
            `[Strategy] ❌ BLOCKED: Rejection misaligned with ${holdConfirmed.direction} breakout`,
          );
        }
      }

      // Setup 2: Retest detected (STRICT: Score >= 10 for B+)
      if (
        retestDetected &&
        !holdConfirmed &&
        scoring.score >= MIN_TRADE_SCORE &&
        mtfConfirmed
      ) {
        const type = retestDetected.direction === "BULLISH" ? "CALL" : "PUT";
        const entry = lastPrice;
        const levelPrice = retestDetected.price;

        // V3 FIX: Validate rejection alignment
        const rejectionAligned = validateRejectionAlignment(
          rejectionCandle,
          retestDetected.direction,
        );
        const strongRejectionConfirmed =
          hasStrongRejectionConfirmation(rejectionCandle);

        if (
          rejectionAligned &&
          (scoring.score >= MIN_TRADE_SCORE || strongRejectionConfirmed)
        ) {
          console.log(
            `[Strategy] ✅ RETEST_PENDING: ${type} @ ${retestDetected.level} | Score: ${scoring.score} | ${scoring.grade}${strongRejectionConfirmed && scoring.score < MIN_TRADE_SCORE ? " | Strong rejection override" : ""}`,
          );
          const sig = buildV3Signal(
            type,
            entry,
            levelPrice,
            "RETEST_PENDING",
            retestDetected.level,
            atr,
            scoring,
            false,
          );
          sig.tradeable = scoring.score >= MIN_TRADE_SCORE;
          sig.autoExecute = false;
          signals.push(sig);
        } else {
          console.log(
            `[Strategy] ❌ BLOCKED: Rejection misaligned with ${retestDetected.direction} retest`,
          );
        }
      }

      // Setup 2B: Breakout continuation after shallow pullback (STRICT: Score >= 10)
      if (
        continuationDetected &&
        !holdConfirmed &&
        !retestDetected &&
        scoring.score >= MIN_TRADE_SCORE &&
        mtfConfirmed
      ) {
        const type =
          continuationDetected.direction === "BULLISH" ? "CALL" : "PUT";
        const entry = lastPrice;
        const levelPrice = continuationDetected.price;

        console.log(
          `[Strategy] ✅ BREAKOUT_CONTINUATION: ${type} @ ${continuationDetected.level} | Score: ${scoring.score} | ${scoring.grade}`,
        );

        const sig = buildV3Signal(
          type,
          entry,
          levelPrice,
          "BREAKOUT_CONTINUATION",
          continuationDetected.level,
          atr,
          scoring,
          false,
        );
        sig.autoExecute = false;
        signals.push(sig);
      }

      // Setup 2BA: Fresh breakout/breakdown with immediate continuation
      if (
        breakoutMomentumSetup &&
        !holdConfirmed &&
        !retestDetected &&
        !continuationDetected &&
        mtfConfirmed
      ) {
        const type =
          breakoutMomentumSetup.direction === "BULLISH" ? "CALL" : "PUT";
        const entry = lastPrice;
        const levelPrice = breakoutMomentumSetup.price;
        const momentumScoring = elevateScoringForQuickReversalSetup(
          scoring,
          breakoutMomentumSetup,
        );

        console.log(
          `[Strategy] ✅ BREAKOUT_MOMENTUM: ${type} @ ${breakoutMomentumSetup.level} | Score: ${momentumScoring.score} | ${momentumScoring.grade}`,
        );

        const sig = buildV3Signal(
          type,
          entry,
          levelPrice,
          "BREAKOUT_MOMENTUM",
          breakoutMomentumSetup.level,
          atr,
          momentumScoring,
          false,
          { targetProfile: "compact" },
        );
        sig.autoExecute = false;
        signals.push(sig);
      }

      // Setup 2C: Multiple rejections at CPR ranges: BC/R -> PE, TC/S -> CE
      if (
        cprRangeRejectionSetup &&
        !holdConfirmed &&
        !retestDetected &&
        mtfConfirmed
      ) {
        const type =
          cprRangeRejectionSetup.direction === "BULLISH" ? "CALL" : "PUT";
        const entry = lastPrice;
        const levelPrice = cprRangeRejectionSetup.price;
        const cprRangeScoring = elevateScoringForRangeRejectionSetup(
          scoring,
          cprRangeRejectionSetup,
        );

        console.log(
          `[Strategy] ✅ CPR_RANGE_REJECTION: ${type} @ ${cprRangeRejectionSetup.level} | Rejections: ${cprRangeRejectionSetup.rejectionCount} | Score: ${cprRangeScoring.score} | ${cprRangeScoring.grade}`,
        );

        const sig = buildV3Signal(
          type,
          entry,
          levelPrice,
          "CPR_RANGE_REJECTION",
          cprRangeRejectionSetup.level,
          atr,
          cprRangeScoring,
          false,
          {
            targetProfile: "compact",
            levelType: "CPR",
            levelLabel: cprRangeRejectionSetup.level,
            levelSide: cprRangeRejectionSetup.levelSide,
          },
        );
        sig.autoExecute = false;
        signals.push(sig);
      }

      // Setup 2D: Multiple rejections inside S/R range, shallow pullback, strong continuation
      if (
        rangeRejectionSetup &&
        !holdConfirmed &&
        !retestDetected &&
        mtfConfirmed
      ) {
        const type =
          rangeRejectionSetup.direction === "BULLISH" ? "CALL" : "PUT";
        const entry = lastPrice;
        const levelPrice = rangeRejectionSetup.price;
        const rangeScoring = elevateScoringForRangeRejectionSetup(
          scoring,
          rangeRejectionSetup,
        );

        console.log(
          `[Strategy] ✅ RANGE_REJECTION_CONTINUATION: ${type} @ ${rangeRejectionSetup.level} | Rejections: ${rangeRejectionSetup.rejectionCount} | Score: ${rangeScoring.score} | ${rangeScoring.grade}`,
        );

        const sig = buildV3Signal(
          type,
          entry,
          levelPrice,
          "RANGE_REJECTION_CONTINUATION",
          rangeRejectionSetup.level,
          atr,
          rangeScoring,
          false,
          { targetProfile: "compact" },
        );
        sig.autoExecute = false;
        signals.push(sig);
      }

      // Setup 2E: Quick reversal wick + immediate continuation
      if (
        quickReversalSetup &&
        !holdConfirmed &&
        !retestDetected &&
        mtfConfirmed
      ) {
        const type =
          quickReversalSetup.direction === "BULLISH" ? "CALL" : "PUT";
        const entry = lastPrice;
        const levelPrice = quickReversalSetup.price;
        const quickReversalScoring = elevateScoringForQuickReversalSetup(
          scoring,
          quickReversalSetup,
        );

        console.log(
          `[Strategy] ✅ QUICK_REVERSAL_CONTINUATION: ${type} @ ${quickReversalSetup.level} | Score: ${quickReversalScoring.score} | ${quickReversalScoring.grade}`,
        );

        const sig = buildV3Signal(
          type,
          entry,
          levelPrice,
          "QUICK_REVERSAL_CONTINUATION",
          quickReversalSetup.level,
          atr,
          quickReversalScoring,
          false,
          { targetProfile: "compact" },
        );
        sig.autoExecute = false;
        signals.push(sig);
      }

      // Setup 2F: Triangle breakout continuation without exact retest
      if (triangleContinuationSetup && !triangleRetestSetup && mtfConfirmed) {
        const type =
          triangleContinuationSetup.direction === "BULLISH" ? "CALL" : "PUT";
        const entry = lastPrice;
        const levelPrice = triangleContinuationSetup.price;
        const triangleScoring = {
          ...scoring,
          score: Math.max(MIN_TRADE_SCORE, (scoring.score || 0) + 3),
          grade: (scoring.score || 0) + 3 >= 13 ? "A" : "B+",
          tradeable: true,
          autoExecute: false,
          breakdown: [
            ...(Array.isArray(scoring.breakdown) ? scoring.breakdown : []),
            {
              factor: compressionZone.patternLabel || "Triangle Continuation",
              points: 3,
              critical: true,
              description: triangleContinuationSetup.description,
            },
          ],
        };

        console.log(
          `[Strategy] ✅ TRIANGLE_CONTINUATION: ${type} @ ${triangleContinuationSetup.level} | Score: ${triangleScoring.score} | ${triangleScoring.grade}`,
        );

        const sig = buildV3Signal(
          type,
          entry,
          levelPrice,
          "TRIANGLE_CONTINUATION",
          triangleContinuationSetup.level,
          atr,
          triangleScoring,
          false,
          { targetProfile: "compact", patternType: "COMPRESSION" },
        );
        sig.tradeable = true;
        sig.autoExecute = false;
        signals.push(sig);
      }

      // Setup 2G: Compression / Triangle breakout retest confirmation
      if (triangleRetestSetup && mtfConfirmed) {
        const type =
          triangleRetestSetup.direction === "BULLISH" ? "CALL" : "PUT";
        const entry = lastPrice;
        const levelPrice = triangleRetestSetup.price;
        const triangleScoring = {
          ...scoring,
          score: Math.max(13, (scoring.score || 0) + 3),
          grade: (scoring.score || 0) + 3 >= 16 ? "A+" : "A",
          tradeable: true,
          autoExecute: false,
          breakdown: [
            ...(Array.isArray(scoring.breakdown) ? scoring.breakdown : []),
            {
              factor: compressionZone.patternLabel || "Triangle",
              points: 5,
              critical: true,
              description: triangleRetestSetup.description,
            },
          ],
        };

        console.log(
          `[Strategy] ✅ TRIANGLE_RETEST: ${type} @ ${triangleRetestSetup.level} | Score: ${triangleScoring.score} | ${triangleScoring.grade}`,
        );

        const sig = buildV3Signal(
          type,
          entry,
          levelPrice,
          "TRIANGLE_RETEST",
          triangleRetestSetup.level,
          atr,
          triangleScoring,
          false,
          {
            targetProfile: "compact",
            patternType: "COMPRESSION",
            patternConfirmed: true,
          },
        );
        sig.tradeable = true;
        sig.autoExecute = false;
        signals.push(sig);
      }

      // Setup 2BB: Round-number wick rejection (24000/23500 style)
      if (
        roundRejectionSetup &&
        !holdConfirmed &&
        !retestDetected &&
        !continuationDetected &&
        !breakoutMomentumSetup &&
        mtfConfirmed
      ) {
        const type = roundRejectionSetup.direction === "BULLISH" ? "CALL" : "PUT";
        const entry = lastPrice;
        const levelPrice = roundRejectionSetup.price;
        const roundRejectionScoring = elevateScoringForRoundRejectionSetup(
          scoring,
          roundRejectionSetup,
        );

        console.log(
          `[Strategy] ✅ ROUND_REJECTION: ${type} @ ${roundRejectionSetup.level} | Score: ${roundRejectionScoring.score} | ${roundRejectionScoring.grade} | Small targets`,
        );

        const sig = buildV3Signal(
          type,
          entry,
          levelPrice,
          "ROUND_REJECTION",
          String(roundRejectionSetup.level),
          atr,
          roundRejectionScoring,
          false,
          {
            targetProfile: "micro",
            levelType: "ROUND",
            levelLabel: `${roundRejectionSetup.level}`,
            levelSide:
              roundRejectionSetup.direction === "BULLISH"
                ? "SUPPORT"
                : "RESISTANCE",
          },
        );
        sig.tradeable = true;
        sig.autoExecute = false;
        signals.push(sig);
      }

      // Setup 2H: One-candle explosive breakout (80+ pts beyond broken level)
      if (
        explosiveBreakoutDetected &&
        !holdConfirmed &&
        !retestDetected &&
        !continuationDetected &&
        mtfConfirmed &&
        strongCandle?.isStrong
      ) {
        const type =
          explosiveBreakoutDetected.direction === "BULLISH" ? "CALL" : "PUT";
        const entry = lastPrice;
        const levelPrice = explosiveBreakoutDetected.price;
        const explosiveScoring = elevateScoringForExplosiveBreakout(
          scoring,
          explosiveBreakoutDetected,
        );

        console.log(
          `[Strategy] ✅ BREAKOUT_EXPLOSIVE: ${type} @ ${explosiveBreakoutDetected.level} | Distance: ${explosiveBreakoutDetected.explosiveDistance}pts | Score: ${explosiveScoring.score} | ${explosiveScoring.grade}`,
        );

        const sig = buildV3Signal(
          type,
          entry,
          levelPrice,
          "BREAKOUT_EXPLOSIVE",
          explosiveBreakoutDetected.level,
          atr,
          explosiveScoring,
          false,
        );
        signals.push(sig);
      }

      // Setup 3: CPR Rejection Reversal (STRICT: Only with proper structure + score >= 10)
      if (
        hasProperStructure &&
        cprState?.state === "REJECTION" &&
        scoring.score >= MIN_TRADE_SCORE &&
        mtfConfirmed
      ) {
        const rejectionBias = cprState?.bias || bias;
        const type = rejectionBias === "BULLISH" ? "CALL" : "PUT";
        const entry = lastPrice;
        const levelPrice = type === "CALL" ? cpr.bc : cpr.tc;
        const levelLabel = cprState?.level || (type === "CALL" ? "BC" : "TC");

        // V3 FIX: Check if this is opposite to structure
        const isOpposite = biasSource === "CPR" && biasConflict;

        const rejectionAligned = validateRejectionAlignment(
          rejectionCandle,
          rejectionBias,
        );

        if (!rejectionAligned) {
          console.log(
            `[Strategy] ❌ BLOCKED: CPR rejection candle misaligned with ${rejectionBias} boundary`,
          );
        } else {
          console.log(
            `[Strategy] ✅ CPR_REJECTION: ${type} @ ${levelLabel} | Score: ${scoring.score} | ${scoring.grade}${isOpposite ? " (OPPOSITE)" : ""}`,
          );
          const sig = buildV3Signal(
            type,
            entry,
            levelPrice,
            "CPR_REJECTION",
            "CPR",
            atr,
            scoring,
            isOpposite,
            {
              levelType: "CPR",
              levelLabel,
              levelSide:
                cprState?.levelSide ||
                (type === "CALL" ? "SUPPORT" : "RESISTANCE"),
            },
          );
          sig.confidence = 0.78;
          if (!signals.find((s) => s.type === type)) {
            signals.push(sig);
          }
        }
      }

      // Setup 4: CPR + Manipulation (STRICT: Only with proper structure + A grade)
      if (
        hasProperStructure &&
        manipulation &&
        bias !== "NEUTRAL" &&
        mtfConfirmed &&
        scoring.score >= 13
      ) {
        const type =
          manipulation.direction === "BUY" && bias === "BULLISH"
            ? "CALL"
            : manipulation.direction === "SELL" && bias === "BEARISH"
              ? "PUT"
              : null;

        if (
          type &&
          !signals.find(
            (s) => s.type === type && s.source === "CPR_AM_MANIPULATION",
          )
        ) {
          const entry = lastPrice;
          const levelPrice = type === "CALL" ? cpr.bc : cpr.tc;

          // V3 FIX: Check if opposite to structure
          const isOpposite =
            biasSource !== "CPR" &&
            ((type === "CALL" && bias === "BEARISH") ||
              (type === "PUT" && bias === "BULLISH"));

          console.log(
            `[Strategy] ✅ CPR_AM_MANIPULATION: ${type} | Score: ${scoring.score} | ${scoring.grade}${isOpposite ? " (OPPOSITE)" : ""}`,
          );
          const sig = buildV3Signal(
            type,
            entry,
            levelPrice,
            "CPR_AM_MANIPULATION",
            "CPR",
            atr,
            scoring,
            isOpposite,
          );
          signals.push(sig);
        }
      }
    }
  }

  // Clean up old tracking data
  retestTracker.cleanup();

  // Get active market structure opportunities
  const marketStructure = retestTracker.getActiveOpportunities();
  const executableSignals = signals.filter((signal) => signal.tradeable);
  const effectiveScoring = {
    ...scoring,
    tradeable: executableSignals.length > 0,
    autoExecute: executableSignals.some((signal) => signal.autoExecute),
    executionReady: executableSignals.length > 0,
    executionReason:
      executableSignals.length > 0
        ? executableSignals[0].source
        : compressionBlocked
          ? "BLOCKED_IN_COMPRESSION"
          : isInsideCPR && !isWideCPR
            ? "BLOCKED_INSIDE_CPR"
            : !(
                  retestDetected ||
                  holdConfirmed ||
                  continuationDetected ||
                  breakoutMomentumSetup ||
                  explosiveBreakoutDetected ||
                  rangeRejectionSetup ||
                  cprRangeRejectionSetup ||
                  triangleRetestSetup ||
                  triangleContinuationSetup
                )
              ? "WAITING_STRUCTURE_CONFIRMATION"
              : scoring.score < MIN_TRADE_SCORE
                ? "WAITING_SCORE_UPGRADE"
                : "WAITING_REJECTION_ALIGNMENT",
  };

  return {
    // CPR Analysis
    cpr,
    supportResistance,
    bias, // V3 FIX: Now uses dominant bias (breakout > structure > CPR)
    biasSource, // V3 FIX: Where bias came from (RETEST/BREAKOUT/STRUCTURE/CPR)
    biasConflict, // V3 FIX: True if structure conflicts with CPR
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
    explosiveBreakoutDetected,
    retestDetected,
    holdConfirmed,
    continuationDetected,
    roundRejectionSetup,
    rangeRejectionSetup,
    rejectionCandle,
    priceStructure, // V3 FIX: Price structure detection
    compressionZone,

    // Candle & Volume
    strongCandle,
    volumeSpike,
    volumeConfirmation,

    // S/R Levels
    levelInteraction,

    // Scoring
    scoring: effectiveScoring,

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

function detectCompressionZone(
  candles,
  supportResistance,
  levelInteraction,
  atr,
  volumeConfirmation,
) {
  if (!candles || candles.length < TRIANGLE_LOOKBACK_CANDLES) return null;

  const recent = candles.slice(-TRIANGLE_LOOKBACK_CANDLES);
  const highs = recent.map((c) => c.high);
  const lows = recent.map((c) => c.low);
  const lastCandle = recent[recent.length - 1];
  const lastClose = lastCandle.close;
  const tolerance = Math.max(TRIANGLE_TOLERANCE_POINTS, atr * 0.15, 3);
  const breakoutBuffer = Math.max(TRIANGLE_BREAKOUT_BUFFER, atr * 0.4, 6);
  const volumeRatio = volumeConfirmation?.volumeRatio || 0;
  const candleRange = Math.max(lastCandle.high - lastCandle.low, 0.01);
  const candleBody = Math.abs(lastCandle.close - lastCandle.open);
  const strongFollowThrough = candleBody / candleRange >= 0.55;

  const descendingHighs = highs[0] > highs[highs.length - 1];
  const ascendingLows = lows[0] < lows[lows.length - 1];

  let lowerHighs = true;
  let higherLows = true;
  let equalHighs = true;
  let equalLows = true;

  for (let i = 1; i < highs.length; i++) {
    if (highs[i] > highs[i - 1] - tolerance) {
      lowerHighs = false;
    }
    if (Math.abs(highs[i] - highs[i - 1]) > tolerance) {
      equalHighs = false;
    }
  }

  for (let i = 1; i < lows.length; i++) {
    if (lows[i] < lows[i - 1] + tolerance) {
      higherLows = false;
    }
    if (Math.abs(lows[i] - lows[i - 1]) > tolerance) {
      equalLows = false;
    }
  }

  const rangeHigh = Math.max(...highs);
  const rangeLow = Math.min(...lows);
  const rangeWidth = rangeHigh - rangeLow;
  const contractingRange = rangeWidth <= Math.max(atr * 2.5, 20);

  let pattern = null;
  let patternLabel = null;
  let breakoutDirection = null;
  let breakoutLevel = null;

  if (lowerHighs && equalLows) {
    pattern = "DESCENDING_TRIANGLE";
    patternLabel = "Descending Triangle";
    breakoutDirection =
      lastClose > rangeHigh
        ? "BULLISH"
        : lastClose < rangeLow
          ? "BEARISH"
          : null;
    breakoutLevel = breakoutDirection === "BULLISH" ? rangeHigh : rangeLow;
  } else if (equalHighs && higherLows) {
    pattern = "ASCENDING_TRIANGLE";
    patternLabel = "Ascending Triangle";
    breakoutDirection =
      lastClose > rangeHigh
        ? "BULLISH"
        : lastClose < rangeLow
          ? "BEARISH"
          : null;
    breakoutLevel = breakoutDirection === "BULLISH" ? rangeHigh : rangeLow;
  } else if (lowerHighs && higherLows) {
    pattern = "SYMMETRICAL_TRIANGLE";
    patternLabel = "Symmetrical Triangle";
    breakoutDirection =
      lastClose > rangeHigh
        ? "BULLISH"
        : lastClose < rangeLow
          ? "BEARISH"
          : null;
    breakoutLevel = breakoutDirection === "BULLISH" ? rangeHigh : rangeLow;
  } else if (equalHighs && equalLows && contractingRange) {
    pattern = "RANGE";
    patternLabel = "Compression Range";
    breakoutDirection =
      lastClose > rangeHigh
        ? "BULLISH"
        : lastClose < rangeLow
          ? "BEARISH"
          : null;
    breakoutLevel = breakoutDirection === "BULLISH" ? rangeHigh : rangeLow;
  } else if (contractingRange && (descendingHighs || ascendingLows)) {
    pattern = "FLAG_PENNANT";
    patternLabel = descendingHighs && ascendingLows ? "Pennant" : "Flag";
    breakoutDirection =
      lastClose > rangeHigh
        ? "BULLISH"
        : lastClose < rangeLow
          ? "BEARISH"
          : null;
    breakoutLevel = breakoutDirection === "BULLISH" ? rangeHigh : rangeLow;
  }

  if (!pattern) return null;

  const breakoutConfirmed =
    breakoutDirection &&
    ((breakoutDirection === "BULLISH" &&
      lastClose > breakoutLevel + breakoutBuffer) ||
      (breakoutDirection === "BEARISH" &&
        lastClose < breakoutLevel - breakoutBuffer)) &&
    (volumeRatio >= 1.2 || strongFollowThrough);

  const breakoutWatch =
    !breakoutConfirmed &&
    ((breakoutDirection === "BULLISH" &&
      breakoutLevel &&
      breakoutLevel - lastClose <= breakoutBuffer) ||
      (breakoutDirection === "BEARISH" &&
        breakoutLevel &&
        lastClose - breakoutLevel <= breakoutBuffer));

  return {
    detected: true,
    pattern,
    patternLabel,
    state: breakoutConfirmed
      ? "CONFIRMED_ENTRY"
      : breakoutWatch
        ? "BREAKOUT_WATCH"
        : "BUILDING",
    direction: breakoutDirection,
    breakoutLevel,
    rangeHigh: round(rangeHigh),
    rangeLow: round(rangeLow),
    rangeWidth: round(rangeWidth),
    breakoutConfirmed,
    breakoutWatch,
    volumeRatio: round(volumeRatio),
    strongFollowThrough,
    description: `${patternLabel} ${breakoutConfirmed ? "breakout confirmed" : breakoutWatch ? "breakout watch" : "building"}`,
    breakoutDescription: breakoutConfirmed
      ? `${patternLabel} breakout confirmed`
      : null,
  };
}

function detectTriangleRetestSetup(candles, compressionZone, atr) {
  if (
    !candles ||
    candles.length < TRIANGLE_LOOKBACK_CANDLES ||
    !compressionZone?.detected ||
    !compressionZone?.direction ||
    !compressionZone?.breakoutLevel
  ) {
    return null;
  }

  const recent = candles.slice(-5);
  if (recent.length < 3) return null;

  const breakoutLevel = compressionZone.breakoutLevel;
  const breakoutBuffer = Math.max(TRIANGLE_BREAKOUT_BUFFER, atr * 0.4, 6);
  const retestTolerance = Math.max(
    TRIANGLE_TOLERANCE_POINTS,
    atr * 0.35,
    (compressionZone.rangeWidth || 0) * 0.2,
    6,
  );
  const lastCandle = recent[recent.length - 1];
  const priorCandles = recent.slice(0, -1);

  const breakoutSeen = priorCandles.some((candle) =>
    compressionZone.direction === "BULLISH"
      ? candle.close > breakoutLevel + breakoutBuffer
      : candle.close < breakoutLevel - breakoutBuffer,
  );

  if (!breakoutSeen) return null;

  const retestTouched = recent.some(
    (candle) =>
      candle.high >= breakoutLevel - retestTolerance &&
      candle.low <= breakoutLevel + retestTolerance,
  );

  const rejection = detectRejectionCandle(
    lastCandle,
    compressionZone.direction,
  );
  const alignedClose =
    compressionZone.direction === "BULLISH"
      ? lastCandle.close > breakoutLevel
      : lastCandle.close < breakoutLevel;

  if (retestTouched && rejection.detected && alignedClose) {
    return {
      detected: true,
      direction: compressionZone.direction,
      level: compressionZone.patternLabel || "TRIANGLE",
      price: round(breakoutLevel),
      description: `${compressionZone.patternLabel || "Triangle"} breakout retest confirmed`,
    };
  }

  return null;
}

function detectTriangleContinuationSetup(
  candles,
  compressionZone,
  atr,
  strongCandle,
) {
  if (
    !candles ||
    candles.length < TRIANGLE_LOOKBACK_CANDLES ||
    !compressionZone?.detected ||
    !compressionZone?.direction ||
    !compressionZone?.breakoutLevel ||
    !compressionZone?.breakoutConfirmed
  ) {
    return null;
  }

  const recent = candles.slice(-3);
  if (recent.length < 3) return null;

  const lastCandle = recent[recent.length - 1];
  const previousCandle = recent[recent.length - 2];
  const breakoutLevel = compressionZone.breakoutLevel;
  const followThroughBuffer = Math.max(atr * 0.25, 5);

  const continuingUp =
    compressionZone.direction === "BULLISH" &&
    recent.every((candle) => candle.close > breakoutLevel) &&
    lastCandle.close > previousCandle.high - followThroughBuffer &&
    (lastCandle.close > lastCandle.open ||
      strongCandle?.direction === "BULLISH");

  const continuingDown =
    compressionZone.direction === "BEARISH" &&
    recent.every((candle) => candle.close < breakoutLevel) &&
    lastCandle.close < previousCandle.low + followThroughBuffer &&
    (lastCandle.close < lastCandle.open ||
      strongCandle?.direction === "BEARISH");

  if (!continuingUp && !continuingDown) return null;

  return {
    detected: true,
    direction: compressionZone.direction,
    level: compressionZone.patternLabel || "TRIANGLE",
    price: round(breakoutLevel),
    setupType: "TRIANGLE_CONTINUATION",
    description: `${compressionZone.patternLabel || "Triangle"} breakout continuing ${compressionZone.direction.toLowerCase()}`,
  };
}

function detectCPRRangeRejectionSetup(candles, cpr, atr, strongCandle) {
  if (!candles || candles.length < 6 || !cpr) return null;

  const recent = candles.slice(-8);
  const lastCandle = recent[recent.length - 1];
  const previousCandle = recent[recent.length - 2];
  const tolerance = Math.max(atr * 0.25, 6);

  const countUpperRejections = (levelPrice) =>
    recent.filter((candle) => {
      const range = Math.max(candle.high - candle.low, 0.01);
      const body = Math.abs(candle.close - candle.open);
      const upperWick = candle.high - Math.max(candle.open, candle.close);
      return (
        candle.high >= levelPrice - tolerance &&
        Math.abs(candle.close - levelPrice) <= Math.max(tolerance * 2, range) &&
        upperWick >= Math.max(body, range * 0.3)
      );
    }).length;

  const countLowerRejections = (levelPrice) =>
    recent.filter((candle) => {
      const range = Math.max(candle.high - candle.low, 0.01);
      const body = Math.abs(candle.close - candle.open);
      const lowerWick = Math.min(candle.open, candle.close) - candle.low;
      return (
        candle.low <= levelPrice + tolerance &&
        Math.abs(candle.close - levelPrice) <= Math.max(tolerance * 2, range) &&
        lowerWick >= Math.max(body, range * 0.3)
      );
    }).length;

  const bcRejections = countUpperRejections(cpr.bc);
  const tcRejections = countLowerRejections(cpr.tc);

  const bearishContinuation =
    bcRejections >= MIN_RANGE_REJECTIONS &&
    lastCandle.close < previousCandle.low + tolerance &&
    (lastCandle.close < lastCandle.open ||
      strongCandle?.direction === "BEARISH");

  if (bearishContinuation) {
    return {
      direction: "BEARISH",
      level: "BC",
      price: cpr.bc,
      levelSide: "RESISTANCE",
      rejectionCount: bcRejections,
      setupType: "CPR_RANGE_REJECTION",
      description: `BC had ${bcRejections} rejections and bearish continuation`,
    };
  }

  const bullishContinuation =
    tcRejections >= MIN_RANGE_REJECTIONS &&
    lastCandle.close > previousCandle.high - tolerance &&
    (lastCandle.close > lastCandle.open ||
      strongCandle?.direction === "BULLISH");

  if (bullishContinuation) {
    return {
      direction: "BULLISH",
      level: "TC",
      price: cpr.tc,
      levelSide: "SUPPORT",
      rejectionCount: tcRejections,
      setupType: "CPR_RANGE_REJECTION",
      description: `TC had ${tcRejections} rejections and bullish continuation`,
    };
  }

  return null;
}

function detectRangeRejectionSetup(
  candles,
  supportResistance,
  levelInteraction,
  atr,
  strongCandle,
) {
  if (!candles || candles.length < 8 || !levelInteraction) {
    return null;
  }

  const recent = candles.slice(-8);
  const lastCandle = recent[recent.length - 1];
  const previousCandle = recent[recent.length - 2];
  const tolerance = Math.max(atr * 0.3, 8);

  const nearestResistanceName = levelInteraction.nearestResistance;
  const nearestSupportName = levelInteraction.nearestSupport;
  const resistancePrice = nearestResistanceName
    ? supportResistance[nearestResistanceName]
    : null;
  const supportPrice = nearestSupportName
    ? supportResistance[nearestSupportName]
    : null;

  const upperRejections = resistancePrice
    ? recent.filter((candle) => {
        const nearResistance = candle.high >= resistancePrice - tolerance;
        const upperWick = candle.high - Math.max(candle.open, candle.close);
        const body = Math.abs(candle.close - candle.open);
        return (
          nearResistance &&
          upperWick > body &&
          candle.close < candle.high - (candle.high - candle.low) * 0.35
        );
      })
    : [];

  const lowerRejections = supportPrice
    ? recent.filter((candle) => {
        const nearSupport = candle.low <= supportPrice + tolerance;
        const lowerWick = Math.min(candle.open, candle.close) - candle.low;
        const body = Math.abs(candle.close - candle.open);
        return (
          nearSupport &&
          lowerWick > body &&
          candle.close > candle.low + (candle.high - candle.low) * 0.35
        );
      })
    : [];

  const bearishPullbackSeen = resistancePrice
    ? recent
        .slice(-4, -1)
        .some(
          (candle) =>
            candle.close > candle.open &&
            candle.high <= resistancePrice + tolerance,
        )
    : false;
  const bullishPullbackSeen = supportPrice
    ? recent
        .slice(-4, -1)
        .some(
          (candle) =>
            candle.close < candle.open &&
            candle.low >= supportPrice - tolerance,
        )
    : false;

  const bearishContinuation =
    upperRejections.length >= MIN_RANGE_REJECTIONS &&
    bearishPullbackSeen &&
    lastCandle.close < previousCandle.low &&
    lastCandle.close < lastCandle.open;

  if (bearishContinuation && resistancePrice) {
    return {
      direction: "BEARISH",
      level: nearestResistanceName,
      price: resistancePrice,
      rejectionCount: upperRejections.length,
      setupType: "RANGE_REJECTION_CONTINUATION",
      description: `${nearestResistanceName} range rejection continuation`,
    };
  }

  const bullishContinuation =
    lowerRejections.length >= MIN_RANGE_REJECTIONS &&
    bullishPullbackSeen &&
    lastCandle.close > previousCandle.high &&
    lastCandle.close > lastCandle.open;

  if (bullishContinuation && supportPrice) {
    return {
      direction: "BULLISH",
      level: nearestSupportName,
      price: supportPrice,
      rejectionCount: lowerRejections.length,
      setupType: "RANGE_REJECTION_CONTINUATION",
      description: `${nearestSupportName} range rejection continuation`,
    };
  }

  return null;
}

function detectBreakoutMomentumSetup(
  candles,
  breakoutDetected,
  atr,
  strongCandle,
) {
  if (!candles || candles.length < 3 || !breakoutDetected) return null;

  const lastCandle = candles[candles.length - 1];
  const previousCandle = candles[candles.length - 2];
  const levelPrice = breakoutDetected.price;
  const minimumMove = Math.max(atr * 0.35, 8);
  const candleRange = Math.max(lastCandle.high - lastCandle.low, 0.01);
  const candleBody = Math.abs(lastCandle.close - lastCandle.open);
  const strongBody = candleBody / candleRange >= 0.55;

  const bullishContinuation =
    breakoutDetected.direction === "BULLISH" &&
    lastCandle.close > levelPrice + minimumMove &&
    lastCandle.close >= previousCandle.high - Math.max(atr * 0.15, 3) &&
    (lastCandle.close > lastCandle.open ||
      strongCandle?.direction === "BULLISH") &&
    (strongBody || strongCandle?.isStrong);

  if (bullishContinuation) {
    return {
      ...breakoutDetected,
      detected: true,
      setupType: "BREAKOUT_MOMENTUM",
      description: `${breakoutDetected.level} bullish breakout with continuous follow-through`,
    };
  }

  const bearishContinuation =
    breakoutDetected.direction === "BEARISH" &&
    lastCandle.close < levelPrice - minimumMove &&
    lastCandle.close <= previousCandle.low + Math.max(atr * 0.15, 3) &&
    (lastCandle.close < lastCandle.open ||
      strongCandle?.direction === "BEARISH") &&
    (strongBody || strongCandle?.isStrong);

  if (bearishContinuation) {
    return {
      ...breakoutDetected,
      detected: true,
      setupType: "BREAKOUT_MOMENTUM",
      description: `${breakoutDetected.level} bearish breakdown with continuous follow-through`,
    };
  }

  return null;
}

function detectQuickReversalContinuation(
  candles,
  supportResistance,
  levelInteraction,
  atr,
  strongCandle,
) {
  if (
    !candles ||
    candles.length < 6 ||
    !levelInteraction ||
    !strongCandle?.isStrong
  ) {
    return null;
  }

  const recent = candles.slice(-6);
  const preTrend = getTrend(recent.slice(0, 4));
  const postTrend = getTrend(recent.slice(-3));
  const pullbackCandle = recent[recent.length - 2];
  const lastCandle = recent[recent.length - 1];
  const tolerance = Math.max(atr * 0.25, 6);

  const nearestSupportName = levelInteraction.nearestSupport;
  const nearestResistanceName = levelInteraction.nearestResistance;
  const supportPrice = nearestSupportName
    ? supportResistance[nearestSupportName]
    : null;
  const resistancePrice = nearestResistanceName
    ? supportResistance[nearestResistanceName]
    : null;

  const localLow = Math.min(...recent.map((candle) => candle.low));
  const localHigh = Math.max(...recent.map((candle) => candle.high));

  const pullbackBody = Math.abs(pullbackCandle.close - pullbackCandle.open);
  const pullbackRange = Math.max(
    pullbackCandle.high - pullbackCandle.low,
    0.01,
  );
  const lowerWick =
    Math.min(pullbackCandle.open, pullbackCandle.close) - pullbackCandle.low;
  const upperWick =
    pullbackCandle.high - Math.max(pullbackCandle.open, pullbackCandle.close);

  const bullishTurn =
    preTrend === "BEARISH" &&
    postTrend === "BULLISH" &&
    lastCandle.close > pullbackCandle.high &&
    lastCandle.close > lastCandle.open;

  if (bullishTurn) {
    const pullbackNearSupport = supportPrice
      ? pullbackCandle.low <= supportPrice + tolerance
      : pullbackCandle.low <= localLow + tolerance;
    const bigLowerWick =
      lowerWick >= Math.max(pullbackBody * 1.4, pullbackRange * 0.35);
    const pullbackHeld =
      pullbackCandle.close >= pullbackCandle.low + pullbackRange * 0.55;

    if (pullbackNearSupport && bigLowerWick && pullbackHeld) {
      return {
        direction: "BULLISH",
        level: nearestSupportName || "LOCAL_SWING_LOW",
        price: supportPrice || round(localLow),
        setupType: "QUICK_REVERSAL_CONTINUATION",
        description: `${nearestSupportName || "local swing low"} lower-wick reversal into continuation`,
      };
    }
  }

  const bearishTurn =
    preTrend === "BULLISH" &&
    postTrend === "BEARISH" &&
    lastCandle.close < pullbackCandle.low &&
    lastCandle.close < lastCandle.open;

  if (bearishTurn) {
    const pullbackNearResistance = resistancePrice
      ? pullbackCandle.high >= resistancePrice - tolerance
      : pullbackCandle.high >= localHigh - tolerance;
    const bigUpperWick =
      upperWick >= Math.max(pullbackBody * 1.4, pullbackRange * 0.35);
    const pullbackHeld =
      pullbackCandle.close <= pullbackCandle.high - pullbackRange * 0.55;

    if (pullbackNearResistance && bigUpperWick && pullbackHeld) {
      return {
        direction: "BEARISH",
        level: nearestResistanceName || "LOCAL_SWING_HIGH",
        price: resistancePrice || round(localHigh),
        setupType: "QUICK_REVERSAL_CONTINUATION",
        description: `${nearestResistanceName || "local swing high"} upper-wick reversal into continuation`,
      };
    }
  }

  return null;
}

/**
 * V3 FIX: Detect dominant price structure (market direction)
 * Checks for higher lows (bullish) or lower highs (bearish)
 * This OVERRIDES CPR bias when there's clear structure
 */
function detectPriceStructure(candles) {
  if (candles.length < 5) return null;

  const recent = candles.slice(-5);
  const lows = recent.map((c) => c.low);
  const highs = recent.map((c) => c.high);

  // Check for higher lows (bullish structure)
  let higherLows = true;
  for (let i = 1; i < lows.length; i++) {
    if (lows[i] < lows[i - 1]) {
      higherLows = false;
      break;
    }
  }

  // Check for lower highs (bearish structure)
  let lowerHighs = true;
  for (let i = 1; i < highs.length; i++) {
    if (highs[i] > highs[i - 1]) {
      lowerHighs = false;
      break;
    }
  }

  if (higherLows && !lowerHighs) {
    return { direction: "BULLISH", strength: "STRONG", score: 2 };
  } else if (lowerHighs && !higherLows) {
    return { direction: "BEARISH", strength: "STRONG", score: 2 };
  } else if (higherLows) {
    return { direction: "BULLISH", strength: "WEAK", score: 1 };
  } else if (lowerHighs) {
    return { direction: "BEARISH", strength: "WEAK", score: 1 };
  }

  return null;
}

/**
 * V3 FIX: Determine dominant market bias
 * Priority: 1) Active breakout/retest direction, 2) Price structure, 3) CPR bias
 * @param {*} breakoutDetected - active breakout from retestTracker
 * @param {*} retestDetected - active retest from retestTracker
 * @param {*} priceStructure - detected price structure
 * @param {*} cprBias - CPR-based bias
 * @returns {object} - { bias, source, confidence, conflictDetected }
 */
function getDominantBias(
  breakoutDetected,
  retestDetected,
  priceStructure,
  cprBias,
) {
  // Priority 1: Active breakout/retest (highest priority)
  if (retestDetected && retestDetected.direction) {
    return {
      bias: retestDetected.direction === "BULLISH" ? "BULLISH" : "BEARISH",
      source: "RETEST",
      confidence: 0.9,
      conflictDetected: false,
    };
  }

  if (breakoutDetected && breakoutDetected.direction) {
    return {
      bias: breakoutDetected.direction === "BULLISH" ? "BULLISH" : "BEARISH",
      source: "BREAKOUT",
      confidence: 0.85,
      conflictDetected: false,
    };
  }

  // Priority 2: Price structure
  if (priceStructure && priceStructure.strength === "STRONG") {
    // Check if structure conflicts with CPR bias
    const structureBias = priceStructure.direction;
    const conflictDetected =
      (structureBias === "BULLISH" && cprBias === "BEARISH") ||
      (structureBias === "BEARISH" && cprBias === "BULLISH");

    return {
      bias: structureBias,
      source: "STRUCTURE",
      confidence: 0.75,
      conflictDetected,
    };
  }

  // Priority 3: CPR bias (fallback)
  return {
    bias: cprBias,
    source: "CPR",
    confidence: 0.65,
    conflictDetected: false,
  };
}

/**
 * V3 FIX: Validate rejection candle aligns with market direction
 * After a bullish breakout, we need bullish rejection (not bearish)
 */
function validateRejectionAlignment(rejectionCandle, expectedDirection) {
  if (!rejectionCandle || !rejectionCandle.detected) return true;

  const rejectionType = rejectionCandle.type;

  if (expectedDirection === "BULLISH") {
    // For CALL: need bullish rejection (bounce from support)
    return (
      rejectionType === "BULLISH" ||
      rejectionType === "HAMMER" ||
      rejectionType === "DOJI_BULLISH"
    );
  } else if (expectedDirection === "BEARISH") {
    // For PUT: need bearish rejection (rejection from resistance)
    return (
      rejectionType === "BEARISH" ||
      rejectionType === "SHOOTING_STAR" ||
      rejectionType === "DOJI_BEARISH"
    );
  }

  return true; // No rejection detected, allow signal
}

function hasStrongRejectionConfirmation(rejectionCandle) {
  return Boolean(
    rejectionCandle?.detected &&
    rejectionCandle?.strength >= 1.25 &&
    (rejectionCandle?.wick === "LOWER" || rejectionCandle?.wick === "UPPER"),
  );
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

function getClosedCandles(candles, timeframeMinutes) {
  if (!Array.isArray(candles) || candles.length === 0) return candles || [];

  const lastCandle = candles[candles.length - 1];
  if (!lastCandle || !Number.isFinite(lastCandle.time)) {
    return candles;
  }

  const candleEnd = lastCandle.time + timeframeMinutes * 60 * 1000;
  if (Date.now() < candleEnd) {
    return candles.length > 1 ? candles.slice(0, -1) : [];
  }

  return candles;
}

/**
 * V3: Detect CPR + S/R overlap zone (strong confluence = +3 score)
 * If R1 or S1 is within CPR range, it's a high-conviction zone
 */
function detectCPRSROverlap(cpr, sr) {
  if (!cpr || !sr) return false;
  const cprUpper = cpr.upper || cpr.tc;
  const cprLower = cpr.lower || cpr.bc;
  const buffer = cpr.width * 0.5;

  const levels = [sr.R1, sr.R2, sr.S1, sr.S2].filter(Boolean);
  return levels.some(
    (price) => price >= cprLower - buffer && price <= cprUpper + buffer,
  );
}

module.exports = { analyzeSetup };

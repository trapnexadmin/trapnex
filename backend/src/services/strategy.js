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
        const biasAligned = (
          (cprBias === "BULLISH" && type === "CALL") ||
          (cprBias === "BEARISH" && type === "PUT")
        );
        
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
      biasSource: 'CPR',
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

  const retestDetected = retestTracker.detectRetest(candles3m, lastPrice);

  const holdConfirmed = retestTracker.confirmHold(candles3m, lastPrice);
  
  // === V3 FIX: DETECT PRICE STRUCTURE ===
  const priceStructure = detectPriceStructure(candles3m);
  
  // === V3 FIX: DETERMINE DOMINANT BIAS ===
  // Priority: 1) Breakout/Retest, 2) Price Structure, 3) CPR Bias
  const dominantBiasResult = getDominantBias(breakoutDetected, retestDetected, priceStructure, cprBias);
  const bias = dominantBiasResult.bias; // This becomes the primary bias
  const biasSource = dominantBiasResult.source;
  const biasConflict = dominantBiasResult.conflictDetected;
  
  // Log bias determination
  if (biasConflict) {
    console.log(`[Strategy] ⚠️ BIAS CONFLICT: Structure=${priceStructure?.direction} vs CPR=${cprBias} | Using: ${bias} (${biasSource})`);
  } else if (biasSource !== 'CPR') {
    console.log(`[Strategy] 🎯 Dominant Bias: ${bias} from ${biasSource} (confidence: ${(dominantBiasResult.confidence * 100).toFixed(0)}%)`);
  }

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
  });

  // === SIGNAL GENERATION ===
  let signals = [];

  // Helper to find nearest level for fallback signal
  const nearestResistance = levelInteraction?.nearestResistance || "R1";
  const nearestSupport = levelInteraction?.nearestSupport || "S1";

  // === V3 FIXED-POINT TARGETS + STRUCTURE SL ===
  // Grade-based fixed targets (NIFTY options points)
  // A+: T1=25, T2=50, T3=75, T4=100, T5=120
  // A:  T1=22, T2=44, T3=66, T4=88
  // B+: T1=20, T2=40, T3=60
  // Thursday (expiry): Max T2 only
  function getTargetsForGrade(grade) {
    const now = new Date();
    const istDate = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
    const isThursday = istDate.getUTCDay() === 4; // Thursday = expiry day

    let targets;
    if (grade === 'A+') {
      targets = isThursday ? [25, 50] : [25, 50, 75, 100, 120];
    } else if (grade === 'A') {
      targets = isThursday ? [22, 44] : [22, 44, 66, 88];
    } else {
      // B+
      targets = isThursday ? [20, 40] : [20, 40, 60];
    }
    return targets;
  }

  // Structure SL: use retest level + buffer; floor with fixed SL per grade
  function calculateStructureSL(type, entryPrice, levelPrice, grade, atr) {
    const buffer = atr * 0.3;
    let structureSL;
    if (type === 'CALL') {
      structureSL = round(Math.min(levelPrice, entryPrice) - buffer);
    } else {
      structureSL = round(Math.max(levelPrice, entryPrice) + buffer);
    }

    // Fixed SL floor per grade
    const fixedSLPts = grade === 'A+' ? 18 : grade === 'A' ? 16 : 14;
    const fixedSL = type === 'CALL'
      ? round(entryPrice - fixedSLPts)
      : round(entryPrice + fixedSLPts);

    // Use MAX distance (most protective)
    if (type === 'CALL') {
      return Math.min(structureSL, fixedSL); // lower of the two = wider SL for call
    } else {
      return Math.max(structureSL, fixedSL); // higher of the two = wider SL for put
    }
  }

  // Build a V3 signal object
  function buildV3Signal(type, entry, levelPrice, source, level, atr, scoringResult, isOpposite = false) {
    let adjustedScoring = { ...scoringResult };
    
    // V3 FIX: Apply score penalty for opposite direction trades
    if (isOpposite) {
      const penalty = 4; // Reduce score by 4 points for opposite direction
      adjustedScoring.score = Math.max(0, scoringResult.score - penalty);
      adjustedScoring.breakdown = {
        ...scoringResult.breakdown,
        oppositeDirection: `⚠️ Opposite to structure (-${penalty})`
      };
      
      // V3 STRICT: Recalculate grade based on new score (min 12 for B+)
      if (adjustedScoring.score >= 16) {
        adjustedScoring.grade = 'A+';
        adjustedScoring.tradeable = true;
        adjustedScoring.autoExecute = true;
      } else if (adjustedScoring.score >= 13) {
        adjustedScoring.grade = 'A';
        adjustedScoring.tradeable = true;
        adjustedScoring.autoExecute = false;
      } else if (adjustedScoring.score >= 12) {
        adjustedScoring.grade = 'B+';
        adjustedScoring.tradeable = true;
        adjustedScoring.autoExecute = false;
      } else if (adjustedScoring.score >= 7) {
        adjustedScoring.grade = 'B';
        adjustedScoring.tradeable = false;
        adjustedScoring.autoExecute = false;
      } else {
        adjustedScoring.grade = 'C';
        adjustedScoring.tradeable = false;
        adjustedScoring.autoExecute = false;
      }
      
      console.log(`[Strategy] ⚠️ Opposite trade penalty: ${scoringResult.score} → ${adjustedScoring.score} (${scoringResult.grade} → ${adjustedScoring.grade})`);
    }
    
    const grade = adjustedScoring.grade;
    const targets = getTargetsForGrade(grade);

    const stopLoss = calculateStructureSL(type, entry, levelPrice, grade, atr);
    const slDistance = Math.abs(entry - stopLoss);

    // Primary target is T1 for conservative R:R display; targets[] has all levels
    const primaryTarget = type === 'CALL'
      ? round(entry + targets[targets.length - 1])
      : round(entry - targets[targets.length - 1]);
    const t1 = type === 'CALL'
      ? round(entry + targets[0])
      : round(entry - targets[0]);

    const riskReward = slDistance > 0
      ? round(Math.abs(primaryTarget - entry) / slDistance)
      : 0;

    return {
      type,
      entry: round(entry),
      stopLoss,
      target: primaryTarget,     // primary (last target)
      t1,                         // first target for trailing
      targets: targets.map(pt => type === 'CALL' ? round(entry + pt) : round(entry - pt)),
      targetPoints: targets,      // e.g. [25, 50, 75, 100, 120]
      riskReward,
      strikes: getStrikes(entry, type),
      timestamp: Date.now(),
      source,
      level,
      confidence: adjustedScoring.grade === 'A+' ? 0.9 : adjustedScoring.grade === 'A' ? 0.82 : 0.75,
      score: adjustedScoring.score,
      grade: adjustedScoring.grade,
      breakdown: adjustedScoring.breakdown,
      tradeable: adjustedScoring.tradeable,
      autoExecute: adjustedScoring.autoExecute,
      description: `${type} ${source} @ ${level || 'CPR'} | Grade ${grade} | SL:${targets[0]}pt T:${targets.join('/')}pt${isOpposite ? ' (OPPOSITE)' : ''}`,
    };
  }

  // **V3 STRICT RULE**: Only generate signals on CONFIRMED STRUCTURE
  // REQUIREMENT: Must have breakout → retest/consolidation → rejection → confirmation
  // NO FALLBACK SIGNALS without proper market structure

  // V3 STRICT: Check if inside CPR (block unless wide CPR)
  const isInsideCPR = cprState?.state === 'INSIDE';
  const isWideCPR = cpr.width > 50; // Wide CPR exception (50+ points)
  const allowInsideCPR = isInsideCPR && isWideCPR;
  
  if (isInsideCPR && !isWideCPR) {
    console.log(`[Strategy] ❌ BLOCKED: Inside CPR (width: ${round(cpr.width)}pts < 50pts) - No edge, waiting for breakout`);
    // Don't generate any signals when inside narrow CPR
    signals = [];
  } else {
    // V3 STRICT: All signals MUST have retest or hold confirmation
    const hasProperStructure = retestDetected || holdConfirmed;
    
    if (!hasProperStructure) {
      console.log(`[Strategy] ❌ BLOCKED: No proper structure detected - Waiting for breakout + retest + confirmation`);
      signals = [];
    } else {
      if (allowInsideCPR) {
        console.log(`[Strategy] ✅ Wide CPR detected (${round(cpr.width)}pts) - Inside CPR signals allowed`);
      }

      // Setup 1: Hold Confirmed (Highest Confidence) - STRICT: Score >= 12
      if (holdConfirmed && scoring.score >= 12 && mtfConfirmed) {
        const type = holdConfirmed.direction === "BULLISH" ? "CALL" : "PUT";
        const entry = lastPrice;
        const levelPrice = holdConfirmed.price;
        
        // V3 FIX: Validate rejection alignment
        const rejectionAligned = validateRejectionAlignment(rejectionCandle, holdConfirmed.direction);
        
        if (rejectionAligned) {
          console.log(`[Strategy] ✅ RETEST_CONFIRMED: ${type} @ ${holdConfirmed.level} | Score: ${scoring.score} | ${scoring.grade}`);
          signals.push(buildV3Signal(type, entry, levelPrice, "RETEST_CONFIRMED", holdConfirmed.level, atr, scoring, false));
        } else {
          console.log(`[Strategy] ❌ BLOCKED: Rejection misaligned with ${holdConfirmed.direction} breakout`);
        }
      }

      // Setup 2: Retest detected (STRICT: Score >= 12 for B+)
      if (retestDetected && !holdConfirmed && scoring.score >= 12 && mtfConfirmed) {
        const type = retestDetected.direction === "BULLISH" ? "CALL" : "PUT";
        const entry = lastPrice;
        const levelPrice = retestDetected.price;
        
        // V3 FIX: Validate rejection alignment
        const rejectionAligned = validateRejectionAlignment(rejectionCandle, retestDetected.direction);
        
        if (rejectionAligned) {
          console.log(`[Strategy] ✅ RETEST_PENDING: ${type} @ ${retestDetected.level} | Score: ${scoring.score} | ${scoring.grade}`);
          const sig = buildV3Signal(type, entry, levelPrice, "RETEST_PENDING", retestDetected.level, atr, scoring, false);
          sig.tradeable = scoring.score >= 12; // B+ requires 12+ now
          sig.autoExecute = false;
          signals.push(sig);
        } else {
          console.log(`[Strategy] ❌ BLOCKED: Rejection misaligned with ${retestDetected.direction} retest`);
        }
      }

      // Setup 3: CPR Rejection Reversal (STRICT: Only with proper structure + score >= 12)
      if (
        hasProperStructure &&
        (cprState?.state === 'REJECTION') &&
        bias !== 'NEUTRAL' &&
        scoring.score >= 12 &&
        mtfConfirmed
      ) {
        const type = bias === 'BULLISH' ? 'CALL' : 'PUT';
        const entry = lastPrice;
        const levelPrice = type === 'CALL' ? cpr.bc : cpr.tc;
        
        // V3 FIX: Check if this is opposite to structure
        const isOpposite = biasSource === 'CPR' && biasConflict;

        console.log(`[Strategy] ✅ CPR_REJECTION: ${type} | Score: ${scoring.score} | ${scoring.grade}${isOpposite ? ' (OPPOSITE)' : ''}`);
        const sig = buildV3Signal(type, entry, levelPrice, "CPR_REJECTION", "CPR", atr, scoring, isOpposite);
        sig.confidence = 0.78;
        if (!signals.find(s => s.type === type)) {
          signals.push(sig);
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

        if (type && !signals.find(s => s.type === type && s.source === 'CPR_AM_MANIPULATION')) {
          const entry = lastPrice;
          const levelPrice = type === 'CALL' ? cpr.bc : cpr.tc;
          
          // V3 FIX: Check if opposite to structure
          const isOpposite = biasSource !== 'CPR' && (
            (type === 'CALL' && bias === 'BEARISH') ||
            (type === 'PUT' && bias === 'BULLISH')
          );
          
          console.log(`[Strategy] ✅ CPR_AM_MANIPULATION: ${type} | Score: ${scoring.score} | ${scoring.grade}${isOpposite ? ' (OPPOSITE)' : ''}`);
          const sig = buildV3Signal(type, entry, levelPrice, "CPR_AM_MANIPULATION", "CPR", atr, scoring, isOpposite);
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
        : isInsideCPR && !isWideCPR
          ? 'BLOCKED_INSIDE_CPR'
          : !(retestDetected || holdConfirmed)
            ? 'WAITING_STRUCTURE_CONFIRMATION'
            : scoring.score < 12
              ? 'WAITING_SCORE_UPGRADE'
              : 'WAITING_REJECTION_ALIGNMENT',
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
    retestDetected,
    holdConfirmed,
    rejectionCandle,
    priceStructure, // V3 FIX: Price structure detection

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

/**
 * V3 FIX: Detect dominant price structure (market direction)
 * Checks for higher lows (bullish) or lower highs (bearish)
 * This OVERRIDES CPR bias when there's clear structure
 */
function detectPriceStructure(candles) {
  if (candles.length < 5) return null;
  
  const recent = candles.slice(-5);
  const lows = recent.map(c => c.low);
  const highs = recent.map(c => c.high);
  
  // Check for higher lows (bullish structure)
  let higherLows = true;
  for (let i = 1; i < lows.length; i++) {
    if (lows[i] < lows[i-1]) {
      higherLows = false;
      break;
    }
  }
  
  // Check for lower highs (bearish structure)
  let lowerHighs = true;
  for (let i = 1; i < highs.length; i++) {
    if (highs[i] > highs[i-1]) {
      lowerHighs = false;
      break;
    }
  }
  
  if (higherLows && !lowerHighs) {
    return { direction: 'BULLISH', strength: 'STRONG', score: 2 };
  } else if (lowerHighs && !higherLows) {
    return { direction: 'BEARISH', strength: 'STRONG', score: 2 };
  } else if (higherLows) {
    return { direction: 'BULLISH', strength: 'WEAK', score: 1 };
  } else if (lowerHighs) {
    return { direction: 'BEARISH', strength: 'WEAK', score: 1 };
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
function getDominantBias(breakoutDetected, retestDetected, priceStructure, cprBias) {
  // Priority 1: Active breakout/retest (highest priority)
  if (retestDetected && retestDetected.direction) {
    return {
      bias: retestDetected.direction === 'BULLISH' ? 'BULLISH' : 'BEARISH',
      source: 'RETEST',
      confidence: 0.9,
      conflictDetected: false,
    };
  }
  
  if (breakoutDetected && breakoutDetected.direction) {
    return {
      bias: breakoutDetected.direction === 'BULLISH' ? 'BULLISH' : 'BEARISH',
      source: 'BREAKOUT',
      confidence: 0.85,
      conflictDetected: false,
    };
  }
  
  // Priority 2: Price structure
  if (priceStructure && priceStructure.strength === 'STRONG') {
    // Check if structure conflicts with CPR bias
    const structureBias = priceStructure.direction;
    const conflictDetected = (
      (structureBias === 'BULLISH' && cprBias === 'BEARISH') ||
      (structureBias === 'BEARISH' && cprBias === 'BULLISH')
    );
    
    return {
      bias: structureBias,
      source: 'STRUCTURE',
      confidence: 0.75,
      conflictDetected,
    };
  }
  
  // Priority 3: CPR bias (fallback)
  return {
    bias: cprBias,
    source: 'CPR',
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
  
  if (expectedDirection === 'BULLISH') {
    // For CALL: need bullish rejection (bounce from support)
    return rejectionType === 'BULLISH' || rejectionType === 'HAMMER' || rejectionType === 'DOJI_BULLISH';
  } else if (expectedDirection === 'BEARISH') {
    // For PUT: need bearish rejection (rejection from resistance)
    return rejectionType === 'BEARISH' || rejectionType === 'SHOOTING_STAR' || rejectionType === 'DOJI_BEARISH';
  }
  
  return true; // No rejection detected, allow signal
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
    (price) => price >= cprLower - buffer && price <= cprUpper + buffer
  );
}

module.exports = { analyzeSetup };

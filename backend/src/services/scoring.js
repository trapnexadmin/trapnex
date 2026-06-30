/**
 * TRAPNEX V3 - Market Structure Scoring System
 * Maximum Score: 22+ points
 *
 * Grade System (V3 STRICT):
 * A+ (16+): Auto-execute (if retest confirmed)
 * A  (13-15): Tradeable signal
 * B+ (10-12): Tradeable (STRICT: requires proper structure)
 * B  (7-9):  Watchlist (alerts only, can upgrade to B+)
 * Ignore (<7): Skip
 */

/**
 * V3 Market Structure Score
 * Combines all scoring factors with proper weightage
 */
function scoreMarketStructure({
  // CPR State
  cprState,
  narrowCPR,

  // AM Detection
  amDetected,
  manipulation,

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
  nearLevel,
  levelImportance,

  // V3 Additions
  cprSROverlap, // CPR + S/R zone overlap (+3)
  mtfAligned, // Multi-timeframe alignment (+2)
  priceStructure = 0, // V3 FIX: Price structure score (+1-2)
  compressionZone = null, // Triangle/flag/pennant/range compression
}) {
  let score = 0;
  const breakdown = [];

  // === CPR STATE SCORING ===

  // Penalty: Inside CPR (-5)
  if (cprState?.state === "INSIDE") {
    score += cprState.score; // -5
    breakdown.push({
      factor: "⚠️ Inside CPR (No Edge)",
      points: -5,
      critical: true,
    });
  }

  // CPR Acceptance (+2) — price accepted inside CPR zone
  if (cprState?.state === "ACCEPTANCE") {
    score += 2;
    breakdown.push({
      factor: "CPR Acceptance",
      points: 2,
      description: cprState.details?.description,
    });
  }

  // CPR Rejection (+2) — price rejected at CPR boundary (reversal setup)
  if (cprState?.state === "REJECTION") {
    score += 2;
    breakdown.push({
      factor: "CPR Rejection",
      points: 2,
      description: cprState.details?.description,
    });
  }

  // Above CPR (+2)
  if (cprState?.state === "ABOVE") {
    score += 2;
    breakdown.push({
      factor: "Above CPR (Bullish)",
      points: 2,
    });
  }

  // Below CPR (+2)
  if (cprState?.state === "BELOW") {
    score += 2;
    breakdown.push({
      factor: "Below CPR (Bearish)",
      points: 2,
    });
  }

  // Narrow CPR (+2)
  if (narrowCPR) {
    score += 2;
    breakdown.push({ factor: "Narrow CPR", points: 2 });
  }

  // === V3: CPR + S/R ZONE OVERLAP (+3) ===
  // Most powerful zone: R1/S1 inside or at CPR
  if (cprSROverlap) {
    score += 3;
    breakdown.push({
      factor: "🔥 CPR+SR Confluence",
      points: 3,
      critical: true,
    });
  }

  // === AM DETECTION ===

  // AM Zone (+1.5)
  if (amDetected) {
    score += 1.5;
    breakdown.push({ factor: "AM Zone", points: 1.5 });
  }

  // Manipulation (+2)
  if (manipulation) {
    score += 2;
    breakdown.push({ factor: "Manipulation", points: 2 });
  }

  // === MARKET STRUCTURE (CORE EDGE) ===

  // Level Breakout (+1)
  if (breakoutDetected) {
    score += 1;
    breakdown.push({
      factor: "🔓 Breakout",
      points: 1,
      description: breakoutDetected.description,
    });
  }

  // Retest Success (+3) — upgraded from +2 in V3
  if (retestDetected) {
    score += 3;
    breakdown.push({
      factor: "🎯 Retest",
      points: 3,
      critical: true,
      description: retestDetected.description,
    });
  }

  // Hold Confirmed (+3)
  if (holdConfirmed) {
    score += 3;
    breakdown.push({
      factor: "✅ Hold Confirmed",
      points: 3,
      critical: true,
      description: "Level held",
    });
  }

  // === CANDLE ANALYSIS ===

  // Rejection Candle (+2)
  if (rejectionCandle?.detected) {
    score += 2;
    breakdown.push({
      factor: `${rejectionCandle.type.replace("_", " ")}`,
      points: 2,
      strength: rejectionCandle.strength,
    });
  }

  // Strong Candle: pattern confirmation (+1)
  if (strongCandle?.isStrong) {
    const points = strongCandle.enhanced ? 1.5 : 1;
    score += points;
    breakdown.push({
      factor: strongCandle.enhanced ? "Strong Candle+" : "Strong Candle",
      points,
    });
  }

  // === VOLUME ===

  // Volume Confirmation (+1)
  if (volumeConfirmation?.confirmed) {
    score += 1;
    breakdown.push({
      factor: "Volume Spike",
      points: 1,
      ratio: volumeConfirmation.volumeRatio,
    });
  }

  // === S/R PROXIMITY ===

  // Near S/R Level (+1)
  if (nearLevel) {
    score += 1;
    breakdown.push({ factor: "Near S/R", points: 1 });
  }

  // Level Importance (+0.5-1.5)
  if (levelImportance) {
    score += levelImportance;
    breakdown.push({
      factor: `Level Importance`,
      points: levelImportance,
    });
  }

  // === V3: MULTI-TIMEFRAME ALIGNMENT (+2) ===
  if (mtfAligned) {
    score += 2;
    breakdown.push({ factor: "📊 Multi-TF Aligned", points: 2 });
  }

  // === V3 FIX: PRICE STRUCTURE (+1-2) ===
  if (priceStructure > 0) {
    score += priceStructure;
    breakdown.push({
      factor: priceStructure === 2 ? "🔥 Strong Structure" : "Structure",
      points: priceStructure,
    });
  }

  // === V3: COMPRESSION / TRIANGLE PATTERN ===
  if (compressionZone?.detected) {
    score += 1;
    breakdown.push({
      factor: `📐 ${compressionZone.patternLabel || "Compression Zone"}`,
      points: 1,
      description: compressionZone.description,
    });
  }

  // if (compressionZone?.state === "BUILDING") {
  //   score -= 2;
  //   breakdown.push({
  //     factor: "⚠️ Inside Compression",
  //     points: -2,
  //     critical: true,
  //     description: compressionZone.description,
  //   });
  // }

  if (compressionZone?.breakoutConfirmed) {
    score += 3;
    breakdown.push({
      factor: "🚀 Triangle Breakout Confirmed",
      points: 3,
      critical: true,
      description: compressionZone.breakoutDescription,
    });
  }

  // === V3 STRICT GRADE ASSIGNMENT ===
  // A+ (16+), A (13-15), B+ (10+), B (7-9), Ignore (<7)

  let grade;
  let tradeable = false;
  let autoExecute = false;

  if (score >= 16) {
    grade = "A+";
    tradeable = true;
    autoExecute = retestDetected && cprState?.state !== "INSIDE";
  } else if (score >= 13) {
    grade = "A";
    tradeable = true;
  } else if (score >= 10) {
    grade = "B+";
    tradeable = true; // STRICT: Only with proper structure (enforced in strategy.js)
  } else if (score >= 7) {
    grade = "B";
    tradeable = false; // Watchlist
  } else {
    grade = "C";
    tradeable = false; // Ignore
  }

  return {
    score: Math.round(score * 10) / 10,
    grade,
    breakdown,
    tradeable,
    autoExecute,
    maxScore: 22,
    scorePercent: Math.round((score / 22) * 100),
  };
}

/**
 * Legacy: Score CPR + AM based setup (kept for compatibility)
 */
function scoreSetup({
  narrowCPR,
  amDetected,
  manipulation,
  strongCandle,
  volumeSpike,
}) {
  let score = 0;
  const breakdown = [];

  if (narrowCPR) {
    score += 2;
    breakdown.push({ factor: "Narrow CPR", points: 2 });
  }

  if (amDetected) {
    score += 2;
    breakdown.push({ factor: "AM Detected", points: 2 });
  }

  if (manipulation) {
    score += 3;
    breakdown.push({ factor: "Manipulation", points: 3 });
  }

  if (strongCandle) {
    score += 2;
    breakdown.push({ factor: "Strong Candle", points: 2 });
  }

  if (volumeSpike) {
    score += 1;
    breakdown.push({ factor: "Volume Spike", points: 1 });
  }

  let grade;
  if (score >= 8) grade = "A+";
  else if (score >= 6) grade = "A";
  else if (score >= 4) grade = "B";
  else grade = "C";

  return {
    score,
    grade,
    breakdown,
    tradeable: grade === "A+",
  };
}

/**
 * Legacy: Score S/R Level Signal (kept for compatibility)
 */
function scoreSRSignal(signal, candles, atr) {
  let score = 0;
  const breakdown = [];

  // Base confidence from signal detection (70-85%)
  const baseConfidence = signal.confidence || 0.7;
  score += Math.round(baseConfidence * 4); // 2.8-3.4 points
  breakdown.push({
    factor: `${signal.source} Detection`,
    points: Math.round(baseConfidence * 4),
  });

  // Volume confirmation (+2 points)
  const lastCandle = candles[candles.length - 1];
  const avgVolume =
    candles.slice(-20).reduce((s, c) => s + (c.volume || 0), 0) / 20;
  if (lastCandle.volume > avgVolume * 1.2) {
    score += 2;
    breakdown.push({ factor: "Volume Confirmation", points: 2 });
  } else if (lastCandle.volume > avgVolume) {
    score += 1;
    breakdown.push({ factor: "Volume Present", points: 1 });
  }

  // Strong candle pattern (+1.5 points)
  const candleRange = lastCandle.high - lastCandle.low;
  const candleBody = Math.abs(lastCandle.close - lastCandle.open);
  if (candleBody / candleRange > 0.7) {
    score += 1.5;
    breakdown.push({ factor: "Strong Candle Body", points: 1.5 });
  }

  // Risk/Reward ratio (+1-2 points)
  if (signal.riskReward >= 3) {
    score += 2;
    breakdown.push({ factor: "Excellent R:R (3+)", points: 2 });
  } else if (signal.riskReward >= 2) {
    score += 1.5;
    breakdown.push({ factor: "Good R:R (2+)", points: 1.5 });
  } else if (signal.riskReward >= 1.5) {
    score += 1;
    breakdown.push({ factor: "Fair R:R (1.5+)", points: 1 });
  }

  // Level importance (+0.5-1.5 points)
  // Major levels (S2, R2) are stronger than minor levels (S4, R4)
  if (signal.level) {
    const levelNum = parseInt(signal.level.match(/\d+/)?.[0] || "0");
    if (levelNum <= 2) {
      score += 1.5;
      breakdown.push({ factor: "Major Level (S1/S2/R1/R2)", points: 1.5 });
    } else {
      score += 0.5;
      breakdown.push({ factor: "Extended Level", points: 0.5 });
    }
  }

  // Bonus: Consolidation breakout near support/resistance
  if (signal.source === "SR_CONSOLIDATION_BREAKOUT") {
    score += 1;
    breakdown.push({ factor: "Consolidation Breakout", points: 1 });
  }

  let grade;
  if (score >= 8) grade = "A+";
  else if (score >= 7) grade = "A";
  else if (score >= 5) grade = "B+";
  else if (score >= 4) grade = "B";
  else grade = "C";

  return {
    score: Math.round(score * 10) / 10,
    grade,
    breakdown,
    tradeable: score >= 7, // A and A+ signals are tradeable
  };
}

/**
 * Legacy: Combined scoring (kept for compatibility)
 */
function scoreOverallSetup({
  narrowCPR,
  amDetected,
  manipulation,
  strongCandle,
  volumeSpike,
  levelInteraction,
  candles,
  atr,
}) {
  let score = 0;
  const breakdown = [];

  // CPR factors
  if (narrowCPR) {
    score += 2;
    breakdown.push({ factor: "Narrow CPR", points: 2 });
  }

  if (amDetected) {
    score += 1.5;
    breakdown.push({ factor: "AM Zone Detected", points: 1.5 });
  }

  if (manipulation) {
    score += 2;
    breakdown.push({ factor: "Manipulation", points: 2 });
  }

  // S/R level proximity and interaction
  if (levelInteraction?.nearestSupport || levelInteraction?.nearestResistance) {
    score += 1;
    breakdown.push({ factor: "Near S/R Level", points: 1 });
  }

  if (levelInteraction?.totalOpportunities > 0) {
    score += 1.5;
    breakdown.push({
      factor: `${levelInteraction.totalOpportunities} S/R Opportunities`,
      points: 1.5,
    });
  }

  // Candle confirmation
  if (strongCandle) {
    score += 1;
    breakdown.push({ factor: "Strong Candle", points: 1 });
  }

  if (volumeSpike) {
    score += 1;
    breakdown.push({ factor: "Volume Spike", points: 1 });
  }

  let grade;
  if (score >= 8) grade = "A+";
  else if (score >= 6.5) grade = "A";
  else if (score >= 5) grade = "B+";
  else if (score >= 4) grade = "B";
  else grade = "C";

  return {
    score: Math.round(score * 10) / 10,
    grade,
    breakdown,
    tradeable: score >= 5, // B+ and above are tradeable
  };
}

module.exports = {
  scoreMarketStructure,
  scoreSetup,
  scoreSRSignal,
  scoreOverallSetup,
};

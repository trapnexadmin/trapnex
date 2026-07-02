function buildMarketPhase({ candles3m = [], analysis = {} } = {}) {
  const recent = candles3m.slice(-8);
  const closes = recent.map((candle) => candle.close).filter(Number.isFinite);
  const highs = recent.map((candle) => candle.high).filter(Number.isFinite);
  const lows = recent.map((candle) => candle.low).filter(Number.isFinite);

  if (closes.length < 3) {
    return { phase: "UNKNOWN", confidence: 0, reason: "Insufficient candles" };
  }

  const slope = closes[closes.length - 1] - closes[0];
  const range = Math.max(...highs) - Math.min(...lows);
  const compressed = range <= Math.max((analysis.atr || 0) * 2, 20);

  if (compressed && !analysis.breakoutDetected) {
    return { phase: "ACCUMULATION", confidence: 72, reason: "Compressed range before breakout" };
  }

  if (analysis.breakoutDetected || Math.abs(slope) > (analysis.atr || 0)) {
    return {
      phase: "EXPANSION",
      confidence: 86,
      reason: analysis.breakoutDetected ? "Breakout in progress" : "Directional expansion",
    };
  }

  if (analysis.retestDetected || analysis.holdConfirmed) {
    return { phase: "DISTRIBUTION", confidence: 68, reason: "Price rotating near a key level" };
  }

  return {
    phase: slope >= 0 ? "EXPANSION" : "MARKDOWN",
    confidence: 60,
    reason: slope >= 0 ? "Upward drift" : "Downward drift",
  };
}

module.exports = {
  buildMarketPhase,
};
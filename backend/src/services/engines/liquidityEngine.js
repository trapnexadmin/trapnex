function buildLiquidityContext({ candles3m = [], levels = [], analysis = {} } = {}) {
  const recent = candles3m.slice(-6);
  const sweeps = [];
  const traps = [];
  const absorption = [];

  for (const level of levels) {
    if (!level?.price) continue;

    const touchedAbove = recent.some((candle) => candle.high > level.price && candle.close < level.price);
    const touchedBelow = recent.some((candle) => candle.low < level.price && candle.close > level.price);

    if (touchedAbove || touchedBelow) {
      sweeps.push({
        level: level.name,
        price: level.price,
        direction: touchedAbove ? "BEARISH" : "BULLISH",
      });
    }
  }

  if (analysis.breakoutDetected && analysis.retestDetected) {
    traps.push({
      type: "BREAKOUT_TRAP",
      direction: analysis.retestDetected.direction,
      level: analysis.retestDetected.level,
    });
  }

  if (analysis.volumeConfirmation?.detected || analysis.strongCandle) {
    absorption.push({
      type: "ABSORPTION",
      direction: analysis.bias || "NEUTRAL",
      strength: analysis.volumeConfirmation?.volumeRatio || 0,
    });
  }

  return {
    sweeps,
    traps,
    absorption,
    summary: {
      sweepCount: sweeps.length,
      trapCount: traps.length,
      absorptionCount: absorption.length,
    },
  };
}

module.exports = {
  buildLiquidityContext,
};
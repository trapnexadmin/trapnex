const { buildMarketContext } = require("./contextEngine");
const { buildLevelSet } = require("./levelEngine");
const { buildPreviousDayProfile } = require("./previousDayEngine");
const { buildRoundNumberLevels } = require("./roundNumberEngine");
const { calculateCamarilla } = require("../indicators/camarilla");
const { buildConfluence } = require("./confluenceEngine");
const { buildLiquidityContext } = require("./liquidityEngine");
const { buildMarketPhase } = require("./marketPhaseEngine");
const { buildEvents } = require("./eventEngine");

function buildPassiveAnalysisV2({
  analysis,
  candles3m = [],
  candles5m = [],
  candles15m = [],
  previousDayHLC = {},
}) {
  if (!analysis) return null;

  const previousDay = buildPreviousDayProfile(previousDayHLC);
  const levels = buildLevelSet({
    cpr: analysis.cpr,
    supportResistance: analysis.supportResistance,
    previousDay,
  });
  const camarilla = calculateCamarilla(previousDayHLC);
  const roundNumbers = buildRoundNumberLevels({
    price: analysis.lastPrice,
  });
  const marketPhase = buildMarketPhase({ candles3m, candles5m, candles15m, analysis });
  const liquidity = buildLiquidityContext({ candles3m, levels, analysis });
  const confluence = buildConfluence({
    analysis,
    levels,
    camarilla,
    roundNumbers,
    liquidity,
    marketPhase,
  });
  const events = buildEvents({
    analysis,
    liquidity,
    marketPhase,
    roundNumbers,
    camarilla,
  });
  const marketContext = buildMarketContext({
    cpr: analysis.cpr || {},
    cprBias: analysis.bias || "NEUTRAL",
    cprState: analysis.cprState?.state || analysis.cprState || "UNKNOWN",
    cprWidthType: analysis.cprWidthType || "NORMAL",
    dominantBias: {
      bias: analysis.bias,
      source: analysis.biasSource,
      confidence: analysis.scoring?.confidence ?? null,
    },
    priceStructure: analysis.priceStructure || {},
    breakout: Boolean(analysis.breakoutDetected),
    retest: Boolean(analysis.retestDetected),
    holdConfirmed: Boolean(analysis.holdConfirmed),
    previousDay,
    openingPrice: candles3m?.[0]?.open ?? null,
    lastPrice: analysis.lastPrice,
    tradable: Boolean(analysis.scoring?.tradeable),
    trendPhase: marketPhase.phase,
  });

  return {
    ...analysis,
    previousDay,
    levels,
    camarilla,
    roundNumbers,
    confluence,
    liquidity,
    marketPhase,
    events,
    marketContext,
    passiveMetrics: {
      confidence: confluence.confidence,
      reasons: confluence.reasons,
      warnings: marketContext.warnings,
    },
  };
}

module.exports = {
  buildMarketContext,
  buildPassiveAnalysisV2,
  buildLevelSet,
  buildPreviousDayProfile,
  buildRoundNumberLevels,
  buildConfluence,
  buildLiquidityContext,
  buildMarketPhase,
  buildEvents,
};
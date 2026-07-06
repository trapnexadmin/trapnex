const { buildMarketContext } = require("./contextEngine");
const { buildLevels, buildLevelSet, createLevel, detectLevelState, Level, LEVEL_STATES } = require("./levelEngine");
const { buildPreviousDayProfile } = require("./previousDayEngine");
const { buildRoundNumberLevels } = require("./roundNumberEngine");
const { calculateCamarilla } = require("../indicators/camarilla");
const { buildConfluence } = require("./confluenceEngine");
const { buildLiquidityContext } = require("./liquidityEngine");
const { buildMarketPhase } = require("./marketPhaseEngine");
const { buildEvents } = require("./eventEngine");
const { buildDecisionEngine } = require("./decisionEngine");
const { buildStrikeSelection } = require("./strikeSelectionEngine");
const { buildOptionTrade } = require("./optionTradeBuilder");

function buildPassiveAnalysisV2({
  analysis,
  candles3m = [],
  candles5m = [],
  candles15m = [],
  previousDayHLC = {},
}) {
  if (!analysis) return null;

  const previousDay = buildPreviousDayProfile(previousDayHLC);
  const camarilla = calculateCamarilla(previousDayHLC);
  const roundNumbers = buildRoundNumberLevels({
    price: analysis.lastPrice,
  });
  const levelGroups = buildLevels({
    cpr: analysis.cpr,
    supportResistance: analysis.supportResistance,
    previousDay,
    camarilla,
    roundNumbers,
    lastPrice: analysis.lastPrice,
    previousPrice: candles3m?.[candles3m.length - 2]?.close ?? null,
  });
  const marketPhase = buildMarketPhase({ candles3m, candles5m, candles15m, analysis });
  const liquidity = buildLiquidityContext({ candles3m, levels: levelGroups.all, analysis });
  const confluence = buildConfluence({
    analysis,
    levels: levelGroups.all,
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
  const decision = buildDecisionEngine({
    market: "NIFTY",
    analysis,
    context: marketContext,
    levels: levelGroups,
    confluence,
    events,
    strategy: analysis.strategy || analysis.signal?.source || null,
  });
  const strikeSelection = buildStrikeSelection({
    decision,
    spotPrice: analysis.lastPrice,
    symbol: "NIFTY",
    optionChain: analysis.optionChain || [],
  });
  const optionTrade = buildOptionTrade({
    decision,
    strikeSelection,
    quote: analysis.optionQuote || null,
    analysis,
  });

  return {
    ...analysis,
    previousDay,
    levels: levelGroups,
    levelList: levelGroups.all,
    camarilla,
    roundNumbers,
    confluence,
    liquidity,
    marketPhase,
    events,
    marketContext,
    decision,
    strikeSelection,
    optionTrade,
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
  buildLevels,
  buildLevelSet,
  createLevel,
  detectLevelState,
  Level,
  LEVEL_STATES,
  buildPreviousDayProfile,
  buildRoundNumberLevels,
  buildConfluence,
  buildLiquidityContext,
  buildMarketPhase,
  buildEvents,
  buildDecisionEngine,
  buildStrikeSelection,
  buildOptionTrade,
};
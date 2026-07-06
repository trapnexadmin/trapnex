const { buildOptionTargets } = require("../options");
const { getStrikes } = require("../options");
const { buildPremiumPlan } = require("./premiumCalculator");
const { buildRiskPlan } = require("./riskEngine");
const { buildStrikeSelection } = require("./strikeSelectionEngine");
const { normalizeBias } = require("./decisionValidator");

const DEFAULT_OPTION_STOP_LOSS = Number(process.env.TRAPNEX_OPTION_STOP_LOSS || 12);

function buildOptionTrade({
  decision = {},
  strikeSelection = null,
  quote = null,
  analysis = null,
  capital,
  riskPercent,
  lotSize,
  maxLots,
}) {
  const market = decision.market || analysis?.market || "NIFTY";
  const bias = normalizeBias(decision.bias || analysis?.bias);
  const selection =
    strikeSelection ||
    buildStrikeSelection({
      decision,
      spotPrice: analysis?.lastPrice,
      symbol: market,
      optionChain: analysis?.optionChain || [],
    });
  const optionType = selection?.optionType || null;
  const executionPlan = buildPremiumPlan({
    quote: quote || {},
    entrySide: "BUY",
  });
  const grade = String(decision.grade || analysis?.scoring?.grade || "B+").toUpperCase();
  const tradeType = optionType === "PE" ? "PUT" : "CALL";
  const entry = executionPlan.entry;
  const premiumReady = Number.isFinite(entry);
  const stopLossDistance = premiumReady
    ? Math.max(DEFAULT_OPTION_STOP_LOSS, (executionPlan.spread || 0) * 2, (executionPlan.slippage || 0) * 2)
    : DEFAULT_OPTION_STOP_LOSS;
  const optionTargets = premiumReady
    ? buildOptionTargets(entry, grade)
    : {
        optionStopLoss: null,
        optionTargets: [],
        optionTargetPoints: [],
        optionTargetProfile: {
          grade,
          maxTarget: null,
          targetStep: null,
        },
      };
  const stopLoss = premiumReady ? round(entry - stopLossDistance) : null;
  const risk = buildRiskPlan({
    capital,
    riskPercent,
    lotSize,
    stopLossDistance,
    maxLots,
  });
  const targets = optionTargets.optionTargets || [];
  const primaryTarget = targets.length > 0 ? targets[targets.length - 1] : null;
  const targetDistance = premiumReady && Number.isFinite(primaryTarget)
    ? Math.abs(primaryTarget - entry)
    : null;
  const riskDistance = premiumReady && Number.isFinite(stopLoss)
    ? Math.abs(entry - stopLoss)
    : null;
  const rr = Number.isFinite(targetDistance) && Number.isFinite(riskDistance) && riskDistance > 0
    ? round(targetDistance / riskDistance)
    : null;
  const status = !selection?.strike
    ? "WAITING_STRIKE"
    : !premiumReady
      ? "WAITING_QUOTE"
      : !risk.canTrade
        ? "BLOCKED_RISK"
        : "READY";

  const symbol = selection?.symbol || `${market}${selection?.strike || ""}${optionType || ""}`;
  const strikePrice = selection?.atmStrike || selection?.strike || analysis?.lastPrice || null;
  const strikes = Number.isFinite(strikePrice)
    ? getStrikes(strikePrice, tradeType)
    : null;

  return {
    market,
    underlying: selection?.underlying || market,
    bias,
    action: decision.action || "WAIT",
    strategy: decision.strategy || analysis?.signal?.source || null,
    symbol,
    tradingSymbol: selection?.tradingSymbol || symbol,
    strike: selection?.strike ?? null,
    atmStrike: selection?.atmStrike ?? null,
    optionType,
    type: tradeType,
    score: Number.isFinite(analysis?.scoring?.score)
      ? analysis.scoring.score
      : Number.isFinite(decision.confidence)
        ? decision.confidence
        : 0,
    entry,
    optionEntry: entry,
    stopLoss,
    optionStopLoss: stopLoss,
    targets,
    optionTargets: targets,
    target: primaryTarget,
    t1: targets[0] ?? null,
    targetPoints: optionTargets.optionTargetPoints || [],
    optionTargetPoints: optionTargets.optionTargetPoints || [],
    rr,
    riskReward: rr,
    quantity: risk.quantity,
    lots: risk.lots,
    lotSize: risk.lotSize,
    riskAmount: risk.riskAmount,
    capital: risk.capital,
    riskPercent: risk.riskPercent,
    bid: executionPlan.bid,
    ask: executionPlan.ask,
    ltp: executionPlan.ltp,
    spread: executionPlan.spread,
    slippage: executionPlan.slippage,
    executionMode: executionPlan.executionMode,
    optionPremiumSource: executionPlan.quote?.source || (executionPlan.executionMode === "BID_ASK" ? "BID_ASK" : "LTP"),
    optionToken: quote?.symbolToken || quote?.token || null,
    strikes,
    grade,
    confidence: decision.confidence ?? null,
    reasons: decision.reasons || [],
    warnings: decision.warnings || [],
    context: decision.context || null,
    levels: decision.levels || null,
    decisionTrade: decision,
    strikeSelection: selection,
    status,
    lifecycle: status,
    ready: status === "READY",
  };
}

function round(value) {
  return Math.round(Number(value) * 100) / 100;
}

module.exports = {
  buildOptionTrade,
};
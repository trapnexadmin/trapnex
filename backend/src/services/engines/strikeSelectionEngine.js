const { normalizeBias, normalizeAction } = require("./decisionValidator");

const DEFAULT_STRIKE_INTERVAL = Number(process.env.TRAPNEX_STRIKE_INTERVAL || 50);

function buildStrikeSelection({
  decision = {},
  spotPrice,
  symbol = "NIFTY",
  optionChain = [],
  strikeInterval = DEFAULT_STRIKE_INTERVAL,
}) {
  const bias = normalizeBias(decision.bias);
  const action = normalizeAction(decision.action, bias);
  const optionType = resolveOptionType({ action, bias });
  const market = decision.market || symbol;

  if (!optionType) {
    return {
      market,
      underlying: symbol,
      symbol: null,
      tradingSymbol: null,
      strike: null,
      atmStrike: null,
      optionType: null,
      action,
      bias,
      status: "WAITING_DECISION",
      reason: "Decision does not map to an option direction",
      decision,
      optionChain: Array.isArray(optionChain) ? optionChain : [],
    };
  }

  if (!Number.isFinite(spotPrice)) {
    return {
      market,
      underlying: symbol,
      symbol: null,
      tradingSymbol: null,
      strike: null,
      atmStrike: null,
      optionType,
      action,
      bias,
      status: "WAITING_PRICE",
      reason: "Spot price unavailable",
      decision,
      optionChain: Array.isArray(optionChain) ? optionChain : [],
    };
  }

  const atmStrike = roundToInterval(spotPrice, strikeInterval);
  const strike = selectStrikeFromChain(optionChain, atmStrike, optionType) ?? atmStrike;
  const tradingSymbol = `${symbol}${strike}${optionType}`;

  return {
    market,
    underlying: symbol,
    symbol: tradingSymbol,
    tradingSymbol,
    strike,
    atmStrike,
    optionType,
    action,
    bias,
    status: "READY",
    reason: `ATM strike selected at ${atmStrike}`,
    decision,
    optionChain: Array.isArray(optionChain) ? optionChain : [],
  };
}

function resolveOptionType({ action, bias }) {
  const normalizedAction = String(action || "WAIT").toUpperCase();

  if (normalizedAction.endsWith("CE")) return "CE";
  if (normalizedAction.endsWith("PE")) return "PE";

  if (bias === "BUY") return "CE";
  if (bias === "SELL") return "PE";

  return null;
}

function roundToInterval(value, interval) {
  return Math.round(Number(value) / interval) * interval;
}

function selectStrikeFromChain(optionChain, targetStrike, optionType) {
  if (!Array.isArray(optionChain) || optionChain.length === 0) return null;

  const matches = optionChain
    .map((item) => ({
      strike: Number(item?.strike ?? item?.strikePrice ?? item?.tokenStrike),
      optionType: String(item?.optionType || item?.type || "").toUpperCase(),
      value: item,
    }))
    .filter((item) => Number.isFinite(item.strike) && (!item.optionType || item.optionType === optionType));

  if (matches.length === 0) return null;

  matches.sort((left, right) => Math.abs(left.strike - targetStrike) - Math.abs(right.strike - targetStrike));
  return matches[0].strike;
}

module.exports = {
  buildStrikeSelection,
};
const DEFAULT_CAPITAL = Number(process.env.TRAPNEX_CAPITAL || 100000);
const DEFAULT_RISK_PERCENT = Number(process.env.TRAPNEX_RISK_PERCENT || 1);
const DEFAULT_LOT_SIZE = Number(process.env.NIFTY_OPTION_LOT_SIZE || 50);
const DEFAULT_MAX_LOTS = Number(process.env.TRAPNEX_MAX_LOTS || 4);

function buildRiskPlan({
  capital = DEFAULT_CAPITAL,
  riskPercent = DEFAULT_RISK_PERCENT,
  lotSize = DEFAULT_LOT_SIZE,
  stopLossDistance,
  maxLots = DEFAULT_MAX_LOTS,
}) {
  const normalizedCapital = Number(capital) || DEFAULT_CAPITAL;
  const normalizedRiskPercent = clamp(Number(riskPercent) || DEFAULT_RISK_PERCENT, 0.1, 10);
  const normalizedLotSize = Math.max(1, Math.floor(Number(lotSize) || DEFAULT_LOT_SIZE));
  const normalizedMaxLots = Math.max(1, Math.floor(Number(maxLots) || DEFAULT_MAX_LOTS));
  const riskAmount = round((normalizedCapital * normalizedRiskPercent) / 100);
  const perLotRisk = round(Math.max(0, Number(stopLossDistance) || 0) * normalizedLotSize);

  if (!Number.isFinite(perLotRisk) || perLotRisk <= 0) {
    return {
      capital: round(normalizedCapital),
      riskPercent: normalizedRiskPercent,
      lotSize: normalizedLotSize,
      riskAmount,
      perLotRisk: 0,
      lots: 0,
      quantity: 0,
      maxLots: normalizedMaxLots,
      canTrade: false,
      reason: "INVALID_STOP_LOSS_DISTANCE",
    };
  }

  const affordableLots = Math.floor(riskAmount / perLotRisk);
  const lots = Math.min(affordableLots, normalizedMaxLots);
  const quantity = lots > 0 ? lots * normalizedLotSize : 0;

  return {
    capital: round(normalizedCapital),
    riskPercent: normalizedRiskPercent,
    lotSize: normalizedLotSize,
    riskAmount,
    perLotRisk,
    lots,
    quantity,
    maxLots: normalizedMaxLots,
    canTrade: quantity > 0,
    reason: quantity > 0 ? "RISK_OK" : "INSUFFICIENT_RISK_BUDGET",
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function round(value) {
  return Math.round(Number(value) * 100) / 100;
}

module.exports = {
  buildRiskPlan,
};
const { normalizeBias, normalizeAction } = require("./decisionValidator");

function buildDecision({
  market = "NIFTY",
  analysis = null,
  context = null,
  levels = {},
  confluence = {},
  events = [],
  strategy = null,
}) {
  const bias = normalizeBias(
    analysis?.bias || context?.dominantBias?.bias || context?.bias,
  );
  const bestSignal = pickBestSignal(analysis?.signals || []);
  const action = normalizeAction(bestSignal?.type, bias);
  const confidence = normalizeConfidence(
    bestSignal?.confidence ?? confluence?.confidence ?? analysis?.scoring?.confidence,
  );
  const grade = bestSignal?.grade || deriveGrade(confidence, analysis?.scoring?.grade);
  const reasons = uniqueStrings([
    ...(confluence?.reasons || []),
    ...(context?.reasons || []),
    ...buildLevelReasons({ analysis, levels, bestSignal }),
    ...buildEventReasons(events),
  ]);
  const warnings = uniqueStrings([
    ...(confluence?.warnings || []),
    ...(context?.warnings || []),
    ...(analysis?.biasConflict ? ["Bias conflict"] : []),
  ]);

  return {
    market,
    bias,
    action,
    confidence,
    grade,
    reasons,
    warnings,
    strategy: strategy || bestSignal?.source || analysis?.strategy || context?.trendPhase || "WAIT",
    context: context || null,
    levels,
  };
}

function pickBestSignal(signals) {
  if (!Array.isArray(signals) || signals.length === 0) return null;

  const tradeableSignals = signals.filter((signal) => signal?.tradeable);
  const rankedSignals = (tradeableSignals.length > 0 ? tradeableSignals : signals).slice().sort(
    (a, b) =>
      (b.score || 0) - (a.score || 0) ||
      (b.confidence || 0) - (a.confidence || 0),
  );

  return rankedSignals[0] || null;
}

function buildLevelReasons({ analysis, levels, bestSignal }) {
  const reasons = [];
  const lastPrice = analysis?.lastPrice;
  const cpr = analysis?.cpr || {};
  const cprState = analysis?.cprState?.state || analysis?.cprState;
  const priceStructure = analysis?.priceStructure?.direction;
  const levelList = Array.isArray(levels?.all)
    ? levels.all
    : Array.isArray(levels)
      ? levels
      : [];

  if (Number.isFinite(lastPrice) && Number.isFinite(cpr.tc) && lastPrice > cpr.tc) {
    reasons.push("Above TC");
  }
  if (Number.isFinite(lastPrice) && Number.isFinite(cpr.bc) && lastPrice < cpr.bc) {
    reasons.push("Below BC");
  }

  const acceptedCamarilla = levelList.find(
    (level) => level?.category === "CAMARILLA" && level.accepted,
  );
  if (acceptedCamarilla?.name) {
    reasons.push(`${acceptedCamarilla.name} Accepted`);
  }

  if (priceStructure === "BULLISH") {
    reasons.push("HH HL");
  } else if (priceStructure === "BEARISH") {
    reasons.push("LH LL");
  }

  if (analysis?.volumeConfirmation?.confirmed || analysis?.volumeSpike) {
    reasons.push("Volume");
  }

  if (cprState) {
    reasons.push(String(cprState).toUpperCase());
  }

  if (bestSignal?.source) {
    reasons.push(bestSignal.source);
  }

  return reasons;
}

function buildEventReasons(events) {
  if (!Array.isArray(events)) return [];

  return events
    .map((event) => event?.description || event?.type)
    .filter(Boolean);
}

function normalizeConfidence(value) {
  const confidence = Number(value);
  if (!Number.isFinite(confidence)) return 0;
  if (confidence <= 1) return clamp(Math.round(confidence * 100), 0, 100);
  return clamp(Math.round(confidence), 0, 100);
}

function deriveGrade(confidence, fallbackGrade) {
  const normalizedGrade = String(fallbackGrade || "").toUpperCase();
  if (["A+", "A", "B+", "B"].includes(normalizedGrade)) {
    return normalizedGrade;
  }

  if (confidence >= 90) return "A+";
  if (confidence >= 80) return "A";
  if (confidence >= 70) return "B+";
  return "B";
}

function uniqueStrings(values) {
  return [...new Set((values || []).map((value) => String(value || "").trim()).filter(Boolean))];
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

module.exports = {
  buildDecision,
};
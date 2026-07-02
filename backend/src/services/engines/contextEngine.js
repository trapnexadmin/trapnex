/**
 * ============================================================================
 * Trapnex V2 - Market Context Engine
 * ----------------------------------------------------------------------------
 * Purpose:
 * Normalize all market context into a single object.
 *
 * IMPORTANT:
 * This engine NEVER generates signals.
 * This engine NEVER calculates scores.
 * This engine NEVER changes trading behaviour.
 *
 * It only converts existing strategy outputs into one standardized object.
 * ============================================================================
 */

function buildMarketContext({
  cpr = {},
  cprBias = "NEUTRAL",
  cprState = "UNKNOWN",
  cprWidthType = "NORMAL",

  dominantBias = {},

  priceStructure = {},

  breakout = false,
  retest = false,
  holdConfirmed = false,

  previousDay = {},

  openingPrice,

  lastPrice,

  tradable = true,

  trendPhase = "UNKNOWN",

  timestamp = Date.now(),
}) {
  const bias = normalizeBias(cprBias, dominantBias);
  const isTradable = normalizeTradable({ cprState, cprWidthType, bias });
  const cprWidth = cpr.width ?? cprWidthType ?? null;

  const position = normalizePosition({
    lastPrice,
    tc: cpr.tc,
    bc: cpr.bc,
  });

  const session = normalizeSession({
    previousDay,
    openingPrice,
  });

  const structure = normalizeStructure({
    breakout,
    retest,
    holdConfirmed,
    priceStructure,
  });

  const reasons = buildReasons({
    bias,
    position,
    structure,
    cprState,
    cprWidthType,
  });

  const warnings = buildWarnings({
    position,
    cprWidthType,
    structure,
  });

  return {
    version: 2,

    timestamp,

    bias,

    biasSource: dominantBias?.source || dominantBias?.type || "CPR",

    confidence: dominantBias?.confidence ?? dominantBias?.score ?? null,

    tradable: isTradable,

    position,

    trendPhase,

    cpr: {
      tc: cpr.tc,
      pivot: cpr.pivot,
      bc: cpr.bc,

      bias: cprBias,

      state: cprState,

      width: cprWidth,
    },

    structure,

    session,

    reasons,

    warnings,
  };
}

/* -------------------------------------------------------------------------- */
/*                               NORMALIZERS                                  */
/* -------------------------------------------------------------------------- */

function normalizeBias(cprBias, dominantBias) {
  if (dominantBias?.bias) {
    return dominantBias.bias;
  }

  if (dominantBias?.direction) {
    return dominantBias.direction;
  }

  return cprBias || "NEUTRAL";
}

function normalizePosition({ lastPrice, tc, bc }) {
  if (lastPrice == null || tc == null || bc == null) {
    return "UNKNOWN";
  }

  if (lastPrice > tc) {
    return "ABOVE_TC";
  }

  if (lastPrice < bc) {
    return "BELOW_BC";
  }

  return "INSIDE_CPR";
}

function normalizeSession({ previousDay = {}, openingPrice }) {
  const previousClose = previousDay.close;

  let gap = "UNKNOWN";

  if (previousClose != null && openingPrice != null) {
    if (openingPrice > previousClose) {
      gap = "GAP_UP";
    } else if (openingPrice < previousClose) {
      gap = "GAP_DOWN";
    } else {
      gap = "FLAT";
    }
  }

  return {
    gap,

    openingPrice,

    previousClose,

    previousHigh: previousDay.high,

    previousLow: previousDay.low,
  };
}

function normalizeTradable({ cprState, cprWidthType, bias }) {
  if (cprState === "INSIDE" && cprWidthType === "NARROW") {
    return false;
  }

  if (!bias || bias === "NEUTRAL") {
    return true;
  }

  return true;
}

function normalizeStructure({
  breakout,
  retest,
  holdConfirmed,
  priceStructure = {},
}) {
  return {
    breakout,

    retest,

    holdConfirmed,

    trend: priceStructure.trend || priceStructure.direction || "UNKNOWN",

    hh: !!priceStructure.hh,

    hl: !!priceStructure.hl,

    lh: !!priceStructure.lh,

    ll: !!priceStructure.ll,
  };
}

/* -------------------------------------------------------------------------- */
/*                               REASONS                                      */
/* -------------------------------------------------------------------------- */

function buildReasons({ bias, position, structure, cprState, cprWidthType }) {
  const reasons = [];

  if (bias === "BULLISH") {
    reasons.push("Bullish Bias");
  }

  if (bias === "BEARISH") {
    reasons.push("Bearish Bias");
  }

  if (position === "ABOVE_TC") {
    reasons.push("Above TC");
  }

  if (position === "BELOW_BC") {
    reasons.push("Below BC");
  }

  if (structure.breakout) {
    reasons.push("Breakout Confirmed");
  }

  if (structure.retest) {
    reasons.push("Retest Confirmed");
  }

  if (structure.holdConfirmed) {
    reasons.push("Hold Confirmed");
  }

  if (cprState) {
    reasons.push(`CPR ${cprState}`);
  }

  if (cprWidthType) {
    reasons.push(`${cprWidthType} CPR`);
  }

  return reasons;
}

/* -------------------------------------------------------------------------- */
/*                               WARNINGS                                     */
/* -------------------------------------------------------------------------- */

function buildWarnings({ position, cprWidthType, structure }) {
  const warnings = [];

  if (position === "INSIDE_CPR" && cprWidthType === "NARROW") {
    warnings.push("Price inside Narrow CPR");
  }

  if (!structure.breakout && !structure.retest) {
    warnings.push("No confirmed market structure");
  }

  return warnings;
}

/* -------------------------------------------------------------------------- */

module.exports = {
  buildMarketContext,
};

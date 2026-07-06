function normalizeBias(bias) {
  const value = String(bias || "WAIT").toUpperCase();
  if (value === "BUY" || value === "BULLISH") return "BUY";
  if (value === "SELL" || value === "BEARISH") return "SELL";
  return "WAIT";
}

function normalizeAction(action, bias) {
  const normalizedAction = String(action || "").toUpperCase();
  if (["BUY_CE", "BUY_PE", "SELL_CE", "SELL_PE", "WAIT"].includes(normalizedAction)) {
    return normalizedAction;
  }

  const normalizedBias = normalizeBias(bias);
  if (normalizedBias === "BUY") return "BUY_CE";
  if (normalizedBias === "SELL") return "BUY_PE";
  return "WAIT";
}

function validateDecision(decision) {
  const errors = [];

  if (!decision || typeof decision !== "object") {
    return { valid: false, errors: ["Decision must be an object"] };
  }

  if (!decision.market) {
    errors.push("market is required");
  }

  if (!Array.isArray(decision.reasons)) {
    errors.push("reasons must be an array");
  }

  if (!Array.isArray(decision.warnings)) {
    errors.push("warnings must be an array");
  }

  if (!decision.context || typeof decision.context !== "object") {
    errors.push("context must be an object");
  }

  if (!decision.levels || typeof decision.levels !== "object") {
    errors.push("levels must be an object");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

module.exports = {
  normalizeBias,
  normalizeAction,
  validateDecision,
};
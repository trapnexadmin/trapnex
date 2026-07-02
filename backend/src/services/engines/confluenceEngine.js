function buildConfluence({ analysis = {}, levels = [], camarilla = {}, roundNumbers = {}, liquidity = {}, marketPhase = {} } = {}) {
  const reasons = [];
  let confidence = 60;

  if (analysis.biasSource && analysis.biasSource !== "CPR") {
    confidence += 10;
    reasons.push(`Bias from ${analysis.biasSource}`);
  }

  if (analysis.breakoutDetected) {
    confidence += 8;
    reasons.push("Breakout detected");
  }

  if (analysis.retestDetected || analysis.holdConfirmed) {
    confidence += 10;
    reasons.push("Retest or hold confirmed");
  }

  if (analysis.priceStructure?.direction) {
    confidence += 5;
    reasons.push(`Structure ${analysis.priceStructure.direction}`);
  }

  if (roundNumbers?.touched) {
    confidence += 3;
    reasons.push("Round number interaction");
  }

  if (liquidity?.summary?.sweepCount) {
    confidence += 4;
    reasons.push("Liquidity sweep present");
  }

  if (marketPhase?.phase && marketPhase.phase !== "UNKNOWN") {
    confidence += 3;
    reasons.push(`Phase ${marketPhase.phase}`);
  }

  if (Array.isArray(levels) && levels.length > 0) {
    confidence += 2;
    reasons.push("Normalized levels available");
  }

  if (camarilla?.H3 || camarilla?.L3) {
    confidence += 2;
    reasons.push("Camarilla levels available");
  }

  return {
    confidence: Math.max(0, Math.min(100, Math.round(confidence))),
    reasons,
  };
}

module.exports = {
  buildConfluence,
};
const { buildDecision } = require("./decisionBuilder");
const { validateDecision } = require("./decisionValidator");

function buildDecisionEngine(input = {}) {
  const decision = buildDecision(input);
  const validation = validateDecision(decision);

  if (!validation.valid) {
    return buildDecision({
      market: input.market || "NIFTY",
      analysis: input.analysis,
      context: input.context,
      levels: input.levels,
      confluence: input.confluence,
      events: input.events,
      strategy: input.strategy,
    });
  }

  return decision;
}

module.exports = {
  buildDecisionEngine,
};
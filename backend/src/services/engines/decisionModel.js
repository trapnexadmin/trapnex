const { buildDecisionEngine } = require("./decisionEngine");

function buildDecision(input = {}) {
  return buildDecisionEngine(input);
}

module.exports = {
  buildDecision,
};
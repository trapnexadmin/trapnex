function buildEvents({ analysis = {}, liquidity = {}, marketPhase = {}, roundNumbers = {}, camarilla = {} } = {}) {
  const events = [];

  if (analysis.breakoutDetected) {
    events.push("LEVEL_BROKEN");
  }

  if (analysis.retestDetected || analysis.holdConfirmed) {
    events.push("LEVEL_RETEST");
  }

  if (analysis.cprState?.state === "ACCEPTANCE") {
    events.push("CPR_ACCEPTED");
  }

  if (analysis.cprState?.state === "REJECTION") {
    events.push("CPR_REJECTED");
  }

  if (liquidity?.sweeps?.length) {
    events.push("LIQUIDITY_SWEEP");
  }

  if (liquidity?.traps?.length) {
    events.push("TRAP_DETECTED");
  }

  if (liquidity?.absorption?.length) {
    events.push("ABSORPTION_DETECTED");
  }

  if (roundNumbers?.touched) {
    events.push("ROUND_NUMBER_TOUCHED");
  }

  if (marketPhase?.phase && marketPhase.phase !== "UNKNOWN") {
    events.push(`MARKET_PHASE_${marketPhase.phase}`);
  }

  if (camarilla?.H3 || camarilla?.L3) {
    events.push("CAMARILLA_READY");
  }

  return events;
}

module.exports = {
  buildEvents,
};
function buildRoundNumberLevels({ price, step = 500, tolerance = 20, span = 2 } = {}) {
  const reference = Number(price);
  if (!Number.isFinite(reference)) {
    return {
      step,
      tolerance,
      nearest: null,
      touched: false,
      levels: [],
    };
  }

  const base = Math.round(reference / step) * step;
  const levels = [];

  for (let index = -span; index <= span; index++) {
    const level = base + index * step;
    levels.push({
      level,
      distance: round(level - reference),
      touched: Math.abs(level - reference) <= tolerance,
    });
  }

  const nearest = levels.reduce((closest, candidate) => {
    if (!closest) return candidate;
    return Math.abs(candidate.level - reference) < Math.abs(closest.level - reference)
      ? candidate
      : closest;
  }, null);

  return {
    step,
    tolerance,
    nearest,
    touched: Boolean(nearest?.touched),
    levels,
  };
}

function round(val) {
  return Math.round(val * 100) / 100;
}

module.exports = {
  buildRoundNumberLevels,
};
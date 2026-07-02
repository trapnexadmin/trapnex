function buildPreviousDayProfile(previousDayHLC = {}) {
  const high = Number(previousDayHLC.high);
  const low = Number(previousDayHLC.low);
  const close = Number(previousDayHLC.close);

  if (![high, low, close].every(Number.isFinite)) {
    return {
      high: null,
      low: null,
      close: null,
      range: null,
      midpoint: null,
    };
  }

  return {
    high,
    low,
    close,
    range: round(high - low),
    midpoint: round((high + low) / 2),
  };
}

function round(val) {
  return Math.round(val * 100) / 100;
}

module.exports = {
  buildPreviousDayProfile,
};
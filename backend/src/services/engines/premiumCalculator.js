const DEFAULT_SLIPPAGE = Number(process.env.TRAPNEX_OPTION_SLIPPAGE || 1);

function buildPremiumPlan({
  quote = {},
  entrySide = "BUY",
  fallbackEntry = null,
  slippage = null,
}) {
  const ltp = pickNumber(quote.ltp, quote.lastPrice, quote.close, fallbackEntry);
  const bid = pickNumber(quote.bid, quote.bidPrice, quote.bestBid, quote.buyPrice);
  const ask = pickNumber(quote.ask, quote.askPrice, quote.bestAsk, quote.sellPrice);
  const spread = Number.isFinite(bid) && Number.isFinite(ask)
    ? round(Math.max(ask - bid, 0))
    : pickNumber(quote.spread);
  const slippagePoints = Number.isFinite(slippage)
    ? round(slippage)
    : round(Math.max(DEFAULT_SLIPPAGE, spread > 0 ? spread * 0.5 : Math.max(1, (ltp || 0) * 0.01)));
  const basePrice = entrySide === "SELL"
    ? (Number.isFinite(bid) ? bid : ltp)
    : (Number.isFinite(ask) ? ask : ltp);
  const entry = Number.isFinite(basePrice)
    ? round(entrySide === "SELL" ? basePrice - slippagePoints : basePrice + slippagePoints)
    : null;

  return {
    ltp: Number.isFinite(ltp) ? round(ltp) : null,
    bid: Number.isFinite(bid) ? round(bid) : null,
    ask: Number.isFinite(ask) ? round(ask) : null,
    mid: Number.isFinite(bid) && Number.isFinite(ask) ? round((bid + ask) / 2) : null,
    spread: Number.isFinite(spread) ? round(spread) : null,
    slippage: slippagePoints,
    entry,
    executionMode: Number.isFinite(bid) && Number.isFinite(ask) ? "BID_ASK" : Number.isFinite(ltp) ? "LTP" : "ESTIMATED",
    quote,
  };
}

function pickNumber(...values) {
  for (const value of values) {
    if (value === null || value === undefined || value === "") {
      continue;
    }
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function round(value) {
  return Math.round(Number(value) * 100) / 100;
}

module.exports = {
  buildPremiumPlan,
};
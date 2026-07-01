/**
 * CPR (Central Pivot Range) Calculator
 * Calculates Pivot, Top Central (TC), and Bottom Central (BC)
 */

function calculateCPR(high, low, close) {
  const pivot = (high + low + close) / 3;
  const formulaBc = (high + low) / 2;
  const formulaTc = (2 * pivot) - formulaBc; // Same as: pivot + (pivot - BC)
  const upper = Math.max(formulaTc, formulaBc);
  const lower = Math.min(formulaTc, formulaBc);

  const width = upper - lower;

  return {
    pivot: round(pivot),
    // Keep strategy, chart, and UI labels structurally ordered:
    // TC is always the upper CPR boundary, BC is always the lower boundary.
    tc: round(upper),
    bc: round(lower),
    width: round(width),
    upper: round(upper),
    lower: round(lower),
    formulaTc: round(formulaTc),
    formulaBc: round(formulaBc),
  };
}

function getCPRWidthType(cpr, atr) {
  if (!atr || atr === 0) return 'MODERATE';
  
  const ratio = cpr.width / atr;
  
  if (ratio < 0.15) return 'VERY_NARROW'; // Strong trend day possible 🚀
  if (ratio < 0.30) return 'NARROW';      // Good directional move
  if (ratio < 0.50) return 'MODERATE';    // Balanced day
  if (ratio < 0.75) return 'WIDE';        // Range-bound / reaction day
  return 'VERY_WIDE';                     // Support/Resistance dominated
}

function getCPRWidthDescription(widthType) {
  const descriptions = {
    'VERY_NARROW': 'Strong trend day possible 🚀',
    'NARROW': 'Good directional move',
    'MODERATE': 'Balanced day',
    'WIDE': 'Range-bound / reaction day',
    'VERY_WIDE': 'Support/Resistance dominated'
  };
  return descriptions[widthType] || 'Unknown';
}

function isNarrowCPR(cpr, atr) {
  if (!atr || atr === 0) return false;
  const ratio = cpr.width / atr;
  return ratio < 0.3; // Narrow or Very Narrow
}

function getCPRBias(price, cpr) {
  const upper = cpr.upper ?? Math.max(cpr.tc, cpr.bc);
  const lower = cpr.lower ?? Math.min(cpr.tc, cpr.bc);

  if (price > upper) return 'BULLISH';
  if (price < lower) return 'BEARISH';
  return 'NEUTRAL';
}

function round(val) {
  return Math.round(val * 100) / 100;
}

module.exports = { 
  calculateCPR, 
  isNarrowCPR, 
  getCPRBias,
  getCPRWidthType,
  getCPRWidthDescription
};

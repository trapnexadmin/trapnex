/**
 * CPR (Central Pivot Range) Calculator
 * Calculates Pivot, Top Central (TC), and Bottom Central (BC)
 */

function calculateCPR(high, low, close) {
  const pivot = (high + low + close) / 3;
  const bc = (high + low) / 2;
  const tc = (2 * pivot) - bc; // Same as: pivot + (pivot - bc)

  const width = Math.abs(tc - bc);

  return {
    pivot: round(pivot),
    tc: round(tc),
    bc: round(bc),
    width: round(width),
    upper: round(Math.max(tc, bc)),
    lower: round(Math.min(tc, bc)),
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
  if (price > cpr.tc) return 'BULLISH';
  if (price < cpr.bc) return 'BEARISH';
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

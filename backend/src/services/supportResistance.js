/**
 * Support & Resistance Levels Calculator
 * Calculates R1-R6 and S1-S6 using Standard Pivot Point method
 * Based on previous day's HLC
 */

function calculateSupportResistance(high, low, close) {
  // Pivot Point
  const P = (high + low + close) / 3;
  const range = high - low;
  
  // Standard Pivot Point Method
  // Resistance levels
  const R1 = (2 * P) - low;
  const R2 = P + range;
  const R3 = high + 2 * (P - low);
  const diff = R2 - R1; // Common difference for extended levels
  const R4 = R3 + diff;
  const R5 = R4 + diff;
  const R6 = R5 + diff;
  
  // Support levels
  const S1 = (2 * P) - high;
  const S2 = P - range;
  const S3 = low - 2 * (high - P);
  const S4 = S3 - diff;
  const S5 = S4 - diff;
  const S6 = S5 - diff;

  return {
    pivot: round(P),
    R1: round(R1),
    R2: round(R2),
    R3: round(R3),
    R4: round(R4),
    R5: round(R5),
    R6: round(R6),
    S1: round(S1),
    S2: round(S2),
    S3: round(S3),
    S4: round(S4),
    S5: round(S5),
    S6: round(S6),
  };
}

function round(val) {
  return Math.round(val * 100) / 100;
}

module.exports = { calculateSupportResistance };

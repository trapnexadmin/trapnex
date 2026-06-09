/**
 * Options Strike Selection
 * Auto-generates ATM, ITM, OTM strikes
 */

const STRIKE_INTERVAL = 50;

function getATMStrike(spotPrice) {
  return Math.round(spotPrice / STRIKE_INTERVAL) * STRIKE_INTERVAL;
}

function getStrikes(spotPrice, signalType) {
  const atm = getATMStrike(spotPrice);

  let itm, otm;

  if (signalType === 'CALL') {
    itm = atm - STRIKE_INTERVAL; // lower strike for call = ITM
    otm = atm + STRIKE_INTERVAL; // higher strike for call = OTM
  } else {
    itm = atm + STRIKE_INTERVAL; // higher strike for put = ITM
    otm = atm - STRIKE_INTERVAL; // lower strike for put = OTM
  }

  return {
    atm: { strike: atm, label: 'ATM', type: signalType },
    itm: { strike: itm, label: 'ITM', type: signalType },
    otm: { strike: otm, label: 'OTM', type: signalType },
  };
}

module.exports = { getATMStrike, getStrikes };

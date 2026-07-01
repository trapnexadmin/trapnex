/**
 * Options Strike Selection
 * Auto-generates ATM, ITM, OTM strikes
 */

const STRIKE_INTERVAL = 50;
const DEFAULT_OPTION_STOP_LOSS = 12;

const OPTION_TARGET_PROFILES = {
  'B+': { points: [7, 14, 21, 28], maxTarget: 50 },
  A: { points: [8, 16, 24, 32, 40], maxTarget: 80 },
  'A+': { points: [9, 18, 27, 36, 45, 54], maxTarget: 100 },
};

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

function getOptionTargetProfile(grade) {
  const normalizedGrade = String(grade || '').toUpperCase();
  return OPTION_TARGET_PROFILES[normalizedGrade] || OPTION_TARGET_PROFILES['B+'];
}

function buildOptionTargets(optionEntry, grade, extraTargetCount = 0) {
  const profile = getOptionTargetProfile(grade);
  const optionTargetPoints = [...profile.points];
  const targetStep = optionTargetPoints[0] || DEFAULT_OPTION_STOP_LOSS;

  for (let i = 0; i < extraTargetCount; i += 1) {
    const lastPoint = optionTargetPoints[optionTargetPoints.length - 1] || 0;
    optionTargetPoints.push(lastPoint + targetStep);
  }

  const entry = round(optionEntry);

  return {
    optionStopLoss: round(entry - DEFAULT_OPTION_STOP_LOSS),
    optionTargets: optionTargetPoints.map((points) => round(entry + points)),
    optionTargetPoints,
    optionTargetProfile: {
      grade: String(grade || 'B+').toUpperCase(),
      maxTarget: profile.maxTarget,
      targetStep,
    },
  };
}

async function enrichSignalWithOptionPremium(signal, provider) {
  if (!signal || !provider?.smartApi) return signal;

  const strikes = signal.strikes || getStrikes(signal.entry, signal.type);
  const atmStrike = strikes?.atm?.strike || getATMStrike(signal.entry);
  const optionType = signal.type === 'CALL' ? 'CE' : 'PE';
  const grade = signal.grade || signal.scoring?.grade || 'B+';

  try {
    const optionQuote = await fetchAngelOneOptionQuote(
      provider.smartApi,
      atmStrike,
      optionType,
    );

    if (!optionQuote?.ltp) return { ...signal, strikes };

    const optionEntry = round(optionQuote.ltp);
    const optionPlan = buildOptionTargets(optionEntry, grade);

    return {
      ...signal,
      strikes: {
        ...strikes,
        atm: {
          ...strikes.atm,
          ...optionQuote,
          premium: optionEntry,
          ltp: optionEntry,
        },
      },
      optionEntry,
      ...optionPlan,
      optionSymbol: optionQuote.tradingSymbol,
      optionToken: optionQuote.symbolToken,
      optionPremiumSource: 'ANGELONE_MARKET_DATA',
    };
  } catch (err) {
    console.warn(`[Options] ATM premium lookup skipped: ${err.message}`);
    return { ...signal, strikes };
  }
}

async function fetchAngelOneOptionQuote(smartApi, strike, optionType) {
  if (!smartApi?.searchScrip || !smartApi?.marketData) return null;

  const searchTerms = [
    `NIFTY ${strike} ${optionType}`,
    `NIFTY${strike}${optionType}`,
    `${strike}${optionType}`,
  ];

  for (const term of searchTerms) {
    const searchResult = await smartApi.searchScrip({
      exchange: 'NFO',
      searchscrip: term,
    });
    const matches = Array.isArray(searchResult) ? searchResult : searchResult?.data;
    const selected = selectOptionMatch(matches, strike, optionType);

    if (!selected?.symboltoken) continue;

    const marketData = await smartApi.marketData({
      mode: 'LTP',
      exchangeTokens: {
        NFO: [String(selected.symboltoken)],
      },
    });

    const fetched = marketData?.data?.fetched?.[0];
    const ltp = Number(fetched?.ltp);
    if (!Number.isFinite(ltp) || ltp <= 0) continue;

    return {
      strike,
      type: optionType,
      exchange: selected.exchange || fetched.exchange || 'NFO',
      tradingSymbol: selected.tradingsymbol || fetched.tradingSymbol,
      symbolToken: String(selected.symboltoken || fetched.symbolToken),
      ltp: round(ltp),
    };
  }

  return null;
}

function selectOptionMatch(matches, strike, optionType) {
  if (!Array.isArray(matches)) return null;

  const strikeText = String(strike);
  return matches.find((item) => {
    const symbol = String(item.tradingsymbol || item.tradingSymbol || '').toUpperCase();
    return (
      (item.exchange || '').toUpperCase() === 'NFO' &&
      symbol.includes('NIFTY') &&
      symbol.includes(strikeText) &&
      symbol.endsWith(optionType)
    );
  });
}

function round(value) {
  return Math.round(Number(value) * 100) / 100;
}

module.exports = {
  getATMStrike,
  getStrikes,
  getOptionTargetProfile,
  buildOptionTargets,
  fetchAngelOneOptionQuote,
  enrichSignalWithOptionPremium,
};

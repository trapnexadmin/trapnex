const LEVEL_STATES = {
  UNTOUCHED: "UNTOUCHED",
  TOUCHED: "TOUCHED",
  REJECTED: "REJECTED",
  BROKEN: "BROKEN",
  RETEST: "RETEST",
  ACCEPTED: "ACCEPTED",
};

class Level {
  constructor({
    id,
    name,
    category,
    price,
    state = LEVEL_STATES.UNTOUCHED,
    strength = "NORMAL",
    confluence = 0,
    touched = false,
    rejected = false,
    broken = false,
    retested = false,
    accepted = false,
    metadata = {},
  }) {
    this.id = id;
    this.name = name;
    this.category = category;
    this.price = round(price);
    this.state = state;
    this.strength = strength;
    this.confluence = round(confluence);
    this.touched = touched;
    this.rejected = rejected;
    this.broken = broken;
    this.retested = retested;
    this.accepted = accepted;
    this.metadata = metadata;
  }
}

function createLevel({
  id,
  name = id,
  category,
  price,
  strength = "NORMAL",
  confluence = 0,
  metadata = {},
  lastPrice,
  previousPrice,
  touchTolerance,
  confirmTolerance,
}) {
  if (!Number.isFinite(price)) return null;

  const priceValue = round(price);
  const stateInfo = detectLevelState({
    lastPrice,
    previousPrice,
    level: { price: priceValue, category, name, id },
    touchTolerance,
    confirmTolerance,
  });

  const confluenceScore = estimateConfluence({
    strength,
    state: stateInfo.state,
    touched: stateInfo.touched,
    rejected: stateInfo.rejected,
    broken: stateInfo.broken,
    retested: stateInfo.retested,
    accepted: stateInfo.accepted,
    extraConfluence: confluence,
  });

  return new Level({
    id,
    name,
    category,
    price: priceValue,
    state: stateInfo.state,
    strength,
    confluence: confluenceScore,
    touched: stateInfo.touched,
    rejected: stateInfo.rejected,
    broken: stateInfo.broken,
    retested: stateInfo.retested,
    accepted: stateInfo.accepted,
    metadata: {
      ...metadata,
      stateInfo,
    },
  });
}

function buildLevels({
  cpr = {},
  supportResistance = {},
  previousDay = {},
  camarilla = {},
  roundNumbers = {},
  lastPrice,
  previousPrice,
}) {
  const cprLevels = buildLevelGroup(
    [
      { id: "TC", name: "TC", category: "CPR", price: cpr.tc, strength: "PRIMARY" },
      { id: "PIVOT", name: "Pivot", category: "CPR", price: cpr.pivot, strength: "PRIMARY" },
      { id: "BC", name: "BC", category: "CPR", price: cpr.bc, strength: "PRIMARY" },
    ],
    { lastPrice, previousPrice, source: "CPR" },
  );

  const pivotLevels = buildLevelGroup(
    Object.entries(supportResistance || {}).map(([id, price]) => ({
      id,
      name: id,
      category: "PIVOT",
      price,
      strength: /^(R1|S1)$/.test(id) ? "PRIMARY" : "SECONDARY",
    })),
    { lastPrice, previousPrice, source: "PIVOT" },
  );

  const previousLevels = buildLevelGroup(
    [
      { id: "PDH", name: "Previous High", category: "PREVIOUS_DAY", price: previousDay.high, strength: "HIGH" },
      { id: "PDL", name: "Previous Low", category: "PREVIOUS_DAY", price: previousDay.low, strength: "HIGH" },
      { id: "PDC", name: "Previous Close", category: "PREVIOUS_DAY", price: previousDay.close, strength: "NORMAL" },
    ],
    { lastPrice, previousPrice, source: "PREVIOUS_DAY" },
  );

  const camarillaLevels = buildLevelGroup(
    [
      { id: "H3", name: "H3", category: "CAMARILLA", price: camarilla.H3, strength: "SECONDARY" },
      { id: "H4", name: "H4", category: "CAMARILLA", price: camarilla.H4, strength: "PRIMARY" },
      { id: "H5", name: "H5", category: "CAMARILLA", price: camarilla.H5, strength: "HIGH" },
      { id: "L3", name: "L3", category: "CAMARILLA", price: camarilla.L3, strength: "SECONDARY" },
      { id: "L4", name: "L4", category: "CAMARILLA", price: camarilla.L4, strength: "PRIMARY" },
      { id: "L5", name: "L5", category: "CAMARILLA", price: camarilla.L5, strength: "HIGH" },
    ],
    { lastPrice, previousPrice, source: "CAMARILLA" },
  );

  const roundNumberLevels = buildLevelGroup(
    (roundNumbers?.levels || []).map((level, index) => ({
      id: `RN_${index}`,
      name: `Round ${level.level}`,
      category: "ROUND_NUMBER",
      price: level.level,
      strength: level.touched ? "HIGH" : "NORMAL",
      metadata: {
        touched: level.touched,
        distance: level.distance,
      },
    })),
    { lastPrice, previousPrice, source: "ROUND_NUMBER" },
  );

  const all = [
    ...cprLevels,
    ...pivotLevels,
    ...previousLevels,
    ...camarillaLevels,
    ...roundNumberLevels,
  ];

  return {
    cpr: cprLevels,
    pivot: pivotLevels,
    previous: previousLevels,
    camarilla: camarillaLevels,
    roundNumbers: roundNumberLevels,
    all,
  };
}

function buildLevelGroup(items, priceContext) {
  return items
    .map((item) =>
      createLevel({
        ...item,
        lastPrice: priceContext.lastPrice,
        previousPrice: priceContext.previousPrice,
        metadata: {
          ...(item.metadata || {}),
          source: priceContext.source,
        },
      }),
    )
    .filter(Boolean);
}

function buildLevelSet(args = {}) {
  return buildLevels(args).all;
}

function detectLevelState({
  lastPrice,
  previousPrice,
  level,
  touchTolerance,
  confirmTolerance,
}) {
  const price = Number(level?.price);
  if (!Number.isFinite(price)) {
    return {
      state: LEVEL_STATES.UNTOUCHED,
      touched: false,
      rejected: false,
      broken: false,
      retested: false,
      accepted: false,
    };
  }

  const tolerance = Number.isFinite(touchTolerance)
    ? touchTolerance
    : Math.max(5, price * 0.0015);
  const confirmation = Number.isFinite(confirmTolerance)
    ? confirmTolerance
    : Math.max(10, price * 0.003);

  const touched =
    within(lastPrice, price, tolerance) || within(previousPrice, price, tolerance);
  const crossedUp =
    Number.isFinite(previousPrice) &&
    previousPrice <= price - tolerance &&
    Number.isFinite(lastPrice) &&
    lastPrice >= price + tolerance;
  const crossedDown =
    Number.isFinite(previousPrice) &&
    previousPrice >= price + tolerance &&
    Number.isFinite(lastPrice) &&
    lastPrice <= price - tolerance;
  const broken = crossedUp || crossedDown;
  const accepted =
    broken &&
    ((crossedUp && lastPrice >= price + confirmation) ||
      (crossedDown && lastPrice <= price - confirmation));
  const retested =
    touched &&
    Number.isFinite(previousPrice) &&
    ((previousPrice > price && lastPrice > price && lastPrice <= price + tolerance * 2) ||
      (previousPrice < price && lastPrice < price && lastPrice >= price - tolerance * 2));
  const rejected =
    touched && !broken && !retested && Number.isFinite(previousPrice)
      ? (previousPrice > price && lastPrice < price - tolerance) ||
        (previousPrice < price && lastPrice > price + tolerance)
      : false;

  let state = LEVEL_STATES.UNTOUCHED;
  if (accepted) {
    state = LEVEL_STATES.ACCEPTED;
  } else if (retested) {
    state = LEVEL_STATES.RETEST;
  } else if (broken) {
    state = LEVEL_STATES.BROKEN;
  } else if (rejected) {
    state = LEVEL_STATES.REJECTED;
  } else if (touched) {
    state = LEVEL_STATES.TOUCHED;
  }

  return {
    state,
    touched,
    rejected,
    broken,
    retested,
    accepted,
  };
}

function estimateConfluence({
  strength = "NORMAL",
  state = LEVEL_STATES.UNTOUCHED,
  touched = false,
  rejected = false,
  broken = false,
  retested = false,
  accepted = false,
  extraConfluence = 0,
}) {
  const strengthScore = {
    WEAK: 35,
    SECONDARY: 45,
    NORMAL: 55,
    PRIMARY: 65,
    HIGH: 75,
    STRONG: 80,
  }[strength] ?? 55;

  const stateBoost =
    state === LEVEL_STATES.ACCEPTED
      ? 15
      : state === LEVEL_STATES.BROKEN
        ? 12
        : state === LEVEL_STATES.RETEST
          ? 10
          : state === LEVEL_STATES.REJECTED
            ? 8
            : state === LEVEL_STATES.TOUCHED
              ? 4
              : 0;

  const interactionBoost =
    (touched ? 2 : 0) +
    (rejected ? 4 : 0) +
    (broken ? 5 : 0) +
    (retested ? 6 : 0) +
    (accepted ? 7 : 0);

  return clamp(round(strengthScore + stateBoost + interactionBoost + extraConfluence), 0, 100);
}

function within(value, price, tolerance) {
  return Number.isFinite(value) && Math.abs(value - price) <= tolerance;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function round(val) {
  return Math.round(val * 100) / 100;
}

module.exports = {
  Level,
  LEVEL_STATES,
  createLevel,
  buildLevels,
  buildLevelSet,
  detectLevelState,
};
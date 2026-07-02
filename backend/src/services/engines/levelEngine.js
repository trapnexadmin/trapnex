(function () {
  function toLevel(name, price, source, metadata = {}) {
    if (!Number.isFinite(price)) return null;

    return {
      name,
      price: round(price),
      source,
      kind: metadata.kind || "LEVEL",
      strength: metadata.strength || "NORMAL",
      category: metadata.category || null,
      metadata,
    };
  }

  function buildLevelSet({
    cpr = {},
    supportResistance = {},
    previousDay = {},
  }) {
    const levels = [];

    levels.push(
      toLevel("CPR_TC", cpr.tc, "CPR", { kind: "CPR", category: "TC" }),
      toLevel("CPR_PIVOT", cpr.pivot, "CPR", {
        kind: "CPR",
        category: "PIVOT",
      }),
      toLevel("CPR_BC", cpr.bc, "CPR", { kind: "CPR", category: "BC" }),
      toLevel("PDH", previousDay.high, "PREVIOUS_DAY", {
        kind: "PREVIOUS_DAY",
        category: "HIGH",
      }),
      toLevel("PDL", previousDay.low, "PREVIOUS_DAY", {
        kind: "PREVIOUS_DAY",
        category: "LOW",
      }),
      toLevel("PDC", previousDay.close, "PREVIOUS_DAY", {
        kind: "PREVIOUS_DAY",
        category: "CLOSE",
      }),
    );

    for (const [name, price] of Object.entries(supportResistance || {})) {
      levels.push(
        toLevel(name, price, "SUPPORT_RESISTANCE", {
          kind: "SUPPORT_RESISTANCE",
          category: name.startsWith("R") ? "RESISTANCE" : "SUPPORT",
          strength: /^(R1|S1)$/.test(name) ? "PRIMARY" : "SECONDARY",
        }),
      );
    }

    return levels.filter(Boolean);
  }

  function round(val) {
    return Math.round(val * 100) / 100;
  }

  module.exports = {
    buildLevelSet,
    toLevel,
  };
})();

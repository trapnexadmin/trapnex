import { useState, useEffect } from "react";

export default function OptionsPanel({ strikes, signalType, currentPrice }) {
  // Show signal-derived strikes only — no mock random data
  const atmStrike = currentPrice ? Math.round(currentPrice / 50) * 50 : null;

  const callStrikes = strikes
    ? [strikes.itm, strikes.atm, strikes.otm].filter(Boolean)
    : [];

  if (!currentPrice) {
    return (
      <div className="glass p-5">
        <div className="text-xs font-medium text-brand-muted uppercase tracking-wider mb-3">
          Option Chain
        </div>
        <div className="text-center py-6">
          <span className="text-brand-muted text-sm">
            Waiting for price data...
          </span>
        </div>
      </div>
    );
  }

  // Build strike ladder around ATM
  const ladder = [];
  for (let i = -6; i <= 6; i++) {
    const strike = atmStrike + i * 50;
    const isATM = strike === atmStrike;
    const signalStrike =
      callStrikes.find((s) => s.strike === strike) || null;
    ladder.push({ strike, isATM, signalStrike });
  }

  return (
    <div className="glass p-4 overflow-hidden">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium text-brand-muted uppercase tracking-wider">
          Option Chain
        </span>
        <div className="flex items-center gap-2">
          {signalType && (
            <span
              className={`text-xs font-bold px-2 py-0.5 rounded ${
                signalType === "CALL"
                  ? "text-brand-green bg-brand-green/10"
                  : "text-brand-red bg-brand-red/10"
              }`}
            >
              {signalType}
            </span>
          )}
          <span className="text-[10px] text-brand-muted px-1.5 py-0.5 rounded bg-white/5 border border-white/10">
            Strikes only
          </span>
        </div>
      </div>

      <div className="overflow-y-auto max-h-[380px] custom-scrollbar">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-brand-card border-b border-brand-border z-10">
            <tr>
              <th className="px-2 py-2 text-center font-semibold text-brand-text">
                Strike
              </th>
              <th className="px-2 py-2 text-center font-semibold text-brand-muted">
                Type
              </th>
            </tr>
          </thead>
          <tbody>
            {ladder.map((row, idx) => {
              const isSignalStrike = callStrikes.some(
                (s) => s.strike === row.strike,
              );
              return (
                <tr
                  key={idx}
                  className={`border-b border-brand-border/30 hover:bg-white/5 transition-colors ${
                    row.isATM
                      ? "bg-brand-blue/10"
                      : isSignalStrike
                        ? signalType === "CALL"
                          ? "bg-brand-green/5"
                          : "bg-brand-red/5"
                        : ""
                  }`}
                >
                  <td
                    className={`px-2 py-2 text-center font-mono font-bold ${
                      row.isATM
                        ? "text-brand-blue"
                        : isSignalStrike
                          ? signalType === "CALL"
                            ? "text-brand-green"
                            : "text-brand-red"
                          : "text-brand-text"
                    }`}
                  >
                    {row.strike}
                  </td>
                  <td className="px-2 py-2 text-center">
                    {row.isATM && (
                      <span className="text-[10px] text-brand-blue font-semibold">
                        ATM
                      </span>
                    )}
                    {isSignalStrike && !row.isATM && (
                      <span
                        className={`text-[10px] font-semibold ${
                          signalType === "CALL"
                            ? "text-brand-green"
                            : "text-brand-red"
                        }`}
                      >
                        {callStrikes.find((s) => s.strike === row.strike)
                          ?.type || ""}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-3 pt-3 border-t border-brand-border flex items-center justify-between text-[10px] text-brand-muted">
        <span>ATM: {atmStrike}</span>
        <span className="flex items-center gap-1">
          <div className="w-1.5 h-1.5 rounded-full bg-brand-muted" />
          No live OI
        </span>
      </div>
    </div>
  );
}

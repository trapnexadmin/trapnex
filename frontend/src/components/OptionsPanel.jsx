import { BarChart3 } from "lucide-react";

export default function OptionsPanel({
  strikes,
  signalType,
  currentPrice,
  onOpenOptionChart,
}) {
  // Show signal-derived strikes only — no mock random data
  const atmStrike = currentPrice ? Math.round(currentPrice / 50) * 50 : null;

  const callStrikes = strikes
    ? [strikes.itm, strikes.atm, strikes.otm].filter(Boolean)
    : [];
  const defaultSide = signalType === "PUT" ? "PE" : "CE";

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
          <button
            type="button"
            onClick={() =>
              onOpenOptionChart?.({
                strike: atmStrike,
                optionType: defaultSide,
                label: "ATM",
              })
            }
            className="h-7 px-2 rounded-lg bg-brand-blue/15 border border-brand-blue/30 text-brand-blue hover:bg-brand-blue/25 transition-colors flex items-center gap-1"
            title="Open ATM option chart"
          >
            <BarChart3 size={13} />
            <span className="text-[10px] font-semibold">ATM</span>
          </button>
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
                Chart
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
                  <td className="px-2 py-2">
                    <div className="flex items-center justify-center gap-1">
                      <OptionChartButton
                        label="CE"
                        color="green"
                        onClick={() =>
                          onOpenOptionChart?.({
                            strike: row.strike,
                            optionType: "CE",
                            label: row.isATM ? "ATM" : "STRIKE",
                          })
                        }
                      />
                      <OptionChartButton
                        label="PE"
                        color="red"
                        onClick={() =>
                          onOpenOptionChart?.({
                            strike: row.strike,
                            optionType: "PE",
                            label: row.isATM ? "ATM" : "STRIKE",
                          })
                        }
                      />
                    </div>
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
          Option chart
        </span>
      </div>
    </div>
  );
}

function OptionChartButton({ label, color, onClick }) {
  const classes =
    color === "green"
      ? "text-brand-green border-brand-green/25 hover:bg-brand-green/15"
      : "text-brand-red border-brand-red/25 hover:bg-brand-red/15";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-7 min-w-9 px-2 rounded-lg border bg-white/5 transition-colors inline-flex items-center justify-center gap-1 ${classes}`}
      title={`Open ${label} option chart`}
    >
      <BarChart3 size={12} />
      <span className="text-[10px] font-bold">{label}</span>
    </button>
  );
}

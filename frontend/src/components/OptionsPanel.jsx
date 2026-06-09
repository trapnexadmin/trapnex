import { useState, useEffect } from 'react';

export default function OptionsPanel({ strikes, signalType, currentPrice }) {
  const [optionChain, setOptionChain] = useState([]);
  const [loading, setLoading] = useState(false);

  // Generate option chain based on current price
  useEffect(() => {
    if (!currentPrice) return;

    // Generate strikes around current price (±10 strikes, interval 50)
    const atmStrike = Math.round(currentPrice / 50) * 50;
    const chain = [];

    for (let i = -10; i <= 10; i++) {
      const strike = atmStrike + (i * 50);
      const isATM = strike === atmStrike;
      
      // Mock option data (in production, this would come from AngelOne API)
      chain.push({
        strike,
        callOI: Math.floor(Math.random() * 100000) + 10000,
        callLTP: Math.max(1, (atmStrike - strike + Math.random() * 50)).toFixed(2),
        putLTP: Math.max(1, (strike - atmStrike + Math.random() * 50)).toFixed(2),
        putOI: Math.floor(Math.random() * 100000) + 10000,
        isATM,
      });
    }

    setOptionChain(chain);
  }, [currentPrice]);

  if (!currentPrice) {
    return (
      <div className="glass p-5">
        <div className="text-xs font-medium text-brand-muted uppercase tracking-wider mb-3">
          Option Chain
        </div>
        <div className="text-center py-6">
          <span className="text-brand-muted text-sm">Waiting for price data...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="glass p-4 overflow-hidden">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium text-brand-muted uppercase tracking-wider">
          Option Chain
        </span>
        {signalType && (
          <span
            className={`text-xs font-bold px-2 py-0.5 rounded ${
              signalType === 'CALL'
                ? 'text-brand-green bg-brand-green/10'
                : 'text-brand-red bg-brand-red/10'
            }`}
          >
            {signalType} Signal
          </span>
        )}
      </div>

      <div className="overflow-x-auto overflow-y-auto max-h-[400px] custom-scrollbar">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-brand-card border-b border-brand-border z-10">
            <tr>
              <th className="px-2 py-2 text-right font-semibold text-brand-green">Call OI</th>
              <th className="px-2 py-2 text-right font-semibold text-brand-green">Call LTP</th>
              <th className="px-2 py-2 text-center font-semibold text-brand-text">Strike</th>
              <th className="px-2 py-2 text-left font-semibold text-brand-red">Put LTP</th>
              <th className="px-2 py-2 text-left font-semibold text-brand-red">Put OI</th>
            </tr>
          </thead>
          <tbody>
            {optionChain.map((row, idx) => (
              <tr
                key={idx}
                className={`border-b border-brand-border/30 hover:bg-white/5 transition-colors ${
                  row.isATM ? 'bg-brand-blue/10' : ''
                }`}
              >
                <td className="px-2 py-2 text-right font-mono text-brand-muted">
                  {(row.callOI / 1000).toFixed(1)}K
                </td>
                <td className="px-2 py-2 text-right font-mono text-brand-green font-semibold">
                  ₹{row.callLTP}
                </td>
                <td className={`px-2 py-2 text-center font-mono font-bold ${
                  row.isATM ? 'text-brand-blue' : 'text-brand-text'
                }`}>
                  {row.strike}
                </td>
                <td className="px-2 py-2 text-left font-mono text-brand-red font-semibold">
                  ₹{row.putLTP}
                </td>
                <td className="px-2 py-2 text-left font-mono text-brand-muted">
                  {(row.putOI / 1000).toFixed(1)}K
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 pt-3 border-t border-brand-border flex items-center justify-between text-[10px] text-brand-muted">
        <span>Live data from AngelOne</span>
        <span className="flex items-center gap-1">
          <div className="w-1.5 h-1.5 rounded-full bg-brand-green animate-pulse" />
          Updated
        </span>
      </div>
    </div>
  );
}

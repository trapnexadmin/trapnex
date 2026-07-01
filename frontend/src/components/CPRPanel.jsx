export default function CPRPanel({ cpr, bias, price, cprWidthDesc }) {
  if (!cpr) {
    return (
      <div className="glass p-5">
        <div className="text-xs font-medium text-brand-muted uppercase tracking-wider mb-3">
          CPR Levels
        </div>
        <div className="text-center py-6">
          <span className="text-brand-muted text-sm">Calculating...</span>
        </div>
      </div>
    );
  }

  const biasColor =
    bias === 'BULLISH'
      ? 'text-brand-green'
      : bias === 'BEARISH'
      ? 'text-brand-red'
      : 'text-brand-muted';

  const biasGlow =
    bias === 'BULLISH'
      ? 'glow-green'
      : bias === 'BEARISH'
      ? 'glow-red'
      : '';
  const tc = cpr.upper ?? Math.max(cpr.tc, cpr.bc);
  const bc = cpr.lower ?? Math.min(cpr.tc, cpr.bc);
  const width = cpr.width ?? Math.abs(tc - bc);

  return (
    <div className={`glass p-5 ${biasGlow}`}>
      <div className="flex items-center justify-between mb-4">
        <span className="text-xs font-medium text-brand-muted uppercase tracking-wider">
          CPR Levels
        </span>
        <span className={`text-xs font-bold px-2 py-0.5 rounded ${biasColor} bg-white/5`}>
          {bias || 'N/A'}
        </span>
      </div>

      {/* CPR Visual */}
      <div className="space-y-3 mb-4">
        <CPRLevel label="TC" value={tc} color="text-brand-purple" price={price} />
        <CPRLevel label="Pivot" value={cpr.pivot} color="text-brand-blue" price={price} />
        <CPRLevel label="BC" value={bc} color="text-brand-purple" price={price} />
      </div>

      {/* Width with Description */}
      <div className="pt-3 border-t border-brand-border space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs text-brand-muted">CPR Width</span>
          <span className="text-xs font-mono font-medium text-brand-text">
            {width.toFixed(2)}
          </span>
        </div>
        
        {cprWidthDesc && (
          <div className="px-2 py-1 rounded bg-brand-blue/10 border border-brand-blue/20">
            <span className="text-xs text-brand-blue font-medium">
              {cprWidthDesc}
            </span>
          </div>
        )}
      </div>

      {/* Current Price Position */}
      {price > 0 && (
        <div className="mt-2 flex items-center justify-between">
          <span className="text-xs text-brand-muted">Price</span>
          <span className="text-xs font-mono font-semibold text-brand-text">
            {price.toFixed(2)}
          </span>
        </div>
      )}
    </div>
  );
}

function CPRLevel({ label, value, color, price }) {
  const isNear = price && Math.abs(price - value) / price < 0.001;

  return (
    <div className={`flex items-center justify-between py-1.5 px-3 rounded-lg ${
      isNear ? 'bg-white/5 border border-white/10' : ''
    }`}>
      <div className="flex items-center gap-2">
        <div className={`w-1.5 h-1.5 rounded-full ${color.replace('text-', 'bg-')}`} />
        <span className="text-xs font-medium text-brand-muted">{label}</span>
      </div>
      <span className={`text-sm font-mono font-semibold tabular-nums ${color}`}>
        {value.toFixed(2)}
      </span>
    </div>
  );
}

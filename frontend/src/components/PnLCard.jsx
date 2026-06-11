import { motion } from 'framer-motion';

export default function PnLCard({ trade }) {
  if (!trade) {
    return (
      <div className="glass p-5">
        <div className="text-xs font-medium text-brand-muted uppercase tracking-wider mb-3">
          Live P&L
        </div>
        <div className="text-center py-4">
          <span className="text-brand-muted text-sm">No active trade</span>
        </div>
      </div>
    );
  }

  const isProfit = trade.pnl >= 0;
  const targets = trade.targets || (trade.target ? [trade.target] : []);
  const targetPoints = trade.targetPoints || [];
  const targetsHit = trade.targetsHit || [];

  return (
    <motion.div
      className={`glass p-5 ${isProfit ? 'glow-green' : 'glow-red'}`}
      animate={{ borderColor: isProfit ? 'rgba(34,255,136,0.2)' : 'rgba(255,77,79,0.2)' }}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium text-brand-muted uppercase tracking-wider">
          Live P&L
        </span>
        <div className="flex items-center gap-2">
          {trade.grade && (
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
              trade.grade === 'A+' ? 'bg-brand-green/15 text-brand-green' :
              trade.grade === 'A' ? 'bg-brand-blue/15 text-brand-blue' :
              'bg-cyan-500/15 text-cyan-400'
            }`}>{trade.grade}</span>
          )}
          <span className={`text-xs font-medium ${
            trade.type === 'CALL' ? 'text-brand-green' : 'text-brand-red'
          }`}>
            {trade.type}
          </span>
        </div>
      </div>

      {/* Big PnL Number */}
      <div className="text-center mb-4">
        <motion.div
          className={`text-4xl font-bold font-mono tabular-nums ${
            isProfit ? 'text-brand-green' : 'text-brand-red'
          }`}
          key={trade.pnl}
          initial={{ scale: 1.05 }}
          animate={{ scale: 1 }}
          transition={{ duration: 0.15 }}
        >
          {isProfit ? '+' : ''}{trade.pnl?.toFixed(2)}
        </motion.div>
        <div className={`text-sm font-mono mt-1 ${
          isProfit ? 'text-brand-green/70' : 'text-brand-red/70'
        }`}>
          {isProfit ? '+' : ''}{trade.pnlPercent?.toFixed(2)}%
        </div>
      </div>

      {/* Trade details */}
      <div className="space-y-1.5 text-xs mb-3">
        <div className="flex justify-between">
          <span className="text-brand-muted">Entry</span>
          <span className="font-mono">{trade.entry?.toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-brand-muted">Current</span>
          <span className="font-mono">{trade.currentPrice?.toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-brand-muted">SL {trade.trailActive ? '(Trail)' : ''}</span>
          <span className={`font-mono ${trade.trailActive ? 'text-brand-blue' : 'text-brand-red'}`}>
            {trade.stopLoss?.toFixed(2)}
          </span>
        </div>
      </div>

      {/* Multi-target progress */}
      {targets.length > 0 && (
        <div className="border-t border-brand-border pt-3">
          <div className="text-[10px] text-brand-muted uppercase tracking-wider mb-2">
            Targets
          </div>
          <div className="flex gap-1 flex-wrap">
            {targets.map((tgt, i) => {
              const isHit = targetsHit.includes(i);
              const isCurrent = !isHit && i === (targetsHit.length);
              return (
                <div
                  key={i}
                  className={`flex-1 min-w-[40px] text-center py-1 rounded text-[10px] font-mono font-semibold border transition-colors ${
                    isHit
                      ? 'bg-brand-green/20 text-brand-green border-brand-green/30'
                      : isCurrent
                        ? 'bg-brand-blue/10 text-brand-blue border-brand-blue/30 animate-pulse'
                        : 'bg-white/5 text-brand-muted border-white/10'
                  }`}
                >
                  <div className="text-[9px] mb-0.5 opacity-70">T{i + 1}</div>
                  {targetPoints[i] ? `+${targetPoints[i]}` : tgt?.toFixed(0)}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </motion.div>
  );
}

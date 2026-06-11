import { motion } from 'framer-motion';

export default function SignalCard({ signal, scoring }) {
  if (!signal) return null;

  const isCall = signal.type === 'CALL';
  const targets = signal.targets || (signal.target ? [signal.target] : []);
  const targetPoints = signal.targetPoints || [];

  return (
    <motion.div
      className={`glass p-5 ${isCall ? 'glow-green' : 'glow-red'}`}
      initial={{ scale: 0.95 }}
      animate={{ scale: 1 }}
      transition={{ type: 'spring', stiffness: 200 }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div
            className={`w-2.5 h-2.5 rounded-full pulse-live ${
              isCall ? 'bg-brand-green' : 'bg-brand-red'
            }`}
          />
          <span className="text-xs font-medium text-brand-muted uppercase tracking-wider">
            Active Signal
          </span>
        </div>
        {scoring && (
          <span
            className={`px-2.5 py-0.5 rounded-md text-xs font-bold ${
              scoring.grade === 'A+'
                ? 'bg-brand-green/15 text-brand-green border border-brand-green/30'
                : scoring.grade === 'A'
                ? 'bg-brand-blue/15 text-brand-blue border border-brand-blue/30'
                : scoring.grade === 'B+' || scoring.grade === 'B'
                ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30'
                : 'bg-white/10 text-brand-muted border border-white/10'
            }`}
          >
            {scoring.grade} ({scoring.score}/{scoring.maxScore || 22})
          </span>
        )}
      </div>

      {/* Signal Type + Source */}
      <div className="flex items-end justify-between mb-4">
        <span
          className={`text-3xl font-bold ${
            isCall ? 'text-brand-green' : 'text-brand-red'
          }`}
        >
          {signal.type}
        </span>
        {signal.source && (
          <span className="text-[10px] text-brand-muted bg-white/5 px-2 py-0.5 rounded border border-white/10">
            {signal.source.replace(/_/g, ' ')}
          </span>
        )}
      </div>

      {/* Entry / SL */}
      <div className="space-y-2 mb-3">
        <Row label="Entry" value={signal.entry} color="text-brand-text" />
        <Row label="Stop Loss" value={signal.stopLoss} color="text-brand-red" />
        <div className="flex justify-between text-xs">
          <span className="text-brand-muted">R : R</span>
          <span className="font-mono font-semibold text-brand-blue">1 : {signal.riskReward}</span>
        </div>
      </div>

      {/* Multi-Target Levels */}
      {targets.length > 0 && (
        <div className="border-t border-brand-border pt-3 mb-3">
          <div className="text-[10px] text-brand-muted uppercase tracking-wider mb-2">
            Targets
          </div>
          <div className="flex gap-1 flex-wrap">
            {targets.map((tgt, i) => (
              <div
                key={i}
                className={`flex-1 min-w-[38px] text-center py-1.5 rounded text-[10px] font-mono font-semibold border ${
                  i === 0
                    ? isCall
                      ? 'bg-brand-green/15 text-brand-green border-brand-green/30'
                      : 'bg-brand-red/15 text-brand-red border-brand-red/30'
                    : 'bg-white/5 text-brand-muted border-white/10'
                }`}
              >
                <div className="text-[8px] mb-0.5 opacity-60">T{i + 1}</div>
                {targetPoints[i] ? `+${targetPoints[i]}` : tgt?.toFixed(0)}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Score Breakdown */}
      {scoring?.breakdown && Array.isArray(scoring.breakdown) && (
        <div className="border-t border-brand-border pt-3">
          <div className="flex flex-wrap gap-1.5">
            {scoring.breakdown.slice(0, 6).map((b, i) => (
              <span
                key={i}
                className={`px-2 py-0.5 text-[10px] rounded-full border ${
                  b.critical
                    ? 'bg-brand-green/10 text-brand-green border-brand-green/20'
                    : 'bg-white/5 text-brand-muted border-white/5'
                }`}
              >
                {b.factor} {b.points > 0 ? `+${b.points}` : b.points}
              </span>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
}

function Row({ label, value, color }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-brand-muted">{label}</span>
      <span className={`text-sm font-mono font-semibold tabular-nums ${color}`}>
        {typeof value === 'number' ? value.toFixed(2) : value}
      </span>
    </div>
  );
}

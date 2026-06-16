import { motion } from 'framer-motion';

export default function SignalCard({ signal, scoring }) {
  if (!signal) return null;

  const isCall = signal.type === 'CALL';
  const targets = signal.targets || (signal.target ? [signal.target] : []);
  const targetPoints = signal.targetPoints || [];
  const isCompactTargetProfile = signal.targetProfile === 'compact';
  const levelType = signal.levelType || 'STRUCTURE';
  const levelLabel = signal.levelLabel || signal.level || 'N/A';
  const levelSide = signal.levelSide || 'N/A';
  const sourceLabel = {
    RETEST_CONFIRMED: 'Retest Confirmed',
    RETEST_PENDING: 'Retest Pending',
    BREAKOUT_CONTINUATION: 'Breakout Continuation',
    BREAKOUT_EXPLOSIVE: 'Explosive Breakout',
    RANGE_REJECTION_CONTINUATION: 'Range Rejection',
    QUICK_REVERSAL_CONTINUATION: 'Quick Reversal',
    CPR_REJECTION: 'CPR Rejection',
    CPR_AM_MANIPULATION: 'CPR AM Manipulation',
  }[signal.source] || signal.source?.replace(/_/g, ' ');
  const sourceBadgeClass = {
    BREAKOUT_EXPLOSIVE:
      'text-amber-300 bg-amber-500/10 border border-amber-400/30',
    BREAKOUT_CONTINUATION:
      'text-cyan-300 bg-cyan-500/10 border border-cyan-400/30',
    RANGE_REJECTION_CONTINUATION:
      'text-rose-300 bg-rose-500/10 border border-rose-400/30',
    QUICK_REVERSAL_CONTINUATION:
      'text-lime-300 bg-lime-500/10 border border-lime-400/30',
    RETEST_CONFIRMED:
      'text-brand-green bg-brand-green/10 border border-brand-green/25',
  }[signal.source] || 'text-brand-muted bg-white/5 border border-white/10';

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
          <span className={`text-[10px] px-2 py-0.5 rounded ${sourceBadgeClass}`}>
            {sourceLabel}
          </span>
        )}
      </div>

      {/* Entry / SL */}
      <div className="space-y-2 mb-3">
        <Row label="Entry" value={signal.entry} color="text-brand-text" />
        <Row label="Stop Loss" value={signal.stopLoss} color="text-brand-red" />
        <Row label="Trigger Type" value={levelType} color="text-brand-blue" />
        <Row label="Trigger Level" value={levelLabel} color="text-brand-text" />
        <Row label="Trigger Side" value={levelSide} color="text-brand-muted" />
        <Row label="Trigger Price" value={signal.levelPrice ?? signal.entry} color="text-brand-blue" />
        <div className="flex justify-between text-xs">
          <span className="text-brand-muted">R : R</span>
          <span className="font-mono font-semibold text-brand-blue">1 : {signal.riskReward}</span>
        </div>
      </div>

      {/* Multi-Target Levels */}
      {targets.length > 0 && (
        <div className="border-t border-brand-border pt-3 mb-3">
          <div className="flex items-center justify-between mb-2 gap-2">
            <div className="text-[10px] text-brand-muted uppercase tracking-wider">
              Targets
            </div>
            {isCompactTargetProfile && (
              <span className="text-[9px] uppercase tracking-wider text-rose-300 bg-rose-500/10 border border-rose-400/30 px-1.5 py-0.5 rounded">
                Compact Profile
              </span>
            )}
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

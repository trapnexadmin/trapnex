import { motion } from 'framer-motion';

export default function SignalCard({ signal, scoring }) {
  if (!signal) return null;

  const isCall = signal.type === 'CALL';
  const color = isCall ? 'green' : 'red';

  return (
    <motion.div
      className={`glass p-5 ${isCall ? 'glow-green' : 'glow-red'}`}
      initial={{ scale: 0.95 }}
      animate={{ scale: 1 }}
      transition={{ type: 'spring', stiffness: 200 }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
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
                : 'bg-white/10 text-brand-muted border border-white/10'
            }`}
          >
            {scoring.grade} ({scoring.score}/10)
          </span>
        )}
      </div>

      {/* Signal Type */}
      <div className="mb-4">
        <span
          className={`text-3xl font-bold ${
            isCall ? 'text-brand-green' : 'text-brand-red'
          }`}
        >
          {signal.type}
        </span>
      </div>

      {/* Entry / SL / Target */}
      <div className="space-y-2">
        <Row label="Entry" value={signal.entry} color="text-brand-text" />
        <Row label="Stop Loss" value={signal.stopLoss} color="text-brand-red" />
        <Row label="Target" value={signal.target} color="text-brand-green" />
        <div className="pt-2 border-t border-brand-border">
          <Row
            label="Risk : Reward"
            value={`1 : ${signal.riskReward}`}
            color="text-brand-blue"
          />
        </div>
      </div>

      {/* Score Breakdown */}
      {scoring?.breakdown && (
        <div className="mt-4 pt-3 border-t border-brand-border">
          <div className="flex flex-wrap gap-1.5">
            {scoring.breakdown.map((b, i) => (
              <span
                key={i}
                className="px-2 py-0.5 text-[10px] rounded-full bg-white/5 text-brand-muted border border-white/5"
              >
                {b.factor} +{b.points}
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

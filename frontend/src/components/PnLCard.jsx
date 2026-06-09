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

  return (
    <motion.div
      className={`glass p-5 ${isProfit ? 'glow-green' : 'glow-red'}`}
      animate={{ borderColor: isProfit ? 'rgba(34,255,136,0.2)' : 'rgba(255,77,79,0.2)' }}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium text-brand-muted uppercase tracking-wider">
          Live P&L
        </span>
        <span className={`text-xs font-medium ${
          trade.type === 'CALL' ? 'text-brand-green' : 'text-brand-red'
        }`}>
          {trade.type}
        </span>
      </div>

      {/* Big PnL Number */}
      <div className="text-center mb-3">
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
      <div className="space-y-1.5 text-xs">
        <div className="flex justify-between">
          <span className="text-brand-muted">Entry</span>
          <span className="font-mono">{trade.entry?.toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-brand-muted">Current</span>
          <span className="font-mono">{trade.currentPrice?.toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-brand-muted">SL</span>
          <span className="font-mono text-brand-red">{trade.stopLoss?.toFixed(2)}</span>
        </div>
      </div>
    </motion.div>
  );
}

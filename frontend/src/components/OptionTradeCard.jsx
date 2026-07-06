import { motion } from "framer-motion";

export default function OptionTradeCard({ optionTrade, onOpenOptionChart }) {
  if (!optionTrade) return null;

  const targets = optionTrade.targets || optionTrade.optionTargets || [];
  const targetPoints = optionTrade.targetPoints || optionTrade.optionTargetPoints || [];
  const isReady = Boolean(optionTrade.ready);
  const isBuy = String(optionTrade.type || "CALL").toUpperCase() === "CALL";

  return (
    <motion.div
      className={`glass p-5 ${isBuy ? "glow-green" : "glow-red"}`}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium text-brand-muted uppercase tracking-wider">
          Option Trade
        </span>
        <span
          className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
            optionTrade.status === "READY"
              ? "bg-brand-green/15 text-brand-green border-brand-green/30"
              : optionTrade.status === "WAITING_QUOTE"
                ? "bg-brand-blue/15 text-brand-blue border-brand-blue/30"
                : "bg-white/5 text-brand-muted border-white/10"
          }`}
        >
          {optionTrade.lifecycle || optionTrade.status || "WAIT"}
        </span>
      </div>

      <div className="flex items-end justify-between mb-4">
        <div>
          <div className={`text-3xl font-bold ${isBuy ? "text-brand-green" : "text-brand-red"}`}>
            {optionTrade.symbol || "WAIT"}
          </div>
          <div className="text-xs text-brand-muted mt-1">
            {optionTrade.optionType || optionTrade.type || "N/A"} · Qty {optionTrade.quantity ?? 0}
          </div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-mono font-bold text-brand-text">
            {optionTrade.rr ? `1:${Number(optionTrade.rr).toFixed(1)}` : "-"}
          </div>
          <div className="text-[10px] uppercase tracking-wider text-brand-muted">
            R:R
          </div>
        </div>
      </div>

      <div className="space-y-1.5 text-xs mb-3">
        <Row label="Entry" value={optionTrade.entry} color={isBuy ? "text-brand-green" : "text-brand-red"} />
        <Row label="Stop Loss" value={optionTrade.stopLoss} color="text-brand-red" />
        <Row label="Strike" value={optionTrade.strike} color="text-brand-blue" />
        <Row label="Quantity" value={optionTrade.quantity} color="text-brand-text" />
      </div>

      {targets.length > 0 && (
        <div className="border-t border-brand-border pt-3 mb-3">
          <div className="text-[10px] text-brand-muted uppercase tracking-wider mb-2">
            Targets
          </div>
          <div className="flex gap-1 flex-wrap">
            {targets.map((target, index) => (
              <div
                key={index}
                className={`flex-1 min-w-[38px] text-center py-1.5 rounded text-[10px] font-mono font-semibold border ${
                  index === 0
                    ? isBuy
                      ? "bg-brand-green/15 text-brand-green border-brand-green/30"
                      : "bg-brand-red/15 text-brand-red border-brand-red/30"
                    : "bg-white/5 text-brand-muted border-white/10"
                }`}
              >
                <div className="text-[8px] mb-0.5 opacity-60">T{index + 1}</div>
                {targetPoints[index] ? `+${targetPoints[index]}` : Number(target).toFixed(0)}
              </div>
            ))}
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={onOpenOptionChart}
        className="w-full rounded-lg border border-brand-blue/30 bg-brand-blue/10 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-brand-blue transition-colors hover:bg-brand-blue/20"
      >
        Open Option Chart
      </button>

      {!isReady && (
        <div className="mt-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-brand-muted">
          {optionTrade.status || "WAITING"}
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
        {typeof value === "number" ? value.toFixed(2) : value ?? "-"}
      </span>
    </div>
  );
}
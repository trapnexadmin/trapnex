import { motion } from "framer-motion";

export default function DecisionCard({ decision, strikeSelection, onOpenOptionChart }) {
  if (!decision) return null;

  const bias = String(decision.bias || "WAIT").toUpperCase();
  const action = String(decision.action || "WAIT").toUpperCase();
  const confidence = Number(decision.confidence ?? 0);
  const grade = String(decision.grade || "-").toUpperCase();
  const reasons = Array.isArray(decision.reasons) ? decision.reasons : [];
  const warnings = Array.isArray(decision.warnings) ? decision.warnings : [];
  const isBullish = bias === "BUY";
  const actionLabel = action === "WAIT" ? "WAIT" : action.replace("BUY_", "BUY ").replace("SELL_", "SELL ");

  return (
    <motion.div
      className={`glass p-5 ${isBullish ? "glow-green" : bias === "SELL" ? "glow-red" : ""}`}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium text-brand-muted uppercase tracking-wider">
          Decision View
        </span>
        <span
          className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
            grade === "A+"
              ? "bg-brand-green/15 text-brand-green border-brand-green/30"
              : grade === "A"
                ? "bg-brand-blue/15 text-brand-blue border-brand-blue/30"
                : "bg-white/5 text-brand-muted border-white/10"
          }`}
        >
          {grade}
        </span>
      </div>

      <div className="flex items-end justify-between mb-4">
        <div>
          <div className="text-3xl font-bold tracking-tight text-brand-text">
            {decision.market || "NIFTY"}
          </div>
          <div className={`text-sm font-semibold ${isBullish ? "text-brand-green" : bias === "SELL" ? "text-brand-red" : "text-brand-muted"}`}>
            {bias}
          </div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-mono font-bold tabular-nums text-brand-text">
            {confidence}%
          </div>
          <div className="text-[10px] uppercase tracking-wider text-brand-muted">
            Confidence
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-brand-border bg-white/5 p-3 mb-3">
        <div className="text-[10px] uppercase tracking-wider text-brand-muted mb-1">
          Action
        </div>
        <div className={`text-xl font-semibold ${isBullish ? "text-brand-green" : bias === "SELL" ? "text-brand-red" : "text-brand-muted"}`}>
          {actionLabel}
        </div>
        <div className="mt-2 text-xs text-brand-muted flex flex-wrap gap-2">
          <span>Strategy: {decision.strategy || "WAIT"}</span>
          {strikeSelection?.symbol && <span>Strike: {strikeSelection.symbol}</span>}
        </div>
      </div>

      {reasons.length > 0 && (
        <div className="mb-3">
          <div className="text-[10px] uppercase tracking-wider text-brand-muted mb-2">
            Reasons
          </div>
          <div className="flex flex-wrap gap-1.5">
            {reasons.slice(0, 8).map((reason) => (
              <span
                key={reason}
                className="px-2 py-0.5 text-[10px] rounded-full border bg-white/5 text-brand-text border-white/10"
              >
                {reason}
              </span>
            ))}
          </div>
        </div>
      )}

      {warnings.length > 0 && (
        <div className="mb-3 rounded-lg border border-amber-400/20 bg-amber-500/10 p-2">
          <div className="text-[10px] uppercase tracking-wider text-amber-200 mb-1">
            Warnings
          </div>
          <div className="flex flex-wrap gap-1.5">
            {warnings.slice(0, 4).map((warning) => (
              <span key={warning} className="text-[10px] text-amber-100">
                {warning}
              </span>
            ))}
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={onOpenOptionChart}
        className="w-full rounded-lg border border-brand-blue/30 bg-brand-blue/10 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-brand-blue transition-colors hover:bg-brand-blue/20"
      >
        Open Option Layer
      </button>
    </motion.div>
  );
}
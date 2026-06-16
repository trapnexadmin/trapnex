export default function ScoreCard({ scoring }) {
  if (!scoring) {
    return (
      <div className="glass p-5">
        <div className="text-xs font-medium text-brand-muted uppercase tracking-wider mb-3">
          Setup Score
        </div>
        <div className="text-center py-4">
          <span className="text-brand-muted text-sm">Analyzing market...</span>
        </div>
      </div>
    );
  }

  const gradeColor =
    {
      "A+": "text-brand-green",
      A: "text-brand-blue",
      "B+": "text-cyan-400",
      B: "text-yellow-400",
      C: "text-brand-muted",
    }[scoring.grade] || "text-brand-muted";

  const gradeGlow =
    {
      "A+": "glow-green",
      A: "glow-blue",
      "B+": "glow-cyan",
    }[scoring.grade] || "";

  return (
    <div className={`glass p-5 ${gradeGlow}`}>
      <div className="text-xs font-medium text-brand-muted uppercase tracking-wider mb-3">
        Setup Score
      </div>

      {/* Grade */}
      <div className="text-center mb-4">
        <div className={`text-5xl font-bold ${gradeColor}`}>
          {scoring.grade}
        </div>
        <div className="text-sm text-brand-muted mt-1">
          {scoring.score} / {scoring.maxScore || 20}
        </div>
      </div>

      {/* Score Bar */}
      <div className="w-full h-1.5 rounded-full bg-white/5 mb-4 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700 ease-out"
          style={{
            width: `${Math.min(100, (scoring.score / (scoring.maxScore || 20)) * 100)}%`,
            background: `linear-gradient(90deg, #22FF88, #3B82F6)`,
          }}
        />
      </div>

      {/* Breakdown */}
      {scoring.breakdown?.length > 0 && (
        <div className="space-y-1.5">
          {scoring.breakdown.map((b, i) => (
            <div key={i} className="flex items-center justify-between text-xs">
              <span className="text-brand-muted">{b.factor}</span>
              <span className="text-brand-green font-mono">+{b.points}</span>
            </div>
          ))}
        </div>
      )}

      {/* Tradeable indicator */}
      <div className="mt-4 pt-3 border-t border-brand-border text-center">
        <span
          className={`text-xs font-medium ${
            scoring.tradeable ? "text-brand-green" : "text-brand-muted"
          }`}
        >
          {scoring.tradeable
            ? `✓ TRADEABLE — ${scoring.grade} Setup`
            : `Waiting for better setup... (${scoring.grade})`}
        </span>
      </div>
    </div>
  );
}

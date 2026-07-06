import { useEffect, useMemo, useRef, useState } from "react";
import { createChart } from "lightweight-charts";
import { X } from "lucide-react";

const DEFAULT_OPTION_STOP_LOSS = 12;

const OPTION_TARGET_PROFILES = {
  "B+": { points: [7, 14, 21, 28], maxTarget: 50 },
  A: { points: [8, 16, 24, 32, 40], maxTarget: 80 },
  "A+": { points: [9, 18, 27, 36, 45, 54], maxTarget: 100 },
};

function round(value) {
  return Math.round(Number(value) * 100) / 100;
}

function getOptionSide(signalType, optionType) {
  if (optionType) return optionType;
  return signalType === "PUT" ? "PE" : "CE";
}

function getOptionTargetProfile(grade) {
  const normalizedGrade = String(grade || "").toUpperCase();
  return (
    OPTION_TARGET_PROFILES[normalizedGrade] || OPTION_TARGET_PROFILES["B+"]
  );
}

function extendTargetPoints(points, extraTargetCount = 0) {
  const nextPoints = [...(points || [])];
  const step = nextPoints[0] || DEFAULT_OPTION_STOP_LOSS;

  for (let i = 0; i < extraTargetCount; i += 1) {
    const lastPoint = nextPoints[nextPoints.length - 1] || 0;
    nextPoints.push(lastPoint + step);
  }

  return nextPoints;
}

function getKnownPremium(trade, signal, optionType) {
  const source = trade || signal || {};
  const atm = source.strikes?.atm;
  const side = getOptionSide(source.type, optionType);

  if (source.optionEntry) return source.optionEntry;
  if (source.ltp) return source.ltp;
  if (atm?.type === side && (atm.premium || atm.ltp))
    return atm.premium || atm.ltp;
  return null;
}

function buildOptionLevels({
  selection,
  trade,
  signal,
  quote,
  manualExtensions,
}) {
  const source = quote || trade || signal || {};
  const grade =
    source.grade ||
    trade?.grade ||
    signal?.grade ||
    signal?.scoring?.grade ||
    trade?.scoring?.grade ||
    "B+";
  const profile = getOptionTargetProfile(grade);
  const baseTargetPoints = source.optionTargetPoints?.length
    ? source.optionTargetPoints
    : profile.points;
  const targetPoints = extendTargetPoints(baseTargetPoints, manualExtensions);
  const knownPremium = getKnownPremium(trade, signal, selection?.optionType);
  const premium =
    source.optionEntry ?? source.ltp ?? source.premium ?? knownPremium;
  const optionTargets = premium
    ? targetPoints.map((points) => round(premium + points))
    : [];
  const optionStopLoss =
    source.optionStopLoss ??
    (premium ? round(premium - DEFAULT_OPTION_STOP_LOSS) : null);

  return {
    premium,
    optionStopLoss,
    optionTargets,
    targetPoints,
    targetProfile: {
      grade: String(grade || "B+").toUpperCase(),
      maxTarget: profile.maxTarget,
      targetStep:
        targetPoints[0] || profile.points[0] || DEFAULT_OPTION_STOP_LOSS,
    },
    openTime: source.openTime || source.timestamp || Date.now(),
    targetsHit: source.targetsHit || [],
    pnl: source.pnl || 0,
    status: source.status || (trade ? "OPEN" : "SIGNAL"),
    reason: source.reason || source.exit?.reason || null,
    exitTime: source.closeTime || source.exit?.time || null,
    optionSymbol: source.optionSymbol || source.tradingSymbol || null,
  };
}

function buildChartData(levels) {
  const start = Math.floor(new Date(levels.openTime).getTime() / 1000);
  const now = Math.floor(Date.now() / 1000);
  const entry = levels.premium || 0;
  if (!entry) return [];

  return [
    { time: start, value: entry },
    { time: Math.max(start + 60, now - 180), value: entry },
    { time: Math.max(start + 120, now), value: entry },
  ];
}

export default function OptionStrikeChart({
  selection,
  trade,
  signal,
  currentPrice,
  onClose,
}) {
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef(null);
  const lineRefs = useRef([]);
  const [remoteQuote, setRemoteQuote] = useState(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState(null);
  const [manualExtensions, setManualExtensions] = useState(0);

  const optionType = getOptionSide(
    trade?.type || signal?.type,
    selection?.optionType,
  );
  const strike =
    selection?.strike ||
    trade?.strikes?.atm?.strike ||
    signal?.strikes?.atm?.strike;
  const grade =
    trade?.grade ||
    signal?.grade ||
    signal?.scoring?.grade ||
    trade?.scoring?.grade ||
    remoteQuote?.grade ||
    "B+";

  const levels = useMemo(
    () =>
      buildOptionLevels({
        selection,
        trade,
        signal,
        quote: remoteQuote,
        manualExtensions,
      }),
    [selection, trade, signal, remoteQuote, manualExtensions],
  );
  const data = useMemo(() => buildChartData(levels), [levels]);

  useEffect(() => {
    setManualExtensions(0);
  }, [selection?.strike, selection?.optionType, trade?.id, signal?.timestamp]);

  useEffect(() => {
    const inlinePremium = trade?.optionEntry || signal?.optionEntry;
    if (inlinePremium) {
      setRemoteQuote(null);
      setQuoteLoading(false);
      setQuoteError(null);
      return;
    }

    if (!strike || !optionType) {
      setRemoteQuote(null);
      setQuoteLoading(false);
      return;
    }

    const controller = new AbortController();
    setQuoteLoading(true);
    setQuoteError(null);

    fetch(
      `/api/option-quote?strike=${encodeURIComponent(strike)}&optionType=${encodeURIComponent(optionType)}&grade=${encodeURIComponent(grade)}${selection?.tradingSymbol || trade?.tradingSymbol || signal?.tradingSymbol ? `&tradingSymbol=${encodeURIComponent(selection?.tradingSymbol || trade?.tradingSymbol || signal?.tradingSymbol)}` : ''}`,
      { signal: controller.signal },
    )
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          if (response.status === 404 || response.status === 503) {
            setRemoteQuote(payload);
            setQuoteError(null);
            return;
          }

          throw new Error(payload?.error || "Failed to resolve option quote");
        }

        setRemoteQuote(payload);
      })
      .catch((err) => {
        if (err.name === "AbortError") return;
        setRemoteQuote(null);
        setQuoteError(err.message || "Failed to resolve option quote");
      })
      .finally(() => {
        setQuoteLoading(false);
      });

    return () => controller.abort();
  }, [strike, optionType, grade, trade?.optionEntry, signal?.optionEntry]);

  const title =
    (levels.premium &&
      (levels.optionSymbol || trade?.optionSymbol || signal?.optionSymbol)) ||
    `NIFTY ${strike || "-"} ${optionType}`;

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { color: "#151924" },
        textColor: "#94A3B8",
        fontFamily: "Inter, system-ui, sans-serif",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: "rgba(255,255,255,0.03)" },
        horzLines: { color: "rgba(255,255,255,0.03)" },
      },
      rightPriceScale: {
        borderColor: "rgba(255,255,255,0.06)",
        scaleMargins: { top: 0.12, bottom: 0.16 },
      },
      timeScale: {
        borderColor: "rgba(255,255,255,0.06)",
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 8,
      },
    });

    const series = chart.addLineSeries({
      color: optionType === "CE" ? "#22FF88" : "#FF4D4F",
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true,
    });

    chartRef.current = chart;
    seriesRef.current = series;

    const resize = () => {
      chart.applyOptions({
        width: containerRef.current.clientWidth,
        height: containerRef.current.clientHeight,
      });
    };

    window.addEventListener("resize", resize);
    resize();

    return () => {
      window.removeEventListener("resize", resize);
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [optionType]);

  useEffect(() => {
    if (!seriesRef.current || !data.length) return;

    lineRefs.current.forEach((line) => {
      try {
        seriesRef.current.removePriceLine(line);
      } catch {}
    });
    lineRefs.current = [];

    seriesRef.current.setData(data);

    const addLine = (price, title, color, style = 2) => {
      if (!price) return;
      const line = seriesRef.current.createPriceLine({
        price,
        color,
        lineWidth: title === "ENTRY" ? 2 : 1,
        lineStyle: style,
        axisLabelVisible: true,
        title,
      });
      lineRefs.current.push(line);
    };

    addLine(levels.premium, "ENTRY", "#3B82F6", 0);
    addLine(levels.optionStopLoss, "SL", "#FF4D4F", 2);
    levels.optionTargets.forEach((target, idx) => {
      addLine(target, `T${idx + 1}`, "#22FF88", 1);
    });

    const markers = [];
    if (levels.premium) {
      markers.push({
        time: data[0].time,
        position: "belowBar",
        color: "#3B82F6",
        shape: "arrowUp",
        text: "Entry",
      });
    }

    levels.targetsHit.forEach((targetIdx) => {
      const target = levels.optionTargets[targetIdx];
      if (!target) return;
      markers.push({
        time: data[data.length - 1].time,
        position: "aboveBar",
        color: "#22FF88",
        shape: "circle",
        text: `T${targetIdx + 1}`,
      });
    });

    if (levels.status === "CLOSED") {
      markers.push({
        time: data[data.length - 1].time,
        position: levels.reason === "STOP_LOSS" ? "belowBar" : "aboveBar",
        color: levels.reason === "STOP_LOSS" ? "#FF4D4F" : "#22FF88",
        shape: "square",
        text: levels.reason || "Exit",
      });
    }

    seriesRef.current.setMarkers(markers);
    chartRef.current?.timeScale().fitContent();
  }, [data, levels]);

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm p-3 md:p-6">
      <div className="h-full max-w-6xl mx-auto glass flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-brand-border">
          <div className="min-w-0">
            <div className="text-xs text-brand-muted uppercase tracking-wider">
              Option Strike Chart
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span
                className={`text-xs font-bold px-2 py-0.5 rounded ${
                  optionType === "CE"
                    ? "text-brand-green bg-brand-green/10"
                    : "text-brand-red bg-brand-red/10"
                }`}
              >
                {optionType}
              </span>
              <span className="text-lg font-bold text-brand-text truncate">
                {title}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-brand-muted hover:text-brand-text flex items-center justify-center transition-colors"
            title="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 p-4 border-b border-brand-border">
          <Metric label="Spot" value={currentPrice?.toFixed?.(2) || "-"} />
          <Metric label="Entry" value={levels.premium?.toFixed?.(2) || "-"} />
          <Metric
            label="SL"
            value={levels.optionStopLoss?.toFixed?.(2) || "-"}
            color="text-brand-red"
          />
          <Metric
            label="T1"
            value={levels.optionTargets[0]?.toFixed?.(2) || "-"}
            color="text-brand-green"
          />
          <Metric
            label="Status"
            value={
              quoteLoading
                ? "LOADING"
                : quoteError
                  ? "UNAVAILABLE"
                  : levels.status
            }
          />
        </div>

        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-brand-border">
          <div className="text-[10px] uppercase tracking-wider text-brand-muted">
            Grade {levels.targetProfile.grade} · Step{" "}
            {levels.targetProfile.targetStep} · Max{" "}
            {levels.targetProfile.maxTarget}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setManualExtensions((count) => count + 1)}
              disabled={!levels.premium}
              className="h-8 px-3 rounded-lg border border-brand-blue/30 bg-brand-blue/10 text-brand-blue hover:bg-brand-blue/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-[11px] font-semibold"
            >
              Extend Targets
            </button>
            {manualExtensions > 0 && (
              <button
                type="button"
                onClick={() => setManualExtensions(0)}
                className="h-8 px-3 rounded-lg border border-white/10 bg-white/5 text-brand-muted hover:text-brand-text hover:bg-white/10 transition-colors text-[11px] font-semibold"
              >
                Reset
              </button>
            )}
          </div>
        </div>

        {data.length ? (
          <div ref={containerRef} className="flex-1 min-h-[360px]" />
        ) : (
          <div className="flex-1 flex items-center justify-center text-sm text-brand-muted px-6 text-center">
            <div className="space-y-2">
              <div>
                {quoteLoading
                  ? "Loading option premium..."
                  : quoteError
                    ? "Waiting for live option premium..."
                    : remoteQuote?.status === "UNAVAILABLE"
                      ? "Live option premium unavailable right now."
                      : "Waiting for ATM option premium..."}
              </div>
              {quoteError ? (
                <div className="text-xs text-brand-red max-w-md">
                  {quoteError}
                </div>
              ) : remoteQuote?.reason ? (
                <div className="text-xs text-brand-muted max-w-md">
                  {remoteQuote.reason}
                </div>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Metric({ label, value, color = "text-brand-text" }) {
  return (
    <div className="rounded-lg bg-white/5 border border-white/10 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-brand-muted">
        {label}
      </div>
      <div className={`mt-1 text-sm font-mono font-bold ${color}`}>{value}</div>
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import { createChart } from "lightweight-charts";

const TF_OPTIONS = ["1m", "3m", "5m", "15m"];

export default function LiveChart({
  candles,
  timeframe,
  onTimeframeChange,
  analysis,
  closingSeconds = 0,
}) {
  const chartContainerRef = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef(null);
  const volumeSeriesRef = useRef(null);
  const cprLinesRef = useRef([]);
  const srLinesRef = useRef([]);
  const [countdown, setCountdown] = useState(closingSeconds);
  const compressionZone = analysis?.compressionZone;
  const triangleState = compressionZone?.state;
  const triangleBadge = triangleState
    ? {
        BUILDING: {
          label: "TRIANGLE BUILDING",
          className:
            "bg-amber-500/10 border border-amber-400/25 text-amber-300",
        },
        BREAKOUT_WATCH: {
          label: "TRIANGLE BREAKOUT WATCH",
          className: "bg-cyan-500/10 border border-cyan-400/25 text-cyan-300",
        },
        CONFIRMED_ENTRY: {
          label: "TRIANGLE CONFIRMED ENTRY",
          className:
            "bg-brand-green/10 border border-brand-green/25 text-brand-green",
        },
      }[triangleState] || null
    : null;

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
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
      crosshair: {
        mode: 0,
        vertLine: { color: "rgba(255,255,255,0.1)", width: 1 },
        horzLine: { color: "rgba(255,255,255,0.1)", width: 1 },
      },
      rightPriceScale: {
        borderColor: "rgba(255,255,255,0.06)",
        scaleMargins: { top: 0.1, bottom: 0.2 },
      },
      timeScale: {
        borderColor: "rgba(255,255,255,0.06)",
        timeVisible: true,
        secondsVisible: true,
        rightOffset: 12,
        barSpacing: 8,
        fixLeftEdge: false,
        fixRightEdge: false,
        lockVisibleTimeRangeOnResize: true,
        shiftVisibleRangeOnNewBar: true,
      },
      localization: {
        timeFormatter: (timestamp) => {
          // Convert Unix timestamp to IST (UTC+5:30)
          const date = new Date(timestamp * 1000);
          const istOffset = 5.5 * 60 * 60 * 1000; // IST offset in milliseconds
          const istDate = new Date(date.getTime() + istOffset);

          const hours = istDate.getUTCHours().toString().padStart(2, "0");
          const minutes = istDate.getUTCMinutes().toString().padStart(2, "0");
          const seconds = istDate.getUTCSeconds().toString().padStart(2, "0");

          return `${hours}:${minutes}:${seconds}`;
        },
      },
      handleScroll: {
        vertTouchDrag: true,
        mouseWheel: true,
        pressedMouseMove: true,
      },
      handleScale: {
        axisPressedMouseMove: true,
        mouseWheel: true,
        pinch: true,
      },
    });

    const series = chart.addCandlestickSeries({
      upColor: "#089981",
      downColor: "#FF4D4F",
      borderDownColor: "#FF4D4F",
      borderUpColor: "#089981",
      wickDownColor: "#FF4D4F",
      wickUpColor: "#089981",
    });

    // Add volume series
    const volumeSeries = chart.addHistogramSeries({
      color: "#26A69A",
      priceFormat: { type: "volume" },
      priceScaleId: "volume",
      lastValueVisible: false,
      priceLineVisible: false,
    });

    chart.priceScale("volume").applyOptions({
      scaleMargins: {
        top: 0.85,
        bottom: 0,
      },
    });

    chartRef.current = chart;
    seriesRef.current = series;
    volumeSeriesRef.current = volumeSeries;

    const handleResize = () => {
      chart.applyOptions({
        width: chartContainerRef.current.clientWidth,
        height: chartContainerRef.current.clientHeight,
      });
    };

    window.addEventListener("resize", handleResize);
    handleResize();

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
    };
  }, []);

  // Update countdown timer
  useEffect(() => {
    setCountdown(closingSeconds);

    const interval = setInterval(() => {
      setCountdown((prev) => Math.max(0, prev - 1));
    }, 1000);

    return () => clearInterval(interval);
  }, [closingSeconds]);

  // Update candle data with volume
  useEffect(() => {
    if (!seriesRef.current || !volumeSeriesRef.current || !candles.length)
      return;

    try {
      // Remove duplicates and ensure strictly ascending order
      const uniqueCandlesMap = new Map();

      for (const c of candles) {
        const timeInSeconds = Math.floor(c.time / 1000);
        // Keep latest candle for each timestamp
        uniqueCandlesMap.set(timeInSeconds, {
          time: timeInSeconds,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
        });
      }

      // Convert map to array and sort by time (ascending)
      const data = Array.from(uniqueCandlesMap.values()).sort(
        (a, b) => a.time - b.time,
      );

      // Build volume data with same timestamps
      const volumeData = data.map((d) => {
        const originalCandle = candles.find(
          (c) => Math.floor(c.time / 1000) === d.time,
        );
        return {
          time: d.time,
          value: originalCandle?.volume || 0,
          color:
            d.close >= d.open
              ? "rgba(34, 255, 136, 0.5)"
              : "rgba(255, 77, 79, 0.5)",
        };
      });

      // Only update if data is valid
      if (data.length > 0) {
        seriesRef.current.setData(data);
        volumeSeriesRef.current.setData(volumeData);

        // Auto-scroll to latest with slight offset
        if (chartRef.current) {
          chartRef.current.timeScale().scrollToRealTime();
        }
      }
    } catch (err) {
      console.error("[LiveChart] Error updating candles:", err.message);
      // Continue without error - don't crash the component
    }
  }, [candles]);

  // Draw CPR and Support/Resistance lines
  useEffect(() => {
    if (!seriesRef.current) return;

    try {
      // Remove old CPR lines
      cprLinesRef.current.forEach((line) => {
        try {
          seriesRef.current.removePriceLine(line);
        } catch {}
      });
      cprLinesRef.current = [];

      // Remove old S/R lines
      srLinesRef.current.forEach((line) => {
        try {
          seriesRef.current.removePriceLine(line);
        } catch {}
      });
      srLinesRef.current = [];

      // Draw CPR lines
      if (analysis?.cpr) {
        const { pivot, tc, bc, upper, lower } = analysis.cpr;

        const chartTC = upper ?? Math.max(tc, bc);
        const chartBC = lower ?? Math.min(tc, bc);

        const cprLines = [
          { price: chartTC, color: "#8B5CF6", title: "TC" },
          { price: pivot, color: "#3B82F6", title: "P" },
          { price: chartBC, color: "#8B5CF6", title: "BC" },
        ];

        cprLines.forEach(({ price, color, title }) => {
          try {
            const line = seriesRef.current.createPriceLine({
              price,
              color,
              lineWidth: 1,
              lineStyle: 2,
              axisLabelVisible: true,
              title,
            });
            cprLinesRef.current.push(line);
          } catch (err) {
            console.warn(
              "[LiveChart] Could not draw CPR line:",
              title,
              err.message,
            );
          }
        });
      }

      // Draw Support/Resistance lines
      if (analysis?.supportResistance) {
        const { pivot, R1, R2, R3, R4, R5, R6, S1, S2, S3, S4, S5, S6 } =
          analysis.supportResistance;

        const srLines = [
          { price: R6, color: "#7C2D12", title: "R6", style: 3 },
          { price: R5, color: "#991B1B", title: "R5", style: 3 },
          { price: R4, color: "#DC2626", title: "R4", style: 2 },
          { price: R3, color: "#F97316", title: "R3", style: 2 },
          { price: R2, color: "#FCD34D", title: "R2", style: 1 },
          { price: R1, color: "#84CC16", title: "R1", style: 1 },
          { price: pivot, color: "#3B82F6", title: "PP", style: 0 },
          { price: S1, color: "#4ADE80", title: "S1", style: 1 },
          { price: S2, color: "#34D399", title: "S2", style: 1 },
          { price: S3, color: "#0EA5E9", title: "S3", style: 2 },
          { price: S4, color: "#6366F1", title: "S4", style: 2 },
          { price: S5, color: "#7C3AED", title: "S5", style: 3 },
          { price: S6, color: "#581C87", title: "S6", style: 3 },
        ];

        srLines.forEach(({ price, color, title, style }) => {
          if (price) {
            try {
              const line = seriesRef.current.createPriceLine({
                price,
                color,
                lineWidth: style === 0 ? 2 : 1,
                lineStyle: style,
                axisLabelVisible: true,
                title,
              });
              srLinesRef.current.push(line);
            } catch (err) {
              console.warn(
                "[LiveChart] Could not draw S/R line:",
                title,
                err.message,
              );
            }
          }
        });
      }
    } catch (err) {
      console.error("[LiveChart] Error drawing levels:", err.message);
    }
  }, [analysis?.cpr, analysis?.supportResistance]);

  return (
    <div className="glass p-4 h-[500px] flex flex-col">
      {/* Timeframe tabs */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1">
          {TF_OPTIONS.map((tf) => (
            <button
              key={tf}
              onClick={() => onTimeframeChange(tf)}
              className={`px-3 py-1 text-xs font-medium rounded-lg transition-all ${
                timeframe === tf
                  ? "bg-brand-blue/20 text-brand-blue border border-brand-blue/30"
                  : "text-brand-muted hover:text-brand-text hover:bg-white/5"
              }`}
            >
              {tf.toUpperCase()}
            </button>
          ))}
        </div>

        {/* Candle Close Countdown */}
        <div className="flex items-center gap-3">
          <div
            className={`flex items-center gap-1.5 px-1.5 py-1.5 rounded-lg font-mono text-sm font-bold transition-all ${
              countdown <= 10
                ? "bg-brand-red/20 text-brand-red border border-brand-red/30 pulse-live"
                : "bg-brand-blue/20 text-brand-blue border border-brand-blue/30"
            }`}
          >
            <div
              className={`w-1.5 h-1.5 rounded-full ${countdown <= 10 ? "bg-brand-red pulse-live" : "bg-brand-blue"}`}
            />
            <span className="text-xs">
              Closes in: <span className="text-xs">{countdown}s</span>
            </span>
          </div>

          {triangleBadge && (
            <div
              className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-semibold tracking-wide ${triangleBadge.className}`}
            >
              <div className="w-1.5 h-1.5 rounded-full bg-current pulse-live" />
              <span>{triangleBadge.label}</span>
            </div>
          )}

          {/* AM Zone indicator */}
          {analysis?.amZone?.detected && (
            <div className="flex items-center gap-2 px-3 py-1 rounded-lg bg-brand-purple/10 border border-brand-purple/20">
              <div className="w-1.5 h-1.5 rounded-full bg-brand-purple pulse-live" />
              <span className="text-xs text-brand-purple font-medium">
                AM ZONE
              </span>
            </div>
          )}

          {analysis?.manipulation && (
            <div className="flex items-center gap-2 px-3 py-1 rounded-lg bg-brand-red/10 border border-brand-red/20">
              <span className="text-xs text-brand-red font-medium">
                ⚡ {analysis.manipulation.type.replace(/_/g, " ")}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Chart */}
      <div
        ref={chartContainerRef}
        className="flex-1 rounded-lg overflow-hidden"
      />
    </div>
  );
}

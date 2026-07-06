import { useState, useEffect, useCallback, useRef } from "react";
import { useWebSocket } from "./hooks/useWebSocket";
import Header from "./components/Header";
import MarketStatusBanner from "./components/MarketStatusBanner";
import LiveChart from "./components/LiveChart";
import DecisionCard from "./components/DecisionCard";
import SignalCard from "./components/SignalCard";
import PnLCard from "./components/PnLCard";
import CPRPanel from "./components/CPRPanel";
import OptionsPanel from "./components/OptionsPanel";
import OptionStrikeChart from "./components/OptionStrikeChart";
import OptionTradeCard from "./components/OptionTradeCard";
import TradeJournal from "./components/TradeJournal";
import ScoreCard from "./components/ScoreCard";
import PnLAnalysisPage from "./components/PnLAnalysisPage";
import { motion, AnimatePresence } from "framer-motion";
import soundManager from "./utils/soundManager";

export default function App() {
  const ws = useWebSocket();
  const [timeframe, setTimeframe] = useState("5m");
  const [viewMode, setViewMode] = useState("MAIN");
  const [journal, setJournal] = useState({ trades: [], stats: {} });
  const [showPnLAnalysis, setShowPnLAnalysis] = useState(false);
  const [optionChartSelection, setOptionChartSelection] = useState(null);
  const lastSignalRef = useRef(null);
  const lastTradeEventRef = useRef(null);
  const optionTrade = ws.analysis?.optionTrade || ws.optionTrade || null;
  const decision = ws.analysis?.decision || null;

  const handleOpenOptionChart = useCallback((selection) => {
    setOptionChartSelection(selection || ws.analysis?.strikeSelection || optionTrade?.strikeSelection || null);
  }, [optionTrade?.strikeSelection, ws.analysis?.strikeSelection]);

  const handleSymbolChange = useCallback(
    (symbol) => {
      console.log("[App] Symbol changed:", symbol);
      // Send symbol change message to backend via WebSocket
      if (ws.ws && ws.ws.readyState === WebSocket.OPEN) {
        ws.ws.send(
          JSON.stringify({
            type: "CHANGE_SYMBOL",
            data: {
              symbol: symbol.value,
              token: symbol.token,
              exchange: symbol.exchange,
              label: symbol.label,
            },
          }),
        );
        console.log("[App] Symbol change request sent to backend");
      }
    },
    [ws.ws],
  );

  const fetchJournal = useCallback(async () => {
    try {
      const res = await fetch("/api/journal");
      const data = await res.json();
      setJournal(data);
    } catch {
      // API not available yet
    }
  }, []);

  const handleExitAllPositions = useCallback(async () => {
    const confirmed = window.confirm(
      "Exit all positions now? This will close the active trade.",
    );

    if (!confirmed) return;

    try {
      const res = await fetch("/api/trade/close", {
        method: "POST",
      });

      if (!res.ok) {
        throw new Error("Failed to close active trade");
      }

      await fetchJournal();
    } catch (err) {
      console.error("[App] Failed to close active trade:", err);
      window.alert("Unable to exit positions right now. Please try again.");
    }
  }, [fetchJournal]);

  const handleAdjustStopLoss = useCallback(
    async (stopLoss) => {
      try {
        const res = await fetch("/api/trade/stop-loss", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ stopLoss }),
        });

        const payload = await res.json();

        if (!res.ok) {
          throw new Error(payload?.error || "Failed to update stop loss");
        }

        if (payload?.trade && ws.updateActiveTrade) {
          ws.updateActiveTrade(payload.trade);
        }
      } catch (err) {
        console.error("[App] Failed to update stop loss:", err);
        window.alert("Unable to update stop loss right now. Please try again.");
        throw err;
      }
    },
    [ws],
  );

  useEffect(() => {
    fetchJournal();
    // Fetch journal more frequently (every 5 seconds) to keep it in sync
    const iv = setInterval(fetchJournal, 5000);
    return () => clearInterval(iv);
  }, [fetchJournal]);

  // Refetch journal when connection is restored
  useEffect(() => {
    if (ws.connected) {
      console.log("[App] Connection restored, refreshing journal...");
      fetchJournal();
    }
  }, [ws.connected, fetchJournal]);

  // Sound notifications for signals
  useEffect(() => {
    const currentSignal = ws.signal || ws.analysis?.signal;
    if (!currentSignal) return;

    // Compare signal by grade and type, not object reference
    const signalKey = `${currentSignal.type}_${currentSignal.grade}`;
    const lastSignalKey = lastSignalRef.current
      ? `${lastSignalRef.current.type}_${lastSignalRef.current.grade}`
      : null;

    if (signalKey && signalKey !== lastSignalKey) {
      soundManager.playSignal();
      lastSignalRef.current = currentSignal;
      console.log("[Sound] 🔔 New signal alert:", signalKey);
    }
  }, [ws.signal, ws.analysis?.signal]);

  // Sound notifications for trade events
  useEffect(() => {
    const eventKey = ws.tradeEvent?.timestamp;
    if (!eventKey || eventKey === lastTradeEventRef.current) return;

    lastTradeEventRef.current = eventKey;

    if (ws.tradeEvent?.event === "TARGET_HIT") {
      soundManager.playTarget();
      console.log("[Sound] ✅ 🎯 Target hit", ws.tradeEvent.targetLabel || "");
      fetchJournal();
      return;
    }

    if (ws.tradeEvent?.event === "CLOSED") {
      const reason = ws.tradeEvent.trade?.reason;
      const pnl = ws.tradeEvent.trade?.pnl || 0;

      if (reason === "STOP_LOSS") {
        soundManager.playStopLoss();
      } else if (reason === "TARGET_HIT" || reason === "EXIT_SIGNAL") {
        soundManager.playTarget();
      } else if (reason === "MARKET_CLOSED") {
        if (pnl >= 0) {
          soundManager.playTarget();
        } else {
          soundManager.playStopLoss();
        }
      } else if (reason === "MANUAL") {
        if (pnl >= 0) {
          soundManager.playTarget();
        } else {
          soundManager.playStopLoss();
        }
      }

      fetchJournal();
    }
  }, [ws.tradeEvent, fetchJournal]);

  return (
    <>
      <div className="min-h-screen bg-brand-bg">
        <Header
          connected={ws.connected}
          price={ws.price}
          onPnLClick={() => setShowPnLAnalysis(true)}
          onSymbolChange={handleSymbolChange}
        />
        <MarketStatusBanner connected={ws.connected} />

        <main className="max-w-[1920px] mx-auto px-4 pb-6 pt-2">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex rounded-xl border border-brand-border bg-brand-card/70 p-1 shadow-lg">
              {[
                { id: "MAIN", label: "Main" },
                { id: "OPTION", label: "Option" },
                { id: "REPLAY", label: "Replay" },
                { id: "JOURNAL", label: "Journal" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setViewMode(tab.id)}
                  className={`rounded-lg px-4 py-2 text-xs font-semibold uppercase tracking-wider transition-colors ${
                    viewMode === tab.id
                      ? "bg-brand-blue/15 text-brand-blue border border-brand-blue/25"
                      : "text-brand-muted hover:text-brand-text"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <div className="text-xs font-mono text-brand-muted">
              {decision
                ? `${decision.market} ${decision.bias} ${decision.action} ${decision.confidence}%`
                : "Waiting for decision"}
            </div>
          </div>

          {/* Top Row: Chart + Decision */}
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-4">
            {/* Chart - takes 3 cols */}
            <div className="lg:col-span-3">
              {viewMode === "OPTION" ? (
                <OptionStrikeChart
                  selection={ws.analysis?.strikeSelection || optionChartSelection}
                  trade={ws.activeTrade || optionTrade}
                  signal={optionTrade || ws.analysis?.signal || ws.signal}
                  currentPrice={ws.price}
                  onClose={() => setViewMode("MAIN")}
                />
              ) : viewMode === "REPLAY" ? (
                <TradingViewWidget symbol="NSE:NIFTY" interval="1" height={650} />
              ) : viewMode === "JOURNAL" ? (
                <div className="glass p-4 h-full min-h-[650px] overflow-hidden">
                  <TradeJournal trades={journal.trades} stats={journal.stats} />
                </div>
              ) : (
                <LiveChart
                  candles={ws.candles[timeframe] || []}
                  timeframe={timeframe}
                  onTimeframeChange={setTimeframe}
                  analysis={ws.analysis}
                  closingSeconds={ws.closingSeconds || 0}
                />
              )}
            </div>

            {/* Right Sidebar */}
            <div className="flex flex-col gap-4">
              <AnimatePresence mode="wait">
                {decision ? (
                  <motion.div
                    key="signal"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                  >
                    <DecisionCard
                      decision={decision}
                      strikeSelection={ws.analysis?.strikeSelection}
                      onOpenOptionChart={() => handleOpenOptionChart(ws.analysis?.strikeSelection || optionTrade?.strikeSelection)}
                    />
                  </motion.div>
                ) : ws.analysis?.signal || ws.signal ? (
                  <motion.div
                    key="signal"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                  >
                    <SignalCard
                      signal={ws.signal || ws.analysis?.signal}
                      scoring={ws.analysis?.scoring}
                    />
                  </motion.div>
                ) : (
                  <motion.div
                    key="score"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                  >
                    <ScoreCard scoring={ws.analysis?.scoring} />
                  </motion.div>
                )}
              </AnimatePresence>

              <OptionTradeCard
                optionTrade={optionTrade}
                onOpenOptionChart={() => handleOpenOptionChart(optionTrade?.strikeSelection || ws.analysis?.strikeSelection)}
              />

              <PnLCard
                trade={ws.activeTrade}
                onExitAllPositions={handleExitAllPositions}
                onAdjustStopLoss={handleAdjustStopLoss}
              />
            </div>
          </div>

          {/* Bottom Row: CPR + Options + Journal */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <CPRPanel
              cpr={ws.analysis?.cpr}
              bias={ws.analysis?.bias}
              price={ws.price}
              cprWidthDesc={ws.analysis?.cprWidthDesc}
            />

            <OptionsPanel
              strikes={optionTrade?.strikes || (ws.signal || ws.analysis?.signal)?.strikes}
              signalType={optionTrade?.type || ws.signal?.type || ws.analysis?.signal?.type}
              currentPrice={ws.price}
              onOpenOptionChart={handleOpenOptionChart}
            />

            <div className="lg:col-span-2">
              <TradeJournal trades={journal.trades} stats={journal.stats} />
            </div>
          </div>
        </main>
      </div>

      {/* P&L Analysis Modal */}
      <AnimatePresence>
        {showPnLAnalysis && (
          <PnLAnalysisPage onClose={() => setShowPnLAnalysis(false)} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {optionChartSelection && (
          <OptionStrikeChart
            selection={optionChartSelection}
            trade={ws.activeTrade || optionTrade}
            signal={optionTrade || ws.signal || ws.analysis?.signal}
            currentPrice={ws.price}
            onClose={() => setOptionChartSelection(null)}
          />
        )}
      </AnimatePresence>
    </>
  );
}

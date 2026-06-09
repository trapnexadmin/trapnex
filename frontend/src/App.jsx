import { useState, useEffect, useCallback, useRef } from 'react';
import { useWebSocket } from './hooks/useWebSocket';
import Header from './components/Header';
import MarketStatusBanner from './components/MarketStatusBanner';
import LiveChart from './components/LiveChart';
import SignalCard from './components/SignalCard';
import PnLCard from './components/PnLCard';
import CPRPanel from './components/CPRPanel';
import OptionsPanel from './components/OptionsPanel';
import TradeJournal from './components/TradeJournal';
import ScoreCard from './components/ScoreCard';
import PnLAnalysisPage from './components/PnLAnalysisPage';
import { motion, AnimatePresence } from 'framer-motion';
import soundManager from './utils/soundManager';

export default function App() {
  const ws = useWebSocket();
  const [timeframe, setTimeframe] = useState('5m');
  const [journal, setJournal] = useState({ trades: [], stats: {} });
  const [showPnLAnalysis, setShowPnLAnalysis] = useState(false);
  const lastSignalRef = useRef(null);
  const lastTradeStatusRef = useRef(null);

  const handleSymbolChange = useCallback((symbol) => {
    console.log('[App] Symbol changed:', symbol);
    // Send symbol change message to backend via WebSocket
    if (ws.ws && ws.ws.readyState === WebSocket.OPEN) {
      ws.ws.send(JSON.stringify({
        type: 'CHANGE_SYMBOL',
        data: {
          symbol: symbol.value,
          token: symbol.token,
          exchange: symbol.exchange,
          label: symbol.label
        }
      }));
      console.log('[App] Symbol change request sent to backend');
    }
  }, [ws.ws]);

  const fetchJournal = useCallback(async () => {
    try {
      const res = await fetch('/api/journal');
      const data = await res.json();
      setJournal(data);
    } catch {
      // API not available yet
    }
  }, []);

  useEffect(() => {
    fetchJournal();
    const iv = setInterval(fetchJournal, 10000);
    return () => clearInterval(iv);
  }, [fetchJournal]);

  // Sound notifications for signals
  useEffect(() => {
    const currentSignal = ws.signal || ws.analysis?.signal;
    if (currentSignal && currentSignal !== lastSignalRef.current) {
      soundManager.playSignal();
      lastSignalRef.current = currentSignal;
      console.log('[Sound] 🔔 New signal alert');
    }
  }, [ws.signal, ws.analysis?.signal]);

  // Sound notifications for trade status changes
  useEffect(() => {
    if (!ws.activeTrade) {
      // Trade closed - check if it was target or stop loss
      if (lastTradeStatusRef.current?.status === 'OPEN') {
        // Trade just closed, check the journal for the result
        const lastTrade = journal.trades[0];
        if (lastTrade) {
          if (lastTrade.reason === 'TARGET_HIT') {
            soundManager.playTarget();
            console.log('[Sound] 🎯 Target hit!');
          } else if (lastTrade.reason === 'STOP_LOSS') {
            soundManager.playStopLoss();
            console.log('[Sound] 🛑 Stop loss hit');
          }
        }
      }
      lastTradeStatusRef.current = null;
    } else {
      lastTradeStatusRef.current = ws.activeTrade;
    }
  }, [ws.activeTrade, journal.trades]);

  return (
    <>
      <div className="min-h-screen bg-brand-bg">
        <Header 
          connected={ws.connected} 
          price={ws.price}
          onPnLClick={() => setShowPnLAnalysis(true)}
          onSymbolChange={handleSymbolChange}
        />
        <MarketStatusBanner />

        <main className="max-w-[1920px] mx-auto px-4 pb-6 pt-2">
        {/* Top Row: Chart + Signal */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-4">
          {/* Chart - takes 3 cols */}
          <div className="lg:col-span-3">
            <LiveChart
              candles={ws.candles[timeframe] || []}
              timeframe={timeframe}
              onTimeframeChange={setTimeframe}
              analysis={ws.analysis}
              closingSeconds={ws.closingSeconds || 0}
            />
          </div>

          {/* Right Sidebar */}
          <div className="flex flex-col gap-4">
            <AnimatePresence mode="wait">
              {ws.analysis?.signal || ws.signal ? (
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

            <PnLCard trade={ws.activeTrade} />
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
            strikes={ws.analysis?.signal?.strikes}
            signalType={ws.signal?.type || ws.analysis?.signal?.type}
            currentPrice={ws.price}
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
    </>
  );
}

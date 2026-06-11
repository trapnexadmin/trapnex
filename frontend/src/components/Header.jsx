import { motion } from "framer-motion";
import { useState, useEffect } from "react";
import soundManager from "../utils/soundManager";

const SYMBOLS = [
  { value: "NIFTY", label: "NIFTY 50", token: "99926000", exchange: "NSE" },
  // { value: 'SENSEX', label: 'SENSEX', token: '99919000', exchange: 'BSE' },
  // { value: 'CRUDEOIL', label: 'CRUDE OIL', token: '260105', exchange: 'MCX' },
];

export default function Header({
  connected,
  price,
  onPnLClick,
  onSymbolChange,
}) {
  const [selectedSymbol, setSelectedSymbol] = useState(SYMBOLS[0]);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isMuted, setIsMuted] = useState(!soundManager.enabled);
  const [isLight, setIsLight] = useState(() => {
    return document.body.classList.contains("light");
  });

  const toggleTheme = () => {
    const newLight = !isLight;
    setIsLight(newLight);
    if (newLight) {
      document.body.classList.add("light");
      localStorage.setItem("trapnex-theme", "light");
    } else {
      document.body.classList.remove("light");
      localStorage.setItem("trapnex-theme", "dark");
    }
  };

  useEffect(() => {
    const saved = localStorage.getItem("trapnex-theme");
    if (saved === "light") {
      document.body.classList.add("light");
      setIsLight(true);
    }
  }, []);

  const handleSymbolChange = (symbol) => {
    setSelectedSymbol(symbol);
    setIsDropdownOpen(false);
    if (onSymbolChange) {
      onSymbolChange(symbol);
    }
  };

  return (
    <header
      className="glass border-b border-brand-border sticky top-0 z-50"
      style={{ borderRadius: 0 }}
    >
      <div className="max-w-[1920px] mx-auto px-4 py-3 flex items-center justify-between">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 flex items-center justify-center">
            <svg viewBox="0 0 100 100" className="w-full h-full">
              <defs>
                <linearGradient id="hg" x1="0%" y1="100%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#22FF88" />
                  <stop offset="100%" stopColor="#3B82F6" />
                </linearGradient>
              </defs>
              <path
                d="M15 20 L42 48 L15 80"
                stroke="url(#hg)"
                strokeWidth="7"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M85 20 L58 48 L85 80"
                stroke="url(#hg)"
                strokeWidth="7"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <span className="text-lg font-semibold tracking-[0.2em] text-gray-200">
            TRAPNEX
          </span>
        </div>

        {/* Center: Symbol Selector + Live Price */}
        <div className="hidden md:flex items-center gap-4">
          {/* Symbol Dropdown */}
          <div className="relative">
            <button
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              className="flex items-center gap-2 px-3 py-1.5 bg-brand-dark/50 hover:bg-brand-dark/70 border border-brand-border rounded-lg transition-all"
            >
              <span className="text-sm text-brand-muted">
                {selectedSymbol.label}
              </span>
              <svg
                className="w-4 h-4 text-brand-muted"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>

            {isDropdownOpen && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="absolute top-full mt-2 left-0 w-48 bg-brand-dark border border-brand-border rounded-lg shadow-xl overflow-hidden z-50"
              >
                {SYMBOLS.map((symbol) => (
                  <button
                    key={symbol.value}
                    onClick={() => handleSymbolChange(symbol)}
                    className={`w-full px-4 py-2.5 text-left text-sm transition-colors ${
                      selectedSymbol.value === symbol.value
                        ? "bg-brand-blue/20 text-brand-blue"
                        : "text-gray-300 hover:bg-brand-border/30"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{symbol.label}</span>
                      <span className="text-xs text-brand-muted">
                        {symbol.exchange}
                      </span>
                    </div>
                  </button>
                ))}
              </motion.div>
            )}
          </div>

          <span className="text-xl font-mono font-semibold tabular-nums">
            {price
              ? price.toLocaleString("en-IN", { minimumFractionDigits: 2 })
              : "—"}
          </span>
        </div>

        {/* Right: Status + P&L Button */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <motion.div
              className={`w-2 h-2 rounded-full ${
                connected ? "bg-brand-green" : "bg-brand-red"
              }`}
              animate={{ opacity: connected ? [1, 0.4, 1] : 1 }}
              transition={{ repeat: Infinity, duration: 2 }}
            />
            <span className="text-xs text-brand-muted">
              {connected ? "LIVE" : "OFFLINE"}
            </span>
          </div>
          <div className="text-xs text-brand-muted font-mono">
            {new Date().toLocaleTimeString("en-IN", { hour12: false })}
          </div>

          {/* Mute/Unmute Button */}
          <button
            onClick={() => {
              const newState = soundManager.toggle();
              setIsMuted(!newState);
              console.log(`[Sound] ${newState ? "Enabled" : "Muted"}`);
            }}
            className="p-2 bg-brand-dark/50 hover:bg-brand-dark/70 border border-brand-border rounded-lg transition-all group"
            title={isMuted ? "Unmute sounds" : "Mute sounds"}
          >
            {isMuted ? (
              // Muted icon
              <svg
                className="w-4 h-4 text-brand-muted group-hover:text-brand-text transition-colors"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2"
                />
              </svg>
            ) : (
              // Unmuted icon
              <svg
                className="w-4 h-4 text-brand-green group-hover:text-brand-text transition-colors"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
                />
              </svg>
            )}
          </button>

          {/* Theme Toggle */}
          <button
            onClick={toggleTheme}
            className="p-2 bg-brand-dark/50 hover:bg-brand-dark/70 border border-brand-border rounded-lg transition-all group"
            title={isLight ? "Switch to dark mode" : "Switch to light mode"}
          >
            {isLight ? (
              <svg className="w-4 h-4 text-brand-muted group-hover:text-brand-text" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
              </svg>
            ) : (
              <svg className="w-4 h-4 text-yellow-400 group-hover:text-yellow-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            )}
          </button>

          {/* P&L Analysis Button */}
          <button
            onClick={onPnLClick}
            className="px-3 py-1.5 bg-brand-blue/20 hover:bg-brand-blue/30 border border-brand-blue/30 rounded-lg text-xs font-semibold text-brand-blue transition-all flex items-center gap-2"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
              />
            </svg>
            P&L
          </button>
        </div>
      </div>
    </header>
  );
}

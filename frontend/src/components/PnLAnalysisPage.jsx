import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

function normalizeTrade(trade) {
  if (!trade) return null;

  const entryPrice = trade.entryPrice ?? trade.entry?.price ?? trade.entry ?? 0;
  const entryTime = trade.entryTime ?? trade.entry?.time ?? trade.openTime ?? trade.createdAt ?? null;
  const exitPrice = trade.exitPrice ?? trade.exit?.price ?? trade.target ?? null;
  const pnl = typeof trade.pnl === "number" ? trade.pnl : trade.pnl?.points ?? 0;

  return {
    ...trade,
    entryPrice,
    entryTime,
    exitPrice,
    pnl,
    result:
      trade.result || (pnl > 0 ? "WIN" : pnl < 0 ? "LOSS" : null),
  };
}

function normalizeStats(stats) {
  return {
    totalTrades: stats?.totalTrades ?? stats?.total ?? 0,
    wins: stats?.wins ?? 0,
    losses: stats?.losses ?? 0,
    winRate: stats?.winRate ?? 0,
    totalPnL: stats?.totalPnL ?? 0,
    avgPnL: stats?.avgPnl ?? 0,
    bestTrade: stats?.bestTrade ?? 0,
    worstTrade: stats?.worstTrade ?? 0,
    maxDrawdown: stats?.maxDrawdown ?? 0,
  };
}

export default function PnLAnalysisPage({ onClose }) {
  const [data, setData] = useState({
    trades: [],
    stats: null,
    signals: [],
  });
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all"); // all, call, put, win, loss
  const [dateRange, setDateRange] = useState("all"); // all, today, week, month, custom
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");

  useEffect(() => {
    fetchData();
  }, [dateRange, customStartDate, customEndDate]);

  const getDateRangeParams = () => {
    const now = new Date();
    let startDate, endDate;

    switch (dateRange) {
      case "today":
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        endDate = now;
        break;
      case "week":
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        endDate = now;
        break;
      case "month":
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        endDate = now;
        break;
      case "custom":
        if (customStartDate) startDate = new Date(customStartDate);
        if (customEndDate) endDate = new Date(customEndDate);
        break;
      default:
        return "";
    }

    const params = new URLSearchParams();
    if (startDate) params.append("startDate", startDate.toISOString());
    if (endDate) params.append("endDate", endDate.toISOString());
    return params.toString() ? `?${params.toString()}` : "";
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      const dateParams = getDateRangeParams();

      const [tradesRes, signalsRes, statsRes] = await Promise.all([
        fetch(`/api/db/trades${dateParams}`).then((r) => r.json()),
        fetch("/api/db/signals?limit=50").then((r) => r.json()),
        fetch(`/api/db/trades/stats${dateParams}`).then((r) => r.json()),
      ]);

      console.log("[PnL Analysis] Loaded:", {
        trades: tradesRes.length || 0,
        signals: signalsRes?.signals?.length || signalsRes?.length || 0,
        stats: statsRes,
      });

      setData({
        trades: (tradesRes || []).map(normalizeTrade).filter(Boolean),
        signals: signalsRes?.signals || signalsRes || [],
        stats: normalizeStats(statsRes || null),
      });
    } catch (err) {
      console.error("[PnL Analysis] Failed to load data:", err);
    } finally {
      setLoading(false);
    }
  };

  const filteredTrades = data.trades.filter((trade) => {
    if (filter === "all") return true;
    if (filter === "call") return trade.type === "CALL";
    if (filter === "put") return trade.type === "PUT";
    if (filter === "win") return trade.result === "WIN";
    if (filter === "loss") return trade.result === "LOSS";
    return true;
  });

  const stats = data.stats || {
    totalTrades: 0,
    wins: 0,
    losses: 0,
    winRate: 0,
    totalPnL: 0,
    avgPnL: 0,
    bestTrade: 0,
    worstTrade: 0,
    maxDrawdown: 0,
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 overflow-auto"
      onClick={onClose}
    >
      <div
        className="min-h-screen max-w-7xl mx-auto px-4 py-8"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-brand-text mb-1">
              P&L Analysis
            </h1>
            <p className="text-brand-muted">
              Complete performance metrics and trade history
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 flex items-center justify-center rounded-lg bg-brand-card hover:bg-brand-card-hover transition-colors"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {loading ? (
          <div className="glass p-8 text-center">
            <div className="inline-block w-8 h-8 border-4 border-brand-blue border-t-transparent rounded-full animate-spin mb-4"></div>
            <p className="text-brand-muted">Loading analysis...</p>
          </div>
        ) : (
          <>
            {/* Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="glass p-4">
                <div className="text-sm text-brand-muted mb-1">Total P&L</div>
                <div
                  className={`text-2xl font-bold ${stats.totalPnL >= 0 ? "text-brand-green" : "text-brand-red"}`}
                >
                  ₹{stats.totalPnL?.toFixed(2) || "0.00"}
                </div>
              </div>

              <div className="glass p-4">
                <div className="text-sm text-brand-muted mb-1">Win Rate</div>
                <div className="text-2xl font-bold text-brand-blue">
                  {stats.winRate?.toFixed(1) || "0.0"}%
                </div>
                <div className="text-xs text-brand-muted mt-1">
                  {stats.wins || 0}W / {stats.losses || 0}L
                </div>
              </div>

              <div className="glass p-4">
                <div className="text-sm text-brand-muted mb-1">Avg P&L</div>
                <div
                  className={`text-2xl font-bold ${stats.avgPnL >= 0 ? "text-brand-green" : "text-brand-red"}`}
                >
                  ₹{stats.avgPnL?.toFixed(2) || "0.00"}
                </div>
              </div>

              <div className="glass p-4">
                <div className="text-sm text-brand-muted mb-1">
                  Total Trades
                </div>
                <div className="text-2xl font-bold text-brand-text">
                  {stats.totalTrades || 0}
                </div>
              </div>

              <div className="glass p-4">
                <div className="text-sm text-brand-muted mb-1">Best Trade</div>
                <div className="text-xl font-bold text-brand-green">
                  +₹{stats.bestTrade?.toFixed(2) || "0.00"}
                </div>
              </div>

              <div className="glass p-4">
                <div className="text-sm text-brand-muted mb-1">Worst Trade</div>
                <div className="text-xl font-bold text-brand-red">
                  -₹{Math.abs(stats.worstTrade || 0).toFixed(2)}
                </div>
              </div>

              <div className="glass p-4">
                <div className="text-sm text-brand-muted mb-1">
                  Max Drawdown
                </div>
                <div className="text-xl font-bold text-brand-red">
                  -₹{Math.abs(stats.maxDrawdown || 0).toFixed(2)}
                </div>
              </div>

              <div className="glass p-4">
                <div className="text-sm text-brand-muted mb-1">
                  Signals Generated
                </div>
                <div className="text-xl font-bold text-brand-purple">
                  {data.signals.length}
                </div>
              </div>
            </div>

            {/* Date Range Filter */}
            <div className="glass p-4 mb-4">
              <div className="flex items-center gap-4 flex-wrap">
                <div className="text-sm font-medium text-brand-muted">
                  Date Range:
                </div>
                <div className="flex gap-2 flex-wrap flex-1">
                  {["all", "today", "week", "month", "custom"].map((range) => (
                    <button
                      key={range}
                      onClick={() => setDateRange(range)}
                      className={`px-3 py-1.5 text-xs font-medium rounded transition-all ${
                        dateRange === range
                          ? "bg-brand-blue/20 text-brand-blue border border-brand-blue/30"
                          : "text-brand-muted hover:text-brand-text hover:bg-white/5 border border-transparent"
                      }`}
                    >
                      {range === "all"
                        ? "All Time"
                        : range.charAt(0).toUpperCase() + range.slice(1)}
                    </button>
                  ))}
                </div>

                {dateRange === "custom" && (
                  <div className="flex items-center gap-2">
                    <input
                      type="date"
                      value={customStartDate}
                      onChange={(e) => setCustomStartDate(e.target.value)}
                      className="px-3 py-1.5 text-xs bg-brand-card border border-brand-border rounded text-brand-text"
                    />
                    <span className="text-brand-muted">to</span>
                    <input
                      type="date"
                      value={customEndDate}
                      onChange={(e) => setCustomEndDate(e.target.value)}
                      className="px-3 py-1.5 text-xs bg-brand-card border border-brand-border rounded text-brand-text"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Filters */}
            <div className="glass p-4 mb-4">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm text-brand-muted mr-2">Filter:</span>
                {["all", "call", "put", "win", "loss"].map((f) => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={`px-3 py-1 text-xs font-medium rounded-lg transition-all ${
                      filter === f
                        ? "bg-brand-blue/20 text-brand-blue border border-brand-blue/30"
                        : "text-brand-muted hover:text-brand-text hover:bg-white/5"
                    }`}
                  >
                    {f.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            {/* Trades Table */}
            <div className="glass overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-brand-card-hover border-b border-brand-border">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-brand-muted uppercase">
                        Time
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-brand-muted uppercase">
                        Type
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-brand-muted uppercase">
                        Entry
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-brand-muted uppercase">
                        Exit
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-brand-muted uppercase">
                        P&L
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-brand-muted uppercase">
                        Grade
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-brand-muted uppercase">
                        Result
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-brand-border/50">
                    {filteredTrades.length === 0 ? (
                      <tr>
                        <td
                          colSpan={7}
                          className="px-4 py-8 text-center text-brand-muted"
                        >
                          No trades found
                        </td>
                      </tr>
                    ) : (
                      filteredTrades.map((trade, idx) => (
                        <tr
                          key={idx}
                          className="hover:bg-white/5 transition-colors"
                        >
                          <td className="px-4 py-3 text-sm text-brand-muted">
                            {trade.entryTime
                              ? new Date(trade.entryTime).toLocaleString(
                              "en-IN",
                              {
                                dateStyle: "short",
                                timeStyle: "short",
                              },
                            )
                              : "—"}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                                trade.type === "CALL"
                                  ? "bg-brand-green/20 text-brand-green"
                                  : "bg-brand-red/20 text-brand-red"
                              }`}
                            >
                              {trade.type}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-brand-text text-right font-mono">
                            {(trade.entryPrice || 0).toFixed(2)}
                          </td>
                          <td className="px-4 py-3 text-sm text-brand-text text-right font-mono">
                            {trade.exitPrice != null ? trade.exitPrice.toFixed(2) : "—"}
                          </td>
                          <td
                            className={`px-4 py-3 text-sm text-right font-mono font-semibold ${
                              (trade.pnl || 0) >= 0
                                ? "text-brand-green"
                                : "text-brand-red"
                            }`}
                          >
                            {(trade.pnl || 0) >= 0 ? "+" : ""}
                            {(trade.pnl || 0).toFixed(2)}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold ${
                                trade.grade === "A+" || trade.grade === "A"
                                  ? "bg-brand-green/20 text-brand-green"
                                  : trade.grade === "B+" || trade.grade === "B"
                                    ? "bg-brand-blue/20 text-brand-blue"
                                    : "bg-gray-500/20 text-gray-400"
                              }`}
                            >
                              {trade.grade || "N/A"}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            {trade.result === "WIN" ? (
                              <span className="inline-flex items-center text-brand-green">
                                <svg
                                  className="w-5 h-5"
                                  fill="currentColor"
                                  viewBox="0 0 20 20"
                                >
                                  <path
                                    fillRule="evenodd"
                                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                                    clipRule="evenodd"
                                  />
                                </svg>
                              </span>
                            ) : (
                              <span className="inline-flex items-center text-brand-red">
                                <svg
                                  className="w-5 h-5"
                                  fill="currentColor"
                                  viewBox="0 0 20 20"
                                >
                                  <path
                                    fillRule="evenodd"
                                    d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                                    clipRule="evenodd"
                                  />
                                </svg>
                              </span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </motion.div>
  );
}

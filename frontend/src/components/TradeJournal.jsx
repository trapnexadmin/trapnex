import { useState, useMemo } from 'react';

function getEntryPrice(trade) {
  return trade.entryPrice ?? trade.entry?.price ?? trade.entry ?? 0;
}

function getExitPrice(trade) {
  return trade.exitPrice ?? trade.exit?.price ?? null;
}

function getTradeTime(trade) {
  return trade.entryTime ?? trade.entry?.time ?? trade.timestamp ?? trade.openTime ?? trade.createdAt ?? null;
}

function getTradePnl(trade) {
  return typeof trade.pnl === 'number' ? trade.pnl : trade.pnl?.points ?? 0;
}

export default function TradeJournal({ trades = [], stats = {} }) {
  const [tab, setTab] = useState('trades');
  const [filter, setFilter] = useState('all'); // all, call, put, win, loss

  // Filter trades based on selected filter
  const filteredTrades = useMemo(() => {
    if (filter === 'all') return trades;
    if (filter === 'call') return trades.filter(t => t.type === 'CALL');
    if (filter === 'put') return trades.filter(t => t.type === 'PUT');
    if (filter === 'win') return trades.filter(t => t.result === 'WIN');
    if (filter === 'loss') return trades.filter(t => t.result === 'LOSS');
    return trades;
  }, [trades, filter]);

  return (
    <div className="glass p-5 h-full flex flex-col">
      {/* Header with tabs */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium text-brand-muted uppercase tracking-wider">
          Trade Journal
        </span>
        <div className="flex gap-1">
          <TabBtn active={tab === 'trades'} onClick={() => setTab('trades')}>
            History
          </TabBtn>
          <TabBtn active={tab === 'stats'} onClick={() => setTab('stats')}>
            Stats
          </TabBtn>
        </div>
      </div>

      {/* Filters (only show in trades tab) */}
      {tab === 'trades' && trades.length > 0 && (
        <div className="mb-3 flex items-center gap-1 flex-wrap">
          {['all', 'call', 'put', 'win', 'loss'].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-2 py-1 text-[10px] font-medium rounded transition-all ${
                filter === f
                  ? 'bg-brand-blue/20 text-brand-blue border border-brand-blue/30'
                  : 'text-brand-muted hover:text-brand-text hover:bg-white/5 border border-transparent'
              }`}
            >
              {f.toUpperCase()}
            </button>
          ))}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {tab === 'trades' ? (
          <TradeList trades={filteredTrades} filter={filter} />
        ) : (
          <StatsView stats={stats} />
        )}
      </div>
    </div>
  );
}

function TradeList({ trades, filter }) {
  if (!trades.length) {
    return (
      <div className="text-center py-8">
        <span className="text-brand-muted text-sm">
          {filter === 'all' ? 'No trades yet' : `No ${filter} trades`}
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-2 h-full overflow-y-auto pr-1 custom-scrollbar">
      {trades.map((trade, i) => (
        <div
          key={trade.id || i}
          className="flex items-center justify-between py-2.5 px-3 rounded-lg bg-white/[0.02] border border-transparent hover:bg-white/[0.04] hover:border-brand-border/30 transition-all group"
        >
          <div className="flex items-center gap-3">
            <div
              className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold ${
                trade.type === 'CALL'
                  ? 'bg-brand-green/10 text-brand-green'
                  : 'bg-brand-red/10 text-brand-red'
              }`}
            >
              {trade.type === 'CALL' ? 'C' : 'P'}
            </div>
            <div>
              <div className="text-xs font-medium flex items-center gap-2">
                <span>{getEntryPrice(trade).toFixed(2)} → {getExitPrice(trade)?.toFixed(2) || '—'}</span>
                {trade.score && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                    trade.grade === 'A+' || trade.grade === 'A'
                      ? 'bg-brand-green/20 text-brand-green'
                      : trade.grade === 'B+' || trade.grade === 'B'
                      ? 'bg-brand-blue/20 text-brand-blue'
                      : 'bg-gray-500/20 text-gray-400'
                  }`}>
                    {trade.grade}
                  </span>
                )}
              </div>
              <div className="text-[10px] text-brand-muted mt-0.5">
                {trade.reason || 'Active'}
                {getTradeTime(trade) && (
                  <> • {new Date(getTradeTime(trade)).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</>
                )}
              </div>
            </div>
          </div>

          <div className="text-right">
            <div
              className={`text-sm font-mono font-semibold tabular-nums ${
                trade.result === 'WIN' ? 'text-brand-green' : 
                trade.result === 'LOSS' ? 'text-brand-red' : 
                'text-brand-muted'
              }`}
            >
              {getTradePnl(trade) >= 0 ? '+' : ''}{getTradePnl(trade).toFixed(2)}
            </div>
            <div
              className={`text-[10px] font-medium ${
                trade.result === 'WIN' ? 'text-brand-green/70' : 
                trade.result === 'LOSS' ? 'text-brand-red/70' :
                'text-brand-muted/70'
              }`}
            >
              {trade.result || 'OPEN'}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function StatsView({ stats }) {
  if (!stats || stats.total === 0) {
    return (
      <div className="text-center py-8">
        <span className="text-brand-muted text-sm">No stats available</span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <StatRow label="Total Trades" value={stats.total} />
      <StatRow label="Wins" value={stats.wins} color="text-brand-green" />
      <StatRow label="Losses" value={stats.losses} color="text-brand-red" />
      <div className="pt-2 border-t border-brand-border">
        <StatRow
          label="Win Rate"
          value={`${stats.winRate || 0}%`}
          color={stats.winRate >= 50 ? 'text-brand-green' : 'text-brand-red'}
        />
      </div>
      <StatRow
        label="Total P&L"
        value={`${stats.totalPnl >= 0 ? '+' : ''}${stats.totalPnl?.toFixed(2) || '0.00'}`}
        color={stats.totalPnl >= 0 ? 'text-brand-green' : 'text-brand-red'}
      />
      <StatRow
        label="Avg P&L"
        value={`${stats.avgPnl >= 0 ? '+' : ''}${stats.avgPnl?.toFixed(2) || '0.00'}`}
        color={stats.avgPnl >= 0 ? 'text-brand-green' : 'text-brand-red'}
      />

      {/* Grade breakdown */}
      {stats.byGrade && Object.keys(stats.byGrade).length > 0 && (
        <div className="pt-2 border-t border-brand-border">
          <div className="text-[10px] text-brand-muted uppercase tracking-wider mb-2">
            By Grade
          </div>
          {Object.entries(stats.byGrade).map(([grade, data]) => (
            <div key={grade} className="flex items-center justify-between text-xs py-1">
              <span className="text-brand-muted">{grade}</span>
              <span className="font-mono text-brand-text">
                {data.wins}/{data.total} ({Math.round((data.wins / data.total) * 100)}%)
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatRow({ label, value, color = 'text-brand-text' }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-brand-muted">{label}</span>
      <span className={`text-sm font-mono font-semibold tabular-nums ${color}`}>
        {value}
      </span>
    </div>
  );
}

function TabBtn({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1 text-xs font-medium rounded-lg transition-all ${
        active
          ? 'bg-brand-blue/20 text-brand-blue border border-brand-blue/30'
          : 'text-brand-muted hover:text-brand-text hover:bg-white/5'
      }`}
    >
      {children}
    </button>
  );
}

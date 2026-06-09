import { useState, useEffect } from 'react';
import { isMarketOpen, getMarketStatusMessage } from '../utils/marketHours';

export default function MarketStatusBanner() {
  const [marketStatus, setMarketStatus] = useState(getMarketStatusMessage());

  useEffect(() => {
    // Update market status every second
    const interval = setInterval(() => {
      setMarketStatus(getMarketStatusMessage());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // Don't show banner if market is open
  if (marketStatus.status === 'OPEN') {
    return null;
  }

  return (
    <div className="bg-brand-red/20 border-b border-brand-red/30 px-4 py-3">
      <div className="flex items-center justify-center gap-3">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-brand-red animate-pulse" />
          <span className="text-brand-red font-semibold text-sm">
            MARKET CLOSED
          </span>
        </div>
        <span className="text-brand-muted text-sm">
          {marketStatus.message}
        </span>
        <span className="text-xs text-brand-muted/70">
          (Next session: 9:15 AM IST)
        </span>
      </div>
    </div>
  );
}

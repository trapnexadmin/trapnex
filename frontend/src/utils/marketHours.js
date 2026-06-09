/**
 * Market Hours Utilities
 * IST (UTC+5:30) market hours: 9:15 AM - 3:30 PM
 */

// Market timings in IST
const MARKET_OPEN_HOUR = 9;
const MARKET_OPEN_MINUTE = 15;
const MARKET_CLOSE_HOUR = 15;
const MARKET_CLOSE_MINUTE = 30;

/**
 * Convert current time to IST
 */
export function getISTDate(date = new Date()) {
  const istOffset = 5.5 * 60 * 60 * 1000; // IST is UTC+5:30
  return new Date(date.getTime() + istOffset);
}

/**
 * Check if market is currently open
 */
export function isMarketOpen(now = new Date()) {
  const istDate = getISTDate(now);
  const day = istDate.getUTCDay(); // 0 = Sunday, 6 = Saturday

  // Market closed on weekends
  if (day === 0 || day === 6) {
    return false;
  }

  const hours = istDate.getUTCHours();
  const minutes = istDate.getUTCMinutes();
  const totalMinutes = hours * 60 + minutes;

  const openMinutes = MARKET_OPEN_HOUR * 60 + MARKET_OPEN_MINUTE;
  const closeMinutes = MARKET_CLOSE_HOUR * 60 + MARKET_CLOSE_MINUTE;

  return totalMinutes >= openMinutes && totalMinutes < closeMinutes;
}

/**
 * Get time until market opens (in milliseconds)
 */
export function getTimeUntilMarketOpen(now = new Date()) {
  const istDate = getISTDate(now);
  let targetDate = new Date(istDate);

  // Set to market open time (9:15 AM IST)
  targetDate.setUTCHours(MARKET_OPEN_HOUR);
  targetDate.setUTCMinutes(MARKET_OPEN_MINUTE);
  targetDate.setUTCSeconds(0);
  targetDate.setUTCMilliseconds(0);

  // If already past market open today, set to next trading day
  if (istDate >= targetDate) {
    targetDate.setUTCDate(targetDate.getUTCDate() + 1);
  }

  // Skip weekends
  const day = targetDate.getUTCDay();
  if (day === 0) {
    // Sunday, skip to Monday
    targetDate.setUTCDate(targetDate.getUTCDate() + 1);
  } else if (day === 6) {
    // Saturday, skip to Monday
    targetDate.setUTCDate(targetDate.getUTCDate() + 2);
  }

  // Convert back to UTC
  const istOffset = 5.5 * 60 * 60 * 1000;
  return targetDate.getTime() - istOffset - now.getTime();
}

/**
 * Get time until market closes (in milliseconds)
 */
export function getTimeUntilMarketClose(now = new Date()) {
  const istDate = getISTDate(now);
  const targetDate = new Date(istDate);

  // Set to market close time (3:30 PM IST)
  targetDate.setUTCHours(MARKET_CLOSE_HOUR);
  targetDate.setUTCMinutes(MARKET_CLOSE_MINUTE);
  targetDate.setUTCSeconds(0);
  targetDate.setUTCMilliseconds(0);

  // Convert back to UTC
  const istOffset = 5.5 * 60 * 60 * 1000;
  return targetDate.getTime() - istOffset - now.getTime();
}

/**
 * Format time duration to human-readable string
 */
export function formatDuration(milliseconds) {
  const seconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days}d ${hours % 24}h`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

/**
 * Get market status message
 */
export function getMarketStatusMessage(now = new Date()) {
  if (isMarketOpen(now)) {
    const timeLeft = getTimeUntilMarketClose(now);
    return {
      status: 'OPEN',
      message: `Market closes in ${formatDuration(timeLeft)}`,
      color: 'green',
    };
  }

  const timeUntilOpen = getTimeUntilMarketOpen(now);
  return {
    status: 'CLOSED',
    message: `Market opens in ${formatDuration(timeUntilOpen)}`,
    color: 'red',
  };
}

/**
 * Telegram Alert Service
 * Sends trade signals and daily P&L summary to Telegram
 */

const fetch = require('node-fetch');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

async function sendAlert(signal, scoring) {
  if (!BOT_TOKEN || !CHAT_ID) return;

  const emoji = signal.type === 'CALL' ? '🟢' : '🔴';
  const targetsStr = signal.targetPoints?.length
    ? signal.targetPoints.map((pt, i) => `T${i + 1}=+${pt}`).join(' | ')
    : `Target: ${signal.target}`;

  const message = `
${emoji} *TRAPNEX V3 ${signal.type} SIGNAL* ${emoji}

📊 *Grade:* ${scoring.grade} (${scoring.score}/${scoring.maxScore || 22})
🎯 *Source:* ${signal.source || 'SIGNAL'}
💰 *Entry:* ${signal.entry}
🛑 *Stop Loss:* ${signal.stopLoss} (${scoring.grade === 'A+' ? '18' : scoring.grade === 'A' ? '16' : '14'} pts max)
📈 *Targets:* ${targetsStr}
⚖️ *R:R* ${signal.riskReward}

*Strikes:*
ATM: ${signal.strikes?.atm?.strike || '-'}
ITM: ${signal.strikes?.itm?.strike || '-'}
OTM: ${signal.strikes?.otm?.strike || '-'}

_${new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })}_
`.trim();

  try {
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text: message,
        parse_mode: 'Markdown',
      }),
    });
  } catch (err) {
    console.error('[Telegram] Alert failed:', err.message);
  }
}

/**
 * Send daily P&L summary at 3:25 PM IST
 */
async function sendDailyPnLSummary(stats, trades) {
  if (!BOT_TOKEN || !CHAT_ID) return;

  const todayTrades = trades || [];
  const totalPnL = todayTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
  const wins = todayTrades.filter(t => t.result === 'WIN').length;
  const losses = todayTrades.filter(t => t.result === 'LOSS').length;
  const winRate = todayTrades.length > 0
    ? Math.round((wins / todayTrades.length) * 100)
    : 0;

  const resultEmoji = totalPnL >= 0 ? '✅' : '❌';
  const pnlSign = totalPnL >= 0 ? '+' : '';

  let tradeLines = '';
  if (todayTrades.length > 0) {
    tradeLines = '\n\n*Today\'s Trades:*\n';
    todayTrades.forEach((t, i) => {
      const icon = t.result === 'WIN' ? '✅' : '❌';
      const pnl = t.pnl >= 0 ? `+${t.pnl}` : `${t.pnl}`;
      tradeLines += `${icon} ${t.type} | Entry: ${t.entry} | ${pnl} pts (${t.reason || 'CLOSED'})\n`;
    });
  }

  const message = `
📊 *TRAPNEX DAILY P&L SUMMARY* 📊

${resultEmoji} *Today's P&L: ${pnlSign}${totalPnL.toFixed(2)} pts*

📈 Trades: ${todayTrades.length}
✅ Wins: ${wins}
❌ Losses: ${losses}
🎯 Win Rate: ${winRate}%

${todayTrades.length > 0 && stats ? `💰 Best Trade: +${stats.bestTrade || 0} pts
💸 Worst Trade: ${stats.worstTrade || 0} pts` : ''}
${tradeLines}
_Summary generated at 3:25 PM IST_
`.trim();

  try {
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text: message,
        parse_mode: 'Markdown',
      }),
    });
    console.log('[Telegram] ✓ Daily P&L summary sent');
  } catch (err) {
    console.error('[Telegram] Daily P&L summary failed:', err.message);
  }
}

module.exports = { sendAlert, sendDailyPnLSummary };

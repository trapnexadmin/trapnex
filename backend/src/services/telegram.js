/**
 * Telegram Alert Service (Optional)
 * Sends trade signals to Telegram
 */

const fetch = require('node-fetch');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

async function sendAlert(signal, scoring) {
  if (!BOT_TOKEN || !CHAT_ID) return;

  const emoji = signal.type === 'CALL' ? '🟢' : '🔴';
  const message = `
${emoji} *TRAPNEX ${signal.type} SIGNAL* ${emoji}

📊 *Grade:* ${scoring.grade} (${scoring.score}/10)
💰 *Entry:* ${signal.entry}
🛑 *Stop Loss:* ${signal.stopLoss}
🎯 *Target:* ${signal.target}
📈 *R:R* ${signal.riskReward}

*Strikes:*
ATM: ${signal.strikes.atm.strike}
ITM: ${signal.strikes.itm.strike}
OTM: ${signal.strikes.otm.strike}

_${new Date().toLocaleTimeString('en-IN')}_
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

module.exports = { sendAlert };

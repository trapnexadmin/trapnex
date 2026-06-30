/**
 * Telegram Alert Service
 * Sends trade signals and daily P&L summary to Telegram
 */

const fetch = require("node-fetch");

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const GRADE_META = {
  "A+": { emoji: "🟢", label: "Strong Trade", signalLabel: "BUY SIGNAL" },
  A: { emoji: "🟡", label: "Good Trade", signalLabel: "BUY SIGNAL" },
  "B+": { emoji: "🟠", label: "Moderate Trade", signalLabel: "WATCHLIST" },
  B: { emoji: "🔴", label: "Avoid", signalLabel: "REJECTED SETUP" },
};

function getGradeMeta(grade) {
  return GRADE_META[grade] || GRADE_META.B;
}

function getSignalTypeLabel(type) {
  return type === "PUT" ? "SELL" : "BUY";
}

function formatPnl(value) {
  const rounded = Math.round((Number(value) || 0) * 100) / 100;
  return `${rounded >= 0 ? "+" : ""}${rounded.toFixed(2)}`;
}

function formatTargets(trade) {
  if (trade.optionTargets?.length) {
    return trade.optionTargets
      .map(
        (target, index) =>
          `T${index + 1}: ${target}${trade.targetsHit?.includes(index) ? " ✅" : ""}`,
      )
      .join(" | ");
  }

  if (trade.targets?.length) {
    return trade.targets
      .map(
        (target, index) =>
          `T${index + 1}: ${target}${trade.targetsHit?.includes(index) ? " ✅" : ""}`,
      )
      .join(" | ");
  }

  if (trade.targetPoints?.length) {
    return trade.targetPoints
      .map((point, index) => `T${index + 1}=+${point}`)
      .join(" | ");
  }

  return `Target: ${trade.target ?? "-"}`;
}

async function sendAlert(signal, scoring) {
  if (!BOT_TOKEN || !CHAT_ID) return;

  const grade = scoring?.grade || signal.grade || "B";
  const meta = getGradeMeta(grade);
  const tradeType = getSignalTypeLabel(signal.type);
  const score = scoring?.score ?? 0;
  const maxScore = scoring?.maxScore || 22;
  const targetsStr = signal.targetPoints?.length
    ? signal.targetPoints.map((pt, i) => `T${i + 1}=+${pt}`).join(" | ")
    : `Target: ${signal.target}`;
  const optionTargetsStr = signal.optionTargets?.length
    ? signal.optionTargets.map((target, i) => `T${i + 1}: ${target}`).join(" | ")
    : null;

  const message = `
${meta.emoji} *${grade} ${meta.signalLabel}* ${meta.emoji}

${meta.emoji} ${grade} = ${meta.label}

${tradeType} | ${signal.source || "SIGNAL"}

📊 *Grade:* ${grade} (${score}/${maxScore})
🎯 *Source:* ${signal.source || "SIGNAL"}
💰 *Entry:* ${signal.entry}
🛑 *Stop Loss:* ${signal.stopLoss} (${grade === "A+" ? "18" : grade === "A" ? "16" : "14"} pts max)
📈 *Targets:* ${targetsStr}
${optionTargetsStr ? `📈 *Option Targets:* ${optionTargetsStr}` : ""}
⚖️ *R:R* ${signal.riskReward}

*Strikes:*
ATM: ${signal.strikes?.atm?.strike || "-"}${signal.optionEntry ? ` @ ${signal.optionEntry}` : ""}
ITM: ${signal.strikes?.itm?.strike || "-"}
OTM: ${signal.strikes?.otm?.strike || "-"}
${signal.optionSymbol ? `Option: ${signal.optionSymbol}` : ""}

_${new Date().toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" })}_
`.trim();

  try {
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text: message,
        parse_mode: "Markdown",
      }),
    });
  } catch (err) {
    console.error("[Telegram] Alert failed:", err.message);
  }
}

async function sendTradeUpdateAlert(trade, update = {}) {
  if (!BOT_TOKEN || !CHAT_ID || !trade) return;

  const meta = getGradeMeta(trade.grade);
  const targetLabel =
    update.targetLabel ||
    (update.targetIdx !== undefined ? `T${update.targetIdx + 1}` : "TARGET");
  const header =
    update.event === "STOP_LOSS"
      ? "⛔ STOP LOSS HIT"
      : update.event === "TARGET_HIT" && update.targetIdx === 0
        ? "✅ TARGET 1 HIT"
        : update.event === "TARGET_HIT" && update.targetIdx === 1
          ? "🔥 TARGET 2 HIT"
          : update.event === "TARGET_HIT"
            ? `🎯 ${targetLabel} HIT`
            : "🚀 TRAPNEX ENTRY";

  const targetSummary = trade.targets?.length
    ? formatTargets(trade)
    : trade.optionTargets?.length
      ? formatTargets(trade)
      : trade.target
        ? `🎯 ${trade.target}`
        : "🎯 -";

  const statusLine =
    update.event === "TARGET_HIT" && update.targetIdx === 0
      ? "🔒 SL moved to Cost"
      : update.event === "TARGET_HIT" && update.targetIdx === 1
        ? "🔒 SL moved to T1"
        : update.event === "TARGET_HIT"
          ? "Trend Strong"
          : update.event === "STOP_LOSS"
            ? "Trade exited at stop loss"
            : "Trade active";

  const message = `
${header}

${trade.symbol || trade.level || "TRAPNEX"}

📌 *Event:* ${update.event || "UPDATE"}
💰 *Entry:* ${trade.entry}
📊 *Current:* ${update.currentPrice ?? trade.currentPrice ?? trade.entry}
🛑 *SL:* ${trade.stopLoss}

Targets:
${targetSummary}

${statusLine}
${update.remainingPosition !== undefined ? `\n🧾 Remaining Position: ${update.remainingPosition}%` : ""}
${trade.pnl !== undefined ? `\n📈 P&L: ${formatPnl(trade.pnl)} pts` : ""}

${trade.grade ? `\nGrade: ${trade.grade} (${meta.label})` : ""}

_${new Date().toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" })}_
`.trim();

  try {
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text: message,
        parse_mode: "Markdown",
      }),
    });
  } catch (err) {
    console.error("[Telegram] Trade update failed:", err.message);
  }
}

async function sendTradeClosedSummary(trade) {
  if (!BOT_TOKEN || !CHAT_ID || !trade) return;

  const emoji = trade.result === "WIN" ? "🏆" : "❌";
  const durationMinutes =
    trade.closeTime && trade.openTime
      ? Math.max(0, Math.round((trade.closeTime - trade.openTime) / 60000))
      : null;
  const message = `
${emoji} *TRADE CLOSED*

${trade.symbol || trade.level || "TRAPNEX"}

Entry: ${trade.entry}
Exit: ${trade.exitPrice ?? trade.currentPrice ?? "-"}

Profit: ${formatPnl(trade.pnl)} Points

Grade: ${trade.grade || "-"}
${durationMinutes !== null ? `Duration: ${durationMinutes} mins\n` : ""}Reason: ${trade.reason || "CLOSED"}

P&L: ${formatPnl(trade.pnl)} pts (${formatPnl(trade.pnlPercent)}%)
Result: ${trade.result || "-"}
Final SL: ${trade.stopLoss ?? "-"}
Targets Hit: ${trade.targetsHit?.length ?? 0}
Remaining Position: ${trade.positionSize ?? 0}%

_${new Date().toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" })}_
`.trim();

  try {
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text: message,
        parse_mode: "Markdown",
      }),
    });
  } catch (err) {
    console.error("[Telegram] Trade summary failed:", err.message);
  }
}

/**
 * Send daily P&L summary at 3:25 PM IST
 */
async function sendDailyPnLSummary(stats, trades) {
  if (!BOT_TOKEN || !CHAT_ID) return;

  const todayTrades = trades || [];
  const totalPnL = todayTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
  const wins = todayTrades.filter((t) => t.result === "WIN").length;
  const losses = todayTrades.filter((t) => t.result === "LOSS").length;
  const winRate =
    todayTrades.length > 0 ? Math.round((wins / todayTrades.length) * 100) : 0;

  const resultEmoji = totalPnL >= 0 ? "✅" : "❌";
  const pnlSign = totalPnL >= 0 ? "+" : "";

  let tradeLines = "";
  if (todayTrades.length > 0) {
    tradeLines = "\n\n*Today's Trades:*\n";
    todayTrades.forEach((t, i) => {
      const icon = t.result === "WIN" ? "✅" : "❌";
      const pnl = formatPnl(t.pnl);
      tradeLines += `${icon} ${t.type} | Entry: ${t.entry} | ${pnl} pts (${t.reason || "CLOSED"})\n`;
    });
  }

  const bestTrade = todayTrades.reduce((best, trade) => {
    if (!best || (trade.pnl || 0) > (best.pnl || 0)) return trade;
    return best;
  }, null);
  const worstTrade = todayTrades.reduce((worst, trade) => {
    if (!worst || (trade.pnl || 0) < (worst.pnl || 0)) return trade;
    return worst;
  }, null);

  const message = `
📊 *TRAPNEX DAILY P&L SUMMARY* 📊

${resultEmoji} *Today's P&L: ${pnlSign}${totalPnL.toFixed(2)} pts*

📈 Trades: ${todayTrades.length}
✅ Wins: ${wins}
❌ Losses: ${losses}
🎯 Win Rate: ${winRate}%

${
  todayTrades.length > 0
    ? `💰 Best Trade: ${formatPnl(bestTrade?.pnl || 0)} pts
💸 Worst Trade: ${formatPnl(worstTrade?.pnl || 0)} pts`
    : ""
}
${tradeLines}
_Summary generated at 3:25 PM IST_
`.trim();

  try {
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text: message,
        parse_mode: "Markdown",
      }),
    });
    console.log("[Telegram] ✓ Daily P&L summary sent");
  } catch (err) {
    console.error("[Telegram] Daily P&L summary failed:", err.message);
  }
}

module.exports = {
  sendAlert,
  sendTradeUpdateAlert,
  sendTradeClosedSummary,
  sendDailyPnLSummary,
};

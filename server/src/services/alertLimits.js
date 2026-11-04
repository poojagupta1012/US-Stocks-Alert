const { FREE_TIER_SYMBOL_LIMIT } = require('./finnhubSocket');

// Keeps one chat or inbox from using up the shared symbol slots, since the bot is open to anyone.
const MAX_ACTIVE_ALERTS_PER_RECIPIENT = 10;

/**
 * Checks a new alert against the limits, using the cache of active alerts.
 * Returns a message explaining which limit it hits, or null if it can be created.
 */
function checkAlertLimits(cache, { symbol, telegramChatId, emailAddress }) {
  const ticker = symbol?.trim().toUpperCase();
  // Alerts on a symbol that's already streaming don't use another slot.
  if (ticker && !cache.symbols().includes(ticker) && cache.symbols().length >= FREE_TIER_SYMBOL_LIMIT) {
    return (
      `${FREE_TIER_SYMBOL_LIMIT} different stocks are already being watched, the most the free Finnhub plan streams. ` +
      `Delete alerts on another stock first, or add an alert on a stock that's already watched.`
    );
  }

  const chatId = telegramChatId?.trim();
  const email = emailAddress?.trim().toLowerCase();
  const alerts = cache.all();
  if (chatId && alerts.filter((alert) => alert.telegramChatId === chatId).length >= MAX_ACTIVE_ALERTS_PER_RECIPIENT) {
    return `This Telegram chat already has ${MAX_ACTIVE_ALERTS_PER_RECIPIENT} active alerts, the most allowed. Delete one first.`;
  }
  if (email && alerts.filter((alert) => alert.emailAddress === email).length >= MAX_ACTIVE_ALERTS_PER_RECIPIENT) {
    return `This email address already has ${MAX_ACTIVE_ALERTS_PER_RECIPIENT} active alerts, the most allowed. Delete one first.`;
  }
  return null;
}

module.exports = { checkAlertLimits, MAX_ACTIVE_ALERTS_PER_RECIPIENT };

// Opt in to the library's fixed promise-cancellation behaviour (silences its deprecation warning).
process.env.NTBA_FIX_319 = '1';
const TelegramBot = require('node-telegram-bot-api');

let bot = null;
let isPolling = false;

function initTelegram({ token, polling }) {
  if (!token) {
    console.warn('[telegram] TELEGRAM_BOT_TOKEN not set; Telegram alerts are disabled');
    return;
  }

  bot = new TelegramBot(token, { polling });
  isPolling = Boolean(polling);

  if (polling) {
    // Lets users find the chat ID they need for the alert form.
    bot.onText(/^\/(start|id)\b/, (msg) => {
      bot
        .sendMessage(
          msg.chat.id,
          `👋 Your Telegram chat ID is <code>${msg.chat.id}</code>\n\nPaste it into the alert form to receive US stock alerts here, or set alerts right in this chat. Send /help to see how.`,
          { parse_mode: 'HTML' }
        )
        .catch((err) => console.error('[telegram] Failed to reply to /start:', err.message));
    });
    bot.on('polling_error', (err) => console.error('[telegram] Polling error:', err.message));
  }

  console.log(`[telegram] Bot ready${polling ? ' (replying to /start with chat IDs)' : ''}`);
}

function isTelegramEnabled() {
  return bot !== null;
}

/** `extra` takes any sendMessage option, e.g. reply_markup for buttons or force_reply. */
async function sendTelegramMessage(chatId, html, extra = {}) {
  if (!bot) throw new Error('Telegram is not configured on the server');
  await bot.sendMessage(chatId, html, { parse_mode: 'HTML', disable_web_page_preview: true, ...extra });
}

/** Replaces a message's text and removes its buttons. */
async function editTelegramMessage(chatId, messageId, html) {
  if (!bot) throw new Error('Telegram is not configured on the server');
  await bot.editMessageText(html, {
    chat_id: chatId,
    message_id: messageId,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
  });
}

function answerTelegramCallback(callbackQueryId, text) {
  if (!bot) return Promise.resolve();
  return bot.answerCallbackQuery(callbackQueryId, text ? { text } : {});
}

function answerTelegramInlineQuery(inlineQueryId, results, options = {}) {
  if (!bot) return Promise.resolve();
  return bot.answerInlineQuery(inlineQueryId, results, options);
}

let usernamePromise = null;
/** The bot's @username (without the @), or null if it can't be fetched. */
function getTelegramBotUsername() {
  if (!bot) return Promise.resolve(null);
  usernamePromise ||= bot
    .getMe()
    .then((me) => me.username)
    .catch(() => {
      usernamePromise = null;
      return null;
    });
  return usernamePromise;
}

/**
 * Calls handler(msg, args) for "/name args" (also "/name@BotName args" in groups).
 * Only works while polling. Handler errors are logged and reported back to the chat.
 */
function onTelegramCommand(name, handler) {
  if (!bot || !isPolling) return;

  const pattern = new RegExp(`^\\/${name}(?:@\\w+)?(?:\\s+([\\s\\S]*))?$`, 'i');
  bot.onText(pattern, (msg, match) => {
    Promise.resolve(handler(msg, (match[1] || '').trim())).catch((err) => {
      console.error(`[telegram] /${name} failed:`, err.message);
      sendTelegramMessage(msg.chat.id, '⚠️ Something went wrong on the server. Please try again.').catch(() => {});
    });
  });
}

/**
 * Calls handler(payload) for a raw bot event such as 'message', 'callback_query' or
 * 'inline_query'. Only works while polling. Handler errors are logged.
 */
function onTelegramEvent(event, handler) {
  if (!bot || !isPolling) return;

  bot.on(event, (payload) => {
    Promise.resolve(handler(payload)).catch((err) =>
      console.error(`[telegram] ${event} handler failed:`, err.message)
    );
  });
}

/** Sets the command menu Telegram shows when the user types "/". */
function setTelegramCommandMenu(commands) {
  if (!bot) return;
  bot
    .setMyCommands(commands)
    .catch((err) => console.error('[telegram] Failed to set command menu:', err.message));
}

function stopTelegram() {
  if (bot && bot.isPolling()) return bot.stopPolling();
  return Promise.resolve();
}

module.exports = {
  initTelegram,
  isTelegramEnabled,
  sendTelegramMessage,
  editTelegramMessage,
  answerTelegramCallback,
  answerTelegramInlineQuery,
  getTelegramBotUsername,
  onTelegramCommand,
  onTelegramEvent,
  setTelegramCommandMenu,
  stopTelegram,
};

const mongoose = require('mongoose');
const Alert = require('../models/Alert');
const {
  onTelegramCommand,
  onTelegramEvent,
  setTelegramCommandMenu,
  sendTelegramMessage,
  editTelegramMessage,
  answerTelegramCallback,
  answerTelegramInlineQuery,
  getTelegramBotUsername,
} = require('./telegram');

const usd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});

// A ticker or company name, then the target: "AAPL > 200", "apple below $185.50".
const ALERT_ARGS_PATTERN = /^(.+?)(?:\s*([<>])\s*|\s+(above|below)\s+)\$?(\d+(?:\.\d+)?)$/i;
// Just the target, as sent in reply to the target prompt: "> 200", "below 150".
const TARGET_PATTERN = /^(?:([<>])|(above|below))\s*\$?(\d+(?:\.\d+)?)$/i;
// Finds the ticker in our own target prompt. Telegram hands back reply_to_message as plain text.
const TARGET_PROMPT_PREFIX = '🎯 Set an alert for';
const TARGET_PROMPT_PATTERN = new RegExp(`^${TARGET_PROMPT_PREFIX} (\\S+)`, 'u');

// Enough of the ObjectId to tell a user's alerts apart; /delete also accepts the full ID.
const SHORT_ID_LENGTH = 6;
const SUGGESTION_LIMIT = 6;
const INLINE_RESULT_LIMIT = 10;
// Telegram rejects callback_data longer than this.
const MAX_CALLBACK_DATA_BYTES = 64;

const USAGE =
  'Usage: <b>/alert AAPL &gt; 200</b> or <b>/alert apple below 150</b>. Send just <b>/alert apple</b> to pick the stock first.';

function escapeHtml(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function buildHelp(username) {
  return [
    '📈 <b>US Stocks Alert</b>',
    '',
    '<b>/alert AAPL &gt; 200</b> - alert when AAPL goes above $200',
    '<b>/alert apple &lt; 150</b> - company names work too; I\'ll ask which stock you mean',
    '<b>/alert tesla</b> - pick the stock, then reply with the target',
    '   (you can also write <code>above</code> / <code>below</code>)',
    username ? `<b>@${username} nvidia</b> - type this anywhere to search stocks as you type` : null,
    '<b>/alerts</b> - list everyone\'s active alerts',
    '<b>/delete &lt;id&gt;</b> - delete an alert (IDs are shown by /alerts)',
    '<b>/id</b> - show this chat\'s ID for the web form',
    '',
    'Alerts are shared: everyone using this bot sees and can delete all of them, but each alert only notifies the chat that set it.',
    'Alerts are one-time: each one fires once and is then marked as triggered.',
  ]
    .filter((line) => line !== null)
    .join('\n');
}

const shortId = (alert) => alert._id.toString().slice(-SHORT_ID_LENGTH);

// Marks the viewer's own alerts without revealing anyone else's chat ID or email.
function describe(alert, chatId) {
  const operator = alert.condition === 'GREATER_THAN' ? '&gt;' : '&lt;';
  const mine = chatId != null && alert.telegramChatId === String(chatId) ? ' (yours)' : '';
  return `<b>${alert.symbol}</b> ${operator} ${usd.format(alert.targetPrice)}  <code>${shortId(alert)}</code>${mine}`;
}

function toTarget(operator, word, price) {
  const above = operator ? operator === '>' : word.toLowerCase() === 'above';
  return { condition: above ? 'GREATER_THAN' : 'LESS_THAN', price: Number(price) };
}

function describeTarget({ condition, price }) {
  return `${condition === 'GREATER_THAN' ? 'above' : 'below'} ${usd.format(price)}`;
}

function registerTelegramCommands({ cache, symbols }) {
  const reply = (msg, html, extra) => sendTelegramMessage(msg.chat.id, html, extra);

  /**
   * Turns what the user typed into a ticker. Exact tickers resolve directly; anything else
   * (a company name or a typo) returns suggestions. Until the symbol list has loaded, and
   * for exchange-prefixed symbols like BINANCE:BTCUSDT, the typed value is used as is.
   */
  function resolveSymbol(term) {
    const upper = term.toUpperCase();
    if (!symbols.ready || upper.includes(':')) return { symbol: upper };

    const listing = symbols.find(upper);
    if (listing) return { symbol: listing.symbol };
    return { suggestions: symbols.search(term, SUGGESTION_LIMIT) };
  }

  /** Creates the alert and returns the message to show: a confirmation or the validation error. */
  async function createAlert(chatId, symbol, target) {
    let alert;
    try {
      alert = await Alert.create({
        symbol,
        targetPrice: target.price,
        condition: target.condition,
        telegramChatId: String(chatId),
      });
    } catch (err) {
      if (err instanceof mongoose.Error.ValidationError) {
        return `❌ ${Object.values(err.errors).map((e) => e.message).join('. ')}`;
      }
      throw err;
    }

    cache.add(alert);
    const listing = symbols.find(alert.symbol);
    return [
      `✅ Alert set: ${describe(alert)}`,
      listing ? escapeHtml(listing.name) : null,
      '',
      `I'll message you here when ${alert.symbol} crosses ${describeTarget(target)}.`,
    ]
      .filter((line) => line !== null)
      .join('\n');
  }

  /** Asks for the target with a force-reply, so the user's answer comes back as a reply to this message. */
  function askForTarget(chatId, symbol, intro = '') {
    const listing = symbols.find(symbol);
    const name = listing ? ` (${escapeHtml(listing.name)})` : '';
    return sendTelegramMessage(
      chatId,
      `${intro}${TARGET_PROMPT_PREFIX} <b>${escapeHtml(symbol)}</b>${name}\n\nReply to this message with your target, e.g. <code>&gt; 200</code> or <code>below 150</code>.`,
      { reply_markup: { force_reply: true, input_field_placeholder: '> 200' } }
    );
  }

  /** One button per suggestion. With a target, tapping creates the alert; without one, it asks for the target. */
  function suggestionButtons(suggestions, target) {
    return {
      inline_keyboard: suggestions.map(({ symbol, name }) => {
        let data = `p|${symbol}`;
        if (target) {
          const withTarget = `a|${symbol}|${target.condition === 'GREATER_THAN' ? 'G' : 'L'}|${target.price}`;
          if (Buffer.byteLength(withTarget) <= MAX_CALLBACK_DATA_BYTES) data = withTarget;
        }
        return [{ text: `${symbol} · ${name}`.slice(0, 60), callback_data: data }];
      }),
    };
  }

  onTelegramCommand('help', async (msg) => reply(msg, buildHelp(await getTelegramBotUsername())));

  onTelegramCommand('alert', async (msg, args) => {
    if (!args) return reply(msg, USAGE);

    const match = args.match(ALERT_ARGS_PATTERN);
    const term = (match ? match[1] : args).trim();
    const target = match ? toTarget(match[2], match[3], match[4]) : null;

    const { symbol, suggestions } = resolveSymbol(term);
    if (symbol) {
      return target ? reply(msg, await createAlert(msg.chat.id, symbol, target)) : askForTarget(msg.chat.id, symbol);
    }

    if (suggestions.length === 0) {
      return reply(
        msg,
        `No US stock matches <b>${escapeHtml(term)}</b>. Try a ticker like <b>AAPL</b> or a company name like <b>apple</b>.`
      );
    }
    const question = target
      ? `Which stock did you mean? I'll alert you when it goes ${describeTarget(target)}.`
      : 'Which stock did you mean?';
    return reply(msg, question, { reply_markup: suggestionButtons(suggestions, target) });
  });

  // Taps on suggestion buttons.
  onTelegramEvent('callback_query', async (query) => {
    const [kind, symbol, condition, price] = (query.data || '').split('|');
    const msg = query.message;
    if (!msg || !symbol || (kind !== 'a' && kind !== 'p')) return answerTelegramCallback(query.id);

    await answerTelegramCallback(query.id);
    if (kind === 'a') {
      const target = { condition: condition === 'G' ? 'GREATER_THAN' : 'LESS_THAN', price: Number(price) };
      return editTelegramMessage(msg.chat.id, msg.message_id, await createAlert(msg.chat.id, symbol, target));
    }
    await editTelegramMessage(msg.chat.id, msg.message_id, `Picked <b>${escapeHtml(symbol)}</b>.`);
    return askForTarget(msg.chat.id, symbol);
  });

  // Replies to the target prompt.
  onTelegramEvent('message', async (msg) => {
    const prompt = msg.reply_to_message;
    if (!prompt?.text || !msg.text || msg.text.startsWith('/')) return;

    const promptMatch = prompt.text.match(TARGET_PROMPT_PATTERN);
    if (!promptMatch || !prompt.from?.is_bot || prompt.from.username !== (await getTelegramBotUsername())) return;

    const symbol = promptMatch[1];
    const targetMatch = msg.text.trim().match(TARGET_PATTERN);
    if (!targetMatch) {
      return askForTarget(msg.chat.id, symbol, "That doesn't look like a target. Try <code>&gt; 200</code> or <code>below 150</code>.\n\n");
    }
    return reply(msg, await createAlert(msg.chat.id, symbol, toTarget(...targetMatch.slice(1))));
  });

  // "@BotName nvidia" in the message box: live search. Picking a result sends "/alert NVDA",
  // which then asks for the target.
  onTelegramEvent('inline_query', async (query) => {
    const q = query.query.trim();
    const matches = q && symbols.ready ? symbols.search(q, INLINE_RESULT_LIMIT) : [];
    return answerTelegramInlineQuery(
      query.id,
      matches.map(({ symbol, name, type }) => ({
        type: 'article',
        id: symbol,
        title: `${symbol} · ${name}`,
        description: type ? `${type} · tap to set an alert` : 'Tap to set an alert',
        input_message_content: { message_text: `/alert ${symbol}` },
      })),
      { cache_time: 300 }
    );
  });

  onTelegramCommand('alerts', async (msg) => {
    const alerts = await Alert.find({ status: 'ACTIVE' }).sort({ createdAt: 1 });
    if (alerts.length === 0) {
      return reply(msg, 'There are no active alerts. Create one with <b>/alert AAPL &gt; 200</b>');
    }
    const lines = alerts.map((alert) => describe(alert, msg.chat.id));
    return reply(
      msg,
      `🔔 <b>Active alerts (${alerts.length})</b>\n\n${lines.join('\n')}\n\nDelete one with <b>/delete &lt;id&gt;</b>`
    );
  });

  onTelegramCommand('delete', async (msg, args) => {
    const id = args.toLowerCase();
    if (!/^[0-9a-f]+$/.test(id)) {
      return reply(msg, 'Usage: <b>/delete &lt;id&gt;</b>. Send /alerts to see your alert IDs.');
    }

    const alerts = await Alert.find({}, { _id: 1 });
    const matches = alerts.filter((alert) => alert._id.toString().endsWith(id));
    if (matches.length === 0) {
      return reply(msg, `No alert has the ID <code>${id}</code>. Send /alerts to see the alerts.`);
    }
    if (matches.length > 1) {
      return reply(msg, `More than one alert ends in <code>${id}</code>. Please send more of the ID.`);
    }

    const alert = await Alert.findByIdAndDelete(matches[0]._id);
    if (!alert) return reply(msg, 'That alert was already deleted.');

    cache.remove(alert._id);
    return reply(msg, `🗑️ Deleted: ${describe(alert, msg.chat.id)}`);
  });

  setTelegramCommandMenu([
    { command: 'alert', description: 'Set an alert, e.g. /alert AAPL > 200 or /alert apple' },
    { command: 'alerts', description: "List everyone's active alerts" },
    { command: 'delete', description: 'Delete an alert by ID' },
    { command: 'help', description: 'How to use this bot' },
    { command: 'id', description: "Show this chat's ID" },
  ]);
}

module.exports = registerTelegramCommands;

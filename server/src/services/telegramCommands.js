const mongoose = require('mongoose');
const Alert = require('../models/Alert');
const { onTelegramCommand, setTelegramCommandMenu, sendTelegramMessage } = require('./telegram');

const usd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});

// "AAPL > 200", "AAPL<200", "AAPL above 200", "aapl below $185.50"
const ALERT_ARGS_PATTERN = /^([A-Za-z0-9][A-Za-z0-9.:-]*)(?:\s*([<>])\s*|\s+(above|below)\s+)\$?(\d+(?:\.\d+)?)$/i;

// Enough of the ObjectId to tell a user's alerts apart; /delete also accepts the full ID.
const SHORT_ID_LENGTH = 6;

const HELP = [
  '📈 <b>US Stocks Alert</b>',
  '',
  '<b>/alert AAPL &gt; 200</b> - alert when AAPL goes above $200',
  '<b>/alert TSLA &lt; 150</b> - alert when TSLA goes below $150',
  '   (you can also write <code>above</code> / <code>below</code>)',
  '<b>/alerts</b> - list everyone\'s active alerts',
  '<b>/delete &lt;id&gt;</b> - delete an alert (IDs are shown by /alerts)',
  '<b>/id</b> - show this chat\'s ID for the web form',
  '',
  'Alerts are shared: everyone using this bot sees and can delete all of them, but each alert only notifies the chat that set it.',
  'Alerts are one-time: each one fires once and is then marked as triggered.',
].join('\n');

const shortId = (alert) => alert._id.toString().slice(-SHORT_ID_LENGTH);

// Marks the viewer's own alerts without revealing anyone else's chat ID or email.
function describe(alert, chatId) {
  const operator = alert.condition === 'GREATER_THAN' ? '&gt;' : '&lt;';
  const mine = chatId != null && alert.telegramChatId === String(chatId) ? ' (yours)' : '';
  return `<b>${alert.symbol}</b> ${operator} ${usd.format(alert.targetPrice)}  <code>${shortId(alert)}</code>${mine}`;
}

function registerTelegramCommands({ cache }) {
  const reply = (msg, html) => sendTelegramMessage(msg.chat.id, html);

  onTelegramCommand('help', (msg) => reply(msg, HELP));

  onTelegramCommand('alert', async (msg, args) => {
    const match = args.match(ALERT_ARGS_PATTERN);
    if (!match) {
      return reply(msg, 'Usage: <b>/alert AAPL &gt; 200</b> or <b>/alert AAPL below 150</b>');
    }

    const [, symbol, operator, word, price] = match;
    const above = operator ? operator === '>' : word.toLowerCase() === 'above';

    let alert;
    try {
      alert = await Alert.create({
        symbol,
        targetPrice: Number(price),
        condition: above ? 'GREATER_THAN' : 'LESS_THAN',
        telegramChatId: String(msg.chat.id),
      });
    } catch (err) {
      if (err instanceof mongoose.Error.ValidationError) {
        return reply(msg, `❌ ${Object.values(err.errors).map((e) => e.message).join('. ')}`);
      }
      throw err;
    }

    cache.add(alert);
    return reply(
      msg,
      `✅ Alert set: ${describe(alert)}\n\nI'll message you here when ${alert.symbol} crosses ${above ? 'above' : 'below'} ${usd.format(alert.targetPrice)}.`
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
    { command: 'alert', description: 'Set an alert, e.g. /alert AAPL > 200' },
    { command: 'alerts', description: "List everyone's active alerts" },
    { command: 'delete', description: 'Delete an alert by ID' },
    { command: 'help', description: 'How to use this bot' },
    { command: 'id', description: "Show this chat's ID" },
  ]);
}

module.exports = registerTelegramCommands;

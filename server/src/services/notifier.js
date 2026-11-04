const { sendTelegramMessage } = require('./telegram');
const { sendEmail } = require('./email');

const usd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildMessage(alert, price) {
  const direction = alert.condition === 'GREATER_THAN' ? 'above' : 'below';
  const target = usd.format(alert.targetPrice);
  const current = usd.format(price);
  const time = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
  const symbol = escapeHtml(alert.symbol);

  const headline = `🚨 ALERT: ${alert.symbol} has crossed ${direction} your target of ${target}!`;

  const telegram = [
    `🚨 <b>ALERT: ${symbol}</b> has crossed ${direction} your target of <b>${target}</b>!`,
    '',
    `💵 Current price: <b>${current}</b>`,
    `🕒 ${escapeHtml(time)} IST`,
  ].join('\n');

  const text = `${headline}\n\nCurrent price: ${current}\nTriggered at: ${time} IST`;

  const color = direction === 'above' ? '#16a34a' : '#dc2626';
  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;">
      <tr>
        <td style="background:${color};padding:20px 24px;color:#ffffff;">
          <div style="font-size:13px;letter-spacing:.06em;text-transform:uppercase;opacity:.9;">Price alert triggered</div>
          <div style="font-size:28px;font-weight:700;margin-top:4px;">🚨 ${symbol}</div>
        </td>
      </tr>
      <tr>
        <td style="padding:24px;color:#111827;font-size:16px;line-height:1.5;">
          <p style="margin:0 0 20px;"><strong>${symbol}</strong> has crossed <strong>${direction}</strong> your target of <strong>${target}</strong>.</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:15px;">
            <tr>
              <td style="padding:8px 0;color:#6b7280;">Current price</td>
              <td style="padding:8px 0;text-align:right;font-weight:700;color:${color};">${current}</td>
            </tr>
            <tr>
              <td style="padding:8px 0;color:#6b7280;border-top:1px solid #e5e7eb;">Target</td>
              <td style="padding:8px 0;text-align:right;border-top:1px solid #e5e7eb;">${direction === 'above' ? '&gt;' : '&lt;'} ${target}</td>
            </tr>
            <tr>
              <td style="padding:8px 0;color:#6b7280;border-top:1px solid #e5e7eb;">Triggered at</td>
              <td style="padding:8px 0;text-align:right;border-top:1px solid #e5e7eb;">${escapeHtml(time)} IST</td>
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td style="padding:16px 24px;background:#f9fafb;color:#9ca3af;font-size:12px;">
          This one-time alert is now marked as triggered. Create a new alert to keep watching ${symbol}.
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { subject: headline, telegram, text, html };
}

async function deliver(destination, send) {
  if (!destination) return { status: 'SKIPPED' };
  try {
    await send();
    return { status: 'SENT' };
  } catch (err) {
    return { status: 'FAILED', error: err.message };
  }
}

/**
 * Sends the alert on every channel the user provided, in parallel.
 * Never throws; returns a per-channel result for storing on the alert.
 */
async function notify(alert, price) {
  const message = buildMessage(alert, price);

  const [telegram, email] = await Promise.all([
    deliver(alert.telegramChatId, () => sendTelegramMessage(alert.telegramChatId, message.telegram)),
    deliver(alert.emailAddress, () =>
      sendEmail({ to: alert.emailAddress, subject: message.subject, text: message.text, html: message.html })
    ),
  ]);

  for (const [channel, result] of Object.entries({ telegram, email })) {
    if (result.status === 'FAILED') {
      console.error(`[notifier] ${channel} delivery failed for alert ${alert._id}: ${result.error}`);
    }
  }

  return { telegram, email };
}

module.exports = { notify, buildMessage };

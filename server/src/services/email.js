const nodemailer = require('nodemailer');

let transporter = null;
let fromAddress = null;

function initEmail({ user, pass }) {
  if (!user || !pass) {
    console.warn('[email] GMAIL_USER or GMAIL_APP_PASSWORD not set; email alerts are disabled');
    return;
  }

  transporter = nodemailer.createTransport({ service: 'gmail', auth: { user, pass } });
  fromAddress = `"US Stocks Alert" <${user}>`;

  transporter
    .verify()
    .then(() => console.log('[email] Gmail transporter ready'))
    .catch((err) => console.error('[email] Gmail login failed:', err.message));
}

function isEmailEnabled() {
  return transporter !== null;
}

async function sendEmail({ to, subject, text, html }) {
  if (!transporter) throw new Error('Gmail is not configured on the server');
  await transporter.sendMail({ from: fromAddress, to, subject, text, html });
}

module.exports = { initEmail, isEmailEnabled, sendEmail };

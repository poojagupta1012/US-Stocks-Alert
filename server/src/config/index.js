require('dotenv').config();

const config = {
  port: Number(process.env.PORT) || 4000,
  mongodbUri: process.env.MONGODB_URI,
  finnhubApiKey: process.env.FINNHUB_API_KEY,
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN,
  telegramPolling: process.env.TELEGRAM_POLLING !== 'false',
  gmailUser: process.env.GMAIL_USER,
  gmailAppPassword: process.env.GMAIL_APP_PASSWORD,
  clientOrigins: (process.env.CLIENT_ORIGIN || 'http://localhost:3000')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
};

const missing = ['MONGODB_URI', 'FINNHUB_API_KEY'].filter((key) => !process.env[key]);
if (missing.length) {
  console.error(`[config] Missing required environment variables: ${missing.join(', ')}`);
  console.error('[config] Copy server/.env.example to server/.env and fill in your keys.');
  process.exit(1);
}

module.exports = config;

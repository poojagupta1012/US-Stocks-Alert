const config = require('./config');
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const connectDB = require('./config/db');
const createAlertsRouter = require('./routes/alerts');
const createSymbolsRouter = require('./routes/symbols');
const AlertCache = require('./services/alertCache');
const FinnhubSocket = require('./services/finnhubSocket');
const SymbolDirectory = require('./services/symbolDirectory');
const AlertEngine = require('./services/alertEngine');
const notifier = require('./services/notifier');
const { initTelegram, isTelegramEnabled, stopTelegram } = require('./services/telegram');
const { initEmail, isEmailEnabled } = require('./services/email');
const registerTelegramCommands = require('./services/telegramCommands');

async function main() {
  await connectDB(config.mongodbUri);

  initTelegram({ token: config.telegramBotToken, polling: config.telegramPolling });
  initEmail({ user: config.gmailUser, pass: config.gmailAppPassword });

  const cache = new AlertCache();
  const socket = new FinnhubSocket({ apiKey: config.finnhubApiKey });
  const engine = new AlertEngine({ cache, socket, notifier });
  await engine.start();

  // Loads in the background; autocomplete answers 503 (and the bot skips suggestions) until it's ready.
  const symbols = new SymbolDirectory({ apiKey: config.finnhubApiKey });
  symbols.load();
  registerTelegramCommands({ cache, symbols });

  const app = express();
  app.use(cors({ origin: config.clientOrigins }));
  app.use(express.json({ limit: '10kb' }));

  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
      finnhub: socket.connected ? 'connected' : 'disconnected',
      activeAlerts: cache.size,
      symbolDirectory: symbols.ready ? 'loaded' : 'loading',
      subscribedSymbols: cache.symbols(),
      channels: { telegram: isTelegramEnabled(), email: isEmailEnabled() },
    });
  });

  app.use('/api/alerts', createAlertsRouter({ cache }));
  app.use('/api/symbols', createSymbolsRouter({ symbols }));

  app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err instanceof mongoose.Error.ValidationError) {
      const errors = Object.values(err.errors).map((e) => e.message);
      return res.status(400).json({ error: errors.join('. '), errors });
    }
    if (err.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'Request body must be valid JSON' });
    }
    console.error('[server] Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
  });

  const server = app.listen(config.port, () => {
    console.log(`[server] Listening on http://localhost:${config.port}`);
  });

  const shutdown = async (signal) => {
    console.log(`[server] ${signal} received, shutting down`);
    // Set first: stopTelegram() below can hang on a dead connection, and nothing after it would run.
    setTimeout(() => process.exit(1), 10000).unref();
    socket.close();
    symbols.stop();
    await stopTelegram().catch(() => {});
    server.close(async () => {
      await mongoose.disconnect();
      process.exit(0);
    });
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('[server] Failed to start:', err.message);
  process.exit(1);
});

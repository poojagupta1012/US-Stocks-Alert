const EventEmitter = require('events');
const WebSocket = require('ws');

const FINNHUB_WS_URL = 'wss://ws.finnhub.io';
const HEARTBEAT_INTERVAL_MS = 30000;
const MAX_RECONNECT_DELAY_MS = 30000;
const FREE_TIER_SYMBOL_LIMIT = 50;

/**
 * Finnhub trade stream client with automatic reconnect and resubscribe.
 *
 * Emits:
 *   'trade' ({ symbol, price, volume, timestamp })
 *   'connected' / 'disconnected'
 */
class FinnhubSocket extends EventEmitter {
  constructor({ apiKey }) {
    super();
    this.apiKey = apiKey;
    this.subscriptions = new Set();
    this.ws = null;
    this.reconnectAttempts = 0;
    this.reconnectTimer = null;
    this.heartbeatTimer = null;
    this.isAlive = false;
    this.stopped = false;
  }

  connect() {
    this.stopped = false;
    const ws = new WebSocket(`${FINNHUB_WS_URL}?token=${encodeURIComponent(this.apiKey)}`);
    this.ws = ws;

    ws.on('open', () => {
      console.log('[finnhub] WebSocket connected');
      this.reconnectAttempts = 0;
      this.isAlive = true;
      this.startHeartbeat();
      this.subscriptions.forEach((symbol) => this.send({ type: 'subscribe', symbol }));
      this.emit('connected');
    });

    ws.on('message', (raw) => {
      this.isAlive = true;
      this.handleMessage(raw);
    });

    ws.on('pong', () => {
      this.isAlive = true;
    });

    ws.on('unexpected-response', (_req, res) => {
      console.error(`[finnhub] Connection rejected with HTTP ${res.statusCode}`);
    });

    ws.on('error', (err) => {
      console.error('[finnhub] WebSocket error:', err.message);
    });

    ws.on('close', (code) => {
      this.stopHeartbeat();
      if (this.ws === ws) this.ws = null;
      this.emit('disconnected');
      if (this.stopped) return;
      console.warn(`[finnhub] WebSocket closed (code ${code})`);
      this.scheduleReconnect();
    });
  }

  handleMessage(raw) {
    let message;
    try {
      message = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (message.type === 'trade' && Array.isArray(message.data)) {
      for (const trade of message.data) {
        if (typeof trade.s === 'string' && Number.isFinite(trade.p)) {
          this.emit('trade', { symbol: trade.s, price: trade.p, volume: trade.v, timestamp: trade.t });
        }
      }
    } else if (message.type === 'error') {
      console.error('[finnhub] Server error:', message.msg);
    }
  }

  startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (!this.ws) return;
      if (!this.isAlive) {
        console.warn('[finnhub] Heartbeat timed out, reconnecting');
        this.ws.terminate();
        return;
      }
      this.isAlive = false;
      this.ws.ping();
    }, HEARTBEAT_INTERVAL_MS);
  }

  stopHeartbeat() {
    clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
  }

  scheduleReconnect() {
    clearTimeout(this.reconnectTimer);
    const delay = Math.min(1000 * 2 ** this.reconnectAttempts, MAX_RECONNECT_DELAY_MS);
    this.reconnectAttempts += 1;
    console.log(`[finnhub] Reconnecting in ${delay / 1000}s`);
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  send(payload) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    }
  }

  subscribe(symbol) {
    if (this.subscriptions.has(symbol)) return;
    this.subscriptions.add(symbol);
    if (this.subscriptions.size > FREE_TIER_SYMBOL_LIMIT) {
      console.warn(
        `[finnhub] ${this.subscriptions.size} symbols subscribed; the free tier streams about ${FREE_TIER_SYMBOL_LIMIT}`
      );
    }
    this.send({ type: 'subscribe', symbol });
    console.log(`[finnhub] Subscribed to ${symbol}`);
  }

  unsubscribe(symbol) {
    if (!this.subscriptions.delete(symbol)) return;
    this.send({ type: 'unsubscribe', symbol });
    console.log(`[finnhub] Unsubscribed from ${symbol}`);
  }

  get connected() {
    return !!this.ws && this.ws.readyState === WebSocket.OPEN;
  }

  close() {
    this.stopped = true;
    clearTimeout(this.reconnectTimer);
    this.stopHeartbeat();
    if (this.ws) this.ws.close();
  }
}

module.exports = FinnhubSocket;
module.exports.FREE_TIER_SYMBOL_LIMIT = FREE_TIER_SYMBOL_LIMIT;

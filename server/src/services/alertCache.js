const EventEmitter = require('events');

/**
 * In-memory index of ACTIVE alerts, keyed by symbol.
 *
 * Emits:
 *   'symbolAdded'   (symbol) - first active alert for a symbol was added
 *   'symbolRemoved' (symbol) - last active alert for a symbol was removed
 */
class AlertCache extends EventEmitter {
  constructor() {
    super();
    this.bySymbol = new Map(); // symbol -> Map<alertId, alert>
    this.byId = new Map(); // alertId -> alert
  }

  static toCached(doc) {
    return {
      id: String(doc._id ?? doc.id),
      symbol: doc.symbol,
      targetPrice: doc.targetPrice,
      condition: doc.condition,
      telegramChatId: doc.telegramChatId,
      emailAddress: doc.emailAddress,
    };
  }

  load(docs) {
    docs.forEach((doc) => this.add(doc));
  }

  add(doc) {
    const alert = AlertCache.toCached(doc);
    if (this.byId.has(alert.id)) return;

    let alerts = this.bySymbol.get(alert.symbol);
    const isNewSymbol = !alerts;
    if (isNewSymbol) {
      alerts = new Map();
      this.bySymbol.set(alert.symbol, alerts);
    }
    alerts.set(alert.id, alert);
    this.byId.set(alert.id, alert);

    if (isNewSymbol) this.emit('symbolAdded', alert.symbol);
  }

  remove(id) {
    const alert = this.byId.get(String(id));
    if (!alert) return null;

    this.byId.delete(alert.id);
    const alerts = this.bySymbol.get(alert.symbol);
    alerts.delete(alert.id);
    if (alerts.size === 0) {
      this.bySymbol.delete(alert.symbol);
      this.emit('symbolRemoved', alert.symbol);
    }
    return alert;
  }

  getBySymbol(symbol) {
    const alerts = this.bySymbol.get(symbol);
    return alerts ? Array.from(alerts.values()) : [];
  }

  symbols() {
    return Array.from(this.bySymbol.keys());
  }

  get size() {
    return this.byId.size;
  }
}

module.exports = AlertCache;

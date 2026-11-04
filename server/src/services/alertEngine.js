const Alert = require('../models/Alert');

function isMatch(alert, price) {
  return alert.condition === 'GREATER_THAN' ? price > alert.targetPrice : price < alert.targetPrice;
}

/**
 * Connects the alert cache to the Finnhub stream and fires notifications
 * when a live trade crosses an alert's target.
 */
class AlertEngine {
  constructor({ cache, socket, notifier }) {
    this.cache = cache;
    this.socket = socket;
    this.notifier = notifier;
    this.lastPrices = new Map();
  }

  async start() {
    this.cache.on('symbolAdded', (symbol) => this.socket.subscribe(symbol));
    this.cache.on('symbolRemoved', (symbol) => {
      this.socket.unsubscribe(symbol);
      this.lastPrices.delete(symbol);
    });

    const activeAlerts = await Alert.find({ status: 'ACTIVE' }).lean();
    this.cache.load(activeAlerts);
    console.log(
      `[engine] Loaded ${this.cache.size} active alert(s) across ${this.cache.symbols().length} symbol(s)`
    );

    this.socket.on('trade', (trade) => this.handleTrade(trade));
    this.socket.connect();
  }

  handleTrade({ symbol, price }) {
    this.lastPrices.set(symbol, price);
    for (const alert of this.cache.getBySymbol(symbol)) {
      if (!isMatch(alert, price)) continue;
      // Remove synchronously so later trades in the same batch can't fire it again.
      this.cache.remove(alert.id);
      this.trigger(alert, price).catch((err) => {
        console.error(`[engine] Failed to trigger alert ${alert.id}:`, err.message);
      });
    }
  }

  async trigger(alert, price) {
    let updated;
    try {
      // The status filter makes this atomic: an alert deleted or triggered
      // elsewhere in the meantime is skipped.
      updated = await Alert.findOneAndUpdate(
        { _id: alert.id, status: 'ACTIVE' },
        { $set: { status: 'TRIGGERED', triggeredAt: new Date(), triggeredPrice: price } },
        { new: true }
      );
    } catch (err) {
      // Database unavailable: put the alert back so the next trade retries it.
      this.cache.add(alert);
      throw err;
    }
    if (!updated) return;

    console.log(`[engine] Triggered ${alert.symbol} ${alert.condition} ${alert.targetPrice} at ${price}`);
    const notifications = await this.notifier.notify(updated, price);
    await Alert.updateOne({ _id: updated._id }, { $set: { notifications } });
  }
}

module.exports = AlertEngine;

const mongoose = require('mongoose');

const CONDITIONS = ['GREATER_THAN', 'LESS_THAN'];
const STATUSES = ['ACTIVE', 'TRIGGERED'];
const NOTIFICATION_STATUSES = ['SENT', 'FAILED', 'SKIPPED'];

// Plain tickers (AAPL, BRK.B) plus Finnhub's exchange-prefixed form (BINANCE:BTCUSDT).
const SYMBOL_PATTERN = /^[A-Z0-9][A-Z0-9.:\-]{0,29}$/;
// Numeric chat IDs (groups are negative) or @channelusername.
const TELEGRAM_CHAT_ID_PATTERN = /^(-?\d+|@[A-Za-z0-9_]{5,})$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const notificationResultSchema = new mongoose.Schema(
  {
    status: { type: String, enum: NOTIFICATION_STATUSES },
    error: String,
  },
  { _id: false }
);

const alertSchema = new mongoose.Schema(
  {
    symbol: {
      type: String,
      required: [true, 'Stock symbol is required'],
      uppercase: true,
      trim: true,
      match: [SYMBOL_PATTERN, 'Invalid stock symbol'],
    },
    targetPrice: {
      type: Number,
      required: [true, 'Target price is required'],
      validate: {
        validator: (value) => Number.isFinite(value) && value > 0,
        message: 'Target price must be a positive number',
      },
    },
    condition: {
      type: String,
      enum: { values: CONDITIONS, message: 'Condition must be GREATER_THAN or LESS_THAN' },
      required: [true, 'Condition is required'],
    },
    status: {
      type: String,
      enum: STATUSES,
      default: 'ACTIVE',
      index: true,
    },
    telegramChatId: {
      type: String,
      trim: true,
      match: [TELEGRAM_CHAT_ID_PATTERN, 'Invalid Telegram chat ID'],
    },
    emailAddress: {
      type: String,
      trim: true,
      lowercase: true,
      match: [EMAIL_PATTERN, 'Invalid email address'],
    },
    triggeredAt: Date,
    triggeredPrice: Number,
    notifications: {
      telegram: notificationResultSchema,
      email: notificationResultSchema,
    },
  },
  { timestamps: true }
);

alertSchema.pre('validate', function requireAChannel() {
  if (!this.telegramChatId && !this.emailAddress) {
    this.invalidate('emailAddress', 'Provide a Telegram chat ID, an email address, or both');
  }
});

alertSchema.set('toJSON', {
  versionKey: false,
  transform: (_doc, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    return ret;
  },
});

module.exports = mongoose.model('Alert', alertSchema);
module.exports.CONDITIONS = CONDITIONS;
module.exports.STATUSES = STATUSES;

# US-Stocks-Alert

Real-time price alerts for US stocks, delivered to **Telegram** and **Gmail**, built entirely on free services.

- **client/**: Next.js and Tailwind dashboard for creating, viewing and deleting alerts
- **server/**: Express, MongoDB (Mongoose), the Finnhub WebSocket alert engine, and the Telegram and Gmail notifiers

## How it works

1. On startup the server loads every `ACTIVE` alert from MongoDB into an in-memory cache indexed by symbol.
2. It subscribes the Finnhub WebSocket only to symbols that have at least one active alert. It subscribes again automatically after a reconnect.
3. Each incoming trade is checked against that symbol's alerts. When an alert matches:
   - it is marked `TRIGGERED` in MongoDB with the trigger time and price, using an atomic update so it never fires twice;
   - the Telegram message and the HTML email are sent in parallel, and each one's delivery result is saved on the alert;
   - it is removed from the cache, and the server unsubscribes from the symbol if no other active alert uses it;
   - MongoDB deletes it automatically 2 days later (a TTL index on `triggeredAt`).
4. Creating or deleting an alert through the API updates the cache, and the subscriptions with it, immediately.

## Setup

### 1. Get your keys
| Key | Where |
|---|---|
| `FINNHUB_API_KEY` | Free account at https://finnhub.io/dashboard |
| `MONGODB_URI` | Local MongoDB, or a free MongoDB Atlas cluster |
| `TELEGRAM_BOT_TOKEN` | Message [@BotFather](https://t.me/BotFather), run `/newbot`, and copy the token |
| `GMAIL_USER` / `GMAIL_APP_PASSWORD` | Turn on 2-Step Verification, then go to Google Account > Security > [App passwords](https://myaccount.google.com/apppasswords) |

Telegram and Gmail are each optional. If one isn't configured, that channel is turned off and the server keeps running.

### 2. Server
```bash
cd server
cp .env.example .env    # fill in your keys
npm install
npm start               # http://localhost:4000
```

### 3. Client
```bash
cd client
cp .env.example .env.local
npm install
npm run dev             # http://localhost:3000
```

### 4. Find your Telegram chat ID
Open your bot in Telegram and send `/start`. It replies with your chat ID, which goes in the alert form.

## Telegram commands
You can also manage alerts straight from the bot. Alerts created this way notify the chat they were created in.

| Command | Description |
|---|---|
| `/alert AAPL > 200` | Alert when AAPL goes above $200. Use `<` for below; `above` / `below` also work. |
| `/alert apple < 150` | Company names and partial tickers work too: the bot replies with buttons of matching stocks, and tapping one creates the alert. |
| `/alert tesla` | Without a target, pick the stock (if needed) and the bot asks you to reply with the target, e.g. `> 400`. |
| `@YourBot nvidia` | Inline search: type the bot's username and a name or ticker in any chat's message box to see matching stocks as you type. Picking one sends `/alert NVDA` and the bot asks for the target. Needs inline mode turned on once: in @BotFather, send `/setinline`, pick the bot and enter a placeholder like `Search US stocks…`. |
| `/alerts` | List all active alerts, each with a short ID. Your own are marked "(yours)". Long lists are split across several messages. |
| `/delete <id>` | Delete any alert. |
| `/help` | Show the commands. |
| `/start`, `/id` | Show this chat's ID. |

The commands need `TELEGRAM_POLLING=true`. Alerts are shared: everyone who uses the bot can list and delete every alert, including ones created in the web form. Each alert still only notifies the chat (or email) it was created with, and `/alerts` doesn't show other people's chat IDs or email addresses.

## API
| Method | Path | Description |
|---|---|---|
| `POST` | `/api/alerts` | Body: `{ symbol, targetPrice, condition: "GREATER_THAN" \| "LESS_THAN", telegramChatId?, emailAddress? }`. At least one channel is required. Answers `409` when a [limit](#limits) is reached. |
| `GET` | `/api/alerts` | Lists all alerts, newest first. Add `?status=ACTIVE` or `?status=TRIGGERED` to filter. |
| `DELETE` | `/api/alerts/:id` | Deletes an alert. |
| `GET` | `/api/symbols?q=apple` | Ticker autocomplete: up to 8 US symbols matching a ticker or company name, as `[{ symbol, name, type }]`. The server downloads Finnhub's US symbol list at startup and refreshes it daily, and answers `503` until the first download finishes. |
| `GET` | `/api/health` | Database and Finnhub connection status, plus subscribed symbols. |

## Limits
These apply to the web form, the API and the bot alike:

- **50 different stocks at once.** Finnhub's free WebSocket streams about 50 distinct symbols, so a new alert on a stock that isn't already watched is refused once 50 are. Alerts on already-watched stocks are always allowed.
- **10 active alerts per Telegram chat and per email address**, so one person can't use up the shared stock slots.
- **Triggered alerts are deleted 2 days after they fire.** Active alerts are never deleted automatically.

The numbers are constants in [alertLimits.js](server/src/services/alertLimits.js), [finnhubSocket.js](server/src/services/finnhubSocket.js) and the `Alert` model.

## Notes
- Trades only stream during US market hours: 9:30–16:00 ET, which is 8:00 PM–2:30 AM IST outside US daylight saving time and 7:00 PM–1:30 AM IST during it.
- Alerts are one-shot. An alert whose condition is already true when you create it fires on the next trade.
- Run only one server instance per bot token while `TELEGRAM_POLLING=true`.

const FINNHUB_SYMBOLS_URL = 'https://finnhub.io/api/v1/stock/symbol?exchange=US';
const REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000;
const RETRY_DELAY_MS = 5 * 60 * 1000;

// Ranking tie-breakers, since Finnhub's list has no market cap: plain shares beat funds,
// funds beat warrants/units/rights, and exchange listings beat over-the-counter ones.
const STOCK_TYPES = new Set(['Common Stock', 'ADR', 'REIT']);
const FUND_TYPES = new Set(['ETP', 'Closed-End Fund', 'MLP']);
const OTC_MIC = 'OOTC';

function rankPenalty({ type, mic }) {
  const typePenalty = STOCK_TYPES.has(type) ? 0 : FUND_TYPES.has(type) ? 0.2 : 0.4;
  return typePenalty + (mic === OTC_MIC ? 0.3 : 0);
}

/**
 * In-memory directory of every US-listed symbol, used for ticker autocomplete.
 * Downloaded from Finnhub once (about 31k entries), then refreshed daily.
 */
class SymbolDirectory {
  constructor({ apiKey }) {
    this.apiKey = apiKey;
    this.entries = []; // { symbol, name, type, nameLower, penalty }
    this.bySymbol = new Map();
    this.loading = null;
    this.timer = null;
  }

  get ready() {
    return this.entries.length > 0;
  }

  /** Downloads the list; on failure keeps the previous list and retries later. */
  load() {
    if (this.loading) return this.loading;

    this.loading = this.download()
      .then((entries) => {
        this.entries = entries;
        this.bySymbol = new Map(entries.map((entry) => [entry.symbol, entry]));
        console.log(`[symbols] Loaded ${entries.length} US symbols`);
        this.schedule(REFRESH_INTERVAL_MS);
      })
      .catch((err) => {
        console.error('[symbols] Failed to load the US symbol list:', err.message);
        this.schedule(RETRY_DELAY_MS);
      })
      .finally(() => {
        this.loading = null;
      });
    return this.loading;
  }

  async download() {
    const res = await fetch(`${FINNHUB_SYMBOLS_URL}&token=${encodeURIComponent(this.apiKey)}`);
    if (!res.ok) throw new Error(`Finnhub responded with ${res.status}`);

    const data = await res.json();
    if (!Array.isArray(data)) throw new Error('Unexpected response from Finnhub');

    return data
      .filter((item) => item.symbol && item.description)
      .map((item) => ({
        symbol: item.symbol,
        name: item.description,
        type: item.type || '',
        nameLower: item.description.toLowerCase(),
        penalty: rankPenalty(item),
      }));
  }

  schedule(delay) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.load(), delay);
    this.timer.unref();
  }

  /** The listing for an exact ticker (case-insensitive), or null. */
  find(symbol) {
    const entry = this.bySymbol.get(symbol.trim().toUpperCase());
    return entry ? { symbol: entry.symbol, name: entry.name, type: entry.type } : null;
  }

  /**
   * Best matches for a ticker or company-name query, e.g. "aap" or "apple".
   * Ticker matches come first (BRK matches BRK.A and BRK.B exactly), then names starting
   * with the query, then names containing a word that starts with it.
   */
  search(query, limit = 8) {
    const q = query.trim();
    if (!q) return [];
    const upper = q.toUpperCase();
    const lower = q.toLowerCase();

    const scored = [];
    for (const entry of this.entries) {
      let score;
      if (entry.symbol === upper || entry.symbol.split('.')[0] === upper) score = 0;
      else if (entry.symbol.startsWith(upper)) score = 1;
      else if (entry.nameLower.startsWith(lower)) score = 2;
      else if (entry.nameLower.includes(` ${lower}`)) score = 3;
      else continue;

      scored.push({ entry, score: score + entry.penalty });
    }

    return scored
      .sort((a, b) => a.score - b.score || a.entry.symbol.length - b.entry.symbol.length || a.entry.symbol.localeCompare(b.entry.symbol))
      .slice(0, limit)
      .map(({ entry }) => ({ symbol: entry.symbol, name: entry.name, type: entry.type }));
  }

  stop() {
    clearTimeout(this.timer);
  }
}

module.exports = SymbolDirectory;

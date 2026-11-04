const express = require('express');

const MAX_QUERY_LENGTH = 50;

function createSymbolsRouter({ symbols }) {
  const router = express.Router();

  // GET /api/symbols?q=apple -> [{ symbol, name, type }]
  router.get('/', (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (!q) return res.json([]);
    if (q.length > MAX_QUERY_LENGTH) {
      return res.status(400).json({ error: `q must be at most ${MAX_QUERY_LENGTH} characters` });
    }
    if (!symbols.ready) {
      return res.status(503).json({ error: 'The symbol list is still loading. Try again in a moment.' });
    }
    res.json(symbols.search(q));
  });

  return router;
}

module.exports = createSymbolsRouter;

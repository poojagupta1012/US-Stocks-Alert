const express = require('express');
const mongoose = require('mongoose');
const Alert = require('../models/Alert');
const { checkAlertLimits } = require('../services/alertLimits');

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Treat blank form fields as "not provided".
function optionalString(value) {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function createAlertsRouter({ cache }) {
  const router = express.Router();

  router.post(
    '/',
    asyncHandler(async (req, res) => {
      const { targetPrice, condition } = req.body || {};
      const symbol = optionalString(req.body?.symbol);
      const telegramChatId = optionalString(req.body?.telegramChatId);
      const emailAddress = optionalString(req.body?.emailAddress);

      const limitError = checkAlertLimits(cache, { symbol, telegramChatId, emailAddress });
      if (limitError) return res.status(409).json({ error: limitError });

      const alert = await Alert.create({
        symbol,
        targetPrice: targetPrice === '' || targetPrice == null ? undefined : Number(targetPrice),
        condition,
        telegramChatId,
        emailAddress,
      });

      cache.add(alert);
      res.status(201).json(alert);
    })
  );

  router.get(
    '/',
    asyncHandler(async (req, res) => {
      const filter = {};
      if (req.query.status) {
        const status = String(req.query.status).toUpperCase();
        if (!Alert.STATUSES.includes(status)) {
          return res.status(400).json({ error: `status must be one of ${Alert.STATUSES.join(', ')}` });
        }
        filter.status = status;
      }
      const alerts = await Alert.find(filter).sort({ createdAt: -1 });
      res.json(alerts);
    })
  );

  router.delete(
    '/:id',
    asyncHandler(async (req, res) => {
      if (!mongoose.isValidObjectId(req.params.id)) {
        return res.status(400).json({ error: 'Invalid alert ID' });
      }
      const alert = await Alert.findByIdAndDelete(req.params.id);
      if (!alert) return res.status(404).json({ error: 'Alert not found' });

      cache.remove(alert._id);
      res.json({ id: alert._id.toString(), deleted: true });
    })
  );

  return router;
}

module.exports = createAlertsRouter;

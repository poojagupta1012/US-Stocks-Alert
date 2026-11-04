'use client';

import { useState } from 'react';
import { createAlert } from '@/lib/api';

const EMPTY_FORM = {
  symbol: '',
  targetPrice: '',
  condition: 'GREATER_THAN',
  telegramChatId: '',
  emailAddress: '',
};

const inputClass =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200';
const labelClass = 'mb-1 block text-sm font-medium text-slate-700';

export default function AlertForm({ onCreated }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const update = (field) => (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }));

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (!form.telegramChatId.trim() && !form.emailAddress.trim()) {
      setError('Enter a Telegram chat ID, an email address, or both.');
      return;
    }

    setSubmitting(true);
    try {
      const alert = await createAlert({
        ...form,
        symbol: form.symbol.trim().toUpperCase(),
        targetPrice: Number(form.targetPrice),
      });
      // Keep the contact details so adding several alerts is quick.
      setForm((prev) => ({ ...EMPTY_FORM, telegramChatId: prev.telegramChatId, emailAddress: prev.emailAddress }));
      onCreated(alert);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="mb-4 text-lg font-semibold">Create alert</h2>

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label htmlFor="symbol" className={labelClass}>
            Stock ticker
          </label>
          <input
            id="symbol"
            required
            value={form.symbol}
            onChange={update('symbol')}
            placeholder="AAPL"
            autoComplete="off"
            className={`${inputClass} uppercase`}
          />
        </div>
        <div>
          <label htmlFor="condition" className={labelClass}>
            Condition
          </label>
          <select id="condition" value={form.condition} onChange={update('condition')} className={inputClass}>
            <option value="GREATER_THAN">Price goes above</option>
            <option value="LESS_THAN">Price goes below</option>
          </select>
        </div>
        <div>
          <label htmlFor="targetPrice" className={labelClass}>
            Target price (USD)
          </label>
          <input
            id="targetPrice"
            type="number"
            required
            min="0.0001"
            step="any"
            value={form.targetPrice}
            onChange={update('targetPrice')}
            placeholder="185.00"
            className={inputClass}
          />
        </div>
      </div>

      <p className="mb-3 mt-6 text-sm text-slate-500">
        Notify me on Telegram, Gmail, or both. Message your bot <code className="rounded bg-slate-100 px-1">/start</code>{' '}
        to get your chat ID.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="telegramChatId" className={labelClass}>
            Telegram chat ID
          </label>
          <input
            id="telegramChatId"
            value={form.telegramChatId}
            onChange={update('telegramChatId')}
            placeholder="123456789"
            autoComplete="off"
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="emailAddress" className={labelClass}>
            Email address
          </label>
          <input
            id="emailAddress"
            type="email"
            value={form.emailAddress}
            onChange={update('emailAddress')}
            placeholder="you@example.com"
            className={inputClass}
          />
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="mt-6 w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
      >
        {submitting ? 'Creating…' : 'Create alert'}
      </button>
    </form>
  );
}

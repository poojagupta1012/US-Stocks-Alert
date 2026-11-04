'use client';

import { useCallback, useEffect, useState } from 'react';
import AlertForm from '@/components/AlertForm';
import AlertsTable from '@/components/AlertsTable';
import { deleteAlert, getAlerts, getHealth } from '@/lib/api';

const REFRESH_INTERVAL_MS = 10000;

function StatusDot({ label, ok }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-slate-600">
      <span className={`h-2 w-2 rounded-full ${ok ? 'bg-green-500' : 'bg-slate-300'}`} />
      {label}
    </span>
  );
}

export default function Dashboard() {
  const [alerts, setAlerts] = useState([]);
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deletingId, setDeletingId] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const [alertList, healthInfo] = await Promise.all([getAlerts(), getHealth()]);
      setAlerts(alertList);
      setHealth(healthInfo);
      setError('');
    } catch (err) {
      setError(err.message);
      setHealth(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // Poll so alerts that trigger in the background show up without a reload.
  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, REFRESH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  async function handleDelete(alert) {
    if (!window.confirm(`Delete the ${alert.symbol} alert?`)) return;
    setDeletingId(alert.id);
    try {
      await deleteAlert(alert.id);
      setAlerts((prev) => prev.filter((a) => a.id !== alert.id));
    } catch (err) {
      setError(err.message);
    } finally {
      setDeletingId(null);
    }
  }

  const activeCount = alerts.filter((a) => a.status === 'ACTIVE').length;

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <header className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">US Stocks Alert</h1>
          <p className="mt-1 text-sm text-slate-500">
            Real-time price alerts for US stocks, delivered to Telegram and Gmail.
          </p>
        </div>
        <div className="flex flex-wrap gap-4">
          <StatusDot label="Live prices" ok={health?.finnhub === 'connected'} />
          <StatusDot label="Telegram" ok={health?.channels?.telegram} />
          <StatusDot label="Gmail" ok={health?.channels?.email} />
        </div>
      </header>

      {error && (
        <div role="alert" className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <AlertForm onCreated={(alert) => setAlerts((prev) => [alert, ...prev])} />

      <section className="mt-8 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h2 className="text-lg font-semibold">Alerts</h2>
          <span className="text-sm text-slate-500" title="Triggered alerts are deleted 2 days after they fire">
            {activeCount} active · {alerts.length - activeCount} triggered (kept 2 days)
          </span>
        </div>
        <AlertsTable alerts={alerts} loading={loading} onDelete={handleDelete} deletingId={deletingId} />
      </section>
    </main>
  );
}

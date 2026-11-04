'use client';

const usd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});

const formatDate = (value) =>
  value ? new Date(value).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—';

const DELIVERY_STYLES = {
  SENT: 'text-green-700',
  FAILED: 'text-red-700',
  SKIPPED: 'text-slate-400',
};

function Channel({ icon, value, result }) {
  if (!value) return null;
  return (
    <div className="flex items-center gap-1 whitespace-nowrap">
      <span aria-hidden>{icon}</span>
      <span className="max-w-[180px] truncate" title={value}>
        {value}
      </span>
      {result && (
        <span className={`text-xs font-medium ${DELIVERY_STYLES[result.status]}`} title={result.error}>
          · {result.status.toLowerCase()}
        </span>
      )}
    </div>
  );
}

export default function AlertsTable({ alerts, loading, onDelete, deletingId }) {
  if (loading) {
    return <p className="p-6 text-sm text-slate-500">Loading alerts…</p>;
  }
  if (alerts.length === 0) {
    return <p className="p-6 text-sm text-slate-500">No alerts yet. Create one above.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-3">Symbol</th>
            <th className="px-4 py-3">Condition</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Notify</th>
            <th className="px-4 py-3">Created</th>
            <th className="px-4 py-3">Triggered</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {alerts.map((alert) => {
            const active = alert.status === 'ACTIVE';
            return (
              <tr key={alert.id} className={active ? '' : 'bg-slate-50/60'}>
                <td className="px-4 py-3 font-semibold">{alert.symbol}</td>
                <td className="whitespace-nowrap px-4 py-3">
                  {alert.condition === 'GREATER_THAN' ? 'Above' : 'Below'} {usd.format(alert.targetPrice)}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                      active ? 'bg-indigo-50 text-indigo-700' : 'bg-amber-50 text-amber-700'
                    }`}
                  >
                    {active ? 'Active' : 'Triggered'}
                  </span>
                </td>
                <td className="space-y-1 px-4 py-3 text-slate-600">
                  <Channel icon="✈️" value={alert.telegramChatId} result={alert.notifications?.telegram} />
                  <Channel icon="✉️" value={alert.emailAddress} result={alert.notifications?.email} />
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-slate-500">{formatDate(alert.createdAt)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-slate-500">
                  {alert.triggeredAt ? (
                    <>
                      {formatDate(alert.triggeredAt)}
                      <div className="text-xs">at {usd.format(alert.triggeredPrice)}</div>
                    </>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  {active && (
                    <button
                      type="button"
                      onClick={() => onDelete(alert)}
                      disabled={deletingId === alert.id}
                      className="rounded-md px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                    >
                      {deletingId === alert.id ? 'Deleting…' : 'Delete'}
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

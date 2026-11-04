const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000').replace(/\/$/, '');

async function request(path, options = {}) {
  let res;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...options.headers },
      cache: 'no-store',
    });
  } catch {
    throw new Error(`Cannot reach the server at ${API_URL}. Is it running?`);
  }

  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Request failed with status ${res.status}`);
  return body;
}

export const getAlerts = () => request('/api/alerts');

export const createAlert = (alert) =>
  request('/api/alerts', { method: 'POST', body: JSON.stringify(alert) });

export const deleteAlert = (id) => request(`/api/alerts/${id}`, { method: 'DELETE' });

export const getHealth = () => request('/api/health');

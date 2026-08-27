const json = async (url) => {
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error || `Request failed (${res.status})`);
  return body;
};

export const getTopics = () => json('/api/topics');

export function getBrief({ topics, address, from, to }) {
  const params = new URLSearchParams();
  params.set('topics', topics.join(','));
  if (address) params.set('address', address);
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  return json(`/api/brief?${params.toString()}`);
}

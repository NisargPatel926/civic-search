const DEFAULT_TIMEOUT_MS = 12000;

export class UpstreamError extends Error {
  constructor(provider, message, { status = 0, cause } = {}) {
    super(message);
    this.name = 'UpstreamError';
    this.provider = provider;
    this.status = status;
    this.cause = cause;
  }
}

/**
 * JSON fetch with a timeout and provider-tagged errors, so a single dead
 * upstream degrades one column of the brief instead of the whole request.
 */
export async function fetchJson(provider, url, { headers = {}, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(url, {
      headers: { accept: 'application/json', 'user-agent': 'civic-search/0.1 (+https://github.com/NisargPatel926/civic-search)', ...headers },
      signal: controller.signal
    });
  } catch (err) {
    clearTimeout(timer);
    const reason = err?.name === 'AbortError' ? `timed out after ${timeoutMs}ms` : err?.message || 'network error';
    throw new UpstreamError(provider, `${provider}: ${reason}`, { cause: err });
  }
  clearTimeout(timer);

  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON error page */
  }

  if (!res.ok) {
    const detail = body?.message || body?.error || body?.detail || res.statusText;
    throw new UpstreamError(provider, `${provider} responded ${res.status}: ${detail}`, { status: res.status });
  }
  return body;
}

export const qs = (params) => {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    search.set(k, String(v));
  }
  return search.toString();
};

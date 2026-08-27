import { config } from './config.js';

const store = new Map();

export function cacheGet(key) {
  const hit = store.get(key);
  if (!hit) return undefined;
  if (hit.expires < Date.now()) {
    store.delete(key);
    return undefined;
  }
  return hit.value;
}

export function cacheSet(key, value, ttlMs = config.cacheTtlMs) {
  store.set(key, { value, expires: Date.now() + ttlMs });
  // Cheap bound: this is a single-process demo server, not a cache tier.
  if (store.size > 500) {
    const oldest = [...store.entries()].sort((a, b) => a[1].expires - b[1].expires)[0];
    if (oldest) store.delete(oldest[0]);
  }
  return value;
}

/** Run `fn` once per key per TTL window; concurrent callers share the promise. */
export async function cached(key, fn, ttlMs) {
  const hit = cacheGet(key);
  if (hit !== undefined) return hit;
  const promise = (async () => fn())();
  cacheSet(key, promise, ttlMs);
  try {
    const value = await promise;
    cacheSet(key, value, ttlMs);
    return value;
  } catch (err) {
    store.delete(key);
    throw err;
  }
}

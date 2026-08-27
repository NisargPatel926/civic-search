import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Minimal .env loader: keeps `npm start` a plain `node` invocation and works on
 * every Node version we support, without pulling in a dependency.
 * Real environment variables always win over the file.
 */
function loadEnvFile() {
  const file = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.env');
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch {
    return;
  }
  for (const line of raw.split('\n')) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match || line.trimStart().startsWith('#')) continue;
    const key = match[1];
    if (process.env[key] !== undefined) continue;
    process.env[key] = match[2].trim().replace(/^(['"])(.*)\1$/, '$2');
  }
}

loadEnvFile();

const num = (value, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

export const config = {
  port: num(process.env.PORT, 3000),
  cacheTtlMs: num(process.env.CACHE_TTL_SECONDS, 900) * 1000,
  newsMaxLookbackDays: num(process.env.NEWS_MAX_LOOKBACK_DAYS, 30),
  keys: {
    news: (process.env.NEWS_API_KEY || '').trim(),
    congress: (process.env.CONGRESS_GOV_API_KEY || '').trim(),
    openstates: (process.env.OPENSTATES_API_KEY || '').trim()
  }
};

export const providerStatus = () => ({
  news: Boolean(config.keys.news),
  congress: Boolean(config.keys.congress),
  openstates: Boolean(config.keys.openstates)
});

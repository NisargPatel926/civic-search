import { cached } from '../cache.js';
import { fetchJson, qs } from '../http.js';
import { STATES, guessState } from '../data/states.js';

const CENSUS = 'https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress';

const pick = (geographies, matcher) => {
  const key = Object.keys(geographies || {}).find((k) => matcher.test(k));
  return key ? geographies[key]?.[0] : null;
};

/**
 * Address -> the jurisdictions that actually govern it.
 *
 * The Census geocoder is free, key-less, and returns congressional plus state
 * legislative districts in one call, which is exactly the set of handles the
 * legislator and bill lookups need.
 */
export async function geocode(address) {
  const clean = String(address || '').trim();
  if (!clean) return { ok: false, reason: 'empty', label: 'Nationwide', notices: [] };

  const url = `${CENSUS}?${qs({
    address: clean,
    benchmark: 'Public_AR_Current',
    vintage: 'Current_Current',
    layers: 'all',
    format: 'json'
  })}`;

  try {
    const body = await cached(`geo:${clean.toLowerCase()}`, () => fetchJson('Census geocoder', url), 24 * 3600 * 1000);
    const match = body?.result?.addressMatches?.[0];
    if (!match) return fallback(clean, 'The Census geocoder could not match that address; showing state-level results.');

    const g = match.geographies || {};
    const state = pick(g, /^States$/i);
    const county = pick(g, /^Counties$/i);
    const place = pick(g, /Incorporated Places|Census Designated Places/i);
    const cd = pick(g, /Congressional Districts/i);
    const upper = pick(g, /Upper Chamber/i);
    const lower = pick(g, /Lower Chamber/i);

    const stateAbbr = state?.STUSAB || guessState(clean);
    const districtCode = (cd?.BASENAME || cd?.CD119 || cd?.CD118 || '').replace(/^0+(?=\d)/, '');

    return {
      ok: true,
      matchedAddress: match.matchedAddress || clean,
      lat: match.coordinates?.y ?? null,
      lon: match.coordinates?.x ?? null,
      city: place?.BASENAME || place?.NAME || match.addressComponents?.city || null,
      county: county?.BASENAME ? `${county.BASENAME} County` : null,
      stateAbbr: stateAbbr || null,
      stateName: stateAbbr ? STATES[stateAbbr] || state?.NAME || null : state?.NAME || null,
      congressionalDistrict: districtCode || null,
      stateUpperDistrict: upper?.BASENAME || null,
      stateLowerDistrict: lower?.BASENAME || null,
      label: [place?.BASENAME || match.addressComponents?.city, stateAbbr].filter(Boolean).join(', ') || clean,
      notices: []
    };
  } catch (err) {
    return fallback(clean, `Address lookup unavailable (${err.message}); showing state-level results.`);
  }
}

function fallback(address, notice) {
  const stateAbbr = guessState(address);
  return {
    ok: false,
    matchedAddress: address,
    lat: null,
    lon: null,
    city: null,
    county: null,
    stateAbbr,
    stateName: stateAbbr ? STATES[stateAbbr] : null,
    congressionalDistrict: null,
    stateUpperDistrict: null,
    stateLowerDistrict: null,
    label: stateAbbr ? STATES[stateAbbr] : address || 'Nationwide',
    notices: [notice]
  };
}

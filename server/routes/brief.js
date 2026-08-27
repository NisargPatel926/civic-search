import { Router } from 'express';
import { TOPICS, resolveTopics, relatedTopics, internalConnections } from '../data/topics.js';
import { providerStatus } from '../config.js';
import { geocode } from '../services/geo.js';
import { fetchArticlesForTopics } from '../services/news.js';
import { fetchOfficials } from '../services/officials.js';
import { fetchFederalLegislation, fetchStateLegislation, sampleLegislation } from '../services/legislation.js';

export const router = Router();

const MAX_TOPICS = 5;
const DAY = 24 * 60 * 60 * 1000;
const isoDay = (d) => new Date(d).toISOString().slice(0, 10);
const validDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) && !Number.isNaN(Date.parse(s));

router.get('/topics', (_req, res) => {
  res.json({
    topics: TOPICS.map(({ id, label, short, blurb }) => ({ id, label, short, blurb })),
    providers: providerStatus()
  });
});

router.get('/brief', async (req, res) => {
  const requested = String(req.query.topics || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const topics = resolveTopics(requested).slice(0, MAX_TOPICS);
  if (!topics.length) {
    return res.status(400).json({
      error: 'Pick at least one topic.',
      known: TOPICS.map((t) => t.id)
    });
  }

  const notices = [];
  if (requested.length > topics.length) {
    notices.push(`Only the first ${MAX_TOPICS} recognised topics were used.`);
  }

  const to = validDate(req.query.to) ? isoDay(req.query.to) : isoDay(Date.now());
  let from = validDate(req.query.from) ? isoDay(req.query.from) : isoDay(Date.now() - 30 * DAY);
  if (Date.parse(from) > Date.parse(to)) {
    notices.push('Start date was after the end date, so the range was flipped.');
    [from] = [to];
  }
  const address = String(req.query.address || '').trim();

  const location = await geocode(address);
  notices.push(...(location.notices || []));

  const [articles, officials, federal, state] = await Promise.all([
    fetchArticlesForTopics(topics, { from, to }),
    address ? fetchOfficials(location) : Promise.resolve({ officials: [], notices: [] }),
    fetchFederalLegislation(topics),
    fetchStateLegislation(topics, location, { from, to })
  ]);

  const bills = [...federal.bills, ...state.bills];
  const laws = [...federal.laws, ...state.laws];

  if (federal.degraded) {
    const s = sampleLegislation(topics, location, 'federal');
    bills.push(...s.bills);
    laws.push(...s.laws);
    if (federal.reason === 'no-key') {
      notices.push('Federal bills are sample rows — set CONGRESS_GOV_API_KEY for live Congress.gov data.');
    }
  }
  if (state.degraded) {
    const s = sampleLegislation(topics, location, 'state');
    bills.push(...s.bills);
    laws.push(...s.laws);
    if (state.reason === 'no-key') {
      notices.push('State bills are sample rows — set OPENSTATES_API_KEY for live Open States data.');
    }
  }
  if (articles.degraded) {
    notices.push('Articles are sample rows — set NEWS_API_KEY for live coverage.');
  }
  if (!address) {
    notices.push('Add an address to see the officials and state bills for your locale.');
  }

  notices.push(...articles.notices, ...officials.notices, ...federal.notices, ...state.notices);

  res.json({
    query: { topics: topics.map((t) => t.id), address, from, to },
    generatedAt: new Date().toISOString(),
    location: {
      label: location.label,
      matchedAddress: location.matchedAddress || null,
      city: location.city,
      county: location.county,
      stateAbbr: location.stateAbbr,
      stateName: location.stateName,
      congressionalDistrict: location.congressionalDistrict,
      stateUpperDistrict: location.stateUpperDistrict,
      stateLowerDistrict: location.stateLowerDistrict,
      geocoded: location.ok
    },
    topics: topics.map(({ id, label, short, blurb }) => ({ id, label, short, blurb })),
    connections: {
      related: relatedTopics(topics.map((t) => t.id)).map(({ id, label, short, blurb, weight, why, via }) => ({
        id,
        label,
        short,
        blurb,
        weight,
        why,
        via
      })),
      internal: internalConnections(topics.map((t) => t.id))
    },
    articles: articles.articles,
    bills: sortByDate(bills),
    laws: sortByDate(laws),
    officials: officials.officials,
    providers: providerStatus(),
    notices: [...new Set(notices.filter(Boolean))]
  });
});

function sortByDate(items) {
  return [...items].sort((a, b) => {
    if (a.sample !== b.sample) return a.sample ? 1 : -1;
    return String(b.date || '').localeCompare(String(a.date || ''));
  });
}

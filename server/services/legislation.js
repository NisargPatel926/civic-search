import { config } from '../config.js';
import { cached } from '../cache.js';
import { fetchJson, qs } from '../http.js';

const CONGRESS_API = 'https://api.congress.gov/v3';
const OPENSTATES_BILLS = 'https://v3.openstates.org/bills';

/** Rough current Congress number from the year (a new Congress starts each odd January). */
export function currentCongress(date = new Date()) {
  const year = date.getUTCFullYear();
  return Math.floor((year - 1789) / 2) + 1 + (year % 2 === 0 ? 0 : 0);
}

const STAGE_RULES = [
  [/became public law|signed by (the )?president|public law no/i, 'enacted'],
  [/presented to president|passed(?: |\/agreed to in )both|cleared for white house/i, 'passedBoth'],
  [/passed\/agreed to in (house|senate)|passed (house|senate)|agreed to in (house|senate)/i, 'passedChamber'],
  [/reported by|ordered to be reported|markup/i, 'committee'],
  [/referred to|committee on/i, 'committee'],
  [/introduced|read twice/i, 'introduced']
];

export function stageFrom(actionText = '') {
  for (const [pattern, stage] of STAGE_RULES) {
    if (pattern.test(actionText)) return stage;
  }
  return 'introduced';
}

const matchesTopic = (text, keywords) => {
  const hay = String(text || '').toLowerCase();
  return keywords.some((k) => hay.includes(k.toLowerCase()));
};

/**
 * Federal bills for a topic.
 *
 * The Congress.gov API has no keyword search, so we pull the most recently
 * updated bills of the current Congress and filter on the topic vocabulary.
 * That favours currently-moving legislation, which is what the brief is about.
 */
async function fetchCongressList(path, params) {
  const url = `${CONGRESS_API}${path}?${qs({ ...params, api_key: config.keys.congress, format: 'json' })}`;
  const cacheKey = url.replace(config.keys.congress, 'KEY');
  return cached(cacheKey, () => fetchJson('Congress.gov', url));
}

function normalizeFederalBill(bill, topic, { law = false } = {}) {
  const action = bill.latestAction?.text || '';
  const stage = law ? 'enacted' : stageFrom(action);
  const number = `${bill.type} ${bill.number}`;
  return {
    id: `b:fed:${bill.congress}:${bill.type}:${bill.number}`,
    level: 'federal',
    topicId: topic.id,
    number,
    title: bill.title || number,
    summary: action || 'No recorded action yet.',
    stage,
    chamber: bill.originChamber || null,
    sponsor: bill.sponsors?.[0]?.fullName || null,
    date: bill.latestAction?.actionDate || bill.updateDate || null,
    citation: law && bill.laws?.[0] ? `${bill.laws[0].type} ${bill.laws[0].number}` : null,
    url: `https://www.congress.gov/bill/${bill.congress}th-congress/${
      bill.type?.toLowerCase().startsWith('h') ? 'house-bill' : 'senate-bill'
    }/${bill.number}`,
    sample: false
  };
}

export async function fetchFederalLegislation(topics, { limit = 6 } = {}) {
  if (!config.keys.congress) {
    return { bills: [], laws: [], notices: [], degraded: true, reason: 'no-key' };
  }
  const congress = currentCongress();
  const notices = [];
  try {
    const [recent, laws] = await Promise.all([
      fetchCongressList(`/bill/${congress}`, { sort: 'updateDate+desc', limit: 250 }),
      fetchCongressList(`/law/${congress}`, { limit: 100 }).catch(() => null)
    ]);

    const billPool = recent?.bills || [];
    const lawPool = laws?.bills || [];

    const bills = [];
    const passed = [];
    for (const topic of topics) {
      const keywords = [...(topic.congress?.keywords || []), topic.label];
      const hits = billPool
        .filter((b) => matchesTopic(`${b.title} ${b.latestAction?.text || ''}`, keywords))
        .slice(0, limit)
        .map((b) => normalizeFederalBill(b, topic));
      bills.push(...hits.filter((b) => b.stage !== 'enacted'));
      passed.push(...hits.filter((b) => b.stage === 'enacted'));

      passed.push(
        ...lawPool
          .filter((b) => matchesTopic(`${b.title} ${b.latestAction?.text || ''}`, keywords))
          .slice(0, limit)
          .map((b) => normalizeFederalBill(b, topic, { law: true }))
      );
    }

    if (!bills.length && !passed.length) {
      notices.push(
        `No federal bills in the ${congress}th Congress's recent activity matched these topics. Congress.gov has no keyword search, so this scans the most recently updated bills.`
      );
    }
    return { bills, laws: dedupe(passed), notices, degraded: false };
  } catch (err) {
    return { bills: [], laws: [], notices: [`Federal legislation unavailable (${err.message}).`], degraded: true, reason: 'error' };
  }
}

/** State legislation via Open States. */
export async function fetchStateLegislation(topics, location, { from, to, limit = 5 } = {}) {
  if (!config.keys.openstates) return { bills: [], laws: [], notices: [], degraded: true, reason: 'no-key' };
  if (!location?.stateName) return { bills: [], laws: [], notices: [], degraded: true, reason: 'no-location' };

  const results = await Promise.all(
    topics.map(async (topic) => {
      const url = `${OPENSTATES_BILLS}?${qs({
        jurisdiction: location.stateName,
        q: topic.openstates?.q || topic.label,
        sort: 'latest_action_desc',
        action_since: from ? String(from).slice(0, 10) : undefined,
        per_page: limit
      })}`;
      try {
        const body = await cached(`openstates:bills:${url}`, () =>
          fetchJson('Open States', url, { headers: { 'X-API-KEY': config.keys.openstates } })
        );
        return (body?.results || []).map((bill) => {
          const action = bill.latest_action_description || '';
          return {
            id: `b:state:${bill.id}`,
            level: 'state',
            topicId: topic.id,
            number: bill.identifier,
            title: bill.title || bill.identifier,
            summary: action || 'No recorded action yet.',
            stage: stageFrom(action),
            chamber: bill.from_organization?.name || null,
            sponsor: bill.sponsorships?.[0]?.name || null,
            date: bill.latest_action_date || null,
            citation: bill.session ? `${location.stateAbbr} · ${bill.session} session` : null,
            url: bill.openstates_url,
            sample: false
          };
        });
      } catch (err) {
        return { error: err.message };
      }
    })
  );

  const notices = [];
  const flat = [];
  for (const r of results) {
    if (Array.isArray(r)) flat.push(...r);
    else if (r?.error) notices.push(`State legislation unavailable (${r.error}).`);
  }
  return {
    bills: flat.filter((b) => b.stage !== 'enacted'),
    laws: flat.filter((b) => b.stage === 'enacted'),
    notices: [...new Set(notices)],
    degraded: false
  };
}

/**
 * Placeholder rows so the map and feed stay legible before keys are wired up.
 * These are explicitly labelled SAMPLE and carry no invented bill numbers.
 */
export function sampleLegislation(topics, location, level) {
  const where = level === 'federal' ? 'Congress' : location?.stateName || 'your state legislature';
  const searchUrl =
    level === 'federal'
      ? (t) => `https://www.congress.gov/search?q=${encodeURIComponent(t.label)}`
      : (t) =>
          `https://openstates.org/search/?query=${encodeURIComponent(t.label)}${
            location?.stateAbbr ? `&state=${location.stateAbbr.toLowerCase()}` : ''
          }`;

  const bills = topics.map((topic) => ({
    id: `b:${level}:sample:${topic.id}`,
    level,
    topicId: topic.id,
    number: 'SAMPLE',
    title: `${topic.label} legislation in ${where}`,
    summary:
      level === 'federal'
        ? 'Add CONGRESS_GOV_API_KEY to list the bills currently moving on this topic, with sponsor and latest action.'
        : 'Add OPENSTATES_API_KEY to list state bills on this topic, with sponsor and latest action.',
    stage: 'sample',
    chamber: null,
    sponsor: null,
    date: null,
    citation: null,
    url: searchUrl(topic),
    sample: true
  }));

  const laws = topics.slice(0, 2).map((topic) => ({
    id: `l:${level}:sample:${topic.id}`,
    level,
    topicId: topic.id,
    number: 'SAMPLE',
    title: `Past ${topic.label.toLowerCase()} law in ${where}`,
    summary: 'Enacted legislation appears here once an API key is configured, newest first.',
    stage: 'sample',
    chamber: null,
    sponsor: null,
    date: null,
    citation: null,
    url: searchUrl(topic),
    sample: true
  }));

  return { bills, laws };
}

function dedupe(items) {
  const seen = new Set();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

export { dedupe };

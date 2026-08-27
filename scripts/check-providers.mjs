/**
 * One-shot health check for every upstream this app talks to.
 *
 *   npm run check
 *
 * Prints a pass/fail line per provider plus the first record it managed to
 * parse, so a wrong key, a changed field name, or a blocked host is obvious
 * before you go looking through the UI for it.
 */
import { config, providerStatus } from '../server/config.js';
import { geocode } from '../server/services/geo.js';
import { fetchArticles } from '../server/services/news.js';
import { fetchFederalOfficials, fetchStateOfficials } from '../server/services/officials.js';
import { fetchFederalLegislation, fetchStateLegislation, currentCongress } from '../server/services/legislation.js';
import { getTopic } from '../server/data/topics.js';

const ADDRESS = process.argv[2] || '1200 Congress Ave, Austin, TX 78701';
const TOPIC = getTopic(process.argv[3] || 'climate');

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const DIM = '\x1b[2m';
const OFF = '\x1b[0m';

const line = (ok, name, detail) =>
  console.log(`${ok ? `${GREEN}  ok  ` : `${RED} fail `}${OFF} ${name.padEnd(24)} ${DIM}${detail}${OFF}`);

console.log(`\nChecking providers  ${DIM}address="${ADDRESS}"  topic=${TOPIC.id}  congress=${currentCongress()}${OFF}\n`);

const keys = providerStatus();
for (const [name, present] of Object.entries(keys)) {
  console.log(`${DIM}  key ${name.padEnd(22)} ${present ? 'set' : 'missing'}${OFF}`);
}
console.log();

const location = await geocode(ADDRESS);
line(
  location.ok,
  'Census geocoder',
  location.ok
    ? `${location.city || location.county}, ${location.stateAbbr} · CD ${location.congressionalDistrict} · SLDU ${location.stateUpperDistrict} · SLDL ${location.stateLowerDistrict}`
    : location.notices[0]
);

const news = await fetchArticles(TOPIC, { from: undefined, to: undefined, pageSize: 3 });
line(
  !news.degraded,
  'NewsAPI',
  news.degraded ? news.notices[0] || 'no key' : `${news.total} results · latest: ${news.articles[0]?.title?.slice(0, 60)}`
);

const fed = await fetchFederalOfficials(location);
line(
  fed.officials.length > 0,
  'congress-legislators',
  fed.officials.length ? fed.officials.map((o) => o.name).join(', ') : fed.notices[0] || 'no match'
);

const state = await fetchStateOfficials(location);
const liveState = state.officials.filter((o) => !o.sample);
line(
  liveState.length > 0,
  'Open States (people)',
  liveState.length ? liveState.map((o) => o.name).join(', ') : state.notices[0] || 'no key'
);

const federalBills = await fetchFederalLegislation([TOPIC]);
line(
  !federalBills.degraded,
  'Congress.gov',
  federalBills.degraded
    ? federalBills.notices[0] || 'no key'
    : `${federalBills.bills.length} bills, ${federalBills.laws.length} laws · ${federalBills.bills[0]?.number || federalBills.notices[0] || ''}`
);

const stateBills = await fetchStateLegislation([TOPIC], location, {});
line(
  !stateBills.degraded && stateBills.bills.length + stateBills.laws.length > 0,
  'Open States (bills)',
  stateBills.degraded
    ? 'no key or no location'
    : stateBills.notices[0] ||
      `${stateBills.bills.length} bills, ${stateBills.laws.length} laws · ${stateBills.bills[0]?.number || 'no keyword match'}`
);

console.log(
  `\n${DIM}Anything marked fail above is either a missing key, a blocked host, or a provider change.${OFF}\n`
);
if (!config.keys.news) console.log(`${DIM}Tip: copy .env.example to .env and fill in your keys.${OFF}\n`);

import { config } from '../config.js';
import { cached } from '../cache.js';
import { fetchJson, qs } from '../http.js';

const LEGISLATORS_URL = 'https://unitedstates.github.io/congress-legislators/legislators-current.json';
const PHOTO = (bioguide) => `https://theunitedstates.io/images/congress/225x275/${bioguide}.jpg`;
const OPENSTATES_GEO = 'https://v3.openstates.org/people.geo';

const PARTY_LABEL = { D: 'Democrat', R: 'Republican', I: 'Independent' };

const currentTerm = (legislator) => legislator.terms?.[legislator.terms.length - 1] || {};

/** Sitting senators + the House member for this district. Key-less and free. */
export async function fetchFederalOfficials(location) {
  if (!location?.stateAbbr) return { officials: [], notices: [] };

  let all;
  try {
    all = await cached('congress-legislators', () => fetchJson('congress-legislators', LEGISLATORS_URL), 12 * 3600 * 1000);
  } catch (err) {
    return { officials: [], notices: [`Federal legislator directory unavailable (${err.message}).`] };
  }

  const notices = [];
  const matches = all.filter((leg) => {
    const term = currentTerm(leg);
    if (term.state !== location.stateAbbr) return false;
    if (term.type === 'sen') return true;
    if (term.type !== 'rep') return false;
    if (location.congressionalDistrict == null) return false;
    return String(term.district) === String(location.congressionalDistrict);
  });

  if (location.congressionalDistrict == null) {
    notices.push('Without a matched street address we can show your senators but not your House member.');
  }

  const officials = matches.map((leg) => {
    const term = currentTerm(leg);
    const bioguide = leg.id?.bioguide;
    const isSenator = term.type === 'sen';
    return {
      id: `p:fed:${bioguide}`,
      level: 'federal',
      name: leg.name?.official_full || `${leg.name?.first} ${leg.name?.last}`,
      role: isSenator
        ? `U.S. Senator, ${location.stateName || term.state}`
        : `U.S. Representative, ${term.state}-${term.district}`,
      party: PARTY_LABEL[term.party?.[0]] || term.party || null,
      chamber: isSenator ? 'Senate' : 'House',
      photo: bioguide ? PHOTO(bioguide) : null,
      phone: term.phone || null,
      office: term.office || null,
      website: term.url || null,
      contactForm: term.contact_form || null,
      email: null,
      social: {
        twitter: leg.social?.twitter || null,
        bioguide
      },
      sample: false
    };
  });

  // Senators first, then the House member — the order people actually call in.
  officials.sort((a, b) => (a.chamber === b.chamber ? a.name.localeCompare(b.name) : a.chamber === 'Senate' ? -1 : 1));
  return { officials, notices };
}

/** State legislators (and, where Open States has them, some local officials). */
export async function fetchStateOfficials(location) {
  if (!config.keys.openstates) {
    return {
      officials: [
        {
          id: 'p:state:sample',
          level: 'state',
          name: 'Your state legislators',
          role: location.stateName ? `${location.stateName} Legislature` : 'State Legislature',
          party: null,
          chamber: 'State',
          photo: null,
          phone: null,
          website: 'https://openstates.org/find_your_legislator/',
          contactForm: null,
          email: null,
          social: {},
          sample: true,
          note: 'Add OPENSTATES_API_KEY to load your state senator and representative with contact details.'
        }
      ],
      notices: []
    };
  }
  if (location.lat == null || location.lon == null) {
    return { officials: [], notices: ['State legislators need a geocoded address.'] };
  }

  const url = `${OPENSTATES_GEO}?${qs({ lat: location.lat, lng: location.lon })}`;
  try {
    const body = await cached(`openstates:geo:${location.lat},${location.lon}`, () =>
      fetchJson('Open States', url, { headers: { 'X-API-KEY': config.keys.openstates } })
    );
    const officials = (body?.results || []).map((person) => {
      const office = (person.offices || []).find((o) => o.voice) || {};
      return {
        id: `p:state:${person.id}`,
        level: (person.jurisdiction?.classification === 'municipality' ? 'local' : 'state'),
        name: person.name,
        role: [person.current_role?.title, person.current_role?.district && `District ${person.current_role.district}`, person.jurisdiction?.name]
          .filter(Boolean)
          .join(' · '),
        party: person.party || person.current_role?.party || null,
        chamber: person.current_role?.org_classification || 'State',
        photo: person.image || null,
        phone: office.voice || null,
        office: office.address || null,
        website: person.openstates_url || null,
        contactForm: null,
        email: person.email || null,
        social: {},
        sample: false
      };
    });
    return { officials, notices: officials.length ? [] : ['Open States returned no legislators for that point.'] };
  } catch (err) {
    return { officials: [], notices: [`State legislator lookup failed (${err.message}).`] };
  }
}

/**
 * There is no free nationwide API for city councils and mayors — Google's Civic
 * Information representatives endpoint was retired in 2025 — so rather than
 * invent an officeholder we point at the place's own directory.
 */
export function localOfficialsPlaceholder(location) {
  const place = location.city || location.county || location.stateName;
  if (!place) return { officials: [], notices: [] };
  const query = encodeURIComponent(`${place} city council members contact`);
  return {
    officials: [
      {
        id: 'p:local:sample',
        level: 'local',
        name: `${place} city & county officials`,
        role: 'Mayor, council, school board',
        party: null,
        chamber: 'Local',
        photo: null,
        phone: null,
        website: `https://www.google.com/search?q=${query}`,
        contactForm: null,
        email: null,
        social: {},
        sample: true,
        note: 'No free nationwide API publishes city council rosters. This card links to your local directory; wire up a municipal source to replace it.'
      }
    ],
    notices: []
  };
}

export async function fetchOfficials(location) {
  const [federal, state] = await Promise.all([fetchFederalOfficials(location), fetchStateOfficials(location)]);
  const local = localOfficialsPlaceholder(location);
  return {
    officials: [...federal.officials, ...state.officials, ...local.officials],
    notices: [...federal.notices, ...state.notices, ...local.notices]
  };
}

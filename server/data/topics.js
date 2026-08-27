/**
 * The civic topic taxonomy.
 *
 * Each topic carries the query vocabulary every upstream provider needs:
 *   news       — a NewsAPI boolean query
 *   congress   — Congress.gov policy areas + keywords for federal bills/laws
 *   openstates — Open States subjects + a query string for state legislation
 *
 * `CONNECTIONS` is the edge list behind "how other topics connect to yours".
 * Edges are undirected; `weight` (0-1) drives edge thickness in the graph and
 * `why` is shown to the reader, because an unexplained line between two issues
 * is just decoration.
 */

export const TOPICS = [
  {
    id: 'climate',
    label: 'Climate change',
    short: 'Climate',
    blurb: 'Emissions, extreme weather, and the energy transition.',
    news: '("climate change" OR "global warming" OR "carbon emissions" OR "clean energy transition")',
    congress: { policyArea: 'Environmental Protection', keywords: ['climate', 'emissions', 'greenhouse gas'] },
    openstates: { subjects: ['Environmental'], q: 'climate emissions' }
  },
  {
    id: 'energy',
    label: 'Energy & utilities',
    short: 'Energy',
    blurb: 'Grid reliability, utility rates, solar, wind, and nuclear.',
    news: '(("renewable energy" OR "solar power" OR "utility rates" OR "power grid") NOT sports)',
    congress: { policyArea: 'Energy', keywords: ['electric grid', 'renewable energy', 'utility'] },
    openstates: { subjects: ['Energy'], q: 'energy utility grid' }
  },
  {
    id: 'gun-violence',
    label: 'Gun violence',
    short: 'Guns',
    blurb: 'Firearm deaths, background checks, and violence prevention.',
    news: '("gun violence" OR "gun control" OR "firearm legislation" OR "mass shooting")',
    congress: { policyArea: 'Crime and Law Enforcement', keywords: ['firearm', 'gun'] },
    openstates: { subjects: ['Guns'], q: 'firearm' }
  },
  {
    id: 'affordability',
    label: 'Cost of living',
    short: 'Affordability',
    blurb: 'Inflation, wages, groceries, childcare, and household budgets.',
    news: '("cost of living" OR "inflation" OR "grocery prices" OR "affordability crisis")',
    congress: { policyArea: 'Economics and Public Finance', keywords: ['cost of living', 'inflation', 'consumer prices'] },
    openstates: { subjects: ['Commerce'], q: 'cost of living consumer prices' }
  },
  {
    id: 'housing',
    label: 'Housing & homelessness',
    short: 'Housing',
    blurb: 'Rent, zoning, home prices, evictions, and shelter capacity.',
    news: '("affordable housing" OR "rent increases" OR "homelessness" OR "zoning reform")',
    congress: { policyArea: 'Housing and Community Development', keywords: ['affordable housing', 'rental', 'homeless'] },
    openstates: { subjects: ['Housing and Property'], q: 'housing rent zoning' }
  },
  {
    id: 'healthcare',
    label: 'Health care',
    short: 'Health',
    blurb: 'Coverage, premiums, drug prices, hospitals, and public health.',
    news: '("health care costs" OR "health insurance" OR "prescription drug prices" OR "Medicaid")',
    congress: { policyArea: 'Health', keywords: ['health insurance', 'prescription drug', 'Medicaid'] },
    openstates: { subjects: ['Health'], q: 'health insurance medicaid' }
  },
  {
    id: 'education',
    label: 'Education',
    short: 'Education',
    blurb: 'School funding, curriculum, teacher pay, and student debt.',
    news: '("public schools" OR "school funding" OR "student debt" OR "teacher shortage")',
    congress: { policyArea: 'Education', keywords: ['school', 'student loan', 'education funding'] },
    openstates: { subjects: ['Education'], q: 'school funding education' }
  },
  {
    id: 'transit',
    label: 'Transit & infrastructure',
    short: 'Transit',
    blurb: 'Buses, trains, roads, bridges, and street safety.',
    news: '("public transit" OR "transportation funding" OR "infrastructure bill" OR "traffic safety")',
    congress: { policyArea: 'Transportation and Public Works', keywords: ['transit', 'highway', 'infrastructure'] },
    openstates: { subjects: ['Transportation'], q: 'transit transportation' }
  },
  {
    id: 'immigration',
    label: 'Immigration',
    short: 'Immigration',
    blurb: 'Border policy, visas, asylum, and immigrant communities.',
    news: '("immigration policy" OR "asylum seekers" OR "border security" OR "visa backlog")',
    congress: { policyArea: 'Immigration', keywords: ['immigration', 'asylum', 'visa'] },
    openstates: { subjects: ['Immigration'], q: 'immigration' }
  },
  {
    id: 'criminal-justice',
    label: 'Criminal justice',
    short: 'Justice',
    blurb: 'Policing, courts, sentencing, and reentry.',
    news: '("criminal justice reform" OR "police accountability" OR "sentencing reform" OR "prison conditions")',
    congress: { policyArea: 'Crime and Law Enforcement', keywords: ['policing', 'sentencing', 'incarceration'] },
    openstates: { subjects: ['Crime'], q: 'police sentencing' }
  },
  {
    id: 'labor',
    label: 'Jobs & labor',
    short: 'Labor',
    blurb: 'Wages, unions, workplace safety, and unemployment.',
    news: '("minimum wage" OR "labor union" OR "workers rights" OR "layoffs")',
    congress: { policyArea: 'Labor and Employment', keywords: ['minimum wage', 'labor union', 'worker'] },
    openstates: { subjects: ['Labor and Employment'], q: 'wage labor worker' }
  },
  {
    id: 'reproductive-rights',
    label: 'Reproductive rights',
    short: 'Reproductive',
    blurb: 'Abortion access, contraception, and maternal health.',
    news: '("abortion access" OR "reproductive rights" OR "maternal health" OR "contraception policy")',
    congress: { policyArea: 'Health', keywords: ['abortion', 'reproductive health', 'maternal'] },
    openstates: { subjects: ['Reproductive Rights'], q: 'abortion reproductive' }
  },
  {
    id: 'voting',
    label: 'Voting & democracy',
    short: 'Democracy',
    blurb: 'Election administration, redistricting, and ballot access.',
    news: '("voting rights" OR "election administration" OR "redistricting" OR "ballot access")',
    congress: { policyArea: 'Government Operations and Politics', keywords: ['voting', 'election', 'redistricting'] },
    openstates: { subjects: ['Elections'], q: 'voting elections redistricting' }
  },
  {
    id: 'tech-ai',
    label: 'Technology & AI',
    short: 'Tech & AI',
    blurb: 'AI rules, privacy, broadband, and platform accountability.',
    news: '("artificial intelligence regulation" OR "data privacy law" OR "broadband access" OR "tech antitrust")',
    congress: { policyArea: 'Science, Technology, Communications', keywords: ['artificial intelligence', 'data privacy', 'broadband'] },
    openstates: { subjects: ['Technology'], q: 'artificial intelligence privacy broadband' }
  }
];

export const CONNECTIONS = [
  ['climate', 'energy', 0.95, 'Emissions targets are set and missed in energy policy — the grid is where climate law lands.'],
  ['climate', 'housing', 0.55, 'Where and how homes get built determines flood exposure, cooling costs, and driving miles.'],
  ['climate', 'transit', 0.7, 'Transportation is the largest source of U.S. emissions, so transit funding is climate funding.'],
  ['climate', 'healthcare', 0.45, 'Heat waves, wildfire smoke, and vector-borne illness arrive first at emergency rooms.'],
  ['climate', 'affordability', 0.5, 'Disaster losses and insurance withdrawals show up on household bills.'],
  ['energy', 'affordability', 0.7, 'Utility rate cases decide a fixed monthly cost for every household in the service area.'],
  ['energy', 'labor', 0.5, 'Plant closures and clean-energy buildouts move the same regional job base.'],
  ['energy', 'tech-ai', 0.45, 'Data-center demand is now a first-order driver of new electricity load.'],
  ['affordability', 'housing', 0.95, 'Rent or mortgage is the single largest line in most household budgets.'],
  ['affordability', 'healthcare', 0.7, 'Premiums, deductibles, and drug costs are cost-of-living items, not just health items.'],
  ['affordability', 'labor', 0.8, 'Wages are the other half of every affordability figure.'],
  ['affordability', 'education', 0.55, 'Childcare and student debt shape what families can afford for decades.'],
  ['affordability', 'transit', 0.5, 'A household without transit options carries the full cost of car ownership.'],
  ['housing', 'transit', 0.65, 'Zoning near transit decides who can live within reach of a job.'],
  ['housing', 'criminal-justice', 0.45, 'Eviction and housing instability are among the strongest predictors of justice-system contact.'],
  ['housing', 'education', 0.5, 'School assignment follows address, so housing policy is school policy.'],
  ['housing', 'immigration', 0.35, 'Population growth from migration meets a fixed housing supply at the local level.'],
  ['gun-violence', 'criminal-justice', 0.9, 'Enforcement, courts, and sentencing are the machinery most gun laws run through.'],
  ['gun-violence', 'healthcare', 0.7, 'Firearm injury is a leading cause of death for young people and a trauma-care cost center.'],
  ['gun-violence', 'education', 0.6, 'School safety spending and drills come out of the same district budgets.'],
  ['gun-violence', 'housing', 0.4, 'Community violence concentrates in a small number of blocks, tracking disinvestment.'],
  ['healthcare', 'reproductive-rights', 0.8, 'Clinic access, provider licensing, and Medicaid coverage are shared terrain.'],
  ['healthcare', 'labor', 0.6, 'Most working-age coverage is still attached to a job.'],
  ['healthcare', 'immigration', 0.4, 'Eligibility rules decide who can use public coverage and who staffs the care workforce.'],
  ['education', 'labor', 0.5, 'Workforce training and teacher bargaining sit on both sides of this line.'],
  ['education', 'voting', 0.35, 'School boards are the most local elected office most people never vote for.'],
  ['criminal-justice', 'voting', 0.5, 'Felony disenfranchisement rules decide who is on the rolls.'],
  ['criminal-justice', 'immigration', 0.55, 'Detention, local-federal cooperation, and deportation triggers overlap directly.'],
  ['criminal-justice', 'tech-ai', 0.45, 'Facial recognition, predictive policing, and evidence tooling are being litigated now.'],
  ['labor', 'immigration', 0.6, 'Work authorization sets the terms for whole regional industries.'],
  ['labor', 'tech-ai', 0.65, 'Automation and algorithmic management are the fastest-moving labor questions.'],
  ['voting', 'tech-ai', 0.5, 'Synthetic media and election-information rules are converging.'],
  ['voting', 'reproductive-rights', 0.4, 'Ballot measures have become the primary vehicle for abortion policy in many states.'],
  ['transit', 'labor', 0.4, 'Operator staffing and construction trades set what service can actually run.'],
  ['tech-ai', 'education', 0.4, 'Classroom AI policy and digital access are now district-level decisions.']
];

const byId = new Map(TOPICS.map((t) => [t.id, t]));

export function getTopic(id) {
  return byId.get(id) || null;
}

export function resolveTopics(ids) {
  return (ids || []).map((id) => byId.get(id)).filter(Boolean);
}

/** Topics adjacent to `ids` but not already selected, strongest link first. */
export function relatedTopics(ids, limit = 6) {
  const selected = new Set(ids);
  const scores = new Map();
  for (const [a, b, weight, why] of CONNECTIONS) {
    const pairs = [
      [a, b],
      [b, a]
    ];
    for (const [from, to] of pairs) {
      if (!selected.has(from) || selected.has(to)) continue;
      const prev = scores.get(to);
      if (!prev || weight > prev.weight) scores.set(to, { weight, why, via: from });
    }
  }
  return [...scores.entries()]
    .map(([id, meta]) => ({ ...byId.get(id), ...meta }))
    .filter((t) => t.label)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, limit);
}

/** Edges among the selected topics themselves, for the multi-topic view. */
export function internalConnections(ids) {
  const selected = new Set(ids);
  return CONNECTIONS.filter(([a, b]) => selected.has(a) && selected.has(b)).map(([a, b, weight, why]) => ({
    source: a,
    target: b,
    weight,
    why
  }));
}

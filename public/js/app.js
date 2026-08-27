import { getTopics, getBrief } from './api.js';
import { buildGraph, renderGraph, LEGEND, PALETTE } from './graph.js';

const DAY = 86400000;
const MAX_TOPICS = 5;
const STORE_KEY = 'civic-search:last-query';

const $ = (sel) => document.querySelector(sel);
const iso = (d) => new Date(d).toISOString().slice(0, 10);

const state = {
  catalog: [],
  providers: {},
  selected: [],
  address: '',
  from: iso(Date.now() - 30 * DAY),
  to: iso(Date.now()),
  preset: '30',
  scope: 'all',
  focusTopicId: null,
  activeId: null,
  hoveredId: null,
  brief: null,
  loading: false
};

const els = {
  form: $('#query-form'),
  chips: $('#topic-chips'),
  address: $('#address'),
  preset: $('#range-preset'),
  custom: $('#range-custom'),
  from: $('#date-from'),
  to: $('#date-to'),
  rangeNote: $('#range-note'),
  explore: $('#explore'),
  title: $('#results-title'),
  place: $('#results-place'),
  scopeTabs: $('#scope-tabs'),
  scopeHint: $('#scope-hint'),
  notices: $('#notices'),
  focusSwitch: $('#focus-switch'),
  feed: $('#feed'),
  legend: $('#legend'),
  mapHint: $('#map-hint'),
  graph: {
    edgeLayer: $('#graph-edges'),
    nodeLayer: $('#graph-nodes'),
    labelLayer: $('#graph-labels')
  },
  mastheadDate: $('#masthead-date'),
  mastheadPlace: $('#masthead-place'),
  mastheadSources: $('#masthead-sources')
};

const SCOPES = [
  { id: 'all', label: 'All levels', hint: 'Everything we found, from Congress down to city hall.' },
  { id: 'federal', label: 'National', hint: 'Federal bills, laws, and members of Congress.' },
  { id: 'state', label: 'State', hint: 'State legislature bills and your state legislators.' },
  { id: 'local', label: 'Local', hint: 'City and county officials and any local measures we can reach.' }
];

const STAGE = {
  introduced: { label: 'Introduced', cls: 'tag--progress' },
  committee: { label: 'In committee', cls: 'tag--progress' },
  passedChamber: { label: 'Passed one chamber', cls: 'tag--progress' },
  passedBoth: { label: 'Passed both chambers', cls: 'tag--passed' },
  enacted: { label: 'Enacted', cls: 'tag--passed' },
  sample: { label: 'Sample', cls: 'tag--sample' }
};

const LEVEL = { federal: 'Federal', state: 'State', local: 'Local' };

/* ------------------------------- utilities ------------------------------- */

const escapeHtml = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function formatDate(value, { long = false } = {}) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString('en-US', long ? { year: 'numeric', month: 'long', day: 'numeric' } : { year: 'numeric', month: 'short', day: 'numeric' });
}

function relativeDays(value) {
  if (!value) return null;
  const days = Math.round((Date.now() - new Date(value).getTime()) / DAY);
  if (Number.isNaN(days)) return null;
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  if (days < 365) return `${Math.round(days / 30)} months ago`;
  return `${Math.round(days / 365)} years ago`;
}

/* --------------------------------- query --------------------------------- */

function readUrlState() {
  const params = new URLSearchParams(location.search);
  const stored = (() => {
    try {
      return JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    } catch {
      return null;
    }
  })();
  const source = params.has('topics') ? Object.fromEntries(params) : stored || {};
  if (source.topics) state.selected = String(source.topics).split(',').filter(Boolean).slice(0, MAX_TOPICS);
  if (source.address) state.address = source.address;
  if (source.from) state.from = source.from;
  if (source.to) state.to = source.to;
  if (source.preset) state.preset = String(source.preset);
  if (source.scope) state.scope = source.scope;
}

function persist() {
  const payload = {
    topics: state.selected.join(','),
    address: state.address,
    from: state.from,
    to: state.to,
    preset: state.preset,
    scope: state.scope
  };
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(payload));
  } catch {
    /* private mode */
  }
  const params = new URLSearchParams();
  if (payload.topics) params.set('topics', payload.topics);
  if (payload.address) params.set('address', payload.address);
  params.set('from', payload.from);
  params.set('to', payload.to);
  history.replaceState(null, '', `${location.pathname}?${params.toString()}`);
}

function applyPreset() {
  const value = els.preset.value;
  state.preset = value;
  const custom = value === 'custom';
  els.custom.hidden = !custom;
  if (!custom) {
    state.to = iso(Date.now());
    state.from = iso(Date.now() - Number(value) * DAY);
    els.from.value = state.from;
    els.to.value = state.to;
  }
  updateRangeNote();
}

function updateRangeNote() {
  const span = `${formatDate(state.from)} – ${formatDate(state.to)}`;
  const limit = Number(state.preset) > 30 || state.preset === 'custom';
  els.rangeNote.textContent = limit
    ? `${span}. NewsAPI developer keys only reach back about 30 days; longer ranges are clamped for articles.`
    : span;
}

/* --------------------------------- chips --------------------------------- */

function renderChips() {
  els.chips.replaceChildren();
  for (const topic of state.catalog) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip';
    chip.textContent = topic.label;
    chip.title = topic.blurb;
    chip.setAttribute('aria-pressed', String(state.selected.includes(topic.id)));
    chip.addEventListener('click', () => toggleTopic(topic.id));
    els.chips.append(chip);
  }
}

function toggleTopic(id, { run = false } = {}) {
  const at = state.selected.indexOf(id);
  if (at >= 0) state.selected.splice(at, 1);
  else if (state.selected.length < MAX_TOPICS) state.selected.push(id);
  else {
    state.selected.shift();
    state.selected.push(id);
  }
  if (!state.selected.includes(state.focusTopicId)) state.focusTopicId = state.selected[0] || null;
  renderChips();
  if (run) submit();
}

/* -------------------------------- fetching -------------------------------- */

async function submit(event) {
  event?.preventDefault();
  state.address = els.address.value.trim();
  if (state.preset === 'custom') {
    state.from = els.from.value || state.from;
    state.to = els.to.value || state.to;
  }
  updateRangeNote();

  if (!state.selected.length) {
    els.title.textContent = 'Pick at least one topic to begin';
    els.feed.innerHTML = '<p class="placeholder-note">Choose an issue above — add your address to pull in the bills and officials for your districts.</p>';
    return;
  }

  persist();
  state.loading = true;
  els.explore.disabled = true;
  els.explore.textContent = 'Reading…';
  els.feed.classList.add('is-loading');

  try {
    const brief = await getBrief({ topics: state.selected, address: state.address, from: state.from, to: state.to });
    state.brief = brief;
    state.activeId = null;
    state.hoveredId = null;
    if (!brief.topics.some((t) => t.id === state.focusTopicId)) state.focusTopicId = brief.topics[0]?.id || null;
    render();
  } catch (err) {
    els.notices.hidden = false;
    els.notices.innerHTML = `<p class="notices__title">Could not build your brief</p><ul><li>${escapeHtml(err.message)}</li></ul>`;
  } finally {
    state.loading = false;
    els.explore.disabled = false;
    els.explore.textContent = 'Explore';
    els.feed.classList.remove('is-loading');
  }
}

/* -------------------------------- rendering -------------------------------- */

function render() {
  const brief = state.brief;
  if (!brief) return;

  const titles = brief.topics.map((t) => t.label);
  els.title.textContent = titles.join(' · ');

  const place = brief.location?.label && brief.query.address ? brief.location.label : null;
  els.place.hidden = !place;
  if (place) {
    const district = brief.location.congressionalDistrict ? ` · ${brief.location.stateAbbr}-${brief.location.congressionalDistrict}` : '';
    els.place.textContent = `${place}${district}`;
  }
  els.mastheadPlace.textContent = place ? `${place}` : 'No address yet';
  const live = Object.entries(brief.providers || {}).filter(([, on]) => on).map(([k]) => k);
  els.mastheadSources.textContent = live.length ? `Live: ${live.join(', ')}` : 'Sample edition';

  renderScopes();
  renderNotices(brief.notices);
  renderFocusSwitch();
  renderMap();
  renderFeed();
}

function renderScopes() {
  els.scopeTabs.replaceChildren();
  for (const scope of SCOPES) {
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.className = 'scope';
    tab.role = 'tab';
    tab.textContent = scope.label;
    tab.setAttribute('aria-selected', String(scope.id === state.scope));
    tab.addEventListener('click', () => {
      state.scope = scope.id;
      state.activeId = null;
      persist();
      renderScopes();
      renderMap();
      renderFeed();
    });
    els.scopeTabs.append(tab);
  }
  els.scopeHint.textContent = SCOPES.find((s) => s.id === state.scope)?.hint || '';
}

function renderNotices(notices = []) {
  if (!notices.length) {
    els.notices.hidden = true;
    els.notices.replaceChildren();
    return;
  }
  els.notices.hidden = false;
  els.notices.innerHTML = `<p class="notices__title">About this data</p><ul>${notices
    .map((n) => `<li>${escapeHtml(n)}</li>`)
    .join('')}</ul>`;
}

function renderFocusSwitch() {
  const topics = state.brief.topics;
  els.focusSwitch.hidden = topics.length < 2;
  els.focusSwitch.replaceChildren();
  if (topics.length < 2) return;
  for (const topic of topics) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'focus-switch__btn';
    btn.textContent = topic.short || topic.label;
    btn.setAttribute('aria-pressed', String(topic.id === state.focusTopicId));
    btn.addEventListener('click', () => {
      state.focusTopicId = topic.id;
      state.activeId = null;
      renderFocusSwitch();
      renderMap();
      renderFeed();
    });
    els.focusSwitch.append(btn);
  }
}

let graphCtl = null;

function renderMap() {
  const model = buildGraph(state.brief, { focusTopicId: state.focusTopicId, scope: state.scope });

  graphCtl = renderGraph(els.graph, model, {
    onSelect: (node) => {
      if (node.kind === 'topic') {
        toggleTopic(node.id, { run: true });
        return;
      }
      focusItem(node.scrollTo || node.id);
    },
    onHover: (node) => {
      state.hoveredId = node?.id || null;
      updateHighlight();
    }
  });

  renderLegend();
  updateHighlight();
}

/** Hover and pin only repaint attributes, never the SVG itself. */
function updateHighlight() {
  graphCtl?.setHighlight(state.hoveredId || state.activeId);
  highlightCards();
  els.mapHint.textContent = state.activeId ? 'Click another node to move the pin' : 'Hover to preview · click to pin';
}

function renderLegend() {
  els.legend.replaceChildren();
  for (const item of LEGEND) {
    const wrap = document.createElement('div');
    wrap.className = 'legend__item';
    wrap.innerHTML = `<svg class="legend__swatch" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="7" fill="${item.fill}" stroke="${item.stroke}" stroke-width="2"${
      item.dashed ? ' stroke-dasharray="3 2.5"' : ''
    } /></svg><span>${escapeHtml(item.label)}</span>`;
    els.legend.append(wrap);
  }
}

/* ---------------------------------- feed ---------------------------------- */

function currentSections() {
  const brief = state.brief;
  const focus = state.focusTopicId;
  const inScope = (item) => state.scope === 'all' || item.level === state.scope;
  const forTopic = (item) => !item.topicId || item.topicId === focus;

  return [
    {
      id: 'cat-articles',
      title: 'Knowledge to review',
      empty: 'No articles matched this topic and date range.',
      items: brief.articles.filter(forTopic),
      render: articleCard
    },
    {
      id: 'cat-bills',
      title: 'Bills in progress',
      empty: 'No bills currently moving that we can see at this level.',
      items: brief.bills.filter(forTopic).filter(inScope),
      render: billCard
    },
    {
      id: 'cat-laws',
      title: 'Past legislation',
      empty: 'No enacted legislation found at this level.',
      items: brief.laws.filter(forTopic).filter(inScope),
      render: billCard
    },
    {
      id: 'cat-people',
      title: 'People to contact',
      empty: state.address ? 'No officials found for this level.' : 'Add your address to see who represents you.',
      items: brief.officials.filter(inScope),
      render: personCard
    },
    {
      id: 'cat-topics',
      title: 'Connected issues',
      empty: 'No related issues in the taxonomy.',
      items: brief.connections.related,
      render: topicCard
    }
  ];
}

function renderFeed() {
  els.feed.replaceChildren();
  const tpl = document.getElementById('tpl-section');

  for (const section of currentSections()) {
    const node = tpl.content.cloneNode(true);
    const root = node.querySelector('.feed__section');
    root.id = section.id;
    node.querySelector('.feed__title').textContent = section.title;
    node.querySelector('.feed__count').textContent = section.items.length ? `${section.items.length}` : '—';
    const cards = node.querySelector('.feed__cards');

    if (!section.items.length) {
      const empty = document.createElement('p');
      empty.className = 'empty';
      empty.textContent = section.empty;
      cards.append(empty);
    } else {
      for (const item of section.items) cards.append(section.render(item));
    }
    els.feed.append(node);
  }
  highlightCards();
}

function cardShell(item, className = '') {
  const card = document.createElement('article');
  card.className = `card ${className}`.trim();
  card.id = `card-${item.id}`;
  card.dataset.nodeId = item.id;
  card.addEventListener('click', (event) => {
    if (event.target.closest('a')) return;
    focusItem(item.id);
  });
  card.addEventListener('mouseenter', () => {
    state.hoveredId = item.id;
    updateHighlight();
  });
  card.addEventListener('mouseleave', () => {
    state.hoveredId = null;
    updateHighlight();
  });
  return card;
}

const sampleTag = (item) => (item.sample ? '<span class="tag tag--sample">Sample</span>' : '');

function articleCard(article) {
  const card = cardShell(article, 'card--article');
  const when = article.publishedAt ? `${formatDate(article.publishedAt)} · ${relativeDays(article.publishedAt)}` : 'Undated';
  card.innerHTML = `
    <div class="card__kicker"><span>${escapeHtml(article.source)}</span>${sampleTag(article)}</div>
    <h4 class="card__title"><a href="${escapeHtml(article.url)}" target="_blank" rel="noopener">${escapeHtml(article.title)}</a></h4>
    <p class="card__summary">${escapeHtml(article.summary || '')}</p>
    <div class="card__meta">${escapeHtml(when)}${article.author ? ` · ${escapeHtml(article.author)}` : ''}</div>
    <a class="card__link" href="${escapeHtml(article.url)}" target="_blank" rel="noopener">Read →</a>`;
  return card;
}

function billCard(bill) {
  const card = cardShell(bill, 'card--bill');
  const stage = STAGE[bill.stage] || STAGE.introduced;
  const meta = [bill.sponsor, bill.citation, bill.date ? formatDate(bill.date, { long: true }) : null].filter(Boolean).join(' · ');
  card.innerHTML = `
    <div class="card__kicker">
      ${bill.stage === 'sample' ? '' : `<span class="tag ${stage.cls}">${escapeHtml(stage.label)}</span>`}
      <span class="tag tag--level">${escapeHtml(LEVEL[bill.level] || bill.level)}</span>
      ${sampleTag(bill)}
    </div>
    <h4 class="card__title">${bill.number && bill.number !== 'SAMPLE' ? `${escapeHtml(bill.number)} — ` : ''}${escapeHtml(bill.title)}</h4>
    <p class="card__summary">${escapeHtml(bill.summary || '')}</p>
    ${meta ? `<div class="card__meta">${escapeHtml(meta)}</div>` : ''}
    ${bill.url ? `<a class="card__link" href="${escapeHtml(bill.url)}" target="_blank" rel="noopener">View bill →</a>` : ''}`;
  return card;
}

function personCard(person) {
  const card = cardShell(person, 'card--person');
  const actions = [
    person.email ? { label: 'Email', href: `mailto:${person.email}` } : null,
    person.contactForm ? { label: 'Contact form', href: person.contactForm } : null,
    person.phone ? { label: person.phone, href: `tel:${String(person.phone).replace(/[^\d+]/g, '')}` } : null,
    person.website ? { label: 'Website', href: person.website } : null,
    person.social?.twitter ? { label: 'Follow', href: `https://twitter.com/${person.social.twitter}` } : null
  ].filter(Boolean);

  const photo = person.photo
    ? `<img class="person__photo" src="${escapeHtml(person.photo)}" alt="" loading="lazy" onerror="this.removeAttribute('src')" />`
    : '<div class="person__photo" aria-hidden="true"></div>';

  card.innerHTML = `
    ${photo}
    <div>
      <div class="card__kicker">
        <span class="tag tag--level">${escapeHtml(LEVEL[person.level] || person.level)}</span>
        ${person.party ? `<span>${escapeHtml(person.party)}</span>` : ''}
        ${sampleTag(person)}
      </div>
      <h4 class="person__name">${escapeHtml(person.name)}</h4>
      <p class="person__role">${escapeHtml(person.role || '')}</p>
      ${person.note ? `<p class="card__summary">${escapeHtml(person.note)}</p>` : ''}
      <div class="person__actions">${actions
        .map((a) => `<a class="person__action" href="${escapeHtml(a.href)}" target="_blank" rel="noopener">${escapeHtml(a.label)}</a>`)
        .join('')}</div>
    </div>`;
  return card;
}

function topicCard(topic) {
  const card = cardShell({ ...topic, id: topic.id }, 'card--topic');
  const via = state.brief.topics.find((t) => t.id === topic.via);
  card.innerHTML = `
    <div class="card__kicker"><span>Connected to ${escapeHtml(via?.label || 'your topics')}</span></div>
    <h4 class="card__title">${escapeHtml(topic.label)}</h4>
    <p class="card__why">${escapeHtml(topic.why)}</p>
    <p class="card__meta">${escapeHtml(topic.blurb)}</p>
    <button class="card__link" type="button" data-add="${escapeHtml(topic.id)}" style="border:0;background:none;padding:0;cursor:pointer;color:var(--accent)">Add to my brief →</button>`;
  card.querySelector('[data-add]').addEventListener('click', (event) => {
    event.stopPropagation();
    toggleTopic(topic.id, { run: true });
  });
  return card;
}

function focusItem(id) {
  state.activeId = state.activeId === id ? null : id;
  updateHighlight();
  const target = document.getElementById(`card-${id}`) || document.getElementById(id);
  if (target && state.activeId) {
    const top = target.getBoundingClientRect().top + window.scrollY - 90;
    window.scrollTo({ top: Math.max(top, 0), behavior: 'smooth' });
  }
}

function highlightCards() {
  const active = state.hoveredId || state.activeId;
  for (const card of els.feed.querySelectorAll('.card')) {
    card.classList.toggle('is-active', card.dataset.nodeId === active);
  }
}

/* ---------------------------------- boot ---------------------------------- */

async function boot() {
  els.mastheadDate.textContent = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  readUrlState();
  els.address.value = state.address;
  els.preset.value = state.preset;
  els.from.value = state.from;
  els.to.value = state.to;
  els.custom.hidden = state.preset !== 'custom';
  updateRangeNote();

  els.form.addEventListener('submit', submit);
  els.preset.addEventListener('change', applyPreset);
  for (const input of [els.from, els.to]) {
    input.addEventListener('change', () => {
      state.from = els.from.value || state.from;
      state.to = els.to.value || state.to;
      updateRangeNote();
    });
  }

  try {
    const { topics, providers } = await getTopics();
    state.catalog = topics;
    state.providers = providers;
  } catch {
    els.feed.innerHTML = '<p class="placeholder-note">The server is not responding. Start it with <code>npm start</code>.</p>';
    return;
  }

  if (!state.selected.length) state.selected = ['climate'];
  state.focusTopicId = state.selected[0];
  renderChips();
  renderScopes();
  submit();
}

boot();

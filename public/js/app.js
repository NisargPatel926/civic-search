import { getTopics, getBrief } from './api.js';
import { buildGraph, renderForceGraph, LEGEND, PALETTE } from './graph.js';

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
  pinnedNode: null,   // currently pinned node object (or null)
  hoveredNode: null,  // currently hovered node (not pinned)
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
  notices: $('#notices'),
  focusSwitch: $('#focus-switch'),
  graphCanvas: $('#graph-canvas'),
  graphHint: $('#graph-hint'),
  legend: $('#legend'),
  // Detail panel
  detailPanel: $('#detail-panel'),
  detailKind: $('#detail-kind'),
  detailTitle: $('#detail-title'),
  detailBody: $('#detail-body'),
  detailPinHint: $('#detail-pin-hint'),
  mastheadDate: $('#masthead-date'),
  mastheadPlace: $('#masthead-place'),
  mastheadSources: $('#masthead-sources'),
  // Spacing + zoom controls
  spacingBar: $('#graph-spacing-bar'),
  spacingSlider: $('#spacing-slider'),
  spacingValue: $('#spacing-value'),
  zoomSlider: $('#zoom-slider'),
  zoomValue: $('#zoom-value')
};

const SCOPES = [
  { id: 'all',     label: 'All levels',  hint: 'Everything we found, from Congress down to city hall.' },
  { id: 'federal', label: 'National',    hint: 'Federal bills, laws, and members of Congress.' },
  { id: 'state',   label: 'State',       hint: 'State legislature bills and your state legislators.' },
  { id: 'local',   label: 'Local',       hint: 'City and county officials and any local measures we can reach.' }
];

const STAGE = {
  introduced:    { label: 'Introduced',            cls: 'tag--progress' },
  committee:     { label: 'In committee',          cls: 'tag--progress' },
  passedChamber: { label: 'Passed one chamber',    cls: 'tag--progress' },
  passedBoth:    { label: 'Passed both chambers',  cls: 'tag--passed' },
  enacted:       { label: 'Enacted',               cls: 'tag--passed' },
  sample:        { label: 'Sample',                cls: 'tag--sample' }
};

const LEVEL = { federal: 'Federal', state: 'State', local: 'Local' };

const KIND_LABEL = {
  issue:    'Issue',
  article:  'Article',
  bill:     'Bill',
  law:      'Law',
  official: 'Person',
  topic:    'Connected issue'
};

/* ─────────────── Utilities ─────────────── */

const escapeHtml = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function formatDate(value, { long = false } = {}) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString('en-US', long
    ? { year: 'numeric', month: 'long', day: 'numeric' }
    : { year: 'numeric', month: 'short', day: 'numeric' });
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

/* ─────────────── URL / storage ─────────────── */

function readUrlState() {
  const params = new URLSearchParams(location.search);
  const stored = (() => {
    try { return JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); }
    catch { return null; }
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
  try { localStorage.setItem(STORE_KEY, JSON.stringify(payload)); } catch { /* private mode */ }
  const params = new URLSearchParams();
  if (payload.topics) params.set('topics', payload.topics);
  if (payload.address) params.set('address', payload.address);
  params.set('from', payload.from);
  params.set('to', payload.to);
  history.replaceState(null, '', `${location.pathname}?${params.toString()}`);
}

/* ─────────────── Date range ─────────────── */

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

/* ─────────────── Chips ─────────────── */

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
  else { state.selected.shift(); state.selected.push(id); }
  if (!state.selected.includes(state.focusTopicId)) state.focusTopicId = state.selected[0] || null;
  renderChips();
  if (run) submit();
}

/* ─────────────── Fetch ─────────────── */

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
    return;
  }

  persist();
  state.loading = true;
  els.explore.disabled = true;
  els.explore.textContent = 'Reading…';

  try {
    const brief = await getBrief({ topics: state.selected, address: state.address, from: state.from, to: state.to });
    state.brief = brief;
    state.pinnedNode = null;
    state.hoveredNode = null;
    if (!brief.topics.some((t) => t.id === state.focusTopicId)) state.focusTopicId = brief.topics[0]?.id || null;
    render();
  } catch (err) {
    els.notices.hidden = false;
    els.notices.innerHTML = `<p class="notices__title">Could not build your brief</p><ul><li>${escapeHtml(err.message)}</li></ul>`;
  } finally {
    state.loading = false;
    els.explore.disabled = false;
    els.explore.textContent = 'Explore';
  }
}

/* ─────────────── Rendering ─────────────── */

function render() {
  const brief = state.brief;
  if (!brief) return;

  const titles = brief.topics.map((t) => t.label);
  els.title.textContent = titles.join(' · ');

  const place = brief.location?.label && brief.query.address ? brief.location.label : null;
  els.place.hidden = !place;
  if (place) {
    const district = brief.location.congressionalDistrict
      ? ` · ${brief.location.stateAbbr}-${brief.location.congressionalDistrict}` : '';
    els.place.textContent = `${place}${district}`;
  }
  els.mastheadPlace.textContent = place || 'No address yet';
  const live = Object.entries(brief.providers || {}).filter(([, on]) => on).map(([k]) => k);
  els.mastheadSources.textContent = live.length ? `Live: ${live.join(', ')}` : 'Sample edition';

  renderScopes();
  renderNotices(brief.notices);
  renderFocusSwitch();
  renderGraph();
  renderLegend();
  resetDetailPanel();
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
      state.pinnedNode = null;
      persist();
      renderScopes();
      renderGraph();
      resetDetailPanel();
    });
    els.scopeTabs.append(tab);
  }
}

function renderNotices(notices = []) {
  if (!notices.length) { els.notices.hidden = true; els.notices.replaceChildren(); return; }
  els.notices.hidden = false;
  els.notices.innerHTML = `<p class="notices__title">About this data</p><ul>${notices
    .map((n) => `<li>${escapeHtml(n)}</li>`).join('')}</ul>`;
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
      state.pinnedNode = null;
      renderFocusSwitch();
      renderGraph();
      resetDetailPanel();
    });
    els.focusSwitch.append(btn);
  }
}

/* ─────────────── Force graph ─────────────── */

let graphCtl = null;

function renderGraph() {
  if (!state.brief) return;
  if (graphCtl) { graphCtl.destroy(); graphCtl = null; }

  const model = buildGraph(state.brief, { scope: state.scope });

  graphCtl = renderForceGraph(els.graphCanvas, model, {
    onHover(node) {
      state.hoveredNode = node;
      if (!state.pinnedNode) {
        if (node) updateDetailPanel(node, false);
        else resetDetailPanel();
      }
      updateHint();
    },
    onPin(node) {
      state.pinnedNode = node;
      if (node) updateDetailPanel(node, true);
      else resetDetailPanel();
      updateHint();
    }
  });

  // Show the controls bar; restore sliders to their last-used values
  els.spacingBar.removeAttribute('hidden');
  const currentSpacingPct = parseInt(els.spacingSlider.value, 10);
  els.spacingValue.textContent = `${currentSpacingPct}%`;
  graphCtl.setSpacing(currentSpacingPct / 100);
  // Reset zoom to 100% each time a new graph renders
  els.zoomSlider.value = '100';
  els.zoomValue.textContent = '100%';
  graphCtl.setZoom(1);
}

/* ─────────────── Spacing slider ─────────────── */

function initSpacingSlider() {
  els.spacingSlider.addEventListener('input', () => {
    const pct = parseInt(els.spacingSlider.value, 10);
    els.spacingValue.textContent = `${pct}%`;
    if (graphCtl) graphCtl.setSpacing(pct / 100);
  });
}

/* ─────────────── Zoom slider ─────────────── */

function initZoomSlider() {
  els.zoomSlider.addEventListener('input', () => {
    const pct = parseInt(els.zoomSlider.value, 10);
    els.zoomValue.textContent = `${pct}%`;
    if (graphCtl) graphCtl.setZoom(pct / 100);
  });
}

function updateHint() {
  if (state.pinnedNode) {
    els.graphHint.textContent = 'Click the same node again to unpin · or click background';
  } else if (state.hoveredNode) {
    els.graphHint.textContent = 'Click to pin · drag to move';
  } else {
    els.graphHint.textContent = 'Hover a node to preview · click to pin';
  }
}

/* ─────────────── Legend ─────────────── */

function renderLegend() {
  els.legend.replaceChildren();
  for (const item of LEGEND) {
    const wrap = document.createElement('div');
    wrap.className = 'legend__item';
    wrap.setAttribute('role', 'listitem');
    const swatch = document.createElement('span');
    swatch.className = 'legend__swatch';
    swatch.style.background = item.color;
    if (item.dashed) {
      swatch.style.background = 'none';
      swatch.style.border = `2px dashed ${item.color}`;
    }
    const label = document.createElement('span');
    label.textContent = item.label;
    wrap.append(swatch, label);
    els.legend.append(wrap);
  }
}

/* ─────────────── Detail panel ─────────────── */

function updateDetailPanel(node, isPinned) {
  const item = node.item || {};
  els.detailKind.textContent = KIND_LABEL[node.kind] || node.kind;
  els.detailTitle.textContent = node.title || node.label;
  els.detailBody.replaceChildren();
  buildPanelBody(els.detailBody, node, item, isPinned);
  els.detailPinHint.textContent = isPinned ? 'Pinned — click node again to unpin' : 'Click to pin';
}

function resetDetailPanel() {
  els.detailKind.textContent = '';
  els.detailTitle.textContent = '';
  els.detailBody.innerHTML = '<p class="detail-panel__empty">Hover over any node to preview its content here. Click a node to pin the detail.</p>';
  els.detailPinHint.textContent = '';
}

/* ─────────────────────────────────────────────────────────────────
   buildPanelBody — renders content sections directly into the panel.
   On hover: shows a single-item preview.
   On pin:   shows the full item + all connected sections.
   ──────────────────────────────────────────────────────────────── */

function buildPanelBody(container, node, item, isPinned) {
  const e = escapeHtml;
  const brief = state.brief;
  const scope = state.scope;
  const inScope = (i) => scope === 'all' || i.level === scope;

  // ── Issue hub ── show overview + all content grouped by type
  if (node.kind === 'issue') {
    container.innerHTML = `<p style="font-size:13px;color:var(--ink-soft);margin:0 0 14px">${e(item.blurb || '')}</p>`;
    if (!isPinned) return;

    const sections = [
      { title: 'Articles',        items: brief.articles.filter(i => !i.topicId || i.topicId === item.id),  render: panelArticle },
      { title: 'Bills',           items: brief.bills.filter(i => (!i.topicId || i.topicId === item.id) && inScope(i)), render: panelBill },
      { title: 'Laws',            items: brief.laws.filter(i => (!i.topicId || i.topicId === item.id) && inScope(i)),  render: panelBill },
      { title: 'People',          items: brief.officials.filter(inScope),  render: panelPerson },
      { title: 'Connected issues',items: brief.connections.related,        render: panelTopic }
    ].filter(s => s.items.length);

    for (const sec of sections) appendPanelSection(container, sec.title, sec.items, sec.render);
    return;
  }

  // ── Article ──
  if (node.kind === 'article') {
    const when = item.publishedAt
      ? `${formatDate(item.publishedAt)} · ${relativeDays(item.publishedAt)}` : 'Undated';
    container.innerHTML = `
      <p style="font-size:13.5px;color:var(--ink-soft);margin:0 0 8px">${e(item.summary || item.title || '')}</p>
      <p style="font-size:11.5px;font-style:italic;color:var(--ink-faint);margin:0 0 10px">${e(when)}${item.author ? ` · ${e(item.author)}` : ''}</p>
      ${item.url ? `<a class="pcard__link" href="${e(item.url)}" target="_blank" rel="noopener">Read full article →</a>` : ''}
    `;
    return;
  }

  // ── Bill or Law ──
  if (node.kind === 'bill' || node.kind === 'law') {
    const stage = STAGE[item.stage] || STAGE.introduced;
    const meta = [item.sponsor, item.citation, item.date ? formatDate(item.date, { long: true }) : null]
      .filter(Boolean).join(' · ');
    container.innerHTML = `
      <p style="margin:0 0 6px"><span class="tag ${stage.cls}">${e(stage.label)}</span>
        <span class="tag tag--level" style="margin-left:4px">${e(LEVEL[item.level] || item.level || '')}</span></p>
      <p style="font-size:13.5px;color:var(--ink-soft);margin:0 0 8px">${e(item.summary || '')}</p>
      ${meta ? `<p style="font-size:11.5px;font-style:italic;color:var(--ink-faint);margin:0 0 10px">${e(meta)}</p>` : ''}
      ${item.url ? `<a class="pcard__link" href="${e(item.url)}" target="_blank" rel="noopener">View bill →</a>` : ''}
    `;
    return;
  }

  // ── Official ──
  if (node.kind === 'official') {
    const actions = [
      item.email       ? { label: 'Email',       href: `mailto:${e(item.email)}` } : null,
      item.contactForm ? { label: 'Contact form',href: e(item.contactForm) }        : null,
      item.phone       ? { label: e(String(item.phone)), href: `tel:${e(String(item.phone).replace(/[^\d+]/g,''))}` } : null,
      item.website     ? { label: 'Website',     href: e(item.website) }            : null
    ].filter(Boolean);
    const photo = item.photo
      ? `<img class="pcard__photo" src="${e(item.photo)}" alt="" loading="lazy" onerror="this.removeAttribute('src')" />`
      : '';
    container.innerHTML = `
      <div style="display:flex;gap:10px;align-items:flex-start;margin-bottom:10px">
        ${photo}
        <div>
          <p style="margin:0 0 2px;font-size:13px;color:var(--ink-soft)">${e(item.role || '')}${item.party ? ` · ${e(item.party)}` : ''}</p>
          <span class="tag tag--level">${e(LEVEL[item.level] || item.level || '')}</span>
        </div>
      </div>
      ${item.note ? `<p style="font-size:13px;color:var(--ink-soft);margin:0 0 10px">${e(item.note)}</p>` : ''}
      <div class="detail-connections">${actions
        .map(a => `<a class="detail-conn-tag" href="${a.href}" target="_blank" rel="noopener">${a.label}</a>`)
        .join('')}</div>
    `;
    return;
  }

  // ── Connected topic ──
  if (node.kind === 'topic') {
    container.innerHTML = `
      <p style="font-size:13.5px;color:var(--ink-soft);margin:0 0 8px">${e(item.why || '')}</p>
      <p style="font-size:12.5px;font-style:italic;color:var(--ink-faint);margin:0 0 12px">${e(item.blurb || '')}</p>
      <div class="detail-connections">
        <button class="detail-conn-tag" type="button" data-add="${e(item.id)}"
          style="cursor:pointer;border:0;background:var(--accent-soft);color:var(--accent)">
          Add to my brief →
        </button>
      </div>
    `;
  }
}

/* ── Panel section helper ── */

function appendPanelSection(container, title, items, renderFn) {
  const sec = document.createElement('div');
  sec.className = 'panel-section';
  const head = document.createElement('div');
  head.className = 'panel-section__head';
  head.innerHTML = `<span class="panel-section__title">${escapeHtml(title)}</span><span class="panel-section__count">${items.length}</span>`;
  const cards = document.createElement('div');
  cards.className = 'panel-section__cards';
  for (const item of items) cards.append(renderFn(item));
  sec.append(head, cards);
  container.append(sec);
}

/* ── Compact panel card renderers ── */

const sampleTag = (item) => item.sample ? '<span class="tag tag--sample">Sample</span>' : '';

function panelArticle(article) {
  const card = document.createElement('div');
  card.className = 'pcard';
  const when = article.publishedAt ? relativeDays(article.publishedAt) : null;
  card.innerHTML = `
    <div class="pcard__kicker">${escapeHtml(article.source)}${when ? ` · ${escapeHtml(when)}` : ''}${sampleTag(article)}</div>
    <p class="pcard__title"><a href="${escapeHtml(article.url)}" target="_blank" rel="noopener">${escapeHtml(article.title)}</a></p>
    ${article.summary ? `<p class="pcard__summary">${escapeHtml(article.summary)}</p>` : ''}
    <a class="pcard__link" href="${escapeHtml(article.url)}" target="_blank" rel="noopener">Read →</a>`;
  return card;
}

function panelBill(bill) {
  const card = document.createElement('div');
  card.className = 'pcard';
  const stage = STAGE[bill.stage] || STAGE.introduced;
  card.innerHTML = `
    <div class="pcard__kicker">
      ${bill.stage !== 'sample' ? `<span class="tag ${stage.cls}">${escapeHtml(stage.label)}</span>` : ''}
      <span class="tag tag--level">${escapeHtml(LEVEL[bill.level] || bill.level)}</span>
      ${sampleTag(bill)}
    </div>
    <p class="pcard__title">${bill.number && bill.number !== 'SAMPLE' ? `${escapeHtml(bill.number)} — ` : ''}${escapeHtml(bill.title)}</p>
    ${bill.summary ? `<p class="pcard__summary">${escapeHtml(bill.summary)}</p>` : ''}
    ${bill.url ? `<a class="pcard__link" href="${escapeHtml(bill.url)}" target="_blank" rel="noopener">View bill →</a>` : ''}`;
  return card;
}

function panelPerson(person) {
  const card = document.createElement('div');
  card.className = 'pcard pcard--person';
  const actions = [
    person.email       ? { label: 'Email',       href: `mailto:${person.email}` }  : null,
    person.contactForm ? { label: 'Contact',     href: person.contactForm }         : null,
    person.phone       ? { label: person.phone,  href: `tel:${String(person.phone).replace(/[^\d+]/g,'')}` } : null,
    person.website     ? { label: 'Web',         href: person.website }             : null
  ].filter(Boolean);
  const photo = person.photo
    ? `<img class="pcard__photo" src="${escapeHtml(person.photo)}" alt="" loading="lazy" onerror="this.removeAttribute('src')" />`
    : '';
  card.innerHTML = `
    ${photo}
    <div>
      <div class="pcard__kicker">
        <span class="tag tag--level">${escapeHtml(LEVEL[person.level] || person.level)}</span>
        ${person.party ? `<span>${escapeHtml(person.party)}</span>` : ''}
        ${sampleTag(person)}
      </div>
      <p class="pcard__title" style="margin-bottom:2px">${escapeHtml(person.name)}</p>
      <p class="pcard__meta" style="margin-bottom:4px">${escapeHtml(person.role || '')}</p>
      <div class="pcard__actions">${actions
        .map(a => `<a class="pcard__action" href="${escapeHtml(a.href)}" target="_blank" rel="noopener">${escapeHtml(a.label)}</a>`)
        .join('')}</div>
    </div>`;
  return card;
}

function panelTopic(topic) {
  const card = document.createElement('div');
  card.className = 'pcard pcard--topic';
  card.innerHTML = `
    <p class="pcard__title">${escapeHtml(topic.label)}</p>
    <p class="pcard__why">${escapeHtml(topic.why || '')}</p>
    <button class="pcard__link" type="button" data-add="${escapeHtml(topic.id)}"
      style="border:0;background:none;padding:0;cursor:pointer">
      Add to my brief →
    </button>`;
  card.querySelector('[data-add]')?.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleTopic(topic.id, { run: true });
  });
  return card;
}

/* ─────────────── "Add to brief" from detail panel ─────────────── */

els.detailBody.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-add]');
  if (btn) {
    e.stopPropagation();
    toggleTopic(btn.dataset.add, { run: true });
  }
});

/* ─────────────── Boot ─────────────── */

async function boot() {
  els.mastheadDate.textContent = new Date().toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  readUrlState();
  els.address.value = state.address;
  els.preset.value = state.preset;
  els.from.value = state.from;
  els.to.value = state.to;
  els.custom.hidden = state.preset !== 'custom';
  updateRangeNote();

  initSpacingSlider();
  initZoomSlider();
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

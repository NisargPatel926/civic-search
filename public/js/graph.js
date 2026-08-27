/**
 * The relationship map.
 *
 * Three rings: the focused topic at the centre, one node per category, and the
 * individual articles / bills / laws / officials / connected topics as leaves.
 * Geometry is computed in a fixed 640x640 viewBox and labels are HTML overlaid
 * in percentages, so the whole thing scales with its container instead of
 * fighting SVG text wrapping.
 */

const VB_W = 760;
const VB_H = 640;
const CX = 380;
const CY = 320;
const R_CAT = 132;
const R_LEAF = 236;
const R_LEAF_STAGGER = 36;
const DEG = Math.PI / 180;
const MAX_LEAVES = 4;

export const PALETTE = {
  ink: '#1d1a13',
  soft: '#55503f',
  faint: '#a89c80',
  rule: '#cfc4a9',
  accent: '#8a3121',
  amber: '#7f5511',
  green: '#3f5a37',
  slate: '#4a5468',
  paper: '#fbf8f0'
};

const stageColor = (stage) =>
  stage === 'enacted' || stage === 'passedBoth' ? PALETTE.green : stage === 'sample' ? PALETTE.faint : PALETTE.amber;

const truncate = (text, max) => {
  const s = String(text || '').trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
};

/** Short, recognisable label for a leaf node. */
function leafLabel(item, kind) {
  if (kind === 'article') return truncate(item.source, 18);
  if (kind === 'official') return truncate(item.name.replace(/^(Sen|Rep|Senator|Representative)\.?\s+/i, ''), 20);
  if (kind === 'topic') return truncate(item.short || item.label, 18);
  return truncate(item.number && item.number !== 'SAMPLE' ? item.number : item.title, 18);
}

function curve(x1, y1, x2, y2, bow) {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  return `M ${x1.toFixed(1)} ${y1.toFixed(1)} Q ${(mx + nx * bow).toFixed(1)} ${(my + ny * bow).toFixed(1)} ${x2.toFixed(
    1
  )} ${y2.toFixed(1)}`;
}

/**
 * @param {object} brief   payload from /api/brief
 * @param {object} opts    { focusTopicId, scope }
 */
export function buildGraph(brief, { focusTopicId, scope = 'all' }) {
  const focus = brief.topics.find((t) => t.id === focusTopicId) || brief.topics[0];
  if (!focus) return { nodes: [], edges: [], categories: [] };

  const inScope = (item) => scope === 'all' || item.level === scope;
  const forTopic = (item) => !item.topicId || item.topicId === focus.id;

  const categories = [
    {
      id: 'cat-articles',
      label: 'Articles',
      kind: 'article',
      items: brief.articles.filter(forTopic),
      color: PALETTE.soft
    },
    {
      id: 'cat-bills',
      label: 'Bills',
      kind: 'bill',
      items: brief.bills.filter(forTopic).filter(inScope),
      color: PALETTE.amber
    },
    {
      id: 'cat-laws',
      label: 'Laws',
      kind: 'law',
      items: brief.laws.filter(forTopic).filter(inScope),
      color: PALETTE.green
    },
    {
      id: 'cat-people',
      label: 'People',
      kind: 'official',
      items: brief.officials.filter(inScope),
      color: PALETTE.slate
    },
    {
      id: 'cat-topics',
      label: 'Issues',
      kind: 'topic',
      items: brief.connections.related,
      color: PALETTE.accent
    }
  ].filter((cat) => cat.items.length);

  const nodes = [];
  const edges = [];

  nodes.push({
    id: `topic:${focus.id}`,
    kind: 'center',
    x: CX,
    y: CY,
    r: 48,
    label: focus.short || focus.label,
    color: PALETTE.accent,
    title: focus.label,
    interactive: false
  });

  const step = 360 / categories.length;
  categories.forEach((cat, ci) => {
    const angle = -90 + ci * step;
    const cx = CX + R_CAT * Math.cos(angle * DEG);
    const cy = CY + R_CAT * Math.sin(angle * DEG);

    const shown = cat.items.slice(0, MAX_LEAVES);
    const overflow = cat.items.length - shown.length;

    nodes.push({
      id: cat.id,
      kind: 'cat',
      catId: cat.id,
      x: cx,
      y: cy,
      r: 26,
      label: cat.label,
      color: cat.color,
      idleColor: PALETTE.rule,
      labelColor: PALETTE.soft,
      title: `${cat.items.length} ${cat.label.toLowerCase()}`,
      interactive: false
    });
    edges.push({
      ownerId: cat.id,
      catId: cat.id,
      color: cat.color,
      idleColor: PALETTE.rule,
      d: curve(CX, CY, cx, cy, ci % 2 ? 14 : -14),
      width: 1.5,
      activeWidth: 2.2,
      opacity: 0.65,
      dash: null
    });

    const n = shown.length + (overflow > 0 ? 1 : 0);
    const spread = Math.min(30, (step * 0.9) / Math.max(n - 1, 1));

    const placeLeaf = (i, node) => {
      const a = angle + (i - (n - 1) / 2) * spread;
      // Alternate leaves sit further out so their labels never share a band.
      const radius = R_LEAF + (i % 2 ? R_LEAF_STAGGER : 0);
      const lx = CX + radius * Math.cos(a * DEG);
      const ly = CY + radius * Math.sin(a * DEG);
      nodes.push({ ...node, x: lx, y: ly, r: 16, activeR: 20, catId: cat.id });
      edges.push({
        ownerId: node.id,
        catId: cat.id,
        d: curve(cx, cy, lx, ly, (i - (n - 1) / 2) * 9),
        color: node.color,
        idleColor: PALETTE.rule,
        width: 1.1,
        activeWidth: 2.4,
        opacity: 0.55,
        dash: node.kind === 'topic' ? '4 4' : null
      });
    };

    shown.forEach((item, i) => {
      const color = cat.kind === 'bill' || cat.kind === 'law' ? stageColor(item.stage) : cat.color;
      placeLeaf(i, {
        id: item.id,
        kind: cat.kind,
        label: leafLabel(item, cat.kind),
        color: item.sample ? PALETTE.faint : color,
        title: item.title || item.name || item.label,
        sample: Boolean(item.sample),
        interactive: true
      });
    });

    if (overflow > 0) {
      placeLeaf(shown.length, {
        id: `${cat.id}:more`,
        kind: 'more',
        label: `+${overflow} more`,
        color: PALETTE.faint,
        title: `${overflow} more in the column`,
        interactive: true,
        scrollTo: cat.id
      });
    }
  });

  return { nodes, edges, categories, focus };
}

const NS = 'http://www.w3.org/2000/svg';
const el = (name, attrs) => {
  const node = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) if (v !== null && v !== undefined) node.setAttribute(k, String(v));
  return node;
};

/**
 * Draws the model once and hands back a controller. Hover and pin only mutate
 * attributes on the existing nodes — re-creating the SVG under a focused
 * element would drop keyboard focus mid-interaction.
 */
export function renderGraph({ edgeLayer, nodeLayer, labelLayer }, model, handlers = {}) {
  edgeLayer.replaceChildren();
  nodeLayer.replaceChildren();
  labelLayer.replaceChildren();

  const edgesByOwner = new Map();
  const entries = new Map();

  for (const edge of model.edges) {
    const path = el('path', {
      d: edge.d,
      fill: 'none',
      stroke: edge.idleColor || edge.color,
      'stroke-width': edge.width,
      'stroke-linecap': 'round',
      'stroke-opacity': edge.opacity,
      'stroke-dasharray': edge.dash
    });
    edgeLayer.append(path);
    if (edge.ownerId) edgesByOwner.set(edge.ownerId, { path, edge });
  }

  for (const node of model.nodes) {
    const isCenter = node.kind === 'center';
    const g = el('g', {
      class: `gnode${node.interactive ? '' : ' gnode--static'}`,
      role: node.interactive ? 'button' : null,
      tabindex: node.interactive ? '0' : null,
      'aria-label': node.interactive ? `${node.title} — show in the column` : null
    });

    const tooltip = el('title', {});
    tooltip.textContent = node.title;
    g.append(tooltip);

    const halo = el('circle', {
      cx: node.x,
      cy: node.y,
      r: node.r + 10,
      fill: node.color,
      opacity: isCenter ? 0.09 : 0
    });
    const body = el('circle', {
      cx: node.x,
      cy: node.y,
      r: node.r,
      fill: isCenter ? 'url(#coreGlow)' : PALETTE.paper,
      stroke: isCenter ? 'none' : node.idleColor || node.color,
      'stroke-width': isCenter ? 0 : node.kind === 'cat' ? 1.6 : 1.8,
      'stroke-dasharray': node.kind === 'topic' ? '3.5 3' : null,
      filter: isCenter ? 'url(#nodeShadow)' : null
    });
    g.append(halo, body);

    let dot = null;
    if (node.interactive) {
      dot = el('circle', { cx: node.x, cy: node.y, r: 3.6, fill: node.color });
      g.append(dot);
    }

    if (node.interactive) {
      const fire = (event) => {
        event.preventDefault();
        handlers.onSelect?.(node);
      };
      g.addEventListener('click', fire);
      g.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') fire(event);
      });
      g.addEventListener('mouseenter', () => handlers.onHover?.(node));
      g.addEventListener('mouseleave', () => handlers.onHover?.(null));
      g.addEventListener('focus', () => handlers.onHover?.(node));
      g.addEventListener('blur', () => handlers.onHover?.(null));
    }

    nodeLayer.append(g);

    const label = document.createElement('div');
    label.className = `glabel${isCenter ? ' glabel--focus' : ''}`;
    label.textContent = node.label;
    const size = isCenter ? 17 : node.kind === 'cat' ? 12 : 11.5;
    const width = isCenter ? 84 : node.kind === 'cat' ? 92 : 104;
    // Labels sit radially outward from the centre, so no edge ever runs
    // through its own node's text.
    const dx = node.x - CX;
    const dy = node.y - CY;
    const len = Math.hypot(dx, dy) || 1;
    const ux = isCenter ? 0 : dx / len;
    const uy = isCenter ? 0 : dy / len;
    const push = node.r + 11;
    const px = node.x + ux * push;
    const py = node.y + uy * push;
    // Anchor sideways labels to their inner edge so they never sit on the node.
    const anchor = isCenter ? 'center' : ux > 0.5 ? 'left' : ux < -0.5 ? 'right' : 'center';
    const transform =
      anchor === 'left' ? 'translate(0, -50%)' : anchor === 'right' ? 'translate(-100%, -50%)' : 'translate(-50%, -50%)';
    Object.assign(label.style, {
      left: `${((px / VB_W) * 100).toFixed(2)}%`,
      top: `${((py / VB_H) * 100).toFixed(2)}%`,
      transform,
      textAlign: anchor === 'center' ? 'center' : anchor,
      width: `${((width / VB_W) * 100).toFixed(2)}cqw`,
      fontSize: `clamp(9px, ${((size / VB_W) * 100).toFixed(3)}cqw, ${size}px)`,
      fontWeight: isCenter ? 700 : node.kind === 'cat' ? 700 : 500,
      textTransform: node.kind === 'cat' ? 'uppercase' : 'none',
      letterSpacing: node.kind === 'cat' ? '0.1em' : '0',
      color: isCenter ? PALETTE.paper : node.labelColor || PALETTE.soft
    });
    labelLayer.append(label);

    entries.set(node.id, { node, g, halo, body, dot, label });
  }

  const paint = (id, on) => {
    const entry = entries.get(id);
    if (!entry) return;
    const { node, halo, body, dot, label } = entry;
    if (node.kind === 'center') return;

    const isLeaf = node.kind !== 'cat';
    body.setAttribute('r', on && node.activeR ? node.activeR : node.r);
    body.setAttribute('stroke', on ? node.color : node.idleColor || node.color);
    body.setAttribute('stroke-width', on ? 2.4 : node.kind === 'cat' ? 1.6 : 1.8);
    body.setAttribute('fill', on && isLeaf ? node.color : PALETTE.paper);
    if (on) body.setAttribute('filter', 'url(#nodeShadow)');
    else body.removeAttribute('filter');
    halo.setAttribute('r', (on && node.activeR ? node.activeR : node.r) + 10);
    halo.setAttribute('opacity', on ? 0.15 : 0);
    if (dot) {
      dot.setAttribute('cx', node.x);
      dot.setAttribute('opacity', on ? 0 : 1);
    }
    label.style.color = on ? node.color : node.labelColor || PALETTE.soft;
    label.style.fontWeight = on ? 700 : node.kind === 'cat' ? 700 : 500;

    const wire = edgesByOwner.get(id);
    if (wire) {
      wire.path.setAttribute('stroke', on ? node.color : wire.edge.idleColor || wire.edge.color);
      wire.path.setAttribute('stroke-width', on ? wire.edge.activeWidth : wire.edge.width);
      wire.path.setAttribute('stroke-opacity', on ? 0.95 : wire.edge.opacity);
    }
  };

  let current = null;
  const controller = {
    setHighlight(id) {
      if (current === id) return;
      if (current) {
        paint(current, false);
        const prevCat = entries.get(current)?.node.catId;
        if (prevCat && prevCat !== current) paint(prevCat, false);
      }
      current = id && entries.has(id) ? id : null;
      if (current) {
        paint(current, true);
        const cat = entries.get(current)?.node.catId;
        if (cat && cat !== current) paint(cat, true);
      }
    },
    has: (id) => entries.has(id)
  };
  return controller;
}

export const LEGEND = [
  { label: 'Your focused issue', fill: PALETTE.accent, stroke: PALETTE.accent },
  { label: 'Category', fill: PALETTE.paper, stroke: PALETTE.rule },
  { label: 'Article', fill: PALETTE.paper, stroke: PALETTE.soft },
  { label: 'In progress', fill: PALETTE.paper, stroke: PALETTE.amber },
  { label: 'Passed / enacted', fill: PALETTE.paper, stroke: PALETTE.green },
  { label: 'Person to contact', fill: PALETTE.paper, stroke: PALETTE.slate },
  { label: 'Connected issue', fill: PALETTE.paper, stroke: PALETTE.accent, dashed: true },
  { label: 'Filled = selected', fill: PALETTE.soft, stroke: PALETTE.soft }
];

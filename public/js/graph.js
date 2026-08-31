/**
 * Force-cloud relationship graph.
 *
 * Layout: D3 force simulation with clustering by issue/category.
 * Nodes orbit in "neighbourhoods" — one cluster per topic selected.
 * Dragging a node spring-backs to its rest position on release.
 * Hover shows a floating preview. Click pins the detail panel open.
 * Clicking a pinned node again un-pins it.
 */

import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7/+esm';

export const PALETTE = {
  ink: '#1d1a13',
  soft: '#55503f',
  faint: '#a89c80',
  rule: '#cfc4a9',
  accent: '#8a3121',
  amber: '#7f5511',
  green: '#3f5a37',
  slate: '#4a5468',
  paper: '#fbf8f0',
  paperRaised: '#fdf9f2'
};

const CATEGORY_COLORS = {
  article: PALETTE.soft,
  bill: PALETTE.amber,
  law: PALETTE.green,
  official: PALETTE.slate,
  topic: PALETTE.accent,
  issue: PALETTE.accent
};

const stageColor = (stage) =>
  stage === 'enacted' || stage === 'passedBoth' ? PALETTE.green
  : stage === 'sample' ? PALETTE.faint
  : PALETTE.amber;

const truncate = (text, max) => {
  const s = String(text || '').trim();
  return s.length > max ? `${s.slice(0, max - 1)}\u2026` : s;
};

function leafLabel(item, kind) {
  if (kind === 'article') return truncate(item.source, 20);
  if (kind === 'official') return truncate(item.name.replace(/^(Sen|Rep|Senator|Representative)\.?\s+/i, ''), 22);
  if (kind === 'topic') return truncate(item.short || item.label, 20);
  return truncate(item.number && item.number !== 'SAMPLE' ? item.number : item.title, 20);
}

/**
 * Build the node/link model from a brief payload.
 * Returns { nodes, links } ready for a D3 simulation.
 */
export function buildGraph(brief, { scope = 'all' } = {}) {
  const nodes = [];
  const links = [];

  const inScope = (item) => scope === 'all' || item.level === scope;
  const forTopic = (topic) => (item) => !item.topicId || item.topicId === topic.id;

  brief.topics.forEach((topic, ti) => {
    // Issue hub node (centre of its cluster)
    const hubId = `issue:${topic.id}`;
    nodes.push({
      id: hubId,
      kind: 'issue',
      topicId: topic.id,
      label: topic.short || topic.label,
      title: topic.label,
      color: PALETTE.accent,
      r: 36,
      clusterIndex: ti,
      pinned: false,
      item: topic
    });

    const categories = [
      { kind: 'article',  color: PALETTE.soft,   items: brief.articles.filter(forTopic(topic)) },
      { kind: 'bill',     color: PALETTE.amber,   items: brief.bills.filter(forTopic(topic)).filter(inScope) },
      { kind: 'law',      color: PALETTE.green,   items: brief.laws.filter(forTopic(topic)).filter(inScope) },
      { kind: 'official', color: PALETTE.slate,   items: brief.officials.filter(inScope) },
      { kind: 'topic',    color: PALETTE.accent,  items: brief.connections.related }
    ];

    categories.forEach((cat) => {
      cat.items.slice(0, 5).forEach((item) => {
        const nodeId = item.id;
        // Deduplicate — officials appear once even across multiple topics
        if (nodes.find((n) => n.id === nodeId)) {
          // Add a cross-link from this issue hub to the existing node
          links.push({ source: hubId, target: nodeId, catKind: cat.kind });
          return;
        }
        const color = (cat.kind === 'bill' || cat.kind === 'law') ? stageColor(item.stage) : cat.color;
        nodes.push({
          id: nodeId,
          kind: cat.kind,
          topicId: topic.id,
          label: leafLabel(item, cat.kind),
          title: item.title || item.name || item.label || '',
          color: item.sample ? PALETTE.faint : color,
          r: 14,
          clusterIndex: ti,
          pinned: false,
          item
        });
        links.push({ source: hubId, target: nodeId, catKind: cat.kind });
      });
    });
  });

  return { nodes, links };
}

export const LEGEND = [
  { label: 'Issue / topic',       color: PALETTE.accent },
  { label: 'Article',             color: PALETTE.soft },
  { label: 'Bill in progress',    color: PALETTE.amber },
  { label: 'Enacted law',         color: PALETTE.green },
  { label: 'Person to contact',   color: PALETTE.slate },
  { label: 'Connected issue',     color: PALETTE.accent, dashed: true }
];

/* ────────────────────────────────────────────────────────────────────────────
   renderForceGraph
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * @param {HTMLElement} container   — the .graph element
 * @param {{ nodes, links }}        — model from buildGraph()
 * @param {object} handlers         — { onHover(node|null), onSelect(node|null), onPin(node|null) }
 * @returns controller              — { setHighlight(id), destroy() }
 */
export function renderForceGraph(container, { nodes, links }, handlers = {}) {
  // ── sizing ────────────────────────────────────────────────────────────────
  const W = container.clientWidth  || 900;
  const H = container.clientHeight || 600;
  const cx = W / 2;
  const cy = H / 2;

  // Cluster centres — evenly spaced in a circle around the viewport centre
  const clusterCount = Math.max(...nodes.map((n) => n.clusterIndex + 1), 1);
  const clusterR = Math.min(W, H) * 0.27;
  const clusterCentres = Array.from({ length: clusterCount }, (_, i) => {
    const a = (i / clusterCount) * 2 * Math.PI - Math.PI / 2;
    return {
      x: cx + (clusterCount === 1 ? 0 : clusterR * Math.cos(a)),
      y: cy + (clusterCount === 1 ? 0 : clusterR * Math.sin(a))
    };
  });

  // Seed initial positions near their cluster centre
  nodes.forEach((n) => {
    const c = clusterCentres[n.clusterIndex] || { x: cx, y: cy };
    n.x = c.x + (Math.random() - 0.5) * 80;
    n.y = c.y + (Math.random() - 0.5) * 80;
    n.restX = c.x + (Math.random() - 0.5) * 60;   // will be set after first tick
    n.restY = c.y + (Math.random() - 0.5) * 60;
  });

  // ── SVG scaffold ──────────────────────────────────────────────────────────
  // Remove any previous render
  d3.select(container).selectAll('svg.force-graph').remove();

  // zoomLevel is live-updated by setZoom() — shrinks the viewBox around centre
  let zoomLevel = 1;

  const svg = d3.select(container)
    .append('svg')
    .attr('class', 'force-graph')
    .attr('width', '100%')
    .attr('height', '100%')
    .attr('viewBox', `0 0 ${W} ${H}`)
    .attr('preserveAspectRatio', 'xMidYMid meet')
    .attr('role', 'img')
    .attr('aria-label', 'Force-cloud map of your issues and connections');

  // Defs
  const defs = svg.append('defs');
  defs.append('filter').attr('id', 'glow')
    .call((f) => {
      f.append('feGaussianBlur').attr('stdDeviation', '3.5').attr('result', 'blur');
      f.append('feMerge').call((m) => {
        m.append('feMergeNode').attr('in', 'blur');
        m.append('feMergeNode').attr('in', 'SourceGraphic');
      });
    });

  defs.append('filter').attr('id', 'shadow')
    .call((f) => {
      f.append('feDropShadow')
        .attr('dx', 0).attr('dy', 2).attr('stdDeviation', 4)
        .attr('flood-color', PALETTE.ink).attr('flood-opacity', 0.18);
    });

  const linkLayer = svg.append('g').attr('class', 'link-layer');
  const nodeLayer = svg.append('g').attr('class', 'node-layer');
  const labelLayer = svg.append('g').attr('class', 'label-layer');

  // ── D3 simulation ─────────────────────────────────────────────────────────
  // spacingMult is live-updated by setSpacing() without re-rendering
  let spacingMult = 1;

  const simulation = d3.forceSimulation(nodes)
    .force('link', d3.forceLink(links)
      .id((d) => d.id)
      .distance((l) => {
        const src = l.source;
        if (src.kind === 'issue') return 90 * spacingMult;
        return 55 * spacingMult;
      })
      .strength(0.35)
    )
    .force('charge', d3.forceManyBody().strength((d) => d.kind === 'issue' ? -320 * spacingMult : -80 * spacingMult))
    .force('collision', d3.forceCollide().radius((d) => (d.r + 10) * spacingMult).strength(0.8))
    .force('cluster', () => {
      // Pull each node gently toward its cluster centre
      for (const node of nodes) {
        const c = clusterCentres[node.clusterIndex];
        if (!c || node.kind === 'issue') continue;
        const strength = 0.04;
        node.vx = (node.vx || 0) + (c.x - node.x) * strength;
        node.vy = (node.vy || 0) + (c.y - node.y) * strength;
      }
    })
    .force('hubCluster', () => {
      // Pull issue hubs toward their designated centres more firmly
      for (const node of nodes) {
        if (node.kind !== 'issue') continue;
        const c = clusterCentres[node.clusterIndex];
        if (!c) continue;
        node.vx = (node.vx || 0) + (c.x - node.x) * 0.12;
        node.vy = (node.vy || 0) + (c.y - node.y) * 0.12;
      }
    })
    .force('bound', () => {
      // Keep nodes inside the canvas
      const pad = 48;
      for (const node of nodes) {
        node.x = Math.max(pad, Math.min(W - pad, node.x || cx));
        node.y = Math.max(pad, Math.min(H - pad, node.y || cy));
      }
    })
    .alphaDecay(0.025)
    .velocityDecay(0.42);

  // ── Links ─────────────────────────────────────────────────────────────────
  const linkSel = linkLayer.selectAll('line')
    .data(links)
    .join('line')
    .attr('stroke', (d) => {
      const tgt = typeof d.target === 'object' ? d.target : nodes.find((n) => n.id === d.target);
      return tgt ? tgt.color : PALETTE.rule;
    })
    .attr('stroke-width', 1.2)
    .attr('stroke-opacity', 0.35)
    .attr('stroke-dasharray', (d) => d.catKind === 'topic' ? '4 3' : null);

  // ── Nodes ─────────────────────────────────────────────────────────────────
  const nodeGs = nodeLayer.selectAll('g.node')
    .data(nodes, (d) => d.id)
    .join('g')
    .attr('class', 'node')
    .attr('role', 'button')
    .attr('tabindex', '0')
    .attr('aria-label', (d) => `${d.title} — click to pin`);

  // Halo (glow ring, shown on hover/pin)
  nodeGs.append('circle')
    .attr('class', 'node-halo')
    .attr('r', (d) => d.r + 14)
    .attr('fill', (d) => d.color)
    .attr('opacity', 0)
    .style('pointer-events', 'none');

  // Body
  nodeGs.append('circle')
    .attr('class', 'node-body')
    .attr('r', (d) => d.r)
    .attr('fill', (d) => d.kind === 'issue' ? d.color : PALETTE.paperRaised)
    .attr('stroke', (d) => d.color)
    .attr('stroke-width', (d) => d.kind === 'issue' ? 0 : 2)
    .attr('filter', (d) => d.kind === 'issue' ? 'url(#glow)' : null);

  // Inner dot for leaf nodes
  nodeGs.filter((d) => d.kind !== 'issue')
    .append('circle')
    .attr('class', 'node-dot')
    .attr('r', 3.5)
    .attr('fill', (d) => d.color)
    .attr('opacity', 1);

  // Pin indicator (ring) for pinned state
  nodeGs.append('circle')
    .attr('class', 'node-pin')
    .attr('r', (d) => d.r + 4)
    .attr('fill', 'none')
    .attr('stroke', (d) => d.color)
    .attr('stroke-width', 2.5)
    .attr('stroke-dasharray', '4 2.5')
    .attr('opacity', 0)
    .style('pointer-events', 'none');

  // Labels
  const labelGs = labelLayer.selectAll('g.nlabel')
    .data(nodes, (d) => d.id)
    .join('g')
    .attr('class', 'nlabel')
    .style('pointer-events', 'none');

  labelGs.append('text')
    .attr('text-anchor', 'middle')
    .attr('dominant-baseline', 'middle')
    .attr('dy', (d) => d.r + 13)
    .attr('font-family', 'Archivo, sans-serif')
    .attr('font-size', (d) => d.kind === 'issue' ? 13 : 10.5)
    .attr('font-weight', (d) => d.kind === 'issue' ? 700 : 500)
    .attr('letter-spacing', (d) => d.kind === 'issue' ? '0.04em' : '0')
    .attr('fill', (d) => d.kind === 'issue' ? PALETTE.ink : PALETTE.soft)
    .text((d) => d.label);

  // ── Tick ──────────────────────────────────────────────────────────────────
  simulation.on('tick', () => {
    linkSel
      .attr('x1', (d) => d.source.x)
      .attr('y1', (d) => d.source.y)
      .attr('x2', (d) => d.target.x)
      .attr('y2', (d) => d.target.y);

    nodeGs.attr('transform', (d) => `translate(${d.x},${d.y})`);
    labelGs.attr('transform', (d) => `translate(${d.x},${d.y})`);
  });

  // Record rest positions after the simulation has cooled a bit
  simulation.on('end', () => {
    nodes.forEach((n) => { n.restX = n.x; n.restY = n.y; });
  });

  // ── Drag with spring-back ─────────────────────────────────────────────────
  let draggedNode = null;
  let springRAF = null;

  function springBack(node) {
    if (springRAF) cancelAnimationFrame(springRAF);
    const targetX = node.restX ?? node.x;
    const targetY = node.restY ?? node.y;

    function step() {
      const dx = targetX - node.x;
      const dy = targetY - node.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 0.5) {
        node.x = targetX;
        node.y = targetY;
        node.vx = 0;
        node.vy = 0;
        simulation.alphaTarget(0);
        return;
      }
      // Spring force: ease toward target
      node.vx = dx * 0.12;
      node.vy = dy * 0.12;
      simulation.alphaTarget(0.05).restart();
      springRAF = requestAnimationFrame(step);
    }
    step();
  }

  const drag = d3.drag()
    .on('start', (event, d) => {
      if (springRAF) cancelAnimationFrame(springRAF);
      draggedNode = d;
      simulation.alphaTarget(0.25).restart();
      d.fx = d.x;
      d.fy = d.y;
    })
    .on('drag', (event, d) => {
      d.fx = event.x;
      d.fy = event.y;
    })
    .on('end', (event, d) => {
      d.fx = null;
      d.fy = null;
      draggedNode = null;
      springBack(d);
    });

  nodeGs.call(drag);

  // ── Hover / click interactions ────────────────────────────────────────────
  let hoveredId = null;
  let pinnedId = null;

  function paintNode(nodeEl, nodeData, state) {
    // state: 'default' | 'hover' | 'pinned'
    const on = state !== 'default';
    const isPinned = state === 'pinned';

    nodeEl.select('.node-halo')
      .transition().duration(180)
      .attr('opacity', on ? 0.13 : 0);

    nodeEl.select('.node-body')
      .transition().duration(180)
      .attr('r', on ? nodeData.r * 1.15 : nodeData.r)
      .attr('fill', on && nodeData.kind !== 'issue' ? nodeData.color : (nodeData.kind === 'issue' ? nodeData.color : PALETTE.paperRaised))
      .attr('filter', on ? 'url(#shadow)' : (nodeData.kind === 'issue' ? 'url(#glow)' : null));

    nodeEl.select('.node-dot')
      .transition().duration(180)
      .attr('opacity', on ? 0 : 1);

    nodeEl.select('.node-pin')
      .transition().duration(180)
      .attr('opacity', isPinned ? 0.9 : 0);
  }

  function repaintAll() {
    nodeGs.each(function (d) {
      const state =
        d.id === pinnedId ? 'pinned'
        : d.id === hoveredId && !pinnedId ? 'hover'
        : 'default';
      paintNode(d3.select(this), d, state);
    });

    // Dim/highlight links
    linkSel
      .transition().duration(180)
      .attr('stroke-opacity', (l) => {
        const active = pinnedId || hoveredId;
        if (!active) return 0.35;
        const srcId = typeof l.source === 'object' ? l.source.id : l.source;
        const tgtId = typeof l.target === 'object' ? l.target.id : l.target;
        return (srcId === active || tgtId === active) ? 0.85 : 0.12;
      })
      .attr('stroke-width', (l) => {
        const active = pinnedId || hoveredId;
        if (!active) return 1.2;
        const srcId = typeof l.source === 'object' ? l.source.id : l.source;
        const tgtId = typeof l.target === 'object' ? l.target.id : l.target;
        return (srcId === active || tgtId === active) ? 2.2 : 1.0;
      });

    labelGs.select('text')
      .transition().duration(180)
      .attr('fill', (d) => {
        const active = pinnedId || hoveredId;
        if (!active) return d.kind === 'issue' ? PALETTE.ink : PALETTE.soft;
        return d.id === active ? d.color : PALETTE.faint;
      })
      .attr('font-weight', (d) => {
        const active = pinnedId || hoveredId;
        return (d.id === active || d.kind === 'issue') ? 700 : 500;
      });
  }

  nodeGs
    .on('mouseenter', function (event, d) {
      if (d.id === pinnedId) return;
      hoveredId = d.id;
      repaintAll();
      handlers.onHover?.(d);
    })
    .on('mouseleave', function (event, d) {
      if (d.id === pinnedId) return;
      hoveredId = null;
      repaintAll();
      handlers.onHover?.(null);
    })
    .on('focus', function (event, d) {
      hoveredId = d.id;
      repaintAll();
      handlers.onHover?.(d);
    })
    .on('blur', function (event, d) {
      if (d.id !== pinnedId) {
        hoveredId = null;
        repaintAll();
        handlers.onHover?.(null);
      }
    })
    .on('click', function (event, d) {
      event.stopPropagation();
      if (pinnedId === d.id) {
        // Un-pin
        pinnedId = null;
        hoveredId = null;
        repaintAll();
        handlers.onPin?.(null);
      } else {
        pinnedId = d.id;
        hoveredId = null;
        repaintAll();
        handlers.onPin?.(d);
      }
    })
    .on('keydown', function (event, d) {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        this.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      }
    });

  // Click on background un-pins
  svg.on('click', () => {
    if (pinnedId) {
      pinnedId = null;
      hoveredId = null;
      repaintAll();
      handlers.onPin?.(null);
    }
  });

  // ── Resize handling ───────────────────────────────────────────────────────
  const ro = new ResizeObserver(() => {
    const nw = container.clientWidth;
    const nh = container.clientHeight;
    if (!nw || !nh) return;
    svg.attr('viewBox', `0 0 ${nw} ${nh}`);
    // Recentre cluster centres proportionally
    const scaleX = nw / W;
    const scaleY = nh / H;
    clusterCentres.forEach((c, i) => {
      const a = (i / clusterCount) * 2 * Math.PI - Math.PI / 2;
      const cr = Math.min(nw, nh) * 0.27;
      c.x = nw / 2 + (clusterCount === 1 ? 0 : cr * Math.cos(a));
      c.y = nh / 2 + (clusterCount === 1 ? 0 : cr * Math.sin(a));
    });
    simulation.force('bound', () => {
      const pad = 48;
      for (const node of nodes) {
        node.x = Math.max(pad, Math.min(nw - pad, node.x || nw / 2));
        node.y = Math.max(pad, Math.min(nh - pad, node.y || nh / 2));
      }
    });
    simulation.alpha(0.2).restart();
  });
  ro.observe(container);

  // ── Controller ────────────────────────────────────────────────────────────
  return {
    /** Externally highlight a node (e.g. card hover) without pinning it */
    setHighlight(id) {
      if (pinnedId) return; // pinned takes precedence
      hoveredId = id || null;
      repaintAll();
    },
    /**
     * Update node spacing without re-rendering.
     * @param {number} mult – multiplier (0.5 = tighter, 2.0 = looser), default 1
     */
    setSpacing(mult) {
      spacingMult = Math.max(0.4, Math.min(2.5, mult));
      // Re-apply each force function so the new multiplier takes effect
      simulation.force('link').distance((l) => {
        const src = l.source;
        if (src.kind === 'issue') return 90 * spacingMult;
        return 55 * spacingMult;
      });
      simulation.force('charge').strength((d) => d.kind === 'issue' ? -320 * spacingMult : -80 * spacingMult);
      simulation.force('collision').radius((d) => (d.r + 10) * spacingMult);
      // Also scale the cluster orbit radii so clusters spread proportionally
      const nw = container.clientWidth;
      const nh = container.clientHeight;
      const clusterCount = clusterCentres.length;
      clusterCentres.forEach((c, i) => {
        const a = (i / clusterCount) * 2 * Math.PI - Math.PI / 2;
        const cr = Math.min(nw, nh) * 0.27 * spacingMult;
        c.x = nw / 2 + (clusterCount === 1 ? 0 : cr * Math.cos(a));
        c.y = nh / 2 + (clusterCount === 1 ? 0 : cr * Math.sin(a));
      });
      simulation.alpha(0.35).restart();
    },
    /**
     * Zoom the graph by scaling the SVG viewBox around the canvas centre.
     * @param {number} level – zoom factor (1 = default, 2 = 2× in, 0.5 = out)
     */
    setZoom(level) {
      zoomLevel = Math.max(0.4, Math.min(3, level));
      const nw = container.clientWidth  || W;
      const nh = container.clientHeight || H;
      // A higher zoomLevel means a smaller viewBox window (zoom in)
      const vw = nw / zoomLevel;
      const vh = nh / zoomLevel;
      const vx = (nw - vw) / 2;
      const vy = (nh - vh) / 2;
      svg.attr('viewBox', `${vx} ${vy} ${vw} ${vh}`);
    },
    destroy() {
      simulation.stop();
      ro.disconnect();
      d3.select(container).selectAll('svg.force-graph').remove();
    }
  };
}

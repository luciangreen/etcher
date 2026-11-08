// Flowcharts from text. Three ways to write one:
//   arrows      Start -> Check stock -> In stock? -> yes: Ship the order -> End
//               In stock? -> no: Order more -> Check stock
//   steps       one step per line; a line ending "?" is a decision, and
//               "yes: Ship the order / no: Order more" (or "yes -> …, no -> …") branch from it
//   sentences   First check the stock. If it is in stock, ship the order; otherwise order more. Then finish.
// Shapes follow the usual conventions: ovals start and end, diamonds decide, boxes do.
// Layout is in layers from the start, so arrows run downwards; arrows that loop back are dashed.
import { makeShape } from './shapes.js';

const TERMINAL = /^(start|begin|end|finish|stop|done|exit)\b/i;
const norm = (s) => s.trim().replace(/\s+/g, ' ').replace(/[.]+$/, '');
const keyOf = (s) => norm(s).toLowerCase().replace(/[?]+$/, '');

export function parseFlow(text) {
  const nodes = new Map();
  const edges = [];
  const node = (label) => {
    const l = norm(label);
    const k = keyOf(l);
    if (!nodes.has(k)) nodes.set(k, { key: k, label: l.replace(/\?+$/, '?'), kind: kindOf(l) });
    else if (/\?$/.test(l)) nodes.get(k).kind = 'decision';
    return nodes.get(k);
  };
  const edge = (a, b, label = '') => { if (!edges.some((e) => e.from === a.key && e.to === b.key && e.label === label)) edges.push({ from: a.key, to: b.key, label }); };
  const src = String(text ?? '').trim();
  if (/->|→/.test(src)) {
    for (const line of src.split(/\n|;/).map((l) => l.trim()).filter(Boolean)) {
      const parts = line.split(/\s*(?:->|→)\s*/).filter(Boolean);
      let prev = null;
      for (const raw of parts) {
        const m = /^(yes|no|true|false|otherwise|else)\s*:\s*(.+)$/i.exec(raw);
        const cur = node(m ? m[2] : raw);
        if (prev) edge(prev, cur, m ? m[1].toLowerCase().replace(/^(otherwise|else)$/, 'no') : '');
        prev = cur;
      }
    }
  } else if (src.split('\n').filter((l) => l.trim()).length > 1 && !/\b(if|then|otherwise)\b/i.test(src.split('\n')[0])) {
    // one step per line
    const lines = src.split('\n').map((l) => l.replace(/^\s*(\d+[.)]|[-*•])\s*/, '').trim()).filter(Boolean);
    let prev = null;
    let pendingNo = null;
    for (const line of lines) {
      const branch = /^(.*\?)\s*(?:yes\s*(?::|->|→)\s*([^,/]+?))?\s*[,/]?\s*(?:no\s*(?::|->|→)\s*(.+))?$/i.exec(line);
      if (branch && branch[1] && (branch[2] || branch[3])) {
        const d = node(branch[1]);
        if (prev) edge(prev, d, prev.kind === 'decision' ? 'no' : '');
        if (branch[2]) { const y = node(branch[2]); edge(d, y, 'yes'); prev = y; } else prev = d;
        if (branch[3]) pendingNo = { from: d, to: node(branch[3]) };
        continue;
      }
      const cur = node(line);
      if (prev) edge(prev, cur, prev.kind === 'decision' ? 'yes' : '');
      if (pendingNo) { edge(pendingNo.from, pendingNo.to, 'no'); if (pendingNo.to !== cur && !edges.some((e) => e.from === pendingNo.to.key)) edge(pendingNo.to, cur); pendingNo = null; }
      prev = cur;
    }
  } else {
    // sentences
    const sentences = src.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
    let prev = null;
    let open = [];
    for (let s of sentences) {
      s = s.replace(/[.!]+$/, '').replace(/^(first|then|next|after that|afterwards|finally|lastly)\s*,?\s*/i, '');
      const m = /^if\s+(.+?)(?:,\s*|\s+then\s+)(.+?)(?:[;,]\s*(?:otherwise|else|if not)\s*,?\s*(.+))?$/i.exec(s);
      let ends;
      if (m) {
        const d = node(question(m[1]));
        for (const p of prev ? [prev] : []) edge(p, d);
        for (const o of open) edge(o.node, d, o.label);
        const y = node(cap(m[2]));
        edge(d, y, 'yes');
        ends = [{ node: y, label: '' }];
        if (m[3]) { const n2 = node(cap(m[3])); edge(d, n2, 'no'); ends.push({ node: n2, label: '' }); } else ends.push({ node: d, label: 'no' });
        prev = null;
        open = ends;
        continue;
      }
      const cur = node(cap(s));
      if (prev) edge(prev, cur);
      for (const o of open) edge(o.node, cur, o.label);
      open = [];
      prev = cur;
    }
  }
  return { nodes: [...nodes.values()], edges };
}
const cap = (s) => s.trim()[0].toUpperCase() + s.trim().slice(1);
// "it is in stock" -> "Is it in stock?"; "the order has arrived" -> "Has the order arrived?"
export function question(cond) {
  const c = cond.trim().replace(/\?+$/, '');
  const m = /^(.+?)\s+(is|are|was|were|has|have|can|will|does|do)\s+(.+)$/i.exec(c);
  if (m && m[1].split(/\s+/).length <= 3) return `${cap(m[2].toLowerCase())} ${m[1].toLowerCase() === 'i' ? 'I' : m[1].toLowerCase()} ${m[3]}?`;
  return `${cap(c)}?`;
}

function kindOf(label) {
  if (/\?$/.test(label.trim())) return 'decision';
  if (TERMINAL.test(label.trim())) return 'terminal';
  if (/^(input|output|read|print|show|display|enter|ask for)\b/i.test(label.trim())) return 'io';
  return 'process';
}

// Layers: each node one below the furthest node that leads to it (ignoring loops back).
export function layout({ nodes, edges }, { width = 800, top = 40, rowGap = 110 } = {}) {
  const out = new Map(nodes.map((n) => [n.key, []]));
  for (const e of edges) out.get(e.from).push(e);
  // back edges: found by a depth-first walk from the start (the first node, or a "start" node)
  const startNode = nodes.find((n) => /^(start|begin)/i.test(n.label)) ?? nodes[0];
  const back = new Set();
  const state = new Map();
  const visit = (k) => {
    state.set(k, 'open');
    for (const e of out.get(k)) {
      if (state.get(e.to) === 'open') back.add(e);
      else if (!state.has(e.to)) visit(e.to);
    }
    state.set(k, 'done');
  };
  if (startNode) visit(startNode.key);
  for (const n of nodes) if (!state.has(n.key)) visit(n.key);
  const layer = new Map(nodes.map((n) => [n.key, 0]));
  for (let pass = 0; pass < nodes.length; pass++) {
    let moved = false;
    for (const e of edges) if (!back.has(e) && layer.get(e.to) <= layer.get(e.from)) { layer.set(e.to, layer.get(e.from) + 1); moved = true; }
    if (!moved) break;
  }
  const rows = [];
  for (const n of nodes) (rows[layer.get(n.key)] ??= []).push(n);
  const sizeOf = (n) => {
    const w = Math.max(n.kind === 'decision' ? 150 : 120, Math.min(260, n.label.length * 8 + 40));
    return { w, h: n.kind === 'decision' ? 80 : 56 };
  };
  const shapes = [];
  const ids = new Map();
  rows.forEach((row, r) => {
    const sizes = row.map(sizeOf);
    const total = sizes.reduce((a, s) => a + s.w, 0) + (row.length - 1) * 40;
    let x = Math.max(20, width / 2 - total / 2);
    row.forEach((n, i) => {
      const { w, h } = sizes[i];
      const kind = { terminal: 'ellipse', decision: 'diamond', io: 'rect', process: 'rect' }[n.kind];
      const fill = { terminal: '#e8f1fc', decision: '#fff4e0', io: '#eef8ee', process: '#ffffff' }[n.kind];
      const id = `f${shapes.length + 1}`;
      shapes.push({ ...makeShape(kind, { x, y: top + r * rowGap + (n.kind === 'decision' ? 0 : 12), w, h, fill, text: n.label, id }), role: n.kind, labelSize: 14 });
      ids.set(n.key, id);
      x += w + 40;
    });
  });
  const connectors = edges.map((e, i) => ({ kind: 'connector', id: `c${i + 1}`, from: ids.get(e.from), to: ids.get(e.to), label: e.label, dashed: back.has(e), stroke: '#444', strokeWidth: 2 }));
  const height = top + rows.length * rowGap + 20;
  return { shapes: [...shapes, ...connectors], height, layers: rows.length, backEdges: back.size };
}

export const flowchart = (text, opts) => layout(parseFlow(text), opts);

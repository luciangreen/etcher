// Etcher's shapes. Every shape is points, so filters (rotation, 3D, vector fill) work the
// same way on all of them and can be checked by measuring:
//   polygon kinds  { kind, points: [[x, y], ...], fill, stroke, strokeWidth, text }
//   ellipse        { kind: 'ellipse', cx, cy, rx, ry, rotate }
//   line / arrow   { kind, points: [[x1, y1], [x2, y2]] }
//   text           { kind: 'text', x, y, text, size }
//   connector      { kind: 'connector', from: shapeId, to: shapeId, label }  (drawn between shapes)

export const COLOURS = {
  red: '#d64541', orange: '#f39c12', yellow: '#f5d142', green: '#2ecc71', blue: '#3a7bd5', purple: '#8e44ad', pink: '#e86fa6',
  brown: '#8b5a2b', black: '#222222', white: '#ffffff', grey: '#95a5a6', gray: '#95a5a6', teal: '#16a085', navy: '#1f3a6b', gold: '#d4a017'
};
export const COLOUR_NAMES = Object.fromEntries(Object.entries(COLOURS).map(([k, v]) => [v, k]));

const round = (x) => Math.round(x * 100) / 100;

// Regular polygons and stars, inscribed in the box (x, y, w, h).
function regular(n, x, y, w, h, start = -Math.PI / 2) {
  return Array.from({ length: n }, (_, i) => {
    const a = start + (i * 2 * Math.PI) / n;
    return [round(x + w / 2 + (w / 2) * Math.cos(a)), round(y + h / 2 + (h / 2) * Math.sin(a))];
  });
}
function star(x, y, w, h, points = 5) {
  return Array.from({ length: points * 2 }, (_, i) => {
    const a = -Math.PI / 2 + (i * Math.PI) / points;
    const r = i % 2 ? 0.45 : 1;
    return [round(x + w / 2 + (w / 2) * r * Math.cos(a)), round(y + h / 2 + (h / 2) * r * Math.sin(a))];
  });
}

export const KINDS = ['rect', 'square', 'circle', 'ellipse', 'diamond', 'triangle', 'star', 'pentagon', 'hexagon', 'line', 'arrow', 'text', 'heart'];

export function makeShape(kind, { x = 0, y = 0, w = 100, h = 100, fill = '#ffffff', stroke = '#222222', strokeWidth = 2, text = '', size = 18, id } = {}) {
  const base = { fill, stroke, strokeWidth, text, ...(id ? { id } : {}) };
  switch (kind) {
    case 'square': case 'rect': case 'rectangle': case 'box':
      return { ...base, kind: kind === 'square' ? 'square' : 'rect', points: [[x, y], [x + w, y], [x + w, y + h], [x, y + h]] };
    case 'circle': case 'ellipse': case 'oval':
      return { ...base, kind: 'ellipse', cx: x + w / 2, cy: y + h / 2, rx: w / 2, ry: h / 2, rotate: 0 };
    case 'diamond': case 'rhombus':
      return { ...base, kind: 'diamond', points: [[x + w / 2, y], [x + w, y + h / 2], [x + w / 2, y + h], [x, y + h / 2]] };
    case 'triangle':
      return { ...base, kind: 'triangle', points: [[x + w / 2, y], [x + w, y + h], [x, y + h]] };
    case 'star': return { ...base, kind: 'star', points: star(x, y, w, h) };
    case 'pentagon': return { ...base, kind: 'pentagon', points: regular(5, x, y, w, h) };
    case 'hexagon': return { ...base, kind: 'hexagon', points: regular(6, x, y, w, h, 0) };
    case 'heart': {
      const pts = [];
      for (let i = 0; i < 40; i++) {
        const t = (i / 40) * 2 * Math.PI;
        const hx = 16 * Math.sin(t) ** 3, hy = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
        pts.push([round(x + w / 2 + (hx / 34) * w), round(y + h * 0.42 + (hy / 32) * h)]);
      }
      return { ...base, kind: 'heart', points: pts };
    }
    case 'line': return { ...base, kind: 'line', fill: 'none', points: [[x, y + h / 2], [x + w, y + h / 2]] };
    case 'arrow': return { ...base, kind: 'arrow', fill: 'none', points: [[x, y + h / 2], [x + w, y + h / 2]] };
    case 'text': return { ...base, kind: 'text', x, y: y + size, text: text || 'Text', size, fill: fill === '#ffffff' ? '#222222' : fill, stroke: 'none' };
    default: throw new Error(`Etcher can't draw a ${kind} yet`);
  }
}

// An ellipse as points (for filters that need edges).
export function ellipsePoints(s, n = 48) {
  const r = (s.rotate ?? 0) * Math.PI / 180;
  return Array.from({ length: n }, (_, i) => {
    const t = (i * 2 * Math.PI) / n;
    const ex = s.rx * Math.cos(t), ey = s.ry * Math.sin(t);
    return [round(s.cx + ex * Math.cos(r) - ey * Math.sin(r)), round(s.cy + ex * Math.sin(r) + ey * Math.cos(r))];
  });
}
export const pointsOf = (s) => (s.kind === 'ellipse' ? ellipsePoints(s) : s.kind === 'text' ? [[s.x, s.y - s.size], [s.x + textWidth(s), s.y]] : s.points ?? []);
const textWidth = (s) => (s.text?.length ?? 0) * s.size * 0.55;

export function bbox(s) {
  if (Array.isArray(s)) {
    const boxes = s.filter((x) => x.kind !== 'connector').map(bbox);
    if (!boxes.length) return { x: 0, y: 0, w: 0, h: 0 };
    const x1 = Math.min(...boxes.map((b) => b.x)), y1 = Math.min(...boxes.map((b) => b.y));
    return { x: x1, y: y1, w: Math.max(...boxes.map((b) => b.x + b.w)) - x1, h: Math.max(...boxes.map((b) => b.y + b.h)) - y1 };
  }
  if (s.kind === 'ellipse' && !s.rotate) return { x: s.cx - s.rx, y: s.cy - s.ry, w: 2 * s.rx, h: 2 * s.ry };
  const pts = pointsOf(s);
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
}
export const centre = (s) => { const b = bbox(s); return [b.x + b.w / 2, b.y + b.h / 2]; };

// Area by the shoelace formula (exact for polygons; ellipses use pi * rx * ry).
export function area(s) {
  if (s.kind === 'ellipse') return Math.PI * s.rx * s.ry;
  const p = s.points ?? [];
  if (p.length < 3) return 0;
  let a = 0;
  for (let i = 0; i < p.length; i++) { const [x1, y1] = p[i], [x2, y2] = p[(i + 1) % p.length]; a += x1 * y2 - x2 * y1; }
  return Math.abs(a) / 2;
}

// Move and resize: every point is mapped from the old box to the new one.
export function moveShape(s, dx, dy) {
  if (s.kind === 'ellipse') return { ...s, cx: round(s.cx + dx), cy: round(s.cy + dy) };
  if (s.kind === 'text') return { ...s, x: round(s.x + dx), y: round(s.y + dy) };
  if (s.kind === 'connector') return s;
  return { ...s, points: s.points.map(([x, y]) => [round(x + dx), round(y + dy)]) };
}
export function scaleShape(s, k, about = centre(s)) {
  const [ax, ay] = about;
  if (s.kind === 'ellipse') return { ...s, cx: round(ax + (s.cx - ax) * k), cy: round(ay + (s.cy - ay) * k), rx: round(s.rx * k), ry: round(s.ry * k) };
  if (s.kind === 'text') return { ...s, x: round(ax + (s.x - ax) * k), y: round(ay + (s.y - ay) * k), size: round(s.size * k) };
  if (s.kind === 'connector') return s;
  return { ...s, points: s.points.map(([x, y]) => [round(ax + (x - ax) * k), round(ay + (y - ay) * k)]), strokeWidth: s.strokeWidth };
}
export function setBox(s, box) {
  const b = bbox(s);
  if (s.kind === 'ellipse') return { ...s, cx: box.x + box.w / 2, cy: box.y + box.h / 2, rx: box.w / 2, ry: box.h / 2 };
  if (s.kind === 'text') return { ...s, x: box.x, y: box.y + s.size };
  const sx = b.w ? box.w / b.w : 1, sy = b.h ? box.h / b.h : 1;
  return { ...s, points: s.points.map(([x, y]) => [round(box.x + (x - b.x) * sx), round(box.y + (y - b.y) * sy)]) };
}

// Where a line from a shape's centre towards (tx, ty) leaves its box: connectors start there.
function edgePoint(s, tx, ty) {
  const b = bbox(s);
  const [cx, cy] = [b.x + b.w / 2, b.y + b.h / 2];
  const dx = tx - cx, dy = ty - cy;
  if (!dx && !dy) return [cx, cy];
  const sx = dx ? (b.w / 2) / Math.abs(dx) : Infinity, sy = dy ? (b.h / 2) / Math.abs(dy) : Infinity;
  const k = Math.min(sx, sy);
  return [round(cx + dx * k), round(cy + dy * k)];
}
export function connectorPoints(c, byId) {
  const a = byId.get(c.from), b = byId.get(c.to);
  if (!a || !b) return null;
  const [bx, by] = centre(b), [ax, ay] = centre(a);
  return [edgePoint(a, bx, by), edgePoint(b, ax, ay)];
}

// ------------------------------------------------------------------ SVG
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const pts = (p) => p.map(([x, y]) => `${x},${y}`).join(' ');

export function shapeSVG(s, byId = new Map()) {
  const attrs = `fill="${esc(s.fill ?? 'none')}" stroke="${esc(s.stroke ?? '#222')}" stroke-width="${s.strokeWidth ?? 2}"${s.opacity !== undefined ? ` opacity="${s.opacity}"` : ''}${s.id ? ` data-id="${esc(s.id)}"` : ''}`;
  let out = '';
  if (s.kind === 'ellipse') out = `<ellipse cx="${s.cx}" cy="${s.cy}" rx="${s.rx}" ry="${s.ry}"${s.rotate ? ` transform="rotate(${s.rotate} ${s.cx} ${s.cy})"` : ''} ${attrs}/>`;
  else if (s.kind === 'text') out = `<text x="${s.x}" y="${s.y}" font-size="${s.size}" fill="${esc(s.fill)}"${s.id ? ` data-id="${esc(s.id)}"` : ''} font-family="system-ui, sans-serif">${esc(s.text)}</text>`;
  else if (s.kind === 'line' || s.kind === 'arrow') out = `<polyline points="${pts(s.points)}" fill="none" stroke="${esc(s.stroke)}" stroke-width="${s.strokeWidth ?? 2}"${s.kind === 'arrow' ? ' marker-end="url(#arrowhead)"' : ''}${s.id ? ` data-id="${esc(s.id)}"` : ''}/>`;
  else if (s.kind === 'connector') {
    const p = connectorPoints(s, byId);
    if (!p) return '';
    out = `<line x1="${p[0][0]}" y1="${p[0][1]}" x2="${p[1][0]}" y2="${p[1][1]}" stroke="${esc(s.stroke ?? '#444')}" stroke-width="${s.strokeWidth ?? 2}" marker-end="url(#arrowhead)"${s.dashed ? ' stroke-dasharray="6 4"' : ''}${s.id ? ` data-id="${esc(s.id)}"` : ''}/>`;
    if (s.label) out += `<text x="${round((p[0][0] + p[1][0]) / 2 + 6)}" y="${round((p[0][1] + p[1][1]) / 2 - 4)}" font-size="13" fill="#444" font-family="system-ui, sans-serif">${esc(s.label)}</text>`;
    return out;
  } else out = `<polygon points="${pts(s.points)}" ${attrs}/>`;
  // a label inside the shape
  if (s.text && s.kind !== 'text') {
    const [cx, cy] = centre(s);
    const size = s.labelSize ?? 15;
    out += `<text x="${round(cx)}" y="${round(cy + size / 3)}" text-anchor="middle" font-size="${size}" fill="${esc(s.textColour ?? '#222')}" font-family="system-ui, sans-serif" pointer-events="none">${esc(s.text)}</text>`;
  }
  return out;
}

export function toSVG(shapes, { width = 800, height = 600, background = '#ffffff', caption = '' } = {}) {
  const byId = new Map(shapes.filter((s) => s.id).map((s) => [s.id, s]));
  // connectors under the shapes they join
  const ordered = [...shapes.filter((s) => s.kind === 'connector'), ...shapes.filter((s) => s.kind !== 'connector')];
  const body = ordered.map((s) => shapeSVG(s, byId)).join('\n  ');
  const cap = caption ? `\n  <text x="${width / 2}" y="${height - 14}" text-anchor="middle" font-size="16" fill="#444" font-family="system-ui, sans-serif">${esc(caption)}</text>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <defs><marker id="arrowhead" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#444"/></marker></defs>
  <rect x="0" y="0" width="${width}" height="${height}" fill="${esc(background)}"/>
  ${body}${cap}
</svg>
`;
}

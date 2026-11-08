// Etcher's mathematical filters, each a Lucian Office plug-in whose result is measured, so
// you can check what it did (and the tests do):
//   rotate       turns shapes about their joint centre by an angle; areas and distances are kept
//   3D           extrudes a shape: a back face moved by the depth at an angle, and a side face
//                for every edge, shaded; the front stays where it was
//   vector fill  "zoom out and fill in": the drawing is scaled down about the canvas centre and
//                copies are tiled around it until the canvas is filled
import { bbox, centre, ellipsePoints, area } from './shapes.js';

const round = (x) => Math.round(x * 100) / 100;
const rad = (deg) => (deg * Math.PI) / 180;

export function rotatePoint([x, y], deg, [cx, cy]) {
  const a = rad(deg), c = Math.cos(a), s = Math.sin(a);
  return [round(cx + (x - cx) * c - (y - cy) * s), round(cy + (x - cx) * s + (y - cy) * c)];
}

export function rotate(shapes, deg, about = null) {
  const pivot = about ?? centre({ kind: 'group', points: shapes.flatMap((s) => { const b = bbox(s); return [[b.x, b.y], [b.x + b.w, b.y + b.h]]; }) });
  const out = shapes.map((s) => {
    if (s.kind === 'connector') return s;
    if (s.kind === 'ellipse') { const [cx, cy] = rotatePoint([s.cx, s.cy], deg, pivot); return { ...s, cx, cy, rotate: round(((s.rotate ?? 0) + deg) % 360) }; }
    if (s.kind === 'text') { const [x, y] = rotatePoint([s.x, s.y], deg, pivot); return { ...s, x, y, rotate: round(((s.rotate ?? 0) + deg) % 360) }; }
    return { ...s, points: s.points.map((p) => rotatePoint(p, deg, pivot)) };
  });
  return { shapes: out, measure: { degrees: deg, about: pivot.map(round), areaBefore: round(shapes.reduce((a, s) => a + area(s), 0)), areaAfter: round(out.reduce((a, s) => a + area(s), 0)) } };
}

function darken(hex, k) {
  if (!/^#[0-9a-f]{6}$/i.test(hex ?? '')) return '#888888';
  const c = [1, 3, 5].map((i) => Math.round(parseInt(hex.slice(i, i + 2), 16) * (1 - k)));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

// Oblique projection: the back face is the front moved (depth cos angle, -depth sin angle).
export function extrude(shape, { depth = 40, angle = 45 } = {}) {
  if (['line', 'arrow', 'text', 'connector'].includes(shape.kind)) return { shapes: [shape], measure: { faces: 1, note: `a ${shape.kind} has no area to extrude` } };
  const front = shape.kind === 'ellipse' ? ellipsePoints(shape, 36) : shape.points;
  const off = [round(depth * Math.cos(rad(angle))), round(-depth * Math.sin(rad(angle)))];
  const back = front.map(([x, y]) => [round(x + off[0]), round(y + off[1])]);
  const base = { stroke: shape.stroke ?? '#222222', strokeWidth: shape.strokeWidth ?? 2 };
  const id = shape.id ?? 'shape';
  const sides = front.map((p, i) => {
    const q = front[(i + 1) % front.length];
    // faces turned away from the light (the top left) are darker
    const nx = q[1] - p[1], ny = -(q[0] - p[0]);
    const light = (nx * -0.6 + ny * -0.8) / (Math.hypot(nx, ny) || 1);
    return { kind: 'polygon', ...base, fill: darken(shape.fill, light > 0 ? 0.15 : 0.35), points: [p, q, [round(q[0] + off[0]), round(q[1] + off[1])], [round(p[0] + off[0]), round(p[1] + off[1])]], id: `${id}-side${i + 1}`, part: 'side', of: shape.id };
  });
  const out = [
    { kind: 'polygon', ...base, fill: darken(shape.fill, 0.45), points: back, id: `${id}-back`, part: 'back', of: shape.id },
    ...sides,
    { ...(shape.kind === 'ellipse' ? { kind: 'polygon', points: front, fill: shape.fill, text: shape.text } : shape), ...base, id: shape.id, part: 'front', depth, angle }
  ];
  return { shapes: out, measure: { faces: out.length, sides: sides.length, offset: off, depth, angle } };
}

// Zoom out about the canvas centre and tile copies until the canvas is covered.
export function vectorFill(shapes, { width = 800, height = 600, zoom = 0.5 } = {}) {
  const z = Math.max(0.05, Math.min(0.95, zoom));
  const [cx, cy] = [width / 2, height / 2];
  const scaled = shapes.filter((s) => s.kind !== 'connector').map((s) => scaleAbout(s, z, [cx, cy]));
  const tw = width * z, th = height * z;
  const nx = Math.ceil((width / 2 - tw / 2) / tw), ny = Math.ceil((height / 2 - th / 2) / th);
  const out = [];
  let copies = 0;
  for (let j = -ny; j <= ny; j++) {
    for (let i = -nx; i <= nx; i++) {
      copies++;
      out.push(...scaled.map((s, k) => ({ ...shift(s, i * tw, j * th), id: i === 0 && j === 0 ? s.id : `${s.id ?? 's'}-${i}-${j}-${k}`, copyOf: i === 0 && j === 0 ? undefined : s.id })));
    }
  }
  return { shapes: out, measure: { zoom: z, copies, tile: [round(tw), round(th)], grid: [2 * nx + 1, 2 * ny + 1] } };
}

function scaleAbout(s, k, [ax, ay]) {
  if (s.kind === 'ellipse') return { ...s, cx: round(ax + (s.cx - ax) * k), cy: round(ay + (s.cy - ay) * k), rx: round(s.rx * k), ry: round(s.ry * k) };
  if (s.kind === 'text') return { ...s, x: round(ax + (s.x - ax) * k), y: round(ay + (s.y - ay) * k), size: round(s.size * k) };
  return { ...s, points: s.points.map(([x, y]) => [round(ax + (x - ax) * k), round(ay + (y - ay) * k)]), strokeWidth: Math.max(1, round((s.strokeWidth ?? 2) * k)) };
}
function shift(s, dx, dy) {
  if (s.kind === 'ellipse') return { ...s, cx: round(s.cx + dx), cy: round(s.cy + dy) };
  if (s.kind === 'text') return { ...s, x: round(s.x + dx), y: round(s.y + dy) };
  return { ...s, points: s.points.map(([x, y]) => [round(x + dx), round(y + dy)]) };
}

// As Lucian Office plug-ins: each replaces the selected shapes in one undoable step.
export function filterPlugins(createPlugins, canvas) {
  const replace = (doc, selection, result, label) => {
    const selected = new Set(selection.blockIds);
    const first = doc.blocks.findIndex((b) => selected.has(b.id));
    const ops = [...doc.blocks.filter((b) => selected.has(b.id)).map((b) => ({ op: 'delete', id: b.id }))];
    result.shapes.forEach((s, i) => ops.push({ op: 'insert', at: first + i, block: { ...s, type: 'shape' } }));
    return { ops, label, say: `${label}: ${describeMeasure(result.measure)}` };
  };
  const shapesOf = (doc, selection) => doc.blocks.filter((b) => selection.blockIds.includes(b.id) && b.type === 'shape');
  return createPlugins()
    .register({ id: 'rotate', name: 'Rotate', apps: ['etcher'], run: ({ doc, selection, options }) => replace(doc, selection, rotate(shapesOf(doc, selection), Number(options.degrees ?? 90)), `rotated ${options.degrees ?? 90}°`) })
    .register({ id: '3d', name: '3D', apps: ['etcher'], run: ({ doc, selection, options }) => {
      const results = shapesOf(doc, selection).map((s) => extrude(s, options));
      return replace(doc, selection, { shapes: results.flatMap((r) => r.shapes), measure: { faces: results.reduce((a, r) => a + r.measure.faces, 0), depth: options.depth ?? 40, angle: options.angle ?? 45 } }, 'made 3D');
    } })
    .register({ id: 'vector-fill', name: 'Vector fill', apps: ['etcher'], run: ({ doc, selection, options }) => replace(doc, selection, vectorFill(shapesOf(doc, selection), { ...canvas(doc), zoom: Number(options.zoom ?? 0.5) }), 'vector filled') });
}

export function describeMeasure(m) {
  if (!m) return '';
  if (m.degrees !== undefined) return `turned ${m.degrees}° about (${m.about.join(', ')}); area kept at ${m.areaAfter}`;
  if (m.copies !== undefined) return `zoomed to ${Math.round(m.zoom * 100)}% and filled with ${m.copies} copies (${m.grid.join(' × ')})`;
  if (m.faces !== undefined) return `${m.faces} faces, ${m.depth} deep at ${m.angle}°`;
  return '';
}

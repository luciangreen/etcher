// Drawings from plain descriptions:
//   "a red circle above a blue square"
//   "three small green triangles in a row at the bottom"
//   "a large yellow star in the centre. A box labelled Start in the top left corner"
//   "a blue circle inside the square"
// Each shape remembers what it had to assume (its colour, size or place when you didn't
// say), so Etcher can ask about exactly those in its approve-or-change questions.
import { COLOURS, bbox, makeShape, moveShape } from './shapes.js';

export const CANVAS = { width: 800, height: 600 };
const SIZES = { tiny: 30, little: 50, small: 60, medium: 100, normal: 100, big: 160, large: 160, huge: 240, giant: 240 };
const NUMBERS = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, several: 3, some: 3 };
const SHAPE_WORDS = {
  circle: 'circle', circles: 'circle', dot: 'circle', dots: 'circle', ball: 'circle', balls: 'circle', sun: 'circle',
  oval: 'ellipse', ovals: 'ellipse', ellipse: 'ellipse', ellipses: 'ellipse',
  square: 'square', squares: 'square', box: 'rect', boxes: 'rect', rectangle: 'rect', rectangles: 'rect', block: 'rect', blocks: 'rect',
  triangle: 'triangle', triangles: 'triangle', diamond: 'diamond', diamonds: 'diamond', star: 'star', stars: 'star',
  pentagon: 'pentagon', pentagons: 'pentagon', hexagon: 'hexagon', hexagons: 'hexagon', heart: 'heart', hearts: 'heart',
  line: 'line', lines: 'line', arrow: 'arrow', arrows: 'arrow'
};
const PLACES = {
  centre: [0.5, 0.5], center: [0.5, 0.5], middle: [0.5, 0.5], top: [0.5, 0.15], bottom: [0.5, 0.85], left: [0.15, 0.5], right: [0.85, 0.5],
  'top left': [0.15, 0.15], 'top right': [0.85, 0.15], 'bottom left': [0.15, 0.85], 'bottom right': [0.85, 0.85]
};
const RELATIONS = [['to the left of', 'left'], ['to the right of', 'right'], ['left of', 'left'], ['right of', 'right'], ['above', 'above'], ['over', 'above'], ['on top of', 'above'], ['below', 'below'], ['under', 'below'], ['beneath', 'below'], ['beside', 'right'], ['next to', 'right'], ['inside', 'inside'], ['in', 'inside'], ['within', 'inside']];
const GAP = 30;
const DEFAULT_FILLS = ['#3a7bd5', '#e2a03f', '#2ecc71', '#d64541', '#8e44ad', '#16a085'];

export function drawDescription(text, { canvas = CANVAS, existing = [] } = {}) {
  const shapes = existing.map((s) => ({ ...s }));
  const notes = [];
  let n = shapes.length;
  const newId = () => `s${Date.now().toString(36)}${(n++).toString(36)}`;
  const clauses = String(text ?? '').split(/(?<=[.;!?])\s+|\n+|\s*;\s*/).map((c) => c.trim().replace(/[.;!?]+$/, '')).filter(Boolean);
  for (const clause of clauses) {
    // "a red circle above a blue square" holds two shapes and a relation between them
    const rel = findRelation(clause);
    if (rel) {
      const left = parseNoun(clause.slice(0, rel.at));
      const right = parseNoun(clause.slice(rel.at + rel.text.length));
      if (left && right) {
        let target = right.definite ? findShape(shapes, right) : null;
        let fresh = false;
        if (!target) {
          const made = place(right, shapes, canvas, newId, notes);
          target = made[0];
          fresh = !right.place;
        }
        const made = left.definite ? [findShape(shapes, left)].filter(Boolean) : create(left, newId);
        if (!made.length) { notes.push(`"${clause}": I couldn't find the ${left.shape}.`); continue; }
        relate(made, target, rel.kind, shapes, canvas);
        for (const s of made) { s.assumed = s.assumed.filter((a) => a !== 'place'); if (!shapes.includes(s)) shapes.push(s); }
        // two new shapes with no place given: centre the pair on the canvas
        if (fresh && shapes.length === made.length + 1) {
          const pair = [target, ...made];
          const pb = bbox(pair);
          const dx = canvas.width / 2 - (pb.x + pb.w / 2), dy = canvas.height / 2 - (pb.y + pb.h / 2);
          for (const s of pair) Object.assign(s, moveShape(s, dx, dy));
        }
        continue;
      }
    }
    const noun = parseNoun(clause);
    if (!noun) { notes.push(`"${clause}": I couldn't tell what to draw. Name a shape, such as a circle, box, triangle or star.`); continue; }
    if (noun.definite) {
      // "the circle is red" / "the star in the top right"
      const said = /\b(?:is|are|should be|becomes?)\s+(?:now\s+)?(?:(light|pale|dark|deep)\s+)?([a-z]+)\s*$/i.exec(clause);
      const s = findShape(shapes, { ...noun, colour: said && COLOURS[said[2].toLowerCase()] ? null : noun.colour });
      if (said && COLOURS[said[2].toLowerCase()]) noun.colour = said[1] ? shade(COLOURS[said[2].toLowerCase()], /light|pale/i.test(said[1]) ? 0.45 : -0.35) : COLOURS[said[2].toLowerCase()];
      if (!s) { notes.push(`"${clause}": there is no ${noun.shape} yet.`); continue; }
      if (noun.colour) { s.fill = noun.colour; s.assumed = s.assumed.filter((a) => a !== 'colour'); }
      if (noun.place) Object.assign(s, moveTo(s, noun.place, canvas));
      continue;
    }
    place(noun, shapes, canvas, newId, notes);
  }
  return { shapes, notes };
}

function findRelation(clause) {
  const lower = ` ${clause.toLowerCase()} `;
  let best = null;
  for (const [text, kind] of RELATIONS) {
    const i = lower.indexOf(` ${text} `);
    if (i < 0) continue;
    // "in the centre", "in a row", "in the top left corner" are places, not relations
    if (text === 'in' && /^ in (the )?(centre|center|middle|top|bottom|left|right|a row|a column|row|column)\b/.test(lower.slice(i))) continue;
    if (!best || i < best.at || (i === best.at && text.length > best.text.length)) best = { at: i, text, kind };
  }
  return best ? { ...best, at: best.at } : null;
}

// One noun phrase: [count] [size] [colour] shape [labelled X] [place].
export function parseNoun(phrase) {
  const p = String(phrase).trim().replace(/^and\s+/i, '');
  const words = p.toLowerCase().replace(/["“”]/g, '"').split(/\s+/);
  const shapeAt = words.findIndex((w) => SHAPE_WORDS[w.replace(/[^a-z]/g, '')]);
  if (shapeAt < 0) return null;
  const before = words.slice(0, shapeAt);
  const noun = { shape: SHAPE_WORDS[words[shapeAt].replace(/[^a-z]/g, '')], count: 1, definite: false, colour: null, size: null, label: '', place: null, arrangement: 'row', assumed: [] };
  for (const w of before) {
    if (w === 'the' || w === 'that' || w === 'this') noun.definite = true;
    else if (NUMBERS[w]) noun.count = NUMBERS[w];
    else if (/^\d+$/.test(w)) noun.count = Math.min(30, Number(w));
    else if (SIZES[w]) noun.size = SIZES[w];
    else if (COLOURS[w]) noun.colour = COLOURS[w];
    else if (/^(light|pale)$/.test(w)) noun.light = true;
    else if (/^(dark|deep)$/.test(w)) noun.dark = true;
  }
  if (noun.colour && (noun.light || noun.dark)) noun.colour = shade(noun.colour, noun.light ? 0.45 : -0.35);
  const after = p.split(/\s+/).slice(shapeAt + 1).join(' ');
  const label = /(?:labelled|labeled|saying|called|named|with the (?:text|words?)|that says)\s+"?([^"]+?)"?(?=\s+(?:in|at|on)\s+the\b|$)/i.exec(after);
  if (label) noun.label = label[1].trim();
  const lower = after.toLowerCase();
  if (/\bin a column\b|\bstacked\b|\bvertically\b/.test(lower)) noun.arrangement = 'column';
  if (/\bin a circle\b|\bin a ring\b/.test(lower)) noun.arrangement = 'ring';
  const corner = /\b(top|bottom) (left|right)\b/.exec(lower);
  const side = /\b(?:in|at|on|to) the (centre|center|middle|top|bottom|left|right)\b/.exec(lower);
  if (corner) noun.place = `${corner[1]} ${corner[2]}`;
  else if (side) noun.place = side[1];
  if (!noun.colour) noun.assumed.push('colour');
  if (!noun.size) noun.assumed.push('size');
  if (!noun.place) noun.assumed.push('place');
  return noun;
}

function shade(hex, k) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const out = c.map((v) => Math.round(k > 0 ? v + (255 - v) * k : v * (1 + k)));
  return `#${out.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

function create(noun, newId, fillIndex = 0) {
  const size = noun.size ?? SIZES.medium;
  const w = noun.shape === 'rect' ? size * 1.5 : noun.shape === 'ellipse' ? size * 1.4 : noun.shape === 'line' || noun.shape === 'arrow' ? size * 1.6 : size;
  const h = noun.shape === 'line' || noun.shape === 'arrow' ? 0 : size;
  return Array.from({ length: noun.count }, (_, i) => {
    const fill = noun.colour ?? DEFAULT_FILLS[(fillIndex + i) % DEFAULT_FILLS.length];
    const s = makeShape(noun.shape, { w, h, fill, stroke: noun.shape === 'line' || noun.shape === 'arrow' ? (noun.colour ?? '#222222') : '#222222', text: noun.label, id: newId() });
    s.assumed = [...noun.assumed];
    s.said = { shape: noun.shape, colour: noun.colour, size: noun.size, label: noun.label };
    return s;
  });
}

// New shapes go where you said; otherwise in the next free place, left to right.
function place(noun, shapes, canvas, newId, notes) {
  const made = create(noun, newId, shapes.length);
  const group = arrange(made, noun.arrangement);
  const gb = bbox(group);
  let target;
  if (noun.place) {
    const [fx, fy] = PLACES[noun.place];
    target = [fx * canvas.width - gb.w / 2, fy * canvas.height - gb.h / 2];
  } else target = freeSpot(gb, shapes, canvas);
  const moved = group.map((s) => moveShape(s, target[0] - gb.x, target[1] - gb.y));
  moved.forEach((s, i) => Object.assign(made[i], s));
  if (bbox(made).x + bbox(made).w > canvas.width + 1 || bbox(made).y + bbox(made).h > canvas.height + 1) notes.push(`The ${noun.count > 1 ? `${noun.count} ${noun.shape}s` : noun.shape} run past the edge; make ${noun.count > 1 ? 'them' : 'it'} smaller?`);
  shapes.push(...made);
  return made;
}

function arrange(shapes, how) {
  const out = [];
  let x = 0, y = 0;
  const n = shapes.length;
  shapes.forEach((s, i) => {
    const b = bbox(s);
    if (how === 'ring' && n > 1) {
      const r = Math.max(b.w, b.h) * n / (2 * Math.PI) + b.w;
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
      out.push(moveShape(s, r + r * Math.cos(a) - b.x, r + r * Math.sin(a) - b.y));
      return;
    }
    out.push(moveShape(s, x - b.x, y - b.y));
    if (how === 'column') y += b.h + GAP; else x += b.w + GAP;
  });
  return out;
}

function freeSpot(gb, shapes, canvas) {
  const step = 20;
  for (let y = 60; y + gb.h <= canvas.height - 20; y += step) {
    for (let x = 40; x + gb.w <= canvas.width - 20; x += step) {
      const box = { x: x - 10, y: y - 10, w: gb.w + 20, h: gb.h + 20 };
      if (!shapes.some((s) => s.kind !== 'connector' && overlaps(box, bbox(s)))) return [x, y];
    }
  }
  return [40, 60];
}
export const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

function relate(made, target, kind, shapes, canvas) {
  const tb = bbox(target);
  const group = arrange(made.map((s) => (kind === 'inside' ? fitInside(s, tb) : s)), 'row');
  const gb = bbox(group);
  const tcx = tb.x + tb.w / 2, tcy = tb.y + tb.h / 2;
  const at = {
    above: [tcx - gb.w / 2, tb.y - GAP - gb.h],
    below: [tcx - gb.w / 2, tb.y + tb.h + GAP],
    left: [tb.x - GAP - gb.w, tcy - gb.h / 2],
    right: [tb.x + tb.w + GAP, tcy - gb.h / 2],
    inside: [tcx - gb.w / 2, tcy - gb.h / 2]
  }[kind];
  // keep it on the canvas by moving the pair together if needed
  let dx = 0, dy = 0;
  if (at[1] < 10) dy = 10 - at[1];
  if (at[0] < 10) dx = 10 - at[0];
  if (at[1] + gb.h > canvas.height - 10) dy = canvas.height - 10 - at[1] - gb.h;
  if (at[0] + gb.w > canvas.width - 10) dx = canvas.width - 10 - at[0] - gb.w;
  group.forEach((s, i) => Object.assign(made[i], moveShape(s, at[0] - gb.x + dx, at[1] - gb.y + dy)));
  if (dx || dy) Object.assign(target, moveShape(target, dx, dy));
}

function fitInside(s, tb) {
  const b = bbox(s);
  const k = Math.min((tb.w * 0.6) / b.w, (tb.h * 0.6) / b.h, 1);
  if (k >= 1) return s;
  const scaled = { ...s };
  if (s.kind === 'ellipse') Object.assign(scaled, { rx: s.rx * k, ry: s.ry * k });
  else if (s.points) scaled.points = s.points.map(([x, y]) => [b.x + (x - b.x) * k, b.y + (y - b.y) * k]);
  return scaled;
}

function moveTo(s, placeName, canvas) {
  const [fx, fy] = PLACES[placeName];
  const b = bbox(s);
  return moveShape(s, fx * canvas.width - b.w / 2 - b.x, fy * canvas.height - b.h / 2 - b.y);
}

// "the square", "the blue circle": the latest shape that matches.
export function findShape(shapes, noun) {
  const kinds = { circle: ['ellipse'], ellipse: ['ellipse'], rect: ['rect', 'square'], square: ['square', 'rect'] }[noun.shape] ?? [noun.shape];
  const matches = shapes.filter((s) => kinds.includes(s.kind) && (!noun.colour || s.fill === noun.colour) && (!noun.label || s.text?.toLowerCase() === noun.label.toLowerCase()));
  return matches[matches.length - 1] ?? null;
}

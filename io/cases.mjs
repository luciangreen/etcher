// The functions whose inputs and outputs are recorded in io/ios.txt (see io/engine.mjs).
import { drawDescription, parseNoun } from '../lib/describe.js';
import { parseFlow } from '../lib/flowchart.js';
import { rotatePoint, extrude } from '../lib/filters.js';
import { makeShape, bbox, area, moveShape, scaleShape } from '../lib/shapes.js';

export const title = 'Etcher';

const COL = ['red', 'blue', 'green', 'yellow', 'purple', 'orange', 'black', 'big red', 'small blue'];
const KIND = ['circle', 'square', 'rectangle', 'triangle', 'star', 'ellipse', 'box', 'arrow'];
const REL = ['to the left of', 'above', 'below', 'inside', 'next to', 'to the right of'];
// shape ids carry the time, so they are left out
const shapesOut = (shapes) => shapes.map(({ id, ...s }) => s);

export const cases = [
  { name: 'drawDescription', run: (text) => { const r = drawDescription(text); return { shapes: shapesOut(r.shapes ?? []), notes: r.notes }; }, make: (rnd) => [`A ${rnd.pick(COL)} ${rnd.pick(KIND)}${rnd.chance(0.6) ? ` ${rnd.pick(REL)} a ${rnd.pick(COL)} ${rnd.pick(KIND)}` : ''}.`] },
  { name: 'parseNoun', run: parseNoun, make: (rnd) => [`${rnd.pick(['a', 'the', 'two', 'three', ''])} ${rnd.pick(COL)} ${rnd.pick(KIND)}${rnd.chance(0.3) ? ' labelled "Go"' : ''}`.trim()] },
  { name: 'parseFlow', run: (text) => { const f = parseFlow(text); return { nodes: (f.nodes ?? []).map(({ id, ...n }) => n), edges: (f.edges ?? []).length }; }, make: (rnd) => [['Start', rnd.pick(['Check stock', 'Read the email', 'Boil water']), `${rnd.pick(['In stock', 'Is it urgent', 'Is it hot'])}? yes: ${rnd.pick(['Ship it', 'Reply now', 'Pour'])} / no: ${rnd.pick(['Order more', 'Wait', 'Heat more'])}`, rnd.pick(['Send the invoice', 'File it', 'Drink']), 'End'].slice(0, rnd.int(2, 5)).join('\n')] },
  { name: 'rotatePoint', run: rotatePoint, make: (rnd) => [[rnd.int(-100, 100), rnd.int(-100, 100)], rnd.pick([0, 30, 45, 90, 180, 270, -60]), [rnd.int(-20, 20), rnd.int(-20, 20)]] },
  { name: 'shape measures', run: (kind, box, dx, k) => { const { id, ...s } = scaleShape(moveShape(makeShape(kind, { ...box, id: 'x' }), dx, -dx), k); return { box: bbox(s), area: area(s), kind: s.kind }; }, make: (rnd) => [rnd.pick(['rect', 'ellipse', 'triangle', 'star', 'line', 'text']), { x: rnd.int(0, 400), y: rnd.int(0, 300), w: rnd.int(10, 200), h: rnd.int(10, 200) }, rnd.int(-50, 50), rnd.pick([0.5, 1, 1.5, 2])] },
  { name: 'extrude', run: (kind, box, depth) => extrude(makeShape(kind, { ...box, id: 'x' }), { depth }).map?.(({ id, ...s }) => s) ?? null, make: (rnd) => [rnd.pick(['rect', 'ellipse', 'triangle']), { x: rnd.int(0, 300), y: rnd.int(0, 300), w: rnd.int(20, 120), h: rnd.int(20, 120) }, rnd.pick([10, 20, 40])] }
];

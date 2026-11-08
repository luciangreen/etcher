import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COLOURS, area, bbox, centre, makeShape, scaleShape, setBox, toSVG, connectorPoints } from '../lib/shapes.js';
import { CANVAS, drawDescription, overlaps, parseNoun } from '../lib/describe.js';
import { flowchart, layout, parseFlow, question } from '../lib/flowchart.js';
import { extrude, rotate, rotatePoint, vectorFill } from '../lib/filters.js';
import { assumptions, isApproval, nextQuestion } from '../lib/questions.js';
import { answer, etcherCommands } from '../lib/commands.js';
import { canvasOf, newEtchDoc, shapesOf } from '../lib/etchdoc.js';
import { apply } from '../lib/core.js';

const near = (a, b, tol = 0.05) => Math.abs(a - b) <= tol;
const within = (s, c = CANVAS) => { const b = bbox(s); return b.x >= 0 && b.y >= 0 && b.x + b.w <= c.width && b.y + b.h <= c.height; };

// ------------------------------------------------------------------ shapes from sample descriptions
test('a red circle above a blue square', () => {
  const { shapes, notes } = drawDescription('a red circle above a blue square');
  assert.deepEqual(notes, []);
  const [square, circle] = shapes;
  assert.equal(circle.kind, 'ellipse');
  assert.equal(square.kind, 'square');
  assert.equal(circle.fill, COLOURS.red);
  assert.equal(square.fill, COLOURS.blue);
  assert.ok(bbox(circle).y + bbox(circle).h <= bbox(square).y, 'the circle is wholly above the square');
  assert.ok(near(centre(circle)[0], centre(square)[0]), 'and lined up over it');
  assert.ok(near((bbox(shapes).x + bbox(shapes).w / 2), CANVAS.width / 2, 1), 'the pair is centred on the canvas');
  assert.ok(shapes.every((s) => within(s)));
});

test('three small green triangles in a row at the bottom', () => {
  const { shapes } = drawDescription('three small green triangles in a row at the bottom');
  assert.equal(shapes.length, 3);
  assert.ok(shapes.every((s) => s.kind === 'triangle' && s.fill === COLOURS.green && bbox(s).w === 60));
  const ys = shapes.map((s) => bbox(s).y);
  assert.ok(ys.every((y) => y === ys[0]), 'in a row');
  assert.ok(ys[0] > CANVAS.height * 0.6, 'at the bottom');
  for (let i = 1; i < 3; i++) assert.ok(bbox(shapes[i]).x > bbox(shapes[i - 1]).x + bbox(shapes[i - 1]).w, 'side by side, not overlapping');
});

test('places, labels, sizes, columns and rings', () => {
  const { shapes } = drawDescription('a large yellow star in the centre. A box labelled Start in the top left corner. four tiny dots in a column on the right. six hearts in a ring');
  const [star, box, ...rest] = shapes;
  assert.ok(near(centre(star)[0], 400, 2) && near(centre(star)[1], 300, 2), 'the star is in the centre');
  assert.ok(bbox(star).w > 140, 'large');
  assert.equal(box.text, 'Start');
  assert.ok(centre(box)[0] < 200 && centre(box)[1] < 150, 'top left');
  const dots = rest.slice(0, 4);
  assert.ok(dots.every((d) => bbox(d).w === 30 && near(centre(d)[0], centre(dots[0])[0])), 'tiny dots, one above another');
  const hearts = rest.slice(4);
  assert.equal(hearts.length, 6);
  const c = centre(hearts.map((h) => ({ ...h })).reduce((acc, h) => acc, hearts[0]));
  assert.ok(c);
});

test('inside, beside and below an existing shape; recolouring by "the"', () => {
  const r = drawDescription('a big blue square. a small red circle inside the square. a triangle below the square. the circle is yellow');
  const [square, circle, triangle] = r.shapes;
  const sq = bbox(square), ci = bbox(circle);
  assert.ok(ci.x >= sq.x && ci.y >= sq.y && ci.x + ci.w <= sq.x + sq.w && ci.y + ci.h <= sq.y + sq.h, 'inside');
  assert.equal(circle.fill, COLOURS.yellow, '"the circle is yellow" changed it');
  assert.ok(bbox(triangle).y >= sq.y + sq.h, 'below');
});

test('what was assumed is remembered, and what cannot be drawn is said', () => {
  const r = drawDescription('a circle. a cloud');
  assert.deepEqual(r.shapes[0].assumed, ['colour', 'size', 'place']);
  assert.match(r.notes[0], /couldn't tell what to draw/);
  assert.deepEqual(parseNoun('two light blue boxes labelled "Next step"').count, 2);
  assert.equal(parseNoun('two light blue boxes labelled "Next step"').label, 'Next step');
});

test('new shapes do not overlap the drawing so far', () => {
  const r = drawDescription('a circle. a square. a star. a triangle. a diamond. a hexagon');
  const boxes = r.shapes.map(bbox);
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) assert.ok(!overlaps(boxes[i], boxes[j]), `${i} and ${j} overlap`);
});

// ------------------------------------------------------------------ flowcharts from text
test('flowcharts from arrows: kinds, labelled branches, a loop back, and downward layout', () => {
  const f = parseFlow('Start -> Check stock -> In stock? -> yes: Ship the order -> End\nIn stock? -> no: Order more -> Check stock');
  assert.deepEqual(f.nodes.map((n) => `${n.kind}:${n.label}`), ['terminal:Start', 'process:Check stock', 'decision:In stock?', 'process:Ship the order', 'terminal:End', 'process:Order more']);
  assert.ok(f.edges.some((e) => e.from === 'in stock' && e.to === 'ship the order' && e.label === 'yes'));
  assert.ok(f.edges.some((e) => e.from === 'in stock' && e.to === 'order more' && e.label === 'no'));
  const l = layout(f);
  assert.equal(l.backEdges, 1);
  const byId = new Map(l.shapes.map((s) => [s.id, s]));
  for (const c of l.shapes.filter((s) => s.kind === 'connector')) {
    const [a, b] = [byId.get(c.from), byId.get(c.to)];
    if (c.dashed) assert.ok(centre(b)[1] < centre(a)[1], 'the loop goes back up, dashed');
    else assert.ok(centre(b)[1] > centre(a)[1], `${a.text} -> ${b.text} runs downwards`);
    assert.ok(connectorPoints(c, byId));
  }
  const kinds = Object.fromEntries(l.shapes.filter((s) => s.text).map((s) => [s.text, s.kind]));
  assert.equal(kinds.Start, 'ellipse');
  assert.equal(kinds['In stock?'], 'diamond');
  assert.equal(kinds['Ship the order'], 'rect');
  const boxes = l.shapes.filter((s) => s.kind !== 'connector').map(bbox);
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) assert.ok(!overlaps(boxes[i], boxes[j]), 'no two steps overlap');
});

test('flowcharts from lines and from sentences', () => {
  const lines = parseFlow('Start\nCheck the stock\nIs it in stock? yes: Ship the order / no: Order more\nSend the invoice\nEnd');
  assert.ok(lines.edges.some((e) => e.from === 'order more' && e.to === 'send the invoice'), 'both branches rejoin');
  assert.ok(lines.edges.some((e) => e.label === 'no'));
  const sentences = parseFlow('First check the stock. If it is in stock, ship the order; otherwise order more. Then send the invoice. Finally finish.');
  assert.deepEqual(sentences.nodes.map((n) => n.label), ['Check the stock', 'Is it in stock?', 'Ship the order', 'Order more', 'Send the invoice', 'Finish']);
  assert.equal(sentences.nodes.at(-1).kind, 'terminal');
  assert.equal(question('the order has arrived'), 'Has the order arrived?');
  assert.equal(flowchart('A -> B -> C').layers, 3);
});

// ------------------------------------------------------------------ filters, checked by measuring
test('rotation keeps area and distances, and four quarter turns come back', () => {
  const sq = makeShape('square', { x: 100, y: 100, w: 100, h: 100, id: 'a' });
  const r = rotate([sq], 45);
  assert.ok(near(bbox(r.shapes[0]).w, 100 * Math.SQRT2, 0.05), 'a square turned 45° is 100√2 wide');
  assert.ok(near(area(r.shapes[0]), 10000, 1), 'area kept');
  const [p, q] = r.shapes[0].points;
  assert.ok(near(Math.hypot(q[0] - p[0], q[1] - p[1]), 100, 0.05), 'side length kept');
  let s = [sq];
  for (let i = 0; i < 4; i++) s = rotate(s, 90).shapes;
  assert.deepEqual(s[0].points, sq.points);
  assert.deepEqual(rotatePoint([10, 0], 90, [0, 0]), [0, 10]);
  const e = rotate([makeShape('ellipse', { x: 0, y: 0, w: 200, h: 100 })], 30).shapes[0];
  assert.equal(e.rotate, 30);
  assert.ok(near(area(e), Math.PI * 100 * 50, 0.01));
});

test('3D: the back face is moved by the depth at the angle, with a side for every edge', () => {
  const box = makeShape('rect', { x: 100, y: 100, w: 150, h: 100, fill: '#3a7bd5', id: 'b' });
  const r = extrude(box, { depth: 40, angle: 45 });
  assert.equal(r.measure.sides, 4);
  assert.equal(r.shapes.length, 6);
  const back = r.shapes.find((s) => s.part === 'back');
  back.points.forEach(([x, y], i) => {
    const [fx, fy] = box.points[i];
    assert.ok(near(Math.hypot(x - fx, y - fy), 40, 0.02), 'every back corner is 40 away');
    assert.ok(near(Math.atan2(fy - y, x - fx) * 180 / Math.PI, 45, 0.1), 'at 45°');
  });
  assert.equal(r.shapes.at(-1).part, 'front');
  assert.deepEqual(r.shapes.at(-1).points, box.points, 'the front stays where it was');
  assert.ok(r.shapes.filter((s) => s.part === 'side').every((s) => s.points.length === 4));
  assert.equal(extrude(makeShape('triangle', { w: 90, h: 80 })).measure.sides, 3);
  assert.equal(extrude(makeShape('line', {})).shapes.length, 1);
});

test('vector fill: scaled about the centre, and copies tile the whole canvas', () => {
  const sq = makeShape('square', { x: 300, y: 200, w: 200, h: 200, id: 'v' });
  const r = vectorFill([sq], { width: 800, height: 600, zoom: 0.5 });
  assert.deepEqual(r.measure.grid, [3, 3]);
  assert.equal(r.shapes.length, 9);
  const middle = r.shapes.find((s) => s.id === 'v');
  assert.deepEqual(bbox(middle), { x: 350, y: 250, w: 100, h: 100 });
  assert.ok(r.shapes.every((s) => near(area(s), area(sq) * 0.25, 0.5)), 'each copy is a quarter of the area');
  const tiles = r.shapes.map(bbox);
  assert.ok(tiles.every((t) => t.x + t.w > 0 && t.x < 800 && t.y + t.h > 0 && t.y < 600), 'every copy is on the canvas');
  const gaps = [...new Set(tiles.map((t) => t.x))].sort((a, b) => a - b);
  assert.deepEqual(gaps.slice(1).map((x, i) => x - gaps[i]), [400, 400], 'copies are one tile apart');
  assert.deepEqual(vectorFill([sq], { zoom: 0.25 }).measure.grid, [5, 5]);
});

test('shape geometry: scaling, boxes and SVG', () => {
  const s = makeShape('star', { x: 0, y: 0, w: 100, h: 100 });
  assert.ok(near(area(scaleShape(s, 2)), area(s) * 4, 1));
  assert.deepEqual(bbox(setBox(makeShape('rect', { w: 10, h: 10 }), { x: 5, y: 5, w: 50, h: 20 })), { x: 5, y: 5, w: 50, h: 20 });
  const svg = toSVG([makeShape('circle', { id: 'c', text: 'Hi' }), makeShape('rect', { x: 200, id: 'r' }), { kind: 'connector', id: 'k', from: 'c', to: 'r', label: 'yes' }], { caption: 'Cap' });
  assert.match(svg, /<ellipse cx="50" cy="50"/);
  assert.match(svg, />Hi<\/text>/);
  assert.match(svg, /marker-end="url\(#arrowhead\)"/);
  assert.match(svg, />yes<\/text>/);
  assert.match(svg, />Cap<\/text>/);
});

// ------------------------------------------------------------------ approve or change
test('approve-or-change: a caption first, then approval naming what was assumed; changes reopen it', async () => {
  const reg = etcherCommands();
  let d = newEtchDoc();
  assert.equal(nextQuestion(d), null, 'nothing to ask about an empty drawing');
  d = (await reg.perform('draw a circle above a red square', d)).doc;
  let q = nextQuestion(d);
  assert.equal(q.key, 'caption');
  d = (await answer(reg, 'caption', 'Shapes', d, { by: 'user' })).doc;
  assert.equal(canvasOf(d).caption, 'Shapes');
  q = nextQuestion(d);
  assert.equal(q.key, 'approve');
  assert.match(q.ask, /the circle's colour/);
  assert.ok(assumptions(d).some((a) => /square's size/.test(a)));
  d = (await answer(reg, 'approve', 'make the circle green', d, { by: 'user' })).doc;
  assert.equal(shapesOf(d).find((s) => s.kind === 'ellipse').fill, COLOURS.green);
  assert.ok(!assumptions(d).some((a) => /circle's colour/.test(a)), 'what you set is no longer an assumption');
  d = (await answer(reg, 'approve', 'looks good', d, { by: 'user' })).doc;
  assert.equal(canvasOf(d).approved, true);
  assert.equal(nextQuestion(d), null);
  d = (await reg.perform('make the square bigger', d)).doc;
  assert.equal(canvasOf(d).approved, false, 'a change after approval needs approving again');
  assert.ok(isApproval('Yes') && !isApproval('make it red'));
});

test("Etcher's commands, done as the character and undone", async () => {
  const reg = etcherCommands();
  let d = newEtchDoc();
  const run = async (t) => { const r = await reg.perform(t, d); d = r.doc; return r.say; };
  await run('draw a blue box in the centre');
  const box = () => shapesOf(d).find((s) => s.kind === 'rect');
  const w0 = bbox(box()).w;
  await run('make the box bigger');
  assert.ok(near(bbox(box()).w, w0 * 1.25));
  await run('make it twice as big');
  assert.ok(near(bbox(box()).w, w0 * 2.5));
  await run('undo that');
  assert.ok(near(bbox(box()).w, w0 * 1.25));
  const x0 = bbox(box()).x;
  await run('move the box right by 30');
  assert.equal(bbox(box()).x, x0 + 30);
  assert.match(await run('rotate the box by 90 degrees'), /turned 90°/);
  assert.match(await run('make the box 3d'), /6 faces/);
  assert.equal(shapesOf(d).length, 6);
  await run('undo that');
  assert.equal(shapesOf(d).length, 1);
  assert.match(await run('vector fill at 50%'), /9 copies/);
  await run('undo that');
  assert.match(await run('flowchart Start -> Work -> End'), /3 steps in 3 rows/);
  assert.equal(shapesOf(d).filter((s) => s.kind === 'connector').length, 2);
  await run('delete the "Work" box');
  assert.equal(shapesOf(d).filter((s) => s.kind === 'connector').length, 0, 'its arrows go with it');
  assert.match(await run('change the hexagon to red'), /can't see the hexagon/);
});

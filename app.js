// Etcher (Lucian Office, Phase 5): a vector editor that draws flowcharts and pictures from
// text, asks for a caption and your approval, and has measured filters (rotate, 3D, vector fill).
import { api } from '/shared/api.js';
import { apply, characterHandler, convert, createPlugins, deserialise, redo, serialise, toProlog, undo } from './lib/core.js';
import { bbox, makeShape, moveShape, setBox, toSVG } from './lib/shapes.js';
import { drawDescription } from './lib/describe.js';
import { flowchart } from './lib/flowchart.js';
import { describeMeasure, filterPlugins } from './lib/filters.js';
import { canvasOf, canvasOps, insertShapesOps, newEtchDoc, shapesOf, unapprove, updateOps } from './lib/etchdoc.js';
import { assumptions, nextQuestion } from './lib/questions.js';
import { answer, etcherCommands } from './lib/commands.js';

const $ = (id) => document.getElementById(id);
const el = (tag, props = {}, ...kids) => {
  const n = Object.assign(document.createElement(tag), props);
  for (const k of kids.flat()) if (k !== null && k !== undefined && k !== false) n.append(k.nodeType ? k : document.createTextNode(String(k)));
  return n;
};

let doc = newEtchDoc();
let tool = 'select';
let selected = [];
let side = 'describe';
let lastMeasure = '';
let settings = { savePath: '' };
const SIDES = [['describe', 'Describe'], ['flowchart', 'Flowchart'], ['filters', 'Filters'], ['changes', 'Changes']];

const persist = () => { api.state.set('etcher', settings).catch(() => {}); api.state.set('etcher-doc', doc).catch(() => {}); };
function change(ops, by = 'user', label = '') {
  if (!ops.length) return;
  doc = apply(doc, ops, { by, label });
  selected = selected.filter((id) => doc.blocks.some((b) => b.id === id));
  persist();
  render();
}

// ------------------------------------------------------------------ drawing the canvas
function render() {
  const c = canvasOf(doc);
  const shapes = shapesOf(doc);
  let svg = toSVG(shapes, { width: c.width, height: c.height, background: c.background });
  // the selection: a dashed box with corner handles
  const sel = shapes.filter((s) => selected.includes(s.id) && s.kind !== 'connector');
  if (sel.length) {
    const b = bbox(sel);
    const hs = 10;
    const handles = [[b.x, b.y, 'nw'], [b.x + b.w, b.y, 'ne'], [b.x, b.y + b.h, 'sw'], [b.x + b.w, b.y + b.h, 'se']]
      .map(([x, y, h]) => `<rect class="handle" data-handle="${h}" x="${x - hs / 2}" y="${y - hs / 2}" width="${hs}" height="${hs}" fill="#fff" stroke="#3a7bd5" stroke-width="2" style="cursor:${h === 'nw' || h === 'se' ? 'nwse' : 'nesw'}-resize"/>`).join('');
    svg = svg.replace('</svg>', `<rect x="${b.x - 4}" y="${b.y - 4}" width="${b.w + 8}" height="${b.h + 8}" fill="none" stroke="#3a7bd5" stroke-dasharray="5 4" pointer-events="none"/>${sel.length === 1 && sel[0].kind !== 'text' ? handles : ''}</svg>`);
  }
  $('canvas').innerHTML = svg;
  $('canvas').classList.toggle('drawing', tool !== 'select');
  $('caption').textContent = c.caption && c.caption !== '—' ? c.caption : '';
  $('title').value = doc.title;
  renderQuestion();
  if (side === 'changes') renderSide();
}

function renderQuestion() {
  const box = $('question');
  box.replaceChildren();
  box.className = 'question';
  const q = nextQuestion(doc);
  if (!q) {
    if (canvasOf(doc).approved && shapesOf(doc).length) { box.classList.add('ok'); box.append(el('p', {}, '✓ Approved.')); }
    return;
  }
  const input = el('input', { type: 'text', placeholder: q.key === 'caption' ? 'A caption, or "no caption"' : '"approve", or a change' });
  box.append(el('p', {}, q.ask), el('form', { className: 'row', onsubmit: async (e) => {
    e.preventDefault();
    const r = await answer(commands, q.key, input.value, doc, { by: 'user', ctx });
    if (r.matched) { doc = r.doc; persist(); render(); }
    $('reply').textContent = r.say ?? `I didn't understand that. ${commands.help()}`;
  } }, input, el('button', { textContent: 'Answer' })));
  if (q.key === 'approve') box.append(el('div', { className: 'row' }, el('button', { className: 'primary', textContent: 'Approve', onclick: async () => { const r = await commands.perform('approve', doc, { by: 'user' }); doc = r.doc; persist(); render(); } })));
}

function toSvgPoint(e) {
  const svg = $('canvas').querySelector('svg');
  const p = svg.createSVGPoint();
  p.x = e.clientX; p.y = e.clientY;
  const q = p.matrixTransform(svg.getScreenCTM().inverse());
  return [Math.round(q.x), Math.round(q.y)];
}

// ------------------------------------------------------------------ pointer: select, move, resize, draw
let drag = null;
function onDown(e) {
  if (!$('canvas').querySelector('svg')) return;
  const [x, y] = toSvgPoint(e);
  const handle = e.target.closest?.('[data-handle]')?.dataset.handle;
  const id = e.target.closest?.('[data-id]')?.dataset.id;
  $('canvas').setPointerCapture?.(e.pointerId);
  if (tool === 'select') {
    if (handle && selected.length === 1) { drag = { mode: 'resize', handle, start: [x, y], box: bbox(shapesOf(doc).find((s) => s.id === selected[0])) }; return; }
    if (id) {
      if (e.shiftKey) selected = selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id];
      else if (!selected.includes(id)) selected = [id];
      drag = { mode: 'move', start: [x, y], moved: false };
    } else { selected = []; drag = null; }
    render();
    return;
  }
  if (tool === 'connect') {
    if (!id) return;
    const s = shapesOf(doc).find((b) => b.id === id);
    if (s?.kind === 'connector') return;
    if (!drag?.from) { drag = { mode: 'connect', from: id }; selected = [id]; render(); $('reply').textContent = 'Now click the shape to connect it to.'; return; }
    if (drag.from !== id) change([{ op: 'insert', block: { type: 'shape', kind: 'connector', id: `c${Date.now().toString(36)}`, from: drag.from, to: id, label: '', stroke: '#444', strokeWidth: 2 } }, ...unapprove(doc)], 'user', 'connected two shapes');
    drag = null;
    $('reply').textContent = '';
    return;
  }
  if (tool === 'text') {
    const text = prompt('Text');
    if (text) addShape(makeShape('text', { x, y: y - 18, text, fill: $('stroke').value }));
    return;
  }
  drag = { mode: 'draw', start: [x, y] };
}
function onMove(e) {
  if (!drag) return;
  const [x, y] = toSvgPoint(e);
  const svg = $('canvas').querySelector('svg');
  if (drag.mode === 'move' && selected.length) {
    const dx = x - drag.start[0], dy = y - drag.start[1];
    if (Math.abs(dx) + Math.abs(dy) > 2) drag.moved = true;
    for (const id of selected) svg.querySelectorAll(`[data-id="${id}"]`).forEach((n) => n.setAttribute('transform', `translate(${dx} ${dy})`));
  }
  if (drag.mode === 'draw' || drag.mode === 'resize') {
    svg.querySelector('#rubber')?.remove();
    const b = drag.mode === 'draw' ? boxFrom(drag.start, [x, y]) : resized(drag.box, drag.handle, x - drag.start[0], y - drag.start[1]);
    svg.insertAdjacentHTML('beforeend', `<rect id="rubber" x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="none" stroke="#3a7bd5" stroke-dasharray="4 3"/>`);
  }
}
function onUp(e) {
  if (!drag) return;
  const [x, y] = toSvgPoint(e);
  if (drag.mode === 'move' && drag.moved) {
    const dx = x - drag.start[0], dy = y - drag.start[1];
    const ops = shapesOf(doc).filter((s) => selected.includes(s.id)).flatMap((s) => updateOps(doc, s, { ...moveShape(s, dx, dy), assumed: (s.assumed ?? []).filter((a) => a !== 'place') }));
    change([...ops, ...unapprove(doc)], 'user', 'moved');
  }
  if (drag.mode === 'resize') {
    const s = shapesOf(doc).find((b) => b.id === selected[0]);
    const b = resized(drag.box, drag.handle, x - drag.start[0], y - drag.start[1]);
    if (s) change([...updateOps(doc, s, { ...setBox(s, b), assumed: (s.assumed ?? []).filter((a) => a !== 'size') }), ...unapprove(doc)], 'user', 'resized');
  }
  if (drag.mode === 'draw') {
    let b = boxFrom(drag.start, [x, y]);
    if (b.w < 12 && b.h < 12) b = { x: drag.start[0] - 50, y: drag.start[1] - 50, w: 100, h: 100 };
    const kind = { rect: 'rect', circle: 'circle', diamond: 'diamond', triangle: 'triangle', star: 'star', line: 'line', arrow: 'arrow' }[tool];
    const s = makeShape(kind, { ...b, fill: $('fill').value, stroke: $('stroke').value, strokeWidth: Number($('width').value) });
    if (kind === 'line' || kind === 'arrow') s.points = [drag.start, [x, y]];
    addShape(s);
  }
  if (drag.mode !== 'connect') drag = null;
}
const boxFrom = ([x1, y1], [x2, y2]) => ({ x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1) });
function resized(b, h, dx, dy) {
  let { x, y, w, h: hh } = b;
  if (h.includes('e')) w += dx; if (h.includes('s')) hh += dy;
  if (h.includes('w')) { x += dx; w -= dx; } if (h.includes('n')) { y += dy; hh -= dy; }
  return { x: w < 0 ? x + w : x, y: hh < 0 ? y + hh : y, w: Math.max(4, Math.abs(w)), h: Math.max(4, Math.abs(hh)) };
}
function addShape(s) {
  const id = `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  change([...insertShapesOps([{ ...s, id }]), ...unapprove(doc)], 'user', `drew a ${s.kind}`);
  selected = [id];
  render();
}

// ------------------------------------------------------------------ side panel
function renderSides() {
  $('tabs').replaceChildren(...SIDES.map(([id, label]) => el('button', { role: 'tab', textContent: label, className: id === side ? 'on' : '', 'aria-selected': String(id === side), onclick: () => { side = id; renderSides(); renderSide(); } })));
}
function renderSide() {
  $('tool').replaceChildren({ describe: describeView, flowchart: flowView, filters: filtersView, changes: changesView }[side]());
}

function describeView() {
  const text = el('textarea', { rows: 5, placeholder: 'Describe a drawing, for example:\na red circle above a blue square\nthree small green triangles in a row at the bottom\na large yellow star in the centre' });
  const rules = el('textarea', { rows: 4, placeholder: 'Or describe rules, and the Lucian Office Converter draws them as a flowchart of what leads to what:\nIf X is a person and X is tall then X plays basketball.' });
  const out = el('div');
  return el('div', {},
    el('h3', {}, 'Draw from a description'), text,
    el('div', { className: 'row' }, el('button', { className: 'primary', textContent: 'Draw', onclick: () => {
      const before = shapesOf(doc);
      const r = drawDescription(text.value, { canvas: canvasOf(doc), existing: before });
      const fresh = r.shapes.filter((s) => !before.some((b) => b.id === s.id));
      const changed = r.shapes.filter((s) => before.some((b) => b.id === s.id && JSON.stringify(b) !== JSON.stringify(s)));
      change([...changed.flatMap((s) => updateOps(doc, before.find((b) => b.id === s.id), s)), ...insertShapesOps(fresh), ...unapprove(doc)], 'user', 'drew from a description');
      out.replaceChildren(...r.notes.map((n) => el('p', { className: 'quiet' }, n)));
      if (assumptions(doc).length) out.append(el('p', { className: 'quiet' }, `I chose ${assumptions(doc).slice(0, 3).join(', ')}: see the question above.`));
    } })),
    el('h3', {}, 'Draw rules as a diagram'), rules,
    el('div', { className: 'row' }, el('button', { textContent: 'Draw the rules', onclick: () => {
      const r = convert(rules.value);
      const e = r.formats.etcher;
      if (!e.shapes.length) { out.replaceChildren(el('p', { className: 'quiet' }, 'No rules found. Write "If … then …" sentences.')); return; }
      const ids = new Map(e.shapes.map((s, i) => [s.id, `r${i + 1}`]));
      const shapes = e.shapes.map((s) => ({ ...makeShape('rect', { x: s.x, y: s.y, w: s.w, h: s.h, fill: '#ffffff', text: s.label, id: ids.get(s.id) }), labelSize: 14 }));
      const conns = e.arrows.map((a, i) => ({ kind: 'connector', id: `ra${i + 1}`, from: ids.get(a.from), to: ids.get(a.to), label: a.label, dashed: a.label === 'not', stroke: '#444', strokeWidth: 2 }));
      change([...shapesOf(doc).map((s) => ({ op: 'delete', id: s.id })), ...insertShapesOps([...shapes, ...conns]), ...canvasOps(doc, { caption: '', approved: false })], 'user', 'drew the rules');
      out.replaceChildren(el('p', { className: r.proof.ok ? 'ok' : 'quiet' }, r.proof.ok ? 'Drawn from the proved conversion.' : 'Drawn, but the conversion is not proved: check the rules.'));
    } })),
    out);
}

function flowView() {
  const text = el('textarea', { rows: 7, placeholder: 'Write the steps, one of these ways:\n\nStart -> Check stock -> In stock? -> yes: Ship the order -> End\nIn stock? -> no: Order more -> Check stock\n\nor one step per line (a line ending "?" decides),\nor sentences: "First check the stock. If it is in stock, ship the order; otherwise order more. Then finish."' });
  return el('div', {}, el('p', { className: 'quiet' }, 'Ovals start and end, diamonds decide, boxes do. Arrows that loop back are dashed.'), text,
    el('div', { className: 'row' }, el('button', { className: 'primary', textContent: 'Draw the flowchart', onclick: async () => { const r = await commands.perform(`flowchart ${text.value}`, doc, { by: 'user' }); if (r.matched) { doc = r.doc; persist(); render(); } $('reply').textContent = r.say; } })));
}

const plugins = filterPlugins(createPlugins, (d) => canvasOf(d));
function filtersView() {
  const deg = el('input', { type: 'number', value: 45, step: 15, 'aria-label': 'Degrees' });
  const depth = el('input', { type: 'number', value: 40, step: 10, 'aria-label': 'Depth' });
  const angle = el('input', { type: 'number', value: 45, step: 15, 'aria-label': 'Angle' });
  const zoom = el('input', { type: 'number', value: 50, step: 5, min: 5, max: 95, 'aria-label': 'Zoom %' });
  const run = async (id, options) => {
    const ids = selected.length ? selected : shapesOf(doc).filter((s) => s.kind !== 'connector').map((s) => s.id);
    if (!ids.length) { $('reply').textContent = 'Draw something first.'; return; }
    const r = await plugins.run(id, doc, { selection: { blockIds: ids }, options });
    doc = r.doc;
    lastMeasure = r.say;
    selected = [];
    persist();
    render();
    renderSide();
  };
  return el('div', {},
    el('p', { className: 'quiet' }, `Filters work on the selected shapes${selected.length ? ` (${selected.length})` : ', or everything if nothing is selected'}. Each says what it measured, and each can be undone.`),
    el('h3', {}, 'Rotate'), el('div', { className: 'row' }, el('label', {}, 'Degrees ', deg), el('button', { textContent: 'Rotate', onclick: () => run('rotate', { degrees: Number(deg.value) }) })),
    el('h3', {}, '3D'), el('div', { className: 'row' }, el('label', {}, 'Depth ', depth), el('label', {}, 'Angle ', angle), el('button', { textContent: 'Make 3D', onclick: () => run('3d', { depth: Number(depth.value), angle: Number(angle.value) }) })),
    el('h3', {}, 'Vector fill'), el('p', { className: 'quiet' }, 'Zoom out about the centre, then fill the canvas with copies.'),
    el('div', { className: 'row' }, el('label', {}, 'Zoom to % ', zoom), el('button', { textContent: 'Vector fill', onclick: () => run('vector-fill', { zoom: Number(zoom.value) / 100 }) })),
    lastMeasure ? el('p', { className: 'measure' }, lastMeasure) : null);
}

function changesView() {
  return el('ol', { reversed: true }, doc.history.slice().reverse().map((e) => el('li', {}, `${e.by === 'character' ? 'Lucian' : e.by === 'user' ? 'You' : e.by.replace('plugin:', '')}: ${e.label}`)));
}

// ------------------------------------------------------------------ the character
const commands = etcherCommands();
const ctx = { selected: () => selected };
const handle = characterHandler(commands, () => doc, (d) => { doc = d; persist(); render(); }, ctx);
async function sayDo(text) {
  const q = nextQuestion(doc);
  // a reply to the approval question can be a plain "yes"
  if (q && /^(yes|approve|looks good)$/i.test(text.trim())) { const r = await answer(commands, q.key, text, doc, { by: 'character', ctx }); doc = r.doc; persist(); render(); $('reply').textContent = r.say; return; }
  const reply = await handle({ intent: 'unknown', text }, text);
  $('reply').textContent = reply ?? `I don't know how to do that in Etcher. ${commands.help()}`;
}
$('say').addEventListener('submit', async (e) => { e.preventDefault(); await sayDo($('sayText').value); $('sayText').value = ''; });
addEventListener('message', async (e) => {
  if (e.origin !== location.origin || e.data?.type !== 'lucianos.command') return;
  const reply = await handle({ intent: 'unknown', text: e.data.text }, e.data.text);
  e.source.postMessage({ type: 'lucianos.reply', id: e.data.id, text: reply }, location.origin);
});
if (parent !== window) parent.postMessage({ type: 'lucianos.commands', names: commands.list().map((c) => c.name) }, location.origin);

// ------------------------------------------------------------------ files
async function save() {
  const path = prompt('Save as (relative to your home folder)', settings.savePath || `Documents/${(doc.title || 'Untitled drawing').replace(/[^\w -]/g, '')}.etcher.json`);
  if (!path) return;
  await api.files.write(path, serialise(doc), { mkdirs: true, force: true });
  await api.files.write(path.replace(/\.json$/, '') + '.pl', toProlog(doc), { mkdirs: true, force: true });
  settings.savePath = path;
  persist();
  $('reply').textContent = `Saved ${path}, with its Prolog form beside it.`;
}
async function open(path) {
  path ??= prompt('Open which .etcher.json file?', settings.savePath || '');
  if (!path) return;
  try { doc = deserialise((await api.files.read(path)).content); selected = []; settings.savePath = path; persist(); render(); } catch (err) { $('reply').textContent = `Couldn't open it: ${err.message}`; }
}
const svgText = () => { const c = canvasOf(doc); return toSVG(shapesOf(doc), { width: c.width, height: c.height, background: c.background, caption: c.caption && c.caption !== '—' ? c.caption : '' }); };
async function exportAs(kind) {
  const base = (settings.savePath || `Documents/${doc.title || 'Untitled drawing'}.etcher.json`).replace(/\.etcher\.json$|\.json$/, '');
  const path = prompt('Export as', `${base}.${kind}`);
  if (!path) return;
  if (kind === 'png') {
    const c = canvasOf(doc);
    const img = new Image();
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText())}`;
    await img.decode();
    const cv = el('canvas', { width: c.width * 2, height: c.height * 2 });
    cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
    const blob = await new Promise((r) => cv.toBlob(r, 'image/png'));
    const res = await fetch(`/api/files/write?path=${encodeURIComponent(path)}&force=1&mkdirs=1`, { method: 'PUT', body: blob, credentials: 'same-origin' });
    if (!res.ok) { $('reply').textContent = `Couldn't save the picture (${res.status}).`; return; }
  } else await api.files.write(path, kind === 'svg' ? svgText() : toProlog(doc), { mkdirs: true, force: true });
  $('reply').textContent = `Exported ${path}.`;
}

// ------------------------------------------------------------------ start
async function init() {
  settings = { ...settings, ...((await api.state.get('etcher').catch(() => null)) ?? {}) };
  const saved = await api.state.get('etcher-doc').catch(() => null);
  if (saved?.format === 'lucianoffice/1' && saved.app === 'etcher') doc = saved;
  const params = new URLSearchParams(location.search);
  if (params.get('draw') || params.get('flow')) doc = newEtchDoc();
  if (SIDES.some(([id]) => id === params.get('side'))) side = params.get('side');
  render();
  renderSides();
  renderSide();
  const cv = $('canvas');
  cv.addEventListener('pointerdown', onDown);
  cv.addEventListener('pointermove', onMove);
  cv.addEventListener('pointerup', onUp);
  cv.addEventListener('dblclick', (e) => { const id = e.target.closest?.('[data-id]')?.dataset.id; if (id) labelShape(id); });
  addEventListener('keydown', (e) => {
    if (e.target.closest?.('input, textarea')) return;
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); doc = (e.shiftKey ? redo(doc) : undo(doc)).doc; persist(); render(); return; }
    if ((e.key === 'Delete' || e.key === 'Backspace') && selected.length) { e.preventDefault(); deleteSelected(); }
    const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (arrows[e.key] && selected.length) {
      e.preventDefault();
      const step = e.shiftKey ? 20 : 2;
      change(shapesOf(doc).filter((s) => selected.includes(s.id)).flatMap((s) => updateOps(doc, s, moveShape(s, arrows[e.key][0] * step, arrows[e.key][1] * step))), 'user', 'nudged');
    }
    if (e.key.toLowerCase() === 'v' && !mod) setTool('select');
  });
  for (const b of document.querySelectorAll('[data-tool]')) b.onclick = () => setTool(b.dataset.tool);
  $('fill').onchange = () => change(shapesOf(doc).filter((s) => selected.includes(s.id) && s.kind !== 'line' && s.kind !== 'arrow' && s.kind !== 'connector').flatMap((s) => updateOps(doc, s, { ...s, fill: $('fill').value, assumed: (s.assumed ?? []).filter((a) => a !== 'colour') })), 'user', 'changed the fill');
  $('stroke').onchange = () => change(shapesOf(doc).filter((s) => selected.includes(s.id)).flatMap((s) => updateOps(doc, s, { ...s, stroke: $('stroke').value })), 'user', 'changed the line colour');
  $('width').onchange = () => change(shapesOf(doc).filter((s) => selected.includes(s.id)).flatMap((s) => updateOps(doc, s, { ...s, strokeWidth: Number($('width').value) })), 'user', 'changed the line width');
  $('front').onclick = () => change(selected.map((id) => ({ op: 'move', id, to: doc.blocks.length - 1 })), 'user', 'brought to front');
  $('back').onclick = () => change(selected.map((id) => ({ op: 'move', id, to: 1 })), 'user', 'sent to back');
  $('label').onclick = () => { if (selected.length === 1) labelShape(selected[0]); };
  $('del').onclick = deleteSelected;
  $('undo').onclick = () => { doc = undo(doc).doc; persist(); render(); };
  $('redo').onclick = () => { doc = redo(doc).doc; persist(); render(); };
  $('title').onchange = () => change([{ op: 'title', value: $('title').value.trim() || 'Untitled drawing' }], 'user', 'renamed');
  $('new').onclick = () => { if (confirm('Start a new drawing? The current one stays saved if you saved it.')) { doc = newEtchDoc(); selected = []; settings.savePath = ''; persist(); render(); } };
  $('save').onclick = save;
  $('open').onclick = () => open();
  $('export').onchange = async (e) => { const k = e.target.value; e.target.value = ''; if (k) await exportAs(k); };
  if (params.get('draw')) await sayDo(`draw ${params.get('draw')}`);
  if (params.get('flow')) await sayDo(`flowchart ${params.get('flow')}`);
  if (params.get('do')) await sayDo(params.get('do'));
  if (params.get('caption')) { const r = await answer(commands, 'caption', params.get('caption'), doc, { by: 'user' }); doc = r.doc; render(); }
}
function setTool(t) { tool = t; drag = null; for (const b of document.querySelectorAll('[data-tool]')) b.classList.toggle('on', b.dataset.tool === t); render(); }
function deleteSelected() {
  const ids = new Set(selected);
  const joined = shapesOf(doc).filter((c) => c.kind === 'connector' && (ids.has(c.from) || ids.has(c.to))).map((c) => c.id);
  change([...[...ids, ...joined].map((id) => ({ op: 'delete', id })), ...unapprove(doc)], 'user', 'deleted');
  selected = [];
  render();
}
function labelShape(id) {
  const s = shapesOf(doc).find((b) => b.id === id);
  if (!s || s.kind === 'connector') return;
  const text = prompt('Label', s.text ?? '');
  if (text !== null) change(updateOps(doc, s, { ...s, text }), 'user', 'labelled a shape');
}
init();

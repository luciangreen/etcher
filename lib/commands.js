// Etcher's commands, for the RetroMR character and for answering "which part should change?".
// Each returns ops applied as one step marked as the character's, so "undo that" takes it back.
import { createCommands } from './core.js';
import { COLOURS, bbox, moveShape, scaleShape } from './shapes.js';
import { drawDescription, findShape, parseNoun } from './describe.js';
import { flowchart } from './flowchart.js';
import { describeMeasure, extrude, rotate, vectorFill } from './filters.js';
import { canvasOf, canvasOps, insertShapesOps, shapesOf, unapprove, updateOps } from './etchdoc.js';
import { isApproval, isNoCaption, nameOf } from './questions.js';

const clean = (s) => String(s).trim().replace(/^["“']|["”']$/g, '');

// "it", "the circle", "the red box", "the "Start" box", "everything".
export function target(doc, phrase, ctx = {}) {
  const shapes = shapesOf(doc).filter((s) => s.kind !== 'connector');
  const p = clean(phrase ?? 'it').toLowerCase();
  if (/^(it|this|that|this one|that one|the shape)$/.test(p)) {
    const sel = ctx.selected?.();
    const picked = sel?.length ? shapes.filter((s) => sel.includes(s.id)) : shapes.slice(-1);
    return picked;
  }
  if (/^(everything|all|all of it|the drawing|the whole drawing|all shapes)$/.test(p)) return shapes;
  const quoted = /["“]([^"”]+)["”]/.exec(phrase);
  if (quoted) return shapes.filter((s) => s.text?.toLowerCase() === quoted[1].toLowerCase()).slice(-1);
  const noun = parseNoun(`the ${p.replace(/^the\s+/, '')}`);
  if (!noun) {
    const byLabel = shapes.filter((s) => s.text && s.text.toLowerCase() === p.replace(/^the\s+/, '').replace(/\s+(box|shape)$/, ''));
    return byLabel.slice(-1);
  }
  const s = findShape(shapes, noun);
  return s ? [s] : [];
}

const DIRS = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] };

export function etcherCommands() {
  const reg = createCommands({ app: 'Etcher' });
  const each = (doc, shapes, f) => [...shapes.flatMap((s) => updateOps(doc, s, f(s))), ...unapprove(doc)];
  const none = (doc, phrase) => ({ doc, say: `I can't see ${clean(phrase)} in the drawing.` });
  reg
    .register({
      name: 'flowchart', patterns: ['flowchart {text}', 'make a flowchart {text}', 'draw a flowchart {text}', 'make a flowchart of {text}'], help: 'flowchart Start -> Check stock -> End',
      run: ({ args, doc }) => {
        const f = flowchart(clean(args.text).replace(/^[:\s]+/, ''), { width: canvasOf(doc).width });
        if (!f.shapes.length) return { doc, say: 'Give the steps, such as "Start -> Check stock -> End".' };
        const ops = [...shapesOf(doc).map((s) => ({ op: 'delete', id: s.id })), ...insertShapesOps(f.shapes), ...canvasOps(doc, { height: Math.max(canvasOf(doc).height, f.height), approved: false, caption: '' })];
        return { ops, say: `Drew a flowchart with ${f.shapes.filter((s) => s.kind !== 'connector').length} steps in ${f.layers} rows${f.backEdges ? ` and ${f.backEdges} loop${f.backEdges === 1 ? '' : 's'} back (dashed)` : ''}.` };
      }
    })
    .register({
      name: 'draw', patterns: ['draw {text}', 'add {text}', 'put {text}'], help: 'draw a red circle above a blue square',
      run: ({ args, doc }) => {
        const before = shapesOf(doc);
        const r = drawDescription(clean(args.text), { canvas: canvasOf(doc), existing: before });
        const fresh = r.shapes.filter((s) => !before.some((b) => b.id === s.id));
        const changed = r.shapes.filter((s) => before.some((b) => b.id === s.id && JSON.stringify(b) !== JSON.stringify(s)));
        const ops = [...changed.flatMap((s) => updateOps(doc, before.find((b) => b.id === s.id), s)), ...insertShapesOps(fresh), ...unapprove(doc)];
        if (!ops.length) return { doc, say: r.notes.join(' ') || "I couldn't tell what to draw." };
        return { ops, say: `Drew ${fresh.length} shape${fresh.length === 1 ? '' : 's'}.${r.notes.length ? ` ${r.notes.join(' ')}` : ''}` };
      }
    })
    .register({
      name: 'size', patterns: ['make {what} bigger', 'make {what} smaller', 'make {what} larger', 'make {what} twice as big', 'make {what} half the size', 'enlarge {what}', 'shrink {what}'], help: 'make the circle bigger',
      run: ({ args, doc, ctx }, ) => {
        const shapes = target(doc, args.what, ctx);
        if (!shapes.length) return none(doc, args.what);
        const said = ctx.said ?? '';
        const k = /twice/.test(said) ? 2 : /half/.test(said) ? 0.5 : /smaller|shrink/.test(said) ? 0.8 : 1.25;
        return { ops: each(doc, shapes, (s) => scaleShape(s, k)), say: `${k > 1 ? 'Enlarged' : 'Shrank'} the ${shapes.map(nameOf).join(', ')}.` };
      }
    })
    .register({
      name: '3d', patterns: ['make {what} 3d', 'make {what} three dimensional', 'extrude {what}', 'make {what} 3d {depth} deep'], help: 'make the box 3D',
      run: ({ args, doc, ctx }) => {
        const shapes = target(doc, args.what, ctx).filter((s) => !s.part);
        if (!shapes.length) return { doc, say: `There's nothing flat called ${clean(args.what)} to make 3D.` };
        const ops = [];
        let faces = 0;
        for (const s of shapes) {
          const r = extrude(s, { depth: Number(args.depth) || 40 });
          faces += r.measure.faces;
          const at = doc.blocks.findIndex((b) => b.id === s.id);
          ops.push({ op: 'delete', id: s.id }, ...r.shapes.map((x, i) => ({ op: 'insert', at: at + i, block: { ...x, type: 'shape', assumed: s.assumed } })));
        }
        return { ops: [...ops, ...unapprove(doc)], say: `Made 3D: ${faces} faces, 40 deep at 45°.` };
      }
    })
    .register({
      name: 'colour', patterns: ['make {rest}', 'change {rest}', 'colour {rest}', 'color {rest}', 'paint {rest}'], help: 'change the box to green',
      run: ({ args, doc, ctx }) => {
        const m = /^(.*?)\s+(?:to\s+|into\s+)?([a-z]+)$/i.exec(clean(args.rest));
        if (!m) return { doc, say: 'Say what to change and the colour, such as "change the box to green".' };
        args = { what: m[1], colour: m[2] };
        const c = COLOURS[clean(args.colour).toLowerCase()];
        if (!c) return { doc, say: `I don't know the colour ${args.colour}.` };
        const shapes = target(doc, args.what, ctx);
        if (!shapes.length) return none(doc, args.what);
        return { ops: each(doc, shapes, (s) => ({ ...s, ...(s.kind === 'line' || s.kind === 'arrow' ? { stroke: c } : { fill: c }), assumed: (s.assumed ?? []).filter((a) => a !== 'colour') })), say: `The ${shapes.map(nameOf).join(', ')} ${shapes.length > 1 ? 'are' : 'is'} now ${clean(args.colour)}.` };
      }
    })
    .register({
      name: 'move', patterns: ['move {rest}', 'shift {rest}'], help: 'move the circle left by 20',
      run: ({ args, doc, ctx }) => {
        const m = /^(.*?)\s+(left|right|up|down)(?:\s+by\s+(\d+)(?:\s*(?:px|pixels|points))?)?$/i.exec(clean(args.rest));
        if (!m) return { doc, say: 'Say what to move and which way: left, right, up or down.' };
        args = { what: m[1], dir: m[2] };
        const d = DIRS[m[2].toLowerCase()];
        const shapes = target(doc, args.what, ctx);
        if (!shapes.length) return none(doc, args.what);
        const n = Number(m[3]) || 40;
        return { ops: each(doc, shapes, (s) => ({ ...moveShape(s, d[0] * n, d[1] * n), assumed: (s.assumed ?? []).filter((a) => a !== 'place') })), say: `Moved the ${shapes.map(nameOf).join(', ')} ${clean(args.dir)}.` };
      }
    })
    .register({
      name: 'label', patterns: ['label {what} {text}', 'write {text} on {what}', 'call {what} {text}'],
      run: ({ args, doc, ctx }) => {
        const shapes = target(doc, args.what, ctx);
        if (!shapes.length) return none(doc, args.what);
        return { ops: each(doc, shapes.slice(-1), (s) => ({ ...s, text: clean(args.text) })), say: `Labelled it "${clean(args.text)}".` };
      }
    })
    .register({
      name: 'delete', patterns: ['delete {what}', 'remove {what}', 'take away {what}', 'clear the drawing'],
      run: ({ args, doc, ctx }) => {
        const shapes = args.what ? target(doc, args.what, ctx) : shapesOf(doc);
        if (!shapes.length) return none(doc, args.what ?? 'anything');
        const ids = new Set(shapes.map((s) => s.id));
        const joined = shapesOf(doc).filter((c) => c.kind === 'connector' && (ids.has(c.from) || ids.has(c.to)));
        return { ops: [...[...shapes, ...joined].map((s) => ({ op: 'delete', id: s.id })), ...unapprove(doc)], say: `Removed the ${shapes.map(nameOf).join(', ')}.` };
      }
    })
    .register({
      name: 'rotate', patterns: ['rotate {what} by {n} degrees', 'rotate {what} {n} degrees', 'turn {what} by {n} degrees', 'turn {what} {n} degrees', 'rotate {what}'], help: 'rotate the star 45 degrees',
      run: ({ args, doc, ctx }) => {
        const shapes = target(doc, args.what, ctx);
        if (!shapes.length) return none(doc, args.what);
        const deg = Number(args.n ?? 90);
        if (!Number.isFinite(deg)) return { doc, say: 'Say how many degrees.' };
        const r = rotate(shapes, deg);
        return { ops: [...r.shapes.flatMap((s, i) => updateOps(doc, shapes[i], s)), ...unapprove(doc)], say: `Rotated: ${describeMeasure(r.measure)}.` };
      }
    })
    .register({
      name: 'vector fill', patterns: ['vector fill', 'vector fill at {zoom}', 'zoom out and fill in', 'zoom out and fill'], help: 'vector fill at 50%',
      run: ({ args, doc }) => {
        const shapes = shapesOf(doc).filter((s) => s.kind !== 'connector');
        if (!shapes.length) return { doc, say: 'Draw something first.' };
        const zoom = args.zoom ? Number(String(args.zoom).replace('%', '')) / (String(args.zoom).includes('%') || Number(args.zoom) > 1 ? 100 : 1) : 0.5;
        const r = vectorFill(shapes, { ...canvasOf(doc), zoom });
        return { ops: [...shapesOf(doc).map((s) => ({ op: 'delete', id: s.id })), ...insertShapesOps(r.shapes), ...unapprove(doc)], say: `Vector fill: ${describeMeasure(r.measure)}.` };
      }
    })
    .register({
      name: 'caption', patterns: ['caption it {text}', 'the caption is {text}', 'caption {text}'],
      run: ({ args, doc }) => ({ ops: canvasOps(doc, { caption: isNoCaption(args.text) ? '—' : clean(args.text) }), say: isNoCaption(args.text) ? 'No caption.' : `Caption: ${clean(args.text)}.` })
    })
    .register({
      name: 'approve', patterns: ['approve', 'i approve', 'looks good', 'approve it', 'yes'],
      run: ({ doc }) => (shapesOf(doc).length ? { ops: canvasOps(doc, { approved: true }), say: 'Approved. It is ready to use in Writer, Presenter and Tabler.' } : { doc, say: 'There is nothing to approve yet.' })
    });
  // the size command needs the exact words said ("twice", "half")
  const perform = reg.perform;
  reg.perform = (text, doc, opts = {}) => perform(text, doc, { ...opts, ctx: { ...(opts.ctx ?? {}), said: String(text).toLowerCase() } });
  return reg;
}

// Answers to the approve-or-change questions: a caption, an approval, or a change.
export async function answer(reg, key, text, doc, opts) {
  if (key === 'caption') {
    const caption = isNoCaption(text) ? '—' : clean(text).replace(/^(caption( it)?|call it)\s+/i, '');
    return { matched: true, doc: (await import('./core.js')).apply(doc, canvasOps(doc, { caption }), { by: 'user', label: 'captioned the drawing' }), say: caption === '—' ? 'No caption.' : `Caption: ${caption}.` };
  }
  if (isApproval(text)) return reg.perform('approve', doc, opts);
  return reg.perform(text, doc, opts);
}

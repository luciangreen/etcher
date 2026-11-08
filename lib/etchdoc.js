// An Etcher document is a Lucian Office document of app "etcher":
//   { type: 'canvas', width, height, background, caption, approved }
//   { type: 'shape', id, kind, ... }   one block per shape; the block id is the shape id,
//                                      so connectors can point at shapes by id
import { createDocument } from './core.js';
import { CANVAS } from './describe.js';

export function newEtchDoc() {
  return createDocument({ app: 'etcher', title: 'Untitled drawing', blocks: [{ type: 'canvas', width: CANVAS.width, height: CANVAS.height, background: '#ffffff', caption: '', approved: false }] });
}
export const canvasOf = (doc) => doc.blocks.find((b) => b.type === 'canvas') ?? { width: CANVAS.width, height: CANVAS.height, background: '#ffffff' };
export const shapesOf = (doc) => doc.blocks.filter((b) => b.type === 'shape');
export const canvasOps = (doc, patch) => Object.entries(patch).map(([key, value]) => ({ op: 'set', id: canvasOf(doc).id, key, value }));

// Replace one shape's geometry and style with a new version (one op per changed key).
export function updateOps(doc, before, after) {
  const ops = [];
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (key === 'id' || key === 'type') continue;
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) ops.push({ op: 'set', id: before.id, key, value: after[key] });
  }
  return ops;
}
export const insertShapesOps = (shapes) => shapes.map((s) => ({ op: 'insert', block: { ...s, type: 'shape' } }));
// Any edit to the drawing means it needs approving again.
export const unapprove = (doc) => (canvasOf(doc).approved ? canvasOps(doc, { approved: false }) : []);

// Approve-or-change: after drawing, Etcher asks for a caption, then whether you approve the
// drawing or want parts changed. The approval question names what Etcher had to assume
// (a colour, size or place you didn't give), so you know what to check.
import { COLOUR_NAMES } from './shapes.js';
import { canvasOf, shapesOf } from './etchdoc.js';

const NAMES = { ellipse: 'circle', rect: 'box', square: 'square', diamond: 'diamond', triangle: 'triangle', star: 'star', pentagon: 'pentagon', hexagon: 'hexagon', heart: 'heart', line: 'line', arrow: 'arrow', text: 'text', polygon: 'face' };
export const nameOf = (s) => `${s.text && s.kind !== 'text' ? `"${s.text}" ` : ''}${NAMES[s.kind] ?? s.kind}`;

export function assumptions(doc) {
  const out = [];
  for (const s of shapesOf(doc)) {
    for (const a of s.assumed ?? []) {
      if (a === 'colour') out.push(`the ${nameOf(s)}'s colour (${COLOUR_NAMES[s.fill] ?? s.fill})`);
      if (a === 'size') out.push(`the ${nameOf(s)}'s size`);
      if (a === 'place') out.push(`where the ${nameOf(s)} goes`);
    }
  }
  return out;
}

export function nextQuestion(doc) {
  const c = canvasOf(doc);
  if (!shapesOf(doc).length || c.approved) return null;
  if (!c.caption) return { key: 'caption', ask: 'What caption should the drawing have? (Say "no caption" to leave it without one.)' };
  const guessed = assumptions(doc);
  return {
    key: 'approve',
    ask: `Do you approve the drawing, or which part should change?${guessed.length ? ` I chose ${list(guessed.slice(0, 4))}${guessed.length > 4 ? ` and ${guessed.length - 4} more` : ''}.` : ''} Say "approve", or a change such as "make the circle bigger" or "change the box to green".`
  };
}
const list = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

export const isApproval = (text) => /^(yes|yep|approve[d]?|i approve|looks good|good|ok(ay)?|perfect|that'?s (right|good|fine)|fine|great|done)\b/i.test(String(text).trim());
export const isNoCaption = (text) => /^(no caption|none|skip|no)$/i.test(String(text).trim());

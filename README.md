# Etcher

Etcher draws flowcharts, pictures and diagrams in Lucian Office, inside [LucianOS](https://github.com/luciangreen/lucianos). It can:

- draw a picture from a plain description ("a red circle above a blue square");
- draw a flowchart from steps ("Start -> Check stock -> In stock? -> …");
- draw a diagram of rules through the Lucian Office Converter.

After drawing, it asks for a caption, then whether you approve or want parts changed. It also has mathematical filters (rotate, 3D and vector fill) that say what they measured. Every change can be undone, including just the character's. It works in the browser on a computer or a phone.

## Install

Etcher is built on the [Lucian Office core](https://github.com/luciangreen/lucianoffice). Clone both into LucianOS's `apps` folder, side by side, and restart LucianOS:

```sh
cd lucianos/apps
git clone https://github.com/luciangreen/lucianoffice
git clone https://github.com/luciangreen/etcher
```

## Drawing by hand

- **Tools:** select, box, circle, diamond, triangle, star, line, arrow, text, and **Connect**. Connect joins two shapes with an arrow that follows them when they move.
- **Moving and resizing:** drag to move, use the corner handles to resize, use the arrow keys to nudge (hold Shift for bigger steps), and Shift-click to select several shapes.
- **Labels:** double-click a shape (or use **Label**) to write in it.
- **Style:** fill, line colour and line width.
- **Other:** **Front** and **Back**, **Delete**, **Undo** and **Redo** (Ctrl/Cmd+Z).

## Drawing from text

### A picture

Write in the **Describe** tab, or tell Lucian "draw …":

| You can say | For example |
| --- | --- |
| How many | a, two, three … ten, several |
| Size | tiny, small, medium, large or big, huge |
| Colour | red, orange, yellow, green, blue, purple, pink, brown, black, white, grey, teal, navy, gold, with light or dark |
| Shape | circle, oval, square, box or rectangle, triangle, diamond, star, pentagon, hexagon, heart, line, arrow |
| Label | labelled Start, called Home, saying "Next step" |
| Place | in the centre, at the top, bottom, left or right, in the top left corner, and so on |
| Arrangement | in a row, in a column, in a circle |
| Relation | above, below, left of, right of, beside, inside another shape ("a small red circle inside the square") |

- **Changing a shape already drawn:** "the circle is yellow".
- **Where new shapes go:** where you said; otherwise in the next free space, without overlapping what is there. Two new shapes in a relation are centred together.
- **Anything it can't draw** is said, not guessed ("I couldn't tell what to draw: name a shape").

### A flowchart

Use the **Flowchart** tab, or say "flowchart …". There are three ways to write the steps:

- **Arrows:** `Start -> Check stock -> In stock? -> yes: Ship the order -> End`, with more lines for other branches, such as `In stock? -> no: Order more -> Check stock`.
- **One step per line:** a line ending in "?" is a decision, as in `Is it in stock? yes: Ship the order / no: Order more`.
- **Sentences:** `First check the stock. If it is in stock, ship the order; otherwise order more. Then finish.` "If it is in stock" becomes the decision "Is it in stock?".

Ovals start and end, diamonds decide, and boxes do. Steps are laid out in rows from the start so arrows run downwards. Arrows that loop back are dashed.

### Rules as a diagram

**Draw the rules** sends "If … then …" sentences through the Converter and draws a box for each predicate, with an arrow from each condition to its result.

## Approve or change

1. After drawing, Etcher asks **what caption** the drawing should have (or "no caption").
2. It then asks **whether you approve, or which part should change**. It names what it had to assume, such as "I chose the circle's colour (blue) and the square's size", so you know what to check.
3. Answer "approve", or with a change: "make the circle bigger", "change the box to green", "move the star left", "delete the triangle", "label the box Start". You can also press **Approve**.
4. Changing the drawing after approving it asks for approval again.

## Filters

Filters work on the selected shapes, or on everything if nothing is selected. They are Lucian Office plug-ins: each is one undoable step, and each says what it measured.

| Filter | What it does | What it checks |
| --- | --- | --- |
| **Rotate** | Turns the shapes about their joint centre | The area and side lengths are kept, and a square turned 45° is √2 times as wide |
| **3D** | Extrudes each shape: a back face moved by the depth at the angle (40 at 45° by default), a shaded side for every edge, the front left where it was | Every back corner is exactly the depth away, at the angle |
| **Vector fill** | "Zoom out and fill in": scales the drawing down about the canvas centre and tiles copies around it until the canvas is full | At 50%, 9 copies a quarter of the area, one tile apart; at 25%, a 5 × 5 grid |

## The character

Say these in the **Tell Lucian** box, or to the desktop character while Etcher is in front:

- "draw a red circle above a blue square";
- "flowchart Start -> Work -> End";
- "make the circle bigger", "make it twice as big";
- "change the box to green", "move the star left by 30", "label the box Start";
- "rotate the star 45 degrees", "make the box 3D", "vector fill at 50%";
- "delete the triangle", "caption it Order handling", "approve";
- "what changed", and "undo that", which undoes only Lucian's last change.

## Files

- **Save** writes `Name.etcher.json` (a Lucian Office document) with its Prolog form beside it.
- **Export** writes the drawing as `.svg` or `.png` (with its caption), or the Prolog form.

## Tests

```sh
npm test
```

The tests need the core beside Etcher (`../lucianoffice`). They cover:

- **shapes drawn from sample descriptions**: kinds, colours, sizes, counts, places, relations (above, inside, below), labels, rows, columns, and no overlaps;
- **flowcharts**: from arrows, lines and sentences; kinds, labelled branches, loops back, downward layout and no overlaps;
- **filters checked by measurement**: rotation keeps area and lengths, and four quarter turns come back; 3D back corners are the depth away at the angle; vector fill copies, scale and tiling;
- the approve-or-change questions;
- the character's commands, with undo.

GitHub Actions runs them with the core checked out beside Etcher.

## Not yet

- More filters as plug-ins: effects, and generative fill from written instructions.

## Inputs and outputs

`io/ios.txt` lists 200 inputs and the outputs they give, from real runs of this repo's functions (the list of functions is in `io/cases.mjs`; the inputs come from a fixed seed, so they are the same every time). `npm test` runs them again and fails if any output changes. If a change is meant, run `npm run ios` to write the new outputs and check the diff.

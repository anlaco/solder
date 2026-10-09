# Visual specification — Solder

Living document that defines Solder's visual identity.
Guiding principle: **the same as LabVIEW in shape, sizes and behavior; not in styles.**
A LabVIEW programmer must feel at home from the very first moment.

This document will grow as new types and features are implemented.

---

## 1. Canvas and navigation

### 1.1 No zoom

Solder does not implement zoom. It is a deliberate design decision: it keeps
diagrams from growing without limit and does not complicate the editor.

**It differs from LabVIEW**, which has zoom in the block diagram since 2023 Q3. It is
kept on purpose (decided on 2026-09-29): see [`05-editor.md`](05-editor.md),
rule 35.

### 1.2 Dynamic scrollbars

Both the Block Diagram (BD) and the Front Panel (FP) have scrollbars that
adjust dynamically to the content:
- The diagram lives in an "infinite" space
- The scrollbars reflect the position of the components relative to the total space
- If a component gets close to an edge, the scrollbar gets smaller
  because the useful space grows
- The diagram is centered within the range of the scrollbars

### 1.3 Grid

- Movement with the keyboard arrows is pixel by pixel (1px)
- Movement with Shift + arrows is a larger jump (to be defined: 8px or 12px)
- There is no visible grid by default, but elements can be aligned manually

---

## 2. Blocks: controls and indicators in the BD

### 2.1 Two display modes: "View as Icon"

Each control and indicator has an individual `view-as-icon` property (true/false).
It is not global to the diagram — it can be configured per element.

**Icon ON (view-as-icon: true):**
- Square with a visual icon of the control/indicator type
- Border in the color of the data type
- Type abbreviation centered at the bottom (DBL, TF, STR...)
- Larger size, more visual

**Icon OFF (view-as-icon: false):**
- Compact rectangle
- Background color of the data type
- Type abbreviation as text (DBL, TF, STR...)
- Reduced size, ideal for dense diagrams

### 2.2 Control vs indicator distinction

- **Control** (input) → thin border
- **Indicator** (output) → thick border

This visual convention is consistent with LabVIEW and applies both in the
connector pane and in the representation in the BD.

### 2.3 Abbreviations by type

| Type       | Abbreviation | Color      |
|------------|--------------|------------|
| Numeric (float/double) | DBL | Orange |
| Boolean    | TF          | Green      |
| String     | STR         | Pink       |
| Integer    | I32 / I16 / etc. | Blue  |
| Cluster    | (pending)   | Brown      |

*Note: the table will be expanded as new types are implemented.*

---

## 3. Blocks: primitive functions

### 3.1 Own shapes

The primitive functions (Add, Subtract, And, Or, Not...) **do not use the generic
4224 pattern**. Each one has its own shape with terminals at specific
positions.

Example: **Add** is a triangle rotated 90°. The tip is the output (result),
the base has the two inputs (a, b) distributed vertically.

*The specific shapes of each primitive will be defined when it is implemented.*

### 3.2 SubVIs: the 4224 pattern

SubVIs use the connector pane with the **4-2-2-4** pattern as a starting
point:
- 4 terminals on top
- 2 terminals on the left (inputs)
- 2 terminals on the right (outputs)
- 4 terminals on the bottom

The terminals **share the space equally** within the block.
The connector pane takes up the whole block — there is no dead space.

If more terminals are needed, additional patterns will be considered.

### 3.3 SubVIs: view-as-icon

SubVIs also support `view-as-icon`:

**Icon ON:** Square with the VI's icon and a border in the color of the type.

**Icon OFF:** Compact rectangle. It shows input arrows (left) and
output arrows (right) in the color of each terminal's data type. At the
bottom it has an expansion control (arrow) which, when dragged downward,
unfolds the named terminals, one by one (similar to a Property Node in
LabVIEW). When a terminal is unfolded, its corresponding arrow disappears.

---

## 4. Wires

### 4.1 Visual coding by type

Wires encode the data type through **three visual channels**:

| Channel | What it indicates |
|---------|-------------------|
| Color   | Type family (numeric, boolean, string...) |
| Thickness | Structure (scalar, 1D array, 2D array...) |
| Pattern | Reinforcement of structure + special cases |

### 4.2 Wire table — basic types

| Type     | Color    | Thickness | Pattern  |
|----------|----------|-----------|----------|
| Numeric (DBL) | Orange | Thin (1px) | Solid |
| Boolean  | Green    | Thin (1px) | Solid |
| String   | Pink     | Thin (1px) | Characteristic pattern (striped/segmented) |
| Integer  | Blue     | Thin (1px) | Solid |

*Arrays, clusters and composite types will be defined when implemented in Phase 2.*

> **Implemented in the web editor** (2026-09-29, `core/model/types.mjs`,
> [DT-038](../design/05-decisions.md#dt-038)): orange `#ff7f00` for DBL and
> SGL, blue `#0000ff` for integers and enums —measured on the border of the
> constants and on the wires (first read as `#fb7c00` from the videos; corrected on 2026-10-08 with 1:1 captures of the wires and the connector pane); the palette icons
> use another orange, `#ff6633`—; 1.33 px for the scalar, 2 px for the 1D array and
> 3 px for the 2D (see §4.3). The broken wire, dashed black with a red X in the middle and its reason
> in the tip strip. Wires run at right angles: they leave horizontally, turn at
> their elbows and enter horizontally; a new wire turns 4 px from the input
> ([`05-editor.md`](05-editor.md) §5.4). **Compared with the video**
> `labview-captures/block-diagram/numeric-cablear.mp4` (2026-09-30), not pixel by
> pixel: the video is downscaled and the colors are those of the palette
> captures.
>
> **What is seen when hovering**, from the same video: the unwired terminals
> of a node, and the one under the mouse, come out as a dot in the color of their
> type with a short stub of wire pointing outward; the terminal's name ("x", "y",
> "x+y") comes out in a yellow tip strip below the mouse, and the constant has
> none. The cursor is the automatic tool's: a thin cross on the
> background, the arrow over a node or a wire and the spool over a terminal and
> while wiring. The cursors have been redrawn from the video.
>
> **Terminals view** (Visible Items ▸ Terminals): the node shows its
> connector pane, cropped to its shape, each terminal in the color of its type
> —that of what arrives at it, if wired— and with black borders. In Add, the
> inputs take up a little more than the left half of the triangle and the output, the
> tip.
>
> **Compound Arithmetic** (video `compound-arithmetic.mp4`): in the diagram it
> does not carry its palette icon, but a column of cells —one per input, of
> 6.7 px— and to its right the mode symbol (+, ×, ∧, ∨, ⊕; those of OR and XOR are not
> visible in the capture). Selected, it carries two blue handles, top and bottom:
> stretching them adds or removes inputs, never fewer than two. An inverted input or output
> carries a small circle. In AND, OR and XOR the operation is on integers: the
> DBLs enter with coercion and the output is I64 —the integer of their same bits; NI's
> help does not say which, it remains to be verified in LabVIEW—.
>
> **In the palette**, what is under the mouse is framed in blue and its name comes out
> centered under the subpalette's title (`numeric-nombre-al-pasar.png`).

### 4.3 Array wires

Measured in LabVIEW 2026 Q3 at 1:1 (`labview-captures/array/array-indicador-terminal.png`, `labview-captures/array-2d/wire-2d-dbl.png`,
`wire-2d-vs-1d-diagram.png`, `wire-2d-i32-initarray.png`):
- **Scalar** → 1 px (1.33 in the editor's scale).
- **1D array** → 2 px, a solid line in the type's color.
- **2D array** → 3 px: the type's color, a white line and the type's color again, solid.
- **3 dimensions or more** → drawn like the 2D until they are measured (the editor only makes two).

The color remains that of the base type (array of DBL = orange, of I32 = blue).

### 4.3b Constants and panel arrays with two dimensions

Measured at 1:1 in `labview-captures/array-2d/` (DBL):
- *Constant on the diagram* (`constant-2d-empty.png`, `constant-2d-2x3-values.png`, `constant-2d-stretched-4x9-empty.png`):
  the empty one is 51 × 38 (the 1D one is 51 × 25). The index block is 32 × 38: a 1 px frame, 1 px of white and
  another 1 px frame around two 15 px cells (the first at y + 3, the second at y + 20) separated by a 2 px bar of the type's
  color; each cell is a 5 px spinner, a 2 px bar and a white field of 19 px. The element box is flush against it, at the
  top, with the same three layers; its tiles are 13 px wide (white cell of 9) and 19 px tall (15), with no gap, so it
  is 13 × columns + 6 wide and 19 × rows + 6 tall (4 × 9 shown: 155 × 82 the whole constant). A defined tile is solid in the type's
  color and an undefined one is pale (`#ffcc99`) with a grey "0".
- *Panel array* (`panel-array-2d-control-empty.png`, `panel-array-2d-stretched.png`): the index column is 41 px wide with
  two fields 28 px apart; the box of elements is at the top right as in 1D; the cells repeat every 65 px across and
  26 px down, and the box is 65 × columns + 7 wide and 26 × rows + 5 tall. Undefined cells are drawn greyed. How the 7 and
  the 5 split between the sides, and the pitch of strings and Booleans, are **unverified**.
- *Terminal on the diagram:* the same glyph as in 1D (`terminal-2d-icon.png`, `terminal-2d-noicon.png`).
- *Index Array* with a 2D wired: 32 × 35, inputs at 9.5, 22.5 and 30.5 px from the top; the output drawing is a 2D
  grid, a 1D row or a single square depending on the indices wired. *Initialize Array*: 32 × 27 with one size.
  The drawings are our own.

### 4.4 Wire color by type (quick reference)

- Orange → numeric float/double
- Blue → integer
- Green → boolean
- Pink → string
- Brown → cluster (future)

---

## 5. Wire connection rules

### 5.1 Incompatible types → broken wire

When a wire is connected between terminals of incompatible types:
- The wire **is drawn** (the gesture is not prevented)
- A **red X** is shown at the midpoint of the wire
- The VI cannot run while there are broken wires
- When hovering over the broken wire: tooltip with the reason
  ("Type mismatch: expected DBL, got TF")

*Note: Solder's current behavior prevents drawing the wire. It has to
change to this model where it is drawn but marked as broken.*

### 5.2 One input, a single wire

- An **input** (input terminal) accepts only **one wire**
- An **output** (output terminal) can have **multiple wires**
  (branch / fork)
- Trying to connect a second wire to an input that already has one
  is an error → broken wire or rejection

*Note: Solder's current behavior allows multiple wires to an
input. This has to be fixed.*

### 5.3 Coercion dots (future — late Phase 2 or Phase 3)

When compatible but not identical types are connected (e.g.: Integer to Double):
- The connection works (it is not a broken wire)
- A **red dot** (coercion dot) appears on the terminal where the
  implicit conversion happens
- It indicates possible loss of precision or a performance cost
- It will be implemented when numeric subtypes exist (integer vs float vs double)

> **Implemented in the web editor** (2026-09-29): on the input terminal that
> converts, according to rules 2 and 2f of
> [`03-static-semantics.md`](03-static-semantics.md). It is a **red wedge**
> on the node's edge, not a circle, as seen in the Numeric video.

---

## 6. Functions and controls palette

### 6.1 Opening with right click

- **Right click on the BD** → opens the functions palette
- **Right click on the FP** → opens the controls palette

### 6.2 Hierarchical structure

The palette is a menu with folders organized by category:
- Level 1: Categories (Structures, Numeric, Array, Boolean, String...)
- Level 2: Subcategories or primitives directly
- There can be more levels of depth

> **Superseded by [DT-035](../design/05-decisions.md#dt-035).** The palette
> hierarchy is that of LabVIEW 2026Q3, as declared by the inventory
> ([`../schema/inventario-labview.json`](../schema/inventario-labview.json)); the
> list of categories above does not fix it. What Solder does not have appears
> anyway, greyed out (§9).

### 6.3 Navigation behavior

- Subfolders open when **leaving the mouse over the icon** (hover with delay)
- Each subpalette has a **pin button** to leave it fixed on screen
- Once pinned, the palette stays open as a floating window

*Note: this is a complex behavior. It will be implemented progressively,
starting with a basic palette and adding hover + pin later.*

> **Hover implemented** (2026-09-29, `editor/src/window/editor-window.mjs` and
> `editor/src/window/window-state.mjs`): when the mouse rests a quarter of a second over a
> folder with declared content, its subpalette opens beside it, as a separate window,
> and the folder is framed in blue; a click does the same. Moving over
> another folder of the same palette closes what hung from it; a click outside or
> Esc closes everything. The subpalettes chain in a cascade. The pin is still
> pending.

---

## 7. Pending definition

Visual elements that we know exist in LabVIEW but that we have not yet
specified. They will be documented as needed, and each one will become an
entry of the LabVIEW inventory when its area is broken down (DT-035):

- Broken Run button icon (when there are broken wires or errors)
- Breakpoints and step-by-step execution (highlight execution)
- Error clusters and their visual representation
- Diagram decorations (free labels, comments, flat sequence)
- Selection and highlight colors
- Typography and text sizes *(resolved for the VI windows: §10)*
- Property Nodes and their expandable format
- Specific representations of each primitive (shapes of Add, Sub, Mul, etc.)
- Cluster: brown wire + twisted pattern + field editor
- Typedef: differentiated visual representation

---

## 8. Waveform Chart and Graph

### 8.1 Fundamental difference

| Aspect | Waveform Chart | Waveform Graph |
|--------|----------------|----------------|
| **Data** | Circular buffer (history) | No buffer |
| **Update** | Incremental (point by point) | Batch (replaces everything) |
| **Input** | Accepts scalar OR array | Requires array |
| **Use** | Real-time, loops | Post-analysis |

### 8.2 Visual specification

**Dimensions:**
- Plot area: 200x160 px
- Black background (oscilloscope style)
- Faint grey grid (optional)
- Green signal line (RGB: 0.200.0)

**Waveform Chart:**
- "CHART" label in the top left corner
- Number of points (n=X) in the top right corner
- Configurable buffer (default: 1024 points)
- Automatic scale in Y

**Waveform Graph:**
- "GRAPH" label in the top left corner
- Number of points (n=X) in the top right corner
- Shows the whole array
- Automatic scale in Y

### 8.3 On the Front Panel

**Rendering (Draw dialect):**
```
┌─────────────────────────────────┐
│ CHART                    n=1024 │
│  ┌───────────────────────────┐  │
│  │ ░░░░░░░░░░░░░░░░░░░░░░░░░ │  │  <- grey grid
│  │ ░░░░░░░░░░░░░░░░░░░░░░░░░ │  │
│  │ ░░░░░░░░░░░░░░░░░░░░░░░░░ │  │
│  │ ░░░░▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░ │  │  <- green signal
│  │ ░░░░░░░░░░░░░░░░░░░░░░░░░ │  │
│  └───────────────────────────┘  │
└─────────────────────────────────┘
```

### 8.4 On the Block Diagram

**Blocks:**
- `waveform-chart`: 1 input (number), no outputs
- `waveform-graph`: 1 input (array), no outputs

**Wire colors:**
- Chart input: orange (scalar numeric)
- Graph input: orange with double border (array)

### 8.5 Compilation

The generated code uses `base` faces with Draw:

```red
; Waveform Chart
chart_1: base 200x160 draw []

; En el botón Run (dentro del loop):
append chart_1/draw/values new-value
chart_1/draw: render-waveform chart_1/draw/values
```

---

## 9. Declared placeholders

*(informative)* The editor shows in its place what the *reference* has and
Solder does not do, greyed out and with its explanation ([`05-editor.md`](05-editor.md)
§9, [DT-035](../design/05-decisions.md#dt-035)). That creates a visual problem:
LabVIEW, like any application, already disables elements depending on context
—paste with nothing copied, undo with nothing to undo—. And *Undo* itself
will first be a placeholder and, once it exists, will be greyed out whenever there is
nothing to undo.

> **Rule 57.** A *placeholder* **MUST** be distinguishable at a glance from an element
> disabled by context, both in an entry with text and in a button that
> only has an icon, and in light and dark theme.

If they are confused, whoever uses the editor does not know whether something does not exist or just does not apply
right now, and the two cases call for different things: one, wait or look for another way; the
other, change what is selected.

**Mark implemented** in the editor skeleton (`editor/src/styles.css`):
a placeholder is grey —somewhat darker than a disabled one, so that it reads when
almost everything is a placeholder—, with the label in italics if it is text and with the **top
right corner folded** if it is an icon-only button. The corner is the top one because LabVIEW already uses the bottom right one: there it puts the little triangle of
the buttons that open a menu when held down. The three verdicts do not
need different looks: the explanation says which it is.

*Verification: test "a placeholder is not confused with one disabled by context"
(`test/editor/styles.test.mjs`): the italics and the corner are only applied to
placeholders, and a placeholder's grey is not a disabled one's. **Verified** on the
style side; that it is seen at a glance has been checked by eye, not with a
test.*

---

## 10. The VI windows: measurements and typography

The *Front Panel* and the *Block Diagram* clone the LabVIEW 2026Q3 captures
(`labview-captures/front-panel/vi-nuevo.png` and
`labview-captures/block-diagram/vi-nuevo.png`), taken at 150 % scale.

**Measurements.** They live in `editor/src/window/window-view.mjs`, each with the row or column
of the capture it comes from, in CSS pixels (those of the capture divided by 1.5): heights
of the menu bar (19.3 px, rows 0–28), of the groove (3.3, rows 29–33), of the
toolbar (22, rows 34–66), of its border (2, rows 67–69) and of the status
bar (15.3); step of the buttons (23 px, 36.5 with triangle), widths
of Text Settings (146.7) and of the search (300), 12 px grid from the edge
of the canvas, 16 px gutter. The thin lines —the groove, the bar's border,
the icon separator— are painted row by row from the capture, at 2/3 px each,
in `editor/src/styles.css`.

**Typography.** LabVIEW's is Segoe UI at 12 px. The editor uses the first
one it finds:

| Font | Size | Where |
|------|------|-------|
| Segoe UI | 12 px | Windows: the same as LabVIEW |
| Noto Sans | 11.3 px | Linux |
| The system's `sans-serif` | 11.3 px | If none of the above is available |

The sizes are not aesthetic: they are the ones that match the text widths of the
captures —the eight menus, "15pt Application Font" and "26.0"—. Noto Sans at 11.3 px
ends up within 2 px of LabVIEW in all of them. Segoe UI is not distributed with
Solder: it is used if the system has it. A placeholder goes in italics, which is narrower:
the menu keeps the width of the upright text so as not to shift the
following ones.

**The functions palette** clones `labview-captures/paletas/functions-programming.png`
and its version with the hidden items shown: 212 px wide with a 1 px screen border
and a bevel inside, darker on the title; a 22 px title bar with
the pin, the name and the search, which is a light strip attached to the
separator; 21 px category rows with the text at the **top**, not centered, as
in LabVIEW, and the arrow at its height; the unfolded category, with a 16
px header and a grid of folders —tab, spine and 40 × 36 px box— at a 48 px
step, on a light background; and a 2 px highlight inside the bevel on the sides and at the foot
of the list. It lives in `editor/src/window/window-view.mjs` and `editor/src/styles.css`.

**The subpalettes** clone `labview-captures/paletas/functions-numeric.png`: a
separate window whose corner falls 43.3 px to the right and 20 px below that of
its folder, with a 44 px blue frame around the folder; a 24 px
title bar —2 more than the palette— with the pin and the name 4 px further to the
right; and a grid of 32 px boxes at a 48 px step, on a light background. The
folders sit 2.7 px above the center of their cell. How many columns each
subpalette has and which cells it skips —in Numeric, Expression Node sits alone in the
last column— is layout and lives in `REJILLAS`, in `window-view.mjs`; the size
of the window comes from there. The palette and the subpalettes carry LabVIEW's window
shadow, 7 px to the right and down. The function glyphs are
our own (DT-035 §1), drawn on a 48 × 48 grid that is that of the capture's
pixels.

*Verification:* the tests "the Numeric subpalette measures what it does in LabVIEW" (its
cells, its size and where it opens) and "the bar falls where it does in LabVIEW" (the center of each
element of the bar, within 2 px at most of LabVIEW's) and "the header measures what
it does in LabVIEW", in `test/editor/window-view.test.mjs`. The header, the status bar
and the palette have no pixel test: they have been compared pixel by pixel and fall within 1
px of LabVIEW —the folders, the rows, the foot and the palette's borders, on the
same pixel—. The comparisons are made by starting the editor on a virtual screen at 150 % scale
(Electron with `--force-device-scale-factor=1.5`) and
overlaying it on the captures; that is not a test.

## 11. SubVIs: connector pane, icon and node (DT-045)

From `labview-captures/subvi/` (1:1, window pixels). The connector pane is 32 × 32 px, top right, left of the
icon (x 1355..1386, y 71..102 in the capture), grid every 8 px, 1 px black lines (`connector-assigned-zoom8x.png`):
an input cell is filled with its type colour; an output cell is black with a 4 × 4 square of the colour. The
icon is 32 × 32 with a 1 px black border; the default icon is ours, with the untitled-VI number at the bottom right
when known (opened files show none). The subVI node is that icon, wires touching its border
(`caller-x-unwired-diagram.png`); on hover each terminal shows a dot and a 4.5 px whisker in its type colour.
Menus: `connector-menu.png`, `icon-menu.png`, `subvi-node-menu.png`. VI Properties: dialog 640 × 380, positions
in `editor/src/window/vi-properties.mjs` (`vi-properties-execution-default.png`). Type colours are the wire colours,
`#ff7f00` for DBL, the same as measured in the connector cells.

Patterns submenu (`connector-menu-patterns.png` at 1:1, `connector-patterns-grid-zoom2x.png`): it opens at the
right of the Patterns row, 302 × 301 px including a 1 px `#a0a0a0` border, background `#f8f8f8`, with a shadow.
36 thumbnails in 6 columns × 6 rows, 32 × 32 px each, every 48 px, the first 9 px from the border on the left
and the top; no labels. A thumbnail is a white box with 1 px black lines (outer frame at 0 and 31), one rectangle
per cell. The pattern in use (row 6, column 3, 4-2-2-4) is outlined in blue `#0078d4`, 3 px, centred on the frame,
so it sticks out 1 px (ours reuses the
`#0078d7` frame of the other icon grids: 3 units of colour apart, unverified to matter). The cells were read from the
pixels of the capture. In LabVIEW all 36 are available; ours draws the 35 it cannot do greyed (45 % opacity) and
explains them on hover (DT-035). Tested in `test/editor/connector-patterns.test.mjs`.

## 12. Create ▸, paste and the Edit menu (2026-10-08)

From `labview-captures/create-paste/` (1:1). On the diagram: a constant made on an input is 13 × 19 (DBL, orange, "0"),
16 × 14 Boolean (green, "F"), 15 × 19 empty string (pink), error cluster 22 × 58, and its right edge is 16 px (8 for some
nodes, see spec/05 rule 72) from the node's left edge, centred on the terminal; a control or indicator terminal in icon
view is 38 × 38, 16 px from the node, with its label on the left (control) or right (indicator). Where an object is
pushed up its boxes touch, and its wire runs horizontally to 5 px inside the node's left edge and then vertically
(`create-two-constants-on-add-collision-avoidance.png`). All Controls and Indicators stacks about 2 px apart
(`create-all-controls-and-indicators-result.png`). On the panel: controls in a grid at the top left, 66 px across and
42 down; indicators from the panel's horizontal centre, 54 px apart for 55 px wide boxes
(`panel-placement-of-created-controls-and-indicators.png`). The right-click Create ▸ submenu is the width of its longest
row with a line before All Controls and Indicators; Scalar ▸ sits between Indicator and Channel Writer...
(`array-size-input-create-scalar-submenu.png`). The Edit menu (`edit-menu-diagram-nothing-selected.png`,
`edit-menu-diagram-with-selection.png`, `edit-menu-panel-with-control-selected.png`): rows as in spec/05 rule 75, the
shortcuts in a second column, greyed rows in light grey, a line between the eight groups. Solder's own marks: a hole
is in italics, a row greyed by the state of the window is not. Pasted objects are drawn selected. Tested in
`test/editor/terminal-creation.test.mjs` and `test/editor/edit-menu.test.mjs`.

## 13. Format Into String and Scan From String (2026-10-08)

From `labview-captures/format-scan/` (1:1; the nodes are small, so the captures are zoomed 8x). 32 × 29 px (Format, one row)
and 32 × 37 px (Scan, one row); each extra row adds 8 px; border 1 px `#4C4C3D`, fill `#FFFFCC`. The icon is on the
top: a checkerboard, a `%` and an arrow (the percent sign between the format and the string); the glyphs are our own
vectors. The box of a row is 16 × 9 px with a black rule on the side that faces the inside of the node, the name of the
type in the type's colour on it (`03z.png` for Format, on the left; `31z-scan-placed.png` for Scan, on the right). In
Scan, each row also has a small target mark on the left (the default). Tested in `test/editor/format-nodes.test.mjs`.

---

## History

| Date       | Change |
|------------|--------|
| 2026-10-08 | §13: Format Into String and Scan From String, from `labview-captures/format-scan/`. |
| 2026-10-08 | §12: Create ▸, paste and the Edit menu, from `labview-captures/create-paste/`. |
| 2026-09-30 | §4: the diagram's orange, measured in the videos (`#fb7c00`). Compound Arithmetic: input cells, handles to stretch it, Invert's small circle, modes. |
| 2026-09-30 | §4 and §5.3: routes, terminal hints, cursors, terminals view and the coercion wedge, from the Numeric video. |
| 2026-09-29 | §4 and §5.3: wire colors by type and coercion dot, implemented in the editor (DT-038). |
| 2026-09-29 | §6.3: the hover that opens the subpalettes, implemented. §10: the subpalettes, cloned from Numeric's, and the palettes' shadow. |
| 2026-09-29 | §9 and §10: the editor moves to the web (DT-037); measurements in CSS px, the header and the palette recalibrated pixel by pixel. |
| 2026-09-29 | §6.2 superseded by DT-035. Added §9: declared placeholders (rule 57), with the mark already implemented. §1.1 marked: the reference does have zoom. Added §10: measurements and typography of the VI windows. §1.1: the "no zoom" is kept as a difference from LabVIEW |
| 2026-04-03 | Added section 8: Waveform Chart and Graph |
| 2026-03-22 | Initial creation — planning meeting |

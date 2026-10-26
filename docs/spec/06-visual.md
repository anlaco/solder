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
| Numeric (DBL) | Orange `#FF7F00` | Thin (1px) | Solid |
| Boolean  | Green `#007F00` | Thin (1px) | Dotted, 1 px on / 1 px off |
| String   | Pink `#FF00FF` | 2 px | Dotted, 3 px on / 1 px off |
| Integer  | Blue `#0000FF` | Thin (1px) | Solid |
| VISA resource name | Purple `#7F007F` | 2 px | Squiggle: each row 3 px on / 1 px off, the lower row 2 px ahead (§17) |
| Path | Teal `#007F7F` | 2 px (an array of paths, 3 px) | Each row 3 px on / 1 px off; the second row of a scalar shifted 1 px; an array's rows `#.###.`, `###.###`, `#.###.` (§19) |

> **Boolean and string, measured at 1:1** (2026-10-15, `labview-captures/reports/2026-10-15-unbundle-by-name.md` Q1 and Q7,
> `cluster/w4.png`, `w12.png`, `w28.png`): the wires, and the names of an Unbundle By Name, are `#007F00` and `#FF00FF`; no
> `#008000` or `#FF33CC` pixel appears in those captures. `COLORES` in `core/model/types.mjs` uses them since that day (before,
> `#008000` and `#FF33CC`, never measured), so every Boolean and string wire, terminal, constant border and type label follows;
> the head of a broken String wire (§15), measured `#FF00FF`, is no longer an exception. Test: `test/core/types.test.mjs`. The
> patterns (finding #37 of `docs/design/real-programs-0.2.md`) are measured but **not drawn yet**: Solder draws both solid, 1.33 px.

*Arrays, clusters and composite types will be defined when implemented in Phase 2.*

> **Implemented in the web editor** (2026-09-29, `core/model/types.mjs`,
> [DT-038](../design/05-decisions.md#dt-038)): orange `#ff7f00` for DBL and
> SGL, blue `#0000ff` for integers and enums —measured on the border of the
> constants and on the wires (first read as `#fb7c00` from the videos; corrected on 2026-10-08 with 1:1 captures of the wires and the connector pane); the palette icons
> use another orange, `#ff6633`—; 1.33 px for the scalar, 2 px for the 1D array and
> 3 px for the 2D (see §4.3). The broken wire, dashed black with a red X in the middle and its reason
> in the tip strip. Wires run at right angles: they leave horizontally, turn at
> their elbows and enter horizontally; a new wire turns 7 px after its source
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

*Note: Solder's wire is drawn and marked as broken (§15); the type mismatch is drawn with the same marks as a loose end.*

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
>
> **At the edges** (measured 2026-10-15, `labview-captures/reports/2026-10-15-palette-edges.md`): no tooltip
> appears on a palette icon; in a subpalette the hovered icon's name is written under the title, and the main
> palette's grid shows none. The palette opens with its top 2 px above the click; if it would end lower than 15 px
> above the bottom it is pushed up, and if that push is more than about 78 px it flips above the click and ends
> 41 px below it (the threshold lies between 71 and 86 px, unverified). Near the right edge it ends 2 px left of the
> click. A subpalette that would end too low is pushed up to the same limit, and one that would leave the room on the
> right opens left of its folder. LabVIEW draws them over the desktop; Solder's palettes live in the VI window's
> page, so the window is their screen (`placePalette`, `placeSubpalette` in `editor/src/window/window-view.mjs`,
> tests in `test/editor/window-view.test.mjs`).

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

## 8. Waveform Chart, Waveform Graph and XY Graph (2026-10-09)

Measured in LabVIEW 2026 Q3, pixel by pixel at 1:1, on `labview-captures/graphs/` (`REPORT.md`; the numbers of the
captures are cited). What was not measured says "unverified". The drawing is ours: rectangles, lines and text, not NI's
bitmaps (DT-035 §8). Implemented in `editor/src/front-panel/graph-view.mjs` and `graph-state.mjs`, and tested in
`test/editor/graphs.test.mjs`. This section replaces the first sketch of §8, written before the captures.

### 8.1 What each one does

| | Waveform Chart | Waveform Graph | XY Graph |
|---|---|---|---|
| **Data** | A history: each write adds points (1024 by default, Chart History Length...) | What it last received, nothing is kept | What it last received |
| **Takes** | A number, a 1D array (all its points at once), a 2D array (a plot per row) or a cluster of numbers (a plot per field); a cluster of arrays breaks the wire (73) | A 1D array against its index, a 2D array (a plot per row) or a cluster of x0, dx and a 1D array (87) | A cluster of an X array and a Y array (85) or an array of them |
| **X axis** | The Strip window: the point index, 0..100 until 100 points are in, then the last 100 (70) | Autoscale (80, 87) | Autoscale (85) |
| **Y axis** | Autoscale | Autoscale | Autoscale |
| **Panel type** (context help, 61) | double | 1D array of double | 1D array of cluster of 2 elements (X, Y double) |

### 8.2 Frame, plot area and legend (`03-three-fresh-panel.png`)

- **Frame** `#bfbfbf`: 328 × 218 (chart, graph) and 342 × 300 (XY). A bevel 13 px wide on the left (`#bbbbbb` to `#d3d3d3`
  and back to `#c5c5c5`), a dark bar 13 px wide on the right (`#bababa` to `#404040`), two light rows on top (`#d0d0d0`,
  `#d2d2d2`) and two dark ones at the bottom (`#a5a5a5`, `#858585`). The 1 px `#d8d8d8` the report sees on the right is a
  line of the panel's grid (every 12 px), not an outline.
- **Plot area** black, 232 × 166 (chart, graph; 72 px from the left of the frame and 10 from the top) and 248 × 248 (XY; 70 and 10),
  with a 1 px `#595959` border on the left and the top and `#d9d9d9` on the right and the bottom.
- **Legend** 100 × 22 (the report says 101: the 101st pixel of the capture is a grid line), right-aligned to the frame
  and 3 px above it, with the same bevel and bar as the frame, the text "Plot 0" and a swatch of 28 × 18 (black, `#595959`
  and `#d9d9d9` borders, the plot's colour as a zigzag). Autosize Plot Legend is checked; the legend of several plots is unverified (it always shows Plot 0).
- **Label** above the top left of the frame, 3 px over it. The three captured labels start 8 to 10 px in; Solder puts it 8 px in (unverified).
- **Font**: LabVIEW uses "15pt Application Font" (Segoe UI); the editor uses the font of its labels (`--fuente`, Segoe UI or Noto Sans),
  for the tick labels, the axis names and the legend. Black, no antialiasing control (unverified).

### 8.3 Scales and grid

- Names "Time" (X, centred under the plot, baseline 37 px under its last row) and "Amplitude" (Y, rotated, 18 px to the left
  of the widest label); the XY Graph has the same two names.
- Ticks: 5 px long, black, 7 px before the plot on Y and 3 px under it on X, only at the labels. The first and the last value fall on
  the first and the last pixel of the axis. The labels: Y right-aligned 9 px before the plot, X centred under their tick;
  the decimal separator is the system's (comma in the Spanish captures); numbers are in their shortest form ("0,5", "-10").
  The chart's X shows only both ends; the others, every step.
- Defaults (no data): chart X 0..100, Y -10..10 every 5; graph X 0..100 every 20, Y -10..10 every 5; XY 0..10 every 1 on both.
- Grid (graph and XY Graph only, 1 px): graph minor `#003300` and major `#006600`, 8 subdivisions per step on X and 5 on Y;
  XY minor `#4c4c00` and major `#999900`, 5 and 5; none at the ends of an axis. A line falls at
  `round(k · (length − 1) / divisions)` pixels, rounding halves down (it matches every line measured in 03).
- Autoscale (`plot-data.mjs`): the step is the smallest of 1, 2, 5, 10… that keeps the labels 20 px (Y) or 30 px (X) apart; Loose
  Fit moves the ends out to whole steps. These two distances are the only ones that explain all the measured cases
  (Y of the XY Graph every 0,2 at 24,8 px and of the graph every 0,5 because 0,2 would be 16,6 px; X of the graph every 20 at 33 px
  and of the XY Graph every 0,5 because 0,2 would be 24,8 px: 80, 87, 89) and are bounded by them, not measured. LabVIEW's own rule
  is unverified. The XY Graph's Loose Fit is checked in its menu (45), as the graph's; the report's "tight" is the effect of the taller plot.
  With no data the scale keeps its defaults; with every point the same value v ≠ 0 the range is v ± 10 % before Loose
  Fit, so a chart of a constant 5 shows 4.4..5.6 in steps of 0.2, as LabVIEW did in Instrument Protocol (`examples/README.md`;
  the rule is inferred from that one case, unverified for other values; a constant 0 keeps the defaults, unverified). The chart autoscales Y over the points it shows (unverified).

### 8.4 Plots

1 px solid lines, linear interpolation, no point style, no antialiasing, clipped to the plot area; Plot 0 `#ffffff`, Plot 1
`#ff4242`; plots 2 and beyond were not seen (they repeat here). Plot, line and bar styles, colours and the legend's
list of plots are not done (menus of the legend and of the swatch, greyed).

### 8.5 On the Block Diagram

The terminal is an indicator of 38 × 38 (`60-diagram-terminals.png`): the border in three layers as the other indicators (colour 1 +
white 2 + colour 1), inside a small plot (black, with a dark edge on the top and left and a light one on the bottom and right,
and the trace in white) and the tag of the type on the bottom: orange `#ff7f00` with "DBL" on a chart or a graph, and `#993300`
with the cluster's tag on an XY Graph and on a chart or a graph with a cluster wired (74, 86). The compact view (32 × 16, the box of
the other terminals) was not captured. The wire accepted is the one of §8.1; any other breaks, with the reason. Unexplained: the XY Graph's terminal
is magenta in `74-diagram-chart-cluster-two-scalars.png`.

### 8.6 Compilation

The three blocks (`waveform-chart`, `waveform-graph`, `xy-graph`) are panel indicators whose type is the wire's (`docs/schema/blocks.json`).
When the VI runs the runtime writes their value like any indicator; the chart's history lives in the window (`pan.charts`), not in the VI
or in the `.sdg`; a Run does not clear it and a change in the type of its wire does. The run worker sends the chart every write, in order,
and the other indicators only the last one of each pause (`run-worker.mjs`).

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

## 14. Debugging (2026-10-09)

Measured in LabVIEW 2026 Q3 at 1:1 (`labview-captures/debugging/`, `REPORT.md`; the captures are cited). The drawings are ours.
Code: `editor/src/debugging/debug-view.mjs`, `editor/src/common/glyphs.mjs`, `editor/src/styles.css` (the `dep-*`, `dw-*`, `el-*` classes).

- **Toolbar** (`10b`, `74b`, `20b`, `50`): cells of 20 × 21; hover frame 1 px `#0078d4`. Highlight Execution lit has a yellow glass
  (`#f3d545`) and orange rays; Retain Wire Values on has the P filled yellow; Pause stopped has red bars `#dd0000`; Run while running is
  the black arrow with speed lines; the step squares are yellow with a `#96960b` edge when enabled.
- **Dimmed diagram** (§1): 60 % toward white, done as 0.4 opacity over the white canvas; a node, its wires and its structure return to full
  color when something inside runs.
- **Band and tags** (§1, `31`): band 5 px centred on the wire, `#a3a3d6` for numeric (measured), `#a3bca3` for Boolean (measured once);
  other types use the numeric tone (**unverified**); it grows from source to destination (dash offset animation) and repaints go on from
  where it was. Tag: fill `#ccffff`, border 1 px `#333333`, 17 px tall, text width + 8 px, at the source terminal, overlaying everything.
- **Probe label** (`55c`): 21 × 17, `#ffff66`, 1 px black rounded border, number centred; it sits on the longest horizontal run of the wire
  with the value tag at its right.
- **Breakpoints** (`71d`, `73b`, `80b`): node, 3 px `#cc0000` frame outside the node (38 × 38 for a 32 × 32 node); disabled, 2 px red and 1 px white;
  wire, a 19 px disc `#cc0000` with the number in white, a little after the output. Stopped node: inverse video (white `difference` over the
  node) and a 1 px dashed `#4386b9` / `#bfdbf1` marching frame; wires of an inverted white node would turn yellow (unverified here).
- **Debug Window** (`55`, `57`, `58`): 682 × 338, `#f0f0f0`, 1 px `#828790`; title bar 34 px; toolbar buttons 28 px (hover `#e5f1fb` with a `#0078d4` border); list 400 px with rows of 16 px, white
  and `#eeeeee`, the selected `#0078d4` with white text; values in green `#008000` (not fully verified); right pane `#e2e2e2` with the display box
  `#b3b3b3`; splitter 3 px `#787878`. The close question is 262 × 158 (`63`).
- **Error list** (`92`, `97`): 661 × 412; lists of 638 px at x 11; row 16 px; the red cross is ours; buttons 100 × 21, Show Error with a `#0078d4` border;
  the Show Error frame is the marching frame 1 px outside the object (`93`).
- **Unverified / not drawn:** the warning triangle at the far left of the toolbar, the wire of an inverted node in yellow, the Debug Window's
  title color when inactive, its menu popups' exact position, the value colors of non-numeric types.

## 15. Broken wires (2026-10-09, DT-046)

Measured at 1:1 in LabVIEW 2026 Q3 (`labview-captures/broken-wires/REPORT.md` §5; pixel dumps of `19-delete-loop.png`, `42-all-three.png`,
`55-state.png`). The drawing is ours. Code: `editor/src/block-diagram/broken-wire.mjs`; the constants name their capture. Tested in
`test/editor/broken-wires.test.mjs`.

- **Dashes:** black `#000000`, 1 px, **4 px dash / 4 px gap** along the whole path, horizontal and vertical alike, the corners of the solid
  wire. Nothing is drawn at a loose end: the dashes stop (the last one can be shorter).
- **Red cross:** ONE per broken wire, **10 × 10 px**, fill `#CC0000`, 1 px black outline, with 32 red pixels (the drawing gives exactly 32);
  at half the length of the path (measured by eye in three cases: approximate). The dashes run under it.
- **Arrowheads:** two solid triangles **5 px along the wire × 9 px across**, flanking the cross, 2 px of dash on the upstream side
  and none on the downstream one (the side of the 2 px gap is not determined). Colour: the type colour of the terminal at that end,
  black for a loose end. Layouts drawn: source and sink wired (including types that do not match, e.g. pink ▶ and orange ▶) and loose
  sink: both point downstream; loose source: the first one is black and points back to the loose end, the second one is the sink's colour
  and points downstream. A String's head is the pure `#FF00FF` (measured), not the `#FF33CC` of its wire. **Unverified:** the heads of the
  other types beyond I32, DBL and String (the type colour is used), the two-source layout (Solder cannot make that wire), the loose
  sink branch with both heads toward the end, and how the rule goes on a path of several bends. (Since 2026-10-15 the String wire
  itself is `#FF00FF` too, §4.2.)
- **Broken by types:** the same marks, only the heads carry the two types.
- **Not drawn:** the highlight of the wire while hovered (thicker, light-blue edge, `57`) and the marching ants of a clicked broken wire (`21`);
  the selected segment uses the normal selection.

## 16. Right-click menus and drop-down lists (2026-10-15)

Measured at 1:1 in LabVIEW 2026 Q3 (`labview-captures/reports/2026-10-15-unbundle-by-name.md` Q3–Q5, `cluster/w13.png`, `w14.png`,
`w16.png`; `labview-captures/reports/2026-10-15-editor-wide.md` Q2–Q3). Code: `MEDIDAS_MENU`, `placeMenu` and `placeSubmenu` in
`editor/src/block-diagram/diagram-view.mjs`, `.menu-contextual` and `.separador-menu` in `editor/src/styles.css`.

- **Box:** background `#F0F0F0`, 1 px border `#A0A0A0` (was `#979797`, read from a video at 150 %). Separators: a 1 px `#A0A0A0`
  line over a 1 px white one, from 4 px inside the left outer edge to 5 px inside the right one (was 1 px `#BDBDBD`).
- **Insets:** the text starts 22 px from the outer left edge, in menus and lists alike; a check mark 9 px. In a right-click menu 30 px
  are left between the longest text and the last pixel of the right border, with the submenu arrow ending 12 px from it (Unbundle By
  Name's row menu, 218 px wide). A drop-down list (the names of an Unbundle By Name, the items of an enum or ring, the frames of a
  Case) has no arrow column: 25 px after its longest text (83 × 61 for `status`, `code`, `source`; Solder drew 88). Tests:
  `test/editor/unbundle-by-name.test.mjs` (the list), `test/editor/styles.test.mjs` (border and separators).
- **Placement:** a menu opens at the click. One that does not fit below is moved up until its bottom border is 2 px above the edge
  (it does not open upward, and its top does not depend on where the click was); one that does not fit on the right opens to the
  left of the click, its right border 2 px before it. A submenu opens on the right of its menu, overlapping it by 5 px, level with its
  row; on the left, with the same overlap, when it does not fit; moved up when it does not fit below, a grid of icons (Numeric
  Palette ▸) keeping 6 px. Tests: "a menu that does not fit below moves up…" and "an open submenu follows its menu…"
  (`test/editor/diagram-view.test.mjs`).
- **Difference kept:** LabVIEW's menus leave the VI window and stop only at the screen's work area (above the taskbar); Solder's are
  drawn inside the window, which stands for the screen. **Not done** (measured): the menu's top is 2 px above the click; the shadow is
  ~5 px (`#8E8E8E` … `#FCFCFC`), Solder's a CSS blur. **Unverified:** where a drop-down list goes near an edge (Solder pushes it back
  inside the window); the vertical inset of the rows at 1:1 (Solder's text sits about 2 px lower, with another font).

## 17. VISA resource name (2026-10-26, DT-065, DT-066)

Measured at 1:1 in LabVIEW 2026 Q3 (`labview-captures/reports/2026-10-26-visa-resource-name-look.md`, captures
`labview-captures/visa/resource-name-*.png`; the picture is drawn anew, only sizes, colours and order are taken). Code: `aspecto` and
`COLORES.visa` in `core/model/types.mjs`, `squiggleRows`, `MEDIDAS_VISA_CONSTANT` and `visaConstant` in
`editor/src/block-diagram/diagram-view.mjs`, the VISA section of `editor/src/common/glyphs.mjs`, `MEDIDAS_VISA_PANEL` in
`editor/src/front-panel/front-panel.mjs` and `.sd-visa` in `editor/src/panel-styles/`. Tests: `test/editor/visa-resource-name.test.mjs`.

- **Wire (Q2):** `#7F007F`, 2 px, a squiggle of period 4 px: two pixel rows, each 3 px on and 1 px off, the lower one shifted by 2 px
  (`y=392` on at x 866-867, 869-871, 873; `y=393` on at 867-869, 871-873). Measured on an 8 px stretch only; drawn with the same two
  rows as the undefined array's wire. The terminals of the VISA nodes are the same purple.
- **Diagram constant (Q1):** 35 × 20 px empty, `#7F007F` border of 2 px, white inside. From the left: the border and the I/O glyph
  (an "I" over a slash over a "0", 7 × 13 px, `#7F007F`, 1 px inside the border); the text from 14 px (12 px after the border's inner
  edge); a 1 px divider; and a 9 px cell with the dropdown arrow, a down triangle 7, 5, 3 and 1 px wide on four rows. With a text it grows
  **to the right** (Size To Text is on): 191 px with `TCPIP0::10.0.2.2::5125::SOCKET`, text 160 px wide, 5 px of padding before the
  divider. Solder's width is 14 + text + 5 + 12 (empty: 9 for the text, 35 in all), with the text measured by `anchoTexto`.
  **Unverified:** LabVIEW's font and size (Solder's text is wider, 192 px for that name), how the constant grows while it is typed.
- **Panel control and indicator (Q3):** 104 × 26 px, a 4 px sunken bevel round an `#E2E2E2` inside of 18 px (rows, from the outside in:
  left/top `#C9C9C9`/`#D3D3D3`, `#C2C2C2`, `#B7B7B7`/`#ADADAD`, `#B1B1B1`; right/bottom `#EAEAEA`, `#EDEDED`, `#F2F2F2`, `#EEEEEE`).
  Icon cell 9 × 18, `#B3B3B3`, with the black glyph; a 1 px gap; the white field, 17 px tall under a 1 px line (69 px wide on a control,
  86 on an indicator, which has no button); on the control a 17 × 17 raised button: `#E3E3E3` and white on the top and left, `#A0A0A0`
  and `#696969` on the bottom and right, face `#B3B3B3`, a black arrow of 7, 5, 3 and 1 px. The label above is "VISA resource name"
  (its cap height is 9 px, as every label's). Old School draws it in CSS over Plain's markup (`.sd-visa`, DT-058); Plain writes "I/O" in
  the icon cell and Solder dresses the button as a key. **Unverified:** the text's padding and font inside the field.
- **Terminals (Q3):** View As Icon on, 38 × 38, with the frame, the white layers and the type tab of every panel terminal (a control: 2 px
  `#7F007F`, 1 px white, 1 px inner frame; an indicator: 1, 2, 1), a miniature of the control inside (the field with "VISA", a
  `#AAAAAA` button) and "I/O" in the tab; off, 32 × 16 with the arrow cell tinted `#D8B2D8` edged `#A54CA5` (the type's colour with
  white, as the green of the other types) and "I/0" in the box.
- **Dropdown (Q4):** a box of `#F0F0F0` with a `#A0A0A0` border, flush left under the control (§16 describes the box; the panel's has a
  grey shadow). In LabVIEW it lists the VISA resources of the machine, a separator and Refresh; Solder cannot find them yet (DT-065), so
  its box has only the Refresh row, greyed, which says why when it is clicked.
- **Palette (Controls ▸ Modern ▸ I/O):** 3 columns and 13 elements, in the order of `labview-captures/visa/controls-modern-io.png`;
  VISA resource name at (row 3, column 1). Its icon, like the other twelve, is drawn anew.

## 18. The VISA functions (2026-10-26, DT-065, DT-066)

Measured at 1:1 in LabVIEW 2026 Q3 (`labview-captures/reports/2026-10-26-visa-nodes.md` Q1–Q3 and `2026-10-25-visa-palettes.md`;
captures `labview-captures/visa/node-*.png` and `functions-*.png`). The icons are drawn anew from the words of the report; only the sizes,
the colours and the layout are taken. Code: `editor/src/block-diagram/visa-nodes.mjs` (geometry) and the VISA functions section of
`editor/src/common/glyphs.mjs`. Tests: `test/editor/visa-nodes.test.mjs`.

- **Tile (Q1):** 32 × 32 px, the cream of the functions (`#FFFFCC`, 30 × 30 inside) inside a 1 px `#4C4C3D` outline; Solder takes both from
  the theme's node fill and border. The drawing is in the outline's colour only.
- **Terminals (Q2):** 6 × 6 dots filled with the colour of the wire: resource name `#7F007F`, error `#7F7F00`, Boolean `#007F00`, numeric
  `#0000FF`, string `#FF00FF`. Rows 8 px apart; left for inputs, right for outputs, VISA Open's timeout on top; stubs of about 5 px. The
  geometry is in the editor's rule 109.
- **Icons (Q3):** "VISA" in italic capitals at the top left and one bold capital at the bottom left: O, W, R, C. Open, a sheet tilted about
  20° with a dotted outline and a folded corner, lifted by a flap, a dark wedge below like a hinge; Close, the same sheet with a hook
  curling over its top left; Write, a round timer with a cap at the top right, "abc" and an arrow pointing down and right toward a small
  instrument (double frame, display, two dials) at the bottom right; Read, the same with the arrow pointing up and left. Every other
  element of the VISA palettes has the tile with "VISA" and a short word (CLR, STB, TRG…): they are greyed, so only a hint of what they
  do. **Not looked at in Solder yet:** the drawings were written from the description and checked by test (text and size), not by eye.
- **Folders:** each folder of Instrument I/O is a small tile with the word of what it holds (VISA, SER, 488, REG…); not LabVIEW's pictures.

## 19. The path (2026-10-26, DT-067)

Measured in LabVIEW 2026 Q3 (`labview-captures/reports/2026-10-26-path-type.md` §1 and §2, captures `labview-captures/file-io/path/`;
the glyphs are drawn anew, only sizes, colours and order of parts are taken). Code: `aspecto` and `COLORES.path` in `core/model/types.mjs`;
`PATH_WIRE_ROWS`, `MEDIDAS_PATH_CONSTANT`, `MEDIDAS_TERMINAL_PATH` and `pathConstant` in `editor/src/block-diagram/diagram-view.mjs`; the Path
section of `editor/src/common/glyphs.mjs`; `MEDIDAS_PATH_PANEL` in `editor/src/front-panel/front-panel.mjs`; `abbreviatePath` in
`editor/src/common/path-text.mjs`; `.sd-path` and `.sd-browse` in `editor/src/panel-styles/`. Tests: `test/editor/path-objects.test.mjs`.

- **Wire:** teal `#007F7F`. A scalar is 2 px, each pixel row `###.` (3 on, 1 off) and the second row shifted 1 px; an array of paths has
  the same colour and pattern at 3 px, whose rows read `#.###.`, `###.###`, `#.###.`. Two dimensions are not measured and are drawn as any
  array's wire.
- **Terminals:** View As Icon on, 32 × 32 px: a 2 px teal frame on a control (1 px on an indicator, as the other types), a miniature of the
  control, the word "Path" and the two-box glyph in a tab at the bottom, with the arrow of the side the data goes by. Off, about 33 × 16:
  white fill, 2 px frame, the small glyph at the left and, at the data end, a light-teal patch `#B2D8D8` with the arrow `#4C4C3D` (a
  control; an indicator mirrors it). **Unverified:** the exact drawing inside the 32 × 32 icon and the patch's edge colour (`#4CA5A5`, the
  other types' rule); the measured sizes come from scripted drops.
- **Path Constant:** a 2 px teal frame, white fill, the path glyph and the text in black: 21 × 19 with no value; with `C:\a\b.txt`, 65 × 19.
  It grows to the right with its text (Size To Text and Left Justify are on) and does not clip a long value. Typing parses the text with
  String To Path (the host system's rules) when Enter is pressed. Solder's width is 21 + the text measured by `anchoTexto` + 2, so its
  `C:\a\b.txt` is wider than LabVIEW's 65 (LabVIEW's font is not identified). **Empty Path Constant:** 15 × 16, a 2 px teal frame on the
  nodes' pale yellow (`#FFFFCC` in Old School), a glyph of its own. **Not A Path Constant:** 17 × 17, the same fill, a glyph of its own.
- **File Path Control and Indicator (panel):** a 100 × 25 px box: a 4 px bevel, a type cell 8 px wide `#B3B3B3` with the black two-box glyph,
  a 1 px divider `#E2E2E2`, and the text area (`#FAFAFA` on a control, `#D2D2D2` on an indicator) whose black text is left aligned from
  about 15 px. An empty path shows blank; Not A Path shows `<Not A Path>`; a path too long for the area loses its leading components for
  "..." (`...\f`). The control has a browse button outside the box, 2 px to its right: 28 × 17, a grey bevelled key (`#C3C3C3` face)
  with a yellow `#FFFF00` folder; the indicator has none. Typing in the control and pressing Enter stores the text as String To Path reads
  it. The button opens the system's file dialog (Electron's `dialog.showOpenDialog`, one existing file; Browse Options are not offered yet).
  Old School draws it in CSS over Plain's markup (DT-058); Plain writes "Path" in the cell. **Unverified:** the bevel above and below the
  text area (taken from the VISA resource name's), the button's height above the box, the label's default text ("Path") and whether
  LabVIEW keeps as many trailing components as fit when it abbreviates.

## History

| Date       | Change |
|------------|--------|
| 2026-10-26 | §4.2 and §19: the path: wire, terminals, constants, File Path Control and Indicator and the browse button. |
| 2026-10-26 | §18: the VISA functions: tiles, terminals and icons. |
| 2026-10-26 | §4.2 and §17: the VISA resource name: wire, constant, panel control and indicator, terminals, dropdown and palette, from `labview-captures/visa/`. |
| 2026-10-15 | §4.2: Boolean `#007F00` and string `#FF00FF`, measured at 1:1 (were `#008000` and `#FF33CC`); their wire patterns recorded. §16: menus and drop-down lists, border, separators, insets and placement at the edges. |
| 2026-10-09 | §15: broken wires with a loose end (DT-046), from `labview-captures/broken-wires/`. §5.1 updated. |
| 2026-10-09 | §14: debugging (Highlight Execution, probes, breakpoints, Debug Window, Error list), from `labview-captures/debugging/`. |
| 2026-10-09 | §8: Waveform Chart, Waveform Graph and XY Graph, measured in `labview-captures/graphs/` (replaces the first sketch). |
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

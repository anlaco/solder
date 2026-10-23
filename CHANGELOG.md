# Changelog

Solder follows [semantic versioning](https://semver.org) while in development:
`0.MINOR.PATCH-alpha`, and from 0.4.0 on `0.MINOR.PATCH-beta`. A release that adds
features raises MINOR, one that only fixes things raises PATCH. The `-alpha` label
said the file format was not stable yet; `-beta` marks the maintainable version,
whose files keep opening, and stays a `0.x` (DT-048, DT-055). Until 1.0 every
release is tagged on `main` (DT-062); 0.4.1 to 0.4.3 came from `release/0.4`.

## 0.5.0-beta — 2026-10-23

From this version on, until 1.0, every beta comes from the development line:
a release with new features raises MINOR, one with fixes only raises PATCH, and
0.4 is no longer maintained (DT-062). Files saved by 0.4 open unchanged.

### The Front Panel

- The panel is drawn as plain HTML and dressed by a panel style (DT-058): Old
  School keeps LabVIEW 2026 Q3's look pixel by pixel, and the new Solder and
  Solder Night styles give it Solder's own. The installed app shows Solder;
  `SOLDER_PANEL_STYLE=old-school|plain|solder|solder-night` chooses another.
- A VI can have a style of its own: a `.css` with its name next to its `.sdg`,
  shown at once when it is created, edited or deleted.

### Arrays as in LabVIEW

- A new Array or Array Constant is born empty and breaks the VI ("Control
  contains no elements and is undefined") until a control, indicator or
  constant is dropped inside; that element gives the whole array its type and,
  on the panel, makes it a control or an indicator (DT-060).
- The element has its own right-click menu: Representation retypes the whole
  array, and Change to Indicator or Control flips it, keeping its wires.
- The element of a panel array can be selected by its edge and dragged out,
  cut or deleted, as in LabVIEW; the array is left empty with its wires.
- A right-click on a panel array's terminal on the Block Diagram opens its
  menu, as in LabVIEW, and View As Icon draws the terminal compact.

### Fixes

- `npm test` and the command line run on Node 26, which refuses to start with
  `--experimental-wasm-jspi`: the flag is passed only to a Node that still
  needs it (24.19 and older). Checked on Node 24.19, 24.22 and 26.12.
- Everything fixed in 0.4.1, 0.4.2 and 0.4.3, below.

## 0.4.3-beta — 2026-10-23

### Fixes

- On Windows, a VI with two loops that wait in parallel no longer hangs: when
  both waits ended together, one loop stopped after its first iteration and the
  VI never finished
  ([#1](https://github.com/anlaco/solder/issues/1)).
- One-dimensional arrays are drawn as in LabVIEW: the array constant's index
  with its double line, its elements as 13 × 19 tiles and its greyed element;
  the panel array's shell, its index box level with the shell, the smaller
  element of a numeric indicator array and the dark bevel around its elements;
  and the array terminal's index cells and 123 field at LabVIEW's size.

## 0.4.2-beta — 2026-10-18

### Fixes

- The pointer over a numeric or string control on the Front Panel says what a
  press will do, as in LabVIEW: the arrow on its edge and label, the I-beam in
  the value box and the hand over the incrementer; the arrow all over once the
  control is selected.
- A selected numeric or string control moves when dragged from its value box;
  a click there no longer types, and a double click types over the whole value.
  Dragging the label of a selected control moves the control with it.

## 0.4.1-beta — 2026-10-17

### Fixes

- A numeric or string control on the Front Panel can be moved again: a press
  within 4 px of its edge drags it, as in LabVIEW, and a press deeper in the
  value box still types in it. Before, the whole control typed and could not be
  dragged.

## 0.4.0-beta — 2026-10-17

The first beta: the maintainable version (DT-048, DT-055). The `.sdg` format is
frozen as version 1, and every later change to it will come with an automatic
migration, so the files you save now keep opening. The next month brings only
fixes (`0.4.x-beta`).

### Files

- VIs are saved as `.sdg`; a `.qvi` saved by an alpha still opens. A file of a
  newer format version is refused instead of read halfway.

### Programs as in LabVIEW

- The three examples in `examples/` give, value by value, what the same VIs
  give in LabVIEW 2026 Q3, and a test checks them.
- Enums are editable: Edit Items… and Select Item… on the constant, the control
  and the indicator, and a Case on an enum names its frames by item.
- Unbundle By Name reads the elements of a cluster, such as the status of an
  error cluster.
- A control keeps its current value apart from the default the file saves: Make
  Current Values Default and Reinitialize Values to Default set and restore it.
- Numbers show LabVIEW's significant digits.

### The editor

- File ▸ New VI, Close and Close All work as in LabVIEW, and Solder starts on its
  Getting Started window.
- A constant grows to the left while it is typed into; a new wire turns 7 px
  after its source; palettes stay inside the window.
- The explanations of greyed items and the error messages are in English, and
  the explanation over a dialog closes on a click elsewhere in it.

### Themes

- Solder has a look of its own: the Solder theme, with white nodes, graphite
  lines, a dotted canvas and an orange accent. Wires and terminals keep
  LabVIEW's type colors, and every node takes the same space as before.
- The Old School theme keeps the LabVIEW 2026 Q3 look, pixel by pixel. Start
  Solder with `SOLDER_THEME=old-school` to use it (`SOLDER_THEME=solder` for the
  other); there is no option in the interface yet.

### Debugging

- Tunnels, shift registers, a loop's i and N show their values to probes and to
  Highlight Execution; the tag of an array wire shows its element count (#4).
- Single stepping stops where LabVIEW does: before a structure runs, at the end
  of each iteration, after a Case's frame, at the end of each Flat Sequence frame
  and at the end of the diagram, with LabVIEW's tooltips; it no longer stops at
  constants or panel terminals.
- The Error list shows warnings with Show Warnings (constants nothing reads,
  unwired panel terminals), and the List Warnings triangle opens it.

## 0.3.0-alpha — 2026-10-10

The first fixes from writing three real programs with Solder (`examples/`),
each checked against LabVIEW 2026 Q3.

- Two calls of the same non-reentrant subVI that run at the same time no longer
  mix their inputs: each call answers its own (bug #30).
- A Case Structure takes a string selector: frames match the exact string, or
  ignore upper and lower case with Case Insensitive Match (marked `A=a` on the
  frame); `""` is the empty string and `"a".."c"` a range that stops before
  `"c"`. Wiring a string turns the frames into `"True"` and `"False", Default`.
- A Case Structure takes an enum selector: frames are named by the enum's items,
  a Case with a frame for every item needs no Default, and Add Case for Every
  Value adds the missing ones.
- Errors 81 to 85 of Format Into String and Scan From String have a description,
  and their source names the VIs of the call, as in
  `Scan From String (arg 1) in Parse Reply.qvi->Instrument Protocol.qvi`.

## 0.2.1-alpha — 2026-10-09

Fixes found by installing and using 0.2.0-alpha on Windows.

- A wire that leaves a structure and goes back into the same structure is now
  broken with a clear reason; before, it passed the check and the compiler
  produced invalid WebAssembly.
- Solder has its own icon (two wires joined by a bead of solder), on the
  installer, the program, its windows and `.qvi` files.
- On Windows the program is `Solder.exe`, `.qvi` files open in Solder with a
  double click (in the running Solder if there is one), and the shortcut no
  longer describes the app in internal jargon. Uninstalling no longer leaves
  a copy of the installer nor the `.qvi` registration behind.
- File ▸ Exit (Ctrl+Q) asks about each VI with unsaved changes (Save, Don't Save,
  Cancel) and quits, instead of closing the VI and opening a blank one.
- A new VI opens its Front Panel in front and its Block Diagram behind it, as
  LabVIEW does; Ctrl+T tiles them left and right and Ctrl+E goes from one to the
  other.
- Create Constant, Control and Indicator work on the condition terminal of a
  While Loop (Create Control makes a Stop button) and on the count and iteration
  terminals of the loops.
- The two windows of a VI can no longer swap their copies of the diagram when
  both change at the same moment, so Save always writes the latest one.
- A control dropped on the Front Panel exists at once, with its terminal on the
  diagram and the VI marked modified, while its label is still being typed.
  Save, Save As, Exit, Run and switching windows commit a label or value being
  typed first.
- A Run no longer changes the VI: operating a control while it runs (a Stop
  button, for instance) does not mark it modified nor change the values the
  file saves, and a latched Boolean is FALSE again once it has been read.

## 0.2.0-alpha — 2026-10-09

### Broken wires (DT-046)
- Delete on the diagram, and deleting a control or indicator on the panel, leave
  their wires broken with a loose end, as LabVIEW does; Cut still takes them.
- A VI whose subVI lost a connector terminal always opens, with those wires
  broken, instead of failing to open.
- Edit ▸ Remove Broken Wires (Ctrl+B) removes every broken wire, or only the
  selected ones; a loose end can be wired again onto a terminal.
- Broken wires are drawn as in LabVIEW and their reason shows on hover, in the
  wire menu (List Errors) and in the Error List.

## 0.1.0-alpha — 2026-10-09

The first version you can write real programs with: data, decisions, loops,
subVIs, graphs and debugging, cloned from LabVIEW 2026 Q3.

### The language
- Numbers (I8 to U64, SGL, DBL) with LabVIEW's coercion, Booleans, strings,
  arrays of one and two dimensions, clusters and the error cluster.
- Numeric (with Conversion, Data Manipulation and the scientific constants),
  Boolean, Comparison, String, Array and part of Timing.
- Format Into String and Scan From String, checked case by case against LabVIEW.
- While Loop, For Loop with shift registers and auto-indexing, Case Structure,
  Flat and Stacked Sequence.
- SubVIs: one compiled module per hierarchy, non-reentrant by default with its
  state kept between calls and Runs, preallocated clones.
- Everything compiles to WebAssembly and runs by dataflow, parallel branches at
  the same time.

### The editor
- Front Panel and Block Diagram windows, palettes and menus cloned from
  LabVIEW; what is not done yet is greyed out and says why.
- Wiring, undo, Create ▸ Constant/Control/Indicator, copy, cut and paste,
  several VIs open at once, the connector pane, VI Properties ▸ Execution.
- Waveform Chart, Waveform Graph and XY Graph.
- Debugging: Highlight Execution, probes and the Debug Window, breakpoints and
  stepping, the Error List.

### Known gaps
The icon editor, broken wires (next), more than two array dimensions, the
other graphs and chart modes, file and instrument I/O, the Event Structure and
much more. See [`docs/design/labview-plan.md`](docs/design/labview-plan.md).

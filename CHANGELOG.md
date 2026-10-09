# Changelog

Solder follows [semantic versioning](https://semver.org) while in development:
`0.MINOR.PATCH-alpha`. A release that adds features raises MINOR, one that only
fixes things raises PATCH, and the `-alpha` label says the language and its file
format are not stable yet; the maintainable version will carry `-beta` and stay a
`0.x` (DT-048).

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

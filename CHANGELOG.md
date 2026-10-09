# Changelog

Solder follows [semantic versioning](https://semver.org) while in development:
`0.MINOR.PATCH-alpha`. A release that adds features raises MINOR, one that only
fixes things raises PATCH, and the `-alpha` label says the language and its file
format are not stable yet (DT-048).

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

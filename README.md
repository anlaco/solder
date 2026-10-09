# Solder

A free visual programming language that clones **LabVIEW 2026 Q3**: the same
windows, palettes, names and behavior. You place blocks on a canvas, wire them
together, and Run compiles the diagram to **WebAssembly** and executes it by
dataflow, like LabVIEW.

Solder is part of anlaco's family of test tools: with **Solder** you write the
program that talks to the instruments, **Anvil** sequences and tests it, and
**Crucible** simulates the bench so you can test without hardware.

> **Alpha.** Solder is in an early, unstable stage: things change and files saved
> today may need adjusting tomorrow. Version **0.1.0-alpha** — see
> [`CHANGELOG.md`](CHANGELOG.md).

## What works today

- The editor: Front Panel and Block Diagram, the Functions and Controls
  palettes cloned from LabVIEW (what is missing shows greyed out and says why),
  wiring, undo, Create ▸ Constant/Control/Indicator, copy and paste, several
  VIs open at once, saving and opening `.qvi` files.
- Types: 8- to 64-bit integers and floating point, booleans, strings, arrays
  of one and two dimensions, clusters and the error cluster.
- Functions: Numeric, Boolean, Comparison, String (with Format Into String and
  Scan From String), Array, Timing (partly) and error handling.
- Structures: While Loop, For Loop (shift registers and auto-indexing), Case
  Structure and Flat/Stacked Sequence.
- SubVIs, with their connector pane, reentrancy and state kept between calls.
- Graphs: Waveform Chart, Waveform Graph and XY Graph.
- Execution: parallel branches, live indicators, Abort; debugging with
  Highlight Execution, probes, breakpoints and the Error List.

What comes next is in [`docs/design/labview-plan.md`](docs/design/labview-plan.md).

## Usage

Requires Node 24.

```bash
npm install
npm run app     # opens the editor in Electron
npm test        # all tests
```

Without the user interface, from the repository root:

```bash
node --experimental-wasm-jspi cli/solder.mjs run docs/schema/examples/suma-basica.qvi.json
```

`run` executes a VI and prints its indicators, `wat` prints the WebAssembly
module as text and `check` says whether it can run.

## Layout

| Folder | What it is |
|--------|------------|
| `core/model/` | The program model: graph, data types, constants and the `.qvi` file format |
| `core/compiler/` | Diagram to WebAssembly: compiler, wasm encoder, linear memory, expression parser |
| `core/runtime/` | Running a compiled VI by dataflow, and the error codes |
| `cli/` | The command-line entry point (`run`, `wat`, `check`) |
| `editor/` | The Electron application: `electron/` (main process) and `src/` (the page: `window/`, `block-diagram/`, `front-panel/`, `common/`) |
| `test/` | All tests: `core/`, `editor/`, `end-to-end/` and `schema/` |
| `scripts/` | Developer scripts (launching the editor) |
| `docs/` | Specification, schemas, decisions and plan ([index](docs/README.md)) |
| `tools/` | Development helpers (driving LabVIEW in a virtual machine to measure it) |
| `spikes/` | Proofs of concept that back some decision |

The existing code is written in Spanish (identifiers and comments); new code is
written in English.

## License

Copyright (C) 2026 anlaco.

Solder is free software under the [GNU Affero General Public License v3.0](LICENSE)
(`AGPL-3.0-only`). If you run a modified version for others over a network,
you must offer them its source code.

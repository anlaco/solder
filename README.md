# Solder

A free visual programming language that clones **LabVIEW 2026 Q3**: the same
windows, palettes, names and behavior. You place blocks on a canvas, wire them
together, and Run compiles the diagram to **WebAssembly** and executes it by
dataflow, like LabVIEW.

Solder is part of anlaco's family of test tools: with **Solder** you write the
program that talks to the instruments, **Anvil** sequences and tests it, and
**Crucible** simulates the bench so you can test without hardware.

## What works today

- The editor: Front Panel and Block Diagram, the Functions and Controls
  palettes cloned from LabVIEW (what is missing shows greyed out and says why),
  wiring, undo, saving and opening `.qvi` files.
- Types: 8- to 64-bit integers and floating point, booleans, strings,
  one-dimensional arrays, clusters and the error cluster.
- Functions: Numeric, Boolean, Comparison, String, Array, Timing (partly) and
  error handling.
- Structures: While Loop, For Loop (shift registers and auto-indexing), Case
  Structure and Flat/Stacked Sequence.
- Execution: parallel branches, live indicators, Abort.

What comes next is in [`docs/design/labview-plan.md`](docs/design/labview-plan.md).

## Usage

Requires Node 24.

```bash
cd editor
npm install
npm run app     # opens the editor in Electron
npm test        # core and editor tests
```

Without the user interface, from the repository root:

```bash
node --experimental-wasm-jspi nucleo/cli.mjs run docs/schema/examples/suma-basica.qvi.json
```

`run` executes a VI and prints its indicators, `wat` prints the WebAssembly
module as text and `check` says whether it can run.

## Layout

| Folder | What it is |
|--------|------------|
| `nucleo/` | The language core, in JavaScript: graph, types, `.qvi`, compiler to WebAssembly, memory and execution |
| `editor/` | The user interface, a web page in Electron |
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

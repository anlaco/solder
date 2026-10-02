# Telekino — Migration to Rust + WASM

> Status: PROPOSAL — pending approval
> Date: 2026-07-28
> Replaces the Red runtime with Rust; the compilation target changes from Red/View code to a WASM module executed in wasmtime inside a sandbox with explicit capabilities.

## 1. Decisions taken

| Decision | Choice | Discarded alternatives |
|----------|--------|------------------------|
| Editor GUI | **Web (HTML, CSS, JS) in Electron** — [DT-037](../../design/05-decisions.md#dt-037) | egui + eframe (chosen here in July, replaced by DT-037), iced, gpui/winit+wgpu |
| Execution engine | **WASM only from day 1** | prior or permanent graph interpreter |
| Compiler backend | **Typed WASM tree in JavaScript → binary with our own encoder, and WAT text for debugging** — [DT-039](../../design/05-decisions.md#dt-039) | Emit WAT and assemble with the `wat` crate (chosen here in July, replaced by DT-039), own IR → `wasm-encoder`, generate Rust + cargo |
| On-disk format | **`.qvi` with only `qvi-diagram`; WASM in memory** | `.wasm` sidecar, `.tkx` bundle |

### Why egui

> **Replaced by [DT-037](../../design/05-decisions.md#dt-037)**: the editor interface is
> built with web technologies and runs in Electron. The original reasoning is kept
> as a record.

`canvas-render.red` + `panel-render.red` (1566 lines) already recompute the whole scene every frame, emit drawing primitives and resolve hit-testing against rectangles by hand. That is literally egui's model. `egui::Painter` offers `line_segment`, `rect_filled`, `circle_filled`, `text` and `Shape::CubicBezier`: porting the Draw dialect is an equivalence table, not a redesign.

Side effects: `ScrollArea` solves #65 and #68 out of the box, and inline editing with a cursor, which DT-026 prohibited, no longer has an obstacle.

### A nuance on the WAT backend

WAT is emitted, but by **building a typed tree** (`Wat::Call`, `Wat::LocalSet`, `Wat::Block`, `Wat::Loop`) that is serialized to text in the last step. Never string concatenation. The spirit of DT-008 is kept and so is the intended advantage: being able to read the `.wat` when debugging. Switching to `wasm-encoder` later means replacing the serializer, not the compiler.

## 2. The value model — solved by WasmGC

> **Correction to the first draft.** The initial version of this plan proposed a value arena in the host with `i32` handles, because writing a `malloc` by hand in WAT is unworkable. That is no longer needed: **Wasm 3.0 includes WasmGC**, the spec was closed on 2026-07-27 and wasmtime has it as Tier 1, active by default. Aggregates live in the guest.

WASM core only had `i32/i64/f32/f64`. With WasmGC there are native `struct` and `array`, with their collector in the engine.

| Port type | Representation in WASM | Where it lives |
|-----------|------------------------|----------------|
| `'number` | `f64` | guest |
| `'bool` | `i32` (0/1) | guest |
| `'string` | `(ref $str)`, with `(type $str (array (mut i8)))` | guest, GC |
| `'array` | `(ref $arr)`, with `(type $arr (array (mut f64)))` | guest, GC |
| `'cluster` | `(ref $cN)`, a `struct` with one field per field | guest, GC |
| `'waveform` | does not travel through wires; it is an indicator | host |
| `'tcp-connection` | `i32` — handle into a resource table | **host** |

**The dividing line is what matters: pure data goes in the guest, resources are host handles.** A cluster is data; a socket is not. The guest never holds a file descriptor or a socket, only an opaque `i32` that the host validates against the manifest on every call. That boundary *is* the sandbox.

Advantages over the host arena that had been proposed:

- **No `malloc` in WAT.** `array.new_fixed` and `struct.new` solve it in one instruction.
- **No host call per operation.** `array.get` and `struct.get` are instructions, not boundary crossings. An `index-array` inside a While Loop stops costing a round-trip.
- **The wasm validator checks the shape of clusters.** A badly wired `unbundle` is a module validation error, not a runtime failure.
- **The module is almost self-contained**: it only imports panel I/O and hardware, which are imports by definition.

Measured trade-off: reading an aggregate from the host (to paint a `str-indicator` or an `arr-indicator`) is done element by element with wasmtime's `ArrayRef` API. For panel strings and arrays it is irrelevant; for waveforms of thousands of points at a high rate it will have to be measured in R5 and, if it gets in the way, move *only that case* to linear memory, which is read in bulk with `memory.data()`.

The imports interface is described in **WIT** and kept stable, so as not to close the door on running the module in a generic runtime someday.

### 2.1 Verified, not assumed

Everything above has been checked against the real versions, not deduced from the documentation. The spike lives in `spikes/wasm-probe/` and is run with `cargo run`:

| Probe | What it shows | Result |
|-------|---------------|--------|
| T1 | `suma-basica.qvi` as WAT: `f64.add` + import `panel_set` | `ind_4 = 8` |
| T2 | `build-array` / `index-array` / `array-size` with `array.new_fixed`, `array.get`, `array.len` | `elem=20 size=2` |
| T3 | `bundle` / `unbundle` with `struct.new` / `struct.get`, heterogeneous fields | `temp=21.5 ok=1` |
| T4 | `concat` of two `(array i8)` in the guest, read from the host with `ArrayRef` | `"Hola mundo"` |
| T5 | Infinite While Loop aborted with `epoch_interruption` | `Trap::Interrupt` |
| T6 | `tcp_open` validated against the manifest: one destination granted, another denied | `CONCEDIDO` / `DENEGADO` |
| T7 | A module that imports WASI does not even instantiate | `unknown import` |

T7 is the most reassuring: a third party's `.qvi` has no way to touch the system even if it tries.

> **Correction — do not over-interpret T5.** The first version of this document
> claimed that "the Stop button will really work". **False in the case that
> matters.** T5 shows that `epoch_interruption` aborts an infinite loop
> **inside the guest**. It says nothing about a blocked host call: a
> `tcp_read` waiting 60 s for a powered-off instrument runs in the host
> function, where **neither epoch nor fuel preempt**. The UI would freeze just as it does today.
>
> This was already identified in the project: `roadmap-9-10.md:398`, task 4.2
> "Timeout and non-blocking I/O operations", HIGH PRIORITY, never executed.
> **Probe T8 is missing** to answer it before fixing the architecture of
> `tk-runtime`, the WIT interface and the gates.

### 2.2 Pinned versions

| Component | Version | Note |
|-----------|---------|------|
| rustc | 1.97.1 | edition 2024 |
| wasmtime | 47.0.2 | GC, exception-handling, tail-call, memory64 and function-references active by default |
| wat / wasm-encoder / wasmparser | 1.254 / 0.254 | `wasm-tools` family |
| Electron | 40 | the editor interface, `editor/` (DT-037) |

wasmtime publishes a release every month and marks an LTS every 12 (2 years of support). **Policy: pin the current LTS**, do not follow the monthly channel — Telekino does not need new wasm features and does need not to break.

### 2.3 What Wasm 3.0 gives for free and was not planned

- **Exception handling** (`try_table` / `throw` / `exnref`, Tier 1 in wasmtime) gives a native mechanism for DT-029. Level 1 (try/catch per node) and Level 2 (propagated error cluster) no longer need their own scaffolding in the compiler.
- **Typed function references** simplify sub-VI dispatch.
- **Tail calls** and **memory64** are not needed by Telekino. They are left active because they are the default, and are not used.

## 3. Architecture

> **Replaced by [DT-039](../../design/05-decisions.md#dt-039)**: the core (format,
> graph, blocks, compiler, `check`) is a `core/` directory of ES modules
> used by the editor and by the command line in Node; the VI runs in the page's
> WASM engine, in a worker, and wasmtime leaves the project. Rust remains only for
> the hardware host. The original tree is kept as a record.

```
telekino/
├── crates/
│   ├── tk-format/      Lectura/escritura .qvi/.qlib/.qproj (JSON + JSON Schema)
│   ├── tk-model/       Modelo de grafo: nodos, wires, labels, estructuras, FP items
│   ├── tk-blocks/      Registro de bloques (equivalente a block-def) + reglas de emisión
│   ├── tk-compile/     Topo-sort (Kahn) → árbol WAT → bytes wasm vía crate `wat`
│   ├── tk-runtime/     Host: arena de valores, tabla de recursos, puertas, wasmtime Store
│   └── tk-cli/         `telekino run|build|check` sin GUI
└── editor/             La interfaz, en web sobre Electron (DT-037): ventanas, paletas, diálogos
```

What survives intact from the current design: `qvi-diagram` as the source of truth (DT-011), the data model (DT-022/023/024) and Kahn's topo-sort.

> **Correction.** This section added `docs/visual-spec.md` and "the files in
> `examples/` without touching a comma". Both claims are false:
> - **The corpus has to be repaired and converted**, not kept: 6 of the 14
>   `.qvi` are hand-written, the wires are corrupted on load, and the
>   format changes to JSON.
> - **`visual-spec.md` does not distinguish design from GTK patch.** Its 315 lines
>   do not mention GTK even once, and they contain at least one already-obsolete
>   patch (fixed 900x600 windows) presented as a product decision.

### Execution: the host drives the ticks

> **Correction.** This section said that "DT-027 carries over cleanly". There is
> nothing to carry over: **DT-027 is fiction.** `grep -rn "on-time\|/rate"
> src/compiler/` → 0. The compiler emits `until [... do-events/no-wait]`, which is
> the blocking model opposite to the one DT-027 describes. This is not a port, it is
> a new design, and it must be planned as such.

The proposed model: the generated module exports `init()` and `tick()`; the host calls `tick()` from the editor's frame loop. Several While Loops = several tick functions, round-robin in the host.

Two things that cannot be done today:
- wasmtime's **epoch interruption**: an infinite While Loop **in the guest** no longer hangs the application. It does not cover blocking host I/O (§2.1).
- **Fuel metering**: a configurable execution limit per VI.

And one that remains unresolved: **how a blocking I/O operation runs without freezing the frame.** Candidate: `Config::async_support` + wasmtime fibers, with async host imports. Undecided, and it decides the shape of `tk-runtime`.

## 4. The gates

No WASI. wasmtime's `Store` is built without access to files, network or clock. Everything the guest can touch goes through explicit imports that the host validates against a manifest.

The manifest lives in `qvi-diagram`, alongside the rest:

```red
capabilities: [
    tcp:    [allow: ["192.168.1.10:5025"  "localhost:5000"]]
    serial: [allow: ["/dev/ttyUSB0"]]
    file:   [read: ["./datos/"]]
]
```

Rules:
- **Denied by default.** A VI without `capabilities` cannot open anything.
- The host validates on every call, not at load. `tcp_open("otro-host", 22)` with that manifest fails even if the module tries it.
- When running a VI whose manifest asks for something not yet granted, the editor asks the user. Just like a mobile app permission.
- A third party's `.qvi` can be opened and read without risk: the diagram is inert data and the wasm has no gates until someone opens them.

This is a real security improvement over the current state, where the Red generated in a downloaded `.qvi` can do anything when run.

## 5. What changes in the project's rules

These norms of `CLAUDE.md` and `docs/decisiones.md` become obsolete and have to be rewritten before starting:

| Norm | What happens to it |
|------|--------------------|
| Rule 3 / DT-001 "All in Red-Lang" | **Repealed.** Replaced by "core in JavaScript with no runtime dependencies; Rust only for the hardware host" (DT-039); the interface is web, in Electron (DT-037). |
| Rule 1 / DT-026 "Never native faces in the canvas" | **Repealed.** The editor draws everything on the web (DT-037); the event conflict ceases to exist. |
| Rule 11 "Consult the Red-Lang skill" | **Repealed.** |
| DT-005 / DT-009 "The `.qvi` carries executable Red/View code" | **Rewritten.** The `.qvi` is left with only `qvi-diagram`. The FP is rendered by the host. `red mi-vi.qvi` stops working; it becomes `telekino run mi-vi.qvi`. |
| DT-028 "Zero dynamic code, compilable with `red -c`" | **Rewritten** in the same spirit: the generated WAT has no dynamic evaluation and the module is AOT-compilable with Cranelift. |
| DT-008 "Never intermediate strings" | **Kept** via the typed WAT tree. |
| Rule 10 "Run `red-cli tests/run-all.red`" | Becomes `npm test` + golden corpus (§6), for the core and for the interface (DT-039). |
| `docs/GTK_ISSUES.md`, `anlaco/red` fork | **Disappear.** It is one of the big gains of the migration. |

## 6. How "works exactly the same" is guaranteed

**Golden corpus.** The 16 files in `examples/` are the contract. For each one:

1. It is run with the current Telekino in Red and the final values of all the indicators are captured.
2. Those values are frozen as fixtures in the repo.
3. The Rust build fails if a VI produces a different value.

The 558 current tests (verified: **558 pass, 0 fail**) are split as follows: those in `test-model.red`, `test-topo.red` and `test-blocks.red` port almost directly to Rust unit tests; those in `test-compiler.red` become golden-output tests on the generated `.wat`.

> **Warning.** A green suite does not give coverage where it is needed:
> **`tests/test-file-io.red` does not exist** —it was task 3.5 of the roadmap, HIGH
> priority, never written— and that is why the loader defect survived for months with
> no test failing. Porting the 558 tests protects nothing on the load path: the
> missing ones have to be **written**.

**The Red tree is kept intact and working** until parity is reached. It serves as the oracle. Only then is it deleted, in a single commit, with a `v-red-final` tag immediately before.

## 7. Phases

Each phase ends with something demonstrable. A phase is not started without closing the previous one (rule 8 still stands).

| Phase | Scope | Closing criterion |
|-------|-------|-------------------|
| **R0 — Spike** | ~~WAT → `wat` → wasmtime chain~~ ✅ (`spikes/wasm-probe/`, §2.1). Missing: `tk-format` parses `suma-basica.qvi` and `tk-compile` emits that WAT from the graph | `telekino run examples/suma-basica.qvi` prints `8.0` |
| **R1 — Skeleton** | Editor windows (web in Electron, DT-037), BD canvas read-only from a loaded `.qvi`. **Started on 2026-09-29, before closing R0**: the *Front Panel* and *Block Diagram* windows cloned from LabVIEW 2026Q3 (DT-035), still without reading any `.qvi` | The 16 examples are drawn the same as today |
| **R2 — BD editing** | Hit-test, drag, wires, palette, dialogs (`canvas.red` + `canvas-dialogs.red`) | Build `suma-basica` from scratch and save it with exact round-trip |
| **R3 — Front Panel** | FP render, `panel_get`/`panel_set` imports, full Run cycle | Parity with the Phase 1 beta |
| **R4 — Structures** | While/For/Case + shift registers in WAT | `while-loop-suma.qvi` gives 45.0 |
| **R5 — Aggregates** | string, array and cluster as WasmGC types; waveform in the host | Golden corpus at 100% + waveform measurement against `docs/baselines-rendimiento.md` |
| **R6 — Sub-VIs** | Connector pane, `.qlib`, nested contexts | `programa-con-subvi.qvi` and `usa-libreria.qvi` |
| **R7 — Gates** | Manifest, host-side validation, TCP over imports | `tcp-echo-demo.qvi` with permissions granted and denied |

After R7, hardware Phase 4 is resumed (#20 USBTMC, #21 Serial, #22 Modbus, #23 DAQ) on a much better base: each new driver is an import with its gate, not generated code with free access.

### 7.1 Roadmap for the coming days

> **Closed on 2026-09-30.** What follows is in
> [`labview-plan.md`](../../design/labview-plan.md): clone LabVIEW module by module.

*(Agreed on 2026-09-30. Each step is checked off when closed, with the date.)* Up to
here the editor clones LabVIEW —windows, functions palette, Numeric subpalette,
diagram editing (R2 for the most part)—, but a VI cannot be saved, opened
or run. Before cloning any wider, a complete circuit is closed,
so that the interface does not grow without a program behind it.

1. [x] **Save what has been done** in meaningful commits. *(2026-09-30)*
2. [x] **Decide where the core lives** —graph, compiler and `check`— before
   writing the compiler. Proposal: JavaScript, a single implementation for
   editor, compiler and `check` (rule 4 of `spec/03`), and Rust or a native module
   only for the hardware host. It is written as a new DT that corrects
   DT-037 (g) and DT-038 (c). *(2026-09-30: [DT-039](../../design/05-decisions.md#dt-039),
   with the proposal as is.)*
3. [x] **Vertical slice**: constant → Add → numeric indicator. *(2026-09-30)*
   - [x] A numeric indicator on the *Front Panel*, with its terminal in the
     diagram (spec/05 rule 38), from **Controls ▸ Numeric**. *(2026-09-30:
     also the control, with their labels, cloned from the video
     `front-panel/numeric-colocar-etiquetas.mp4`.)*
   - [x] **Save and open** the VI as `.qvi`, with elbows, configuration and types
     (exact round-trip: R2 criterion). *(2026-09-30: `core/model/qvi-format.mjs`, with
     File ▸ Open, Save and Save As and the asterisk for unsaved changes.)*
   - [x] A real **Run**: compile to WebAssembly and see the result in the
     indicator. Run and Save stop being placeholders. *(2026-09-30:
     `core/compiler/compiler.mjs`, `core/compiler/wasm-encoder.mjs` and `core/runtime/runtime.mjs`; in the
     editor, in a worker, with Ctrl+R. It also meets R0:
     `node cli/solder.mjs run docs/schema/examples/suma-basica.qvi.json`
     prints 8.)*
4. [ ] **Clone by acquisition priority**, not in palette order:
   - [ ] Controls ▸ Numeric (controls and indicators). *(The numeric control and
     indicator are done; the other 19 of the subpalette are missing.)*
   - [ ] Structures: While Loop and For Loop.
   - [ ] Comparison and Boolean. *(2026-09-30: Boolean done, the first palette
     captured by Telekino in LabVIEW 2026 Q3 Community, installed in the Windows
     VM.)*
   - [ ] Timing: Wait (ms).
   - [ ] Instrument I/O: serial and VISA.
5. [ ] **Captures**: the largest LabVIEW window, so that menus do not
   come out cut off, and a PNG capture of each key state in addition to the video. Today
   missing: the complete Change Mode of Compound Arithmetic, the entire constant
   menu, the Edit menu and the OR and XOR symbols.

## 8. Risks

| Risk | Mitigation |
|------|-----------|
| The rewrite stalls halfway and two dead trees remain | Phases with a demonstrable deliverable; the Red tree stays usable until R7 |
| Visual parity is hard to verify by eye | Screenshot tests in R1/R2 against references from the current editor |
| Estimate: 7,847 lines of `src/` (not 11.7k — that figure added up `tests/` and `libRedRT-include.red`, which is not ported). Line count is a bad metric: the risk is in the 3,993 lines of editor and in the runtime, which is new code |
| Reading GC aggregates from the host is element by element; waveforms of thousands of points could be slow | Measure in R5 against `docs/baselines-rendimiento.md`; if it fails, linear memory only for waveform, read in bulk with `memory.data()` |
| wasmtime is a large dependency with a monthly release | Pin the current LTS (§2.2), not the monthly channel |
| `qvi-diagram` with `capabilities` breaks old files | The field is optional; its absence = no permissions |

## 9. What still has to be decided first

- **Repo name and location**: a `rust/` tree inside `anlaco/Telekino`, or reorganize the root leaving the Red in `legacy/`?
- ~~Minimum wasmtime version~~ ✅ resolved in §2.2.
- **What happens with the distributable executable**: the self-contained `.tkx` was discarded as a working format, but an answer is still needed to "I want to give this VI to a colleague". Candidate: `telekino build` that embeds diagram + wasm + manifest in a copy of the runner.

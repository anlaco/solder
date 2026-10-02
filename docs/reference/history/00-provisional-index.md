# Migration to Rust — Documentation index

> Status: INDEX PROPOSAL — pending approval
> Date: 2026-07-28 (rev. 2)
> This document is not the plan. It is the list of what must be documented **before**
> writing the first line of Rust, and the criterion for knowing when work can
> start.

## 1. Why this index exists

A first attempt at a plan (`docs/rust-wasm-plan.md`) led straight to writing
code. A few hours later this showed up:

- `src/graph/blocks.red` defines the `add` block with ports `a`, `b` → **`result`**,
  the `control` block with output **`result`** and the `indicator` block with input
  **`value`**.
- `examples/suma-basica.qvi` —the project's canonical example— wires those same
  nodes with `port: 'out` and `port: 'in`.

Pulling the thread revealed something worse, already **verified by running the
current Telekino** (see §7). It is not an isolated case, it is the pattern: **all
the existing documentation describes the design; none of it describes the
observable behavior.** Migrating without capturing that behavior first means
discovering it one piece at a time, halfway through the port, multiplied by 45
blocks, 5 control structures and an entire editor.

## 2. What established practice says

References used to build this index, not invented for the occasion:

| Framework | What it provides | Application here |
|-----------|------------------|------------------|
| [arc42](https://arc42.org/overview) | 12 standard sections of architecture documentation | Grid for the gap analysis (§3) |
| [ADR](https://github.com/joelparkerhenderson/architecture-decision-record) | Decision record with context and consequences | Already exists: `docs/decisiones.md` (DT-001…029) |
| [C4](https://c4model.com) | Diagrams by level: context, container, component | Container and component level in B1 |
| Characterization tests (Feathers) | Capture the real behavior of the legacy system **without assuming it is correct** | Document A5 |
| Language specification (normative vs informative) | Distinguish what *binds* from what *explains*; spec ↔ tests traceability | Documents A2–A4 |

From the legacy-system modernization literature: *undocumented logic is the most
consistent cause of schedule deviations*, and effort should be focused on **the
exceptional cases, not the normal flows**. In Telekino the exceptional cases are
precisely things like `'out` vs `'result`.

## 3. Gap analysis against arc42

| # | arc42 section | Status | Where it is |
|---|---------------|--------|-------------|
| 1 | Introduction and goals | ✅ | `README.md`, `plan.md`, `CLAUDE.md` |
| 2 | Constraints | ✅ | `CLAUDE.md` (absolute rules) |
| 3 | Context and scope | ⚠️ partial | `arquitectura.md` |
| 4 | Solution strategy | ✅ | `arquitectura.md`, `decisiones.md` |
| 5 | Building block view | ✅ but tied to Red | `arquitectura.md` |
| 6 | **Runtime view** | ⚠️ weak | scattered |
| 7 | **Deployment view** | ❌ absent | — |
| 8 | Cross-cutting concepts | ⚠️ scattered | `decisiones.md` |
| 9 | Architecture decisions | ✅ excellent | `decisiones.md` |
| 10 | **Quality** | ⚠️ minimal | `baselines-rendimiento.md` (49 lines) |
| 11 | Risks and debt | ✅ | `retos.md`, `CLAUDE.md` |
| 12 | **Glossary** | ❌ absent | — |

Gaps that arc42 does not cover but a **rewrite** does demand: semantic
specification of the visual language, normative grammar of the `.qvi`, normative
catalog of the 45 blocks, parity contract, and specification of editor
interaction.

## 4. The documents

Two blocks. **Block A is extracted by reading the Red code**: it is archaeology, not
design, and it is the work that is not done today.

Structured like a language specification, not like internal notes,
because the `.qvi` **is** a visual programming language and its specification is
the project's main integration surface (§6).

### Block A — Capture what Telekino does today

| Doc | Content | Source | Size |
|-----|---------|--------|------|
| **A1** Glossary and context | VI, FP, BD, wire, terminal, shift register, tunnel, connector pane, refnum. What is in and out of the migration | `docs/*`, LabVIEW | S |
| **A2** Syntax | Normative grammar of `.qvi`/`.qlib`/`.qproj`. Each field: type, whether required, default value, what happens if missing. Presentation annex marked as **non-normative for the compiler** | `file-io-*.red`, `examples/` | M |
| **A3** Static semantics | Type system, coercions, port resolution (the `'out`/`'result`), dynamic ports (bundle/unbundle/subvi/cluster), well-formedness conditions, cycle detection, connection rules | `blocks.red`, `canvas-render.red`, `canvas.red` | **XL** |
| **A3b** Dynamic semantics | Execution order and its nondeterminism, normative catalog of the 45 blocks, while/for/case, shift registers, tunnels, side effects, errors | `compiler-*.red` | **XL** |
| **A4** Editor interaction | Hit-test, selection, drag, wire creation and deletion, palette, dialogs, BD↔FP synchronization | `canvas*.red`, `panel*.red` | L |
| **A5** Parity contract | What "equal" means. **Repair and normalization of the corpus** (§7), oracle capture, acceptable differences, inventory of bugs that are preserved and of those that are not | `tests/`, `examples/` | M |

### Block B — Design what comes next

| Doc | Content | Seed |
|-----|---------|------|
| **B1** Target architecture | The `tk-graph` kernel (§5), crates, interfaces, C4 container and component, **public surface policy** (§6) | `rust-wasm-plan.md` §3 |
| **B2** WASM execution model | Value representation with WasmGC, import interface in WIT, tick cycle (DT-027), interruption and limits | `rust-wasm-plan.md` §2 |
| **B3** Security model | The gates: capability manifest, validation, grant, threats covered and not covered | `rust-wasm-plan.md` §4 |
| **B4** Migration strategy | Phases, verifiable closing criteria, coexistence of the two trees, point of no return | `rust-wasm-plan.md` §6–7 |
| **B5** Decisions and risks | New DTs for the migration, explicit repeal of DT-001/005/009/026/028, risks and accepted debt | `rust-wasm-plan.md` §5, §8 |

`docs/rust-wasm-plan.md` is dissolved into B1–B5 once they are written.

## 5. The `tk-graph` kernel

A fundamental decision taken after an analysis with evidence from the code (§7): 
Telekino's problem is not that the compiler is mixed with the editor, but that
**compiler and editor have two different implementations of the same semantics
and neither one rules**.

`tk-graph` owns, as the single authority: the block registry; `ports()`
including the dynamic ones; `port_type()`; `can_connect()` — the single home of
the six current implementations of that rule; `topo_order()` returning the cycle
**as data, not as a fatal error**; and `analyze()` as a batch fold over those same
primitives. Pure: no wasm and no interface.

Three clients: the `check` CLI, the compiler and the editor. **We do not design for
a hypothetical fourth client.**

Order: kernel → `check` CLI → compiler → editor. The CLI first because it is the
cheapest client and shows that the boundary is well placed.

> **A warning that goes with this decision:** the rules the kernel must own
> are not written yet. That is why the kernel is written **against A3/A3b/A4,
> never before**. Freezing its API before knowing the rules would fix the wrong
> abstraction, and a bad kernel API is more expensive than duplication.

## 6. Public surface policy

Internal modularity and a public API commitment are different things and only one
of them is free. Surfaces ordered from most valuable and cheapest to least:

1. **The format specification** (A2/A3). Zero marginal cost: it is already in the plan.
2. **The CLI** `telekino build/check/run`. Integrable in CI and in other tools.
3. **The WIT interface of the compiled module.** It allows embedding a VI in
   another application with just wasmtime, without Telekino.
4. **The Rust API of `tk-graph`.** Internal boundary from day 1, **with no promise
   of stability** until the language has settled.

Maintaining a public API is a permanent tax on a one-person project.
The first three surfaces do not carry it.

## 7. Findings verified during planning

### 7.1 The loader corrupts the wires — CONFIRMED BY RUNNING

`file-io-load.red:71-73` resolves `from-port` and `to-port` with the same
`select wire-spec 'port`, which returns the **first** occurrence. Run on
the current Telekino:

```
examples/suma-basica.qvi cargado:
  1/out -> 3/out      (debería ser 3/a)
  2/out -> 3/out      (debería ser 3/b)
  3/out -> 4/out      (debería ser 4/in)
```

> **Correction to the diagnosis.** The damage is greater than "the destination port
> is lost": **the emitting side is also wrong.** `blocks.red:135` defines the output
> of the `control` block as **`result`**, not `out`, and the input of `indicator`
> as `value`, not `in`. The correct repair of the first wire is not
> `to-port: a`, but `from-port: result to-port: a`. The corpus's port names do not
> match the registry **at either end**.

All three wires lose their destination port and the two inputs of `add` collapse.
It affects 5 files that use only that format (`suma-basica`, `suma-subvi`,
`programa-con-subvi`, `usa-libreria`, `tcp-echo-demo`) and 4 that mix it.

**Why it has been invisible for months:** `red examples/X.qvi` runs the section of
pregenerated Red code at the end of the file, not the diagram. The load path is
never tested. And no alarm goes off because the only type check in the system
lives inside a mouse handler (`canvas.red:558`); what comes in through the loader
is never validated.

**Consequence for A5:** the current Telekino **is not usable as an oracle as is**.
The corpus must be repaired and normalized to the `from-port:`/`to-port:` format
before being frozen, rebuilding those 9 files against what the `.qvi` *says*,
not against what the loader *does*. This behavior **is not preserved: it is
corrected**, and that must be stated explicitly.

### 7.2 The semantics lives in the render layer

- `port-in-type` / `port-out-type` —the entire type system— are in
  `canvas-render.red:145-165`, a file described as "pure render".
- The compiler does not use them: it rediscovers the sub-VI ports on its own
  (`canvas-render.red:82` and `compiler-body.red:33`, the same expression duplicated).
- Block-type dispatch sites: **89 in the UI, 22 in the compiler, 0 in
  `blocks.red`** — the registry that should own them.
- "Is this wire legal?" has **six** implementations in `canvas.red`.
- `wire-port-in-used?` —absolute rule no. 6— is **defined twice** in
  `model.red` (240 and 725) with different signatures; the second overrides the first.

### 7.3 Validated with code (no need to repeat)

- **The `.qvi` format is read and rewritten from Rust without loss.** Semantic
  round-trip over the 16 files in `examples/`, 18 tests green.
- **The WAT → wasmtime chain works** with WasmGC types (arrays, structs,
  strings), epoch interruption and capability validation. Seven probes.
- **A `.qvi` can be both a diagram and an executable WAT module**, with the
  diagram in a custom section or in a block comment. Both variants assemble,
  run and satisfy the presentation invariant. **Discarded as a working format**
  (§8) but the custom-section variant is kept for `build`.

That code is in `git stash@{0}^3` (the untracked commit of the stash) of the `feat/rust-wasm` branch and in the session's
scratchpad. It is not production code and does not count as the start of the migration.

## 8. Decisions already taken

| Decision | Choice | Note |
|----------|--------|------|
| Language and runtime | ~~Rust + WASM on wasmtime~~ Core in JavaScript; WASM in the page's engine ([DT-039](../../design/05-decisions.md#dt-039)); Rust only for the hardware | Repeals DT-001 |
| GUI | Web in Electron ([DT-037](../../design/05-decisions.md#dt-037)); previously egui + eframe | Repeals DT-026; resolves #65 and #68 |
| Execution engine | WASM only from day 1 | A single semantics |
| Compiler backend | ~~Typed WAT tree → `wat` crate~~ Typed WASM tree → own binary + WAT text ([DT-039](../../design/05-decisions.md#dt-039)) | Keeps DT-008 |
| **`.qvi` format** | **Diagram only. No stored WAT** | Pure HTML model: a single source of truth, drift impossible |
| **`.qvi` envelope** | **JSON + JSON Schema** | Decided after the audit. `serde_json` versus an archived `serde_yaml` and an archived `serde_yml` with RUSTSEC advisories. **The schema is the grammar document, and it is executable** — the property that §9 of the whitelist demands. Cost: converting 14 files, once |
| **"Executable text"** | **`telekino run foo.qvi`** | Just as a `.py` needs python. We give up `wasmtime foo.qvi` in exchange for eliminating drift |
| **Diagram in the `.wasm`** | **`build` option** | Clean and reproducible by default; `--con-diagrama` embeds the custom section, source-map style |
| Architecture | `tk-graph` kernel + 3 clients | §5 |
| Public surface | Format + CLI + module imports. The core's API, no ([DT-039](../../design/05-decisions.md#dt-039)) | §6 |

These decisions will be formalized as numbered DTs in B5.

## 9. Order and method

```
A1 ─→ A2 ─→ A3 ─→ A3b ─→ A4 ─→ A5 ─┬─→ B1 ─→ B2 ─→ B3 ─→ B4 ─→ B5
                                    │
                     (A5 fija el contrato que B4 debe cumplir)
```

A4 is independent of A2/A3 and can be brought forward if we want to attack the UI first.

Agreed method: **one document per area, reviewing it with you before moving on to
the next.** None is considered good without explicit approval.

## 10. "Ready to start" criterion

No production Rust is written until:

1. A1–A5 and B1–B5 are approved.
2. The corpus is **repaired, normalized and frozen** (§7.1).
3. Every behavior claim in A3/A3b has either a test that backs it,
   or an explicit "unverified" mark.

Exception: technical validation spikes may be written beforehand, because their
purpose is to answer questions that the documents cannot answer on their own.

## 11. Honest estimate

Block A is reading 7,847 lines of Red and writing down what they do. It is not
glamorous and it is most of the value of this effort. A3 and A3b will uncover more
discrepancies like the one in §7.1, and **that is exactly what we are after**: each
one found now is one that does not show up halfway through the port.

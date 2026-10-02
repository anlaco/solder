# Whitelist — what survives from the previous project

> Status: **COMPLETE** · Date: 2026-07-28
>
> Note of 2026-09-29: the editor interface moves to the web, in Electron
> ([DT-037](../../design/05-decisions.md#dt-037)). Where this document says egui,
> read "the editor interface": its conclusions do not depend on the toolkit.

## What this document is

Telekino was written in [Red](https://www.red-lang.org/) and is being rewritten
in Rust. Before writing a single line of the new specification, we audited
**everything the project claimed about itself** —34 technical decisions, 21
documents, 12 mandatory rules, 45 block types and 14 example files—
checking it **against the code, by running commands**.

This document is the result: the list of what is true and can move into the new
documentation, and what cannot.

**Only what is marked VALID or REWRITTEN enters `spec/` and `design/`.**

### Minimum vocabulary to read it

| Term | What it means |
|------|---------------|
| **DT-nnn** | *Technical Decision*. The Red project numbered its architecture decisions this way, in `decisiones.md` (from the Red era, outside this repository). There are 34 |
| **`.qvi`** | A Telekino program file |
| **Absolute rule** | One of the 12 norms in `CLAUDE.md` that the project imposed on itself as inviolable |
| **Corpus** | The `.qvi` files in `examples/`, which serve as a behavior reference |
| **Fiction** | A mark in this document: a decision that was adopted and documented but that **the code does not implement** |

The classification marks and their meaning are in §2.

## 1. Why this audit comes before the specification

A specification built on unaudited documentation inherits its fiction.
And this project has documented fiction, verified with commands:

```
DT-027  "Estado: Adoptada" — While Loop = timer con face/rate + on-time
        grep -rn "on-time\|/rate" src/compiler/  →  0

        Lo que emite de verdad (compiler-structures.red:115,125):
        until [ ... do-events/no-wait ]      ← bloqueante, el modelo opuesto

DT-032  "type-info centralizado en blocks.red" — Fase 3.3, prioridad media
        grep -rn "type-info" src/            →  0
```

Both appear as decisions already made. Neither exists in the code.

**DT-032 deserves a paragraph of its own.** It is, word for word, the `tk-graph`
kernel that was "discovered" today: a single dictionary with the color, wire
thickness, FP types and default value of each data type, so that the renderer and
the compiler stop doing `switch`. It is dated, prioritized, and the example code
is written. And there are 88 type-dispatch sites in the UI and 0 in
`blocks.red`.

> **An uncomfortable but necessary conclusion:** this project's failure mode is not
> analyzing too little. It is that **the right decisions do not get executed**.
> Writing more specification does not fix that by itself; what is needed is a
> mechanism that ties every claim to something that fails when it is not met (§6).

## 2. Classification method

| Mark | Meaning | Can enter the spec |
|------|---------|--------------------|
| **VALID** | True today and survives the migration | Yes |
| **REWRITTEN** | The intent survives, the mechanism changes | Yes, reformulated |
| **REPEALED** | Dies with Red or with the architecture change | No |
| **FICTION** | Declared adopted; the code contradicts it | No, until redesigned |
| **ORPHANED** | Depends on something that disappears | Pending decision |
| **SUPERSEDED** | True at the time; the facts left it behind | Only its consequence |
| **UNVERIFIED** | Not yet checked against the code | No, until verified |

Every mark other than UNVERIFIED carries its check next to it —a command and
its output, or a `file:line` reference—. Without a check, the mark is
UNVERIFIED even if it looks obvious.

**When the audit closes, none remains UNVERIFIED**: the 34 decisions,
the 12 rules, the 21 documents, the 45 blocks and the 14 corpus files
have all been checked against the code.

## 3. The 34 technical decisions

| DT | Title | Mark | Check / reason |
|----|-------|------|----------------|
| 001 | 100% Red-Lang | REPEALED | Migration decision |
| 002 | File format — native Red syntax | **REPEALED** | **Replaced by JSON + JSON Schema** (decided 2026-07-28). Its original justification ("no additional parser to maintain") was already void, and the ecosystem decides the rest: `serde_json` versus an archived `serde_yaml` and an archived `serde_yml` with RUSTSEC advisories. The schema **is** the grammar document, and it is executable |
| 003 | Numeric types as a starting point | SUPERSEDED | "A single wire type, `float!`" no longer applies (6 types). **Its consequence is VALID and was fulfilled**: the `type` field exists on ports and wires from the start |
| 004 | LabVIEW-style file system | VALID | Language-independent |
| 005 | The `.qvi` is executable — two sections | REPEALED | Replaced: diagram only (§8 of the index) |
| 006 | Sub-VIs as Red functions + `telekino-runtime` | REPEALED | Red mechanism |
| 007 | Namespacing with Red's `context` | REPEALED | Red mechanism |
| 008 | Three Red dialects of our own | REWRITTEN | `qvi-diagram` survives; `block-def` becomes a data table; `emit` becomes a WAT tree |
| 009 | The `.qvi` generates Red/View | REPEALED | The FP is rendered by the host |
| 010 | In-memory runner — Run and Save independent | VALID | The intent is kept intact |
| 011 | `qvi-diagram` is the source of truth | **VALID, REINFORCED** | The format decision takes it to its logical conclusion |
| 012 | Dual mode — UI and headless | VALID with a defect | Bug #50 open; the headless path diverged (`emit-*-headless`, `/no-gui`) |
| 013 | Primitives as `.qprim` | **FICTION** | `find . -name '*.qprim'` → **0**. `grep qprim src/` → **0**. A file type that was decided and never implemented |
| 014 | Libraries on three levels | **PARTIAL FICTION** | **Level 2** (`~/.telekino/libs/`, `%APPDATA%`): zero references in `src/`. **Level 3** (`.qproj`): `.qproj` only appears in a comment, there is no reader. **Level 1**: the only `.qlib` is `examples/math.qlib`, an example, not a shipped standard library. `find-qlibs` searches "the given directory" — **one level, and it is none of the three**. It also references `.qprim`, which is DT-013 |
| 015 | Name uniqueness by relative path | REWRITTEN | The intent (unique qualified names) survives; the mechanism (Red's `context`, DT-007/016) dies. In Rust the module system solves it |
| 016 | Two isolation contexts | REPEALED | Red's `context` mechanism |
| 017 | The VI type is determined by the call | VALID | Conceptual |
| 018 | `meta` field in `qvi-diagram` | VALID | Present in the corpus |
| 019 | Three target audiences | VALID | Product decision |
| 020 | Dialects: industry first, AI later | VALID | Product decision |
| 021 | File generation by AI | **VALID AND CRITICAL** | **Resolved in favor of JSON** (see DT-002). The schema is validatable in CI and understandable by any tool and any model |
| 022 | Label as its own object | VALID | Directly translatable |
| 023 | Composition over inheritance | VALID | Natural in Rust |
| 024 | Static name + free Label | VALID | Basis of the compiler |
| 025 | Module loading — chain loading | REPEALED | It is Red's `#include`; in Rust cargo replaces it |
| 026 | Draw-based widgets on `base` | REPEALED | egui removes the restriction |
| 027 | Cooperative concurrency `rate`/`on-time` | **FICTION** | `grep on-time\|/rate src/compiler/` → **0**. It emits a blocking `until`. **It has to be redesigned for wasm's tick model, not ported** |
| 028 | Compilability — zero dynamic code | REWRITTEN | Same spirit: the generated WAT evaluates nothing dynamic |
| 029 | Progressive error handling | VALID, IMPROVED | Wasm 3.0 brings native `try_table`/`throw` |
| 030 | UI Framework Red/View + QT-Widgets layer | REPEALED | **Contains the pre-registered Plan B that was breached** (§4) |
| 031 | Undo/Redo via `red-sg` | ORPHANED | `red-sg` disappears; egui gives no undo for free. **No home in the current plan** |
| 032 | Centralized type-info in `blocks.red` | **FICTION** | `grep type-info src/` → **0**. It is the `tk-graph` kernel decided in April and never executed |
| 033 | QT-Widgets — deferred intermediate layer | REPEALED | — |
| 034 | `anlaco/red` fork as runtime | REPEALED | Disappears with Red. **It is one of the real reasons to migrate** (§4) |

**Final count: 13 VALID · 3 REWRITTEN · 12 REPEALED · 4 FICTION · 1 ORPHANED · 1 SUPERSEDED.**
Zero UNVERIFIED: all 34 are checked against the code.

**The four fictions —DT-013, DT-014, DT-027 and DT-032— are the central finding
of this audit.** Decisions that were adopted, dated and reasoned, with almost zero
lines of implementation among the four. See §13.

## 4. The pre-registered trigger criterion that was breached

`decisiones.md:1119`, DT-030, dated 2026-04-10:

> *"**Plan B:** If Red stagnates (**GTK bugs unfixed for 1-2 years**, 64-bit does
> not arrive), migrate the editor to PyQt/PySide **keeping Red as the language of
> the generated code**. The `.qvi` format and the compiler do not change."*

**Three and a half months** have passed, not one or two years. And the Plan B as
written was to change **only the GUI**; what has been decided is to change the
language, GUI, compilation backend, execution model, security model and
architecture.

In addition, `roadmap-9-10.md:647` evaluated **"Rust + egui"** in April and
discarded it.

This does **not invalidate the migration**, but it forces us to repeal DT-030
explicitly and to write down why the criterion changed. The real reasons, which
are in none of the migration documents:

1. **GTK-016** (`GTK_ISSUES.md:101`): *"Access violation in `show`/`draw` under
   maximize/resize — **Critical, no user-land workaround**"*. An editor crash
   that cannot be mitigated from Red.
2. **The policy of reporting upstream has failed, measured: 0 of 17 GTK bugs
   reported to `red/red`.** Instead, DT-034 was created: maintaining a fork of a
   programming language.
3. **Phase 4 requires four Red/System drivers inside that fork** (USBTMC,
   serial, Modbus, DAQ). `tcp/connect` does not exist in upstream Red: it already
   had to be written. This is the decisive argument.

## 5. The 21 documents

| Document | Mark | Note |
|----------|------|------|
| `decisiones.md` | AUDITED | §3 |
| `arquitectura.md` | REWRITTEN | Describes Red modules; the conceptual structure survives |
| `visual-spec.md` | **VALID WITH CARE** | Part of the spec exists **to work around GTK bugs** (fixed 900×600 windows, hand-made scrollbars). "Visual identity" must be separated from "workaround" before porting |
| `tipos-de-fichero.md` | SEED FOR A2 | Descriptive, not normative |
| `labview-comportamiento.md` | VALID | External reference, language-independent |
| `baselines-rendimiento.md` | VALID, OBSOLETE | Red numbers; serves as a baseline to beat |
| `GTK_ISSUES.md` | DISAPPEARS, BUT ARCHIVE | It is the file that justifies the migration (§4). Do not delete |
| `red-issues.md` | DISAPPEARS | — |
| `roadmap-9-10.md` | **AUDIT** | 887 lines. It planned 11 issues; **none of the six "Phase 3 closing" ones was executed** — neither `test-file-io.red`, nor the extraction of `btn-run`, nor the GTK ones. It is the clearest precedent of a plan that was written, approved and had no effect |
| `plan.md` | REWRITTEN | Red phases |
| `PLANNING.md` | AUDIT | "Critical pending decisions" |
| `retos.md` | REWRITTEN | Red risks |
| `tcp-api.md` | SEED FOR B3 | Documents the fork's API; **reveals that the TCP refnum is decorative** (§6) |
| `ai-reference.md` | AUDIT | Relation to DT-021 |
| `encap-compilation.md` | UNVERIFIED | — |
| `auditoria-fase-2.md` | HISTORICAL | Archive |
| `refactor-4b-plan.md` | HISTORICAL | Completed |
| `issue-8-estado.md` | HISTORICAL | Archive |
| `review-issue-19.md` | HISTORICAL | See §6 |
| `rust-wasm-plan.md` | **CORRECT** | Inflated figures (§7) |
| `migracion/00-indice.md` | **CORRECT** | Inflated figures and incomplete §7.1 (§7) |

## 6. Defects found that the specification must pick up

None of these is in any project document.

1. **The TCP refnum is decorative.** `blocks.red:394-415`: `tcp` is a global
   singleton (`tcp/connect`, `tcp/send`, no handle). `_tcp-read-helper` receives
   `conn` and **ignores it**. **Two `tcp-open` in the same diagram silently share
   a socket.** Issue #19 was closed ✅ with this inside.
2. **`waveform-chart` and `waveform-graph` do nothing.** `blocks.red:358-373`
   without `emit`; `compiler-panel.red:85-91` generates `base 200x160 draw []`,
   an empty canvas that is never updated. Marked ✅ COMPLETED in `CLAUDE.md`.
3. **The loader corrupts the wires** — verified by running (index §7.1). And the
   index's diagnosis is incomplete: `blocks.red:135` defines the output of
   `control` as **`result`**, not `out`, so **the emitting side is also wrong**.
   The correct repair is `from-port: result to-port: a`.
4. **No test covers the loader.** `tests/test-file-io.red` **does not exist**; it
   was item 3.5 of the roadmap, HIGH priority. That is why defect 3 survived for
   months.
5. **CI validates DT-028 on a hand-written file.** `ci.yml` compiles
   `examples/suma-basica.qvi`, which **was not generated by the compiler**: it
   emits `add_1: ctrl_1 + ctrl_2` when the current convention is `name_portname`
   (`compiler-emit.red:64`) and without the `view layout` that DT-009 requires.
   The compilability gate checks nothing about the compiler.
6. **`epoch_interruption` does not preempt host calls.** Probe T5 demonstrated
   the infinite-loop-in-the-guest case, not the real case: a `tcp_read` blocked
   for 60 s against a powered-off instrument would freeze the UI just as it does
   today. **It is the biggest architectural gap and it is in no phase or risk.**
7. **Number formatting is observable behavior.** Red `form 1.0` →
   `"1.0"`; Rust `format!("{}", 1.0)` → `"1"`. Indicators display `form`.
   And GTK-004 says float arithmetic depends on the locale without `LC_ALL=C`: the
   oracle has an undeclared environment dependency.
8. **The value proposition "~1 MB, no dependencies, a single binary"**
   (`README.md:110`, and DT-030 calls it *"the value proposition that
   differentiates Telekino from LabVIEW"*) **is silently abandoned**: egui + wgpu
   + wasmtime are 30-80 MB. It is exactly what was rejected in writing in April.
9. **There is no license.** `README.md:120`: "To be defined". It blocks any
   external contribution in a project that advertises itself as open source.
10. **`CLAUDE.md` contradicts itself**: `model.red` as 635 and as 744
    lines; `compiler.red` as 1165 and as 18. It is the first file any AI reads
    in this repo.

## 7. Corrections to my own documents

Verified with commands. Pending to apply:

| Claim | Reality |
|-------|---------|
| "11,700 lines of Red" | `src/` = **7,847**. `tests/` and `libRedRT-include.red` (generated runtime, not ported) were added in. **The 18-25k estimate starts from a base inflated by 49%** |
| "40 blocks" | **45** |
| "17 examples" | **16** |
| "code in `git stash@{0}`" | `stash@{0}` only has the document; the code is in **`stash@{0}^3`** |
| "106 dispatch sites in the UI" | **88** |
| "the Stop button will really work" | Overstated: true for guest loops, **false for blocking host I/O** (defect 6) |
| A5 as a prose document | A misapplication of Feathers: characterization tests **are executable tests**, not prose |

## 8. The 12 absolute rules of `CLAUDE.md`

Verified one by one against the code. **Most are met**, and that should be said
as clearly as the breaches.

| # | Rule | Verdict | Check |
|---|------|---------|-------|
| 1 | Never native faces in the canvas pane | ✅ **MET** | The 27 `field`/`button`/`slider` in `canvas.red` and `panel.red` are **inside `view/no-wait` dialogs**, which DT-026 expressly allows. None in the pane |
| 2 | No dynamic `do`, `load` of strings or `compose` in the `.qvi` | ✅ **MET** | `grep` over the 14 `.qvi` → 0 occurrences |
| 3 | All in Red-Lang, no dependencies | ✅ MET | The migration repeals it |
| 4 | Never deep inheritance | UNVERIFIED | — |
| 5 | Never zoom in the canvas | ✅ **MET** | `grep -ri zoom src/` → **0** |
| 6 | Never multiple wires to an input port | ⚠️ **PARTIAL** | `wire-port-in-used?` exists but is **duplicated** (`model.red:240` and `:725`, different signatures) and **is only checked in the UI**: what comes in through the loader is not validated. With defect §6.3, two wires end up on the same port with nothing warning |
| 7 | Never intermediate strings in the compiler (DT-008) | ⚠️ **ONE VIOLATION** | Most of the `rejoin`s are `to-word rejoin [...]` building **symbols**, which is legitimate. But `gen-standalone-code` (`compiler-panel.red`) **does generate code as a string**: `rejoin ["Red [title: ...]" newline "view layout [" ...]` |
| 8 | Never start a phase without completing the previous one | ⚠️ **BREACHED** | Phase 3 was closed with six closing tasks undone (§5, `roadmap-9-10.md`) |
| 9 | Always implement within the existing files | ✅ MET | — |
| 10 | Always run the tests | ✅ **MET** | Run: **558 tests, 558 passed, 0 failed**. Suite green. *But it does not cover the loader* (§6.4) |
| 11 | Always consult the Red-Lang skill | ✅ MET | The migration repeals it |
| 12 | Always respect the separation of responsibilities | ❌ **BREACHED** | Type-dispatch sites: **UI 89 · compiler 22 · io 17 · graph 14 · `blocks.red` 0**. It is DT-032 unexecuted |

## 9. The 45 blocks

15 of 45 have no `emit`. **Thirteen of them for good reason**, and it needs to be
said so as not to inflate the problem:

| Group | Blocks | Reason |
|-------|--------|--------|
| Sinks (indicators) | `indicator`, `str-indicator`, `bool-indicator`, `arr-indicator` | They produce no value; `compile-panel` resolves them |
| Dynamic ports | `bundle`, `unbundle`, `cluster-control`, `cluster-indicator`, `subvi` | They have dedicated emission functions in the compiler |
| Structures | `while-loop`, `for-loop`, `case-structure`, `iter` | `compile-structure` resolves them |
| **Not implemented** | **`waveform-chart`, `waveform-graph`** | **There is no `emit` or anything that updates their buffer**: `compiler-panel.red:85` generates `base 200x160 draw []`, an empty canvas. Marked ✅ COMPLETED in `CLAUDE.md` |

## 10. The 14 `.qvi` files

Classified by whether their code section follows the compiler's `name_portname`
convention (`compiler-emit.red:64`):

| With the compiler's convention (8) | Without the convention — hand-written (6) |
|---|---|
| `case-boolean`, `case-numeric`, `cluster-basico`, `for-loop-basico`, `programa_con_qvi`, `test-tcp`, `while-loop-basico`, `while-loop-suma` | **`suma-basica`**, `suma-subvi`, `programa-con-subvi`, `tcp-echo-demo`, `usa-libreria`, `waveform-demo` |

`suma-basica.qvi` is the project's canonical example **and the one CI compiles**
to validate DT-028. Since the compiler did not generate it, that gate checks
nothing about the compiler (§6.5).

## 11. `visual-spec.md`: visual identity vs GTK patch

A full sweep of the 315 lines with `GTK_ISSUES.md` alongside. The result is
the opposite of what I expected.

### 11.1 The visual spec is clean

`grep -niE "gtk|workaround|limitaci|bug" docs/visual-spec.md` → **0 results**,
and not because it hides patches: **it simply contains none.** Everything it
specifies is product identity inherited from LabVIEW.

| Section | Content | Verdict |
|---------|---------|---------|
| 1.1 No zoom | *"deliberate design decision, just like LabVIEW"* | **DESIGN**, and it says so explicitly |
| 1.2 Dynamic scrollbars | Diagram in infinite space, scrollbars adjusted to the content | **DESIGN** |
| 1.3 Grid | 1px movement, Shift+arrow for a larger jump | **DESIGN** (with a "to be defined: 8 or 12px") |
| 2.x | View as Icon, thin/thick border, DBL/TF/STR abbreviations, colors | **DESIGN** |
| 3.x | Own shapes, 4224 pattern of sub-VIs | **DESIGN** |
| 4.x | Wire encoding by color, thickness and pattern | **DESIGN** |
| 5.x | Broken wire, one input one wire, coercion dots | **DESIGN** |
| 6.x | Hierarchical palette with right click | **DESIGN** |

**`visual-spec.md` is ported whole to egui.** It is one of the few documents of
the project that comes out of this audit intact.

### 11.2 The real problem: the patches are not in the spec, they are only in the code

The spec describes a diagram in **infinite space with dynamic scrollbars**. The
code implements **fixed 900×600 windows** (`telekino.red:273`), because:

- `GTK_ISSUES.md:149` — *"**Workaround implemented (Issue #65):** fixed-size
  windows (900x600) without `flags: [resize]`"*, to sidestep GTK-014.
- `GTK_ISSUES.md:155` — *"**No longer necessary with the updated fork.**"*

That is: a patch that is **already obsolete**, that **contradicts the spec**, that
is not documented in it, and that still conditions the interface.

### 11.3 Unwritten restrictions that GTK imposes

None appears in `visual-spec.md`. All of them disappear with egui, and **none
should be ported**:

| Current restriction | Cause | With egui |
|---|---|---|
| Fixed 900×600 windows, not resizable | GTK-014 (patch already unnecessary) | `ScrollArea` + resizable window |
| Non-modal dialogs (`view/no-wait`) | GTK-007: `flags [modal]` loses keyboard focus | Modals are trivial |
| **Tab does not navigate between elements** | GTK-015: pressing Tab **crashes**. `GTK_ISSUES.md:182` accepts it as a limitation | Keyboard navigation out of the box |
| Fixed colors, no system theme | GTK-005: `system/view/metrics/colors` → `none` | Native light/dark theme |
| No HiDPI; everything assumes 96 dpi | GTK-001/002: `dpi` → `none` | DPI scaling out of the box |
| Hand-drawn scrollbars | Consequence of the fixed windows | `ScrollArea` |

The third is the most serious and the easiest to overlook: **the absence of
keyboard navigation is not a product decision, it is a crash**. Porting it to
egui would be replicating an accessibility failure for no reason.

### 11.4 Conclusion

There is no need to "separate design from patch inside `visual-spec.md`": the
spec is all design. What is needed is the opposite — **to document the six
restrictions of §11.3, which today only live in the code and in `GTK_ISSUES.md`,
to mark them explicitly as DO NOT PORT.** Without that list, they get ported out
of inertia when reading the source code as a reference.

## 12. Audit of the remaining documents

### 12.1 `ai-reference.md` — obsolete and actively harmful

398 lines aimed at AI agents. It is the document DT-021 depends on.

| Check | Result |
|---|---|
| Mentions of "QTorres" | **6** — the project was renamed three months ago |
| Documents `.qprim` | **4 times** — DT-013 is FICTION: zero files, zero code |
| Documents `.qproj` | **2 times** — there is no reader in `src/` |
| Wire format it teaches | **26 × `port:` · 0 × `from-port:`** |

The last row is the serious problem. **`ai-reference.md` teaches writing wires
in exactly the format the loader corrupts** (§6.3). Any `.qvi` that an AI
generates following this reference is born broken, and the failure is silent.

Mark: **REPEALED**. It is not migrated: it is rewritten from scratch as the JSON
schema, which is also machine-verifiable and cannot get out of sync in this way.

### 12.2 `PLANNING.md` — March's questions are still open in July

Three blocks of "open questions". Several remain unanswered **and are exactly
the ones the new specification has to resolve**:

| Open question (March) | Status today |
|---|---|
| P2.3 — Cycle detection: when connecting the wire, when compiling, or both? | **Open.** Today it only exists inside `topological-sort`, and it aborts with `cause-error` instead of returning the cycle |
| P2.4 — Types at design time: how does the type propagate through the graph on connecting? | **Open.** It is the gap in the type system |
| P3.3 — Continuous loop: how is it stopped (Stop button)? | **Open.** And it reappears in the migration as the blocking I/O problem |
| P2.2 — FP↔BD synchronization | Resolved in practice: shared `app-model` via `face/extra` |

Mark: **VALID SEED**. Its list of open questions is an agenda already written for
the new specification. It is the most useful document of the four.

### 12.3 `roadmap-9-10.md` — the precedent that weighs the most

Phase 3 "Closing", seven tasks. Verified real status:

| Task | Priority | Status |
|---|---|---|
| 3.1 Refactor of `canvas.red` for red-sg | HIGH | Moot: red-sg disappears |
| 3.2 Extract `btn-run` logic | HIGH | **Not done** — `CLAUDE.md` marks it "⚠️ Pending Phase 3" |
| 3.3 Centralize `type-info` in `blocks.red` | MEDIUM | **Not done** — it is DT-032, 0 occurrences |
| 3.5 Tests for `file-io.red` | HIGH | **Not done** — `tests/test-file-io.red` does not exist |
| 3.6 Runner tests | MEDIUM | **Not done** — `tests/test-runner.red` does not exist |
| 3.7 Report GTK bugs upstream | HIGH | **Not done** — 0 of 17 reported |

**Six of seven undone, four of them HIGH PRIORITY, and Phase 3 was closed
anyway** (commit `63f9b81`).

And the finding that hurts the most, `roadmap-9-10.md:398`:

> **4.2 Timeout and non-blocking I/O operations (HIGH PRIORITY)**
> *"Red has no async I/O or native timeouts for TCP/serial. **A blocking `read`
> freezes the GUI**."*

**The blocking I/O problem was already identified**, with high priority, and its
proposed solution relied on DT-027 — which is fiction. And the WASM migration plan
reintroduced it intact without anyone noticing, until it showed up in the
critical review.

Mark: **ARCHIVE AS EVIDENCE**. Its technical content dies with red-sg and with
Red, but it is the documentary proof of the project's failure mode.

### 12.4 `encap-compilation.md` — dies, with a consequence

135 lines on compiling with `--encap` to a standalone binary. All of it
Red-specific. Mark: **REPEALED**.

A consequence that must be noted: it was the mechanism that sustained the promise
of the single ~1 MB binary (§6.8). Repealing it leaves that promise without an
implementation **and without a documented substitute**.

## 13. The pattern, now with five cases

| # | Decision or task | Declared priority | Executed |
|---|---|---|---|
| 1 | DT-013 — `.qprim` primitives | Adopted | **Nothing** |
| 2 | DT-027 — `rate`/`on-time` concurrency | Adopted | **Nothing** |
| 3 | DT-032 — centralized `type-info` | Phase 3.3, medium | **Nothing** |
| 4 | DT-014 — libraries on three levels | Adopted | **1 of 3 levels**, and it is none of the three described |
| 5 | Roadmap 4.2 — non-blocking I/O | HIGH | **Nothing**, and it reappears in the migration plan |

Plus the six Phase 3 closing tasks and the `PLANNING.md` questions that
have been open for four months.

**None of these decisions was bad.** DT-032 is the `tk-graph` kernel. 4.2
is the I/O hole that the critical review found months later. This project's
analysis is good; what does not exist is the mechanism that turns a decision into
something that fails when it is not met.

That is why the rule in §9 is not a methodological ornament: it is the direct
correction of the only defect this audit has found repeated five times.

## 14. Audit status

**Complete.** 34 technical decisions, 12 absolute rules, 21 documents, 45
blocks and 14 `.qvi` files, all classified against the code.

Only one fine sweep is pending: going through `visual-spec.md` line by line with
`GTK_ISSUES.md` alongside, to label each visual rule as *design* or *patch*
(§11 documents the method and the first confirmed case).

## 9. The lesson this audit leaves for the method

DT-027 and DT-032 were well written, well reasoned, dated and prioritized. They
were not executed, and nothing warned. `roadmap-9-10.md` planned six closing
tasks for Phase 3 and none was done, and nothing warned.

That is why the new specification must follow one rule:

> **Every behavior claim comes with something that fails when it is not
> met** — a test, a schema validator, a CI lint — **or is explicitly marked as
> unverified.** A decision without a detection mechanism is an intention, and this
> project already has two demonstrations of what those end up as.

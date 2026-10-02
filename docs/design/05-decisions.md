# 05 — Decisions

> Status: **DRAFT** — under construction
> Not normative. It records **why** each thing is decided in the Rust project.
> What a decision obliges does not live here: it goes to `spec/` as numbered rules,
> with their verification mechanism, and to `schema/` as data.

## Numbering

New decisions **continue the series** of the Red project: the last one was
DT-034 (`decisiones.md` (from the Red stage, outside this repository)), so the first one in this document is
**DT-035**. A number is never reused: DT-nnn identifies a single decision across
the whole history of the project, with no need to say which stage it belongs to.

## Index

| DT | Decision | Status |
|----|----------|--------|
| [035](#dt-035) | The editor clones LabVIEW's information architecture and declares what it does not do | Accepted · being implemented |
| [036](#dt-036) | The AI assistant is external, and is launched from the button that opens Nigel in LabVIEW | Accepted · not implemented |
| [037](#dt-037) | The editor interface is built with web technologies and runs on Electron | Accepted · implemented in the skeleton |
| [038](#dt-038) | The numeric types are LabVIEW's representations, with their conversion | Accepted · implemented in the editor |
| [039](#dt-039) | The core is written in JavaScript and the VI runs in the page's WASM engine; Rust only for hardware | Accepted · being implemented |
| [040](#dt-040) | How a VI runs while the panel stays alive: dataflow by clumps with JSPI, live indicators, Abort, Latch and Wait | Accepted · being implemented |
| [041](#dt-041) | Structures in the flat model: nodes `inside` their structure, tunnels and shift registers as border nodes, and their compilation onto clumps | Accepted · being implemented |
| [042](#dt-042) | Strings, arrays and clusters as in LabVIEW: a data space of handles in linear memory, no collector, with copies decided at compile time | Accepted · being implemented |
| [043](#dt-043) | The error cluster as in LabVIEW: type, error in/out passing, automatic handling and own texts | Accepted · being implemented |

## The 34 Red decisions

**Pending.** The classification is already done and verified in
[`../whitelist.md`](../reference/history/whitelist.md) §3: 13 in force, 3 rewritten, 12 repealed,
4 fictions, 1 orphan and 1 superseded. What is missing is to write here the repeal of each
one and what replaces it.

---

## DT-035

**The editor clones the information architecture of LabVIEW 2026Q3 and declares in
its place what it does not do.**

- **Status:** Accepted on 2026-09-29. **Implementation started** the same day:
  the skeleton of the *Front Panel* and the *Block Diagram* (`editor/`, in Electron
  since [DT-037](#dt-037)), cloned from the captures and with everything it shows
  taken from the inventory. It is started with `npm run app`.
- **What it obliges:** rules 52–56 of [`spec/05-editor.md`](../spec/05-editor.md)
  §9, rule 57 of [`spec/06-visual.md`](../spec/06-visual.md) §9 and the format
  of [`schema/inventario-labview.schema.json`](../schema/inventario-labview.schema.json).
- **How it was decided:** in a conversation with the developer of the project, who
  proposed bringing over the way of working that Anvil —the TestStand replacement of the
  same family— adopted in its
  [ADR-0043](https://github.com/anlaco/anvil/blob/main/docs/adr/0043-the-editor-is-laid-out-as-teststand-and-declares-what-it-does-not-do.md):
  clone the interface of the reference tool and leave greyed out what is
  not done, so that the interface itself is the guide to what is missing. The
  reference version was fixed and it was agreed to document the decision, the rules and the
  format right away, **without cataloguing LabVIEW yet**.
- **What this text says about LabVIEW is second-hand**: general
  knowledge of the product, not verified against 2026Q3. It stays **[NOT VERIFIED]** until
  captures exist (§8). What it says about this repository carries its citation.
- **Replaces:** the palette hierarchy of
  [`spec/06-visual.md`](../spec/06-visual.md) §6.2.

### Context

**1. The project already clones LabVIEW, but only in what you see.** The guiding
principle of `06-visual.md` is *"the same as LabVIEW in shape, sizes and
behavior; not in styles"*, and from it come the wire colors, the
4224 pattern or the right-click palette. What no document fixes is
**where each thing is**: the menus, the toolbars, the hierarchy of
the palettes. It is the first thing someone arriving from LabVIEW looks for.

**2. The failure the audit found is the false green.** `waveform-chart` and
`waveform-graph` were listed as completed without doing anything
([`../reference/history/whitelist.md`](../reference/history/whitelist.md) §6.2 and §9), and #19 was closed with the TCP
refnum merely decorative (§6.1). In both cases the declared status was not tied
to anything that could fail. The rule in [`README.md`](../README.md) —every claim carries
something that fails when it is broken— was born from that, but it covers the specification, not
the state of the product.

**3. The specification already declares gaps, in prose and in four places.** Rules
36 and 42 of `05-editor.md` carry a *not implemented* notice;
`blocks.json` has a `no-implementados` section; `06-visual.md` §7 lists what is
*pending definition*; `01-glossary.md` §2.3 leaves undo *undecided*.
Four formats, and none visible to whoever uses the editor.

**4. Anvil has already tried it.** Its ADR-0043 clones the TestStand *Sequence Editor*
and declares each gap with a verdict. The inventory —103 entries— is
a data file from which come both the greys and a generated page that
CI compares, and a test keeps it honest. Its most useful lesson: when changing the
reference from TestStand 2019 to 2026Q3, the differences were found in one
afternoon, because the inventory was a list of claims in a single file and not
behavior spread across the code.

**5. LabVIEW is much bigger than TestStand.** Anvil's 103 entries
cover its whole editor; LabVIEW's functions palette alone has thousands of
elements. Cataloguing everything before building anything would repeat the failure mode
the audit describes (`../reference/history/whitelist.md` §13): good analysis that does not get executed.

**6. "Parity" already has an owner.** [`spec/07-parity.md`](../spec/07-parity.md) is
the contract between Solder in Rust and Solder in Red. This is something else, and must
not share a name.

### Decision

#### 1. The information architecture is LabVIEW's; the semantics are not

Menus, toolbars, palettes, windows and context menus, with their
names and their order, are LabVIEW's. What each thing **means** is fixed by the
specification, and where it differs from LabVIEW the difference is documented and
kept. There are already two: belonging to a structure is explicit and does not depend
on geometry ([`05`](../spec/05-editor.md), rule 26), and types are compared
by strict equality, with no implicit conversion
([`03`](../spec/03-static-semantics.md), rule 2).

The **structure** is cloned, not the art: the icons are our own (`06-visual.md`),
the help texts are written in our own words and LabVIEW captures do not
enter the repository (§8).

#### 2. The reference is LabVIEW 2026Q3

Fixed, because without a version *"the same as LabVIEW"* names nothing and changes without
notice. It lives in **a single place**: the `referencia` field of
[`schema/inventario-labview.json`](../schema/inventario-labview.json). Changing it
is a new decision, not an edit.

The glossary records it as a term ([`01`](../spec/01-glossary.md) §9): throughout the
specification, *LabVIEW* means *the reference*.

#### 3. Scope

**Proposal, to be confirmed with the first captures.**

**Inside** — the environment in which a VI is edited and run:

- The two windows of a VI, *Front Panel* and *Block Diagram*, with their menu
  bar and their toolbar, in edit mode and in run mode.
- The controls, functions and tools palettes.
- The context menus of the objects that exist in Solder.
- The help and debugging windows: context help, error list, probes
  and breakpoints.
- The property dialogs of controls, indicators and the VI.
- The start window and the project explorer, which the Red plan already
  foresaw and whose file, `.qproj`, is defined by the glossary (§7).
- The palettes of the instrument I/O and acquisition *drivers* (VISA,
  serial, DAQ), even though in LabVIEW they are installed separately: they are the focus of the project.

**Outside** — the modules and *toolkits* that are installed separately (Real-Time, FPGA,
Vision…), even if the installation in the captures has them. They are not part of the
reference, so they generate no entries. FPGA is also parked
([`ideas/fpga-yosys.md`](../ideas/fpga-yosys.md)). Being outside is a
scope decision, not a gap: entering requires a new decision.

*(The first capture confirms it: the reference installation has at least the
Unit Test Framework toolkit, whose bar appears in the Project Explorer, and two
single-button bars not yet identified. None generates entries.)*

#### 4. A gap is declared in its place, with one of three verdicts

What the reference has is never omitted from Solder's interface: it appears
where LabVIEW puts it, disabled, saying what LabVIEW does there and which of
three situations Solder is in.

| Verdict | Means | Must carry |
|---------|-------|------------|
| `todo` | Solder wants it and does not have it yet | `necesita`: the *unlock* it is waiting for (§6) |
| `elsewhere` | Solder solves it another way | `solder`: how, and where to find it |
| `never` | Left out on purpose | `porque`: the decision **already written** that excludes it, cited |

A fourth state, `built`, marks what exists, so that the inventory is
a census and not just a list of holes. Everything that is not `built` also carries
`labview`: what LabVIEW does there, in our own words.

The four names are Anvil's on purpose: the same vocabulary in both
projects. There are two differences, and both come from the audit:

- **`built` must name its proof** (`prueba`): the test that demonstrates, without an
  interface, that it exists. In Anvil what exists *explains itself*; here what
  "existed" was precisely what did not exist (context, 2).
- **`necesita` cites an unlock by its identifier**, declared only once
  in the inventory, instead of describing it in free text. Several gaps that
  wait for the same unlock are a priority, and the count is only exact if
  they all name it the same way.

#### 5. Variable granularity

An entry may cover a whole subtree of the reference: the *Signal Processing*
subpalette, declared as a single entry, covers everything hanging from
it until something more concrete is declared. Each element is resolved with the
most specific entry that contains it.

Only `todo`, `elsewhere` and `never` may cover a subtree. **`built` is
declared one by one**: a group marked as done would be a false green by
construction.

An area is broken down **when work on it begins**, with the captures in front;
not before.

#### 6. The core unlocks it, never the editor

An entry becomes `built` only when what is behind it is implemented and
**verified without an interface** —`cargo test`, `solder run`, `solder check`— and
names that test. If it is a function or a control of the palettes, its block
also exists in `blocks.json`. Never the other way around: that something is easy to draw does not
unlock it.

In Solder this has a nuance that Anvil does not have: a good part of LabVIEW's
interface is pure editing —align, distribute, clean up the diagram, undo,
search—, with no compiler or runtime behind it. For those, what is behind is
a model operation, tested without an interface, and the editor only triggers it. The rule
is the same.

It is also what corrects the method's own risk: a pace set by the
interface builds what is cheap to draw and postpones the expensive thing that matters. **The order
is still set by the phases and the focus of the project**, acquisition and control; the
grey shows the tail, it does not decide it.

#### 7. The inventory is data, in a single place

[`schema/inventario-labview.json`](../schema/inventario-labview.json), validated
by its schema, next to `blocks.json`. The identifiers follow LabVIEW's
nesting, starting from the window: `window.project-explorer.toolbar.standard.new`
is the *New* button of the *Standard* bar of the *Project Explorer*. The order of
the entries within each area is LabVIEW's, separators included, and it is the one
the editor draws. What LabVIEW shows in an element when it is not its name —the
value of a dropdown, a version number— is also data: the `muestra` field. The editor takes from there the
verdict of each element and does not decide it in its code; from that same file the
page `docs/inventario-labview.md` will be generated, and CI will fail if they do not match.

It is called the **LabVIEW inventory**, never "parity" (context, 6).

#### 8. The captures are the evidence, and they are not published

Each entry may carry `captura`: the 2026Q3 image against which it was
checked. Without it the entry is **[NOT VERIFIED]**, and the generated page says
so. The captures live in `labview-captures/`, at the root of the repository,
**outside git** (`.gitignore`): they are NI's interface, not ours. It is the
same solution as `Capturas_de_TS/` in Anvil.

### Consequences

a. **The interface becomes the guide to what is missing**, and the inventory, the
   migration document for those coming from LabVIEW: what Solder does, what it does not
   and why, generated from the same data the editor draws.

b. **What is missing will make noise, starting with the most serious.** *(Illustrative, [NOT
   VERIFIED] against 2026Q3.)* LabVIEW's run bar —Abort, Pause,
   Highlight Execution, Retain Wire Values, Step Into, Step Over, Step Out—
   will come out almost entirely greyed out, and almost all of it waiting for the same unlock, which today
   **no document specifies**: stopping the *guest* between two nodes and
   resuming it. Abort waits for something that is specified —stopping a VI even if it
   is inside a blocking operation
   ([`04`](../spec/04-dynamic-semantics.md), rules 20 and 20b, verified in the
   T8 probe)—, but not yet implemented.

c. **At first everything will be grey.** There is no editor in Rust; until R1 nothing is
   `built`. That is the honest thing: the alternative, omitting what is missing, is the false green
   by omission.

d. **A `never` is a public commitment**: it appears on the generated page.
   Undoing it requires a new decision, like any other.

e. **The claims about LabVIEW that the specification already makes now get a
   reference** —the first case appeared the same day: LabVIEW has had zoom in the
   diagram since 2023 Q3, and rule 35 says otherwise; it was resolved
   by keeping "no zoom" as a documented difference—, and those that touch the interface will be checked against the
   captures: dropping a wire onto an occupied input replaces it
   ([`05`](../spec/05-editor.md), rule 32), there is no zoom (rule 35 and
   `06-visual.md` §1.1), LabVIEW reassigns a node's scope by geometry
   (rule 26), a control is told apart from an indicator by the thickness of its border
   (`06-visual.md` §2.2). Any that does not hold up in 2026Q3 is corrected or becomes
   a documented difference (§1).

f. **`06-visual.md` §6.2 is replaced**: the palette hierarchy is
   LabVIEW's, not the list of categories it gave as an example.

g. **The gaps that the specification declares in prose** —undo (rule
   42), the waveforms in `blocks.json`, what is pending in `06-visual.md` §7— move to the
   inventory when their area is broken down.

h. **Not decided here:** the order in which each box is built; the exact
   visual mark of a gap (`06-visual.md`, rule 57); the exact form of
   `prueba`, which depends on how the Rust workspace is organized; which
   concrete installation is captured (edition and *drivers*); and whether the generated page
   is published on the project's website.

### Verification

| What | Mechanism | Status |
|------|-----------|--------|
| The inventory has the right shape: each verdict carries its field and only its own, `built` requires `prueba`, a `never` cites a decision | [`inventario-labview.schema.json`](../schema/inventario-labview.schema.json) + [negative cases](../schema/examples/inventario-casos-no-validos.json), in `npm test` (`test/schema/schemas.test.mjs`) | **Verified** |
| Each `necesita` names a declared unlock, and each unlock is awaited by some entry | Inventory test (`test/editor/labview-inventory.test.mjs`) | **Verified** |
| Each `prueba` names a test that exists, and each `bloque`, a block of `blocks.json` | Inventory test | **Verified**. The first `built` entry is the palette's double arrows, with their test |
| The identifiers are unique | Inventory test | **Verified** |
| The editor draws exactly what is declared, and in its order | Screenless drawing test (`test/editor/window-view.test.mjs`, rules 52 and 55 of [`05`](../spec/05-editor.md)) | **Verified** for the *Front Panel* and the *Block Diagram*; the *Project Explorer* is not drawn yet |
| And in the place where LabVIEW puts it | Position test against the captures, to 2 px ([`06-visual.md`](../spec/06-visual.md) §10) | **Verified** for the *Front Panel* and *Block Diagram* bar; the header and the palette, compared pixel by pixel |
| The generated page matches the data | Generator with a check mode in CI | Pending |
| Each entry is checked against 2026Q3 | `captura` field | **In progress**: 127 of 127 with a capture. Broken down: the *Project Explorer*, the *Front Panel*, the *Block Diagram* and the functions palette; the contents of the menus, not yet |

---

## DT-036

**The AI assistant is external, and is launched from the button that opens
Nigel in LabVIEW.**

- **Status:** Accepted on 2026-09-29. **Not implemented**: the button is in the
  two bars, as a gap.
- **How it was decided:** in a conversation with the developer of the project, while
  reviewing the Nigel button in a VI's bar.

### Context

LabVIEW 2026Q3 integrates Nigel, NI's AI assistant: a button in the VI's bar
opens its chat, the global search is resolved by it and, since 2026 Q3, it generates
VIs from a description (NI help, *LabVIEW New Features and
Changes*).

Solder already made the decision that makes integrating one unnecessary: a `.qvi` is JSON
validated by its schema (DT-021), so an external assistant can read it,
generate it and check it without any API of its own.

### Decision

Solder does not ship an assistant of its own. The button that opens Nigel in LabVIEW **launches
an external AI assistant**. Which one and how it is configured remains undecided.

It is a difference in what it does, not in where it is: the button stays in LabVIEW's
place, as DT-035 §1 requires.

### Consequences

a. In the inventory, the button goes from `elsewhere` to `todo`: Solder will
   have it after all. It waits for the `asistente-externo` unlock.

b. The glyph is our own, like all of them (DT-035 §1): Nigel's is NI's brand.

c. The search box does not change: it keeps waiting for `busqueda-en-paletas`.

---

## DT-037

**The editor interface is built with web technologies and runs on Electron.**

- **Status:** Accepted on 2026-09-29. **Implemented in the skeleton**:
  [`editor/`](../../editor/) —the two windows of a VI and the functions
  palette, cloned from LabVIEW 2026Q3 ([DT-035](#dt-035))—, which replaces the
  skeleton that had been started in egui, withdrawn the same day. It is started
  with `npm run app`.
- **How it was decided:** in a conversation with the developer of the project. The
  skeleton had been started in egui, as the provisional plan said; on
  reviewing it, it was remembered that the August study already proposed a web editor, and it was
  settled: the interface, with web technologies and on Electron, without continuing to compare
  toolkits.
- **Replaces:** the row "Editor GUI: egui + eframe" of
  [`00-provisional-plan.md`](../reference/history/00-provisional-plan.md) §1 and the one in
  [`00-provisional-index.md`](../reference/history/00-provisional-index.md) §8.

### Context

**1. Two documents said different things.** The provisional plan (July) chose
egui because the Red rendering already recalculated the scene every frame, which is the
egui model. The later study (August, branch `spike/wasm-migration`,
`estudio-post-red.md`) proposed a core in Rust with the editor on the web, and
tested it with a React Flow spike. The skeleton was started following the first.

**2. DT-035 turns the editor into a clone measured to the pixel.** The header
lines measure 2/3 px at 150 %, an italic menu must not shift the
following ones, the palette has a one-pixel bevel and a two-pixel highlight. In egui each
such detail is drawing code; on the web it is CSS, and the result is compared with
the captures using the browser's own tools.

**3. The family already works this way.** Anvil, the TestStand replacement of the same
family, has its editor in Electron with the tests in `node:test`.

**4. The web does not tie us down.** The same page can end up in a browser, in Tauri or in
another wrapper if Electron does not convince. Changing native toolkit, on the other hand,
forces a rewrite of the interface.

### Decision

The editor is written in HTML, CSS and JavaScript —ES modules, no framework and no
build step— and runs on Electron. Electron only opens the windows and serves
the files: what is seen and how it reacts lives in the page, which does not know it is
in Electron.

### Consequences

a. **The core stays in Rust**: format, graph, compiler and runtime.
   *(Corrected by [DT-039](#dt-039): the core is JavaScript; Rust is left for
   the hardware host.)* What is
   verified without an interface (DT-035 §6) does not change.

b. **The egui skeleton is withdrawn**: `crates/tk-ui`, the `crates/solder`
   binary and the Cargo workspace, which only existed for them. The
   workspace returns with the first core crate; meanwhile, `rust-toolchain.toml`
   keeps fixing the Rust version of the plan (§2.2).

c. **Dependencies.** The editor adds `electron` and, only for the tests, `ajv`,
   pinned in `package.json`. The rule that replaces DT-001 ("everything in
   Rust, no dependencies outside the pinned crates.io ecosystem",
   `reference/history/00-provisional-plan.md` §5) stays for the core; the interface is web.

d. **Tests without a browser.** `window-view.mjs` returns HTML and `window-state.mjs` are
   pure functions, so `npm test` (`node:test`) checks what is drawn,
   where, in what order and how it reacts, against the inventory.

e. **Linux.** Chromium needs its sandbox helper with root permissions.
   `npm run app` checks it and explains how to fix it, or starts without a sandbox
   with `SOLDER_SIN_SANDBOX=1`, for development only.

f. **Typography.** Segoe UI at 12 px if present, which is LabVIEW's; if not, Noto
   Sans at 11.3 px, which matches its widths ([`06-visual.md`](../spec/06-visual.md)
   §10). The page decides at startup.

g. **Not decided here** is how the editor talks to the core in Rust —compiled to
   WASM inside the page, or as a separate process the editor calls—, nor
   where the compiled VI runs: wasmtime in a separate process or the page's own WASM
   engine. It depends on the gates of phase R7.
   *(Decided in [DT-039](#dt-039): there is no boundary, because the core is
   JavaScript, and the VI runs in the page's WASM engine, in a worker.)*

### Verification

| What | Mechanism | Status |
|------|-----------|--------|
| The editor draws and reacts as the inventory says, without a browser | `npm test` | **Verified**: 33 tests |
| It looks like LabVIEW | Electron on a virtual screen at 150 % scale (`--force-device-scale-factor=1.5`), compared pixel by pixel with the captures | **Checked** with measurements, not with a test: the header, the status bar and the palette fall within 1 px of LabVIEW |

---

## DT-038

**The numeric types are LabVIEW's representations, and they are converted
as in LabVIEW: with a coercion dot, not a broken wire.**

- **Status:** Accepted on 2026-09-29. **Implemented in the editor**
  ([`core/model/types.mjs`](../../core/model/types.mjs) and
  [`core/model/graph.mjs`](../../core/model/graph.mjs)); the compiler and the
  runtime, which do not exist yet, inherit it.
- **How it was decided:** when the developer of the project asked that the Numeric
  blocks could be placed on the diagram and wired with the color of their type, it
  was raised that this required first closing question 5 of
  [`03-static-semantics.md`](../spec/03-static-semantics.md) §9 —"do not add
  numeric types without first defining their conversion"—, and it was chosen to clone LabVIEW
  rather than stay with f64 only.
- **Replaces:** rule 2 of `03` (strict equality, no implicit
  conversion) for numerics, and closes its §3.7.

### Context

**1. The palette is LabVIEW's.** DT-035 clones Numeric one to one, and in it there is a
constant that is I32, another that is DBL, an enum, a U16 ring and functions whose
result depends on what is wired to them. With a single numeric type, half
of those icons would lie: they would all give DBL.

**2. The wire color is information.** Someone coming from LabVIEW reads blue as
integer and orange as floating point. An editor where everything is orange takes that
reading away.

**3. The conversion was undecided, not forbidden.** `03` §3.7 asked to decide it
before adding integers. LabVIEW's is written in its help ("Numeric
Conversion") and is the one its audience expects.

### Decision

1. **Types.** `i8`, `i16`, `i32`, `i64`, `u8`, `u16`, `u32`, `u64` and
   `sgl` are added. `number` remains the DBL (f64): the name that the schema
   and the corpus already use is kept. The compound type `{ "enum": [labels] }` is added,
   which counts as U16 for conversion.
2. **Common type.** A function that expects its inputs to be of the same type takes the
   common one, with NI's rule: the representation with more bits wins and, with the
   same bits, the unsigned one. In addition, floating point beats integer: I64 + DBL gives
   DBL and I32 + SGL gives SGL.
3. **Conversion on the wire.** Between two different numerics, also from array to
   array, the wire is **valid** and the terminal that converts carries a **coercion
   dot**. Between types that do not convert, the wire is drawn **broken** and says
   why (`05-editor.md` rule 31, `06-visual.md` §5.1).
4. **Polymorphism in the catalog.** `blocks.json` declares `{ "num": "N" }`: a
   numeric type variable, which binds the common type of what arrives at the
   inputs that share it. With `"flotante": true`, an integer result becomes
   DBL: this is what Divide, Square Root and Reciprocal do with integers. With nothing
   wired, the variable is DBL, which is what LabVIEW shows.
5. **Out, for now:** EXT (80 bits: WebAssembly does not have it), complex numbers
   (CSG, CDB, CXT) and fixed point (FXP). Their subpalettes remain gaps.
   *(2026-10-01: they are no longer declared `never` but `todo` —pending—, at the request
   of the developer; how they would be represented is still undecided. That decision,
   which touches the compiler and the type catalog, is yet to be made.)*

### Consequences

a. **Rule 2 of `03` changes**: strict equality for everything that is not
   numeric; conversion with a coercion dot between numerics. `03` §3.1 and §3.7
   and the `.qvi` schema pick up the new types.

b. **A palette function is done when it is placed on the diagram with its
   catalog terminals** and wired. Compiling it is another piece, that of
   running a VI (`ejecutar-vi` in the inventory). The 32 Numeric functions
   become `built`.

c. **The graph model lives, for now, in the editor**, in JavaScript: the
   ports come from `blocks.json`, and `can_connect`, type resolution and
   cycles are in `graph.mjs`. This contradicts for the moment rule 4 of `03` —a
   single core function for editor, compiler and `check`—, because the core
   does not exist. When it exists, the editor will call it and `graph.mjs` will disappear.
   It is open whether the core ends up being JavaScript too: it changes nothing in
   this decision. *(Closed by [DT-039](#dt-039): the core is JavaScript;
   `graph.mjs` does not disappear, it moves to `core/`.)*

d. **Ports carry `label`**, the terminal name in LabVIEW ("x+y",
   "floor(x/y)"), which the editor shows in the tip strip. `name` remains the
   identifier in the `.qvi`.

e. **Pending, no captures yet:** how LabVIEW draws a node, a constant
   and a wire on the diagram. The editor uses the palette glyphs, boxes with the
   value for constants and the colors of their borders for wires; it still needs
   to be compared against captures of the diagram.

### Verification

| What | Mechanism | Status |
|------|-----------|--------|
| The common type rule | Test "the common type follows LabVIEW's rule" (`test/core/types.test.mjs`) | **Verified** |
| Coercion and broken wire | Tests "a function takes the common type and marks the coercion" and "a wire between incompatible types is left broken and explains why" (`test/editor/palettes.test.mjs`) | **Verified** |
| The 32 functions are placed with their terminals | Test "each numeric function is placed on the diagram with its terminals" | **Verified** |
| It looks like LabVIEW on the diagram | Captures of a LabVIEW diagram with these blocks | **Pending**: there are no captures |

---

## DT-039

**The core —format, graph, compiler and `check`— is written in JavaScript, and
the compiled VI runs in the page's own WebAssembly engine. Rust is left
only for the hardware host.**

- **Status:** Accepted on 2026-09-30. **Being implemented**: `core/` has the
  graph, the types, reading and writing of the `.qvi`, the compiler to
  WebAssembly with its encoder and the executor, which the editor's worker and
  the command line use (`cli/solder.mjs run|wat|check`). Still missing are the structures,
  the aggregates and the hardware host.
- **How it was decided:** in a conversation with the developer of the project, on
  reaching step 2 of the 2026-09-30 roadmap: decide where the
  core lives before writing the compiler. Three options were compared —core in
  JavaScript, core in Rust compiled to WASM inside the page, and core in
  Rust as a separate process— and the first was chosen.
- **Corrects:** [DT-037](#dt-037) (a) and (g) and [DT-038](#dt-038) (c). **Replaces:**
  in [`00-provisional-plan.md`](../reference/history/00-provisional-plan.md), the row "Compiler
  backend" of §1, the *crates* tree of §3 and the "everything in Rust" rule of §5;
  in [`00-provisional-index.md`](../reference/history/00-provisional-index.md) §8, the rows
  "Language and runtime", "Compiler backend" and "Public surface".

### Context

**1. The graph is already in JavaScript, and it works.** DT-038 left `can_connect`,
type resolution, coercion and cycles in `core/model/graph.mjs` and
`types.mjs`, with tests. It left them as provisional because it contradicts rule 4 of
[`03-static-semantics.md`](../spec/03-static-semantics.md): a single
implementation for editor, compiler and `check`. With the core in Rust, that
rule forces porting everything and having the editor call it across a boundary
(wasm-bindgen or a separate process).

**2. The editor is no longer in Rust.** The July plan put the core in Rust
because the interface was going to be too (egui). Since DT-037 the interface is web,
and a core in Rust forces it to cross languages at every edit: to validate
a wire, to resolve a type, to draw a coercion dot.

**3. The page already brings a complete WebAssembly engine.** The V8 in Electron 40 and in
Node 24 runs WasmGC, which is what the plan asks for strings, arrays and
clusters (§2). wasmtime contributed two more things: the sandbox without WASI and
interruption by *epoch*. A WASM module in the browser is already born without access to
files, network or clock —it only touches what is imported into it—, and an infinite loop is
cut off by terminating the *worker* where it runs.

**4. Hardware does need native code.** Talking to a serial port, to VISA
or to a DAQ card cannot be done from a page. That is the only thing left
outside the reach of JavaScript, and it is not needed until the Instrument
I/O subpalette (step 4 of the roadmap) or phase R7.

### Decision

1. **A single core in JavaScript**, ES modules with no framework and no build
   step, like the editor (DT-037). It contains the format (`.qvi`, `.qlib`,
   `.qproj`), the graph model, the block registry, the compiler and
   `check`. The editor, in the page, and the command line, in
   Node, use it equally. It lives in its own directory, `core/`, outside `editor/`.
2. **The compiler builds a typed WASM tree** —as §1 of the plan already asked for
   the WAT— and serializes it in two ways: to **binary**, with its own encoder,
   to run it; and to **WAT text**, to read it when debugging and for the
   golden-output tests. It never concatenates strings: DT-008 is kept. The
   own encoder covers only the subset the compiler emits; `wabt` is
   discarded, since it does not assemble WasmGC, and so is `binaryen`, which is a multi-megabyte
   dependency for this.
3. **The compiled VI runs in the page's WASM engine**, inside a *Web
   Worker*: the interface does not freeze while the VI works, and Abort terminates the
   *worker*. `solder run` does the same in Node. wasmtime leaves the project.
4. **The gates do not change.** The module only touches what is imported into it, and
   the host validates each import against the manifest (plan §4). What changes is
   who acts as host: the *worker*, not a wasmtime `Store`.
5. **Rust, or a native module, only for the hardware host.** How it connects
   to the editor —a native Node module in Electron's main process or
   a separate process— will be decided when the time comes, with the first driver.
6. **No runtime dependencies** in the core. `ajv` stays only in
   the tests.

### Consequences

a. **Rule 4 of `03` is met** as soon as `graph.mjs` and `types.mjs` move to
   `core/`: they stop being provisional and become the core. They are moved when writing the
   compiler, not before.

b. **Tests.** The whole core is tested with `node:test`, like the editor. The plan's
   §5 rule "`cargo test` + golden corpus" becomes "`npm test` + golden
   corpus".

c. **Phase R0** changes mechanism, not criterion: `solder run
   examples/suma-basica.qvi` prints `8.0`, executed by Node.

d. **Blocking I/O remains open** (plan §3), with another candidate: JSPI
   (*JavaScript Promise Integration*), which lets an import return a promise
   without the guest noticing. It is decided with the first driver, together with point 5.

e. **Rust.** The Cargo workspace does not return with the core, as DT-037
   (b) foresaw, but with the hardware host. `rust-toolchain.toml` stays fixing the
   version until then.

f. **The public surface** is the format, the command line and the module's
   imports. The core's API in JavaScript, like Rust's before it, is internal.

g. **Accepted risk: compiler performance.** Compiling in JavaScript is
   slower than in Rust; for diagrams the size of a VI it is not noticeable. If someday
   it gets in the way, it is measured before touching anything.

### Verification

| What | Mechanism | Status |
|------|-----------|--------|
| A single implementation of the graph | `graph.mjs` and `types.mjs` in `core/`, imported by the editor and by `check` | **Done in the editor** (2026-09-30), next to `core/model/qvi-format.mjs`; `check` does not exist yet |
| The generated binary is valid | `WebAssembly.validate` on the output of each compiler test | **Verified** (`test/core/compiler.test.mjs`) |
| The WAT text is the same program | Golden-output tests of the `.wat` | **Pending** |
| R0 | `solder run examples/suma-basica.qvi` prints `8.0` | **Verified**: `node cli/solder.mjs run docs/schema/examples/suma-basica.qvi.json` prints `Resultado = 8` (test "suma basica se compila a webassembly y da 8"). The `examples/` corpus is still in the Red format |
| An infinite loop does not freeze the interface | *Worker* test: Abort terminates it | **Pending** |

---

## DT-040

**How a VI runs while the panel stays alive: live indicators, controls
that change while running, Abort, Latch, parallel loops and Wait (ms).**

- **Status:** **Decided on 2026-10-01: option C**, with the diagram split
  into *clumps* (see "Decision", below). Implemented for what exists without loops:
  Wait (ms), parallel branches, live indicators, Abort, Latch and Run mode.
- **How it was decided:** the developer asked to check it in LabVIEW and to choose
  as architect. The circuits were built in LabVIEW 2026 Q3
  (`labview-captures/run/`) and what was measured was cloned. The proposal of options, further
  below, is kept as it was written.
- **Complements:** [DT-039](#dt-039) (decision 3 and consequence d). It does not change the
  core in JavaScript nor the VI in WebAssembly: it chooses the mechanism that is missing from
  "the VI runs in a worker".

### Context

Today `run()` runs from start to finish. `core/runtime/runtime.mjs` instantiates the module,
gives it the controls through `panel.leer_*` **once, when it reads them**, collects the
indicators into an object and returns them at the end. `editor/src/window/editor-window.mjs`
(`ejecutarVI`) launches it in a worker (`run-worker.mjs`) and draws the results
when the single message back arrives. Without loops that is enough. With loops,
in LabVIEW:

1. Indicators update **while** the loop spins.
2. Controls are changed **while running** (a Stop wired to the condition of a
   While).
3. The **Latch** mechanical actions return by themselves to their default value when the
   diagram reads them (When Pressed / When Released / Until Released).
4. **Abort** stops the VI even if it is in an infinite loop.
5. The panel goes into **Run mode** (a click operates the control; in edit mode, it
   selects it); Ctrl+M toggles.
6. Later: **Wait (ms)** and Timing, subVIs, **several loops in parallel** in
   the same diagram (dataflow) and hardware through a host in Rust.

Facts checked to decide (2026-10-01, in the project's Electron):

- **Version.** `package.json` asks for Electron `^40.10.6`; installed, 40.10.6
  with Chrome/V8 144. Node 24.19 (V8 13.6) for the command line.
- **How the page is loaded.** Through its own protocol, `solder://`, served by
  `protocol.handle` in `editor/electron/main.mjs`, with
  `webPreferences { contextIsolation, sandbox }`. Since the response is built by the
  main process, **setting headers is trivial**.
- **SharedArrayBuffer.** With the page as it is (no headers): `crossOriginIsolated
  = false` and **`SharedArrayBuffer` does not exist**, not in the worker either. With the
  headers `Cross-Origin-Opener-Policy: same-origin` and
  `Cross-Origin-Embedder-Policy: require-corp` in the protocol response:
  `crossOriginIsolated = true`, and a worker blocked in `Atomics.wait` is
  woken with `Atomics.notify` from the page (measured: 91 ms with a notify at
  100 ms). `Atomics.waitAsync` exists in both cases.
- **JSPI.** `WebAssembly.Suspending` and `WebAssembly.promising` **exist without
  flags** in Electron 40, in the page and in a worker. A test module with
  an import suspended by `setTimeout(50)` returns 42 from `promising`. Each
  suspension on an already-resolved promise costs **≈ 2 µs** (2000 iterations, in a
  worker). In Node 24 **it is not available without flags**: `--experimental-wasm-jspi` is needed
  (with it, it works); the CLI would have to relaunch itself with
  that flag or wait for Node 26.
- **Windows.** The panel and the diagram are separate windows and talk through
  `BroadcastChannel` (`canal`): a `SharedArrayBuffer` cannot be shared through it;
  values are copied in messages. The one that launches the VI is the window from which
  Run is pressed.

### Options

#### A. Worker with shared memory (`SharedArrayBuffer` + `Atomics`)

*How it works.* The VI runs in the worker, from start to finish and blocking, as
today. A shared region holds one slot per control and indicator (value,
version number and flags). `panel.leer_*` and `escribir_*` read and write
the slot with `Atomics`; the page reads it every frame and draws. Wait (ms) is
`Atomics.wait(flag, 0, 0, ms)`, which also wakes earlier if Abort
notifies it. Abort is `worker.terminate()`.

*Compiler.* Almost nothing: loops with `loop`/`br_if`; Wait is a blocking import.
*Panel.* It draws from the shared region in `requestAnimationFrame`; when a
control is pressed, it writes the slot and marks it. *Editor.* COOP/COEP headers in
`main.mjs`; reserve the region when launching Run.

*Pros.* It is the simplest mental model: one thread, linear code, no reifying
stacks. Controls and indicators are real time without messages: the page
never waits for the worker. Abort is immediate and reliable even if the loop does not yield
even once. Latch: the worker does the read with `Atomics.compareExchange(slot,
1, 0)`, atomic by construction, with no race against the click.

*Cons.* **It gives no parallelism between loops**: a single thread with a blocking
Wait stops all the others, and two independent loops in the same
diagram (the typical case: one for acquisition and another for the interface) would run
one after the other, which is not what LabVIEW does. For real parallelism several
workers with shared `WebAssembly.Memory` (WebAssembly threads) or
several modules would be needed, and **WasmGC is not shared between threads**: strings, arrays and
clusters (M3, M6) would not pass from one loop to another except by copying them. It requires COOP/COEP,
which closes the page to any resource from another origin without CORP (today it loads
none, but it remains as a restriction). The value of a large control (array) does not
fit in an atomic slot: it has to move to linear memory with a copy.

#### B. Yield points: the compiler splits the program into steps

*How it works.* The compiler does not emit a `run` that runs to the end, but
resumable tasks. Each loop becomes `init()`, `paso()` and `fin()`, with
its state (shift registers, counter) in WebAssembly globals; `paso()`
executes one iteration and returns "continue" or "done" (and, for Wait, "sleep n ms").
A scheduler in JavaScript calls each task's steps in turns, between
ticks of the event loop. Abort is a flag the scheduler checks
before each step.

*Compiler.* It is the one that asks the most: **each structure becomes a state
machine**. A Wait *in the middle* of an iteration, a loop inside another loop and a
Case with a loop inside force storing in globals or memory the values that
stay alive after a yield (Wasm locals do not survive), which clashes
with WasmGC values in locals and makes debugging the `.wat` harder. A reduced
version (yielding only between iterations of each task's outermost loop)
fits in the current compiler, but then an endless inner loop does not respond to
Stop. *Panel.* Indicators are written at step boundaries and sent through
`postMessage` grouped by tick; controls arrive between steps.
*Editor.* No headers or COOP/COEP.

*Pros.* It depends on no new engine feature: it runs in Electron,
Node and any browser. Parallelism and Wait come from the scheduling
itself, with independent tasks and turns. Abort, and step-by-step inspection
for future debugging with probes, are natural.

*Cons.* It is the most expensive option to build and maintain, and the hardest to
get right with LabVIEW's semantics: a Wait in the middle of an iteration does not delay
only what depends on it, but the iteration has to be divided into pieces and it must be worked out
which nodes fall before and after. Each new structure (Case, sequences, reentrant
subVIs, the future Event Structure) has to be rewritten in the form of a
state machine. Each yield costs a trip around the event loop (four milliseconds
minimum with nested `setTimeout`; with `MessageChannel` or a microtask, less,
but then it does not yield to the rest of the worker). An iteration of a compute-heavy loop
is still not interruptible, except with `terminate()`.

#### C. JSPI: the VI suspends at wait points, without changing its shape

*How it works.* The compiler keeps emitting linear code with `loop`/`br_if`.
The imports that may wait —`panel.esperar(ms)`, `panel.ceder()`— are
wrapped with `new WebAssembly.Suspending(...)` and the export is wrapped with
`WebAssembly.promising(run)`, so that `await run()` returns a promise that
resolves when the VI finishes. Inside, each loop iteration calls `ceder()`
(or only if ≥ 8 ms have passed, checked with an `ahora()` import, so that the
normal iteration pays nothing), and Wait (ms) is `esperar(ms)`: a `setTimeout`.
While the VI is suspended, the worker serves its messages: control changes
arrive, and indicators go out in one message per tick. Abort: the flag
makes the `ceder()` promise reject, which unwinds the VI at the point where
it was suspended; and `worker.terminate()` remains as a last resort for a computation
that does not yield.

*Parallelism.* Each independent branch of the diagram —each top-level structure
with no data dependency on another— is compiled as **an exported function of its own**
(`tarea_k`), and the host launches them all with `promising` and
`Promise.all`: each has its own suspendable stack, and they interleave at each
`await`. Those that depend on each other (a value from the first enters the
second) are chained by the host with the graph's order; values that cross
from one task to another go through exported globals. It is the same split as B, but
done by the engine, not by the compiler.

*Compiler.* Little: the body does not change; it adds the call to `ceder`/`esperar` in
the loop iteration and in Wait, and distributes the nodes into tasks by connected components
of the graph (done once, before emitting). *Panel.* It receives the
indicators by messages every tick (there is no shared region); it sends the controls
by messages, which the worker applies to a local mirror at each suspension.
*Editor.* No headers. For the CLI, relaunch Node with
`--experimental-wasm-jspi` until it is stable in Node.

*Latch.* The worker's local mirror keeps the "pressed" flag; the read
consumes it and sends a "go back to the default value" message to the panel. Latch When
Pressed is satisfied even if the click happens between two suspensions because the message
waits in the worker's queue and is applied at the next one. Latch Until Released is
satisfied equally with a second flag that only the release turns off.

*Pros.* The compiler stays almost as simple as in A; there is no need to reify the
stack or split structures. It gives cooperative parallelism and Wait without extra threads, and
it suits WasmGC (nothing is shared). A suspension on an already-resolved promise
costs ≈ 2 µs, measured. It works in a worker, which keeps the
interface free and leaves `terminate()` for the worst case. No COOP/COEP. An asynchronous
hardware host (serial, TCP, VISA through IPC) is just one more promise:
`leerSerie()` suspends until the bytes arrive, which is exactly what
DT-039 (d) asked for.

*Cons.* It depends on JSPI, which in Electron 40 is active but recent: the
API was renamed before being published and its behavior in Node 24 requires a
flag. The Electron version has to be pinned and a test added that fails if it
disappears. A long computation between two suspensions freezes *all* tasks
(it is cooperative, not preemptive), and data from one task to another are globals,
not a queue. A suspension cannot happen in the middle of a call from WebAssembly
to JavaScript that is not wrapped with `Suspending`, and it does not pass through intermediate
JavaScript functions: each import that waits must be the immediate one.

#### D. Hybrid: JSPI for yield and Wait, shared memory only for the panel

*How it works.* Like C, but the state of controls and indicators is carried in a
`SharedArrayBuffer` region instead of messages (with COOP/COEP), so that the
panel draws without waiting for the worker to suspend or for its message queue
to empty, and the click on a control is seen at the next read even if the loop
has not yielded.

*Pros.* Smooth display with loops that yield rarely; Latch by atomic
`compareExchange`. *Cons.* It adds the demands of C and of A (COOP/COEP and compound values
that do not fit in a slot). With control changes in one message every 8 ms
(a tick) the advantage is small. It is left as a possible optimization on top of C, without
changing the compiler, if a problem is ever measured.

### How each requirement fits

| | A. Worker + SAB | B. Yield points | C. JSPI in worker | D. C + SAB |
|---|---|---|---|---|
| Live indicators | Shared region, no messages | Per tick, between steps | Message per tick, after each yield | Shared region |
| Controls while running (Stop) | Immediate | Between steps | At each yield (≤ 8 ms) | Immediate |
| Latch (read and return to default) | Atomic `compareExchange` | Scheduler mirror | Worker mirror + message | `compareExchange` |
| Abort | `terminate()`, always | Scheduler flag (+ `terminate()`) | Rejection at the yield (+ `terminate()`) | Same as C |
| Several loops in parallel | **No** (single thread) except Wasm threads without WasmGC | Yes, by scheduler, at the cost of state machines | Yes, one task per branch | Same as C |
| Wait (ms) | `Atomics.wait` (blocks everything) | "Sleep" state, with iteration splitting | Suspended `esperar(ms)` | Same as C |
| Hardware host in Rust | Blocking; the thread stays stopped | Each I/O is one more state | One more promise: the I/O suspends | Same as C |
| Requires COOP/COEP | Yes | No | No | Yes |
| Load on the compiler | Minimal | **High** | Low | Low |
| Risk | Parallelism has no way out | Complexity and Wait semantics | Dependency on JSPI in Electron and Node | Those of C and of A |

The "dataflow model" (two loops with no wire between them running at the
same time) is only truly solved in B and C: A needs threads, and threads do not
get along with the WasmGC types of M3 and M6. None of the four gives preemptive
parallelism: a loop whose iteration is a single long operation blocks the others;
LabVIEW does spread them across system threads, and that difference is either accepted or
reopened with threads later.

### Recommendation

**C: JSPI in a worker, with one task per independent branch, without shared
memory; D stays as a measurable improvement afterwards.** The developer decides.

Reasons. (1) It is the only option that gives at once A's simple compiler and
B's cooperative parallelism: a loop's body is emitted just as today, and the
difference is a `call` at the end of the iteration. (2) The two hard points of
M4 —Stop while running and live indicators— are solved with ≤ 8 ms of latency with
messages, which is finer than what the eye sees on a panel. (3) The hardware I/O
of step 4, blocking by nature, already has a place: a promise. (4) Today's
verification comes out well: JSPI is active without flags in Electron 40, in the
page and in the worker, and at a cost of ≈ 2 µs. (5) It does not require COOP/COEP, which closes
the door to other origins. Abort is doubly covered: rejection at the
yield and `terminate()`.

What is accepted with C: depending on JSPI (the Electron version is pinned, CI tests
that `typeof WebAssembly.Suspending` is `function`, and B remains as plan B, since
its pieces —tasks and scheduler— are half built in the host),
that the CLI on Node 24 needs the flag and that the split is cooperative.

### Decision (2026-10-01)

**C, and the diagram runs by clumps, like LabVIEW.** Measured in LabVIEW 2026
Q3 with a While with Stop, a 500 ms Wait, an output tunnel and two Waits of 1000
and 2000 ms outside the loop (`labview-captures/run/r1.png` to `r4.png`):

| Behavior | LabVIEW |
|----------|---------|
| Branches with no data dependency | They run at the same time: the loop counts while the two Waits wait; the 1000 one comes out at one second and the 2000 one at two |
| An indicator | It is drawn when its data arrives, not when the VI finishes |
| An output tunnel of a loop | It gives its value only when the loop ends |
| Stop (Latch When Released) | It is read in the iteration after the click and returns to FALSE by itself |
| Abort | It stops on the spot, in the middle of a Wait; indicators keep the last thing written and what was missing is not written |
| When a Run starts | Indicators keep the value from the previous Run |
| Run mode | The arrow fills in, Abort lights up, the editing tools and the panel grid disappear |

**The design.** The compiler splits the diagram into clumps
(`core/compiler/compiler.mjs`, `partir`): each node that takes time (Wait (ms), Wait Until
Next ms Multiple; later, loops, subVIs and I/O) goes alone in its own, and
the instantaneous ones are grouped by the set of time-taking nodes they
depend on. An instantaneous node thus runs as soon as the last long node it
depends on ends, which is exactly when its data arrives: what is observable (when an
indicator is written, when a control is read) is the same as if each node ran on
its own, without paying one task per node. Each clump is an exported function
(`c0`, `c1`…); the values that cross from one clump to another go through globals. The
host (`core/runtime/runtime.mjs`, `planificar`) launches each clump when those from which it receives
something have ended; the long ones, with `WebAssembly.promising`,
and their waits are `Suspending` imports. A VI with no long nodes is a single
clump and runs in one go, without JSPI.

**Done:** Timing (Tick Count (ms), Wait (ms), Wait Until Next ms Multiple), the
scheduler, live writes (the worker gathers them and sends them when the VI
yields), Abort (with `terminate()` if it does not answer within 500 ms), Latch When Released
(the factory action of Stop, OK and Cancel, which now take it when placed), Run
mode in both windows and Ctrl+. Tested in `test/core/execution.test.mjs` and in
the real editor, in Xvfb (`labview-captures/run/solder/`).

**For M4:** a loop is a long node; its body is emitted inline and calls
`ceder` at the end of each iteration (with a time threshold, so as not to suspend on every
one). If its body in turn has independent long nodes —two Waits inside the
same While, which in LabVIEW overlap—, the body is split into clumps the same way and
the iteration calls a suspendable import that runs them and waits for all of them.
Ctrl+M (toggle Run mode without running) is left undone.

### Consequences

a. `core/runtime/runtime.mjs` stops being "instantiate and call `run` once": it becomes
   an asynchronous host with `Suspending`/`promising` wrappers, a
   task scheduler and a message channel with the panel (control values,
   indicator values, Latch resets, Abort).
b. The compiler emits, per independent branch, an exported function, the call
   to `ceder` in each loop's iteration (with a time threshold) and `esperar` in Wait.
   Values that cross between branches go through exported globals.
c. The panel gains **Run mode** and the behavior of controls (mechanical
   action, Latch). The editor's worker is kept alive between Runs and is
   restarted only if Abort fails to stop it.
d. This decision does not touch `.qvi`, the schema, or the format: it is execution only.
e. `cli/solder.mjs` and `npm test` launch Node with `--experimental-wasm-jspi`
   until Node ships it stable. A VI with no waits also runs without it.

### Spike that validates C before building M4

An afternoon's script, without touching the compiler (modules written by hand with the
encoder from `core/`):

1. A module with a While that counts, writes the counter to an indicator on each
   iteration, calls `ceder` and ends when `leer_bool(stop)` gives true.
   Run it in the editor's worker with `promising`, with the page drawing the
   counter and a Stop button that sends a message. **Criterion:** the counter rises in
   view at ≥ 30 Hz and Stop stops it in < 50 ms.
2. Two independent loops in two exported functions (one with `esperar(100)`,
   the other with `esperar(30)`), launched with `Promise.all`: each keeps its
   own rhythm. **Criterion:** the measured periods are within ±15 % of the requested ones.
3. Abort with the loop not yielding (empty `loop`): `terminate()` cuts it and the
   next Run works. And Abort on the one that does yield: the promise is rejected and
   no dirty state remains.
4. A simulated Latch When Pressed: two clicks between yields count as one; one
   click between yields is not lost.
5. Cost: 1,000,000 iterations with `ceder` conditioned by time versus without it.
   **Criterion:** overhead < 10 %.
6. With the module and an `esperar` that returns a `fetch` or an IPC to the main
   process, check that JSPI holds up to a real simulated-hardware wait.

If 1 and 2 pass, C is accepted. If 5 goes badly or JSPI fails in the pinned Electron, it
moves to reduced B (yielding between iterations of each task's outermost loop).

### Verification

| What | Mechanism | Status |
|------|-----------|--------|
| JSPI available in the project's Electron, page and worker | Experiment of 2026-10-01 (`Suspending`/`promising`, 42 returned, ≈ 2 µs per yield) | **Verified**; CI test missing |
| `SharedArrayBuffer` only with COOP/COEP | Same experiment | **Verified** |
| Parallel branches, live indicators, chained waits (spike, 2) | `execution.test.mjs`, and in the editor in Xvfb: Wait 1000 and 2000 end at 2 s | **Verified** |
| Abort on a VI that is waiting (spike, 3) | `execution.test.mjs`: stops at 30 ms of a 2000 Wait | **Verified** |
| Latch When Released | `execution.test.mjs` and the Stop in the real editor | **Verified** |
| A loop that yields, its cost and Stop while running (spike, 1, 4 and 5) | With the loops, in M4 | **Pending** |

## DT-041

**Structures (While, For, Case, sequences) in the editor model and in the
compiler.**

- **Status:** **Accepted on 2026-10-01**, when starting M4. It is taken by the project's architect
  at the request of the developer, like DT-040. **Done** is the core
  of While and For: model (`core/model/graph.mjs`), types, compilation, adaptive
  yielding and `.qvi` (`test/core/structures.test.mjs`, 13 tests: sum with
  shift register, live Stop, For with N ≤ 0, nested, parallel, Abort of an
  infinite loop, a million iterations in ~10 ms, save and open).
- **Complements:** [DT-040](#dt-040) (a loop is a long node of its scope) and
  `spec/02` §scopes (the file format, nested, does not change).

### Context

The editor graph (`core/model/graph.mjs`) is flat: `nodos` and `cables`, with one id
per node. Selection, dragging, wires with
bends, undo, synchronization of the two windows and type resolution are all built on that shape.
The `.qvi` file, on the other hand, nests: each structure has its `body` (or its
`frames`), with its own nodes and wires. In LabVIEW a loop is a rectangle
that contains nodes; the wires that cross its border pass through **tunnels**, the
**shift registers** go in pairs on the left and right borders, and the
iteration (`i`), condition and count (`N`) terminals are inside.

### Decision

1. **Flat, with membership.** A structure is just another node (`while-loop`,
   `for-loop`…) with its size (`tam: { ancho, alto }`). Each node of its body
   carries `dentro: <id of the structure>`; without `dentro`, it is on the VI's
   diagram. A node's *scope* is its `dentro`.
2. **What is on the border are also nodes**, with `dentro` = the structure and a place on
   its border (`borde: { lado, pos }`):
   - `tunnel`: one port faces **outside** and another **inside**. For an input, the outer one
     is its input and the inner one its output; for an output, the reverse.
   - `shift-register-left` and `shift-register-right`, a pair (`config.par`): the
     left one receives the initial value from outside and gives, inside, the one from the previous
     iteration; the right one receives inside the one from this iteration and gives outside the last one.
   - `loop-iteration` (`i`, I32) and `loop-condition` (boolean; Stop if True or
     Continue if True) inside the While; `loop-count` (`N`) in the For, which is
     wired from outside.
   Each port declares in the catalog its **side** (`"lado": "fuera"` or
   `"dentro"`): a wire only joins ports of the same scope, counting the side.
   Wiring from one scope to another creates the tunnels that are needed, like LabVIEW.
3. **Types and order, without changing shape.** A tunnel or a shift register passes its
   type from one side to the other; a shift register's pair shares its type. The topological
   order stays that of the flat graph: what is inside depends on the
   input tunnels, and the output ones on what is inside.
4. **Hierarchical compilation on top of clumps.** In its scope, a structure with
   everything of its own is **a single long node** (DT-040): a clump of its own, which depends
   on what enters through its tunnels and on which those that read its outputs depend.
   Its function emits the WebAssembly loop (`loop` / `br_if`) with the body
   inline, in topological order; shift registers and tunnels are locals. At the
   end of each iteration one unit of a **budget** is spent; when it runs out,
   `tiempo.ceder()` (suspendable) measures how long those iterations took, gives the next
   budget to call it again about every ~1 ms and, about every ~8 ms, it
   suspends so that the other clumps, the panel and Abort can run. Calling it on every
   iteration cost ~310 ns (measured); with a budget, a million iterations take
   ~10 ms. Output tunnels give their value when the loop ends.
5. **The file does not change shape:** `core/model/qvi-format.mjs` translates from flat to nested
   on save and the reverse on open.

### Consequences

a. The editor draws the structure as a rectangle that stretches, and what is
   inside moves with it; putting a node in or taking it out changes its `dentro`.
b. Two long nodes **inside the same body** (two Waits, or a Wait and a
   read) run at the same time, as in LabVIEW: a body (or a frame) with two or
   more long nodes is split into clumps —a *subplan*—, each one a function, and
   the structure calls on each iteration the suspendable `tiempo.correr_plan`, which
   runs them by dataflow and waits for all of them. What a clump reads from another
   function goes through a global, copied exactly where it is needed (each output
   is assigned once per execution). Tested: 4 iterations with Waits of 50 and 30 ms
   take ~200 ms, not 320.
c. The literal `init` of the shift registers in the `.qvi` schema does not clone
   LabVIEW (there the initial value is wired): it is amended when saving structures.
   *(Done: spec/02 §5 amended.)*

### Case Structure (2026-10-01)

6. **Frames in the same plane.** The Case keeps its frames in `config.marcos`
   (`{ valores: [number | boolean | { min, max }], default }`, in LabVIEW's
   order) and the one that is shown in `config.activo`. Each node of a frame carries, in addition
   to `dentro`, `marco: k`. The selector (`case-selector`) is a border node that
   is wired from outside. An input tunnel serves all frames; an output one
   (`case-tunnel-out`) has one input per frame (`x-0`, `x-1`…) and, with
   `use-default`, those that are not wired give the default value. A wire does not join
   two different frames. `fijarMarcos` adds, removes and reorders frames: what is in a
   removed frame is deleted and the tunnels' inputs follow their frames.
7. **Compilation.** A Case is long only if something in it is; otherwise it runs
   instantaneously in the clump of what surrounds it. It is emitted inline: input
   tunnels, the selector to I32 (a decimal is rounded to even, like coercion),
   and an `if/else` chain with the values and ranges of each frame; the Default,
   at the end. Broken, as in LabVIEW: a numeric selector without a Default, a
   boolean one without its two frames, a value in two frames or an output tunnel not
   wired in some frame without Use Default If Unwired.
8. **File:** `frames` with `match` and `default` (both in a frame "0,
   Default") and its `body`; the selector is wired to `caso.selector`.

### Flat and Stacked Sequence (2026-10-01)

9. **Like the Case, with all frames running in order.** `flat-sequence` and
   `stacked-sequence` keep their frames in `config.marcos` (`{}` each) and what is in
   each frame carries `marco: k`. A wire can go from a frame to a
   **later** one (in the Flat, crossing the border between frames; in the Stacked, through
   a sequence local variable), never to an earlier one. The tunnels are
   the loop's (`tunnel-in`, `tunnel-out`). Each frame runs in full when the
   previous one ends (`emitirCuerpo`, in a subplan if it has several long nodes). In
   the file, `frames` with their `body`.
   **When a piece of data comes out, checked in the VM (2026-10-01):** in a **Flat**, what
   comes out of a frame comes out **when that frame ends**: with a two-frame Flat,
   frame 0 with a constant coming out through a tunnel and frame 1 with a 2000 ms Wait, the
   indicator is written right after frame 0 ends and the sequence continues until
   2 s (`labview-captures/structures/secuencia-run*.png`). Therefore, for dataflow,
   each frame of a Flat is an element of its own (`secuencia#k`),
   chained to the previous one: an output tunnel belongs to the frame that feeds it
   and an input one to the first that reads it. The **Stacked** is a single node: its
   outputs come out when the last frame ends (from NI's help, unverified).
10. **The sequence editor (2026-10-01, spec/05 rule 40g).** The width of each
    frame of a Flat goes in `config.marcos[k].ancho` (the structure's is their
    sum), and in the file, in the layout (`frame-widths`): it is presentation. A
    sequence local variable is not a node: it is the wire that goes from a frame to a
    later one in a Stacked, and the editor draws it as the two halves of a local
    variable; this way the model and the compiler do not change. Changing a sequence's
    shape (Replace with …) keeps the wires.

## DT-042

**How strings, arrays and clusters are stored and moved in the compiled VI.**

- **Status:** **Accepted on 2026-10-01** by the developer ("the same as
  LabVIEW"), after studying how LabVIEW does it. Replaces the idea of using
  WasmGC from the DT-039 plan.
- **Complements:** [DT-039](#dt-039), [DT-040](#dt-040), [DT-041](#dt-041).

### How LabVIEW does it (NI and community documentation)

1. **There is no garbage collector.** NI says so expressly; *Request
   Deallocation* "is not a collector in any sense".
2. **Buffers belong to nodes, not to wires,** and live in the VI's *data space*:
   they are reserved on load and reused from one execution to another and from
   one loop iteration to another.
3. **A string is a handle** (pointer to pointer) to a block with 4 bytes of
   length and the bytes: it admits any byte, also 0. **An array**, likewise,
   with the size of each dimension (I32) in front of the data; handle 0 is the
   empty array. **A cluster** carries its scalars inside and, by handle, its
   strings and arrays.
4. **Copy only when needed ("inplaceness"):** branching a wire does not
   copy; a node writes over its input's buffer when nobody else
   needs it, and **the compiler** decides that. The memory manager tries to grow a
   block in place before moving it.

Sources: *How LabVIEW Stores Data in Memory* and *In Place Element Structures*
(NI help), *Deallocating Memory in LabVIEW* (NI Support), the NI and
LAVA forums (see the 2026-10-01 session).

### Decision

1. **Linear memory, no collector.** The module exports its memory. At the
   start, the *data space*: a 4-byte cell for each output of type
   string, array or cluster with handles (its **handle**: the address of the cell,
   which holds that of the block). Behind it, the heap.
2. **Blocks like LabVIEW's:** string = `[length I32][bytes]`; array =
   `[size of each dimension I32][data]`. The handle (I32) travels along a wire; the
   block can move when it grows without the handle changing.
3. **An allocator of its own in WebAssembly**, by size classes in powers of
   two: `redimensionar` grows in place while it fits and, if not, moves the block
   and frees the old one. Deterministic: nothing is collected "later".
4. **Each node writes in its own buffer** (its data space cell), which is
   reused on each iteration. Constants live in a static zone that is
   never written. This already gives LabVIEW's by-value semantics.
5. **Inplaceness later:** a node writes over its input's buffer (the
   same cell) when it is the last one that uses it, like LabVIEW. It changes memory and
   speed, not results; it is added once strings and arrays
   work.
6. **The panel reads and writes memory directly:** a string is copied with
   `TextEncoder`/`TextDecoder`; a numeric array, as a typed view
   (`Float64Array`…). What the user types is stored in UTF-8.

### Consequences

a. The encoder gains linear memory (memory and data sections, loads,
   stores, `memory.copy`, `memory.grow`) and internal functions.
b. The string functions that depend on LabVIEW's format (Format Into
   String, Scan From String, the number-to-string ones) can be imported from JS
   over the same memory.
c. **Clusters (done on 2026-10-02):** a flat fixed-size block in the node's data
   space, with the scalars inside (aligned to their size), strings
   as handle cells and the clusters inside inline; its
   address travels along the wire. Bundle writes its fields into its block (strings copied);
   Unbundle reads them without copying (a string comes out as the address of its cell
   inside the cluster); a shift register keeps its copy; the default
   cluster is a zeroed zone that is never written. The panel reads and
   writes it field by field with the layout the compiler gives
   (`test/core/clusters.test.mjs`). Comparing clusters, not yet: it gives a
   compile error with its reason.
d. **One-dimensional arrays (done on 2026-10-02):** the block
   `[n I32][4 of padding][elements]`, so that a DBL stays aligned; each
   element with its LabVIEW size (U8 one byte, I16 two, DBL eight, boolean
   one) and, if it is a string, a cluster or an array, by reference (its cell or its
   block inside the array). `nuevo_array(celda, n, tam, ref)` grows the block and
   zeroes the new part of an array by reference. Done: Array Size, Index
   Array, Build Array (elements and, mixed or with Concatenate Inputs, arrays),
   Initialize Array, Array Subset, Reverse 1D Array, Array Max & Min, Search 1D
   Array, Add/Multiply Array Elements, And/Or Array Elements, constants and the
   panel, and the **auto-indexing** of loops: an indexed input tunnel gives its
   element on each iteration and a For without N runs as many iterations as the shortest
   array; an indexed output one builds the array (`test/core/arrays.test.mjs`).
   **Update of 2026-10-02:** Replace Array Subset, Insert Into Array, Delete From Array, Sort 1D Array, Rotate 1D Array, Split 1D Array and Increment/Decrement Array Element are JavaScript imports (module `arr` of the `.wasm`, `a_*`) that read and rewrite the elements' bytes with `nuevo_array`; they do not touch the allocator. **Not yet:** 2-dimensional arrays (Build Array of several arrays without
   Concatenate Inputs gives an error with its reason) and *inplaceness* (§5).
e. The data space lives as long as the module instance lives. For an uninitialized shift
   register to keep its value between executions, as in
   LabVIEW, the instance will have to survive between Runs.

### Update 2026-10-01: the String functions (M3)

The string functions that depend on LabVIEW's format are, as consequence b says,
**JavaScript imports** (module `cad` of the `.wasm`) that read
the input handles from memory and write the result into the node's cell
with `ex.redimensionar`, like `panel.leer_cad`: `sub`, `mayus`, `minus`, `invertir`,
`rotar`, `recortar`, `reemplazar`, `buscar` (+ `extra`), `cmp`, `dec`, `hex`, `oct`,
`frac`, `exp`, `eng` and the four `leer_*` (`core/runtime/runtime.mjs`, `CADENAS` object,
which are pure functions over "binary strings": one JavaScript character per
byte, so a byte >127 arrives intact). These stay in WebAssembly: String Length,
Concatenate Strings (N inputs, a single `redimensionar` and `memory.copy`), the
constants (static zone), character comparisons and Empty String/Path?. A
node that gives two strings (Replace Substring) or a string and numbers (Search and
Replace String, the `… String To Number`) uses one cell per string and a pass-through
scalar (`cad.extra()`), because an import only returns one value.

- Numbers arrive at Number To … String as `f64` (plus the bits of their type, for
  the two's complement of a negative hexadecimal): an I64 or U64 of more than 53 bits
  loses precision.
- The system decimal separator is an executor option
  (`opciones.separador`), which the editor's worker receives from the page; without it, the
  point. Only the functions with `use system decimal point` use it.
- A string **is not copied when wired**: two nodes that read the same output read
  the same handle. Select with strings returns the handle of the chosen branch.
- The allocator, memory and cells were not touched (nothing changes in `linear-memory.mjs`).

## DT-043

**The error cluster: how it travels, how functions treat it and what happens if
nobody wires it.**

- **Status:** **Accepted on 2026-10-02**, when starting M6, at the request of the
  developer. Replaces levels 1 and 2 of DT-029 and §8 of spec/04.
- **Based on:** [DT-042](#dt-042) (clusters in memory) and what was measured in
  LabVIEW 2026 Q3, [`../reference/labview-errors.md`](../reference/labview-errors.md).

### Decision

1. **The `error` type** is the cluster `{ status: boolean, code: I32, source:
   string }`, in that order: a DT-042 cluster with its own name. The wire is
   drawn as in LabVIEW (yellow with black dashes, 3 px, olive border).
2. **Error passing.** A catalog block can declare `error in` and `error
   out`. The compiler wraps its work:
   - `status` TRUE at the input: it **does not work**; its outputs give the default
     value of their type and `error out` is **the same cluster**, untouched.
   - Otherwise (no error or with a warning, FALSE with code ≠ 0): it works; if it fails,
     `error out` is its error, with `source` = "`<función> in <VI>`" + `<APPEND>` +
     the detail; if it does not fail, it passes on the one that came in (the warning continues on its way).
3. **Automatic error handling**, active by default and deactivatable per VI
   (VI Properties ▸ Execution): if a node's `error out` is left unwired and
   after running carries `status` TRUE, the VI stops at that point and the
   editor shows LabVIEW's modal dialog ("Error N occurred at …", "Possible
   reason(s):", Continue / Stop). It is a suspendable import: the VI waits for the
   answer; Stop aborts it. With `error out` wired there is no dialog.
4. **Functions:** Clear Errors, Merge Errors (errors before warnings;
   within each class, the topmost one first; a code 0 with FALSE does not count), Simple
   Error Handler (its own dialog, with OK), Error Cluster From Error Code,
   Explain Error and the error constant.
5. **The error texts are our own.** LabVIEW's are in NI files of its installation:
   they are not copied (like the captures, DT-035 §8). LabVIEW's **codes** are used
   (they are data: 7 is "file not found") with a text written in Solder, in
   `core/runtime/error-codes.mjs`, with the same structure
   ("Possible reason(s):", several reasons separated by `=====`, the paragraph for an
   undefined code).
6. **Errors are values, not exceptions.** They travel along the wire like any
   cluster; WebAssembly exceptions are not used for this.

### Consequences

a. The String functions that in LabVIEW carry `error in`/`error out` gain them.
   Hardware and file I/O will be born with them.
b. The panel gains the Error In and Error Out controls and the editor, its two
   dialogs (the automatic one and that of Simple Error Handler).
c. spec/04 §8 is rewritten: it stops being "any error stops the VI".


## DT-044

**Multidimensional arrays: how their type is written and how they are stored.**

- **Status:** **Accepted on 2026-10-03** by the developer, after comparing the
  two options against LabVIEW's own documentation ("whichever respects
  LabVIEW's philosophy more").
- **Complements:** [DT-042](#dt-042) (memory of strings, arrays and clusters).

### How LabVIEW does it (NI documentation)

1. **The type of an array is an element type plus a dimension count.** The
   array type descriptor is the type code 0x40, a word with the number of
   dimensions, the size of each one and then the element's descriptor; "the
   element type can be any type except an array" (*Type Descriptors*).
2. **There are no arrays of arrays.** NI has an error for it ("Type definition
   cannot have array of arrays"); the workaround is an array of clusters that
   contain arrays.
3. **In memory, one block:** "the size of each dimension of the array in 32-bit
   integers followed by the data", with padding so that the first element is
   aligned; handle 0 is the empty array (*How LabVIEW Stores Data in Memory*).
4. NI publishes no maximum number of dimensions (the descriptor field is a
   16-bit word); what LabVIEW 2026 Q3 allows is measured in the VM.

### Decision

1. **Type:** `{ array: E, dims: N }`, with `dims` left out when it is 1, so every
   1D array already written stays the same. `E` is never an array. Wherever an
   array of arrays would appear —an indexed output tunnel that receives
   arrays, Build Array of arrays without Concatenate Inputs— the type gains a
   dimension instead (`arrayOf` in `core/model/types.mjs`), and one index takes
   one away (`withoutOneDimension`).
2. **Catalog:** a port `{ array: X }` takes only one dimension. A port
   `{ array: X, dims: "any" }` takes an array of any dimensions and binds `X` to
   what is left after one index (a 2D gives `X` = a 1D row); this is how the
   indexed tunnels are declared.
3. **Memory:** a single block `[size of each dimension I32][padding to 8][elements]`,
   the elements in row order (the last dimension varies fastest). The 1D
   block of DT-042 d is the case of one dimension; a 2D needs no padding.
4. **A row or a column taken out** (Index Array with fewer indices than
   dimensions, a loop indexing a 2D) is copied into the node's own buffer;
   avoiding that copy belongs to inplaceness (DT-042 §5).

### Consequences

a. spec/03 §3 and the `.qvi` schema stop allowing arrays of arrays.
b. Each array function declares which dimensions it accepts, as LabVIEW does:
   most 1D functions (Sort, Search, Reverse…) break the wire with a 2D.
c. The panel reads and writes an N-dimensional array as a typed view plus its
   sizes.

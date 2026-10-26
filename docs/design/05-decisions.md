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
| [049](#dt-049) | The items of an enum are its type; one Edit Items… for constant, control and indicator | Accepted · being implemented |
| [060](#dt-060) | An array is born without an element type, and its element gives it one | Accepted · implemented in the editor |
| [061](#dt-061) | One scheduler of our own decides which clump runs next; how a clump is suspended depends on the host | Accepted · not implemented |
| [064](#dt-064) | Hardware before Core 1: VISA, then a classic ESP32 as a DAQ by SCPI, then a DAQmx-like layer; instruments simulated with Crucible | Accepted · not implemented |
| [065](#dt-065) | Our own VISA in Rust: a library crate, an N-API addon run in a `utilityProcess`; no NI-VISA | Accepted · being implemented |
| [062](#dt-062) | Until 1.0 every beta is published from `main`: a feature raises MINOR, a fix raises PATCH | Accepted · in use |
| [063](#dt-063) | A Run uses every core: a pool of workers over one shared memory; independent Runs keep separate memories | Accepted · not implemented |

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
e. `cli/solder.mjs` and `npm test` pass `--experimental-wasm-jspi` only to a Node that lacks JSPI without
   it (`cli/jspi.mjs`): Node ships JSPI from 24.20 on and Node 26 refuses the flag (DT-061, "What was
   measured" 1). A VI with no waits also runs without it.

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

## DT-045

**SubVIs: how a call is compiled, how its state lives and how the file refers to it.**

- **Status:** **Accepted on 2026-10-03** by the developer, after researching LabVIEW's
  model and having the premises checked again by an independent review
  (11 of 12 confirmed; the path search, partly).
- **Complements:** [DT-040](#dt-040) (clumps and JSPI), [DT-041](#dt-041),
  [DT-042](#dt-042) (data space).

### How LabVIEW does it (NI documentation, LabVIEW Wiki, NI forums)

1. **Each VI is compiled separately**, and a call to a subVI is a call into its
   compiled code. A statically linked subVI is loaded into memory with its caller.
2. **A new VI is non-reentrant by default:** it has a single data space for its
   parameters, its temporary values and the state it keeps between calls, and
   simultaneous calls are serialized ("callers take turns"). *Measured on
   2026-10-10* (`Two Calls.vi`, two parallel calls of the non-reentrant
   *Simulated Instrument* with different commands): each call answers its own
   command, so the turn covers the whole call —inputs written, code run, outputs
   read—, not only the run. Solder entered the turn after writing the inputs and
   mixed them (bug #30); test "two parallel calls to a non-reentrant subVI that
   waits each get their own inputs" in `test/core/subvis.test.mjs`.
3. **That state survives between calls** —an uninitialized shift register keeps
   its value: the "functional global variable"— and also **between runs of the
   top-level VI, while the VI stays in memory**; it is lost when it is unloaded.
4. **Reentrant VIs use clones**, each with its own data space: *preallocated*, one per
   call site, which keeps its own state; *shared*, a pool allocated on demand,
   with no per-call-site state.
5. **Recursion**, direct or mutual, requires shared-clone reentrancy; with
   preallocated clones LabVIEW reports a broken recursive cycle.
6. **Inlining** is an option the user enables; it requires preallocated clones,
   forbids recursion, ignores priority and reentrancy, and disables automatic
   error handling and debugging.
7. **A subVI node** runs when all its inputs have arrived and gives all its
   outputs when the whole subVI has finished. An unwired input takes the default
   value of the subVI's control, as saved; an unwired **Required** input breaks the
   caller.
8. **The caller stores the subVI's path relative to itself.** On load, LabVIEW looks
   first in memory by name, then at that path, then in the VI search paths.
9. The default connector pattern is 4×2×2×4, twelve terminals (to be measured
   in the VM).

### Decision

1. **One WebAssembly module per hierarchy**, the equivalent of LabVIEW's static
   linking: every VI that the top-level VI uses is compiled into it, **each with its
   own functions and its own data space** (its cells, constants and buffers),
   never copied into its callers.
2. **The call:** a subVI without long nodes is a direct `call` between functions of
   the module. One that waits (Wait, loops, I/O) is a long node of its caller: the
   call suspends with JSPI and the host runs the subVI's clumps with the same
   scheduler as the top-level VI (DT-040). Inputs go into the subVI's data space;
   outputs are read from it when it ends.
3. **Non-reentrant by default:** one data space for all the call sites, and
   simultaneous calls wait in a queue in the host.
4. **Preallocated clone reentrancy:** one data space per call site. Shared clones,
   recursion and inlining are left for later; a recursive cycle, direct or mutual,
   is a compile error with its reason ("not yet"), as LabVIEW breaks a recursive
   cycle without shared clones.
5. **State between runs:** the instance of the module, with its data spaces,
   survives between Runs while the hierarchy is loaded in the editor, as DT-042 e
   anticipated; it is discarded when a VI of the hierarchy is edited (it must be
   recompiled) or closed. What "unloaded" means in the editor is measured in
   LabVIEW before closing this point.
6. **The file:** the `subvi` node keeps the path of the `.qvi` relative to the
   caller (`config.vi`). The `connector` of the `.qvi` stores the pattern, which
   control or indicator is in each terminal, and whether it is Required,
   Recommended or Optional. The ports of a `subvi` node come from that connector, by
   a single core function (spec/03 Rule 4). Search on load: VIs already loaded by
   name, then the relative path; the search paths, later.
7. **In stages:** (a) the core —format, catalog of a hierarchy, compiled call,
   reentrancy, the command line—; (b) the editor —several VIs open, connector pane,
   placing a subVI, opening it with a double click—; (c) the icon editor.

### Consequences

a. The compiler receives the hierarchy (a function that loads a `.qvi` by path)
   and the catalog resolves the ports of each `subvi` node from it.
b. The editor's main process stops being "one VI, two windows" and keeps a set of
   open VIs, each with its own windows.
c. The host keeps a queue per non-reentrant VI and the module instance between Runs.

## DT-047

**Debugging: how the compiled VI reports what it does and stops.**

- **Status:** **Accepted on 2026-10-09** by the developer, after researching how LabVIEW does it.
- **Complements:** [DT-039](#dt-039) (pure WebAssembly, no interpreter), [DT-040](#dt-040) (clumps, JSPI).

### How LabVIEW does it

1. **Allow Debugging** (VI Properties ▸ Execution, on by default) "causes extra code and data to be generated
   for the VI" to set breakpoints and single-step; turning it off removes them, making the VI smaller and
   slightly faster (LabVIEW Wiki, *Execution.Allow Debugging*).
2. Because that code is always there, Highlight Execution can be turned on before, during a Run or at a
   breakpoint.
3. Highlight Execution slows the code down and runs parallel code sequentially in a single thread
   (LabVIEW Wiki, *Execution highlighting*).
4. LabVIEW 2026 Q3 (`labview-captures/debugging/REPORT.md`): one Debug Window holds probes and
   breakpoints; Retain Wire Values lets a probe added later show the last value; four highlight speeds.

### Decision

1. **One compilation with debug hooks**, as Allow Debugging: after each node, the code reads a global
   "debugging" flag and, only when it is set, calls the host with the node and the values of its outputs
   (one import per value type). Unset, the hook costs a load and a branch per node. With Allow Debugging off
   (`vi.execution["allow-debugging"]: false`) the compiler emits no hooks.
2. **The host sets the flag** when Highlight Execution, a probe or a breakpoint is active, also in the
   middle of a Run.
3. **Stopping** (a breakpoint, Step Into/Over/Out, Pause) suspends the hook with JSPI until the user
   continues, as Wait (ms) does; Highlight Execution delays each node by the measured speed.
4. **With Highlight Execution the host runs one clump at a time**, as LabVIEW's single thread.
5. **Retain Wire Values** keeps the last value of each wire in the host.
6. No interpreter: the debugged program is the same compiled program.

### Editor side (2026-10-09)

Done in `editor/src/debugging/`; the rules are spec/05 §16. Decisions taken there:

1. **"Before" a node.** The hook is after the node, LabVIEW stops before it. The run worker's controller counts the values that reach each node
   from reporting nodes and stops in the report that makes a node ready; constants stop right after. Borders of structures report too
   since 2026-10-16 (spec/05 Rule 90b): as a source of values, counted once per source, but never a place to stop.
2. **The Debug Window and the Error list are floating windows of the Block Diagram**, drawn in the page like the other dialogs, not
   operating-system windows. The Front Panel asks the diagram to open them.
3. **The state is shared by the two windows of a VI** over the BroadcastChannel (`debugState`, `debugEvent`, `workerMessage`); the worker
   belongs to the window that launched the Run.
4. **Probes and breakpoints are not saved** in the `.qvi`; `vi.execution["allow-debugging"]` is (only when false).
5. **Highlight pace** = longest outgoing wire over a speed in px/s, with a floor per node; Fast and Very Fast are extrapolated (unverified).

## DT-048

**How Solder's versions are numbered.**

- **Status:** **Accepted on 2026-10-09** by the developer.

### Decision

1. **Semantic versioning with an alpha label while unstable:** `0.MINOR.PATCH-alpha`. A release that adds
   features raises MINOR (`0.2.0-alpha`); one that only fixes things raises PATCH (`0.1.1-alpha`).
2. The `0.` and the `-alpha` label say that neither the language nor the `.qvi` format are stable. The
   maintainable version (plan, "Road to a maintainable version") changes the label to `-beta` and stays
   a `0.x`: there is no 1.0 planned (decided 2026-10-09).
3. Four numbers (as Java's `FEATURE.INTERIM.UPDATE.PATCH`) and the year as a number were considered:
   npm and Electron only accept three numbers, and the label says "unstable" more clearly than the `0.`.
4. Each release has a git tag `v<version>` and an entry in `CHANGELOG.md`; the version lives in
   `package.json`.

## DT-046

**Broken wires: a wire may keep one loose end.**

- **Status:** **Accepted on 2026-10-09** by the developer; the open facts were measured the same day
  (`labview-captures/broken-wires/REPORT.md`) and are folded into points 2 and 4.
- **Why now:** step 1 of the "Road to a maintainable version" (plan): a valid `.qvi` must always open, and
  this is the last change of the file format before it is frozen.

### What LabVIEW does (measured)

1. Deleting a control on the front panel leaves its wire on the diagram, broken: dashed black with a red
   cross, still attached to the terminal that remains
   (`labview-captures/create-paste/panel-delete-control-diagram-leaves-broken-wire.png`).
2. Ctrl+X on the diagram takes the node and its wires, leaving nothing broken.
3. Edit ▸ Remove Broken Wires (Ctrl+B) clears broken wires. A VI with a broken wire does not run; the
   Error List shows it.

### Decision

1. **Model:** one end of a wire may be a point of the diagram instead of a terminal: `{ suelto: [x, y] }`,
   where the terminal was.
2. **When a loose end appears:** deleting a control or indicator on the panel; **Delete on the diagram**
   (a node, a constant or a structure with its tunnels: every wire to the rest stays, broken — measured;
   Ctrl+X instead takes the wires); opening or refreshing a VI whose subVI no longer has the port a wire went
   to — that VI **always opens** and is not marked modified (measured).
3. **Types and compiler:** a wire with a loose end is broken, with a clear reason; the VI does not run and
   the Error List shows it.
4. **Editor:** drawn as in LabVIEW (1 px black dashes 4/4, a red cross near the middle flanked by two
   arrowheads in the colours of the ends, nothing at the loose end); selected and deleted like any wire;
   Ctrl+B removes every broken wire, or with a selection only the broken wires selected; the wiring tool
   re-wires a loose end onto a terminal (all measured). The reasons tell apart a wire with no source and one
   that reaches nothing, in our own words.
5. **File:** a loose end is saved as `{ "loose": [x, y] }` in `from` or `to`. Existing files stay valid.

Rejected: dropping the wires that no longer fit when a VI is opened — simpler, but it loses information
without telling and it is not what LabVIEW does.

## DT-049

**The items of an enum are its type; one Edit Items… for constant, control and
indicator.**

- **Status:** Accepted on 2026-10-14 by the developer: option 1 of the study presented (items in the
  type), with B decided as "always like LabVIEW" and the dialog's five tabs present, the other four
  greyed. **Implemented the same day** (spec/05 Rule 40l, spec/04 Rule 17e amended). Implements
  finding #32 of [`real-programs-0.2.md`](real-programs-0.2.md) for `0.3.0-alpha`.
- **Complements:** [DT-038](#dt-038) (the enum type and its conversions), [DT-035](#dt-035) (menus
  and dialogs clone LabVIEW, gaps greyed with their reason).
- **Measured:** [`labview-captures/reports/2026-10-14-enum-edit-items.md`](../../labview-captures/reports/2026-10-14-enum-edit-items.md)
  (dialog, menus, panel look, item-edit behavior, Case after item edits, Ring & Enum subpalette) and
  [`labview-captures/reports/2026-10-14-enum-edit-items-2.md`](../../labview-captures/reports/2026-10-14-enum-edit-items-2.md)
  (value clamped into range, Add Item After/Before, Remove Item, Select Item…, the fresh constant's caret).

### Decision

1. **The items live in the type**: `config.type = { enum: [names] }` of the node — the `enum-const`
   on the diagram and the panel `control`/`indicator` with an enum type. No separate `config.items`
   (that is the ring's, whose values are data, not type). Two enums with different items are
   different types. No schema change for the type itself.
2. **The enum's value is the item index** (U16). Deleting an item does not clamp it (measured: value
   2 with "Cool" deleted shows "Done"); when the value falls out of range — deleting the last item —
   it clamps into range (measured: shows "Init", value 0). Create ▸ on an enum terminal copies the
   terminal's items.
3. **A fresh enum is born with one empty item**, value 0 (measured: one empty row; Solder used to
   birth zero items).
4. **Edit Items…**: one dialog for the three kinds, cloned from the measurement — 500 × 500, five
   tabs (Appearance, Data Type, Display Format, Edit Items, Documentation; the other four present and
   greyed with their reason), Items|Values list with Values sequential and read-only, Insert / Delete
   / Move Up / Move Down, "Allow undefined values at run time" greyed, OK / Cancel / Help. Enter
   commits and inserts an empty row below; duplicates, empty names and any characters are accepted
   verbatim; Delete goes by the name and not by the row count — measured again on 2026-10-15
   ([`2026-10-15-enum-delete.md`](../../labview-captures/reports/2026-10-15-enum-delete.md)) because
   the two reports of 2026-10-14 contradicted each other and both were half right: it works whenever
   a row is chosen, except on a single row whose name is empty, and on the last row it empties that
   row instead of removing it, so an enum never has zero items. The dialog edits `config.type.enum`
   through a core operation (DT-035 §6).
5. **Menus**: the enum constant gets its own node menu (this fixes #32's right-click bug) and the
   panel control and indicator theirs, with the measured rows and order; only what is done is
   enabled, the rest greyed saying why. Add Item After / Before (an empty item made current with an
   inline name editor), Remove Item (removes the current item; the last one can never be removed)
   and Select Item… (a filter window; Enter commits) are measured (second report) but stay greyed
   until a program needs them.
6. **The panel**: Controls ▸ Modern ▸ Ring & Enum breaks down into its five measured entries (Text
   Ring, Menu Ring, Enum, Pict Ring, Text & Pict Ring); only **Enum** is built: 61 × 25 px showing
   the item's name, arrows on the left (control), grey interior `#d2d2d2` without arrows (indicator);
   terminal and wire blue `#0000ff`. The four Ring entries stay `todo`.
7. **The Case, like LabVIEW**: the frames of an enum selector store the **item name** (the schema
   for those frames takes strings). A rename in Edit Items propagates to the frames of the Cases fed
   by that enum; a deletion leaves the stale name, drawn in red, and breaks the Case with
   «Case Structure: Selector values have wrong type»; the wire stays whole (measured). A number typed
   in the selector resolves to that item's name.
8. **The ring does not change**: its dialog and menu differ (measured: Sequential values, Allow
   undefined values enabled, Data Entry tab); `ring-const` keeps `config.items`.

### Consequences

a. The panel `control`/`indicator` with an enum type draw as enums (name and arrows; grey without
   arrows), without new block types; Create ▸ Indicator on an enum wire — what *Oven Controller*
   does — comes out right.
b. Enum Case frames change from numbers to names in the `.qvi`. No real file carries them (the
   examples used I32 states and `0.3.0-alpha` is four days old) and the format is an unstable `0.x`
   (DT-048).
c. The Edit Items dialog is drawn in the page, like the Debug Window (DT-047, editor side 2).
   What a key or a click means for it is decided in its own module and in
   `editor/src/window/modal-dialog.mjs`, which also took over the Chart History dialog: the window
   shell only applies the intent it is given. It is that way since the review of 2026-10-14, which
   found that the shell had taken Enter for OK — so the measured Enter could not be reached — and
   that the dialog shared its state field with the chart one; `test/editor/modal-dialogs.test.mjs`
   is the test of that seam, which no test used to cross.
d. The inventory breaks `palette.controls.modern.ring-and-enum` into its five entries and `Enum`
   becomes `built` with its test; `palette.functions.programming.numeric.enum-constant` gets its
   real proof (its `built` was the false green of #32).

### Verification

| What | Mechanism | Status |
|------|-----------|--------|
| The items are the type; a fresh enum is born with one empty item; the value stays and only clamps into range | `test/core/enum-items.test.mjs` | **Verified** (2026-10-14) |
| Rename propagates to frames (through shift registers); a deletion leaves the stale name and breaks the Case with LabVIEW's reason; the wire stays whole | `test/core/enum-items.test.mjs`, "a frame whose item was deleted…" in `test/core/structures.test.mjs` | **Verified** (2026-10-14) |
| An enum Case compiles its frames by name (a number resolves to the item's name) | `test/core/structures.test.mjs`, `test/editor/case-selector-kinds.test.mjs` | **Verified** (2026-10-14) |
| The dialog, the menus and the panel look | `test/editor/enum-edit.test.mjs` | **Verified** (2026-10-14) |
| A `.qvi` with items and enum frames by name round-trips | "a .qvi with enum items and enum frames by name round-trips" in `test/core/enum-items.test.mjs` | **Verified** (2026-10-14) |

## DT-050

**Unbundle By Name stores the names of its rows; their types come from the wire.**

- **Status:** Accepted on 2026-10-15 by the developer ("the most similar approach to LabVIEW").
  Implements the core of finding #23 of [`real-programs-0.2.md`](real-programs-0.2.md) for
  `0.3.0-alpha`: reading `status` from an error cluster, which *Instrument Protocol* needs.
- **Complements:** [DT-042](#dt-042) (clusters in memory), [DT-043](#dt-043) (the error cluster),
  [DT-044](#dt-044) (a node that adapts to what is wired, as Index Array does).
- **Measured:** [`labview-captures/reports/2026-10-15-cluster-palette.md`](../../labview-captures/reports/2026-10-15-cluster-palette.md)
  (the subpalette, the four nodes unwired, their context help) and
  [`labview-captures/reports/2026-10-15-unbundle-by-name.md`](../../labview-captures/reports/2026-10-15-unbundle-by-name.md)
  (wired to an error cluster: rows, growth, menus, unwiring, run).

### Decision

1. **The `.qvi` keeps only the names**: `config.items` of an `unbundle-by-name` node is the name each
   row shows, top to bottom, `null` for a row not named yet. No cluster type is written: the file
   stores only the diagram (rule 4 of CLAUDE.md), and a stored type could go stale when the source
   cluster changes.
2. **The types come from the wire**, as in LabVIEW: the input binds only a cluster, and each output is
   the element of that name in it. Unwired, the names stay (measured) and the outputs have no type, so
   the VI cannot run (measured: the Run arrow breaks).
3. **Naming follows LabVIEW**: when a cluster is wired, or the node grows, a row with no name takes the
   element after the row above it, and past the last element the last again (measured). Rows that
   already have a name keep it.
4. **Outputs are named by row** (`element-0`, `element-1`…), so a wire stays on its row when Select
   Item changes the element. Remove Element renumbers the wires of the rows below.
5. **Bundle, Unbundle and Bundle By Name** are not changed by this decision: the plain two still carry
   `config.type`, and they get their own decision when the palette entries are built.

### Consequences

a. `blocks.json` gains `unbundle-by-name` with the port types `clusterOf` and `fieldOf`; `qvi.schema.json`
   gains `config.items` (also documenting the ring's).
b. The editor draws the rows, their click list, the row and body menus and the growth (spec/05), from the
   same measurement.

### Verification

| Statement | Mechanism | Status |
|-----------|-----------|--------|
| A fresh node has one unnamed row and no output; wiring names it after the first element | `test/core/unbundle-by-name.test.mjs` | **Verified** (2026-10-15) |
| Growth names rows after the one above and repeats the last element | `test/core/unbundle-by-name.test.mjs` | **Verified** (2026-10-15) |
| Each row gives its element when run (TRUE, 42, `abc`), also after Select Item | `test/core/unbundle-by-name.test.mjs` | **Verified** (2026-10-15) |
| Unwired, the names stay and the VI cannot run; a non-cluster breaks the wire | `test/core/unbundle-by-name.test.mjs` | **Verified** (2026-10-15) |
| Remove Element renumbers the rows below | `test/core/unbundle-by-name.test.mjs` | Tested here; in LabVIEW only the last row was measured |
| A `.qvi` with `config.items` validates and round-trips | `test/core/unbundle-by-name.test.mjs` | **Verified** (2026-10-15) |

## DT-051

**The file extensions share the root `sd`: `.sdg` for a diagram, `.sdt` reserved for the textual
language, `.sdproj` for a project and `.sdlib` for a library.**

- **Status:** Accepted on 2026-10-15; the developer asked for the change, left the choice of the pair to
  the main session ("decide tú") and fixed the root for the others: the project is `.sdproj`, "lo
  común es sd". **Implemented the same day** for the VI (editor, CLI, installer, examples); the
  project and library formats do not exist yet, so for them only the name is decided.
- **Why change:** `.qvi` reads as LabVIEW's `.vi`; Solder clones LabVIEW's interface (DT-035) but is
  its own language, and its files should not be mistaken for NI's.
- **Why a pair:** a textual Solder language is planned far in the future, once the graphical one is
  stable. The two extensions share a root and differ by one letter, as `.js`/`.jsx` or `.md`/`.mdx`
  do: `g` for graphical, `t` for text. `.sdt` is reserved now so the graphical one never has to move
  again.

### Decision

1. **`.sdg`** (Solder Graphical) replaces `.qvi` for a VI: the diagram, its panel and its connector, as
   the `.qvi` stores them today (the content and `qvi.schema.json` do not change with the name).
2. **`.sdt`** (Solder Text) is reserved for the future textual language. Nothing reads or writes it yet.
3. **`.sdproj`** replaces `.qproj` for a project and **`.sdlib`** replaces `.qlib` for a library: every
   Solder extension starts with `sd`. Neither is in shared-mime-info.
4. **Old files still open**: a `.qvi` opens as before. **Saved in place (Ctrl+S) it keeps its name**,
   because its callers name it with that extension and renaming it would break them; Save As offers
   the same name with `.sdg`. A `.sdg` caller can call a `.qvi` subVI and the other way round. The
   installer associates both extensions and its uninstaller removes both.
5. **Only the extension changes**: the content, `qvi.schema.json` and the reader
   `core/model/qvi-format.mjs` keep their names; renaming those is a cleanup of its own.

### Alternatives studied (2026-10-15)

| Pair | Against it |
|------|------------|
| `.sdv` / `.sdc` (visual / code) | `.sdc` is Synopsys Design Constraints, the live standard of timing constraints in chip and FPGA tools (Quartus, Efinity, Synplify), next to Solder's own field; shared-mime-info already maps `*.sdc` to StarOffice Calc |
| `.sdr`, `.sold`, `.solder` alone | No room for the textual twin |
| `.sld`, `.sol` | `.sld` is OGC's Styled Layer Descriptor; `.sol` is Solidity |
| `.sdp` for the project | shared-mime-info maps it to the Session Description Protocol and StarOffice Impress |
| `.sdgproj` for the project | Free, but breaks the common `sd` root the developer chose |

`.sdg` (Golden Software Strater projects, StarOffice galleries) and `.sdt` (SmartDraw 6 templates, the
audio of old Electronic Arts games) collide only with obsolete or niche formats, and neither is in
shared-mime-info.

### Verification

| Statement | Mechanism | Status |
|-----------|-----------|--------|
| Save As writes `.sdg` unless a VI extension is chosen; both extensions name a VI file; the debugger and the error chain drop either | "Save As writes .sdg…" and "both extensions name a VI file…" in `test/editor/vi-paths.test.mjs` | **Verified** (2026-10-15) |
| Every example is a `.sdg` and every subVI it calls exists | "every example is a .sdg…" in `test/editor/vi-paths.test.mjs`; `cli/solder.mjs check` on each | **Verified** (2026-10-15) |
| A `.sdg` caller runs a `.qvi` subVI; a missing subVI is reported | `cli/solder.mjs check` on a copy of Temperature Monitor (2026-10-15) | **Verified** by hand, no test |
| The Windows installer associates `.sdg` and `.qvi` and the uninstaller removes both | the next installer test in the VM | **Pending** |

## DT-052

**Solder has LabVIEW's Getting Started window: it starts on it, and it comes back when the last VI closes.**

- **Status:** Accepted on 2026-10-15. Closing the last VI with File ▸ Close or Close All had to do
  something, and LabVIEW shows its Getting Started window; asked between quitting, opening a blank VI
  and cloning that window, the developer chose to clone it. Measured the same day
  (`labview-captures/reports/2026-10-15-file-close.md`, `2026-10-15-getting-started.md`).

### Decision

1. **Start.** Without a file, Solder starts on the Getting Started window, as LabVIEW does. Started with a
   VI file (a double click in the file manager, `SOLDER_ABRIR`), it opens only that VI. The captures for
   the comparisons (`SOLDER_CAPTURAS`) still start on a new VI.
2. **Lifecycle.** Opening or creating a VI hides it; closing the last VI shows it again, on the next
   carousel page; closing it with no VI open quits Solder without a question. Closing it while VIs are open
   only hides it (**unverified** in LabVIEW). View ▸ Getting Started Window... shows it from any VI.
3. **Layout, 1:1.** Its menu bar (File, Operate, Tools, Help), the three panels (Create Project, Open
   Existing with its recent list and filter, the carousel with its pager and collapse button) and the two
   captions, at the measured places and colours. What Solder does not do is greyed with its reason
   (DT-035): Create Project and the templates (no projects yet), Operate, Tools and most of Help.
4. **Texts and images of its own.** The product name is Solder with its version, the logo is Solder's
   icon, and the eight carousel pages and the captions are written anew about Solder (CLAUDE.md rule 3);
   their links, which go to NI's web in LabVIEW, are greyed until Solder has pages to send them to.
5. **What it remembers** lives in `getting-started.json` in the user's data folder: the recent files
   (each VI opened or saved goes to the top, at most 30) and the carousel page.
   `editor/src/getting-started/start-state.mjs` has the rules, pure and shared by the main process and the
   page.

### Verification

| Statement | Mechanism | Status |
|-----------|-----------|--------|
| Recent list order and limit, the filter, the carousel wrapping | `test/editor/start-state.test.mjs` | **Verified** (2026-10-15) |
| Start, hide, come back on the last close, quit on its X; the carousel moving on | the editor under Xvfb, driven by the labview-driver agent (`labview-captures/solder-close-check/`, 2026-10-15) | **Verified** by hand, no test |

**Known differences:** the dialogs are the system's, so on a Spanish desktop their Cancel reads "Cancelar"
(the Exit dialog too); the first show on a new user-data folder is page 2, since the page moves on before
each show.

## DT-053

**A front-panel object has a current value and a default value; only the default is saved.**

- **Status:** Accepted on 2026-10-15, after measuring what the proposal left open. Item C4 of
  `docs/design/real-programs-0.3.md` §3. In LabVIEW 2026 Q3 a value typed into a control in edit mode is only
  its current value, an undoable "Data Change", gone after save and reopen; Solder kept a single value per
  control, so typing changed what the file saves (spec/05 Rule 40m). Measured in
  `labview-captures/reports/2026-10-15-editor-gestures.md` §5 and `2026-10-15-default-values.md` (stages 1 and 2).

### Decision

1. **Two values in the model.** A panel object's `config.value` stays its **default**: what the `.sdg` saves as
   `default`, what the modified mark compares, and what a VI opened from a file starts with. Its **current
   value** lives in `node.currentValue`, outside `config`, so `qvi-format.mjs` never writes it; absent means
   "the same as the default". The `.sdg` format does not change. Measured: a typed value is not saved; a value
   made default is.
2. **Pure operations in `core/model/control-values.mjs`:** `setCurrentValue`, `makeCurrentValuesDefault(graph,
   ids)` (each current value becomes the default and is dropped) and `reinitializeToDefault(graph, ids)`
   (drops it); `startValue` is the current value, or the default. Representation, Edit Items and Add/Remove
   Dimension carry the current value along with the default.
3. **Editing.** Operating a panel object in edit mode changes only its current value: one undo step, without
   the modified mark (measured: "Undo Data Change", no asterisk). Constants on the diagram keep one value.
4. **The commands, as measured.** Edit ▸ Make Current Values Default and Reinitialize Values to Default act on
   every panel object; on the panel, with a selection, they read Make Selected Values Default and Reinitialize
   Selected Values to Default and act only on it. Both are always enabled. Data Operations ▸ Reinitialize to
   Default Value and Make Current Value Default act on the object right-clicked, control or indicator. Each is
   one undo step; Make … Default marks the VI modified (it changes the file) and Reinitialize does not.
5. **Run.** The Run starts from the current values, and the controls keep what was operated during it
   (measured: 8 typed while running still shows after the Run); a Latch that was read is FALSE again. When
   the Run ends, what the indicators show becomes their current value, since Make Current Values Default makes
   it their default (measured); the Run's changes are one undo step (**unverified**). The graph is no longer
   put back at the end of a Run, and Save needs no special case: `graphAsSaved` and `defaultsBeforeRun` go.
6. **Greyed, with their reason (DT-035):** Cut Data (greyed in LabVIEW too, in edit mode), Copy Data and Paste
   Data until Solder has a data clipboard ("copiar-datos"; LabVIEW's is its own, no text arrives elsewhere). The
   charts' and graphs' Make Current Value Default and Reinitialize to Default stay to do: their data is history,
   not a value.

### Consequences

- spec/05 Rule 40m is rewritten: operating a control, in edit mode or while running, changes its current value;
  only Make … Default changes what the file saves.
- The examples keep their saved defaults (`test/end-to-end/examples.test.mjs`); a file opened has no current
  values.
- The undo label is "Undo" for every step in Solder; LabVIEW's names ("Data Change") are not cloned yet.

### Verification

| Statement | Mechanism | Status |
|-----------|-----------|--------|
| A typed value is not saved; the commands set and restore the default, for all or some objects | `test/core/control-values.test.mjs` | **Verified** (2026-10-15) |
| Data Operations and the Edit menu rows, labels and scope | `test/editor/default-values.test.mjs`, `test/editor/edit-menu.test.mjs` | **Verified** (2026-10-15) |
| A Run keeps the operated values and gives the indicators theirs | `test/editor/run-values.test.mjs` | **Verified** (2026-10-15) |
| The menus in the running editor | the editor under Xvfb (`labview-captures/reports/2026-10-15-solder-default-values.md`) | **Verified** by hand, no test (2026-10-15) |

## DT-054

**The beta is released when Solder can do LabVIEW Core 1, except what needs hardware.**

- **Status:** Accepted on 2026-10-16 by the developer; **moved after the beta the same day** (DT-055): Core 1
  is the first goal after `0.4.0-beta`, not a condition for it.

### Decision

1. **NI's LabVIEW Core 1 course is the yardstick for the beta.** Every lesson must be possible in Solder:
   the student can build, run and debug what the lesson asks for, with the same windows, menus and
   behavior as LabVIEW (DT-035).
2. **What needs hardware is left out:** lesson 2 (First Measurement, NI DAQ device), lesson 15 (First
   Measurement, non-NI instrument) and the DAQ and instrument parts of lessons 4, 7 and 8. Their
   acquire-analyze-visualize exercises are done with simulated data (for example a generated signal) instead.
3. **The guide is the public outline only.** Lesson and topic names come from NI's course overview pages,
   kept locally in `labview-captures/core-courses/README.md`. The course manuals are paid NI material and are
   not used; each exercise is written anew (rule 3) and measured in LabVIEW before it is cloned (rule 2).

### Consequences

- Core 1 lessons that Solder does not cover yet become work for the beta, for example LabVIEW projects
  (lesson 3), file I/O and paths (lesson 9) and type definitions (lesson 13); the gap is listed in the plan.
- Core 2 and Core 3 are a later guide, not a beta requirement.

### Verification

| Statement | Mechanism | Status |
|-----------|-----------|--------|
| Each Core 1 lesson (without hardware) can be done in Solder | one example per lesson, run in the end-to-end tests | **Unverified**: the examples do not exist yet |

## DT-055

**The beta is released now, with steps 1–5 of the road; Core 1 comes after it.**

- **Status:** Accepted on 2026-10-16 by the developer ("I want a beta this weekend").

### Decision

1. **`0.4.0-beta` is released the weekend of 2026-10-17**, when step 5 (the `.sdg` format frozen as version 1) is
   done, instead of in 2027. It is the maintainable version of DT-048: it keeps the files it saves.
2. **LabVIEW Core 1 without hardware (DT-054) is no longer a condition for the beta**: it is the first goal after
   it, in `0.x-beta` releases that add features.
3. **The month of maintenance** that the road gives the beta (`0.4.x-beta`, fixes only) starts with the release.

### Consequences

- From `0.4.0-beta` on, every change to the `.sdg` format raises its version and comes with an automatic migration
  (spec/02 §4.1), since users now keep files.
- The plan's step 6 becomes the first item after the beta.

### Verification

| Statement | Mechanism | Status |
|-----------|-----------|--------|
| Files of every released version open | `test/end-to-end/format-versions.test.mjs` | **Verified** when step 5 lands |

## DT-056

**Two themes: Old School (the LabVIEW clone, for development) and Solder (the default of the releases).**

- **Status:** Accepted on 2026-10-16 by the developer. It amends DT-035: the behavior stays a one-to-one clone of
  LabVIEW, but the look of a release has an identity of its own. Mockups: `docs/ideas/theme-mockups.html`.
- **Why:** an editor that looks like LabVIEW at a glance is too close to NI's trade dress, even with no NI bitmap,
  and does not say "Solder".

### Decision

1. **A theme changes only the look:** colors, typography and the window chrome (toolbar, menus, dialogs). Names,
   order, shortcuts, geometry (sizes, positions, margins) and behavior are the same in every theme, so what was
   measured in LabVIEW stays valid and the geometry tests are not duplicated.
   *Amended on 2026-10-17:* a theme may change the **shape** of a node (rounded corners, another outline, a circle
   for a triangle), but never the **space it takes**: each node keeps its bounding box and its terminals where they
   are, and that is not negotiable. Wires keep their path; their stroke width is look.
2. **Old School** is the current look, cloned from LabVIEW 2026 Q3 pixel by pixel; the measurements and the tests of
   colors are checked against it. `npm run app` starts in it. It is never called "LabVIEW" in the editor.
3. **Solder** is the default of the releases: the **Workbench** style of the mockups — a light canvas with a
   breadboard dot grid, white nodes with a thin graphite border and slightly rounded corners, an orange "solder"
   accent for the selection. *Amended on 2026-10-17:* it keeps the fonts of Old School (Inter and JetBrains Mono
   of the mockups are not shipped).
4. **Nodes stay neutral and the wires and terminals carry the color of their type**, as in LabVIEW. **The type colors
   are LabVIEW's standard ones in every theme** (DBL orange, integers blue, Boolean green, string pink…): they are
   meaning, not decoration.
5. **Light only for now**, with the tokens ready for a dark variant.
6. **The theme is chosen** by the environment variable `SOLDER_THEME` (`old-school` or `solder`), with no option
   in the interface for now (amended on 2026-10-17; Tools ▸ Options comes later). Without it, development
   (`npm run app`) starts in Old School and a packaged release in Solder.
7. **The Front Panel.** In Old School its controls are LabVIEW's, as now (*amended on 2026-10-17 by DT-058 §5:* drawn
   as the same plain HTML, with a panel style that gives them LabVIEW's look). In Solder they are plain HTML with a minimal
   CSS, and a panel style (a CSS sheet) gives them their look: **Plain** (no style: the template users start from),
   **Solder** (the default) and others shipped later. The position and size of each object belong to the VI (the
   `.sdg` keeps them); a style changes everything else. The classes and attributes of the panel's HTML (such as
   `.sd-control`, `.sd-indicator`, `.sd-numeric`, `data-label`) are a public API, frozen like the file format once
   published. Where a panel's style is chosen was decided on 2026-10-17 in DT-058: window > project > editor, with
   companion `.css` files, so the `.sdg` format does not change.
8. **The first step is to centralize the colors** into theme tokens with no visible change: Old School must stay
   identical, and the tests say so. Today there are about 95 distinct colors in `editor/src/styles.css` and more than
   1000 color literals in the glyphs and views.
9. **How the tokens are made** (decided 2026-10-17):
   - They are CSS custom properties on `:root` in `editor/src/themes/old-school.css`, loaded before the other sheets;
     a later theme redefines the same names. `styles.css` and `getting-started.css` keep no color of their own.
   - Names are in English and say the role, not the color (`--node-fill`, `--menu-border`, never `--yellow`). Two
     roles that share a value in Old School are still two tokens, because another theme may split them.
   - The glyphs and views take a token only for what a theme changes, as the Workbench mockup shows: ink, paper,
     the fill and border of nodes, chrome, canvas, selection, menus, dialogs, value tags and the Highlight Execution
     band. The drawing inside a palette icon (a die, a thermometer, an LED) stays a literal: it is illustration.
   - The type colors stay in `core/model/types.mjs` and are the same in every theme (point 4). So do the Old School
     Front Panel controls, which point 7 replaces in Solder rather than recolors, and the data-URL cursors, which
     cannot read CSS.
   - "No visible change" is shown by a test (no color literal outside the theme, no token used and not defined) and
     by a pixel-by-pixel comparison of the editor before and after.

### Kept for later themes

The other mockups were liked and are kept to be implemented later: **Neon (light)** (wires and Highlight Execution
glow while the VI runs), **Oscilloscope** (dark, scope traces), **Blueprint** (dark blue technical drawing) and
**Synthwave** (dark purple, full neon). The three dark ones wait for the dark variant.

### Verification

| Statement | Mechanism | Status |
|-----------|-----------|--------|
| Old School looks the same after the colors become tokens | `test/editor/theme-tokens.test.mjs`, the color tests through `oldSchoolToken`, and a pixel diff of the editor before and after (`labview-captures/reports/2026-10-17-theme-tokens.md`) | Verified 2026-10-17 |
| A theme changes no geometry | a test that draws a VI in both themes and compares positions and sizes | **Unverified**: not written yet |

## DT-057

**Development happens on `main`; each published beta is maintained on its own release branch, which takes only
fixes cherry-picked from `main`.**

- **Status:** Superseded by [DT-062](#dt-062) on 2026-10-23, until 1.0. Accepted on 2026-10-17 by the developer, once 0.4.0-beta was published. Chosen over keeping `main` for
  fixes and every feature on a long-lived branch (Git Flow without `develop`): features that last weeks (the HTML
  Front Panel, Core 1) would drift from `main`, every fix would have to be merged into each open branch, and
  conflicts between features would show up late.
- **Why:** the beta is the maintainable version (DT-055): whoever uses it must get fixes without half-finished
  features. This is the model of Electron and of trunk-based development with release branches.

### Decision

1. **`main` is the development line.** The plan's steps are done there. A feature that takes more than one session
   goes on a short branch `feature/<short-name>` cut from `main` and merged back as soon as it works and the tests
   are green; a small one goes on `main` directly. `main` stays green after every commit.
2. **Each published beta has a release branch** `release/0.<MINOR>`, cut from its tag (`release/0.4` from
   `v0.4.0-beta`). It receives fixes only, never features, and is **never merged back** into `main`.
3. **A fix is made on `main` first**, with a test that fails without it, and then copied to the release branch with
   `git cherry-pick -x`. Fixing on the release branch first is not done: a fix forgotten on its way back to `main`
   comes back as a regression in the next version. Only when the code no longer exists on `main` is the fix made on
   the release branch alone, and the commit says why.
4. **Fix releases come from the release branch:** raise PATCH there (`0.4.1-beta`), tag `v0.4.1-beta` on that
   branch, build and publish.
5. **A new MINOR is cut from `main`:** `release/0.5` from the commit that becomes `v0.5.0-beta`. Only the latest beta
   is supported: when 0.5 is published, `release/0.4` gets nothing more.
6. **What is a fix:** something that is broken or behaves differently from LabVIEW in what the beta already does.
   Something the beta does not do yet is a feature. When in doubt, it is a feature: it waits for the next MINOR.
7. **When to publish** (added on 2026-10-18 by the developer). A release costs the user a download and a changelog to
   read, and costs us a tag, a build and a publication, so a commit is not a release:
   - **A fix release goes out at once** when the fix is serious: the editor crashes, a `.sdg` is lost or damaged,
     a VI computes a wrong result, or a common task cannot be done. One commit is then enough.
   - **Minor fixes are batched** (drawing, texts, a rare case with a workaround): they wait on the release branch until
     a few have gathered or one to two weeks have passed, whichever comes first, and go out together, so the
     changelog tells one story instead of one version per fix.
   - **A new MINOR goes out when `main` has a coherent set of features** that can be told in one sentence and changes
     the experience against the current beta, with the tests green and tried by hand in the app; not one release per
     feature.

### How it is verified

| Statement | Mechanism | Status |
|-----------|-----------|--------|
| A release branch holds only fixes from `main` | every commit on it after its tag carries `cherry picked from` (`-x`) or says why it exists only there; checked with `git log` before each fix release | **Unverified**: process, no automatic check |

## DT-058

**Panel styles: Plain is the mother template, and a panel's style comes from its window, its project or the editor,
in that order, through companion `.css` files.**

- **Status:** Accepted on 2026-10-17 by the developer. It settles the open point of DT-056 §7. Mockup with the pattern
  the styles follow: `docs/ideas/panel-style-mockups.html`.
- **Priority (2026-10-17, the developer):** the styles that matter are the editor's: **Old School for development
  and Solder for the releases**. The window style (§1–2) is kept as it is, but it is **provisional**: it is an
  exception that will probably change once LabVIEW's own way of styling panels has been looked at, and no more time
  goes into it, nor into the project level, until then.
- **Why:** the person who programs sees the panels in the style they like, the program they ship can have a look of
  its own, and one window can still differ. Plain keeps every control usable in every style, even before a style
  draws it.

### Decision

1. **Who chooses, by priority: window > project > editor.**
   - **Editor:** the programmer's own preference, kept in their settings and never in a VI. It is the default for
     every panel they open.
   - **Project:** an alternative style for a whole project. A built executable uses the project's style if there is
     one, otherwise the editor's.
   - **Window:** one VI can carry its own style, which wins over the other two.
2. **The stylesheet goes with its file, as in Angular:** it has the same name next to it. `Oven Controller.sdg` +
   `Oven Controller.css` styles that window; `My Project.sdproj` + `My Project.css` styles the project. Nothing is
   referenced from inside the `.sdg`, so **its format does not change** (no version 2, DT-055). The `.css` is edited
   with any editor and versioned with the VI.
3. **Plain is the mother template.** Every control has a Plain version: plain HTML with the public classes
   (DT-056 §7) and a minimal CSS that makes it usable. A style is loaded on top of `plain.css` and only redefines
   what it wants; **a control a style does not draw shows as Plain**. A new control works in every style from the day
   it exists.
4. **Styles shipped:** **Plain**, **Solder** (the default of the releases) and **Solder Night** (dark, to show how a
   general template works). The dark limit of DT-056 §5 is for the editor's theme, not for panel styles.
5. **Old School is also a panel style:** LabVIEW's controls, as now. It is the default in development, so the
   clone can still be compared with LabVIEW.
   *Amended on 2026-10-17:* Old School is **a CSS sheet over Plain like the others** (`panel-styles/old-school.css`),
   not a drawing of its own. The editor draws every panel one way only, the Plain HTML; Old School's sheet gives it
   LabVIEW's look, pixel for pixel the same as the drawing it replaces. Where that look is an illustration CSS does
   not draw (the gradients of a Boolean, the incrementer's capsule, the check of an error's status), the sheet takes
   it as SVG images that go with the style, as any user's style may. **Why:** two drawings drift apart and every new
   control would have to be made twice; and if Old School, the hardest look, is reachable from Plain's markup, that
   markup is complete for any style.
6. **Until Tools ▸ Options exists**, the editor's style is chosen with the environment variable
   `SOLDER_PANEL_STYLE` (`old-school`, `plain`, `solder`, `solder-night`), like `SOLDER_THEME` (DT-056 §6).
7. **First the editor and window levels.** The project level waits for projects (`.sdproj`) and the executable for
   the application builder; this decision already fixes how they will take part.
8. **The look follows the pattern of the mockup**: a quiet base with color only for meaning, depth on what is
   touched and flat on what is read, values as arcs or fills, numbers in monospace with tabular figures, hairline
   rings instead of borders, controls raised and indicators recessed (LabVIEW's white control and grey indicator,
   said with depth), and light as feedback.
   *Amended on 2026-10-17, when the Solder and Solder Night sheets were written (`panel-styles/solder.css` and
   `solder-night.css`), with the developer:*
   - **The panel style paints the canvas too** (it is the `.sd-panel` itself): Solder a warm `#f6f5f1`, Solder Night
     `#121418`, with the editor's 12 px grid as dots of the style's color, hidden in Run mode as the grid is.
     Otherwise Solder Night would put dark controls on the theme's light grey.
   - **Values in the interface font with tabular figures**, not monospace: the figures do not jump and still fit
     LabVIEW's 55 px field ("98765,4" in a 12 px monospace touches its edge).
   - **ISA-101 colors:** the normal state is neutral and only an alarm is red. "No error" is a grey light and an
     error a glowing red one; a lit LED takes the orange accent and glows, as in the mockup.
   - **A halo on the field being typed**, through a new public state class `.sd-editing` on the object
     (DT-056 §7), next to the editor's own `editando-valor`; array elements already had it.
   - **Solder Night is Solder's rules with other tokens:** its sheet `@import`s `solder.css` and redefines only
     the tokens, so a style that only changes colors is a list of tokens. A user's style may import a shipped one
     the same way.
   - Not taken from the mockup, because the markup has no part for it: the area filled under a chart's plot.
9. **How the HTML panel is built** (decided on 2026-10-17, before writing it):
   - **A style changes neither sizes nor the place of terminals.** Every object of an HTML style takes exactly the
     box it takes in Old School (`cajaObjeto` in `front-panel.mjs`), so labels, clicks, selection and the connector
     pane are the same in every style; the style draws inside that box. The larger boxes of the mockup are only
     illustration.
   - **Typing stays in the editor's model.** The text and the caret of a field are drawn by `front-panel.mjs` as in
     Old School, so editing, Enter, Esc and undo behave the same in every style. The HTML carries ARIA roles
     (`button`, `switch`, `radio`) but no native `button`, `input` or `select`, which would take the keyboard
     focus away from the editor.
   - **The label stays a separate object** that moves and is edited as in LabVIEW. It gets the class `.sd-label`, and
     the object carries its text in `data-label`.
   - **Plain covers every control that exists** from its first step (numeric and enum, string, the Booleans, error
     in and out, arrays and the three graphs). *Amended on 2026-10-17 (§5):* it is the only drawing, so there is
     nothing to fall back on.
   - **The window's style** is read by the main process from `<VI name>.css` next to the VI's file
     (`editor/electron/window-style.mjs`, `companionStylesheetPath` in `vi-paths.mjs`) and put by the page in a
     `<style>` after every other sheet (`front-panel/window-stylesheet.mjs`), so with the same specificity it wins.
     The folder is watched: creating, changing or deleting the file shows at once, and Save As to another folder
     takes the style found there. An unsaved VI has none.
   - The style reaches the window as a parameter of its URL; `plain.css` is always loaded, with the chosen style's
     sheet after it, and every rule of a panel style lives under `.sd-panel`, so it never touches the editor.
   - *Added on 2026-10-17 (§5):* **the markup carries every part a style may draw, ornament included.** What is only
     ornament in Plain (the bevel of a field, the body of an incrementer, the shine of an LED, the radix of a
     numeric, the scrollbar of a string or of an error's source, the pieces of a graph's frame) is an element with
     its own class and `aria-hidden`, hidden by `plain.css` and shown by the style that wants it. Those classes are
     part of the public API (DT-056 §7). The geometry of every part comes from the box measured in LabVIEW, so a
     style places it with CSS, not with markup of its own.
   - *Added on 2026-10-17 (§5):* **Old School's illustrations are SVG files of the style**, in
     `editor/src/panel-styles/old-school/`, which `old-school.css` takes as background images. They are generated by
     a script from the drawings of `glyphs.mjs`, which the palette and the diagram's terminals still use, and a test
     fails when a file differs from what the script writes, so the two never drift. Each one is adopted only if it
     gives the same pixels as the inline SVG it replaces; one that does not is drawn inline in the markup instead,
     with its colors in the sheet, and the reason is written next to it.
   - *Added on 2026-10-17 (§5):* **Old School is migrated control by control.** Each kind moves to Plain's markup
     with its Old School look in `old-school.css` only when a pixel diff against the old drawing shows zero changed
     pixels in every state of a fixture VI (each kind as control and indicator, on and off, empty, selected, being
     typed into, with data). Until the last kind moves, the old drawing stays for the kinds not yet migrated; then
     the old drawing and the switch between drawings are deleted.

### How it is verified

| Statement | Mechanism | Status |
|-----------|-----------|--------|
| A window's style wins over the editor's, and follows its file on disk | `test/editor/window-style.test.mjs` (the companion path, reading, watching creation, change and deletion, the `<style>` kept last) and the editor under Xvfb: written, edited and deleted while open, Save As to another folder, two VIs each with its own (`labview-captures/reports/2026-10-17-window-style.md`) | Verified 2026-10-17 |
| The project's style sits between the window's and the editor's | a test of the order of the sheets, when projects exist | **Unverified**: projects are not done |
| A control a style does not draw shows as Plain | `test/editor/panel-styles.test.mjs`: every kind an HTML panel draws has rules in `plain.css`, and every rule lives under `.sd-panel` | Verified 2026-10-17 |
| A style changes neither sizes nor terminals | `test/editor/panel-styles.test.mjs`: every object of an HTML panel has its Old School box, and keeps the editor's hooks | Verified 2026-10-17 |
| Old School over Plain looks exactly like the drawing it replaces | `scripts/panel-pixels/compare.sh`: a pixel diff of a fixture with every kind and state, the commit before as BEFORE; then the real editor under Xvfb (`labview-captures/reports/2026-10-17-panel-old-school-numeric.md`) | Verified 2026-10-17 for every kind, the last check after the old drawing was deleted (`2026-10-17-panel-old-school-final.md`) |
| Old School's SVG files match the drawings of `glyphs.mjs` | `test/editor/panel-styles.test.mjs`: every file equals what `old-school-art.mjs` writes, and every file `old-school.css` takes exists | Verified 2026-10-17 |
| The editor has one panel drawing | `test/editor/panel-styles.test.mjs`: every panel style, Old School included, draws the same markup (only the sheets differ) | Verified 2026-10-17 |
| Every ornament part is hidden in Plain | `test/editor/panel-styles.test.mjs`: every class of `ORNAMENT_CLASSES` has a `display: none` rule in `plain.css`, and the markup hides no other part | Verified 2026-10-17 |
| Solder and Solder Night are registered and every sheet a style imports exists | `test/editor/panel-styles.test.mjs`: every `stylesheet` of `PANEL_STYLES` and every `@import` in it is a file of `panel-styles/`; every rule lives under `.sd-panel` | Verified 2026-10-17 |
| Solder and Solder Night dress every kind (numeric, enum, string, Booleans, error clusters, arrays, graphs) | the fixture of `scripts/panel-pixels/render.mjs` rendered in both styles, and the three examples in the real editor (`labview-captures/reports/2026-10-17-panel-solder.md`), seen by the developer | Seen 2026-10-17; no test fails if a kind loses its look |
| Writing Solder's sheets left Old School unchanged | `scripts/panel-pixels/compare.sh` against b58c735: identical in every scene | Verified 2026-10-17 |
| The `.sdg` does not change | the format tests (`test/end-to-end/format-versions.test.mjs`) stay green | Holds today; to recheck when styles are implemented |


## DT-059

**Solder opens LabVIEW's `.vi` files itself, without LabVIEW installed.**

- **Status:** Accepted on 2026-10-17 by the developer, as a goal. When it is done, and in which order against the
  plan, is not decided yet; nothing is built for it now.
- **Why:** whoever comes from LabVIEW has programs already written. Being able to open them is what makes moving to
  Solder possible, and it is the natural end of cloning LabVIEW one to one (DT-035).

### Decision

1. **Solder reads a `.vi` directly**: its own reader of LabVIEW's binary format, in JavaScript like the rest of
   the core. A route that needs LabVIEW installed (exporting through VI Scripting) is not the product; it may be a
   tool for us.
2. **What opens is converted to Solder's model**, and saved as `.sdg`. A node or control Solder does not do yet
   opens greyed and says why, as everything not done does (DT-035), instead of refusing the file.
3. **Nothing of NI is copied** (rule 3): the reader is written from what the files contain, and the test files are
   VIs we build ourselves in the virtual machine, never NI's.

### Open points

- Which LabVIEW versions are read (2026 Q3 first is the obvious start), and whether Solder ever writes a `.vi`.
- The legal check of reading a closed format for interoperability (in the EU, Directive 2009/24/EC art. 6),
  before the work starts.
- How it is verified: LabVIEW in the virtual machine can describe the same VI in text (VI Scripting, the
  `Solder Probe.vi` family of 2026-10-17), which gives the expected result for every test file.

### Verification

| Statement | What fails if it is broken | Status |
|---|---|---|
| Solder opens a `.vi` | nothing yet | Unverified: not started |

## DT-060

**An array is born without an element type, and its element gives it one.**

- **Status:** Accepted on 2026-10-18 by the developer, after the measurements of
  `labview-captures/reports/2026-10-18-array-typing-stage1.md` and `-stage2.md`.
- **Complements:** [DT-044](#dt-044) (the type of an array), [DT-035](#dt-035).

### How LabVIEW does it (measured in LabVIEW 2026 Q3)

1. A new Array on the panel and a new Array Constant on the diagram are **empty shells**: they have no element,
   their type is "1D array of void", and the VI is broken ("Control contains no elements and is undefined",
   "Constant has undefined type").
2. The type comes **only from the element dropped inside**: a control, indicator or constant. On the panel the
   element also decides whether the array is a control or an indicator.
3. An empty array **never adapts to a wire**: wired to a typed array the wire breaks (source "1D array of void");
   wired to a polymorphic input such as Array Size, that node has a bad terminal.
4. Changing the element (Replace, Representation, dragging it out) retypes the whole array and keeps its wires,
   which break if the types no longer match.

### Decision

1. **The element type `"void"`** (`VOID` in `core/model/types.mjs`) is the element of an empty array:
   `{ "array": "void" }`. It is valid only as an array's element and only on `arr-const`, `arr-control` and
   `arr-indicator`; it never reaches the compiler, because a VI that carries it is not runnable.
2. **The palette's Array and Array Constant place `{ "array": "void" }`.** `.sdg` files written before this keep
   their `{ "array": "number" }` and open the same: there is nothing to migrate.
3. **Nothing infers a type from a wire.** A void array wired to a typed input breaks the wire; wired to an input
   that takes any array, the node has a bad terminal.

### Verification

| Statement | What fails if it is broken | Status |
|---|---|---|
| A void array breaks the VI with LabVIEW's errors | `test/core/array-typing.test.mjs`, `test/editor/error-list.test.mjs` | Verified |
| The palette places empty arrays; an element dropped inside types them; Representation and Change to Indicator on the element retype the whole array; dragging a constant's element out empties it, and so do dragging out, Cut and Delete of a panel array's element (reports/2026-10-23-array-remove-element.md) | `test/editor/front-panel.test.mjs`, `test/editor/diagram-editing.test.mjs`, `test/editor/labview-inventory.test.mjs` | Verified (Replace ▸ is a placeholder) |

## DT-061

**One scheduler of our own decides which clump runs next; how a clump is suspended depends on the host.**

- **Status:** Accepted on 2026-10-23 by the developer. §3 (one clump at a time) and §8 (the same order in every host)
  amended by [DT-063](#dt-063) on 2026-10-24: a pool of threads over one shared memory, with the exact order as the
  N = 1 mode.
- **How it was decided:** issue [anlaco/solder#1](https://github.com/anlaco/solder/issues/1) opened the question. The
  developer called a council of five independent voices: four fresh sessions with no context, plus the main session,
  which wrote its idea down before reading theirs. The four sessions proposed the same idea (A, below), and the main
  session a different one (B). The vote gave A 44 points and B 25. Two spikes then checked A's assumptions
  (see "What was measured").
- **Complements:** [DT-039](#dt-039) (the VI runs in the page's WASM engine), [DT-040](#dt-040) (clumps with JSPI),
  [DT-041](#dt-041) (the iteration budget and `tiempo.ceder`), [DT-045](#dt-045) (subVIs that wait their turn),
  [DT-047](#dt-047) (the debugger). It does not change the `.sdg` or what a VI computes.

### Context

Today the host's event loop is the scheduler: every suspending import (`ceder`, `esperar`, `esperar_multiplo`,
`entrar_subvi`, `correr_plan`, `correr_subvi`, the two error dialogs, `dep.nodo`) builds its own promise and its own
host callback (`setTimeout`, `setImmediate`, a `MessageChannel`, a worker message). The order in which clumps resume
is therefore decided by Node, Chromium and the operating system's timers. Issue #1 is that class of bug: on Windows,
two waits that end together ran in one task, two clumps yielded through one shared `MessageChannel`, and one of them
was never woken again. The fix for 0.4.x (`core/runtime/turn-yielder.mjs`, a queue of waiting yields) repairs that one
import; the others still depend on the host's order.

### Decision

1. **One scheduler per Run is the only thing that resumes a clump.** Every suspending import parks the clump that is
   running with a typed reason (`yield`, `timer(deadline)`, `subvi-turn(plan)`, `join(subplan)`, `dialog(id)`,
   `debug-pause`, later `io(handle)`) and nothing else may wake it.
2. **The order is ours, never the host's.** A ready queue in order of arrival; a timer queue ordered by
   (deadline, sequence number); a FIFO queue for each non-reentrant subVI; an inbox for what comes from outside
   (control changes, Abort, dialog answers, debugger commands), read only at the start of a turn. Ties are broken by
   a monotonic sequence number.
3. **One clump runs at a time.** The scheduler resumes one, waits until it parks again or ends, and only then picks
   the next. The iteration budget of DT-041 is kept **per clump**, not shared by all of them as today
   (`presupuesto`, `ultimaLlamada`, `ultimaCesion`).
4. **The host gives three things only:** the time, one timer for the earliest deadline, and "run the next turn".
   The panel's writes are sent at the end of each turn, before a dialog and at the end of the Run, not on a timer of
   their own.
5. **Abort and deadlock are states of the scheduler.** Abort rejects every parked clump, clears the timers and
   answers the open dialogs. If clumps are still alive while none is ready, no timer is pending and nothing is
   expected from outside, the Run ends with an error that names the parked clumps and why they wait. The fault of
   issue #1 would have been that error, not a VI that never finishes. The editor keeps `worker.terminate()` as a
   last resort when Abort gets no answer.
6. **A simulated clock for tests:** the same scheduler runs with a clock that jumps to the next deadline, so an
   interleaving of parallel waits is checked exactly and in microseconds.
7. **How a clump is suspended depends on the host, behind the scheduler's interface** "resume clump *i* and say why
   it parked":
   - in a JavaScript host (the editor's worker, the command line, the tests), **JSPI**, as today: the compiled
     WebAssembly does not change;
   - in the Rust hardware host, the **continuations of WebAssembly's stack-switching proposal**: each clump is a
     continuation (`cont.new`) that parks with `suspend`, and the module exports a `resume` that runs one clump until
     it parks and returns the reason. The compiler changes only the calls to suspending imports and the entry of each
     clump. These are not state machines: the engine keeps the stack;
   - when V8 ships stack switching, the JavaScript host may move to it too, and there is one mechanism everywhere.
8. **The same semantics in every host:** reference traces shared by all the schedulers (the same VI and the same
   instants must give the same order of resumes).

### Rejected

- **Leaving the event loop as the scheduler and fixing each import:** fixes issue #1, but every new suspending
  feature (queues, notifiers, events, hardware I/O) brings its own ordering bug, and nothing is testable exactly.
- **Compiling every clump to a resumable state machine, with the scheduler inside the module (idea B):** it is as
  deterministic as A (determinism comes from owning the scheduler, not from where it lives); its one advantage, not
  depending on JSPI, is given by stack switching without transforming every structure. DT-040 had already turned down
  this option.
- **Threads, a worker for each loop, shared memory:** real parallelism, but non-deterministic by nature, with
  COOP/COEP and locks on the data of several clumps.

### What was measured (2026-10-23)

1. **JSPI without a flag in Node:** `WebAssembly.Suspending` and `WebAssembly.promising` exist with no flag in Node
   24.22.1 (the current LTS) and 26.12.1, and the diagram of issue #1 gives the right values in both. Node 24.19
   still needs `--experimental-wasm-jspi`, and **Node 26 refuses to start with it** (`bad option`), so `npm test` and
   the documented command line do not run on Node 26 today.
2. **wasmtime 50, two clumps of one instance suspended at once with `call_async`:** it does not compile
   (`E0499: cannot borrow store as mutable more than once`). A call takes the `Store` for itself until it ends, so
   the Rust host cannot do what JSPI does.
3. **wasmtime 50 with stack switching** (`wasm_stack_switching`): two loops of 1000 ms and 500 ms as continuations of
   one instance, resumed by a scheduler in Rust with synchronous calls only, give 3 and 3 iterations in 3000 ms, and
   the tie at 1000 ms is resumed in the fixed order (deadline, then sequence).
4. **The same module in V8 (Node 26.12.1):** it needs `--experimental-wasm-wasmfx`, and with it Node stops with an
   internal compiler error (`Check failed`). In V8 stack switching is not ready yet.

The spikes were run outside the repository and are not kept: items 2–4 have no test here yet.

### Verification

| Statement | What fails if it is broken | Status |
|---|---|---|
| Two turns asked for at once through the `MessageChannel` both run, in order, and two waits that end together both wake (issue #1) | `test/core/scheduler.test.mjs` (the real host) | Verified |
| The scheduler alone resumes clumps, in order of (deadline, sequence), with one clump running at a time | `test/core/scheduler.test.mjs` | Verified in the scheduler, which runs every clump of a Run since 2026-10-24 |
| A Run whose clumps can no longer be woken ends with an error naming them | `test/core/scheduler.test.mjs` | Verified in the scheduler, which runs every clump of a Run since 2026-10-24 |
| The same VI and instants give the same order of resumes in every host | `test/end-to-end/reference-traces.test.mjs` | Verified in the JavaScript host; the Rust host does not exist yet |
| JSPI runs with no flag from Node 24.22 on, and Node 26 refuses the flag | Measured on 2026-10-23 (above); `test/end-to-end/command-line.test.mjs` checks that the flag is passed only when the running Node lacks JSPI and that the command line runs a VI that waits from a plain `node` (run on 24.19.0, 24.22.1 and 26.12.1 on 2026-10-23) | Verified on the Node that runs `npm test` |
| wasmtime can keep several clumps of one instance suspended only through stack switching | Measured on 2026-10-23 (above) | Measured, no test |

## DT-062

**Until version 1.0 the beta follows `main`: every release is tagged on `main`, a feature raises MINOR and a fix
raises PATCH. There are no release branches.**

- **Status:** Accepted on 2026-10-23 by the developer. It supersedes [DT-057](#dt-057) until 1.0; §6 and §7 of DT-057
  (what is a fix, when to publish) still hold.
- **Why:** while Solder is a `0.x`, whoever tries the beta should get what `main` does. With DT-057 the two drifted
  apart within a week: `release/0.4` stayed before DT-060 (arrays born empty), so of three fixes made on 2026-10-23 one
  had no bug to fix on the beta and another no longer cherry-picked, while the developer, trying `main`, took it for
  the beta.

### Decision

1. **`main` is the line of development and of releases.** It stays green after every commit. A feature longer than one
   session goes on a short `feature/<short-name>` branch, merged back as soon as it works.
2. **Versions** (`0.MINOR.PATCH-beta`, DT-055): a release that brings any feature raises MINOR and sets PATCH to 0
   (`0.5.0-beta`); a release with fixes only raises PATCH (`0.5.1-beta`). A fix comes with a test that fails without it.
3. **A release is made on `main`:** raise the version in `package.json` and `CHANGELOG.md`, `npm test`, tag
   `v0.<MINOR>.<PATCH>-beta` on `main`, `npm run dist`, publish on GitHub as a pre-release. What goes out is told in the
   CHANGELOG's "Unreleased" section, gathered as work lands.
4. **When to publish** is DT-057 §7: a serious fix at once, minor fixes batched, a new MINOR when `main` has a coherent
   set of features tried by hand in the app.
5. **0.4 is no longer maintained:** the branch `release/0.4` was deleted on 2026-10-23, and the tags `v0.4.0-beta` to
   `v0.4.3-beta` keep what was published. There is one line of versions, 0.x, and only the latest beta is supported.
6. **From 1.0 on** the release branches of DT-057 may come back; that is decided then.

### How it is verified

| Statement | Mechanism | Status |
|-----------|-----------|--------|
| Every published beta is a tag on `main` | `git merge-base --is-ancestor v<version> main` before publishing | **Unverified**: process, no automatic check |

## DT-063

**A Run uses every core, as LabVIEW does: a pool of workers shares one WebAssembly memory, and the scheduler of
DT-061 hands ready clumps to whichever thread is free. Independent Runs keep separate memories.**

- **Status:** Accepted on 2026-10-24 by the developer. It amends [DT-061](#dt-061) §3 and §8 and reverses the option
  DT-061 rejected ("Threads, a worker for each loop, shared memory"); the rest of DT-061 holds. §8 (stackless
  clumps that resume on any thread), §9 (the scheduler in the shared memory, with work stealing) and §10 (the panel
  as a transfer buffer in the shared memory) accepted on 2026-10-25; they retire JSPI (DT-061 §1, §7) and replace
  DT-061 §4. §10's phase-fair lock and §11 (a persistent pool in the editor) accepted the same day.
- **Why:** the developer's rule for technical choices (2026-10-24): **what brings Solder closest to LabVIEW and is the
  most powerful, never the easiest.** LabVIEW runs the clumps of a VI on the threads of its execution systems, so two
  independent loops that only compute use two cores; with one clump at a time Solder would be up to N times slower on
  N cores for that kind of program. DT-061 chose determinism over parallelism; this decision chooses LabVIEW's
  capability and keeps determinism as a mode.
- **Complements:** [DT-039](#dt-039) (the VI runs in the page's WASM engine), [DT-040](#dt-040) (clumps),
  [DT-042](#dt-042) (the data space in linear memory), [DT-045](#dt-045) (non-reentrant subVIs), [DT-061](#dt-061).
  It does not change the `.sdg` or what a VI computes.

### Decision

1. **A pool of N workers per Run, one shared memory.** The compiled module declares its memory `shared`; every worker
   of the pool instantiates the same module over that memory. The scheduler of DT-061 keeps its queues, its typed
   park reasons, its inbox, Abort and deadlock as states, and its simulated clock; what changes is that it resumes a
   ready clump on **any free thread** instead of one clump at a time. The iteration budget stays per clump.
2. **What the compiler adds:** a stack of its own for each thread; the dependency counters of the clumps updated with
   atomics, so a clump starts only when every wire it reads has been written; and a lock for what LabVIEW also
   serializes — a non-reentrant subVI (its FIFO of DT-061 §2 becomes a lock shared by the threads), global variables,
   and later queues, notifiers and functional globals.
   *Done on 2026-10-25, in three parts (plan step 7, parts 1–3).* (1) A value that one clump writes and another reads
   crosses through a cell of the data space instead of a WebAssembly global, since each instance of the module (each
   thread) has globals of its own; the only globals left are each thread's: `parking`, `resumeValue`, the clump and
   the thread it runs (`test/core/thread-pool.test.mjs`). (2) The module imports its memory (`env.memory`, shared, at
   most 65536 pages: wasm32's whole space, the limit a VI already had, which costs only address space) and its data
   is passive, written once per Run by the exported `initialize`, so a thread that instantiates the module later does
   not write it again; the encoder emits the atomics of the threads proposal; the heap's `asignar` and `liberar` take
   a lock in the memory (`lock`/`unlock`, Drepper's three-state mutex: spins on `cmpxchg`, sleeps on
   `memory.atomic.wait32`), checked by four threads allocating and freeing at once (without the lock they corrupt
   the free list). No stack in the memory is needed: a parked clump's state is in its frame (§8), and each thread's
   WebAssembly stack is its own. (3) The scheduler is in the module (§9).
3. **Why shared memory is safe here.** The WebAssembly sandbox is not broken: the threads share the memory of their
   own program, and nothing outside it is reachable except through our imports. The security risk of
   `SharedArrayBuffer` is Spectre (a precise timer that can read other data of the same process), which is why it
   needs cross-origin isolation: the editor's window that runs VIs is served with COOP/COEP, and it loads no
   third-party content. *Done on 2026-10-25:* every response of the editor's `solder://` scheme carries
   `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`; Chromium gives a
   shared memory only to an isolated page, so this came with part 2 (checked in the editor under Xvfb:
   `crossOriginIsolated` true, and a VI runs). The real risk is data races; dataflow removes most of them by construction (a wire has one
   writer, and its readers start after it), and the locks of §2 cover the rest, as in LabVIEW.
4. **Determinism is a mode, not the rule.** With N = 1 the order of resumes is exact, and the reference traces of
   DT-061 §8 check it in every host. With N > 1 the order between independent branches is free, as in LabVIEW, and
   the traces check the dataflow constraints (who may start before whom) and the results, not the order.
5. **Where memories are separate.** One shared memory per Run (a top-level VI with all its subVIs). Two Runs that
   are independent each have their own memory, so a fault in one cannot corrupt the other; later, code not
   compiled by Solder (third-party libraries or plugins) runs in its own memory too. Within a Run there is no mix of
   private and shared memory: WebAssembly shares a whole memory or none, wires cross branches all the time and
   copying them between memories would lose what this decision is for, and mixing gains no security (one shared
   memory already needs cross-origin isolation for the whole process).
6. **In the Rust hardware host:** wasmtime with shared memory and one thread per worker, each with the stack-switching
   continuations of DT-061 §7.
7. **Measured in LabVIEW before N and the dispatch policy are fixed** (rule 2): how many threads each execution
   system has and what decides it, how two loops that only compute are spread over the cores, how a reentrant subVI
   called from parallel branches runs, and what the user can set (execution system and priority of a VI).

8. **A parked clump resumes on any thread: clumps are compiled stackless** (decided by the developer on 2026-10-25,
   after the measurements of 2026-10-25 below). A clump that can park is emitted as a resumable function: at each
   point where it may park (yield, Wait, Wait Until Next ms Multiple, a subplan, a subVI's turn or call, a dialog,
   the debugger) it saves its live locals and a resume point into a frame in the data space and returns to the
   scheduler; called again on any thread, it restores them and goes on from that point. Every function on the way
   (the clump, the subVIs it calls) does the same, so a Wait deep inside a subVI parks the whole chain. The frames
   live in the shared memory, so no state belongs to a thread. This replaces JSPI, whose suspended stacks belong to
   the worker that suspended them and cannot move; the Rust host then needs no stack switching (DT-061 §7). Order of
   work: first on the single-threaded runtime of today, with every existing test and the reference traces as the
   check; then the pool, which then pins nothing.
   *Done on 2026-10-25 on the single-threaded runtime* (`core/compiler/stackless.mjs`, applied to every function of a
   module in `assemble`). A suspending import answers at once or leaves the promise of its answer and raises the
   module's exported global `parking`; the clump stores the locals still read after that point (a liveness
   analysis) and the point's number into its frame, and returns; its runner waits for the answer, puts it in the
   global `resumeValue` and calls the clump again. Each function has a rewinding copy (every statement before a park
   point guarded, a structure entered only if the point is inside it, an `if` taking the branch that holds it, a
   loop rewound for the one iteration it parked in) and running copies that are the original code with a check of
   `parking` after each call that may park, leaving through one exit outside every loop. A function with debugger
   hooks has two running copies, with and without them, and takes the one the debug flag asks for when it starts or
   resumes: turning debugging on reaches a running loop at its next yield (~8 ms), where it reached the next node
   before. The frames are cleared at the start of every Run, since the memory a VI keeps between Runs (DT-045)
   holds them too. JSPI is gone from the runtime, the command line and `npm test`.
9. **The scheduler lives in the shared memory and its threads steal work** (decided by the developer on 2026-10-25).
   Each thread has its own deque of ready clumps: a clump that ends decrements its dependents' counters with atomics,
   pushes the ones that reach zero onto its own deque and takes the newest next (its inputs are still in that core's
   cache); a thread with nothing to do steals the oldest from another's deque. The timers are a heap in the shared
   memory ordered by (deadline, sequence), and a thread with nothing to do sleeps with `memory.atomic.wait32` until
   the earliest deadline or a notify. Abort is a flag in the memory that every clump reads at its park points. A
   deadlock is every thread asleep with no deadline and nothing waited for from outside. Each worker's loop (take a
   clump, `call_indirect` it, read how it returned) is WebAssembly, so passing from one clump to the next never
   crosses into JavaScript. Only the outside world stays in JavaScript: one coordinating thread takes the editor's
   messages (the panel, a dialog's answer, Abort) and writes them into the memory. With N = 1 the ready queue is FIFO,
   so the order of resumes and the reference traces stay as they are. `core/runtime/scheduler.mjs` is kept as the
   reference model: on the virtual clock with N = 1 the WebAssembly scheduler must give exactly its trace.
   This replaces the per-Run scheduler of DT-061 §1 as the thing that runs clumps; its rules (one order of our own,
   typed park reasons, deadline and sequence, Abort and deadlock as states) hold.
   *Done on 2026-10-25* (`core/compiler/pool-scheduler.mjs`, in every module after the memory functions). A header
   at a fixed address (`SCHEDULER`) points to the module's tables: a record per clump (the wires it still waits
   for, its state, why it parked, the value it resumes with, its deadline, its group, its dependents, its budget of
   iterations), a record per group (group 0 is the top-level VI, group p + 1 is plan p: a subplan or a subVI that
   waits), the timer heap, a lock with a FIFO of waiters per group, and one Chase–Lev deque per thread plus one for
   the coordinator, allocated on the heap the first Run and kept with the memory. Clumps are called through a table
   with `call_indirect`. A clump's state goes IDLE → READY → RUNNING → PARKED → READY … → ENDED; a clump woken while
   it is still returning from its park (another thread ended its subplan, left the subVI it waits for, or the
   coordinator answered) goes to WAKE_PENDING, and its thread makes it ready once it has returned, so no clump
   resumes before its state is saved. The waits, the yields of a loop, subplans and a subVI's turn are functions of
   the module (park primitives, `stackless.mjs`); only the dialogs and the debugger park through JavaScript
   (`park_external`, `wake_external`). Two clocks are imported: `ahora`, the Run's clock for timers (virtual in the
   reference traces), and `reloj_real`, for the budget of a loop, as before. `run_thread(thread, blocking)` has
   two modes. Not blocking, as one thread in the runtime today: it runs one clump and returns, and JavaScript drives
   the turns as the reference model does (the panel's writes at each turn, Abort and answers read between turns);
   the reference traces, written from the model, pass unchanged. Blocking, as a thread of a pool: it takes the
   newest clump of its own deque, steals the oldest of another's, and sleeps on `memory.atomic.wait32` until a
   push, a new earliest deadline or the end of the Run; a deadlock is every thread idle with nothing ready, no timer
   and nobody outside to answer. Checked with up to 16 real threads (`test/core/thread-pool.test.mjs`): parallel
   loops whose every iteration starts a subplan and parks twice give every write exactly once, 30 times in a row;
   a non-reentrant functional global called from six parallel loops on six threads counts every call (with its
   lock broken the threads end in deadlock); and two loops that only compute take 450 ms on two threads against
   790 ms on one (the rest is starting the workers). A compute loop runs as fast as before (3.71 ns an
   iteration). The runtime still runs every Run on one thread: the pool needs the panel in the memory (§10) first,
   and then N threads (plan step 7, parts 4 and 5). Threads of a pool must share one clock origin
   (`performance.timeOrigin + performance.now()`), since each worker's `performance.now()` starts at its own.
10. **The panel lives in the shared memory, as LabVIEW's transfer buffer** (decided by the developer on 2026-10-25:
    "what is closest to LabVIEW"). A worker of the pool never receives a message during a Run (its loop is
    WebAssembly, and it sleeps in `memory.atomic.wait32`), so control values cannot be copied to each worker; they
    are in the memory, and the coordinator writes there what the editor sends.
    - **A control, a local variable of it:** a scalar (Boolean, integer, SGL, DBL as its 64 bits) is written and read
      with one atomic store and load; WebAssembly's atomics are sequentially consistent, so no thread reads an older
      value after a newer one, as measured in LabVIEW. A string, array or cluster has a lock of its own: a writer takes
      it, puts the new block, frees the old one and lets go; a reader takes it and **copies** the value, as NI says a
      local variable copies its data. The lock spins briefly, then sleeps. LabVIEW protects large values too (measured on 2026-10-25,
      below, case 8): a reader never sees a torn array or string of 10⁶ elements, so the lock per control stays. A
      reader that never waits slows LabVIEW's writer 35–100 times for a string (case 8): its lock takes no turns.
      **Solder's is a phase-fair reader-writer lock** (decided by the developer on 2026-10-25: "the most powerful";
      Brandenburg and Anderson, "Spin-Based Reader-Writer Synchronization for Multiprocessor Real-Time Systems",
      2010): any number of readers copy at once, a writer that arrives makes the new readers wait until it has
      written, and after each write the readers that were waiting go in before the next writer. Neither readers nor
      writers starve, and several loops that read one large control copy it in parallel. The values are the same as
      in LabVIEW (never torn); only the pace differs, where LabVIEW's writer is held back. Rejected: the mutex of the
      heap, which takes no turns (LabVIEW's pace, writers starved and readers one at a time), and a ticket lock
      (turns, but readers still one at a time and a wake-up at every hand-over).
    - **A Latch:** read with an atomic exchange that leaves FALSE, so only one reader sees TRUE; the release goes to the
      editor as an indicator write does.
    - **An indicator:** a cell with its last value and a version counter; the diagram writes it and never waits
      (LabVIEW's default, Synchronous Display off). The coordinator walks the cells at the display's pace and sends the
      editor only what changed; values written faster than that are skipped, as in LabVIEW.
    - **A chart:** a ring in the shared memory of the chart's history length (1024 by default), written by the diagram;
      the coordinator sends what is new since its last pass. When the VI writes more than the history holds between two
      passes the oldest are lost, which is what LabVIEW's history does.
    - **Synchronous Display and the Value property** (when they are done): the clump parks waiting for the editor to
      confirm the drawing, on purpose slower than a local variable, as LabVIEW is (≈ 100–277 µs a write against
      ≤ 0.2 µs).
    This replaces DT-061 §4 (the panel's writes sent at the end of each turn): with threads there is no turn of the
    whole Run.
    *Done on 2026-10-25 (plan step 7, part 4;* `core/compiler/panel-memory.mjs`*).* Every control and indicator of the
    top-level VI has a record in the data space: the lock (`read_lock`/`write_lock`, linear-memory.mjs), a count of
    writes, a count of a Latch's releases and the value (8 bytes for a scalar, a handle, or the cluster in place); a
    chart's record holds a ring of its history length instead of one value. The panel imports are gone. The diagram
    writes an indicator and never waits: a scalar is one atomic store and its count goes up, a string, array or
    cluster is copied in under the write lock, a chart writes the next slot of its ring. It reads a control with one
    atomic load, a Latch with an atomic exchange that leaves FALSE (counting the release), and a string, array or
    cluster by copying it under the read lock. The runtime, which is the coordinator, passes over the panel at the
    end of each turn, before a dialog or the debugger shows something and when the Run ends: it reports each
    indicator whose count changed with its last value, every write a chart's ring still holds, and each Latch
    released; at the start of each turn it writes into the records the controls the caller changed. Values
    written faster than the passes are skipped, as in LabVIEW (`test/editor/graphs.test.mjs`: 3000 writes in one
    turn reach a chart of history 100 as the last 100, and an indicator as its last value). Four threads read
    four 100,000-element array controls 3000 times each while the coordinator rewrites them: no read torn (16–17
    per loop with the read lock removed), in `test/core/thread-pool.test.mjs`. The lock is checked on its own with
    four readers and two writers on six threads: never a torn value or a reader beside a writer, readers inside
    together, and nobody starved (a broken lock leaves a thread stuck, and the test ends it after 30 s). Writing an
    indicator 10⁶ times in a loop takes 21 ms (LabVIEW 126–136 ms) and a chart 131 ms. Still missing: Synchronous
    Display and the Value property, and the pass at the display's pace on its own thread, which comes with the pool
    (part 5).

11. **The pool lives as long as the editor, and a built application chooses its threads** (decided by the developer on
    2026-10-25). In the editor the pool's workers are created at the first Run, N of them (one per logical
    processor, as each of LabVIEW's execution systems has: measured on 2026-10-24), and they stay, asleep, between
    Runs; each Run hands them its module and its new memory, so a Run starts at once, as in LabVIEW, whose threads
    exist from the start, and Run Continuously does not pay a start at every round. Measured on the development
    machine (28 logical processors): an idle worker of the editor costs ~4.8 MB (134 MB for 28, on an editor of
    633 MB), one of Node ~10.5 MB; starting one cold, 50–75 ms. The command line runs one Run, so its pool lives as
    long as the Run. A built application (the Application Builder, when it exists) starts its VI once, so its pool
    is created at launch either way, and its number of threads is chosen when it is built, as LabVIEW's
    `threadconfig.vi` sets the threads of each execution system; for a small target, the Rust host (§6) runs the
    pool on native threads, which cost little more than their stacks.
    Rejected: a pool for each Run (simple, nothing alive between Runs, but ~75 ms more at every Run and at every
    round of Run Continuously), and a persistent pool released after a while without Runs (saves the memory while
    nothing runs, but adds creating and destroying it, its races with a Run that arrives then, and the start again
    after a pause).
    *Done on 2026-10-25 (plan step 7, part 5).* A thread of the pool (`core/runtime/pool-thread.mjs`, the same in a
    worker of the editor and one of Node) receives, through a new port for each Run, the compiled module and the
    Run's memory, instantiates the module with its own host functions (`createHostFunctions`, over its instance)
    and runs `run_thread` blocking until the Run is over. `ejecutar` with `poolPorts` is the coordinator: it
    prepares the Run, hands every thread the module and the memory, passes over the panel every 16 ms (about one
    frame of the display; LabVIEW's pace is unverified), turns Abort into the memory's abort flag, and shows the
    dialogs the threads ask for: a thread parks the clump that called (`park_external`) and sends the dialog; the
    coordinator answers and wakes the clump onto its own deque. A Run whose debugging is on from the start runs on
    the coordinator's thread, turn by turn, so Highlight Execution keeps one clump at a time; debugging turned on in
    the middle of a pool Run reaches its threads, which read each output's value before the clump goes on and send
    it, and park at each node until the debugger lets it go. The editor's window creates its pool at the first Run
    (`editor/src/window/browser-pool.mjs`, `navigator.hardwareConcurrency` workers) and hands the run worker one
    port per thread; if the run worker has to be ended after an unanswered Abort, the pool goes with it, since its
    threads may still be running that Run. The command line makes a pool for its one Run, `--threads N` (one per
    logical processor by default, as `threadconfig.vi`; 1 gives the exact order). Measured on the development
    machine (28 logical processors, Node 24.19): starting 28 workers of Node costs ~4.5 s of CPU and their first
    Run ~2.3 s more (≈ 0.25 s of wall time), and from then on a Run of a newly compiled VI starts in 5 ms; 28 idle
    threads spend 141 ms of CPU in 2 s of waits against 22 ms on one thread. In the editor the pool adds ~180 MB
    when it is created. Checked by `test/core/pool-runtime.test.mjs` (parallel loops, a non-reentrant subVI that
    keeps counting across pool Runs, Abort and the next Run, a dialog from a thread, a Stop button, debugging
    turned on mid-Run), and by the three examples, which give LabVIEW's values on one thread and on a pool
    (`test/end-to-end/examples.test.mjs`); in the editor under Xvfb, Temperature Monitor runs on the pool, ends on
    LabVIEW's average and is aborted at once.

### What was measured in LabVIEW (2026-10-25): where a clump resumes, and the load it balances

Reports `labview-captures/reports/2026-10-25-thread-resume.md` and `2026-10-25-load-balance.md`; VIs in
`C:\solder-measure\exec-systems\`.

1. **A clump resumes after a Wait on whichever thread is free.** GetCurrentThreadId (Call Library Function Node,
   Run in any thread) read before and after a Wait (ms) 1, 500 iterations, 3 runs: one loop resumed on another
   thread in 7–9 % of the iterations, using 2 threads; four loops in parallel in 13–52 %, all four sharing the same
   3–4 threads. With Wait (ms) 0 or no Wait the thread never changed (1500 iterations each).
2. **Loops of different lifetimes do not slow each other.** Loops of 20 × (≈ 47 ms of computing + Wait 10 ms): 8 in
   parallel 1143 ms; 16 in parallel 1805 ms; 8 of them beside 8 that do only 2 iterations, 1173 ms (the long ones end
   as they do alone). A model of the scheduler with 8 threads gives 1140, 1947 and 1227 ms when a clump resumes on any
   thread, and 1140, 1947 and **1947 ms** when it is pinned to the thread it started on: pinning would make that
   program 66 % slower than LabVIEW.
3. **A loop that only computes yields about every 56 ms.** A loop of Wait (ms) 1 has a mean period of 1.75 ms alone and
   2.53 ms beside 8 compute loops on the 8 threads, with 15–16 periods per run of 55.99–56.06 ms (unverified as a
   quantum). Solder's loops yield every ~8 ms (DT-041).
4. **What JSPI and a worker cost** (Node 24.19, measured on the development machine): a JSPI suspension and resume
   285 ns, 4.2 µs through a turn of the scheduler; a worker 50–75 ms to start cold and ~7 MB. A loop parks at most
   ~1000 times a second, so the cost of parking does not decide the design; balance and memory do.
5. **What handing work between threads costs** (Node 24.19, same machine): a `postMessage` round trip between two
   workers 44 µs; waking a sleeping thread with `Atomics.notify` and its answer 16 µs; an uncontended atomic decrement
   (a dependency counter) 26 ns. A loop whose body has two long branches starts a subplan of 2–3 clumps per
   iteration: at 1 kHz that is ~6000 starts and ends a second, about half a core through a coordinator, nothing
   through counters (§9).
7. **The cost of stackless clumps** (Node 24.19, development machine; a For Loop of 10⁸ iterations of
   x = x·1.0000001 + 0.5 in a DBL shift register, best of 5): with JSPI 3.72 ns an iteration with Allow Debugging
   off and 5.77 ns with it on; stackless with saving every local and guards in the loop, 5.42 and 27.85 ns; with the
   running and rewinding copies, 3.73 and 7.43 ns; with one exit outside the loops, 7.04 ns on; with a running copy
   without the debugger's hooks, **3.72 ns both**. An exit from inside a loop costs ~0.8 ns an iteration even when it
   is never taken, and saving dead locals keeps them alive in the loop.
6. **The panel** (reports `2026-10-25-indicator-chart.md`, `2026-10-25-local-variable.md`): writing an indicator in a
   loop of 10⁶ iterations takes 136 ms with the panel open, 126 ms closed (the diagram does not wait for the drawing);
   Advanced ▸ Synchronous Display exists, off by default, and on it costs ≈ 0.82 ms a write with the panel open. A
   Waveform Chart written 100,000 times in 34 ms holds exactly 0…99,999 in its history (default length 1024; when full,
   the oldest go). One loop writing a local variable of an I32 control 10⁶ times and another reading it in parallel:
   never a decrease in 7.08 M reads, values skipped and repeated; the same with a string control: never a torn or
   foreign value in 1.4 M reads (strings of 3–6 bytes). A write costs ≤ 0.2 µs by local variable and ≈ 100 µs (panel
   closed) to 277 µs (open) by the Value property; Value (Signaling) the same.

8. **A large value read by a local variable while another loop writes it is never torn** (report
   `2026-10-25-torn-large-values.md`; `TornArray.vi`, `TornString.vi`). One loop writes 2000 times a 1D I32 array of 10⁶
   elements all equal to i (Initialize Array) to a local variable; another reads a local variable of it with no wait and
   checks Array Max & Min: 0 torn in 7 runs (~2,560 reads), never an older value after a newer one. The same with a string
   of 10⁶ equal characters: 0 torn in 4 runs (~818,000 reads). Show Buffer Allocations puts a dot on the local read (it
   copies). The reader slows the writer: ~25 % for the array, 35–100 times for the string (0.17 ms a write alone,
   6.5–18.4 ms with the reader, varying ~3× between runs), which looks like a lock on the control's data that a reader
   that never waits keeps taking (mechanism unverified).

### What was measured in LabVIEW (2026-10-24)

In the VM (Xeon E5-2683 v3, 4 physical cores, 8 logical processors), with VIs built for it in
`C:\solder-measure\exec-systems\`; reports `labview-captures/reports/2026-10-24-exec-systems-{a,b,c}.md`.

1. **Threads:** `vi.lib\Utility\sysinfo.llb\threadconfig.vi`, run, shows 5 execution systems (standard,
   instrument I/O, data acquisition, other 1, other 2) × 5 priorities (background, normal, above normal, high, time
   critical), **every cell with as many threads as logical processors** (8). `LabVIEW.ini` has no thread key by default.
2. **VI Properties ▸ Execution** (defaults first): reentrancy Non-reentrant / Shared clone / Preallocated clone;
   priority normal, background, above normal, high, time critical, subroutine; preferred execution system same as
   caller, user interface, standard, instrument I/O, data acquisition, other 1, other 2; Allow debugging ✓, Inline
   subVI ☐, Enable automatic error handling ✓, Run when opened ☐, Suspend when called ☐, Clear indicators when
   called ☐, Auto handle menus at launch ✓.
3. **Compute-only loops run on separate cores:** a For Loop of 8·10⁸ iterations (x = x·mul + add) takes 3.0 s alone,
   3.0 s with 2 copies in parallel and 3.1–3.6 s with 4; with 4, about 4 of the 8 logical processors are busy.
4. **SubVI called from two parallel branches** (3 s per call): non-reentrant 5.9 s (the calls wait for each other),
   shared clone 3.1 s and preallocated clone 3.2 s (in parallel).
5. **A branched wire does not serialize:** one array wire branched to two 3 s consumers takes 3.2 s (3.0 s with one).
   Show Buffer Allocations: two readers make no copy; two Replace Array Subset make **one** copy, in one of them,
   and the other works on the original buffer.
6. **Wait (ms):** 1 ms gives a mean period of 1.70–1.76 ms (min 0.01, max 10, sd ≈ 0.74; mostly 1–2 ms); 10 ms gives
   10.44–10.47 ms (8.8 to 17.6, sd ≈ 0.8). Two 1 ms loops in parallel each keep the same period as one alone.

### Rejected

- **One clump at a time in one worker (DT-061 §3):** deterministic and simple, but it uses one core, below LabVIEW.
- **Private memory per worker, shared only where needed:** WebAssembly cannot share part of a memory; mixing two
  memories (multi-memory) makes every load and store choose one, with two paths in the compiler and runtime; every
  wire between workers would be copied (an acquisition array of a million samples, on every crossing), which LabVIEW
  never does; and it would not remove the need for cross-origin isolation.
- **A parked clump pinned to the thread it started on (JSPI kept, §8 rejected):** no change to the compiler, but
  LabVIEW resumes on any thread, and with loops of different lifetimes two long ones end up sharing a thread while
  others idle (66 % slower than LabVIEW in the model, measured case 2 above).
- **An elastic pool, a worker for each parked clump, the OS sharing the cores:** balances as well as §8 in the model
  without touching the compiler, but costs a worker (~7 MB, 50–75 ms to start) for every loop that waits, puts more
  threads than cores, and does not behave as LabVIEW's fixed threads do (no 56 ms stalls, case 3).
- **The scheduler of DT-061 in one coordinating thread, the workers asking it by message (§9 rejected):** it exists
  and is tested, but every start, end and park costs a round trip of ~44 µs and one thread hands out work for all.
- **A coordinator with a fast path (dependents started by the worker through atomics, parks through the
  coordinator):** two schedulers that must agree, with a clump's state half in JavaScript and half in the memory,
  and every park still a round trip; it was needed only while a parked clump belonged to its worker (JSPI).

### How it is verified

| Statement | Mechanism | Status |
|-----------|-----------|--------|
| Two independent loops that only compute run in parallel on N cores | `test/core/thread-pool.test.mjs` (two threads under 75 % of one) | Verified |
| The examples give LabVIEW's values on a pool of threads, dialogs included | `test/end-to-end/examples.test.mjs` (each example on one thread and on a pool of four) | Verified |
| A Run on the pool stops at once on Abort, and the pool serves the next Run | `test/core/pool-runtime.test.mjs` | Verified |
| A clump never starts before every wire it reads is written, with N > 1 | `test/core/thread-pool.test.mjs` (every write exactly once, with subplans, 16 threads in the probe) | Verified by results; not by a trace of the order |
| A non-reentrant subVI called from parallel branches runs one call at a time | `test/core/scheduler.test.mjs` (the model, four threads); `test/core/thread-pool.test.mjs` (six real threads) | Verified |
| No value crosses between clumps through a WebAssembly global, and the memory is the host's and shared | `test/core/thread-pool.test.mjs` | Verified |
| Threads allocate and free on the heap at once without sharing a block | `test/core/thread-pool.test.mjs` (four threads, 200,000 times each) | Verified |
| With N = 1 the order of resumes is the same in every host | `test/end-to-end/reference-traces.test.mjs` | Verified in the JavaScript host |
| LabVIEW: one thread per logical processor per execution system and priority; compute loops, reentrant calls and branch consumers run in parallel; a non-reentrant subVI serializes | Measured on 2026-10-24 (above) | Measured, no test |
| LabVIEW resumes a clump after a Wait on any free thread, and loops of different lifetimes do not slow each other | Measured on 2026-10-25 (above) | Measured, no test |
| A stackless clump goes on after each park with the same values, and is not called into its import again | `test/core/stackless.test.mjs` (a loop that parks inside an `if`), and every test of waits, loops, subplans, subVIs, dialogs and the debugger | Verified on one thread; on another thread, when the pool exists |
| A Run after an aborted one starts every clump afresh | `test/core/stackless.test.mjs` (fails without clearing the frames) | Verified |
| A VI that waits needs no JSPI | `test/end-to-end/command-line.test.mjs` (runs with `WebAssembly.Suspending` removed) | Verified |
| Debugging turned on in the middle of a loop reaches its nodes, and turned off stops them | `test/core/stackless.test.mjs` | Verified |
| A loop runs as fast as with JSPI with debugging off, and faster with it on | Measured on 2026-10-25 (above, case 7) | Measured, no test |
| With N = 1 on the virtual clock the WebAssembly scheduler gives the reference model's trace | `test/end-to-end/reference-traces.test.mjs` (traces written from the model, now run by the module's scheduler) | Verified |
| The work-stealing deques lose and duplicate no clump under contention | `test/core/thread-pool.test.mjs` (every write exactly once, three times on six threads) | Verified |
| LabVIEW: indicators asynchronous by default, a chart keeps every value up to its history, a local variable read across loops never goes back and is never torn (I32, short strings) | Measured on 2026-10-25 (above) | Measured, no test |
| LabVIEW protects large values (arrays, long strings) read by a local variable while written | Measured on 2026-10-25 (above, case 8) | Measured, no test |
| A control read by several threads never goes back and is never torn in Solder | `test/core/thread-pool.test.mjs` (four threads read array controls while the coordinator writes them; the lock on its own, six threads) | Verified for torn; going back follows from the lock and is not tested |
| A chart keeps the last writes of its history between two passes, an indicator its last value | `test/editor/graphs.test.mjs` | Verified |

## DT-064

**Hardware comes before LabVIEW Core 1: first Instrument I/O with VISA, then a classic ESP32 as a DAQ spoken to by
SCPI, then a DAQmx-like layer, and only then Core 1, with its hardware lessons included.**

- **Status:** Accepted on 2026-10-25 by the developer. It moves [DT-054](#dt-054) (Core 1) behind the hardware and
  narrows its exclusions; point 5 of [DT-039](#dt-039) (how the native I/O connects to the editor) stays open and is
  discussed when that step comes.
- **Why:** acquisition and control is what Solder is for (decided 2026-09-29), and Core 1 without hardware leaves out
  exactly that: lessons 2 and 15 and the measuring parts of 4, 7 and 8. With hardware first, Core 1 is done once, with
  real measurements, instead of with simulated data to be redone later. The charts and graphs a measurement needs are
  already done (plan §3b step 4).

### Decision

1. **Order of work:**
   1. **Instrument I/O with VISA:** the VISA resource name control, constant and wire, and the VISA functions LabVIEW
      shows (Open, Configure Serial Port, Write, Read, Close, Bytes at Port and the rest of the palette, greyed with
      its reason until done), over the transports the steps need.
   2. **A classic ESP32 (with its two DACs) as a small DAQ:** analog inputs, analog outputs, digital lines and
      counters, and hardware-timed sampling sent in SCPI definite-length binary blocks. **The developer writes the
      firmware**; Solder only needs the command set, which is written down when this step comes and is served first by
      a simulated ESP32 (point 3).
   3. **A DAQmx-like layer** over it (Create Channel, Timing, Start, Read, Stop, Clear), so the ESP32 is a device the
      way an NI card is. It gets its own DT, after measuring DAQmx in LabVIEW with a simulated NI device.
   4. **LabVIEW Core 1** (DT-054), with the hardware lessons done on the ESP32 and on simulated instruments.
2. **Measured in LabVIEW first** (rule 2): the VISA palette and every function's behavior (timeouts and their error
   codes, termination characters, Bytes at Port), with LabVIEW in the VM speaking to a simulated instrument on the
   Linux host. Later the ESP32 can be passed to the VM by USB to compare with the real device.
3. **Instruments are simulated with [Crucible](https://github.com/anlaco/Crucible)**, the anlaco digital twin of a test
   bench: it serves devices described in YAML over their protocol and transport (SCPI over TCP today, as
   `TCPIP0::<host>::5025::SOCKET`; serial is in its roadmap). The same simulated instrument answers LabVIEW in the VM
   (measurement) and Solder in the tests, so no test depends on hardware. A Crucible profile of the ESP32 DAQ is where
   its command set is first written. What Crucible lacks (a serial transport, a DAQ profile) is done in Crucible, as
   Crucible work.
4. **The Olimex GateMateA1-EVB** (Cologne Chip FPGA) is the platform for anlaco's own instruments later; to Solder it
   will be one more SCPI instrument. Programming it from Solder stays parked (`docs/ideas/fpga-yosys.md`).

### Consequences

- §3b of the plan gets these steps after the execution scheduler; Core 1 moves behind them.
- The first transport may be TCP rather than serial, since that is what Crucible serves today; decided with the
  measurements of step 1.

### How it is verified

| Statement | Mechanism | Status |
|-----------|-----------|--------|
| Each VISA function behaves as in LabVIEW | Measurements against Crucible in the VM, and tests against Crucible in `npm test` | **Unverified**: nothing done yet |
| No test of hardware I/O needs hardware | The I/O tests run against Crucible only | **Unverified** |

## DT-065

**Solder speaks to instruments through its own VISA, written in Rust: a library crate, loaded by Node as an N-API
addon, which the editor runs in an Electron `utilityProcess`. Solder does not depend on NI-VISA.**

- **Status:** Accepted on 2026-10-25 by the developer. It settles point 5 and consequence d of [DT-039](#dt-039)
  (how the hardware host connects to the editor; blocking I/O) for the Instrument I/O of [DT-064](#dt-064).
- **Why:** the behavior VISA shows in LabVIEW is measured
  (`labview-captures/reports/2026-10-25-visa-read-socket.md`): its defaults, its stop conditions and its status
  codes can be reproduced exactly by our own code, so Solder runs where NI-VISA is not installed and carries no
  proprietary runtime. One Rust implementation serves every host: Node today, the future wasmtime host tomorrow.

### Decision

1. **Two crates in a Cargo workspace at the root** (DT-039 e: the workspace comes back with the hardware host):
   - `native/solder-io`: the library. A resource manager with sessions, the resource strings, each session's
     attributes (Timeout Value, Termination Character, Termination Character Enable) and VISA's status codes:
     0 for success, positive for a warning, negative for an error, the values of the VISA standard (`visa.h`).
     Transports: TCP sockets (`TCPIP[n]::host::port::SOCKET`) first, serial next. No Node in it.
   - `native/solder-io-node`: the N-API binding (napi-rs), a `cdylib` loaded by Node as a `.node` file. Every
     operation runs off the JavaScript thread (libuv's pool) and answers a promise, so a Read that waits for its
     timeout blocks nobody.
2. **An operation answers its status with its data**, as VISA does: a Read that times out still returns the bytes it
   got (measured: 27 bytes and the timeout error).
3. **In the editor**, the addon is loaded in a `utilityProcess` created by the main process, not in the renderer
   (which is sandboxed) nor in the main process: a fault of native code ends that process, not the editor. The Run's
   coordinator talks to it over a `MessagePort`. **In Node** (command line, tests) the coordinator loads the addon
   directly.
4. **A VISA function in a VI is an external wait**, like a dialog (DT-063 §8): the clump parks, the coordinator asks
   the I/O, and wakes the clump with the answer, writing the data into the shared memory. No thread of the pool
   blocks on I/O.
5. **Tests do not need hardware nor NI-VISA.** The library's own tests, and the addon's from Node, run against a
   small SCPI responder started by the test itself; Crucible (DT-064 §3) is the instrument for measuring LabVIEW and
   for end-to-end runs. `npm test` builds the addon with Cargo first.

### Consequences

- Building Solder now needs the Rust toolchain of `rust-toolchain.toml`, and `npm run dist` needs the addon for each
  platform it packages (Windows included).
- What VISA does that is not measured yet (an invalid resource string, a peer that closes, Close's own result, how long
  a refused Open takes) is written as "unverified" in the code and measured before it is relied on.

### How it is verified

| Statement | Mechanism | Status |
|-----------|-----------|--------|
| Read stops at the count, at the termination character when enabled, or at the timeout, with LabVIEW's codes | `native/solder-io/tests/socket_session.rs` against a local responder | **Verified** on a TCP socket (2026-10-25); by hand against Crucible's Keithley the addon gave LabVIEW's Q1: 27 bytes, the timeout code, 2026 ms |
| The addon answers from Node without blocking its thread | `test/native/solder-io.test.mjs` | **Verified** |
| A fault of the addon does not end the editor | — | **Unverified**: the `utilityProcess` does not exist yet |

## DT-066

**A VISA resource name is a type of its own, laid out in memory as its resource string and its session; VISA Open,
Write, Read and Close are compiled as external waits that the Run's coordinator answers through Solder's VISA.**

- **Status:** Accepted on 2026-10-26 by the developer, who chose to join the external wait of [DT-065](#dt-065) §4
  with the core of the VISA functions, so that it is tested with real VIs. It builds on [DT-042](#dt-042) (the data
  space), [DT-043](#dt-043) (the error cluster) and [DT-063](#dt-063) §8 (external waits).
- **Why:** LabVIEW's VISA resource name carries a name and a refnum (measured over ActiveX as `[name, refnum]`,
  `labview-captures/reports/2026-10-25-visa-read-socket.md`); laid out as a cluster, it reuses every piece of
  memory, copying, panel records and subVI slots that clusters already have, while staying a type of its own on
  wires, in the catalog and in the `.sdg`.

### Decision

1. **The type** is `"visa-resource"` (`VISA_RESOURCE` in `core/model/types.mjs`), a scalar name in the catalog,
   the graph and the `.sdg`. The compiler lays it out, and only there (`inMemory`), as the cluster
   `{ "resource name": string, session: U32 }`; a new constant has session 0.
2. **The blocks** `visa-open`, `visa-write`, `visa-read`, `visa-close` and `visa-resource-constant`, with the terminals
   and types measured (`labview-captures/reports/2026-10-26-visa-edges.md` Q1: counts, byte count and Open timeout
   are U32). Access mode and duplicate session are accepted and not used yet.
3. **Each VISA function parks its clump** through an import of the `io` module (`visa_open`, `visa_write`,
   `visa_read`, `visa_close`), which takes the addresses of its inputs and of its outputs. On one thread the
   runtime parks on the I/O's promise; on a pool the thread hands the call to the coordinator, as a dialog does.
   The coordinator talks to the I/O and writes the outputs into the shared memory before waking the clump
   (`core/runtime/instrument-io.mjs`).
4. **What LabVIEW does, measured** (2026-10-25 and 2026-10-26 reports): with an error in nothing runs, the error
   passes untouched, the resource name passes through and the buffer and the count give "" and 0; a warning that
   comes in passes a clean function unchanged; an error or warning carries `"<function> in <call chain>"` as its
   source; Write and Read on a name with no live session (never opened, or closed) open it from the name and go on;
   every Open gives a new session; Close of a session that is not open is the warning VI_WARN_NULL_OBJECT
   (1073676418).
5. **The I/O is given to the Run** (`ejecutar`'s `io` option): the addon in Node (the command line loads it itself,
   the tests pass it). A Run without it that reaches a VISA function fails, saying that instrument I/O is not
   available: the editor until its `utilityProcess` exists.

### Consequences

- The editor's palettes, the VISA resource name control and its wire are still to do; so is the `utilityProcess`.
- The sessions a Run opens by name stay open after it. Whether LabVIEW closes a VI's VISA sessions when it stops is
  **unverified**, and so are: a refnum 0 on entry (LabVIEW gives a name a refnum as soon as it is set), Open with a
  nonzero timeout, access mode or duplicate session, which status wins when a warning comes in and the function
  gives its own, and a failed auto-open's error.

### How it is verified

| Statement | Mechanism | Status |
|-----------|-----------|--------|
| Open, Write, Read and Close run against an instrument, on one thread and on a pool, with LabVIEW's warning passed through Close | `test/core/visa.test.mjs` against a local responder | **Verified** |
| With an error in, nothing runs and the outputs give their defaults | `test/core/visa.test.mjs` | **Verified** |
| Write and Read with no Open, and after a Close, open from the name; a second Close is a warning | `test/core/visa.test.mjs` | **Verified** against LabVIEW's measurements of 2026-10-26 |
| A Run without I/O fails saying why | `test/core/visa.test.mjs` | **Verified** |

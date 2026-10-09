# 02 — Syntax of the file format

> Status: **DRAFT** — pending review
> Normative. It defines the shape of `.qvi` files.
> Requires the vocabulary of [`01-glossary.md`](01-glossary.md).

## 1. The schema is the specification

The formal and **authoritative** definition of the syntax is
[`../schema/qvi.schema.json`](../schema/qvi.schema.json), a JSON Schema
(draft 2020-12).

> **A file that does not validate against that schema is not a conforming `.qvi`.**

This document **explains** the schema and justifies its decisions. When text and
schema disagree, **the schema rules**: it is the one that gets executed.

*(Motivation: the project's earlier documentation described the format in
prose, and over time it described a format that the code did not accept —
`ai-reference.md` (from the Red era, outside this repository) even taught a way of writing wires that the
loader corrupted. An executable schema cannot silently fall out of sync:
it either validates or it does not.)*

### 1.1 What the schema does NOT check

The schema validates **syntax**, not **semantics**. These things are syntactically
valid and yet **MUST NOT** compile; `solder check` checks them and they are
defined in [`03-static-semantics.md`](03-static-semantics.md):

- A wire to a port that the block type does not declare.
- A wire between incompatible data types.
- Two wires to the same input port (*fan-in*).
- A name that does not exist, or a repeated one.
- A cycle in the graph.
- A node `type` that is not in the block registry.

That separation is deliberate: the schema is cheap and universal —any editor
applies it live—, but it does not know the block registry.

## 2. The three layers

Every `.qvi` contains three kinds of information, and the format **separates
them physically**:

| Layer | Where it lives | Does it affect the compiled program? |
|------|-----------|-------------------------------|
| **Semantic** | `block-diagram`, `capabilities`, and `default`/`type` of the `front-panel` | Yes |
| **Interface** | `front-panel`, `connector` | Determines how the VI is invoked |
| **Presentation** | `layout` | **No** |

> **Normative requirement.** A conforming compiler **MUST NOT** read `layout`.
> Changing only `layout` **MUST** produce a byte-for-byte identical WebAssembly
> module.
>
> *Verification: the invariant was checked in a spike (moving a node produces the
> same binary). The regression test lives with the compiler.*

Putting the presentation in its own section, instead of next to each node, makes
that invariant **structural** rather than a discipline that has to be
remembered: the compiler cannot read coordinates by accident because they are not
where it looks.

`layout` is split into `diagram` and `panel` because **a control exists on both
canvases with the same name and a different position on each**.

## 3. Identity and references

### 3.1 `name` is the only identity

Every node, panel element, structure and shift register has a `name` that is
**unique across the whole VI** and immutable. **There are no numeric identifiers.**

*(The earlier format had a numeric `id` and a `name` at the same time, which
forced keeping two identities in sync and produced hacks such as the pseudo-`id`s
`-1`, `-2` and `-3` to refer to the terminals of a structure. With a single
identifier, the problem disappears.)*

A `name` **MUST** match `^[A-Za-z_][A-Za-z0-9_-]*$` and **MUST NOT** contain
dots: the dot is the separator of section 3.2.

### 3.2 The endpoints of a wire are `name.port`

```json
{ "from": "add_1.result", "to": "ind_1.value" }
```

This form was chosen over the alternative `{"node": "...", "port": "..."}` because
it is readable at a glance and is still validatable: the schema applies a
pattern to it that requires both halves to be non-empty.

Port names **MUST** be the ones declared by the block registry.

**A loose end (DT-046).** Either end of a wire may instead be `{ "loose": [x, y] }`, the point of the diagram where a
terminal was. Such a wire is **broken**: the VI is valid to read and to draw but does not compile until the wire is
wired again or removed (Edit ▸ Remove Broken Wires). The loose end appears when a node or a control is deleted
leaving its wires, and when a subVI no longer has the terminal a wire went to; a wire with both ends loose is never
saved. The `bends` of a wire whose destination is loose are not saved (the key of `layout.wires` is the destination);
the route is drawn again by default. Existing files stay valid.

```json
{ "from": "const_1.result", "to": { "loose": [196, 64] } }
```

> ⚠️ **Change from the earlier format.** The Red corpus wrote `out` and
> `in` where the registry declares `result` and `value`, and the loader also
> silently corrupted the destination port. See `../reference/history/whitelist.md` §6.3. **Old
> files are not converted mechanically: the port names must be fixed at both
> ends.**

### 3.3 A control is a node and a panel element at the same time

A control appears twice with the **same** `name`: as an entry in
`front-panel` and as a node of type `control` in `block-diagram`. They are not two
entities: they are the two faces of one. That is why `layout` needs to separate canvases.

## 4. File sections

### 4.1 `solder` *(required)*

Format version. Its value is `1`. A reader **MUST** reject a value greater than the
one it knows, instead of trying to read it halfway.

### 4.2 `meta` *(optional)*

`title`, `description`, `author`, `tags`. Informative: it does not affect compilation.

### 4.3 `capabilities` *(optional)*

The *gates*. **Their absence means no permissions**, not all of them.

```json
"capabilities": {
  "tcp": { "allow": ["192.168.1.10:5025"] },
  "serial": { "allow": ["/dev/ttyUSB0"] }
}
```

The recognized sections are a closed set; an unknown capability is
an **error**, not an ignored permission. *(A gate that the host does not know would never
open, so declaring one is always an author's mistake.)*

The full model will be in `design/03-seguridad.md` *(not yet written)*.

> **Open question.** Fixing an IP inside the program file makes the
> VI stop working when the test bench changes, and makes a colleague's `.qvi`
> useless. A level of indirection is needed —profiles, per-subnet wildcards, or
> project-level permissions— or everyone will put `["*"]` on the
> first day. **Unresolved; it is the work of `design/03-seguridad.md`.**

### 4.4 `front-panel` *(optional)*

List of controls and indicators. The order is **not** significant — the
arrangement is in `layout`.

```json
{ "name": "ctrl_1", "role": "control", "type": "number", "default": 5.0 }
```

`default` is **semantic**: it is the initial value of the program, not a
presentation preference.

A **type** is a string if it is scalar, or an object if it is composite. The
definition is recursive and the type carries its full shape inside:

```json
{ "name": "datos",   "type": { "array": "number" } }
{ "name": "resumen", "type": { "cluster": [
      { "name": "total", "type": "number"  },
      { "name": "ok",    "type": "boolean" } ] } }
{ "name": "matriz",  "type": { "array": { "array": "number" } } }
```

`array` and `cluster` **MUST NOT** appear without their parameter. The
compatibility rules are in [`03-static-semantics.md`](03-static-semantics.md) §3.

### 4.5 `connector` *(optional)*

Enables use as a *sub-VI*. It lists which panel elements act as inputs
and which as outputs, by their `name`:

```json
"connector": { "inputs": ["a", "b"], "outputs": ["resultado"] }
```

A terminal can also say which cell of the pattern it occupies and how it must
be wired (DT-045); `pattern` is LabVIEW's default, `4-2-2-4`, whose twelve cells
are numbered by columns, left to right and top to bottom:

```json
"connector": {
  "pattern": "4-2-2-4",
  "inputs": [{ "name": "a", "cell": 0, "connection": "required" }, "b"],
  "outputs": [{ "name": "resultado", "cell": 8 }]
}
```

A terminal without `cell` takes the first free cell on its side (inputs from the left column, outputs from the right one: our default, unverified in LabVIEW).

`connection` is `required`, `recommended` (when left out, as a new terminal in
LabVIEW) or `optional`; an output cannot be `required`.

### 4.5b `execution` *(optional)*

VI Properties ▸ Execution. `{ "reentrancy": "preallocated" }` gives each call
site its own copy of the VI; without it the VI is non-reentrant, as a new VI in
LabVIEW (DT-045). `{ "allow-debugging": false }` is VI Properties ▸ Execution ▸ Allow
debugging unchecked: the compiler emits no debug hooks (DT-047) and the editor greys
the debugging buttons. It is only written when false, because checked is the default.

### 4.5c The `subvi` node

`config.vi` is the path of the called `.qvi`, relative to the file of the
caller; the ports of the node are the terminals of its connector, named after
its panel elements.

### 4.6 `block-diagram` *(required)*

A *scope*: `nodes`, `wires` and `structures`. The body of a VI and that of each
structure have **exactly the same shape**, which allows nesting without
special cases.

### 4.7 `layout` *(optional)*

Pure presentation (§2). Its absence is valid: a `.qvi` without `layout` is a
correct program that the editor will arrange as best it can.

- `diagram` and `panel`: by node name, its place (`x`, `y`), its label
  (`label`) and where the label goes relative to the object (`label-offset`), on each canvas
  separately. In the diagram, additionally, `show-terminals` (Visible Items ▸
  Terminals) and `view-as-icon: false` (the terminal of a control, compact).
- `wires`: by destination (`name.port`, unique because an input receives a single
  wire), their bends in `bends`: a list that alternates x and y and starts and ends with x.

> **Normative requirement.** Writing a VI, reading it and writing it again **MUST**
> give the same text, and what is read **MUST** be drawn the same as what was saved. It is
> checked by `test/end-to-end/qvi-round-trip.test.mjs` ("lo que se guarda se abre igual"), with
> the reading and writing of `core/model/qvi-format.mjs`.

## 5. Structures

A structure contains a subgraph and controls its execution.

```json
{
  "name": "while_1",
  "kind": "while-loop",
  "shift-registers": [{ "name": "sr_acc" }],
  "body": { "nodes": [...], "wires": [...] }
}
```

*(Amended on 2026-10-01, DT-041: the condition, the count and the initial value of
a shift register are **wired**, as in LabVIEW; before they were properties
`condition`, `count` and `init`. The types of tunnels and shift registers are deduced
from the wires and their `type` field is optional. A While with Continue if True carries
`"condition-mode": "continue-if-true"`. Complete example:
`schema/examples/while-loop-suma.qvi.json`.)*

### 5.1 Terminals of a structure

Terminals are named, not numbered. This replaces the negative pseudo-`id`s
of the earlier format:

| Reference | Where it is used | What it is |
|-----------|--------------|--------|
| `while_1.i` | inside the body | Iteration counter |
| `while_1.condition` | inside the body, as a destination | Condition terminal of the While |
| `for_1.N` | **outside**, as a destination | Count terminal of the For |
| `while_1.sr_acc` as a destination | **outside** | Initial value of the shift register |
| `sr_acc.left` | inside the body | Value of the shift register in the previous iteration |
| `sr_acc.right` | inside the body | Value passed to the next iteration |
| `while_1.sr_acc` | **outside** the structure | Final value after the loop ends |
| `for_1.factor` | on both sides | A *tunnel*: whoever uses it depends on where the other end is |

The rule is uniform: **from outside the structure is addressed; from inside, the
terminal.**

### 5.1.1 Tunnels

A value **MUST NOT** cross the boundary of a structure with a direct wire:
it goes through a declared tunnel.

```json
"tunnels": [
  { "name": "factor", "type": "number", "dir": "in"  },
  { "name": "total",  "type": "number", "dir": "out" }
]
```

```json
// fuera:   { "from": "k.result",     "to": "for_1.factor" }
// dentro:  { "from": "for_1.factor", "to": "mul.a" }
```

> ⚠️ **New feature, not parity.** Tunnels do not exist in the Red implementation
> (`grep -ric "tunnel" src/` → 0), where the only way to get a value
> into a loop was the initial value of a shift register.
>
> LabVIEW's **auto-indexing** is deliberately left out. The format reserves
> room for a `mode` field that adds it without breaking anything.

### 5.2 Case structure

Explicit frames, each with the selector values that activate it, or marked
as the default frame:

```json
"frames": [
  { "match": [0], "body": {...} },
  { "match": [1], "body": {...} },
  { "default": true, "label": "Default", "body": {...} }
]
```

A frame **MUST** declare `match` or `default`. An unreachable frame is declared
dead code, and the schema rejects it.

`active-frame` —which frame the editor shows— is **presentation** and lives in
`layout`, not in the structure. The same goes for `frame-widths`, the width of each frame of a
`flat-sequence` (with its border, in the order of `frames`); without it, the editor splits
the width equally.

## 6. Differences from the earlier format

*(informative — for those coming from files in Red syntax)*

| Before (Red) | Now (JSON) | Reason |
|---|---|---|
| Red block syntax | JSON + JSON Schema | Ecosystem, validation in CI, AI generation. See `../reference/history/whitelist.md` DT-002 |
| Numeric `id` **and** `name` | Only `name` | Removes two identities that had to be kept in sync |
| `wire [from: 1 port: 'out to: 3 port: 'a]` | `{"from": "ctrl_1.result", "to": "add_1.a"}` | The repeated `port` key was ambiguous and the loader corrupted it |
| `out` / `in` ports | Registry ports: `result` / `value` | The corpus contradicted the registry |
| `x`, `y` next to each node | Separate `layout` section | Makes the presentation invariant structural |
| Pseudo-`id`s `-1`, `-2`, `-3` | `sr.left`, `sr.right`, `structure.i` | Readable and without magic numbers |
| `type: 'array` without saying of what | `{"array": "number"}`, recursive | The compiler needs the element type to emit WasmGC |
| Cluster shape in a separate `fields` | Inside the `type` itself | A single mechanism for all composite types |
| No tunnels | Explicit `tunnels` | Closes a real hole: today a loop cannot read anything from outside |
| Generated code section in the file | Does not exist | The `.qvi` is only the source. See `../reference/history/whitelist.md` DT-005 |
| `.qprim`, three-level libraries | Out of scope | They were fiction. See `01-glossary.md` §2.3 |

## 7. Verification

*(It follows the rule of `../README.md`: every claim comes with something that fails when it is
violated.)*

| Artifact | What it guarantees |
|-----------|---------------|
| [`../schema/qvi.schema.json`](../schema/qvi.schema.json) | The syntax, in an executable form |
| [`../schema/examples/suma-basica.qvi.json`](../schema/examples/suma-basica.qvi.json) | A real simple VI validates |
| [`../schema/examples/while-loop-suma.qvi.json`](../schema/examples/while-loop-suma.qvi.json) | Structures, shift registers and terminals validate |
| [`../schema/examples/escalar-array.qvi.json`](../schema/examples/escalar-array.qvi.json) | Composite types (`array`, `cluster`) and tunnels validate |
| [`../schema/examples/casos-no-validos.json`](../schema/examples/casos-no-validos.json) | **22 cases that the schema MUST reject** |

The last one is what keeps the schema from going soft over time: a schema
that accepts everything would pass the positive examples just as well.

**Status verified on 2026-07-28:** the 3 examples validate and the 22 negative
cases are rejected, against `jsonschema` 0.49.

**Pending:** bring this check to CI once `solder check` exists.

## 8. What this document leaves open

| Issue | Where it is resolved |
|----------|-------------------|
| Closed catalog of block types (a node's `type`) | `schema/blocks.json`, defined in `04-dynamic-semantics.md` |
| Format of `.qlib` and `.qproj` | This document, when `03` fixes the dependency model |
| Indirection of capabilities (§4.3) | `design/03-seguridad.md` |
| How the `default` values of array and cluster are represented | `03-static-semantics.md` |
| Auto-indexing of tunnels (§5.1.1) | Deliberately open; the `mode` field is reserved |

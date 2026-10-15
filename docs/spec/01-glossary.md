# 01 — Glossary and scope

> Status: **DRAFT** — pending review
> Normative. Defines the vocabulary used by the rest of the specification.
> A term written in *italics* inside another definition is defined here.

## 1. Conventions

This document and the others in `spec/` use these words with a precise meaning,
in the style of a language specification:

| Word | Meaning |
|------|---------|
| **MUST** / **MUST NOT** | Absolute requirement. An implementation that fails it is not conformant |
| **SHOULD** | Strong recommendation. Departing from it requires a written justification |
| **MAY** | Optional. Both options are conformant |
| *(informative)* | Explanation or motivation. It obliges nothing |

Every requirement **MUST** carry its verification mechanism next to it —a test,
a schema or a lint— or the mark **[UNVERIFIED]**.

## 2. Scope

### 2.1 What Solder is

Solder is a **visual dataflow programming environment** for instrumentation and
automation, inspired by LabVIEW. The user builds programs by placing *nodes* and
connecting them with *wires*; the result is saved in a `.sdg` file and compiled
to WebAssembly.

Solder is two things at once, and they should not be confused:

1. **A visual programming language**, whose syntax is the `.sdg` format and
   whose semantics this specification defines.
2. **An editor** that produces and consumes files of that language.

The language is the stable part and the public surface of the project. The
editor is an implementation.

### 2.2 What is part of the migration

- The complete visual language: nodes, wires, types, control structures,
  sub-VIs.
- The compiler, with WebAssembly as its target.
- The editor: *Block Diagram* and *Front Panel*.
- The execution runtime, with its capability model.
- The `.sdlib` libraries.
- Phase 4 hardware support (TCP, serial, USBTMC, Modbus, DAQ).

### 2.3 What is NOT part of it, and why

*(informative — each exclusion rests on [`../whitelist.md`](../reference/history/whitelist.md))*

| Excluded | Reason |
|----------|--------|
| **`.qprim`** (primitives as a file type) | DT-013 is fiction: zero files, zero code. What never existed is not specified |
| **Three-level library system** as it was described | DT-014 is partial fiction: only one level exists, and it is none of the three. It is redesigned from scratch in `02-syntax.md` |
| **`red-sg`** | A scene graph of its own for Red. The web interface ([DT-037](../design/05-decisions.md#dt-037)) replaces it entirely. DT-030, DT-031 and DT-033 are repealed |
| **The `anlaco/red` fork** | It disappears with Red. It was one of the reasons to migrate |
| **The six GTK restrictions** | Fixed windows, non-modal dialogs, no Tab navigation, fixed colors, no HiDPI, hand-made scrollbars. None of them is a product decision; all of them are patches. See `../reference/history/whitelist.md` §11.3 |
| **Undo/redo** | It was going to be inherited from `red-sg`. It is **undecided**, not excluded: room has to be made for it |

## 3. The program and its parts

**VI** — *Virtual Instrument*. The program unit of Solder. It is equivalent to a
function or to a complete program depending on how it is invoked. It is saved in
a `.sdg` file. A VI is made up of a *Front Panel*, a *Block Diagram* and,
optionally, a *connector pane*.

**Front Panel** (FP) — The user interface of the VI: the set of *controls* and
*indicators* with their visual layout. It is what the person running the program
sees.

**Block Diagram** (BD) — The *graph* that defines what the VI does. It is the
code.

**Control** — An element of the *Front Panel* that supplies an **input** value to
the program. Each control has a *default value* that is part of the semantics of
the VI, not of its presentation.

**Indicator** — An element of the *Front Panel* that shows an **output** value.

**Sub-VI** — A VI invoked from the *Block Diagram* of another. Any VI with a
*connector pane* can be used as a sub-VI; it is the calling context that
determines it, not a mark in the file.

**Connector pane** — The declaration of which *controls* and *indicators* of the
*Front Panel* act as input and output parameters when the VI is used as a
*sub-VI*. Its presence enables that use.

## 4. The graph

**Node** — An element of the *Block Diagram* that performs an operation. It has a
*block type*, an identity and zero or more *ports*.

**Block type** — The class of a *node* (`add`, `control`, `while-loop`…). It
determines its *ports* and its semantics. The set of available types is the
*block registry*.

**Block registry** — The authoritative definition of all *block types*: their
*ports*, data types and semantics. It **MUST** be the only source of that
information for the whole system. *(In the Red implementation this rule was not
met: there were 89 per-type decision sites in the interface and 0 in the
registry. See `../reference/history/whitelist.md` §8, Rule 12.)*

**Port** — A **named** connection point of a *node*, declared by its *block
type*. Every port has:
- a **name**, unique within its node and its direction;
- a **direction**: input or output;
- a **data type**.

> **This definition resolves an inherited ambiguity.** In the Red
> implementation, the port names in the registry and those in the `.sdg` files
> did not match: the registry declares the output of `control` as `result` and
> the input of `indicator` as `value`, while the corpus wrote `out` and `in`.
> It was not a tolerated alias: it was an inconsistency that the file loader
> also silently corrupted. **The names in the *block registry* are the only
> valid ones.** See `../reference/history/whitelist.md` §6.3.

**Dynamic port** — A *port* whose name or whose number is not fixed by the *block
type* but by the configuration of the specific *node*: the fields of a `bundle`,
the outputs of an `unbundle`, the parameters of a *sub-VI*.

**Terminal** — The **visual** representation of a *port* on the canvas of the
*Block Diagram*. A port is semantics; a terminal is presentation. Moving a
terminal does not change the program.

**Wire** — A directed connection from an output *port* of a *node* to an input
*port* of another. It carries a value of a specific *data type*.

**Fan-out** — When one output *port* feeds several *wires*. It **MAY** be done.

**Fan-in** — When several *wires* reach the same input *port*. It **MUST NOT**
happen: an input port accepts one wire at most. *(Verification: this rule is
checked both when connecting and when loading a file. In the Red implementation
it was only checked when connecting, and that is why the corpus contained
undetected violations.)*

**Broken wire** — A *wire* whose ends have incompatible *data types*, or that
violates some connection rule. A VI with broken wires **MUST NOT** compile.

**Structure** — A *node* that contains a subgraph and controls its execution:
`while-loop`, `for-loop`, `case-structure`.

**Tunnel** — The *port* through which a value crosses the boundary of a
*structure*, inwards or outwards.

**Shift register** — A mechanism of a loop *structure* that carries the value
from one iteration to the next. It has an initial value and two ends, one for
reading and one for writing.

**Dataflow** — The execution model: a *node* runs when all its input *ports*
have a value, and not before. The order between nodes that do not depend on each
other **is unspecified**. *(This indeterminacy is deliberate and is detailed in
`04-dynamic-semantics.md`. It has a verifiable consequence: moving a node around
the canvas cannot change the compiled program.)*

## 5. Identity and presentation

**`name`** — **Immutable** identifier of a *node* or *Front Panel* element,
generated when it is created (`ctrl_1`, `add_1`). The compiler uses it. It
**MUST NOT** change during the life of the element.

**`label`** — **Visible, free** text associated with an element, editable by the
user. It **MAY** be repeated between elements and it **MAY** be empty.

> `name` and `label` are independent. Renaming the label the user sees does not
> affect the compiled program. It is the distinction that lets two blocks be
> called "Suma" on screen without colliding in the code.

**Semantic layer** — The part of the `.sdg` that determines the program: the
graph, the types, the default values of the controls, the *connector pane*.

**Presentation layer** — The part that only affects how it looks: coordinates,
sizes, label visibility, icon. It **MUST NOT** influence the result of
compilation.

> **Verifiable invariant:** changing only the *presentation layer* of a `.sdg`
> **MUST** produce a byte-for-byte identical WebAssembly module.
> *(Verified in a spike; see `../reference/history/00-provisional-plan.md`.)*

## 6. Data types

**Data type** — The class of value that a *wire* carries: number, boolean,
string, array, cluster, waveform, or a *refnum*. The closed catalogue and its
compatibility rules are in `03-static-semantics.md`.

**Cluster** — A composite value made of named, typed fields, equivalent to a
record or `struct`.

**Refnum** — An opaque identifier of an **external resource** managed by the
execution environment: a TCP connection, a serial port, a device. A refnum
**MUST NOT** be inspectable or constructible from the program: it is only
obtained from the operation that opens the resource.

> *(In the Red implementation the TCP refnums were decorative: the connection
> was a global singleton and two `tcp-open` in the same diagram silently shared
> a socket. See `../reference/history/whitelist.md` §6.1.)*

## 7. Files

**`.sdg`** (Solder Graphical) — A *VI*. It contains the graph, the *Front Panel* and the
*presentation layer*. **It is the source of truth**: the compiled module is a
derived artifact and **MUST NOT** be stored inside the file. Until DT-051 it was
written `.qvi`; a `.qvi` still opens, and saved in place it keeps its name.

**`.sdt`** (Solder Text) — Reserved for a future textual Solder language
(DT-051). Nothing reads or writes it yet.

**`.sdlib`** — A library: a set of VIs distributed as a unit (`.qlib` before DT-051).

**`.sdproj`** — A project: the file tree and its dependencies (`.qproj` before DT-051).

**Schema** — The JSON Schema document that formally defines the syntax of these
files. It is **normative and executable**: a file that does not validate against
the schema is not a conformant `.sdg`.

## 8. Execution

**Host** — The execution environment of Solder: it manages the *Front Panel*,
external resources and *capabilities*.

**Guest** — The WebAssembly module compiled from the *Block Diagram*. It holds
the logic of the program and nothing else.

**Capability** *(gate)* — An explicit permission that the *host* grants to the
*guest* to access a specific external resource. Denied by default: a VI with no
declared capabilities **MUST NOT** be able to open any resource.

**Tick** — A unit of execution of the *guest* driven by the *host*. It lets
several loop *structures* progress in an interleaved way without blocking the
interface.

## 9. The reference and the inventory

**Reference** — The version of LabVIEW against which the editor interface and
the *LabVIEW inventory* are compared: **LabVIEW 2026Q3**
([DT-035](../design/05-decisions.md#dt-035)). In this specification, "LabVIEW"
means the reference, and a claim about what LabVIEW does is checked against it.
It lives in one place only: the `referencia` field of the inventory.

**LabVIEW inventory** — The list, in the form of data, of what the interface of
the *reference* shows and of the status of Solder with respect to each thing. It
lives in [`../schema/inventario-labview.json`](../schema/inventario-labview.json), and
the editor takes the status of each element from there. **Not to be confused**
with the parity contract of [`07-parity.md`](07-parity.md), which compares
Solder in Rust with Solder in Red.

**Placeholder** — Something the *reference* has and Solder does not do, yet or
ever. It is declared in its place in the interface, greyed out and with its
explanation, instead of being omitted ([`05-editor.md`](05-editor.md), Rule 52).

**Verdict** — The status of an entry of the *LabVIEW inventory*:

| Verdict | Means |
|---------|-------|
| `built` | It exists, and a test without an interface proves it |
| `todo` | Solder wants it and does not have it yet. It names the *unlock* it waits for |
| `elsewhere` | Solder solves it in another way, and says which |
| `never` | It is left out on purpose, and cites the decision that excludes it |

**Unlock** — The piece of implementation, verifiable without an interface, that a
`todo` *placeholder* waits for. Several placeholders waiting for the same unlock
point to a priority. *(It is not called "capability" so as not to confuse it with
the capability of §8, which is a permission.)*

## 10. Terms this glossary leaves pending

*(informative — they are resolved in the documents indicated)*

| Term | Where it is defined | Why not here |
|------|---------------------|--------------|
| Closed catalogue of *data types* and their coercions | `03-static-semantics.md` | It requires designing the type system, which today does not exist explicitly |
| Exact *fan-in* rule with *structures* and *shift registers* | `03-static-semantics.md` | In Red there were six different implementations |
| Execution order and its indeterminacy | `04-dynamic-semantics.md` | — |
| Semantics of blocking I/O and its relation to *tick* | `design/02-ejecucion.md` | Pending probe T8 |
| Undo/redo | Unassigned | It is left orphaned after repealing `red-sg` |

# 03 — Static semantics

> Status: **DRAFT** — pending review
> Normative. Defines when a syntactically valid VI is also **correct**.
> Requires [`01-glossary.md`](01-glossary.md) and [`02-syntax.md`](02-syntax.md).

## 1. Scope

[`02-syntax.md`](02-syntax.md) defines what a `.sdg` is **well formed as a
document**. This one defines what a VI is **well formed as a program**: types,
ports, connections and graph structure.

Everything declared checkable here is checked by `solder check`, and it **MUST**
be checked at three moments: when loading a file, when editing and when
compiling.

> **Why all three.** In the Red implementation it was only checked when editing.
> A loaded file was never validated, and that is why a loader defect that
> corrupted the wires of 9 of the 14 examples survived for months without
> anything failing. See [`../whitelist.md`](../reference/history/whitelist.md) §6.3.

## 2. The defect that governs this document

First, because it explains many of the rules below.

In the Red implementation, asking for the type of a port that **does not exist**
is not an error: it returns `number`. Verified by running:

```
port-out-type(control, 'result)   -> 'number     (puerto real)
port-out-type(control, 'out)      ->  number     (NO EXISTE, valor por defecto)
port-in-type (add,     'PATATA)   ->  number     (NO EXISTE, valor por defecto)

Comprobación que hace el editor al conectar:
  control.out -> add.PATATA       -> true        ← se acepta la conexión
```

Since the check is `output_type = input_type` and **both sides fall back to the
same default value**, any pair of invented ports is considered compatible. That
turns the type check into something almost empty for everything numeric, and it
is the reason the corpus with wrong ports went unnoticed.

> **Rule 1 — an unknown port is an error.**
> Querying a port that the *block registry* does not declare for that *block
> type* **MUST** produce an error. A default type **MUST NOT** be returned,
> neither `number` nor any other.
>
> *Verification: kernel unit test; negative case in the `check` suite.*

## 3. Type system

### 3.1 Catalogue

The data types are a closed set. The schema enumerates them in
`$defs/dataType`.

| Type | Description | Status |
|------|-------------|--------|
| `number` | Double-precision numeric: LabVIEW's DBL | Implemented |
| `i8` `i16` `i32` `i64` | Signed integers | [DT-038](../design/05-decisions.md#dt-038): in the editor |
| `u8` `u16` `u32` `u64` | Unsigned integers | DT-038: in the editor |
| `sgl` | Single-precision floating point | DT-038: in the editor |
| `{ "enum": [...] }` | Enumerated: labels with the values 0 to n-1; converts as U16 | DT-038: in the editor |
| `boolean` | True or false | Implemented |
| `string` | Text string | Implemented |
| `array` | Sequence of elements | **See §3.3: incomplete** |
| `cluster` | Record of named fields | **See §3.4** |
| `waveform` | Signal for chart and graph | **See §3.5: not implemented** |
| `error` | Error cluster | Reserved, DT-029 level 2 |
| `tcp-connection` | TCP connection *refnum* | Implemented |
| `serial-connection` | Serial port *refnum* | Reserved, Phase 4 |

*(The integers, SGL and the enum are added by DT-038, with LabVIEW's conversion:
§3.2 and §3.7. EXT, complex numbers and fixed point are left out.)*

### 3.2 Compatibility: strict equality

> **Rule 2.** A *wire* is valid if the type of its source port is **identical**
> to that of its destination port, or if **both are numeric** —also two arrays of
> numerics—. Between different numerics the value is converted, and the
> destination terminal **MUST** carry a *coercion dot*. Outside the numerics
> there is **no implicit conversion**.

*(Changed by [DT-038](../design/05-decisions.md#dt-038) on 2026-09-29. Before, it
was strict equality for everything, which is what the Red implementation did with
a single numeric type. The conversion is LabVIEW's —its help, "Numeric
Conversion"—: from integer to floating point, to the nearest value; from floating
point to integer, saturating; between integers, extending or truncating the
bits.)*

> **Rule 2f — common type.** The inputs of a function that share a numeric
> variable `{ "num": "N" }` take the common type of what reaches them: floating
> point wins over integer; then the representation with more bits; with the same
> bits, the unsigned one. With nothing wired, `N` is DBL.

> **Rule 2g — representation of a terminal.** A numeric constant, control or
> indicator has the representation it is given (Representation): that is its
> type. When it is changed, its value is carried over to the new one: an integer
> is rounded to the nearest and, on a tie, to the even one (3.7 → 4; 2.5 → 2), and
> saturates in its range; an SGL loses the precision that does not fit in 32 bits.
> The wires are kept and the types are resolved again. Verified in LabVIEW 2026 Q3
> for DBL → I32 and DBL → SGL; saturation between integers, unverified.

> **Rule 2h — Expression Node.** Its output has the type of its input. The
> formula is computed in DBL and the result returns to that type rounding to even
> (with an I32: 3/2 → 2, 5/2 → 2, 5·2.7 → 14). The syntax is that of the Formula
> Node, that of C: `**` is the power (right-associative and stronger than the
> leading minus: −x\*\*2 = −(x\*\*2)); `^` is exclusive or, weaker than `+` and
> `−`, and with a non-integer input the VI does not compile (*Integer type
> required*); `%`, `mod` and `rem` give the truncated remainder (−2.5 % 2 = −0.5).
> The functions are the 39 in its contextual help; `sinc(x)` is sin(x)/x, `int`
> rounds to even, `intrz` truncates and `getexp`/`getman` split in base 2.
> Verified in LabVIEW 2026 Q3. Not done: the comma as an operator (`x*2,7` gives 7
> in LabVIEW), comparisons, logical operators and `sizeOfDim`, which waits for
> arrays.

> **Rule 2i — Comparison.** The functions of the Comparison subpalette share the
> scalar type variable `{ "escalar": "C" }`: a boolean or a number. Two numbers
> take the common type of Rule 2f (and the one that is not it carries a coercion
> dot); two booleans are compared as 0 and 1, with FALSE < TRUE; a boolean with a
> number breaks the wire. With nothing wired, `C` is DBL. Equal?, Not Equal?,
> Greater?, Less?, Greater Or Equal? and Less Or Equal? give a boolean; the six
> "To 0?" only accept numbers. Verified in LabVIEW 2026 Q3:
>
> - I64 9007199254740993 = DBL 9007199254740992 is TRUE: the I64 becomes DBL and
>   loses the last bit. U8 200 > I8 −1 is FALSE: with the same bits the unsigned
>   one wins and −1 becomes 255.
> - With a NaN —in one operand or in both— everything is FALSE except Not Equal?,
>   which is TRUE (IEEE 754). The same with the comparisons with 0.
> - Not A Number/Path/Refnum? is TRUE only with a NaN (with +Inf or 5, FALSE).
> - **Select** (t, s, f) returns t if s is TRUE and f if not; t and f take the
>   common type (t = U8 200 and f = I8 −1 with s = FALSE gives 255).
> - **Max & Min** (x, y) gives max(x,y) and min(x,y). A NaN is ignored if the
>   other is a number: (NaN, 1) and (1, NaN) give 1 and 1; (NaN, NaN) gives NaN and
>   NaN.
> - **In Range and Coerce** (upper limit, x, lower limit) gives coerced(x) and In
>   Range?. By default the lower limit is included and the upper one is not (the
>   *Include lower limit* / *Include upper limit* setting of the right-click
>   menu). In Range? is x ≥ L and x ≤ U (with > or < if the end is not included);
>   with crossed limits (L > U) it is FALSE. coerced(x) brings x to [L, U], and
>   with crossed limits it uses the two sorted (the median of x, L and U); if x or
>   a limit is NaN, coerced(x) is NaN and In Range? FALSE. (A NaN in the upper
>   limit, untested.)
> - Not done: comparing strings, arrays, clusters, paths and refnums, and the
>   *Comparison Mode* (Compare Elements / Compare Aggregates), which only changes
>   anything with arrays and clusters.

> **Rule 2j — Strings (M3).** A string (`string`, pink wire) is **bytes**, not
> characters (DT-042). Verified in LabVIEW 2026 Q3
> (`labview-captures/string/prueba-*.png`):
>
> - **Comparison** accepts strings in the six comparisons and in Select: the
>   variable `C` (Rule 2i) also binds a string, and a string with a number or a
>   boolean breaks the wire. They are compared **byte by byte**: the first
>   differing byte wins, and if one is the beginning of the other, the shorter one
>   is the lesser (`"B" > "a"` is FALSE; `"ab" > "abc"`, FALSE; `"" < "a"`, TRUE).
> - **Empty String/Path?** is TRUE with the empty string. **Decimal Digit?**, **Hex
>   Digit?**, **Octal Digit?** and **White Space?** share the variable `{ "texto":
>   "T" }`: a string (they look at its first byte; empty, FALSE) or a number (its
>   ASCII code, according to NI's help); unwired, a string. White Space? is TRUE
>   with space, HT, LF, VT, FF and CR. **Printable?** and **Lexical Class** are not
>   done: it has not been measured which bytes count.
> - **The numbers of the String functions** (offset, length, width,
>   precision, offset past…) are I32: a wired DBL enters with a coercion dot
>   (Rule 2f). Those that give or read a number do so with the numeric variable `N`
>   (`defecto`: I32 in Number To Decimal/Hexadecimal/Octal String and in Decimal
>   String To Number; DBL in the fractional ones; U32 in Hexadecimal and Octal
>   String To Number); in those that read, the type of `number` is that of
>   `default`.
> - **Concatenate Strings** has a variable number of inputs, like Compound
>   Arithmetic (`dynamic:compound-inputs`, minimum 2): it is stretched by its
>   handles. The array inputs, with the arrays (M6).
> - Unwired inputs take their default value from the catalogue: `offset` 0,
>   `length` of String Subset the rest of the string, `length` of Replace
>   Substring the bytes of `substring`, `precision` 6, the booleans of Search and
>   Replace String FALSE. An unwired number in Number To Decimal String is I32.
> - **Without the error inputs and outputs** (`error in`, `error out`) of Search
>   and Replace String, Format Into String and the rest: they wait for the error
>   cluster.

### 3.3 Compound types carry their shape inside

A type is **a string** if it is scalar and **an object** if it is compound:

```json
"number"
{ "array": "number" }
{ "array": "number", "dims": 2 }
{ "cluster": [ { "name": "total", "type": "number" },
               { "name": "ok",    "type": "boolean" } ] }
{ "array": { "cluster": [ ... ] } }
```

An array is its element type plus a number of dimensions, `dims`, left out
when it is 1; this is how LabVIEW's type descriptor describes it (DT-044).
Clusters may contain arrays and arrays may contain clusters, but **an array
never contains an array**: LabVIEW has no arrays of arrays, and wherever one
would appear (an indexed output tunnel that receives arrays, Build Array of
arrays without Concatenate Inputs) a multidimensional array appears instead.
`06-visual.md` §4.3 already anticipated 2D arrays.

> **Rule 2b.** `array` and `cluster` **MUST NOT** appear without their parameter.
> A bare `"type": "array"` is not a valid type.

> **Rule 2c — The empty array (DT-060).** `{ "array": "void" }` is an array with no element yet: what the
> palette's Array and Array Constant place, as in LabVIEW 2026 Q3. `"void"` is valid only as the element of
> `arr-const`, `arr-control` and `arr-indicator`. A VI that has one is not runnable; nothing infers its type
> from a wire. Tested in `test/core/array-typing.test.mjs`.

*(Motivation: in Red it did not matter because the language is dynamic. For
emitting WebAssembly it does matter — the compiler has to know whether it emits
`(array (mut f64))` or `(array (mut i8))`. And unifying array and cluster under
the same rule removes the earlier inconsistency, where the shape of a cluster
lived in a `fields` field separate from its own `type`.)*

**Consequence for the array blocks.** `index-array` today declares that it
returns `number` whatever the input array is. With parameterized types, its output
is the **element type of the connected array**: it is a block whose output type
depends on its input. `04-dynamic-semantics.md` **MUST** say which blocks have
that property and how it propagates.

### 3.4 Compatibility of compound types

Two compound types are identical if they are so **structurally**:

- Two `array` if their element types are identical.
- Two `cluster` if they have **the same fields, with the same name and the same
  type, in the same order**.

*(Order matters because the compiler emits a WasmGC `struct` with positional
fields. Relaxing it would require a conversion, which Rule 2 forbids.)*

### 3.5 `waveform` does not exist yet

The `waveform-chart` and `waveform-graph` blocks **have no implementation**: they
declare no `emit` and the compiler generates for them an empty canvas that is
never updated, despite being marked as completed. See
[`../whitelist.md`](../reference/history/whitelist.md) §9.

**The type is reserved but its semantics are left unspecified** until it is
implemented. Specifying in prose something that does not exist is exactly what
this documentation tries not to repeat.

### 3.6 Type propagation

When arrays are parameterized (§3.3), blocks appear whose output type **is not
fixed by their block type**, but by what is connected to them. `index-array` on
an `array<number>` returns `number`; on an `array<string>`, `string`.

**The problem is small and bounded.** Reviewing the 45 blocks of the registry,
seven use the type variable `E`, and four the variable `C`:

| Block | Declaration | Origin of the type |
|-------|-------------|--------------------|
| `index-array` | `arr: array<E>`, `index: number` → `result: E` | **Propagates** the element from the wire |
| `array-subset` | `arr: array<E>`, `start`, `length: number` → `result: array<E>` | **Propagates** the whole array from the wire |
| `build-array` | `a: E`, `b: E` → `result: array<E>` | **Propagates** and generalizes from the wires |
| `array-size` | `arr: array<E>` → `result: number` | Accepts any array; `E` does not leave the node |
| `arr-indicator` | `value: array<E>` | Accepts any array |
| `arr-const` | `result: E` | `E` = whole array type, fixed by `config` |
| `arr-control` | `result: E` | `E` = whole array type, fixed by the panel |

*(`waveform-graph` appears in the old registry with `value: array<E>`, but it is
not implemented —see §3.5— and is not specified.)*

*(`build-array` today declares `a: number, b: number`. Keeping it that way would
allow declaring an `array<string>` and being unable to build it, which would be
arbitrary once arrays carry a parameter. It is a small and necessary extension
for §3.3 to make sense.)*

The cluster blocks —`bundle`, `unbundle`, `cluster-control`,
`cluster-indicator`— use the variable `C`, bound to the cluster declared in
`config.type` or in the panel, **never from a wire**. `subvi` takes its types from
the `connector` of the invoked VI. None of them propagates: the node itself
declares its shape. That is the dynamic ports mechanism of §4.3 and was already
solved.

#### How it is resolved

> **Rule 2c — forward resolution.** Types are resolved in **topological order,
> in a single pass**. For each node, its input ports already have a known type
> —they come from the output port that feeds them—; the type variables are bound
> by comparing those types with the block's declaration, and the output types are
> obtained by substitution.

Neither bidirectional inference nor general unification is needed: in a dataflow
language **the type of a wire is determined by its source**, and topological
order guarantees that every source is resolved before its destination. It is the
same order the compiler needs anyway.

> **Rule 2d.** If a type variable appears in several input ports, all of them
> **MUST** bind it to the same type. `build-array` with `a: number` and
> `b: string` is an error.

> **Rule 2e.** If a type variable cannot be bound —because the port that
> determines it has no wire— the VI **MUST NOT** compile, and the error **MUST**
> point at the unconnected port, not at the unresolved variable.

#### Why not the alternative

The other option was to **declare the resolved type in the `config` of each
node**, so that the file would be self-describing and nothing would need to be
inferred. It is discarded: it would be redundant data, maintained by the machine,
that can fall out of sync with the array that is actually connected. It is exactly
the class of defect the audit found five times.

The advantage that is lost —that an external generator or an AI knows the type of
each wire without running anything (DT-021)— is recovered another way: `solder
check` reports the resolved types. The file does not need to carry them.

### 3.7 When the integers arrive

Adding `i32`/`i16` forces deciding the coercion rules at the same time, because as
soon as there are two numeric types Rule 2 starts rejecting reasonable programs.
**Do not add numeric types without first defining their conversion.**

> **Closed by [DT-038](../design/05-decisions.md#dt-038)** (2026-09-29): the
> integers arrive with LabVIEW's conversion, in Rules 2 and 2f.

## 4. Ports

### 4.1 The block registry is the authority

> **Rule 3.** The *ports* of a node —their name, direction and type— are
> determined **exclusively** by the *block registry*, except for the dynamic ports
> of §4.3. No other module **MUST** decide that information.

*(In Red this rule was not met: port resolution and the whole type system lived in
the render layer, the compiler had its own duplicated copy of the computation for
sub-VIs, and the registry had **zero** per-type decision sites against 89 in the
interface. See [`../whitelist.md`](../reference/history/whitelist.md) §3
(DT-032) and §8, Rule 12.
There was also a decision adopted to fix it —DT-032, "centralized type-info"—
that was never implemented.)*

### 4.2 Port names

The names are those of the registry. For the basic blocks:

| Block | Inputs | Outputs |
|-------|--------|---------|
| `control` | — | `result` |
| `indicator` | `value` | — |
| `const` | — | `result` |
| `add`, `sub`, `mul`, `div` | `a`, `b` | `result` |
| `equal`, `not-equal`, `greater`, `less`, `greater-or-equal`, `less-or-equal` | `x`, `y` | `result` |

> ⚠️ The Red corpus wrote `out` and `in`. **Those names are not valid.** The
> complete table of the 45 blocks is `schema/blocks.json`, defined in
> `04-dynamic-semantics.md`.

### 4.3 Dynamic ports

Four blocks have ports that depend on the node's configuration, not only on its
type:

| Block | Where its ports come from |
|-------|---------------------------|
| `bundle` | One input port for each field of the cluster declared in `config.type` |
| `unbundle` | One output port for each field of the cluster declared in `config.type` |
| `cluster-control` / `cluster-indicator` | A single port for the whole cluster |
| `subvi` | One port for each input and output of the `connector` of the invoked VI |

For `subvi`, the ports take the name of the corresponding panel element of the
invoked VI.

*(In Red they were called `p1`, `p2`… derived from the position of the pin in the
connector, and that computation was literally duplicated between the render layer
and the compiler. Using the real name removes the duplication and makes the wire
readable.)*

> **Rule 4.** Resolving the ports of a node with dynamic ports **MUST** be a
> single kernel function, used by the editor, the compiler and `check` alike.

## 5. Connection rules

A *wire* is valid if it meets **all** of these conditions. This list replaces the
**six different implementations** that the rule had scattered across the editor in
Red, each with its own criteria.

> **Rule 5 — `can_connect`.** A wire from `source.port_o` to `destination.port_d`
> is valid if and only if:
>
> 1. `source` and `destination` exist and are different.
> 2. `port_o` is an **output** port of `source`, and exists (Rule 1).
> 3. `port_d` is an **input** port of `destination`, and exists (Rule 1).
> 4. Their types are identical (Rule 2).
> 5. `port_d` does not already have another wire (§6.2).
> 6. The wire respects the scope rules of §5.1.
> 7. The wire does not close a cycle (§6.3).

### 5.1 Scope: what can cross the boundary of a structure

> **Rule 5b.** A wire **MUST NOT** cross the boundary of a structure directly.
> Every crossing goes through a *tunnel*, a *shift register* or a control
> terminal.

| Source | Destination | Allowed? |
|--------|-------------|----------|
| Body node → node of the **same** body | | Yes |
| External node → body node, **direct** | | **No** — use a tunnel |
| Body node → node of **another** structure | | **No** |
| External node → `structure.tunnel` (`dir: in`) | a value enters | Yes |
| `structure.tunnel` (`dir: in`) → body node | it is consumed inside | Yes |
| Body node → `structure.tunnel` (`dir: out`) | a value leaves | Yes |
| `structure.tunnel` (`dir: out`) → external node | it is consumed outside | Yes |
| External node → `sr.left` | initial value of the shift register | Yes |
| Body node → `sr.right` | value for the next iteration | Yes, **only from the same body** |
| `sr.left` → body node | value of the previous iteration | Yes, **only to the same body** |
| `structure.sr` → external node | final value after the loop | Yes, **only outside** |

### 5.1.1 Tunnels

A *tunnel* is a port declared by the structure with a name, type and direction.
It is addressed the same way from both sides —`structure.tunnel`—; which end is
being used is determined by whether the other node is inside or outside.

> **Rule 5c.** A `dir: in` tunnel **MUST** have exactly one wire from outside. A
> `dir: out` tunnel **MUST** have exactly one wire from inside. In both cases,
> zero wires on the other side is valid: an unconsumed tunnel is not an error,
> only dead code.

**Timing semantics** *(detailed in `04-dynamic-semantics.md`)*: an input tunnel is
evaluated **once, before the first iteration**, not on every turn. An output
tunnel delivers the value **of the last iteration**.

> ⚠️ **Tunnels are a new feature, not parity.** They do not exist in the Red
> implementation: `grep -ric "tunnel" src/` → **0**. Today the only way to get a
> value into a loop is the initial value of a shift register.
>
> **LabVIEW's auto-indexing is not specified** —the mode in which an output tunnel
> of a for-loop builds an array with all the iterations—. The `mode` field is left
> undefined so that it can be added without changing the format.

*(In Red, the right terminal of the shift register did double duty —write
destination from inside and read source from outside— using the same
pseudo-identifier `-2`. `02-syntax.md` §5.1 separates them into `sr.right` and
`structure.sr`, which is what makes the last two rows expressible without special
cases.)*

### 5.2 Control terminals of the structures

| Terminal | Required type |
|----------|---------------|
| `while-loop` · `condition` | `boolean` |
| `for-loop` · `count` | `number` |
| `case-structure` · `selector` | `number`, `boolean` or `string` |

## 6. Well-formedness of the graph

### 6.1 Names

> **Rule 6.** Every `name` **MUST** be unique within the VI, including the nodes
> inside structures, the shift registers and the structures themselves.

*(The namespace is flat and not per scope, because wires reference unqualified
names and the structure terminals use the form `structure.terminal`.)*

### 6.2 Fan-in

> **Rule 7.** An input port **MUST** have at most one wire.

This is a property **of the model**, not of the editor. What the editor does when
you drop a wire on an already connected input —reject it or replace the previous
one— is an interaction decision and is defined in `05-editor.md`.

*(Separating it resolves a real inconsistency: in Red there were **three**
different behaviors. Normal ports rejected the second wire, the `count` terminal
of a for-loop **replaced** the previous one with `remove-each`, and the
`condition` terminal of a while-loop **overwrote** a field. In addition, the
function that implemented the rule was **defined twice** in the same file, with
different signatures, and the second one overrode the first.)*

### 6.3 Cycles

> **Rule 8.** The graph of each scope **MUST** be acyclic.

> **Rule 9.** Cycle detection **MUST** return **the specific cycle** —the list of
> nodes involved— as data, not as a fatal error.

*(In Red, detection lived inside the topological sorter and aborted with
`cause-error`. That way the cycle cannot be painted red in the editor, which is
the only useful thing that can be done with that information. The question "cycles
when connecting, when compiling, or both?" has been open since March in
`PLANNING.md` (from the Red stage, outside this repository); the answer is
**both**, with the same function.)*

Loop structures are **not** cycles: feedback goes through the *shift register*,
which by construction crosses iterations and does not create an edge within a
single scope.

### 6.4 Unconnected inputs

> **Rule 10.** An input port with no wire and no declared default value means the
> VI **MUST NOT** compile. The terminal of an indicator (a block with `panel` in
> the catalogue) is the exception: with no wire, the indicator keeps its value,
> and the VI compiles, as in LabVIEW.

*(It is LabVIEW's "broken node". In Red there was no check at all: `grep -rn
"check-\|validate" src/` finds **no** validation function in the whole tree.)*

## 7. What this implies for the kernel

The ten rules of this document define exactly what `tk-graph` must own, and nobody
else:

| Function | Rules it implements |
|----------|---------------------|
| `ports(node)` | 3, 4 — including the dynamic ones |
| `port_type(node, port)` | 1, 3 — **error if it does not exist** |
| `types_compatible(a, b)` | 2 |
| `can_connect(graph, source, destination)` | 5, 7, 8 |
| `topo_order(graph)` | 8, 9 — returns the cycle as data |
| `analyze(graph)` | 6, 10 and the fold of all the previous ones |

The interface design is in `design/01-arquitectura.md`.

## 8. Verification

*(Rule of [`../README.md`](../README.md): every claim comes with something that
fails when it is broken.)*

| Rule | Mechanism | Status |
|------|-----------|--------|
| 1 unknown port = error | Test "un puerto que no existe es un error"; the `check` case is missing | **Verified in the editor** |
| 2 strict equality, conversion between numerics | Tests `test/core/types.test.mjs` and `palettes.test.mjs` (coercion, broken wire) | **Verified in the editor** |
| 2f common type | Test "el tipo común sigue la regla de LabVIEW" | **Verified in the editor** |
| 2b `array`/`cluster` without parameter | **Negative schema cases** | ✅ **Verified** |
| 2c forward propagation | Test: `index-array` on `array<string>` returns `string` | Pending |
| 2d same variable, same type | Test: `build-array(number, string)` is an error | Pending |
| 2e unbound variable | Test: the error points at the unconnected port | Pending |
| 5b no direct boundary crossings | Test per row of the §5.1 table | Pending |
| 5c tunnel with exactly one wire on its side | Test | Pending |
| 5 `can_connect` | Table of cases: one test per row of §5.1 | Pending |
| 7 fan-in | Test "un cable a una entrada ocupada sustituye al anterior"; the validation on load is missing | **Verified in the editor** |
| 8, 9 cycles | Test "un ciclo se devuelve con sus nodos y rompe sus cables" | **Verified in the editor** |
| 10 unconnected inputs | Negative `check` case | Pending |
| All | The 14 files of the repaired corpus **MUST** pass `check` | Pending |

Those marked "in the editor" are so in `core/model/graph.mjs`: since DT-039 it is the
core, which the editor uses just the same and, when they exist, so will the
compiler and `check`.
**The rest is not verified**: it describes rules whose implementation does not
exist. It is the difference between a specification and an intention, and it is
marked as such.

## 9. Pending decisions

| # | Question | Status |
|---|----------|--------|
| 1 | Parameterize `array` (§3.3) | ✅ **Resolved** — recursive structured types, in the schema |
| 4 | How tunnels are declared (§5.1.1) | ✅ **Resolved** — explicit, with name, type and direction |
| 2 | Semantics of `waveform` (§3.5) | Open. It only blocks if it is decided to implement it |
| 3 | Flat or per-scope namespace? (§6.1) | Open. Flat is the proposal; nothing urgent |
| 5 | Integer types and their coercions (§3.6) | ✅ **Resolved** — [DT-038](../design/05-decisions.md#dt-038): LabVIEW's, with their conversion |
| 6 | Type propagation (§3.6) | ✅ **Resolved** — type variables, forward resolution in topological order. It affects 5 blocks |
| 7 | Auto-indexing of the `for-loop` tunnels (§5.1.1) | Open on purpose. The format leaves room |

**The three that blocked `04` are closed.** The ones still open (2, 3, 5, 7) do
not prevent writing the block catalogue.

# 04 — Dynamic semantics

> Status: **DRAFT** — pending review
> Normative. Defines what a VI **does** when it runs.
> Requires [`03-static-semantics.md`](03-static-semantics.md).

## 1. Execution model

Solder runs by **dataflow**:

> **Rule 11.** A node runs when **all** its input ports have a value, and not
> before. When it finishes, its output ports have a value.

An input port has a value if it has a *wire* whose source has already run, or
if the catalog declares a default value for it and it has no wire.

Everything else follows from this: there is no statement order, only dependencies.

Verified in LabVIEW 2026 Q3 (`labview-captures/run/`, DT-040):

> **Rule 11b.** An indicator is written **when its terminal runs**, and the
> panel shows it at that moment, with the VI still running; not at the end.

> **Rule 11c.** A control is read **when its terminal runs**. One with
> nothing before it —outside a loop— is read when the VI starts: changing it
> afterwards does not count. Inside a loop, it is read on every iteration.

> **Rule 11d.** A Run does not clear the indicators: they keep the value from the
> previous Run until another one is written to them.

## 2. The block catalog

The authority is [`../schema/blocks.json`](../schema/blocks.json): 42 specified
blocks, 2 declared but not implemented and 1 retired.

It was extracted by **running** the registry of the Red implementation, not by
transcribing it. Each block declares its category, input and output ports with
their types and order, default values, and the `side-effect`,
`blocking`, `dynamic-ports` and `capability` marks.

## 3. Differences from the Red registry

*(informative, but every line is a deliberate change)*

### 3.1 Normalized port names

Four ports had names that followed no convention:

| Block | Before | Now | Reason |
|-------|--------|-----|--------|
| `cluster-control` | `out` | `result` | All simple outputs are called `result` |
| `cluster-indicator` | `in` | `value` | All indicators receive through `value` |
| `unbundle` | `cluster-in` | `value` | Same |
| `waveform-graph` | `array` | `value` | Same |

Changing them now is free —the corpus is being rewritten anyway— and saves
having to remember each one separately.

### 3.2 `iter` disappears

It was a pseudo-block whose only output was the iteration counter. It is replaced
by the terminal `estructura.i`, which does not need to exist as a node. It also
removes the negative pseudo-identifiers that referenced it.

### 3.3 Blocks that gain type variables

`build-array`, `index-array`, `array-size`, `array-subset`, `arr-indicator`,
`arr-const` and `arr-control` are now declared with type variables, according to
[`03-static-semantics.md`](03-static-semantics.md) §3.6.

### 3.4 Blocks declared but not implemented

`waveform-chart` and `waveform-graph` appear in a separate section. **Their
semantics are not specified**, because they have none: they declare no emission
and the compiler generates an empty canvas for them that is never updated, even
though they are marked as completed. See [`../whitelist.md`](../reference/history/whitelist.md) §9.

## 4. Execution order

### 4.1 It is deliberately unspecified

> **Rule 12.** The relative order of two nodes **with no data dependency between
> them** is unspecified. An implementation **MAY** run them in any order, and
> **MAY** change it between runs or between versions.

This is what LabVIEW does, and it is what allows optimization and parallelization.

> **Rule 12b.** Two nodes with no data dependency between them **run at the same
> time** when either takes a while: a 1000 ms Wait and a 2000 ms one on different
> branches finish at 1 s and 2 s, and the VI at 2 s; a loop keeps spinning
> meanwhile. What does not depend on anything slow runs at the start.

> **Verifiable consequence.** Since the order does not depend on position on the
> canvas, **moving a node cannot change the result**. Together with the
> presentation invariant of [`02-syntax.md`](02-syntax.md) §2, this is checked by
> compiling the same VI with different `layout`s and comparing the modules.

### 4.2 When order does matter: side effects

Rule 12 is harmless for pure blocks. It is **not** for those carrying the
`side-effect` mark: two `display`s, or two writes to an instrument, produce
different results depending on the order.

> **Rule 13.** To force an order between nodes with side effects, an explicit
> data dependency **MUST** be used or, as in LabVIEW, a sequence structure
> (Flat or Stacked Sequence, M4). *(Amended on 2026-10-01: it said that Solder
> would have no sequences; LabVIEW has them and they are cloned.)*

The hardware blocks are already designed for that: `tcp-write` receives
`connection-in` and returns `connection-out` precisely so that they can be chained.

```
tcp-open → tcp-write → tcp-write → tcp-read → tcp-close
           (the chained refnum imposes the order)
```

> ⚠️ **`display` has no way to be chained.** Two `display`s in the same
> diagram have an indeterminate order and there is no way to fix it. It is a real
> inherited limitation; it is noted in §9.

### 4.3 The refnum must be a true value

> **Rule 14.** A *refnum* **MUST** identify the specific resource that the
> operation that produced it opened. Two `tcp-open`s in the same diagram **MUST**
> give two independent connections.

*(In the Red implementation this was false: `tcp` was a global singleton,
`_tcp-read-helper` received the connection and **ignored it**, and two `tcp-open`s
silently shared a socket. The refnum chaining of Issue #19 was decorative. See
[`../whitelist.md`](../reference/history/whitelist.md) §6.1. The host's resource
table fixes it at the root.)*

## 5. Structures

### 5.1 While Loop

1. The input tunnels are evaluated **once**, before the first iteration.
2. The shift registers take their `init` value.
3. Each iteration: the body runs; `estructura.i` is 0 on the first one.
4. At the end of the iteration `condition` is evaluated. If it is **true**, the
   loop **ends**.
5. The output tunnels and `estructura.sr` deliver the value from the last
   iteration.

> **Rule 15.** The body runs **at least once**: the condition is checked at the
> end. It is a `do…until`, not a `while`.

*(It matches LabVIEW and the Red implementation, which emits `until [...]`.)*

### 5.2 For Loop

Same, except that `count` is evaluated **once before starting** and determines the
number of iterations.

> **Rule 16.** If `count` is zero or negative, the body **MUST NOT** run
> at all. The output tunnels then deliver the default value of their
> type and the shift registers, the initial one. *(Verified in LabVIEW 2026 Q3 on
> 2026-10-01: N = 0 and N = -1 with a scalar output tunnel give 0; the
> shift registers, unverified.)*

> **Rule 16b.** A loop **yields** while it spins: every few milliseconds it lets
> the other branches, the panel and Abort run, even if its body waits for nothing
> (DT-041). The indicators inside are painted live; a control inside is
> read on every iteration. The iteration terminal is an I32 that does not go past 2³¹ − 1.

### 5.3 Case Structure

1. `selector` is evaluated.
2. **Exactly one** frame runs: the first whose `match` contains the value,
   or the `default` frame if none contains it.
3. The frames not chosen **MUST NOT** run, not even their side
   effects.

> **Rule 17.** Every output tunnel of a case structure **MUST** receive a
> value in **all** frames, unless it has **Use Default If Unwired**: a
> frame that does not wire it then gives the default value of its type. Without
> that option, a frame that does not assign it is a compile error. *(Amended on
> 2026-10-01: LabVIEW has that option.)*

> **Rule 17b.** The selector is a boolean or an integer; a decimal is rounded
> to the nearest integer, to even on a tie (2.5 → 2). A numeric selector
> needs a Default frame; a boolean one, its True and False frames. A value cannot
> be in two frames. *(Verified in LabVIEW 2026 Q3 on 2026-10-01: a DBL at the selector is
> coerced to an integer with 2.5 → frame 2, 1.5 → 2 and 0.5 → 0.)*

*(Without this rule, the output value would depend on which frame ran, and might
not exist. LabVIEW requires the same.)*

### 5.3b Flat and Stacked Sequence

> **Rule 17c.** The frames of a sequence run in order, each one when the previous
> one finishes, and a frame only passes data to the ones after it. In a **Flat
> Sequence**, what leaves a frame leaves **when that frame finishes** (verified in
> LabVIEW 2026 Q3); in a **Stacked Sequence**, when the last one finishes (NI
> help).

### 5.4 Shift registers and tunnels

| Element | When it is read | When it is written |
|---------|-----------------|--------------------|
| `in` tunnel | Once, before the first iteration | — |
| `out` tunnel | — | At the end of each iteration; the last one's value stays |
| `sr.left` | At the start of each iteration | — |
| `sr.right` | — | At the end of each iteration |
| `estructura.sr` | After the loop ends | — |

## 6. Observable behavior in the edge cases

This section exists because **the golden corpus compares displayed values**, and
these differences change those values.

### 6.1 Number format

> **Rule 18.** The conversion of a number to a string when displaying an
> indicator **MUST** produce the same text on every platform and with any
> regional setting. The decimal separator **MUST** be the point.

*(Two concrete reasons. One: Red produces `"1.0"` for the number 1.0 while
Rust's default formatting produces `"1"` — if it is not fixed, half the golden
corpus fails over a formatting difference. Two: GTK-004 documents that the current
floating-point arithmetic **depends on the regional setting** without
`LC_ALL=C`, so the inherited oracle has an undeclared environment dependency.)*

**Pending:** fix the exact format —how many decimals, scientific notation from
what magnitude— as part of `07-parity.md`.

### 6.2 Arithmetic

> **Rule 19.** Numeric arithmetic is IEEE 754 double precision. Division by
> zero **MUST** produce infinity or NaN per IEEE, and **MUST NOT**
> abort the run.

### 6.3 Index out of range

`index-array` with a negative index or one greater than or equal to the size.

> **PENDING DECISION.** Three options, with different consequences:
>
> 1. **Stop the VI** with an error pointing at the node. It is what WebAssembly
>    does naturally: `array.get` out of range produces a *trap*.
> 2. **Return the default value of the type** (0, `""`, `false`). It is what
>    LabVIEW does.
> 3. **Make it undefined behavior.** Discarded: a language is not specified
>    with deliberate holes.
>
> The Red implementation did `pick`, which returns `none` out of range, and the
> next operation failed with a Red error — that is, something like (1)
> but by accident and with a useless message.
>
> **Recommendation: (1)**, with a message that names the node and the index. An
> index out of range is almost always a program error, and (2) hides it.

### 6.3b One-dimensional array functions (M6, 2026-10-02)

A one-dimensional array is a `[n][padding][elements]` block in its node's cell (DT-042 d). These functions
only work with fixed-size elements (numbers and booleans); with strings or clusters, a compile error.

> **Rule 21h — Edge cases of the array functions.** Measured in LabVIEW 2026 Q3 with `[0, 1, 2]`
> (`labview-captures/array/res-*.png` and `res2-*.png`):
>
> - **Index Array:** a negative index or one ≥ n gives the element's default value (`-1` and `3` give 0).
> - **Array Subset:** a negative `index` counts as 0 (`(-1, 2)` gives `[0, 1]`); with `index` ≥ n, empty; `length` is clamped
>   to what remains, and negative gives empty; with `length` unwired, the rest (`index 1` gives `[1, 2]`).
> - **Replace Array Subset:** with a negative `index` or ≥ n, the array comes out the same; a piece that goes past the end is trimmed,
>   the array does not grow (`[7, 8, 9]` at 2 gives `[0, 1, 7]`).
> - **Insert Into Array:** `index` in [0, n]: at n it is appended at the end; negative or > n, the array comes out the same. With
>   `index` unwired, it is appended at the end.
> - **Delete From Array:** with a negative `index` or ≥ n, the array comes out the same and `deleted portion` is empty; `length` is clamped
>   to what remains (`(1, 7)` gives `[0]` and `[1, 2]`) and negative removes nothing. With `index` unwired, it removes the last
>   `length`.
> - **Array Max & Min:** the first one on a tie; NaNs do not count (`[NaN, 1, 3]` gives 3 at 2 and 1 at 1); an empty
>   array gives 0 and the indices at −1, also for DBL. Unverified: an array of only NaNs (here, 0 and −1).
> - **Search 1D Array:** a negative `start index` counts as 0; ≥ n, −1.
> - **Rotate 1D Array:** with positive `n` moves the last `n` to the front; negative, the opposite (`-1` gives `[1, 2, 0]`);
>   `n` is taken modulo the size (`4` is like `1`).
> - **Split 1D Array:** `index` is clamped to [0, n] (`-1` gives `[]` and everything; `7`, everything and `[]`).
> - **Sort 1D Array** sorts from lowest to highest; **Increment** and **Decrement Array Element** change the element at
>   `index` with the type's own wraparound. Unverified: the order of booleans (here, FALSE < TRUE) and an `index`
>   out of range in Increment/Decrement (here, nothing).
> - **Tunnels:** in a While, neither the input nor the output one is born indexed (Last Value); in a For, both are.

**Measured in LabVIEW 2026 Q3:** the indexed tunnel is drawn with a bracket.
A one-dimensional array is a 2 px wire in the color of the element's type.

### 6.3c Two-dimensional arrays (DT-044, 2026-10-03)

A 2D array is a `[rows][columns][elements in row order]` block in its node's cell. On the panel and in a
constant its value is a list of rows; a ragged value is padded with the element's default value.

> **Rule 21i — 2D arrays.** Measured in LabVIEW 2026 Q3 with `[[1,2,3],[4,5,6]]`
> (`labview-captures/array-2d/`), tested in `test/core/arrays.test.mjs`:
>
> - **Array Size** gives a 1D array of I32, rows first: `[2, 3]`. An empty 2D constant gives `[0, 0]`; a 2D array
>   can have 0 rows and 3 columns (Initialize Array with 0 and 3 gives `[0, 3]`).
> - **Index Array** grows to one index per dimension when a 2D array is wired. With row and column it gives the element
>   (`1, 2` gives 6) and, out of range, the default value. With only the row it gives that row (`1` gives `[4, 5, 6]`);
>   with only the column, that column (`1` gives `[2, 5]`); out of range, an empty array. Unverified: with no index wired,
>   the whole array (LabVIEW shows a 2D output glyph; the value was not run).
> - **Build Array** without Concatenate Inputs: inputs of the same dimensions are stacked into one more
>   (`[1,2,3]` and `[4,5]` give `[[1,2,3],[4,5,0]]`, padded with the default value; two 2D give a 3D); a 2D and a 1D give
>   the 2D with the 1D appended as a row, the same with Concatenate Inputs. With Concatenate Inputs, two 2D arrays
>   join their rows. An input with two dimensions less breaks its wire.
> - **Initialize Array** stretched to two sizes gives rows × columns copies of the element.
> - **For Loop:** a 2D array through an indexed input tunnel gives one row per iteration, and N is its number of rows;
>   1D arrays through an indexed output tunnel make a 2D array (two nested Fors with N = 2 and 3 wiring `i + j` give
>   `[[0,1,2],[1,2,3]]`). Unverified: rows of different lengths through an output tunnel (here, padded as in Build Array).
> - **Arrays of arrays** do not exist: dropping an array into an array shell does not nest it.
> - **Number of dimensions:** LabVIEW kept Add Dimension enabled up to 34 dimensions, when the
>   capture stopped; NI documents no limit. The compiler handles up to two for now.

**Measured in LabVIEW 2026 Q3:** a 2D wire is 3 px —the type's color, white, the type's color—; a 1D one, 2 px; a scalar, 1 px.

### 6.4 String functions

Measured in LabVIEW 2026 Q3 by building each function with one control per input and one
indicator per output (`labview-captures/string/prueba-*.png`). The texts are bytes:
**String Length** counts bytes (`"año"` is 4) and **To Upper/Lower Case** only changes
ASCII letters.

> **Rule 21b — String Subset.** With `"abcdef"`: (offset 2, length 100) gives
> `"cdef"`; a negative offset counts as 0 (`(-1, 2)` gives `"ab"`); a negative length gives `""`
> (`(2, -1)`); with offset ≥ length, `""`; length 0, `""`. With length unwired, the
> rest.

> **Rule 21c — Replace Substring.** Replaces with `substring` the `length` bytes from
> `offset`, and `replaced substring` is what was removed. With `"abcdef"` and `"XY"`:
> (2, 2) gives `abXYef` and `cd`; (2, 0) inserts (`abXYcdef`); with an empty substring (2, 2)
> deletes (`abef`); a `length` greater than what remains replaces what remains (`(4, 100)`
> gives `abcdXY`); with a negative `offset` (`(-1, 1)`) or greater than the length the string
> stays the same and `replaced substring` is `""`. Unverified: offset equal to the
> length (here, it is appended) and negative length (here, 0).

> **Rule 21d — Search and Replace String.** Searches for `search string` from `offset`
> and replaces it with `replace string`: the first one, or all of them with `replace all?`; with
> `ignore case?` it does not distinguish case. It outputs `result string` (what comes before
> `offset` is kept), `number of replacements` and `offset past replacement`, which is
> the position **in `result string`** after the last replacement (−1 if there was none).
> With `"abcABCabc"`, `abc`→`X`: the first gives `XABCabc` (1, 1); all, `XABCX` (2, 5);
> all ignoring case, `XXX` (3, 3); `zz` changes nothing (0, −1); with
> offset 3 and ignoring case, `abcXX` (2, 5). An empty `search string` matches at
> every position, including the one at the end: with `replace all?`, 10 replacements and
> `XaXbXcXAXBXCXaXbXcX`. Not done: Regular Expression mode and `multiline?`, which
> only applies with it.

> **Rule 21e — Number To … String.** All give at least `width` characters: with
> positive `width`, padding on the left (with spaces, and with **zeros** in
> hexadecimal and octal) and, with negative, on the right. A floating-point number is
> rounded to an integer **to even on a tie** (2.5 → 2; 3.5 → 4) and saturates at I64 (and
> at the range of its type, if the control limits it); a negative hexadecimal is its
> two's complement at the width of its type (I32 −1 → `FFFFFFFF`), with A–F in uppercase.
>
> - **Fractional** (`precision` 6 if unwired): `%.{p}f` on the **exact value** of the
>   number, rounded to even on an exact tie (2.5 with precision 0 gives `2`;
>   0.0001234 with 2 gives `0.00`; 1e20 with 1 gives `100000000000000000000.0`;
>   −0.5 with 3, `-0.500`; with precision 0 there is no point).
> - **Exponential:** `d.dddE+n`, with a signed exponent and **no padding
>   zeros** (`3.141590E+0`, `1.20E-4`, `0.000E+0`, `-5E+0`, `1.00E+100`; 9.99999 with
>   2 gives `1.00E+1`).
> - **Engineering:** exponent a multiple of 3 and 1 to 3 integer digits; `precision` is
>   the decimals of the mantissa (`12.346E+3`, `120.00E-6`, `500E-3`, `10.0E+99`,
>   `100.000E+3`; 999999 with 2 gives `1.00E+6`).
> - With `use system decimal point` TRUE the separator is the system's (LabVIEW on
>   Windows in Spanish gives `3,14`); with FALSE, the point. Solder takes it from the language
>   of the window (`opciones.separador` of the runner). Outside Rule 18, which
>   fixes the point for *displaying* an indicator.

> **Rule 21f — … String To Number.** They read from `offset`: they skip leading
> blanks and stop at the first thing that is not valid; `offset past number` is where. If there is
> no number, `default` comes out and `offset past number` is the offset.
>
> - **Decimal** (`default` I32): `12abc` → 12 (2); `abc` → default (0); `  42` → 42
>   (4); `-5x` → −5; `+7` → 7; `3.9` → 3 (1); `abc12` with offset 3 → 12 (5);
>   `99999999999` → 2147483647 (saturates at the type of `default`); `1e3` → 1.
> - **Fract/Exp** (`default` DBL): `3.14abc` → 3.14 (4); `1e3` → 1000 (3); `.5` → 0.5;
>   `5.` → 5 (2); `1.5E-2` → 0.015 (6); `1.9e+2x` → 190 (6); `inf` → +Inf (3);
>   `1,5` → 1 (1): when reading, the decimal is always the point, also with `use system
>   decimal point` TRUE and the comma as the system separator.
> - Hexadecimal and Octal String To Number (`default` U32) read 0–9, A–F, a–f and 0–7: unverified
>   in LabVIEW whether they accept a prefix.

> **Rule 21g — Unverified in LabVIEW.** Trim Whitespace.vi: the order of the
> `location` values (here 0 both ends, 1 start, 2 end) and what counts
> as blank (here space, tab, CR and LF, as its help says). The
> End Of Line constant is CR LF on Windows and LF elsewhere; here, LF. Trim,
> Rotate and Reverse follow their help (`abcd` → `bcda` and `dcba`). Number To
> Decimal/Hexadecimal/Octal String receive the number as f64: an I64 or U64 of
> more than 53 bits loses precision.

## 7. Blocking operations

The blocks marked `blocking` —today only `tcp-read`— can take seconds.

> **Rule 20.** A blocking operation **MUST NOT** freeze the interface. The
> user **MUST** be able to stop the run while a blocking operation
> is in progress.

> **Rule 20b.** Every block marked `blocking` **MUST** be implemented in a
> **cancelable** way: in bounded slices that periodically check whether a stop
> has been requested, instead of an indivisible wait. With a real socket, that is
> a short timeout and retry, not a 60 s timeout.

> **Rule 20c.** The execution of a VI **MUST NOT** happen on the interface
> thread.

### 7.1 Verified — probe T8

The three rules above are not wishes: they were checked by measuring. The spike is
in `spikes/t8-blocking-io/`, simulates a 3 s `tcp_read` against an instrument
that does not respond and measures the duration of the worst frame of a 60 fps loop.

| Case | Worst frame | Stop takes | Result |
|------|-------------|------------|--------|
| **a** — VI on the interface thread, Stop by *epoch* | — | **never** | The read runs the full 3000 ms. **Epoch does NOT interrupt a host call** |
| **b** — VI on a worker thread, non-cancelable import | **16 ms** | never | The interface stays alive, but the operation cannot be aborted |
| **c** — VI on a worker thread, **cancelable import** | **16 ms** | **301 ms** of 3000 | Interface alive **and** Stop effective |
| **d** — infinite loop in the compiled module, Stop by *epoch* | — | 200 ms | Aborted. **Epoch is still needed** |

**Conclusions, and there are three:**

1. **The model proposed by the previous plan was incorrect.** It said that "the
   host calls `tick()` from the frame loop": that is exactly
   case (a), and it freezes the interface for the whole wait.
2. **Two different mechanisms are needed, not one.** *Epoch* for the loops of the
   compiled module (case d), and cooperative cancellation for the calls to the
   host (case c). Neither covers the other's ground.
3. **`async_support` or wasmtime fibers are not needed.** A worker thread
   with cancelable imports is enough, and it is much simpler. It was the solution that
   was feared and it is not needed.

*(The problem was already identified in the project: `roadmap-9-10.md` (from the Red era, outside this repository)
§4.2, "Timeout and non-blocking I/O operations", **HIGH PRIORITY**, never
carried out, and its proposed solution relied on DT-027, which turned out to be
fiction.)*

> **Resolved by DT-040.** If a VI has two branches and one is left waiting,
> the other continues: the wait is an import that **suspends** its clump (JSPI) and
> returns control to the host, which runs the others. It is what Rule
> 12b asks for and what LabVIEW does.

> **Rule 20d.** Abort **MUST** stop the VI immediately, also in the middle of
> a wait. What was already written to the indicators stays; what was missing is not
> written. Verified in LabVIEW 2026 Q3 (`labview-captures/run/r3.png`).

> **Rule 20e.** A control with **Latch** mechanical action returns by itself to its
> default value when the diagram reads it as TRUE. Stop, OK and Cancel are born with Latch
> When Released (`labview-captures/run/r2.png`).

## 8. Errors

Errors travel along **error wires**, as in LabVIEW (DT-043; what was measured is
in `reference/labview-errors.md`). An error is the cluster `{ status, code,
source }`.

> **Rule 21.** A function with `error in`/`error out` and `status` TRUE at the
> input **MUST NOT** do its work: its outputs give the default value of
> their type and `error out` is the same cluster. With a warning (FALSE, `code` ≠ 0) it does
> do it, and the warning continues.

> **Rule 21a.** If a node's `error out` is left **unwired** and carries
> `status` TRUE, the VI stops there and the editor shows the automatic error
> handling dialog (Continue / Stop), unless it is disabled in the VI. Without an editor
> (the command line), the VI stops with the error.

> **Rule 21g.** Merge Errors gives the first error from top to bottom; if there is none,
> the first warning; if not that either, the first input. Clear Errors gives (FALSE, 0, "").

The texts of the errors are Solder's own; the codes are LabVIEW's
(DT-043 §5).

## 9. Verification

| Rule | Mechanism | Status |
|------|-----------|--------|
| 11 dataflow | The whole golden corpus | Pending |
| 12 indeterminate order | Compile the same VI with different `layout`s and compare modules | Pending |
| 13 order by dependency | Test: two chained `tcp-write`s write in order | Pending |
| 14 independent refnums | Test: two `tcp-open`s give different connections | Pending |
| 15 the body runs once | Test: a while with a condition true from the start iterates 1 time | Pending |
| 16 `count` ≤ 0 does not iterate | Test | Pending |
| 17 all frames assign | Negative `check` case | Pending |
| 18 number format | Golden corpus + test with different regional settings | Pending |
| 19 IEEE 754 | Test: division by zero gives infinity and does not abort | Pending |
| 20, 20b, 20c do not freeze the interface | **Probe T8** (`spikes/t8-blocking-io/`) | ✅ **Verified** |
| 21 the error names the node | Test | Pending |

## 10. Pending items

| # | Issue | Blocks |
|---|-------|--------|
| 1 | **Index out of range** (§6.3) | The compiler. Recommendation: stop the VI |
| 2 | Blocking I/O (§7) | ✅ **Resolved** by probe T8: worker thread + cancelable imports + epoch |
| 3 | Exact number format (§6.1) | `07-parity.md` |
| 4 | `display` cannot be ordered (§4.2) | Nothing urgent; inherited and noted limitation |
| 5 | `waveform` semantics (§3.4) | Only if it is decided to implement it |

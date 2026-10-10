# Real programs written with Solder 0.2.1-alpha

> Non-normative. Step 3 of the road to the maintainable version (plan, "Road to a maintainable version"):
> three typical acquisition and control programs were written in the real editor, as a user would, with
> every failure or annoyance noted. Done on 2026-10-09/10 in Solder 0.2.1-alpha (Linux, Xvfb, mouse and
> keyboard only, no `.qvi` edited by hand) and, for comparison, in LabVIEW 2026 Q3 in the virtual machine.

The programs are in [`examples/`](../../examples/). The numbers in brackets (#n) are the order in which
each finding appeared.

## 1. The three programs

| Program | Files | Status in Solder 0.2.1 | In LabVIEW |
|---------|-------|------------------------|------------|
| **Temperature Monitor**: a While Loop at a fixed period reads a simulated sensor (subVI with an Expression Node and Random Number), plots it on a Waveform Chart, lights an alarm LED over a limit and keeps a running mean in a shift register; Stop ends it | `temperature-monitor/Temperature Monitor.qvi`, `Read Sensor.qvi` | **Works**, saved, reopened and run again | Built the same (`Desktop\solder'examples`): same behavior (strip chart with Y autoscale, alarm, mean) |
| **Instrument Protocol**: a simulated instrument (subVI) answers `*IDN?` and `MEAS:VOLT?` with text (Format Into String), a second subVI parses the reply with Scan From String and returns an error cluster; the main VI asks for the identification once and then measures in a loop with a chart, stopping on error or Stop, and shows the error with Simple Error Handler | `instrument-protocol/Instrument Protocol.qvi`, `Simulated Instrument.qvi`, `Parse Reply.qvi` | **Wrong result**: the first iteration fails with error 85 because of #30. Each subVI works on its own | Only the points where Solder differs were checked (#16, #24) |
| **Oven Controller**: a state machine (Init, Heat, Hold, Cool, Done) with a Case Structure and three shift registers (state, temperature, hold counter), heater and fan LEDs, a chart, and Stop or Done ending the loop | `oven-controller/Oven Controller.qvi` | **Works** with I32 states (enum not possible, #32): 20 → 60 → hold → 25 °C, ends in state 4 | Half built; it confirmed #33 |

Each program had to go around something that a LabVIEW user would do without thinking:

- Program 2 wanted a Case on the command string (#16), a string array of commands (#19, #20) and a loop
  that stops on `error OR Stop` (#23, #24). It ended up with Equal? + Select into a numeric Case and with
  the `error?` output of a Simple Error Handler.
- Program 3 wanted an enum for the states (#32).
- Every new VI needed Solder to be closed and started again (#1).

## 2. Findings

### Critical: wrong results

- **#30 Two calls of the same non-reentrant subVI that can run in parallel mix their inputs.** With
  `"*IDN?"` and `"MEAS:VOLT?"` wired to two calls of *Simulated Instrument* on the same diagram, both
  return the `MEAS:VOLT?` reply (3 of 3 runs). In *Instrument Protocol* the call before the loop and the call
  inside it collide and the first iteration parses the identification string. A non-reentrant subVI must
  run one call at a time, each with its own inputs. *Core (compiler/runtime); needs a test that fails today.*
  *Fixed on 2026-10-10:* a call to a subVI that waits now enters its turn before writing its inputs and leaves
  it after reading its outputs (`entrar_subvi` / `salir_subvi`); measured in LabVIEW with `Two Calls.vi`
  (DT-045 §2) and tested in `test/core/subvis.test.mjs`. Two calls of the example's *Simulated Instrument*
  now answer each its own command in Solder too.

### Blockers: a common program cannot be written

- **#1 File ▸ New VI (Ctrl+N), Close (Ctrl+W) and Close All are greyed.** Writing a subVI and then its
  caller means quitting and restarting Solder.
- **#16 Case Structure with a string selector.** Wiring a string leaves the frames `True`/`False`, without
  Default, and the Run arrow whole. LabVIEW (measured) turns them into `"True"` and `"False", Default` and
  widens the selector. Already listed as missing in M4; a command parser needs it.
- **#19 The array constant is born DBL and its element type cannot be changed.** Dropping a String Constant
  on it places a separate constant on top; Replace is greyed. Rule 40j leaves "born empty, takes the type of
  what is dropped in" unverified: to measure.
- **#20 Build Array is drawn as a 23 × 8 px Compound Arithmetic box with the text "undefined"** and cannot
  be stretched to a second input. It shares `dynamic:compound-inputs` with Compound Arithmetic and has no
  symbol (`esCompuesto`/`compuesto` in `editor/src/block-diagram/diagram-view.mjs`). Its LabVIEW look has to
  be measured.
- **#23 Functions ▸ Cluster, Class & Variant is entirely "not yet":** without Unbundle By Name the status of
  an error cluster cannot be read.
- **#24 An error cluster wired to the condition of a While Loop is a broken wire.** LabVIEW (measured)
  accepts it: the Run arrow stays whole, the terminal takes the error-cluster colors and the loop stops when
  status is TRUE. This is the usual way to end an acquisition loop on error.
- **#32 The Enum Constant is offered as done but is born with no items,** has no right-click menu (a right
  click opens the Functions palette) and no *Edit Items…*. State machines on an enum, the most common
  LabVIEW pattern, cannot be written. It looks done and is not.
- **#6 The menu of a shift register is all greyed,** wired or not. In LabVIEW (measured) Create is greyed
  while the shift register is unwired and, once wired, *Create ▸ Constant* puts the initial value outside the
  loop; Add Element, Remove All, Replace with Feedback Node and the palette are enabled too.

### Bugs that mislead

- **#33 A wire made inside one Case frame from an input tunnel to an output tunnel is drawn in every
  frame,** and that output tunnel looks wired in frames where it is not. The `.qvi` is right; only the drawing
  is wrong. In LabVIEW (measured) other frames show nothing. In the oven's Init frame it looks like two
  sources into one tunnel.
- **#28 Error 85 (Scan From String) says "This error code has no description".** Scan From String produces
  it, so `core/runtime/error-codes.mjs` should describe it (LabVIEW's meaning, written anew).
- **#29 `cli/solder.mjs run` crashes on a string indicator** (`formatear` calls `toPrecision` on a string).
- **#7 The terminal of a control dropped near the top of the panel lands under the diagram's toolbar,** out of
  reach, and labels near the left edge are cut. Linked to #8: a dropped Waveform Chart is centered on the
  click, as in LabVIEW (measured), so a click near the top puts it partly above the visible area.
- **#17 The explanation of Structures ▸ Timed Structures is stale:** it says Case and Flat Sequence are
  missing.
- **#2 and #25 Texts still in Spanish:** the explanations of greyed items and the broken-wire reasons
  ("Tipos incompatibles: …").

### Annoyances

- **#21 and #34 Wires towards terminals at the same x bend on the same vertical.** On the right of the oven
  diagram four wires (temperature, state, heater, fan) share one segment and cannot be followed. LabVIEW's
  routing has to be measured before changing it.
- **#26 Every subVI has the same default icon** (no icon editor yet): three different subVIs on one diagram
  cannot be told apart. *Visible Items ▸ Label* on the call would be the stop-gap (not tried).
- **#10 `npm run app -- file.qvi` crashes**: `scripts/start-editor.mjs` passes the file before the app path
  and Electron loads it as its main module. `SOLDER_ABRIR` works.
- **#11** Remove While Loop and Help are greyed. **#13** In Run mode LabVIEW's title drops " Front Panel".
  **#35** The menu of a Boolean tunnel offers "Numeric Palette" (to check). **#31** Simple Error Handler with
  dialog type 0 seemed to show a dialog (to check). **#18** A few times the first click or drag after
  finishing a text edit did nothing (not reproduced on purpose).

### Found while building the LabVIEW reference (2026-10-10)

Measured in LabVIEW 2026 Q3 while building the three examples of [`examples/README.md`](../../examples/README.md);
each is to be checked against Solder before fixing:

- **#35 confirmed:** the menu of a Boolean tunnel says *Boolean Palette*; Solder says *Numeric Palette*.
- **#37** At 1:1 the scalar Boolean wire is green and dotted (one pixel on, one off) and the string wire is
  pink and patterned; Solder draws both solid and spec/06 §4.2 says Boolean is "Solid".
- **#38** A Waveform Chart keeps its history between runs (a second run continues the X axis). Not checked in
  Solder.
- **#39** The source of an error raised inside a subVI carries the call chain: `Scan From String (arg 1) in
  Parse Reply.vi->Instrument Protocol.vi`, also in the Simple Error Handler dialog.
- **#40** An output tunnel with *Use Default If Unwired* is drawn filled with a white dot in the frames where
  it is unwired; compare with Solder's.
- **#41** The Y autoscale of a constant 5 shows 4.4 to 5.6; of 20…60.5, 20 to 70; of 15…25, 14 to 26.
- **#42** Case frames on an enum or a string are written with quotes (`"Init", Default`, `"*IDN?"`); a frame
  named `Default` without quotes is the default one; a string Case adds *Case Insensitive Match* to its menu.
- **#43** With *Use localized decimal point* on (a fresh install on Spanish Windows), Format Into String writes
  `5,0000`. The reference turns it off; Solder always writes a period.

### For a `.qvi` written by an AI

The format read well: nested structures with their frames, wires as `"node.port" → "node.port"`, and the
layout apart. Two things get in the way of writing it by hand (#5, #27): nodes and subVI ports are named
`control_1`, `str-control_1`, `cluster-indicator_1` while people (and an AI) think in labels (`Command`,
`error in`), and the node types (`str-const`, `num-const`, `bool-indicator`) are not the names in the
palette. Writing a test VI by hand (`str-const`, two subVI calls) and running it with the command line took a
few minutes and is how #30 was found.

### What worked

Placing and wiring from the palettes, Expression Node, Random Number, Wait Until Next ms Multiple, While and
Case with Add Case Before/After and Make This The Default Case, shift registers, Use Default If Unwired,
Waveform Chart (strip, Y autoscale), LEDs and Stop with latch, Format Into String and Scan From String with
the error cluster, Merge Errors, Simple Error Handler, subVIs with their connector pane and *Select a VI…*,
save, reopen and run.

## 3. Proposed order of the fixes

For `0.3.0-alpha` (it adds things, so MINOR rises, DT-048):

1. #30 (wrong results), with its test.
2. #1 New VI and Close; #24 error cluster on the loop condition; #6 Create on a wired shift register.
3. #33, #20, #28, #29, #10, #17 and the Spanish texts (#2, #25).
4. Measured in LabVIEW and then done: #16 string selector, #19 array constant shell, #32 Edit Items… of
   the enum, #23 Unbundle By Name (the Cluster subpalette, at least Bundle/Unbundle By Name).

Then the three examples are written again without workarounds, and step 4 takes #7, #21/#34 and #26.

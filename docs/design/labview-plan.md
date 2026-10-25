# Cloning LabVIEW module by module

> Living work plan. It starts on 2026-09-30, when the editor already builds,
> saves, opens and runs a VI. For what comes next it replaces the roadmap in
> [`00-provisional-plan.md`](../reference/history/00-provisional-plan.md) §7.1, which is now closed.

## 0. How to continue in a new session

When the developer says "keep going":

1. Read this document: §2 (where we are) and §3b (what is next). Since 0.5.0-beta
   (2026-10-23), continue with **"Next: the execution scheduler"** at the end of the
   road in §3b (DT-061 and DT-063). §4 gives the detail of each module.
2. To capture LabVIEW, the method is in
   [`../reference/capturing-labview.md`](../reference/capturing-labview.md):
   `win11 encender`, `tools/vm_control.py foto|clic|arrastrar|tecla|texto`.
   What has not been seen or tried in LabVIEW is not written from memory.
3. This plan is done on `main` (long steps on a short `feature/<name>` branch merged back
   when green), and until 1.0 every beta is released from `main`: a feature raises MINOR, a
   fix raises PATCH (DT-062, which replaced the release branches of DT-057 on 2026-10-23).
   When closing a step: tests green (`npm test`), mark it here with
   the date and update §2. Commit only when asked, without co-authorship.
4. If the step needs a decision that is not written down, propose it and ask
   before going on: decisions are not made halfway through.

## 1. The philosophy

- **LabVIEW 2026 Q3 is cloned, one to one** (DT-035): windows, palettes, menus,
  names, order and behavior. What is not done yet looks the same, greyed out, and
  says why. If the spec and LabVIEW disagree, LabVIEW wins and the spec is fixed.
- **Everything compiles to pure WebAssembly** (DT-039): the core in JavaScript
  (`core/`), our own encoder, no interpreter. The `.qvi` stores only the
  diagram; the `.wasm` lives in memory.
- **Web technologies** (DT-037): the editor is a page in Electron. Rust, only
  for the hardware host.
- **Work goes by modules**, and a module is not finished until it meets all of
  §3. First what is needed to program (types, functions, structures); then what
  organizes programs (subVIs, projects, classes).

## 2. Where we are (2026-10-17, 0.4.0-beta)

**The full circuit works:** a VI is built, saved to `.qvi`, opened the same way,
and Run compiles it to WebAssembly and executes it **by dataflow, like
LabVIEW** (DT-040): independent branches run at the same time, each indicator is
painted when its data arrives, Abort stops at once and the panel switches to Run
mode. Since 2026-10-01 also **with loops**: While and For are placed, stretched
and wired in the diagram, and the compiler runs them (DT-041).
718 tests green. **The three examples give the same values as in LabVIEW** (2026-10-15). **SubVIs** work (DT-045): a hierarchy compiles into one module, non-reentrant by default with its state kept between calls and Runs, preallocated clones, two parallel calls of a non-reentrant subVI each keep their own inputs (bug #30, fixed 2026-10-10), and the editor opens several VIs with their connector pane. **Enums are editable** (DT-049, 2026-10-14): the items are the enum's type, Edit Items… works on the constant, the control and the indicator with the measured menus, and the frames of an enum Case go by item name. **Unbundle By Name** (DT-050, 2026-10-15) reads elements of a cluster by name, so the status of an error cluster can be read. **VIs are saved as `.sdg`** (DT-051, 2026-10-15): every Solder extension starts with `sd` (`.sdt` reserved for a future textual language, `.sdproj`, `.sdlib`), and an old `.qvi` still opens. **New VI, Close and Close All** (spec/05 rules 101–103, 2026-10-15) work as measured, and Solder **starts on LabVIEW's Getting Started window** (DT-052), which comes back when the last VI closes. **The colors are theme tokens** (DT-056, 2026-10-17): the current look is the Old School theme, unchanged pixel by pixel, and `SOLDER_THEME=solder` shows a first Solder theme. **The Front Panel has panel styles** (DT-058, 2026-10-17, on `feature/html-front-panel`): every control is drawn once, as plain HTML, and each style is a CSS sheet over `plain.css`, the mother template; Old School is one of them, identical pixel by pixel to the old drawing, and `SOLDER_PANEL_STYLE=plain`, `solder` or `solder-night` shows the other styles.

| Piece | Status |
|-------|--------|
| VI windows (Front Panel, Block Diagram) | Cloned; menus: File (New VI, Open, Close, Close All, Save, Save As, Exit done) and **Edit** (Undo, Redo, Cut, Copy, Paste, Delete, Select All, Make Current Values Default and Reinitialize Values to Default done; the rest greyed with its reason). Toolbar: Run, Abort and Enter Text done; in Run mode, the LabVIEW toolbar (filled arrow, no editing tools) |
| Functions ▸ Programming palette | Numeric: 32 functions placed and wireable, plus Conversion (13), Data Manipulation (9) and Math & Scientific Constants (17). Boolean: 16. Comparison: 16 of 29 (the twelve comparisons, Select, Max & Min, In Range and Coerce and Not A Number?), with their menus; the rest greyed out. Timing: 3 of 15 (Tick Count (ms), Wait (ms), Wait Until Next ms Multiple). Structures: 4 of 16 (For Loop, While Loop, Case Structure and Flat Sequence Structure), with their placeholders in place. **String: 27 functions and constants done** (with Number/String Conversion and Additional String Functions; the rest greyed out). **Dialog & User Interface: 5 of 23** (Simple Error Handler, Clear Errors, Merge Errors, Error Cluster From Error Code and Error Cluster Constant). The other categories, placeholders |
| Controls ▸ Modern palette | Numeric Control and Numeric Indicator done, **String & Path: String Control and String Indicator (3 greyed out)**, **Ring & Enum: Enum done (control and indicator, with Edit Items…)**, **Data Containers: Error In and Error Out (6 greyed out)**, and Boolean: 10 of its 13 controls (Push Button, Round/Square LED, switches, sliders, OK, Cancel, Stop); Rocker, Vert Rocker and Radio Buttons, placeholders. 19 Numeric controls and 10 folders, placeholders |
| Diagram editing | Place, move, wire (also as a branch from another wire), bends, selection, delete, undo, editable constants, complete Compound Arithmetic, View As Icon, labels. **Structures** (M4, spec/05 Rule 40e): While Loop and For Loop placed with two clicks or by dragging a rectangle, drawn at 1:1 with their "i", condition and "N" terminals, tunnels and shift registers attached to the border; they move with what is inside, stretch by their eight handles, a node dropped inside or outside enters or leaves, a wire from one scope to another creates its tunnels, and their menus (Add Shift Register, Stop if True and Continue if True); Case Structure (Rule 40f: frames, selector, tunnels, menus); **Flat and Stacked Sequence** (Rule 40g): film border at 1:1, frames of their own width, wire between frames through tunnels on the separators, selector and local variables in the Stacked, Add/Delete Frame and Replace |
| Panel editing | Place controls, labels on both canvases, value typed and with the arrows (the current value, apart from the saved default, DT-053), delete synchronized with the diagram. A click on the body of a Boolean triggers it, as in LabVIEW (spec/05 Rule 40c); right-click on a Boolean opens its menu, with Mechanical Action. In Run mode only the controls are triggered |
| Array / Data Containers palette | **Functions ▸ Programming ▸ Array**, captured in full (34 elements in 5 columns, with the context help of each): 17 done (the one-dimensional ones) and the rest greyed out with their reason. **Controls ▸ Modern ▸ Data Containers ▸ Array** done (control and indicator with index and visible elements, editable), array constant in the diagram and indexed tunnels with their menu |
| Types | DBL, SGL, integers from 8 to 64 bits with and without sign, Boolean and **string** (also on the panel: controls and indicators), with coercion (DT-038) and the logical type of Boolean; constants, controls and indicators change representation with the Representation menu. **Arrays of one and two dimensions** (DT-042 d and DT-044: element type plus dimension count, one contiguous block; control, indicator and constant, Add/Remove Dimension; the compiler stops at 2D); clusters, only in memory (DT-042); the **error cluster** (DT-043) with its wire, controls, constant and dialogs in the editor |
| `.qvi` | Reading and writing with exact round-trip (`core/model/qvi-format.mjs`) |
| Compiler | Numeric (with Conversion, Data Manipulation, constants, Enum, Ring, Range Limits and Expression Node), Boolean, Comparison and Timing over scalars, numeric and Boolean controls and indicators (`core/compiler/compiler.mjs`). The diagram is split into clumps and runs by dataflow with JSPI (`core/runtime/runtime.mjs`, DT-040). `cli/solder.mjs run|wat|check` |
| Execution | Live indicators, parallel branches, Abort (button and Ctrl+.), Latch When Released (Stop, OK and Cancel) and Run mode in both windows; While and For with shift registers and tunnels (Last Value), on top of the clumps. One scheduler per Run resumes every clump (DT-061), and a clump that waits saves its state and returns instead of suspending a stack (DT-063 §8, 2026-10-25): no JSPI. Still missing: the pool of threads (DT-063 §9–10) |

**Catalog blocks that the compiler does not emit yet:** arrays of more than two
dimensions, Transpose 2D Array and Reshape Array, `number-to-boolean-array`,
`boolean-array-to-number` and TCP.

## 3. When a module is finished

A module —a Functions subpalette with its Controls subpalette, or a piece
such as the structures— is finished when:

1. **Captured in LabVIEW:** its palettes and subpalettes, the name of each
   element, the terminals of each function (context help), its look in the
   diagram and the right-click menus of each class of node.
2. **Declared in the inventory:** everything LabVIEW shows, each thing with its
   verdict; what is done, with its test.
3. **In the catalog:** each block with its terminals, its types and its polymorphism.
4. **In the editor:** it is placed, wired and edited, and its menus do what they do
   in LabVIEW; its controls and indicators work on the panel.
5. **Compiled:** each function is emitted to WebAssembly and gives **the same as
   LabVIEW**. Where there is doubt (overflows, rounding, edge cases), the same VI
   is built in LabVIEW, run, and the result compared.
6. **Saved:** what is new goes into the `.qvi` and comes out the same (round-trip).
7. **Tested and written:** tests for all of the above; new rules in `spec/`.

## 3b. Priority: first a language that can program (decided 2026-10-01)

Before polishing each module, the goal is a **complete basic visual language**: one
where, with what is done, a real program can be written —data, decisions and
loops— and run. What only saves clicks or completes menus is postponed.

Order of work, which replaces that of the modules for now:

1. **The basics of Numeric**: the Conversion and Data Manipulation subpalettes, the
   Math & Scientific Constants constants, Enum, Ring, Range Limits and
   Expression Node (M1).
2. **Boolean for real**: Boolean controls and indicators on the panel and their
   terminals in the diagram, with the mechanical action (M2).
3. **Comparison** over numbers and Booleans (M5, no strings yet). *Done on 2026-10-01.*
4. **Structures**: While Loop and For Loop with shift registers, and Case
   Structure (M4). The decision on how it executes while running is already
   made (DT-040, 2026-10-01). *While and For done in the editor on 2026-10-01;
   the Case is missing.*
5. **String and Array/Cluster** (M3 and M6). The technical decision is already
   made (DT-042: linear memory, not WasmGC). *String done on 2026-10-01; Array/Cluster
   is missing.*

### Second stage: a usable language (decided 2026-10-02)

With data, decisions and loops already done, what is missing to write real
programs goes **before the rest of the modules**, in this order:

1. **2-dimensional arrays** (M6): Build Array of several 1Ds, Index Array with
   two indices, 2D control, indicator and constant, with the memory of DT-042.
   *Done on 2026-10-03 (DT-044, spec/04 Rule 21i, spec/05 Rule 40k).*
2. **SubVIs** (R6): connector pane, icon editor and compiled call.
   *Core and editor done on 2026-10-08 (DT-045, spec/04 Rules 19c–19d, spec/05 §12); the other
   35 connector patterns, shared clones and recursion are missing. The icon editor is postponed
   (decided 2026-10-08): every VI uses the standard subVI icon.*
3. **What is used every minute in the editor:** Create ▸ Constant / Control /
   Indicator on a terminal (M1) and copy, cut and paste (Edit menu).
   *Done on 2026-10-08 (spec/05 §13, rules 72–77): Create ▸ on a node's terminals and on a wire,
   All Controls and Indicators / All Constants, copy, cut, paste (shared between open VIs),
   Ctrl+drag, Select All and the Edit menu. Missing: Scalar ▸ and Channel Writer..., the other
   menus' Create ▸ (constants, controls, tunnels, shift registers), and the broken wire that
   LabVIEW leaves when a control is deleted on the panel (rule 77, a decision to take).*
4. **Graphs** (M8): Waveform Chart and Waveform Graph, and XY Graph.
   *Done on 2026-10-09 (spec/05 Rules 79–82, spec/06 §8): what each accepts, the chart history kept
   across Runs, autoscale, the menus; missing Scope/Sweep, cursors, plot styles and the other graphs.*
5. **Format Into String and Scan From String** (M3), with their error terminals.
   *Done on 2026-10-08 (spec/04 Rule 21j, spec/05 Rule 78): engine measured case by case in LabVIEW;
   missing %t/%T, the Edit Format String dialog and Format Value / Scan Value as nodes.*
6. **Debugging:** probes, execution highlighting and the error list.
   *Done on 2026-10-09 (DT-047, spec/05 §16 rules 83–90, spec/06 §14): Highlight Execution with its four speeds, Retain Wire Values, probes, breakpoints on nodes
   and wires, Pause and the three steps, the Debug Window, the Error list and Allow debugging. Missing: the borders of the structures report no values (tunnels,
   shift registers, "i"), breakpoints on structures, stepping into a subVI, the custom probes, warnings (and the toolbar triangle) and several facts marked unverified.*

*Stage 1 closed on 2026-10-09 with version **0.1.0-alpha** (DT-048).*

### Road to a maintainable version (decided 2026-10-09)

The goal is a version that does what it does reliably and keeps the files it saves, not a complete
LabVIEW: **maintainable does not mean complete**. It stays a `0.x` version, not a 1.0 (decided
2026-10-09). New modules wait; these five steps go first, in order. When they are done, the
**maintainable version** is released as the first `0.N.0-beta` (`0.4.0-beta`, DT-055), followed by one month
of maintenance with fixes only (`0.N.x-beta`).

1. **Broken wires** (DT-046, to be proposed) — `0.2.0-alpha`. A wire may keep one loose end, drawn
   dashed with LabVIEW's red cross, which breaks Run: when a panel control is deleted its wire stays,
   and a caller whose subVI lost a connector terminal **opens** with those wires broken (today it does
   not open at all: a valid file that cannot be opened is the worst failure for a stable version).
   Edit ▸ Remove Broken Wires (Ctrl+B) clears them. It changes the `.qvi`, so it goes before step 5.
   *Done on 2026-10-09 (DT-046, spec/05 §17 rules 91–95, spec/06 §15): Delete on the diagram and on
   the panel leaves the wires broken (Cut takes them), a caller whose subVI lost a terminal opens with
   them broken, Ctrl+B, re-wiring a loose end, the drawing, the wire menu and the Error List.*
2. **The Windows installer tested** in the virtual machine: install, open, save, run, uninstall. The
   installers are built on Linux (`npm run dist`, electron-builder) and Windows was never run.
   *Done on 2026-10-09: 0.2.0-alpha tested in the VM, its problems fixed in 0.2.1-alpha (its own icon,
   `Solder.exe`, `.qvi` association, a clean uninstall, Exit, the windows of a new VI, the two windows
   of a VI kept in step, a dropped control saved at once, latched Booleans not saved TRUE) and
   0.2.1-alpha tested again (`labview-captures/windows-install-0.2.1*`).*
3. **Real programs written with Solder**, as a user would: two or three complete VIs (for example a
   measurement loop with a chart, a string protocol with Format/Scan and subVIs, a state machine with a
   Case and shift registers). Every failure or annoyance found becomes a fix; they are the test of
   whether the maintainable version is ready.
   *Written on 2026-10-09/10 ([`real-programs-0.2.md`](real-programs-0.2.md), `examples/`): Temperature
   Monitor works and matches LabVIEW; Instrument Protocol gives a wrong result (two calls of one
   non-reentrant subVI mix their inputs); Oven Controller works with I32 states. 36 findings, eight of them
   blockers (New VI, string selector, array constant type, Build Array, Unbundle, error cluster on the loop
   condition, enum items, shift register menu). Next: the fixes, in the order of §3 of that report, for
   0.3.0-alpha.*
   **Rule decided on 2026-10-10:** nothing else is implemented until the examples in `examples/` behave
   exactly the same in Solder and in LabVIEW. The examples are written as a LabVIEW user would (string
   selector, enum states, Unbundle By Name, no workarounds), with deterministic inputs (no Random Number) so
   their outputs can be compared value by value; LabVIEW's outputs are written down once as the reference and
   a test runs each example against them. Order: (1) the three examples built in LabVIEW and their outputs
   written down, (2) the subVI fault (#30), (3) only what the examples need, (4) the comparison tests green.
   *(1) done on 2026-10-10: the three examples built in LabVIEW and their outputs written in
   [`examples/README.md`](../../examples/README.md).*
   *(2) done on 2026-10-10: the subVI fault #30 fixed (a call to a non-reentrant subVI takes its turn
   before writing its inputs; DT-045 §2, measured with `Two Calls.vi`). Next: (3), only what the examples
   need; note that the Solder `Simulated Instrument.qvi` still has the workarounds (Random Number,
   Equal? + Select) and gives a random voltage where LabVIEW gives `5.0000`.*
   *(3) in progress on 2026-10-10: the Case with a string selector (#16) and with an enum selector measured
   and compiled (spec/04 Rules 17d, 17e), errors 81–85 described (#28), and the call chain in an error's
   source (#39, Rule 21k). Also done in the editor (spec/05 Rule 40f). The enum's Edit Items… and the enum
   control and indicator (#32) were done on 2026-10-14 (DT-049, spec/05 Rule 40l: the items are the enum's
   type, the dialog and the menus measured, the Case frames by item name). Its **seam with the window**
was reviewed the same day and closed on 2026-10-14: what a key or a click means for a dialog is decided
in its own module (`editor/src/window/modal-dialog.mjs`, which also took over the Chart History dialog)
and the shell only applies it, with `test/editor/modal-dialogs.test.mjs` crossing that seam. The
dialog's Delete follows the rule measured on 2026-10-15: by the name, not the row count. Nothing more is needed by the examples.*
   *New VI, Close and Close All (#1) done on 2026-10-15 (spec/05 rules 101–103, DT-052): measured in LabVIEW
   ([`2026-10-15-file-close.md`](../../labview-captures/reports/2026-10-15-file-close.md)); Close on the Block Diagram
   only hides it, Close All asks once about the VI created last with "Apply same action…", and the Untitled number never
   goes back. Closing the last VI shows the **Getting Started window**, cloned 1:1 with texts of its own
   ([`2026-10-15-getting-started.md`](../../labview-captures/reports/2026-10-15-getting-started.md)), on which Solder now
   starts; checked in the running editor (`labview-captures/solder-close-check/`).*
   *(4) done on 2026-10-15: the three examples rebuilt in the editor without workarounds and
   `test/end-to-end/examples.test.mjs` checking every value against LabVIEW's; the rebuild found three
   differences, fixed the same day (the chart of a constant, Simple Error Handler's dialog for a defined code,
   the command line on strings), and 23 editor findings to fix next (16 faults, 7 to measure first), in the order of §3 of
   [`real-programs-0.3.md`](real-programs-0.3.md).*
   *Those findings closed on 2026-10-15, the last ones E2–E4: numbers shown with LabVIEW's significant digits (13
   on a constant, 6 on a control, measured in
   [`2026-10-15-numeric-display.md`](../../labview-captures/reports/2026-10-15-numeric-display.md)), the Ring & Enum
   icons drawn anew, and Ctrl+W, which did not reproduce; checked in the running editor.*
   *Editor findings, first pass on 2026-10-15: eleven fixed and checked in the running editor (wires between Case
   tunnels, tunnel faces, Create ▸ Indicator on a wire, terminals under wires, tunnels over shift registers, short
   constants, structure handles and borders, the page title), four did not reproduce; what is left is in §3 of
   that report, the current-versus-default value of controls first.*
   *Current and default values (C4) done on 2026-10-15 (DT-053, spec/05 Rule 40m): a value typed into a panel object
   is its current value — one undo step, no modified mark, not saved —; Edit ▸ Make Current Values Default and
   Reinitialize Values to Default (Selected, on the panel with a selection) and Data Operations ▸ set and restore the
   default, which is what Save writes; a Run starts from the current values and keeps them, and the indicators keep
   what they show. Measured in LabVIEW ([`2026-10-15-default-values.md`](../../labview-captures/reports/2026-10-15-default-values.md))
   and checked in the running editor.*
   *B12 and B13 done on 2026-10-15: a constant grows to the left as it is typed into, keeping its wire, and a single
   click on an Edit Items row only selects it (typing does nothing, Enter opens a row below), both measured in LabVIEW
   ([`2026-10-15-editor-b12-b13-b7.md`](../../labview-captures/reports/2026-10-15-editor-b12-b13-b7.md)) and checked in
   the running editor; the panel enum's menu opens on its box and arrows too. B7 turned out to be LabVIEW's structure
   auto-grow and is postponed.*
   *C5 and B14 done on 2026-10-15: the enum's **Select Item…** window, cloned 1:1 from LabVIEW
   ([`2026-10-15-select-item.md`](../../labview-captures/reports/2026-10-15-select-item.md)) on the constant, the control
   and the indicator, and the hover tips no longer come back after Run or the Error list; both checked in the running
   editor.*
   *B15 done on 2026-10-15: the explanations of greyed items, the inventory's 906 texts and the core's user-facing
   messages are in English ([`real-programs-0.3.md`](real-programs-0.3.md) §2 B15).*
   *C6 done on 2026-10-15: a new wire turns 7 px after its source in either direction, and a second wire from a wired
   output is a branch on that vertical with its dot on the elbow, measured again in LabVIEW
   ([`2026-10-15-wire-bends.md`](../../labview-captures/reports/2026-10-15-wire-bends.md); spec/05 §5.4 amended) and
   checked in the running editor.*
   *C7 done on 2026-10-15: LabVIEW shows no tooltip on palette icons (Solder was right), and the palette and its
   subpalettes now keep inside the window by LabVIEW's rules, pushed up or flipped near the bottom and opened to the
   left near the right edge ([`2026-10-15-palette-edges.md`](../../labview-captures/reports/2026-10-15-palette-edges.md);
   spec/06 §6.3), checked in the running editor.*
   *Unbundle By Name (#23) done on 2026-10-15 (DT-050, spec/04 Rule 21l, spec/05 Rule 78b): Functions ▸ Programming ▸
   Cluster, Class, & Variant captured and declared (only the cluster side planned; classes and Variant greyed), Unbundle By
   Name built — the rows store the element names and take their types from the wire, grow by the bottom handle, change by
   the click list or Select Item ▸, and lose a row with Remove Element — measured in LabVIEW
   ([`2026-10-15-unbundle-by-name.md`](../../labview-captures/reports/2026-10-15-unbundle-by-name.md)) and checked in the
   running editor at LabVIEW's 55 × 17 and 58 × 49. Bundle, Unbundle and Bundle By Name stay greyed until a program needs them.*
   **The enum's seam with the window, from the review of the #32 commit** (all four found by reading
   and running, none by the 581 tests); (a), (b) and (d) done on 2026-10-14, (c) on 2026-10-15:
   *(a) done: the Edit Items dialog had taken `pan.dialogo`, the field the Chart History dialog's
   keydown writes into by mistake (`dialogo:` where it meant `graphDialog:`, there since before), so
   typing a digit in Chart History Length made the next paint call `EI.view` with that dialog and
   throw. The items dialog now has `itemsDialog`, its own field, and the old typo is gone with the
   routing that held it.*
   *(b) done: `Enter` and `Escape` were taken by the window before they reached the dialog, so the
   measured Enter — commit the row and insert an empty one below — could not be reached in the editor
   at all. Each dialog now exports `key(dialog, event)` and `click(dialog, id)` returning an intent
   (`dialog`, `accept`, `cancel`, `explain`), `editor/src/window/modal-dialog.mjs` says which dialog
   is open, and the shell only applies what it is told; the Chart History dialog follows, and its
   greyed parts explain themselves (DT-035).*
   *(c) done on 2026-10-15: the dialog's Delete was measured again
   ([`2026-10-15-enum-delete.md`](../../labview-captures/reports/2026-10-15-enum-delete.md)) because
   the two reports of 2026-10-14 contradicted each other, and both were half right: Delete goes by
   the name and the selection, not by the row count, and on the last row it empties that row instead
   of removing it, so an enum never has zero items. Solder's hard-coded "disabled with a single row"
   was wrong and is gone; the eight colours were re-measured in the main session on the full-res
   captures before changing anything. The first attempt, on the night of 2026-10-14, never reached
   LabVIEW because the VM sat on a Windows update
   ([`2026-10-14-enum-delete-not-measured.md`](../../labview-captures/reports/2026-10-14-enum-delete-not-measured.md)).*
   *(d) done: `test/editor/modal-dialogs.test.mjs` crosses the seam — the chart dialog is never
   handed to the items module, Enter while writing a row is not OK, a greyed tab explains itself.
   Its absence is what let (a) and (b) through with every test green, the shape of finding #32
   itself.*
4. **Loose ends that mislead**, left half done in stage 1: the borders of the structures report no
   values to probes and Highlight Execution (tunnels, shift registers, "i", "N"); the warning triangle
   and its list; anything step 3 finds that looks done but is not. Also: the explanation of a hole
   opened over a modal dialog does not dismiss when something else in the dialog is clicked (it
   swallows the mousedown before the click-outside rule); the same in VI Properties, so it is fixed
   for all of them at once (seen 2026-10-14,
   [`2026-10-14-editor-dialog-check.md`](../../labview-captures/reports/2026-10-14-editor-dialog-check.md)).
   *The explanation over a modal dialog done on 2026-10-16: a click anywhere else in Edit Items, Select Item, Chart
   History or VI Properties closes it, and a click on another greyed part opens that one in its place
   (`clicEnDialogoModal`, `test/editor/window-state.test.mjs`); checked in the running editor
   ([`2026-10-16-solder-dialog-tip.md`](../../labview-captures/reports/2026-10-16-solder-dialog-tip.md)).*
   *The borders of the structures done on 2026-10-16 (spec/05 Rule 90b): tunnels, shift registers and "i" report to probes
   and Highlight Execution as measured in LabVIEW
   ([`2026-10-16-border-probes.md`](../../labview-captures/reports/2026-10-16-border-probes.md)); an array's tag reads "#4".
   Single stepping no longer stops at constants. Checked in the running editor
   ([`2026-10-16-solder-border-probes.md`](../../labview-captures/reports/2026-10-16-solder-border-probes.md)). Found and left
   for later: the structure frames as single-step stops, the tag on N, constants tagged at the start; and for Core 1 (lesson 8)
   an array indicator cannot be built in the editor (Change to Indicator greyed, Create ▸ Indicator on a wire does nothing).*
   *Those three and the warnings done on 2026-10-16 (spec/05 Rules 89b, 90b, 90c), measured in LabVIEW
   ([`2026-10-16-warnings-frame-stops.md`](../../labview-captures/reports/2026-10-16-warnings-frame-stops.md)): Show Warnings lists
   unread constants and unwired panel terminals, the List Warnings triangle opens the list, and single stepping stops at the
   structures and at the end of the diagram; checked in the running editor
   ([`2026-10-16-solder-frame-stops.md`](../../labview-captures/reports/2026-10-16-solder-frame-stops.md)). **Step 4 is done.***
5. **The `.sdg` format frozen as version 1**: written in spec/02 that from the maintainable version on every format change
   comes with an automatic migration (the file's `"solder": 1` field is for that), with a test that
   opens the example files of each version.
   *Done on 2026-10-16 (spec/02 §4.1, DT-055): `MIGRATIONS` and `migrar` in `core/model/qvi-format.mjs`, a newer
   version refused, and `test/end-to-end/format-versions.test.mjs` opening and compiling the examples as 0.3.0-alpha
   (`.qvi`) and 0.4.0-beta (`.sdg`) saved them, kept in `test/fixtures/released/`.*

Then (DT-055, decided 2026-10-16): the maintainable **`0.4.0-beta` the weekend of 2026-10-17**, when steps 1–5
are done, and the month of maintenance (`0.4.x-beta`, fixes only).

**After the beta, first: the themes** (DT-056, decided 2026-10-16): Old School (the LabVIEW clone, for development)
and Solder (the Workbench style, the default of the releases), with LabVIEW's type colors in both. First the colors
become theme tokens with no visible change; then the Solder theme; then the Front Panel as plain HTML with panel
styles (Plain, Solder), once it is decided where a panel's style lives.
   *The tokens done on 2026-10-17 (DT-056 §9): 232 role tokens in `editor/src/themes/old-school.css`, loaded first;
   `styles.css` and `getting-started.css` keep no color, and the glyphs and views ask for a token for ink, paper,
   nodes, chrome, menus, dialogs, value tags and the Highlight Execution band. `test/editor/theme-tokens.test.mjs`
   fails on a color outside the theme or a token nobody defines, and the editor is identical pixel by pixel before
   and after ([`2026-10-17-theme-tokens.md`](../../labview-captures/reports/2026-10-17-theme-tokens.md)). Next: the
   Solder theme.*
   *A first Solder theme done on 2026-10-17 (DT-056 §1, §3 and §6 amended): `editor/src/themes/solder.css` redefines
   the tokens with the Workbench values, chosen by `SOLDER_THEME` (`editor/electron/theme.mjs`; development starts in
   Old School, a packaged release in Solder). Nodes keep their space; only primitive boxes get rounded corners, and
   wire widths stay (they say the dimension). Old School is still identical pixel by pixel. Open for review: the
   thick While Loop frame, the Case hatching, and the Old School controls on the Solder panel until step 3.*
   *Panel styles decided on 2026-10-17 (DT-058), on the branch `feature/html-front-panel`: Plain as the mother
   template, Old School, Solder and Solder Night as styles; window > project > editor through companion `.css` files;
   `SOLDER_PANEL_STYLE` until Tools ▸ Options. Next: the Plain HTML of each panel control and `plain.css`, then the
   Solder and Solder Night sheets from `docs/ideas/panel-style-mockups.html`, then the window's companion `.css`.*
   *Plain done on 2026-10-17 (DT-058 §9): `SOLDER_PANEL_STYLE=plain npm run app` draws every panel control —
   numeric and enum, string, the twelve Booleans, error in and out, 1D and 2D arrays and the three graphs — as the
   plain HTML of `editor/src/front-panel/html-controls.mjs`, in the same boxes as Old School, with
   `editor/src/panel-styles/plain.css` as the mother template under `.sd-panel`. The style is chosen in
   `editor/src/front-panel/panel-style.mjs`; Old School is untouched. `test/editor/panel-styles.test.mjs` checks the
   boxes, the hooks, the public classes and that every kind has Plain rules.*
   *One drawing only, decided on 2026-10-17 (DT-058 §5 and §9 amended): Old School becomes a panel style,
   `editor/src/panel-styles/old-school.css` over Plain's markup, and the old drawing is deleted. Next: a fixture VI
   with every kind and state and its BEFORE capture; then, kind by kind (numeric and enum, string, the Booleans, error
   in and out, arrays, graphs), the ornament parts in `html-controls.mjs`, hidden in `plain.css`, and the Old School
   look in `old-school.css`, each proven by a pixel diff with zero changed pixels; then the old drawing and
   `drawsHtml` deleted. After that, the Solder and Solder Night sheets from the mockup, then the window's companion
   `.css`.*
   *Numeric and enum moved on 2026-10-17: Old School draws them as Plain's markup with
   `editor/src/panel-styles/old-school.css` (incrementer from `panel-styles/old-school/incrementer.svg`, written from
   `glyphs.mjs` by `scripts/old-school-art.mjs`); `OLD_SCHOOL_KINDS_OVER_PLAIN` in `panel-style.mjs` lists the kinds
   moved. Zero changed pixels in `scripts/panel-pixels/compare.sh` and in the real editor
   ([`2026-10-17-panel-old-school-numeric.md`](../../labview-captures/reports/2026-10-17-panel-old-school-numeric.md)).
   Next: string, then the Booleans.*
   *String and the Booleans moved on 2026-10-17: each Boolean style and state is an SVG of `panel-styles/old-school/`
   on the ornament part `.sd-art`, hidden in Plain. Zero changed pixels in the fixture and in the real editor
   ([`2026-10-17-panel-old-school-boolean.md`](../../labview-captures/reports/2026-10-17-panel-old-school-boolean.md)).
   Next: error in and out, then arrays, then graphs.*
   *Error in and out moved on 2026-10-17: the radix, the code's arrows and the source's scrollbar are ornament parts
   hidden in Plain; the status and the arrows are SVG files of the style. Zero changed pixels in the fixture and the
   real editor ([`2026-10-17-panel-old-school-error.md`](../../labview-captures/reports/2026-10-17-panel-old-school-error.md)).
   Next: arrays, then graphs.*
   *Arrays moved on 2026-10-17 (1D and 2D, every element type, greyed elements, typing, handles): zero changed
   pixels in the fixture and the real editor
   ([`2026-10-17-panel-old-school-array.md`](../../labview-captures/reports/2026-10-17-panel-old-school-array.md)).
   Next: the three graphs, then the old drawing and `OLD_SCHOOL_KINDS_OVER_PLAIN` deleted.*
   *One drawing done on 2026-10-17: the graphs are one classed SVG (`graph-view.mjs`), with LabVIEW's frame and
   bevels as ornament and their measured colors in `old-school.css`, and the old drawing is deleted. Every panel
   style, Old School included, draws the same markup (a test says so); Old School is identical pixel by pixel to the
   drawing it replaced, in the fixture and in the editor
   ([`2026-10-17-panel-old-school-final.md`](../../labview-captures/reports/2026-10-17-panel-old-school-final.md)).
   Next: the Solder and Solder Night sheets from the mockup, then the window's companion `.css`.*
   *Solder and Solder Night done on 2026-10-17 (DT-058 §8 amended): `editor/src/panel-styles/solder.css` dresses
   every kind with the mockup's pattern inside LabVIEW's boxes (raised controls with the incrementer inside the
   field, recessed indicators, keys and switches with volume, glowing LEDs, ISA-101 neutral "no error", flat graphs
   with the accent plot), and paints the canvas with a dot grid; `solder-night.css` imports it and redefines only
   the tokens. A new public state class `.sd-editing` gives the field being typed a halo. Both are registered in
   `PANEL_STYLES` (`SOLDER_PANEL_STYLE=solder|solder-night`); Old School is still identical pixel by pixel.
   Captures of the three examples: [`2026-10-17-panel-solder.md`](../../labview-captures/reports/2026-10-17-panel-solder.md).
   Next: the window's companion `.css` (window > project > editor).*
   *The window's companion `.css` done on 2026-10-17 (DT-058 §9): `<VI name>.css` next to the `.sdg` styles that
   VI's panel over the editor's style, is read again whenever it changes on disk, and follows the VI on Save As;
   checked in the editor ([`2026-10-17-window-style.md`](../../labview-captures/reports/2026-10-17-window-style.md)).
   The project level waits for `.sdproj`. **The window style is provisional and gets no more time** (DT-058,
   priority): the styles used are Old School for development and Solder for the releases. The branch is ready to
   merge into `main` as 0.5.0-beta when the developer decides.*

**Next: the execution scheduler** (DT-061, decided 2026-10-23, amended by DT-063 on 2026-10-24), on a short
`feature/scheduler` branch from `main`: one scheduler per Run is the only thing that resumes a clump, so parallel loops
behave the same on every operating system (issue #1), and it hands ready clumps to a pool of workers over one shared
memory, so a Run uses every core as in LabVIEW (DT-063). In order:
0. Measure LabVIEW's execution systems in the VM (DT-063 §7): threads per execution system, how two loops that only
   compute spread over the cores, a reentrant subVI called from parallel branches, and the VI's execution settings.
   *Done on 2026-10-24 and 2026-10-25 (DT-063 "What was measured"): one thread per logical processor per execution
   system and priority; a clump resumes after a Wait on any free thread; loops of different lifetimes do not slow
   each other.*
1. `core/runtime/scheduler.mjs` with its own tests on a simulated clock: the ready queue, the timer queue ordered by
   (deadline, sequence), the inbox, Abort and deadlock as states (DT-061 §1–2, §5, §6), designed for a pool of N
   threads from the start, with N = 1 as the exact-order mode (DT-063 §1, §4).
   *Done on 2026-10-24: `createScheduler` and `createVirtualHost` (a host whose clock jumps to the next deadline), with
   `test/core/scheduler.test.mjs`: dataflow order, yields, timers by (deadline, sequence), the 1000/500 ms interleave,
   one clump at a time with N = 1 and N at once with a pool, the non-reentrant subVI's lock in arrival order, subplans
   (`join`), answers from outside, Abort and deadlock. Nothing uses it yet: that is step 2.*
2. Every suspending import of `runtime.mjs` parks through it (`ceder`, `esperar`, `esperar_multiplo`, `entrar_subvi`,
   `correr_plan`, `correr_subvi`, the dialogs, `dep.nodo`), with the iteration budget per clump; `planificar` and
   `turn-yielder.mjs` become part of it. The existing tests stay green.
   *Done on 2026-10-24: `ejecutar` runs every clump through `createScheduler` on `createRealHost` (one thread: the
   worker is one thread of the future pool); Wait, Wait Until Next ms Multiple, the yields of a loop (budget per
   clump), subplans and subVI calls (`join`), the non-reentrant subVI's turn (`acquire`/`release`), the two error
   dialogs and the debugger's pauses (`waitFor`) all park through it, and Abort is a message to it. An import finds
   its clump with `currentContext()`. Highlight Execution's one clump at a time is the scheduler's
   `oneClumpAtATime`, which lets the clumps of a subplan run while their parent waits for them. `planificar` and
   `turn-yielder.mjs` are gone; issue #1's tests moved to `test/core/scheduler.test.mjs`. 804 tests green.*
3. The worker's panel writes sent at the end of each turn instead of `setTimeout(vaciar)` (DT-061 §4), and the
   editor's `worker.terminate()` when Abort gets no answer.
   *Done on 2026-10-24: the scheduler's `onTurnEnd` (the runtime's `alAcabarTurno`) comes once the clumps a turn
   resumed have parked, and when the Run ends; the worker sends its writes then (`test/core/execution.test.mjs`,
   `test/core/scheduler.test.mjs`). The editor already terminated the worker 500 ms after an unanswered Abort.*
4. The reference traces (DT-061 §8): a few VIs with parallel waits, the order of resumes they must give, and a test
   that runs them.
   *Done on 2026-10-24: `test/end-to-end/reference-traces.test.mjs` runs VIs with parallel loops on the virtual clock
   (`ejecutar` takes `host`) and checks every write: the 1000/500 ms loops, issue #1's waits that end together, and
   Wait Until Next ms Multiple against a plain wait, ties going to the wait made first.*
5. Node 26: the command line and `npm test` pass `--experimental-wasm-jspi` only when the running Node needs it
   (DT-061, "What was measured" 1). *Done on 2026-10-23, as a fix for 0.4 (`cli/jspi.mjs`,
   `scripts/run-tests.mjs`): `npm test` and the command line checked on Node 24.19.0, 24.22.1 and 26.12.1.*
6. Stackless clumps (DT-063 §8, decided 2026-10-25): every clump that can park, and every subVI it calls, saves its
   live locals and resume point into a frame in the data space and returns to the scheduler, which calls it again to
   go on; JSPI is retired. Done on the single-threaded runtime first, with every existing test and the reference
   traces green, before any thread is added.
   *Done on 2026-10-25 (DT-063 §8): `core/compiler/stackless.mjs` rewrites every function that may park (a rewinding
   copy and running copies, the debugger's hooks only in the one used while debugging, only the live locals
   saved), the runtime resumes clumps through `parking` and `resumeValue`, and JSPI is gone from the runtime, the
   command line and `npm test`. A compute loop runs as fast as with JSPI with debugging off and ~35 % faster with it
   allowed. 818 tests green.*
7. The pool (DT-063 §1–3, §9: per-thread deques with work stealing, timers in the shared memory, each worker's loop
   in WebAssembly, `scheduler.mjs` kept as the reference model; §10: the panel as a transfer buffer in the shared
   memory, atomic scalars, a lock per string, array or cluster control, indicator cells and a chart ring of its
   history length walked by the coordinator): the module's memory `shared`, a stack per thread, the clumps' dependency counters with
   atomics, the lock of non-reentrant subVIs and globals, COOP/COEP on the window that runs VIs, and N from what step 0
   measured. The reference traces of step 4 run with N = 1 (exact order) and N > 1 (dataflow constraints and results).
With stackless clumps the Rust host needs no stack switching (DT-061 §7). Still to measure in LabVIEW before §10 is written:
whether a large array read by a local variable while another loop writes it is ever torn.

**Then:** **LabVIEW Core 1 without hardware** (DT-054, moved after the beta by DT-055): every
lesson of NI's Core 1 course can be done in Solder, except lessons 2 and 15 and the DAQ and instrument parts of 4,
7 and 8. The outline is in `labview-captures/core-courses/README.md`; first, list which lessons Solder misses.

**Postponed behind these five:** *inplaceness* (DT-042 §5), which changes memory
and speed but not results; it will be done when a real program
runs slowly.

**Postponed**, but not forgotten: the icon editor (every VI keeps the standard icon), Change to … (half captured, see M1), the *Adapt To Entered Data* switch, the
right-click menus of the panel and the 19 missing Numeric controls.

## 4. The modules, in order

### M1 — Numeric, whole

- [x] **Representation** menu of constants, controls and indicators: switch
  between I8…U64, SGL and DBL, with the color and coercion that correspond.
  *(2026-10-01.)* The grid of 15 icons, captured in LabVIEW; EXT, FXP and the
  complex types are greyed out (DT-038 §5). The value is rounded to even and
  saturated; controls and indicators carry their representation into the `.qvi` and the compiler.
  Left aside: the right-click menu of the *panel* (last step of M1), the
  *Adapt To Entered Data* switch (always on for now) and checking in LabVIEW
  the saturation between integers and how many digits an SGL shows (3.7 came out as
  "3.700000047684").
- [ ] **Create ▸ Constant / Control / Indicator** on a terminal, and **Change
  to Control / Indicator / Constant**.
  *Half captured (2026-10-01), not implemented.* On a function (Add), the
  right-click gives the same menu on an input terminal, on the body and on the
  output; there is no per-terminal menu. Its **Create** submenu has: Constant,
  Control, Indicator, Channel Writer…, | All Controls and Indicators, All
  Constants (`numeric-funcion-create.png`). **Create ▸ Control** on Add created
  a DBL control on the left, wired to input `x`, with the label "x"
  in edit mode (`numeric-funcion-create-control.png`). Repeated, it created another control
  labeled "x+y" —the name of the output— and unwired: *it is not known which
  terminal Create points at when the click is not on a terminal*. Still to capture:
  Constant and Indicator, All Controls and Indicators / All Constants, and Change to
  Control / Indicator / Constant (what happens to the panel and to the wires).
- [x] **Conversion** subpalette (To Byte Integer … To Double Precision Float, and
  whatever else it shows): capture, catalog, compile. *(2026-10-01.)* The
  whole subpalette, 27 elements in 4 columns. Done: the 10 numeric conversions
  (terminals `number` → "32bit integer", "double precision float"…,
  from the Context Help) and the three Boolean ones that also live there; EXT, FXP and the
  complex types, `todo` like everything else (before `never`, DT-038 §5; reopened on
  2026-10-01 without deciding how): Coerce To Type, To Time
  Stamp, strings/bytes, units, colors and Enum to Array of Enums. It rounds to
  even and saturates when going from float to integer; between integers the low bits are kept,
  **unverified in LabVIEW**. Its right-click menu has rows that the normal
  function does not have (*Conversion Palette*, *Replace Conversion*;
  `numeric-menu-conversion.png`): not declared.
- [x] **Data Manipulation** subpalette (Split Number, Join Numbers, Rotate,
  Logical Shift, Swap Bytes…): capture, catalog, compile. *(2026-10-01.)* 13
  elements in 4 columns; 9 done: Mantissa & Exponent, Rotate Left/Right With
  Carry, Logical Shift, Rotate, Split Number, Join Numbers, Swap Bytes and Swap
  Words, with the terminals from the Context Help. Pending (`todo`): Type Cast,
  Flatten To String, Unflatten From String (waiting for the string type, M3) and Byte
  Array Checksum.vi. The catalog types gain `entero`, `min`/`max`,
  `defecto`, `mitad` and `doble`. **Verified in LabVIEW:** the node's right-click
  menu (*Data Manipulation Palette* instead of *Conversion Palette*),
  and that an unwired Split Number is of integers (blue) with U16 on its outputs,
  that is, of U32. **From the NI help, unverified in the VM:** Split Number
  gives unsigned integers of half the bits and accepts 16, 32 and 64; Join Numbers
  accepts 8, 16 and 32; Mantissa & Exponent gives mantissa and exponent with the
  representation of the number. **Unverified:** the default type of Rotate,
  Logical Shift and Rotate With Carry when unwired (set to I32, and y to I16), what
  Logical Shift does with a y outside the width (here, zero), and the mantissa of a
  subnormal.
- [x] **Math & Scientific Constants** subpalette: capture and compile.
  *(2026-10-01.)* 17 DBL constants in 4 columns, with name, symbol and value from
  their context help (`core/model/math-constants.mjs`): π and its derivatives, e, the
  logarithms and the physical ones (h, e, c, G, N_A, R∞, R). They are drawn in the diagram
  as boxes with their symbol.
- [~] **Enum** and **Ring**: the enum type (as U16 when converting, DT-038), its
  editable constant and its compilation. *(2026-10-01.)* They compile: `enum-const`
  and `ring-const` emit their value as U16, and the compiler accepts the enum type.
  **Missing** is the editing: the *Edit Items…* dialog and the dropdown to choose a
  value, which are not captured (without them, a new enum or ring constant has
  no items). To be resumed with the Ring & Enum controls.
- [x] **Range Limits For Type** and **Expression Node** (parse the expression and
  compile it). *(2026-10-01.)* Range Limits gives the limits of the wired type;
  verified in LabVIEW that with a DBL the maximum is +Inf and the minimum −Inf (an
  enum gives its last value, according to its help; SGL, by symmetry). Expression
  Node: the expression is typed inside the node (24 × 17 px with "x", measured in
  LabVIEW), with a double click; a single variable, with whatever name you want
  (`core/compiler/expression-parser.mjs`). **Verified in LabVIEW** (2026-10-01, rule 2h of
  `spec/03`): the syntax is that of C, with `**` for power and `^` for
  exclusive or (only with integers: with a DBL, *Integer type required*); `%`, `mod`
  and `rem` truncate; the 39 functions of its context help, also the two-argument
  ones (max, min, mod, rem) and rand(); with an integer it is computed in DBL and
  rounded to even. Its terminals are called `input` and `output`, and Create on
  the node creates "Numeric N" controls, not named after the variable. Its right-click
  menu, captured and not declared: Visible Items, Help, Examples,
  Description and Tip…, Add Breakpoint, Numeric Palette, Create, Replace, Remove
  and Rewire, Properties. **Not done:** the comma as an operator,
  comparisons and logicals (unverified whether LabVIEW accepts them) and `sizeOfDim`,
  which waits for arrays.
- [ ] **Controls ▸ Numeric**: the 19 missing controls (sliders, knobs,
  dials, meters, tank, thermometer, bars). Time Stamp waits for the timestamp type:
  it is declared pending with its reason.
- [ ] Right-click menus of the panel for numeric controls (capture).
- Out by decision: complex and fixed point (DT-038 §5). Add/Multiply Array
  Elements are compiled in M6, once there are arrays.

### M2 — Boolean, whole

- [x] **Controls ▸ Boolean**: buttons, switches and LEDs, with their **mechanical
  action** (Switch/Latch When Pressed/Released…), captured in LabVIEW.
  *(2026-10-01.)* Subpalette of 13 elements in 3 columns, captured with their
  names: Push Button, Rocker, Vert Rocker, Round LED, Horizontal Toggle
  Switch, Vertical Toggle Switch, Square LED, Slide Switch, Vertical Slide
  Switch, OK Button, Cancel Button, Stop Button, Radio Buttons. 10 done (the
  LEDs are indicators; the rest, controls); Rocker and Vert Rocker wait for
  a label to be able to start hidden, and Radio Buttons, for the cluster. Right-click
  menu of the panel and of the terminal captured, with the grid of
  **Mechanical Action**: the factory default is Switch When Pressed (Push Button,
  switches, sliders), and Latch When Released on OK, Cancel and Stop.
  Only Switch When Pressed can be chosen; the other five, greyed out
  (`acciones-mecanicas`). The drawings of the ten controls were compared with
  the captures at 1:1, off and on (section 5 of `capturing-labview.md`),
  and carry their measurements in `glyphs.mjs`; the toggles are the ones that stray most
  (their shadow and perspective are a bitmap in LabVIEW).
- [x] Boolean terminals in the diagram (`bool-control`, `bool-indicator`) and their
  compilation: the panel reads and writes Booleans. *(2026-10-01.)* Green terminal
  with "TF" (icon and compact), wireable to the Boolean functions; `.qvi` with
  `style` and `mechanical-action`; the Boolean travels as i32 0/1 and Run shows the
  LED on or off.
- [x] Run mode of the panel and Latch *(2026-10-01, DT-040)*. Verified in LabVIEW
  that in edit mode a click on the body of a Boolean **does** trigger it (on
  its text it edits it and on its border it selects it; spec/05 Rule 40c), contrary
  to what had been noted. Latch When Released done: Stop, OK and
  Cancel are born with it and go back to FALSE on their own when read. Run mode in both
  windows (Rule 40d). Not done: Ctrl+M and the other four actions.
- [ ] Capture the Stop/OK/Cancel menu (it also has *Release Text*), the
  hidden label of the Rockers and the terminal menu of an indicator.
- [x] Measurement of the panel terminals *(2026-10-01)*: at 1:1 the icon one
  measures 38 × 38 px and the compact one, 32 × 16, in Numeric and in Boolean, control and
  indicator (`MEDIDAS_TERMINAL_PANEL`; captures `boolean-terminales-icono.png`,
  `boolean-terminal-compacto.png` and `boolean-terminal-compacto-indicador.png`).
  The wire leaves from the tip of the arrow, 19.5 px from the top (icon) or 8.5
  (compact). Pending: the interior of a numeric terminal (box and
  incrementer) is still that of the capture at 150 %, only shifted.
- [ ] Menu of the Boolean constant and that of the logic functions (capture).
- The functions over arrays of Booleans are compiled in M6.

### M3 — String

- [x] **The string type in WebAssembly** *(2026-10-01)*: DT-042 (blocks
  `[longitud][bytes]` in linear memory, one buffer per node, no collector) and its
  update: the functions that depend on LabVIEW's format are JavaScript
  imports over the same memory.
- [~] **Functions ▸ Programming ▸ String** *(2026-10-01)*: captured in full
  (`labview-captures/string/`: 28 elements in 5 columns; Number/String Conversion,
  12 in 7 columns; Additional String Functions, 13 in 4; Path/Array/String
  Conversion, 6 in 4; Flatten/Unflatten String, 9 in 2; with the context help of
  each one) and declared in the inventory. **Done (27):** String Length, Concatenate
  Strings (expandable), String Subset, Trim Whitespace.vi, Replace Substring, Search
  and Replace String, To Upper Case, To Lower Case, String Constant and the six
  fixed constants, Rotate String, Reverse String, Number To Decimal / Hexadecimal /
  Octal / Fractional / Exponential / Engineering String, and Decimal / Hexadecimal /
  Octal / Fract-Exp String To Number. **Verified in LabVIEW** (rules 21b–21f of
  `spec/04`, tests in `labview-captures/string/prueba-*.png`): String Subset and
  Replace Substring with out-of-range offsets and lengths, Search and Replace String
  (first, all, case-insensitive, offset, empty string), Number To
  Decimal / Hexadecimal / Fractional / Exponential / Engineering String (rounding to
  even, widths, hexadecimal zeros, exponent without zeros), Decimal and Fract/Exp
  String To Number (blanks, sign, saturation, `1,5` gives 1) and string
  comparisons (byte by byte). **Greyed out** (with their reason in the inventory): Normalize End
  Of Line, Match Pattern and Match Regular Expression (regular expressions), Scan
  From String, Format Into String, Format Value and Scan Value (the Edit Format
  String dialog and inputs that grow), Format Date/Time String (time stamp), Build Text
  (Express VI), Spreadsheet String To Array and Array To Spreadsheet String (arrays), the
  Additional String Functions with arrays or regular expressions, and the
  Path/Array/String Conversion (paths) and Flatten/Unflatten String folders.
  **Unverified in LabVIEW:** the order of `location` in Trim Whitespace.vi, Replace
  Substring with offset equal to the length and with negative length, Octal String To
  Number and Hexadecimal String To Number (prefixes), the rounding of a DBL in Number To
  Decimal String (the control created was I32), the format of Number To Octal String, and
  the End Of Line constant, which on Windows is CR LF (here, LF).
- [x] **Comparison with strings** *(2026-10-01)*: Equal?, Not Equal?, Greater?, Less?,
  Greater Or Equal?, Less Or Equal? and Select accept strings (spec/03 Rule 2j);
  done: Empty String/Path?, Decimal Digit?, Hex Digit?, Octal Digit? and White Space?.
  Printable? and Lexical Class remain greyed out (which bytes count has not been measured).
- [x] **Controls ▸ Modern ▸ String & Path** *(2026-10-01)*: captured (5 elements in 3
  columns) and String Control and String Indicator done, writable on the panel (in
  edit mode and in Run mode) with Enter as line break; Combo Box, File Path Control and
  File Path Indicator, greyed out. **Greyed out:** the control's display modes
  (`\` Codes, Password, Hex Display) and their right-click menus, not captured.
- [x] **Editable string constant in the diagram**, multi-line *(2026-10-01)*:
  15 × 19 px empty and 22 × 34 with two lines, measured in LabVIEW; just dropped it is
  ready to type; Enter goes down a line, it is confirmed with Enter Text or a click
  outside. A VI with strings is saved, opened and runs (`qvi-round-trip.test.mjs`).

### M4 — Structures: sequences and loops

- [~] **Flat Sequence** and **Stacked Sequence** *(2026-10-01)*: captured in the VM
  (`labview-captures/structures/secuencia-*.png`: the film border, the frames
  with their widths, the wire between frames, the selector and the local variable of the
  Stacked, and the menus of both) and done in the editor (spec/05 Rule 40g), with
  the border compared pixel by pixel: they are placed, stretched by their end frames, a
  node falls into the frame below it, Add Frame After/Before,
  Delete This Frame and Replace with Stacked/Flat Sequence work, and a sequence
  made with the mouse compiles and runs. The widths of the frames go in the
  `.qvi` (`frame-widths`). **Measured in LabVIEW, and different from the core:** the output
  tunnel of a Flat gives its value when the frame it leaves from ends, not when
  the sequence ends (DT-041 §9). **Missing:** Add Sequence Local and wiring in a Stacked with
  the mouse (for now only the wires that come from a Flat or from a file are seen),
  Duplicate Frame, Show Frame and Make This Frame, Remove Sequence, Replace with
  Timed Sequence or Case, Auto Grow, tunnels on the top and bottom border, and
  fixing the core.
- [~] **While Loop** and **For Loop**: iteration terminal, condition, count,
  tunnels and **shift registers**. Compilation with `block`/`loop`/`br_if`.
  *(2026-10-01.)* Captured in LabVIEW (`labview-captures/structures/`: the
  16-element subpalette, the two loops at 1:1 with their border, terminals,
  tunnels, shift register, selection and the menus of each border node) and done
  in the editor, with the measurements compared pixel by pixel (spec/05 Rule 40e): they are
  placed with two clicks, by dragging or with one click (48 × 48), moved and
  stretched, a node dropped inside or outside enters or leaves, wires create tunnels
  when they cross, and Add Shift Register, Stop if True and Continue if True work; a
  loop made with the mouse compiles and runs. The whole Structures subpalette
  is in the inventory. The core (DT-041): flat model with `dentro`,
  types, inline compilation inside its clump, adaptive yielding and nested `.qvi`
  with exact round-trip (`test/core/structures.test.mjs`); the example
  `while-loop-suma` gives 45 in the editor and on the command line. **Missing:** the Indexing, Concatenating and
  Conditional tunnel modes (arrays, M6), stacked shift registers, the For's
  condition terminal, Auto Grow and the fact that LabVIEW pushes aside a loop that overlaps
  another; Remove, Replace and Remove and Rewire; Visible Items; tunnels on the
  opposite side; and **unverified in LabVIEW**: stretching a loop over nodes (does it
  enclose them?) and why, when a loop was dropped around a node wired on both
  sides, LabVIEW created a shift register instead of tunnels.
- [~] **Case Structure** *(2026-10-01)*: captured and done in the editor (spec/05
  Rule 40f): frame, frame selector with arrows, list and text editing,
  "?" terminal, input and output tunnels (placeholder, filled, Use Default),
  only the active frame is shown; menus Add Case After/Before, Delete, Default and Show
  Case True/False. Verified in LabVIEW: DBL into the selector rounds to even (2.5 → 2,
  1.5 → 2) and For with N = 0 or -1 gives 0 in the tunnel; both match the core.
  **Missing:** string selector, Duplicate, Swap/Shift/Rearrange, Show Case...,
  Remove Empty Cases, Make This Case True/False, Radix, Auto Grow, unwiring
  the selector.
- [~] **Run while running**: indicators that update inside a
  loop and the **Abort** button. *(2026-10-01.)* Decided and done outside the
  loops (DT-040): dataflow clumps with JSPI, live indicators, parallel
  branches, Abort, Latch When Released and Run mode, measured in LabVIEW
  (`labview-captures/run/`). With loops *(2026-10-01, DT-041)*: each iteration
  yields with an adaptive budget (a million iterations, ~10 ms), the
  indicators inside are live, the Stop is read on every iteration, the output
  tunnel gives its value at the end and Abort stops an infinite loop. Two waits in the
  same body overlap, as in LabVIEW: the body goes in a subplan (DT-041
  b; 4 iterations with Wait of 50 and 30 ms take ~200 ms). The tunnel of a For with N
  = 0, verified in LabVIEW: gives 0. **Missing:** Ctrl+M.
- Event Structure, later (with Dialog & User Interface).

### M5 — Comparison

- [x] **Over numbers and Booleans** *(2026-10-01)*. Subpalette of 29 elements in
  3 columns, captured with their names and terminals (context help,
  `paletas/functions-comparison*.png`). 16 done: Equal?, Not Equal?, Greater?,
  Less?, Greater Or Equal?, Less Or Equal?, the six "To 0?", Select, Max & Min,
  In Range and Coerce and Not A Number/Path/Refnum? (numbers only). Look measured
  at 1:1 (triangle of 19 × 20 px; Max & Min, 30 × 30; In Range, 30 × 22) and
  right-click menus captured (Comparison Mode, Include upper/lower limit). The inherited
  `gt-op`, `lt-op` and `eq-op` have been replaced with LabVIEW's names.
  Verified in the VM and carried into tests and into Rule 2i of spec/03: NaN
  in all comparisons, coercion of integers and DBL, FALSE < TRUE, Select with
  different types, Max & Min with NaN and the extremes and the NaN of In Range.
- [ ] **Missing, after M3, M6 and the other types:** comparing strings (Equal?, Select,
  Max & Min… with strings), Empty String/Path?, Decimal Digit?, Hex Digit?, Octal
  Digit?, Printable?, White Space? and Lexical Class (they accept a string or a
  number, which they read as an ASCII code: the numeric ones could be done now, but
  they wait for strings), Empty Array?, comparing arrays and clusters with *Comparison
  Mode* (Compare Elements / Aggregates), Is Path and Not Empty?, Fixed-Point
  Overflow? (FXP) and the three that are not simple functions: the Comparison
  Express VI, Assert Type and Is Value Changed.vim (malleable VIs).
- [ ] **Not tried in LabVIEW:** In Range and Coerce with a NaN only in the upper
  limit (with x or with the lower one it is NaN), and Max & Min with integers of
  different sign (the common-type rule is assumed).

### M6 — Array and Cluster

- [x] **Clusters** *(2026-10-02, DT-042 c)* on the memory of DT-042 (scalars inside, strings and
  arrays by handle): Bundle, Unbundle, By Name, constants, controls and
  indicators.
- [x] **The error cluster** *(done on 2026-10-02, DT-043)*. The core
  (`test/end-to-end/error-cluster.test.mjs`): the type, the constant, Clear Errors, Merge
  Errors, Error Cluster From Error Code, error passing, automatic
  handling and **Simple Error Handler** (a suspendable import,
  `opciones.alDialogoError`), with the texts of `core/runtime/error-codes.mjs` (LabVIEW
  codes, our own texts). The editor: the yellow wire with black
  dashes, **Error In and Error Out** on the panel (Controls ▸ Modern ▸ Data
  Containers, its other six elements greyed out), the terminal and the editable
  constant in the diagram, the **Dialog & User Interface** subpalette (23
  elements, 5 done), and the two modal dialogs (automatic handling and Simple
  Error Handler) that the page answers to the worker. Search and Replace String
  gains `error in`/`error out`; it is the only String function with error
  terminals among those done (Scan From String and Format Into String will carry them
  when they exist). Not done: Help ▸ Explain Error…, General Error Handler,
  Find First Error, Error Ring, the right-click menus of the controls, and
  whatever is marked "unverified" in spec/05 Rule 40i. It is the basis of hardware
  I/O.
- [~] **Arrays** *(1D, core, auto-indexing and editor done on 2026-10-02, DT-042 d;
  missing: 2D, inplaceness, Array To
  Cluster/Cluster To Array, Interleave/Decimate, Interpolate/Threshold, Shuffle,
  Remove Duplicates and the array functions that depend on strings)*. **Done:**
  the Array subpalette (grid of 5 columns with its placeholder, 34 elements), Replace
  Array Subset, Insert Into Array, Delete From Array, Sort 1D Array, Rotate 1D
  Array, Split 1D Array and Increment/Decrement Array Element (in JavaScript over
  the memory, module `arr`; only with fixed-size elements), the array control,
  indicator and constant (index, visible elements that stretch,
  editable elements), the array terminal, the 2 px wire, the indexed
  tunnels with their bracket and their menu, and the `.qvi` (`visible-elements`, `index`,
  `indexed`). **Edge cases measured in LabVIEW** *(2026-10-02, spec/04 Rule 21h)*: out of range, Replace, Insert and Delete leave the array unchanged (before they were clamped); Array Max & Min does not count NaNs; the While does not index; the rest already matched.

### M7 — Timing

- [~] Wait (ms), Wait Until Next ms Multiple, Tick Count, Get Date/Time. Waiting
  without freezing the worker: decision written down (Atomics.wait or JSPI, DT-039 d).
  *(2026-10-01.)* Subpalette captured (15 elements, 4 columns) and Tick
  Count (ms), Wait (ms) and Wait Until Next ms Multiple done, with JSPI (DT-040). The
  rest waits for the time stamp (`tipo-timestamp`), for strings, for clusters,
  for subVIs or for Express VIs.

### M8 — Waveform and graphs

- [ ] Controls ▸ Graph (Waveform Chart, Waveform Graph, XY Graph) and the Waveform
  subpalette.

### M6, notes from 2026-10-02 on arrays

- Measured at 1:1 (`labview-captures/array/`): empty array constant 52 × 25 px (index of 33 × 21 and element box
  with two borders, element of 15 × 21); panel array with a DBL 114 × 36 (index 41 × 26, box 72 × 33); indexed
  tunnel of 9 × 9, background `#ffffcc` and bracket in the color of the type; 1D array wire, 2 px; array terminal
  of 37 × 37 with border in the color of the element and the cells i, j, k.
- A For lets an **indexed** output tunnel be born (verified in LabVIEW). Output tunnel menu: Tunnel Mode ▸
  Last Value, Indexing, Concatenating, —, Conditional; function rows: Visible Items, Help, Examples,
  Description and Tip…, Add Breakpoint, Array Palette, Create (with All Controls and Indicators and All Constants),
  Replace, Remove and Rewire, Properties. Panel array menu: Visible Items (Label, Caption, Index Display,
  Vertical and Horizontal Scrollbar), Find Terminal, Change to Indicator, Change to Element, Make Type Def.,
  Description and Tip…, Create, Replace, Data Operations, Advanced, Fit Control to Pane, Scale Object with Pane,
  Add Dimension, Remove Dimension, Add Element Gap, Export, Properties. Neither is in the inventory.
- **Pending:** it was not possible to stretch the panel array with the mouse in LabVIEW (the handles moved the object), so
  the growing gesture was cloned from the documentation, not from a capture. The panel array is born with one DBL element; the
  LabVIEW one is born empty and takes the type of the control dropped inside it (Change to Element, not done).
- **Pending (reported by the developer, 2026-10-22):**
  - Once a control is dropped into a panel array, it can be neither taken out nor deleted: the only way back is to
    delete the array and place a new one. What LabVIEW allows is unverified
    (`labview-captures/reports/2026-10-18-array-typing-stage2.md` Q5d: dragging it out was not achieved, Cut and
    Delete were not tried): measure it first, then clone it. *Done on 2026-10-23, as a fix for 0.4: measured
    (`reports/2026-10-23-array-remove-element.md`: LabVIEW lets the element be selected alone, dragged out, cut and
    deleted) and cloned (spec/05 Rule 40j bis); the array is empty again, `{ "array": "void" }` (DT-060).*
  - In the Block Diagram, a right-click on a panel array's terminal does not open its menu, so View As Icon cannot be
    turned off for it. *Done on 2026-10-23, as a fix for 0.4: the terminal's menu as measured
    (`reports/2026-10-23-array-terminal-menu.md`, spec/05 Rule 40j bis) and its compact view.*
- **Array coercion (resolved):** an array of I32 that enters where one of DBL is expected is converted element by
  element into a new buffer, like LabVIEW's coercion point (`test/core/arrays.test.mjs`).

### Afterwards, in this order

- **SubVIs:** connector pane, icon editor, compiled call (R6).
- **Dialog & User Interface**, **File I/O** (with their gates, R7).
- **Instrument I/O:** serial and VISA, with the host in Rust (DT-039 §5).
- **Projects:** `.qproj` and Project Explorer.
- **Classes** (LVOOP), libraries and everything else LabVIEW shows.

### Cross-cutting, when a module asks for it

Edit menu (undo, copy, paste), View, Window (Ctrl+E), Operate (Run
Continuously, Abort), Tools ▸ Options, the context help window, the error list,
probes and execution highlighting.

## 5. Log

- 2026-09-30 — Plan written. Vertical slice closed: save, open and Run.
- 2026-10-01 — M1, first step: Representation. Submenu captured (grid of
  4 columns at 48 px) and the full menu of the constant; verified that 3.7 →
  I32 gives 4 and 2.5 → 2. Controls and indicators now take their type from the
  configuration (`type-from: config`).
- 2026-10-01 — New priority (§3b): a basic language that can program before the Create/Change shortcuts.
- 2026-10-01 — M1: Conversion subpalette, captured and compiled (10 numeric conversions).
- 2026-10-01 — M1: Data Manipulation subpalette, captured and compiled (9 functions).
- 2026-10-01 — M1: Math & Scientific Constants, Range Limits For Type and Expression Node done; Enum and Ring compile, without their editing.
- 2026-10-01 — M1: Expression Node verified in LabVIEW and fixed (`**` is power, `^` is exclusive or; 39 functions). Range Limits with DBL: −Inf/+Inf. The part of M1 that §3b asks for is closed; what was postponed stays unchecked. Next: M2, Boolean for real.
- 2026-10-01 — M2, first step: Controls ▸ Modern ▸ Boolean captured (13 elements, 3 columns, menus and the 6 mechanical actions), 10 controls done with their green "TF" terminal, `bool-control` and `bool-indicator` compiled (i32 0/1) and `.qvi` with class and mechanical action. Only Switch When Pressed is selectable; Run mode of the panel and Latch, pending the execution decision (M4).
- 2026-10-01 — M2: drawings of the ten Boolean controls compared with LabVIEW at 1:1 (off and on) and fixed; panel terminals at 38 × 38 (icon) and 32 × 16 (compact), with the label of a Boolean 4 px from the drawing. Unresolved: the exact box of the toggles and the position of their labels.
- 2026-10-01 — M5: Functions ▸ Comparison captured (29 elements, context help and five menus) and done over numbers and Booleans: 16 functions placed, wireable and compiled, with behavior measured in LabVIEW (NaN, coercion, FALSE < TRUE, Select, Max & Min, In Range and Coerce); the rest greyed out until strings (M3), arrays (M6) and malleable VIs. Next: M4, structures.
- 2026-10-01 — Run like LabVIEW (DT-040, decided): circuits built in LabVIEW (While with Stop and Wait, output tunnel, two Waits in parallel; Abort; the click on a stopped Boolean) and cloned. The compiler splits the diagram into clumps and the host runs them by dataflow with JSPI: parallel branches, live indicators, immediate Abort, Latch When Released (and Stop, OK and Cancel are born Latch), Run mode in both windows. Timing: Tick Count, Wait and Wait Until Next ms Multiple. Tested in the real editor in Xvfb. Next: M4, with the loops on this scheduler.
- 2026-10-01 — M4, While Loop and For Loop in the editor: Functions ▸ Programming ▸ Structures captured (16 elements, 4 columns) and declared in full in the inventory (While and For done; Case, sequences, Event, Timed, Formula Node and the rest, greyed out with their reason), along with the border menus of each loop and of "i", the condition, "N", the tunnels and the shift registers. The two loops, drawn at 1:1 (frame, terminals of 16 × 16, tunnels of 9 × 9, shift registers of 16 × 12, handles of 6 × 6; compared pixel by pixel with LabVIEW) and editable: place with two clicks or a rectangle (minimum 48 × 48), move with what is inside, stretch, move nodes in and out, tunnels when wiring across the border, Add Shift Register and Stop/Continue if True. Rule 26 of spec/05 is amended (dragging between scopes reassigns, as in LabVIEW). Next: Case Structure and the sequences (M4), or arrays (M6) for the tunnels with Indexing.
- 2026-10-01 — M4, the core of the loops (DT-041): structures in the flat model with `dentro`, tunnels and shift registers as border nodes, inline compilation inside the loop's clump with adaptive yielding, and nested `.qvi` (spec/02 amended: condition, N and initial value are wired). 13 behavior tests; the sum example gives 45.
- 2026-10-01 — M4, Case Structure in the editor: captured (hatched frame, frame selector, "?", tunnels, menus of the border, the selector and the tunnels), verified in LabVIEW (DBL into the selector rounds to even; For with N = 0 gives 0) and done with measurements compared pixel by pixel; the frames become "0, Default" and "1" when an integer is wired. A Case made with the mouse compiles and runs. Next: sequences, or arrays (M6).
- 2026-10-01 — M4, the core of the Case (DT-041 §6–8: frames in the plan, selector, tunnels with one input per frame and Use Default If Unwired, if/else chain, `.qvi` with `frames`) and the subplans: two waits in the same body overlap.
- 2026-10-01 — M4, Flat and Stacked Sequence in the editor: captured in LabVIEW (film border of 250 × 200 with frames, separators of 5 px and holes every 12; minimum frame of 38; tunnels of 9 × 9 on the separators; selector "0 [0..1]" of 72 × 17; local variable of 13 × 13 with write arrow, read arrow and in checkerboard; menus of both) and done with the border compared pixel by pixel (66 px of difference, all from the tunnel and the wire that LabVIEW did not have in that capture). Verified by building and running the VI in LabVIEW: the output tunnel of a Flat writes the indicator when its frame ends (at ~1 s with a Wait of 1000 ms in frame 0), not when the sequence ends as the core did; fixed the same day (each frame of a Flat is an element of the dataflow, DT-041 §9). Next: Add Sequence Local, or arrays (M6).
- 2026-10-01 — M3, String: Functions ▸ Programming ▸ String captured in full (28 elements in 5 columns, plus Number/String Conversion of 12, Additional String Functions of 13, Path/Array/String Conversion of 6 and Flatten/Unflatten String of 9, with the context help of each function), Controls ▸ Modern ▸ String & Path (5) and the string constant and control (measured at 1:1: constant of 15 × 19 px empty and 22 × 34 with two lines; control of 100 × 24 px). 27 functions and constants and the two controls done; the rest greyed out with their reason. Results measured by building each function in LabVIEW (String Subset, Replace Substring, Search and Replace String, the Number To … String and … String To Number, and the string comparisons, byte by byte) and carried into `spec/04` (rules 21b–21f) and into tests. The functions that depend on LabVIEW's format are JavaScript imports over the memory of DT-042 (`cad.*`), with round-to-even for exact numbers; the allocator and the cells do not change. Comparison accepts strings and gains Empty String/Path?, Decimal/Hex/Octal Digit? and White Space?. The editor writes the constant and the control with Enter as line break; a string VI is saved, opened and runs. 248 tests. Next: M6 (arrays and clusters), or the right-click menus of the string constant and control, and Format Into String.
- 2026-10-02 — Decided: the error cluster goes into M6, after the basic clusters and before arrays. Arrays and clusters go on the memory of DT-042, not on WasmGC.
- 2026-10-02 — M6, the error cluster in the editor (DT-043): captured in LabVIEW the Controls ▸ Modern ▸ Data Containers subpalette (2 columns, 8 elements: Array, Cluster, RealMatrix.ctl, ComplexMatrix.ctl, Set, Map, Error In 3D.ctl and Error Out 3D.ctl) and the Error Out control at 1:1 (155 × 121 px). Done: the wire (3 px, olive border and yellow and black dashes), the Error In/Out controls with their terminal, the editable error constant (22 × 57 px), Dialog & User Interface declared in full (23 elements, 4 columns; 5 done), Simple Error Handler, the two modal dialogs (the automatic handling one with Continue and Stop, and the Simple Error Handler one with OK), `core/runtime/error-codes.mjs` with codes 1, 2, 7, 8, 42, 43, 56, 63 and 66 and the paragraph for the undefined code, and the error terminals of Search and Replace String. 266 tests. Next: arrays (M6), the basic clusters with their controls (Bundle, Unbundle, Cluster) or Explain Error.
- 2026-10-02 — M6, arrays in the editor: Functions ▸ Programming ▸ Array captured in full (34 elements, 5 columns, context help of each one, measurements of each function dropped in the diagram) and Controls ▸ Modern ▸ Data Containers ▸ Array; the panel array menu, the indexed output tunnel menu and that of a function, captured. Done: Replace Array Subset, Insert Into Array, Delete From Array, Sort 1D Array, Rotate 1D Array, Split 1D Array and Increment/Decrement Array Element (JavaScript module `arr`), the array control, indicator and constant, indexed tunnels with their menu and the 2 px array wire; the `.qvi` saves `indexed`, `visible-elements` and `index`. LabVIEW's edge cases remain unverified (see M6). 287 tests.
- 2026-10-03 — M6, 2D arrays (second stage, item 1). Researched how LabVIEW types arrays (type descriptor: element plus dimension count, no arrays of arrays) and decided DT-044: `{ array: E, dims: N }` and one block `[rows][columns][elements]`. Captured in LabVIEW (`labview-captures/array-2d/`): the 2D constant, panel array, terminal and 3 px wire at 1:1, the menus with Add/Remove Dimension, and the results of Array Size, Index Array (element, row, column, out of range), Build Array (padding, 2D + 1D, Concatenate Inputs), Initialize Array, Transpose, Reshape and nested Fors; Add Dimension still enabled at 34 dimensions. Core: types, memory, panel, coercion, Array Size, Index Array, Build Array, Initialize Array and auto-indexing in 2D. Editor: the wire, the 2D constant and panel array (editable, stretchable), Index Array and Initialize Array with two inputs. Unverified: Index Array with no index wired, ragged rows out of a loop. Not done: more than 2 dimensions, Transpose/Reshape, Index Array's extra index groups, Build Array's Concatenate lock. 327 tests. Next: subVIs (R6).
- 2026-10-08 — SubVIs, stages (a) and (b) of DT-045. Researched how LabVIEW calls a subVI (separate compiled code, one data space when non-reentrant, clones when reentrant, recursion only with shared clones), checked again by an independent review, and decided DT-045. Captured in LabVIEW (`labview-captures/subvi/`): the 4-2-2-4 connector pane and its menus, Recommended by default and no Required outputs, the subVI node and its menu, the unwired input taking the control's default (5 + 3 = 8), the broken Run with a Required input unwired, the functional global counting 1, 2 and then 3, 4 in the next Run (1, 1 and 2, 2 with preallocated clones), VI Properties ▸ Execution, the icon editor and the recursion error. Core: one module per hierarchy with a data space per instance, direct calls or JSPI plans, a queue per non-reentrant VI, uninitialized shift registers that keep their value, state kept between Runs, the hierarchy loaded from relative paths, the command line. Editor: several VIs open, connector pane, Select a VI..., the subVI node, double click to open, VI Properties ▸ Execution. DBL orange corrected to the measured `#ff7f00`. Unverified: the total time of two parallel calls. Not done: the icon editor (stage c), the other connector patterns, View As Icon off, shared clones, recursion; a caller whose saved wires point to ports its subVI no longer has does not open. 360 tests.
- 2026-10-09 — Debugging (second stage, item 6, the last of it). Measured in LabVIEW (`labview-captures/debugging/`): one Debug Window for probes and breakpoints, Highlight Execution with four speeds, the stops before a node, the Error list. Core (DT-047): hooks after each node. Editor: a controller in the run worker that stops, steps and paces the VI, the toolbar buttons with their states, probes, breakpoints, the Debug Window and the Error list as floating windows, Allow debugging in VI Properties. Unverified: the pace of Fast and Very Fast, Step Out, wire breakpoints, what Pause and Start Single Stepping do in edit mode. 500 tests.

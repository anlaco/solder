# Building the DAQ plugin's OVIs by hand

> Non-normative. DT-087 §6 and its amendment of 2026-11-13 ("what the plugin's OVIs hold inside"): the OVIs of the DAQ
> plugin are built in the real editor, as a user would (mouse and keyboard, no `.sdg` written by hand), with a diagram
> of Solder's own that imitates the shape of LabVIEW's DAQmx VIs. Every difficulty, missing piece or difference from
> LabVIEW's drawing is written down here, as [`real-programs-0.2.md`](real-programs-0.2.md) did. The numbers in
> brackets (#n) are the order in which each finding appeared.

## 1. The OVIs

| OVI | File | Status |
|-----|------|--------|
| DAQ Fill In Error Info | `addons/daq/1/ovi.lib/DAQ/DAQ Fill In Error Info.sdg` | **Works** (2026-11-13): four cases run as specified; source without Call Chain |
| DAQ Start Task | `addons/daq/1/ovi.lib/DAQ/DAQ Start Task.sdg` | **Works** (2026-11-13, stage 2): DAQ task control and indicator, pattern 4833 with LabVIEW's indices 0, 4, 11, 15; against the add-on's `nilvaiu` an empty task gives -200088 with `<append>`, and an incoming error passes through. Since stage 3 the task passes through both frames of the Case |
| DAQ Stop Task | `addons/daq/1/ovi.lib/DAQ/DAQ Stop Task.sdg` | **Works** (2026-11-14, stage 3): Save As of Start Task with `mode` 1 |
| DAQ Clear Task | `addons/daq/1/ovi.lib/DAQ/DAQ Clear Task.sdg` | **Works** (2026-11-14, stage 3): no Case on error in, as LabVIEW's; `DAQDestroyTask110` through Adapt to Type, Handles by Value; task in 0, error in 11, error out 15 on 4833 |

## 2. Findings

Known before starting (2026-11-13), from the plan: Solder has no **This Application** constant and no **Call Chain**
function, which LabVIEW's VIs use; the DAQ task control and indicator on the panel are not built (slice 4).

Stage 1, 2026-11-13 ([report](../../labview-captures/reports/2026-11-13-daq-plugin-stage1.md), Solder editor under Xvfb).

### Blocking

- **#8 The connector pattern cannot be changed.** The Patterns grid shows LabVIEW's 36 but a click says "not yet"; also
  Add/Remove Terminal, Rotate, Flip. Every DAQ OVI uses 4833. *Fixed 2026-11-13 for Patterns ▸ (DT-075, amendment of
  2026-11-13), measured in LabVIEW first; Add/Remove Terminal, Rotate and Flip stay holes.*
- **#16 No DAQ task control or indicator, and the DAQ name constant cannot be reached.** *Built (2026-11-13):* Controls ▸ Modern ▸
  I/O ▸ DAQ Name Controls with the seven kinds, the indicator by Change to Indicator or Create ▸ Indicator, Create ▸ Constant on any
  DAQ name terminal (spec/05 §25, `test/editor/daq-name-controls.test.mjs`); Functions ▸ Measurement I/O is still greyed. *Was:* Controls ▸ Modern ▸ I/O ▸
  DAQmx Name Controls and Refnum are "not yet"; Functions ▸ Measurement I/O is greyed (the add-on brings no
  `daq.json` palette yet). The constant exists in the code (`daq-name-constant`) but no palette names it.

### Wrong or lost

- **#24 A numeric constant changed to U32 was saved as I32** (the `.sdg` says `"type": "i32"`). *Not reproduced
  (2026-11-13):* the menu, the model and the file keep U32 (`test/editor/diagram-editing.test.mjs`, "representation
  cambia el tipo…", and the same steps run on the saved file); I32 sits right above U32 in the grid and the agent never
  saw the result, so it was most likely a missed click. Integers share one colour, as in LabVIEW, so nothing showed it.
- **#10 A stray tunnel cannot be deleted** once its wire is gone (Remove and Rewire greyed); only Undo removes it.
- **#20 Ctrl+A does not select all in the Call Library Function Node's parameter Name field**; typing appends. *Fixed
  2026-11-14 (S3-#7).*

### Slow or different from LabVIEW

- #1 palette Search "not yet"; #2 no names on hover in the palettes; #4 Quick Drop does nothing (untested further).
- #5 dropping a control from the palette needs a fresh right-click each time.
- #6, #7 the panel's numeric menu greys Representation, Visible Items, Change to Indicator, Data Operations, Display
  Format (they work from the diagram or the Edit menu).
- #9 connector cells ~8 px with no tooltip; a cluster is assigned by clicking its border.
- #11 1-px resize bands.
- #22, #23 the Call Library Function Node is ~40×40 with 8-px terminal spacing and no parameter names on its face.
- #25 the Empty String Constant is below the fold of the String palette.
- #26 a subOVI shows the default icon and generic terminal names (`control_1`…) until hovered.

### Look

- #14, #27 automatic wire routes overlap (four wires on one vertical; a branch drawn on top of another wire), with no
  way to route by hand.
- #15 the error Case's frame label shows "Error .." truncated.
- Unwired tunnels in the other frame are drawn filled, not hollow as in LabVIEW; terminal labels at the window's left
  edge are clipped.
- #28 after reopening, an extra yellow wire seemed drawn in the No Error frame; the saved file has no extra connection
  (unverified whether it is drawn at all).

### Fine

#13 the "to 0" comparisons, #18 a Case on an error cluster, #19 the Call Library Function Node dialog offers every type
and format the instance needs, #21 a new parameter starts as LabVIEW's. Saving into the add-on folder works.
#3 (a stale "Case missing" tooltip on Diagram Disable Structure) is cosmetic. #29: the run gives error 7 because no
add-on was installed in that editor; to try with the add-on's `nilvaiu`.

Stage 2, 2026-11-13 ([report](../../labview-captures/reports/2026-11-13-daq-plugin-stage2.md)): DAQ Start Task rebuilt
with the DAQ task control and indicator and pattern 4833, run against the add-on's `nilvaiu`. Numbered S2-#n.

- **S2-#5 A DAQ wire could not pass through a Case's output tunnel** (blocking for the design): the tunnel took only
  Booleans, strings, paths, numbers and clusters, so a DAQ name, a VISA resource name or an array was a broken wire.
  *Fixed the same day:* a Case tunnel takes any type (`core/model/graph.mjs`, `CASE_TUNNEL_TYPE`;
  `test/editor/daq-name-controls.test.mjs`, "a DAQ task and a VISA resource name pass through a Case's output tunnel").
  Start Task still carries its task outside the Case; to redraw through both frames with the rest of stage A.
- **S2-#1 The DAQ name control has no menu on the panel** (`P.menuDe` gave none): Change to Indicator and the rest only
  from its diagram terminal. Medium. *Built 2026-11-15, with LabVIEW's rows by kind and the arrow button's list
  (`daq-name-menus.test.mjs`); Change to Indicator / Control and Data Operations work, the rest is greyed with its reason.*
- S2-#4, S2-#6 Deleting a panel object leaves its tunnels and broken wires (Ctrl+B cleans the wires); a Case output
  tunnel is not deleted by selecting it and pressing Delete (a rubber band does it); Remove and Rewire is greyed.
- S2-#9 The Patterns grid shows no number or tooltip, as LabVIEW's (the number was read from the file).
- S2-#11 The cells of 4833 are ~6 px: assigning needs a zoom of the capture to see them.
- S2-#12 Ctrl+A does not select all in a string field of an error cluster on the panel (as #20 in the node's dialog).
- Fine: placing a DAQ Task Name from the palette with its label in edit mode, Create ▸ Indicator on its terminal (wired,
  label in edit mode), a DAQ wire into a Case input tunnel and into the node's `taskID`, Patterns ▸ 4833 on the first
  click with the error terminals moved to 11 and 15 as LabVIEW's rule says, the run results, saving and reopening.

Stage 3, 2026-11-14 ([report](../../labview-captures/reports/2026-11-14-daq-plugin-stage3.md)): Start Task's task routed
through the Case, Stop Task and Clear Task built. The three saved OVIs run as subOVIs against the add-on's `nilvaiu` in
`test/core/daq-plugin-ovis.test.mjs` (an empty task: -200088 for Start and Stop; a created task reaches the library
through Start Task, -200478 with its name, and Clear releases it). Numbered S3-#n.

- **S3-#2 A wire started on a Case input tunnel's inner side towards a terminal outside leaves a stub** instead of making
  the output tunnel; drawn the other way (from the terminal to the tunnel) it works. Nothing tells which. Medium. *Fixed
  2026-11-14:* the wire's 6-px hit zone began at the tunnel's edge, so a press one pixel past the glyph took the wire's
  segment and dragged it (the stub); a border node's faces now reach 3 px towards the wire
  (`editor/src/block-diagram/diagram-view.mjs`, `BORDER_FACE_REACH`; test in `diagram-editing.test.mjs`). The press
  likely landed there because `editor.mjs terms` gave centres 2–7 px off the DOM's (a tooling note).
- S3-#3 A stub left by a failed wire drag stays until Undo.
- **S3-#5 Paste puts panel objects at the click point and leaves them selected**; Delete on one of them deleted all.
  LabVIEW pastes near the original. Medium. *Measured 2026-11-14 ([`editing-fixes`](../../labview-captures/reports/2026-11-14-editing-fixes.md)
  §1): LabVIEW centres the paste on the last click and selects only the copy, so the agent's expectation was wrong;
  Solder centred it on where the pointer last was. Fixed: the last click on the canvas.*
- **S3-#7 An error cluster's source field needs a double click to take text, and Ctrl+A does not select it** (as S2-#12
  and #20: Ctrl+A in text fields is now seen three times). Medium. *2026-11-14: Ctrl+A did select on the panel, but
  Delete did not erase the selection (only Backspace): fixed. In the Call Library Function Node's dialog Ctrl+A did
  nothing: fixed (LabVIEW selects, measured). A single click already types in a source field; the "double click" was a
  click while another field was being typed in, which only confirms it, as LabVIEW does (seen in a video, rule of
  `front-panel.mjs`).*
- S3-#9 The node's 8-px terminals: a right-click missed the terminal and gave the node's menu, which has no Create ▸.
- S3-#11 After Select an OVI…, the subOVI waits for a placing click; its terminals have generic names until hovered.
- S3-#12 The Patterns grid has no tooltip or number, so finding 4833 is by position (LabVIEW's has none either, as seen
  in stage 2). The cells of 4833 are ~6 px.
- S3-#16 A run cannot show whether a node ran when an error passes through (a probe would).
- Fine: the Adapt to Type options (Handles by Value, Pointers to Handles, Array Data Pointer, Interface to Data;
  Handles by Value the default) and the prototype `int32_t DAQDestroyTask110(void *taskRefObjPtr, LStrHandle
  errorInfo);`; Save As to make Stop Task from Start Task; a DAQ wire through a Case's output tunnel in both frames.

Stage 4, 2026-11-14 ([report](../../labview-captures/reports/2026-11-14-daq-plugin-stage4.md)): DAQ Create Virtual
Channel (AI Voltage) built by hand, from Save As of Start Task; run against the add-on's `nilvaiu` with LabVIEW's codes
(-200220 for Dev9/ai0, -200170 for Dev1/ai99) in the editor and in `test/core/daq-plugin-ovis.test.mjs` (Create → Start
→ Stop → Clear without an error). Numbered S4-#n. Measured beside it: the DAQmxName class and its Controls palette are
LabVIEW's own, not the add-on's ([`daqmx-name-origin`](../../labview-captures/reports/2026-11-14-daqmx-name-origin.md)),
so the `daq-name` type stays in the core (DT-076 §5); a DAQ name into a String Handle parameter has a coercion dot in
LabVIEW and passes its name, which Solder already did (`test/core/daq-task-run.test.mjs`).

- **S4-#1 `lvAppRef` cannot be left unwired** (blocking): an unwired Adapt to Type input breaks the OVI, in LabVIEW as in
  Solder ("Contains unwired or bad terminal", measured in [`clfn`](../../labview-captures/reports/2026-11-06-clfn.md)),
  and NI wires a This Application constant there. The agent wired `task in` into it as a stand-in. *Decided the same
  day (DT-090): Solder gets the VI Server Reference constant with This OVI and This Application, and a refnum goes into
  Adapt to Type as the address of its 4 bytes (measured).*
- **S4-#2 No ring with free values** (medium): Text Ring and Menu Ring are "not yet"; an enum's values are sequential.
  `input terminal configuration` (-1, 10083, 10078, 10106, 12529) and `units` (10348, 10065) are I32 controls with the
  default value. Later: the rings (their own step). *Built on 2026-11-15 (DT-091, measured in
  [`rings`](../../labview-captures/reports/2026-11-15-rings.md)): Text Ring, Menu Ring and the Ring Constant with free
  values (`test/core/rings.test.mjs`, `test/editor/rings.test.mjs`).*
- S4-#3 Values typed and saved are lost on reopening; only Make Current Values Default keeps them (as LabVIEW saves
  defaults, unverified here).
- S4-#4 Representation only from the diagram terminal (stage 1 #6).
- S4-#5 A terminal's right half starts a wire: drags must take its left half.
- S4-#6 New controls' terminals land at their panel coordinates, inside the Case.
- S4-#7 A second wire from `task in` made a duplicate tunnel; deleting its wire left a stale DBL tunnel, removed only by
  a rubber band and Delete (stage 2 #6).
- S4-#8 Save As gave `….sdg.sdg`: the GTK dialog selects only the name's stem, so typing the full name over it keeps the
  extension. GTK's behaviour, not Solder's; nothing to fix.
- S4-#9, S4-#10, S4-#11 The 11-parameter node is a tall narrow box with 8-px spacing (#22); deleting nodes leaves stubs
  (Ctrl+B); the node's dialog: End + Backspace in the name fields, dropdown lists drawn partly outside the dialog,
  reconfiguring a node keeps the old slots' wires.
- S4-#12 `task out` carries `_unnamedTask<n>` when the node returned an error; LabVIEW's not measured.
- Fine: the prototype read back exactly as LabVIEW's; DAQ physical channel and scale wires into String Handle
  parameters; the connector 4833 cells; reopening and running again.

Stage 5, 2026-11-14 ([report](../../labview-captures/reports/2026-11-14-daq-plugin-stage5.md)): Create Virtual Channel's
`lvAppRef` rewired to a This Application constant (DT-090, built the same day), and DAQ Create Task built by hand from
Save As of it, with LabVIEW's 4833 cells (measured that day: 1, 2, 4, 5, 7, 11, 15). The whole setup Create Task → Create
Virtual Channel → Start → Stop → Clear runs without an error against the add-on's `nilvaiu`
(`test/core/daq-plugin-ovis.test.mjs`). Numbered S5-#n.

- **S5-#1 The DAQ Task Name constant is hard to reach** (medium; **closed 2026-11-15**): the agent saw Create ▸ Constant
  greyed on a DAQ Task Name control's and indicator's terminals. *Measured the same day
  ([`daqname-menus`](../../labview-captures/reports/2026-11-15-daqname-menus.md) Q3): Create ▸ on a DAQ name's diagram
  terminal has Constant, Control and Indicator enabled in LabVIEW too, and so they are in Solder (`daq-name-controls.test.mjs`
  makes the constant from the indicator's terminal). What LabVIEW does grey is Create ▸ on an unwired Adapt to Type
  parameter of a Call Library Function Node (Constant, Control, Indicator and Channel Writer...; Q4): the greyed rows the
  agent saw were probably those of the node's terminal, and Solder now greys them as LabVIEW does
  (`call-library-terminal-menu.test.mjs`). The constants are in the DAQ palette since stage 9, so the copy and paste
  workaround is no longer needed.*
- S5-#2 Change to Control is greyed on a Round LED, so auto cleanup is a toggle switch; LabVIEW's is a lit LED control.
- S5-#3 Operate ▸ is "not yet"; Make Current Value Default is per control; a click on a Boolean in edit mode toggles it.
- S5-#4, S5-#5 New terminals land inside the Case (S4-#6); a drag from a terminal's arrow moved it instead of wiring.
- S5-#6 (tooling) `editor.mjs terms` centres are up to 9 px off the drawn rows of the node.
- S5-#7 After Save As, deleting the node left tunnels, stubs and old wires; an unused empty string constant stays in
  Create Task's file.
- S5-#8 The node's menu has Create ▸ now (stage 3 #9 is outdated). S5-#9 the GTK Save As is invisible under Xvfb.
- S5-#10..#13 Look: the node's dialog fields; palettes open at the click; overlapping selected wires; Save As leaves
  "Untitled Project 1/My Computer" in the status bar.
- Fine: the OVI Server Reference from Application Control and Link to ▸ This Application on the first try; the
  prototype as LabVIEW's; Boolean To (0,1) into a U8 parameter; reopening and running.

Stage 6, 2026-11-14 ([report](../../labview-captures/reports/2026-11-14-daq-plugin-stage6.md)): DAQ Timing (Sample
Clock) and DAQ Wait Until Done built by hand, and DAQ Stop Task rebuilt. Read from `walk.json` before it: only Create
Task, the Create Channel instances, Start Task and Wait Until Done have a Case on error in; Timing, the triggers, Stop,
Clear and every Read and Write leave it to the node's own error in. Solder's Stop Task had the Case (it was a Save As of
Start Task), so it was rebuilt without it, and Timing was built without it. A finite acquisition (Create Virtual Channel →
Timing at 1 kHz → Start → Wait Until Done → Stop → Clear) runs without an error, and 1 MHz is -200077 at Timing, as
measured (`test/core/daq-plugin-ovis.test.mjs`). Numbered S6-#n.

- **S6-#0 The OVIs without a Case rely on what the node does with an error in**, which was unverified in Solder
  (spec/04: "calls nothing and passes the error"). *Measured the same day
  ([`clfn-error-in`](../../labview-captures/reports/2026-11-14-clfn-error-in.md)): LabVIEW's node does exactly that
  (nothing called, return 0, outputs equal to inputs, the error unchanged; a warning calls), as Solder's did; now
  tested. But NI's Stop Task stops the task even with an error in: its node's error in is left unwired and the panel's
  error in goes to Fill In Error Info. Solder's Stop Task had wired it to the node, so with an error in the task kept
  running (a second Start was -200479). Rewired by hand; Timing keeps its node's error in wired, as NI's
  (measured: with an error in it configures nothing).*
- S6-#1 There is no way to remove a structure and keep its contents (LabVIEW has Remove Case Structure on the border's
  menu, not measured here): the contents were moved out and the Case deleted, and the tunnel wires redone.
- S6-#2, S6-#3 Reconfiguring the node keeps the old slots' wires (S4-#11), so a constant ended on the wrong parameter;
  the dialog's "+" only appends a parameter, and moving one needs the arrow button once per row.
- S6-#6 Typing a label right after dropping a DAQ Terminal control did not take (it did for numerics).
- S6-#7, S6-#8 Numerics arrive as DBL and Representation is only on the diagram terminal (S4-#4); new terminals land
  inside the Case (S4-#6).
- S6-#9 The error cluster's green tick is False and its red cross True: easy to misread.
- **S6-#10 Start Task's and Clear Task's nodes run in the UI thread**; NI's run in any thread (measured, `daq-clfn-api`).
  To fix by hand in the editor.
- S6-#4, S6-#5 tooling notes (window ids after Save As, palette offsets); S6-#11 the narrow 7-parameter node.
- Fine: the prototypes as NI's, an I32 into a U64 parameter, a DAQ Terminal name into a String Handle.

Stage 7, 2026-11-14 ([report](../../labview-captures/reports/2026-11-14-daq-plugin-stage7.md)): Stop Task rewired as
NI's (its node's error in unwired, the panel's error in into Fill In Error Info), so given an error it still stops the
task (`test/core/daq-plugin-ovis.test.mjs`, which failed before with -200479 at a second Start); Start and Clear Task's
nodes moved to any thread (S6-#10). Numbered S7-#n.

- **S7-#2 A failed wire drag gives no feedback** (medium): a drag that starts a few pixels off a terminal's centre, or
  ends off the target's, makes nothing and says nothing; the agent could not tell a lost drag from a wrong target.
- S7-#4 Saving stores the session's window size and the Case's frame shown (layout lines change with no edit).
- S7-#1, S7-#5, S7-#6 tooling: drag from a terminal's centre; the dialog's fixed positions; stepping the Case to reach
  the node.

Stage 8, 2026-11-14 ([report](../../labview-captures/reports/2026-11-14-daq-plugin-stage8.md)): the four analog reads
of doubles built by hand (1Chan 1Samp, 1D 1Chan NSamp, 1D NChan 1Samp, 2D NChan NSamp), without a Case as NI's. Found
before building them, in `walk.json`: NI's array reads leave the node's array input unwired, which Solder refused
("missing a wire"); *fixed: an unwired array goes as an empty one* (`core/model/call-library.mjs`; a test in
`call-library-run.test.mjs` that failed before). Run as LabVIEW measured (`daq-plugin-ovis.test.mjs`): a single read
with no Timing nor Start starts the task itself; a finite acquisition read with -1 gives every sample and a second read is
-200278; two channels give a value each, or a row each. Numbered S8-#n.

- **S8-#5 Nothing flags a node whose function is not the one meant** (medium): a name left from a copied node gave
  another function's prototype, silently; the run's error had an empty source. LabVIEW does not check either (it cannot
  know the library's signature); the prototype line is the only guard.
- **S8-#3 A numeric indicator on the panel has no right-click menu**, though a control has one (medium); S8-#2 a numeric
  on the panel selects only by its border.
- S8-#4 An array indicator is reached only through Data Containers ▸ Array (Change to Indicator, then an element);
  it keeps the name `arr-control_1`; Add Dimension only from the shell's edges.
- S8-#6 In the node's dialog, a click right after × is often lost, so a second × deletes the wrong row.
- S8-#7, S8-#8 Reconfiguring keeps the old slots' wires (S6-#2); dropdowns drawn past the dialog; a new Array starts as
  I32 Array Data Pointer; Dimensions changes only by the spinner.
- S8-#9 Create ▸ on the node has only the All items, so one input's constant comes from the palette.
- S8-#11 Labels are saved with a trailing newline (all OVIs). S8-#1, S8-#10, S8-#12–#14 tooling and earlier notes.

Stage 9, 2026-11-14 ([report](../../labview-captures/reports/2026-11-14-daq-plugin-stage9.md)): DAQ Create Virtual
Channel, DAQ Read and DAQ Timing built by hand as polymorphic OVIs, the selector shown by default as LabVIEW's; placed,
DAQ Read's selector swaps the instance. Then the add-on's palette files, written as data (a palette file is not an OVI):
LabVIEW's 6 × 4 grid with its empty cells, which needed columns, spacers, constants and greyed cells in the palette format
(DT-086 amendment). Numbered S9-#n.

- **S9-#2 Edit Name… appends to the old text** (high): the caret lands at the end and Ctrl+A did not select, so
  retyping a name doubled it. **S9-#3** typing after Enter had committed the dialog removed an instance row (high, cause
  uncertain). To check by hand.
- ~~**S9-#1 A selector name cannot hold a line break** (medium)~~ **Fixed 2026-11-15**: Enter in the Selector Name
  field types a line break, the ring and the list draw the lines (`test/editor/polymorphic-nodes.test.mjs` "a selector
  name with a line break draws on two lines", `test/editor/polymorphic-window.test.mjs` "Enter and Shift+Enter…", "a
  selector name with two lines…"); DAQ Read's selector names are now two lines. Only "Analog DBL\n1Chan 1Samp" is
  measured; the other three follow its pattern (unverified).
- ~~S9 (seen) The selector's dropdown lists the menu names flat~~ **Fixed 2026-11-15**: ":" makes cascading submenus
  in the ring's dropdown and in Select Type ▸, with ticks along the path (`test/editor/polymorphic-nodes.test.mjs`
  "':' in a menu name makes cascading submenus…"). The submenus open on hover at once, not after about 1 s as in
  LabVIEW; the first level is the right-click menus' look (19.3 px rows), not the measured 19 px; both unverified in
  Solder.
- S9-#4 Show Selector by Default starts unticked; S9-#5 added instances go last, Move Up one row per click; S9-#6 the
  list truncates long names; S9-#8 the polymorphic window's File menu positions differ.
- S9-#10 The polymorphic OVIs show the generic polymorphic icon (no icon of their own, as every OVI today).
- The Global Channel constant's hover name ("DAQ Global Channel") is unverified: only the task constant's
  ("DAQmx Task Name") was read in LabVIEW.

Stage 10, 2026-11-14 ([report](../../labview-captures/reports/2026-11-14-daq-plugin-stage10.md)): a whole finite
acquisition built by a user from the DAQ palette only (Create Virtual Channel → Timing → Start → Read 1D → Clear): 100
values, one cycle of a noisy sine of about 4.9 V, as LabVIEW's simulated device gives; Dev9/ai0 is -200220 from Create;
the same after saving and reopening. The palette as seen matches LabVIEW's grid and empty cells. Numbered S10-#n.

- **S10-#1 A DAQ name constant did not keep a typed name** (blocking): Enter left it empty, so the task had no
  channels (-200478). *Fixed the same day:* confirming the edit kept the text only for string and VISA constants
  (`diagram-editing.mjs`, `TEXT_CONSTANTS`; a test in `daq-name-controls.test.mjs` that failed before).
- **S10-#8 The command line does not find the add-on's OVIs** (medium): `cli/solder.mjs run` resolves `<ovilib>` only
  against the repository's `ovi.lib`, not the installed add-ons', as the editor does. *Not reproduced on 2026-11-15: the
  command line reads the installed add-ons as the editor does; the add-on was installed only where the editor run of
  stage 10 looked. Kept by a test (`test/end-to-end/command-line.test.mjs`, which fails without the add-on).*
- S10-#2 A control's typed value is not saved, only its default (as LabVIEW saves defaults, unverified here).
- S10-#3 Deleting a constant left an unselectable broken stub (Undo restored it).
- S10-#4 A double click on the panel's empty space, or on an array's index, makes a free label that then takes the typing.
- S10-#5 Ctrl+A in a panel control's text does not select (as S9-#2), so typing appends.
- S10-#6 An array indicator's index takes no typing nor the wheel, only its arrows: reading 100 values is slow.
- S10-#7 In Run mode a control did not take typing.
- S10-#10..#15 Look: blank icons for Measurement I/O's folder and the two constants; the palette closes after each
  placement; the panel opens scrolled; the error source shows LabVIEW's `<B>` markup (as LabVIEW's indicator does,
  unverified) and is cut; the saved polymorphic node stores `instance: 1, selected: 0`.

Stage 11, 2026-11-15 ([report](../../labview-captures/reports/2026-11-15-daq-plugin-stage11.md)): DAQ Create Virtual
Channel (AI Voltage)'s `input terminal configuration` and `units` rebuilt by hand as I32 Text Rings with NI's items and
defaults (measured that day: NI's are modern Text Rings, I32), on cells 3 and 9; the setup runs without an error
(`test/core/daq-plugin-ovis.test.mjs`). Numbered S11-#n.

- **S11-#3 Edit Items of a ring** (medium) - **fixed 2026-11-15**: Enter made rows and two blank ones counted as a
  duplicate value; values wider than a digit were clipped; the Values cell's hit target was as wide as its digits; the
  wheel did not scroll the list; the first click on an unselected row was lost; a stray click ticked "Allow undefined".
  Now a row made by Enter is a blank edit row until it gets a text or a value (not an item, not saved, not in the
  duplicate check, as the measured blank last row); the Values column is 110 px (column width unmeasured) and its whole
  cell takes the click; the list scrolls by wheel with a thumb and keeps the edited row in view (the enum's too); a click
  on a selected row's text, or typing on it, edits it (unmeasured; the Values cell keeps the measured "first click only
  selects"); only a checkbox's box and label take its click (shared with the enum's). Tests in
  `test/editor/rings.test.mjs` and `test/editor/enum-edit.test.mjs`. Left: the enum's own Values column is still 13 px
  (indices only) and its Enter behaviour is the measured one.
- S11-#1 Replace ▸ is greyed on a numeric control, so a control is changed by adding, deleting and rewiring.
- S11-#2 A click on a numeric's text does not select it for Delete; only its edge does.
- S11-#4 The down arrow of a Text Ring from a value with no item does nothing (LabVIEW's unmeasured) - **fixed
  2026-11-15**: it goes to the first item, unverified in LabVIEW (`test/editor/rings.test.mjs`).
- S11-#5..#12 A label's Enter, the palette at the click, stale tunnels after a delete, terminals placed far right, the
  small connector pane, spec Rule 67, tooling offsets.

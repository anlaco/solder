# Cloning LabVIEW module by module

> Living work plan. It starts on 2026-09-30, when the editor already builds,
> saves, opens and runs an OVI. For what comes next it replaces the roadmap in
> [`00-provisional-plan.md`](../reference/history/00-provisional-plan.md) §7.1, which is now closed.

## 0. How to continue in a new session

When the developer says "keep going":

1. Read this document: §2 (where we are) and §3b (what is next). The execution scheduler
   at the end of the road in §3b (DT-061, DT-063) is done and merged into `main`
   (2026-10-25); continue with **"Then: hardware"** right after it (DT-064, which moved Core 1
   behind it), and keep in mind its list "Pending from the pool of threads". §4 gives the
   detail of each module. Its order was amended on 2026-10-26 (DT-064, "Amendment of
   2026-10-26"). Steps 1 to 5 are done (step 5, the ESP32 DAQ, on 2026-11-05). Step 6, the DAQ layer
   (DT-076), has its stage A done (2026-11-15), built on step **6a, the two doors for libraries** (DT-079): the Call
   Library Function Node and the add-ons folder. "OVI files are `.ovi`" (DT-094) is done (2026-11-16). **DT-093 (2026-11-16)
   closes the hardware stage here**: next is **"The language's everyday types"** below. Its step 1 (the compiler's
   split) and step 2, clusters made by the user (DT-095, DT-098), are done (2026-11-16 and 2026-11-17): **continue with
   step 3, type definitions** (DT-096), measured and its core done on 2026-11-17. **DT-099 (2026-11-17) brings projects first:
   step 2b**, measured and its core done on 2026-11-17, editor stages (a) and (b) done on 2026-11-18. Releases
   0.14.0-beta (2026-11-19) and 0.14.1-beta (2026-11-20) are out. "Diagnose two visual faults" just below is done
   (2026-11-21). Stage (c) of step 2b is done (2026-11-21), stage (d) is done (2026-11-22), and with it step 2b. **Next: the editor stages of type
   definitions (step 3), from part (a1) of stage (a) (DT-104). **Stage (a1), the control editor window, done on 2026-11-22**
   (on `feature/control-editor-window`: the registry's `ENTRY_KINDS.CONTROL` with its own "Control N" count and one 616 × 413
   window cascaded, the page `ventana=control-editor` reading the `.octl` with `controlEditorGraph` and reporting it with
   `controlEditorText`, the toolbar's "Control Type" ring and no Run, and the inventory's `window.control-editor` with the
   measured rows, reports/2026-11-22-control-editor-window.md). **Stage (a2) done for the panel cluster on 2026-11-22**
   (Make Type Def. and Open Type Def.), and (a2b), the Cluster and Numeric constants, the same day. **Next: stage (a3).**
   DAQ's stage B waits for the
   waveform step. After Core 1, everything native, then Core 2 (DT-079 §1).
   **Diagnose two visual faults (asked by the developer on 2026-11-20), diagnosis only, no fix yet.** The developer
   reported two things that do not stop the work but look wrong, and agreed with this rule: a purely cosmetic fault goes
   to a list fixed before each MINOR release; one that may come from the architecture is diagnosed at once, because
   later work builds on it. For each, find the cause (reproduce under Xvfb with the `labview` skill, measure the same
   case in LabVIEW where it applies), say whether it is a detail or a fault of the base, and ask the developer before
   fixing:
   1. **The toolbar disappears while an OVI loads** and the new one takes a moment to show. Suspect: the page repaints
      the whole window (`document.body.innerHTML = ...`), the same pattern that swallowed the tree's `dblclick` in 0.14.1.
      If so, decide whether the windows should update only what changed.
   2. **An indicator wired to a While Loop's `i` counts at an uneven rate**, and sometimes stops for about a second.
      Suspect: how and when the panel receives values from the running code (refresh rate, the main thread busy, garbage
      collection, the pool's messages). Measure LabVIEW's own behavior (an unthrottled loop and one with a Wait) and
      Solder's update path before the waveform charts and DAQ build on it.

   *Diagnosed on 2026-11-21 (reports/2026-11-21-visual-faults-editor.md, -indicator-redraw-labview.md), waiting for the
   developer's decision.* (1) Not the whole-body repaint (OVI windows morph): a window is shown at `load`, before its
   first paint, and is blank for 100–320 ms; that first paint compiles the OVI only to build the error list (≈ 80 of
   140–180 ms). Docked, a new OVI empties the toolbar row and the menu bar for ≈ 700 ms, because the dock shows a null
   model until the page's first paint. (2) The ~1 s stop was not reproduced under Xvfb; LabVIEW redraws ≥ 31 times a
   second, evenly, never stopping ≥ 100 ms. What is a fault of the base: every value message repaints the whole window
   in both windows (FP ≈ 9 ms, 13 ms docked; the diagram 9–39 ms, though nothing on it changes, even hidden); the
   diagram's BroadcastChannel queue has no bound, so a diagram slower than 16 ms falls further behind for ever; docked,
   every paint rebuilds the whole menu model. The uneven count with a Wait (ms) 10 is aliasing of the 16 ms pass.
   *Fixed on 2026-11-21, as the developer asked ("Fix both"; reports/2026-11-21-visual-faults-fixed-editor.md): a Run's
   values are painted once per frame in the Front Panel and not at all in the Block Diagram (`frame-painter.mjs`); a
   page's window is shown after its first paint (`electron/first-paint.mjs`), which no longer compiles; docked, a new
   tab opens behind and the toolbar row keeps the old one until the new page sends its own. Left: docked, a new OVI's
   Block Diagram shows for 11–15 ms before its Front Panel (the main process shows the diagram first).*

   **Release 0.14 (decided by the developer on 2026-11-19).** `main` holds, unreleased: projects (DT-099, core and
   editor stages a1, a2, b), type definitions (DT-096), resizing every control (#21), callers seeing an open subOVI's
   unsaved edits (#20) and Solder's docked view (DT-101, experimental: "un gran avance de marca", the developer); the
   CHANGELOG's "Unreleased" lists them. The developer wants the `comment` field in this release
   too. In this order:
   1. **DT-100 §6, the `comment` field**, built at once: any object of `.ovi`, `.octl`, `.sdp` and `.sdproj` may hold
      `"comment": "<text>"`. The schemas (`docs/schema/qvi`, `octl`, `sdp`, `sdproj` `.schema.json`) allow it
      everywhere; the readers keep it and the writers write it back where it was (`core/model/qvi-format.mjs`,
      `type-definition.mjs`, `polymorphic.mjs`, `project.mjs`); the compiler never reads it. Each format goes to its next
      version (`.ovi`/`.octl` `VERSION` 7 → 8, `POLYMORPHIC_VERSION` and `PROJECT_VERSION` 1 → 2) with its entry in
      `test/end-to-end/format-versions.test.mjs`; older files open unchanged. Verified by a round-trip test per format
      and the compiled module compared with and without comments (DT-100 "How it is verified"). The editor shows
      nothing of it yet: where it shows is decided when each place is built. Run the long property hunt after it.
      *Done on 2026-11-19: `core/model/file-comments.mjs` (places by identity: `name`, `ovi`, a wire's ends) and
      `ovi-comments.mjs` (a node's comments go with the node), `test/end-to-end/comments.test.mjs`; the long hunt (2000
      diagrams) passed.*
   2. **Checks left open on 2026-11-19, in the editor under Xvfb** (`labview` skill):
      editing a subOVI while a caller is running (LabVIEW reserves a running subVI and refuses edits; Solder now
      refreshes callers on every edit, #20: see what happens and match LabVIEW if it breaks); whether a terminal added to
      a subOVI without saving leaves the caller's node when the subOVI is closed with Don't Save; a Save As that wrote
      `sub.ovi.ovi` when `sub.ovi` was typed (`savePathFor` adds no second extension: the GTK dialog's filter is the
      suspect); a subOVI node's terminals named `control_1`/`indicator_1` instead of their labels (compare with what
      LabVIEW shows).
      *Checked on 2026-11-19 (reports/2026-11-19-subovi-checks-0.14-editor.md, -subvi-checks-0.14-labview.md): Solder
      neither fails nor loses anything in the four; fixed, a terminal with no label named `control_1` (LabVIEW shows
      nothing) and, found on the way, the docked toolbar row's connector pane, which assigned no cell. Save As under Xvfb
      wrote `sub2.ovi` (no double extension): tried again on the desktop in step 3. Left for the developer to decide: LabVIEW
      refuses edits to a running subVI, breaks a caller (Bad linkage) when the connector changes unsaved, and offers Defer
      Decision instead of Don't Save while a caller holds the subVI.* *The developer decided the same day (DT-102): the
      reservation and Defer Decision built before 0.14 (tried in the editor under Xvfb); the broken caller after 0.14.*
      *Also before 0.14, asked by the developer on 2026-11-19 ("no he podido añadir OVIs al proyecto"): New ▸ OVI in a project,
      measured (reports/2026-11-19-project-new-vi.md) and tried under Xvfb. Left: Close Project leaves the project's
      OVIs open (LabVIEW closes them, with "Save changes? (Close Project)", Save - All / Don't Save - All); the footer's
      Application Instance is still the greyed sample.*
   3. **Try the package by hand** (DT-057 §7): `npm run dist`, start the AppImage, and walk through what is new:
      create, save and reopen a project and edit its tree, a type definition, resizing controls in Plain and Old School,
      a caller with an open subOVI edited without saving, and the docked view (switch on and off with unsaved edits, tabs,
      Ctrl+E, Ctrl+T, closing a tab with Save / Don't Save / Cancel, and Save, never tried; Getting Started does not come
      back when the view is switched off). The developer also opens it before publishing.
      *Done on 2026-11-19 (labview-captures/reports/2026-11-19-package-0.14.md): under Xvfb projects, resizing in the three
      styles, a caller with an edited subOVI and Defer Decision, Save As and the whole docked view; on the desktop
      maximize, minimize, Exit (0.38 s) docked and floating, Save As through the portal (no `.ovi.ovi`) and Getting
      Started. Fixed: the explorer's File menu, cut off with Exit out of reach, scrolls with the wheel. Type definitions
      have no editor path yet (their editor stages come after the release).*
   4. **Release** as CLAUDE.md "Branches and releases" says: version 0.14.0-beta in `package.json` and the CHANGELOG,
      `npm test`, tag, `npm run dist`, publish as a pre-release with the update files. Tag, push and publish only when
      the developer asks. Then answer and close issues #20 and #21 on GitHub (asking first): both are fixed on `main`.
      *Version 0.14.0-beta set in `package.json` and the CHANGELOG on 2026-11-19, tests green; tag, push, `npm run dist`,
      the pre-release and the issues wait for the developer.*

   *After the release, reported by the developer on 2026-11-20 ("los .ovi no se pueden abrir haciendo doble click en el
   ovi de la estructura del proyecto"): the first part of stage (d) brought forward. A double click on an OVI of the
   tree, or its menu's Open, opens it in the project ("… on P.sdproj/My Computer", s2 Q4); a new OVI not saved yet comes
   forward (`test/editor/project-open-item.test.mjs`). Unverified: what LabVIEW does with a VI already open outside the
   project (Solder brings it forward as it is) and a double click on a document or a folder (nothing here). Tried under
   Xvfb (reports/2026-11-20-project-open-item-editor-try.md), which found a `dblclick` listener never firing on a row the
   first click had repainted: the second click (`event.detail` 2) opens it now. Released as 0.14.1-beta the same day.*

   After the release, also pending: measuring in LabVIEW the controls resized by analogy ("Pending review in LabVIEW:
   resizing controls", in "Cross-cutting" below), and Old School's enum field, 6 px wider than its box (as before).
2. To capture LabVIEW, the method is in
   [`../reference/capturing-labview.md`](../reference/capturing-labview.md):
   `win11 encender`, `tools/vm_control.py foto|clic|arrastrar|tecla|texto`.
   What has not been seen or tried in LabVIEW is not written from memory.
3. This plan is done on `main` (long steps on a short `feature/<name>` branch merged back
   when green), and until 1.0 every beta is released from `main`: a feature raises MINOR, a
   fix raises PATCH (DT-062, which replaced the release branches of DT-057 on 2026-10-23).
   When closing a step: tests green (`npm test`), mark it here with
   the date, update §2, and tick what it brought in [`coverage.md`](coverage.md)
   (then `node scripts/coverage.mjs`). Commit only when asked, without co-authorship.
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
  organizes programs (subOVIs, projects, classes).

## 2. Where we are (2026-10-17, 0.4.0-beta)

*2026-11-22: type definitions' stage (a2) done for the panel cluster: Make Type Def. links it to an untitled "Control N"
kept in memory, Open Type Def. opens its editor, the linked instance's menu, links moved when it is saved. Next: (a2b),
the constants, then (a3).*

*2026-11-22: type definitions' stage (a1), the control editor window, done on `feature/control-editor-window`:
`ENTRY_KINDS.CONTROL` in the registry with its own "Control N" count, one 616 × 413 window cascaded, the page
`ventana=control-editor` over `controlEditorGraph`/`controlEditorText`, the toolbar's "Control Type" ring and no Run, and the
inventory's `window.control-editor` with the measured rows. Next: stage (a2), Make Type Def. and Open Type Def.*

*2026-11-22: projects' stage (d), and step 2b, done: Close Project closes the project's OVIs; Rename... of an OVI item;
the OVI windows' Window and Project menus with Show Project; the Files tab. Next: the editor stages of type definitions.*

*2026-11-21: projects' stage (c): Dependencies read from the items' files, auto-populating folders that show and watch
the disk, Stop Auto-populating and Convert to Auto-populating Folder.... Next: stage (d).*

*2026-11-19: release 0.14's first step: the `comment` any object of Solder's files may hold (DT-100 §6), with `.ovi`/`.octl`
version 8 and `.sdp`/`.sdproj` version 2. Next: the checks left open on subOVIs, in the editor.*

*2026-11-16: DAQ's stage A ready for 0.13.0-beta: the plugin OVIs' Required inputs and rings as NI's, Create ▸
Constant on a subOVI input with the control's class and default, the Polymorphic OVI window's list scrolls, and a whole
acquisition tried by hand from the palette. Next: DAQ's stage B.*

*2026-11-15: DAQ's stage A closed: digital lines (Create Virtual Channel Digital Input and Output, the Bool and U32
reads, the Bool write) and the start triggers (None, Digital Edge) on the simulated devices, on the palette; Delete on a
click-selected terminal and Replace ▸ on panel objects (DT-092). Next: DAQ's stage B.*

*2026-11-15: rings with free values (Text Ring, Menu Ring, Ring Constant; DT-091, `.sdg` version 5), the polymorphic
selector's submenus and two-line names, and the DAQ name controls' panel menus; the DAQ plugin's open findings of 0.12
closed. The same day, DAQ Write: analog output on the simulated devices. Next: the triggers and the Property Nodes.*

*2026-11-07: free labels on the panel and the diagram (DT-085), measured in LabVIEW and done the same day, after a user
found that a double click on an empty spot did nothing (`coverage.md` had them ticked by mistake); the `.sdg` format is
at version 4. Left: selecting the word under a double click (needs a caret in text editing), the Decorations "Label".*

*2026-11-07: VISA opens LAN instruments over VXI-11, `TCPIP::host::INSTR` (DT-084), because a user's OVI needed it.
Pending: measure NI-VISA's TCPIP INSTR session in the VM against a VXI-11 instrument (the points DT-084 marks
unverified).*

*2026-11-05: a classic ESP32 is a DAQ that Solder drives over VISA serial, with an instrument driver and a Crucible
profile of it (plan step 5, repository `esp32-daq`).*

*2026-11-05: Solder has its own library of OVIs, `ovi.lib` (DT-073), and polymorphic OVIs that users can make
themselves (DT-074); connector panes know LabVIEW's 36 patterns (DT-075, `.sdg` version 2); VISA Configure Serial Port
and VISA Bytes at Serial Port are done (plan step 4b).*

**The full circuit works:** an OVI is built, saved to `.qvi`, opened the same way,
and Run compiles it to WebAssembly and executes it **by dataflow, like
LabVIEW** (DT-040): independent branches run at the same time, each indicator is
painted when its data arrives, Abort stops at once and the panel switches to Run
mode. Since 2026-10-01 also **with loops**: While and For are placed, stretched
and wired in the diagram, and the compiler runs them (DT-041).
718 tests green. **The three examples give the same values as in LabVIEW** (2026-10-15). **SubOVIs** work (DT-045): a hierarchy compiles into one module, non-reentrant by default with its state kept between calls and Runs, preallocated clones, two parallel calls of a non-reentrant subOVI each keep their own inputs (bug #30, fixed 2026-10-10), and the editor opens several OVIs with their connector pane. **Enums are editable** (DT-049, 2026-10-14): the items are the enum's type, Edit Items… works on the constant, the control and the indicator with the measured menus, and the frames of an enum Case go by item name. **Unbundle By Name** (DT-050, 2026-10-15) reads elements of a cluster by name, so the status of an error cluster can be read. **OVIs are saved as `.sdg`** (DT-051, 2026-10-15): every Solder extension starts with `sd` (`.sdt` reserved for a future textual language, `.sdproj`, `.sdlib`), and an old `.qvi` still opens. **New OVI, Close and Close All** (spec/05 rules 101–103, 2026-10-15) work as measured, and Solder **starts on LabVIEW's Getting Started window** (DT-052), which comes back when the last OVI closes. **The colors are theme tokens** (DT-056, 2026-10-17): the current look is the Old School theme, unchanged pixel by pixel, and `SOLDER_THEME=solder` shows a first Solder theme. **The Front Panel has panel styles** (DT-058, 2026-10-17, on `feature/html-front-panel`): every control is drawn once, as plain HTML, and each style is a CSS sheet over `plain.css`, the mother template; Old School is one of them, identical pixel by pixel to the old drawing, and `SOLDER_PANEL_STYLE=plain`, `solder` or `solder-night` shows the other styles.

| Piece | Status |
|-------|--------|
| OVI windows (Front Panel, Block Diagram) | Cloned; menus: File (New OVI, Open, Close, Close All, Save, Save As, Exit done) and **Edit** (Undo, Redo, Cut, Copy, Paste, Delete, Select All, Make Current Values Default and Reinitialize Values to Default done; the rest greyed with its reason). Toolbar: Run, Abort and Enter Text done; in Run mode, the LabVIEW toolbar (filled arrow, no editing tools) |
| Functions ▸ Programming palette | Numeric: 32 functions placed and wireable, plus Conversion (13), Data Manipulation (9) and Math & Scientific Constants (17). Boolean: 16. Comparison: 16 of 29 (the twelve comparisons, Select, Max & Min, In Range and Coerce and Not A Number?), with their menus; the rest greyed out. Timing: 3 of 15 (Tick Count (ms), Wait (ms), Wait Until Next ms Multiple). Structures: 4 of 16 (For Loop, While Loop, Case Structure and Flat Sequence Structure), with their placeholders in place. **String: 27 functions and constants done** (with Number/String Conversion and Additional String Functions; the rest greyed out). **Dialog & User Interface: 5 of 23** (Simple Error Handler, Clear Errors, Merge Errors, Error Cluster From Error Code and Error Cluster Constant). The other categories, placeholders |
| Controls ▸ Modern palette | Numeric Control and Numeric Indicator done, **String & Path: String Control and String Indicator (3 greyed out)**, **Ring & Enum: Enum done (control and indicator, with Edit Items…)**, **Data Containers: Error In and Error Out (6 greyed out)**, and Boolean: 10 of its 13 controls (Push Button, Round/Square LED, switches, sliders, OK, Cancel, Stop); Rocker, Vert Rocker and Radio Buttons, placeholders. 19 Numeric controls and 10 folders, placeholders |
| Diagram editing | Place, move, wire (also as a branch from another wire), bends, selection, delete, undo, editable constants, complete Compound Arithmetic, View As Icon, labels. **Structures** (M4, spec/05 Rule 40e): While Loop and For Loop placed with two clicks or by dragging a rectangle, drawn at 1:1 with their "i", condition and "N" terminals, tunnels and shift registers attached to the border; they move with what is inside, stretch by their eight handles, a node dropped inside or outside enters or leaves, a wire from one scope to another creates its tunnels, and their menus (Add Shift Register, Stop if True and Continue if True); Case Structure (Rule 40f: frames, selector, tunnels, menus); **Flat and Stacked Sequence** (Rule 40g): film border at 1:1, frames of their own width, wire between frames through tunnels on the separators, selector and local variables in the Stacked, Add/Delete Frame and Replace |
| Panel editing | Place controls, labels on both canvases, value typed and with the arrows (the current value, apart from the saved default, DT-053), delete synchronized with the diagram. A click on the body of a Boolean triggers it, as in LabVIEW (spec/05 Rule 40c); right-click on a Boolean opens its menu, with Mechanical Action. In Run mode only the controls are triggered |
| Array / Data Containers palette | **Functions ▸ Programming ▸ Array**, captured in full (34 elements in 5 columns, with the context help of each): 17 done (the one-dimensional ones) and the rest greyed out with their reason. **Controls ▸ Modern ▸ Data Containers ▸ Array** done (control and indicator with index and visible elements, editable), array constant in the diagram and indexed tunnels with their menu |
| Types | DBL, SGL, integers from 8 to 64 bits with and without sign, Boolean and **string** (also on the panel: controls and indicators), with coercion (DT-038) and the logical type of Boolean; constants, controls and indicators change representation with the Representation menu. **Arrays of one and two dimensions** (DT-042 d and DT-044: element type plus dimension count, one contiguous block; control, indicator and constant, Add/Remove Dimension; the compiler stops at 2D); clusters, only in memory (DT-042); the **error cluster** (DT-043) with its wire, controls, constant and dialogs in the editor; the **VISA resource name** (DT-066), over TCP sockets and serial ports (DT-070), the **path** and the **file refnum** (DT-067, 2026-10-26 and 2026-10-28), with the text file functions, Get File Size and Delete served by `native/solder-io` |
| `.qvi` | Reading and writing with exact round-trip (`core/model/qvi-format.mjs`) |
| Compiler | Numeric (with Conversion, Data Manipulation, constants, Enum, Ring, Range Limits and Expression Node), Boolean, Comparison and Timing over scalars, numeric and Boolean controls and indicators (`core/compiler/compiler.mjs`). The diagram is split into clumps and runs by dataflow with JSPI (`core/runtime/runtime.mjs`, DT-040). `cli/solder.mjs run|wat|check` |
| Execution | Live indicators, parallel branches, Abort (button and Ctrl+.), Latch When Released (Stop, OK and Cancel) and Run mode in both windows; While and For with shift registers and tunnels (Last Value), on top of the clumps. The scheduler is in the compiled module, over a shared memory, with a deque per thread and work stealing (DT-063 §9, 2026-10-25), a clump that waits saves its state and returns instead of suspending a stack (DT-063 §8, no JSPI), the panel lives in that memory as LabVIEW's transfer buffer (§10), and a Run uses a pool of one thread per logical processor, kept by the editor between Runs (§11) |

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
   LabVIEW**. Where there is doubt (overflows, rounding, edge cases), the same OVI
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
2. **SubOVIs** (R6): connector pane, icon editor and compiled call.
   *Core and editor done on 2026-10-08 (DT-045, spec/04 Rules 19c–19d, spec/05 §12); the other
   35 connector patterns, shared clones and recursion are missing. The icon editor is postponed
   (decided 2026-10-08): every OVI uses the standard subOVI icon.*
3. **What is used every minute in the editor:** Create ▸ Constant / Control /
   Indicator on a terminal (M1) and copy, cut and paste (Edit menu).
   *Done on 2026-10-08 (spec/05 §13, rules 72–77): Create ▸ on a node's terminals and on a wire,
   All Controls and Indicators / All Constants, copy, cut, paste (shared between open OVIs),
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
   shift registers, "i"), breakpoints on structures, stepping into a subOVI, the custom probes, warnings (and the toolbar triangle) and several facts marked unverified.*

*Stage 1 closed on 2026-10-09 with version **0.1.0-alpha** (DT-048).*

### Road to a maintainable version (decided 2026-10-09)

The goal is a version that does what it does reliably and keeps the files it saves, not a complete
LabVIEW: **maintainable does not mean complete**. It stays a `0.x` version, not a 1.0 (decided
2026-10-09). New modules wait; these five steps go first, in order. When they are done, the
**maintainable version** is released as the first `0.N.0-beta` (`0.4.0-beta`, DT-055), followed by one month
of maintenance with fixes only (`0.N.x-beta`).

1. **Broken wires** (DT-046, to be proposed) — `0.2.0-alpha`. A wire may keep one loose end, drawn
   dashed with LabVIEW's red cross, which breaks Run: when a panel control is deleted its wire stays,
   and a caller whose subOVI lost a connector terminal **opens** with those wires broken (today it does
   not open at all: a valid file that cannot be opened is the worst failure for a stable version).
   Edit ▸ Remove Broken Wires (Ctrl+B) clears them. It changes the `.qvi`, so it goes before step 5.
   *Done on 2026-10-09 (DT-046, spec/05 §17 rules 91–95, spec/06 §15): Delete on the diagram and on
   the panel leaves the wires broken (Cut takes them), a caller whose subOVI lost a terminal opens with
   them broken, Ctrl+B, re-wiring a loose end, the drawing, the wire menu and the Error List.*
2. **The Windows installer tested** in the virtual machine: install, open, save, run, uninstall. The
   installers are built on Linux (`npm run dist`, electron-builder) and Windows was never run.
   *Done on 2026-10-09: 0.2.0-alpha tested in the VM, its problems fixed in 0.2.1-alpha (its own icon,
   `Solder.exe`, `.qvi` association, a clean uninstall, Exit, the windows of a new OVI, the two windows
   of an OVI kept in step, a dropped control saved at once, latched Booleans not saved TRUE) and
   0.2.1-alpha tested again (`labview-captures/windows-install-0.2.1*`).*
3. **Real programs written with Solder**, as a user would: two or three complete OVIs (for example a
   measurement loop with a chart, a string protocol with Format/Scan and subOVIs, a state machine with a
   Case and shift registers). Every failure or annoyance found becomes a fix; they are the test of
   whether the maintainable version is ready.
   *Written on 2026-10-09/10 ([`real-programs-0.2.md`](real-programs-0.2.md), `examples/`): Temperature
   Monitor works and matches LabVIEW; Instrument Protocol gives a wrong result (two calls of one
   non-reentrant subOVI mix their inputs); Oven Controller works with I32 states. 36 findings, eight of them
   blockers (New OVI, string selector, array constant type, Build Array, Unbundle, error cluster on the loop
   condition, enum items, shift register menu). Next: the fixes, in the order of §3 of that report, for
   0.3.0-alpha.*
   **Rule decided on 2026-10-10:** nothing else is implemented until the examples in `examples/` behave
   exactly the same in Solder and in LabVIEW. The examples are written as a LabVIEW user would (string
   selector, enum states, Unbundle By Name, no workarounds), with deterministic inputs (no Random Number) so
   their outputs can be compared value by value; LabVIEW's outputs are written down once as the reference and
   a test runs each example against them. Order: (1) the three examples built in LabVIEW and their outputs
   written down, (2) the subOVI fault (#30), (3) only what the examples need, (4) the comparison tests green.
   *(1) done on 2026-10-10: the three examples built in LabVIEW and their outputs written in
   [`examples/README.md`](../../examples/README.md).*
   *(2) done on 2026-10-10: the subOVI fault #30 fixed (a call to a non-reentrant subOVI takes its turn
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
   *New OVI, Close and Close All (#1) done on 2026-10-15 (spec/05 rules 101–103, DT-052): measured in LabVIEW
   ([`2026-10-15-file-close.md`](../../labview-captures/reports/2026-10-15-file-close.md)); Close on the Block Diagram
   only hides it, Close All asks once about the OVI created last with "Apply same action…", and the Untitled number never
   goes back. Closing the last OVI shows the **Getting Started window**, cloned 1:1 with texts of its own
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
   swallows the mousedown before the click-outside rule); the same in OVI Properties, so it is fixed
   for all of them at once (seen 2026-10-14,
   [`2026-10-14-editor-dialog-check.md`](../../labview-captures/reports/2026-10-14-editor-dialog-check.md)).
   *The explanation over a modal dialog done on 2026-10-16: a click anywhere else in Edit Items, Select Item, Chart
   History or OVI Properties closes it, and a click on another greyed part opens that one in its place
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
   `editor/src/panel-styles/old-school.css` over Plain's markup, and the old drawing is deleted. Next: a fixture OVI
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
   *The window's companion `.css` done on 2026-10-17 (DT-058 §9): `<OVI name>.css` next to the `.sdg` styles that
   OVI's panel over the editor's style, is read again whenever it changes on disk, and follows the OVI on Save As;
   checked in the editor ([`2026-10-17-window-style.md`](../../labview-captures/reports/2026-10-17-window-style.md)).
   The project level waits for `.sdproj`. **The window style is provisional and gets no more time** (DT-058,
   priority): the styles used are Old School for development and Solder for the releases. The branch is ready to
   merge into `main` as 0.5.0-beta when the developer decides.*

**Next: the execution scheduler** (DT-061, decided 2026-10-23, amended by DT-063 on 2026-10-24), on a short
`feature/scheduler` branch from `main`: one scheduler per Run is the only thing that resumes a clump, so parallel loops
behave the same on every operating system (issue #1), and it hands ready clumps to a pool of workers over one shared
memory, so a Run uses every core as in LabVIEW (DT-063). In order:
0. Measure LabVIEW's execution systems in the VM (DT-063 §7): threads per execution system, how two loops that only
   compute spread over the cores, a reentrant subOVI called from parallel branches, and the OVI's execution settings.
   *Done on 2026-10-24 and 2026-10-25 (DT-063 "What was measured"): one thread per logical processor per execution
   system and priority; a clump resumes after a Wait on any free thread; loops of different lifetimes do not slow
   each other.*
1. `core/runtime/scheduler.mjs` with its own tests on a simulated clock: the ready queue, the timer queue ordered by
   (deadline, sequence), the inbox, Abort and deadlock as states (DT-061 §1–2, §5, §6), designed for a pool of N
   threads from the start, with N = 1 as the exact-order mode (DT-063 §1, §4).
   *Done on 2026-10-24: `createScheduler` and `createVirtualHost` (a host whose clock jumps to the next deadline), with
   `test/core/scheduler.test.mjs`: dataflow order, yields, timers by (deadline, sequence), the 1000/500 ms interleave,
   one clump at a time with N = 1 and N at once with a pool, the non-reentrant subOVI's lock in arrival order, subplans
   (`join`), answers from outside, Abort and deadlock. Nothing uses it yet: that is step 2.*
2. Every suspending import of `runtime.mjs` parks through it (`ceder`, `esperar`, `esperar_multiplo`, `entrar_subvi`,
   `correr_plan`, `correr_subvi`, the dialogs, `dep.nodo`), with the iteration budget per clump; `planificar` and
   `turn-yielder.mjs` become part of it. The existing tests stay green.
   *Done on 2026-10-24: `ejecutar` runs every clump through `createScheduler` on `createRealHost` (one thread: the
   worker is one thread of the future pool); Wait, Wait Until Next ms Multiple, the yields of a loop (budget per
   clump), subplans and subOVI calls (`join`), the non-reentrant subOVI's turn (`acquire`/`release`), the two error
   dialogs and the debugger's pauses (`waitFor`) all park through it, and Abort is a message to it. An import finds
   its clump with `currentContext()`. Highlight Execution's one clump at a time is the scheduler's
   `oneClumpAtATime`, which lets the clumps of a subplan run while their parent waits for them. `planificar` and
   `turn-yielder.mjs` are gone; issue #1's tests moved to `test/core/scheduler.test.mjs`. 804 tests green.*
3. The worker's panel writes sent at the end of each turn instead of `setTimeout(vaciar)` (DT-061 §4), and the
   editor's `worker.terminate()` when Abort gets no answer.
   *Done on 2026-10-24: the scheduler's `onTurnEnd` (the runtime's `alAcabarTurno`) comes once the clumps a turn
   resumed have parked, and when the Run ends; the worker sends its writes then (`test/core/execution.test.mjs`,
   `test/core/scheduler.test.mjs`). The editor already terminated the worker 500 ms after an unanswered Abort.*
4. The reference traces (DT-061 §8): a few OVIs with parallel waits, the order of resumes they must give, and a test
   that runs them.
   *Done on 2026-10-24: `test/end-to-end/reference-traces.test.mjs` runs OVIs with parallel loops on the virtual clock
   (`ejecutar` takes `host`) and checks every write: the 1000/500 ms loops, issue #1's waits that end together, and
   Wait Until Next ms Multiple against a plain wait, ties going to the wait made first.*
5. Node 26: the command line and `npm test` pass `--experimental-wasm-jspi` only when the running Node needs it
   (DT-061, "What was measured" 1). *Done on 2026-10-23, as a fix for 0.4 (`cli/jspi.mjs`,
   `scripts/run-tests.mjs`): `npm test` and the command line checked on Node 24.19.0, 24.22.1 and 26.12.1.*
6. Stackless clumps (DT-063 §8, decided 2026-10-25): every clump that can park, and every subOVI it calls, saves its
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
   atomics, the lock of non-reentrant subOVIs and globals, COOP/COEP on the window that runs OVIs, and N from what step 0
   measured. The reference traces of step 4 run with N = 1 (exact order) and N > 1 (dataflow constraints and results).
   In five parts, each with its tests green: (1) the values that cross between clumps go from WebAssembly globals to
   cells of the data space; (2) the memory shared, imported and with a maximum, atomics in the encoder, a lock in the
   allocator; (3) the scheduler in the shared memory with work stealing and each worker's loop in WebAssembly,
   `scheduler.mjs` kept as the reference model (with N = 1, the same trace); (4) the panel as a transfer buffer
   (§10); (5) COOP/COEP in Electron, and N equal to the number of logical processors.
   *Parts 1–3 done on 2026-10-25, with COOP/COEP from part 5 (Chromium needs it for a shared memory)* (DT-063 §2, §3,
   §9: `core/compiler/pool-scheduler.mjs`, `test/core/thread-pool.test.mjs`). The runtime runs the module's
   scheduler on one thread, a turn per clump, and the reference traces pass unchanged; real threads are checked by
   the tests. 824 tests green.
   *Part 4 done on 2026-10-25* (DT-063 §10, `core/compiler/panel-memory.mjs`): controls, indicators and charts are
   records in the shared memory, large values under a phase-fair reader-writer lock (decided that day: "the most
   powerful"); the runtime passes over them at each turn. 827 tests green.
   *Part 5 done on 2026-10-25* (DT-063 §11, decided that day: a persistent pool in the editor): every Run of the
   editor runs on a pool of one thread per logical processor, created at the first Run, with `ejecutar` as the
   coordinator; the command line takes `--threads N`. The three examples give LabVIEW's values on one thread and on
   a pool. 840 tests green. **Step 7 is done.** Left for later: the pass over the panel at LabVIEW's pace (16 ms,
   unverified), Synchronous Display and the Value property, Highlight Execution on several threads, and the cost of
   starting Node's workers.
With stackless clumps the Rust host needs no stack switching (DT-061 §7). Measured on 2026-10-25 (DT-063 case 8): a large
array or string read by a local variable while another loop writes it is never torn in LabVIEW, so §10's lock per control stays.

**Then: hardware** (DT-064, decided 2026-10-25), before Core 1. Instruments are simulated with Crucible
(`~/Proyectos/Crucible`, SCPI over TCP today), for the measurements in the VM and for the tests alike:
1. **Instrument I/O with VISA:** first measure in the VM whether NI-VISA is installed and how the VISA palette and
   functions behave against a Crucible instrument on the host (timeouts and their codes, termination characters,
   Bytes at Port); then the resource name control, constant and wire and the VISA functions. How the native I/O
   connects to the editor (DT-039 §5) is discussed with the developer at this step, before writing it.
   *Measured on 2026-10-25: NI-VISA 26.5 is in the VM; the palettes
   ([`2026-10-25-visa-palettes.md`](../../labview-captures/reports/2026-10-25-visa-palettes.md)) and Read over a TCP
   socket against Crucible, termination, timeout and the error and warning codes
   ([`2026-10-25-visa-read-socket.md`](../../labview-captures/reports/2026-10-25-visa-read-socket.md)). Next: the
   native I/O discussion (DT-039 §5), then the resource name control and VISA Open, Write, Read and Close.*
   *Native I/O decided on 2026-10-25 (DT-065), on `feature/visa`: the `solder-io` crate (sessions over TCP sockets,
   the measured attributes and codes) and its N-API addon `solder-io-node`, built by `npm test`. Next: the Run's
   coordinator calls it as an external wait (Node first), then the `utilityProcess` in the editor, then the VISA
   resource name type, control and wire and the four functions in the compiler and the palettes.*
   *External wait and the core of the four functions done on 2026-10-26 (DT-066), on `feature/visa`: the VISA
   resource name type (`visa-resource`), VISA Open, Write, Read and Close in the catalog and the compiler, each an
   external wait that the Run's coordinator answers through the addon, on one thread and on a pool, with LabVIEW's
   measured edges ([`2026-10-26-visa-edges.md`](../../labview-captures/reports/2026-10-26-visa-edges.md): auto-open
   by name, Close of a closed session is a warning); the command line loads the addon. 848 tests green.*
   *The editor's I/O process done on 2026-10-26 (DT-065 §3): a `utilityProcess` started by the first Run with a VISA
   function and kept for the next ones, a `MessagePort` per Run handed to the run worker
   (`core/runtime/io-protocol.mjs`); a crash of it ends only it, and a Run waiting for an instrument then fails.
   Checked in real Electron against Crucible and by `test/end-to-end/io-process.test.mjs`. 854 tests green.
   *The editor done on 2026-10-26 (DT-066): the VISA resource name wire, constant, control, indicator, terminals and
   menus, Controls ▸ Modern ▸ I/O, Functions ▸ Instrument I/O with every measured subpalette (Open, Write, Read and
   Close placed, wired and run; the rest greyed with its reason), the four nodes at their measured terminals. An OVI
   built from the palettes ran in the editor against Crucible with LabVIEW's answer
   ([`2026-10-26-editor-visa-run.md`](../../labview-captures/reports/2026-10-26-editor-visa-run.md)). 890 tests green.
   *The VISA Property Node measured on 2026-10-26 (look, menus, the whole Select Property tree, and the behavior of
   Timeout Value, Termination Character and Termination Character Enable:
   [`2026-10-26-visa-property-node.md`](../../labview-captures/reports/2026-10-26-visa-property-node.md),
   [`-behavior.md`](../../labview-captures/reports/2026-10-26-visa-property-node-behavior.md)). It is the generic
   Property Node of class "Instr", so it waits for step 4 below.*
   **Order amended on 2026-10-26** (DT-064, "Amendment of 2026-10-26"); the steps from here on are:
   1. **Merge `feature/visa` into `main`** (DT-062): VISA over TCP sockets. *Done on 2026-10-26 (fast-forward,
      890 tests green).*
   2. **File I/O:** the Path type (control, constant, wire, Build Path, Strip Path), text and delimited spreadsheet
      files, the file dialogs; binary files later. Measured in LabVIEW first; each function is an external wait served
      by the I/O process (DT-065).
      *Measured on 2026-10-26 ([`file-io-palette`](../../labview-captures/reports/2026-10-26-file-io-palette.md),
      [`path-type`](../../labview-captures/reports/2026-10-26-path-type.md),
      [`file-io-behavior`](../../labview-captures/reports/2026-10-26-file-io-behavior.md)) and decided in DT-067:
      paths as a kind plus components with the host's rules, UTF-8 names, files in `solder-io`.*
      *The core of DT-067 §10 (a) done on 2026-10-26: the `path` type (one handle in memory, components in the
      `.sdg`), `core/model/paths.mjs` with the Windows rules measured, and Build Path, Strip Path, Path To String,
      String To Path, Path Type, Path to Array of Strings, Array of Strings to Path, the three constants, the path
      control and indicator terminals, and Equal?, Not Equal?, Empty String/Path? and Not A Number/Path/Refnum? on
      paths, compiled and run (`test/core/paths.test.mjs`, `test/core/path-functions.test.mjs`). 906 tests green.*
      *The editor's side of (a) done on 2026-10-26 (spec/05 §22 rules 111–112, spec/06 §19): the teal wire, the
      terminals, the three constants, File Path Control and Indicator with their browse button (the system's file
      dialog), Functions ▸ Programming ▸ File I/O laid out as measured with every subpalette (what is done placeable,
      the rest greyed with its reason), the path functions of String ▸ Path/Array/String Conversion, and the measured
      right-click menus. 945 tests green. Not checked by eye yet against LabVIEW; unverified: the function nodes'
      look and terminal positions, the constant's text width, the 32 × 32 terminal's drawing. Next: (b), the file
      refnum and the text file functions.*
      *(b) done on 2026-10-28 in the core and the editor: the `file-refnum` type, Open/Create/Replace File, Close File,
      Write to Text File, Read from Text File (Convert EOL, Read Lines), Get File Size and Delete, with all file
      semantics in `native/solder-io` (`files.rs`) and each function an external wait (`core/runtime/file-io.mjs`);
      measured again for the gaps ([`file-size-delete`](../../labview-captures/reports/2026-10-28-file-size-delete.md),
      [`file-io-gaps`](../../labview-captures/reports/2026-10-28-file-io-gaps.md)). Dialogs answer cancelled until (d)
      (DT-067, amendment of 2026-10-28). 987 tests green. Unverified: the look of the six nodes and of the refnum wire
      (being measured), the refnum control and indicator on the panel (not done), the end of line on Linux. Next:
      (c), the spreadsheet functions.*
      *(c), first half, done on 2026-10-28: Array To Spreadsheet String and Spreadsheet String To Array, measured
      ([`spreadsheet-strings`](../../labview-captures/reports/2026-10-28-spreadsheet-strings.md), which also settles the
      decimal point: always "." with LabVIEW's default), in the core (`core/runtime/spreadsheet.mjs`, spec/04 Rule 21l)
      and in Functions ▸ String with their measured terminals. 1015 tests green.*
      *(c) done on 2026-10-28: Write and Read Delimited Spreadsheet, measured again for the gaps
      ([`delimited-spreadsheet`](../../labview-captures/reports/2026-10-28-delimited-spreadsheet.md)): one external wait each
      (`file_write_spreadsheet`, `file_read_spreadsheet`), `solder-io` gains moving to the end of a file for `append to file?`,
      LabVIEW's error sources through its subVIs, Read's steps of `max characters/row`, and in the editor both nodes with
      their measured terminals and Read's instance ring (spec/05 rule 114). 1027 tests green. Not checked by eye yet against
      LabVIEW: the ring's drawing. Next: (d), the dialogs.*
      *Measured on 2026-10-29 ([`file-dialogs`](../../labview-captures/reports/2026-10-29-file-dialogs.md),
      [`file-dialog-express`](../../labview-captures/reports/2026-10-29-file-dialog-express.md)); (d) split by DT-067's
      amendment of 2026-10-29 into (d1) the functions' dialogs and (d2) File Dialog, the first Express OVI.*
      *(d1) done on 2026-10-29: an unwired path asks the Run's `dialogs` host with LabVIEW's title and mode
      (`core/runtime/file-dialogs.mjs`), the wired prompt as title; op 5 and Delete's confirm ask before replacing or
      deleting; the editor shows the system's own dialogs from Electron's main process, in the last folder chosen
      (`editor/electron/file-dialog-options.mjs`); the command line answers Cancel. Checked in real Electron under Xvfb
      ([`editor-run-dialogs`](../../labview-captures/reports/2026-10-29-editor-run-dialogs.md)). 1039 tests green.
      Departures: Delete picks only files; on Linux the "All Files" filter is not shown; an Abort leaves an open
      dialog on screen, whose answer is then ignored (unverified what LabVIEW does). Next: the DT on Express OVIs,
      measured first, then (d2) File Dialog on it.*
      *Express OVIs measured on 2026-10-29 ([`express-vi-common`](../../labview-captures/reports/2026-10-29-express-vi-common.md))
      and decided in DT-069 (lean: Time Delay, then File Dialog; dynamic data later; reviewed with the community before
      1.0). Next: the core of DT-069 with Time Delay, then the editor's expandable node and dialog, then (d2).*
      *Time Delay done on 2026-10-29 (DT-069, stage A): its runtime measured
      ([`time-delay`](../../labview-captures/reports/2026-10-29-time-delay.md)) and compiled to the scheduler's wait
      (`core/model/express.mjs`, `test/core/express-ovi.test.mjs` on the virtual host); in the editor placed from Timing,
      its configuration dialog on drop, double click and Properties, OK as one "Change Attribute" undo step, the node
      unconfigured and configured with its row, the common Express OVI menu; compared with LabVIEW's captures
      ([`editor-time-delay-compare`](../../labview-captures/reports/2026-10-29-editor-time-delay-compare.md)) and fixed.
      1061 tests green. Not matched: the title bar's icon and the rounded buttons of Windows. Next: stage B (dragging the
      bottom edge, View As Icon, the context help's configuration block), then (d2) File Dialog.*
      *Stage B done on 2026-10-29: rows grown by dragging the bottom edge (one undo step, `rows` in the `.sdg`), View As
      Icon (38 × 38, its own menu, `"view-as-icon": true` for an Express node), compared with LabVIEW
      ([`editor-time-delay-b-compare`](../../labview-captures/reports/2026-10-29-editor-time-delay-b-compare.md)) and
      fixed. 1065 tests green. Left: the context help's "configured as follows" block waits for the Context Help window
      (`configuredAsLines` is ready). Next: (d2) File Dialog.*
      *(d2) File Dialog done on 2026-10-30, which closes File I/O step 2 but binary files: measured
      ([`file-dialog-run`](../../labview-captures/reports/2026-10-29-file-dialog-run.md)), its runtime an external
      wait answered by the system's dialogs (folder, several files, filters, button label, the start folder rules),
      arrays of paths in the runtime and on the panel, its configuration dialog and node in the editor, compared with
      LabVIEW ([`editor-file-dialog-compare`](../../labview-captures/reports/2026-10-29-editor-file-dialog-compare.md))
      and fixed. 1080 tests green. Departures: Folder + New and File or folder use the system's folder picker, not
      LabVIEW's dialog with "Current Folder"; the LLB check box and Use UTF-8 are greyed with their reason. Next: step 3,
      VISA over serial; binary files when a lesson asks for them.*
      *Found on the way, to fix as its own step: an I64 or U64 indicator hands its value to the editor as a JavaScript
      number (`deWasm` in `core/runtime/runtime.mjs`), so beyond 2^53 it shows rounded digits where LabVIEW shows them
      exact; the value inside the OVI is exact.*
   3. **VISA over serial, the transport** (DT-070, amended 2026-10-30): our own serial code in `solder-io`, ASRL
      resources with their table and aliases, a new session's measured settings, and a serial transport in Crucible.
      *Measured on 2026-10-30 with a COM1 added to the VM
      ([`visa-serial-no-port`](../../labview-captures/reports/2026-10-30-visa-serial-no-port.md),
      [`visa-serial-com1`](../../labview-captures/reports/2026-10-30-visa-serial-com1.md)) and decided in DT-070.*
      *Done on 2026-10-30: `solder-io` opens ASRL resources (by number through `visa-ports.conf`, by device path, by
      alias, `COM<n>` on Windows) with termios and Win32 code of its own, the measured session settings and Read's
      stops and codes, shared ports, and the serial attributes the Property Node will write; Crucible serves a bench's
      `tipo: serial` on a real port or a pseudo-terminal. Tried in the VM: Solder's Win32 code and LabVIEW both read
      Crucible's Keithley through COM1. 1084 tests green, and 55 in Rust. Not checked by eye in the editor (the same addon runs in its
      I/O process). Next: step 4, the Property Node.*
   4. **Refnums with classes and the Property Node**, then the Invoke Node, in their own DT: classes Instr (VISA) and
      the panel controls (implicit nodes) from the start.
      *Measured on 2026-10-30 ([`panel-property-node`](../../labview-captures/reports/2026-10-30-panel-property-node.md),
      [`-behavior`](../../labview-captures/reports/2026-10-30-panel-property-node-behavior.md)) and decided in DT-072:
      one node with a class, control references in this step, Value against the panel memory waiting for the drawing,
      the other control properties answered by the editor. Next: stage (a), the catalog of properties and the core.*
      *Stage (a), first half, done on 2026-10-30: `docs/schema/properties.json` (the measured menus of GObject, Control,
      Numeric, Boolean, String, Text and Instr, with the first properties' short names, types and access), the
      `property-node` block with one terminal per row (`core/model/property-node.mjs`), Value typed by the linked
      control, the class, link, rows and Ignore Errors in the `.sdg` (`test/core/property-node.test.mjs`). 1099 tests
      green. Next: running the rows (Value on the panel memory, errors, Instr's waits).*
      *Stage (a) done on 2026-10-30: the node is one external wait (`property_node`, `core/runtime/property-node.mjs`)
      whose rows run top to bottom with the measured error rules; Value reads and writes the panel's record (an
      unwired indicator linked to a node gets one) and a write waits for `alDibujar`; Instr rows are VISA attributes
      of `solder-io` with auto-open; with no window, a panel answers Visible, Disabled, Key Focus and Label.Text
      (`windowlessPanel`). Not yet: Position and Bounds (clusters), a node inside a subOVI, the explicit control
      classes. 1113 tests green. Next: stage (b), the rows the editor's panel answers.*
      *Stage (b) done on 2026-10-30: the run worker asks the window for each panel row and for "drawn" after a Value
      write (`panel` messages), the window answers from `editor/src/front-panel/panel-properties.mjs` and shares the
      run state with the other window; the Front Panel hides an invisible object and its label, greys Disabled 2, and
      a disabled control is not operated; Position and Bounds run as clusters. Next: stage (c), the node in the editor.*
      *Stage (c) done on 2026-10-30: Create ▸ Property Node ▸ on the numeric and Boolean terminals and panel objects and
      Create ▸ Property for Instr Class ▸ on a VISA resource name, both from `properties.json` with its holes greyed; the
      implicit node drawn as measured (8 px cream header, bar, label above, 16 px rows, arrows, width around the centre)
      and the Instr one (18 px header, "Instr"); the header and row menus with Select Property, Change To Write/Read,
      Change All, Add and Remove Element, Link to ▸ Pane ▸, Ignore Errors and Create from a row, each one undo step; VISA
      Property Node in VISA Advanced; a pasted node follows its pasted control (spec/05 rules 115–119, spec/06 §20,
      `editor/src/block-diagram/property-nodes.mjs`). Next: compare it with LabVIEW by eye (stage e), then stage (d).*
      *Compared by eye on 2026-11-03 and corrected (glyphs, width, bar backing, menus that scroll). Stage (d), first
      half, on 2026-11-03: control references measured (`reports/2026-11-03-control-references.md`) and built in the
      editor: Create ▸ Reference makes a control reference constant, its Property for <class> Class ▸ an explicit node,
      Disconnect From Control turns an implicit node explicit (spec/05 rule 120). Next: measure how a node fed by a
      reference runs, then run it; the refnum control and indicator on the panel.*
      *Stage (d) done on 2026-11-03: measured how a node fed by a reference runs
      ([`control-reference-run`](../../labview-captures/reports/2026-11-03-control-reference-run.md),
      [`-errors`](../../labview-captures/reports/2026-11-03-control-reference-errors.md),
      [`-subvi`](../../labview-captures/reports/2026-11-03-control-reference-subvi.md)) and decided the strict refnum with the
      developer (DT-072, amendment of 2026-11-03): a reference is its control's index in the OVI's list, the node runs as
      the implicit one, reference out passes on with an error in, 1055 for a refnum that names no control; the control
      refnum and indicator on the panel from Create ▸ Control/Indicator, through a subOVI's connector
      (`test/core/control-reference-run.test.mjs`). 1152 tests green. Not yet: Link to on a reference, the Refnum palette,
      the refnum's menus, comparing its drawing by eye. Next: stage (e) for the explicit node and the refnum, then DT-070 §7.*
      *Stage (e) for control references on 2026-11-03: compared by eye under Xvfb
      ([`control-reference-solder-compare`](../../labview-captures/reports/2026-11-03-control-reference-solder-compare.md))
      and corrected: the refnum terminal is 38 × 38 with LabVIEW's parts, the Boolean strict node 100 px (spec/06 §20
      said 96), the glyphs redrawn, Create ▸ Control/Indicator work from the reference constant's body. Left: the strict
      nodes are 2–4 px wider by the editor's font; a submenu taller than the window does not scroll. Next: DT-070 §7
      (step 4b).*
   4b. **VISA Configure Serial Port and Bytes at Serial Port** (DT-070 §7): Configure as a polymorphic subOVI of
      Solder's own `vi.lib` built on the Property Node; greyed until then.
      *VISA Bytes at Serial Port done on 2026-11-05: measured
      ([`visa-bytes-at-port`](../../labview-captures/reports/2026-11-05-visa-bytes-at-port.md)), it is an Instr Property
      Node with the one read row "Bytes at Port", 72 × 35, placed from both Serial palettes (`test/editor/property-nodes.test.mjs`,
      `test/core/property-node-run.test.mjs`). Next: measure polymorphic VIs and vi.lib subVIs, then the DTs of `ovi.lib`
      and polymorphic OVIs, which VISA Configure Serial Port waits for.*
      *Measured on 2026-11-05 ([`polymorphic-vi`](../../labview-captures/reports/2026-11-05-polymorphic-vi.md),
      [`vilib-and-type-polymorphic`](../../labview-captures/reports/2026-11-05-vilib-and-type-polymorphic.md)) and
      decided: DT-073 (`ovi.lib`, symbolic `<ovilib>` paths, editable as LabVIEW) and DT-074 (polymorphic OVIs in a
      `.sdp` file, Automatic by the types wired, VISA classes later). Next: build them with VISA Configure Serial Port.*
      *Step 4b done on 2026-11-05 (branch `feature/polymorphic-ovis`): `ovi.lib` with symbolic `<ovilib>` paths (DT-073,
      `test/editor/ovi-lib.test.mjs`); polymorphic OVIs in `.sdp` files with Automatic, Select Type ▸, the selector ring,
      the node menu, File ▸ New... and the Polymorphic OVI window (DT-074, `test/core/polymorphic.test.mjs`,
      `test/editor/polymorphic-nodes.test.mjs`, `test/editor/polymorphic-window.test.mjs`, `test/editor/new-dialog.test.mjs`);
      LabVIEW's 36 connector patterns by their indices, the `.sdg` at version 2 with its migration (DT-075); and VISA
      Configure Serial Port in `ovi.lib/Instr/`, measured
      ([`visa-configure-serial-port`](../../labview-captures/reports/2026-11-05-visa-configure-serial-port.md)), placed from
      both Serial palettes and run against the serial test instrument (`test/core/visa-configure-serial-port.test.mjs`).
      Left: ring controls on the panel (stop bits and flow control are numeric controls), VISA classes, choosing a
      connector pattern, an icon editor (Edit Icon... takes an SVG file), the windows tried only under Xvfb. Next: step 5.*
   5. **A classic ESP32 as a DAQ by SCPI:** its command set written down with the developer, who writes the
      firmware (in parallel from step 3), and first served by a Crucible profile of it.
      *Done on 2026-11-05, in its own repository `~/Proyectos/esp32-daq` (outside Solder, as a maker's instrument):
      the SCPI command set, draft 0.1 in its `docs/scpi-commands.md`; the ESP-IDF firmware with a portable SCPI core
      tested on the host, run on an ESP32-D0WD-V3 board over USB serial (Wi-Fi/TCP untried); a Crucible profile and a
      bench that serves it on a pseudo-terminal (`crucible/`: no channel lists, digital lines or buffered acquisition,
      which a profile cannot describe); an instrument driver for Solder (`solder/ESP32 DAQ/`: Initialize, Set LED,
      Read Voltage, Set Output Voltage, Close, with the 4-2-2-4 connector), tested by Solder's runtime against that
      profile (`solder/test/driver.test.mjs`) and tried on the board; and `ESP32 LED.sdg`, a button that switches the
      board's LED. Learned: opening the port from Solder resets the board through DTR/RTS (Initialize waits 1.5 s
      and drops the boot text). Left: the command set to review with the developer; `instr.lib`, so that instrument
      drivers show in Instrument I/O ▸ Instrument Drivers (measure LabVIEW, then a DT); what NI-VISA does with DTR and
      RTS on opening a serial port; `solder run` prints a string with commas wrong (it showed `1.0` for the whole
      `*IDN?` reply); the width of a panel control is not saved (a VISA resource control cuts its text); every subOVI
      shows the same icon until the icon editor. Next: step 6.*
   6. **A DAQmx-like layer** over the ESP32, with its own DT after measuring DAQmx with a simulated NI device.
      *Decided on 2026-11-05 in [DT-076](05-decisions.md#dt-076): the layer is called **DAQ**, clones DAQmx's API one
      to one (so that NI's VIs can be opened some day) and runs on a native engine in `native/solder-io` over drivers
      that can be swapped: SCPI over VISA first, simulated by Crucible, NI-DAQmx when installed; openDAQ and Comedi as
      ideas. The notes of 2026-11-03 follow.*
      *Measured on 2026-11-06 with NI-DAQmx 2026 Q4 in the VM (a LabVIEW add-on in `C:\Program Files\NI\LVAddons\nidaqmx`)
      and simulated Dev1 = USB-6001 and Dev2 = PCIe-6361: the palette and its direct subpalettes
      ([`daqmx-palette`](../../labview-captures/reports/2026-11-06-daqmx-palette.md)) and the basic flow, all on connector
      4833 ([`daqmx-create-channel`](../../labview-captures/reports/2026-11-06-daqmx-create-channel.md),
      [`daqmx-timing-trigger`](../../labview-captures/reports/2026-11-06-daqmx-timing-trigger.md),
      [`daqmx-read-write`](../../labview-captures/reports/2026-11-06-daqmx-read-write.md)): instances, terminals, defaults,
      errors and the simulated signal. Details decided the same day (DT-076, amendment of 2026-11-06: one `daq-name`
      type with kinds, the task among them, as measured the same day; the engine and its simulated driver in `solder-io`;
      stage A). The same day DT-079 made the nodes OVIs that call a compiled `solder-daq` through a Call Library Function
      Node, so DAQ waits for step 6a.*
      *DAQ, stage A, slice 1 built on 2026-11-08 on `feature/daq` (DT-087): `native/solder-daq`, the engine apart from any
      facade, with the analog-input path (tasks, channels, Timing, Start, Stop, Clear, Wait Until Done, Read) over the
      simulated devices and a virtual clock, 14 tests. DT-087: the VIs call `nilvaiu.dll`, not `nicaiu.dll` (20 functions
      for stage A, measured), and the driver imitates it. Next: the node with LabVIEW's handles (measure first), the
      facade, the plugin's OVIs built in the editor as a user, the palette and the ESP32.*
      *DAQ, stage A, slice 2 (DT-088) on `feature/daq`: the Call Library Function Node follows LabVIEW's string and array
      formats (prototypes and dialog, measured) and passes String Handle and Array Handle at run time (`native/solder-io/src/handles.rs`,
      a library compiled by the tests). Found on the way: a 2D array parameter of the node refused a 2D wire (fixed).
      2c, the memory functions under LabVIEW's names, built on Linux on 2026-11-08 (`native/solder-memory-bridge`, loaded
      with `RTLD_GLOBAL`); measured the same day that on Windows a LabVIEW DLL looks them up in `lvrt.dll` at run time.
      On Windows the bridge is `lvrt.dll` (decided the same day), and a library linked with LabVIEW's own `labview.lib`
      found its functions there in the VM. Array elements are now aligned as `extcode.h` lays them on 64 bits (fixed).
      The Pascal string measured and built on 2026-11-12 (DT-088 §7: always 256 bytes, so a library cannot overrun it).
      Found on the way: `scripts/build-native.mjs` built nothing on Windows (fixed). The pointers to handles measured and
      built the same day (DT-088 §8): an empty value is a null handle, the library may replace it or leave it null, an
      address that is not a handle gives 1097. Every string and array format of the node now runs. Next: the facade, the
      plugin's OVIs built in the editor as a user, the palette and the ESP32.*
      *DAQ, stage A, slice 3 (DT-087, amendment of 2026-11-13) on `feature/daq`: measured the same day how a task travels
      ([`daq-taskid`](../../labview-captures/reports/2026-11-13-daq-taskid.md),
      [`daq-create-task`](../../labview-captures/reports/2026-11-13-daq-create-task.md)): Create writes the address of a
      task record LabVIEW keeps, and `taskID` is the address of the driver's own task object. Built the facade,
      `native/nilvaiu` (Solder's `nilvaiu`, its 20 exports; the analog-input path works, the rest answers -1, "not built in
      Solder yet"), the task records in the I/O process (`native/solder-io/src/task_records.rs`, offered through the memory
      bridge, version 2), and the engine's waits made outside its lock; 9 tests through `LibraryCaller`. -200088 and
      -200478 are now measured. Left: the Windows build of `nilvaiu` (its `lvrt.dll` imports) in the VM. Next: the
      `daq-name` type in the core (a task wire passes the record to an Adapt to Type parameter and the task object to a
      `uintptr_t` one), packaging `nilvaiu` in the DAQ add-on and loading it by its full path, then the plugin's OVIs built
      in the editor as a user, the palette and the ESP32.*
      *DAQ, stage A, slice 4 (DT-087 §7, decided 2026-11-13) on `feature/daq`: the `daq-name` type in the core
      (`core/model/daq-name.mjs`), one type with LabVIEW's kinds, purple and zigzag as measured; a task is laid out as
      `{ name, number, record }`, the other kinds as strings; every kind coerces to a string. The DAQ name constant, drawn
      as the VISA one. The Call Library Function Node passes a task wire as LabVIEW does: to Adapt to Type (Handles by
      Value) a cell with the record, answered by the I/O with the task it then holds; to a pointer-sized integer the task
      object (`native/solder-io/src/task_records.rs`, `node`). An OVI creates a task in Solder's `nilvaiu`, starts it and
      destroys it through the wire (`test/core/daq-task-run.test.mjs`). Not built: a string into a task (LabVIEW looks
      it up in MAX), the constant's dropdown, menus and name filter, the task control and indicator, Adapt to Type for
      anything but a task, and releasing a task when its top-level OVI stops. Left: the Windows build of `nilvaiu`. Next:
      packaging `nilvaiu` in the DAQ add-on and loading it by its full path, then the plugin's OVIs built in the editor as
      a user, the palette and the ESP32.*
      *DAQ, stage A, slice 5 (DT-087 §8, decided 2026-11-13) on `feature/daq`: the DAQ add-on's source in `addons/daq/`
      and `addons/daq-<os>-<arch>/`, with `nilvaiu` built into the platform part's `resource/` by
      `scripts/build-native.mjs`. A node naming a library without a folder (`nilvaiu.*`, as NI's VIs) loads the first
      add-on's copy by its full path (`core/model/addons.mjs`, `editor/electron/installed-addons.mjs`), in the editor's
      I/O process and on the command line; with none, the system searches as before. Found on the way: the façade's tests
      dropped their library after each call and so unloaded its tasks, failing at random (fixed in the tests; the I/O
      process always kept one). The Windows build checked in the VM the same day: `nilvaiu.dll` builds with its `lvrt.dll`
      imports, the façade's tests and the OVI that loads it from the add-on pass, and `npm test` is green there (fixed: the
      handle tests now link their library with `lvrt` and run on Windows, two tests expected `/` in paths, and the I/O
      process's Electron check imported its modules by a Windows path and hung). Left: packing the add-on for download. Next: the
      plugin's OVIs built in the editor as a user, the palette and the ESP32.*
      *DAQ, the plugin's OVIs, stage 1 (DT-087, amendment of 2026-11-13: Solder's own diagram, drawn by hand in the shape
      of LabVIEW's) on `feature/daq`: DAQ Fill In Error Info works; DAQ Start Task has its diagram but U64 stand-ins for
      the task and pattern 4815, in `addons/daq/1/ovi.lib/DAQ/`. 29 findings in
      [`daq-plugin-findings.md`](daq-plugin-findings.md); blocking: the connector pattern cannot be changed (#8) and
      there is no DAQ task control, indicator or reachable constant (#16); lost: a constant's U32 is saved as I32 (#24).
      Next: fix the blocking and lost findings, then rebuild Start Task and go on with the rest of stage A.*
      *The same day: #16 built (DAQ name controls and indicators, Create ▸ on DAQ terminals reaches the constant); #8
      fixed for Patterns ▸ after measuring LabVIEW ([`connector-pattern-change`](../../labview-captures/reports/2026-11-13-connector-pattern-change.md),
      DT-075 amendment: terminals move to the nearest cell); #24 not reproduced (a missed click). Next: rebuild DAQ Start
      Task by hand with its task terminals and 4833, run it against the add-on's `nilvaiu`, then the rest of stage A.*
      *Stage 2 the same day: DAQ Start Task rebuilt by hand with the DAQ task control and indicator and 4833, run against
      the add-on's `nilvaiu` (empty task: -200088 `<append>`; an incoming error passes through). Found and fixed: a Case
      output tunnel refused DAQ names, VISA names and arrays. Left: the DAQ control's panel menu, redrawing the task
      through the Case. Next: the rest of stage A (Create Task, Create Virtual Channel, Timing, Read, Stop, Clear, Wait
      Until Done), one family per stage, and the DAQ palette (`daq.json`).*
      *Stage 3 on 2026-11-14: Start Task's task through the Case, Stop Task and Clear Task built by hand; the three run as
      subOVIs against the add-on's `nilvaiu` (`test/core/daq-plugin-ovis.test.mjs`). Findings S3-#n in
      `daq-plugin-findings.md` (Ctrl+A in text fields, seen three times; paste position; wire direction from a tunnel).
      Next: Create Task and Create Virtual Channel (AI Voltage), which need `lvAppReference`.*
      *Fixes the same day, measured in LabVIEW first ([`editing-fixes`](../../labview-captures/reports/2026-11-14-editing-fixes.md)):
      Ctrl+A in the node's dialog and Delete on a selected text; paste centred on the last click (LabVIEW's rule, not
      the pointer); a press just past a wired tunnel starts a wire. Next: Create Task and Create Virtual Channel.*
      *Stages 4 and 5 on 2026-11-14: DAQ Create Virtual Channel (AI Voltage) and DAQ Create Task built by hand
      ([`stage4`](../../labview-captures/reports/2026-11-14-daq-plugin-stage4.md),
      [`stage5`](../../labview-captures/reports/2026-11-14-daq-plugin-stage5.md)); the whole setup Create Task → Create
      Virtual Channel → Start → Stop → Clear runs against the add-on's `nilvaiu` with LabVIEW's codes
      (`test/core/daq-plugin-ovis.test.mjs`). `lvAppReference` could not stay unwired (LabVIEW breaks an unwired Adapt to
      Type too), so the OVI Server Reference constant was measured and built, This OVI and This Application only, with
      the Application Control palette's layout (DT-090). Measured beside it: the DAQmxName class and its Controls palette
      are LabVIEW's, not the add-on's ([`daqmx-name-origin`](../../labview-captures/reports/2026-11-14-daqmx-name-origin.md)),
      so `daq-name` stays in the core. Findings S4-#n, S5-#n; the rings with free values (S4-#2) and the DAQ constants'
      palette (S5-#1) are open. Next: Timing, Read and Wait Until Done, then the DAQ palette (`daq.json`). `feature/daq` is
      merged into `main` once those are done and a whole acquisition is tried by hand (the developer, 2026-11-14), not before.*
      *Stages 6 and 7 the same day ([`stage6`](../../labview-captures/reports/2026-11-14-daq-plugin-stage6.md),
      [`stage7`](../../labview-captures/reports/2026-11-14-daq-plugin-stage7.md)): DAQ Timing (Sample Clock) and DAQ Wait
      Until Done built by hand; a finite acquisition (Create Virtual Channel → Timing at 1 kHz → Start → Wait Until Done →
      Stop → Clear) runs, and 1 MHz is -200077 at Timing. Read from `walk.json`: only the create OVIs, Start Task and
      Wait Until Done have a Case on error in; the others leave it to the node. Measured what the node does with an error
      in ([`clfn-error-in`](../../labview-captures/reports/2026-11-14-clfn-error-in.md)): it calls nothing, returns 0 and
      passes its inputs, as Solder's did (now tested, spec/04 amended); but NI's Stop Task leaves its node's error in
      unwired and so stops the task anyway: Solder's was rewired to match (a test that failed before). Start and Clear
      now run in any thread, as NI's. Next: the four analog reads of doubles, then the DAQ palette (`daq.json`).*
      *Stage 8 the same day ([`stage8`](../../labview-captures/reports/2026-11-14-daq-plugin-stage8.md)): the four
      analog reads of doubles built by hand, without a Case as NI's; they run as LabVIEW measured (a lone read starts the
      task, a finite read of -1 gives every sample, a second is -200278, two channels give a value or a row each). Fixed
      on the way: an unwired array parameter broke the node, where NI's reads leave theirs unwired. Next: the DAQ palette
      (`daq.json`), then a whole acquisition tried by hand, then the merge into `main`.*
      *Stage 9 and the palette the same day ([`stage9`](../../labview-captures/reports/2026-11-14-daq-plugin-stage9.md)):
      DAQ Create Virtual Channel, DAQ Read and DAQ Timing built by hand as polymorphic OVIs; the add-on's palette files
      (`addons/daq/1/menus/`) give Measurement I/O ▸ DAQ - Data Acquisition with LabVIEW's 6 × 4 grid, its empty cells,
      the two DAQ name constants and the rest greyed (DT-086 amendment: columns, spacers, blocks, `missing`). Next: a
      whole acquisition tried by hand from the palette, then the merge into `main`.*
      *Stage 10 the same day ([`stage10`](../../labview-captures/reports/2026-11-14-daq-plugin-stage10.md)): a whole
      finite acquisition built by a user from the DAQ palette alone runs (100 values, one cycle of the simulated sine;
      Dev9/ai0 is -200220), after fixing a DAQ name constant that lost its typed name (S10-#1). Open, not blocking: the
      command line does not find the add-on's OVIs (S10-#8), the rings, the selector's submenus and line breaks, Write,
      triggers and the Property Nodes. Next: the merge of `feature/daq` into `main` (asked of the developer).*
      *Merged into `main` and released as 0.12.0-beta on 2026-11-14, the DAQ add-on as a download of its own per platform
      (DT-081 amendment; `scripts/pack-addons.mjs`), its Windows `nilvaiu.dll` and the I/O addon built in the VM
      ([`windows-build-0.12`](../../labview-captures/reports/2026-11-14-windows-build-0.12.md)). Next: the open findings
      above, then Write, the triggers and the rings.*
      *The open findings done on 2026-11-15, each measured in LabVIEW first: rings with free values (DT-091, `.sdg`
      version 5; [`rings`](../../labview-captures/reports/2026-11-15-rings.md)), and Create Virtual Channel's two I32
      stand-ins rebuilt by hand as NI's I32 Text Rings ([`stage11`](../../labview-captures/reports/2026-11-15-daq-plugin-stage11.md));
      the selector's ':' submenus and two-line names ([`poly-selector`](../../labview-captures/reports/2026-11-15-poly-selector.md),
      DT-074 amendment); the DAQ name controls' panel menus and arrow list, and Create ▸ on a Call Library Function
      Node's parameter ([`daqname-menus`](../../labview-captures/reports/2026-11-15-daqname-menus.md), closing S5-#1);
      S10-#8 not reproduced and kept by a test. Next: DAQ Write, the triggers and the Property Nodes.*
      *DAQ Write the same day: analog output measured on both simulated devices
      ([`daqmx-ao`](../../labview-captures/reports/2026-11-15-daqmx-ao.md)) and built in the engine (`native/solder-daq`,
      split into `engine`, `input` and `output`) and in `nilvaiu`; Create Virtual Channel (AO Voltage) and the three DBL
      writes built by hand in a polymorphic DAQ Write on the palette ([`stage12`](../../labview-captures/reports/2026-11-15-daq-plugin-stage12.md),
      [`stage13`](../../labview-captures/reports/2026-11-15-daq-plugin-stage13.md)). Next: the triggers, then the Property
      Nodes; the Windows `nilvaiu.dll` is rebuilt in the VM at the next release.*
      *Stage A closed on 2026-11-15 (DT-076 §10): the digital lines and the start triggers measured on both simulated
      devices ([`daqmx-dio`](../../labview-captures/reports/2026-11-15-daqmx-dio.md),
      [`daqmx-trigger`](../../labview-captures/reports/2026-11-15-daqmx-trigger.md),
      [`daq-poly-names`](../../labview-captures/reports/2026-11-15-daq-poly-names.md)) and built in the engine
      (`native/solder-daq`: `digital`, `digital_io`, `trigger`; ports, PFI lines and digital clocks as device data) and in
      `nilvaiu` (`unbuilt.rs` is gone: every stage A function runs). Create Virtual Channel (Digital Input, Digital
      Output), the digital Bool and U32 reads, the digital Bool write and a polymorphic DAQ Trigger (Start None, Start
      Digital Edge) built by hand ([`stage14`](../../labview-captures/reports/2026-11-15-daq-plugin-stage14.md),
      [`stage15`](../../labview-captures/reports/2026-11-15-daq-plugin-stage15.md),
      [`stage16`](../../labview-captures/reports/2026-11-15-daq-plugin-stage16.md)); DAQ Trigger is no longer greyed on
      the palette. Then the editing findings that most got in the way, measured first
      ([`delete-replace`](../../labview-captures/reports/2026-11-15-delete-replace.md),
      [`terminal-hot-zones`](../../labview-captures/reports/2026-11-15-terminal-hot-zones.md)): Delete on a terminal
      selected by a click (S13-#3), the input tunnel's wire to a deleted node (S13-#4; the rest, and S11-#7, as LabVIEW),
      Replace ▸ on panel objects (S11-#1, DT-092).*
      *2026-11-16, closing stage A for 0.13.0-beta: S15-#1 (the Polymorphic OVI window's list scrolls), S14-#13 (every
      plugin OVI weighs its inputs as NI's, measured over VI Server,
      [`daqmx-weights`](../../labview-captures/reports/2026-11-15-daqmx-weights.md); the digital Create Virtual Channels
      now pass the extended error text on), S16-#9 (Timing's sample mode and active edge are I32 Text Rings), S15-#2,
      S14-#2, S16-#2 and the ring's terminal after Replace, measured in
      [`editing-small`](../../labview-captures/reports/2026-11-15-editing-small.md) and
      [`constant-wiring-zone`](../../labview-captures/reports/2026-11-16-constant-wiring-zone.md). A whole acquisition
      tried by hand from the palette ([`daq-acquisition`](../../labview-captures/reports/2026-11-16-daq-acquisition.md)):
      analog in and out, a digital line written and read, a start trigger, all without an error once Create ▸ Constant on
      a subOVI input took the control's class and default ([`create-constant`](../../labview-captures/reports/2026-11-16-create-constant.md)).
      Left for stage B: a hint when no add-on is installed (A-#2) and the findings marked so in
      [`daq-plugin-findings.md`](daq-plugin-findings.md). Next: stage B, from the waveform and timestamp types (DT-076 §10).*
   6a. **The two doors for libraries** (DT-079 §3): the Call Library Function Node (how an OVI calls compiled code when
      everything compiles to WebAssembly) and an add-ons folder like `LVAddons` (a library's OVIs, palette files, help and
      compiled code, installed as a package). Each is measured in LabVIEW first and decided in its own DT; then DAQ's
      stage A is built on them as the first library.
      *The Call Library Function Node measured on 2026-11-06
      ([`clfn`](../../labview-captures/reports/2026-11-06-clfn.md), [`clfn-run`](../../labview-captures/reports/2026-11-06-clfn-run.md))
      and decided in DT-080: LabVIEW's node and dialog, native libraries called by the I/O process, `.wasm` modules in the Run.*
      *The add-ons folder measured the same day ([`addons`](../../labview-captures/reports/2026-11-06-addons.md)) and decided
      in DT-081. Next, to build: the Call Library Function Node (core and native calls, then the editor; `.wasm` may wait
      until after DAQ), the add-ons folder, then DAQ's stage A as the first add-on.*
      *The Call Library Function Node built on 2026-11-06 (branch `feature/clfn`): the core and its native calls
      (`native/solder-io/src/library.rs`, libffi; Linux and Windows), the external wait, error 1097 when the I/O process
      ends, and in the editor Functions ▸ Connectivity, the node, its menu and its dialog (spec/04 Rule 21m, spec/05 §24
      rules 126–129, spec/06 §21). Left: comparing it by eye with LabVIEW; `.wasm` modules; a library named in the dialog
      that cannot load breaks the OVI in LabVIEW (a run-time 7 in Solder); the error in's behaviour; the Libraries &
      Executables subpalette is narrower than the measured 166 px. Next: the add-ons folder.*
      *The add-ons folder, first part, built on 2026-11-07 (DT-081 §1 to §4): the manifest, the two folders read at
      start-up and `<ovilib>` paths over ovi.lib and each add-on's `ovi.lib/` (`core/model/addons.mjs`,
      `editor/electron/installed-addons.mjs`). Left: the add-ons' palettes, then DAQ's stage A as the first add-on.*
      *Palettes decided on 2026-11-08 (DT-086), in two steps: (1) palettes read from JSON files that reproduce LabVIEW's
      `.mnu` structure, add-ons first (`.mnu` reader later); (2) palettes that show only what the files name, with no greyed
      entries, as LabVIEW's. Measured in [`mnu-format`](../../labview-captures/reports/2026-11-08-mnu-format.md).*
      *Step 1 built on 2026-11-08 (`core/model/palette.mjs`, `editor/electron/installed-addons.mjs`): Measurement I/O names
      `Categories/Measurement/daq.json` (`menu` in the inventory) and an add-on that brings it fills the palette. Left:
      the other hooks (FPGA, the entries of `root.mnu`), spacers, the `.mnu` reader, then step 2 (nothing greyed), which
      touches every palette and deserves its own plan; then DAQ's stage A as the first add-on.*
      *Open before step 5 (talked over with the developer on 2026-11-03, nothing decided): **what Solder uses instead
      of DAQmx**, its own name (DAQmx and NI-DAQ are NI's trademarks, as OVI stands for VI, DT-071) and its approach.
      Ideas: DAQmx's programming model (tasks, named channels, hardware timing, triggers, waveforms) over engines
      that can be swapped in `native/solder-io`: SCPI over VISA for our ESP32 and GateMate first, NI's NI-DAQmx C
      library only when the user installs NI's driver (as Python's `nidaqmx` does), Comedi maybe never. Copy the
      model, never NI's code, icons or texts; read the driver's licence before an NI engine. Step 5 may start with
      an instrument driver (subOVIs in `ovi.lib` over VISA). The ESP32 speaks SCPI for control and IEEE 488.2 binary
      blocks for data, read in blocks, with a binary streaming mode only if a measured need appears.*
   7. **The rest of OVI Server** (Open OVI Reference, the OVI and Application classes).

   Left over from VISA, to take up when they fit: finding VISA resources (the dropdown, Select Item, VISA Find
   Resource); the constant's text width (LabVIEW's font is not identified); greyed menu rows show no reason on hover
   (every menu of the editor). *Packaging the addon done in 0.7.0-beta (2026-10-28): one per platform, Windows'
   built in the Windows virtual machine (`scripts/build-native.mjs`).*

**OVI files are `.ovi`** (DT-094, decided on 2026-11-16). One step, on `main`. *Done on 2026-11-16; the Windows
installer's association is unverified until it is tried in the virtual machine. At the release, the DAQ add-on's
`MinimumSupportedSolderVersion` is raised to that version, the first that opens `.ovi`.*
1. `editor/src/common/ovi-paths.mjs`: `.ovi` is the extension Save As writes; `.sdg` and `.qvi` still name an OVI file,
   open and keep their names on Ctrl+S.
2. The subOVI lookup of DT-094 §3: a callee named with one of the three extensions that is not found is looked for
   with the other two (core and editor alike), with its test.
3. Rename what Solder ships (`ovi.lib/`, `addons/` and their palette files, `examples/`) and the subOVI paths inside;
   `cli/solder.mjs`'s usage; `package.json`'s file associations (`.ovi`, `.sdg`, `.qvi`, named "Solder OVI").
4. The living documentation: CLAUDE.md, README, `docs/README.md`, `spec/`, the Getting Started pages, this plan.
5. The CHANGELOG's "Unreleased": a feature, so the next release raises MINOR.

**The language's everyday types** (DT-093, decided on 2026-11-16). The hardware stage closes with DAQ's stage A; fixes
to it go on, new fronts wait for step 6.
1. **Split the compiler** (DT-089, brought forward by DT-093 §2): `core/compiler/compiler.mjs` into modules of one
   responsibility, moving code without changing what it emits (the `.wat` of the examples compared before and after).
   Try `tsc --checkJs` over `core/` in the same step; keep it only if it costs little.
   *Started on 2026-11-16, moving code without changing what it emits (every OVI of the repository, 51 files of
   `examples/`, `ovi.lib/`, `addons/` and `test/fixtures/`, compiled with `cli/solder.mjs wat` before and after:
   identical), with the names moved rewritten in English. Out so far: `instructions.mjs`, `wasm-types.mjs`,
   `host-imports.mjs`, `runtime-functions.mjs`, `memory-ops.mjs`, `panel-data.mjs`, `constants.mjs` (`constantOf`, the
   zero cluster, `ERROR_FIELDS`) and the families in `nodes/` (data manipulation, strings, Format/Scan and their
   `host-rows.mjs`, files, VISA, timing, Expression Node, Property Node, Call Library, arithmetic and comparison,
   arrays), `array-rows.mjs` (a 2D array's rows through an indexed tunnel), `subovi-calls.mjs` and `panel-io.mjs`;
   `compileOVI` is `compileOVI` and `runnableOVI` `runnableOVI` (DT-071). `compiler.mjs` is down from 3,261 to 1,705
   lines; then the table (`node-table.mjs`, `NODE_EMITTERS`), the clump ordering (`clumps.mjs`, in English), what the
   compiler knows of node kinds (`node-kinds.mjs`), and `compileOVI` (`compile-ovi.mjs`), whose inner groups became
   parts that share the OVI's state through one object, their bodies unchanged: `panel-registry.mjs`,
   `debug-hooks.mjs`, `node-emission.mjs`, `loop-structures.mjs`, `case-structure.mjs`, `sequences.mjs`.
   `compiler.mjs` is the entry point alone (172 lines). Left for DT-089 §4's limits: 27 functions over 30 lines (the
   Case's and the loops' emitters, about 150 each; `compileOVI`'s set-up, 187; `contexto`; `callLibrary`;
   `propertyNode`), the inline emitters of `node-table.mjs` (597 lines), the three files that were large before
   (`pool-scheduler.mjs` 638, `stackless.mjs` 494), and the Spanish inside the parts. *Closed on 2026-11-16 as a
   ratchet:* `test/core/compiler-limits.test.mjs` lists what was over the limits then, which may shrink and never
   grow; each long function is split by the Boy Scout rule when a later step touches it (the Case's and the loops'
   emitters with the clusters). `tsc --checkJs` is kept (2026-11-16, TypeScript 7.0.2 pinned, `tsconfig.json` over
   `core/`, 0.7 s): `test/core/typecheck.test.mjs` fails on any type error over the 48 listed when it came in (all
   JSDoc that says less than the code), so a name left behind by a rename fails the suite. **Step 1 is done.**
   The `.wat` comparison does not reach every node (no example uses Delete From Array): a name left behind shows only
   in the suite, so it runs after every move. A rename by regular expression also hits quoted names and spread calls (`"rotar"`, a host import, became
   `"rotate"` once; `...convertir(` was missed once): after each rename, look for both.*
   **Style debts seen while splitting** (2026-11-16; counts over `core/`, `editor/` and `cli/`). Each goes against a
   written rule, so each is to be changed; the ones inside the compiler go with this step, the rest by the Boy Scout
   rule or as their own step where noted:
   - **"VI" in Solder's own names** (DT-071): *done on 2026-11-16*. Every identifier, file name and comment of `core/`,
     `editor/`, `cli/`, `scripts/` and `test/` says OVI (`subOVI`, `oviName`, `openOVIs`, `ovi-paths.mjs`,
     `subovis.test.mjs`…), and the Electron channels are `ovi:…`; the inventory's test references follow. Kept on
     purpose: LabVIEW's and NI's own names (NI-VISA's `VI_SUCCESS`…, "LabVIEW's VI", `.vi`, `vi.lib`), and what the
     `.ovi` format stores — the node type `"subvi"`, a subOVI's `config.vi`, the file's `vi` key and the block
     `vi-server-reference` —, which need a format migration (DT-055) and a decision of their own.
   - **Spanish in identifiers** (CLAUDE.md "Language"): the emitting context every node emitter receives (`e.entrada`
     310 uses, `e.temporal` 182, `e.celda` 202, `e.bufer`, `e.cadena`, `e.cableada`, `e.tIn`/`e.tOut`), the graph's
     `nodo`/`nodos`/`tipo` (over 1,300) and the catalog's `puertos`/`bloque`; `compilar`, `BLOQUES`, `LARGOS`,
     `funcionesMemoria`, `CELDAS`, `CIMA`, `EXPORTADAS`, `bloqueCadena`; graph.mjs's `tipos`, `orden`, `ejecutable`,
     `requerido`; runtime.mjs's `ejecutar`. The emitting context is renamed with `compile-ovi.mjs`; the graph's names
     touch the editor and the format, so they are a step of their own.
   - **Spanish data keys that cross to the runtime**: a cluster layout's `tam`, `campos`, `off`, `nombre`, `tipo`, an
     array element's `carga`, `guarda`, `ref`, panel data's `disposicion`, `elemento`, and the imports' `modulo`,
     `nombre`. Both sides (compiler and `core/runtime/`) change in one go, or the runtime reads nothing.
   - **Spanish text a user reads**: the command line answers `se puede ejecutar` (`cli/solder.mjs`); the Electron
     channels are named in two languages (`vi:guardar` beside `vi:open-path`).
   - **Single-letter names** (rule 9): `g`, `n`, `c`, `t`, `e`, `x`, `k` across the compiler (over 250 arrow functions
     with such parameters before the split); the moved modules no longer have them.
   - **Long functions** (rule 9, about 30 lines): `compileOVI` (about 840), the inline emitters of `BLOQUES`,
     `propertyNode` (about 50) and `callLibrary` (about 75), moved as they were; they are split once the move ends.
   - **Leftovers of DT-051**: `qvi-format.mjs`, `qvi.schema.json` and "`.qvi`" in comments, for what is now an `.ovi`.

2. **Clusters made by the user**: cluster control, indicator and constant, Bundle and Unbundle, the cluster order.
   *Measured on 2026-11-16 ([`cluster-panel`](../../labview-captures/reports/2026-11-16-cluster-panel.md),
   [`cluster-diagram`](../../labview-captures/reports/2026-11-16-cluster-diagram.md)) and decided in DT-095. Core done
   the same day: `core/model/user-cluster.mjs` (type and value derived from the elements), format version 6
   (`elements`, spec/02 §4.4), the `cluster-constant` block, the cluster emitters in `nodes/clusters.mjs`,
   `test/core/user-clusters.test.mjs` (the measured run: "hi", TRUE, 3). Next, the editor, in stages: (a) the panel's
   Cluster shell, dropping controls into it, its terminal and wire; (b) Reorder Controls In Cluster and Change to
   Indicator; (c) the Cluster Constant; (d) Bundle and Unbundle from the palette, taking the wired cluster's elements.
   Stage (a) built on 2026-11-16 (`editor/src/front-panel/cluster-panel.mjs`, `-view.mjs`, `-menus.mjs`; spec/05 §26
   rules 135–137, spec/06 §22) and tried under Xvfb
   ([`cluster-shell-editor-try`](../../labview-captures/reports/2026-11-16-cluster-shell-editor-try.md)). Left: the
   subpalette's title says "Data Containers" where LabVIEW says "Data Container"; an element's own menu, label editing,
   value operating and dragging it out of the shell.*
   *Stage (b) measured and built on 2026-11-17 ([`cluster-reorder`](../../labview-captures/reports/2026-11-17-cluster-reorder.md),
   [`cluster-indicator`](../../labview-captures/reports/2026-11-17-cluster-indicator.md); spec/05 rules 138–139):
   Change to Indicator / Control on the shell, and Reorder Controls In Cluster... with its frames, badges and toolbar.
   Left: an element's own menu and the terminal's (where LabVIEW also has Change to Indicator), the darkened shell bevel,
   the title without " Front Panel", LabVIEW's reorder cursor.*
   *Stage (c) measured and built on 2026-11-17 ([`cluster-constant-geometry`](../../labview-captures/reports/2026-11-17-cluster-constant-geometry.md),
   [`cluster-constant-elements`](../../labview-captures/reports/2026-11-17-cluster-constant-elements.md); spec/05 rules
   140–142): the Cluster Constant on the diagram (`editor/src/block-diagram/cluster-constant*.mjs`), its elements dropped,
   dragged in and out, typed into and deleted, its terminal shown on hover of the frame, its eight handles, its frame menu
   (Label, Change to Control / Indicator, Create ▸ Constant / Control / Indicator, Reorder Controls In Cluster... on the
   diagram) and the element's menu (Representation ▸). Two facts of 2026-11-16 corrected: the terminal shows only while the
   pointer is over the frame, and a Boolean-only constant is magenta. Left: the element menu's Visible Items ▸ and Create ▸,
   Display Format..., AutoSizing's other modes, View Cluster As Icon, the panel place of Change to (unverified); Undo of
   Change to works in Solder where LabVIEW greys it; Create ▸ Control crashed LabVIEW and is built as on any constant. Tried by hand under Xvfb
   ([`cluster-constant-editor-try`](../../labview-captures/reports/2026-11-17-cluster-constant-editor-try.md)); found and
   left: a rubber band touching the interior selects the cluster, not the elements in the band (LabVIEW unmeasured); an
   indicator created from the constant shows its values before a run (unmeasured); the broken wire after a reorder says
   "expects cluster and the wire carries cluster", which does not say the order differs; once, after Error list dialogs,
   Create ▸ Constant did nothing and a loose-end wire appeared (not reproduced).*
   *Stage (d) measured and built on 2026-11-17 ([`bundle-unbundle`](../../labview-captures/reports/2026-11-17-bundle-unbundle.md);
   DT-098; spec/05 rules 143–144): Bundle and Unbundle keep a copy of the wired cluster's type and follow it after every
   edit (`core/model/wired-clusters.mjs`), their rows by index; Bundle wired at the top passes its unwired rows through
   (3 True yo, as LabVIEW's run), unwired it builds a cluster of its rows and stretches; type marks, menus with Add Input
   and Remove Input, Create ▸ on a cluster terminal giving a cluster of its elements. **Step 2 is done.** Left: the
   unwired Unbundle's one empty output, Add/Remove Input on a Bundle wired at the top, marks of types other than I32,
   DBL, Boolean, String and cluster, the wires of rows that vanish (unverified), Create ▸ on an Unbundle's body. Tried by
   hand under Xvfb ([`bundle-editor-try`](../../labview-captures/reports/2026-11-17-bundle-editor-try.md)): it found that
   a user's cluster on the panel showed no run values (read by label after DT-095 §1 made the value a list; fixed the
   same day, by index). Found and left: Create ▸ Indicator on several outputs stacks the terminals upward to the
   toolbar; once, deleting a created indicator left a wire with no source (steps unclear); a body Create ▸ Indicator that
   did nothing once was not reproduced.*
   *Amended on 2026-11-16 (DT-095 §1): a cluster's value is the list of its elements' values in cluster order, not a
   record by name (a Cluster Constant holding 1 and 2 gave 2 and 2); Solder's own clusters stay records. Stages (c) and
   (d) build on it.*
2b. **Projects: the Project Explorer and `.sdproj`** (DT-099, decided on 2026-11-17), brought before the editor of
   type definitions: the `.sdproj` is the `.lvproj` one to one in JSON. First the measurements DT-099 lists; then the
   core (`core/model/project.mjs`, the schema), then the window in stages.
   *Measured on 2026-11-17 ([`project-explorer-s1`](../../labview-captures/reports/2026-11-17-project-explorer-s1.md):
   the window, its eight menus, the toolbar, saving, the `.lvproj` text, Dependencies never written;
   [`project-explorer-s2`](../../labview-captures/reports/2026-11-17-project-explorer-s2.md): each item's menu, virtual,
   snapshot and auto-populating folders, the order, a VI's window title "… on P1.lvproj/My Computer", the Files tab,
   Remove From Project and the close prompt). Core done the same day: `core/model/project.mjs` (blank project, read and
   write in LabVIEW's order, Add ▸ File / Folder (Snapshot) / Folder (Auto-populating), New ▸ Virtual Folder, the
   Dependencies closure), `docs/schema/sdproj.schema.json`, spec/02 §9, `test/core/project.test.mjs`. Next, the editor,
   in stages: (a) the Project Explorer window (Items tab, tree, menus and toolbar with the rows not built greyed),
   File ▸ Create Project... / Open Project... / Save Project / Close Project with the Create Project dialog and the
   close prompt; (b) Add ▸ and New ▸ VI / Virtual Folder, Remove From Project, rename, drag into folders; (c)
   Dependencies filled from the hierarchy, refreshed, and auto-populating folders watching the disk; (d) OVIs opened
   from the project ("… on P.sdproj/My Computer", Window ▸ Show Project) and the Files tab.*
   *Stage (a), first part (a1), on 2026-11-18: the Project Explorer window as a page of its own
   (`editor/src/project-explorer/`, `editor/project.html`, `editor/electron/project-window.mjs`): the eight menus row by
   row, the toolbar, the Items and Files tabs (Files greyed), the tree with its expanders, selection and the measured
   right-click menus, Expand All and Collapse All; every row not built greyed with its reason (inventory: 268 rows).
   The `.sdproj` keeps the window's place (DT-099 §4) and the tree is kept in LabVIEW's order. A tall menu stays under
   the menu bar and scrolls (shared `menuContextual`). Tried under Xvfb
   ([`project-explorer-editor-try`](../../labview-captures/reports/2026-11-18-project-explorer-editor-try.md)). Next,
   (a2): File ▸ Create Project... (the Create Project dialog, Blank Project) in every window and in Getting Started,
   Open Project..., Save Project with "Name the Project", Close Project with its prompt, the window list of Window ▸,
   and no Getting Started after Close Project (LabVIEW shows none).*
   *Stage (a2) on 2026-11-18, after measuring what it lacked
   ([`project-explorer-s3`](../../labview-captures/reports/2026-11-18-project-explorer-s3.md)): File ▸ Create Project...
   in every window and in Getting Started with the Create Project dialog (Blank Project and Blank OVI built; templates,
   sample projects, filters and Keyword greyed) and the Open Items question (Add unmeasured, a hole); several projects
   open at once, "Untitled Project N" never reusing a number; Open Project... and File ▸ Open... of a `.sdproj`; Save
   Project with "Name the Project (…)" keeping the window's place; Close Project with its question; Exit asking about
   projects; Getting Started minimized after the last project; the Window menu's list in the explorer
   (`editor/electron/project-manager.mjs` and its pure modules, `editor/src/create-project/`). Tried under Xvfb
   ([`project-flows-editor-try`](../../labview-captures/reports/2026-11-18-project-flows-editor-try.md)). Unverified
   there: the minimized Getting Started (no window manager). Left: Recent Projects / Recent Files, the "List unsaved
   changes..." link, the Window list's underlined numbers and the OVI windows' own Window list. **Stage (a) is done.**
   Next, (b): Add ▸ and New ▸ OVI / Virtual Folder, Remove From Project, rename, drag into folders.*
   *Stage (b) on 2026-11-18, after measuring it
   ([`project-explorer-s4`](../../labview-captures/reports/2026-11-18-project-explorer-s4.md)): the core edits the tree
   by an item's place (`core/model/project-tree.mjs`: remove, rename, move, add into a folder, always in LabVIEW's
   order); the window has Add ▸ File / Folder (Snapshot) / Folder (Auto-populating) with "Unable to Add Items", New ▸
   Virtual Folder with in-place naming, F2 on folders, Remove From Project with "Remove Items", dragging into folders,
   and paths stored relative to the `.sdproj` and rebased on its first save (`editor/electron/project-paths.mjs`,
   `editor/src/project-explorer/project-explorer-edit.mjs`). Tried under Xvfb
   ([`project-tree-editor-try`](../../labview-captures/reports/2026-11-18-project-tree-editor-try.md)). Decided without
   LabVIEW's rule: a folder dropped on a folder always nests; Solder's asterisk marks every change (LabVIEW's omits Add
   and Remove, measured). Left for (d): New ▸ OVI and renaming an OVI item (LabVIEW renames its file through "Save the
   VI (…) As"). Next, (c): Dependencies filled from the hierarchy, Refresh, auto-populating folders read from the disk
   and watched, Stop Auto-populating and Convert to Auto-populating Folder....* *Stage (a2), on 2026-11-18: File ▸ Create Project...
   in the Project Explorer, the OVI windows, the Polymorphic window and Getting Started (menu and button), with the Create
   Project dialog (`editor/src/create-project/`, `editor/create-project.html`) and the Open Items question; Open Project...
   and File ▸ Open... for `.sdproj`; Save Project ("Name the Project"); Close Project with its prompt and Getting Started
   minimized after the last one; the Window menu's list; the `SOLDER_PROJECT` switch is gone. The windows and dialogs
   are `editor/electron/project-manager.mjs`, the rules pure in `project-registry.mjs`, `project-dialogs.mjs` and
   `project-window-list.mjs`. Unmeasured and greyed: what Add does in Open Items, its "Do not show again" box, the dialog's
   tree filters and Keyword, Save Project and Close Project of an OVI window (no OVI belongs to a project until (b)).*
   *Stage (c) on 2026-11-21, after measuring the auto-populating folders
   ([`project-explorer-s5`](../../labview-captures/reports/2026-11-21-project-explorer-s5.md)): Dependencies read from
   the items' files whenever the project opens, is edited, refreshed or an OVI is saved (the closure of subOVIs,
   polymorphic instances and `.octl`, `ovi.lib` in its folder first; `editor/electron/project-dependencies.mjs`), with the
   measured menus of its rows, Refresh and a dependency's Open; an auto-populating folder shows the disk (folders first,
   hidden files not, its folders with their own menu) and is watched (`editor/electron/project-disk-requests.mjs`); Stop
   Auto-populating, Convert to Auto-populating Folder... ("Select Folder to Connect", files outside it moved to My
   Computer) and a folder deleted on disk turning virtual (`core/model/auto-populating.mjs`); Open on an OVI of the
   folder. Tests: `test/editor/project-dependencies.test.mjs`, `project-auto-populating.test.mjs`; tried under Xvfb
   ([`project-stage-c-editor-try`](../../labview-captures/reports/2026-11-21-project-stage-c-editor-try.md)). Left, differing from
   LabVIEW: a watched change does not make the project unsaved (LabVIEW asks on close, with no asterisk); "Undo File
   Rename?" for a file renamed on disk; a folder created while open is sorted, not appended. Unverified: whether
   Dependencies follows unsaved edits of an open OVI (Solder reads the files), how LabVIEW marks a missing dependency
   (Solder: italics) and the titles of an OVI opened from Dependencies or an auto-populating folder. Next, (d): the Files
   tab, Window ▸ Show Project, renaming an OVI item, and Close Project closing the project's OVIs.*
   *Stage (d), first part, on 2026-11-22: Close Project closes the project's OVIs, asking about each with unsaved changes
   ("Save changes? (Close Project)", the box "Apply same action to the remaining N affected items" with Save - All /
   Don't Save - All, the OVIs created last first and the project last: s3 "Extras"), and the last OVI closing no longer
   shows Getting Started while a project is open (unverified in LabVIEW); Rename... of an OVI item ("Save the OVI (…) As",
   the file moved at once with its subOVIs' paths rebased, `editor/electron/ovi-file-rename.mjs`; s4 "Rename"). Tests in
   `projects.test.mjs` and `project-explorer-edit.test.mjs`. Tried under Xvfb
   ([`project-stage-d-editor-try`](../../labview-captures/reports/2026-11-22-project-stage-d-editor-try.md)), which found
   the page's last messages reaching the main process after its project was gone (fixed); the GTK dialog proposes
   "a.ovi" with the extension, where LabVIEW selects "a". Unverified: the order among several affected items, a
   renamed OVI's callers (Solder's keep the old path), renaming onto a file that exists (Solder refuses), Rename of a new
   OVI never saved (nothing). Left for (d): Window ▸ Show Project and the OVI windows' Window and Project menus, which
   need the OVI window's Window menu measured first, and the Files tab.*
   *Stage (d), second part, on 2026-11-22, after measuring the menus
   ([`vi-window-menu`](../../labview-captures/reports/2026-11-22-vi-window-menu.md)): the OVI windows' Window menu (Show
   Block Diagram / Show Front Panel, Show Project, Tile Left and Right, the open windows most recently active first, the
   Project Explorers as a group) and Project menu (Create, Open, Save and Close Project built, the rest greyed with its
   reason; outside a project only Create and Open enabled), File ▸ Save Project and Close Project acting on the OVI's
   project, Show Project bringing its explorer forward, restored (`editor/src/window/project-menus.mjs`,
   `common/window-list-menu.mjs`; `test/editor/ovi-project-menus.test.mjs`). Tried under Xvfb
   ([`ovi-project-menus-editor-try`](../../labview-captures/reports/2026-11-22-ovi-project-menus-editor-try.md)), which
   found the window asking for the list not counted as active without a focus event, and Save Project's questions piling
   up when clicked again (both fixed). Unverified: Show Project with two projects
   open; docked, the Window menu's list is the one read when the page last had the focus. Left for (d): the Files tab
   (Show Other Project View, Ctrl+E in the explorer).*
   *Stage (d), third part, on 2026-11-22, after measuring it ([`files-tab`](../../labview-captures/reports/2026-11-22-files-tab.md)):
   the Files tab, built from the Items tree and the project file's path (`editor/src/project-explorer/files-tree.mjs`,
   `files-view.mjs`): the drive at the root, the folders down to every file of the items, the auto-populating folders,
   the dependencies and the project file, folders first and by name; the chains to the project's folder and the
   dependencies' open the first time; its seven measured menus with Open, Show in Items View, Rename... of an OVI, Expand
   All and Collapse All built; Window ▸ Show Other Project View (Ctrl+E) and every Show in Files View carrying the
   selection; a double click opens an OVI or a folder (`test/editor/project-files-tab.test.mjs`). Decided without
   LabVIEW, which runs on Windows only: a POSIX root is drawn "/". Not built: Remove from Project, Move on Disk...,
   Explore..., Arrange By, Properties in the Files menus; the toolbar's greying follows the Items selection. Tried under
   Xvfb ([`files-tab-editor-try`](../../labview-captures/reports/2026-11-22-files-tab-editor-try.md)): as measured; it
   found the OVI window's footer showing the greyed sample instead of its project (now "P.sdproj/My Computer", its menu
   still a hole) and a Save through the GTK dialog with "first.ovi" typed writing `first.ovi.ovi`, now undone for OVIs,
   polymorphic OVIs and projects (`withoutDoubledExtension`, ovi-paths.mjs; unverified which part of the dialog adds it).
   **Stage (d) is done, and with it step 2b** (left: Recent Projects / Recent Files, Open Items' Add, the project
   rows not built).*
3. **Type definitions** and strict type definitions, in `.octl` files (DT-093 §5): Make Type Def., the control editor,
   updating the instances. *Decided in DT-096 (2026-11-16): the type on a wire stays structural and the link to the
   `.octl` lives on the object, with a copy of the definition. First, the measurements DT-096 lists.* *Measured on
   2026-11-17 ([`typedef-wiring`](../../labview-captures/reports/2026-11-17-typedef-wiring.md),
   [`typedef-update`](../../labview-captures/reports/2026-11-17-typedef-update.md)); DT-096 amended: wires stay
   structural with a red dot where the ends follow different files or kinds, a missing `.octl` breaks the OVI, and an
   update that would change a stored default waits for Review and Update from Type Def.... Next: the core (the link,
   the `.octl` format and schema, the broken state of a missing file), then the editor in stages.*
   *Core, first part, on 2026-11-17: the link `typedef: { path, strict }` on a panel object or a constant (format
   version 7, spec/02 §4.4), the `.octl` file and its schema (`core/model/type-definition.mjs`,
   `docs/schema/octl.schema.json`), the `.octl` files read with the hierarchy (command line and editor) and rebased by
   Save As, and a missing one breaking the OVI with LabVIEW's words (`test/core/type-definitions.test.mjs`). Found on
   the way and fixed: the schema refused a Cluster Constant's `elements`, and a cluster inside a cluster was written
   with the graph's names. Next, the core's second part: updating an object from its definition (silent or waiting for
   Review, DT-096 §4) and the source a wire's coercion dot and Context Help follow (§1, §5); then the editor.*
   *Core, second part, on 2026-11-17: `core/model/type-definition-update.mjs` updates an object from its definition
   (silent, or a review with the previous and proposed defaults and what is lost), `core/model/type-definition-wires.mjs`
   finds the definition a wire carries, its coercion dot and its Context Help line
   (`test/core/type-definition-update.test.mjs`, the measured cases). **The core is done.** Next, the editor, in stages:
   (a) Make Type Def. / Open Type Def. and the control editor window (title, ring, File ▸ Apply Changes, Save) writing
   the `.octl`; (b) the instances' menus (Open Type Def., Disconnect from Type Def., Auto-Update from Type Def., Review
   and Update from Type Def...) and updating the open OVIs on Apply Changes; (c) the Review and Update window; (d) the
   coercion dot and the Context Help line; then a placed `.octl` from Select a Control... First, measure what the
   editor stages need and the reports do not say (how Make Type Def. is reached, what the control editor opens with,
   where a new instance is placed).* *Measured on 2026-11-17
   ([`typedef-editor-entry`](../../labview-captures/reports/2026-11-17-typedef-editor-entry.md)): Make Type Def. (on
   panel controls and on Cluster and Numeric constants) links the object at once to an unsaved typedef "Control N",
   opening nothing; Open Type Def. opens the 616 × 413 editor `Control N Type Def *`; Advanced ▸ Customize... opens a
   panel-sized `Control N Control *` that never links; Save names the file (`Name the Control (Control N)`) and the
   link moves to it. Open question before stage (a): how an unsaved typedef is linked (DT-096 has a path only).*
   *Answered the same day by the developer in DT-096 §3: an untitled key `untitled:…`, moved to the file on its first
   save. Before stage (a), on 2026-11-22: the control editor window's menus and toolbar measured
   ([`control-editor-window`](../../labview-captures/reports/2026-11-22-control-editor-window.md)).*
   *DT-104 (2026-11-22): the control editor is the Front Panel page editing one object. Its pure part is done the same
   day: `core/model/control-editor.mjs` opens an `.octl` as the graph of a panel holding its one object and writes it
   back (`test/core/control-editor.test.mjs`). Stage (a) goes on in three parts:*
   - *(a1) The window. The registry gets `ENTRY_KINDS.CONTROL` (one window, the Front Panel; its own counter "Control
     N", shared with Customize...; its title "Control N Type Def *", from the kind it was opened with, measured: the
     title follows the ring only on reopening). The page, told the entry's kind, reads its text with
     `controlEditorGraph` and reports it with `controlEditorText`; its menus and toolbar are a prefix of their own in
     the inventory, `window.control-editor`, with the measured rows (File's Apply Changes and Control Properties,
     Window's Show Parts Window, Operate's Change to Customize Mode, the toolbar's ring "Control Type" and no Run).*
     *Done on 2026-11-22 (`feature/control-editor-window`): `ENTRY_KINDS.CONTROL` and `CONTROL_WINDOW_KIND` in
     ovi-registry.mjs (counter "Control N", title from `entry.controlKind`), main.mjs opens the one 616 × 413 window
     cascaded and a `.octl` opens as CONTROL (`kindOfFile`, `noteControlKind`), writing it back with `writeControl`; the
     page `ventana=control-editor` is a Front Panel over `controlEditorGraph`/`controlEditorText`, with the ring
     `window.control-editor.toolbar.control-type` and no Run; the inventory declares `window.control-editor.*` from
     reports/2026-11-22-control-editor-window.md. Reviewed the same day: the page saves the `.octl`'s text (not an
     OVI's), the Ctrl shortcuts whose rows are holes or never do nothing in that window (Ctrl+E, Ctrl+S, Ctrl+I, Ctrl+R,
     Ctrl+T — `shortcutBlocked` in labview-inventory.mjs, and `hasOviWindows` guards Ctrl+E/Ctrl+T in the main process),
     and the title keeps the kind it was opened with until reopening. Tests: test/editor/control-editor-window.test.mjs
     (each fix shown to fail with the bug put back), test/editor/ovi-registry.test.mjs; 1827 green. Next: (a2).*
   - *(a2) Make Type Def. and Open Type Def. Make Type Def. on a panel control or a Cluster or Numeric constant asks
     the main process for an untitled control entry holding the object (`definitionObjectOf`) and links the object to
     its key `untitled:…`, opening nothing; Open Type Def. opens the entry's window (616 × 413, cascaded), from memory
     or from the `.octl` on disk.*
     *Done on 2026-11-22 for the panel cluster (`context.cluster-control`): the page's `makeTypeDefinition` asks the
     main process (`typedef:make`) for an untitled CONTROL entry holding `definitionObjectOf`'s `.octl`, kept in
     `deferredEntries` with no window and always unsaved, and links the cluster to its key `untitled:N`; untitled keys
     pass through `resolveRelative`/`rebaseStoredPath` and the memory-first reader serves them; the caller reports the
     definitions it follows with its callees, so closing the editor offers Defer Decision; `openTypeDefinition` sends
     the key to `openPath`, which reopens an untitled entry from memory (`openUntitled`). The menu's linked rows are in
     the inventory, hidden or shown by `front-panel/type-definition-menus.mjs`. Saving an untitled control already
     moves the open OVIs' links (`relinkTypeDefinition`, `ovi:saved`'s `from`), brought forward from (a3) so that a save
     does not break them. Tests: test/editor/type-definition-menus.test.mjs; 1831 green. Not done: the Cluster and
     Numeric constants (a2b: an `.octl` holds a control, so a constant needs its control first), Make Type Def. on the
     other panel objects (their linked menus are not measured), Find ▸ in place of Find Terminal. Unverified: Make Type
     Def. greyed on an indicator (measured at half scale), where the object sits in the new editor (LabVIEW: 31,109).*
   - *(a2b) Make Type Def. on a Cluster Constant and a Numeric Constant: the `.octl` holds the control the constant
     becomes (Change to Control), the linked constant's menu as measured (reports/2026-11-17-typedef-editor-entry.md Q7).*
     *Done on 2026-11-22: `controlOfConstant` (cluster-constant-panel.mjs) turns a Cluster Constant into a cluster
     control of its elements and a Numeric Constant into a numeric control, values as defaults; the type definition's
     rows of the three menus are one place now (`typeDefinitionVariants`/`typeDefinitionMarks`, merged by
     diagram-editing's `variantes`/`marcados`), with Make Type Def. greyed on the other constants that share the Numeric
     Constant's menu. Measured in LabVIEW (reports/2026-11-22-typedef-from-constants.md): a constant gives a control,
     labelled "Numeric" or "Cluster" and shown, with the constant's values; a linked Numeric Constant greys Adapt To
     Entered Data and Representation. Tests: test/editor/type-definition-menus.test.mjs. Found and not done: the dark
     corner triangle of a linked constant (Q4); Find ▸ after Change to Array in every linked menu; Description and
     Tip... moving after Replace ▸ in a linked menu; closing a caller with an unsaved definition asks LabVIEW's "about
     to leave memory" dialog with Save - All, Don't Save - All and the affected items (Q5), Solder still asks the plain
     Close dialog (stage a3).*
   - *(a3) Saving and closing. Save names the file ("Name the Control (Control N)", Controls (*.octl)) and moves every
     open OVI's link from the untitled key to the file, relative to each OVI; saving an OVI whose definition is
     untitled asks LabVIEW's '"p1.vi" refers to new, unsaved files' (Yes / Cancel) first; closing the editor asks
     "Save changes before closing?" with Save, Defer Decision, Cancel, the entry kept in memory on Defer Decision.
     Apply Changes and the updates of the open OVIs are stage (b).*
4. **Time stamp**: control, constant, Get Date/Time, conversions. *Decided in DT-097 (2026-11-16) and measured the
   same day ([`time-stamp`](../../labview-captures/reports/2026-11-16-time-stamp.md)): 16 bytes laid out as a cluster,
   and the arithmetic LabVIEW takes, exact.*
5. **Waveform**: the type, Build and Get Waveform Components, charts and graphs fed by it. *Its layout is decided in
   DT-097 §5, with the attributes' place reserved; its behavior is measured first (DT-097 §6).*
6. **DAQ on waveforms**: DAQmx Read's waveform instances; the hardware stage may reopen here.
7. **Variant.**
8. **The rest of OVI Server** (hardware step 7 above), with Core 2.

**After it:** **LabVIEW Core 1** (DT-054, moved after the beta by DT-055 and after the hardware by DT-064): every
lesson of NI's Core 1 course can be done in Solder, the hardware lessons on the ESP32 and on simulated instruments.
The outline is in `labview-captures/core-courses/README.md`; first, list which lessons Solder misses.

*The split of `core/compiler/compiler.mjs` (DT-089) moved to step 1 of "The language's everyday types" (DT-093 §2).*

**Before 1.0, the file formats (DT-100, 2026-11-18):** stable ids, one element per line, a move touching only the
layout, English keys, in one version change of the `.ovi` with its migration, designed and asked about first; and a
`comment` on any object of any Solder file, built at the next version change of each format.

**Before 1.0:** *inplaceness* (DT-042 §5), which changes memory and speed but not
results. It was postponed until a real program ran slowly; since 2026-11-05 it is a
condition of 1.0 (DT-077 §8), done and compared with LabVIEW on large arrays before the
first release candidate.

**Pending from the pool of threads** (DT-063, left on 2026-10-25 when step 7 was merged):
- Measure in LabVIEW how often the panel is redrawn while an OVI writes an indicator; Solder's coordinator passes
  over it every 16 ms, a guess (`DISPLAY_PASS_MS` in `core/runtime/runtime.mjs`).
- Synchronous Display and the Value property (DT-063 §10): the clump parks until the editor confirms the drawing.
- Highlight Execution on several threads: today a Run debugged from the start runs on one thread, and debugging
  turned on during a pool Run does not keep one clump at a time.
- Starting Node's workers is expensive (~4.5 s of CPU for 28, plus ~2.3 s in their first Run): it weighs on the
  command line, which makes a pool for each run, and on the tests.
- Local variables of controls, which would let several loops read one large control at once (the lock allows it).

**Postponed**, but not forgotten: the icon editor (every OVI keeps the standard icon), Change to … (half captured, see M1), the *Adapt To Entered Data* switch, the
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
  (Express OVI), Spreadsheet String To Array and Array To Spreadsheet String (arrays), the
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
  outside. An OVI with strings is saved, opened and runs (`qvi-round-trip.test.mjs`).

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
  Express OVI, Assert Type and Is Value Changed.vim (malleable OVIs).
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
  for subOVIs or for Express OVIs.

### M8 — Waveform and graphs

- [~] Controls ▸ Graph (Waveform Chart, Waveform Graph, XY Graph) and the Waveform
  subpalette. *The three graphs done on 2026-10-09 (§3b step 4); missing Scope/Sweep, cursors, plot styles, the
  other graphs and the Waveform subpalette.*

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

- **SubOVIs:** connector pane, icon editor, compiled call (R6).
- **Dialog & User Interface**, **File I/O** (with their gates, R7).
- **Instrument I/O:** serial and VISA, with the host in Rust (DT-039 §5).
- **Projects:** `.sdproj` and Project Explorer — *brought forward to step 2b of "The language's everyday types" (DT-099).*
- **Classes** (LVOOP), libraries and everything else LabVIEW shows.

### Cross-cutting, when a module asks for it

Edit menu (undo, copy, paste), View, Window (Ctrl+E), Operate (Run
Continuously, Abort), Tools ▸ Options, the context help window, the error list,
probes and execution highlighting.

**Pending review in LabVIEW: resizing controls (issue #21, 2026-11-19).** Every control and indicator has resize handles
(`editor/src/front-panel/control-resize.mjs`). Measured: VISA resource name, String, Numeric, File Path
(labview-captures/reports/2026-11-19-control-resizing.md). Built by analogy and unverified, to measure when convenient:
enum and Text/Menu Ring (horizontal only?, narrowest), DAQ names (as a VISA resource name?), Booleans (does the drawing
stretch, the smallest size), refnum (resizable at all?), error cluster (do its elements stretch or keep their place?),
graphs and charts (does the plot area take all the growth, the smallest size), and whether the VISA dropdown grows when
the control is made taller.

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
- 2026-10-01 — M5: Functions ▸ Comparison captured (29 elements, context help and five menus) and done over numbers and Booleans: 16 functions placed, wireable and compiled, with behavior measured in LabVIEW (NaN, coercion, FALSE < TRUE, Select, Max & Min, In Range and Coerce); the rest greyed out until strings (M3), arrays (M6) and malleable OVIs. Next: M4, structures.
- 2026-10-01 — Run like LabVIEW (DT-040, decided): circuits built in LabVIEW (While with Stop and Wait, output tunnel, two Waits in parallel; Abort; the click on a stopped Boolean) and cloned. The compiler splits the diagram into clumps and the host runs them by dataflow with JSPI: parallel branches, live indicators, immediate Abort, Latch When Released (and Stop, OK and Cancel are born Latch), Run mode in both windows. Timing: Tick Count, Wait and Wait Until Next ms Multiple. Tested in the real editor in Xvfb. Next: M4, with the loops on this scheduler.
- 2026-10-01 — M4, While Loop and For Loop in the editor: Functions ▸ Programming ▸ Structures captured (16 elements, 4 columns) and declared in full in the inventory (While and For done; Case, sequences, Event, Timed, Formula Node and the rest, greyed out with their reason), along with the border menus of each loop and of "i", the condition, "N", the tunnels and the shift registers. The two loops, drawn at 1:1 (frame, terminals of 16 × 16, tunnels of 9 × 9, shift registers of 16 × 12, handles of 6 × 6; compared pixel by pixel with LabVIEW) and editable: place with two clicks or a rectangle (minimum 48 × 48), move with what is inside, stretch, move nodes in and out, tunnels when wiring across the border, Add Shift Register and Stop/Continue if True. Rule 26 of spec/05 is amended (dragging between scopes reassigns, as in LabVIEW). Next: Case Structure and the sequences (M4), or arrays (M6) for the tunnels with Indexing.
- 2026-10-01 — M4, the core of the loops (DT-041): structures in the flat model with `dentro`, tunnels and shift registers as border nodes, inline compilation inside the loop's clump with adaptive yielding, and nested `.qvi` (spec/02 amended: condition, N and initial value are wired). 13 behavior tests; the sum example gives 45.
- 2026-10-01 — M4, Case Structure in the editor: captured (hatched frame, frame selector, "?", tunnels, menus of the border, the selector and the tunnels), verified in LabVIEW (DBL into the selector rounds to even; For with N = 0 gives 0) and done with measurements compared pixel by pixel; the frames become "0, Default" and "1" when an integer is wired. A Case made with the mouse compiles and runs. Next: sequences, or arrays (M6).
- 2026-10-01 — M4, the core of the Case (DT-041 §6–8: frames in the plan, selector, tunnels with one input per frame and Use Default If Unwired, if/else chain, `.qvi` with `frames`) and the subplans: two waits in the same body overlap.
- 2026-10-01 — M4, Flat and Stacked Sequence in the editor: captured in LabVIEW (film border of 250 × 200 with frames, separators of 5 px and holes every 12; minimum frame of 38; tunnels of 9 × 9 on the separators; selector "0 [0..1]" of 72 × 17; local variable of 13 × 13 with write arrow, read arrow and in checkerboard; menus of both) and done with the border compared pixel by pixel (66 px of difference, all from the tunnel and the wire that LabVIEW did not have in that capture). Verified by building and running the OVI in LabVIEW: the output tunnel of a Flat writes the indicator when its frame ends (at ~1 s with a Wait of 1000 ms in frame 0), not when the sequence ends as the core did; fixed the same day (each frame of a Flat is an element of the dataflow, DT-041 §9). Next: Add Sequence Local, or arrays (M6).
- 2026-10-01 — M3, String: Functions ▸ Programming ▸ String captured in full (28 elements in 5 columns, plus Number/String Conversion of 12, Additional String Functions of 13, Path/Array/String Conversion of 6 and Flatten/Unflatten String of 9, with the context help of each function), Controls ▸ Modern ▸ String & Path (5) and the string constant and control (measured at 1:1: constant of 15 × 19 px empty and 22 × 34 with two lines; control of 100 × 24 px). 27 functions and constants and the two controls done; the rest greyed out with their reason. Results measured by building each function in LabVIEW (String Subset, Replace Substring, Search and Replace String, the Number To … String and … String To Number, and the string comparisons, byte by byte) and carried into `spec/04` (rules 21b–21f) and into tests. The functions that depend on LabVIEW's format are JavaScript imports over the memory of DT-042 (`cad.*`), with round-to-even for exact numbers; the allocator and the cells do not change. Comparison accepts strings and gains Empty String/Path?, Decimal/Hex/Octal Digit? and White Space?. The editor writes the constant and the control with Enter as line break; a string OVI is saved, opened and runs. 248 tests. Next: M6 (arrays and clusters), or the right-click menus of the string constant and control, and Format Into String.
- 2026-10-02 — Decided: the error cluster goes into M6, after the basic clusters and before arrays. Arrays and clusters go on the memory of DT-042, not on WasmGC.
- 2026-10-02 — M6, the error cluster in the editor (DT-043): captured in LabVIEW the Controls ▸ Modern ▸ Data Containers subpalette (2 columns, 8 elements: Array, Cluster, RealMatrix.ctl, ComplexMatrix.ctl, Set, Map, Error In 3D.ctl and Error Out 3D.ctl) and the Error Out control at 1:1 (155 × 121 px). Done: the wire (3 px, olive border and yellow and black dashes), the Error In/Out controls with their terminal, the editable error constant (22 × 57 px), Dialog & User Interface declared in full (23 elements, 4 columns; 5 done), Simple Error Handler, the two modal dialogs (the automatic handling one with Continue and Stop, and the Simple Error Handler one with OK), `core/runtime/error-codes.mjs` with codes 1, 2, 7, 8, 42, 43, 56, 63 and 66 and the paragraph for the undefined code, and the error terminals of Search and Replace String. 266 tests. Next: arrays (M6), the basic clusters with their controls (Bundle, Unbundle, Cluster) or Explain Error.
- 2026-10-02 — M6, arrays in the editor: Functions ▸ Programming ▸ Array captured in full (34 elements, 5 columns, context help of each one, measurements of each function dropped in the diagram) and Controls ▸ Modern ▸ Data Containers ▸ Array; the panel array menu, the indexed output tunnel menu and that of a function, captured. Done: Replace Array Subset, Insert Into Array, Delete From Array, Sort 1D Array, Rotate 1D Array, Split 1D Array and Increment/Decrement Array Element (JavaScript module `arr`), the array control, indicator and constant, indexed tunnels with their menu and the 2 px array wire; the `.qvi` saves `indexed`, `visible-elements` and `index`. LabVIEW's edge cases remain unverified (see M6). 287 tests.
- 2026-10-03 — M6, 2D arrays (second stage, item 1). Researched how LabVIEW types arrays (type descriptor: element plus dimension count, no arrays of arrays) and decided DT-044: `{ array: E, dims: N }` and one block `[rows][columns][elements]`. Captured in LabVIEW (`labview-captures/array-2d/`): the 2D constant, panel array, terminal and 3 px wire at 1:1, the menus with Add/Remove Dimension, and the results of Array Size, Index Array (element, row, column, out of range), Build Array (padding, 2D + 1D, Concatenate Inputs), Initialize Array, Transpose, Reshape and nested Fors; Add Dimension still enabled at 34 dimensions. Core: types, memory, panel, coercion, Array Size, Index Array, Build Array, Initialize Array and auto-indexing in 2D. Editor: the wire, the 2D constant and panel array (editable, stretchable), Index Array and Initialize Array with two inputs. Unverified: Index Array with no index wired, ragged rows out of a loop. Not done: more than 2 dimensions, Transpose/Reshape, Index Array's extra index groups, Build Array's Concatenate lock. 327 tests. Next: subOVIs (R6).
- 2026-10-08 — SubOVIs, stages (a) and (b) of DT-045. Researched how LabVIEW calls a subVI (separate compiled code, one data space when non-reentrant, clones when reentrant, recursion only with shared clones), checked again by an independent review, and decided DT-045. Captured in LabVIEW (`labview-captures/subvi/`): the 4-2-2-4 connector pane and its menus, Recommended by default and no Required outputs, the subOVI node and its menu, the unwired input taking the control's default (5 + 3 = 8), the broken Run with a Required input unwired, the functional global counting 1, 2 and then 3, 4 in the next Run (1, 1 and 2, 2 with preallocated clones), OVI Properties ▸ Execution, the icon editor and the recursion error. Core: one module per hierarchy with a data space per instance, direct calls or JSPI plans, a queue per non-reentrant OVI, uninitialized shift registers that keep their value, state kept between Runs, the hierarchy loaded from relative paths, the command line. Editor: several OVIs open, connector pane, Select an OVI..., the subOVI node, double click to open, OVI Properties ▸ Execution. DBL orange corrected to the measured `#ff7f00`. Unverified: the total time of two parallel calls. Not done: the icon editor (stage c), the other connector patterns, View As Icon off, shared clones, recursion; a caller whose saved wires point to ports its subOVI no longer has does not open. 360 tests.
- 2026-10-09 — Debugging (second stage, item 6, the last of it). Measured in LabVIEW (`labview-captures/debugging/`): one Debug Window for probes and breakpoints, Highlight Execution with four speeds, the stops before a node, the Error list. Core (DT-047): hooks after each node. Editor: a controller in the run worker that stops, steps and paces the OVI, the toolbar buttons with their states, probes, breakpoints, the Debug Window and the Error list as floating windows, Allow debugging in OVI Properties. Unverified: the pace of Fast and Very Fast, Step Out, wire breakpoints, what Pause and Start Single Stepping do in edit mode. 500 tests.

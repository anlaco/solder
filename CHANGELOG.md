# Changelog

Solder follows [semantic versioning](https://semver.org) while in development:
`0.MINOR.PATCH-alpha`, and from 0.4.0 on `0.MINOR.PATCH-beta`. A release that adds
features raises MINOR, one that only fixes things raises PATCH. The `-alpha` label
said the file format was not stable yet; `-beta` marks the maintainable version,
whose files keep opening, and stays a `0.x` (DT-048, DT-055). Until 1.0 every
release is tagged on `main` (DT-062); 0.4.1 to 0.4.3 came from `release/0.4`.

## Unreleased

## 0.14.0-beta — 2026-11-19

- Comments in Solder's files (DT-100 §6): any object of an `.ovi`, `.octl`, `.sdp` or `.sdproj` (the file itself, a
  front-panel item, a node, a structure, a wire, a cluster element, a project item, an instance) may hold
  `"comment": "<text>"`. Solder keeps it on its object when it saves, a node's comment goes with the node, and the
  compiler never reads it. The editor shows none yet. The formats go to `.ovi`/`.octl` version 8 and `.sdp` and
  `.sdproj` version 2; older files open unchanged.

- Solder's docked view, experimental (DT-101): a switch at the foot of the Project Explorer puts every window into one,
  the Project Explorer on the left and one tab per open OVI in the middle, with a switch between its Front Panel and
  Block Diagram at the top left (Ctrl+E) and Ctrl+T splitting the middle in half. As in Eclipse, the docked window has
  one native menu bar and one toolbar row, Run included, for the active window, instead of one per window. It switches
  live, keeping unsaved edits and undo, and is remembered. LabVIEW's floating windows stay the default: "if you come from LabVIEW, use the
  floating windows; if you start from scratch, use the docked view".

- New ▸ OVI in a project (DT-099): right-click My Computer or a virtual folder ▸ New ▸ OVI, or the Project Explorer's
  File ▸ New OVI, makes an "Untitled N" item and opens the OVI, whose titles say "on <project>/My Computer", as in
  LabVIEW. Its first Save proposes the project's folder and turns the item into the file; closed unsaved, the item goes;
  Save Project first asks to save the new OVIs.

- A subOVI behaves as LabVIEW's subVI in memory (DT-102): while a caller runs, the subOVI's open windows are in run
  mode and refuse edits until the caller stops; and closing a subOVI with unsaved changes while a caller is open offers
  Save, Defer Decision and Cancel, keeping the changes in memory for the callers until the last one closes, when it is
  asked about again with Don't Save.

- Fix: a menu taller than the Project Explorer's window scrolls with the wheel; before, its File menu was cut off and
  File ▸ Exit could not be reached.

- Fix: in the docked view, the connector pane of the toolbar row picks the cell that is clicked, so a control can be
  given a terminal, and its right-click menu acts on that cell; before, a click there assigned nothing.

- Fix: a subOVI node's terminal whose control has no label shows no name, as LabVIEW shows none for an empty label,
  instead of the control's internal name (`control_1`).

- Fix (#20): a caller sees and runs an open subOVI as it is in memory, with its unsaved edits, as LabVIEW looks for a
  subVI in memory first (DT-045 §8). An edit to a subOVI redraws its open callers at once, and closing it without
  saving takes them back to the saved file.

- Fix (#21): every control and indicator on the front panel can be resized by its handles, as in LabVIEW. VISA resource
  name, string, numeric and path behave as measured: eight handles (a numeric only the left and right ones, it never
  grows taller), LabVIEW's narrowest width and the default height as the smallest, the text field taking the extra
  room, and a taller string or VISA resource name wrapping its text onto more rows. Enums, rings, DAQ names, Booleans,
  refnums, error clusters and graphs resize too, by analogy, pending a check against LabVIEW. The size is kept in the
  `.ovi`.

- Projects begin (DT-099): Solder's core reads and writes a project as `.sdproj`, LabVIEW's `.lvproj` copied one to one
  in JSON: My Computer with its items, virtual, snapshot and auto-populating folders, Dependencies and Build
  Specifications, in LabVIEW's order. The Project Explorer window comes next.

- The Project Explorer window (DT-099, stage a1): the tree of a project (Project, My Computer, its items, Dependencies
  and Build Specifications) with its eight menus, its toolbar and the right-click menus of each kind of item, all as
  measured in LabVIEW. Rows select, expand and collapse, and Expand All and Collapse All work; what is not built yet is
  greyed and says why. Creating, opening and saving a project comes next.

- Creating, opening, saving and closing projects (DT-099, stage a2): File ▸ Create Project... (also from Getting Started's
  Create Project button) opens the Create Project dialog with LabVIEW's tree and its 17 rows; Blank Project opens a new
  "Untitled Project N" and Blank OVI a new OVI, the other rows are greyed until templates exist. With OVIs open, a new
  project first asks LabVIEW's "Open Items" question. Open Project... and File ▸ Open... open a `.sdproj` at the place
  its file kept; Save Project asks "Name the Project" the first time; closing a project with changes asks "Save changes?
  (Close Project)" and closing the last one leaves Getting Started minimized, as LabVIEW does. The Project Explorer's
  Window menu lists the open windows. Several projects can be open at once.

- Editing a project's tree (DT-099, stage b), as measured in LabVIEW: Add ▸ File, Folder (Snapshot) and Folder
  (Auto-populating), with "Unable to Add Items" for what cannot be added; New ▸ Virtual Folder named in place; F2 renames
  a folder; Remove From Project asks "Remove Items"; items are dragged into folders. Items always keep LabVIEW's order,
  and their paths are stored relative to the `.sdproj`, rebased when it is first saved. Adding a new OVI and renaming an
  OVI item come later.

- An OVI can follow a type definition (DT-096): a control, indicator or constant stores the `.octl` file it follows and a
  copy of its definition, and the `.ovi` format goes to version 7 (older files open unchanged). An OVI whose `.octl` is
  missing opens with its copy but does not run, and the Error list says, as LabVIEW does, "Type Definition '<label>':
  Type definition not found or contains errors." Making and editing type definitions in the editor comes next.

- Fixed: a Cluster Constant saved with its elements did not validate against the format's schema, and a cluster inside
  a cluster was saved with internal names.

- Fixed: an OVI saved after Change to Indicator or Change to Control on a wired array, ring or DAQ name could not be
  opened again ("has no output port"). The wire, broken because it now faces the wrong way, is saved and opens as it
  was, as in LabVIEW.

- The Cluster Constant (Functions ▸ Programming ▸ Cluster, Class & Variant) is built on the Block Diagram: a 100 × 100 frame
  into which numeric, Boolean and string constants are dropped or dragged as its elements, which are typed into, deleted,
  dragged out and moved with it; its wire follows the cluster's type and the frame is resized by eight handles (DT-095).
  Its right-click menu, as LabVIEW has it, shows or hides its label, turns it into a cluster control or indicator on the
  panel (Change to Control, Change to Indicator), creates a copy, a wired indicator or a control (Create ▸), and sets the
  order of its elements by clicks on the diagram (Reorder Controls In Cluster...); each element has a menu of its own,
  whose Representation ▸ changes that element's type. The rows not built yet are greyed with their reason.

- Bundle and Unbundle (Functions ▸ Programming ▸ Cluster, Class & Variant) are built on the Block Diagram: each follows the
  cluster wired to it at once (Bundle at its top), with one row per element, so adding or removing an element of the
  source reshapes them and a wire stays on its row (DT-098). They look as LabVIEW draws them (32 px wide, 8 px a row, a
  type mark per row) and an unwired Bundle is stretched by its bottom handle. Their menus are LabVIEW's, with Add Input
  and Remove Input on an unwired Bundle's rows. Create ▸ Control and Indicator on a cluster make a panel cluster whose
  elements have the cluster's types; they are greyed while a Bundle's output type is still undefined.

- Change to Indicator and Change to Control on a cluster's shell flip the cluster, every element in it and its
  terminal together, as LabVIEW does (DT-095).

- Reorder Controls In Cluster... sets the order of a cluster's elements as LabVIEW does: the panel darkens, each element
  shows its new and current number, a click gives it the toolbar field's number, ✗ restores the order and ✓ applies it
  (DT-095).

- Fixed: a cluster's value was a record by element name, so two elements with the same label or none, as in a
  Cluster Constant holding 1 and 2, gave one value twice (2 and 2). A cluster's value is now the list of its elements'
  values in cluster order, as LabVIEW gives it; the error cluster, a VISA resource name and a DAQ task are still read
  by name (DT-095 §1).

- Fixed, each as measured in LabVIEW: Quotient & Remainder of integers divided by zero gave the largest integer (it
  gives quotient 0 and remainder x) and lost the last digits of a large I64; a NaN converted to an integer gave 0 (it
  gives the largest value of the type); Scale By Power Of 2 of an integer by the width of its type or more gave a
  wrong value (it gives 0, or −1 for a negative number scaled down); Compound Arithmetic with an inverted output did
  not wrap an 8- or 16-bit result, and in Multiply mode with an inverted input it stopped the Run on a zero (it
  divides in DBL and gives Inf).

- Fixed: two loops that called the same non-reentrant subOVI at the same time could get each other's results when the
  subOVI had nothing that waits (no loop, no Wait, no I/O). Such a subOVI now serves one call at a time, like any other
  non-reentrant one (DT-045, DT-063 §2). A call costs a little more for it; a reentrant subOVI is called as before.

- Fixed: two shift registers of strings, arrays or clusters that exchanged their values in a loop both ended with the
  same value, and an output tunnel wired to such a register's left terminal gave the new value instead of the one the
  last iteration began with.

- Fixed: in a Case Structure whose frames each held two or more functions that take time (two Waits, two file or VISA
  functions with error out unwired), only the first frame read the values of the input tunnels; the others read zero.

- The `.ovi` format is version 6 (DT-095): a cluster can hold its elements, each a control or constant of its own, in
  cluster order. Files of earlier versions open unchanged; this version's files do not open in 0.13 or earlier. The
  editor's side of the clusters made by the user comes next.

- Controls ▸ Modern ▸ Array, Matrix & Cluster ▸ Cluster puts a cluster on the Front Panel (DT-095): a 100 × 100 shell
  with LabVIEW's bevel into which controls are dropped, or dragged, and become its elements in drop order; the shell
  resizes by its handles and has its measured right-click menu (Visible Items ▸ Label works, the rest is greyed with its
  reason). Its terminal is the 38 × 38 icon, magenta for mixed contents and brown for numbers only, and a cluster wire
  is 3 px with a dotted core. Reordering, Change to Indicator and AutoSizing come next.

- OVIs are saved as `.ovi` files, the name of Solder's program unit (DT-094). Files saved as `.sdg` or `.qvi` still open,
  and Ctrl+S keeps their name, because the OVIs that call them name them so; Save As offers the same name with `.ovi`.
  The examples, ovi.lib and the DAQ add-on are renamed: an OVI saved with an earlier version that calls
  `<ovilib>/…/X.sdg` finds `X.ovi`. The installer associates `.ovi` too. The DAQ add-on of this version needs this
  version, which is the first that opens `.ovi`.

## 0.13.0-beta — 2026-11-16

Solder's DAQ add-on closes its first stage: besides analog input, it now writes analog outputs, reads and writes digital
lines and starts a task on a digital trigger, on the simulated devices, and its OVIs mark their inputs Required as NI's
do. The add-on is `Solder-DAQ-0.13.0-beta-<platform>.zip`: unzip it into `~/.local/share/solder/addons` on Linux or
`%APPDATA%\Solder\Addons` on Windows and restart Solder. It needs this version: its OVIs use rings, which 0.12 cannot
open.

- Create ▸ Constant and Create ▸ Control on a subOVI input make the control's own class with its default value, not a 0: a
  numeric constant holding the default (Timing's rate gives 1000) and, for a Text or Menu Ring input, a Ring Constant (or ring
  control) carrying the items, the default and Allow Undefined Values (Trigger's edge gives Rising). The constant sits 8 px
  left of the node, right-aligned, as LabVIEW places it.
- The Polymorphic OVI window's instance list scrolls, by the mouse wheel and with a scrollbar when its rows overflow, and
  keeps the selected row in view; rows past the fourth two-line row used to be out of reach (DAQ Read has six).
- A ring's Edit Items no longer saves two items with the same value: an item still being typed, or a new item with
  "Sequential values" ticked, is counted before OK, so the warning appears and OK is greyed as in LabVIEW.
- Edit Name... in the Polymorphic OVI window takes LabVIEW's keyboard: Tab and Shift+Tab go round Menu Name, Selector
  Name, OK, Cancel and Help, selecting the text of the field they enter; Enter and Shift+Enter type a line break in
  either field and no longer close the dialog; a focused button is pressed by Enter or Space.
- A click anywhere on a diagram constant selects it: as in LabVIEW, a constant wires only by a 6 x 12 px patch just
  outside its right edge, and not while selected (its right half used to begin a wire, so Delete after a node's dialog
  removed the node that stayed selected instead of the clicked constant).
- A Text Ring or Menu Ring's terminal on the diagram draws a ring, coloured by its representation: a ring that replaced
  a DBL control keeps DBL, its orange terminal and its wire, as in LabVIEW.
- The DAQ OVIs weigh their inputs as NI's DAQmx VIs do (measured): task/channels in, physical channels, lines, rate,
  a trigger's source and a write's data are Required (bold in Context Help, and a call is broken without them); Read's
  and Write's timeout are Optional. DAQ Timing (Sample Clock) takes sample mode and active edge as I32 Text Rings
  (Finite Samples, Continuous Samples, Hardware Timed Single Point; Rising, Falling). The digital Create Virtual Channel
  OVIs pass the driver's extended error information on into their error out, as the analog ones do.
- Replace ▸ on a front-panel object (DT-092): the row opens the Controls palette as a submenu and picking an item
  replaces the object in place, keeping its terminal and wires, label, representation, value and its role of control
  or indicator (what Solder lacks is greyed, as in the palette); a change of data type leaves the wires that no longer
  fit broken. A control's or indicator's terminal on the diagram wires only by a 16 x 12 px patch at its data side, 6 px
  of it outside the icon, as LabVIEW does, and a selected terminal has no wiring zone.
- DAQ digital lines and start triggers, closing DAQ's stage A (DT-076 §10): Create Virtual Channel (Digital Input,
  Digital Output), DAQ Read (Digital Bool 1Line 1Point, Digital U32 1Chan 1Samp), DAQ Write (Digital Bool 1Line 1Point)
  and a polymorphic DAQ Trigger (Start None, Start Digital Edge), now on the DAQ palette. Solder's DAQ driver gives the
  simulated devices' measured ports and lines, line groupings and channel names, the simulated counter a read gives,
  lines held by a started task, timing on digital tasks and the trigger's checks at Start, with LabVIEW's error codes. A
  task now refuses a channel of another kind (an analog input beside an output is -200559, as in LabVIEW).
- Delete after a single click on a control's or indicator's terminal on the diagram now removes the terminal and its
  panel object (the click used to begin a wire: a control or indicator terminal wires only by its arrow, the rest of
  its icon selects it). Deleting a node inside a structure removes the wire from an input tunnel to it, as LabVIEW
  does; the wire to an output tunnel stays broken, and tunnels stay.
- DAQ Write: Create Virtual Channel (AO Voltage) and DAQ Write (Analog DBL 1Chan 1Samp, 1D DBL 1Chan NSamp, 2D DBL NChan
  NSamp), polymorphic and on the DAQ palette, over analog outputs in Solder's DAQ driver with the simulated devices'
  measured behaviour (ranges, auto start, finite and continuous generation, LabVIEW's error codes).
- Numpad Enter and Ctrl+Enter end the editing of a control's or terminal's label, as in LabVIEW (the main Enter still
  types a new line). File ▸ New... works from the block diagram's menu too.
- `.sdg` format version 5 (DT-091): a ring's items are saved as text–value pairs; a ring constant of an older file opens
  with its items numbered by position, as before. A file saved by this version does not open in 0.12 or older.
- DAQ Create Virtual Channel (AI Voltage) takes `input terminal configuration` and `units` as I32 Text Rings with the
  driver's values (Default, RSE, NRSE, Differential, Pseudodifferential; Volts, From Custom Scale), as LabVIEW's.
- The polymorphic OVI's selector: a ":" in a Menu Name makes cascading submenus, in the ring's dropdown (which now opens
  over the ring, as in LabVIEW) and in Select Type ▸, with ticks along the path to the instance; Automatic and its separator
  appear only when the OVI adapts to the data type. Enter in the Selector Name field of Edit Name... types a line break: the ring
  draws one line per line and the list's row grows. DAQ Read's instances have DAQmx's menu tree and two-line selector names.
- The Text Ring and the Menu Ring (DT-091): Controls ▸ Modern ▸ Ring & Enum places them on the panel as plain U16 numerics
  with LabVIEW's sizes and looks (a Text Ring with arrows and no triangle, a Menu Ring with the triangle and no arrows). In
  operate mode a click opens the list of the items with the current one checked, and a pick gives the ring that item's value.
  Their right-click menus, the Ring Constant's too, have LabVIEW's rows: Change to Indicator / Control, Representation (the
  item values wrap as in LabVIEW), Allow Undefined Values, Select Item... and Edit Items...; Edit Items has the Sequential
  values box, an editable Values column and the warning that greys OK when two items share a value. Data Entry..., Disable
  Item, Hide Last Item When Running and the `<Other>...` row are greyed with their reason.
  In Edit Items the list scrolls with the wheel (enum's too), a blank row made by Enter is not an item, the Values column
  shows whole values, and a Text Ring's down arrow from a value with no item goes to the first item.
- The DAQ name controls and indicators have their right-click menu on the panel, in LabVIEW's order: a Task Name's with New DAQ
  Task, Edit DAQ Task and Generate Code (greyed: Solder has no task configuration tool), the other kinds with a Physical
  Channel's rows, and the indicator's with Change to Control and Hide Indicator. Change to Indicator / Control and Data
  Operations work; the rest is greyed with its reason. The control's arrow button opens a list with Browse..., greyed until
  the editor can ask the DAQ engine for names. On a Call Library Function Node a parameter's terminal has its own menu, and its
  Create greys Constant, Control and Indicator while an Adapt to Type parameter is unwired, as LabVIEW does.

## 0.12.0-beta — 2026-11-14

Solder's DAQ add-on acquires: Measurement I/O ▸ DAQ - Data Acquisition places LabVIEW's DAQmx analog-input OVIs, built in
Solder, which run against Solder's own `nilvaiu` and its simulated devices with LabVIEW's error codes. The add-on is a
download of its own, `Solder-DAQ-0.12.0-beta-<platform>.zip`: unzip it into `~/.local/share/solder/addons` on Linux or
`%APPDATA%\Solder\Addons` on Windows and restart Solder.

- The OVI Server Reference constant (DT-090): Functions ▸ Programming ▸ Application Control opens with LabVIEW's 5 x 5 grid
  (the other 24 cells greyed with their reason), and its OVI Server Reference places a teal constant "This OVI" with its label,
  whose Link to ▸ This Application / This OVI changes its class. Its right-click menu has LabVIEW's rows; Create, Help and the
  rest are greyed.
- Fixed: Ctrl+A in a text field of the Call Library Function Node's dialog selects its text, and Delete erases a text
  selected with Ctrl+A on the panel and the diagram, as Backspace did.
- Fixed: Paste centres the copy on the last click on the canvas, as LabVIEW does, not on where the pointer last was.
- Fixed: dragging a wire from the inner half of a wired Case tunnel (just past the glyph) starts a wire from the tunnel
  and makes the output tunnel, instead of dragging the wire's first segment and leaving a stub.
- Measurement I/O ▸ DAQ - Data Acquisition, the DAQ add-on's palette (DT-086, DT-087): LabVIEW's DAQmx palette with DAQ for
  DAQmx, its 6 × 4 grid and empty cells as measured. DAQ Create Virtual Channel, DAQ Read and DAQ Timing are polymorphic
  OVIs with their selector shown, as LabVIEW's; the DAQ Task Name and Global Channel constants, Wait Until Done, Start,
  Stop and Clear Task place what they say; Create Task is under DAQ Advanced Task Options; the rest is greyed with its
  reason. Add-on palette files can now give their grid's columns, empty cells, constants and greyed entries.
- The DAQ add-on's first OVIs, built in the editor (DT-087): DAQ Create Task, DAQ Create Virtual Channel (AI Voltage),
  DAQ Timing (Sample Clock), DAQ Start Task, DAQ Read (the four analog reads of doubles), DAQ Wait Until Done, DAQ Stop
  Task, DAQ Clear Task and DAQ Fill In Error Info, with LabVIEW's connector (4833) and terminals,
  calling the add-on's `nilvaiu`; a whole finite analog-input acquisition runs on the simulated device with LabVIEW's
  error codes. As in LabVIEW, Stop Task and Clear Task do their work even when given an error, and pass it on.
  The ring controls of Create Virtual Channel are I32 controls until Solder has rings with free values.
- Fixed: a name typed into a DAQ name constant was lost on Enter; it is kept, as a VISA resource name's.
- Fixed: a Call Library Function Node with an array parameter left unwired broke the OVI; it now passes an empty array,
  as LabVIEW does (NI's DAQmx reads leave theirs unwired).
- A refnum wired into an Adapt to Type parameter of the Call Library Function Node is passed as the address of its
  value, as LabVIEW does (DT-090), so This Application goes into DAQmx's `lvAppReference`.
- Fixed: a Case structure's output tunnel refused a VISA resource name, a DAQ name or an array (a broken wire); it now
  takes any type, as in LabVIEW.
- Connector pane, Patterns ▸ (DT-075): every one of the 36 patterns can be chosen. Each assigned terminal moves to the
  nearest cell of the new pattern, as LabVIEW does, and those left without a cell are dropped (their controls stay).
- DAQ name controls and indicators (DT-076 §5): Controls ▸ Modern ▸ I/O ▸ DAQ Name Controls (DAQmx Name Controls in LabVIEW)
  holds the seven kinds as measured, each putting a control with its terminal; the indicator comes from Change to Indicator
  or Create ▸ Indicator. They look as a VISA resource name's, wider on a control (168 × 26, 104 × 26 the indicator). A task
  control gives the empty task, or the caller's task in a subOVI, and a task indicator shows its name. Create ▸ Constant, Control
  and Indicator on any DAQ name terminal make the object of the same kind, which also reaches the DAQ name constant, and Change
  to Control / Indicator flip a terminal. The dropdown of names and the menus' other rows are greyed.
- DAQ's driver, `nilvaiu` (DT-087): Solder's own library with the 20 functions DAQmx's VIs call in LabVIEW, under NI's
  names and with the parameters measured on them, over Solder's DAQ engine and its simulated devices. A task travels as
  measured in LabVIEW: Create writes the address of a task record the I/O process keeps, and the other functions get the
  address of the driver's own task object, checked before use (0 or any other address gives -200088). Creating tasks and
  analog-input voltage channels, sample-clock timing, Start, Stop, Wait Until Done and the four analog reads of doubles
  work; analog output, digital lines, the digital start trigger and the writes answer -1 with a text saying they are not
  built in Solder yet. Errors leave their details in `extendedErrorInfo` after `<append>`, as DAQmx does. Start on a task
  with no channels is now -200478, as measured. One task's read or wait no longer holds up the others.
- DAQ names in the diagram (DT-076 §5, DT-087 §7): one type with LabVIEW's kinds (task, global channel, physical
  channel, terminal, scale, device, switch), in DAQ's purple with the zigzag wire, and a DAQ name constant. Every kind
  coerces to a string with a coercion dot, and two different kinds do not connect. The Call Library Function Node passes
  a task wire as LabVIEW does: to an Adapt to Type parameter (Handles by Value) as a cell holding the task's record, whose
  task comes back on the output, and to a pointer-sized integer as the driver's task object, 0 for an empty task. So an
  OVI can create a task in `nilvaiu`, use it and destroy it through its wire.
- The DAQ add-on (DT-087 §8): its folders in `addons/`, with Solder's `nilvaiu` built into them. A Call Library Function
  Node that names a library without a folder, as DAQmx's VIs name `nilvaiu.*`, now loads the copy an installed add-on
  brings in its `resource/` folder, by its full path, before the system searches for it.
- The Call Library Function Node passes strings and arrays as LabVIEW's handles (DT-088): String Handle and Array Handle,
  of any element type and number of dimensions, reach the library with their length or sizes in front and come back as
  the library left them. Its prototypes follow LabVIEW's formats (C and Pascal strings, handles and pointers to handles,
  `Array1DDouble **`), its dialog offers Minimum size only where LabVIEW does and a returned string only C or Pascal,
  and the most dimensions is 63. Every format runs. A string or an array passed as a pointer to a handle reaches the
  library as a null handle when it is empty, as in LabVIEW, and the library may replace the handle or leave it null; if it
  leaves an address that is not a handle, the node gives error 1097 instead of reading it. A Pascal string
  runs, as a parameter and as the return value, as measured in LabVIEW: its length byte and its letters, cut to 255; the
  library always gets 256 bytes, so one that writes a longer string than it was given does not overrun it.
  A library can resize the handles it is given with LabVIEW's memory functions, which Solder offers under
  their own names (`DSNewHandle`, `DSNewHClr`, `DSSetHandleSize`, `DSGetHandleSize`, `DSDisposeHandle`,
  `NumericArrayResize`, `MoveBlock`), so it can return a string or an array longer than it was given; on Windows they are offered as `lvrt.dll`, where a
  library built with LabVIEW's `labview.lib` looks them up. An array handle
  lays its elements out as LabVIEW's `extcode.h` does on a 64-bit system, aligned after the dimension sizes (the first
  double of a 1D array at byte 8).
- Fixed: `node scripts/build-native.mjs` built nothing on Windows, without a word, so a Windows build or release step
  silently kept old native files; it now recognises that it was run directly there too.
- Fixed: a Call Library Function Node parameter that is an array of two or more dimensions refused a wire of that array,
  expecting a 1D one.
- Add-ons (DT-081), first part: Solder reads the add-ons folders at start-up, the system's and the user's
  (`~/.local/share/solder/addons` on Linux, `%APPDATA%\Solder\Addons` on Windows), and an OVI of an add-on is found
  by its symbolic `<ovilib>/…` path, so a `.sdg` that uses it opens wherever the add-on is installed. A broken
  add-on is logged and skipped. A copy in the user's folder wins over the system's. A new add-on appears after
  restarting Solder.
- Add-on palettes (DT-086, step 1): an add-on can fill the palette Measurement I/O, which stays grey until one does. It
  brings `menus/Categories/Measurement/daq.json`, a JSON file with the structure of LabVIEW's `.mnu` (a title and an
  ordered list of items, sub-palettes and spacers), and its functions place the OVIs it ships by their `<ovilib>/…`
  paths. As in LabVIEW, the parent names the file ahead of time and a missing one is skipped silently. A broken file is
  logged and the palette stays grey. Spacers are not drawn yet.
- Free labels (DT-085), as in LabVIEW: a double click on empty space of the panel or the diagram writes a comment
  there. Enter starts a line, Ctrl+Enter or a click away confirms, Escape cancels; they move, resize by their handles
  (the text then wraps), copy and delete as any object, move with the structure they sit in, and have LabVIEW's
  right-click menu with Size To Text. The compiler ignores them. The `.sdg` format goes to version 4.
## 0.11.0-beta — 2026-11-07

Solder talks to LAN instruments by the resource name NI MAX gives them, and the Case Structure takes an error cluster.

- A Case Structure takes an error cluster on its selector (DT-083), as in LabVIEW: frames No Error and Error .., and
  frames by code (Error 7, Error 1..5); a warning runs No Error. Wiring an error cluster to a Boolean Case turns True
  into No Error and False into Error ...
- Bundle By Name (DT-083), the mirror of Unbundle By Name: replaces the elements its rows name and passes the rest.
- examples/error-no-error/ErrorNoError.sdg, built one to one from a LabVIEW VI, gives LabVIEW's results run after run.
- VISA opens LAN instruments by their `TCPIP::host::INSTR` resource (DT-084): Solder speaks VXI-11 itself, so
  `TCPIP0::192.168.1.36::inst0::INSTR` works as NI MAX writes it, with no NI-VISA. HiSLIP is not spoken yet.
- Fixed: a Property Node writing Value to an unwired Boolean indicator showed a number instead of TRUE or FALSE.

## 0.10.0-beta — 2026-11-06

Solder can call native libraries, as LabVIEW does with the Call Library Function Node. This is the first beta that
arrives by itself to whoever has 0.9.

- An OVI can call functions of native libraries with the Call Library Function Node (DT-080), as in LabVIEW: numbers by
  value or by pointer, strings and arrays by their address, the return value, and LabVIEW's errors 7, 12 and 15 when the
  library or the function is missing. The library runs in Solder's I/O process, so a fault in it is error 1097 and
  Solder keeps running, where LabVIEW with Error Checking Disabled crashes. Works on Linux and Windows.
- The Call Library Function Node has its editor (DT-080): Functions ▸ Connectivity ▸ Libraries & Executables places it; the node is
  drawn as LabVIEW's (40 × 27 empty, a row per parameter and for the return value, header orange for Run in UI thread and pale
  yellow for any thread, path pins with Specify path on diagram); its dialog "Call Library Function" (Function, Parameters,
  Callbacks, Error Checking, with the live C prototype) opens by double click and Configure..., and OK applies it as one step of
  undo with the wires following their parameters. The function list, the callbacks, the wizard, Create C File and System Exec.vi
  are greyed with their reason.

## 0.9.0-beta — 2026-11-06

Solder updates itself: from this version on, each new beta is offered when Solder starts. This one is still
installed by hand.

- When it starts, Solder looks for a newer beta and, if there is one, offers it; once accepted, it is downloaded and
  installed when Solder closes, on Windows, AppImage and `.deb` (DT-082). The update replaces `ovi.lib`, and the
  message says so. Updating to this version is still by hand; the next ones arrive by themselves.

## 0.8.0-beta — 2026-11-06

Solder's program unit is now the OVI, and it grows as LabVIEW's VIs do: polymorphic OVIs and Solder's own
`ovi.lib`, the Property Node and control references, VISA over serial ports, LabVIEW's 36 connector patterns,
the first Express VIs and spreadsheet files; the canvases scroll and each OVI remembers its windows. The `.sdg`
format goes to version 3: files of 0.4 to 0.7 open as before, migrated, but a file saved by 0.8 does not open
in an older Solder.

- The Front Panel and the Block Diagram scroll as LabVIEW's do: Windows 11 overlay scrollbars (a thin thumb that widens
  with its arrows under the pointer), a range a quarter of the view past the content that always includes the view,
  30 px per wheel notch, 32 px (panel) and 30 px (diagram) per arrow, a whole view per track click, arrows that repeat
  while held, and the canvas scrolls by itself when something is dragged out of it.
- An OVI saves where its windows were and how far each was scrolled, and opens them there again, as LabVIEW does
  (DT-078); moving or scrolling a window does not make it modified. The `.sdg` format goes to version 3; files of
  version 2 open as before.
- VISA Configure Serial Port, in Instrument I/O ▸ Serial and VISA Advanced ▸ Bus/Interface Specific ▸ Serial: a
  polymorphic OVI of ovi.lib, (Instr) and (Serial Instr), drawn anew from LabVIEW's, with its connector (pattern 4833),
  defaults and optional terminals. Stop bits and flow control are numeric controls until Solder has ring controls.
- Connector panes know LabVIEW's 36 patterns, numbered as LabVIEW numbers them (DT-075): an OVI's pane and its subOVI
  node follow its own pattern. The `.sdg` format goes to version 2 (a terminal's cell is LabVIEW's connector index);
  files of version 1 open as before, migrated. Choosing another pattern is not built yet.
- ovi.lib, Solder's own library of OVIs (DT-073): a subOVI can be named by a symbolic `<ovilib>/…` path.
- Polymorphic OVIs in the editor (DT-074): Select an OVI... takes a `.sdp`; its node shows the polymorphic OVI's icon, an
  optional selector ring (Visible Items), a menu with Select Type ▸ and Automatic that follows what is wired, and opens
  the instance it calls.
- File ▸ New... opens the New dialog (OVI ▸ Blank OVI, Polymorphic OVI), and the Polymorphic OVI window edits a `.sdp`: its
  list of instance OVIs with their menu and selector names, the icon and selector options, saved as a `.sdp` that File ▸
  Open takes and Open Polymorphic OVI on a node opens. Edit Icon... takes an SVG file until there is an icon editor. VISA
  Configure Serial Port is placed from both Serial palettes with its terminals at once.
- VISA Bytes at Serial Port, in Instrument I/O ▸ Serial and VISA Advanced ▸ Bus/Interface Specific ▸ Serial: a VISA
  Property Node that reads how many bytes wait in a serial port, as LabVIEW places it. A Property Node whose rows
  are all read-only greys Change All To Write.
- The Property Node runs (DT-072), so far from the command line: a node linked to a numeric, Boolean or string
  control or indicator reads and writes Value, Visible, Disabled, Key Focus and Label.Text, and a VISA one reads and
  writes Timeout Value, the termination character and the serial settings, with LabVIEW's rules for errors (a
  failing row stops the node, Ignore Errors inside Node runs them all). In the editor's Run, Visible hides a control,
  Disabled stops it (2 also greys it), and Position and Bounds read and move it.
- The Property Node in the editor (DT-072): Create ▸ Property Node ▸ on a numeric or Boolean control's terminal or
  panel object lists the control's properties as LabVIEW does, the ones not done yet greyed, and the picked one hangs
  from the cursor as an implicit node with LabVIEW's look (cream header, the control's label above, a row per
  property in its type's colour). Its menus change a row's property, turn rows to write or read, add and remove
  rows, relink the node to another control (Link to ▸ Pane ▸), set Ignore Errors inside Node and create a constant,
  control or indicator wired to a row. The VISA Property Node is in Functions ▸ Instrument I/O ▸ VISA ▸ VISA
  Advanced and in Create ▸ Property for Instr Class ▸ of a VISA resource name. A numeric control's panel object now
  has its right-click menu.
- Control references (DT-072): Create ▸ Reference on a numeric or Boolean control makes a control reference
  constant with LabVIEW's look and teal wire; its Create ▸ Property for <class> Class ▸ makes a Property Node fed
  by a reference, and Disconnect From Control turns a control's Property Node into one. A node fed by a reference
  runs as a control's own Property Node does, passes the reference on through reference out (even after an error),
  and gives error 1055 for a refnum that names no control, as LabVIEW. Create ▸ Control and Indicator on a reference
  make a control refnum on the panel, which carries a reference into a subOVI; on the reference constant these two
  rows work in Solder, where they close LabVIEW 2026 Q3. Not A Number/Path/Refnum? takes a control reference. A
  right-click menu taller than the window scrolls with the wheel.
- The editor calls Solder's program unit an OVI, Open Virtual Instrument, where LabVIEW says VI (DT-071): File ▸ New
  OVI, OVI Properties, Select an OVI..., subOVI and Express OVI in the menus, palettes and dialogs, Recent OVIs in the
  Getting Started window, and the run and error messages. NI's own file names, such as `Trim Whitespace.vi`, keep
  theirs.
- VISA Open, Write, Read and Close talk over serial ports (DT-070): `ASRL<n>::INSTR` (on Windows `COM<n>`, also as
  the alias `COM<n>`), `ASRL<device>::INSTR` such as `ASRL/dev/ttyUSB0::INSTR`, and aliases kept in Solder's
  `visa-ports.conf`. A new serial session has LabVIEW's settings (9600 baud, 8 data bits, no parity, 1 stop bit,
  2 s timeout) and a Read stops at the line feed with no warning, as measured. The serial code is Solder's own, on
  termios and on the Win32 API. VISA Open writes a resource name back with its keywords in capitals, and a name that
  is no resource is "not found" (-1073807343), as LabVIEW says. VISA Configure Serial Port and Bytes at Serial Port
  stay greyed until the Property Node.
- Array To Spreadsheet String and Spreadsheet String To Array, in Functions ▸ String, write and read arrays of
  numbers and strings as LabVIEW does (DT-067).
- Write Delimited Spreadsheet and Read Delimited Spreadsheet, in Functions ▸ File I/O, write, append and read
  delimited files as LabVIEW does, with Read's instance ring choosing Double, Integer or String (DT-067).
- A wire's junction dot is drawn where its branches part, as in LabVIEW, so it no longer stays behind when a node
  moves or a segment is dragged; a segment that branches share moves with all of them, and a branch finished on
  another wire starts where LabVIEW starts it (DT-068).
- A file function whose path is unwired opens the system's own file dialog, with LabVIEW's title for each function
  and operation (or the wired prompt), in the folder of the last file chosen; a Cancel gives LabVIEW's outputs.
  Open/Create/Replace File's "replace or create with confirmation" and Delete's confirm now ask before they replace
  or delete, instead of always cancelling. The command line still answers every dialog Cancel (DT-067).
- Time Delay, in Functions ▸ Programming ▸ Timing, is the first Express VI (DT-069): placing it opens its
  configuration dialog ("Configure Time Delay [Time Delay]"), as do a double click and Properties; OK configures it as one
  undo step ("Undo Change Attribute") and the Delay Time terminal moves into a row under the icon, keeping its wire.
  The node and its right-click menu are drawn as LabVIEW's; the rows the editor cannot do yet are greyed with their reason.
  Dragging the node's bottom edge shows more terminals as rows, and View As Icon draws it as its icon alone.
- File Dialog, in Functions ▸ File I/O ▸ Advanced File Functions, is the second Express VI: it asks with the system's
  dialog for a file or a folder, existing, new or either, one or several, with its prompt, button label and pattern,
  and says whether what was chosen exists, as LabVIEW does (DT-069, DT-067). Arrays of paths now run and show on the
  panel.
- Fixed: a path constant, dropped from the palette or made with Create ▸ Constant, is ready to type into at once,
  as in LabVIEW; what was typed into it first was lost, and the Run then gave error 1430.
- Fixed: the toolbar's Abort tooltip, the Debug Window and the Error List name the VI by its file once it is saved,
  instead of keeping "Untitled N".

## 0.7.0-beta — 2026-10-28

A VI can now talk to instruments and read and write files, as in LabVIEW:
Solder's own VISA over TCP sockets and the text file functions, both served by
a library of Solder's own in Rust that the Linux and Windows packages carry. Files
saved by 0.6 open unchanged.

### Instruments

- Solder speaks to instruments through its own VISA, written in Rust, with no
  NI-VISA needed (DT-065). VISA Open, Write, Read and Close run in a VI from the
  command line, against a TCP socket instrument, with LabVIEW's codes and
  behavior: a Read keeps what arrived at a timeout, Write and Read on a name
  never opened open it, and closing a closed session is a warning (DT-066). In
  the editor they run in a process of their own, so that a fault in the
  instrument code cannot close the editor.
- The editor draws and edits the VISA resource name: its purple wire, the
  constant on the diagram, the control and indicator on the panel with their
  terminals, the dropdown arrow (its menu only has Refresh, greyed, until
  Solder can find resources), their right-click menus as LabVIEW has them, and
  Controls ▸ Modern ▸ I/O with VISA resource name done.
- Functions ▸ Instrument I/O, with its VISA, Serial, GPIB and Instrument Drivers
  folders as LabVIEW lays them out. VISA Open, Write, Read and Close are placed from it,
  drawn as 32 × 32 nodes with their terminals where LabVIEW has them, wired and run
  (their right-click menus are LabVIEW's); the other elements are greyed with their reason.

### Files

- The path type (DT-067): a path is kept as its kind and components, read and
  written with the rules of the system Solder runs on, and saved in the `.sdg`
  as components, so a VI keeps its paths on another system. Build Path, Strip
  Path, Path To String, String To Path, Path Type, Path to Array of Strings,
  Array of Strings to Path, the Path, Empty Path and Not A Path constants, and
  Equal?, Not Equal?, Empty String/Path? and Not A Number/Path/Refnum? on paths
  run in a VI with LabVIEW's results, measured case by case on Windows. A path
  never wires to a string, as in LabVIEW. Names beyond ASCII work, without
  LabVIEW's byte limit. The editor draws and edits the path: its teal dashed
  wire, the terminals, the Path, Empty Path and Not A Path constants on the
  diagram, and the File Path Control and Indicator on the panel, whose browse
  button opens the system's file dialog.
- Functions ▸ Programming ▸ File I/O opens with every subpalette as LabVIEW lays it
  out; from it, Build Path, Strip Path, the three path constants, Path To String,
  String To Path, Path to Array of Strings, Array of Strings to Path and Path
  Type are placed (the four conversions also from String), and File Path Control
  and Indicator from Controls ▸ Modern ▸ String & Path. The right-click menus of
  the path objects are LabVIEW's, with Data Operations and View As Icon working;
  the rest of File I/O is greyed with its reason.
- Open/Create/Replace File, Close File, Write to Text File, Read from Text File,
  Get File Size and Delete are placed from File I/O, and a Run that uses them gets the editor's I/O process (DT-067).
  The two text functions have Convert EOL and Read Lines in their right-click
  menus, as LabVIEW does; Create on Open's operation and access makes an enum
  with LabVIEW's items. They give LabVIEW's bytes, positions and error codes, and
  the files a Run leaves open are closed when it finishes. The nodes are 32 × 32
  with LabVIEW's terminal rectangles (the prompt on top, Open's disable buffering
  at the bottom), the file refnum's wire is the path's teal but solid, and Read
  from Text File's icon changes with Read Lines.
- A path too long for a File Path Control or Indicator shows its root and its tail
  with "..." between, cut inside a component, as LabVIEW does (`C:\...ree\file.txt`),
  and `...\...` when nothing fits. Ctrl+A while typing in a text box (a control's,
  a constant's or a label's) selects all its text.

## 0.6.0-beta — 2026-10-25

A VI now runs on every core of the computer, as in LabVIEW: its parallel loops
and branches are shared out among one thread per logical processor. What a VI
computes does not change; files saved by 0.5 open unchanged.

### Running a VI

- One scheduler of Solder's own runs every clump of a VI (DT-061): parallel loops,
  waits, subVI calls and dialogs resume in the same order on every operating
  system, and a VI whose clumps can no longer go on stops with an error that
  names them instead of hanging.
- A clump that waits saves its state and returns instead of suspending its
  stack (DT-063 §8), so it can go on on any thread, as LabVIEW's clumps do. VIs
  no longer need JSPI: the command line and the tests run on any Node with no
  flag. A loop runs as fast as before with Allow Debugging off, and about a
  third faster with it on while nobody is debugging.
- A Run uses every core, as in LabVIEW (DT-063): its clumps run on a pool of
  one thread per logical processor that share one memory, and a thread with
  nothing to do takes work from another's queue. Two loops that only compute
  run side by side. The editor keeps its pool between Runs, so a Run starts at
  once; the command line takes `--threads N` (1 runs the clumps in the exact
  order). The scheduler is WebAssembly inside the compiled VI, and the editor's
  windows are cross-origin isolated, which a shared memory needs.
- The front panel lives in that shared memory, as LabVIEW's transfer buffer
  (DT-063 §10): the diagram writes indicators without waiting for the editor
  (a million writes to an indicator take about 21 ms) and the panel shows the
  last value at each pass; a chart still gets every point its history holds.
  A large control is read whole even while it is being written.

### Fixes

- The toolbar's Abort button stops a VI whose loop writes to the panel all the
  time: the window is no longer rebuilt on every value, so a click on a button
  reaches it while the VI runs (Ctrl+. already worked).
- In the editor, the source of an error raised inside a subVI names the chain
  of VIs again ("Scan From String (arg 1) in Parse Reply.sdg->Instrument
  Protocol.sdg"), as the command line already did.

## 0.5.0-beta — 2026-10-23

From this version on, until 1.0, every beta comes from the development line:
a release with new features raises MINOR, one with fixes only raises PATCH, and
0.4 is no longer maintained (DT-062). Files saved by 0.4 open unchanged.

### The Front Panel

- The panel is drawn as plain HTML and dressed by a panel style (DT-058): Old
  School keeps LabVIEW 2026 Q3's look pixel by pixel, and the new Solder and
  Solder Night styles give it Solder's own. The installed app shows Solder;
  `SOLDER_PANEL_STYLE=old-school|plain|solder|solder-night` chooses another.
- A VI can have a style of its own: a `.css` with its name next to its `.sdg`,
  shown at once when it is created, edited or deleted.

### Arrays as in LabVIEW

- A new Array or Array Constant is born empty and breaks the VI ("Control
  contains no elements and is undefined") until a control, indicator or
  constant is dropped inside; that element gives the whole array its type and,
  on the panel, makes it a control or an indicator (DT-060).
- The element has its own right-click menu: Representation retypes the whole
  array, and Change to Indicator or Control flips it, keeping its wires.
- The element of a panel array can be selected by its edge and dragged out,
  cut or deleted, as in LabVIEW; the array is left empty with its wires.
- A right-click on a panel array's terminal on the Block Diagram opens its
  menu, as in LabVIEW, and View As Icon draws the terminal compact.

### Fixes

- `npm test` and the command line run on Node 26, which refuses to start with
  `--experimental-wasm-jspi`: the flag is passed only to a Node that still
  needs it (24.19 and older). Checked on Node 24.19, 24.22 and 26.12.
- Everything fixed in 0.4.1, 0.4.2 and 0.4.3, below.

## 0.4.3-beta — 2026-10-23

### Fixes

- On Windows, a VI with two loops that wait in parallel no longer hangs: when
  both waits ended together, one loop stopped after its first iteration and the
  VI never finished
  ([#1](https://github.com/anlaco/solder/issues/1)).
- One-dimensional arrays are drawn as in LabVIEW: the array constant's index
  with its double line, its elements as 13 × 19 tiles and its greyed element;
  the panel array's shell, its index box level with the shell, the smaller
  element of a numeric indicator array and the dark bevel around its elements;
  and the array terminal's index cells and 123 field at LabVIEW's size.

## 0.4.2-beta — 2026-10-18

### Fixes

- The pointer over a numeric or string control on the Front Panel says what a
  press will do, as in LabVIEW: the arrow on its edge and label, the I-beam in
  the value box and the hand over the incrementer; the arrow all over once the
  control is selected.
- A selected numeric or string control moves when dragged from its value box;
  a click there no longer types, and a double click types over the whole value.
  Dragging the label of a selected control moves the control with it.

## 0.4.1-beta — 2026-10-17

### Fixes

- A numeric or string control on the Front Panel can be moved again: a press
  within 4 px of its edge drags it, as in LabVIEW, and a press deeper in the
  value box still types in it. Before, the whole control typed and could not be
  dragged.

## 0.4.0-beta — 2026-10-17

The first beta: the maintainable version (DT-048, DT-055). The `.sdg` format is
frozen as version 1, and every later change to it will come with an automatic
migration, so the files you save now keep opening. The next month brings only
fixes (`0.4.x-beta`).

### Files

- VIs are saved as `.sdg`; a `.qvi` saved by an alpha still opens. A file of a
  newer format version is refused instead of read halfway.

### Programs as in LabVIEW

- The three examples in `examples/` give, value by value, what the same VIs
  give in LabVIEW 2026 Q3, and a test checks them.
- Enums are editable: Edit Items… and Select Item… on the constant, the control
  and the indicator, and a Case on an enum names its frames by item.
- Unbundle By Name reads the elements of a cluster, such as the status of an
  error cluster.
- A control keeps its current value apart from the default the file saves: Make
  Current Values Default and Reinitialize Values to Default set and restore it.
- Numbers show LabVIEW's significant digits.

### The editor

- File ▸ New VI, Close and Close All work as in LabVIEW, and Solder starts on its
  Getting Started window.
- A constant grows to the left while it is typed into; a new wire turns 7 px
  after its source; palettes stay inside the window.
- The explanations of greyed items and the error messages are in English, and
  the explanation over a dialog closes on a click elsewhere in it.

### Themes

- Solder has a look of its own: the Solder theme, with white nodes, graphite
  lines, a dotted canvas and an orange accent. Wires and terminals keep
  LabVIEW's type colors, and every node takes the same space as before.
- The Old School theme keeps the LabVIEW 2026 Q3 look, pixel by pixel. Start
  Solder with `SOLDER_THEME=old-school` to use it (`SOLDER_THEME=solder` for the
  other); there is no option in the interface yet.

### Debugging

- Tunnels, shift registers, a loop's i and N show their values to probes and to
  Highlight Execution; the tag of an array wire shows its element count (#4).
- Single stepping stops where LabVIEW does: before a structure runs, at the end
  of each iteration, after a Case's frame, at the end of each Flat Sequence frame
  and at the end of the diagram, with LabVIEW's tooltips; it no longer stops at
  constants or panel terminals.
- The Error list shows warnings with Show Warnings (constants nothing reads,
  unwired panel terminals), and the List Warnings triangle opens it.

## 0.3.0-alpha — 2026-10-10

The first fixes from writing three real programs with Solder (`examples/`),
each checked against LabVIEW 2026 Q3.

- Two calls of the same non-reentrant subVI that run at the same time no longer
  mix their inputs: each call answers its own (bug #30).
- A Case Structure takes a string selector: frames match the exact string, or
  ignore upper and lower case with Case Insensitive Match (marked `A=a` on the
  frame); `""` is the empty string and `"a".."c"` a range that stops before
  `"c"`. Wiring a string turns the frames into `"True"` and `"False", Default`.
- A Case Structure takes an enum selector: frames are named by the enum's items,
  a Case with a frame for every item needs no Default, and Add Case for Every
  Value adds the missing ones.
- Errors 81 to 85 of Format Into String and Scan From String have a description,
  and their source names the VIs of the call, as in
  `Scan From String (arg 1) in Parse Reply.qvi->Instrument Protocol.qvi`.

## 0.2.1-alpha — 2026-10-09

Fixes found by installing and using 0.2.0-alpha on Windows.

- A wire that leaves a structure and goes back into the same structure is now
  broken with a clear reason; before, it passed the check and the compiler
  produced invalid WebAssembly.
- Solder has its own icon (two wires joined by a bead of solder), on the
  installer, the program, its windows and `.qvi` files.
- On Windows the program is `Solder.exe`, `.qvi` files open in Solder with a
  double click (in the running Solder if there is one), and the shortcut no
  longer describes the app in internal jargon. Uninstalling no longer leaves
  a copy of the installer nor the `.qvi` registration behind.
- File ▸ Exit (Ctrl+Q) asks about each VI with unsaved changes (Save, Don't Save,
  Cancel) and quits, instead of closing the VI and opening a blank one.
- A new VI opens its Front Panel in front and its Block Diagram behind it, as
  LabVIEW does; Ctrl+T tiles them left and right and Ctrl+E goes from one to the
  other.
- Create Constant, Control and Indicator work on the condition terminal of a
  While Loop (Create Control makes a Stop button) and on the count and iteration
  terminals of the loops.
- The two windows of a VI can no longer swap their copies of the diagram when
  both change at the same moment, so Save always writes the latest one.
- A control dropped on the Front Panel exists at once, with its terminal on the
  diagram and the VI marked modified, while its label is still being typed.
  Save, Save As, Exit, Run and switching windows commit a label or value being
  typed first.
- A Run no longer changes the VI: operating a control while it runs (a Stop
  button, for instance) does not mark it modified nor change the values the
  file saves, and a latched Boolean is FALSE again once it has been read.

## 0.2.0-alpha — 2026-10-09

### Broken wires (DT-046)
- Delete on the diagram, and deleting a control or indicator on the panel, leave
  their wires broken with a loose end, as LabVIEW does; Cut still takes them.
- A VI whose subVI lost a connector terminal always opens, with those wires
  broken, instead of failing to open.
- Edit ▸ Remove Broken Wires (Ctrl+B) removes every broken wire, or only the
  selected ones; a loose end can be wired again onto a terminal.
- Broken wires are drawn as in LabVIEW and their reason shows on hover, in the
  wire menu (List Errors) and in the Error List.

## 0.1.0-alpha — 2026-10-09

The first version you can write real programs with: data, decisions, loops,
subVIs, graphs and debugging, cloned from LabVIEW 2026 Q3.

### The language
- Numbers (I8 to U64, SGL, DBL) with LabVIEW's coercion, Booleans, strings,
  arrays of one and two dimensions, clusters and the error cluster.
- Numeric (with Conversion, Data Manipulation and the scientific constants),
  Boolean, Comparison, String, Array and part of Timing.
- Format Into String and Scan From String, checked case by case against LabVIEW.
- While Loop, For Loop with shift registers and auto-indexing, Case Structure,
  Flat and Stacked Sequence.
- SubVIs: one compiled module per hierarchy, non-reentrant by default with its
  state kept between calls and Runs, preallocated clones.
- Everything compiles to WebAssembly and runs by dataflow, parallel branches at
  the same time.

### The editor
- Front Panel and Block Diagram windows, palettes and menus cloned from
  LabVIEW; what is not done yet is greyed out and says why.
- Wiring, undo, Create ▸ Constant/Control/Indicator, copy, cut and paste,
  several VIs open at once, the connector pane, VI Properties ▸ Execution.
- Waveform Chart, Waveform Graph and XY Graph.
- Debugging: Highlight Execution, probes and the Debug Window, breakpoints and
  stepping, the Error List.

### Known gaps
The icon editor, broken wires (next), more than two array dimensions, the
other graphs and chart modes, file and instrument I/O, the Event Structure and
much more. See [`docs/design/labview-plan.md`](docs/design/labview-plan.md).

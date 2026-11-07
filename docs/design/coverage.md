# How much of LabVIEW Solder covers

> Living record of which parts of LabVIEW 2026 Q3 already exist in Solder, kept up to date as each step is
> finished. It measures **coverage of functionality**, not quality: something counts as covered when it exists
> in Solder and does its main job, even if it is incomplete or its look still differs from LabVIEW. What is
> missing inside a covered item is said in a few words after it.

## How it is kept

- **Features** (below) are checklists written by hand: tick an item (`- [x]`) when it exists in Solder, add an
  item when LabVIEW shows something the list lacks. Items are LabVIEW's features, never Solder's own extras.
- **Palettes, windows, dialogs and menus** are counted from the inventory,
  [`../schema/inventario-labview.json`](../schema/inventario-labview.json), which the editor already uses to grey
  out what is not done: an entry is covered when its state is `built`; `never` (Solder will not do it) and
  `elsewhere` (Solder solves it by other means, such as Git for source control) are left out of the count. Only the leaves are counted (a function, a menu item, a button), never the folder that holds them.
- After any change, run `node scripts/coverage.mjs`: it rewrites every table between the `coverage:` markers.
  `npm test` fails when a table is out of date.
- A percentage is a count of items, all weighing the same. A part of LabVIEW not captured yet has no
  percentage: it says so, and is not counted.

## Summary

<!-- coverage:summary -->
| Area | Covered | |
|------|---------|---|
| Language and types | 13 / 25 (52 %) | `█████░░░░░` |
| Structures | 9 / 22 (41 %) | `████░░░░░░` |
| Execution | 8 / 15 (53 %) | `█████░░░░░` |
| Diagram editing | 12 / 29 (41 %) | `████░░░░░░` |
| Front panel editing | 9 / 22 (41 %) | `████░░░░░░` |
| SubOVIs, libraries and projects | 7 / 21 (33 %) | `███░░░░░░░` |
| Debugging | 8 / 16 (50 %) | `█████░░░░░` |
| Files | 5 / 15 (33 %) | `███░░░░░░░` |
| Instruments and communication | 5 / 21 (24 %) | `██░░░░░░░░` |
| Functions palette | 210 / 538 (39 %) | `████░░░░░░` |
| Controls palette | 24 / 86 (28 %) | `███░░░░░░░` |
| Windows and dialogs | 141 / 398 (35 %) | `████░░░░░░` |
| Right-click menus | 462 / 1872 (25 %) | `██░░░░░░░░` |
<!-- /coverage:summary -->

## Features

### Language and types

- [x] Dataflow: a node runs when all its inputs have arrived; independent branches run at the same time
- [x] Numeric types DBL, SGL, I8 to I64 and U8 to U64, with LabVIEW's coercion dots and Representation menu
- [ ] EXT (extended precision)
- [ ] Complex numbers
- [ ] Fixed-point
- [x] Boolean
- [x] String
- [x] Enum, with Edit Items… and Select Item
- [x] Ring constant (the panel rings are in the Controls palette)
- [x] Arrays of one and two dimensions
- [ ] Arrays of three or more dimensions
- [x] The error cluster
- [ ] Clusters made by the user (cluster control and constant, Bundle, Unbundle; Unbundle By Name and Bundle By Name exist)
- [x] Path
- [x] File refnum
- [x] VISA resource name
- [x] Control references (strict refnums to a panel control)
- [ ] Waveform
- [ ] Time stamp
- [ ] Variant
- [ ] Classes (LVOOP)
- [ ] Type definitions (`.ctl`)
- [ ] Sets and maps
- [ ] Physical units on numbers
- [x] Broken wires and the broken Run arrow, with the Error List

### Structures

- [x] While Loop, with Stop if True and Continue if True
- [x] For Loop, with its count terminal
- [ ] For Loop with a conditional terminal
- [ ] Parallel For Loop iterations
- [x] Shift registers
- [ ] Stacked shift registers (several elements)
- [x] Tunnels, Last Value
- [x] Auto-indexing tunnels
- [ ] Concatenating tunnels and conditional tunnels
- [x] Case Structure with Boolean, numeric, string, enum and error cluster selectors (Add Case, Delete, Default; no Duplicate Case, Rearrange)
- [x] Flat Sequence
- [x] Stacked Sequence, with sequence locals
- [x] Expression Node
- [ ] Formula Node
- [ ] Event Structure
- [ ] Timed Loop and Timed Sequence
- [ ] Diagram Disable and Conditional Disable
- [ ] In Place Element Structure
- [ ] Feedback Node
- [ ] Local variables
- [ ] Global variables
- [ ] Structure auto-grow

### Execution

- [x] Compiled to WebAssembly with Solder's own encoder (no interpreter)
- [x] Indicators updated live while the OVI runs
- [x] Several threads: one per logical processor, with work stealing
- [x] Abort Execution (button and Ctrl+.)
- [x] Run mode on both windows
- [ ] Run Continuously
- [x] Non-reentrant subOVIs, with their state kept between calls
- [x] Preallocated clone reentrant subOVIs
- [ ] Shared clone reentrant subOVIs
- [ ] Recursion
- [ ] Execution systems and priorities
- [ ] Inline subOVI into calling OVIs
- [ ] Automatic error handling
- [ ] Synchronous Display
- [x] Running an OVI from the command line, as LabVIEWCLI does (`solder run`)

### Diagram editing

- [x] Placing from the palettes
- [x] Wiring, branches from a wire, bends
- [x] Selecting, moving and deleting
- [x] Undo and Redo
- [x] Cut, Copy and Paste, also between OVIs, and Ctrl+drag
- [x] Create ▸ Constant, Control and Indicator on terminals and wires (no Scalar ▸, no Channel Writer)
- [x] Constants edited in place
- [x] Free labels and owned labels
- [x] View As Icon
- [x] Remove Broken Wires (Ctrl+B)
- [x] Replace ▸ between Flat and Stacked Sequence
- [ ] Replace ▸ on any node
- [ ] Insert ▸ on a wire
- [ ] Remove and Rewire
- [ ] Clean Up Diagram
- [ ] Align, Distribute and Reorder
- [ ] Create SubOVI from the selection
- [ ] Tools palette (wiring, scroll, color… tools)
- [ ] Automatic tool selection as in LabVIEW, with every cursor
- [ ] Quick Drop
- [ ] Palette search
- [ ] Favorites and pinned palettes
- [ ] Zoom
- [ ] Find and Replace
- [ ] Grid alignment
- [ ] Text Settings (fonts, sizes, styles)
- [ ] Decorations
- [ ] OVI snippets (Create OVI Snippet from Selection)
- [x] Hover tips on terminals and wires

### Front panel editing

- [x] Placing controls and indicators, synchronised with their diagram terminals
- [x] Typing values and using the incrementers
- [x] Current and default values (Make Current Values Default, Reinitialize to Default)
- [x] Mechanical action of Booleans
- [x] Change to Control / Change to Indicator
- [x] Waveform Chart history and autoscale
- [ ] Graph cursors, plot styles, Scope and Sweep modes
- [x] Property Node, implicit and explicit (part of the properties)
- [ ] Invoke Node
- [ ] Properties dialog of a control (Appearance, Display Format, Data Entry…)
- [ ] Display format and precision
- [ ] Data Entry limits
- [ ] Resizing every control by its handles
- [ ] Customize Control (control editor)
- [ ] Tabbing order and key navigation
- [ ] Panes and splitters, Scale Object with Pane
- [ ] Run-Time Menu
- [ ] Coloring with the color tool
- [ ] Import Picture to Clipboard
- [ ] Description and Tip
- [x] Panel opened in Run mode by the toolbar, operating only controls
- [x] Error In and Error Out controls

### SubOVIs, libraries and projects

- [x] SubOVIs with a connector pane, wired and called
- [x] LabVIEW's 36 connector patterns known in the file
- [ ] Choosing a connector pattern in the editor (Patterns ▸, Add/Remove Terminal, Rotate, Flip)
- [ ] Icon Editor (Edit Icon… takes an SVG file)
- [x] OVI Properties, Execution page (the other pages are missing)
- [x] Polymorphic OVIs, with their window and Select Type ▸
- [x] Express OVIs with a configuration dialog (Time Delay, File Dialog)
- [x] `ovi.lib`, the library shipped with Solder (LabVIEW's `vi.lib`)
- [x] New dialog (Blank OVI, Polymorphic OVI)
- [ ] OVI templates (New ▸ From Template)
- [ ] `instr.lib` and the Instrument Drivers palette
- [ ] `user.lib` and the User Libraries palette
- [ ] Malleable OVIs (`.vim`)
- [ ] Projects and the Project Explorer
- [ ] Libraries (`.lvlib`)
- [ ] Packed libraries
- [ ] OVI Hierarchy window
- [ ] Save All, Revert and Save for Previous Version
- [ ] Building executables and installers (Application Builder)
- [ ] Find OVIs on disk and the dependencies of an OVI
- [ ] Password protection of an OVI

### Debugging

- [x] Highlight Execution, with its speeds
- [x] Retain Wire Values
- [x] Probes, and the Debug Window that lists them
- [x] Breakpoints on nodes and wires
- [x] Pause, Step Into, Step Over and Step Out
- [x] Error List, with Show Warnings and the warning triangle
- [x] Probes and highlighting on the borders of structures (tunnels, shift registers, "i")
- [x] Allow debugging in OVI Properties
- [ ] Breakpoints on structures
- [ ] Stepping into a subOVI's diagram
- [ ] Custom probes
- [ ] Context Help window
- [ ] Explain Error
- [ ] Profile Performance and Memory
- [ ] Desktop Execution Trace
- [ ] Suspend when called

### Files

- [x] Path functions (Build Path, Strip Path, conversions, constants)
- [x] Text files (Open/Create/Replace, Read, Write, Close, Get File Size, Delete)
- [x] Delimited spreadsheet files (Read and Write)
- [x] File dialogs (from the functions and the File Dialog Express OVI)
- [x] File path control with its browse button
- [ ] Binary files
- [ ] Datalog files
- [ ] Configuration (INI) files
- [ ] Measurement files (`.lvm`, Write To Measurement File)
- [ ] TDMS files
- [ ] XML files
- [ ] JSON flattening
- [ ] Folders: list, create, copy, move
- [ ] Zip files
- [ ] File position and permissions

### Instruments and communication

- [x] VISA over TCP sockets (Open, Read, Write, Close)
- [x] VISA over LAN instruments, VXI-11 (`TCPIP::host::INSTR`)
- [ ] VISA over HiSLIP
- [x] VISA over serial ports (Configure Serial Port, Bytes at Serial Port)
- [x] VISA Property Node (class Instr)
- [ ] VISA over USB and GPIB
- [ ] VISA events, locks and Find Resource
- [ ] The VISA resource name's dropdown of resources
- [ ] DAQmx (Solder's DAQ layer, DT-076)
- [ ] TCP functions (in the catalog; not compiled yet)
- [ ] UDP
- [ ] Queues, notifiers, semaphores and rendezvous
- [ ] Channel wires
- [ ] Network streams and shared variables
- [ ] HTTP client and web services
- [x] Call Library Function Node (shared libraries), DT-080 (2026-11-06; `.wasm` modules later)
- [ ] .NET and ActiveX
- [ ] OVI Server (Open OVI Reference, the OVI and Application classes)
- [ ] Dialogs for the user (One/Two Button Dialog, Prompt User for Input)
- [ ] Report Generation
- [ ] Date and time functions

## Palettes, windows and menus

Counted from the inventory by `node scripts/coverage.mjs`; do not edit these tables by hand.

<!-- coverage:inventory -->
### Functions palette

| Subpalette | Covered | |
|------------|---------|---|
| Programming ▸ Structures | 4 / 16 (25 %) | `███░░░░░░░` |
| Programming ▸ Array | 17 / 34 (50 %) | `█████░░░░░` |
| Programming ▸ Cluster, Class, & Variant | 2 / 19 (11 %) | `█░░░░░░░░░` |
| Programming ▸ Numeric | 71 / 92 (77 %) | `████████░░` |
| Programming ▸ Boolean | 16 / 16 (100 %) | `██████████` |
| Programming ▸ String | 35 / 66 (53 %) | `█████░░░░░` |
| Programming ▸ Comparison | 21 / 29 (72 %) | `███████░░░` |
| Programming ▸ Waveform | not captured yet | |
| Programming ▸ Collection | not captured yet | |
| Programming ▸ File I/O | 19 / 135 (14 %) | `█░░░░░░░░░` |
| Programming ▸ Timing | 4 / 15 (27 %) | `███░░░░░░░` |
| Programming ▸ Dialog & User Interface | 5 / 23 (22 %) | `██░░░░░░░░` |
| Programming ▸ Synchronization | not captured yet | |
| Programming ▸ Graphics & Sound | not captured yet | |
| Programming ▸ Application Control | not captured yet | |
| Programming ▸ Report Generation | not captured yet | |
| Measurement I/O | not captured yet | |
| Instrument I/O ▸ Instrument Drivers | not captured yet | |
| Instrument I/O ▸ VISA | 10 / 73 (14 %) | `█░░░░░░░░░` |
| Instrument I/O ▸ GPIB | not captured yet | |
| Instrument I/O ▸ Serial | 5 / 8 (63 %) | `██████░░░░` |
| Mathematics | not captured yet | |
| Signal Processing | not captured yet | |
| Data Communication | not captured yet | |
| Connectivity | 1 / 12 (8 %) | `█░░░░░░░░░` |
| Express | not captured yet | |
| Addons | not captured yet | |
| Favorites | not captured yet | |
| User Libraries | not captured yet | |

### Controls palette

| Subpalette | Covered | |
|------------|---------|---|
| Modern ▸ Numeric | 2 / 21 (10 %) | `█░░░░░░░░░` |
| Modern ▸ Boolean | 10 / 13 (77 %) | `████████░░` |
| Modern ▸ String & Path | 4 / 5 (80 %) | `████████░░` |
| Modern ▸ Data Containers | 3 / 8 (38 %) | `████░░░░░░` |
| Modern ▸ List, Table & Tree | not captured yet | |
| Modern ▸ Graph | 3 / 21 (14 %) | `█░░░░░░░░░` |
| Modern ▸ Ring & Enum | 1 / 5 (20 %) | `██░░░░░░░░` |
| Modern ▸ Layout | not captured yet | |
| Modern ▸ I/O | 1 / 13 (8 %) | `█░░░░░░░░░` |
| Modern ▸ Variant & Class | not captured yet | |
| Modern ▸ Decorations | not captured yet | |
| Modern ▸ Refnum | not captured yet | |
| Fuse Design System | not captured yet | |
| Silver | not captured yet | |
| System | not captured yet | |
| Classic | not captured yet | |
| Express | not captured yet | |
| .NET & ActiveX | not captured yet | |
| Signal Processing | not captured yet | |
| Addons | not captured yet | |
| User Controls | not captured yet | |
| Actor Framework | not captured yet | |

### Windows and dialogs

| Window | Covered | |
|--------|---------|---|
| Project Explorer | 0 / 26 (0 %) | `░░░░░░░░░░` |
| Front Panel | 27 / 73 (37 %) | `████░░░░░░` |
| Block Diagram | 37 / 102 (36 %) | `████░░░░░░` |
| Debug Window | 10 / 18 (56 %) | `██████░░░░` |
| Error list | 7 / 8 (88 %) | `█████████░` |
| OVI Properties | 6 / 26 (23 %) | `██░░░░░░░░` |
| Chart History Length | 2 / 3 (67 %) | `███████░░░` |
| Configure Express OVI | 9 / 11 (82 %) | `████████░░` |
| Enum Constant Properties | 9 / 14 (64 %) | `██████░░░░` |
| Getting Started | 5 / 51 (10 %) | `█░░░░░░░░░` |
| Polymorphic OVI | 20 / 42 (48 %) | `█████░░░░░` |
| Edit Instance Name | 2 / 3 (67 %) | `███████░░░` |
| New | 5 / 12 (42 %) | `████░░░░░░` |
| Call Library Function | 2 / 9 (22 %) | `██░░░░░░░░` |

### Right-click menus

| Menus | Covered | |
|-------|---------|---|
| Every right-click menu captured | 462 / 1872 (25 %) | `██░░░░░░░░` |
<!-- /coverage:inventory -->

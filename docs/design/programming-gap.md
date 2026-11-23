# What Solder still misses of LabVIEW's programming (snapshot of 2026-11-23)

> A one-off picture, asked by the developer on 2026-11-23 before choosing what comes after type definitions. The
> living record stays [`coverage.md`](coverage.md); the counts here come from the same inventory,
> [`../schema/inventario-labview.json`](../schema/inventario-labview.json) (an entry is done when its state is
> `built`), and from coverage.md's hand-written checklists. Only programming is counted: the Functions palette and
> the language's structures, types and execution. Panel controls, windows and menus are left out.
>
> The first version of this page counted only the palettes captured before; the same day every palette was read from
> LabVIEW's palette files, and the counts below are the complete ones.

## In numbers

The whole Functions palette was read the same day from LabVIEW's own palette files (`.mnu`) in the virtual machine,
recursively, with a visual spot check (labview-captures/reports/2026-11-23-programming-palettes-gap.md and
-other-palettes-gap.md; trees in labview-captures/palettes-gap/). The install is Community 2026 Q3 Patch 1 with its
add-ons; modules not installed (FPGA, Real-Time, Vision, Control Design & Simulation) add nothing. "Unique" counts a
function once however many palettes show it.

| Part | LabVIEW (unique) | Solder done | Missing |
|------|------------------|-------------|---------|
| Programming | 1,007 (+8 unnamed) | ≈ 190 | **≈ 817** |
| The whole Functions palette | 2,272 (+14 unnamed) | ≈ 198 | **≈ 2,074** |

Solder's "done" is the inventory's `built` entries matched by name. A few names differ between the palette files and
the inventory (Flat Sequence, Round To ±Infinity, Time Delay…), so the numbers are within a handful. LabVIEW's own flat
list of function names (`Application.Palettes.FuncNames`) has 2,751 entries, including some no palette here reaches.

## Programming, subpalette by subpalette

| Subpalette | LabVIEW | Done | Missing |
|------------|---------|------|---------|
| Boolean | 16 | 16 | 0 |
| Numeric | 109 | 71 | 38 |
| Comparison | 47 | 21 | 26 |
| String | 66 | 35 | 31 |
| Array | 44 | 17 | 27 |
| Cluster, Class, & Variant | 49 | 5 | 44 |
| Structures | 28 | 4 | 24 |
| Timing | 15 | 4 | 11 |
| Dialog & User Interface | 49 | 5 | 44 |
| Application Control | 44 | 1 | 43 |
| File I/O | 167 | 19 | 148 |
| **Synchronization** | 35 | 0 | 35 |
| Collection (Map, Set) | 25 | 0 | 25 |
| Waveform | 102 | 0 | 102 |
| Graphics & Sound | 110 | 0 | 110 |
| Report Generation | 117 | 0 | 117 |
| Add-on pages (VI Analyzer, Desktop Execution Trace, Unit Test Framework) | 20 | 0 | 20 |

A row's count includes its nested folders. A few functions appear in two rows (Cluster To Array, Waveform File I/O).

## The other top-level palettes

| Palette | LabVIEW (unique) | Done |
|---------|------------------|------|
| Mathematics (its Numeric is Programming's) | 499 | — |
| Signal Processing | 377 | — |
| Data Communication (Shared Variable, Network Streams, queues again, DataSocket, TCP/UDP/HTTP/SMTP/FTP/SFTP, Actor Framework) | 217 | — |
| Express (mostly Programming's functions again, plus the Express VIs) | 187 | — |
| Instrument I/O (VISA 70, GPIB 41, Serial 8, Instrument Drivers) | 138 | 15 |
| Connectivity (.NET, ActiveX, Python, MATLAB, Database, Web Services, Source Control…) | 130 | 1 |
| Measurement I/O (DAQmx, System Configuration, Scan Engine) | 73 | — (Solder's DAQ is its own palette, DT-076) |
| Control & Simulation (PID, Fuzzy Logic) | 38 | — |
| Vision and Motion, Addons, Favorites, User Libraries | 0–1 | — |

The trees list every function by name: labview-captures/palettes-gap/programming-tree.txt and other-palettes-tree.txt.

### What is missing in Programming, by name (palettes captured before 2026-11-23)

The five subpalettes read on 2026-11-23 (Synchronization, Collection, Waveform, Graphics & Sound, Report Generation) are
missing whole; their contents are in programming-tree.txt. Synchronization holds Queue Operations (9), Notifier
Operations (9), Semaphore (6), Rendezvous (6), Occurrences (3), Initialize and Synchronize Data Flow.vim.

- **Structures:** Event Structure, Feedback Node, Local Variable, Global Variable, Formula Node, In Place Element
  Structure, Diagram Disable Structure, Conditional Disable Structure, Type Specialization Structure, Shared Variable;
  folders Timed Structures (Timed Loop, Timed Sequence) and Decorations.
- **Array:** Reshape Array, Transpose 2D Array, Sort 2D Array, Shuffle 1D/2D Array, Interpolate 1D Array, Threshold 1D
  Array, Interleave 1D Arrays, Decimate 1D Array, Array To Cluster, Cluster To Array, Array To Matrix, Matrix To Array,
  Remove Duplicates From 1D Array; folders Unsorted, Sorted Array, Matrix.
- **Cluster, Class, & Variant:** Build Cluster Array, Index & Bundle Cluster Array, Cluster To Array, Array To Cluster;
  the classes (Call Parent Class Method, To More Specific/Generic Class, Preserve Run-Time Class, LV Object Constant,
  Get LV Class Default Value, … By Name, Get LV Class Path, Get LV Class Name); folder Variant.
- **Numeric:** EXT, fixed-point and complex conversions (To Extended Precision Float, To Fixed-Point, the three To …
  Complex), Coerce To Type, To Time Stamp, String To Byte Array, Byte Array To String, Convert Unit, Cast Unit Bases,
  Color to RGB, RGB to Color, Enum to Array of Enums; Type Cast, Flatten To String, Unflatten From String, Byte Array
  Checksum; folders Complex, Scaling, Fixed-Point.
- **String:** Match Pattern, Match Regular Expression, Normalize End Of Line, Format Date/Time String, Build Text,
  Format Value, Scan Value; the UTF-8 and byte array conversions; the whole Flatten/Unflatten String folder
  (binary, XML, JSON); most of Additional String Functions (Search/Split String, Pick Line, Match First String, Match
  True/False String, Scan String For Tokens, Search and Replace Pattern, Index String Array, Append True/False String,
  Delimited String ↔ 1D String Array, Create NI GUID).
- **Comparison:** Empty Array?, Printable?, Lexical Class, Comparison (the Express VI), Assert Type, Is Value
  Changed, Is Path and Not Empty?, Fixed-Point Overflow?.
- **Timing:** High Resolution Relative Seconds, Stall Data Flow, Elapsed Time, Notification Polling Wait, and all of
  date and time (Get Date/Time String, Get Date/Time In Seconds, Date/Time To Seconds, Seconds To Date/Time, To Time
  Stamp, Format Date/Time String, Time Stamp Constant).
- **Dialog & User Interface:** One/Two/Three Button Dialog, Prompt User for Input, Display Message to User, General
  Error Handler, Find First Error, Error Ring, Write to System Log, Wait For / Generate Front Panel Activity, Color Box
  Constant, Listbox Symbol Ring Constant; folders Multiple Errors, **Events** (Register/Create/Generate User Event…),
  Menu, Cursor, Help.
- **Application Control:** Open Application Reference, Open/Static OVI Reference, Close Reference, Property Node and
  Invoke Node on the palette (the Property Node already compiles when made from a control's Create menu), Call By
  Reference, Start/Wait On Asynchronous Call, Get Command Line Arguments, Call Chain, Stop, Quit, Set/Get Control
  Values by Index, Get Drag Drop Data, Class Specifier Constant, To More Specific/Generic Class; folders Palette
  Editing, CPU Information, Memory Control, OVI Scripting, Application Builder.
- **File I/O:** Format Into File, Scan From File, Read/Write Binary File, Read/Write Measurement File, Current OVI's
  Path, Not a Refnum Constant, the system folder constants; Configuration File OVIs (9), TDM Streaming (10 + 11
  advanced), Storage/DataPlugin (10 + 10 advanced), Zip (4), XML (6), Waveform File I/O (3), Datalog (8), and most of
  Advanced File Functions (file position, size, permissions, Move, Copy, Create Folder, List Folder, File/Directory
  Info, Refnum to Path, Compare Two Paths, Get File Extension, File Checksum, …).
- **VISA:** Find Resource, Set Timeout, Clear, Read STB, Assert Trigger, Lock/Unlock, Read To File / Write From File,
  Serial Break, Set I/O Buffer Size, Flush I/O Buffer, USB, GPIB and VXI functions, Event Handling (6) and Register
  Access (32).
- **Connectivity:** System Exec.

## The language beyond the palette

From coverage.md's checklists (items now partly done are said so):

- **Types:** EXT, complex, fixed-point, arrays of three or more dimensions, time stamp, waveform, variant, classes
  (LVOOP), sets and maps, physical units. Type definitions: core done, editor stages (a1)–(a2b) done, (a3)–(d) left.
- **Structures:** the For Loop's conditional terminal, parallel For Loop iterations, stacked shift registers,
  concatenating and conditional tunnels, structure auto-grow, plus the structures named above.
- **Execution:** queues, notifiers, semaphores and rendezvous (the Synchronization palette), channel wires, Run
  Continuously, shared-clone reentrancy, recursion, execution systems and priorities, inlining, automatic error
  handling, Synchronous Display.
- **SubOVIs:** connector pane Add/Remove Terminal, Rotate and Flip; the Icon Editor; malleable OVIs (`.vim`);
  libraries (`.lvlib`) and packed libraries; templates; Call By Reference and asynchronous calls.
- **Debugging:** breakpoints on structures, stepping into a subOVI, custom probes, Context Help, Explain Error,
  Profile, Suspend when called.

## Where the producer/consumer pattern stands

It needs, from the lists above: the **Event Structure** (with its event registration and timeout), **queues**
(Synchronization ▸ Queue Operations, 9 primitives), and in practice **local variables** and **user events** (Dialog & User
Interface ▸ Events). They make phase 2 of the order decided the same day (DT-105, labview-plan.md §3b).

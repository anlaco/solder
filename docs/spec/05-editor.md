# 05 — Editor interaction

> Status: **DRAFT** — pending review
> Normative. Defines **how a VI is manipulated**: mouse, keyboard, dialogs.
> [`06-visual.md`](06-visual.md) defines how it **looks**; this one, how it is **used**.

## 1. Scope

Covers the two canvases —*Block Diagram* and *Front Panel*— in edit mode. Execution
is defined by [`04-dynamic-semantics.md`](04-dynamic-semantics.md).
§9 also covers what surrounds the canvases —menus, toolbars, palettes and
windows— in what the editor shows of the *reference* without doing it.

This document is based on the current behavior of the editor in Red, but
**does not replicate it unfiltered**: §2 lists what is expressly not ported.

## 2. What is NOT ported

Six restrictions of the current editor **are not product decisions: they are patches
for failures of the graphics engine**. None of them appears in `06-visual.md`; they only live
in the code and in `GTK_ISSUES.md` (from the Red stage, outside this repository). See [`whitelist.md`](../reference/history/whitelist.md) §11.3.

| Current restriction | Cause | What the new editor MUST do |
|---|---|---|
| Fixed 900×600 windows | GTK-014, **patch already declared unnecessary** | Resizable windows |
| Non-modal dialogs | GTK-007: the modal lost keyboard focus | Normal modal dialogs |
| **`Tab` does not navigate** | GTK-015: pressing `Tab` **caused an unexpected crash** | Full keyboard navigation |
| Fixed colors, no system theme | GTK-005: the color query returned empty | Respect the light/dark theme |
| No HiDPI, everything assumes 96 dpi | GTK-001/002: the dpi query returned empty | Scaling by screen density |
| Hand-drawn scrollbars | Consequence of the fixed windows | Standard scroll area |

> The third is the most important and the easiest to overlook. **The absence
> of keyboard navigation is not a design choice: it is a failure of the graphics
> engine that was accepted as a limitation.** Replicating it would be inheriting an
> accessibility problem for no reason at all.

## 3. Interaction model

### 3.1 Selection

> **Rule 22.** A click on an element selects it and deselects the
> others. A click on the empty background clears the selection.

> **Rule 23.** The selection **MUST** be able to contain several elements, and all
> the operations that act on the selection —move, delete— **MUST**
> act on all of them at once.

### 3.2 Hot zones

A point of the canvas belongs to **a single** zone. They are resolved in this order, from
most specific to most general:

1. *Shift register* terminal
2. *Port* of a node
3. Control terminal of a structure (`condition`, `count`, `selector`)
4. *Tunnel* of a structure
5. Label of an element
6. Body of a node
7. Border of a structure
8. Interior of a structure
9. Canvas background

> **Rule 24.** The resolution order **MUST** be stable and not depend on the
> creation order of the elements. Two overlapping elements **MUST**
> always be resolved the same way.

### 3.3 Dragging

> **Rule 25.** Dragging an element changes only its *presentation layer*.
> It **MUST NOT** alter the compiled program ([`02-syntax.md`](02-syntax.md) §2).

> **Rule 26.** Dragging a node **into or out of** a structure
> **changes which scope it belongs to**, as in LabVIEW: when dropped, the node belongs to
> the smallest structure that contains its center, or to the VI's diagram if it
> falls in none. The same applies when placing a node from the palette and when dropping
> a structure around nodes already placed, which enter it. The
> membership is still explicit in the file (`dentro`, DT-041): what
> changes is who decides it.

*(Amended on 2026-10-01. The previous version said the opposite, so as not to lose
rule 25 —if position decided the scope, moving a node would change the
program—. It was verified in LabVIEW 2026 Q3 that it reassigns by geometry
(`labview-captures/structures/`: a node dragged into a loop enters, and
dragged out, leaves), and LabVIEW rules. Moving a node **within the same scope** still
does not change the program. When the scope changes, the wires that cross the border
go through tunnels and the tunnels that are no longer needed are removed: rule 40e.)*

## 4. Nodes

### 4.1 Create

> **Rule 27.** Right-click opens the palette. Inside a structure, the
> palette creates the node **in the scope of that structure**; on the background, in the
> root scope.

### 4.2 Delete

> **Rule 28.** Deleting a node **MUST** also delete all the wires
> connected to it. No wires **MUST** be left dangling.

> **Rule 29.** Deleting a structure **MUST** delete its entire body, and
> **MUST** ask for confirmation if the body is not empty.

*(The confirmation is new: today there is none, and a structure can take a dozen nodes
with it without warning.)*

### 4.3 Edit values

Double-clicking a node opens the dialog that corresponds to its type:

| Node type | What it edits |
|---|---|
| `const`, `str-const`, `bool-const`, `arr-const` | Its value |
| `arr-control`, `str-control` | Its default value |
| `bundle`, `unbundle`, `cluster-*` | The cluster's field list |
| *Shift register* terminal | Its initial value |
| Any other | Its label |

> **Rule 30.** Editing a cluster's field list **MUST** invalidate the
> wires left without a port, and **MUST** warn how many before applying.

## 5. Wires

### 5.1 Create

Clicking on a *port* starts a wire; releasing over another port completes it. The
connection is accepted if it satisfies `can_connect`
([`03-static-semantics.md`](03-static-semantics.md) rule 5).

> **Rule 31.** If the connection is not valid, the editor **MUST** indicate **why**
> —incompatible types, input occupied, wrong scope, cycle— and not
> just reject it silently.

*(Today a "broken wire" is drawn with no explanation. With rule 1 of `03` —an unknown
port is an error instead of a default type— cases that are accepted today by accident
will also start being detected.)*

### 5.2 Dropping onto an already occupied input

The model forbids *fan-in* ([`03`](03-static-semantics.md) rule 7). What the editor does
is still to be decided, and today it does **three different things**: reject on
normal ports, **replace** on the `count` terminal, and **overwrite** on the
`condition` terminal.

> **Rule 32.** Dropping a wire onto an input port that is already connected
> **MUST replace** the previous wire.

*(Replacing is chosen, rather than rejecting, for three reasons: it is what LabVIEW does; it is
what the `count` terminal already did, so it breaks no habit; and rejecting
forces the user to delete first, which is a step with no use at all. What
matters is that there is **one** rule, not three.)*

### 5.3 Delete

> **Rule 33.** A wire is selected by clicking on it and is deleted like
> any other element.

*(As in LabVIEW, the click selects the **segment** clicked, not the whole wire;
deleting it deletes the whole wire, which is a difference: LabVIEW leaves the pieces
loose. See §5.4.)*

### 5.4 Pulling a wire and repositioning it

*(informative)* Cloned from the video
`labview-captures/block-diagram/numeric-cablear.mp4` and done in the editor
(`editor/src/block-diagram/diagram-editing.mjs`):

- While pulling, the wire is a **black dotted** line that leaves the
  terminal horizontally up to the mouse's x and then goes vertically to it.
- When released on a terminal, the vertical segment ends up almost attached to it: at 4 px.
- A **segment** is selected with a click, with marching ants only on it, and is
  dragged sideways: vertical ones horizontally and horizontal ones
  vertically. Dragging the first or the last, which are attached to a terminal,
  adds an elbow. Elbows are presentation layer (rule 25) and are kept when
  moving the nodes.

### 5.5 Typing into a constant

Double-click on a numeric constant: the text comes out selected and what is typed
replaces it; the box grows with the text. Enter, a click outside or the
*Enter Text* button —which only appears in the toolbar while typing, to the left
of Run— confirm it; `Esc` leaves it as it was. A number with decimals in an
integer constant turns it into DBL, as LabVIEW does. What is not a number
changes nothing. Both comma and period are accepted, and it is shown with the
system separator.

A **string** constant is something else (rule 40h): Enter starts a new line and does not
confirm; it is confirmed with *Enter Text* or with a click outside.

## 6. Navigation

> **Rule 34.** The mouse wheel scrolls vertically; with `Shift`, horizontally.
> The scrollable area **MUST** fit the real content.

> **Rule 35.** There is no zoom. *(Explicit product decision, inherited from
> `06-visual.md` §1.1.)*

*(It is a difference from LabVIEW, not a coincidence: LabVIEW has zoom in the
diagram since 2023 Q3 —View ▸ Zoom In, Zoom Out, Actual Size, Toggle Zoom, and
`Ctrl`+wheel—, according to NI's help. It was decided on 2026-09-29 to keep it out, so as not to
complicate the editor; changing it requires a new decision. When the View
menu is broken down, its zoom entries will go as `never` citing this rule.)*

> **Rule 36.** The keyboard arrows move the selection one pixel; with
> `Shift`, a larger jump.

> **Rule 36 is implemented in the web editor** (2026-09-29,
> `editor/src/block-diagram/diagram-editing.mjs`): one pixel, and 8 with `Shift`, provisional until
> the jump is verified in LabVIEW (§11, issue 3).

> **Rule 37.** `Tab` **MUST** cycle through the elements of the canvas. See §2.

## 7. Synchronization between canvases

Front Panel and Block Diagram are two views of the **same** VI, not two documents.

> **Rule 38.** Creating a control or indicator on the Front Panel **MUST** create its
> terminal node on the Block Diagram, and vice versa.

> **Rule 39.** Deleting an element in either of the two canvases **MUST**
> delete it from the other, with its wires.

> **Rule 40.** Changing a control's *data type* **MUST** invalidate the
> wires that stop being valid, warning beforehand.

> **Rules 38 and 39 are implemented in the web editor** (2026-09-30,
> `editor/src/front-panel/front-panel.mjs`) for the numeric control and indicator: a control
> is a single node of the graph with its place in each canvas and a single label,
> so placing it on the panel puts its terminal on the diagram, and deleting it in
> either of the two deletes it from the other, with its wires. Each window has its
> own copy of the graph and sends it to the other through a `BroadcastChannel` every time it
> comes to rest. Creating a control from the diagram (Create ▸ Control) is still
> a placeholder. Rule 40 is half done: Representation (2026-10-01,
> right-click menu of numeric constants, controls and indicators) changes
> the terminal's type and resolves the wires again, but between numerics a
> wire is never broken —a coercion dot wins—, so the prior warning
> waits for the types that do not convert.

> **Rule 40b.** A **boolean** control or indicator (Controls ▸ Modern ▸
> Boolean) is a green terminal with "TF" on the diagram, and its value travels as
> an `i32` 0/1 through the panel imports, like the numeric one. What kind of
> control it is (`style`: Push Button, Round LED, Stop Button…) and its **mechanical
> action** (`mechanical-action`) are saved in the `.qvi`'s `front-panel`: the
> second is semantic, because it says when the value changes. LabVIEW makes the
> LEDs indicators and everything else controls; the factory action is
> Switch When Pressed except on OK, Cancel and Stop, which are Latch When Released
> (captured in LabVIEW 2026 Q3, 2026-10-01). An indicator has no mechanical
> action: its row comes out disabled.

> **Rule 40c — the click on a stopped boolean.** In edit mode, LabVIEW's
> automatic tool **actuates** a boolean if its body is clicked (a Push Button
> changes on every click), **edits its text** if the text is clicked
> (the "STOP" of the Stop Button) and **selects it** if its border is clicked.
> Verified in LabVIEW 2026 Q3 (`labview-captures/run/e-stop.png`,
> `e2-stop.png`, `e4.png`). The editor actuates with a click without dragging and
> selects; editing the button's text is not done yet.

> **Rule 40d — Run mode.** While the VI runs, both windows are in Run
> mode: the Run arrow is filled, Abort lights up, the editing
> tools disappear (font, align, distribute, size, order) and the panel
> loses the grid. On the panel, a click **actuates** the controls according to their
> mechanical action and nothing is moved, selected or deleted; the diagram is not
> edited. Ctrl+R does nothing while it runs and Ctrl+. is Abort. When it finishes, edit
> mode returns. Verified in LabVIEW 2026 Q3 (`labview-captures/run/r1.png`,
> `r2.png`). Switch When Pressed and Latch When Released are done; the other four
> actions, greyed out. Ctrl+M (Run mode without running) and the right-click menu in
> Run mode, not done.

> **Rule 40m — An object exists when it is dropped, and a Run does not change the VI.**
> A control or indicator dropped on the panel (and a string constant dropped on
> the diagram) is in the VI at once, with its terminal in the diagram, in both
> windows and with the modified mark; the label (or text) that opens in edit mode
> only changes it, as LabVIEW does. Save, Save As, Exit, Run and switching
> windows first commit whatever is being typed (tests in
> `test/editor/front-panel.test.mjs`). Operating a control while the VI runs
> changes its *current* value, not the value the file saves: the VI is not marked
> modified, saving writes the value each control had when the Run started, and the
> controls go back to it when the Run ends; a Latch that was read is FALSE again
> in both windows (Rule 20e). Tests in `test/editor/run-values.test.mjs`. Not
> done: LabVIEW keeps the current value of a control after the Run, apart from
> its default, which changes only with Edit ▸ Make Current Values Default;
> Solder has no such command yet, so in edit mode operating a control (Rule 40c)
> still changes the value the file saves. Unverified in LabVIEW 2026 Q3.

> **Rule 40e — While Loop and For Loop on the diagram.** Captured in LabVIEW 2026
> Q3 (`labview-captures/structures/`), at 1:1, and done with the measurements below
> (tests in `test/editor/diagram-view.test.mjs` and `diagram-editing.test.mjs`):
>
> - **Placing.** It is taken from Functions ▸ Programming ▸ Structures. The first click on
>   the canvas fixes one corner and the second, the opposite one (a 1 px gray rectangle
>   on white follows the cursor); pressing, dragging and releasing also
>   works. A click without moving leaves the minimum size, **48 × 48**, centered on the
>   click, and no structure goes below it. Freshly placed it is not selected.
>   What the rectangle surrounds enters the loop.
> - **Appearance.** A loop measures what its box does: the While is a `#7f7f7f` gray frame
>   of **6 px** with rounded corners (stepped row by row) and, at the bottom
>   right, the stretch mark, which sticks out 1 px; the For is **three sheets**
>   of 1 px black line offset by 2 px, with the fold at the bottom right
>   (the box is that of the three together: the front sheet measures 4 px less). Inside
>   it there is no fill: a click in its interior is a click on the background, and it is
>   grabbed by the border.
> - **Loop terminals**, **16 × 16**: the "i" (2 px blue border) 10 px
>   from the left and 26 from the bottom; in the While, the condition (1 px green border;
>   Stop if True, stop sign; Continue if True, circular arrow) 26 from
>   the right and from the bottom; in the For, the "N" in the top left corner. They are not
>   moved or deleted, and they follow their corner when stretching.
> - **Tunnels** of **9 × 9**, `#4c4c3d` 1 px border and fill in the color of their
>   type, attached to the outer side of the loop (the input one, on the left; the
>   output one, on the right), at the height of the inner terminal they go to. **Shift
>   registers** of **16 × 12**, 2 px black border (in the type's color if
>   wired) with a ▼ arrow on the left and a ▲ on the right, at the same
>   height; Add Shift Register puts them at the height of the click. A tunnel or a
>   shift register slides along its border without leaving it, and stays on its side
>   when moving or stretching the loop.
> - **Selecting** a loop (click on its border) tints it `#f5f5fc`, gives it a
>   contour of blue dashes and eight blue handles of 6 × 6, set into the corners and
>   the center of the sides. The handles stretch (minimum 48 × 48); what is inside does not move when
>   stretching. Moving the loop by its border takes everything it contains with it.
> - **Wiring across the border.** A wire between two scopes goes through a tunnel
>   at each border it crosses, at the height of the inner terminal; a tunnel that
>   is no longer needed (its ends are now in the same scope) is removed and the
>   wire is left direct. A wire within its own scope carries no tunnel.
> - **Right-click menus** of the loop border, of "i", the condition, "N", the
>   tunnels and the shift registers: Add Shift Register, Stop if True and Continue if
>   True done; Tunnel Mode shows Last Value (the only mode) checked; the rest,
>   greyed out. Deleting a loop deletes what is its own; deleting a shift register, its partner.
>
> *Unverified or not done:* whether stretching a loop over nodes encloses them (in the
> capture the node stayed outside, but it is not conclusive); that LabVIEW **pushes aside** a
> loop that overlaps another when stretching it (the For shifted 20 px); that when
> dropping a loop around a node wired on both sides LabVIEW created
> **a shift register** and not tunnels (not reproduced: tunnels are placed); tunnels
> on the opposite side; Indexing, Concatenating and Conditional modes (they wait for
> arrays); stacked shift registers; the For's condition terminal; Auto
> Grow; Remove, Replace, Remove and Rewire and Visible Items.

> **Rule 40f — Case Structure on the diagram.** Captured in LabVIEW 2026 Q3
> (`labview-captures/structures/case-*.png`), at 1:1 and compared pixel by pixel
> (tests in `diagram-view.test.mjs` and `diagram-editing.test.mjs`):
>
> - **Placing** like a loop (two clicks or drag). A rectangle smaller than
>   48 × 48 is enlarged about its center. Freshly placed it comes with False and True and True is shown.
> - **Frame:** 1 px black line and 5 px of dot pattern (4 × 4 tile that
>   starts at (1, 1)). Selected it shows only the eight handles, with no tint or contour.
> - **Frame selector:** 17 px high, centered on the top border: previous
>   arrow (7 px), text, dropdown triangle and next arrow; width = that
>   of the widest text of its frames + 17 + 18 (45 + 18 with True and False). The
>   arrows wrap around; the triangle opens a list at the click point with
>   ✓ on the frame being shown; a double click on the text edits it ("2..4", "7, 9",
>   "Default"; Default passes from one frame to another).
> - **Selector terminal** of 8 × 12 with its base at the middle of the left side, green
>   "?" when unwired and blue with an integer (a DBL carries a coercion wedge). With an
>   integer wired, False and True become "0, Default" and "1".
> - **Tunnels:** input ones like those of a loop; output ones, hollow if some frame
>   does not wire them, and with *Use Default If Unwired* filled with a dot.
> - **Only what is in the active frame is seen and clicked.**
> - **Menus** (border and frame selector): Add Case After/Before (the new one takes the
>   first free integer after the previous frame; on a boolean, empty), Delete
>   This Case, Make This The Default Case / Remove Default, Show Case True/False
>   and Use Default If Unwired, done; the rest, greyed out.
> - **String and enum selectors** (measured in LabVIEW 2026 Q3:
>   `labview-captures/reports/2026-10-10-string-case.md` and
>   `labview-captures/reports/2026-10-10-enum-case.md`; tests in
>   `test/editor/case-selector-kinds.test.mjs`). The kind is read from the wire into
>   the selector. Wiring a string turns False and True into `"False", Default` and
>   `"True"`; wiring an enum, into `"Init", Default` (item 0) and `"Heat"` (item 1).
>   Labels: strings quoted (`"abc"`, `""`, range `"a".."c"`); enum items by quoted
>   name, a range as `"Init".."Done"`, and two adjacent items as the list
>   `"Init", "Heat"`. Editing the label: for a string, a bare word is that string,
>   commas inside quotes belong to the string; for an enum, an item name or number
>   (shown afterwards as the name). Add Case After/Before on a string Case adds a frame
>   with no value (blank label; the core reports the VI broken); on an enum Case it takes
>   the first item without a frame. Border menu: *Case Insensitive Match* (check item,
>   string only, between Make This The Default Case and Remove and Rewire; on, it
>   draws a small pink `A=a` at the bottom-left corner of the frame); Radix is
>   hidden for both kinds. For an enum with an item without a frame, *Add Case for
>   Every Value* (one frame per uncovered item, in item order, at the end) and
>   *Remove Empty Cases* appear after Delete This Case; with every item covered both are absent.
>
> *Unverified or not done for these kinds:* Remove Empty Cases (shown greyed); the look of the `A=a`
> marker (only described, drawn anew); escapes inside quoted strings; open-ended string ranges;
> the frames after changing the type of a wired selector; unwiring. A name that is not an item is
> accepted, drawn in red, and breaks the Case with "Case Structure: Selector values have wrong
> type", as LabVIEW does (measured; it was rejected here until DT-049); the value a new enum frame
> gets is the first item without a frame, by name.
>
> *Unverified or not done:* what Add Case Before gives on the first frame, Delete
> with a single frame, Make This Case True/False, Duplicate Case, Swap/Shift/
> Rearrange, Show Case..., Radix, the clipping of the selector in a narrow Case,
> going back to boolean when unwiring, Auto Grow and the exact width of the text (it depends
> on the font).

> **Rule 40g — Flat and Stacked Sequence on the diagram.** Captured in LabVIEW 2026
> Q3 (`labview-captures/structures/secuencia-*.png`), at 1:1; the film border,
> compared pixel by pixel (tests in `diagram-view.test.mjs` and `diagram-editing.test.mjs`):
>
> - **Placing** like a loop (two clicks or drag; minimum 48 × 48). Freshly
>   placed it has a single frame. The Stacked is not in the palette: it comes from
>   *Replace with Stacked Sequence* on a Flat.
> - **Film border:** gray #e2e2e2 with a 1 px black line at the top and bottom
>   (9 px band at the top and bottom, 5 on the sides), 2 px zigzag on the
>   sides and 6 × 6 holes every 12 px, the first whole one 9 px from the corner.
>   Each frame is a rectangle with a 1 px black border; between two frames, a 5 px
>   separator. Minimum of one frame: 38 × 30.
> - **Flat:** all frames at once, each with its own width (`marcos[k].ancho`,
>   border included; it is saved in the file as the layout's `frame-widths`). The
>   structure measures 10 + the frames + 5 for each separator. It is stretched by the right
>   handle (last frame) or the left one (first). A node falls in the
>   frame beneath it (the separator, halfway); if when changing frame the wire
>   would go backwards, it breaks.
> - **Wire from one frame to the next** (Flat): it crosses each separator through a
>   9 × 9 tunnel in the type's color, at the height of the wire.
> - **Stacked:** a single frame, as wide as the widest, with the Case's frame selector
>   (arrows with wraparound, dropdown list) and the text "k [0..n-1]", which is not
>   edited. Only what is in the active frame is seen and clicked. A wire from one frame to a
>   later one is seen as its **sequence local variable**: a 13 × 13 box,
>   attached to the border, with an arrow toward the border in the frame that writes, inward in
>   the later ones and checkered in the earlier ones.
> - **Menus** (border): Add Frame After/Before (the new one measures 38; in a Flat, next to the
>   frame where the click was made and what is on the right shifts; in a Stacked, next to the
>   one being shown, and it becomes the one shown), Delete This Frame (the last one is not deleted) and Replace
>   with Stacked/Flat Sequence (a Stacked measures the widest frame; a Flat distributes
>   the frames with that width each), done; the rest, greyed out.
> - **Execution, measured in LabVIEW:** the output tunnel of a Flat gives its value **when
>   the frame it comes from finishes**, not when the sequence finishes; the core does it that way
>   (DT-041 §9, spec/04 rule 17c).
>
> *Unverified or not done:* Add Sequence Local and wiring in a Stacked (only
> the wires coming from a Flat or from a file exist), Duplicate Frame,
> Show Frame / Make This Frame, Remove Sequence, Replace with Timed Sequence / Case,
> Auto Grow (LabVIEW enlarged a frame when creating an indicator inside), tunnels on the
> top or bottom border (here they go on the sides, as in a loop), the selector's list of
> a Stacked, Visible Items of the Flat and the size of the Stacked when
> changing its shape with frames of different widths beyond "the widest".

> **Rule 40h — Strings on the diagram and on the panel.** Captured in LabVIEW 2026 Q3
> (`labview-captures/string/`), at 1:1:
>
> - **Palettes:** Functions ▸ Programming ▸ String is a grid of 5 columns and 28
>   elements (`string-subpaleta.png`), with the folders Path/Array/String Conversion,
>   Number/String Conversion (7 columns, 12 elements; Scan Value in the last
>   cell of the second row), Flatten/Unflatten String (2 columns, 9) and Additional
>   String Functions (4 columns, 13). Controls ▸ Modern ▸ String & Path
>   (`controls-string-path.png`): String Control, String Indicator, Combo Box, File
>   Path Control and File Path Indicator, in 3 columns; the last two and the Combo Box
>   are greyed out.
> - **String functions** (`bd-funciones-1.png`): yellow boxes of 32 × 17 (String
>   Length), 44 × 17 (Rotate String), 44 × 20 (Trim Whitespace), 44 × 32 (String
>   Subset, Replace Substring, Number To Decimal String, Decimal String To Number),
>   44 × 38 (Number To Fractional String), 32 × 37 (Search and Replace String) and 37 × 11
>   (To Upper/Lower Case); wider than the 32 × 32 grid of the palette. The
>   drawings inside are our own. Concatenate Strings measures 31 × 17 with two inputs
>   (15 of terminals, 16 of symbol, 8.5 per input) and is stretched by its handles.
> - **String constant:** box with a 2 px pink border and white background, 15 px
>   high per line plus 4 and as wide as the text plus 8 (minimum 15): 15 × 19 empty and
>   22 × 34 with "ab" and "cd". Freshly dropped it is ready to type in (with the cursor);
>   **Enter starts a new line**; it is confirmed with *Enter Text* or with a click outside, and Esc leaves it
>   as it was. The fixed constants (Empty String, Space, Tab, Carriage
>   Return, Line Feed, End Of Line) carry a sign and are not edited.
> - **String control and indicator** (`panel-string-editando.png`): a box of
>   100 × 24 px with the bevel of the numeric ones, white on the control and gray on the
>   indicator, with the label "String" above (and "String 2"…). It is typed into the
>   control with a click, in edit mode **and in Run mode** (the VI reads the new value);
>   Enter starts a new line; *Enter Text* or a click outside confirm. In edit mode the
>   toolbar shows the *Enter Text* mark. Its terminal on the diagram is pink, with
>   "abc".
> - **Not captured:** the right-click menus of the string constant, control and
>   indicator (they open no menu), *Normal / '\' Codes / Password / Hex
>   Display* of the control (only Normal Display) and the dropdown of the string
>   constants. Concatenate Strings does not have the *Add Input* menu: it is stretched by the handles.

> **Rule 40j — One-dimensional arrays on the diagram and on the panel.** Measured in LabVIEW 2026 Q3 at 1:1
> (`labview-captures/array/`). Empty array constant: 52 × 25 px (33 × 21 index and element box with two
> borders in the type's color; each element, 15 × 21); it is typed into each element with a double click (a boolean is
> toggled) and stretched by its right handle to show more. The panel array with a DBL: 114 × 36 px (41 × 26 index
> and 72 × 33 box); it is typed into its elements, the index scrolls through them and a handle stretches the box. Its
> terminal on the diagram (37 × 37) carries the border in the element's color and the cells i, j and k. The
> one-dimensional array wire measures 2 px. An indexed loop tunnel is drawn 9 × 9 with `#ffffcc` background and a bracket in the type's
> color; a For lets it be born indexed; the input's menu says Enable or Disable Indexing (it only turns on
> if what arrives is an array) and the output's, Tunnel Mode ▸ Last Value, Indexing, Concatenating and Conditional
> (the last two, greyed out). **Unverified:** the gesture of stretching the panel array with the mouse (the handles moved
> the object in the VM) and that it is born empty, with the type of the control dropped inside.

> **Rule 40k — Arrays with two dimensions in the editor.** Measured in LabVIEW 2026 Q3 at 1:1
> (`labview-captures/array-2d/`); the semantics are DT-044 and Rule 21i. The editor handles one and two dimensions
> (`MAX_EDITOR_DIMENSIONS`, `editor/src/common/array-grid.mjs`); more would need a decision of their own.
> - *Menu.* The right-click menu of an array constant (`context.array-constant`: `constant-2d-menu-index.png`,
> `constant-2d-menu-shell.png`, `constant-1d-menu-index.png`; the same on the index and on the shell) and of a panel array
> (`context.panel-array`: `panel-array-menu-index.png`, which has no Size to Widest Element) gains **Add Dimension** and
> **Remove Dimension**, in that order, after Advanced (and Fit Control to Pane and Scale Object with Pane on the panel).
> Remove Dimension is greyed on a 1D array. Add Dimension turns `{ array: E }` into `{ array: E, dims: 2 }` and `[a, b, c]` into
> `[[a, b, c]]` (the box shows one row and the same columns); Remove Dimension keeps the first row
> (`constant-remove-dimension-2x3-to-1d.png`: `[[1,2,3],[4,5,6]]` becomes `[1,2,3]`). On a 2D array Add Dimension is a
> placeholder (`context.array-dimensions-limit`, need `arrays-mas-de-2d`): the compiler handles two. The rest of the rows
> of both menus are placeholders with their captures. The indicator's menu was not captured: it is taken as the control's
> with Change to Control (**unverified**).
> - *Presentation settings.* `config.visibles` is how many elements the box shows: a number in 1D (unchanged) and
> `[rows, columns]` in 2D; `config.indice`, the first position shown: a number in 1D and `[row, column]` in 2D. They
> are saved in the `.qvi` (`visible-elements` and `index` of a panel item, `visibles` and `indice` of a diagram constant) and
> come back equal. A cell is addressed by its position in 1D and by `"row,column"` in 2D.
> - *Cells.* A tile the value defines (inside its rows and its widest row) is solid in the type's color with a white cell and
> black text; one outside the value is pale (`#ffcc99` for DBL) with a grey default. Typing into a tile defines it, and
> there are no gaps: a row or column beyond the value grows it, padding with the default of the element
> (`constant-2d-2x3-values.png`). An indicator ignores the value of a run that does not have its dimensions (the one
> left before an Add Dimension).
> - *Stretching.* The constant is stretched by its right handle (columns, 13 px each), its bottom one (rows, 19 px
> each) and its corner (both), as in `constant-2d-stretched-4x9-empty.png`; the panel array, by the same three
> handles (65 px across and 26 px down for a numeric element, `panel-array-2d-stretched.png`). How a mouse gesture
> selects the handles in LabVIEW and the 2D stretch of the panel were not recorded as a video: **unverified** as a
> gesture; the measures are of the result.
> - *Index Array.* With a 2D array wired it is 32 × 35 instead of 32 × 27, with the array input and then the row and the
> column index (8 px apart); the output drawing is a 2D grid with no index wired, a 1D row with one and a single
> square with both (`indexarray-2d-node-icon.png`, `indexarray-2d-wired-array-only.png`). Stretching to more index groups
> (`indexarray-2d-stretched.png`) is **not done**.
> - *Initialize Array.* It is stretched downwards by a handle and gets a dimension size input for each 8 px, up to two
> (`config.dims`); shrinking it removes the wire of the size that goes. 32 × 35 with two sizes is taken from Index
> Array's size (**unverified**); in `initializearray-contexthelp.png` the 1D node measures 32 × 27, not the 21 that
> a first reading of the notes gave.
> - *Not done.* The concatenation lock of Build Array between a 2D and a 1D input (`buildarray-concat-2d-1d.png`);
> Reshape Array, Transpose 2D Array and Sort and Shuffle 2D Array stay as placeholders (need `arrays-2d`);
> Add Element Gap and Size to Widest Element.

> **Rule 40l — The enum in the editor: items, Edit Items…, menus and panel.** The items of an
> enum are its type (DT-049); measured in LabVIEW 2026 Q3
> (`labview-captures/reports/2026-10-14-enum-edit-items.md` and `-2`, captures `enum-edit/`;
> tests in `test/editor/enum-edit.test.mjs` and `test/core/enum-items.test.mjs`):
>
> - **The constant on the diagram** is born with one empty item, and its item-name editor opens
>   right after the drop; what is typed renames the item (which also renames it in the frames of
>   the Cases the enum feeds, Rule 17e). The box shows the current item's name and widens with
>   it. A click on the constant when it is **not** selected opens the list of items, with the
>   check mark on the current one; selected, the click only re-selects it (automatic tool,
>   measured); typing and the arrow keys change nothing.
> - **The right-click menu of the constant** (`context.enum-constant`) has the measured rows in
>   their order; *Edit Items…* is done and the rest is greyed with its reason. Before this rule
>   the right-click opened the Functions palette (finding #32).
> - **Edit Items…** is one dialog for the constant, the control and the indicator: "Enum Constant
>   Properties" (the panel objects' title is unverified), 500 × 500, five tabs — Appearance, Data
>   Type, Display Format, Edit Items, Documentation; the other four are present and greyed —, an
>   Items|Values list (Values sequential 0, 1, 2…, read-only), Insert / Delete / Move Up / Move
>   Down, *Disable Item* always greyed on an enum, the checkbox *Allow undefined values at run
>   time* greyed, and OK / Cancel / Help (Help greyed). Enter commits the row being edited and
>   inserts an empty one below with the editor in it, and Escape drops what was being written and
>   leaves the dialog open; with no row being written Enter is OK and Escape is Cancel, which are
>   the window's default buttons. Clicking another row commits without inserting; duplicates, empty names and any characters are accepted verbatim; Delete is
>   disabled with a single row *(unverified: the two reports of 2026-10-14 disagree — the second
>   saw it enabled with one row and reads it as focus-dependent; to be re-measured)*. OK writes
>   the items: renames reach the frames of the Cases the
>   enum feeds (Rule 17e); the value stays, and only falls back into range when it names no item
>   (measured: deleting the item under a middle value keeps the number; deleting the last item
>   under the value clamps it to 0).
> - **The panel.** Controls ▸ Modern ▸ Ring & Enum holds five entries in two rows (Text Ring,
>   Menu Ring, Enum, Pict Ring, Text & Pict Ring); only **Enum** is done: a control 61 × 25 px
>   (its box 49, next to the Numeric Control's 55) with the increment arrows on the left,
>   showing the current item's name; the indicator is the same without arrows and with a grey
>   box. The arrows move to the next or the previous item. Their right-click menus
>   (`context.enum-control`, `context.enum-indicator`) have the measured rows; *Edit Items…* is
>   done and the rest is greyed. Create ▸ Control / Indicator on an enum terminal makes these.
> - *Unverified:* whether the dialog's Delete is greyed with a single row (contradicted between
>   the two reports); whether Enter and Escape with no row being written are OK and Cancel in
>   LabVIEW too, or only the Windows default; whether the panel arrows wrap around at the ends (here they stop); the title of
>   the panel objects' dialog; the selected-row colour of the list; the exact px of the dialog
>   (derived from a ≈1.62× capture). *Not done, measured:* Add Item After / Before (an empty item
>   made current with an inline name editor), Remove Item (removes the current item; the last one
>   can never be removed), Select Item… (a window with a filter; Enter commits).

> **Rule 40i — The error cluster on the diagram and on the panel.** Captured in
> LabVIEW 2026 Q3 (`labview-captures/errores/`, `docs/reference/labview-errors.md`),
> at 1:1; the behavior is DT-043:
>
> - **Wire:** 3 px, olive #7f7f00 border at the top and bottom and, in the center, 2 px strokes of
>   yellow #ffff00 and black #000000 alternating. The terminal of an error control or
>   indicator is the 38 × 38 one with an olive frame and inside it the gray box with the
>   colored bars of its fields; the tab carries three strokes, not a text.
> - **Error constant** (`202.png`): 22 × 57 px, 1 px olive frame and three cells:
>   status (F, green border), code (0, blue border) and source (pink border). A click on the
>   status cell toggles it; with a double click on code a number is typed (Enter
>   confirms) and on source, several lines (Enter starts a new line; Enter Text or a click
>   outside confirm).
> - **Error In and Error Out controls** (Controls ▸ Modern ▸ Data Containers, 2 columns,
>   8 elements: Array, Cluster, RealMatrix.ctl, ComplexMatrix.ctl, Set, Map, Error In
>   3D.ctl and Error Out 3D.ctl; the first six, greyed out): 155 × 121 px, gray with
>   relief, with "status" (20 × 19 button with green ✔ if FALSE and red ✘ if TRUE),
>   "code" (prefix "d"; on the control, with ▲▼) and "source" (box of ~4 lines with a bar).
>   They are born with the label "error in (no error)" and "error out", with status FALSE, code 0 and
>   empty source. On the control, a click on status toggles it and a click on code or on
>   source types into it (on source, Enter starts a new line and **Ctrl+Enter confirms**), in
>   edit mode and in Run mode; on the indicator, a click does not type.
> - **Dialog & User Interface** (`59-paleta-dialog-ui.png`): 4 columns and 23 elements
>   in LabVIEW's order. Done: Simple Error Handler, Clear Errors, Merge Errors
>   (stretched like Compound Arithmetic, born with 2 inputs and measures 32 × 18),
>   Error Cluster From Error Code and Error Cluster Constant; the rest, greyed out with their
>   reason; the five folders (Multiple Errors, Events, Menu, Cursor and Help), not opened.
> - **The two error dialogs** are modal over the window that launched the VI, with no
>   title text (program icon and ✕ in its bar), and the VI **waits** until they are
>   answered. The automatic handling one (`44b-dialogo-x3.png`): red ✘ icon, "Error N
>   occurred at …" and "Possible reason(s):" in bold, the text, the detail of the
>   source, "Search ni.com for error" (greyed out) and the buttons **Continue**, the factory default
>   (Enter), and **Stop**; Stop aborts the VI. The Simple Error Handler one
>   (`102b-dialogo-x2.png`): no icon or bold, with **OK**; on an undefined code,
>   "Why not found?" (greyed out). Abort with a dialog open closes it. The text comes from
>   `core/runtime/error-codes.mjs`: the codes are LabVIEW's and the texts, our own (DT-043 §5).
> - **Unverified or not done:** the right-click menu of the error controls and
>   constant (Explain Error…), Help ▸ Explain Error… (greyed out), Run mode with
>   several dialogs at once, values of "type of dialog" other than 1 and a warning
>   (status FALSE, code ≠ 0) at the input of Simple Error Handler, the contents of the
>   folders Multiple Errors, Events, Menu, Cursor and Help, and Error Ring, General Error
>   Handler and Find First Error (only their terminals were measured).

*(The coupling between the two canvases belongs to the domain, not technical debt: they are a
1:1 unit. What is debt is how it was implemented —a global model mutated
through a generic field of the interface, with no notification
mechanism.)*

## 8. Editing state

> **Rule 41.** The editor **MUST** distinguish a VI with unsaved changes and
> **MUST** ask for confirmation before discarding them.

> **Rule 41 is implemented in the web editor** (2026-09-30,
> `editor/electron/main.mjs`): each window tells the main process how
> the VI stands after each change; if it does not match what is saved, the title carries
> an asterisk, as in LabVIEW, and before opening another VI or closing the panel it
> asks whether to save, not save or not continue. An automatic test is missing: it has been
> verified in the application.

> **Rule 42.** The editor **MUST** offer undo and redo on every
> operation that modifies the VI.

> **Rule 42 is implemented for the diagram** (2026-09-30,
> `editor/src/block-diagram/undo-history.mjs`): since the graph is never mutated, each stable state
> is a snapshot, and a gesture —dragging a node or a segment, typing into a
> constant— is a single step. `Ctrl+Z` undoes and `Ctrl+Shift+Z` redoes. The
> Edit menu is missing, which is not captured. On the panel it also undoes (2026-09-30),
> but each window carries its own history: what is undone in one reaches the other
> as one more change. It was going to be inherited from
> `red-sg` (DT-031, see [`whitelist.md`](../reference/history/whitelist.md) §3).

## 9. What the editor does not do

*(informative)* The editor clones LabVIEW's information architecture
—menus, toolbars, palettes and windows, with their names and their order—
and declares in its place what Solder does not do, so that the interface itself is
the guide to what is missing. The decision, its scope and its rationale are in
[DT-035](../design/05-decisions.md#dt-035). The verdict on each element lives
in the *LabVIEW inventory*,
[`../schema/inventario-labview.json`](../schema/inventario-labview.json), and not in
the editor's code.

> **Rule 52.** Everything the *reference* shows within the scope of DT-035
> **MUST** appear in the editor where LabVIEW puts it and with its name, at the level
> of detail the inventory declares, **even if Solder does not do it**. A
> *placeholder* is shown disabled; it **MUST NOT** be omitted.

> **Rule 53.** An element whose *verdict* is not `built` **MUST NOT** modify the
> VI or start any action. Activating it —with the mouse, from a menu or with
> its keyboard shortcut— only shows its explanation.

*(The shortcut matters. Someone coming from LabVIEW will press `Ctrl+Z` without looking at the menu. A
shortcut that does nothing reads as a failure; one that says "this does not exist yet, and
is waiting for such-and-such" reads as what it is.)*

> **Rule 53b.** A container —a menu, a palette, a palette category—
> whose content is declared in the inventory **MUST** be openable even if
> it is a placeholder: opening it does nothing, it only shows what it contains, which responds
> according to its own verdict. If its content is not declared, activating it only
> shows its explanation, as rule 53 requires.

> **Rule 54.** The explanation of a placeholder **MUST** say what LabVIEW does there and
> what its verdict obliges to declare: what is missing (`todo`), how it is done in
> Solder (`elsewhere`) or what decision excludes it (`never`).

> **Rule 55.** The editor **MUST** take the verdict of each element from the
> inventory, and **MUST NOT** decide in its own code whether something is done.

> **Rule 56.** An inventory entry **MAY** only become `built` when
> what is behind it is implemented and verified **without an interface**, and **MUST**
> name the test that proves it. If it is a function or a control of the
> palettes, its block **MUST** exist in
> [`../schema/blocks.json`](../schema/blocks.json).

*(It is the rule that closes the way to the false green: `waveform-chart` and
`waveform-graph` appeared as completed without doing anything —see
[`whitelist.md`](../reference/history/whitelist.md) §6.2—. With this rule, declaring them done
would have required naming a test that did not exist.)*

## 10. Verification

| Rule | Mechanism | Status |
|-------|-----------|--------|
| 22, 23 selection | Tests in `test/editor/diagram-editing.test.mjs`: the click selects, `Shift` adds, the rectangle selects what it touches, everything selected is moved | **Verified** on the diagram, without structures |
| 24 stable zone order | Hit-test test with overlapping elements. The editor resolves terminal, node, wire and background, in that order (`app.mjs`); the test is missing | Pending |
| 25 dragging does not change the program | Compile before and after moving: same bytes | Pending |
| 26 dragging between scopes reassigns | Tests "dropping a node inside a loop puts it in and outside takes it out" and "wiring across the border creates the tunnel" (`test/editor/diagram-editing.test.mjs`) | **Verified** (amended: LabVIEW rules) |
| 40e While Loop and For Loop | Tests in `test/editor/diagram-view.test.mjs` (measurements at 1:1, compared pixel by pixel against the captures) and `diagram-editing.test.mjs` (place, move, stretch, tunnels, menus and a loop made with the mouse that runs) | **Verified**; what is unverified, in the rule itself |
| 28, 29 deleting takes the wires with it | Test: after deleting no orphan wire remains | **Rule 28 verified** ("deleting a node deletes its wires"); rule 29: a loop goes with everything that is its own, but still without asking for confirmation |
| 40f Case Structure | Tests in `diagram-view.test.mjs` and `diagram-editing.test.mjs` (measurements, frames, menus, compile and run) | **Verified**; what is unverified, in the rule itself |
| 40g Flat and Stacked Sequence | Tests in `diagram-view.test.mjs` (film border, frames, tunnels, selector and local variables), `diagram-editing.test.mjs` (place, stretch, frames, menus, change shape, compile and run) and `structures.test.mjs` (widths in the file) | **Verified**; what is unverified, in the rule itself |
| 40h Strings on the diagram and on the panel | Tests in `palettes.test.mjs` (each String function with its terminals and measurements), `window-state.test.mjs` (the four palettes), `front-panel.test.mjs` (control and indicator), `diagram-editing.test.mjs` (multi-line constant, Concatenate Strings, a string VI made with the mouse that runs) and `qvi-round-trip.test.mjs` (save and open) | **Verified**; what is unverified, in the rule itself |
| 40i The error cluster | Tests in `error-cluster.test.mjs` (the wire, the constant and its edits, the two dialogs, Simple Error Handler and Merge Errors at 32 × 18), `front-panel.test.mjs` (Error In and Error Out) and `window-state.test.mjs` (the two palettes) | **Verified**; what is unverified, in the rule itself |
| 40j One-dimensional arrays | Tests in `front-panel.test.mjs` (array control and indicator), `diagram-editing.test.mjs` (array constant, menu of the indexed tunnels), `window-state.test.mjs` (the Array subpalette), `palettes.test.mjs` (its functions) and `qvi-round-trip.test.mjs` | **Verified** for what was measured; the gesture of stretching the panel array and the array's menu, unverified (see the rule) |
| 40k Arrays with two dimensions | Tests in `array-grid.test.mjs` (cells, Add and Remove Dimension), `diagram-editing.test.mjs` (menu, constant, stretching, wire, Index Array, Initialize Array), `front-panel.test.mjs` (panel array), `qvi-round-trip.test.mjs` (pairs saved) and `labview-inventory.test.mjs` (the menus) | **Verified** for the measurements; the stretching gestures, the indicator's menu and Initialize Array's second size, unverified (see the rule) |
| 78 Format Into String and Scan From String | Tests in `format-nodes.test.mjs` (size, terminals, stretching, type boxes, menus, Add and Remove Parameter) and `palettes.test.mjs` | **Verified** for the size, the stretching and the menus; the terminals' exact heights, unverified (see the rule) |
| 72–76 Create ▸, the clipboard and the Edit menu | Tests in `terminal-creation.test.mjs` (placement), `create-and-paste.test.mjs` (menus, copy, cut, paste, duplicate) and `edit-menu.test.mjs` (rows and what is greyed) | **Verified** for what was measured; what is unverified, in the rules |
| 31 the rejection explains the reason | Test: each cause of `can_connect` produces its message | **Verified** for two outputs, two inputs, incompatible types and cycle (`palettes.test.mjs`); the scope one no longer comes out in the editor: a wire between scopes creates the tunnel (rule 40e); the rejection remains in `Gr.conectar` |
| 32 replace on fan-in | Test "a wire to an occupied input replaces the previous one" | **Verified** |
| 36, 37 keyboard | Interaction test | **Rule 36 verified** ("the selection moves with the arrows…"); rule 37, pending |
| 38–40 synchronization | Test: create, delete and retype from each canvas | Pending |
| 42 undo | Test "undo goes back a whole gesture" (`test/editor/diagram-editing.test.mjs`) | **Verified** on the diagram |
| 52, 55 what is declared is painted, and what is painted is declared | Screenless painting test against the inventory: each painted element has its entry, and each entry is painted in its order (`test/editor/window-view.test.mjs`) | **Verified** for the *Front Panel* and the *Block Diagram* |
| 52 where LabVIEW puts it | Position test: each element of the toolbar, within 2 px at most of its place in the captures ("the toolbar falls where it does in LabVIEW") | **Verified** for the *Front Panel* and the *Block Diagram* |
| 53 a placeholder does not act | Interaction test: the click, the right-click on the canvas and a shortcut only open the explanation, and Esc closes it (`test/editor/window-state.test.mjs`) | **Verified**. That it does not change the VI is trivial as long as there is no model |
| 53b a declared container opens | Tests of the function palette: right-click on the diagram opens it; a category with content opens and closes; one without content is only explained (`test/editor/window-state.test.mjs`) | **Verified** |
| 54 the explanation is complete | Inventory schema: each verdict requires its field and only its own; explanation test (`test/editor/labview-inventory.test.mjs`) | **Verified** |
| 56 `built` requires proof | Schema: `built` requires `prueba`. Test: the proof exists and the block is in `blocks.json` | **Verified**. The only `built` ones are the palette's double arrows, with their test |

## 11. Pending

| # | Issue | Blocks |
|---|----------|---------|
| 1 | **Undo and redo** (§8) | Nothing in the spec, but it is the biggest functional debt |
| 2 | Explicit "move to scope" command (§3.3) | Nothing; it is a refinement of rule 26 |
| 3 | Exact jump of `Shift`+arrow: 8 px or 12 px? | Nothing. Open in `06-visual.md` §1.3 since the beginning. The editor uses 8, provisional: it still has to be verified in LabVIEW |
| 4 | Selection by drag rectangle | Unspecified. The web editor has it like LabVIEW: it selects what the rectangle touches, and `Shift` adds |
| 5 | Break the inventory down area by area, with captures of the reference in front (DT-035 §5 and §8). **Started**: the *Project Explorer*, the *Front Panel*, the *Block Diagram* and the function palette, 127 entries; the contents of the menus, not yet | That rules 52–56 have something to check |

## 12. SubVIs (DT-045, 2026-10-03)

Measured in LabVIEW 2026 Q3 (`labview-captures/subvi/`).

> **Rule 66 — Several VIs open.** Each open VI has its own Front Panel and Block Diagram, its own file and its
> own unsaved changes (asterisk and "Save changes?" per VI). File ▸ Open opens another VI in new windows, or
> brings forward the windows of one already open; File ▸ Exit asks about each VI with unsaved changes and quits (rule 98). Tested in
> `test/editor/vi-registry.test.mjs`.

> **Rule 67 — Connector pane.** The Front Panel shows the pattern 4-2-2-4 (cells 0-3 left, 4-5 and 6-7 middle,
> 8-11 right) left of the icon. Click a cell, then a control or an indicator: it is assigned (a control is an
> input, an indicator an output) and the cell is filled with the type colour; an output cell is black with a
> small square of that colour. Right-click: Disconnect All Terminals, Disconnect This Terminal and This
> Connection Is ▸ Required / Recommended (default, checked) / Optional work; the last two are greyed without a
> terminal under the cursor, and Required is greyed for an output. Add/Remove Terminal, Rotate and Flip
> are placeholders (only 4-2-2-4 exists). Patterns ▸ opens, on hover, a grid of 36 icon-only thumbnails (6 × 6,
> `connector-menu-patterns.png`) with the pattern in use outlined in blue; only 4-2-2-4 can be chosen (choosing it
> only closes the menu) and the other 35 are greyed, and hovering one says why. The shapes are in
> `core/model/connector-patterns.mjs`. Unverified: LabVIEW's names for the 35 other patterns, and what choosing
> one does to the terminals already assigned. A deleted control leaves the connector. Written as `vi.connector`.
> Unverified: how LabVIEW marks the cell that waits for an element (ours: blue frame); the edge of the icon for the
> middle cells (ours: top for 4 and 6, bottom for 5 and 7); the default cell of a terminal written without one.
> Tested in `test/editor/connector-pane.test.mjs` and `test/editor/connector-patterns.test.mjs`.

> **Rule 68 — SubVI node.** Select a VI... (Functions palette) opens the file dialog; the VI follows the cursor
> and a click drops it. The node is the 32 × 32 icon of the callee; its terminals sit on the edge next to their
> connector cell, with the wire touching the border. Double click or Open Front Panel opens the callee's windows.
> The other menu rows are placeholders. Tested in `test/editor/subvi-nodes.test.mjs`.

> **Rule 69 — Stored path.** `config.vi` is relative to the caller's file. A caller never saved stores the
> absolute path, and every save (first save or Save As elsewhere) rebases it relative to the new file.
> Tested in `test/editor/vi-paths.test.mjs`.

> **Rule 70 — Hierarchy in the editor.** A VI is loaded with its subVIs (`loadHierarchy`); Run compiles what is on
> disk and keeps one `estado` per top-level VI between Runs. When a subVI is saved, the open callers rebuild their
> view; wires to ports that no longer exist **stay, broken, with a loose end where the terminal was drawn**, and the caller is
> not marked modified (rule 91; measured, DT-046). A missing subVI or a recursive call breaks the Run arrow and Run reports why.
> Tested in `test/end-to-end/subvi-editor.test.mjs` and `test/editor/subvi-nodes.test.mjs`.

> **Rule 71 — VI Properties.** File ▸ VI Properties (Ctrl+I) and the connector and icon menus open a modal dialog on
> Execution; Non-reentrant and Preallocated clone work and write `vi.execution`; the rest is greyed with its reason.
> Tested in `test/editor/vi-properties.test.mjs`.

## 13. Create ▸ and the clipboard (2026-10-08)

Measured in LabVIEW 2026 Q3 (`labview-captures/create-paste/`, with `REPORT.md`). What the report marks
unverified is unverified here too.

> **Rule 72 — Create ▸ on a terminal.** The right-click menu of a function node (body, inputs and outputs alike)
> has Create ▸ Constant, Control, Indicator, Scalar ▸ (Constant, Control; only on an array terminal), Channel
> Writer..., | All Controls and Indicators, All Constants. It acts on the terminal under the pointer when the menu
> opened; on the body of a node Constant, Control and Indicator are greyed (`subvi-node-menu-create.png`) and the
> two All items work. Constant, Control and Indicator on a terminal of the right direction make an object of the
> terminal's type (`core/model/create-on-terminal.mjs`), wired, and one undo removes all of it. On an input a
> constant is `gap` px left of the node's left edge, centred on the terminal, with its value typed in (selected, not
> an object selection); `gap` is 16 for Add, Quotient & Remainder and And and 8 for Index Array, String Length, Array
> Size, Unbundle and Simple Error Handler (`CONSTANT_GAP_BY_BLOCK`; why they differ is unknown, and a block that was
> not measured gets 16: unverified). A control is a 38 × 38 terminal 16 px left of the node, centred, labelled with
> the terminal's name (typed in; numbered if taken, "x 2") on its left; an indicator, 16 px right of an output, label
> on its right. A constant or a control on an output, or an indicator on an input, is created of that type and left
> unwired: constants and controls above the node's upper left corner, the indicator touching its right edge (the
> exact offsets: unverified). An object that would sit on another one is pushed up until their boxes touch, and its
> wire turns 5 px inside the node (`create-two-constants-on-add-collision-avoidance.png`; only measured for
> constants). On the panel a control goes to the first free place of a grid at the top left (66 px across, 42 down,
> the first box at (2, 21)) and an indicator to the first free place of a row that starts at the panel's horizontal
> centre, one box (minus a pixel) apart; how many rows a column holds and the order indicators fill are unverified
> (ours: as many rows as fit; along the rows), and since the diagram cannot see the other window it takes the
> size of its own canvas for the panel's. All Controls and Indicators and All Constants make one object for each
> terminal that has no wire yet (the last terminal first, so the stack keeps their order, 2 px apart); only the
> inputs get a constant. Whether LabVIEW skips the wired terminals is unverified. A type with no block yet (a
> generic cluster) says so in a notice; Scalar ▸ and Channel Writer... are greyed with their reason. An object made
> next to a node inside a structure is inside it. The step of undo closes before the typing: what is typed afterwards
> is a step of its own. Tested in `test/editor/terminal-creation.test.mjs` and `test/editor/create-and-paste.test.mjs`.

> **Rule 73 — The wire menu.** Right-click on a wire, or on a terminal that has one (not a structure's border), opens
> the wire's menu (`context.wire`): Clean Up Wire, Create Wire Branch, Delete Wire Branch, | Visible Items ▸,
> | Insert ▸, | Numeric Palette ▸, Create ▸, | Add Probe, Custom Probe ▸, Add Breakpoint, | Description and
> Tip.... Create ▸ is Constant, Control, Indicator, Create SubVI from Selected Wires and Channel Writer...; the three
> that work make the object of the wire's type, UNWIRED, centred on the point where the menu was opened (unverified:
> LabVIEW's place). The rest of the menu is greyed with its reason. Tested in `test/editor/create-and-paste.test.mjs`.

> **Rule 74 — Copy, cut, paste, delete and select all.** On the diagram and on the panel, Ctrl+C, Ctrl+X, Ctrl+V,
> Ctrl+A and the Edit menu (Delete has no shortcut but the key). Copy takes the selected nodes with everything inside
> a structure among them and the wires whose two ends are in the copy; the wires to what is left out are not copied
> (`core/model/clipboard.mjs`). Cut removes the nodes and their wires (no broken wire is left; Delete, in contrast, leaves them
> broken: rule 91) and one undo brings them back. Paste puts the copy centred on the pointer (the last place it was over the canvas; Edit ▸ Paste uses the same;
> unverified: LabVIEW's place for the menu), selects the copy, makes every pasted node a new id and name, and puts
> each copy of a structure's contents in the structure it fell in (rule 26). Pasting again without moving the pointer
> shifts the copy 8 px down and to the right each time (LabVIEW sometimes lands on the place the selection was made:
> the cause is unverified and not reproduced). A pasted control gets its panel object in the first free place of the
> panel's left column, with a numbered label ("x 5"); pasted on the panel, a control is centred on the pointer, numbered,
> and gets its terminal on the diagram, unwired, 8 px down and to the right of the original's (unverified); a
> diagram-only fragment pasted on the panel takes just its controls and indicators. One paste is one step of undo. The
> clipboard is shared by every open VI through the main process (`clipboard:write` and `clipboard:read`; it is kept as
> JSON text, not on the system clipboard, so what else the user copied does not matter): a subVI node pasted in
> another VI has its stored path rebased to the file it is pasted in and its callee read first. Cut, Copy and Delete
> are greyed with nothing selected (Delete also works on a selected wire); Paste is greyed with nothing copied
> (unverified: the captures had something copied). Select All selects every node and wire of the diagram, or every
> panel object. Tested in `test/editor/create-and-paste.test.mjs`.

> **Rule 75 — The Edit menu.** Undo Ctrl+Z, Redo Ctrl+Shift+Z | Cut, Copy, Paste, Paste Special Ctrl+Shift+V, Delete,
> Select All | Make Current Values Default, Reinitialize Values to Default | Customize Control..., Import Picture to
> Clipboard..., Set Tabbing Order... | Remove Broken Wires from Selection Ctrl+B, Clean Up Selection Ctrl+U, Remove
> Breakpoints from Hierarchy, Create VI Snippet from Selection, Create SubVI | Enable Diagram Grid Alignment Ctrl+#,
> Show Hidden Controls While Editing, Align Items Ctrl+Shift+A, Distribute Items Ctrl+Shift+D | VI Revision History...
> Ctrl+Y, Run-Time Menu..., Adjust Pane Origin | Find and Replace... Ctrl+F, Show Search Results Ctrl+Shift+F. On the
> panel: Make Selected Values Default, Reinitialize Selected Values to Default, Clean Up Panel, Disable Panel Grid
> Alignment; Customize Control... and Adjust Pane Origin are enabled there and greyed on the diagram (ours: all are
> placeholders with their reason). With nothing selected the diagram's "...from Selection" rows read "Remove Broken
> Wires" and "Clean Up Diagram", and Create VI Snippet and Create SubVI are greyed. Undo and Redo work (greyed with no step).
> Unverified: LabVIEW names the step in the row ("Undo Create"); ours says "Undo". Tested in `test/editor/edit-menu.test.mjs`.

> **Rule 76 — Ctrl+drag.** Dragging the selection with Ctrl held leaves the originals and carries copies of them,
> without the wires to what is left out; on the diagram a copied control gets its own place on the panel, on the panel
> a copy is numbered and gets its terminal on the diagram. The whole drag is one step of undo. Tested in
> `test/editor/create-and-paste.test.mjs`.

> **Rule 77 — Deleting a control on the panel.** LabVIEW removes its terminal and leaves the wire BROKEN on the
> diagram (`panel-delete-control-diagram-leaves-broken-wire.png`). Solder does the same since DT-046: the wire stays,
> still attached to the terminal that remains, with a loose end at the point of the diagram where the deleted terminal was
> drawn (rule 91). One delete is one step of undo. Tested in `test/editor/broken-wires.test.mjs`.

## 14. Format Into String and Scan From String (2026-10-08)

> **Rule 78 — The two nodes with rows.** Format Into String and Scan From String are placed from Functions ▸ Programming ▸
> String, centred on the click. Measured in LabVIEW 2026 Q3 (`labview-captures/format-scan/`, 1:1): Format Into String is
> 32 × 29 px (`03z.png`) and Scan From String 32 × 37 px (`31z-scan-placed.png`), with a 1 px border `#4C4C3D` and fill
> `#FFFFCC`. Terminals: the format string on top, in the middle; on the left, initial string and error in
> (Format) or input string, initial scan location and error in (Scan), and then the rows (an input per row, `input N` in
> Format and `default N` in Scan); on the right, resulting string and error out (Format) or remaining string,
> offset past scan and error out and then one `output N` per row (Scan). Each row has the box of its type (DBL orange,
> I32 blue, string pink `abc`, Boolean green `TF`): on the left in Format, on the right in Scan, following what is wired
> (an unwired row is DBL). The tips are the names of the context help (`02-qd.png`, `30-scan-context-help.png`).
> Stretching the bottom handle adds rows of 8 px (`16-node-stretched.png`, `36-scan-created.png`); the width does not
> change, and shrinking only removes unwired rows, from the bottom, down to one. On Scan, right-clicking a row's
> terminal (`default N` or `output N`) adds **Add Parameter** (a row right below it) and **Remove Parameter** to the menu
> (`32b-scan-menu-param.png`); Remove Parameter takes the row's wires with it and is greyed when only one row is left.
> The menus (`04-fmt-menu.png`, `32-scan-menu.png`) have LabVIEW's rows in its order; Create ▸ is the generic one
> (rule 72); everything else is a hole, and Edit Format String / Edit Scan String is greyed because the dialog
> (`05-edit-format-dialog.png`, `33-scan-dialog.png`) is not built.
> Tests: `test/editor/format-nodes.test.mjs` and `palettes.test.mjs`.
>
> **Unverified:** the exact vertical position of the fixed terminals (read from the captures at about 8x, to half a
> pixel); the terminals of Scan From String are placed from the context help (`30-scan-context-help.png`) because the
> capture of the placed node (`31z-scan-placed.png`) does not show them; where Add Parameter inserts the row (below the
> clicked one is our choice); whether Remove Parameter of the last row is greyed in LabVIEW; whether a row keeps its type after its wire is
> deleted (here it does once it has been stretched or added, from `config.rowTypes`). **Measured:** a stretched or
> added row takes the type of the row above it (`16-node-stretched.png`, I8 rows after an I8 one); the mark of
> the default of each row and the icon on the top are our own drawings (diagonal and `!` marks of the original are
> not reproduced); there is no Context Help window yet, so the terminal texts are only the tips.

## 15. Waveform Chart, Waveform Graph and XY Graph (2026-10-09)

Measured in LabVIEW 2026 Q3 (`labview-captures/graphs/`, with `REPORT.md`); how they look is in
[`06-visual.md`](06-visual.md) §8. What the report marks unverified is unverified here too.

> **Rule 79 — Placing and wiring.** Controls ▸ Modern ▸ Graph is a 4 × 4 grid (`01-palette-graph-grid.png`): Waveform Chart,
> Waveform Graph, XY Graph, Express XY Graph | Intensity Chart, Intensity Graph, Digital Waveform Graph, Mixed Signal Graph | Compass
> Plot, Error Bar Plot, Feather Plot, XY Plot Matrix | the folder Controls (`02-palette-graph-subfolder-controls.png`: Polar Plot,
> Smith Plot, Min-Max Plot, Distribution Plot and Radar Plot Indicators, 2D Picture and the folder Datatypes), a free cell, 3D Picture
> and 3D Graph. The three first are built; the others are greyed with their reason. A graph is placed as any control (it hangs from
> the pointer by its centre), with its label ("Waveform Chart", "Waveform Graph", "XY Graph") and its terminal on the diagram. The
> terminal is an indicator that takes the wire in; it accepts what `graphAccepts` (`core/model/types.mjs`) says and breaks
> any other wire with "This waveform chart does not accept …": a chart takes a number, a 1D or 2D array of numbers or a cluster of
> numbers (a cluster of arrays breaks it, 73); a graph, a 1D or 2D array or a cluster of x0, dx and an array (87); an XY Graph, a
> cluster of two arrays (85). Unverified: an array of timed clusters on the graph, an array of points on the XY Graph, a 2D array on the chart.
> Tested in `test/editor/graphs.test.mjs`.
>
> **Rule 80 — A chart keeps its history.** Each write to a Waveform Chart adds points to its history (a number, one; a 1D array, all of
> them at once, 72; a cluster, one per plot, 74); the history lasts after the VI stops and through the next Runs (the X axis goes on, 71),
> and is cleared by Data Operations ▸ Clear Chart (75) and when the type of its wire changes (71). Its length is 1024 by default
> (Chart History Length..., `50-chart-history-length-dialog.png`: "Number of data points in chart history buffer", OK, Cancel, Help;
> here a whole number of at least 1; what LabVIEW does with another value is unverified). The history belongs to the window, not to the VI:
> it is not saved in the `.qvi`. The run worker sends the chart **every** write, in order, and the other indicators only the last
> one of each pause. A Waveform Graph or an XY Graph keeps the last value it received (Clear Graph empties it).
>
> **Rule 81 — The menus.** Right-click on a graph in edit mode opens its menu (`10`–`23`, `30`–`35`, `40`–`45`); the rows and their
> order are the inventory's (`context.waveform-chart`, `context.waveform-graph`, `context.xy-graph`). Done: Visible Items ▸
> Label, Plot Legend, X Scale and Y Scale (hide or show), Data Operations ▸ Clear Chart / Clear Graph, X Scale ▸ and Y Scale ▸
> AutoScale (switching it off keeps the range the axis showed; switching it on again follows the data), Loose Fit (greyed while its
> axis does not autoscale, as in 14) and Visible Scale Label (the name of the axis), and the chart's Chart History Length.... The
> chart's X is the Strip window and has AutoScale X unchecked; switching it on fits the whole history (unverified). Everything else is
> a hole with its reason (rule 55), among them the legend's and the plot swatch's menus (`90`–`98`, `context.plot-legend`,
> `context.plot-swatch`: opened by right-clicking them, all greyed), Update Mode (Scope and Sweep), Stack Plots, markers, cursors
> and annotations, Export and Create ▸. While the VI runs, right-click on a chart or a graph opens its run-time menu (`88`, `89`:
> `context.run-chart`, `context.run-graph`; the XY Graph takes the graph's, unverified) with Clear Chart / Graph, AutoScale X and Y
> and Visible Items ▸ (its content unverified: the same four toggles); the rest is greyed.
>
> **Rule 82 — In the file.** What a user can change is saved with the panel item as `graph` (`docs/schema/qvi.schema.json`):
> `autoscale-x`, `autoscale-y`, `loose-fit-x`, `loose-fit-y`, `scale-x` and `scale-y` (the range kept when an axis does not
> autoscale), `history-length` and `hidden` (what Visible Items hid). Only what differs from the defaults is written
> (chart: AutoScale X off; every other axis on, with Loose Fit; 1024 points).
>
> **Unverified:** that hiding a scale leaves the plot where it is (here it does); the compact view of the terminal; the legend of
> several plots (it always shows Plot 0); what the chart does with AutoScale X on and with a 2D array; the behaviour of the mouse over the
> plot at run time (not determined in the report); the exact rule of autoscale (see `06-visual.md` §8.3).

## 16. Debugging (2026-10-09, DT-047)

Measured in LabVIEW 2026 Q3 (`labview-captures/debugging/`, with `REPORT.md`; the numbers of the captures are cited); how it
looks is in [`06-visual.md`](06-visual.md) §14. What the report marks unverified is unverified here too. Code: `editor/src/debugging/`
(`debug-controller.mjs` in the run worker, `debug-state.mjs`, `debug-view.mjs`, `debug-plan.mjs`, `error-list.mjs`), tested in
`test/editor/debugging.test.mjs`, `test/editor/debug-controller.test.mjs` and `test/end-to-end/debugging-worker.test.mjs`.

> **Rule 83 — The debugging buttons.** The diagram's toolbar has, after Pause, Highlight Execution, Retain Wire Values, Step Into,
> Step Over and Step Out (`10b`); the panel's has Pause. Edit mode: all enabled but Step Out; Step Into and Step Over read "Start
> Single Stepping" (13, 14). Running: Run reads "Running", Abort `Abort execution of "<VI>"` (75), Pause is black, the steps are
> greyed. Stopped: Pause is red and reads "Continue", Step Into and Over read "Step over <node>", Step Out "Finish Iteration" inside a
> loop (75, `74b`). A broken VI shows the broken Run arrow, "List Errors" (98), and greys Run Continuously, Abort and the steps (91c).
> With VI Properties ▸ Execution ▸ Allow debugging off, Highlight Execution, Retain Wire Values, Pause and the steps are greyed and
> their tooltip says why (unverified in LabVIEW). **Unverified:** what Pause does in edit mode (here, nothing), what Start Single
> Stepping does (here: the VI starts and stops before its first node), "Step out of <VI>" at the top level (here also "Finish
> Structure" in a Case or a sequence), the tooltips of the steps while the VI runs, and Step Into on a subVI node (greyed here:
> the subVI is not stepped into yet).
>
> **Rule 84 — Highlight Execution.** A toggle (no pressed frame, `20`); pressing and holding it for 1.5 s opens a menu Slow, Medium
> (default), Fast, Very Fast with a check on the current one; releasing over a speed picks it, releasing elsewhere closes the menu
> and leaves the bulb on (22, 42). It can be turned on before or during a Run. While it is on the diagram is dimmed (60 % toward
> white) for 0.6 s, each node returns to full color when it runs, a 5 px band grows along each of its wires and a value tag
> appears at the source when the band arrives; when a node runs again everything dims anew; when the VI ends everything returns to
> normal (30–35). Parallel clumps run one at a time. **Pace:** the worker holds the VI after each node for the length of the
> longest wire that leaves it divided by the speed (500 and 1000 px/s for Slow and Medium, measured as estimates; 3200 and 5300
> px/s for Fast and Very Fast, extrapolated from the iteration times: **unverified**), with a floor per node (120, 50, 15 and 5 ms:
> unverified). LabVIEW's pace is not fixed per node: it grows with wire length and node count (REPORT §1).
>
> **Rule 85 — Probes.** Add Probe in a wire's menu puts a numbered probe on it and opens the Debug Window with the new row selected
> (55). Probes and breakpoints share one numbering (71d). The label sits on the wire, with the live value tag beside it (55c); Show
> Values on Wires turns the tags off. Custom Probe ▸ lists the five kinds and New Custom Probe...; the names carry the type of the wire (53); only
> Generic Probe is done, which is the same probe, and the others are holes. Retain Wire Values keeps the last value of every wire
> after the Run, so a probe added later shows it (50, 59); without it a probe keeps the value it showed and nothing else is kept
> (unverified). **The value of a wire that starts at a border of a structure (a tunnel, a shift register, "i", "N") is not reported:
> the compiler does not hook those nodes yet (DT-047); the probe shows no value.** Probes are not saved in the `.qvi`.
>
> **Rule 86 — Breakpoints.** A node's menu and a wire's menu offer Add Breakpoint; with one, "Remove Breakpoint" and "Disable (Enable)
> Breakpoint" take its place (79). On a node it is a 3 px red frame outside the node, 2 px red and 1 px white when disabled (73, 80);
> on a wire, a red disc of 19 px with the number (71). The VI stops **before** the node, drawn inverted with the marching frame
> (74). The compiled VI only reports after a node, so the worker recovers "before": a node is ready when every wire from a reporting
> node has delivered its value, and the stop happens in the report that made it ready. A node with no reporting inputs (a constant)
> stops right after it; inputs that come through a border of a structure do not count. With parallel clumps another clump may run the
> node before the stop (Highlight Execution serializes them, breakpoints do not). A breakpoint on a wire stops after the node it
> starts at ("not distinctly observed in LabVIEW": **unverified**). Breakpoints on structures are holes. Breakpoints are
> not saved and are listed in the Debug Window. Edit ▸ Remove Breakpoints from Hierarchy clears them (this VI only: subVIs are not debugged).
>
> **Rule 87 — Stopped.** The Run arrow stays "running", Pause is red (Continue) and Abort is enabled (74b). Continue goes on to the next
> breakpoint; Step Over (and Step Into) runs the node and stops before the next one that is ready (76, 78); Step Out finishes the iteration of
> the loop (or the structure) the node is in and stops at the next node outside it (REPORT §4: tooltip only; the behavior is
> **unverified**). Pause stops before the next node that is ready. Abort frees a stopped VI.
>
> **Rule 88 — The Debug Window.** View ▸ Debug Window (Ctrl+D), Add Probe and the diagram open it: 682 × 338, toolbar (Remove Selected Probes and
> Breakpoints, Enable/Disable greyed without a selected breakpoint, Project Environment Settings and Help as holes, Debug Options), the
> list "Probes and Breakpoints | Value | Last Update" with the VI as a group, zebra rows and the selected row in blue, and the
> Probe Display pane with its Probe Options (the Custom Probe list). Debug Options: Hide Probe Display, ✓Keep Window on Top, ✓Show Values
> on Wires, Wrap Text (55–58). Last Update is `h:mm:ss,mmm` with the decimal separator of the system. Closing it asks "This operation will close all
> probes in VIs that are open outside of projects. Do you wish to continue?" and, with Yes, removes the probes (63, 64); "Do not
> ask again" is a hole. **Here it is a floating window drawn over the Block Diagram, like the dialogs, not an operating-system window;
> from the Front Panel, Ctrl+D asks the diagram to open it.** It can be dragged by its title bar; Keep Window on Top is always so.
>
> **Rule 89 — The Error list.** View ▸ Error List (Ctrl+L) or the broken Run arrow open it: 661 × 412, "Items with errors" (the VI with
> a red cross), "N errors and warnings", Show Warnings, the group "Block Diagram Errors" with one row per object ("Wait (ms): Contains
> unwired or bad terminal"), Details, Close, Show Error (default) and Help (92). Show Error and a double click bring the diagram to the
> front and frame the object with the marching frame, until something is clicked on the diagram (93, 95; how LabVIEW clears it is
> unverified). Rows come from the required inputs nobody wired, the broken wires (with their reason), what the hierarchy cannot
> load and what the compiler refuses. **Warnings are not computed** (the toolbar triangle and the Show Warnings items): the box is greyed. Run on a VI that
> cannot run opens the Error list instead of a message box. Unlike LabVIEW's, the text of Details is our own.
>
> **Rule 90 — Allow debugging.** VI Properties ▸ Execution ▸ Allow debugging (on by default) writes `vi.execution["allow-debugging"]` (only when false). With it
> off the compiler emits no debug hooks and Rule 83's buttons are greyed.

## 17. Broken wires with a loose end (DT-046, 2026-10-09)

Measured in LabVIEW 2026 Q3 (`labview-captures/broken-wires/REPORT.md`, cited by section). The model is in `core/model/graph.mjs`
(`{ suelto: [x, y] }`, `borrarDejandoCables`, `aflojarCablesHuerfanos`, `quitarCablesRotos`); the editor, in
`editor/src/block-diagram/diagram-editing.mjs` and `broken-wire.mjs`. Tested in `test/editor/broken-wires.test.mjs`.

> **Rule 91 — When a wire is left with a loose end.** (1) **Delete** on the diagram (key, Edit ▸ Delete) removes the selected nodes,
> constants or structures with everything inside and their tunnels, and **every wire to the rest stays, broken, with a loose end
> where the terminal was** (REPORT §1: `13`, `15`, `19`); one delete is one step of undo, and Ctrl+Z restores node and wires (`14`).
> (2) **Ctrl+X** (Cut) takes the wires with the nodes and leaves nothing broken (measured). (3) **Deleting a control or indicator
> on the Front Panel** leaves its wires on the diagram broken (rule 77). (4) A subVI saved without a connector terminal leaves
> the wires of its open callers, and of a caller opened later, broken with the loose end at the old terminal; the caller is not
> marked modified and the VI always opens (REPORT §2). A wire whose two ends would be loose is not kept. Selecting a wire and
> deleting it removes the whole wire.
>
> **Rule 92 — Where the loose end is and how the wire goes.** The loose end is the point where the terminal was drawn (the
> measured position: where the dashes end). The route is the one the wire had, or the default one if it had none; the end that
> is still wired follows its node when it moves; the loose end stays where it is. A wire with no source cannot be branched from
> (the reason is shown). **Unverified:** what LabVIEW does with the wire's `union` (branch point) when a source is deleted, and the
> two-source networks of REPORT §4, which Solder cannot make (a wire has one source).
>
> **Rule 93 — The reason, the tooltip, List Errors and the Error list.** A broken wire says why: a wire with a loose sink has
> "a loose end"; one that lost its source has "no source" (our words, `LOOSE_WIRE_REASONS`; LabVIEW tells the same cases apart,
> REPORT §6). The reason is the tooltip of the wire and of its loose end (`20`; the Context Help title "Broken wire" is not
> done). The right-click menu of a broken wire starts with **List Errors**, and has no Visible Items, Add Probe or Custom Probe,
> a greyed Add Breakpoint and, only on a wire broken by types that do not match, Clean Up Wire (`51`, `58`); a healthy wire has no
> List Errors. List Errors opens the Error list (rule 89) with that wire's row selected; the row is under Block Diagram Errors with
> the reason and a Details text of our own; Show Error frames the wire all the way to its loose end. **Unverified:** the Context
> Help text, the Details of the "both ends loose" case (Solder does not keep such a wire), and the Numeric Palette item (it names the
> wire's data type in LabVIEW; here it is the generic hole).
>
> **Rule 94 — Remove Broken Wires (Ctrl+B).** Edit ▸ Remove Broken Wires (with a selection, "Remove Broken Wires from Selection";
> `43`, `44`) removes every broken wire of the diagram: loose ends and types that do not match. With a selection, only the broken
> wires that are in it (wires or segments of wires selected; Select All takes them); **selecting a node does not select its wires**, so
> nothing goes (`45`, `46`). One undo step restores them all (`50`). **Unverified:** the name Undo shows right after Ctrl+B (the
> report did not capture it); the item is not greyed when there is nothing broken (not measured). On the Front Panel the same
> row stays a placeholder.
>
> **Rule 95 — Wiring a loose end again.** LabVIEW does it with the Wiring tool: click on the loose end, move to a compatible
> terminal, click: the wire becomes a normal one, from either side (`31`-`37`); the Automatic tool never connected it in three
> tries (undetermined). Solder has no tool palette, so **a click, or a press and drag, on the loose end starts a wire from it**
> (a dotted wire follows the pointer; Esc cancels) and the click or release on a terminal connects it with the same rules as a new
> wire: the wire is replaced by a normal one with the usual route; if the terminal is not accepted (wrong direction, types, an
> input already wired) the reason is shown and the wire stays broken. The loose end is a 4 px target that is not drawn.

## 18. Windows, Exit, Ctrl+E and Create on the loop terminals (2026-10-09)

Measured in LabVIEW 2026 Q3 (`labview-captures/editor-checks/REPORT.md`; the captures are local evidence and are not committed).

> **Rule 96 — The two windows of a VI always hold the same graph.** Each window keeps its own copy and sends it to the other when it
> comes to rest; the copies are **stamped** (a revision number and the window that made it, `editor/src/window/graph-sync.mjs`).
> A window takes an incoming copy only if its stamp is newer than the one it holds; an older copy is not taken and is answered
> with the newer one. Two changes made at the same time carry the same revision and the window name decides, the same in both,
> so both windows end up on one graph (the other change is lost, as there is nothing to merge it with). Before this, two copies
> that crossed on their way swapped for good and Save wrote a different VI depending on the window it was pressed in. Undo and a
> hierarchy rebuild that changes the graph (Run) are copies like any other. Tested in `test/editor/graph-sync.test.mjs`.
> **Not reproduced:** the `.qvi` of the Windows tester, whose diagram showed an out-and-back wire after dragging the Stop
> terminal into a While Loop, could not be obtained from the editor with pure drags (15 912 drops and 16 000 random drags
> in a fuzz, and the same steps in the real window under Xvfb); the cause of that drag is unknown (see the report of this change).
> A wire out of a structure and back into it is a broken wire (STRUCTURE_CYCLE_REASON), as in LabVIEW (`§1f`).

> **Rule 97 — Delete inside a loop.** A node inside a While or For Loop is deleted by clicking it and pressing Delete, or by
> a rubber band started on an empty point of the loop interior (the band does not move the loop) and Delete (REPORT §2).
> Tested in `test/editor/diagram-editing.test.mjs` and checked in the real window.

> **Rule 98 — File ▸ Exit (Ctrl+Q).** It asks about each VI with unsaved changes, one after the other: "Save changes? (Exit)",
> "<VI> has unsaved changes. <VI> is about to leave memory. Its unsaved changes will be lost.", with **Save**, **Don't Save**
> and **Cancel** (Cancel keeps everything open). Then it **quits the application**: no blank VI is opened afterwards. With nothing
> modified it quits at once, without a question (REPORT §3). The "List unsaved changes..." link of LabVIEW's dialog is not
> there (the dialog is the system's). **Unverified:** Exit with a new untitled VI that was never modified. Tested in
> `test/editor/exit-flow.test.mjs`.

> **Rule 99 — Where the windows of a VI go.** A new VI (and the first start) opens its Front Panel in front and its Block Diagram
> behind it, 49 px to the left and 30 px up, both 1090 x 696 outer; scaled down if the screen is smaller. The pair starts where
> LabVIEW put it on a 1920 x 1080 screen (61 % of the free width, 39 % of the free height: unverified for other screens) and each
> VI opened later sits 30 px down and right of the one before. **Ctrl+T** (Window ▸ Tile Left and Right) puts the Front Panel
> on the left and the Block Diagram on the right, side by side, no overlap (12 px at the sides, 3 px above and below, 20 px
> between: 938 x 1018 each on the measured screen). **Ctrl+E** brings forward the other window of the VI, from either one, a pure
> toggle. The Window menu itself is not captured yet, so only these two shortcuts exist (`editor/electron/window-layout.mjs`,
> `editor/src/window/shortcuts.mjs`; `test/editor/window-layout.test.mjs`).

> **Rule 100 — Create on the terminals of a loop.** Their menus have the rows directly (not under a "Create" submenu): Create
> Constant, Create Control, Create Indicator, Create Channel Writer... (greyed with its reason), then Stop if True / Continue
> if True (only on the condition), Boolean Palette (greyed) and Properties. **Create Control on the condition** makes the Stop
> button of the Boolean palette (`style: stop-button`, Latch When Released) labelled `stop`, inside the loop to the left of the
> condition, wired to it, with the label in edit mode; **Create Constant** makes a Boolean constant wired to it. **Create
> Indicator** on the condition was not clicked in LabVIEW: it follows Create on any input (the indicator is made and left unwired,
> **unverified**). On the For Loop's **count** and on the **iteration** terminal the rows work like those of a node's terminal
> (the object made of the terminal's type, wired when it fits; the constant of the count goes outside the loop, where its wire
> comes from); their labels and places are **unverified**. Tested in `test/editor/loop-terminals-create.test.mjs`.

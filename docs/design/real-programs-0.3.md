# The examples written again with Solder 0.3.0-alpha

> Non-normative. Step 3 of the road to the maintainable version (plan, "Road to a maintainable version"),
> second round: the three examples of [`examples/`](../../examples/) were rebuilt in the real editor on
> 2026-10-15, as a LabVIEW user would and without the workarounds of the first round
> ([`real-programs-0.2.md`](real-programs-0.2.md)), by a Sonnet driver under Xvfb with mouse and keyboard
> only (no `.sdg` edited by hand). The driver's reports are in `labview-captures/reports/2026-10-15-rebuild-*.md`.

## 1. Result

| Program | Built with | Compared with LabVIEW |
|---------|------------|-----------------------|
| **Temperature Monitor** | Expression Node subVI, While Loop with `Samples`, shift register for the mean | **Same values**: 100 points of 20 + 5·sin(i/10), Average 20.932369884762963, Alarm FALSE; chart 14..26 |
| **Oven Controller** | Enum state (Edit Items…), Case by item name with Add Case for Every Value, Use Default If Unwired, Create ▸ Indicator for `State` | **Same values**: 66 iterations, the temperature series point by point, State Done, Heater FALSE, Fan TRUE; chart 20..70 |
| **Instrument Protocol** | Case with a string selector, Format Into String, Scan From String, uninitialized error shift register, Unbundle By Name `status` OR Stop, Simple Error Handler | **Same values**: identification, 5 per `MEAS:VOLT?`, one point 0 and error 85 with its call chain for `FOO`. The chart's Y for a constant 5 and the error dialog differed (§2, A1–A2) |

`test/end-to-end/examples.test.mjs` runs the three examples headless and checks every value against the
reference of [`examples/README.md`](../../examples/README.md).

## 2. Findings

Merged from the three reports (TM = Temperature Monitor, OC = Oven Controller, IP = Instrument Protocol, with
the driver's number). **M**: seen in Solder; **L**: a claim about LabVIEW from memory, to be measured before
changing anything (CLAUDE.md rule 2).

### A. Differences from the LabVIEW reference

- **A1. The chart of a constant 5 kept −10..10** (IP 17); LabVIEW shows 4.4..5.6. *Fixed on 2026-10-15:* a flat
  range widens by 10 % before Loose Fit (spec/06 §8, `plot-data.test.mjs`).
- **A2. The Simple Error Handler dialog for error 85** (IP 18): Solder shows OK and no call chain; the README
  says LabVIEW showed "Possible reason(s):", **Continue** and "Search ni.com for error". Only the undefined
  code 5000 had been measured (OK and Why not found?). *Fixed on 2026-10-15:* measured in LabVIEW
  (`labview-captures/reports/2026-10-15-seh-85.md`): for a defined code the dialog has the automatic one's
  icon, bold header with the call chain and "Possible reason(s):", and Continue alone (spec/05 §7).
- **A3. The command line crashed on a string indicator** and started string controls at 0 (IP 20). *Fixed on
  2026-10-15:* the editor, the command line and the tests start a control the same way
  (`core/model/control-values.mjs`) and the command line prints strings, enums and clusters.

### B. Editor faults (M)

Things that are wrong whatever LabVIEW does:

1. **A wire from one Case tunnel to another is drawn in every frame** (OC 2), though it exists in one; it
   hides which frames still lack it.
   *Fixed on 2026-10-15:* only the frame that owns it shows it (`diagram-view.test.mjs`).
2. **A Case output tunnel's inner and outer terminals overlap** (5 px apart): a wire dropped there makes a
   new tunnel or reports a cycle (OC 3, IP 9).
   *Fixed on 2026-10-15:* the wire's direction picks the face, not the half hit (`borderFaceFor`).
3. **Create ▸ Indicator on a wire** leaves the indicator unwired at the click point with an empty, invisible
   label (OC 4). On a node's terminal it works (IP 14).
   *Fixed on 2026-10-15:* measured (`2026-10-15-editor-gestures.md` §1): the indicator is wired as a branch, named
   after the source or "Numeric N"; the control and the constant stay unwired (spec/05 Rule 73).
4. **A wire ending on a terminal that lies under another wire** dangles instead of connecting (OC 5).
   *Fixed on 2026-10-15:* a terminal under a wire's hit zone takes the mouse.
5. **A tunnel can be placed on top of a shift register's terminal** and stays there when its source moves
   (OC 6).
   *Fixed on 2026-10-15:* a new tunnel moves just past the object it would cover (LabVIEW's place unverified).
6. **A click on a menu falls through** to the enum constant behind it (OC 7: Edit ▸ Copy opened the
   constant's item list).
   *Not reproduced on 2026-10-15* (`editor-fixes-check/`): the menu closed and nothing opened behind it.
7. **New panel objects put their diagram terminal at the panel's coordinates**: under the toolbar, out of
   reach (TM 12), or on a loop's border (OC 9, IP 23).
   *Measured on 2026-10-15* (`2026-10-15-editor-gestures.md` §7): LabVIEW also puts it at the panel's coordinates,
   inside a loop if it falls there; only one that would straddle a loop's border is moved ~37 px left, clear of it.
   That shift is what is left to do.
   *Measured again on 2026-10-15* (`2026-10-15-editor-b12-b13-b7.md` §3): a terminal fully inside a loop stays there
   unmoved, but on a border LabVIEW shifts it inside, outside or to the far side, pushes it off other terminals, and a
   terminal or label poking through the left border makes the loop grow and moves what lies left of it. No rule came
   out of nine cases: left as it is until it is measured as LabVIEW's structure auto-grow, a subject of its own.
8. **Representation ▸ DBL on an I32 constant did nothing** from the menu (TM 9); the model's test passes, so
   the fault is in the grid submenu's click.
   *Not reproduced on 2026-10-15*: Representation ▸ DBL turned a new constant DBL.
9. **A renamed indicator went back to "Numeric"** after its connector terminal was assigned (TM 2).
   *Not reproduced on 2026-10-15*, with Enter or a click to commit; a fresh indicator from the palette was not tried.
10. **Error List ▸ Show Error highlights nothing** (OC 14).
   *Not reproduced on 2026-10-15*: it frames the wire, but the Error List stays on top of it and hides it.
11. **A short constant cannot be moved by its body**: its terminal's hot zone covers half of it, all of it
    when short (`%f`, `5`); a constant still in edit mode cannot be dragged (IP 10).
   *Fixed on 2026-10-15:* a constant wires by its right 6 px and is moved by the rest (LabVIEW's width unverified).
12. **Create ▸ Constant lands on top of the node** (IP 11); LabVIEW put it to the left
    (`editor-checks/REPORT.md` §6, h14). The cause: an empty string constant is placed touching the node and
    grows to the right as it is typed into. Which way LabVIEW grows it is to be measured.
   *Done on 2026-10-15* (`2026-10-15-editor-b12-b13-b7.md` §1): LabVIEW grows a constant to the left, keeping its
   right edge and its wire, and so does Solder now, while typing and after.
13. **Edit Items: Enter right after typing closed the dialog** (OC 10), against the measured Enter (commit
    the row, insert an empty one). The keys went to the dialog without a row being edited: whether typing on a
    selected row starts editing it in LabVIEW is to be measured.
   *Done on 2026-10-15* (§2): a single click only selects a row and typing then does nothing; Enter opens an empty
   row below it and the dialog stays; a double click edits the row.
14. **Hover tips are slow and stay** after the pointer leaves or after Run (OC 12, IP 24).
   *Partly fixed on 2026-10-15*: a tip stayed over the Error List opened by Run until the mouse moved; opening the
   list now clears it (by reading, not checked in the window). Tips leaving with the pointer were not reproduced.
15. **The explanations of greyed items are in Spanish** (OC 12–13), old findings #2 and #25.
16. **The page title of a new VI stays "Untitled 1 …"** while the window's title is right (TM 3, IP 22):
    harmless to a user, but it breaks the tooling that finds windows by title.
   *Fixed on 2026-10-15:* the page title follows the VI's name.

*New, found while checking the fixes:* **S1.** A wire from a Case's input tunnel dropped on its border went into
frame 0 whatever frame was shown. *Fixed on 2026-10-15* (`diagram-editing.test.mjs`).

### C. To measure in LabVIEW first (L)

1. **Resizing a structure**: dragging a loop's corner or border moved it; only the selected loop's handle
   resized it, and a click inside does not select it (TM 11, OC 1). How LabVIEW shows the handles of an
   unselected structure is to be measured.
   *Fixed on 2026-10-15:* measured (`2026-10-15-editor-gestures.md` §2): hovering the border of an unselected
   structure shows its eight handles and dragging one resizes it (spec/05 Rule 40e).
2. **A wire dropped on a structure's border** ends silently instead of making a tunnel (IP 8).
   *Fixed on 2026-10-15:* measured (`2026-10-15-editor-gestures.md` §3): the drop makes a tunnel at the release
   height (`dropWireOnStructureBorder`, spec/05 Rule 40e).
3. **The right-click menu of a structure** opens only within about 2 px of its border (IP 7).
   *Fixed on 2026-10-15:* measured (`2026-10-15-editor-gestures.md` §4): the whole 6 px band answers and only it.
   The band was already 6 px in the DOM; what could take the right click away from it are the structure's
   handles, which now lie hidden on the band, so a right click on a handle gives the structure's menu
   (`nodoDe`). The cause of the 2 px was not reproduced in the running editor.
   *Checked in the running editor on 2026-10-15* (`labview-captures/editor-fixes-check/`): 6 px on each side of a
   While Loop.
4. **Typing a value into a control in edit mode** changes its saved default; there is no Make Current Values
   Default (TM 6, IP). Spec/05 Rule 40m to be checked against LabVIEW.
   *Measured on 2026-10-15* (`2026-10-15-editor-gestures.md` §5): LabVIEW does **not** keep a typed value as the
   default; it reverts after save and reopen, and Edit ▸ Make Current Values Default / Reinitialize Values to
   Default and the control's Data Operations ▸ set or restore it. Solder keeps current and default as one value:
   to do as a change of its own (spec/05 Rule 40m is wrong and is to be amended with it).
   *Done on 2026-10-15* (DT-053, spec/05 Rule 40m amended): each panel object keeps a current value apart from the
   default the file saves; the Edit rows (named for the selection on the panel) and Data Operations ▸ set and restore
   it, a Run keeps what was operated and what the indicators show. Measured further in LabVIEW
   (`2026-10-15-default-values.md`) and checked in the running editor (`2026-10-15-solder-default-values.md`).
   Copy Data and Paste Data stay greyed until there is a data clipboard.
5. **Selecting an enum constant's item**: a selected constant does not open its list, and Select Item… is
   greyed (OC 7).
   *Measured on 2026-10-15* (§6): the selected constant does not open its list in LabVIEW either (Solder is right);
   Select Item… is enabled and opens a "Select Item" window with a filter field: to do.
6. **Several wires from one output** run on top of each other along one x (TM 13).
   *Measured on 2026-10-15* (§8): LabVIEW turns each wire near the source, on separate verticals 6 px apart. Solder
   turns a new wire near where it is dropped, which an older test asserts: to be measured again before changing.
7. **Palette icons** show their name only in the header strip, and subpalettes are clipped at the top of
   the screen (TM 14, IP 4–6).

### D. Known and postponed

The right-click menus of the panel (TM 6, OC 13), Create on a shift register (TM 7, old #6), the system's
own Save As and save dialogs (on a Spanish desktop their Cancel reads "Cancelar"), and the default label
`stop` of the Stop button, which is LabVIEW's.

### E. Found while checking B12 and B13 (2026-10-15)

1. **The right-click menu of a panel enum control opened only on its frame**, not on its box or arrows.
   *Fixed on 2026-10-15:* it opens on any part of a panel object (`2026-10-15-solder-b12-b13.md` §3).
2. **A numeric constant typed 123456789 shows 123457000** (six significant digits). How LabVIEW shows it is to be
   measured.
3. **The Enum icon of Controls ▸ Ring & Enum is drawn blank**, though it works.
4. **Ctrl+W on the panel did not close the VI** in one check; to reproduce.

## 3. Proposed order

Done on 2026-10-15: A1–A3, B1–B5, B11–B13, B16, C1–C4 and S1, checked in the running editor; B6, B8, B9 and B10 did not
reproduce. What is left:

1. ~~C4, current value and default value~~: done on 2026-10-15 (DT-053).
2. ~~B12 and B13~~: measured and done on 2026-10-15. B7's shift off a loop's border turned out to be LabVIEW's
   structure auto-grow, not a fixed shift: postponed until it is measured as such.
3. C5 Select Item… of the enum constant; B14's tips, checked in the window.
4. B15, the Spanish texts; C6 measured again and C7.
5. E2 to E4, found on 2026-10-15.

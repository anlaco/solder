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
2. **A Case output tunnel's inner and outer terminals overlap** (5 px apart): a wire dropped there makes a
   new tunnel or reports a cycle (OC 3, IP 9).
3. **Create ▸ Indicator on a wire** leaves the indicator unwired at the click point with an empty, invisible
   label (OC 4). On a node's terminal it works (IP 14).
4. **A wire ending on a terminal that lies under another wire** dangles instead of connecting (OC 5).
5. **A tunnel can be placed on top of a shift register's terminal** and stays there when its source moves
   (OC 6).
6. **A click on a menu falls through** to the enum constant behind it (OC 7: Edit ▸ Copy opened the
   constant's item list).
7. **New panel objects put their diagram terminal at the panel's coordinates**: under the toolbar, out of
   reach (TM 12), or on a loop's border (OC 9, IP 23).
8. **Representation ▸ DBL on an I32 constant did nothing** from the menu (TM 9); the model's test passes, so
   the fault is in the grid submenu's click.
9. **A renamed indicator went back to "Numeric"** after its connector terminal was assigned (TM 2).
10. **Error List ▸ Show Error highlights nothing** (OC 14).
11. **A short constant cannot be moved by its body**: its terminal's hot zone covers half of it, all of it
    when short (`%f`, `5`); a constant still in edit mode cannot be dragged (IP 10).
12. **Create ▸ Constant lands on top of the node** (IP 11); LabVIEW put it to the left
    (`editor-checks/REPORT.md` §6, h14).
13. **Edit Items: Enter right after typing closed the dialog** (OC 10), against the measured Enter (commit
    the row, insert an empty one): to reproduce.
14. **Hover tips are slow and stay** after the pointer leaves or after Run (OC 12, IP 24).
15. **The explanations of greyed items are in Spanish** (OC 12–13), old findings #2 and #25.
16. **The page title of a new VI stays "Untitled 1 …"** while the window's title is right (TM 3, IP 22):
    harmless to a user, but it breaks the tooling that finds windows by title.

### C. To measure in LabVIEW first (L)

1. **Resizing a structure**: dragging a loop's corner or border moved it; only the selected loop's handle
   resized it, and a click inside does not select it (TM 11, OC 1). How LabVIEW shows the handles of an
   unselected structure is to be measured.
2. **A wire dropped on a structure's border** ends silently instead of making a tunnel (IP 8).
3. **The right-click menu of a structure** opens only within about 2 px of its border (IP 7).
4. **Typing a value into a control in edit mode** changes its saved default; there is no Make Current Values
   Default (TM 6, IP). Spec/05 Rule 40m to be checked against LabVIEW.
5. **Selecting an enum constant's item**: a selected constant does not open its list, and Select Item… is
   greyed (OC 7).
6. **Several wires from one output** run on top of each other along one x (TM 13).
7. **Palette icons** show their name only in the header strip, and subpalettes are clipped at the top of
   the screen (TM 14, IP 4–6).

### D. Known and postponed

The right-click menus of the panel (TM 6, OC 13), Create on a shift register (TM 7, old #6), the system's
own Save As and save dialogs (on a Spanish desktop their Cancel reads "Cancelar"), and the default label
`stop` of the Stop button, which is LabVIEW's.

## 3. Proposed order

1. B1–B5 (wiring that misleads or fails), B7, B12 and B11: they cost every user minutes.
2. B6, B8–B10, B13, B14, B16; then B15 with the Spanish texts.
3. C1–C7 measured in one LabVIEW stage, then done.

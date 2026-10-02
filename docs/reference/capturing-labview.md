# Capturing LabVIEW — how the data is extracted to clone it

> Informative. It describes the method used to clone LabVIEW 2026 Q3 (DT-035)
> since a LabVIEW has been installed on the development machine (2026-09-30).
> The rules that come out of it go to `spec/`, the inventory and the catalog,
> not here.

## 1. The environment

- **LabVIEW 2026 Q3 Community Edition**, installed in a Windows 11 virtual
  machine (quickemu, in `~/VMs/windows-11`) and activated with an NI account.
  The Community license allows using it for free and open-source projects,
  which is what Solder is.
- **The VM at 1920 × 1080 and 100 % scale**, the same as the desktop where the
  editor runs. That way a LabVIEW pixel is a CSS pixel of the editor, with no
  conversions. (The earlier captures were at 150 % and were divided by 1.5.)
- **The palettes in the *Category (Standard)* view** —icons only—, in *Tools ▸
  Options ▸ Controls/Functions Palettes ▸ Palette*. The fresh install comes in
  *Icons and Text*, which lays the icons out differently.
- **A QMP channel** to drive the VM: `extra_args="-qmp
  unix:windows-11/windows-11-qmp.socket,server=on,wait=off"` in
  `windows-11.conf`. The QEMU HMP monitor is no use: its mouse is relative and
  Windows accelerates it, so clicks do not land where you aim.

## 2. The tool

[`tools/vmqmp.py`](../../tools/vmqmp.py) does clicks, drags, keys and captures
over QMP, in VM screen coordinates:

```
tools/vmqmp.py foto fichero.png
tools/vmqmp.py clic 500 200 derecho
tools/vmqmp.py arrastrar 576 390 800 450
tools/vmqmp.py tecla ctrl-e
tools/vmqmp.py texto "labview"
```

The socket is changed with `SOLDER_QMP`. It can also be imported as a module
(`from vmqmp import Vm`) to write a multi-step script.

What was learned using it:

- **LabVIEW ignores some clicks** that arrive without a previous movement or
  that are too short. `clic` already takes a step to the side first and holds
  the press for 120 ms. If a button still does not respond, the keyboard always
  works (Enter on a focused button, Alt+F for the File menu).
- **The right click often gets lost**, especially if a dialog or the previous
  menu was closed just before: repeat it until the menu appears (the background
  of a menu is `#f0f0f0`, and it can be checked with one pixel). A double click
  with `clic X Y doble` starts editing a constant; with two `clic` in a row, it
  does not.
- **Hovering the mouse is part of the capture**: subpalettes open when the mouse
  passes over their folder, and the name of each function appears under the
  subpalette title. You have to move and wait (≈1 s) before taking the
  screenshot.
- **`foto` needs an absolute path**: whoever writes the file is QEMU, which does
  not run in the repository directory.
- **The VM keyboard is Spanish** and `texto` only knows letters, digits and a
  few symbols. The rest, with `tecla`: `*` is `kp_multiply`, `-` is
  `kp_subtract`, `/` is `kp_divide`, `(` and `)` are `shift-8` and `shift-9`,
  and `^` is `shift-bracket_left` followed by `spc` (it is a dead key). The
  decimal comma of the numeric keypad types a comma, not a period: in a
  formula, the period is typed with `texto`.
- **The temporary palette appears where the right click is made**: so that the
  coordinates of its folders hold from one time to the next, always in the same
  place of the canvas.
- **Stretching an object by its handles** requires the mouse to reach them and
  wait (≈ 0.8 s) before pressing: with `arrastrar`, which presses right away,
  LabVIEW moves the whole object. A custom script with `mover`, a pause and
  `boton` solves it.
- **Quick Drop** (`Ctrl+Space`, the exact name of the function with `texto` and
  Enter) puts any function or constant at the cursor without going through the
  palettes; a click on the canvas drops it. With a structure from the palette,
  the first click fixes one corner and the second, the opposite one (or press,
  drag and release).
- **A new VI** (`Ctrl+N`) and `Ctrl+E` leave a clean diagram without touching
  whatever was open; nothing is saved.
- The developer may be watching the VM through spicy (`win11 ver`): if they ask
  to see it, stop.

## 3. What is extracted and from where

| Data | How | Example |
|------|-----|---------|
| Order and grid of a palette | Capture of the open subpalette | `paletas/functions-boolean.png`: 5 columns |
| Name of each element | Hover over each icon: it appears under the title | "Number To Boolean Array", not "Num to Array" |
| Terminals and their names | Context Help window (Ctrl+H) when hovering over the icon | And: `x`, `y` → "x .and. y?" |
| Look and size on the diagram | Place each function by dragging it and measure its ink at 1:1 | And: 24 × 16 px |
| Menus | Open them (click or Alt+letter) and capture | `front-panel/menu-file.png`, with shortcuts and separators |
| Behavior | Do it in LabVIEW and look at the result | A DBL wired to And: coercion and integer output |

The rule that is followed: **what is not in a capture or has not been tried in
LabVIEW is not written from memory**. If a doubt about behavior cannot be
resolved here, it is left declared as pending.

## 4. Where each thing goes

- The captures, to `labview-captures/` (outside git), with a name that says what
  they show.
- The names, the order and what is done, to the inventory
  (`schema/inventario-labview.json`), with the capture they come from.
- The terminals and the types, to the catalog (`schema/blocks.json`).
- The measurements, next to the code that uses them (`editor/src/glifos.mjs`,
  `editor/src/diagrama.mjs`), citing the capture.
- The behavior, to a test that checks it, and to `spec/` if it is a rule.

## 5. Comparing

The editor is opened on a virtual screen (Xvfb) with
`--force-device-scale-factor=1`, brought to the same state with a script and
photographed; the LabVIEW capture and the editor one are placed side by side, at
the same scale, and enlarged to see the differences.

# LabVIEW behavior — reference for Solder

> **Purpose:** Document how LabVIEW works internally so that Solder's architecture decisions are informed. The aim is not to replicate LabVIEW — it is to understand the principles and adapt them to Red/View.

---

## 1. Control architecture

### LabVIEW uses custom rendering, NOT native widgets

LabVIEW controls (Modern, Classic, Silver, NXG/Fuse styles) are **rendered by LabVIEW's own engine**. They are not operating system widgets. This allows it:

- Identical look on Windows, macOS and Linux
- Full control over every pixel of the control
- Seamless transition between edit mode and run mode

**Exception:** The "System" style does use native OS widgets. But it lacks complex controls (there are no graphs, gauges or clusters in System style).

**Source:** LabVIEW Wiki: Control — *"System controls use the control style from the Operating System"*

### Red/View uses native widgets

Red/View maps its faces (`field`, `button`, `slider`) to **native OS widgets** (Win32 on Windows, GTK3 on Linux). Only `base` + `draw` offers custom rendering.

**Source:** Red 0.6.0 blog — *"Red relies on native widgets, Rebol has custom ones only"*

### Implication for Solder

Solder CANNOT use the same face in both modes as LabVIEW does, because Red/View has no rendering engine of its own for widgets. The adopted solution is:

- **Editor:** Draw dialect on a `base` face (custom rendering)
- **Runtime (.qvi):** A mix of native widgets and Draw depending on the control type

See DT-026 in `docs/decisiones.md`.

---

## 2. Edit mode vs run mode

### In LabVIEW

The **same** control object exists in both modes. What changes is the **event routing**, not the control:

| Action | Edit mode (arrow tool) | Run mode |
|--------|----------------------------------|----------------|
| Click on control | Select | Change value |
| Drag on control | Move/reposition | Operate (e.g. drag a slider) |
| Double-click | Edit label / properties | Operate control |
| Delete | Delete control from the panel | Not applicable |
| Visual look | Identical to runtime | Identical to the editor |

### Tools palette

LabVIEW has three main tools:

1. **Positioning Tool (arrow)** — select, move, resize
2. **Operating Tool (hand)** — interact with controls as if running
3. **Labeling Tool (A)** — edit labels and text in place

Since LabVIEW 8, **automatic tool selection** (on by default) infers the tool from the context:
- Cursor over the control's edge → positioning cursor
- Cursor over the value area → operating cursor
- Cursor over the label → text editing cursor

Internally it is an **event dispatcher**: the panel intercepts events before they reach the control and routes them according to the active tool. The control does not know which mode it is in.

### In Solder

We do not implement a tools palette. The behavior is:

- **Editor (panel.red):** always in positioning mode. Click = select/move. Double-click = edit default value (dialog). Delete = delete.
- **Runtime (.qvi):** always in operating mode. Interactive controls.

---

## 3. Control styles

LabVIEW has 5 style families. They are **historical evolution**, not functional differences:

| Style | Year | Description |
|--------|-----|-------------|
| Classic | Pre-2000 | Original, flat look of the 90s |
| Modern | 2000 | 3D, default for engineering |
| System | ~2003 | Native OS widgets, for end-user apps |
| Silver | 2011 | Clean, contemporary look |
| NXG/Fuse | 2018 | From the NXG product (discontinued 2021) |

**Rule:** never mix styles in the same panel.

**Real differences (not just visual):**
- Classic allows full color customization; Modern and System restrict parts
- System has no complex controls (graphs, gauges, clusters, arrays)
- Only System adapts to the OS theme (including high contrast)

**LabVIEW does NOT have a theming engine** (there is no CSS). Changing style means replacing controls manually.

### In Solder

We do not implement multiple styles. There is a single visual style defined in `docs/visual-spec.md`. In the future, the Draw system makes it possible to create alternative styles as different `render-*` functions.

---

## 4. Data format and representation

### In LabVIEW — three independent axes

Each numeric control has:

1. **Representation** (data type): I8, I16, I32, I64, U8, U16, U32, U64, SGL, DBL, EXT, CDB
   - Affects the wire type in the Block Diagram
   - Affects the precision and range of the value
   - It is a compilation decision

2. **Display Format** (how it is shown): Decimal, Hex, Octal, Binary, Scientific, SI, Engineering
   - It is **only a rendering layer** over the internal value
   - It does not affect the wire or the compiler
   - Includes: prefixes ("0x"), suffixes, decimal digits, radix

3. **Value** (current data): the number stored in the chosen representation

These three axes are independent. A U16 can be shown in hex ("0x00FF") or in decimal ("255") — the internal value is the same.

### In Solder

We adopt the three-axis model. See DT-026 for the format in `qvi-diagram`.

---

## 5. Custom widgets — XControls

### In LabVIEW

**XControls** (LabVIEW 8+) allow creating completely new controls. They are a mini-library of VIs:

| Component | Function |
|------------|---------|
| Facade VI | Its Front Panel IS the visual look of the control |
| Init/Uninit VI | Control lifecycle |
| State data | Cluster (record) with internal state |
| Property VIs | Custom properties (get/set) |
| Display State | Reacts to value changes, resize, format |

The Facade VI can use a **2D Picture control** for completely free drawing — the LabVIEW equivalent of our `base` + Draw.

**Known limitations of XControls:**
- They cannot be put in arrays
- Problems with Project Libraries and .lvclass
- Performance: if the Facade does not process events fast enough, they queue up
- The community considers them "almost complete but never complete"

### In Solder

We do not implement an XControls system. The future equivalent is:

1. Each widget is a `render-*` function that returns Draw blocks
2. Each widget defines its hit-testing zones
3. Each widget defines how the compiler generates its runtime code
4. Pattern to extract once we have 3-4 working widgets → `src/ui/widgets/`

---

## 6. Summary of key differences

| Aspect | LabVIEW | Solder |
|---------|---------|---------|
| Rendering engine | Its own custom one | Native Red/View + Draw on `base` |
| Controls in editor | Same object as runtime | Pure Draw (no real faces) |
| Controls at runtime | Same object as editor | Generated by the compiler (native or Draw) |
| Tools palette | Arrow / Hand / A (3 modes) | Single mode: always positioning |
| Visual styles | 5 historical families | 1 own style |
| Custom widgets | XControls (complex) | render-* functions + hit-test (future) |
| Theming | None | None (future: alternative render functions) |

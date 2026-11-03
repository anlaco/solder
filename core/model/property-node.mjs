// The Property Node (DT-072): one block whose class says which properties it offers, and whose rows, each a
// property read or written, are its terminals. The properties come from `docs/schema/properties.json`, in the
// order and groups of LabVIEW 2026 Q3's menus. An implicit node is linked to a panel control by the control's
// node name (never its label) and takes the control's type for Value; an explicit one has a reference wired.
//
// Measured: labview-captures/reports/2026-10-30-panel-property-node.md and 2026-10-26-visa-property-node.md.
// A pure module, shared by the editor, the compiler and the tests.

import { VISA_RESOURCE } from "./types.mjs";

export const PROPERTY_NODE = "property-node";

/** The property id separator: `Label:Text`, `Serial Settings:Baud Rate` (LabVIEW's long names). */
const ID_SEPARATOR = ":";

/** The type variable a row of type `{ of: "control" }` resolves to: the linked control's type. */
export const LINKED_CONTROL_TYPE = "V";

/** The class of the implicit node of each panel block (measured on the numeric, Boolean and string). */
const CLASS_OF_PANEL_BLOCK = Object.freeze({
  control: "Numeric",
  indicator: "Numeric",
  "bool-control": "Boolean",
  "bool-indicator": "Boolean",
  "str-control": "String",
  "str-indicator": "String",
});

/** The class of the implicit Property Node made from a panel block, or undefined if it cannot have one yet. */
export const classOfPanelBlock = (blockType) => CLASS_OF_PANEL_BLOCK[blockType];

/** Whether the node is an implicit Property Node: linked to a control, with no reference terminals. */
export const isImplicit = (node) => node.tipo === PROPERTY_NODE && typeof node.config?.link === "string";

/**
 * Loads the catalog of properties. Returns the menu of a class, the property at an id, and the ports of a
 * Property Node's rows.
 */
export function loadProperties(data) {
  const { classes } = data;

  function classEntry(className) {
    const entry = classes[className];
    if (!entry) throw new Error(`the class "${className}" is not in the catalog of properties`);
    return entry;
  }

  /** The groups of a class's menu: its ancestors' first, then its own (measured: GObject, Control, the class). */
  function groups(className) {
    const entry = classEntry(className);
    return [...(entry.parent ? groups(entry.parent) : []), ...entry.groups];
  }

  /** The submenu of a text object (Label ▸, Caption ▸): a Reference row, then the Text class's menu (measured). */
  const textObjectMenu = (className) => [[{ name: "Reference", reference: true }], ...groups(className)];

  /** The items under `item`: its submenu, or those of the class it is a text object of. */
  const childrenOf = (item) => (item.of ? textObjectMenu(item.of).flat() : item.submenu ?? []);

  /**
   * The property at `id` in `className`, with its short name as the row shows it (`Label.Text`), or undefined.
   * A name may be in two groups (Instr has two General Settings ▸), so every item of that name is tried.
   */
  function find(className, id) {
    if (!id) return undefined;
    const found = findIn(groups(className).flat(), id.split(ID_SEPARATOR), []);
    return found && { ...found, id };
  }

  /**
   * A text object's menu repeats GObject's properties (Label ▸ Bounds ▸), but only the Text class's own are done
   * for a label or a caption (DT-072 §8: Label.Text, Caption.Text): `inherited` holds the items reached through a
   * text object that belong to its ancestors, and `blocked` says the path went through one of them.
   */
  function findIn(items, path, shortParts, inherited = null, blocked = false) {
    const [name, ...rest] = path;
    for (const item of items.filter((candidate) => candidate.name === name && !candidate.separator)) {
      const children = childrenOf(item);
      const notOwn = blocked || !!inherited?.has(item);
      if (!rest.length) {
        // A submenu named by its own id is its All Elements row (Position, Bounds).
        const property = item.done || !children.length ? item : children.find((child) => child.whole) ?? item;
        if (!property.done || notOwn) return { ...property, done: false };
        return { ...property, short: [...shortParts, property.short].join(".") };
      }
      const textObjectAncestors = item.of && classEntry(item.of).parent ? new Set(groups(classEntry(item.of).parent).flat()) : inherited;
      const found = findIn(children, rest, item.of || item.short ? [...shortParts, item.short ?? item.name] : shortParts, textObjectAncestors, notOwn);
      if (found) return found;
    }
    return undefined;
  }

  /** The reference a class's node takes: a VISA resource name for Instr (DT-072 §2), a refnum of the class otherwise. */
  const referenceType = (className) => (className === "Instr" ? VISA_RESOURCE : { refnum: className });

  /** The type a row carries: the property's, or the linked control's type for Value. */
  const rowType = (property) => (property.type?.of === "control" ? { var: LINKED_CONTROL_TYPE } : property.type);

  /**
   * The ports of a Property Node: the reference (explicit only), the error in, one terminal per row (an input
   * when it writes, an output when it reads) and the error out, as LabVIEW draws them. A row whose property is
   * not in the catalog, or not done, has no terminal and keeps the node from running.
   */
  function ports(node) {
    const { class: className, rows = [] } = node.config ?? {};
    const implicit = isImplicit(node);
    const inputs = implicit ? [] : [{ name: "reference", label: "reference", type: referenceType(className) }];
    const outputs = implicit ? [] : [{ name: "reference-out", label: "reference out", type: referenceType(className) }];
    inputs.push({ name: "error-in", label: "error in (no error)", type: "error", default: 0 });
    rows.forEach((row, index) => {
      const property = className && classes[className] ? find(className, row.property) : undefined;
      if (!property?.done) return;
      const port = { name: `row-${index}`, label: row.property, type: rowType(property) };
      (row.write ? inputs : outputs).push(port);
    });
    outputs.push({ name: "error-out", label: "error out", type: "error" });
    return { in: inputs, out: outputs };
  }

  /** The menu of a class as LabVIEW lists it: groups separated, submenus nested. */
  const menu = (className) => groups(className);

  return { data, classes, menu, find, ports, textObjectMenu };
}

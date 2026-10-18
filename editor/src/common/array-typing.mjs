// Dropping an element into an empty Array shell types the array (DT-060), as LabVIEW does
// (labview-captures/reports/2026-10-18-array-typing-stage1.md, Q3 and Q4). Pure functions over the graph.

import { VOID, convertirValor, esNumerico, isUndefinedArray } from "../../../core/model/types.mjs";

const DEFAULT_NUMERIC_REPRESENTATION = "number";

/** What a panel control or indicator dropped into the shell makes of the array: its kind and its element type. */
const PANEL_ELEMENT_KIND = {
  control: "arr-control",
  indicator: "arr-indicator",
  "str-control": "arr-control",
  "str-indicator": "arr-indicator",
  "bool-control": "arr-control",
  "bool-indicator": "arr-indicator",
};

/**
 * The array a palette control makes when dropped into an empty panel array: `{ block, elementType }`, or null when
 * the control is not nested (an Array, a graph, a cluster... lands beside the shell instead; measured, no message).
 */
export function panelArrayFromElement(block, config) {
  const arrayBlock = PANEL_ELEMENT_KIND[block];
  if (!arrayBlock) return null;
  if (block.startsWith("str-")) return { block: arrayBlock, elementType: "string" };
  if (block.startsWith("bool-")) return { block: arrayBlock, elementType: "boolean" };
  const elementType = config?.type ?? DEFAULT_NUMERIC_REPRESENTATION;
  return esNumerico(elementType) ? { block: arrayBlock, elementType } : null;
}

/** The element type of the constants whose type is fixed by their block; "const" is the DBL Numeric Constant. */
const FIXED_CONSTANT_TYPES = { const: "number", "str-const": "string", "bool-const": "boolean" };
const TYPED_CONSTANT_BLOCKS = new Set(["num-const", "enum-const"]);

/** The element type a constant gives an empty Array Constant when dropped or dragged into it, or null. */
export function constantElementType(node) {
  if (node && node.tipo in FIXED_CONSTANT_TYPES) return FIXED_CONSTANT_TYPES[node.tipo];
  return TYPED_CONSTANT_BLOCKS.has(node?.tipo) ? (node.config?.type ?? null) : null;
}

/** Whether the node is an Array or Array Constant that is still undefined. */
export const isEmptyArrayShell = (node) => (node?.tipo === "arr-const" || node?.tipo === "arr-control" || node?.tipo === "arr-indicator") && isUndefinedArray(node.config?.type);

const PORT_AFTER_FLIP = { "arr-indicator": "value", "arr-control": "result" };
const FLIPPED_KIND = { "arr-control": "arr-indicator", "arr-indicator": "arr-control" };

/**
 * Turns the panel array `id` from a control into an indicator or the other way round. Its terminal flips and its
 * wires keep their node, with the port renamed (a wire left facing the wrong way is broken, as in LabVIEW).
 */
export function flipArrayKind(graph, id) {
  const flipped = FLIPPED_KIND[graph.nodos.find((node) => node.id === id)?.tipo];
  if (!flipped) return graph;
  const renamePort = (end) => (end.nodo === id && end.puerto !== undefined ? { ...end, puerto: PORT_AFTER_FLIP[flipped] } : end);
  return {
    ...graph,
    nodos: graph.nodos.map((node) => (node.id === id ? { ...node, tipo: flipped } : node)),
    cables: graph.cables.map((wire) => ({ ...wire, de: renamePort(wire.de), a: renamePort(wire.a) })),
  };
}

/**
 * Types the empty shell `id` with `elementType` and an empty value. `block`: the kind the panel array takes
 * (arr-control or arr-indicator); when it differs from the shell's, the array is flipped (see `flipArrayKind`).
 */
export function typeEmptyArray(graph, id, elementType, block) {
  const typed = {
    ...graph,
    nodos: graph.nodos.map((node) => {
      if (node.id !== id) return node;
      const { currentValue, ...rest } = node;
      return { ...rest, config: { ...node.config, type: { array: elementType }, value: [] } };
    }),
  };
  const flips = block && block !== graph.nodos.find((node) => node.id === id).tipo;
  return flips ? flipArrayKind(typed, id) : typed;
}

/** Applies `convert` to every element of a possibly nested list of values. */
const mapElements = (value, convert) => (Array.isArray(value) ? value.map((item) => mapElements(item, convert)) : convert(value));

/**
 * Representation of the element of an array: the element type of the WHOLE array changes, with its dimensions kept
 * and every value (default and current) converted to it (labview-captures/reports/2026-10-18-array-typing-stage2.md,
 * Q5b). The wires stay: whatever no longer fits breaks when the types are resolved.
 */
export function setArrayRepresentation(graph, id, elementType) {
  const convert = (value) => mapElements(value, (element) => convertirValor(element, elementType));
  return {
    ...graph,
    nodos: graph.nodos.map((node) => {
      if (node.id !== id) return node;
      return {
        ...node,
        config: { ...node.config, type: { ...node.config.type, array: elementType }, ...(node.config.value !== undefined && { value: convert(node.config.value) }) },
        ...(node.currentValue !== undefined && { currentValue: convert(node.currentValue) }),
      };
    }),
  };
}

const ELEMENT_MENU_BY_TYPE = { string: "-string", boolean: "-boolean" };

/**
 * The right-click menu of the ELEMENT of a typed array, or null when it has none of its own: an empty array has no
 * element, and only numeric, string and Boolean elements were measured (reports/2026-10-18-array-element-menus.md).
 * The index and the margin of the shell keep the array's menu.
 */
export function elementMenuRoot(node) {
  const elementType = node?.config?.type?.array;
  if (!node || isUndefinedArray(node.config?.type) || elementType === undefined) return null;
  if (node.tipo === "arr-const") return typeof elementType === "string" && esNumerico(elementType) ? "context.array-constant-element" : null;
  if (node.tipo !== "arr-control" && node.tipo !== "arr-indicator") return null;
  if (elementType in ELEMENT_MENU_BY_TYPE) return `context.panel-array-element${ELEMENT_MENU_BY_TYPE[elementType]}`;
  return typeof elementType === "string" && esNumerico(elementType) ? "context.panel-array-element" : null;
}

/**
 * The loose constant that stands for an element of `elementType` and holds `value`: `{ block, config }`, or null for
 * an element that has no constant to leave as (a cluster, an enum...: unmeasured).
 */
export function constantForElement(elementType, value) {
  if (elementType === "string") return { block: "str-const", config: { value: value ?? "" } };
  if (elementType === "boolean") return { block: "bool-const", config: { value: !!value } };
  if (typeof elementType !== "string" || !esNumerico(elementType)) return null;
  const isDefaultNumeric = elementType === DEFAULT_NUMERIC_REPRESENTATION;
  return { block: isDefaultNumeric ? "const" : "num-const", config: { ...(isDefaultNumeric ? {} : { type: elementType }), value: value ?? 0 } };
}

/**
 * The array `id` with no element again, as LabVIEW leaves a constant whose element was dragged out (stage 2, Q5d):
 * its value is lost and its wires stay, to break.
 */
export const emptyArrayAgain = (graph, id) => ({
  ...graph,
  nodos: graph.nodos.map((node) => (node.id === id ? { ...node, config: { ...node.config, type: { array: VOID }, value: [] } } : node)),
});

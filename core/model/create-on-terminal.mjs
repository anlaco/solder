// Create ▸ Constant / Control / Indicator on a terminal (LabVIEW's shortcut
// menu): the block whose type matches the terminal, placed and wired to it.
//
// A pure module. Where the new node goes is the editor's business (measured in
// LabVIEW); this module decides what is created and wires it.

import * as CV from "./control-values.mjs";
import { RING_STYLES, ringItems } from "./ring.mjs";
import { conectar, crearEnPanel, crearNodo, fijarConfig } from "./graph.mjs";
import { isDaqName } from "./daq-name.mjs";
import { PATH, VISA_RESOURCE, esArray, esCluster, esEnum, esError, esNumerico, esRefnum } from "./types.mjs";

/**
 * The block and configuration that Create ▸ `kind` ("constant", "control" or
 * "indicator") makes for a terminal of type `type`, or null when there is no
 * such block yet. Numbers keep the terminal's representation.
 *
 * `source` is the panel object a subOVI's input stands for, when the terminal is one: a constant or a control made on
 * it is of the object's own class with its default value, not a blank one (measured, reports/2026-11-16-create-constant.md:
 * Timing's rate gives a constant holding 1000, Trigger's edge a Ring Constant with Rising and Falling showing Rising).
 */
export function blockForTerminal(type, kind, source) {
  const block = plainBlockForTerminal(type, kind);
  return block && source ? withSourceOfInput(block, kind, source) : block;
}

function plainBlockForTerminal(type, kind) {
  if (kind === "constant") return constantBlock(type);
  if (kind === "control" || kind === "indicator") return panelBlock(type, kind === "control");
  return null;
}

/** A text or menu ring, which is a numeric control with a style and items (DT-091 §2). */
const isRingControl = (source) => source.tipo === "control" && Object.values(RING_STYLES).includes(source.config?.style);

/** The configuration of a ring that a constant or a control made on a ring input keeps: the items and the undefined values. */
const ringConfiguration = (source) => ({ items: ringItems(source.config), "allow-undefined": !!source.config["allow-undefined"] });

function withSourceOfInput(block, kind, source) {
  if (kind === "indicator") return block;
  const value = CV.defaultValue(source);
  if (isRingControl(source)) {
    const ring = { ...block.config, ...ringConfiguration(source), value };
    if (kind === "constant") return { tipo: "ring-const", config: ring };
    return { ...block, config: { ...ring, style: source.config.style } };
  }
  if (!block.config || kind !== "constant" || typeof value !== typeof block.config.value) return block;
  return { ...block, config: { ...block.config, value } };
}

function constantBlock(type) {
  if (esEnum(type)) return { tipo: "enum-const", config: { type } };
  if (esNumerico(type)) return { tipo: "num-const", config: { type, value: 0 } };
  if (type === "boolean") return { tipo: "bool-const", config: { value: false } };
  if (type === "string") return { tipo: "str-const", config: { value: "" } };
  if (esError(type)) return { tipo: "error-cluster-constant" };
  if (type === VISA_RESOURCE) return { tipo: "visa-resource-constant", config: { value: "" } };
  if (isDaqName(type)) return { tipo: "daq-name-constant", config: { type, value: "" } };
  if (type === PATH) return { tipo: "path-constant" };
  if (esArray(type)) return { tipo: "arr-const", config: { type, value: [] } };
  return null;
}

function panelBlock(type, isControl) {
  const suffix = isControl ? "control" : "indicator";
  // An enum counts as numeric (esNumerico), so Create ▸ on an enum terminal already
  // makes the generic control/indicator with the enum type; the panel draws it as an
  // enum (DT-049).
  if (esNumerico(type)) return { tipo: suffix, config: { type } };
  if (type === "boolean") return { tipo: `bool-${suffix}` };
  if (type === "string") return { tipo: `str-${suffix}` };
  if (type === VISA_RESOURCE) return { tipo: `visa-${suffix}` };
  // A DAQ name of any kind makes the control or indicator of the same kind (DT-076 §5).
  if (isDaqName(type)) return { tipo: `daq-name-${suffix}`, config: { type } };
  if (type === PATH) return { tipo: `path-${suffix}` };
  // A control reference's terminal or wire makes a control refnum of its strict type (measured, reports/2026-11-03-control-reference-subvi.md Q1, Q4).
  if (esRefnum(type)) return { tipo: `refnum-${suffix}`, config: { type } };
  if (esArray(type)) return { tipo: `arr-${suffix}`, config: { type } };
  if (esError(type)) return { tipo: `cluster-${suffix}`, config: { type, style: isControl ? "error-in" : "error-out" } };
  if (esCluster(type)) return { tipo: `cluster-${suffix}`, config: { type } };
  return null;
}

/**
 * Creates the node for Create ▸ `kind` on `terminal` ({ nodo, puerto, dir })
 * of type `type`, at (x, y) on the diagram and, for a control or indicator, at
 * (panelX, panelY) on the panel with `label`, and wires it to the terminal.
 * `scope` ({ dentro, marco }) puts the new node in the structure the terminal's
 * node is in, so that the wire does not have to cross a border. `configOverride`
 * is merged into the configuration of the block made (the Stop button that
 * Create ▸ Control makes on a loop condition is a Boolean control with another style).
 * As in LabVIEW, nothing is greyed: a constant or a control on an output, or
 * an indicator on an input, is created of that type but left unwired
 * (labview-captures/create-paste/, report §A4). Returns `{ g, id, wired }`, or
 * `{ g, motivo }` when there is no block for that type.
 */
export function createOnTerminal(g, cat, { terminal, type, kind, x, y, panelX = x, panelY = y, label, scope, configOverride, source }) {
  const baseBlock = blockForTerminal(type, kind, source);
  if (!baseBlock) return { g, motivo: `There is no ${kind} for this type yet.` };
  const block = configOverride ? { ...baseBlock, config: { ...baseBlock.config, ...configOverride } } : baseBlock;
  const created = kind === "constant" ? crearNodo(g, cat, block.tipo, x, y) : crearEnPanel(g, cat, block.tipo, panelX, panelY, label, block.config);
  let withNode = created.g;
  if (kind === "constant" && block.config) withNode = fijarConfig(withNode, created.id, block.config);
  const placement = { x, y, ...(scope?.dentro !== undefined ? { dentro: scope.dentro } : {}), ...(scope?.marco !== undefined ? { marco: scope.marco } : {}) };
  withNode = { ...withNode, nodos: withNode.nodos.map((n) => (n.id === created.id ? { ...n, ...placement } : n)) };
  const fitsTerminal = (kind === "indicator") === (terminal.dir === "out");
  if (!fitsTerminal) return { g: withNode, id: created.id, wired: false };
  const newPort = cat.puertos(withNode.nodos.find((n) => n.id === created.id))[kind === "indicator" ? "in" : "out"][0].name;
  const own = { nodo: created.id, puerto: newPort, dir: kind === "indicator" ? "in" : "out" };
  const wired = conectar(withNode, cat, own, terminal);
  if (wired.motivo) return { g, motivo: wired.motivo };
  return { g: wired.g, id: created.id, wired: true };
}

// Create ▸ Constant / Control / Indicator on a terminal (LabVIEW's shortcut
// menu): the block whose type matches the terminal, placed and wired to it.
//
// A pure module. Where the new node goes is the editor's business (measured in
// LabVIEW); this module decides what is created and wires it.

import { conectar, crearEnPanel, crearNodo, fijarConfig } from "./graph.mjs";
import { PATH, VISA_RESOURCE, esArray, esCluster, esEnum, esError, esNumerico } from "./types.mjs";

/**
 * The block and configuration that Create ▸ `kind` ("constant", "control" or
 * "indicator") makes for a terminal of type `type`, or null when there is no
 * such block yet. Numbers keep the terminal's representation.
 */
export function blockForTerminal(type, kind) {
  if (kind === "constant") return constantBlock(type);
  if (kind === "control" || kind === "indicator") return panelBlock(type, kind === "control");
  return null;
}

function constantBlock(type) {
  if (esEnum(type)) return { tipo: "enum-const", config: { type } };
  if (esNumerico(type)) return { tipo: "num-const", config: { type, value: 0 } };
  if (type === "boolean") return { tipo: "bool-const", config: { value: false } };
  if (type === "string") return { tipo: "str-const", config: { value: "" } };
  if (esError(type)) return { tipo: "error-cluster-constant" };
  if (type === VISA_RESOURCE) return { tipo: "visa-resource-constant", config: { value: "" } };
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
  if (type === PATH) return { tipo: `path-${suffix}` };
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
export function createOnTerminal(g, cat, { terminal, type, kind, x, y, panelX = x, panelY = y, label, scope, configOverride }) {
  const baseBlock = blockForTerminal(type, kind);
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

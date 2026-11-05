// Polymorphic OVIs (DT-074): a `.sdp` file (*Solder Polymorphic*) lists OVIs, its instances, and a subOVI node
// that calls it takes the terminals and the behavior of one of them, picked by hand (Select Type ▸) or by what is
// wired (Automatic). Measured in LabVIEW 2026 Q3 on VISA Configure Serial Port and Write Delimited Spreadsheet.vi
// (labview-captures/reports/2026-11-05-polymorphic-vi.md, 2026-11-05-vilib-and-type-polymorphic.md §B).
//
// Pure: the file is read and written as text, and the choice works on the instances' connector ports.
//
// A node's ports are named by connector cell (`cell-5`), not by the instance's own terminal names, so that a wire
// stays on its terminal when another instance is chosen: as in LabVIEW, the instances share one connector and a
// terminal is a place on it (DT-074 §2).

import { conversion } from "./types.mjs";

export const POLYMORPHIC_EXTENSION = ".sdp";

/** The version of the `.sdp` format this Solder reads and writes; a newer one is refused. */
export const POLYMORPHIC_VERSION = 1;

/** Which icon the node draws: the polymorphic OVI's own, or the chosen instance's (measured option names). */
export const DRAW_ICON = Object.freeze({ POLYMORPHIC: "polymorphic", INSTANCE: "instance" });

/** LabVIEW's message for a wire whose ends have different types (measured on Write Delimited Spreadsheet.vi). */
export const DIFFERENT_TYPES_MESSAGE = "You have connected two terminals of different types.";

/** Does a path name a polymorphic OVI? */
export const isPolymorphicPath = (path) => typeof path === "string" && path.toLowerCase().endsWith(POLYMORPHIC_EXTENSION);

/** A file name without its folders and extension: the default menu name of an instance. */
const baseName = (path) => path.replaceAll("\\", "/").split("/").pop().replace(/\.[^.]+$/, "");

export class PolymorphicFileError extends Error {}

/**
 * A polymorphic OVI read from its text: `{ instances: [{ path, menuName, selectorName }], showSelectorByDefault,
 * adaptToDataType, drawIcon, icon }`. A menu name left out is the instance's file name; a selector name left out is
 * its menu name. Throws `PolymorphicFileError` when the text is not a `.sdp` this Solder reads.
 */
export function readPolymorphic(text) {
  let file;
  try {
    file = typeof text === "string" ? JSON.parse(text) : text;
  } catch (error) {
    throw new PolymorphicFileError(`not a polymorphic OVI: ${error.message}`);
  }
  const version = file?.["solder-polymorphic"];
  if (!Number.isInteger(version) || version < 1 || version > POLYMORPHIC_VERSION) throw new PolymorphicFileError(`polymorphic format version ${version}: this Solder reads versions 1 to ${POLYMORPHIC_VERSION}`);
  if (!Array.isArray(file.instances)) throw new PolymorphicFileError("a polymorphic OVI lists its instances");
  const instances = file.instances.map((instance, index) => {
    if (typeof instance?.ovi !== "string" || !instance.ovi) throw new PolymorphicFileError(`instance ${index + 1} names no OVI`);
    const menuName = instance["menu-name"] ?? baseName(instance.ovi);
    return { path: instance.ovi, menuName, selectorName: instance["selector-name"] ?? menuName };
  });
  return {
    instances,
    showSelectorByDefault: file["show-selector-by-default"] === true,
    adaptToDataType: file["adapt-to-data-type"] !== false,
    drawIcon: file["draw-icon"] === DRAW_ICON.INSTANCE ? DRAW_ICON.INSTANCE : DRAW_ICON.POLYMORPHIC,
    icon: typeof file.icon === "string" ? file.icon : null,
  };
}

/** A new polymorphic OVI with no instances, as File ▸ New ▸ Polymorphic OVI makes it (the options as measured). */
export const emptyPolymorphic = () => ({ instances: [], showSelectorByDefault: false, adaptToDataType: true, drawIcon: DRAW_ICON.POLYMORPHIC, icon: null });

/** The text of a polymorphic OVI; only what differs from the defaults of `readPolymorphic` is written. */
export function writePolymorphic(polymorphic) {
  const file = {
    "solder-polymorphic": POLYMORPHIC_VERSION,
    instances: polymorphic.instances.map(({ path, menuName, selectorName }) => ({
      ovi: path,
      ...(menuName !== baseName(path) ? { "menu-name": menuName } : {}),
      ...(selectorName !== menuName ? { "selector-name": selectorName } : {}),
    })),
    "show-selector-by-default": polymorphic.showSelectorByDefault,
    "adapt-to-data-type": polymorphic.adaptToDataType,
    "draw-icon": polymorphic.drawIcon,
    ...(polymorphic.icon ? { icon: polymorphic.icon } : {}),
  };
  return `${JSON.stringify(file, null, 2)}\n`;
}

// ——— The node ———

/** The config of a node placed from a polymorphic OVI: Automatic, the first instance, the selector as the file says. */
export const polymorphicNodeConfig = (storedPath, polymorphic) => ({ vi: storedPath, instance: null, selected: 0, selector: polymorphic.showSelectorByDefault });

/** Is the node a call to a polymorphic OVI? */
export const isPolymorphicNode = (node) => node?.tipo === "subvi" && isPolymorphicPath(node.config?.vi);

/** Is the node on Automatic? Only when the polymorphic OVI allows it to adapt to the data type. */
export const isAutomatic = (node, polymorphic) => polymorphic.adaptToDataType && (node.config?.instance ?? null) === null;

/** The index of the instance the node calls now: the one picked by hand, else the one Automatic picked last. */
export function selectedInstance(node, polymorphic) {
  const count = polymorphic.instances.length;
  const index = isAutomatic(node, polymorphic) ? node.config?.selected ?? 0 : node.config?.instance ?? node.config?.selected ?? 0;
  return Number.isInteger(index) && index >= 0 && index < count ? index : 0;
}

/** The name of a node's port at a connector cell. */
export const cellPortName = (cell) => `cell-${cell}`;

/**
 * The ports of a polymorphic node from the chosen instance's connector ports: named by cell, with the instance's
 * own name kept as `calleeName` (the compiler writes the instance's slots by it) and its label shown.
 */
export const renamedByCell = (ports) => ({
  in: ports.in.map((port) => ({ ...port, name: cellPortName(port.cell), calleeName: port.name })),
  out: ports.out.map((port) => ({ ...port, name: cellPortName(port.cell), calleeName: port.name })),
});

/** How well an instance takes the wired inputs: "exact", "coercion" (some coercion dot), or null (a wire breaks). */
function fitOf(instancePorts, wiredTypes) {
  let fit = "exact";
  for (const [portName, type] of wiredTypes) {
    if (type === undefined) continue;
    const port = instancePorts.in.find((candidate) => candidate.name === portName);
    const how = port && port.type !== undefined ? conversion(type, port.type) : null;
    if (!how) return null;
    if (how === "coercion") fit = "coercion";
  }
  return fit;
}

/**
 * Automatic (DT-074 §3, measured): the first instance that takes every wired input as it comes, else the first that
 * takes them with a coercion, else the first instance (whose wire then breaks). Measured: 2D DBL picks (DBL) though
 * (I64) comes first and would take it with a coercion; 1D I32 picks (I64); a 2D Boolean array breaks at (I64).
 * `instancePorts` are each instance's ports renamed by cell (or null when it cannot be loaded); `wiredTypes` maps
 * each wired input's port name to the type that comes in. Unwired, the first instance.
 */
export function automaticChoice(instancePorts, wiredTypes) {
  const fits = instancePorts.map((ports) => (ports ? fitOf(ports, wiredTypes) : null));
  const exact = fits.indexOf("exact");
  if (exact >= 0) return exact;
  const coerced = fits.indexOf("coercion");
  return coerced >= 0 ? coerced : 0;
}

/**
 * What Solder adds to LabVIEW's message when no instance takes what is wired (DT-074 §5): what came in and which
 * instances there are, so that a user can tell why none was picked.
 */
export function noInstanceFitsDetail(polymorphic, wiredDescriptions) {
  const names = polymorphic.instances.map((instance) => instance.menuName).join(", ");
  return `${DIFFERENT_TYPES_MESSAGE} No instance of this polymorphic OVI takes ${wiredDescriptions.join(" and ")}; its instances are ${names}.`;
}

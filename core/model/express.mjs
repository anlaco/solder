// What every Express VI shares (DT-069): a catalog block with an `express` section whose configuration is the
// node's `config`. A node is unconfigured until its configuration dialog is first closed with OK; then the
// terminals the dialog sets (`express-row` in the catalog) leave the icon for expansion rows, and its context help
// says how it is configured.
//
// Measured in LabVIEW 2026 Q3: labview-captures/reports/2026-10-29-express-vi-common.md.

/** Whether `block` (a catalog entry) is an Express VI. */
export const isExpress = (block) => Boolean(block?.express);

/** Whether an Express VI node was configured: any OK of its dialog, even with nothing changed (measured). */
export const isConfigured = (node) => Boolean(node.config?.configured);

/** The node with `changes` merged into its configuration and marked configured: what an OK of its dialog does. */
export const configure = (node, changes = {}) => ({ ...node, config: { ...node.config, ...changes, configured: true } });

/**
 * The names of the terminals drawn as expansion rows: none while unconfigured, those marked `express-row` once
 * configured (measured on Time Delay, Simulate Signal and File Dialog). `ports` is the catalog's `puertos(node)`.
 */
export function expansionRowPorts(block, node, ports) {
  if (!isExpress(block) || !isConfigured(node)) return [];
  return [...ports.in, ...ports.out].filter((port) => port["express-row"]).map((port) => port.name);
}

/** The "configured as follows" lines of the context help, or none while unconfigured (measured: "Delay Time: 2.5 s"). */
export function configuredAsLines(block, node) {
  if (!isExpress(block) || !isConfigured(node)) return [];
  const settingOf = (key) => (DERIVED_SETTINGS[key] ? DERIVED_SETTINGS[key](node.config) : formatSetting(node.config[key]));
  return (block.express["configured-as"] ?? []).map(({ label, key, unit }) => `${label}: ${settingOf(key)}${unit ? ` ${unit}` : ""}`);
}

/** What File Dialog's help names its existence and selection settings (measured: "New or existing file"). */
const EXISTENCE_WORDS = Object.freeze({ existing: "Existing", new: "New", "new-or-existing": "New or existing" });
const SELECTION_WORDS = Object.freeze({ file: "file", folder: "folder", "file-or-folder": "file or folder" });

/**
 * The settings a help line shows that are made of several configuration keys. File Dialog's Selection Mode is
 * "Multi-select" with several items (measured); otherwise its existence and selection, as "New or existing file"
 * (measured). Unverified: the words of the other combinations.
 */
const DERIVED_SETTINGS = Object.freeze({
  "selection-mode": (config) => (config.multiple ? "Multi-select" : `${EXISTENCE_WORDS[config.existence]} ${SELECTION_WORDS[config.selection]}`),
});

/**
 * The smallest magnitude the context help writes in exponent form (measured: 1e9 is "1E+9", 2.123456 is written
 * whole). Unverified: where between them LabVIEW switches; here at 1e9.
 */
const EXPONENT_FORM_FROM = 1e9;

/** A setting as the context help writes it: a number whole and with no trailing zeros, or "1E+9" from 1e9 on. */
function formatSetting(value) {
  if (typeof value !== "number") return String(value ?? "");
  if (Math.abs(value) >= EXPONENT_FORM_FROM) return value.toExponential().toUpperCase();
  return String(value);
}

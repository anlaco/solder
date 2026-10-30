// The inside of File Dialog's configuration dialog (DT-069, DT-067 (d2)): "Selection Mode" (one or several items; File, Folder
// or File or folder; Existing, New or New or existing), the LLB check box and "String Encoding". The frame around it (title,
// OK, Cancel, Help) is express-dialog.mjs; the state is mapped to the node's keys `multiple`, `selection` and `existence`.
//
// Measured in LabVIEW 2026 Q3 (labview-captures/reports/2026-10-29-file-dialog-express.md Q1, the capture file-io/file-dialog/
// config-dialog.png, which is 1.5 times the screen, so the positions are divided by 1.5): unchecking "Limit selection to single
// item" greys the radios and forces File + Existing; checking it again leaves File + Existing; Folder + New greys "File or folder".
// Not measured, and guessed here: what choosing New does while "File or folder" is already chosen (it is allowed), the greyed look
// of a radio, and the keys (the dialog ignores them).

import { esHueco } from "../common/labview-inventory.mjs";

const IDS = "dialog.express-vi";

/**
 * The dialog and its row of buttons, in px (the buttons are 78 wide and 86 apart here, not as in Time Delay's dialog). The positions are
 * 1 px less than the ones measured on screen, which count the dialog's own border (compare report 2026-10-29-editor-file-dialog-compare.md).
 */
export const SIZE = { width: 440, height: 466 };
export const BUTTONS = { width: 78, height: 22, ok: 182, cancel: 268, help: 355 };

/** The parts of the body in px from the dialog's top left corner. */
const LAYOUT = {
  selectionGroup: { x: 15, y: 43, width: 419, height: 154, title: "Selection Mode" },
  limit: { x: 27, y: 64.5 },
  radios: { leftX: 46.5, rightX: 203.5, firstY: 96.5, step: 20 },
  llb: { x: 27, y: 172.5 },
  encodingGroup: { x: 15, y: 223, width: 419, height: 187, title: "String Encoding" },
  utf8: { x: 28, y: 234, width: 100, height: 20 },
  notes: [
    { y: 262, text: "After converting this function to UTF-8 encoding, it cannot be configured back to system encoding." },
    { y: 335, text: "File paths cannot contain UTF-8 strings. If the user selects a file that cannot be represented in system strings, you will not be able to use the path with LabVIEW file functions." },
  ],
  noteX: 28,
  noteWidth: 395,
};

const SELECTIONS = [["file", "File"], ["folder", "Folder"], ["file-or-folder", "File or folder"]];
const EXISTENCES = [["existing", "Existing"], ["new", "New"], ["new-or-existing", "New or existing"]];

const esc = (text) => String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const px = (n) => `${Number(n.toFixed(2))}px`;

/** The dialog for the node: one item or several, and the two radio groups, as its configuration has them. */
export const open = (node, block) => ({
  limit: !(node.config?.multiple ?? block.config.multiple.value),
  selection: node.config?.selection ?? block.config.selection.value,
  existence: node.config?.existence ?? block.config.existence.value,
});

/** The radios can be chosen only while the selection is limited to one item (measured). */
const radiosEnabled = (state) => state.limit;
/** Folder + New leaves no "File or folder" (measured). */
const fileOrFolderEnabled = (state) => !(state.selection === "folder" && state.existence === "new");
const radioEnabled = (state, choice) => radiosEnabled(state) && (choice !== "file-or-folder" || fileOrFolderEnabled(state));

/** What a click on a part means: a new state, or `{ explain: true }` for the two parts that are greyed with a reason. */
export function click(state, part) {
  if (part === "llb-files" || part === "use-utf-8") return { explain: true };
  if (part === "limit") return { body: state.limit ? { ...state, limit: false, selection: "file", existence: "existing" } : { ...state, limit: true } };
  const [, group, choice] = /^(selection|existence)-(.+)$/.exec(part) ?? [];
  if (!group || !radioEnabled(state, choice)) return null;
  return { body: { ...state, [group]: choice } };
}

/** The dialog ignores the keys (Enter and Escape are the frame's). */
export const key = (state) => state;

/** What an OK sets in the node's configuration. */
export const changes = (state) => ({ selection: state.selection, existence: state.existence, multiple: !state.limit });

const holeClass = (inv, id) => (esHueco(inv.resolver(id) ?? { estado: "todo" }) ? " hueco" : "");

function check(inv, part, label, checked, at) {
  const id = `${IDS}.${part}`;
  return `<div class="pv-check${holeClass(inv, id)}${checked ? " marcada" : ""}" data-id="${id}" style="left:${px(at.x)};top:${px(at.y)}"><span class="pv-casilla"></span><span class="pv-texto">${esc(label)}</span></div>`;
}

function radio(inv, state, group, [choice, label], row, rightColumn) {
  const id = `${IDS}.${group}-${choice}`;
  const { leftX, rightX, firstY, step } = LAYOUT.radios;
  const selected = state[group] === choice;
  const enabled = radioEnabled(state, choice);
  return `<div class="pv-radio${holeClass(inv, id)}${selected ? " marcada" : ""}${enabled ? "" : " desactivada"}" data-id="${id}" style="left:${px(rightColumn ? rightX : leftX)};top:${px(firstY + row * step)}"><span class="pv-casilla redonda"></span><span class="pv-texto">${esc(label)}</span></div>`;
}

const group = ({ x, y, width, height, title }) => `<div class="pv-grupo" style="left:${px(x)};top:${px(y)};width:${px(width)};height:${px(height)}"><span class="pv-grupo-titulo">${title}</span></div>`;

/** The two groups with their parts. */
export function view(state, inv) {
  const L = LAYOUT;
  const radios = SELECTIONS.map((choice, row) => radio(inv, state, "selection", choice, row, false)).join("") + EXISTENCES.map((choice, row) => radio(inv, state, "existence", choice, row, true)).join("");
  const utf8 = `<div class="pv-boton${holeClass(inv, `${IDS}.use-utf-8`)}" data-id="${IDS}.use-utf-8" style="left:${px(L.utf8.x)};top:${px(L.utf8.y)};width:${px(L.utf8.width)};height:${px(L.utf8.height)}">Use UTF-8</div>`;
  const notes = L.notes.map((note) => `<div class="pv-nota" style="left:${px(L.noteX)};top:${px(note.y)};width:${px(L.noteWidth)}"><b>Note:</b> ${esc(note.text)}</div>`).join("");
  return group(L.selectionGroup) + check(inv, "limit", "Limit selection to single item", state.limit, L.limit) + radios +
    check(inv, "llb-files", "Allow selection of files in LLBs and packed project libraries", false, L.llb) + group(L.encodingGroup) + utf8 + notes;
}

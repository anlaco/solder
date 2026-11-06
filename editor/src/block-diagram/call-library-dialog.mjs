// The configuration dialog of the Call Library Function Node (DT-080): "Call Library Function", with the tabs Function,
// Parameters, Callbacks and Error Checking, the live C prototype, and OK, Cancel and Help. Opened by a double click on the
// node and by Configure... of its menu.
//
// Measured in LabVIEW 2026 Q3 (labview-captures/reports/2026-11-06-clfn.md "Dialog", 2026-11-06-clfn-run.md; the crops
// labview-captures/clfn/e1.png, e2.png, e4.png at 1:1: 677 x 458 with its title bar). Every ring lists what the report lists, in
// its order. Not measured, and decided here (marked in the code): the positions of the Callbacks tab and of the fields below the
// third one of the Parameters tab, whether the library box is greyed with Specify path on diagram, the fresh default of a
// Waveform parameter, and the greatest number of dimensions.
//
// Pure, like express-dialog.mjs: `open` builds the dialog from the node, `key` and `click` turn what the user does into an
// intent (`modal-dialog.mjs`), `apply` writes the draft into the VI as one step and `view` draws it from the inventory
// (`dialog.call-library.*`). The draft is a configuration of its own: Cancel and Escape leave the node as it was.

import {
  DATA_TYPES, PARAMETER_TYPES, RETURN_TYPES, callLibraryConfig, callLibraryPorts, callLibraryPrototype, newParameter,
  RUNNABLE_PARAMETER_TYPES,
} from "../../../core/model/call-library.mjs";
import { esHueco } from "../common/labview-inventory.mjs";

export const DIALOG_ID = "dialog.call-library";
export const TITLE = "Call Library Function";
/** The name of the undo step an OK makes: the dialog changes the node's attributes, as an Express VI's does. */
export const UNDO_STEP_NAME = "Change Attribute";

export const SIZE = { width: 677, height: 458 };

// ——— The words of the rings (measured) ———

const PARAMETER_TYPE_LABELS = {
  numeric: "Numeric", array: "Array", string: "String", waveform: "Waveform", "digital-waveform": "Digital Waveform",
  "digital-data": "Digital Data", activex: "ActiveX", "adapt-to-type": "Adapt to Type", "instance-data-pointer": "Instance Data Pointer",
};
const RETURN_TYPE_LABELS = { void: "Void", numeric: "Numeric", string: "String" };
const PASS_OPTIONS = [["value", "Value"], ["pointer", "Pointer to Value"]];
const ARRAY_FORMAT_OPTIONS = [["array-data-pointer", "Array Data Pointer"], ["array-handle", "Array Handle"], ["array-handle-pointer", "Array Handle Pointer"]];
const STRING_FORMAT_OPTIONS = [
  ["c-string-pointer", "C String Pointer"], ["pascal-string-pointer", "Pascal String Pointer"], ["string-handle", "String Handle"],
  ["string-handle-pointer", "String Handle Pointer"],
];
const DATA_FORMAT_OPTIONS = [
  ["handles-by-value", "Handles by Value"], ["pointers-to-handles", "Pointers to Handles"], ["array-data-pointer", "Array Data Pointer"],
  ["interface-to-data", "Interface to Data"],
];
const DATA_TYPE_OPTIONS = Object.entries(DATA_TYPES).map(([key, { label }]) => [key, label]);
const NONE_OPTION = "none";
const NONE_LABEL = "<None>";

const RETURN_ROW_LABEL = "return type";
const TABS = [["function", "Function"], ["parameters", "Parameters"], ["callbacks", "Callbacks"], ["error-checking", "Error Checking"]];
const ERROR_LEVELS = [
  ["maximum", "Maximum", "Enables the maximum level of error checking for the node. It reports every error it can detect, and slows the call down."],
  ["default", "Default", "Enables a minimum level of error checking for the node. It costs the call very little."],
  ["disabled", "Disabled", "Turns every check of the node off, for the fastest call. A fault in the library is then not reported as an error."],
];
/** Unverified: LabVIEW's greatest number of dimensions of an array parameter. */
const MAX_DIMENSIONS = 8;
const CALLBACK_PROTOTYPE = "MgErr Proc(InstanceDataPtr *instanceState);";

// ——— The state ———

/**
 * The dialog for a node: a draft of its configuration, the tab in view, the row of the parameters list that is current
 * (0 is the return type, n the parameter n - 1), the text field that has the focus and the ring whose list is open.
 * `origins` follows the draft's parameters back to the node's, so that a wire stays with its parameter through
 * additions, deletions and moves.
 */
export function open(node) {
  const config = callLibraryConfig(node.config);
  return {
    nodo: node.id,
    bloque: node.tipo,
    titulo: TITLE,
    config: { ...config, parameters: config.parameters.map((parameter) => ({ ...parameter })) },
    origins: config.parameters.map((_, index) => index),
    tab: "function",
    current: 0,
    focus: null,
    openRing: null,
  };
}

const isReturnRow = (dialog) => dialog.current === 0;

/** The return value or the parameter the Parameters tab is on. */
const currentEntry = (dialog) => (isReturnRow(dialog) ? dialog.config["return-type"] : dialog.config.parameters[dialog.current - 1]);

function withCurrent(dialog, entry) {
  if (isReturnRow(dialog)) return { ...dialog, config: { ...dialog.config, "return-type": entry } };
  const parameters = dialog.config.parameters.map((parameter, index) => (index === dialog.current - 1 ? entry : parameter));
  return { ...dialog, config: { ...dialog.config, parameters } };
}

const withConfig = (dialog, changes) => ({ ...dialog, config: { ...dialog.config, ...changes } });

/** The text of the field that has the focus. */
function focusedText(dialog) {
  if (dialog.focus === "library") return dialog.config.library;
  if (dialog.focus === "function") return dialog.config.function;
  return dialog.focus === "name" && !isReturnRow(dialog) ? currentEntry(dialog).name : "";
}

function withFocusedText(dialog, text) {
  if (dialog.focus === "library") return withConfig(dialog, { library: text });
  if (dialog.focus === "function") return withConfig(dialog, { function: text });
  if (dialog.focus === "name" && !isReturnRow(dialog)) return renamedParameter(dialog, text);
  return dialog;
}

/** A parameter renamed: a Minimum size that pointed at it follows the new name. */
function renamedParameter(dialog, name) {
  const oldName = currentEntry(dialog).name;
  const parameters = dialog.config.parameters.map((parameter, index) => {
    if (index === dialog.current - 1) return { ...parameter, name };
    return parameter["minimum-size"] === oldName ? { ...parameter, "minimum-size": name } : parameter;
  });
  return { ...dialog, config: { ...dialog.config, parameters } };
}

// ——— What each kind of parameter asks for ———

/** The fields a kind of value has under Type, in order: `{ ring }` or `{ spin }` (dimensions); Constant and Name are always there. */
function fieldsOf(entry, isReturn) {
  switch (entry.type) {
    case "numeric":
      return isReturn ? [{ ring: "data-type" }] : [{ ring: "data-type" }, { ring: "pass" }];
    case "array":
      return [{ ring: "data-type" }, { spin: "dimensions" }, { ring: "array-format" }, { ring: "minimum-size" }];
    case "string":
      return isReturn ? [{ ring: "string-format" }] : [{ ring: "string-format" }, { ring: "minimum-size" }];
    case "waveform":
      return [{ ring: "data-type" }, { spin: "dimensions" }];
    case "digital-waveform":
    case "digital-data":
      return [{ spin: "dimensions" }];
    case "activex":
      return [{ ring: "activex-data-type" }];
    case "adapt-to-type":
      return [{ ring: "data-format" }];
    default:
      return [];
  }
}

const FIELD_LABELS = {
  type: "Type", "data-type": "Data type", pass: "Pass", dimensions: "Dimensions", "array-format": "Array format",
  "string-format": "String format", "minimum-size": "Minimum size", "data-format": "Data format", "activex-data-type": "Data type",
};

/** What a fresh value of each kind holds (Waveform's fresh default is unverified). */
const FRESH = {
  numeric: { "data-type": "i32", pass: "value" },
  array: { "data-type": "i32", dimensions: 1, "array-format": "array-data-pointer" },
  string: { "string-format": "c-string-pointer" },
  waveform: { "data-type": "dbl", dimensions: 1 },
  "digital-waveform": { dimensions: 1 },
  "digital-data": { dimensions: 1 },
  activex: {},
  "adapt-to-type": { "data-format": "handles-by-value" },
  "instance-data-pointer": {},
  void: {},
};

/** What a fresh return value holds: it has no Pass, Dimensions or Minimum size. */
const FRESH_RETURN = { void: {}, numeric: { "data-type": "i32" }, string: { "string-format": "c-string-pointer" } };

/** The entry with another type: its name (and Constant) stay, the fields of the new kind start fresh. */
function retyped(entry, type, isReturn) {
  if (isReturn) return { type, ...FRESH_RETURN[type] };
  return { name: entry.name, type, ...(entry.constant ? { constant: true } : {}), ...FRESH[type] };
}

/** The options a ring lists, as `[value, label]`, and the value it shows now. */
function ringOptions(dialog, ring) {
  switch (ring) {
    case "type":
      return (isReturnRow(dialog) ? RETURN_TYPES : PARAMETER_TYPES).map((type) => [type, (isReturnRow(dialog) ? RETURN_TYPE_LABELS : PARAMETER_TYPE_LABELS)[type]]);
    case "data-type": return DATA_TYPE_OPTIONS;
    case "pass": return PASS_OPTIONS;
    case "array-format": return ARRAY_FORMAT_OPTIONS;
    case "string-format": return STRING_FORMAT_OPTIONS;
    case "data-format": return DATA_FORMAT_OPTIONS;
    case "minimum-size":
      return [[NONE_OPTION, NONE_LABEL], ...dialog.config.parameters.flatMap((parameter, index) => (index === dialog.current - 1 ? [] : [[String(index), parameter.name]]))];
    default: return [];
  }
}

const ringValue = (dialog, ring) => {
  const entry = currentEntry(dialog);
  if (ring === "minimum-size") {
    const index = dialog.config.parameters.findIndex((parameter) => parameter.name === entry["minimum-size"]);
    return index < 0 ? NONE_OPTION : String(index);
  }
  return entry[ring];
};

const ringText = (dialog, ring) => ringOptions(dialog, ring).find(([value]) => value === ringValue(dialog, ring))?.[1] ?? "";

/** A ring's new value written into the entry; Minimum size stores the other parameter's name. */
function chosen(dialog, ring, value) {
  const entry = currentEntry(dialog);
  if (ring === "type") return withCurrent(dialog, retyped(entry, value, isReturnRow(dialog)));
  if (ring === "minimum-size") {
    const { "minimum-size": _removed, ...rest } = entry;
    const name = value === NONE_OPTION ? undefined : dialog.config.parameters[Number(value)]?.name;
    return withCurrent(dialog, name === undefined ? rest : { ...rest, "minimum-size": name });
  }
  return withCurrent(dialog, { ...entry, [ring]: value });
}

// ——— Keys and clicks ———

const NO_CHANGE = null;

/** Enter accepts and Escape closes an open ring first, then cancels; a key typed goes to the field with the focus. */
export function key(dialog, event) {
  if (event.ctrlKey || event.metaKey || event.altKey) return NO_CHANGE;
  if (event.key === "Escape") return dialog.openRing ? { dialog: { ...dialog, openRing: null } } : { cancel: true };
  if (event.key === "Enter") return { accept: true };
  if (!dialog.focus) return NO_CHANGE;
  const text = focusedText(dialog);
  if (event.key === "Backspace") return text ? { dialog: withFocusedText(dialog, text.slice(0, -1)) } : NO_CHANGE;
  return event.key.length === 1 ? { dialog: withFocusedText(dialog, text + event.key) } : NO_CHANGE;
}

/** The parts that are greyed with a reason: the inventory's `dialog.call-library.<part>` entries say it. */
const EXPLAINED = new Set(["help", "function-name-list", "wizard", "callback-reserve", "callback-unreserve", "callback-abort", "activex-data-type"]);

const MIN_PARAMETER_ROW = 1;

/** The parameter list's buttons: what each one does to the current row (the return type row has none of them). */
function listCommand(dialog, part) {
  const index = dialog.current - 1;
  const { parameters } = dialog.config;
  if (part === "add-parameter") {
    const added = [...parameters, newParameter(parameters)];
    return { dialog: { ...dialog, config: { ...dialog.config, parameters: added }, origins: [...dialog.origins, null], current: added.length, focus: null } };
  }
  if (isReturnRow(dialog)) return NO_CHANGE;
  if (part === "delete-parameter") {
    const kept = (list) => list.filter((_, position) => position !== index);
    const deletedName = parameters[index].name;
    const remaining = kept(parameters).map((parameter) => {
      if (parameter["minimum-size"] !== deletedName) return parameter;
      const { "minimum-size": _removed, ...rest } = parameter;
      return rest;
    });
    return { dialog: { ...dialog, config: { ...dialog.config, parameters: remaining }, origins: kept(dialog.origins), current: Math.min(dialog.current, remaining.length) || 0, focus: null } };
  }
  const target = part === "move-up" ? index - 1 : index + 1;
  if (target < 0 || target >= parameters.length) return NO_CHANGE;
  const swapped = (list) => list.map((item, position) => (position === index ? list[target] : position === target ? list[index] : item));
  return { dialog: { ...dialog, config: { ...dialog.config, parameters: swapped(parameters) }, origins: swapped(dialog.origins), current: target + 1, focus: null } };
}

const LIST_COMMANDS = new Set(["add-parameter", "delete-parameter", "move-up", "move-down"]);
const FIELD_FOCUSES = { library: "library", "function-name": "function", name: "name" };
const OPTION_PATTERN = /^option-(data-type|type|pass|array-format|string-format|minimum-size|data-format)-(.+)$/;

/** What a click on the part `id` means (OK, Cancel and the close box act; Help and the greyed parts explain themselves). */
export function click(dialog, id) {
  const part = id.slice(DIALOG_ID.length + 1);
  if (part === "ok") return { accept: true };
  if (part === "cancel" || part === "close") return { cancel: true };
  if (EXPLAINED.has(part)) return { explain: true };
  if (part === "browse") return { browse: true };
  const settled = { ...dialog, openRing: null };
  const tab = /^tab-(.+)$/.exec(part)?.[1];
  if (tab) return { dialog: { ...settled, tab, focus: null } };
  if (part in FIELD_FOCUSES) return part === "name" && isReturnRow(dialog) ? NO_CHANGE : { dialog: { ...settled, focus: FIELD_FOCUSES[part] } };
  const option = OPTION_PATTERN.exec(part);
  if (option) return { dialog: { ...chosen(settled, option[1], option[2]), openRing: null } };
  const ring = /^ring-(.+)$/.exec(part)?.[1];
  if (ring) return { dialog: { ...settled, focus: null, openRing: dialog.openRing === ring ? null : ring } };
  const row = /^parameter-(\d+)$/.exec(part)?.[1];
  if (row !== undefined) return { dialog: { ...settled, current: Number(row), focus: null } };
  if (LIST_COMMANDS.has(part)) return listCommand(settled, part);
  return clickOnSetting(settled, part);
}

/** The check boxes, the radios and the spin arrows. */
function clickOnSetting(dialog, part) {
  if (part === "specify-path") return { dialog: withConfig(dialog, { "specify-path-on-diagram": !dialog.config["specify-path-on-diagram"] }) };
  const thread = /^thread-(ui|any)$/.exec(part)?.[1];
  if (thread) return { dialog: withConfig(dialog, { thread }) };
  const convention = /^convention-(c|stdcall)$/.exec(part)?.[1];
  if (convention) return { dialog: withConfig(dialog, { "calling-convention": convention }) };
  const level = /^error-(maximum|default|disabled)$/.exec(part)?.[1];
  if (level) return { dialog: withConfig(dialog, { "error-checking": level }) };
  if (part === "constant") return isReturnRow(dialog) ? NO_CHANGE : { dialog: withCurrent(dialog, { ...currentEntry(dialog), constant: !currentEntry(dialog).constant }) };
  const spin = /^dimensions-(up|down)$/.exec(part)?.[1];
  if (spin) {
    const entry = currentEntry(dialog);
    const dimensions = Math.min(MAX_DIMENSIONS, Math.max(1, (entry.dimensions ?? 1) + (spin === "up" ? 1 : -1)));
    return { dialog: withCurrent(dialog, { ...entry, dimensions }) };
  }
  return NO_CHANGE;
}

/** The dialog with the library the system's file dialog chose. */
export const withLibrary = (dialog, library) => withConfig(dialog, { library });

// ——— Writing it into the VI ———

/** The port a cable end names, renamed to follow its parameter, or null when the port is gone. */
function followedPort(portName, origins) {
  const parameter = /^arg-(\d+)-(in|out)$/.exec(portName);
  if (!parameter) return portName;
  const index = origins.indexOf(Number(parameter[1]));
  return index < 0 ? null : `arg-${index}-${parameter[2]}`;
}

/** The wires of the node follow their parameters; the ones whose terminal is gone (a parameter deleted, no path now) go. */
function rewired(g, node, configured, origins) {
  const ports = callLibraryPorts(configured);
  const existing = new Set([...ports.in, ...ports.out].map((port) => port.name));
  const follow = (end) => {
    if (end.nodo !== node.id) return end;
    const puerto = followedPort(end.puerto, origins);
    return puerto && existing.has(puerto) ? { ...end, puerto } : null;
  };
  const cables = g.cables.flatMap((cable) => {
    const [de, a] = [follow(cable.de), follow(cable.a)];
    return de && a ? [{ ...cable, de, a }] : [];
  });
  return { ...g, cables };
}

/** The VI with the draft as the node's configuration: one step, which an OK with nothing changed does not make. */
export function apply(g, dialog) {
  const node = g.nodos.find((candidate) => candidate.id === dialog.nodo);
  if (!node) return g;
  const configured = { ...node, config: { ...node.config, ...dialog.config } };
  if (JSON.stringify(configured.config) === JSON.stringify(node.config)) return g;
  const moved = { ...g, nodos: g.nodos.map((candidate) => (candidate === node ? configured : candidate)) };
  return rewired(moved, node, configured, dialog.origins);
}

export const stepName = () => UNDO_STEP_NAME;

// ——— Drawing ———

const esc = (text) => String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const px = (n) => `${Number(n.toFixed(2))}px`;
/** A part greyed with a reason is one of the inventory's holes; the dialog itself is done, so a part it does not list is too. */
const holeClass = (inv, id) => {
  const entry = inv.resolver(id);
  return entry && esHueco(entry) ? " hueco" : "";
};
const partId = (part) => `${DIALOG_ID}.${part}`;
const box = ({ x, y, width, height }) => `left:${px(x)};top:${px(y)};${width ? `width:${px(width)};` : ""}${height ? `height:${px(height)}` : ""}`;

/** The parts, in px from the dialog's top left corner (e1.png, e2.png, e4.png). */
const LAYOUT = {
  titleHeight: 30,
  tabs: { y: 44, height: 21, lefts: [14, 79, 159, 228], widths: [65, 80, 69, 99] },
  page: { x: 8, y: 65, width: 655, height: 282 },
  prototype: { labelY: 350, box: { x: 8, y: 368, width: 659, height: 43 }, textX: 14, textY: 380 },
  wizard: { x: 16, y: 426 },
  buttons: { y: 423, width: 56, height: 23, ok: 474, cancel: 540, help: 609 },
  // Function
  library: { labelX: 35, labelY: 101, box: { x: 32, y: 118, width: 325, height: 55 }, browse: { x: 363, y: 120, width: 27, height: 18 } },
  specifyPath: { x: 33, y: 182 },
  functionName: { labelX: 35, labelY: 219, box: { x: 32, y: 235, width: 339, height: 27 }, arrowWidth: 20 },
  thread: { group: { x: 402, y: 112, width: 239, height: 75, title: "Thread" }, ui: { x: 416, y: 133 }, any: { x: 416, y: 156 } },
  convention: { group: { x: 402, y: 240, width: 239, height: 71, title: "Calling convention" }, stdcall: { x: 416, y: 262 }, c: { x: 416, y: 285 } },
  // Parameters
  list: { x: 32, y: 101, width: 155, height: 220, rowHeight: 16, rowX: 4, rowY: 4 },
  listButtons: { x: 199, size: 20, add: 135, delete: 159, up: 207, down: 230 },
  current: { group: { x: 231, y: 100, width: 410, height: 220, title: "Current parameter" }, labelRight: 399, fieldX: 404, fieldWidth: 223, firstY: 124, step: 28, fieldHeight: 24 },
  // Error Checking
  errorChecking: { group: { x: 28, y: 85, width: 619, height: 237, title: "Error Checking Level" }, radioX: 44, firstY: 123, step: 68, labelX: 62, descriptionX: 154, descriptionWidth: 480 },
  // Callbacks (unmeasured positions)
  callbacks: { labelX: 40, comboX: 130, comboWidth: 339, comboHeight: 27, firstY: 100, step: 50, prototypeY: 260 },
};

const group = ({ x, y, width, height, title }) => `<div class="pv-grupo" style="${box({ x, y, width, height })}"><span class="pv-grupo-titulo">${esc(title)}</span></div>`;
const label = (text, x, y, extra = "") => `<div class="pv-etiqueta clfn-etiqueta${extra}" style="left:${px(x)};top:${px(y)}">${esc(text)}</div>`;

function textField(part, text, rect, { focused = false, disabled = false, multiline = false, arrow = 0 } = {}) {
  const caret = focused ? `<span class="caret"></span>` : "";
  return `<div class="pv-campo clfn-campo${multiline ? " multilinea" : ""}${disabled ? " desactivada" : ""}" data-id="${partId(part)}" style="${box(rect)}"><span class="clfn-texto">${esc(text)}</span>${caret}${arrow ? `<span class="clfn-flecha-campo" style="width:${px(arrow)}"></span>` : ""}</div>`;
}

function check(inv, part, text, checked, at, disabled = false) {
  const id = partId(part);
  return `<div class="pv-check${holeClass(inv, id)}${checked ? " marcada" : ""}${disabled ? " desactivada" : ""}" data-id="${id}" style="left:${px(at.x)};top:${px(at.y)}"><span class="pv-casilla"></span><span class="pv-texto">${esc(text)}</span></div>`;
}

function radio(part, text, selected, at) {
  return `<div class="pv-radio${selected ? " marcada" : ""}" data-id="${partId(part)}" style="left:${px(at.x)};top:${px(at.y)}"><span class="pv-casilla redonda"></span><span class="pv-texto">${esc(text)}</span></div>`;
}

function button(inv, part, text, rect, { defaultButton = false, disabled = false } = {}) {
  const id = partId(part);
  return `<div class="pv-boton${defaultButton ? " defecto" : ""}${disabled ? " desactivado" : ""}${holeClass(inv, id)}" data-id="${id}" style="${box(rect)}">${esc(text)}</div>`;
}

/** A ring: its box with the value shown and an arrow; open, the list of its options under it. */
function ring(inv, dialog, name, rect) {
  const id = partId(`ring-${name}`);
  const opened = dialog.openRing === name;
  const options = opened
    ? `<div class="clfn-opciones" style="left:${px(rect.x)};top:${px(rect.y + rect.height)};width:${px(rect.width)}">${ringOptions(dialog, name)
        .map(([value, text]) => `<div class="clfn-opcion${value === ringValue(dialog, name) ? " elegida" : ""}" data-id="${partId(`option-${name}-${value}`)}">${esc(text)}</div>`)
        .join("")}</div>`
    : "";
  return `<div class="pv-combo clfn-anillo${holeClass(inv, id)}${opened ? " abierto" : ""}" data-id="${id}" style="${box(rect)}"><span class="pv-texto clfn-texto">${esc(ringText(dialog, name))}</span><span class="pv-flecha"></span></div>${options}`;
}

/** A ring that is greyed because its items were not measured: its click explains why. */
function greyedRing(inv, part, text, rect) {
  const id = partId(part);
  return `<div class="pv-combo clfn-anillo${holeClass(inv, id)}" data-id="${id}" style="${box(rect)}"><span class="pv-texto clfn-texto">${esc(text)}</span><span class="pv-flecha"></span></div>`;
}

function tabs(dialog) {
  const { y, height, lefts, widths } = LAYOUT.tabs;
  return TABS.map(([name, text], index) => {
    const active = dialog.tab === name;
    return `<div class="ficha clfn-ficha${active ? " activa" : ""}" data-id="${partId(`tab-${name}`)}" style="left:${px(lefts[index])};top:${px(active ? y - 2 : y)};width:${px(widths[index])};height:${px(active ? height + 2 : height)}">${esc(text)}</div>`;
  }).join("");
}

function functionTab(inv, dialog) {
  const L = LAYOUT;
  const { config } = dialog;
  return label("Library name or path", L.library.labelX, L.library.labelY) +
    textField("library", config.library, L.library.box, { focused: dialog.focus === "library", multiline: true }) +
    `<div class="pv-boton clfn-examinar" data-id="${partId("browse")}" style="${box(L.library.browse)}"><span class="clfn-carpeta"></span></div>` +
    check(inv, "specify-path", "Specify path on diagram", config["specify-path-on-diagram"], L.specifyPath) +
    label("Function name", L.functionName.labelX, L.functionName.labelY) +
    textField("function-name", config.function || "", L.functionName.box, { focused: dialog.focus === "function", arrow: L.functionName.arrowWidth }) +
    group(L.thread.group) + radio("thread-ui", "Run in UI thread", config.thread === "ui", L.thread.ui) + radio("thread-any", "Run in any thread", config.thread === "any", L.thread.any) +
    group(L.convention.group) + radio("convention-stdcall", "stdcall (WINAPI)", config["calling-convention"] === "stdcall", L.convention.stdcall) + radio("convention-c", "C", config["calling-convention"] === "c", L.convention.c);
}

/** The note a parameter of a kind Solder does not pass yet carries: the node cannot run, and says why. */
const notRunnableNote = (entry, isReturn) =>
  isReturn || RUNNABLE_PARAMETER_TYPES.has(entry.type) ? "" : "Solder does not pass this type to a library yet: the node is configured and saved, but it cannot run.";

function parametersTab(inv, dialog) {
  const L = LAYOUT;
  const entry = currentEntry(dialog);
  const isReturn = isReturnRow(dialog);
  const rows = [RETURN_ROW_LABEL, ...dialog.config.parameters.map((parameter) => parameter.name)]
    .map((text, index) => `<div class="clfn-fila${index === dialog.current ? " elegida" : ""}" data-id="${partId(`parameter-${index}`)}" style="left:${px(L.list.rowX)};top:${px(L.list.rowY + index * L.list.rowHeight)}">${esc(text)}</div>`)
    .join("");
  const list = `<div class="ficha-lista clfn-lista" style="${box(L.list)}">${rows}</div>`;
  const B = L.listButtons;
  const atFirst = isReturn || dialog.current === MIN_PARAMETER_ROW;
  const atLast = isReturn || dialog.current === dialog.config.parameters.length;
  const listButton = (part, y, glyph, disabled) => `<div class="pv-boton clfn-boton-lista${disabled ? " desactivado" : ""}" data-id="${partId(part)}" style="${box({ x: B.x, y, width: B.size, height: B.size })}">${glyph}</div>`;
  const buttons = listButton("add-parameter", B.add, "+", false) + listButton("delete-parameter", B.delete, "×", isReturn) +
    listButton("move-up", B.up, "▲", atFirst) + listButton("move-down", B.down, "▼", atLast);
  const C = L.current;
  const place = (row) => ({ x: C.fieldX, y: C.firstY + row * C.step, width: C.fieldWidth, height: C.fieldHeight });
  const rowLabel = (text, row) => label(text, C.labelRight - 8 * text.length, C.firstY + row * C.step + 5, " derecha");
  let body = group(C.group) + rowLabel("Name", 0) + textField("name", isReturn ? RETURN_ROW_LABEL : entry.name, place(0), { focused: dialog.focus === "name", disabled: isReturn }) +
    rowLabel("Type", 1) + ring(inv, dialog, "type", place(1)) +
    check(inv, "constant", "Constant", Boolean(entry.constant), { x: C.fieldX, y: C.firstY + 2 * C.step + 4 }, isReturn);
  let row = 3;
  for (const field of fieldsOf(entry, isReturn)) {
    const name = field.ring ?? field.spin;
    body += rowLabel(FIELD_LABELS[name], row);
    if (field.spin) body += dimensionsField(dialog, place(row));
    else if (name === "activex-data-type") body += greyedRing(inv, "activex-data-type", "ActiveX Variant Pointer", place(row));
    else body += ring(inv, dialog, name, place(row));
    row++;
  }
  const note = notRunnableNote(entry, isReturn);
  if (note) body += `<div class="pv-nota clfn-aviso" style="left:${px(C.fieldX - 120)};top:${px(C.firstY + row * C.step)};width:${px(C.fieldWidth + 100)}">${esc(note)}</div>`;
  return list + buttons + body;
}

function dimensionsField(dialog, rect) {
  const entry = currentEntry(dialog);
  return `<div class="pv-campo clfn-campo" style="${box(rect)}"><span class="clfn-texto">${entry.dimensions ?? 1}</span>` +
    `<div class="pv-spin"><div class="pv-spin-up" data-id="${partId("dimensions-up")}"></div><div class="pv-spin-down" data-id="${partId("dimensions-down")}"></div></div></div>`;
}

function callbacksTab(inv) {
  const C = LAYOUT.callbacks;
  const combos = [["callback-reserve", "Reserve"], ["callback-unreserve", "Unreserve"], ["callback-abort", "Abort"]]
    .map(([part, text], index) => label(text, C.labelX, C.firstY + index * C.step + 5) + greyedRing(inv, part, "<None>", { x: C.comboX, y: C.firstY + index * C.step, width: C.comboWidth, height: C.comboHeight }))
    .join("");
  return combos + label("Prototype for these procedures", C.labelX, C.prototypeY) + `<div class="clfn-prototipo-callbacks" style="left:${px(C.labelX)};top:${px(C.prototypeY + 20)}">${esc(CALLBACK_PROTOTYPE)}</div>`;
}

function errorCheckingTab(dialog) {
  const E = LAYOUT.errorChecking;
  const levels = ERROR_LEVELS.map(([level, text, description], index) => {
    const y = E.firstY + index * E.step;
    return radio(`error-${level}`, text, dialog.config["error-checking"] === level, { x: E.radioX, y }) +
      `<div class="pv-nota clfn-descripcion" style="left:${px(E.descriptionX)};top:${px(y - 4)};width:${px(E.descriptionWidth)}">${esc(description)}</div>`;
  }).join("");
  return group(E.group) + levels;
}

const TAB_VIEWS = { function: functionTab, parameters: parametersTab, callbacks: (inv) => callbacksTab(inv), "error-checking": (_inv, dialog) => errorCheckingTab(dialog) };

/** The dialog, modal over the window, like the other ones. */
export function view(inv, dialog) {
  const L = LAYOUT;
  const { width, height } = SIZE;
  const buttons = [["ok", "OK", true], ["cancel", "Cancel", false], ["help", "Help", false]]
    .map(([part, text, defaultButton]) => button(inv, part, text, { x: L.buttons[part], y: L.buttons.y, width: L.buttons.width, height: L.buttons.height }, { defaultButton }))
    .join("");
  const page = `<div class="pv-pagina clfn-pagina" style="${box(L.page)}"></div>`;
  const prototype = label("Function prototype", L.prototype.textX, L.prototype.labelY) +
    `<div class="clfn-prototipo" style="${box(L.prototype.box)}"><span>${esc(callLibraryPrototype(dialog.config))}</span></div>`;
  const wizard = `<div class="clfn-enlace${holeClass(inv, partId("wizard"))}" data-id="${partId("wizard")}" style="left:${px(L.wizard.x)};top:${px(L.wizard.y)}">Consider using a wizard instead...</div>`;
  return `<div class="pv-velo"><div class="pv-dialogo dialogo-clfn" data-dialogo="${DIALOG_ID}" style="width:${px(width)};height:${px(height)}">` +
    `<div class="pv-titulo" style="height:${px(L.titleHeight)}"><span>${esc(dialog.titulo)}</span><span class="pv-cerrar" data-id="${partId("close")}">✕</span></div>` +
    `${page}${tabs(dialog)}${TAB_VIEWS[dialog.tab](inv, dialog)}${prototype}${wizard}${buttons}</div></div>`;
}

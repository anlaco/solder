// What debugging draws, as HTML (pure: no DOM, so the tests measure what the page paints).
// Measurements: labview-captures/debugging/REPORT.md; the section is cited at each constant.
//
//   - on the diagram: the dimming of Highlight Execution, the band that grows along a wire
//     and the value tags (§1), the probe labels (§3), the breakpoints (§4) and the frame
//     of Show Error (§5);
//   - the Debug Window (§3) and the Error list window (§5).

import * as D from "../block-diagram/diagram-view.mjs";
import { endPoint } from "../block-diagram/broken-wire.mjs";
import * as G from "../common/glyphs.mjs";
import { esHueco } from "../common/labview-inventory.mjs";
import { nombre as typeName } from "../../../core/model/types.mjs";
import * as State from "./debug-state.mjs";
import * as ErrorList from "./error-list.mjs";

const px = (n) => `${Number(n.toFixed(2))}px`;
const esc = (text) => String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const holeClass = (inv, id) => (esHueco(inv.resolver(id) ?? { estado: "todo" }) ? " hueco" : "");

/** Value tags (§1, 31-zoom-sheet.png): fill #ccffff, 1 px #333333 border, 17 px tall, wider than the text by about 8 px. */
export const TAG = { height: 17, textPadding: 8 };
/** The probe label (§3, 55c): 21 × 17, fill #ffff66, rounded black border. */
export const PROBE_LABEL = { width: 21, height: 17 };
/** The breakpoint on a wire (§4, 71d): a solid #cc0000 disc of 19 px with the number in white. */
export const WIRE_BREAKPOINT_DIAMETER = 19;
/** The breakpoint on a node (§4, 73b): a 3 px #cc0000 frame outside the node. */
export const NODE_BREAKPOINT_FRAME = 3;
/** The band that grows along a wire (§1): 5 px thick. */
export const BAND_THICKNESS = 5;
/** The band colors of a type family (§1): numeric and Boolean were measured; the others are the same tone in the type's color (unverified). */
export const BAND_COLORS = { number: "#a3a3d6", boolean: "#a3bca3" };

/** The nodes and wires that keep their colors while the rest is dimmed, from the state of the Run. */
export function canvasView(state, graph, running) {
  const dim = running && state.highlight.on;
  const lit = new Set(state.run.lit);
  // A structure is lit as soon as something inside it is.
  for (const id of state.run.lit) for (let node = graph.nodos.find((n) => n.id === id); node?.dentro; node = graph.nodos.find((n) => n.id === node.dentro)) lit.add(node.dentro);
  for (const node of graph.nodos) if (node.dentro && lit.has(node.dentro) && D.esBorde(node)) lit.add(node.id);
  return { dim, litNodes: lit, litWires: new Set(Object.keys(state.run.litWires)) };
}

// ——— On the diagram ———

const pathLength = (path) => path.slice(1).reduce((total, point, k) => total + Math.abs(point[0] - path[k][0]) + Math.abs(point[1] - path[k][1]), 0);

/** The centre of the longest horizontal run of a wire: where its probe label sits (55c, 61). */
function labelPoint(path) {
  let best = null;
  for (let k = 1; k < path.length; k++) {
    const [[x0, y0], [x1, y1]] = [path[k - 1], path[k]];
    const length = Math.abs(x1 - x0);
    if (y0 === y1 && (!best || length > best.length)) best = { length, x: (x0 + x1) / 2, y: y0 };
  }
  return best ?? { x: path[0][0], y: path[0][1] };
}

/** Where a breakpoint disc sits: a little after the output it starts at (71d). */
function breakpointPoint(path) {
  const [[x0, y0], [x1]] = [path[0], path[1] ?? path[0]];
  return { x: x0 + Math.min(14, Math.abs(x1 - x0) / 2), y: y0 };
}

const tag = (text, x, y, extra = "") => {
  const width = D.anchoTexto(text) + TAG.textPadding;
  return `<div class="dep-etiqueta" style="left:${px(x)};top:${px(y)};min-width:${px(width)};height:${px(TAG.height)}${extra}">${esc(text)}</div>`;
};

/** The animation of a thing that appears when the band of a wire arrives: how far it already is at this repaint. */
const progressOf = (litWire, now) => ({ elapsed: Math.max(0, now - litWire.at), pace: litWire.pace });

/** The band that grows from the source to the destination (§1): it is drawn as a dashed path that fills in. */
function band(path, kind, progress) {
  const length = pathLength(path);
  const color = BAND_COLORS[kind] ?? BAND_COLORS.number;
  const points = path.map(([x, y]) => `${Number(x.toFixed(2))},${Number(y.toFixed(2))}`).join(" ");
  const style = `stroke:${color};stroke-width:${BAND_THICKNESS};stroke-dasharray:${length} ${length};--dep-length:${length};animation-duration:${Math.max(1, progress.pace)}ms;animation-delay:${-progress.elapsed}ms`;
  return `<polyline class="dep-banda" points="${points}" style="${style}"/>`;
}

const kindOfType = (type) => (type === "boolean" ? "boolean" : "number");

/**
 * Everything debugging adds inside the canvas. `options.now` is the clock of the page, so that the bands
 * and tags a repaint recreates go on from where they were; `resolved` is what `Gr.tipos` says.
 */
export function overlay(state, graph, context, resolved, options) {
  const { now, separator = ".", running, pausedAt = null, errorFocus = null } = options;
  const terminals = D.extremos(graph, context);
  const pathOf = (wire) => {
    const from = endPoint(wire.de, terminals);
    const to = endPoint(wire.a, terminals);
    return from && to ? D.ruta(from, to, wire.codos) : null;
  };
  let bands = "";
  let tags = "";
  let marks = "";
  const { showValues } = state.debugWindow;

  // Highlight Execution: a band per lit wire and, where it arrives, the value tag at the source.
  const taggedSources = new Set();
  for (const [wireId, litWire] of Object.entries(state.run.litWires)) {
    const wire = graph.cables.find((candidate) => candidate.id === wireId);
    const path = wire && pathOf(wire);
    if (!path) continue;
    const progress = progressOf(litWire, now);
    bands += band(path, kindOfType(resolved.cables.get(wireId)?.tipo), progress);
    const key = `${wire.de.nodo}.${wire.de.puerto}`;
    const reported = state.run.values[key];
    if (showValues && reported && !taggedSources.has(key)) {
      taggedSources.add(key);
      const delay = Math.max(0, progress.pace - progress.elapsed);
      tags += tag(State.formatTag(reported.value, separator), path[0][0], path[0][1] - TAG.height / 2, `;animation-delay:${delay}ms`).replace('class="dep-etiqueta"', 'class="dep-etiqueta dep-aparece"');
    }
  }

  for (const item of state.items) {
    const wire = item.wire && graph.cables.find((candidate) => candidate.id === item.wire);
    if (item.kind === "probe" && wire) {
      const path = pathOf(wire);
      if (!path) continue;
      const centre = labelPoint(path);
      const left = centre.x - PROBE_LABEL.width / 2;
      const top = centre.y - PROBE_LABEL.height / 2;
      marks += `<div class="dep-sonda" data-sonda="${item.number}" style="left:${px(left)};top:${px(top)};width:${px(PROBE_LABEL.width)};height:${px(PROBE_LABEL.height)}">${item.number}</div>`;
      const reported = State.wireValue(state, graph, item.wire);
      if (showValues && reported) tags += tag(State.formatTag(reported.value, separator), left + PROBE_LABEL.width, top);
    } else if (item.kind === "breakpoint" && wire) {
      const path = pathOf(wire);
      if (!path) continue;
      const point = breakpointPoint(path);
      const radius = WIRE_BREAKPOINT_DIAMETER / 2;
      marks += `<div class="dep-bp-cable${item.enabled ? "" : " apagado"}" data-breakpoint="${item.number}" style="left:${px(point.x - radius)};top:${px(point.y - radius)};width:${px(WIRE_BREAKPOINT_DIAMETER)};height:${px(WIRE_BREAKPOINT_DIAMETER)}">${item.number}</div>`;
    } else if (item.kind === "breakpoint" && item.node) {
      const node = graph.nodos.find((candidate) => candidate.id === item.node);
      if (node) marks += frame(D.caja(node, context), `dep-bp-nodo${item.enabled ? "" : " apagado"}`, NODE_BREAKPOINT_FRAME, `data-breakpoint="${item.number}"`);
    }
  }

  // The node the VI stopped at: inverse video and the marching frame (§4, 74).
  if (pausedAt) {
    const node = graph.nodos.find((candidate) => candidate.id === pausedAt.node);
    if (node) marks += frame(D.caja(node, context), "dep-detenido", 0, `data-detenido="${pausedAt.node}"`);
    const wire = pausedAt.wire && graph.cables.find((candidate) => candidate.id === pausedAt.wire);
    const path = wire && pathOf(wire);
    if (path) marks += `<polyline class="dep-detenido-cable" points="${path.map(([x, y]) => `${x},${y}`).join(" ")}" data-detenido-cable="${esc(pausedAt.wire)}"/>`;
  }

  // Show Error: the marching frame, 1 px outside the object (§5, 93).
  if (errorFocus) {
    const box = errorFocus.node ? (() => { const node = graph.nodos.find((candidate) => candidate.id === errorFocus.node); return node && D.caja(node, context); })() : null;
    if (box) marks += frame(box, "dep-marquesina", 1, `data-error-focus="${esc(errorFocus.node)}"`);
    const wire = errorFocus.wire && graph.cables.find((candidate) => candidate.id === errorFocus.wire);
    const path = wire && pathOf(wire);
    if (path) marks += `<polyline class="dep-detenido-cable" points="${path.map(([x, y]) => `${x},${y}`).join(" ")}" data-error-focus="${esc(errorFocus.wire)}"/>`;
  }
  const svg = bands || marks.includes("<polyline") ? `<svg class="cables dep-capa">${bands}${marks.match(/<polyline[^>]*\/>/g)?.join("") ?? ""}</svg>` : "";
  const boxes = marks.replace(/<polyline[^>]*\/>/g, "");
  return `${svg}${boxes}${tags}`;
}

/** A box `outset` px outside the box of a node. */
function frame(box, className, outset, attributes = "") {
  return `<div class="${className}" ${attributes} style="left:${px(box.x - outset)};top:${px(box.y - outset)};width:${px(box.ancho + 2 * outset)};height:${px(box.alto + 2 * outset)}"></div>`;
}

// ——— The rows of the context menus ———

/** The type of a wire as the probe menu names it ("I32", "DBL"…). */
export const wireTypeName = (resolved, wireId) => {
  const type = resolved.cables.get(wireId)?.tipo;
  return type === undefined ? "" : typeName(type);
};

const union = (a = new Set(), b = new Set()) => new Set([...a, ...b]);

/**
 * What the debugging changes in the menu of a node or a wire: a node or wire with a breakpoint offers
 * Remove Breakpoint and Disable (or Enable) Breakpoint where it offered Add Breakpoint (§4, 79b); the
 * second row only exists then. The Custom Probe rows carry the type of the wire (§3, 53).
 */
export function menuVariants(state, graph, resolved, menu) {
  if (!menu) return {};
  const root = menu.raiz;
  const isWire = root === "context.wire";
  const target = isWire ? { wire: menu.nodo } : { node: menu.nodo };
  const breakpoint = State.breakpointOn(state, target);
  const rotulos = new Map();
  const ocultos = new Set();
  const mostrados = new Set();
  if (breakpoint) {
    mostrados.add(`${root}.disable-breakpoint`);
    rotulos.set(`${root}.add-breakpoint`, "Remove Breakpoint");
    rotulos.set(`${root}.disable-breakpoint`, breakpoint.enabled ? "Disable Breakpoint" : "Enable Breakpoint");
  }
  if (isWire) {
    const type = wireTypeName(resolved, menu.nodo);
    if (type) {
      rotulos.set(`${root}.custom-probe.conditional`, `Conditional - ${type}`);
      rotulos.set(`${root}.custom-probe.history`, `History - ${type}`);
    }
  }
  return { rotulos, ocultos, mostrados };
}

/** The union of two variants (the node's own and the debugger's). */
export const mergeVariants = (a = {}, b = {}) => ({
  ...a,
  ...b,
  ocultos: union(a.ocultos, b.ocultos),
  mostrados: union(a.mostrados, b.mostrados),
  desactivados: union(a.desactivados, b.desactivados),
  rotulos: new Map([...(a.rotulos ?? []), ...(b.rotulos ?? [])]),
  redirigidos: new Map([...(a.redirigidos ?? []), ...(b.redirigidos ?? [])]),
});

// ——— The Debug Window (§3) ———

export const DEBUG_WINDOW_ID = "window.debug-window";
/** Measured on 55-probe-added.png: the window is 682 × 338; the list is 400 px wide and the Probe Display takes the rest. */
export const DEBUG_WINDOW = { width: 682, height: 338, title: 34, toolbar: { top: 35, height: 28, button: 28 }, list: { width: 400, headerTop: 66, headerHeight: 16, rowHeight: 16 }, columns: [162, 121, 100], splitter: 3 };

/** The buttons of its toolbar and the x of their left edge (REPORT.md §3: centres at 16 and 45, and 316, 346 and 376 px from the window's edge; 28 px wide). */
const BUTTONS = [
  { key: "remove-selected", x: 2, label: "Remove Selected Probes and Breakpoints" },
  { key: "enable-disable", x: 31, label: "Enable/Disable" },
  { key: "project-environment-settings", x: 302, label: "Project Environment Settings" },
  { key: "help", x: 332, label: "Help" },
  { key: "debug-options", x: 362, label: "Debug Options" },
];

function toolbarButtons(inv, state) {
  const selectedBreakpoint = state.items.some((item) => state.debugWindow.selected.includes(item.number) && item.kind === "breakpoint");
  const T = DEBUG_WINDOW.toolbar;
  return BUTTONS.map((button) => {
    const id = `${DEBUG_WINDOW_ID}.toolbar.${button.key}`;
    const grey = (button.key === "remove-selected" && state.debugWindow.selected.length === 0) || (button.key === "enable-disable" && !selectedBreakpoint);
    return `<div class="dw-boton${holeClass(inv, id)}${grey ? " desactivado" : ""}" data-id="${id}" data-tip="${esc(button.label)}" style="left:${px(button.x)};top:${px(1)};width:${px(T.button)};height:${px(T.height - 2)}">${G.DEBUG_WINDOW_ICONS[button.key]}</div>`;
  }).join("");
}

/** The value a row shows, and whether the row is a probe (rows of breakpoints have no value). */
function rowValue(state, graph, item, separator) {
  if (item.kind !== "probe") return { value: "", update: "" };
  const reported = State.wireValue(state, graph, item.wire);
  return reported ? { value: State.formatValue(reported.value, separator), update: State.formatClock(reported.at, separator) } : { value: "", update: "" };
}

function listRows(inv, state, graph, viName, separator) {
  const L = DEBUG_WINDOW.list;
  const top = L.headerTop + L.headerHeight;
  const bodyHeight = DEBUG_WINDOW.height - top - 2;
  const rowsThatFit = Math.ceil(bodyHeight / L.rowHeight);
  const rows = [{ type: "group" }, ...state.items.map((item) => ({ type: "item", item }))];
  let html = "";
  for (let k = 0; k < Math.max(rowsThatFit, rows.length); k++) {
    const row = rows[k];
    const selected = row?.type === "item" && state.debugWindow.selected.includes(row.item.number);
    const zebra = k % 2 === 0 ? "par" : "impar";
    const style = `top:${px(top + k * L.rowHeight)};height:${px(L.rowHeight)};width:${px(L.width - 18)}`;
    if (!row) html += `<div class="dw-fila ${zebra}" style="${style}"></div>`;
    else if (row.type === "group") html += `<div class="dw-fila ${zebra} grupo" style="${style}"><span class="dw-expansor">⊟</span><span class="dw-texto">${esc(viName)}</span></div>`;
    else {
      const { item } = row;
      const { value, update } = rowValue(state, graph, item, separator);
      const label = item.kind === "probe" ? `[${item.number}] Probe` : `[${item.number}] Breakpoint${item.enabled ? "" : " (disabled)"}`;
      html += `<div class="dw-fila ${zebra}${selected ? " elegida" : ""}${state.debugWindow.wrap ? " ajustada" : ""}" data-fila="${item.number}" style="${style}"><span class="dw-icono">${G.DEBUG_WINDOW_ICONS[item.kind]}</span><span class="dw-texto" style="left:${px(60)}">${esc(label)}</span><span class="dw-valor" style="left:${px(DEBUG_WINDOW.columns[0] + 21)}">${esc(value)}</span><span class="dw-actualizado" style="left:${px(DEBUG_WINDOW.columns[0] + DEBUG_WINDOW.columns[1] + 21)}">${esc(update)}</span></div>`;
    }
  }
  return html;
}

function probeDisplay(inv, state, graph, separator) {
  const L = DEBUG_WINDOW.list;
  const left = L.width + DEBUG_WINDOW.splitter;
  const probes = state.items.filter((item) => item.kind === "probe" && state.debugWindow.selected.includes(item.number));
  const options = `<div class="dw-boton${holeClass(inv, `${DEBUG_WINDOW_ID}.probe-display.probe-options`)}" data-id="${DEBUG_WINDOW_ID}.probe-display.probe-options" style="left:${px(DEBUG_WINDOW.width - left - 34)};top:${px(2)};width:${px(28)};height:${px(22)}">${G.DEBUG_WINDOW_ICONS["probe-options"]}</div>`;
  const displays = probes
    .map((probe, k) => {
      const reported = State.wireValue(state, graph, probe.wire);
      return `<div class="dw-visor" data-visor="${probe.number}" style="top:${px(46 + k * 24)}"><span class="dw-visor-etiqueta">[${probe.number}]</span><span class="dw-visor-valor">${esc(reported ? State.formatValue(reported.value, separator) : "")}</span></div>`;
    })
    .join("");
  return `<div class="dw-visor-panel" style="left:${px(left)};top:${px(DEBUG_WINDOW.toolbar.top + DEBUG_WINDOW.toolbar.height)};width:${px(DEBUG_WINDOW.width - left)};height:${px(DEBUG_WINDOW.height - DEBUG_WINDOW.toolbar.top - DEBUG_WINDOW.toolbar.height)}"><span class="dw-visor-titulo">Probe Display</span>${options}${displays}</div>`;
}

/**
 * The Debug Window, as a floating window over the diagram (the editor's dialogs are drawn in the page).
 * `ui.position` is where its corner is. `ui.menu` is the open popup, drawn by the caller.
 */
export function debugWindow(inv, state, graph, ui) {
  const { viName, separator = ".", position, active = true } = ui;
  const W = DEBUG_WINDOW;
  const L = W.list;
  const header = ["Probes and Breakpoints", "Value", "Last Update"]
    .map((text, k) => `<span class="dw-cabecera" style="left:${px(k === 0 ? 3 : W.columns.slice(0, k).reduce((a, b) => a + b, 0) + 4)};width:${px(W.columns[k])}">${text}</span>`)
    .join("");
  const hidden = state.debugWindow.hideProbeDisplay;
  const listWidth = hidden ? W.width : L.width;
  return `<div class="debug-window${active ? " activa" : ""}${state.debugWindow.keepOnTop ? " encima" : ""}" data-id="${DEBUG_WINDOW_ID}" style="left:${px(position.x)};top:${px(position.y)};width:${px(W.width)};height:${px(W.height)}">` +
    `<div class="dw-titulo" style="height:${px(W.title)}"><span class="dw-icono-app">${G.ICONO_APP}</span><span class="dw-titulo-texto">Debug Window</span><span class="dw-cerrar" data-id="${DEBUG_WINDOW_ID}.close">✕</span></div>` +
    `<div class="dw-barra" style="top:${px(W.toolbar.top)};height:${px(W.toolbar.height)}">${toolbarButtons(inv, state)}</div>` +
    `<div class="dw-lista" style="top:${px(L.headerTop)};width:${px(listWidth)};height:${px(W.height - L.headerTop - 1)}"><div class="dw-cabeceras" style="height:${px(L.headerHeight)}">${header}</div></div>` +
    `<div class="dw-filas" style="top:0;width:${px(listWidth)}">${listRows(inv, state, graph, viName, separator)}</div>` +
    `${hidden ? "" : `<div class="dw-divisor" style="left:${px(L.width)};top:${px(W.toolbar.top + W.toolbar.height)};height:${px(W.height - W.toolbar.top - W.toolbar.height)}"></div>${probeDisplay(inv, state, graph, separator)}`}</div>`;
}

/** The popup of the Debug Options button and of Probe Options hang from these inventory ids; the checks come from the state. */
export function debugWindowMenuMarks(state) {
  const marks = new Set();
  if (state.debugWindow.keepOnTop) marks.add(`${DEBUG_WINDOW_ID}.toolbar.debug-options.keep-window-on-top`);
  if (state.debugWindow.showValues) marks.add(`${DEBUG_WINDOW_ID}.toolbar.debug-options.show-values-on-wires`);
  if (state.debugWindow.wrap) marks.add(`${DEBUG_WINDOW_ID}.toolbar.debug-options.wrap-text`);
  return marks;
}

/** "Hide Probe Display" says "Show Probe Display" while hidden. */
export const debugWindowMenuVariants = (state) => ({ rotulos: new Map(state.debugWindow.hideProbeDisplay ? [[`${DEBUG_WINDOW_ID}.toolbar.debug-options.hide-probe-display`, "Show Probe Display"]] : []) });

/** The confirmation of the X of the Debug Window (§3, 63). */
export function closeProbesDialog(inv) {
  const id = `${DEBUG_WINDOW_ID}.close-dialog`;
  return `<div class="dw-velo"><div class="dw-dialogo" data-id="${id}">` +
    `<div class="dw-dialogo-titulo"><span class="dw-icono-app">${G.ICONO_APP}</span><span class="dw-cerrar" data-id="${id}.no">✕</span></div>` +
    `<div class="dw-dialogo-texto">This operation will close all probes in VIs that are open outside of projects. Do you wish to continue?</div>` +
    `<label class="dw-dialogo-casilla${holeClass(inv, `${id}.do-not-ask-again`)}" data-id="${id}.do-not-ask-again"><span class="pv-casilla"></span>Do not ask again</label>` +
    `<div class="dw-dialogo-botones"><span class="pv-boton defecto" data-id="${id}.yes">Yes</span><span class="pv-boton" data-id="${id}.no">No</span></div></div></div>`;
}

// ——— The Error list window (§5) ———

export const ERROR_LIST_ID = "window.error-list";
/** Measured on 92-error-list.png: 661 × 412, with the lists at x 11..649. */
export const ERROR_LIST = { width: 661, height: 412, title: 32, margin: 11, innerWidth: 638, viList: { top: 63, height: 69 }, countTop: 140, list: { top: 158, height: 89 }, detailsLabelTop: 253, details: { top: 268, height: 103 }, buttons: { top: 380, width: 100, height: 21, close: 317, showError: 433, help: 549 }, row: 16 };

/** The window; `model`: { rows, state, viName, position }. */
export function errorListWindow(inv, model) {
  const { rows, state, viName, position, showWarnings = state.showWarnings } = model;
  const W = ERROR_LIST;
  const shown = ErrorList.visibleRows(rows);
  const selected = shown.find((row) => row.id === state.selected);
  const viRow = rows.length ? `<div class="el-fila vi elegida" style="top:2px"><span class="el-x">${G.DEBUG_WINDOW_ICONS["error-mark"]}</span><span>${esc(viName)}</span></div>` : "";
  const items = shown
    .map((row, k) => `<div class="el-fila${row.id === state.selected ? " elegida" : ""}" data-fila="${esc(row.id)}" style="top:${px(W.row + k * W.row + 2)};padding-left:24px">${esc(row.text)}</div>`)
    .join("");
  const group = shown.length ? `<div class="el-fila grupo" style="top:2px"><span class="el-punto">●</span>${ErrorList.GROUP_TITLE}</div>` : "";
  const button = (key, label, left, extra = "") => `<div class="el-boton${holeClass(inv, `${ERROR_LIST_ID}.${key}`)}${extra}" data-id="${ERROR_LIST_ID}.${key}" style="left:${px(left)};top:${px(W.buttons.top)};width:${px(W.buttons.width)};height:${px(W.buttons.height)}">${label}</div>`;
  return `<div class="error-list" data-id="${ERROR_LIST_ID}" style="left:${px(position.x)};top:${px(position.y)};width:${px(W.width)};height:${px(W.height)}">` +
    `<div class="dw-titulo" style="height:${px(W.title)}"><span class="dw-icono-app">${G.ICONO_APP}</span><span class="dw-titulo-texto">Error list</span><span class="dw-cerrar" data-id="${ERROR_LIST_ID}.close-x">✕</span></div>` +
    `<div class="el-etiqueta" style="left:${px(W.margin + 2)};top:${px(W.title + 11)}">Items with errors</div>` +
    `<div class="el-caja" data-id="${ERROR_LIST_ID}.items-with-errors" style="left:${px(W.margin)};top:${px(W.viList.top)};width:${px(W.innerWidth)};height:${px(W.viList.height)}">${viRow}</div>` +
    `<div class="el-etiqueta" style="left:${px(W.margin + 2)};top:${px(W.countTop)}">${esc(ErrorList.countLabel(shown))}</div>` +
    `<label class="el-casilla${holeClass(inv, `${ERROR_LIST_ID}.show-warnings`)}${showWarnings ? " marcada" : ""}" data-id="${ERROR_LIST_ID}.show-warnings" style="right:${px(W.margin + 2)};top:${px(W.countTop - 1)}">Show Warnings<span class="pv-casilla"></span></label>` +
    `<div class="el-caja" data-id="${ERROR_LIST_ID}.errors" style="left:${px(W.margin)};top:${px(W.list.top)};width:${px(W.innerWidth)};height:${px(W.list.height)}">${group}${items}</div>` +
    `<div class="el-etiqueta" style="left:${px(W.margin + 2)};top:${px(W.detailsLabelTop)}">Details</div>` +
    `<div class="el-detalles" data-id="${ERROR_LIST_ID}.details" style="left:${px(W.margin)};top:${px(W.details.top)};width:${px(W.innerWidth)};height:${px(W.details.height)}">${esc(selected?.details ?? "")}</div>` +
    button("close", "Close", W.buttons.close) + button("show-error", "Show Error", W.buttons.showError, " defecto") + button("help", "Help", W.buttons.help) + `</div>`;
}

/** The kind of a type for tests and the bands: "boolean" or "number". */
export const bandKind = kindOfType;

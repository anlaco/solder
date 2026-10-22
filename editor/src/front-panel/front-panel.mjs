// The Front Panel: the VI's controls and indicators, how they are drawn and what
// each click, move and key does.
//
// Pure functions, like diagram-editing.mjs, over the same graph: a control is a
// node with a position on the panel (`panel`) and on the diagram (`x`, `y`), so
// placing it here places its terminal there (spec/05 rule 38) and deleting it
// here deletes it there, with its wires (rule 39). What is cloned comes from the
// video labview-captures/front-panel/numeric-colocar-etiquetas.mp4 and from
// front-panel/numeric-panel.png; measurements are in video pixels, which are
// screen pixels at 150 %, divided by 1.5.
//
// The state:
//   g          the graph (core/model/graph.mjs), the same one the diagram edits
//   seleccion  ids of nodes and of labels ("n3#etiqueta")
//   accion     what is half done:
//     { tipo: "colocar", bloque, x, y, arrastrado }   a control picked from the palette
//     { tipo: "mover", x, y, nodo, movido }            dragging the selection; `nodo`, the object pressed
//     { tipo: "etiqueta", nodo, x, y }                 dragging a label on its own
//     { tipo: "rectangulo", x0, y0, x1, y1, base }     selecting by dragging over the background
//   edicion    { nodo, etiqueta: true, texto, todo } while typing into a label,
//              or { nodo, valor: true, texto, todo } into a control's box
//   menu       { raiz, nodo, x, y, abierto } the right-click menu of a boolean control
//              (handled with the same functions as the diagram's: diagram-editing.mjs)

import * as CV from "../../../core/model/control-values.mjs";
import * as Et from "../common/labels.mjs";
import { BOOLEANOS } from "../common/glyphs.mjs";
import { isUndefinedArray } from "../../../core/model/types.mjs";
import { elementMenuRoot, isEmptyArrayShell, panelArrayFromElement, typeEmptyArray } from "../common/array-typing.mjs";
import * as Gr from "../../../core/model/graph.mjs";
import { REPEATED_PASTE_STEP } from "../common/paste-memory.mjs";
import { copyFragment, pasteFragment } from "../../../core/model/clipboard.mjs";
import { convertirValor, elementoPorDefecto, esEnum, formatear, leerElemento, leerNumero } from "../../../core/model/types.mjs";
import { GRAPH_MEASURES, LABEL_PLACEMENT, graphSvg } from "./graph-view.mjs";
import * as HC from "./html-controls.mjs";
import { isGraph, labelShown, wireTypeOf } from "./graph-state.mjs";
import { cellAddress, dimensionsOfNode, firstShown, indexSetting, isDefined, readCell, valueFitsDimensions, visibleGrid, visibleSetting, writeCell } from "../common/array-grid.mjs";

export const inicial = (g = Gr.nuevo()) => ({ g, seleccion: [], accion: null, edicion: null, menu: null });

/**
 * Los controles del panel que hay hechos, por bloque: la etiqueta con que
 * nacen y si llevan incrementador. LabVIEW llama «Numeric» a los dos.
 */
export const CONTROLES = {
  control: { etiqueta: "Numeric", incrementador: true },
  indicator: { etiqueta: "Numeric", incrementador: false },
  "bool-control": { etiqueta: "Boolean", incrementador: false, booleano: true },
  "bool-indicator": { etiqueta: "Boolean", incrementador: false, booleano: true },
  // Un control o indicador de cadena: LabVIEW llama «String» a los dos (labview-captures/string/).
  "str-control": { etiqueta: "String", incrementador: false, cadena: true },
  "str-indicator": { etiqueta: "String", incrementador: false, cadena: true },
  // Un cluster: de momento sólo los de error (Error In y Error Out), que se distinguen por `config.style`.
  "cluster-control": { etiqueta: "Cluster", incrementador: false, cluster: true },
  "cluster-indicator": { etiqueta: "Cluster", incrementador: false, cluster: true },
  // Un array de una dimensión: el índice y la caja de sus elementos (labview-captures/array/panel-array-1a1.png).
  "arr-control": { etiqueta: "Array", incrementador: false, array: true, control: true },
  "arr-indicator": { etiqueta: "Array", incrementador: false, array: true, control: false },
  // The graphs of Controls ▸ Modern ▸ Graph: indicators, labelled as LabVIEW does (labview-captures/graphs/03-three-fresh-panel.png).
  "waveform-chart": { etiqueta: "Waveform Chart", incrementador: false, grafico: true },
  "waveform-graph": { etiqueta: "Waveform Graph", incrementador: false, grafico: true },
  "xy-graph": { etiqueta: "XY Graph", incrementador: false, grafico: true },
};

/**
 * A panel array, measured at 1:1 in labview-captures/array/panel-array-1a1.png: the index column is 41 px wide and the
 * box of the elements starts 3 px below the top of the object. The sizes of each element are those of a 2D array's
 * cells (MEDIDAS_ARRAY_PANEL_2D); a one-dimensional array has its own (PANEL_ARRAY_1D).
 */
export const MEDIDAS_ARRAY_PANEL = { indice: 41, altoIndice: 26, bajaCaja: 3, numerico: [67, 25], cadena: [100, 24], booleano: [30, 25] };
/**
 * A one-dimensional panel array, measured at 1:1 in labview-captures/array-typing/panel-all-top.png: the shell is a
 * 4 px bevel round its elements. A numeric control's element is 65 × 26 (its incrementer and, 1 px down, a 54 × 25
 * field), so the shell is 73 × 34; a numeric indicator's 53 × 25 (a 61 × 33 shell); a string's is 100 × 25 (a
 * 108 × 33 shell). A Boolean's keeps the 30 × 25 of its old T/F field (unverified: LabVIEW draws the element itself, an
 * LED is 21 × 25). The index box is 25 px tall and level with the shell; its incrementer rises 3 px above them.
 */
export const PANEL_ARRAY_1D = { bevel: 4, indexHeight: 25, numericControl: [65, 26], numericIndicator: [53, 25], string: [100, 25], boolean: [30, 25] };
/** What one element of a one-dimensional panel array measures, by its type and whether the array is a control. */
export function elementSize1D(elementType, isControl) {
  if (elementType === "string") return PANEL_ARRAY_1D.string;
  if (elementType === "boolean") return PANEL_ARRAY_1D.boolean;
  return isControl ? PANEL_ARRAY_1D.numericControl : PANEL_ARRAY_1D.numericIndicator;
}
/**
 * A panel array with two dimensions, measured at 1:1 in labview-captures/array-2d/panel-array-2d-control-empty.png and
 * panel-array-2d-stretched.png: the index column is still 41 px wide but holds two fields, 28 px apart; the box of
 * elements sits at the top right as in 1D and its cells repeat every 65 px across and 26 px down for a numeric
 * element, so the box is 65 × columns + 7 wide and 26 × rows + 5 tall. How the 7 and the 5 split between the sides is
 * unverified, and so is the pitch of string and Boolean elements (taken as the element size less 2 across and plus 1 down).
 */
export const MEDIDAS_ARRAY_PANEL_2D = { pasoIndices: 28, margenIzquierdo: 3, margenDerecho: 4, margenArriba: 3, margenAbajo: 2, bordeCaja: 1, restaPasoAncho: 2, sumaPasoAlto: 1 };
export const tipoElemento = (n) => n.config?.type?.array ?? "number";
/**
 * A panel array with no element yet (DT-060). Measured in labview-captures/array-typing/panel-empty.png: the shell is
 * 80 × 80 px (a 4 px bevel round a 72 × 72 interior), level with the index box on its left and 3 px below the top of
 * the incrementer, and it holds no cells.
 */
export const MEDIDAS_ARRAY_PANEL_VACIO = { casilla: 80 };
export const esArrayPanelVacio = (n) => !!CONTROLES[n?.tipo]?.array && isUndefinedArray(n.config?.type);
/** How many columns an array shows (its elements, for a 1D one). */
export const visiblesPanel = (config) => visibleGrid(config).columns;
/** What each cell of a two-dimensional array measures, by its type. */
export const medidaElemento = (t) => (t === "string" ? MEDIDAS_ARRAY_PANEL.cadena : t === "boolean" ? MEDIDAS_ARRAY_PANEL.booleano : MEDIDAS_ARRAY_PANEL.numerico);
/** The distance between the cells of a 2D array: across and down. */
export function pasoCeldas2D(t) {
  const [ancho, alto] = medidaElemento(t);
  return [ancho - MEDIDAS_ARRAY_PANEL_2D.restaPasoAncho, alto + MEDIDAS_ARRAY_PANEL_2D.sumaPasoAlto];
}
// What a panel object holds now (DT-053); the last Run's value of an indicator is apart, in `valores`.
const valorActual = CV.currentValue;
const esArrayPanel = (n) => !!CONTROLES[n?.tipo]?.array;
/** Los valores de un array del panel: los que le dejó el último Run, si es un indicador (y encajan en sus dimensiones), o los suyos. */
export function valoresDeArray(n, valores) {
  const delRun = valores?.[n.id];
  return delRun && valueFitsDimensions(delRun, dimensionsOfNode(n.config)) ? delRun : valorActual(n) ?? [];
}

/**
 * Los controles de error de Controls ▸ Modern ▸ Data Containers (DT-043): un cluster
 * `{ status, code, source }` con su `style`. Medidas de labview-captures/errores/301-panel-error-out-1a1.png,
 * a 1:1: 155 × 121 px; el rótulo, «error in (no error)» en el control y «error out» en el indicador.
 */
export const ERRORES = {
  "error-in": { etiqueta: "error in (no error)", control: true },
  "error-out": { etiqueta: "error out", control: false },
};
export const MEDIDAS_ERROR = { ancho: 155, alto: 121 };
/** El valor de un cluster de error que no se ha tocado. */
export const ERROR_VACIO = CV.NO_ERROR;
/** La clase de error de un control del panel, o nada si no lo es. */
export const claseError = (tipo, config) => (tipo === "cluster-control" || tipo === "cluster-indicator" ? ERRORES[config?.style] : undefined);
/** El valor de un control de error: el que le dejó el último Run, si es un indicador, o el suyo. */
export const valorError = (n, valores) => ({ ...ERROR_VACIO, ...(valores?.[n.id] ?? valorActual(n)) });

/**
 * La casilla de un control de cadena, medida a 1:1 en labview-captures/string/panel-string-editando.png:
 * 100 × 24 px con un bisel de 4 (el interior, 92 × 17) y la etiqueta a 2 px por encima.
 */
export const MEDIDAS_CADENA_PANEL = { ancho: 100, alto: 24 };

/**
 * The kind of a boolean control (Push Button, Stop Button…): its size, drawing
 * and default label come from glyphs.mjs (BOOLEANOS), by the `style` in its
 * configuration. A block that is not boolean has none.
 */
export const estiloDe = (tipo, config) => (CONTROLES[tipo]?.booleano ? BOOLEANOS[config?.style] ?? BOOLEANOS["push-button"] : null);

/** La etiqueta con que nace un control: la de su clase si es booleano o un enum, o la del bloque. */
const etiquetaNueva = (tipo, config) => claseError(tipo, config)?.etiqueta ?? estiloDe(tipo, config)?.etiqueta ?? (esEnum(config?.type) ? "Enum" : CONTROLES[tipo]?.etiqueta) ?? "";

/**
 * Medidas de un control numérico, de numeric-panel.png: la casilla mide
 * 82 × 37 px del vídeo, con un bisel de 6; el incrementador, 24 de ancho, pisa
 * el bisel izquierdo de la casilla. La etiqueta va encima, alineada con la
 * casilla, y su pie queda a 2 px de ella.
 */
export const MEDIDAS_PANEL = { casilla: 55, alto: 25, bisel: 4, incrementador: 16, solape: 4, separacion: 2 };
/**
 * The box of an enum, measured at 1:1 in labview-captures/enum-edit/21-enum-ctrl-zoom.png next to a
 * Numeric Control (DT-049): 49 px wide — 61 in total with the arrows — where the numeric one is 55.
 */
export const CASILLA_ENUM = 49;

/**
 * Entre el pie de la etiqueta y un control booleano van 4 px (siete filas de
 * píxeles vacías entre el texto y el dibujo, en boolean-todos-apagados.png:
 * ocho de los nueve controles recién puestos, medidos desde el borde del dibujo).
 */
const SEPARACION_BOOLEANO = 4;

const CLAVE_ETIQUETA = "#etiqueta";
export const idEtiqueta = (nodo) => `${nodo}${CLAVE_ETIQUETA}`;
const esEtiqueta = (id) => id.endsWith(CLAVE_ETIQUETA);
const nodoDeEtiqueta = (id) => id.slice(0, -CLAVE_ETIQUETA.length);

/** Dónde empieza la casilla dentro del objeto: tras el incrementador, si lo lleva. */
const inicioCasilla = (tipo) => (CONTROLES[tipo]?.incrementador ? MEDIDAS_PANEL.incrementador - MEDIDAS_PANEL.solape : 0);

/** La caja de un objeto del panel, sin su etiqueta. */
export function cajaObjeto(tipo, x, y, config) {
  const M = MEDIDAS_PANEL;
  if (claseError(tipo, config)) return { x, y, ancho: MEDIDAS_ERROR.ancho, alto: MEDIDAS_ERROR.alto, casilla: 0 };
  if (CONTROLES[tipo]?.array && isUndefinedArray(config?.type)) {
    const shell = MEDIDAS_ARRAY_PANEL_VACIO.casilla;
    return { x, y, ancho: MEDIDAS_ARRAY_PANEL.indice + shell, alto: MEDIDAS_ARRAY_PANEL.bajaCaja + shell, casilla: MEDIDAS_ARRAY_PANEL.indice };
  }
  if (CONTROLES[tipo]?.array && dimensionsOfNode(config) === 2) {
    const [A, B] = [MEDIDAS_ARRAY_PANEL, MEDIDAS_ARRAY_PANEL_2D];
    const [pasoAncho, pasoAlto] = pasoCeldas2D(config?.type?.array ?? "number");
    const { rows, columns } = visibleGrid(config);
    return { x, y, ancho: A.indice + columns * pasoAncho + B.margenIzquierdo + B.margenDerecho, alto: Math.max(B.pasoIndices + A.altoIndice, A.bajaCaja + rows * pasoAlto + B.margenArriba + B.margenAbajo), casilla: A.indice };
  }
  if (CONTROLES[tipo]?.array) {
    const A = MEDIDAS_ARRAY_PANEL;
    const [elementWidth, elementHeight] = elementSize1D(config?.type?.array ?? "number", CONTROLES[tipo].control);
    const bevel = PANEL_ARRAY_1D.bevel;
    return { x, y, ancho: A.indice + visiblesPanel(config) * elementWidth + 2 * bevel, alto: Math.max(A.altoIndice, A.bajaCaja + elementHeight + 2 * bevel), casilla: A.indice };
  }
  // A graph is its frame; the legend and the label go above it (graph-view.mjs).
  if (CONTROLES[tipo]?.grafico) return { x, y, ancho: GRAPH_MEASURES[tipo].width, alto: GRAPH_MEASURES[tipo].height, casilla: LABEL_PLACEMENT.indent, separacion: LABEL_PLACEMENT.gap };
  const b = estiloDe(tipo, config);
  if (b) return { x, y, ancho: b.ancho, alto: b.alto, casilla: 0, separacion: SEPARACION_BOOLEANO };
  if (CONTROLES[tipo]?.cadena) return { x, y, ancho: MEDIDAS_CADENA_PANEL.ancho, alto: MEDIDAS_CADENA_PANEL.alto, casilla: 0 };
  const casilla = inicioCasilla(tipo);
  return { x, y, ancho: casilla + (esEnum(config?.type) ? CASILLA_ENUM : M.casilla), alto: M.alto, casilla };
}

export const caja = (n) => cajaObjeto(n.tipo, n.panel.x, n.panel.y, n.config);

/** How deep inside a numeric or string control's edge a press moves it instead of typing (2026-10-17-panel-move-zones.md). */
const MOVE_BAND_PX = 4;

/** Whether the point lies within MOVE_BAND_PX of the inside of the box's edge. */
function isInMoveBand(box, point) {
  const fromLeft = point.x - box.x;
  const fromTop = point.y - box.y;
  const fromRight = box.x + box.ancho - 1 - point.x;
  const fromBottom = box.y + box.alto - 1 - point.y;
  const inside = Math.min(fromLeft, fromTop, fromRight, fromBottom) >= 0;
  return inside && Math.min(fromLeft, fromTop, fromRight, fromBottom) < MOVE_BAND_PX;
}

/** Whether a press in the node's value box types in it: numeric controls with an incrementer, and string controls. */
const typesInValueBox = (n) => (CONTROLES[n?.tipo]?.incrementador || n?.tipo === "str-control") && !esEnum(n?.config?.type);

/**
 * The edit-mode pointer over a panel object, as LabVIEW's automatic tool shows it
 * (2026-10-17-numeric-cursor-map.md, 2026-10-18-numeric-hover-selected.md): "move" (the positioning
 * arrow) on the label, on the 4 px band of a value box and over all of a selected control; "text" (the
 * I-beam) inside the value box; "operate" (the finger) over the incrementer's arrows. `null` leaves the
 * panel style's own pointer, for what is not measured yet.
 */
export function hoverCursor(p, sobre, pt) {
  if (sobre?.tipo === "etiqueta") return "move";
  const n = sobre && p.g.nodos.find((m) => m.id === sobre.id);
  if (!typesInValueBox(n)) return null;
  if (p.seleccion.includes(n.id) && (sobre.tipo === "casilla" || sobre.tipo === "paso" || sobre.tipo === "objeto")) return "move";
  if (sobre.tipo === "paso") return "operate";
  if (sobre.tipo === "casilla") return isInMoveBand(caja(n), pt) ? "move" : "text";
  return null;
}

/** Whether a double click at the point types over the whole value: inside a value box, selected or not (its 4 px band opens the diagram in LabVIEW, not done). */
export function doubleClickTypes(p, sobre, pt) {
  const n = sobre?.tipo === "casilla" && p.g.nodos.find((m) => m.id === sobre.id);
  return !!n && typesInValueBox(n) && !isInMoveBand(caja(n), pt);
}

/** Una etiqueta que nunca se ha movido va encima de la casilla, alineada con ella. */
const etiquetaPorDefecto = (k, tam) => [k.casilla, -(tam.alto + (k.separacion ?? MEDIDAS_PANEL.separacion))];

/** La caja de la etiqueta de un objeto del panel. */
export const cajaEtiqueta = (n, medir, edicion) => Et.caja(n, "panel", caja(n), etiquetaPorDefecto, medir, edicion);

/** Los nodos que se ven en el panel. */
export const objetos = (g) => g.nodos.filter((n) => n.panel);

// ——— Pintar ———

const px = (n) => `${Number(n.toFixed(2))}px`;
const esc = (t) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * El valor de un control o indicador, como lo enseña su casilla: el que le dejó
 * el último Run, si lo hay, o el suyo por defecto.
 */
const esCadena = (n) => !!CONTROLES[n?.tipo]?.cadena;
const tipoDe = (n) => n.config?.type ?? "number";
const textoValor = (n, ctx, valores) => {
  // An enum shows the name of its current item (DT-049); while running, the value that
  // arrives is the item's number.
  if (esEnum(tipoDe(n))) return (n.config?.type?.enum ?? [])[valores?.[n.id] ?? valorActual(n) ?? 0] ?? "";
  return esCadena(n) ? String(valores?.[n.id] ?? valorActual(n) ?? "") : formatear(valores?.[n.id] ?? valorActual(n) ?? 0, tipoDe(n), ctx.separador);
};

/** El valor de un booleano: el que le dejó el último Run, si es un indicador, o el suyo por defecto. */
const encendido = (n, valores) => !!(valores?.[n.id] ?? valorActual(n));

/** The text of an element of an array of the panel: what is being typed into it, or its value. */
function elementText(lista, address, dimensions, type, ctx, editing) {
  if (editing) return editing.todo ? `<span class="texto-elegido">${esc(editing.texto)}</span>` : `<span>${esc(editing.texto)}</span><span class="caret"></span>`;
  const value = readCell(lista, dimensions, address);
  return `<span>${esc(type === "string" ? String(value ?? "") : type === "boolean" ? (value ? "T" : "F") : formatear(value ?? elementoPorDefecto(type), type, ctx.separador))}</span>`;
}

/** The handles that stretch a selected array: on the right and, with two dimensions, below and at the corner. */
function arrayHandles(k, dimensions, elementsHeight) {
  const A = MEDIDAS_ARRAY_PANEL;
  const handle = (side, left, top) => `<div class="asa-array" data-asa-array="1" data-lado="${side}" style="left:${px(left - 3)};top:${px(top - 3)}"></div>`;
  return dimensions === 2
    ? handle("derecha", k.ancho, A.bajaCaja + elementsHeight / 2) + handle("abajo", A.indice + (k.ancho - A.indice) / 2, A.bajaCaja + elementsHeight) + handle("esquina", k.ancho, A.bajaCaja + elementsHeight)
    : handle("derecha", k.ancho - 1, A.bajaCaja + elementsHeight / 2);
}

// Every object is drawn as the plain HTML of html-controls.mjs, which each panel style dresses with its sheet
// (DT-058), Old School included; what each one holds and what is being typed into it come from here.

const isControlNode = (n) => n.tipo === "control" || n.tipo.endsWith("-control");

/** The escaped text of a field: what is being typed into it, with the caret or the selection, or `text`. */
const typedOrText = (editing, text) => {
  if (!editing) return esc(text);
  return editing.todo ? `<span class="texto-elegido">${esc(editing.texto)}</span>` : `<span>${esc(editing.texto)}</span><span class="caret"></span>`;
};

/** An array whose element is not defined yet: the index at 0 and the empty shell, with no cells and no handles. */
function undefinedArrayObject(frame) {
  const A = MEDIDAS_ARRAY_PANEL;
  const indices = [{ axis: "columna", box: { x: 0, y: A.bajaCaja, width: A.indice, height: PANEL_ARRAY_1D.indexHeight }, position: 0 }];
  const elementsBox = { x: A.indice, y: A.bajaCaja, width: MEDIDAS_ARRAY_PANEL_VACIO.casilla, height: MEDIDAS_ARRAY_PANEL_VACIO.casilla };
  return HC.arrayHtml(frame, { indices, elementsBox, elementsHtml: "", handles: "", undefinedElement: true });
}

/**
 * A panel array: its index (one per dimension) and the elements shown from it; those past the end are greyed, with
 * their default value. Each element carries `data-k` (its place, or "row,column" with two dimensions), so a click on
 * it types into it (only on a control).
 */
function arrayObject(n, ctx, frame, editing, valores) {
  if (isUndefinedArray(n.config?.type)) return undefinedArrayObject(frame);
  const [A, B] = [MEDIDAS_ARRAY_PANEL, MEDIDAS_ARRAY_PANEL_2D];
  const elementType = tipoElemento(n);
  const values = valoresDeArray(n, valores);
  const dimensions = dimensionsOfNode(n.config);
  const [elementWidth, elementHeight] = dimensions === 2 ? medidaElemento(elementType) : elementSize1D(elementType, frame.isControl);
  const pitch = dimensions === 2 ? pasoCeldas2D(elementType) : [elementWidth, elementHeight];
  const first = firstShown(n.config);
  const { rows, columns } = visibleGrid(n.config);
  const bevel = PANEL_ARRAY_1D.bevel;
  const elementsHeight = dimensions === 2 ? frame.box.alto - A.bajaCaja : elementHeight + 2 * bevel;
  const origin = dimensions === 2 ? { x: B.margenIzquierdo - B.bordeCaja, y: B.margenArriba - B.bordeCaja } : { x: bevel, y: bevel };
  const elementsHtml = Array.from({ length: rows * columns }, (_, i) => {
    const [row, column] = [Math.floor(i / columns), i % columns];
    const address = cellAddress(dimensions, first.row + row, first.column + column);
    const cellEditing = editing?.elem === address ? editing : null;
    return HC.arrayElementHtml({
      address,
      place: { x: origin.x + column * pitch[0], y: origin.y + row * pitch[1], width: elementWidth, height: elementHeight },
      defined: dimensions === 2 ? isDefined(values, 2, address) : address < values.length,
      editing: !!cellEditing,
      elementType,
      valueHtml: elementText(values, address, dimensions, elementType, ctx, cellEditing),
      on: elementType === "boolean" && !!readCell(values, dimensions, address),
      isControl: frame.isControl,
    });
  }).join("");
  const indexBox = (top) => ({ x: 0, y: top, width: A.indice, height: A.altoIndice });
  const indices = dimensions === 2
    ? [{ axis: "fila", box: indexBox(0), position: first.row }, { axis: "columna", box: indexBox(B.pasoIndices), position: first.column }]
    : [{ axis: "columna", box: { x: 0, y: A.bajaCaja, width: A.indice, height: PANEL_ARRAY_1D.indexHeight }, position: first.column }];
  const elementsBox = { x: A.indice, y: A.bajaCaja, width: frame.box.ancho - A.indice, height: elementsHeight };
  return HC.arrayHtml(frame, { indices, elementsBox, elementsHtml, handles: frame.selected ? arrayHandles(frame.box, dimensions, elementsHeight) : "" });
}

/** One object of the panel; a graph's legend and plot swatch are parts of it (`data-parte`) with menus of their own. */
function panelObject(n, ctx, selected, p, resolvedTypes) {
  const editing = p.edicion?.valor && p.edicion.nodo === n.id ? p.edicion : null;
  const frame = { id: n.id, box: caja(n), label: n.label?.text ?? "", selected, editing: !!editing, isControl: isControlNode(n) };
  const control = CONTROLES[n.tipo];
  if (isGraph(n)) {
    const type = resolvedTypes ? wireTypeOf(p.g, resolvedTypes, n.id) : undefined;
    return HC.graphHtml(frame, { kind: n.tipo, svg: graphSvg(n, { type, value: p.valores?.[n.id], charts: p.charts, separator: ctx.separador }) });
  }
  if (esArrayPanel(n)) return arrayObject(n, ctx, frame, editing, p.valores);
  if (claseError(n.tipo, n.config)) {
    const value = valorError(n, p.valores);
    return HC.errorClusterHtml(frame, { status: !!value.status, fieldHtml: (field) => typedOrText(editing?.campo === field ? editing : null, value[field]) });
  }
  if (control?.booleano) return HC.booleanHtml(frame, { style: n.config?.style ?? "push-button", on: encendido(n, p.valores) });
  const valueHtml = typedOrText(editing, textoValor(n, ctx, p.valores));
  if (control?.cadena) return HC.stringHtml(frame, { valueHtml });
  return HC.numericHtml(frame, { valueHtml, withIncrementer: !!control?.incrementador, isEnum: esEnum(tipoDe(n)) });
}

/**
 * Everything the panel draws inside the canvas, as the plain HTML every panel style dresses (DT-058). `resueltos`:
 * the diagram's types (`Gr.tipos`), which graphs need to know what they receive; if they are not given and there is
 * a graph, they are computed.
 */
export function contenido(p, ctx, resueltos) {
  const elegidos = new Set(p.seleccion);
  const tipos = resueltos ?? (objetos(p.g).some(isGraph) ? Gr.tipos(p.g, ctx.cat) : undefined);
  let html = "";
  for (const n of objetos(p.g)) {
    const selected = elegidos.has(n.id);
    html += panelObject(n, ctx, selected, p, tipos);
    if (labelShown(n)) html += Et.pintar(n, cajaEtiqueta(n, ctx.medir, p.edicion), { edicion: p.edicion, elegida: elegidos.has(idEtiqueta(n.id)), publicClass: "sd-label" });
  }
  const { accion } = p;
  if (accion?.tipo === "colocar" && accion.x !== undefined) {
    // Mientras se arrastra desde la paleta, LabVIEW enseña sólo el contorno
    // del objeto y de su etiqueta, punteado.
    const k = cajaObjeto(accion.bloque, accion.x, accion.y, accion.config);
    const t = Et.tamano(etiquetaNueva(accion.bloque, accion.config), ctx.medir);
    html += `<div class="contorno-colocar" style="left:${px(k.x + k.casilla)};top:${px(k.y - t.alto - (k.separacion ?? MEDIDAS_PANEL.separacion))};width:${px(t.ancho)};height:${px(t.alto)}"></div>`;
    html += `<div class="contorno-colocar objeto" style="left:${px(k.x)};top:${px(k.y)};width:${px(k.ancho)};height:${px(k.alto)}"></div>`;
  }
  if (accion?.tipo === "rectangulo") {
    const [x, y] = [Math.min(accion.x0, accion.x1), Math.min(accion.y0, accion.y1)];
    html += `<div class="rectangulo" style="left:${px(x)};top:${px(y)};width:${px(Math.abs(accion.x1 - accion.x0))};height:${px(Math.abs(accion.y1 - accion.y0))}"></div>`;
  }
  return html;
}

// ——— Editar ———

/** The id of the topmost empty Array whose shell (the box right of the index) holds the point, or undefined. */
function emptyShellAt(g, pt) {
  const holders = g.nodos.filter((n) => n.panel && isEmptyArrayShell(n) && CONTROLES[n.tipo]?.array).filter((n) => {
    const box = caja(n);
    return pt.x >= box.x + box.casilla && pt.x < box.x + box.ancho && pt.y >= box.y && pt.y < box.y + box.alto;
  });
  return holders.at(-1)?.id;
}

/** Un control cogido de la paleta cuelga del cursor por el centro de su casilla, como en el vídeo. */
function esquina(bloque, pt, config) {
  const k = cajaObjeto(bloque, 0, 0, config);
  // Un booleano cuelga por el centro de su dibujo.
  const mitad = estiloDe(bloque, config) || CONTROLES[bloque]?.cadena || CONTROLES[bloque]?.array || CONTROLES[bloque]?.grafico || claseError(bloque, config) ? k.ancho / 2 : k.casilla + MEDIDAS_PANEL.casilla / 2;
  return { x: Math.round(pt.x - mitad), y: Math.round(pt.y - k.alto / 2) };
}

/** Coger un control de la paleta: queda colgando del cursor hasta soltarlo en el panel. */
export const coger = (p, bloque, config) => ({ ...p, accion: { tipo: "colocar", bloque, config }, edicion: null, menu: null });

/**
 * Soltar el control cogido: se crea con su terminal en el diagrama y su
 * etiqueta queda escrita y seleccionada, lista para cambiarla, como en el vídeo.
 * The object exists from this moment; the typing only changes its label
 * (`edicion.nuevo`: the editor closes the step of undo before it).
 */
function colocar(p, ctx, pt) {
  const { bloque, config } = p.accion;
  const shellId = emptyShellAt(p.g, pt);
  const element = shellId && panelArrayFromElement(bloque, config);
  if (element) return { ...p, g: typeEmptyArray(p.g, shellId, element.elementType, element.block), seleccion: [shellId], accion: null, edicion: null };
  const { x, y } = esquina(bloque, pt, config);
  const { g, id } = Gr.crearEnPanel(p.g, ctx.cat, bloque, x, y, etiquetaNueva(bloque, config), config);
  const n = g.nodos.find((m) => m.id === id);
  return { ...p, g, seleccion: [], accion: null, edicion: { ...Et.editar(n), nuevo: true } };
}

/**
 * Pulsar el botón principal en el panel. `sobre`: `{ tipo: "objeto", id }`,
 * `{ tipo: "etiqueta", id }` o `{ tipo: "fondo" }`; `pt`, el punto en el lienzo.
 */
export function pulsar(p, ctx, sobre, pt, shift = false, duplicate = false) {
  // Pulsar fuera de la etiqueta en la que se escribe confirma lo escrito, y
  // nada más.
  const enLoQueSeEscribe = sobre.id === p.edicion?.nodo && (p.edicion?.valor ? (sobre.tipo === "elem" && sobre.k === p.edicion.elem) || (sobre.tipo === "casilla" && !p.edicion.campo && p.edicion.elem === undefined) || (sobre.tipo === "campo" && sobre.campo === p.edicion.campo) : sobre.tipo === "etiqueta");
  // Pulsar fuera de lo que se escribe lo confirma, y nada más, como en el vídeo.
  if (p.edicion && !enLoQueSeEscribe) return confirmar(p);
  if (p.edicion) return p;
  if (p.accion?.tipo === "colocar") return colocar(p, ctx, pt);
  const elegir = (id) => {
    const ya = p.seleccion.includes(id);
    return shift ? (ya ? p.seleccion.filter((s) => s !== id) : [...p.seleccion, id]) : ya ? p.seleccion : [id];
  };
  // Un campo de un control de error: el status se alterna con un clic y code y source se escriben
  // (labview-captures/errores/35.png). En un indicador, el campo es el objeto.
  if (sobre.tipo === "campo") {
    const nodo = p.g.nodos.find((m) => m.id === sobre.id);
    if (!claseError(nodo?.tipo, nodo?.config)?.control) return pulsar(p, ctx, { tipo: "objeto", id: sobre.id }, pt, shift);
    if (sobre.campo === "status") return { ...p, g: CV.setCurrentValue(p.g, nodo.id, { ...valorError(nodo, p.valores), status: !valorError(nodo, p.valores).status }) };
    return editarValor(p, ctx, sobre.id, false, sobre.campo);
  }
  // Las flechas del incrementador suman o restan 1 por clic, como en LabVIEW; en un array, mueven el índice.
  if (sobre.tipo === "paso") return { ...p, g: esArrayPanel(p.g.nodos.find((m) => m.id === sobre.id)) ? pasoIndice(p.g, sobre.id, sobre.paso, sobre.eje) : pasoValor(p.g, sobre.id, sobre.paso) };
  // Un elemento de un array de control se escribe; la asa de la caja la estira.
  if (sobre.tipo === "elem") {
    const nodo = p.g.nodos.find((m) => m.id === sobre.id);
    return CONTROLES[nodo?.tipo]?.control && !isUndefinedArray(nodo.config?.type) ? editarElemento(p, ctx, sobre.id, sobre.k, false) : pulsar(p, ctx, { tipo: "objeto", id: sobre.id }, pt, shift);
  }
  if (sobre.tipo === "asa-array") {
    const nodo = p.g.nodos.find((m) => m.id === sobre.id);
    if (isUndefinedArray(nodo.config?.type)) return p;
    const [pasoAncho, pasoAlto] = dimensionsOfNode(nodo.config) === 2 ? pasoCeldas2D(tipoElemento(nodo)) : [elementSize1D(tipoElemento(nodo), CONTROLES[nodo.tipo].control)[0], 0];
    return { ...p, accion: { tipo: "estirar-array", nodo: sobre.id, lado: sobre.lado ?? "derecha", x0: pt.x, y0: pt.y, visibles0: visibleGrid(nodo.config), pasoAncho, pasoAlto } };
  }
  // A click in a control's value box types in it, with the caret at the end; its outer band moves it, and
  // so does all of it once the control is selected (2026-10-18-numeric-hover-selected.md §3).
  const n = p.g.nodos.find((m) => m.id === sobre.id);
  if (sobre.tipo === "casilla" && typesInValueBox(n) && !p.seleccion.includes(n.id) && !isInMoveBand(caja(n), pt)) return editarValor(p, ctx, sobre.id, false);
  if (sobre.tipo === "objeto" || sobre.tipo === "casilla") return { ...p, seleccion: elegir(sobre.id), accion: { tipo: "mover", x: pt.x, y: pt.y, nodo: sobre.id, movido: false, ...(duplicate ? { duplicar: true } : {}) } };
  // The label of a selected object carries the object with it; otherwise it moves alone.
  if (sobre.tipo === "etiqueta" && !shift && p.seleccion.includes(sobre.id)) return { ...p, accion: { tipo: "mover", x: pt.x, y: pt.y, nodo: sobre.id, movido: false, byLabel: true } };
  if (sobre.tipo === "etiqueta") return { ...p, seleccion: elegir(idEtiqueta(sobre.id)), accion: { tipo: "etiqueta", nodo: sobre.id, x: pt.x, y: pt.y } };
  return { ...p, seleccion: shift ? p.seleccion : [], accion: { tipo: "rectangulo", x0: pt.x, y0: pt.y, x1: pt.x, y1: pt.y, base: shift ? p.seleccion : [] } };
}

/** El ratón se mueve por el lienzo con el botón pulsado o con algo a medias. */
export function moverA(p, ctx, pt) {
  const { accion } = p;
  if (!accion) return p;
  switch (accion.tipo) {
    case "colocar":
      return { ...p, accion: { ...accion, ...esquina(accion.bloque, pt, accion.config), arrastrado: true } };
    case "mover": {
      const [dx, dy] = [Math.round(pt.x - accion.x), Math.round(pt.y - accion.y)];
      if (!dx && !dy) return p;
      // Ctrl+drag: the first move leaves the originals and carries numbered copies (REPORT.md §C).
      const dragged = accion.duplicar && !accion.duplicado ? duplicarSeleccion(p) : p;
      // Mover un objeto se lleva su etiqueta; una etiqueta seleccionada sola se mueve sola.
      const nodos = dragged.seleccion.filter((id) => !esEtiqueta(id));
      let g = Gr.moverEnPanel(dragged.g, nodos, dx, dy);
      for (const id of dragged.seleccion.filter(esEtiqueta)) {
        const nodo = nodoDeEtiqueta(id);
        if (!nodos.includes(nodo)) g = moverEtiqueta(g, ctx, nodo, dx, dy);
      }
      return { ...dragged, g, accion: { ...accion, x: accion.x + dx, y: accion.y + dy, movido: true, ...(accion.duplicar ? { duplicado: true } : {}) } };
    }
    case "etiqueta": {
      const [dx, dy] = [Math.round(pt.x - accion.x), Math.round(pt.y - accion.y)];
      if (!dx && !dy) return p;
      return { ...p, g: moverEtiqueta(p.g, ctx, accion.nodo, dx, dy), accion: { ...accion, x: accion.x + dx, y: accion.y + dy } };
    }
    case "rectangulo":
      return { ...p, accion: { ...accion, x1: pt.x, y1: pt.y } };
    case "estirar-array":
      return { ...p, g: Gr.fijarConfig(p.g, accion.nodo, estirarArray(p.g.nodos.find((m) => m.id === accion.nodo), accion, pt)) };
    default:
      return p;
  }
}

/**
 * The copies Ctrl+drag carries: the selected objects, copied in place with
 * numbered labels and, on the diagram, their terminals a little down and to
 * the right of the originals' (where LabVIEW puts them is unverified).
 */
function duplicarSeleccion(p) {
  const ids = p.seleccion.filter((id) => !esEtiqueta(id) && p.g.nodos.some((n) => n.id === id && n.panel));
  if (!ids.length) return p;
  const pasted = pasteFragment(p.g, { ...copyFragment(p.g, ids), wires: [] }, { dx: REPEATED_PASTE_STEP, dy: REPEATED_PASTE_STEP, panelDx: 0, panelDy: 0 });
  return { ...p, g: pasted.g, seleccion: pasted.ids };
}

function moverEtiqueta(g, ctx, id, dx, dy) {
  const n = g.nodos.find((m) => m.id === id);
  const k = cajaEtiqueta(n, ctx.medir);
  return Gr.fijarSitioEtiqueta(g, id, "panel", k.dx + dx, k.dy + dy);
}

/** Lo que toca un rectángulo: objetos y etiquetas, para seleccionar arrastrando por el fondo. */
function dentroDe(p, ctx, r) {
  const [x0, x1] = [Math.min(r.x0, r.x1), Math.max(r.x0, r.x1)];
  const [y0, y1] = [Math.min(r.y0, r.y1), Math.max(r.y0, r.y1)];
  const toca = (k) => k.x < x1 && k.x + k.ancho > x0 && k.y < y1 && k.y + k.alto > y0;
  const ids = [];
  for (const n of objetos(p.g)) {
    if (toca(caja(n))) ids.push(n.id);
    else if (labelShown(n) && toca(cajaEtiqueta(n, ctx.medir))) ids.push(idEtiqueta(n.id));
  }
  return ids;
}

/** Soltar el botón. */
export function soltar(p, ctx, sobre, pt) {
  const { accion } = p;
  if (!accion) return p;
  switch (accion.tipo) {
    case "colocar":
      // Arrastrado desde la paleta hasta el lienzo: se coloca al soltar. Si
      // sólo se pulsó, sigue colgando del cursor hasta el siguiente clic.
      return accion.arrastrado && sobre ? colocar(p, ctx, pt) : p;
    case "rectangulo":
      return { ...p, seleccion: [...new Set([...accion.base, ...dentroDe(p, ctx, accion)])], accion: null };
    case "mover": {
      // Pulsar un control booleano sin arrastrarlo cambia su valor (Switch When
      // Pressed, la acción mecánica de fábrica de los interruptores).
      const n = p.g.nodos.find((m) => m.id === accion.nodo);
      const toggles = n?.tipo === "bool-control" && !accion.movido && !accion.byLabel;
      return { ...p, g: toggles ? alternar(p.g, n) : p.g, accion: null };
    }
    default:
      return { ...p, accion: null };
  }
}

/** El valor de un control booleano pasa de TRUE a FALSE y al revés. */
const alternar = (g, n) => CV.setCurrentValue(g, n.id, !valorActual(n));

/** El menú de clic derecho de un objeto del panel, en el inventario; los numéricos aún no están capturados. */
export function menuDe(n, onElement = false) {
  // An array control (labview-captures/array-2d/panel-array-menu-index.png), the same for the indicator (measured, array-typing/). Its typed
  // ELEMENT has a menu of its own; the index and the margin of the shell keep the array's.
  if (n.tipo === "arr-control" || n.tipo === "arr-indicator") return (onElement && elementMenuRoot(n)) || "context.panel-array";
  // A graph's menu, with its settings (labview-captures/graphs/10..45); the same root in Run mode is another one (graph-menus.mjs).
  if (isGraph(n)) return `context.${n.tipo}`;
  // An enum control or indicator has its own menus, measured (DT-049).
  if (esEnum(n.config?.type) && (n.tipo === "control" || n.tipo === "indicator")) return n.tipo === "control" ? "context.enum-control" : "context.enum-indicator";
  if (n.tipo === "bool-control") return "context.boolean-control";
  if (n.tipo === "bool-indicator") return "context.boolean-indicator";
  return null;
}

// ——— Escribir en una etiqueta ———

/** Doble clic en una etiqueta: se escribe en ella, con todo el texto seleccionado. */
export function editar(p, id) {
  const n = p.g.nodos.find((m) => m.id === id);
  return n ? { ...p, edicion: Et.editar(n), seleccion: [], accion: null } : p;
}

export const teclear = (p, tecla) => {
  if (!p.edicion) return p;
  // En la casilla de un control numérico Intro no baja de línea: confirma. En la de
  // uno de cadena sí baja, y se confirma con Enter Text o con un clic fuera.
  if (p.edicion.valor && !p.edicion.cadena && tecla === "Enter") return confirmar(p);
  return { ...p, edicion: Et.teclear(p.edicion, tecla) };
};

/**
 * Escribir en la casilla de un control: con un clic, el cursor al final de lo
 * que hay; con doble clic, todo seleccionado.
 */
export function editarValor(p, ctx, id, todo, campo) {
  const n = p.g.nodos.find((m) => m.id === id);
  // En un control de error se escribe en code (un número) o en source (varias líneas; Ctrl+Intro confirma).
  if (n && campo) return { ...p, edicion: { nodo: id, valor: true, campo, texto: String(valorError(n, p.valores)[campo]), todo, ...(campo === "source" ? { cadena: true } : {}) }, seleccion: [], accion: null };
  // `shown` remembers the text the box showed, so that confirming it untouched keeps the value it rounds.
  const shown = n && textoValor(n, ctx, p.valores);
  return n ? { ...p, edicion: { nodo: id, valor: true, texto: shown, shown, todo, ...(esCadena(n) ? { cadena: true } : {}) }, seleccion: [], accion: null } : p;
}

/**
 * Stretching the box of a panel array shows one more column for each cell width dragged to the right and, with two
 * dimensions, one more row for each cell height dragged down (the corner handle does both).
 */
function estirarArray(nodo, accion, pt) {
  const dimensions = dimensionsOfNode(nodo.config);
  const growsColumns = accion.lado === "derecha" || accion.lado === "esquina";
  const growsRows = dimensions === 2 && (accion.lado === "abajo" || accion.lado === "esquina");
  const columns = growsColumns ? accion.visibles0.columns + Math.round((pt.x - accion.x0) / accion.pasoAncho) : accion.visibles0.columns;
  const rows = growsRows ? accion.visibles0.rows + Math.round((pt.y - accion.y0) / accion.pasoAlto) : accion.visibles0.rows;
  return { visibles: visibleSetting(dimensions, Math.max(1, rows), Math.max(1, columns)) };
}

/**
 * Una flecha del índice de un array: baja o sube la primera posición que se ve (nunca por debajo de 0). En uno de dos
 * dimensiones hay un índice por eje ("fila" o "columna").
 */
function pasoIndice(g, id, paso, eje = "columna") {
  const config = g.nodos.find((m) => m.id === id).config;
  const { row, column } = firstShown(config);
  const moved = eje === "fila" ? { row: Math.max(0, row + paso), column } : { row, column: Math.max(0, column + paso) };
  return Gr.fijarConfig(g, id, { indice: indexSetting(dimensionsOfNode(config), moved.row, moved.column) });
}

/** Escribir en un elemento de un array: con un clic, el cursor al final; con doble clic, todo seleccionado. */
export function editarElemento(p, ctx, id, k, todo) {
  const n = p.g.nodos.find((m) => m.id === id);
  if (!n || isUndefinedArray(n.config?.type)) return p;
  const t = tipoElemento(n);
  const dimensions = dimensionsOfNode(n.config);
  const v = readCell(valoresDeArray(n, p.valores), dimensions, k);
  // Un booleano se alterna con el clic, como un interruptor.
  if (t === "boolean") return { ...p, g: CV.setCurrentValue(p.g, id, writeCell(valoresDeArray(n, p.valores), dimensions, k, !v, t)), seleccion: [], accion: null };
  const texto = t === "string" ? String(v ?? "") : formatear(v ?? 0, t, ctx.separador);
  return { ...p, edicion: { nodo: id, valor: true, elem: k, texto, shown: texto, todo, ...(t === "string" ? { cadena: true } : {}) }, seleccion: [], accion: null };
}

/** Una flecha del incrementador: el valor sube o baja 1. */
function pasoValor(g, id, paso) {
  const n = g.nodos.find((m) => m.id === id);
  // The arrows of an enum move to the next or the previous item (whether they wrap around at
  // the ends is unverified; here they stop).
  const items = n.config?.type?.enum;
  if (items) return CV.setCurrentValue(g, id, Math.max(0, Math.min(items.length - 1, (valorActual(n) ?? 0) + paso)));
  return CV.setCurrentValue(g, id, convertirValor((valorActual(n) ?? 0) + paso, tipoDe(n)));
}

/**
 * Confirmar lo escrito (Intro, el botón Enter Text o un clic fuera). Una
 * etiqueta cambia en los dos lienzos; en una casilla, lo que no es un número
 * deja el valor como estaba.
 */
export function confirmar(p) {
  const e = p.edicion;
  if (!e) return p;
  if (!e.valor) return { ...p, g: Gr.fijarEtiqueta(p.g, e.nodo, e.texto), edicion: null };
  // A control shows 6 significant digits: reading back the text it showed would round its value.
  if (e.texto === e.shown) return { ...p, edicion: null };
  // Un elemento de un array: se lleva a su tipo; lo que no vale lo deja como estaba.
  if (e.elem !== undefined) {
    const n = p.g.nodos.find((m) => m.id === e.nodo);
    const t = tipoElemento(n);
    const v = leerElemento(e.texto, t);
    if (v === undefined) return { ...p, edicion: null };
    const { [e.nodo]: _, ...valores } = p.valores ?? {};
    return { ...p, g: CV.setCurrentValue(p.g, e.nodo, writeCell(valoresDeArray(n, p.valores), dimensionsOfNode(n.config), e.elem, v, t)), valores, edicion: null };
  }
  // Un campo de un control de error: code se lleva a I32 y source se guarda tal cual.
  if (e.campo) {
    const n = p.g.nodos.find((m) => m.id === e.nodo);
    const valor = e.campo === "code" ? (() => { const l = leerNumero(e.texto, "i32"); return l && convertirValor(l.valor, "i32"); })() : e.texto;
    if (valor === null || valor === undefined) return { ...p, edicion: null };
    const { [e.nodo]: _, ...valores } = p.valores ?? {};
    return { ...p, g: CV.setCurrentValue(p.g, e.nodo, { ...valorError(n, p.valores), [e.campo]: valor }), valores, edicion: null };
  }
  // Una cadena se guarda tal cual, con sus saltos de línea.
  if (e.cadena) {
    const { [e.nodo]: _, ...valores } = p.valores ?? {};
    return { ...p, g: CV.setCurrentValue(p.g, e.nodo, e.texto), valores, edicion: null };
  }
  const leido = leerNumero(e.texto, "number");
  if (!leido) return { ...p, edicion: null };
  // El tipo de un control no cambia al escribirle: el valor se lleva a su representación.
  const n = p.g.nodos.find((m) => m.id === e.nodo);
  const { [e.nodo]: _, ...valores } = p.valores ?? {};
  return { ...p, g: CV.setCurrentValue(p.g, e.nodo, convertirValor(leido.valor, tipoDe(n))), valores, edicion: null };
}

// ——— Teclado ———

/** Esc deja la etiqueta como estaba o lo que está a medias; si no hay nada, vacía la selección. */
export function escape(p) {
  if (p.menu) return { ...p, menu: null };
  if (p.edicion) return { ...p, edicion: null };
  if (p.accion) return { ...p, accion: null };
  return { ...p, seleccion: [] };
}

/**
 * Supr y Retroceso borran los objetos seleccionados; su terminal se va del diagrama, pero **sus cables se
 * quedan, rotos, con un extremo suelto donde estaba el terminal** (DT-046;
 * labview-captures/create-paste/panel-delete-control-diagram-leaves-broken-wire.png). `placeOf(node, port)`
 * es ese punto del diagrama. Una etiqueta sola no se borra.
 */
export function borrarSeleccion(p, placeOf) {
  const nodos = p.seleccion.filter((id) => !esEtiqueta(id));
  return nodos.length ? { ...p, g: Gr.borrarDejandoCables(p.g, nodos, placeOf), seleccion: [] } : p;
}

/** Las flechas mueven la selección un píxel; con Shift, 8 (spec/05 regla 36). */
export function flecha(p, ctx, tecla, shift) {
  const paso = shift ? 8 : 1;
  const [dx, dy] = { ArrowLeft: [-paso, 0], ArrowRight: [paso, 0], ArrowUp: [0, -paso], ArrowDown: [0, paso] }[tecla] ?? [0, 0];
  if (!p.seleccion.length || (!dx && !dy)) return p;
  const movido = moverA({ ...p, accion: { tipo: "mover", x: 0, y: 0 } }, ctx, { x: dx, y: dy });
  return { ...p, g: movido.g };
}

/** El grafo cambió en la otra ventana: se toma, y lo que ya no existe deja de estar seleccionado. */
export function recibir(p, g) {
  const existe = new Set(g.nodos.map((n) => n.id));
  const seleccion = p.seleccion.filter((id) => existe.has(esEtiqueta(id) ? nodoDeEtiqueta(id) : id));
  const edicion = p.edicion && existe.has(p.edicion.nodo) ? p.edicion : null;
  return { ...p, g, seleccion, edicion, menu: p.menu && existe.has(p.menu.nodo) ? p.menu : null };
}

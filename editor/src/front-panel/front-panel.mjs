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

import * as Et from "../common/labels.mjs";
import { BOOLEANOS, dibujoBooleano, estadoError } from "../common/glyphs.mjs";
import * as Gr from "../../../core/model/graph.mjs";
import { REPEATED_PASTE_STEP } from "../common/paste-memory.mjs";
import { copyFragment, pasteFragment } from "../../../core/model/clipboard.mjs";
import { convertirValor, elementoPorDefecto, formatear, leerElemento, leerNumero } from "../../../core/model/types.mjs";
import { GRAPH_MEASURES, LABEL_PLACEMENT, graphSvg } from "./graph-view.mjs";
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
 * Un array del panel, medido a 1:1 en labview-captures/array/panel-array-1a1.png (con un elemento numérico DBL): el
 * índice, de 41 × 26 px, y la caja de los elementos a su derecha y 3 px más abajo, de 72 × 33 (el elemento, de
 * 67 × 25, con 3 px de bisel a los lados y 4 arriba y abajo). Los otros elementos tienen las medidas de su control.
 */
export const MEDIDAS_ARRAY_PANEL = { indice: 41, altoIndice: 26, bajaCaja: 3, biselX: 3, biselY: 4, numerico: [67, 25], cadena: [100, 24], booleano: [30, 25] };
/**
 * A panel array with two dimensions, measured at 1:1 in labview-captures/array-2d/panel-array-2d-control-empty.png and
 * panel-array-2d-stretched.png: the index column is still 41 px wide but holds two fields, 28 px apart; the box of
 * elements sits at the top right as in 1D and its cells repeat every 65 px across and 26 px down for a numeric
 * element, so the box is 65 × columns + 7 wide and 26 × rows + 5 tall. How the 7 and the 5 split between the sides is
 * unverified, and so is the pitch of string and Boolean elements (taken as the element size less 2 across and plus 1 down).
 */
export const MEDIDAS_ARRAY_PANEL_2D = { pasoIndices: 28, margenIzquierdo: 3, margenDerecho: 4, margenArriba: 3, margenAbajo: 2, bordeCaja: 1, restaPasoAncho: 2, sumaPasoAlto: 1 };
export const tipoElemento = (n) => n.config?.type?.array ?? "number";
/** How many columns an array shows (its elements, for a 1D one). */
export const visiblesPanel = (config) => visibleGrid(config).columns;
/** Lo que mide cada elemento, según su tipo. */
export const medidaElemento = (t) => (t === "string" ? MEDIDAS_ARRAY_PANEL.cadena : t === "boolean" ? MEDIDAS_ARRAY_PANEL.booleano : MEDIDAS_ARRAY_PANEL.numerico);
/** The distance between the cells of a 2D array: across and down. */
export function pasoCeldas2D(t) {
  const [ancho, alto] = medidaElemento(t);
  return [ancho - MEDIDAS_ARRAY_PANEL_2D.restaPasoAncho, alto + MEDIDAS_ARRAY_PANEL_2D.sumaPasoAlto];
}
const esArrayPanel = (n) => !!CONTROLES[n?.tipo]?.array;
/** Los valores de un array del panel: los que le dejó el último Run, si es un indicador (y encajan en sus dimensiones), o los suyos. */
export function valoresDeArray(n, valores) {
  const delRun = valores?.[n.id];
  return delRun && valueFitsDimensions(delRun, dimensionsOfNode(n.config)) ? delRun : n.config?.value ?? [];
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
export const ERROR_VACIO = Object.freeze({ status: false, code: 0, source: "" });
/** La clase de error de un control del panel, o nada si no lo es. */
export const claseError = (tipo, config) => (tipo === "cluster-control" || tipo === "cluster-indicator" ? ERRORES[config?.style] : undefined);
/** El valor de un control de error: el que le dejó el último Run, si es un indicador, o el suyo. */
export const valorError = (n, valores) => ({ ...ERROR_VACIO, ...(valores?.[n.id] ?? n.config?.value) });

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

/** La etiqueta con que nace un control: la de su clase si es booleano, o la del bloque. */
const etiquetaNueva = (tipo, config) => claseError(tipo, config)?.etiqueta ?? estiloDe(tipo, config)?.etiqueta ?? CONTROLES[tipo]?.etiqueta ?? "";

/**
 * Medidas de un control numérico, de numeric-panel.png: la casilla mide
 * 82 × 37 px del vídeo, con un bisel de 6; el incrementador, 24 de ancho, pisa
 * el bisel izquierdo de la casilla. La etiqueta va encima, alineada con la
 * casilla, y su pie queda a 2 px de ella.
 */
export const MEDIDAS_PANEL = { casilla: 55, alto: 25, bisel: 4, incrementador: 16, solape: 4, separacion: 2 };

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
  if (CONTROLES[tipo]?.array && dimensionsOfNode(config) === 2) {
    const [A, B] = [MEDIDAS_ARRAY_PANEL, MEDIDAS_ARRAY_PANEL_2D];
    const [pasoAncho, pasoAlto] = pasoCeldas2D(config?.type?.array ?? "number");
    const { rows, columns } = visibleGrid(config);
    return { x, y, ancho: A.indice + columns * pasoAncho + B.margenIzquierdo + B.margenDerecho, alto: Math.max(B.pasoIndices + A.altoIndice, A.bajaCaja + rows * pasoAlto + B.margenArriba + B.margenAbajo), casilla: A.indice };
  }
  if (CONTROLES[tipo]?.array) {
    const A = MEDIDAS_ARRAY_PANEL;
    const [ew, eh] = medidaElemento(config?.type?.array ?? "number");
    return { x, y, ancho: A.indice + visiblesPanel(config) * ew + 2 * A.biselX, alto: Math.max(A.altoIndice, A.bajaCaja + eh + 2 * A.biselY), casilla: A.indice };
  }
  // A graph is its frame; the legend and the label go above it (graph-view.mjs).
  if (CONTROLES[tipo]?.grafico) return { x, y, ancho: GRAPH_MEASURES[tipo].width, alto: GRAPH_MEASURES[tipo].height, casilla: LABEL_PLACEMENT.indent, separacion: LABEL_PLACEMENT.gap };
  const b = estiloDe(tipo, config);
  if (b) return { x, y, ancho: b.ancho, alto: b.alto, casilla: 0, separacion: SEPARACION_BOOLEANO };
  if (CONTROLES[tipo]?.cadena) return { x, y, ancho: MEDIDAS_CADENA_PANEL.ancho, alto: MEDIDAS_CADENA_PANEL.alto, casilla: 0 };
  const casilla = inicioCasilla(tipo);
  return { x, y, ancho: casilla + M.casilla, alto: M.alto, casilla };
}

export const caja = (n) => cajaObjeto(n.tipo, n.panel.x, n.panel.y, n.config);

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
 * El incrementador: dos flechas en una cápsula gris, a lo alto del objeto. Cada
 * mitad es una flecha que se pulsa (`data-paso`).
 */
const INCREMENTADOR = `<div class="incrementador"><svg viewBox="0 0 16 25" aria-hidden="true"><rect x="1" y="2" width="11" height="21" rx="5.5" fill="#dedede" stroke="#9c9c9c" stroke-width="1"/><polygon points="6.5,5 3.8,10 9.2,10" fill="#7a7a7a"/><polygon points="6.5,20 3.8,15 9.2,15" fill="#7a7a7a"/></svg><div class="flecha-inc" data-paso="1"></div><div class="flecha-inc" data-paso="-1"></div></div>`;

/**
 * El valor de un control o indicador, como lo enseña su casilla: el que le dejó
 * el último Run, si lo hay, o el suyo por defecto.
 */
const esCadena = (n) => !!CONTROLES[n?.tipo]?.cadena;
const tipoDe = (n) => n.config?.type ?? "number";
const textoValor = (n, ctx, valores) => (esCadena(n) ? String(valores?.[n.id] ?? n.config?.value ?? "") : formatear(valores?.[n.id] ?? n.config?.value ?? 0, tipoDe(n), ctx.separador));

/** El valor de un booleano: el que le dejó el último Run, si es un indicador, o el suyo por defecto. */
const encendido = (n, valores) => !!(valores?.[n.id] ?? n.config?.value);

/**
 * Un control o indicador de error: gris con relieve, con sus tres campos. Cada campo lleva
 * `data-campo` para que un clic en el status lo alterne y uno en code o en source escriba en él
 * (sólo en el control). Mientras se escribe, el campo enseña lo escrito.
 */
function objetoError(n, elegido, edicion, valores) {
  const k = caja(n);
  const control = claseError(n.tipo, n.config).control;
  const v = valorError(n, valores);
  const e = edicion?.valor && edicion.nodo === n.id ? edicion : null;
  const texto = (campo, x) => (e?.campo !== campo ? `<span>${esc(x)}</span>` : e.todo ? `<span class="texto-elegido">${esc(e.texto)}</span>` : `<span>${esc(e.texto)}</span><span class="caret"></span>`);
  const flechas = control ? `<span class="ec-flechas"><svg viewBox="0 0 8 14" aria-hidden="true"><polygon points="4,1 7,5.5 1,5.5" fill="#6e6e6e"/><polygon points="4,13 7,8.5 1,8.5" fill="#6e6e6e"/></svg></span>` : "";
  return `<div class="objeto-panel error-cluster ${control ? "control" : "indicador"}${elegido ? " seleccionado" : ""}${e ? " editando-valor" : ""}" data-nodo="${esc(n.id)}" style="left:${px(k.x)};top:${px(k.y)};width:${px(k.ancho)};height:${px(k.alto)}">` +
    `<span class="ec-rotulo" style="left:4px;top:2px">status</span><span class="ec-rotulo" style="left:52px;top:0">code</span>` +
    `<div class="ec-campo ec-estado" data-campo="status" style="left:11px;top:20px">${estadoError(v.status)}</div>` +
    `<div class="ec-campo ec-code" data-campo="code" style="left:52px;top:20px"><span class="prefijo">d</span>${flechas}<span class="valor">${texto("code", String(v.code))}</span></div>` +
    `<span class="ec-rotulo" style="left:6px;top:52px">source</span>` +
    `<div class="ec-campo ec-source" data-campo="source" style="left:5px;top:66px"><span class="valor">${texto("source", v.source)}</span><span class="ec-barra"></span></div>` +
    `</div>`;
}

/** El incrementador de un elemento numérico: sólo el dibujo (no se pulsa: los pasos son los del índice). */
const INCREMENTADOR_DECORADO = INCREMENTADOR.replace(/<div class="flecha-inc"[^>]*><\/div>/g, "");

/** The text of an element of an array of the panel: what is being typed into it, or its value. */
function elementText(lista, address, dimensions, type, ctx, editing) {
  if (editing) return editing.todo ? `<span class="texto-elegido">${esc(editing.texto)}</span>` : `<span>${esc(editing.texto)}</span><span class="caret"></span>`;
  const value = readCell(lista, dimensions, address);
  return `<span>${esc(type === "string" ? String(value ?? "") : type === "boolean" ? (value ? "T" : "F") : formatear(value ?? elementoPorDefecto(type), type, ctx.separador))}</span>`;
}

/**
 * Un array del panel: el índice con su incrementador a la izquierda y, a su derecha, la caja con los elementos que se
 * ven a partir del índice. Los que pasan del final se enseñan en gris, con su valor por defecto. Cada elemento lleva
 * `data-k` (su posición en el array, o "fila,columna" en uno de dos dimensiones) para que un clic escriba en él (sólo en un control).
 */
function objetoArray(n, ctx, elegido, edicion, valores) {
  const k = caja(n);
  const A = MEDIDAS_ARRAY_PANEL;
  const t = tipoElemento(n);
  const control = CONTROLES[n.tipo].control;
  const lista = valoresDeArray(n, valores);
  const dimensions = dimensionsOfNode(n.config);
  const [ew, eh] = medidaElemento(t);
  const first = firstShown(n.config);
  const { rows, columns } = visibleGrid(n.config);
  const e = edicion?.valor && edicion.nodo === n.id && edicion.elem !== undefined ? edicion : null;
  const pitch = dimensions === 2 ? pasoCeldas2D(t) : [ew, eh];
  const celdas = Array.from({ length: rows * columns }, (_, i) => {
    const [row, column] = [Math.floor(i / columns), i % columns];
    const address = cellAddress(dimensions, first.row + row, first.column + column);
    const hay = dimensions === 2 ? isDefined(lista, 2, address) : address < lista.length;
    const editando = e?.elem === address;
    const inc = t !== "string" && t !== "boolean" && control ? INCREMENTADOR_DECORADO : "";
    const ini = inc ? MEDIDAS_PANEL.incrementador - MEDIDAS_PANEL.solape : 0;
    const B = MEDIDAS_ARRAY_PANEL_2D;
    const place = dimensions === 2 ? `position:absolute;left:${px(B.margenIzquierdo - B.bordeCaja + column * pitch[0])};top:${px(B.margenArriba - B.bordeCaja + row * pitch[1])};` : "";
    return `<div class="elem-array${hay ? "" : " vacio"}${control ? "" : " indicador"}${editando ? " editando-valor" : ""}" data-k="${address}" style="${place}width:${px(ew)};height:${px(eh)}">${inc}<div class="casilla-elem${t === "string" ? " cadena" : ""}" style="left:${px(ini)};right:0"><span class="valor">${elementText(lista, address, dimensions, t, ctx, editando ? e : null)}</span></div></div>`;
  }).join("");
  const indexField = (axis, top, position) => `<div class="arr-indice" data-eje="${axis}" style="top:${px(top)};width:${px(A.indice)};height:${px(A.altoIndice)}">${INCREMENTADOR}<div class="arr-campo"><span>${position}</span></div></div>`;
  const indices = dimensions === 2
    ? indexField("fila", 0, first.row) + indexField("columna", MEDIDAS_ARRAY_PANEL_2D.pasoIndices, first.column)
    : indexField("columna", 0, first.column);
  const cajaAlto = dimensions === 2 ? k.alto - A.bajaCaja : eh + 2 * A.biselY;
  const cajaEstilo = dimensions === 2 ? "" : `padding:${A.biselY}px ${A.biselX}px`;
  const asa = (lado, left, top) => `<div class="asa-array" data-asa-array="1" data-lado="${lado}" style="left:${px(left - 3)};top:${px(top - 3)}"></div>`;
  const asas = !elegido ? ""
    : dimensions === 2
      ? asa("derecha", k.ancho, A.bajaCaja + cajaAlto / 2) + asa("abajo", A.indice + (k.ancho - A.indice) / 2, A.bajaCaja + cajaAlto) + asa("esquina", k.ancho, A.bajaCaja + cajaAlto)
      : asa("derecha", k.ancho - 1, A.bajaCaja + cajaAlto / 2);
  return `<div class="objeto-panel array ${control ? "control" : "indicador"}${dimensions === 2 ? " dos-dimensiones" : ""}${elegido ? " seleccionado" : ""}${e ? " editando-valor" : ""}" data-nodo="${esc(n.id)}" style="left:${px(k.x)};top:${px(k.y)};width:${px(k.ancho)};height:${px(k.alto)}">` +
    `${indices}<div class="arr-caja" style="left:${px(A.indice)};top:${px(A.bajaCaja)};width:${px(k.ancho - A.indice)};height:${px(cajaAlto)};${cajaEstilo}">${celdas}</div>${asas}</div>`;
}

/** A graph: its drawing in a box the size of its frame; the legend and the plot swatch are parts of it (`data-parte`) with menus of their own. */
function graphObject(n, ctx, elegido, p, resueltos) {
  const k = caja(n);
  const type = resueltos ? wireTypeOf(p.g, resueltos, n.id) : undefined;
  const drawing = graphSvg(n, { type, value: p.valores?.[n.id], charts: p.charts, separator: ctx.separador });
  return `<div class="objeto-panel grafico${elegido ? " seleccionado" : ""}" data-nodo="${esc(n.id)}" data-grafico="${esc(n.tipo)}" style="left:${px(k.x)};top:${px(k.y)};width:${px(k.ancho)};height:${px(k.alto)}">${drawing}</div>`;
}

function objeto(n, ctx, elegido, edicion, valores) {
  if (esArrayPanel(n)) return objetoArray(n, ctx, elegido, edicion, valores);
  if (claseError(n.tipo, n.config)) return objetoError(n, elegido, edicion, valores);
  const k = caja(n);
  const c = CONTROLES[n.tipo];
  // Un booleano es un dibujo de dos estados, sin casilla.
  if (c?.booleano) {
    const estilo = n.config?.style ?? "push-button";
    return `<div class="objeto-panel booleano${elegido ? " seleccionado" : ""}" data-nodo="${esc(n.id)}" data-estilo="${esc(estilo)}" style="left:${px(k.x)};top:${px(k.y)};width:${px(k.ancho)};height:${px(k.alto)}">${dibujoBooleano(estilo, encendido(n, valores))}</div>`;
  }
  const e = edicion?.valor && edicion.nodo === n.id ? edicion : null;
  // Mientras se escribe en ella, la casilla enseña lo escrito, con el cursor al final o todo seleccionado.
  const valor = e ? (e.todo ? `<span class="texto-elegido">${esc(e.texto)}</span>` : `<span>${esc(e.texto)}</span><span class="caret"></span>`) : `<span>${esc(textoValor(n, ctx, valores))}</span>`;
  const ancho = c?.cadena ? k.ancho : MEDIDAS_PANEL.casilla;
  const casilla = `<div class="casilla${c?.incrementador || n.tipo === "str-control" ? "" : " indicador"}${c?.cadena ? " cadena" : ""}" data-casilla="${esc(n.id)}" style="left:${px(k.casilla)};width:${px(ancho)}"><span class="valor">${valor}</span></div>`;
  return `<div class="objeto-panel${elegido ? " seleccionado" : ""}${e ? " editando-valor" : ""}" data-nodo="${esc(n.id)}" style="left:${px(k.x)};top:${px(k.y)};width:${px(k.ancho)};height:${px(k.alto)}">${c?.incrementador ? INCREMENTADOR : ""}${casilla}</div>`;
}

/**
 * Todo lo que el panel pinta dentro del lienzo. `resueltos`: los tipos del diagrama (`Gr.tipos`), que las gráficas
 * necesitan para saber qué reciben; si no se dan y hay una gráfica, se calculan.
 */
export function contenido(p, ctx, resueltos) {
  const elegidos = new Set(p.seleccion);
  const tipos = resueltos ?? (objetos(p.g).some(isGraph) ? Gr.tipos(p.g, ctx.cat) : undefined);
  let html = "";
  for (const n of objetos(p.g)) {
    html += isGraph(n) ? graphObject(n, ctx, elegidos.has(n.id), p, tipos) : objeto(n, ctx, elegidos.has(n.id), p.edicion, p.valores);
    if (labelShown(n)) html += Et.pintar(n, cajaEtiqueta(n, ctx.medir, p.edicion), { edicion: p.edicion, elegida: elegidos.has(idEtiqueta(n.id)) });
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
 */
function colocar(p, ctx, pt) {
  const { bloque, config } = p.accion;
  const { x, y } = esquina(bloque, pt, config);
  const { g, id } = Gr.crearEnPanel(p.g, ctx.cat, bloque, x, y, etiquetaNueva(bloque, config), config);
  const n = g.nodos.find((m) => m.id === id);
  return { ...p, g, seleccion: [], accion: null, edicion: Et.editar(n) };
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
    if (sobre.campo === "status") return { ...p, g: Gr.fijarValor(p.g, nodo.id, { ...valorError(nodo, p.valores), status: !valorError(nodo, p.valores).status }) };
    return editarValor(p, ctx, sobre.id, false, sobre.campo);
  }
  // Las flechas del incrementador suman o restan 1 por clic, como en LabVIEW; en un array, mueven el índice.
  if (sobre.tipo === "paso") return { ...p, g: esArrayPanel(p.g.nodos.find((m) => m.id === sobre.id)) ? pasoIndice(p.g, sobre.id, sobre.paso, sobre.eje) : pasoValor(p.g, sobre.id, sobre.paso) };
  // Un elemento de un array de control se escribe; la asa de la caja la estira.
  if (sobre.tipo === "elem") {
    const nodo = p.g.nodos.find((m) => m.id === sobre.id);
    return CONTROLES[nodo?.tipo]?.control ? editarElemento(p, ctx, sobre.id, sobre.k, false) : pulsar(p, ctx, { tipo: "objeto", id: sobre.id }, pt, shift);
  }
  if (sobre.tipo === "asa-array") {
    const nodo = p.g.nodos.find((m) => m.id === sobre.id);
    const [pasoAncho, pasoAlto] = dimensionsOfNode(nodo.config) === 2 ? pasoCeldas2D(tipoElemento(nodo)) : [medidaElemento(tipoElemento(nodo))[0], 0];
    return { ...p, accion: { tipo: "estirar-array", nodo: sobre.id, lado: sobre.lado ?? "derecha", x0: pt.x, y0: pt.y, visibles0: visibleGrid(nodo.config), pasoAncho, pasoAlto } };
  }
  // Un clic en la casilla de un control escribe en ella, con el cursor al final.
  const n = p.g.nodos.find((m) => m.id === sobre.id);
  if (sobre.tipo === "casilla" && (CONTROLES[n?.tipo]?.incrementador || n?.tipo === "str-control")) return editarValor(p, ctx, sobre.id, false);
  if (sobre.tipo === "objeto" || sobre.tipo === "casilla") return { ...p, seleccion: elegir(sobre.id), accion: { tipo: "mover", x: pt.x, y: pt.y, nodo: sobre.id, movido: false, ...(duplicate ? { duplicar: true } : {}) } };
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
      return { ...p, g: n?.tipo === "bool-control" && !accion.movido ? alternar(p.g, n) : p.g, accion: null };
    }
    default:
      return { ...p, accion: null };
  }
}

/** El valor de un control booleano pasa de TRUE a FALSE y al revés. */
const alternar = (g, n) => Gr.fijarValor(g, n.id, !n.config?.value);

/** El menú de clic derecho de un objeto del panel, en el inventario; los numéricos aún no están capturados. */
export function menuDe(n) {
  // An array control (labview-captures/array-2d/panel-array-menu-index.png); the indicator's is not captured and is taken as the same.
  if (n.tipo === "arr-control" || n.tipo === "arr-indicator") return "context.panel-array";
  // A graph's menu, with its settings (labview-captures/graphs/10..45); the same root in Run mode is another one (graph-menus.mjs).
  if (isGraph(n)) return `context.${n.tipo}`;
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
  return n ? { ...p, edicion: { nodo: id, valor: true, texto: textoValor(n, ctx, p.valores), todo, ...(esCadena(n) ? { cadena: true } : {}) }, seleccion: [], accion: null } : p;
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
  if (!n) return p;
  const t = tipoElemento(n);
  const dimensions = dimensionsOfNode(n.config);
  const v = readCell(valoresDeArray(n, p.valores), dimensions, k);
  // Un booleano se alterna con el clic, como un interruptor.
  if (t === "boolean") return { ...p, g: Gr.fijarValor(p.g, id, writeCell(valoresDeArray(n, p.valores), dimensions, k, !v, t)), seleccion: [], accion: null };
  const texto = t === "string" ? String(v ?? "") : formatear(v ?? 0, t, ctx.separador);
  return { ...p, edicion: { nodo: id, valor: true, elem: k, texto, todo, ...(t === "string" ? { cadena: true } : {}) }, seleccion: [], accion: null };
}

/** Una flecha del incrementador: el valor sube o baja 1. */
function pasoValor(g, id, paso) {
  const n = g.nodos.find((m) => m.id === id);
  return Gr.fijarValor(g, id, convertirValor((n.config?.value ?? 0) + paso, tipoDe(n)));
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
  // Un elemento de un array: se lleva a su tipo; lo que no vale lo deja como estaba.
  if (e.elem !== undefined) {
    const n = p.g.nodos.find((m) => m.id === e.nodo);
    const t = tipoElemento(n);
    const v = leerElemento(e.texto, t);
    if (v === undefined) return { ...p, edicion: null };
    const { [e.nodo]: _, ...valores } = p.valores ?? {};
    return { ...p, g: Gr.fijarValor(p.g, e.nodo, writeCell(valoresDeArray(n, p.valores), dimensionsOfNode(n.config), e.elem, v, t)), valores, edicion: null };
  }
  // Un campo de un control de error: code se lleva a I32 y source se guarda tal cual.
  if (e.campo) {
    const n = p.g.nodos.find((m) => m.id === e.nodo);
    const valor = e.campo === "code" ? (() => { const l = leerNumero(e.texto, "i32"); return l && convertirValor(l.valor, "i32"); })() : e.texto;
    if (valor === null || valor === undefined) return { ...p, edicion: null };
    const { [e.nodo]: _, ...valores } = p.valores ?? {};
    return { ...p, g: Gr.fijarValor(p.g, e.nodo, { ...valorError(n, p.valores), [e.campo]: valor }), valores, edicion: null };
  }
  // Una cadena se guarda tal cual, con sus saltos de línea.
  if (e.cadena) {
    const { [e.nodo]: _, ...valores } = p.valores ?? {};
    return { ...p, g: Gr.fijarValor(p.g, e.nodo, e.texto), valores, edicion: null };
  }
  const leido = leerNumero(e.texto, "number");
  if (!leido) return { ...p, edicion: null };
  // El tipo de un control no cambia al escribirle: el valor se lleva a su representación.
  const n = p.g.nodos.find((m) => m.id === e.nodo);
  const { [e.nodo]: _, ...valores } = p.valores ?? {};
  return { ...p, g: Gr.fijarValor(p.g, e.nodo, convertirValor(leido.valor, tipoDe(n))), valores, edicion: null };
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

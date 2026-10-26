// Editing the Block Diagram: what each click, move and key does.
//
// Pure functions, like window-state.mjs: they take the diagram state and what
// happened, and return the new state. The window translates DOM events into
// these calls, so spec/05-editor.md is tested without a browser. What they do
// clones the video labview-captures/block-diagram/numeric-cablear.mp4.
//
// The state:
//   g          the graph (core/model/graph.mjs)
//   seleccion  ids of nodes, of whole wires and of wire segments ("c3#1")
//   accion     what is half done:
//     { tipo: "colocar", bloque, x, y, arrastrado }   a block picked from the palette; a
//                                                      structure also carries `esquina`, the first click
//     { tipo: "mover", x, y }                          dragging the selection
//     { tipo: "cablear", desde, x, y, arrastrado }     a wire coming out of a terminal
//     { tipo: "recablear", cable, extremo, x, y }      a wire coming out of the loose end ("de" or "a") of a broken wire
//     { tipo: "tramo", cable, k, x, y }                dragging one segment of a wire
//     { tipo: "rectangulo", x0, y0, x1, y1, base }     selecting by dragging over the background
//     { tipo: "estirar", nodo, lado, x0, y0, g0 }      resizing a node by its handle
//     { tipo: "etiqueta", nodo, x, y }                 dragging a label on its own
//   lista      { nodo, x, y } the drop-down list of a Case's frames, open at the click point
//              (`fila` too in the list of names of an Unbundle By Name: the row it will change)
//   sobre      the node, and terminal, under the mouse: it shows its tips
//   edicion    { nodo, texto, todo } while typing into a constant,
//              { nodo, etiqueta: true, texto, todo } into a node's label, or
//              { nodo, marco: true, texto, todo } into a Case's frame selector
//   menu       { raiz, nodo, puerto, x, y, en, abierto } the right-click menu of a
//              node or one of its terminals; `en`, the canvas point where it was opened
//   aviso      why the last action could not be done (spec/05 rule 31)

import { CONSTANTES, MEDIDAS_ARRAY_2D, MEDIDAS_ARRAY_INDEFINIDA, MEDIDAS_ESTRUCTURA, PANEL_ARRAY_TERMINAL_MENU, PASO_ENTRADAS_DOS_DIMENSIONES, anchoElementoArray, tipoElementoArray, valoresArray, MEDIDAS_SECUENCIA, TAM_BORDE, activoDe, anchoSecuencia, anchosMarcos, borderFaceFor, caja, cajaEtiqueta, codosPorDefecto, dentroDe, esApilada, esBooleano, esBorde, esCase, esEstructura, esFlat, esSecuencia, etiquetaMarco, selectorKind, extremos, visibles, izquierdasMarcos, marcoEnX, marcosDe, medidasCompuesto, moverTramo, rama, terminales } from "./diagram-view.mjs";
import * as FN from "./format-nodes.mjs";
import * as UN from "./unbundle-by-name.mjs";
import * as EI from "./edit-items-dialog.mjs";
import { endPoint } from "./broken-wire.mjs";
import * as CP from "../front-panel/connector-pane.mjs";
import { graphCommand, graphMenuMarks, graphMenuVariants, isGraphMenu } from "../front-panel/graph-menus.mjs";
import * as Et from "../common/labels.mjs";
import * as Gr from "../../../core/model/graph.mjs";
import { pathFromText } from "../../../core/model/paths.mjs";
import * as TC from "./terminal-creation.mjs";
import { copyFragment, pasteFragment } from "../../../core/model/clipboard.mjs";
import { constantElementType, constantForElement, emptyArrayAgain, flipArrayKind, isEmptyArrayShell, setArrayRepresentation, typeEmptyArray } from "../common/array-typing.mjs";
import { CONSTANT_DIGITS, DBL, NUMERICOS, PATH, POR_ABREVIATURA, VISA_RESOURCE, convertirValor, esArray, isUndefinedArray, esEntero, esEnum, esNumerico, formatear, leerElemento, leerNumero } from "../../../core/model/types.mjs";
import * as CV from "../../../core/model/control-values.mjs";
import * as SI from "./select-item-dialog.mjs";
import { MAX_EDITOR_DIMENSIONS, addDimensionPatch, dimensionsOfNode, firstShown, readCell, removeDimensionPatch, visibleGrid, visibleSetting, writeCell } from "../common/array-grid.mjs";

/** El valor de una constante de error: el suyo, con lo que falte a cero. */
const valorConstanteError = (n) => ({ status: false, code: 0, source: "", ...(n.config?.value ?? {}) });

export const inicial = () => ({ g: Gr.nuevo(), seleccion: [], accion: null, aviso: null, sobre: null, edicion: null, menu: null });

/** Cuánto hay que mover el ratón para que una pulsación sea un arrastre. */
const UMBRAL = 3;
/** Un bloque cogido de la paleta cuelga del cursor por esta esquina. */
const AGARRE = { x: 4, y: 4 };
/** The point of a block that hangs from the cursor: Format Into String and Scan From String, their centre (format-scan/31-scan-placed.png). */
const grabPoint = (block, ctx) => {
  if (FN.isFormatNode({ tipo: block }, ctx.cat)) return FN.formatNodeGrabPoint(block, ctx.cat);
  // Unbundle By Name hangs by its centre too (cluster palette, stage 1: dropped at the click, centred).
  return block === UN.BLOCK ? UN.grabPoint(ctx.cat, ctx.medir) : AGARRE;
};

const lejos = (a, p) => Math.abs(p.x - a.x) > UMBRAL || Math.abs(p.y - a.y) > UMBRAL;
const cableDe = (id) => id.split("#")[0];
const esEtiqueta = (id) => id.endsWith("#etiqueta");

/** The selected nodes a copy takes: not the border nodes of a structure (tunnels, shift registers, loop terminals), which only go with theirs. */
export const copyableIds = (d) => d.seleccion.filter((id) => d.g.nodos.some((n) => n.id === id && !esBorde(n)));

/**
 * Ctrl+drag: the selection is copied in place (no wires to what is left out;
 * the controls among it get their own place on the panel) and the copies
 * become the selection, so the drag carries them.
 */
function duplicateSelection(d, ctx) {
  const ids = copyableIds(d);
  if (!ids.length) return d;
  const before = new Set(d.g.nodos.map((n) => n.id));
  const pasted = pasteFragment(d.g, copyFragment(d.g, ids), { panelDx: 0, panelDy: 0 });
  const newIds = pasted.g.nodos.filter((n) => !before.has(n.id)).map((n) => n.id);
  return { ...d, g: TC.placePastedPanelObjects(pasted.g, ctx, newIds, ctx.panelSize), seleccion: pasted.ids };
}

/** The wire that ends at a terminal, if any: its right-click menu is the wire's, not the node's (REPORT.md §A). */
export const wireAtTerminal = (g, nodo, puerto, dir) => g.cables.find((c) => (dir === "in" ? c.a : c.de).nodo === nodo && (dir === "in" ? c.a : c.de).puerto === puerto);

/** Select All (Ctrl+A): every node, and every wire between them. */
export function selectAll(d) {
  const shown = visibles(d.g);
  return { ...d, seleccion: [...shown.nodos.map((n) => n.id), ...shown.cables.map((c) => c.id)], accion: null, menu: null };
}

/**
 * Coger un bloque de la paleta: queda colgando del cursor hasta soltarlo en el
 * diagrama. `config`, la del elemento de la paleta si no es la del catálogo:
 * Compound Arithmetic sale en AND de la paleta Boolean, True Constant vale TRUE.
 */
export const coger = (d, bloque, config) => ({ ...d, accion: { tipo: "colocar", bloque, config }, aviso: null, menu: null });

/** The id of the topmost empty Array Constant whose shell (the box right of the index) holds the point, or undefined. */
function emptyShellAt(g, ctx, p, except = new Set()) {
  const holders = g.nodos.filter((n) => n.tipo === "arr-const" && !except.has(n.id) && isEmptyArrayShell(n)).filter((n) => {
    const k = caja(n, ctx);
    return p.x >= k.x + MEDIDAS_ARRAY_INDEFINIDA.indice && p.x < k.x + k.ancho && p.y >= k.y && p.y < k.y + k.alto;
  });
  return holders.at(-1)?.id;
}

/** A loose constant dragged onto an empty Array Constant nests in it: the constant goes and the array takes its type (its wires, if any, go too: unverified). */
function nestDraggedConstant(d, ctx, p) {
  const [movedId, ...others] = d.seleccion;
  const moved = d.g.nodos.find((n) => n.id === movedId);
  const elementType = !others.length && constantElementType(moved);
  const shellId = elementType && emptyShellAt(d.g, ctx, p, new Set([movedId]));
  if (!shellId) return null;
  return { ...d, g: typeEmptyArray(Gr.borrar(d.g, [movedId]), shellId, elementType), seleccion: [shellId], accion: null };
}

/** The typed Array Constant whose element is being dragged (the press landed on a cell, and nothing else is selected), or undefined. */
function elementPulledFrom(d, accion) {
  if (accion.campo === undefined || accion.duplicar || d.seleccion.length !== 1) return undefined;
  const array = d.g.nodos.find((n) => n.id === d.seleccion[0]);
  const elementType = array?.tipo === "arr-const" && !isUndefinedArray(array.config?.type) ? array.config.type.array : undefined;
  return constantForElement(elementType) ? array : undefined;
}

/**
 * Releasing a dragged element outside its constant leaves the constant empty again, its value lost and its wires
 * kept, and puts a loose constant of the element's type where it was released; inside it, nothing changes
 * (labview-captures/reports/2026-10-18-array-typing-stage2.md, Q5d). The loose constant takes the value of the element
 * (unverified: LabVIEW's was not looked at).
 */
function pullElementOut(d, ctx, p) {
  const array = elementPulledFrom(d, d.accion);
  const box = caja(array, ctx);
  const inside = p.x >= box.x && p.x < box.x + box.ancho && p.y >= box.y && p.y < box.y + box.alto;
  if (inside) return { ...d, accion: null };
  const value = readCell(valoresArray(array), dimensionsOfNode(array.config), d.accion.campo);
  const { block, config } = constantForElement(array.config.type.array, value);
  const grab = grabPoint(block, ctx);
  const created = Gr.crearNodo(emptyArrayAgain(d.g, array.id), ctx.cat, block, Math.round(p.x - grab.x), Math.round(p.y - grab.y));
  const looseId = created.id;
  const loose = Gr.fijarConfig(created.g, looseId, config);
  return { ...d, g: alojar(loose, ctx, [looseId]), seleccion: [looseId], accion: null };
}

function colocar(d, ctx, p) {
  const grab = grabPoint(d.accion.bloque, ctx);
  let { g, id } = Gr.crearNodo(d.g, ctx.cat, d.accion.bloque, Math.round(p.x - grab.x), Math.round(p.y - grab.y));
  if (d.accion.config) g = Gr.fijarConfig(g, id, d.accion.config);
  // Dropped into an empty Array Constant, the constant types it instead of staying loose (DT-060).
  const shellId = emptyShellAt(g, ctx, p, new Set([id]));
  const elementType = shellId && constantElementType(g.nodos.find((n) => n.id === id));
  if (elementType) return { ...d, g: typeEmptyArray(d.g, shellId, elementType), seleccion: [shellId], accion: null, aviso: null };
  // Soltarlo dentro de un bucle lo mete en él (DT-041).
  // Una constante de cadena recién soltada queda lista para escribir en ella (bd-string-constant-editando.png);
  // una de enum, con el editor en el nombre de su único ítem, que nace vacío (DT-049, medido).
  const bloque = CONSTANTES[d.accion.bloque];
  const escribir = bloque?.editable && bloque.cadena ? { nodo: id, texto: "", todo: false, cadena: true, nuevo: true } : d.accion.bloque === "enum-const" ? { nodo: id, texto: "", todo: false, item: true, nuevo: true } : d.edicion;
  return { ...d, g: alojar(g, ctx, [id]), seleccion: [id], accion: null, aviso: null, edicion: escribir };
}

// ——— Estructuras: While Loop y For Loop (DT-041, M4) ———

/** La estructura más pequeña que contiene el centro de una caja, sin contar las `excluir`; su id, o nada. */
function estructuraEn(g, ctx, k, excluir) {
  const [cx, cy] = [k.x + k.ancho / 2, k.y + k.alto / 2];
  let mejor;
  for (const s of g.nodos) {
    if (!esEstructura(s, ctx) || excluir.has(s.id)) continue;
    if (cx <= s.x || cx >= s.x + s.tam.ancho || cy <= s.y || cy >= s.y + s.tam.alto) continue;
    if (!mejor || s.tam.ancho * s.tam.alto < mejor.tam.ancho * mejor.tam.alto) mejor = s;
  }
  return mejor?.id;
}

/**
 * Pone los nodos del borde de cada estructura en su sitio: «i» y la condición
 * abajo, a 10 px de la izquierda y a 26 de la derecha; «N» en la esquina; los
 * túneles y los shift registers pegados a su lado, a la altura que tengan
 * (dentro del marco). Es lo que hace que sigan al borde al mover y al estirar.
 */
export function fijarBordes(g, cat) {
  const M = MEDIDAS_ESTRUCTURA;
  let cambia = false;
  const nodos = g.nodos.map((n) => {
    if (!esBorde(n)) return n;
    const s = g.nodos.find((k) => k.id === n.dentro);
    if (!s?.tam) return n;
    const [w, h] = TAM_BORDE[n.tipo];
    const { ancho, alto } = s.tam;
    const banda = esSecuencia(s) ? MEDIDAS_SECUENCIA.banda : M.borde;
    const y = Math.min(Math.max(n.y, s.y + banda), s.y + alto - banda - h);
    const [x1, y1] = {
      "loop-iteration": [s.x + M.izquierdaI, s.y + alto - M.sobreElPie],
      "loop-condition": [s.x + ancho - M.sobreElPie, s.y + alto - M.sobreElPie],
      "loop-count": [s.x, s.y],
      "tunnel-in": [s.x, y],
      "tunnel-out": [s.x + ancho - w, y],
      "shift-register-left": [s.x, y],
      "shift-register-right": [s.x + ancho - w, y],
      "case-tunnel-out": [s.x + ancho - w, y],
      // El terminal selector: su base, en la mitad del lado izquierdo (structures/case-1.png).
      "case-selector": [s.x, s.y + Math.floor(alto / 2) - h],
    }[n.tipo];
    if (x1 === n.x && y1 === n.y) return n;
    cambia = true;
    return { ...n, x: x1, y: y1 };
  });
  return cambia ? { ...g, nodos } : g;
}

/**
 * Los tipos de nodo de un grafo recién cambiado se reparten entre ámbitos: lo
 * que ha quedado dentro o fuera de un bucle se mete o se saca (`ids` son los
 * movidos o recién puestos), los túneles que ya no hacen falta se quitan y los
 * cables que cruzan un borde sin túnel lo reciben, como en LabVIEW.
 */
export function alojar(g, ctx, ids) {
  const elegidos = new Set(ids);
  const raices = ids.filter((id) => {
    for (let a = g.nodos.find((k) => k.id === id)?.dentro; a; a = g.nodos.find((k) => k.id === a)?.dentro) if (elegidos.has(a)) return false;
    return true;
  });
  for (const id of raices) {
    const n = g.nodos.find((k) => k.id === id);
    if (!n || esBorde(n)) continue;
    const k = caja(n, ctx);
    const destino = estructuraEn(g, ctx, k, Gr.conContenido(g, [id]));
    // En una Flat Sequence cae en el marco que tiene debajo; en las demás, en el que se ve.
    const s = destino && g.nodos.find((x) => x.id === destino);
    const marco = s && esFlat(s) ? marcoEnX(s, k.x + k.ancho / 2) : undefined;
    if (destino !== n.dentro || (marco !== undefined && marco !== n.marco)) g = Gr.meter(g, ctx.cat, [id], destino, marco);
  }
  return reparar(g, ctx);
}

/** Túneles que sobran, cables sin túnel y bordes en su sitio. */
function reparar(g, ctx) {
  return fijarBordes(cruzarCables(colapsarTuneles(limpiarSecuencias(ajustarSecuencias(g), ctx), ctx), ctx), ctx.cat);
}

/**
 * Una Flat Sequence mide lo que sus marcos: cada marco guarda su ancho (no menos
 * de 38) y la estructura, la suma de todos con los bordes y los separadores.
 */
function ajustarSecuencias(g) {
  let cambia = false;
  const nodos = g.nodos.map((n) => {
    if (!esFlat(n)) return n;
    const anchos = anchosMarcos(n).map((a) => Math.max(MEDIDAS_SECUENCIA.marcoMinimo, a));
    const ancho = anchoSecuencia(anchos);
    if (n.tam.ancho === ancho && !("activo" in (n.config ?? {})) && marcosDe(n).every((m, k) => m.ancho === anchos[k])) return n;
    cambia = true;
    // Una Flat enseña todos sus marcos: no tiene marco activo.
    const { activo, ...config } = n.config ?? {};
    return { ...n, tam: { ...n.tam, ancho }, config: { ...config, marcos: marcosDe(n).map((m, k) => ({ ...m, ancho: anchos[k] })) } };
  });
  return cambia ? { ...g, nodos } : g;
}

/** Un cable de un marco de una secuencia a uno anterior no existe: un nodo que cambia de marco lo pierde. */
function limpiarSecuencias(g, ctx) {
  const { cat } = ctx;
  const malos = new Set(
    g.cables
      .filter(Gr.conectado)
      .filter((c) => {
        const ambito = Gr.ambitoDe(g, cat, c.de.nodo, c.de.puerto, "out");
        if (ambito !== Gr.ambitoDe(g, cat, c.a.nodo, c.a.puerto, "in") || !Gr.esSecuencia(nodoPor(g, ambito))) return false;
        const [m1, m2] = [Gr.marcoDe(g, cat, c.de.nodo, c.de.puerto, "out"), Gr.marcoDe(g, cat, c.a.nodo, c.a.puerto, "in")];
        return m1 !== undefined && m2 !== undefined && m1 > m2;
      })
      .map((c) => c.id),
  );
  return malos.size ? { ...g, cables: g.cables.filter((c) => !malos.has(c.id)) } : g;
}

/** Un túnel cuyo origen y destinos ya están en el mismo ámbito no hace falta: se quita y se cablea directo. */
function colapsarTuneles(g, ctx) {
  const { cat } = ctx;
  for (let cambio = true; cambio; ) {
    cambio = false;
    for (const t of g.nodos) {
      if (t.tipo !== "tunnel-in" && t.tipo !== "tunnel-out") continue;
      const entra = g.cables.filter(Gr.conectado).find((c) => c.a.nodo === t.id);
      const salen = g.cables.filter(Gr.conectado).filter((c) => c.de.nodo === t.id);
      if (!entra || !salen.length) continue;
      const ambito = Gr.ambitoDe(g, cat, entra.de.nodo, entra.de.puerto, "out");
      if (!salen.every((c) => Gr.ambitoDe(g, cat, c.a.nodo, c.a.puerto, "in") === ambito)) continue;
      let r = Gr.borrar(g, [t.id]);
      for (const c of salen) {
        const h = Gr.conectar(r, cat, { ...entra.de, dir: "out" }, { ...c.a, dir: "in" });
        if (!h.motivo) r = h.g;
      }
      g = r;
      cambio = true;
      break;
    }
  }
  return g;
}

/** Un cable que une dos ámbitos distintos se rehace pasando por los túneles de cada borde que cruza. */
function cruzarCables(g, ctx) {
  const { cat } = ctx;
  for (const c of [...g.cables]) {
    if (!Gr.conectado(c) || !g.cables.some((k) => k.id === c.id)) continue;
    const [t1, t2] = [{ nodo: c.de.nodo, puerto: c.de.puerto, dir: "out" }, { nodo: c.a.nodo, puerto: c.a.puerto, dir: "in" }];
    if (Gr.ambitoDe(g, cat, t1.nodo, t1.puerto, "out") === Gr.ambitoDe(g, cat, t2.nodo, t2.puerto, "in")) continue;
    const sin = { ...g, cables: g.cables.filter((k) => k.id !== c.id) };
    const r = Gr.conectarCruzando(sin, cat, t1, t2);
    g = r.motivo ? sin : afinarTuneles(sin, r.g, ctx, t1, t2);
  }
  return g;
}

/**
 * Los túneles nuevos de un cable que cruza bordes se ponen a la altura del
 * terminal de su lado de dentro: el de salida, a la del origen y el de entrada,
 * a la del destino, como en LabVIEW (structures/tunel-entrada.png).
 */
function afinarTuneles(g0, g1, ctx, de, a) {
  const antes = new Set(g0.nodos.map((n) => n.id));
  const alto = (n, puerto) => terminales(n, ctx).find((t) => t.puerto === puerto).y;
  const [nDe, nA] = [g1.nodos.find((n) => n.id === de.nodo), g1.nodos.find((n) => n.id === a.nodo)];
  const nodos = g1.nodos.map((n) => {
    if (antes.has(n.id)) return n;
    if (n.tipo === "tunnel-out" || n.tipo === "case-tunnel-out") return { ...n, y: Math.round(alto(nDe, de.puerto) - TAM_BORDE[n.tipo][1] / 2) };
    if (n.tipo === "tunnel-in") return { ...n, y: Math.round(alto(nA, a.puerto) - TAM_BORDE[n.tipo][1] / 2) };
    return n;
  });
  const placed = fijarBordes({ ...g1, nodos }, ctx.cat);
  return fijarBordes(clearOtherBorderObjects(placed, nodos.filter((n) => !antes.has(n.id) && esBorde(n)).map((n) => n.id)), ctx.cat);
}

/** Free space left between a new tunnel and the border object it was moved off. */
const BORDER_OBJECT_GAP = 2;

/**
 * A new tunnel that would sit on top of another object of the same border (a shift register, a
 * tunnel) moves down just past it, or up when there is no room below (real-programs-0.3.md B5:
 * it hid a shift register's terminal). Where LabVIEW puts it is unverified; it never overlaps.
 */
function clearOtherBorderObjects(g, newIds) {
  let nodos = g.nodos;
  for (const id of newIds) {
    const tunnel = nodos.find((n) => n.id === id);
    const [, height] = TAM_BORDE[tunnel.tipo];
    const structure = nodos.find((n) => n.id === tunnel.dentro);
    // Border objects of different widths sit flush with the same border, so the side is told by the centre.
    const onRightSide = (n) => n.x + TAM_BORDE[n.tipo][0] / 2 > structure.x + (structure.tam?.ancho ?? 0) / 2;
    const others = nodos.filter((n) => n.id !== id && n.dentro === tunnel.dentro && esBorde(n) && onRightSide(n) === onRightSide(tunnel));
    const heightOf = (other) => TAM_BORDE[other.tipo][1];
    const covers = (y, other) => y < other.y + heightOf(other) && other.y < y + height;
    let y = tunnel.y;
    for (const other of [...others].sort((first, second) => first.y - second.y)) {
      if (covers(y, other)) y = other.y + heightOf(other) + BORDER_OBJECT_GAP;
    }
    if (structure?.tam && y > structure.y + structure.tam.alto - height) {
      y = tunnel.y;
      for (const other of [...others].sort((first, second) => second.y - first.y)) {
        if (covers(y, other)) y = other.y - height - BORDER_OBJECT_GAP;
      }
    }
    nodos = nodos.map((n) => (n.id === id ? { ...n, y } : n));
  }
  return { ...g, nodos };
}

/** Une dos terminales: un cable normal, o el que pasa por los túneles de los bordes que cruza. */
function unir(g, ctx, t1, t2, codos) {
  const { cat } = ctx;
  const cruza = t1.dir !== t2.dir && Gr.ambitoDe(g, cat, t1.nodo, t1.puerto, t1.dir) !== Gr.ambitoDe(g, cat, t2.nodo, t2.puerto, t2.dir);
  if (!cruza) return Gr.conectar(g, cat, t1, t2, codos);
  const [de, a] = t1.dir === "out" ? [t1, t2] : [t2, t1];
  const r = Gr.conectarCruzando(g, cat, t1, t2);
  if (r.motivo) return { g, motivo: r.motivo };
  return { g: afinarTuneles(g, r.g, ctx, de, a), id: r.ids.at(-1) };
}

/**
 * Colocar una estructura: el primer clic fija una esquina y el segundo (o soltar
 * tras arrastrar) la opuesta. Un clic sin mover deja el tamaño mínimo, centrado
 * en el clic (structures/minimo-while.png). Lo que queda rodeado entra.
 */
function ponerEstructura(d, ctx, a, b) {
  const M = MEDIDAS_ESTRUCTURA;
  let [x, y] = [Math.min(a.x, b.x), Math.min(a.y, b.y)];
  let [ancho, alto] = [Math.abs(b.x - a.x), Math.abs(b.y - a.y)];
  // Un rectángulo menor que el mínimo se agranda sobre su centro: un clic deja 48 × 48 centrado en él
  // (structures/minimo-*.png y, en el Case, case-minimo2.png).
  if (ancho < M.minimo) [x, ancho] = [x + ancho / 2 - M.minimo / 2, M.minimo];
  if (alto < M.minimo) [y, alto] = [y + alto / 2 - M.minimo / 2, M.minimo];
  [ancho, alto] = [Math.max(M.minimo, ancho), Math.max(M.minimo, alto)];
  [x, y, ancho, alto] = [x, y, ancho, alto].map(Math.round);
  const r = Gr.crearEstructura(d.g, ctx.cat, d.accion.bloque, x, y, ancho, alto);
  let g = fijarBordes(r.g, ctx.cat);
  const destino = estructuraEn(g, ctx, { x, y, ancho, alto }, new Set([r.id]));
  if (destino) g = Gr.meter(g, ctx.cat, [r.id], destino);
  const dentro = (n) => {
    const k = caja(n, ctx);
    return k.x >= x && k.y >= y && k.x + k.ancho <= x + ancho && k.y + k.alto <= y + alto;
  };
  const rodeados = g.nodos.filter((n) => n.id !== r.id && !esBorde(n) && n.dentro === destino && dentro(n)).map((n) => n.id);
  if (rodeados.length) g = Gr.meter(g, ctx.cat, rodeados, r.id);
  return { ...d, g: reparar(g, ctx), seleccion: [], accion: null, aviso: null };
}

function pulsarEstructura(d, ctx, p) {
  const { accion } = d;
  if (accion.esquina) return ponerEstructura(d, ctx, accion.esquina, p);
  return { ...d, accion: { ...accion, esquina: { x: p.x, y: p.y }, x: p.x, y: p.y, arrastrado: false }, aviso: null };
}

/**
 * Mover nodos. Una estructura se lleva lo de dentro; los túneles y los shift
 * registers sueltos sólo resbalan por su borde; los terminales de «i», la
 * condición y la cuenta no se mueven.
 */
function desplazar(g, ctx, ids, dx, dy) {
  const nodos = (id) => g.nodos.find((n) => n.id === id);
  const resto = ids.filter((id) => !esBorde(nodos(id)));
  const llevados = Gr.conContenido(g, resto);
  let r = Gr.mover(g, resto, dx, dy);
  for (const id of ids) {
    const n = nodos(id);
    if (!esBorde(n) || llevados.has(id) || n.tipo.startsWith("loop-") || n.tipo === "case-selector") continue;
    const par = n.config?.par;
    r = { ...r, nodos: r.nodos.map((k) => (k.id === id || k.id === par ? { ...k, y: k.y + dy } : k)) };
  }
  return fijarBordes(r, ctx.cat);
}

/**
 * An array constant shows one more column for each element width it is stretched to the right and, with two
 * dimensions, one more row for each 19 px it is stretched downwards (the corner does both).
 */
function stretchedArrayConstant(arr, ctx, accion, p) {
  const dimensions = dimensionsOfNode(arr.config);
  const { rows, columns } = visibleGrid(arr.config);
  const growsColumns = accion.lado === "derecha" || accion.lado === "esquina";
  const growsRows = dimensions === 2 && (accion.lado === "abajo" || accion.lado === "esquina");
  const newColumns = growsColumns ? columns + Math.round((p.x - accion.x0) / anchoElementoArray(arr, ctx)) : columns;
  const newRows = growsRows ? rows + Math.round((p.y - accion.y0) / MEDIDAS_ARRAY_2D.altoCelda) : rows;
  return { visibles: visibleSetting(dimensions, Math.max(1, newRows), Math.max(1, newColumns)) };
}

/**
 * Initialize Array has one size input per dimension and is stretched downwards to add them (like Build Array's
 * inputs): one more for each 8 px, up to the dimensions the editor allows. The wires of the sizes that go away go too.
 */
function stretchedInitializeArray(accion, p, ctx) {
  const node = accion.g0.nodos.find((k) => k.id === accion.nodo);
  const dims = Math.min(MAX_EDITOR_DIMENSIONS, Math.max(1, (node.config?.dims ?? 1) + Math.round((p.y - accion.y0) / PASO_ENTRADAS_DOS_DIMENSIONES)));
  const resized = Gr.fijarConfig(accion.g0, accion.nodo, { dims });
  const remaining = new Set(ctx.cat.puertos(resized.nodos.find((k) => k.id === accion.nodo)).in.map((port) => port.name));
  return { ...resized, cables: resized.cables.filter((cable) => cable.a.nodo !== accion.nodo || remaining.has(cable.a.puerto)) };
}

/** Estirar una estructura por su asa: los lados que la asa toca, sin bajar del tamaño mínimo. */
function estirarEstructura(accion, p, ctx) {
  const M = MEDIDAS_ESTRUCTURA;
  const s0 = accion.g0.nodos.find((k) => k.id === accion.nodo);
  const [dx, dy] = [Math.round(p.x - accion.x0), Math.round(p.y - accion.y0)];
  let { x, y } = s0;
  let { ancho, alto } = s0.tam;
  // Una Flat se estira por sus marcos de los extremos: la asa de la derecha, el último, y la de la izquierda, el primero (secuencia-4.png).
  let marcos = marcosDe(s0);
  if (esFlat(s0)) {
    const anchos = anchosMarcos(s0);
    const [primero, ultimo] = [0, anchos.length - 1];
    if (accion.lado.includes("e")) anchos[ultimo] = Math.max(MEDIDAS_SECUENCIA.marcoMinimo, anchos[ultimo] + dx);
    if (accion.lado.includes("w")) {
      const nuevo = Math.max(MEDIDAS_SECUENCIA.marcoMinimo, anchos[primero] - dx);
      x = s0.x + anchos[primero] - nuevo;
      anchos[primero] = nuevo;
    }
    ancho = anchoSecuencia(anchos);
    marcos = marcos.map((m, k) => ({ ...m, ancho: anchos[k] }));
  } else {
    if (accion.lado.includes("e")) ancho = Math.max(M.minimo, s0.tam.ancho + dx);
    if (accion.lado.includes("w")) {
      ancho = Math.max(M.minimo, s0.tam.ancho - dx);
      x = s0.x + s0.tam.ancho - ancho;
    }
  }
  if (accion.lado.includes("s")) alto = Math.max(M.minimo, s0.tam.alto + dy);
  if (accion.lado.includes("n")) {
    alto = Math.max(M.minimo, s0.tam.alto - dy);
    y = s0.y + s0.tam.alto - alto;
  }
  const g = { ...accion.g0, nodos: accion.g0.nodos.map((n) => (n.id === accion.nodo ? { ...n, x, y, tam: { ancho, alto }, ...(esFlat(s0) ? { config: { ...n.config, marcos } } : {}) } : n)) };
  return fijarBordes(g, ctx.cat);
}

// ——— Case Structure: los marcos (DT-041, M4) ———

const nodoPor = (g, id) => g.nodos.find((n) => n.id === id);

/** What the selector of the Case `caseNode` carries: `"string"`, an enum type or `undefined` (see `selectorKind`). */
const kindOf = (g, ctx, caseNode) => (ctx ? selectorKind(g, caseNode, Gr.tipos(g, ctx.cat)) : undefined);

/** Muestra el marco `k` de un Case. Lo seleccionado en el que se deja de ver no sigue seleccionado. */
export function mostrarMarco(d, caso, k) {
  const g = Gr.fijarConfig(d.g, caso, { activo: k });
  const ocultos = new Set(g.nodos.filter((n) => n.dentro === caso && n.marco !== undefined && n.marco !== k).map((n) => n.id));
  return { ...d, g, seleccion: d.seleccion.filter((id) => !ocultos.has(id.split("#")[0])) };
}

/**
 * Pulsar el selector de marcos de un Case: las flechas dan la vuelta (después
 * del último, el primero), el triángulo abre la lista en el punto del clic y el
 * texto no hace nada con un solo clic (structures/case-3.png, case-lista.png).
 */
function pulsarMarco(d, sobre, p) {
  const s = nodoPor(d.g, sobre.nodo);
  const [k, n] = [activoDe(s), marcosDe(s).length];
  if (sobre.zona === "anterior") return mostrarMarco(d, s.id, (k - 1 + n) % n);
  if (sobre.zona === "siguiente") return mostrarMarco(d, s.id, (k + 1) % n);
  if (sobre.zona === "lista") return { ...d, lista: { nodo: s.id, x: p.x, y: p.y } };
  return d;
}

/** Doble clic en el texto del selector de marcos: se escribe en él, con todo seleccionado. */
export const editarMarco = (d, id, ctx) => {
  const s = nodoPor(d.g, id);
  return s && esCase(s) ? { ...d, edicion: { nodo: id, marco: true, texto: etiquetaMarco(marcosDe(s)[activoDe(s)], kindOf(d.g, ctx, s)), todo: true }, seleccion: [], accion: null, menu: null, lista: null } : d;
};

/** Cada marco con su índice actual en `de`, para que `fijarMarcos` sepa a quién sigue cada uno. */
const conOrigen = (s) => marcosDe(s).map((m, i) => ({ ...m, de: i }));

/** Primer entero por encima de lo que cubre el marco anterior que ningún marco usa: lo que LabVIEW da a un marco nuevo (case-9.png). */
function valorNuevo(marcos, anterior) {
  const cubre = (v) => marcos.some((m) => (m.valores ?? []).some((x) => (typeof x === "number" ? x === v : typeof x === "object" && (x.min ?? -Infinity) <= v && v <= (x.max ?? Infinity))));
  const tope = Math.max(-1, ...(anterior?.valores ?? []).map((x) => (typeof x === "number" ? x : (x.max ?? x.min ?? 0))));
  let v = tope + 1;
  while (cubre(v)) v++;
  return v;
}

/**
 * The values of a frame just added. A Boolean and a string Case give none (a
 * string frame without a value breaks the VI, as in LabVIEW: string report, Q3);
 * an enum Case gives the first item that no frame has, or none if all have one.
 */
function valuesOfNewFrame(caseNode, frames, previous, kind) {
  if (kind === "string" || (!kind && esBooleano(caseNode))) return [];
  if (esEnum(kind)) {
    const first = uncoveredItems(caseNode, kind)[0];
    return first !== undefined ? [kind.enum[first]] : [];
  }
  return [valorNuevo(frames, previous)];
}

/**
 * Add Case After y Before: un marco nuevo junto al que se ve, que pasa a verse.
 * En un Case numérico lleva el primer entero libre por encima del marco
 * anterior; en uno booleano, sin valores (case-lista-boolean).
 */
export function anadirMarco(g, ctx, id, despues, x) {
  const s = nodoPor(g, id);
  if (esSecuencia(s)) return anadirMarcoSecuencia(g, ctx, id, despues, x);
  const marcos = marcosDe(s);
  const pos = activoDe(s) + (despues ? 1 : 0);
  const nuevo = { valores: valuesOfNewFrame(s, marcos, marcos[pos - 1], kindOf(g, ctx, s)) };
  const lista = conOrigen(s);
  lista.splice(pos, 0, nuevo);
  return Gr.fijarConfig(Gr.fijarMarcos(g, ctx.cat, id, lista), id, { activo: pos });
}

/** Delete This Case: quita el marco que se ve y todo lo suyo; con uno solo, no se puede. */
export function quitarMarco(g, ctx, id, x) {
  const s = nodoPor(g, id);
  if (marcosDe(s).length < 2) return g;
  if (esSecuencia(s)) return quitarMarcoSecuencia(g, ctx, id, x);
  const k = activoDe(s);
  return Gr.fijarMarcos(g, ctx.cat, id, conOrigen(s).filter((m) => m.de !== k));
}

// ——— Flat y Stacked Sequence: los marcos (secuencia-3.png, secuencia-8.png) ———

/**
 * Lo de los marcos de `desde` en adelante de una Flat se corre `dx` a un lado,
 * con todo lo que tiene dentro; los cables que tocan lo corrido rehacen sus codos.
 */
function correrMarcos(g, id, desde, dx) {
  const ids = g.nodos.filter((n) => n.dentro === id && n.marco !== undefined && n.marco >= desde).map((n) => n.id);
  if (!ids.length || !dx) return g;
  const corridos = Gr.conContenido(g, ids);
  const r = Gr.mover(g, ids, dx, 0);
  return { ...r, cables: r.cables.map((c) => (corridos.has(c.de.nodo) || corridos.has(c.a.nodo) ? (({ codos, union, ...resto }) => resto)(c) : c)) };
}

/** El marco al que se refiere un menú: en una Flat, el que hay en la x donde se hizo clic (de fábrica, el primero); en una Stacked, el que se ve. */
const marcoDelMenu = (s, x) => (esFlat(s) ? (x === undefined ? 0 : marcoEnX(s, x)) : activoDe(s));

/**
 * Add Frame After y Before: un marco nuevo de 38 de ancho junto al del clic (en
 * la Stacked, junto al que se ve, y pasa a verse). En una Flat, lo de los marcos
 * de la derecha se corre y la estructura crece.
 */
function anadirMarcoSecuencia(g, ctx, id, despues, x) {
  const s = nodoPor(g, id);
  const pos = marcoDelMenu(s, x) + (despues ? 1 : 0);
  const lista = conOrigen(s);
  lista.splice(pos, 0, esFlat(s) ? { ancho: MEDIDAS_SECUENCIA.marcoMinimo } : {});
  let r = Gr.fijarMarcos(g, ctx.cat, id, lista);
  if (esFlat(s)) r = correrMarcos(r, id, pos + 1, MEDIDAS_SECUENCIA.marcoMinimo + MEDIDAS_SECUENCIA.separador);
  return ajustarSecuencias(esApilada(s) ? Gr.fijarConfig(r, id, { activo: pos }) : r);
}

/** Delete This Frame: quita el marco con todo lo suyo; en una Flat, los de la derecha se acercan y la estructura se encoge. */
function quitarMarcoSecuencia(g, ctx, id, x) {
  const s = nodoPor(g, id);
  const k = marcoDelMenu(s, x);
  const ancho = anchosMarcos(s)[k];
  let r = Gr.fijarMarcos(g, ctx.cat, id, conOrigen(s).filter((m) => m.de !== k));
  if (esFlat(s)) r = correrMarcos(r, id, k, -(ancho + MEDIDAS_SECUENCIA.separador));
  return ajustarSecuencias(r);
}

/**
 * Replace with Stacked Sequence y with Flat Sequence: la misma secuencia con la
 * otra forma. Una Stacked mide lo que su marco más ancho y una Flat reparte
 * sus marcos uno al lado de otro; lo de cada marco acompaña a su marco
 * (secuencia-8.png, secuencia-15.png).
 */
function cambiarSecuencia(g, id) {
  const s = nodoPor(g, id);
  const flat = esFlat(s);
  const anchos = anchosMarcos(s);
  const S = MEDIDAS_SECUENCIA;
  // Lo de cada marco, de su sitio en una forma al de la otra (el primero queda donde está).
  const interior = flat ? Math.max(...anchos) : s.tam.ancho - 2 * S.lado;
  const salto = (k) => (flat ? -(izquierdasMarcos(s)[k] - S.lado) : k * (interior + S.separador));
  let r = g;
  for (let k = 0; k < marcosDe(s).length; k++) {
    const ids = g.nodos.filter((n) => n.dentro === id && n.marco === k).map((n) => n.id);
    if (ids.length && salto(k)) r = Gr.mover(r, ids, salto(k), 0);
  }
  const marcos = marcosDe(s).map(({ ancho, ...m }) => (flat ? m : { ...m, ancho: interior }));
  const tam = { ...s.tam, ancho: flat ? 2 * S.lado + interior : anchoSecuencia(marcos.map(() => interior)) };
  const nodos = r.nodos.map((n) => {
    if (n.id !== id) return n;
    const { activo, ...config } = n.config ?? {};
    return { ...n, tipo: flat ? "stacked-sequence" : "flat-sequence", tam, config: { ...config, marcos, ...(flat ? { activo: 0 } : {}) } };
  });
  return { ...r, nodos, cables: r.cables.map(({ codos, union, ...c }) => c) };
}

/** Make This The Default Case y Remove Default: sólo un marco es el Default (case-edit5.png). */
export function fijarPredeterminado(g, ctx, id, si) {
  const s = nodoPor(g, id);
  const k = activoDe(s);
  return Gr.fijarMarcos(g, ctx.cat, id, conOrigen(s).map(({ default: _, ...m }, i) => (si && i === k ? { ...m, default: true } : m)));
}

/** Show Case True/False: pasa al otro marco de un Case booleano. */
function mostrarOtroMarco(g, id) {
  const s = nodoPor(g, id);
  const ahora = marcosDe(s)[activoDe(s)]?.valores?.includes(true);
  const k = marcosDe(s).findIndex((m) => m.valores?.includes(!ahora));
  return k < 0 ? g : Gr.fijarConfig(g, id, { activo: k });
}

/**
 * Lo que se escribe en el selector de marcos: valores separados por comas, rangos
 * «2..4» (abiertos por un lado, «..4» o «2..») y «Default»; True y False en un
 * Case booleano. Devuelve el marco, o `null` si no se entiende.
 * With a string or enum selector (`kind`) the text is read as in LabVIEW's selector
 * of that kind: see `readStringFrame` and `readEnumFrame`.
 */
export function leerMarco(texto, kind) {
  if (kind === "string") return readFrameOfTokens(texto, parseStringBound, kind);
  if (esEnum(kind)) return readFrameOfTokens(texto, (token) => parseEnumBound(token, kind), kind);
  const valores = [];
  let predeterminado = false;
  for (const parte of texto.split(",").map((t) => t.trim()).filter(Boolean)) {
    const rango = /^(-?\d+)?\s*\.\.\s*(-?\d+)?$/.exec(parte);
    if (/^default$/i.test(parte)) predeterminado = true;
    else if (/^true$/i.test(parte)) valores.push(true);
    else if (/^false$/i.test(parte)) valores.push(false);
    else if (/^-?\d+$/.test(parte)) valores.push(Number(parte));
    else if (rango && (rango[1] !== undefined || rango[2] !== undefined)) valores.push({ ...(rango[1] !== undefined && { min: Number(rango[1]) }), ...(rango[2] !== undefined && { max: Number(rango[2]) }) });
    else return null;
  }
  return { valores, ...(predeterminado && { default: true }) };
}

/** Splits `text` at every `separator` that is outside double quotes. */
function splitOutsideQuotes(text, separator) {
  const parts = [];
  let current = "";
  let insideQuotes = false;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '"') insideQuotes = !insideQuotes;
    if (!insideQuotes && text.startsWith(separator, i)) {
      parts.push(current);
      current = "";
      i += separator.length - 1;
    } else current += text[i];
  }
  parts.push(current);
  return parts;
}

/**
 * Reads «a, "b".."c", Default» into a frame: each comma-separated part is the
 * word «Default», a value, or a range of two values (either end may be missing).
 * `parseBound` turns the text of one value into its value, or `undefined` if it
 * means nothing. Returns `null` if any part is not understood.
 */
function readFrameOfTokens(text, parseBound, kind) {
  const valores = [];
  let predeterminado = false;
  for (const part of splitOutsideQuotes(text, ",").map((t) => t.trim()).filter(Boolean)) {
    if (/^default$/i.test(part)) {
      predeterminado = true;
      continue;
    }
    const ends = splitOutsideQuotes(part, "..").map((t) => t.trim());
    if (ends.length > 2) return null;
    const values = ends.map((end) => (end === "" ? null : parseBound(end)));
    if (values.some((v) => v === undefined)) return null;
    if (ends.length === 1) valores.push(values[0]);
    else if (values[0] !== null || values[1] !== null) valores.push(...rangeValues(values[0], values[1], kind));
    else return null;
  }
  return { valores, ...(predeterminado && { default: true }) };
}

/**
 * A range of two values next to each other is two values, as LabVIEW shows it (enum report,
 * point 5); with an enum selector the values are item names, so adjacency is by index.
 */
function rangeValues(min, max, kind) {
  const adjacent = (a, b) => {
    if (typeof a === "number" && typeof b === "number") return b - a === 1;
    if (esEnum(kind) && typeof a === "string" && typeof b === "string") return kind.enum.indexOf(b) - kind.enum.indexOf(a) === 1;
    return false;
  };
  if (adjacent(min, max)) return [min, max];
  return [{ ...(min !== null && { min }), ...(max !== null && { max }) }];
}

/** A string value: in quotes, or a bare word taken as that string (string report, Q3 and "Not verified"). */
function parseStringBound(token) {
  const quoted = /^"(.*)"$/s.exec(token);
  if (quoted) return quoted[1];
  return token.includes('"') ? undefined : token;
}

/**
 * An enum value, stored as the item's name (DT-049): a number resolves to the item at that
 * index (enum report, point 5: `1` becomes `"Heat"`); anything else is a name, quoted or bare.
 * A name that is not an item is kept — LabVIEW accepts it, shows it in red and breaks the
 * Case (enum report 2026-10-10, point 6); only an out-of-range number is not understood.
 */
function parseEnumBound(token, kind) {
  if (/^\d+$/.test(token)) return Number(token) < kind.enum.length ? kind.enum[Number(token)] : undefined;
  return /^"(.*)"$/s.exec(token)?.[1] ?? token;
}

/** Confirmar lo escrito en el selector: el marco que se ve toma esos valores; si es el Default, deja de serlo otro (case-edit5.png). */
function escribirMarco(g, ctx, id, texto) {
  const s = nodoPor(g, id);
  const kind = kindOf(g, ctx, s);
  const nuevo = leerMarco(texto, kind);
  const booleano = !kind && esBooleano(s);
  // Un número en un Case booleano, o True en uno numérico, no se entiende: queda como estaba.
  if (!nuevo || (!kind && nuevo.valores.some((v) => (typeof v === "boolean") !== booleano))) return g;
  const k = activoDe(s);
  return Gr.fijarMarcos(g, ctx.cat, id, conOrigen(s).map(({ default: _, ...m }, i) => (i === k ? nuevo : nuevo.default ? m : { ...m, ...(marcosDe(s)[i].default && { default: true }) })));
}

/**
 * Wiring something other than a Boolean to the selector of a Case that still has
 * its False and True frames changes their values: a number gives «0, Default» and
 * «1» (structures/case-3.png, case-lista.png); a string, `"False", Default` and
 * `"True"`; an enum, the items 0 (Default) and 1 (string and enum reports).
 */
function ajustarSelectores(g, ctx) {
  const types = Gr.tipos(g, ctx.cat);
  for (const s of g.nodos) {
    if (!esCase(s) || !esBooleano(s)) continue;
    const selector = g.nodos.find((n) => n.dentro === s.id && n.tipo === "case-selector");
    const wire = selector && g.cables.find((k) => k.a.nodo === selector.id);
    const tipo = wire && types.cables.get(wire.id)?.tipo;
    const asString = tipo === "string";
    if (!asString && !esNumerico(tipo)) continue;
    // An enum names its frames by item (DT-049): False and True become the items 0 and 1.
    const convert = (value) => (asString ? (value === true ? "True" : value === false ? "False" : String(value)) : esEnum(tipo) ? tipo.enum[Number(value)] : Number(value));
    const marcos = conOrigen(s).map(({ valores = [], ...m }) => ({ ...m, valores: valores.map(convert).filter((v) => v !== undefined), ...(valores.includes(false) && { default: true }) }));
    g = Gr.fijarMarcos(g, ctx.cat, s.id, marcos);
  }
  return g;
}

/**
 * Case Insensitive Match (string selector only): toggles `config.caseInsensitive`,
 * which the compiler reads. Off is stored as absence, as the file does.
 */
export function alternarCaseInsensitive(g, id) {
  return Gr.fijarConfig(g, id, { caseInsensitive: nodoPor(g, id).config?.caseInsensitive ? undefined : true });
}

/**
 * The items of the enum selector of `caseNode` that no frame covers, in item order (ranges
 * include both ends). A frame's values are item names (DT-049); a name that is not an item —
 * a stale one, after deleting the item — covers nothing.
 */
export function uncoveredItems(caseNode, kind) {
  const at = (name) => (name === undefined ? undefined : kind.enum.indexOf(name));
  const covers = (value, item) => {
    if (typeof value === "string") return at(value) === item;
    if (value && typeof value === "object") {
      const lo = value.min === undefined ? 0 : at(value.min);
      const hi = value.max === undefined ? kind.enum.length - 1 : at(value.max);
      return lo <= item && item <= hi;
    }
    return false;
  };
  return kind.enum.map((_, item) => item).filter((item) => !marcosDe(caseNode).some((m) => (m.valores ?? []).some((v) => covers(v, item))));
}

/** Add Case for Every Value: one new frame for each uncovered item, in item order, after the last frame. */
export function anadirMarcosParaCadaValor(g, ctx, id) {
  const s = nodoPor(g, id);
  const kind = kindOf(g, ctx, s);
  if (!esEnum(kind)) return g;
  const nuevos = uncoveredItems(s, kind).map((item) => ({ valores: [kind.enum[item]] }));
  return nuevos.length ? Gr.fijarMarcos(g, ctx.cat, id, [...conOrigen(s), ...nuevos]) : g;
}

/**
 * Pressing the main button on something in the diagram. `sobre` is what is
 * underneath, resolved in the order of spec/05 §3.2: `{ tipo: "terminal", nodo,
 * puerto, dir }`, `{ tipo: "nodo", id }`, `{ tipo: "tramo", cable, k }` or
 * `{ tipo: "fondo" }`. `p`, the point on the canvas; `shift`, whether it adds to
 * the selection; `duplicate` (Ctrl), whether dragging copies the selection
 * instead of moving it.
 */
export function pulsar(d, ctx, sobre, p, shift = false, duplicate = false) {
  if (d.menu) return { ...d, menu: null };
  // La lista de marcos de un Case se cierra al pulsar fuera de ella, y una de sus filas muestra ese marco.
  // La de ítems de una constante de enum o de ring elige el que se ve (DT-049).
  if (d.lista)
    return sobre.tipo === "fila-marco"
      ? mostrarMarco({ ...d, lista: null }, sobre.nodo, sobre.k)
      : sobre.tipo === "fila-valor"
        ? { ...d, g: Gr.fijarConfig(d.g, sobre.nodo, { value: sobre.k }), lista: null }
        : sobre.tipo === "fila-elemento"
          ? { ...d, g: chooseUnbundleName(d, ctx, sobre.k), lista: null }
          : { ...d, lista: null };
  // Pulsar fuera de la constante en la que se escribe confirma lo escrito, y
  // nada más: es lo que se ve en el vídeo.
  const enLoQueSeEscribe = d.edicion?.marco ? sobre.tipo === "marco" && sobre.zona === "texto" && sobre.nodo === d.edicion.nodo : sobre.id === d.edicion?.nodo && sobre.tipo === (d.edicion?.etiqueta ? "etiqueta" : "nodo");
  if (d.edicion && !enLoQueSeEscribe) return confirmar(d, ctx);
  if (d.edicion) return d;
  const { accion } = d;
  if (accion?.tipo === "colocar") return ctx.cat.bloque(accion.bloque).estructura ? pulsarEstructura(d, ctx, p) : colocar(d, ctx, p);
  if (accion?.tipo === "recablear") return sobre.tipo === "terminal" ? rewireLooseEnd(d, ctx, sobre, p) : d; // wiring by clicks: Esc cancels
  if (accion?.tipo === "cablear") {
    if (sobre.tipo === "terminal") return terminar(d, ctx, sobre, p);
    if (sobre.tipo === "tramo") return unirACable(d, ctx, sobre, p);
    return d; // cableando con clics: el fondo no corta el cable; Esc sí
  }
  const d0 = { ...d, aviso: null };
  if (sobre.tipo === "marco") return pulsarMarco(d0, sobre, p);
  if (sobre.tipo === "asa") return { ...d0, accion: { tipo: "estirar", nodo: sobre.nodo, lado: sobre.lado, x0: p.x, y0: p.y, y: p.y, g0: d.g } };
  if (sobre.tipo === "suelto") return { ...d0, accion: { tipo: "recablear", cable: sobre.cable, extremo: sobre.extremo, x: p.x, y: p.y, x0: p.x, y0: p.y, arrastrado: false } };
  if (sobre.tipo === "terminal") return { ...d0, accion: { tipo: "cablear", desde: sobre, x: p.x, y: p.y, x0: p.x, y0: p.y, arrastrado: false } };
  const elegir = (id) => {
    const ya = d.seleccion.includes(id);
    // Regla 22: el clic selecciona sólo ese; con Shift, se suma o se quita.
    return shift ? (ya ? d.seleccion.filter((s) => s !== id) : [...d.seleccion, id]) : ya ? d.seleccion : [id];
  };
  if (sobre.tipo === "nodo") {
    // Una constante de enum o de ring que no está seleccionada abre con un clic su lista de
    // ítems; seleccionada, el clic sólo la vuelve a elegir (medido, herramienta automática).
    const pulsado = d.g.nodos.find((n) => n.id === sobre.id);
    // A click on a name row of an Unbundle By Name drops the list of the names of the cluster wired in; unwired, there is none.
    if (UN.isUnbundleByName(pulsado) && sobre.fila !== undefined && UN.clusterElementNames(d.g, ctx.cat, pulsado.id).length) return { ...d0, seleccion: elegir(sobre.id), lista: { nodo: sobre.id, x: p.x, y: p.y, fila: sobre.fila } };
    if (CONSTANTES[pulsado?.tipo]?.selector && !d.seleccion.includes(sobre.id)) return { ...d0, seleccion: elegir(sobre.id), lista: { nodo: sobre.id, x: p.x, y: p.y } };
    // Una constante booleana cambia con un clic, como en LabVIEW; si se arrastra, se mueve.
    // La constante de error, igual, con la celda de su status.
    const tipoNodo = pulsado?.tipo;
    const alternar = tipoNodo === "bool-const" || (tipoNodo === "error-cluster-constant" && sobre.campo === "status") ? sobre.id : null;
    return { ...d0, seleccion: elegir(sobre.id), accion: { tipo: "mover", x: p.x, y: p.y, alternar, campo: sobre.campo, movido: false, ...(duplicate ? { duplicar: true } : {}) } };
  }
  // Una etiqueta se agarra sola: moverla no mueve su terminal.
  if (sobre.tipo === "etiqueta") return { ...d0, seleccion: elegir(`${sobre.id}#etiqueta`), accion: { tipo: "etiqueta", nodo: sobre.id, x: p.x, y: p.y } };
  if (sobre.tipo === "tramo") {
    // Un clic en un cable selecciona ese tramo, y arrastrarlo lo mueve de lado.
    return { ...d0, seleccion: elegir(`${sobre.cable}#${sobre.k}`), accion: { tipo: "tramo", cable: sobre.cable, k: sobre.k, x: p.x, y: p.y } };
  }
  return { ...d0, seleccion: shift ? d.seleccion : [], accion: { tipo: "rectangulo", x0: p.x, y0: p.y, x1: p.x, y1: p.y, base: shift ? d.seleccion : [] } };
}

/** El ratón se mueve por el lienzo con el botón pulsado o con algo a medias. */
export function moverA(d, ctx, p) {
  const { accion } = d;
  if (!accion) return d;
  switch (accion.tipo) {
    case "colocar":
      // Una estructura sigue al cursor con su rectángulo; «arrastrado» es que ya se ha alejado de la esquina.
      if (ctx.cat.bloque(accion.bloque).estructura) return { ...d, accion: { ...accion, x: p.x, y: p.y, arrastrado: accion.esquina ? lejos(accion.esquina, p) : true } };
      return { ...d, accion: { ...accion, x: Math.round(p.x - grabPoint(accion.bloque, ctx).x), y: Math.round(p.y - grabPoint(accion.bloque, ctx).y), arrastrado: true } };
    case "mover": {
      const [dx, dy] = [Math.round(p.x - accion.x), Math.round(p.y - accion.y)];
      if (!dx && !dy) return d;
      // Grabbing an element of a typed array constant pulls the element out instead of moving the constant (stage 2, Q5d).
      if (elementPulledFrom(d, accion)) return { ...d, accion: { ...accion, x: p.x, y: p.y, movido: true } };
      // Ctrl+drag: the first move leaves the originals where they are and carries copies (REPORT.md §B).
      const dragged = accion.duplicar && !accion.duplicado ? duplicateSelection(d, ctx) : d;
      // Regla 23: se mueve todo lo seleccionado. Mover sólo cambia la presentación (regla 25).
      const nodos = dragged.seleccion.filter((id) => dragged.g.nodos.some((n) => n.id === id));
      return { ...dragged, g: desplazar(dragged.g, ctx, nodos, dx, dy), accion: { ...accion, x: accion.x + dx, y: accion.y + dy, movido: true, ...(accion.duplicar ? { duplicado: true } : {}) } };
    }
    case "cablear":
    case "recablear":
      return { ...d, accion: { ...accion, x: p.x, y: p.y, arrastrado: accion.arrastrado || lejos({ x: accion.x0, y: accion.y0 }, p) } };
    case "tramo": {
      const c = d.g.cables.find((k) => k.id === accion.cable);
      const ext = extremos(d.g, ctx);
      const [a, b] = [endPoint(c.de, ext), endPoint(c.a, ext)];
      const codos = c.codos ?? codosPorDefecto(a, b);
      const horizontal = accion.k % 2 === 0;
      const delta = Math.round(horizontal ? p.y - accion.y : p.x - accion.x);
      if (!delta) return d;
      const r = moverTramo(codos, a, b, accion.k, delta);
      const seleccion = d.seleccion.map((s) => (s === `${c.id}#${accion.k}` ? `${c.id}#${r.k}` : s));
      const avance = horizontal ? { y: accion.y + delta } : { x: accion.x + delta };
      return { ...d, g: Gr.fijarCodos(d.g, c.id, r.codos), seleccion, accion: { ...accion, k: r.k, ...avance } };
    }
    case "rectangulo":
      return { ...d, accion: { ...accion, x1: p.x, y1: p.y } };
    case "etiqueta": {
      const [dx, dy] = [Math.round(p.x - accion.x), Math.round(p.y - accion.y)];
      if (!dx && !dy) return d;
      const k = cajaEtiqueta(d.g.nodos.find((n) => n.id === accion.nodo), ctx);
      return { ...d, g: Gr.fijarSitioEtiqueta(d.g, accion.nodo, "diagrama", k.dx + dx, k.dy + dy), accion: { ...accion, x: accion.x + dx, y: accion.y + dy } };
    }
    case "estirar": {
      const arr = accion.g0.nodos.find((k) => k.id === accion.nodo);
      if (arr?.tipo === "arr-const") return { ...d, g: Gr.fijarConfig(accion.g0, accion.nodo, stretchedArrayConstant(arr, ctx, accion, p)) };
      if (arr?.tipo === "initialize-array") return { ...d, g: stretchedInitializeArray(accion, p, ctx) };
      if (esEstructura(accion.g0.nodos.find((k) => k.id === accion.nodo), ctx)) return { ...d, g: estirarEstructura(accion, p, ctx) };
      if (UN.isUnbundleByName(arr)) return { ...d, g: UN.stretchedRows(accion.g0, accion.nodo, ctx.cat, Math.round((p.y - accion.y0) / UN.ROW_STEP)) };
      if (arr && FN.isFormatNode(arr, ctx.cat)) return { ...d, g: FN.stretchedRows(accion.g0, accion.nodo, ctx.cat, Math.round((p.y - accion.y0) / FN.FORMAT_ROW_STEP)) };
      // Cada celda que se estira es una entrada más; por arriba, las nuevas
      // entran encima y las que había conservan sus cables.
      const n0 = accion.g0.nodos.find((k) => k.id === accion.nodo);
      const celda = medidasCompuesto(n0, ctx).celda;
      const pasos = Math.round((p.y - accion.y) / celda) * (accion.lado === "abajo" ? 1 : -1);
      const entradas0 = ctx.cat.puertos(n0).in.length;
      const minimo = ctx.cat.bloque(n0.tipo).entradas.minimo;
      const extra = Math.max(minimo, entradas0 + pasos) - entradas0;
      let g = accion.lado === "abajo" ? Gr.fijarEntradas(accion.g0, ctx.cat, accion.nodo, entradas0 + extra) : Gr.desplazarEntradas(accion.g0, ctx.cat, accion.nodo, extra);
      if (accion.lado === "arriba") g = Gr.mover(g, [accion.nodo], 0, -extra * celda);
      return { ...d, g };
    }
    default:
      return d;
  }
}

function terminar(d, ctx, sobre, p) {
  const { desde } = d.accion;
  if (sobre.nodo === desde.nodo && sobre.puerto === desde.puerto && sobre.dir === desde.dir) {
    return d.accion.arrastrado ? { ...d, accion: null } : d; // soltar donde se pulsó: se sigue con clics
  }
  // On a tunnel or a shift register, the face that fits the wire, whichever half was hit.
  return wireTerminals(d, ctx, desde, borderFaceFor(d.g, ctx, sobre, desde.dir), p);
}

/**
 * A wire released on the border band of a structure, away from any terminal, makes a tunnel there at
 * the release height (measured in LabVIEW, reports/2026-10-15-editor-gestures.md §3). A wire from
 * inside the structure gets an output tunnel; one from outside, an input tunnel. Dragged from an
 * input terminal it is the other way round. Only the structure's own scope or the one around it can
 * be wired (a source nested deeper would need a tunnel per border) and anything else ends silently,
 * as a drop on the background does. The tunnel never lands on another object of the border.
 */
function dropWireOnStructureBorder(d, ctx, structureId, p) {
  const { desde } = d.accion;
  const ended = { ...d, accion: null };
  const structure = d.g.nodos.find((n) => n.id === structureId);
  if (!structure || !esEstructura(structure, ctx)) return ended;
  const scope = Gr.ambitoDe(d.g, ctx.cat, desde.nodo, desde.puerto, desde.dir);
  const sourceIsInside = scope === structureId;
  if (!sourceIsInside && scope !== structure.dentro) return ended;
  const tunnelDirection = sourceIsInside === (desde.dir === "out") ? "out" : "in";
  const tunnelType = tunnelDirection === "in" ? "tunnel-in" : esCase(structure) ? "case-tunnel-out" : "tunnel-out";
  const created = Gr.crearTunel(d.g, ctx.cat, structureId, tunnelDirection, Math.round(p.y - TAM_BORDE[tunnelType][1] / 2));
  const tunnelId = created.id;
  const tunnelEnd = (port, dir) => ({ nodo: tunnelId, puerto: port, dir });
  let joined;
  if (desde.dir === "out") {
    // A source on the Case's own border (an input tunnel) belongs to no frame: the wire goes into the one in view.
    const frame = Gr.marcoDe(created.g, ctx.cat, desde.nodo, desde.puerto, "out") ?? activoDe(structure);
    const framePort = tunnelType === "case-tunnel-out" ? `x-${frame}` : "x";
    joined = Gr.conectar(created.g, ctx.cat, desde, tunnelEnd(framePort, "in"));
  } else {
    joined = Gr.conectar(created.g, ctx.cat, tunnelEnd("y", "out"), desde);
  }
  if (joined.motivo) return { ...ended, aviso: { texto: joined.motivo, x: p.x, y: p.y } };
  const withProperties = indexedTunnelIfLoop(joined.g, ctx, tunnelId, desde);
  const placed = fijarBordes(withProperties, ctx.cat);
  const cleared = fijarBordes(clearOtherBorderObjects(placed, [tunnelId]), ctx.cat);
  return { ...ended, g: ajustarSelectores(cleared, ctx), seleccion: [] };
}

/** Like `conectarCruzando`: a For Loop's output tunnel is born indexed, and an input one when an array enters. */
function indexedTunnelIfLoop(g, ctx, tunnelId, source) {
  const tunnel = g.nodos.find((n) => n.id === tunnelId);
  const structure = g.nodos.find((n) => n.id === tunnel.dentro);
  if (structure.tipo !== "for-loop") return g;
  const carriesArray = tunnel.tipo === "tunnel-in" && source.dir === "out" && esArray(Gr.tipos(g, ctx.cat).salidas.get(`${source.nodo}.${source.puerto}`));
  if (tunnel.tipo !== "tunnel-out" && !carriesArray) return g;
  return { ...g, nodos: g.nodos.map((n) => (n.id === tunnelId ? { ...n, config: { ...n.config, indexado: true } } : n)) };
}

/** Joins two terminals with a wire shaped like a new one; why it cannot be done goes in `aviso`. */
function wireTerminals(d, ctx, desde, sobre, p) {
  let codos;
  let junction = null;
  if (desde.dir !== sobre.dir) {
    const ext = extremos(d.g, ctx);
    const [de, a] = desde.dir === "out" ? [desde, sobre] : [sobre, desde];
    const source = ext.get(`${de.nodo}.${de.puerto}`);
    codos = codosPorDefecto(source, ext.get(`${a.nodo}.${a.puerto}`));
    // A second wire from an output that already has one is a branch of it: both share the vertical just after
    // the source, and the dot sits on that elbow (2026-10-15-wire-bends.md §3).
    const sourceIsWired = d.g.cables.some((c) => c.de.nodo === de.nodo && c.de.puerto === de.puerto);
    if (sourceIsWired && codos.length === 1) junction = [codos[0], source.y];
  }
  const r = unir(d.g, ctx, desde, sobre, codos);
  if (r.motivo) return { ...d, accion: null, aviso: { texto: r.motivo, x: p.x, y: p.y } };
  const isNewWire = r.g.cables.length > d.g.cables.length;
  const g = junction && isNewWire ? Gr.fijarUnion(r.g, r.id, junction) : r.g;
  return { ...d, g: ajustarSelectores(g, ctx), accion: null, seleccion: [] };
}

/**
 * Wiring a loose end (DT-046): a click on the loose end of a broken wire starts a wire from it, and the
 * click on a terminal turns the broken wire into a normal one that goes to that terminal. LabVIEW does it
 * with the Wiring tool (REPORT.md §3); Solder has only the automatic tool, so the click on the loose end
 * is the start. The connection passes the same rules as a new wire; if it does not, the wire stays
 * broken and the reason is shown.
 */
function rewireLooseEnd(d, ctx, sobre, p) {
  const { cable: wireId, extremo: looseSide } = d.accion;
  const wire = d.g.cables.find((candidate) => candidate.id === wireId);
  if (!wire) return { ...d, accion: null };
  const keptEnd = looseSide === "de" ? { ...wire.a, dir: "in" } : { ...wire.de, dir: "out" };
  const withoutWire = { ...d, g: { ...d.g, cables: d.g.cables.filter((candidate) => candidate.id !== wireId) } };
  const result = wireTerminals(withoutWire, ctx, keptEnd, borderFaceFor(withoutWire.g, ctx, sobre, keptEnd.dir), p);
  return result.aviso ? { ...d, accion: null, aviso: result.aviso } : result;
}

/**
 * Un cable que se está tirando desde una entrada termina en otro cable: sale de
 * él una rama que lleva el mismo dato, con su punto de unión, como en LabVIEW.
 * Desde una salida no se puede: ese cable ya tiene quien lo alimente.
 */
function unirACable(d, ctx, sobre, p) {
  const { desde } = d.accion;
  if (desde.dir === "out") {
    return { ...d, accion: null, aviso: { texto: "That wire already has a source: a wire can only come out of one output.", x: p.x, y: p.y } };
  }
  const c = d.g.cables.find((k) => k.id === sobre.cable);
  if (Gr.esSuelto(c.de)) return { ...d, accion: null, aviso: { texto: "This wire has no source to branch from: wire its loose end first.", x: p.x, y: p.y } };
  const ext = extremos(d.g, ctx);
  const [a, b] = [endPoint(c.de, ext), endPoint(c.a, ext)];
  const destino = ext.get(`${desde.nodo}.${desde.puerto}`);
  const r = rama(c.codos ?? codosPorDefecto(a, b), a, b, sobre.k, destino, p);
  const hecho = unir(d.g, ctx, { ...c.de, dir: "out" }, desde, r.codos);
  if (hecho.motivo) return { ...d, accion: null, aviso: { texto: hecho.motivo, x: p.x, y: p.y } };
  return { ...d, g: ajustarSelectores(Gr.fijarUnion(hecho.g, hecho.id, r.union), ctx), accion: null, seleccion: [] };
}

/** Soltar el botón. */
/**
 * What the mouse is on, from everything stacked under it (`targets`, topmost first, as the window
 * resolves them): a terminal lying under a wire's hit zone wins over the wire, so a wire can end on
 * it (real-programs-0.3.md B4; in LabVIEW the terminal takes the wire).
 */
export function preferTerminalUnderWire(targets) {
  const [top] = targets;
  if (top?.tipo !== "tramo") return top ?? null;
  return targets.find((target) => target?.tipo === "terminal") ?? top;
}

export function soltar(d, ctx, sobre, p) {
  const { accion } = d;
  if (!accion) return d;
  switch (accion.tipo) {
    case "colocar":
      // Una estructura se coloca al soltar tras arrastrar desde su esquina; con un clic sin mover, espera el segundo.
      if (ctx.cat.bloque(accion.bloque).estructura) return accion.esquina && lejos(accion.esquina, p) ? ponerEstructura(d, ctx, accion.esquina, p) : d;
      // Arrastrado desde la paleta hasta el lienzo: se coloca al soltar. Si
      // sólo se pulsó, sigue colgando del cursor hasta el siguiente clic.
      return accion.arrastrado && sobre ? colocar(d, ctx, p) : d;
    case "mover":
      if (accion.alternar && !accion.movido) {
        const n = d.g.nodos.find((k) => k.id === accion.alternar);
        if (n.tipo === "error-cluster-constant") return { ...d, g: Gr.fijarValor(d.g, n.id, { ...valorConstanteError(n), status: !valorConstanteError(n).status }), accion: null };
        return { ...d, g: Gr.fijarValor(d.g, n.id, !n.config?.value), accion: null };
      }
      if (accion.movido && elementPulledFrom(d, accion)) return pullElementOut(d, ctx, p);
      // Lo soltado dentro o fuera de un bucle entra o sale de él.
      if (accion.movido) return nestDraggedConstant(d, ctx, p) ?? { ...d, g: alojar(d.g, ctx, d.seleccion.filter((id) => d.g.nodos.some((n) => n.id === id))), accion: null };
      return { ...d, accion: null };
    case "tramo":
    case "estirar":
    case "etiqueta":
      return { ...d, accion: null };
    case "cablear":
      if (!accion.arrastrado) return d; // un clic en el terminal: el cable sigue al ratón
      if (sobre?.tipo === "terminal") return terminar(d, ctx, sobre, p);
      if (sobre?.tipo === "tramo") return unirACable(d, ctx, sobre, p);
      if (sobre?.tipo === "nodo") return dropWireOnStructureBorder(d, ctx, sobre.id, p);
      return { ...d, accion: null };
    case "recablear":
      if (!accion.arrastrado) return d; // un clic en el extremo suelto: el cable sigue al ratón
      return sobre?.tipo === "terminal" ? rewireLooseEnd(d, ctx, sobre, p) : { ...d, accion: null };
    case "rectangulo": {
      const dentro = dentroDe(d.g, ctx, accion);
      return { ...d, seleccion: [...new Set([...accion.base, ...dentro])], accion: null };
    }
    default:
      return d;
  }
}

/**
 * The mouse moves over something: if it is a node, or one of its terminals or
 * stretch handles, the diagram shows its tips and its handles (diagram-view.mjs). Returns the same state when
 * nothing changes, to avoid repainting.
 */
export function sobrevolar(d, sobre) {
  const nuevo =
    sobre?.tipo === "terminal"
      ? { nodo: sobre.nodo, puerto: sobre.puerto }
      : sobre?.tipo === "nodo" && d.edicion?.nodo !== sobre.id
        ? { nodo: sobre.id }
        : sobre?.tipo === "asa"
          ? { nodo: sobre.nodo, asa: sobre.lado } // over a handle the node is still hovered, and its handles show even unselected
          : null;
  const viejo = d.sobre;
  if (nuevo?.nodo === viejo?.nodo && nuevo?.puerto === viejo?.puerto && nuevo?.asa === viejo?.asa) return d;
  return { ...d, sobre: nuevo };
}

// ——— Escribir en una constante ———

/** Doble clic en una constante: se escribe en ella, con todo el texto seleccionado. */
export function editar(d, ctx, id, campo) {
  const n = d.g.nodos.find((k) => k.id === id);
  // La constante de error: se escribe en code (un número) o en source (varias líneas); el status se alterna con un clic.
  if (n?.tipo === "error-cluster-constant") {
    if (campo !== "code" && campo !== "source") return d;
    return { ...d, edicion: { nodo: id, campo, texto: String(valorConstanteError(n)[campo]), todo: true, ...(campo === "source" ? { cadena: true } : {}) }, seleccion: [id], accion: null, menu: null };
  }
  if (n?.tipo === "expression-node") return { ...d, edicion: { nodo: id, texto: n.config?.expression ?? "x", todo: true }, seleccion: [id], accion: null, menu: null };
  // The array constant: one of its elements is typed into (`campo` is its address, see array-grid.mjs); a boolean toggles.
  if (n?.tipo === "arr-const") {
    // An array constant with no element has no cells to type into (DT-060).
    if (isUndefinedArray(n.config?.type)) return d;
    const dimensions = dimensionsOfNode(n.config);
    const first = firstShown(n.config);
    const address = campo ?? (dimensions === 2 ? `${first.row},${first.column}` : first.column);
    const t = tipoElementoArray(n);
    const v = readCell(valoresArray(n), dimensions, address);
    if (t === "boolean") return { ...d, g: Gr.fijarConfig(d.g, id, { value: writeCell(valoresArray(n), dimensions, address, !v, t) }), seleccion: [id], accion: null, menu: null };
    const texto = t === "string" ? String(v ?? "") : formatear(v ?? 0, t, ctx.separador, CONSTANT_DIGITS);
    return { ...d, edicion: { nodo: id, elem: dimensions === 2 ? address : Number(address), texto, todo: true, ...(t === "string" ? { cadena: true } : {}) }, seleccion: [id], accion: null, menu: null };
  }
  if (!n || !CONSTANTES[n.tipo]?.editable) return d;
  // En una constante de cadena Intro baja de línea (como en una etiqueta), y el texto se guarda tal cual.
  return { ...d, edicion: { nodo: id, texto: CONSTANTES[n.tipo].texto(n, ctx), todo: true, ...(CONSTANTES[n.tipo].cadena ? { cadena: true } : {}) }, seleccion: [id], accion: null, menu: null };
}

/** Doble clic en la etiqueta de un nodo: se escribe en ella, con todo su texto seleccionado. */
export function editarEtiqueta(d, id) {
  const n = d.g.nodos.find((k) => k.id === id);
  return n?.label ? { ...d, edicion: Et.editar(n), seleccion: [], accion: null, menu: null } : d;
}

/** Ctrl+A while typing into a constant or a label: all its text is selected. */
export const seleccionarTodoTexto = (d) => (d.edicion ? { ...d, edicion: Et.seleccionarTodo(d.edicion) } : d);

/** Una tecla mientras se escribe: lo seleccionado se sustituye. En una etiqueta, Intro empieza otra línea. */
export function teclear(d, tecla) {
  const e = d.edicion;
  if (!e) return d;
  if (e.etiqueta || e.cadena) return { ...d, edicion: Et.teclear(e, tecla) };
  if (tecla === "Backspace") return { ...d, edicion: { ...e, texto: e.todo ? "" : e.texto.slice(0, -1), todo: false } };
  if (tecla.length !== 1) return d;
  return { ...d, edicion: { ...e, texto: e.todo ? tecla : e.texto + tecla, todo: false } };
}

/**
 * Confirmar lo escrito (Intro, el botón Enter Text o un clic fuera). Un número
 * con decimales en una constante entera la vuelve DBL, como en LabVIEW; lo que
 * no es un número deja la constante como estaba.
 */
export function confirmar(d, ctx) {
  const committed = commitTyping(d, ctx);
  return keepRightEdge(d, committed, ctx);
}

/**
 * A constant keeps its right edge, where its wire leaves, when what was typed into it
 * changes its width: it grows or shrinks on its left (measured, B12 of real-programs-0.3.md). The constants that
 * grow to the right (`growsRight`: a VISA resource name and a path) keep their left edge instead.
 */
function keepRightEdge(before, after, ctx) {
  const id = before.edicion?.nodo;
  const node = id && before.g.nodos.find((k) => k.id === id);
  const changed = node && after.g.nodos.find((k) => k.id === id);
  if (!node || !changed || changed === node || !CONSTANTES[node.tipo] || CONSTANTES[node.tipo].growsRight || before.edicion.elem !== undefined || before.edicion.campo || before.edicion.etiqueta) return after;
  const growth = caja(changed, ctx).ancho - caja(node, ctx).ancho;
  return growth ? { ...after, g: Gr.mover(after.g, [id], -growth, 0) } : after;
}

function commitTyping(d, ctx) {
  const e = d.edicion;
  if (!e) return d;
  if (e.etiqueta) return { ...d, g: Gr.fijarEtiqueta(d.g, e.nodo, e.texto), edicion: null };
  if (e.marco) return { ...d, g: escribirMarco(d.g, ctx, e.nodo, e.texto), edicion: null };
  // The name of an item of an enum constant, written where the constant is (DT-049): a
  // rename, which reaches the frames of the Cases the enum feeds.
  if (e.item) {
    const n = d.g.nodos.find((k) => k.id === e.nodo);
    const items = [...(n.config?.type?.enum ?? [])];
    const anterior = items[n.config?.value ?? 0];
    if (anterior === undefined || anterior === e.texto) return { ...d, edicion: null };
    items[n.config?.value] = e.texto;
    return { ...d, g: Gr.editarItemsEnum(d.g, e.nodo, items, { [anterior]: e.texto }), edicion: null };
  }
  const n = d.g.nodos.find((k) => k.id === e.nodo);
  // Un elemento de una constante de array: se lleva al tipo de sus elementos; lo que no vale lo deja como estaba.
  if (e.elem !== undefined) {
    const t = tipoElementoArray(n);
    const v = leerElemento(e.texto, t);
    return v === undefined ? { ...d, edicion: null } : { ...d, g: Gr.fijarConfig(d.g, n.id, { value: writeCell(valoresArray(n), dimensionsOfNode(n.config), e.elem, v, t) }), edicion: null };
  }
  // Un campo de la constante de error: code se lleva a I32 y source se guarda tal cual.
  if (e.campo) {
    const valor = e.campo === "code" ? (() => { const l = leerNumero(e.texto, "i32"); return l && convertirValor(l.valor, "i32"); })() : e.texto;
    if (valor === null || valor === undefined) return { ...d, edicion: null };
    return { ...d, g: Gr.fijarValor(d.g, n.id, { ...valorConstanteError(n), [e.campo]: valor }), edicion: null };
  }
  // Una expresión se guarda tal cual: si no vale, la dirá el compilador.
  if (n.tipo === "expression-node") return { ...d, g: Gr.fijarConfig(d.g, n.id, { expression: e.texto }), edicion: null };
  // Una cadena se guarda tal cual, con sus saltos de línea.
  // The same goes for a VISA resource name, which is a string that carries no newline (Enter confirms).
  if (n.tipo === "str-const" || n.tipo === "visa-resource-constant") return { ...d, g: Gr.fijarValor(d.g, n.id, e.texto), edicion: null };
  // A path is read from the text as String To Path reads it, with the rules of the host: every text is a path (DT-067).
  if (n.tipo === "path-constant") return { ...d, g: Gr.fijarValor(d.g, n.id, pathFromText(e.texto, ctx.pathRules)), edicion: null };
  const b = ctx.cat.bloque(n.tipo);
  const tipo = n.config?.type ?? b.config?.default?.type ?? "number";
  const leido = leerNumero(e.texto, tipo);
  if (!leido) return { ...d, edicion: null };
  const cambiaTipo = b["type-from"] === "config" ? leido.tipo : undefined;
  return { ...d, g: Gr.fijarValor(d.g, n.id, leido.valor, cambiaTipo), edicion: null };
}

// ——— Menús de clic derecho ———

/** The menu the arrow of a VISA resource name opens: the list of VISA resources, of which Solder has only Refresh, greyed. */
export const VISA_DROPDOWN_MENU = "context.visa-dropdown";

/**
 * Abrir el menú de un nodo, o de uno de sus terminales (`puerto`), donde se
 * hace clic. En el vídeo, el nodo no queda seleccionado.
 */
export const abrirMenu = (d, raiz, nodo, x, y, puerto = null, en = null) => ({ ...d, menu: { raiz, nodo, puerto, x, y, en, abierto: null }, accion: null, edicion: null });

/** Pasar por una fila con submenú lo abre; por otra, lo cierra. */
export const sobreMenu = (d, id, conSubmenu) => {
  if (!d.menu) return d;
  const abierto = conSubmenu ? id : d.menu.abierto && id.startsWith(`${d.menu.abierto}.`) ? d.menu.abierto : null;
  return abierto === d.menu.abierto ? d : { ...d, menu: { ...d.menu, abierto } };
};

/**
 * Las órdenes hechas de los menús. Las demás son huecos y sólo se explican.
 * `ctx` hace falta para las que crean nodos.
 */
export function orden(d, id, ctx) {
  if (!d.menu) return d;
  // The connector pane's menu belongs to the panel's state and changes the VI's connector.
  if (id.startsWith(`${CP.MENU_ROOT}.`)) return CP.runMenuCommand(d, id);
  // The menus of the graphs on the panel (graph-menus.mjs).
  const graphResult = graphCommand(d, id, ctx);
  if (graphResult) return graphResult;
  const { nodo, puerto } = d.menu;
  const cerrar = (g) => ({ ...d, g, menu: null });
  // Edit Items… opens the enum's Properties dialog on its Edit Items tab (DT-049); the
  // window draws it and keeps it modal.
  if (id.endsWith(".edit-items")) return { ...d, menu: null, itemsDialog: EI.open(nodoPor(d.g, nodo)) };
  // Select Item… of an enum opens its window of items with a filter (select-item-dialog.mjs).
  if (/^context\.enum-(constant|control|indicator)\.select-item$/.test(id)) return { ...d, menu: null, selectItemDialog: SI.open(nodoPor(d.g, nodo)) };
  const ultimo = id.slice(id.lastIndexOf(".") + 1);
  const unbundleResult = unbundleCommand(d, id, ctx);
  if (unbundleResult) return unbundleResult;
  if (id.endsWith(".visible-items.terminals")) return cerrar(Gr.alternarTerminales(d.g, nodo));
  if (id.endsWith(".view-as-icon")) return cerrar(Gr.alternarIcono(d.g, nodo));
  if (id.endsWith(".invert")) return cerrar(Gr.alternarInvertida(d.g, nodo, puerto ?? "result"));
  if (id.endsWith(".add-input")) return cerrar(Gr.anadirEntrada(d.g, ctx.cat, nodo, puerto));
  if (id.endsWith(".remove-input")) return cerrar(Gr.quitarEntrada(d.g, ctx.cat, nodo, puerto));
  if (id.endsWith(".add-parameter")) return cerrar(FN.addedRow(d.g, nodo, ctx.cat, FN.rowOfPort(nodoPor(d.g, nodo), ctx.cat, puerto)));
  if (id.endsWith(".remove-parameter")) return cerrar(FN.removedRow(d.g, nodo, ctx.cat, FN.rowOfPort(nodoPor(d.g, nodo), ctx.cat, puerto)));
  if (id.includes(".change-mode.")) return cerrar(Gr.fijarConfig(d.g, nodo, { mode: ultimo }));
  if (id.includes(".representation.") && POR_ABREVIATURA[ultimo]) {
    // On the element of an array the representation is the whole array's (array-typing stage 2, Q5b).
    const retype = isArrayNode(nodoPor(d.g, nodo)) ? setArrayRepresentation : Gr.fijarRepresentacion;
    return cerrar(retype(d.g, nodo, POR_ABREVIATURA[ultimo]));
  }
  // LabVIEW flips the whole panel array from its own menu or from the one of its element.
  if (/\.change-to-(indicator|control)$/.test(id) && PANEL_ARRAY_KINDS.includes(nodoPor(d.g, nodo)?.tipo)) return cerrar(flipArrayKind(d.g, nodo));
  if (id.includes(".mechanical-action.")) return cerrar(Gr.fijarConfig(d.g, nodo, { mechanical: ultimo }));
  // Data Operations of a panel object or its terminal (DT-053): its current value becomes its default, or the other way round.
  if (id.endsWith(".data-operations.make-current-value-default")) return cerrar(CV.makeCurrentValuesDefault(d.g, [nodo]));
  if (id.endsWith(".data-operations.reinitialize-to-default-value")) return cerrar(CV.reinitializeToDefault(d.g, [nodo]));
  // In Range and Coerce: cada extremo se incluye o no; de fábrica, el inferior sí y el superior no.
  const extremo = /\.include-(upper|lower)-limit$/.exec(id)?.[1];
  if (extremo) {
    const clave = `include-${extremo}-limit`;
    const n = d.g.nodos.find((k) => k.id === nodo);
    return cerrar(Gr.fijarConfig(d.g, nodo, { [clave]: !(n.config?.[clave] ?? extremo === "lower") }));
  }
  // Indexado de los túneles de un bucle (array/tunel-salida-menu-modo.png): Last Value o Indexing en la salida, y
  // Enable o Disable Indexing en la entrada, que sólo se enciende si lo que llega es un array.
  if (id.endsWith(".tunnel-mode.last-value") || id.endsWith(".tunnel-mode.indexing")) {
    const indexado = id.endsWith("indexing");
    const t = d.g.nodos.find((k) => k.id === nodo);
    return cerrar(!!t.config?.indexado === indexado ? d.g : Gr.fijarConfig(d.g, nodo, { indexado }));
  }
  if (id.endsWith(".enable-indexing")) {
    const t = d.g.nodos.find((k) => k.id === nodo);
    if (t.config?.indexado) return cerrar(Gr.fijarConfig(d.g, nodo, { indexado: false }));
    const cable = d.g.cables.find((k) => k.a.nodo === nodo);
    return esArray(cable && Gr.tipos(d.g, ctx.cat).cables.get(cable.id)?.tipo) ? cerrar(Gr.fijarConfig(d.g, nodo, { indexado: true })) : cerrar(d.g);
  }
  // Add Dimension and Remove Dimension of an array constant, control or indicator (array-2d/constant-2d-menu-index.png).
  if (id.endsWith(".add-dimension") || id.endsWith(".remove-dimension")) {
    const n = d.g.nodos.find((k) => k.id === nodo);
    const dimensionPatch = id.endsWith(".add-dimension") ? addDimensionPatch : removeDimensionPatch;
    const patch = dimensionPatch(n.config);
    if (!patch) return d;
    const withPatch = Gr.fijarConfig(d.g, nodo, patch);
    // A control's current value (DT-053) takes the same new shape as its default.
    return cerrar(CV.hasCurrentValue(n) ? CV.setCurrentValue(withPatch, nodo, dimensionPatch({ ...n.config, value: n.currentValue }).value) : withPatch);
  }
  const createdKind = /\.create\.(constant|control|indicator)$/.exec(id)?.[1];
  const createdAll = /\.create\.(all-controls-and-indicators|all-constants)$/.exec(id)?.[1];
  const menuClosed = (r) => ({ ...r, menu: null });
  if (d.menu.raiz === WIRE_MENU_ROOT && createdKind) return menuClosed(createOnWire(d, ctx, nodo, createdKind));
  if (createdKind) return menuClosed(createOnTerminal(d, ctx, nodo, puerto, createdKind));
  // The border nodes of a loop have the rows directly in their menu (REPORT.md §5): their one terminal is the one meant.
  const loopTerminalKind = /\.create-(constant|control|indicator)$/.exec(id)?.[1];
  if (loopTerminalKind) return menuClosed(createOnTerminal(d, ctx, nodo, TC.borderTerminalPort(nodoPor(d.g, nodo), ctx), loopTerminalKind));
  if (createdAll) return menuClosed(createOnNode(d, ctx, nodo, createdAll));
  // Add Shift Register: el par aparece en los bordes, a la altura del clic (structures/shift-register.png).
  if (id.endsWith(".add-shift-register")) {
    const s = d.g.nodos.find((k) => k.id === nodo);
    const y = d.menu.en ? d.menu.en.y - TAM_BORDE["shift-register-left"][1] / 2 : s.y + s.tam.alto / 2 - 6;
    return cerrar(fijarBordes(Gr.crearRegistro(d.g, ctx.cat, nodo, Math.round(y)).g, ctx.cat));
  }
  // Los marcos de un Case (structures/case-menu-*.png).
  if (id.endsWith(".add-case-after") || id.endsWith(".add-case-before")) return cerrar(anadirMarco(d.g, ctx, nodo, id.endsWith("after")));
  if (id.endsWith(".delete-this-case")) return cerrar(quitarMarco(d.g, ctx, nodo));
  if (id.endsWith(".add-case-for-every-value")) return cerrar(anadirMarcosParaCadaValor(d.g, ctx, nodo));
  if (id.endsWith(".case-insensitive-match")) return cerrar(alternarCaseInsensitive(d.g, nodo));
  // Los marcos de una Flat o una Stacked Sequence (structures/secuencia-menu-*.png).
  if (id.endsWith(".add-frame-after") || id.endsWith(".add-frame-before")) return cerrar(reparar(anadirMarco(d.g, ctx, nodo, id.endsWith("after"), d.menu.en?.x), ctx));
  if (id.endsWith(".delete-this-frame")) return cerrar(reparar(quitarMarco(d.g, ctx, nodo, d.menu.en?.x), ctx));
  if (id.endsWith(".replace-with-stacked-sequence") || id.endsWith(".replace-with-flat-sequence")) {
    const n = nodoPor(d.g, nodo);
    if (n && esSecuencia(n) && esFlat(n) === id.endsWith("stacked-sequence")) return cerrar(reparar(cambiarSecuencia(d.g, nodo), ctx));
    return d;
  }
  if (id.endsWith(".make-this-the-default-case")) return cerrar(fijarPredeterminado(d.g, ctx, nodo, true));
  if (id.endsWith(".remove-default")) return cerrar(fijarPredeterminado(d.g, ctx, nodo, false));
  if (id.endsWith(".show-case-other")) return cerrar(mostrarOtroMarco(d.g, nodo));
  if (id.endsWith(".use-default-if-unwired")) return cerrar(Gr.fijarConfig(d.g, nodo, { "use-default": !d.g.nodos.find((k) => k.id === nodo).config?.["use-default"] }));
  const modo = /\.(stop|continue)-if-true$/.exec(id)?.[1];
  if (modo) {
    const cond = condicionDe(d.g, nodo);
    return cond ? cerrar(Gr.fijarConfig(d.g, cond.id, { mode: `${modo}-if-true` })) : d;
  }
  return d;
}

// ——— Unbundle By Name ———

/** Choosing a name in the drop-down list of a row: the row shows that element and its wire stays (Select Item, measured). */
function chooseUnbundleName(d, ctx, choice) {
  const name = UN.clusterElementNames(d.g, ctx.cat, d.lista.nodo)[choice];
  return name === undefined ? d.g : Gr.selectUnbundleItem(d.g, d.lista.nodo, d.lista.fila, name);
}

/** The commands of the menus of an Unbundle By Name (Select Item ▸ a name, Remove Element), or nothing if `id` is not one of them. */
function unbundleCommand(d, id, ctx) {
  if (d.menu.raiz !== UN.ROW_MENU) return null;
  const row = UN.rowOfPort(d.menu.puerto);
  const choice = /\.select-item\.(\d+)$/.exec(id)?.[1];
  if (choice !== undefined) return { ...d, g: Gr.selectUnbundleItem(d.g, d.menu.nodo, row, UN.clusterElementNames(d.g, ctx.cat, d.menu.nodo)[Number(choice)]), menu: null };
  if (id.endsWith(".remove-element")) return { ...d, g: Gr.removeUnbundleRow(d.g, ctx.cat, d.menu.nodo, row), menu: null };
  return null;
}

/** El terminal de condición de un While, o el nodo mismo si ya lo es. */
const condicionDe = (g, id) => {
  const n = g.nodos.find((k) => k.id === id);
  if (n?.tipo === "loop-condition") return n;
  return n?.tipo === "while-loop" ? g.nodos.find((k) => k.dentro === n.id && k.tipo === "loop-condition") : undefined;
};

const PANEL_ARRAY_KINDS = ["arr-control", "arr-indicator"];
const NUMERIC_ELEMENT_ROOT = "context.panel-array-element";
const isArrayNode = (node) => node?.tipo === "arr-const" || PANEL_ARRAY_KINDS.includes(node?.tipo);

/**
 * The rows of the menu of the ELEMENT of an array that depend on it being an indicator: it says Change to Control, and
 * a numeric one has Adapt To Source instead of Data Entry... (reports/2026-10-18-array-element-menus.md §1-2).
 */
function elementVariants(n, root) {
  const variants = { ocultos: new Set(), rotulos: new Map(), separadores: new Map() };
  if (n.tipo === "arr-indicator") {
    variants.rotulos.set(`${root}.change-to-indicator`, "Change to Control");
    variants.ocultos.add(`${root}.data-entry`);
    // Adapt To Source opens the group that Representation opens on a control.
    if (root === NUMERIC_ELEMENT_ROOT) variants.separadores.set(`${root}.representation`, false);
  } else {
    variants.ocultos.add(`${root}.adapt-to-source`);
  }
  return variants;
}

/** The palette row of a panel array terminal's menu for each element type; a string has none (terminal-menu-string.png). */
const TERMINAL_PALETTE_BY_ELEMENT = { numeric: "numeric-palette", boolean: "boolean-palette" };

/**
 * The rows of the menu of a panel array's terminal that follow its element and its kind
 * (reports/2026-10-23-array-terminal-menu.md): the palette of the element and, for a numeric one, Representation; no
 * Change to Element on an empty array; Export greyed on an empty or Boolean array; an indicator says Find Indicator,
 * Hide Indicator and Change to Control, and has Adapt To Source opening the group of Representation.
 */
function terminalVariants(n, root) {
  const elementType = n.config?.type?.array;
  const empty = isUndefinedArray(n.config?.type);
  const elementKind = empty ? null : elementType === "boolean" ? "boolean" : typeof elementType === "string" && esNumerico(elementType) ? "numeric" : null;
  const row = (name) => `${root}.${name}`;
  const variants = { ocultos: new Set(), rotulos: new Map(), separadores: new Map(), desactivados: new Set() };
  for (const [kind, palette] of Object.entries(TERMINAL_PALETTE_BY_ELEMENT)) if (kind !== elementKind) variants.ocultos.add(row(palette));
  if (!elementKind) variants.separadores.set(row("array-palette"), true);
  if (elementKind !== "numeric") variants.ocultos.add(row("representation"));
  if (empty) variants.ocultos.add(row("change-to-element"));
  if (empty || elementKind === "boolean") variants.desactivados.add(row("export"));
  if (n.tipo === "arr-indicator") {
    variants.rotulos.set(row("find-control"), "Find Indicator");
    variants.rotulos.set(row("hide-control"), "Hide Indicator");
    variants.rotulos.set(row("change-to-indicator"), "Change to Control");
    if (empty) variants.ocultos.add(row("adapt-to-source"));
    else variants.separadores.set(row("representation"), false);
  } else {
    variants.ocultos.add(row("adapt-to-source"));
  }
  return variants;
}

/** The rows of the menu of an array that change with its dimensions (and, on the panel, with being an indicator). */
function arrayVariants(n, root) {
  if (root.startsWith("context.panel-array-element")) return elementVariants(n, root);
  if (root === PANEL_ARRAY_TERMINAL_MENU) return terminalVariants(n, root);
  const dimensions = dimensionsOfNode(n.config);
  const variants = { desactivados: new Set(), redirigidos: new Map(), rotulos: new Map() };
  // An array constant with no element yet has no Numeric Palette nor Change to Element (measured, menus-array-constant-nonindex-click.png).
  if (n.tipo === "arr-const" && isUndefinedArray(n.config?.type)) {
    variants.ocultos = new Set([`${root}.numeric-palette`, `${root}.change-to-element`]);
    variants.separadores = new Map([[`${root}.array-palette`, true]]);
  }
  if (dimensions < 2) variants.desactivados.add(`${root}.remove-dimension`);
  if (dimensions >= MAX_EDITOR_DIMENSIONS) variants.redirigidos.set(`${root}.add-dimension`, "context.array-dimensions-limit");
  if (n.tipo === "arr-indicator") variants.rotulos.set(`${root}.change-to-indicator`, "Change to Control");
  return variants;
}

/**
 * The menus of a File Path Control are also the ones of a File Path Indicator, which says Change to Control. Only the
 * panel's first rows were read on the indicator (reports/2026-10-26-path-type.md §1); on its terminal the rows that name
 * the object follow the other indicators' terminals (Find Indicator, Hide Indicator, Change to Control), unverified.
 */
const PATH_PANEL_MENU = "context.path-control";
const PATH_TERMINAL_MENU = "context.path-control-terminal";
const PATH_INDICATOR_ROOTS = new Set([PATH_PANEL_MENU, PATH_TERMINAL_MENU]);
function pathIndicatorVariants(root) {
  const rotulos = new Map([[`${root}.change-to-indicator`, "Change to Control"]]);
  if (root === PATH_TERMINAL_MENU) {
    rotulos.set(`${root}.find-control`, "Find Indicator");
    rotulos.set(`${root}.hide-control`, "Hide Indicator");
  }
  return { rotulos };
}

/**
 * The rows that a node's menu shows or renames according to what it is: a
 * Boolean Case has "Show Case True/False" and "Make This Case True/False", a
 * numeric one has "Show Case...", the Default and Radix, and its Default row
 * says "Remove Default" if the frame in view is the Default. A selector terminal
 * has the Boolean or the Numeric Palette.
 */
function nodeVariants(d, ctx) {
  if (CP.hasConnectorMenu(d)) return CP.menuVariants(d);
  const n = d.menu && d.g.nodos.find((k) => k.id === d.menu.nodo);
  const r = d.menu?.raiz;
  const fila = (...ids) => new Set(ids.map((i) => `${r}.${i}`));
  if (n && esCase(n)) {
    const ms = marcosDe(n);
    const m = ms[activoDe(n)];
    if (!kindOf(d.g, ctx, n) && esBooleano(n)) {
      const otro = m?.valores?.includes(true) ? "False" : "True";
      return { ocultos: fila("show-case", "swap-diagram-with-case", "shift-diagram-to-case", "rearrange-cases", "make-this-the-default-case", "remove-default", "radix", "case-insensitive-match", "add-case-for-every-value"), rotulos: new Map([[`${r}.show-case-other`, `Show Case ${otro}`], [`${r}.make-this-case-other`, `Make This Case ${otro}`]]) };
    }
    const kind = kindOf(d.g, ctx, n);
    const hidden = fila("show-case-other", "make-this-case-other", m?.default ? "make-this-the-default-case" : "remove-default");
    // A string selector has Case Insensitive Match; an enum one has neither it nor Radix, and the two rows for the items without a frame (string and enum reports).
    if (kind !== "string") hidden.add(`${r}.case-insensitive-match`);
    if (kind) hidden.add(`${r}.radix`);
    if (!esEnum(kind) || !uncoveredItems(n, kind).length) {
      hidden.add(`${r}.add-case-for-every-value`);
      if (esEnum(kind)) hidden.add(`${r}.remove-empty-cases`);
    }
    return { ocultos: hidden, rotulos: new Map() };
  }
  // Una Stacked de dos marcos: «Show Frame» y «Make This Frame» dicen el número del otro; con más, llevan un submenú (secuencia-menu-stacked.png).
  if (n && esApilada(n)) {
    const otro = marcosDe(n).length === 2 ? ` ${1 - activoDe(n)}` : "";
    return { ocultos: new Set(), rotulos: new Map([[`${r}.show-frame`, `Show Frame${otro}`], [`${r}.make-this-frame`, `Make This Frame${otro}`]]) };
  }
  // Un túnel de entrada indexado ofrece apagar el indexado: la misma fila cambia de nombre.
  if (n?.tipo === "tunnel-in" && n.config?.indexado) return { ocultos: new Set(), rotulos: new Map([[`${r}.enable-indexing`, "Disable Indexing"]]) };
  // An array: Remove Dimension is greyed on a 1D one, and Add Dimension on a 2D one explains the limit of Solder.
  if (n && ["arr-const", "arr-control", "arr-indicator"].includes(n.tipo)) return arrayVariants(n, r);
  // Remove Parameter on the only row of Scan From String does nothing: there is always one.
  if (n?.tipo === "scan-from-string" && (n.config?.inputs ?? 1) <= 1) return { desactivados: new Set([`${r}.remove-parameter`]) };
  if (UN.isUnbundleByName(n)) return unbundleVariants(d, ctx, n);
  // LabVIEW greys Advanced on the terminals of a VISA resource name (reports/2026-10-26-visa-resource-name-look.md Q5; why is unverified).
  if (r === "context.visa-control-terminal" || r === "context.visa-indicator-terminal") return { desactivados: new Set([`${r}.advanced`]) };
  if (n && PATH_INDICATOR_ROOTS.has(r) && n.tipo === "path-indicator") return pathIndicatorVariants(r);
  if (n?.tipo === "case-selector") {
    const caso = d.g.nodos.find((k) => k.id === n.dentro);
    return { ocultos: fila(caso && esBooleano(caso) ? "numeric-palette" : "boolean-palette"), rotulos: new Map() };
  }
  return {};
}

/**
 * The rows of the menus of an Unbundle By Name that depend on its state. A row's menu names its type's
 * palette and lists the names of the wired cluster in Select Item; Remove Element is greyed on the last
 * row; Select Item is greyed when no cluster is wired. The body menu names the palette of the wired
 * cluster, and has no such row for a cluster that was not measured.
 */
function unbundleVariants(d, ctx, node) {
  const root = d.menu.raiz;
  const cluster = UN.wiredCluster(d.g, ctx.cat, node.id);
  if (root === UN.BODY_MENU) {
    const label = UN.bodyPaletteLabel(cluster);
    return label ? { rotulos: new Map([[`${root}.cluster-type-palette`, label]]) } : { ocultos: new Set([`${root}.cluster-type-palette`]) };
  }
  const row = UN.rowOfPort(d.menu.puerto);
  const names = UN.clusterElementNames(d.g, ctx.cat, node.id);
  const paletteLabel = UN.typePaletteLabel(UN.elementTypeOfRow(d.g, ctx.cat, node.id, row));
  const variants = {
    desactivados: new Set(UN.rowCount(node, ctx.cat) <= 1 ? [`${root}.remove-element`] : []),
    ocultos: new Set(paletteLabel ? [] : [`${root}.type-palette`]),
    rotulos: new Map(paletteLabel ? [[`${root}.type-palette`, paletteLabel]] : []),
  };
  if (!names.length) variants.desactivados.add(`${root}.select-item`);
  else variants.submenus = new Map([[`${root}.select-item`, names.map((name, k) => ({ id: `${root}.select-item.${k}`, etiqueta: name, estado: "built" }))]]);
  return variants;
}

/** Whether the row `id` of the open menu opens a submenu: one declared in the inventory, or one the diagram fills in (Select Item). */
export const menuRowHasSubmenu = (d, ctx, inv, id) => inv.tieneContenido(id) || !!variantes(d, ctx).submenus?.has(id);

/**
 * The entry of a row of the open menu: the inventory's, or for a row the diagram fills in (the names
 * of Select Item ▸) the one it was generated with. Those rows are not in the inventory, so looking
 * them up there alone finds nothing.
 */
export function menuRowEntry(d, ctx, inv, id) {
  const declared = inv.resolver(id);
  if (declared) return declared;
  for (const rows of variantes(d, ctx).submenus?.values() ?? []) {
    const generated = rows.find((row) => row.id === id);
    if (generated) return generated;
  }
  return undefined;
}

/** The Create rows that need a terminal under the pointer: LabVIEW greys them on the body of a node (subvi/subvi-node-menu-create.png). */
const CREATE_ROWS_THAT_NEED_A_TERMINAL = ["constant", "control", "indicator"];

/**
 * The rows of Create ▸ that depend on where the menu was opened: Constant,
 * Control and Indicator are greyed on the body of a node and work on a
 * terminal; Scalar ▸ appears only on an array terminal
 * (create-paste/array-size-input-create-scalar-submenu.png).
 */
function createVariants(d, ctx) {
  const menu = d.menu;
  if (!menu || menu.raiz === WIRE_MENU_ROOT || !ctx || CP.hasConnectorMenu(d)) return {};
  const root = menu.raiz;
  const node = nodoPor(d.g, menu.nodo);
  if (!node) return {};
  const desactivados = menu.puerto ? new Set() : new Set(CREATE_ROWS_THAT_NEED_A_TERMINAL.map((item) => `${root}.create.${item}`));
  const terminal = menu.puerto && terminales(node, ctx).find((t) => t.puerto === menu.puerto);
  const type = terminal && (terminal.dir === "in" ? Gr.tipos(d.g, ctx.cat).entradas : Gr.tipos(d.g, ctx.cat).salidas).get(`${menu.nodo}.${menu.puerto}`);
  const ocultos = esArray(type) ? new Set() : new Set([`${root}.create.scalar`]);
  return { desactivados, ocultos };
}

/**
 * The menu of a wire. A broken one opens with List Errors and shows no Visible Items, probes or Clean Up
 * Wire (that one only on a wire whose types do not match) and a greyed Add Breakpoint; a healthy wire has
 * no List Errors (labview-captures/broken-wires/REPORT.md §5).
 */
function wireMenuVariants(d, ctx) {
  if (d.menu?.raiz !== WIRE_MENU_ROOT || !ctx) return {};
  const row = (name) => `${WIRE_MENU_ROOT}.${name}`;
  const types = Gr.tipos(d.g, ctx.cat);
  const broken = types.cables.get(d.menu.nodo);
  // The palette row is named after the wire's type: a VISA resource name's is the VISA Palette, as on its terminal
  // (reports/2026-10-26-visa-resource-name-look.md Q5; on the wire itself, unverified).
  const wire = d.g.cables.find((candidate) => candidate.id === d.menu.nodo);
  const wireType = wire?.de && types.salidas.get(`${wire.de.nodo}.${wire.de.puerto}`);
  // A path's wire names the File I/O Palette, as the path's terminal does (on the wire itself, unverified).
  const palettes = new Map([[VISA_RESOURCE, "VISA Palette"], [PATH, "File I/O Palette"]]);
  const rotulos = new Map(palettes.has(wireType) ? [[row("numeric-palette"), palettes.get(wireType)]] : []);
  if (!broken?.roto) return { ocultos: new Set([row("list-errors")]), rotulos };
  const hidden = ["visible-items", "add-probe", "custom-probe", ...(broken.suelto ? ["clean-up-wire"] : [])];
  return { ocultos: new Set(hidden.map(row)), desactivados: new Set([row("add-breakpoint")]) };
}

/** The union of two sets of variants (the node's own and Create's). */
const mergeVariants = (a, b) => ({
  ...a,
  ocultos: new Set([...(a.ocultos ?? []), ...(b.ocultos ?? [])]),
  desactivados: new Set([...(a.desactivados ?? []), ...(b.desactivados ?? [])]),
  rotulos: new Map([...(a.rotulos ?? []), ...(b.rotulos ?? [])]),
});

/** What changes in the rows of the open menu: the node's own variants and those of Create ▸. `ctx` is needed for the terminal's type. */
export const variantes = (d, ctx) => (isGraphMenu(d) ? graphMenuVariants(d) : mergeVariants(mergeVariants(nodeVariants(d, ctx), createVariants(d, ctx)), wireMenuVariants(d, ctx)));

/**
 * What LabVIEW ticks in the menus of a VISA resource name, by the menu's root (reports/2026-10-26-visa-resource-name-look.md
 * Q5): every one has the I/O Session class, and Instr in it; the constant has Menu Button visible and Size To Text; the
 * terminals show Label; the panel control shows its Caption and Menu Button, with Label unticked ("Surprises" of the report).
 */
const VISA_CLASS_MARKS = ["select-visa-class.i-o-session", "select-visa-class.i-o-session.instr"];
export const VISA_MENU_MARKS = {
  "context.visa-constant": ["visible-items.menu-button", "size-to-text", ...VISA_CLASS_MARKS],
  "context.visa-control-terminal": ["visible-items.label", ...VISA_CLASS_MARKS],
  "context.visa-indicator-terminal": ["visible-items.label", ...VISA_CLASS_MARKS],
  "context.visa-control": ["visible-items.caption", "visible-items.menu-button", ...VISA_CLASS_MARKS],
};

/**
 * What LabVIEW ticks in the menus of a path (reports/2026-10-26-path-type.md §1-2): Allow Dropping on the panel, and
 * Browse Button on a control (an indicator's is greyed and unticked); a Path Constant has Size To Text and Left Justify Text.
 * The terminals' View As Icon is ticked by the general rule.
 */
const PATH_CONSTANT_MARKS = ["size-to-text", "left-justify-text"];
function pathMenuMarks(root, node) {
  if (root === PATH_PANEL_MENU) return ["advanced.allow-dropping", ...(node.tipo === "path-control" ? ["visible-items.browse-button"] : [])];
  return root === "context.path-constant" ? PATH_CONSTANT_MARKS : [];
}

/** Qué filas del menú llevan la marca: Terminals si el nodo los enseña, el modo actual, Invert si lo está, la representación de un número. */
export function marcados(d, ctx) {
  if (CP.hasConnectorMenu(d)) return CP.menuMarks(d);
  if (isGraphMenu(d)) return graphMenuMarks(d);
  const n = d.menu && d.g.nodos.find((k) => k.id === d.menu.nodo);
  if (!n) return new Set();
  const r = d.menu.raiz;
  const m = new Set();
  if (n.vista?.terminales) m.add(`${r}.visible-items.terminals`);
  if (!n.vista?.compacto) m.add(`${r}.view-as-icon`);
  for (const mark of VISA_MENU_MARKS[r] ?? []) m.add(`${r}.${mark}`);
  for (const mark of pathMenuMarks(r, n)) m.add(`${r}.${mark}`);
  if (n.config?.mode) m.add(`${r}.change-mode.${n.config.mode}`);
  if (n.config?.mechanical) m.add(`${r}.mechanical-action.${n.config.mechanical}`);
  const abrev = r.startsWith("context.numeric-") && NUMERICOS[n.config?.type ?? DBL]?.abrev;
  if (abrev) m.add(`${r}.representation.${abrev.toLowerCase()}`);
  // The representation of an array's element is the array's own; the string element shows the defaults LabVIEW ticks.
  const elementAbbreviation = [NUMERIC_ELEMENT_ROOT, "context.array-constant-element", PANEL_ARRAY_TERMINAL_MENU].includes(r) ? NUMERICOS[n.config?.type?.array]?.abrev : null;
  if (elementAbbreviation) m.add(`${r}.representation.${elementAbbreviation.toLowerCase()}`);
  if (r === `${NUMERIC_ELEMENT_ROOT}-string`) ["normal-display", "enable-wrapping"].forEach((row) => m.add(`${r}.${row}`));
  if ((n.config?.inverted ?? []).includes(d.menu.puerto ?? "result")) m.add(`${r}.invert`);
  if (n.tipo === "in-range-and-coerce") {
    if (n.config?.["include-upper-limit"]) m.add(`${r}.include-upper-limit`);
    if (n.config?.["include-lower-limit"] ?? true) m.add(`${r}.include-lower-limit`);
  }
  // Un bucle y su condición: el modo de la condición; en el bucle, Auto Grow y la «i» visibles de fábrica.
  const cond = condicionDe(d.g, n.id);
  if (cond) m.add(`${r}.${cond.config?.mode ?? "stop-if-true"}`);
  if (n.tipo === "while-loop" || n.tipo === "for-loop") {
    m.add(`${r}.auto-grow`);
    m.add(`${r}.visible-items.iteration-terminal`);
  }
  if (esCase(n) || esSecuencia(n)) m.add(`${r}.auto-grow`);
  if (esCase(n) && n.config?.caseInsensitive) m.add(`${r}.case-insensitive-match`);
  if (n.tipo === "case-tunnel-out" && n.config?.["use-default"]) m.add(`${r}.use-default-if-unwired`);
  // The name the row shows is checked in Select Item (stage 2, Q4); the index of a name is its place in the cluster.
  if (r === UN.ROW_MENU && ctx) {
    const index = UN.clusterElementNames(d.g, ctx.cat, n.id).indexOf(n.config.items[UN.rowOfPort(d.menu.puerto)]);
    if (index >= 0) m.add(`${r}.select-item.${index}`);
  }
  if (n.tipo === "tunnel-out") m.add(`${r}.tunnel-mode.${n.config?.indexado ? "indexing" : "last-value"}`);
  return m;
}

// ——— Create ▸ on a terminal, a wire or a whole node (spec/05 rule 72) ———

/** The id of the right-click menu of a wire (`menu.nodo` holds the wire's id). */
export const WIRE_MENU_ROOT = "context.wire";

/** The blocks whose value is typed into right after they are created (their constants have a text to edit). */
const TYPED_CONSTANTS = new Set(["num-const", "const", "str-const"]);

/**
 * What is typed into right after a Create, as LabVIEW leaves it
 * (REPORT.md §A): the value of a new numeric or string constant, selected, and
 * the label of a new control or indicator. The step of undo is closed before
 * (`edicion.nuevo`), so the typing is a step of its own. Several objects at
 * once (the "All" items) are left alone.
 */
function typeIntoCreated(d, ctx, ids) {
  const created = ids.length === 1 ? d.g.nodos.find((n) => n.id === ids[0]) : null;
  if (!created) return { ...d, seleccion: [] };
  if (TYPED_CONSTANTS.has(created.tipo)) {
    const typing = editar(d, ctx, created.id);
    return { ...typing, edicion: { ...typing.edicion, nuevo: true }, seleccion: [] };
  }
  if (created.label) return { ...d, edicion: { ...Et.editar(created), nuevo: true }, seleccion: [], accion: null };
  return { ...d, seleccion: [] };
}

/** Puts the reason a Create could not be done where the menu was opened. */
const withReason = (d, motivo) => ({ ...d, aviso: { texto: motivo, x: d.menu?.en?.x ?? 0, y: d.menu?.en?.y ?? 0 } });

/** Create ▸ Constant, Control or Indicator on the terminal `puerto` of `nodo`. */
export function createOnTerminal(d, ctx, nodo, puerto, kind) {
  if (!puerto) return d;
  const made = TC.createForTerminal(d.g, ctx, { nodo, puerto, kind, panelSize: ctx.panelSize });
  if (made.motivo) return withReason(d, made.motivo);
  return typeIntoCreated({ ...d, g: made.g, aviso: null }, ctx, [made.id]);
}

/** Create ▸ All Controls and Indicators, or All Constants, on a node. */
export function createOnNode(d, ctx, nodo, item) {
  const made = TC.createForNode(d.g, ctx, { nodo, kinds: TC.ALL_KINDS[item], panelSize: ctx.panelSize });
  if (made.motivo) return withReason(d, made.motivo);
  return typeIntoCreated({ ...d, g: made.g, aviso: null }, ctx, made.ids);
}

/** Create ▸ Constant, Control or Indicator on a wire: an unwired object at the point where the menu was opened. */
export function createOnWire(d, ctx, cable, kind) {
  const point = d.menu?.en ?? { x: 0, y: 0 };
  const made = TC.createOnWire(d.g, ctx, { cable, kind, point, panelSize: ctx.panelSize });
  if (made.motivo) return withReason(d, made.motivo);
  return typeIntoCreated({ ...d, g: made.g, aviso: null }, ctx, [made.id]);
}

// ——— Teclado ———

/** Esc cierra el menú, deja lo que se escribe sin cambiar o lo que está a medias; si no hay nada, vacía la selección. */
export function escape(d) {
  if (d.menu) return { ...d, menu: null };
  if (d.lista) return { ...d, lista: null };
  if (d.edicion) return { ...d, edicion: null };
  if (d.accion || d.aviso) return { ...d, accion: null, aviso: null };
  return { ...d, seleccion: [] };
}

/** What Delete and Cut take away: the selected nodes (and the nodes that go with them) apart from the wires selected. */
function selectionToDelete(d) {
  const nodo = (id) => d.g.nodos.find((n) => n.id === id);
  // Los terminales «i», condición y cuenta no se borran; un shift register se va con su pareja.
  const ids = d.seleccion.filter((id) => !esEtiqueta(id)).map(cableDe).filter((id) => !nodo(id)?.tipo.startsWith("loop-") && nodo(id)?.tipo !== "case-selector");
  const pares = ids.map((id) => nodo(id)?.config?.par).filter(Boolean);
  const todos = [...new Set([...ids, ...pares])];
  return { wires: todos.filter((id) => d.g.cables.some((wire) => wire.id === id)), nodes: todos.filter((id) => nodo(id)) };
}

/**
 * Where a deleted node leaves the loose end of each wire: at the terminal it had, as drawn. A node
 * with no terminal of that name (it should not happen) leaves it at its corner.
 */
export function terminalPlacer(ctx) {
  return (node, port) => {
    const terminal = ctx && node.tipo && terminales(node, ctx).find((candidate) => candidate.puerto === port);
    return terminal ? [terminal.x, terminal.y] : [node.x ?? 0, node.y ?? 0];
  };
}

/**
 * Supr y Retroceso borran la selección. Un tramo seleccionado borra su cable entero. Un nodo se va con
 * su contenido, pero **sus cables al resto se quedan, rotos, con un extremo suelto donde estaba el
 * terminal** (DT-046; labview-captures/broken-wires/REPORT.md §1). Ctrl+X, en cambio, se lleva los cables
 * (`borrarConCables`).
 */
export function borrarSeleccion(d, ctx) {
  const { wires, nodes } = selectionToDelete(d);
  if (!wires.length && !nodes.length) return d;
  const withoutWires = wires.length ? Gr.borrar(d.g, wires) : d.g;
  const g = nodes.length ? Gr.borrarDejandoCables(withoutWires, nodes, terminalPlacer(ctx)) : withoutWires;
  return { ...d, g, seleccion: [], aviso: null };
}

/** Ctrl+X: the nodes go with their wires, so nothing is left broken (REPORT.md §1). */
export function borrarConCables(d) {
  const { wires, nodes } = selectionToDelete(d);
  const todos = [...wires, ...nodes];
  return todos.length ? { ...d, g: Gr.borrar(d.g, todos), seleccion: [], aviso: null } : d;
}

/**
 * Ctrl+B, Edit ▸ Remove Broken Wires: every broken wire of the diagram, or with a selection only the broken
 * wires in it; selecting a node does not select its wires (REPORT.md §4). The same state when nothing goes.
 */
export function removeBrokenWires(d, ctx) {
  const selectedWires = d.seleccion.map(cableDe).filter((id) => d.g.cables.some((wire) => wire.id === id));
  const g = Gr.quitarCablesRotos(d.g, ctx.cat, d.seleccion.length ? selectedWires : undefined);
  if (g.cables.length === d.g.cables.length) return d;
  const remaining = new Set(g.cables.map((wire) => wire.id));
  const isRemoved = (id) => d.g.cables.some((wire) => wire.id === cableDe(id)) && !remaining.has(cableDe(id));
  return { ...d, g, seleccion: d.seleccion.filter((id) => !isRemoved(id)), menu: null, aviso: null };
}

/** El grafo cambió en la otra ventana: se toma, y lo que ya no existe deja de estar seleccionado. */
export function recibir(d, g) {
  const existe = new Set([...g.nodos.map((n) => n.id), ...g.cables.map((c) => c.id)]);
  const seleccion = d.seleccion.filter((id) => existe.has(id.split("#")[0]));
  const edicion = d.edicion && existe.has(d.edicion.nodo) ? d.edicion : null;
  return { ...d, g, seleccion, edicion, accion: null, menu: d.menu && existe.has(d.menu.nodo) ? d.menu : null };
}

/**
 * Las flechas mueven la selección un píxel; con Shift, 8 (spec/05 regla 36).
 * El salto de Shift sigue abierto en spec/05 §11, cuestión 3: 8 es provisional,
 * hasta comprobarlo en LabVIEW.
 */
export function flecha(d, tecla, shift, ctx) {
  const paso = shift ? 8 : 1;
  const [dx, dy] = { ArrowLeft: [-paso, 0], ArrowRight: [paso, 0], ArrowUp: [0, -paso], ArrowDown: [0, paso] }[tecla] ?? [0, 0];
  const nodos = d.seleccion.filter((id) => d.g.nodos.some((n) => n.id === id));
  if (!nodos.length || (!dx && !dy)) return d;
  return { ...d, g: ctx ? desplazar(d.g, ctx, nodos, dx, dy) : Gr.mover(d.g, nodos, dx, dy) };
}

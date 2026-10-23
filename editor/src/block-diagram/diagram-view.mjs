// El contenido del Block Diagram: nodos, terminales, cables y menús de clic
// derecho, como HTML.
//
// Geometría y pintado puros, sin DOM, para que la vista y los tests midan lo
// mismo. Las posiciones son píxeles CSS dentro del lienzo. Lo que se calca sale
// de labview-captures/block-diagram/numeric-*.png y del vídeo del que se
// sacaron (numeric-cablear.mp4); las medidas, en píxeles del vídeo, que son los
// de la pantalla a 150 %, entre 1,5.

import * as Et from "../common/labels.mjs";
import * as G from "../common/glyphs.mjs";
import { esHueco, ultimo } from "../common/labview-inventory.mjs";
import * as CV from "../../../core/model/control-values.mjs";
import { PANE_SIZE } from "../../../core/model/connector.mjs";
import { isSubVI, portsWithAnchors } from "./subvi-nodes.mjs";
import * as FN from "./format-nodes.mjs";
import * as UN from "./unbundle-by-name.mjs";
import * as Gr from "../../../core/model/graph.mjs";
import { brokenWireMarks, endPoint } from "./broken-wire.mjs";
import { CONSTANTES_MATEMATICAS } from "../../../core/model/math-constants.mjs";
import { COLORES, CONSTANT_DIGITS, aspecto, isUndefinedArray, esArray, esCluster, esEntero, esEnum, esError, esNumerico, formatear, nombre } from "../../../core/model/types.mjs";
import { GRAPH_KINDS, labelShown } from "../front-panel/graph-state.mjs";
import { elementMenuRoot } from "../common/array-typing.mjs";
import { MAX_EDITOR_DIMENSIONS, cellAddress, dimensionsOfNode, firstShown, isDefined, readCell, visibleGrid } from "../common/array-grid.mjs";

const esNumericoNoEntero = (t) => typeof t === "string" && esNumerico(t) && !esEntero(t);

const px = (n) => `${Number(n.toFixed(2))}px`;
const f2 = (n) => Number(n.toFixed(2));
const esc = (t) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * Qué glifo lleva cada bloque: el del elemento de la paleta que lo pone. Sale
 * del campo `bloque` del inventario.
 */
export function glifosPorBloque(inv) {
  const m = new Map();
  for (const e of inv.entradas) if (e.bloque && G.FUNCIONES[ultimo(e.id)] && !m.has(e.bloque)) m.set(e.bloque, ultimo(e.id));
  return m;
}

/**
 * Lo que comparten la geometría y el pintado: el catálogo, los glifos, el
 * separador decimal del sistema y cómo se mide un texto en la fuente de la
 * ventana, para las etiquetas.
 */
export const contexto = (cat, glifos, separador = ".", medir = Et.medirAproximado) => ({ cat, glifos, separador, medir });

/** The nodes that grow by 8 px for each dimension beyond the first, as LabVIEW stretches them by itself (array-2d/indexarray-2d-node-icon.png). */
const NODOS_POR_DIMENSION = new Set(["index-array", "initialize-array"]);
const tieneDosDimensiones = (n) => NODOS_POR_DIMENSION.has(n.tipo) && n.config?.dims === 2;

/**
 * Where the inputs of those nodes with two dimensions sit, from the top of the node, in px: the array (or the element)
 * and then one index (or size) per dimension 8 px apart (measured in array-2d/initializearray-contexthelp.png).
 */
export const ENTRADAS_DOS_DIMENSIONES = [9.5, 22.5, 30.5];
export const PASO_ENTRADAS_DOS_DIMENSIONES = 8;

/** El glifo de un nodo: el de su elemento de la paleta; el de una constante booleana, según su valor; el de dos dimensiones, el suyo. */
const glifoDe = (n, ctx) => {
  if (n.tipo === "bool-const") return n.config?.value ? "true-constant" : "false-constant";
  const glifo = ctx.glifos.get(n.tipo);
  return tieneDosDimensiones(n) ? `${glifo}-2d` : glifo;
};

const tipoConfig = (n, ctx) => n.config?.type ?? ctx.cat.bloque(n.tipo).config?.default?.type ?? "number";

/**
 * Constantes que LabVIEW pinta en el diagrama como una caja con su valor, y no
 * con su icono de la paleta; el borde es el color de su tipo. `editable`: se
 * escribe en ellas con doble clic.
 */
export const CONSTANTES = {
  "num-const": { editable: true, texto: (n, ctx) => formatear(n.config?.value ?? 0, tipoConfig(n, ctx), ctx.separador, CONSTANT_DIGITS) },
  const: { editable: true, texto: (n, ctx) => formatear(n.config?.value ?? 0, "number", ctx.separador, CONSTANT_DIGITS) },
  "positive-infinity": { texto: () => "+Inf" },
  "negative-infinity": { texto: () => "-Inf" },
  ...Object.fromEntries(Object.entries(CONSTANTES_MATEMATICAS).map(([n, k]) => [n, { texto: () => k.simbolo }])),
  // Cadenas: una caja con el borde rosa. La de la paleta se escribe, con varias líneas
  // (Intro baja de línea y se confirma con Enter Text o con un clic fuera); las fijas
  // llevan un signo y no se editan.
  "str-const": { editable: true, cadena: true, texto: (n) => n.config?.value ?? "" },
  ...Object.fromEntries(Object.entries(G.SIGNOS_CADENA).map(([id, signo]) => [id, { cadena: true, texto: () => signo }])),
  // La constante de error (labview-captures/errores/202.png): tres celdas, status, code y source;
  // un clic en la del status la alterna, y un doble clic en las otras escribe en ellas.
  "error-cluster-constant": { editable: true, error: true, texto: () => "" },
  // La constante de array (labview-captures/array/constante-array.png): el índice y una caja con sus elementos.
  "arr-const": { editable: true, array: true, texto: () => "" },
  // An enum or a ring shows the name of its current item and widens with it (measured,
  // enum report 2026-10-14, question 6; DT-049).
  "enum-const": { texto: (n) => (n.config?.type?.enum ?? [])[n.config?.value ?? 0] ?? "", selector: true },
  "ring-const": { texto: (n) => (n.config?.items ?? [])[n.config?.value ?? 0] ?? "", selector: true },
};

/** Medidas de una constante: «32» ocupa 27 × 27 px del vídeo y «43,3», 39 × 27. */
export const MEDIDAS_CONSTANTE = { alto: 18, borde: 2, relleno: 5, minimo: 13 };
/**
 * Una constante de cadena (labview-captures/string/bd-string-constant*.png, a 1:1): 15 × 19 px
 * vacía, y 22 × 34 con «ab» y «cd» en dos líneas; es decir, 15 px de alto por línea más 4, y
 * el texto más 8 de ancho, con 15 de mínimo.
 */
/**
 * La constante de error, medida en labview-captures/errores/202.png ampliada ×6: 22 × 57 px con
 * un marco oliva de 1 px y, dentro, la celda del status (F, borde verde), la del code (0, borde
 * azul) y la del source (borde rosa, con su hueco blanco), de 11, 19 y 19 px de alto.
 */
export const MEDIDAS_CONSTANTE_ERROR = { ancho: 22, alto: 57, celdas: [11, 19, 19], borde: 3 };
export const MEDIDAS_CADENA = { linea: 15, vertical: 4, horizontal: 8, minimo: 15 };
/**
 * The array constant, measured at 1:1 in labview-captures/array/constante-array.png, array-typing/const-num.png and
 * defined-const.png (an I32 element, [5, 7] shown in three): the index, 32 × 21 px, and against its right the shell,
 * 25 px tall: a line, 1 px of white and a second line (3 px on each side) round tiles as wide as a 2D constant's
 * (13 × 19 for one digit), which abut.
 */
export const MEDIDAS_ARRAY = { indice: 32, altoIndice: 21, alto: 25, margenCaja: 3 };
/**
 * A constant with two dimensions, measured at 1:1 in labview-captures/array-2d/constant-2d-empty.png,
 * constant-2d-2x3-values.png and constant-2d-stretched-4x9-empty.png (DBL, #ff7f00):
 * - the index block is 32 × 38: a 1 px frame, 1 px of white and another frame around two 15 px cells
 *   (the first at y + 3, the second at y + 20) that a 2 px bar of the type color separates; each cell is
 *   a 5 px spinner, a 2 px bar and a 19 px field;
 * - the element box sits flush against the index block, at the top, with the same three layers (frame,
 *   white, frame) and then the tiles: 13 px wide (the white cell is 9) and 19 px tall (15), no gaps;
 *   13 × columns + 6 wide and 19 × rows + 6 tall, so the empty constant is 51 × 38;
 * - a tile the value defines is solid in the type color; one outside the value is pale (#ffcc99 for
 *   DBL) with a grey default.
 */
export const MEDIDAS_ARRAY_2D = { indice: 32, altoIndice: 38, margenCaja: 3, anchoCelda: 13, altoCelda: 19, textoExtra: 6 };

/** The type of the elements of an array constant, and its values. */
export const tipoElementoArray = (n) => n.config?.type?.array ?? "number";
export const valoresArray = (n) => n.config?.value ?? [];
/** How many elements the constant shows: the ones it was stretched to (one by default). */
export const visiblesArray = (n) => visibleGrid(n.config).columns;
const textoElemento = (v, t, sep) => (t === "string" ? String(v ?? "") : t === "boolean" ? (v ? "T" : "F") : formatear(v ?? 0, t, sep, CONSTANT_DIGITS));

/** The address of the cell that sits at that row and column of the box. */
function addressShown(n, rowInBox, columnInBox) {
  const dimensions = dimensionsOfNode(n.config);
  const first = firstShown(n.config);
  return cellAddress(dimensions, first.row + rowInBox, first.column + columnInBox);
}

/** The text a cell shows: what is being typed into it, or its element. */
function cellText(n, address, ctx, edicion) {
  if (edicion?.nodo === n.id && edicion.elem === address) return edicion.texto;
  return textoElemento(readCell(valoresArray(n), dimensionsOfNode(n.config), address), tipoElementoArray(n), ctx.separador);
}

/** The widest text among the cells the constant shows. */
function widestShownText(n, ctx, edicion) {
  const { rows, columns } = visibleGrid(n.config);
  let widest = 0;
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) widest = Math.max(widest, anchoTexto(cellText(n, addressShown(n, row, column), ctx, edicion)));
  }
  return widest;
}

/**
 * The width of each element's tile, which is also the pitch: the widest of the ones shown, 13 px at least, with one
 * dimension or two.
 */
export function anchoElementoArray(n, ctx, edicion) {
  const widest = widestShownText(n, ctx, edicion);
  return Math.max(MEDIDAS_ARRAY_2D.anchoCelda, Math.ceil(widest) + MEDIDAS_ARRAY_2D.textoExtra);
}

/** The size of the box of elements of a constant with two dimensions. */
function box2D(n, ctx, edicion) {
  const { rows, columns } = visibleGrid(n.config);
  const margin = 2 * MEDIDAS_ARRAY_2D.margenCaja;
  return { ancho: columns * anchoElementoArray(n, ctx, edicion) + margin, alto: rows * MEDIDAS_ARRAY_2D.altoCelda + margin };
}
const ANCHOS = { ",": 3, ".": 3, "-": 4, "+": 7, " ": 3 };
/** El ancho de un texto en la fuente del diagrama, a falta de medirlo en pantalla. */
export const anchoTexto = (t) => [...t].reduce((s, c) => s + (ANCHOS[c] ?? (/\d/.test(c) ? 6.4 : 7)), 0);

/** Glifos con forma de triángulo: su vista de terminales se recorta así. */
const TRIANGULOS = new Set([
  "equal", "not-equal", "greater", "less", "greater-or-equal", "less-or-equal", "equal-to-0", "not-equal-to-0", "greater-than-0", "less-than-0", "greater-or-equal-to-0", "less-or-equal-to-0",
  "not-a-number-path-refnum",
  "add", "subtract", "multiply", "divide", "increment", "decrement", "add-array-elements", "multiply-array-elements", "and-array-elements", "or-array-elements",
  "absolute-value", "round-to-nearest", "round-toward-negative-infinity", "round-toward-positive-infinity",
  "scale-by-power-of-2", "square-root", "square", "negate", "reciprocal", "sign",
]);

/**
 * Compound Arithmetic no se pinta con su icono de la paleta: es una columna de
 * celdas, una por entrada, y a su derecha el símbolo del modo. Es un píxel más
 * ancho que Add (22 px): 23. Las proporciones, de compound-and.png, donde mide
 * 36 px del vídeo de ancho, con la columna izquierda de 19 y celdas de 12.
 */
const ANCHO_COMPUESTO = 23;
export const MEDIDAS_COMPUESTO = {
  izquierda: ANCHO_COMPUESTO * (19 / 36),
  derecha: ANCHO_COMPUESTO * (17 / 36),
  celda: ANCHO_COMPUESTO * (12.1 / 36),
  asa: 4,
};
const esCompuesto = (n, ctx) => ctx.cat.bloque(n.tipo).in === "dynamic:compound-inputs";
/**
 * Concatenate Strings, que se estira como Compound Arithmetic, mide 31 × 17 px con dos
 * entradas (labview-captures/string/bd-funciones-1.png): 15 de columna de terminales, 16 de
 * símbolo y 8,5 por celda.
 */
const MEDIDAS_CONCATENAR = { izquierda: 15, derecha: 16, celda: 8.5, asa: 4 };
/** Merge Errors mide 32 × 18 px con dos entradas (labview-captures/errores/71.png, a 1:1). */
const MEDIDAS_MERGE = { izquierda: 16, derecha: 16, celda: 9, asa: 4 };
export const medidasCompuesto = (n, ctx) => {
  const b = ctx.cat.bloque(n.tipo);
  return b.medidas === "merge" ? MEDIDAS_MERGE : b.simbolo ? MEDIDAS_CONCATENAR : MEDIDAS_COMPUESTO;
};

/**
 * Expression Node: tres celdas, el terminal de entrada, el texto y el de salida
 * (block-diagram/numeric-expression-node.png: 24 × 17 px con «x»; 7,5 px a cada
 * lado). El ancho sigue al texto.
 */
export const MEDIDAS_EXPRESION = { alto: 17, lado: 7.5, minimoTexto: 8.7, relleno: 2 };
const esExpresion = (n) => n.tipo === "expression-node";
const textoExpresion = (n, edicion) => (edicion?.nodo === n.id ? edicion.texto : (n.config?.expression ?? "x"));

/** El texto que enseña una constante: el que se está escribiendo, si es ella. */
function textoConstante(n, ctx, edicion) {
  if (edicion?.nodo === n.id) return edicion.texto;
  return CONSTANTES[n.tipo].texto(n, ctx);
}

/**
 * El terminal de un control o un indicador: con vista de icono, 38 × 38 px, y
 * compacto, 32 × 16, medidos a 1:1 en block-diagram/boolean-terminales-icono.png
 * y boolean-terminal-compacto.png (y los de Numeric, que son los mismos).
 * `flecha` es la altura de su flecha, por donde entra o sale el cable.
 */
export const MEDIDAS_TERMINAL_PANEL = { icono: { ancho: 38, alto: 38, flecha: 19.5 }, compacto: { ancho: 32, alto: 16, flecha: 8.5 } };
const esDelPanel = (n, ctx) => !!ctx.cat.bloque(n.tipo).panel;
const medidasPanel = (n) => MEDIDAS_TERMINAL_PANEL[n.vista?.compacto ? "compacto" : "icono"];

/** Separación entre un terminal del panel y su etiqueta, en el diagrama. */
const HUECO_ETIQUETA = 3;

// ——— Structures (M4, DT-041) ———
//
// A While Loop or a For Loop is a node with `tam`; what sits on its border
// —iteration, condition and count terminals, tunnels and shift registers— are
// small nodes with `dentro` stuck to it, and their position (x, y) is set by
// `fijarBordes` in diagram-editing.mjs. Measured from labview-captures/structures/, at 1:1.
export const MEDIDAS_ESTRUCTURA = {
  minimo: 48, // tamaño mínimo, y el de un bucle que se suelta con un clic
  borde: 6, // grosor del marco de un While
  terminal: 16, // «i», «N» y la condición
  izquierdaI: 10, // de la izquierda del bucle a «i»
  sobreElPie: 26, // de arriba de «i» y de la condición al pie del bucle
  asa: 6, // las asas de estirar: cuadritos azules de 6 × 6 metidos en las esquinas y en el centro de los lados
};
/** Tamaño de cada nodo del borde de una estructura. */
export const TAM_BORDE = {
  "loop-iteration": [16, 16], "loop-condition": [16, 16], "loop-count": [16, 16],
  "tunnel-in": [9, 9], "tunnel-out": [9, 9],
  "shift-register-left": [16, 12], "shift-register-right": [16, 12],
  "case-selector": [8, 12], "case-tunnel-out": [9, 9],
};
export const esEstructura = (n, ctx) => !!ctx.cat.bloque(n.tipo).estructura;
export const esBorde = (n) => n.tipo in TAM_BORDE;

// ——— Case Structure (M4, DT-041) ———
//
// Sus marcos viven en `config.marcos` y el que se ve en `config.activo`; cada
// nodo de un marco lleva `marco: k`. Sólo se pinta, y sólo se pulsa, lo del marco
// que se ve. Medidas de labview-captures/structures/case-*.png.
export const esCase = (n) => n.tipo === "case-structure";
export const marcosDe = (n) => n.config?.marcos ?? [];
export const activoDe = (n) => Math.min(n.config?.activo ?? 0, Math.max(0, marcosDe(n).length - 1));
/** ¿Los marcos del Case son de un selector booleano (False y True)? */
export const esBooleano = (n) => marcosDe(n).some((m) => (m.valores ?? []).some((v) => typeof v === "boolean"));

/**
 * What a Case selector carries, as far as its frames are concerned: `"string"`,
 * an enum type (`{ enum: [...] }`) or `undefined` for a Boolean or a number. Read
 * from the wire into the selector terminal, from `resolved` (the types of the
 * graph, `Gr.tipos`).
 */
export function selectorKind(graph, caseNode, resolved) {
  const selector = graph.nodos.find((n) => n.dentro === caseNode.id && n.tipo === "case-selector");
  const wire = selector && graph.cables.find((c) => c.a.nodo === selector.id);
  const type = wire && resolved?.cables.get(wire.id)?.tipo;
  return type === "string" || esEnum(type) ? type : undefined;
}

const quoted = (text) => `"${text}"`;

/**
 * One value of a frame as its selector shows it: strings and enum items in quotes, enum
 * items by name (a frame's enum values are the item names, DT-049).
 */
function labelOfValue(value, kind) {
  const bound = (v) => (v === undefined || v === null ? "" : typeof v === "string" ? quoted(v) : String(v));
  if (typeof value === "boolean") return value ? "True" : "False";
  if (value && typeof value === "object") {
    // LabVIEW shows two adjacent enum items as a list, not as a range (enum report, point 5).
    if (esEnum(kind) && kind.enum.indexOf(value.max) - kind.enum.indexOf(value.min) === 1) return `${bound(value.min)}, ${bound(value.max)}`;
    return `${bound(value.min)}..${bound(value.max)}`;
  }
  return bound(value);
}

/**
 * Whether every value of a frame names an item of the enum selector. A name that is
 * not an item — a stale one, left by deleting the item in Edit Items — is drawn in
 * red and breaks the Case, as in LabVIEW (measured, DT-049).
 */
export function frameMatchesItems(m, kind) {
  const isItem = (name) => kind.enum.includes(name);
  return (m.valores ?? []).every((v) => (typeof v === "string" ? isItem(v) : v && typeof v === "object" ? (v.min === undefined || isItem(v.min)) && (v.max === undefined || isItem(v.max)) : false));
}

/**
 * How a frame is called: its values separated by commas (ranges, «2..4») and
 * «Default» at the end if it is («0, Default»); False and True in a Boolean one.
 * With a string or an enum selector (`kind`) the values are in quotes
 * (`"abc"`, `"a".."c"`, `"Init", Default`).
 */
export function etiquetaMarco(m, kind) {
  const partes = (m.valores ?? []).map((v) => labelOfValue(v, kind));
  if (m.default) partes.push("Default");
  return partes.join(", ");
}

// ——— Flat y Stacked Sequence (M4, DT-041) ———
//
// Como el Case, guardan sus marcos en `config.marcos` y lo de cada marco lleva
// `marco: k`. La Flat enseña todos a la vez, uno al lado del otro y cada uno
// con su ancho (`marcos[k].ancho`, borde incluido); la Stacked, sólo el que dice
// `config.activo`, con su selector. Medidas de labview-captures/structures/secuencia-*.png.
export const MEDIDAS_SECUENCIA = G.MEDIDAS_SECUENCIA;
export const esFlat = (n) => n.tipo === "flat-sequence";
export const esApilada = (n) => n.tipo === "stacked-sequence";
export const esSecuencia = (n) => esFlat(n) || esApilada(n);
/** ¿Enseña un solo marco, con su selector de marcos? */
export const conSelector = (n) => esCase(n) || esApilada(n);

/**
 * El ancho de cada marco. En la Stacked, todos el de la estructura menos el
 * borde; en la Flat, el que guardan, o, si no lo guardan (una secuencia recién
 * creada o leída de un fichero antiguo), el espacio repartido por igual.
 */
export function anchosMarcos(n) {
  const S = G.MEDIDAS_SECUENCIA;
  const marcos = marcosDe(n);
  const dentro = n.tam.ancho - 2 * S.lado;
  if (esApilada(n)) return marcos.map(() => dentro);
  if (marcos.length && marcos.every((m) => m.ancho !== undefined)) return marcos.map((m) => m.ancho);
  const libre = dentro - S.separador * (marcos.length - 1);
  const base = Math.floor(libre / marcos.length);
  return marcos.map((_, k) => (k === marcos.length - 1 ? libre - base * (marcos.length - 1) : base));
}
/** La x de cada marco, desde la esquina de la estructura. */
export const izquierdasMarcos = (n) => G.izquierdasSecuencia(anchosMarcos(n));
/** El ancho que tiene una Flat con esos marcos: los bordes, los marcos y lo que los separa. */
export const anchoSecuencia = (anchos) => 2 * G.MEDIDAS_SECUENCIA.lado + anchos.reduce((a, b) => a + b, 0) + G.MEDIDAS_SECUENCIA.separador * (anchos.length - 1);
/** El marco de una Flat que hay en la x del lienzo `x`: el más cercano, repartiendo cada separador a medias. */
export function marcoEnX(n, x) {
  const [xs, as] = [izquierdasMarcos(n), anchosMarcos(n)];
  const r = x - n.x;
  const k = xs.findIndex((x0, i) => r < x0 + as[i] + G.MEDIDAS_SECUENCIA.separador / 2);
  return k < 0 ? xs.length - 1 : k;
}
/**
 * Los nombres de los marcos en su selector y en su lista: en un Case, lo que
 * valen; en una Stacked, su número y cuántos hay, «1 [0..2]» (secuencia-8.png).
 */
export function textosMarcos(n, kind) {
  const ms = marcosDe(n);
  return esApilada(n) ? ms.map((_, k) => `${k} [0..${ms.length - 1}]`) : ms.map((m) => etiquetaMarco(m, kind));
}

/** ¿Está el nodo en un marco de un Case o una Stacked que no es el que se ve? Entonces no se pinta ni se pulsa. */
export function oculto(g, n) {
  for (let k = n; ; ) {
    const p = k.dentro && g.nodos.find((x) => x.id === k.dentro);
    if (!p) return false;
    if (k.marco !== undefined && conSelector(p) && activoDe(p) !== k.marco) return true;
    k = p;
  }
}

/** Un terminal del túnel de salida de un Case que no es el del marco que se ve no se pinta ni se pulsa. */
const terminalVisible = (n, t, g) => {
  if (n.tipo !== "case-tunnel-out" || t.dir !== "in") return true;
  const caso = g.nodos.find((k) => k.id === n.dentro);
  return !caso || Number(t.puerto.slice(2)) === activoDe(caso);
};

/**
 * The face of a border node (tunnel, shift register…) that a wire going `wireDirection` way can
 * end on. A tunnel is 9 px wide and its two faces are its two halves, so where exactly the wire is
 * dropped should not decide which one it takes: as in LabVIEW, the wire's direction does
 * (real-programs-0.3.md B2). `terminal` is what was hit; anything that is not a border node, or
 * that already faces the right way, is returned as it is.
 */
export function borderFaceFor(g, ctx, terminal, wireDirection) {
  const n = g.nodos.find((candidate) => candidate.id === terminal.nodo);
  if (!n || !esBorde(n) || terminal.dir !== wireDirection) return terminal;
  const faces = terminales(n, ctx).filter((t) => t.dir !== wireDirection && terminalVisible(n, t, g));
  return faces.length === 1 ? { nodo: n.id, puerto: faces[0].puerto, dir: faces[0].dir } : terminal;
}

/**
 * The graph with only what shows: without the nodes of hidden frames, the wires that reach them,
 * and the wires that end on the input of an output tunnel for a hidden frame. A wire from one
 * tunnel straight to another joins two border nodes, which always show, yet it belongs to one frame.
 */
export function visibles(g) {
  const fuera = new Set(g.nodos.filter((n) => oculto(g, n)).map((n) => n.id));
  const nodoPorId = new Map(g.nodos.map((n) => [n.id, n]));
  const llegaAMarcoOculto = (c) => !terminalVisible(nodoPorId.get(c.a.nodo) ?? {}, { dir: "in", puerto: c.a.puerto }, g);
  const cables = g.cables.filter((c) => !fuera.has(c.de.nodo) && !fuera.has(c.a.nodo) && !llegaAMarcoOculto(c));
  if (!fuera.size && cables.length === g.cables.length) return g;
  return { ...g, nodos: g.nodos.filter((n) => !fuera.has(n.id)), cables };
}

/**
 * Las medidas del selector de marcos de un Case de ancho `ancho`: el del texto
 * más ancho de sus marcos (o el que se escribe) y centrado en el borde de arriba.
 * Devuelve lo que ocupa, dónde empieza (desde la esquina del Case) y el texto.
 */
export function medidasSelector(n, ctx, edicion, kind) {
  const M = G.SELECTOR_MARCOS;
  const escribiendo = edicion?.marco && edicion.nodo === n.id;
  const textos = textosMarcos(n, kind).map((t, k) => (escribiendo && k === activoDe(n) ? edicion.texto : t));
  const anchoTexto = (t) => ctx.medir(t);
  const texto = Math.ceil(Math.max(0, ...textos.map(anchoTexto))) + M.sobraTexto;
  const ancho = texto + 18;
  const actual = textos[activoDe(n)] ?? "";
  return { texto, ancho, x: Math.floor((n.tam.ancho - ancho) / 2), actual, anchoActual: anchoTexto(actual) };
}

/** La caja de una asa de estirar, en las coordenadas de la caja `k` de la estructura: ocho, por los puntos de la brújula. */
export function cajaAsa(lado, k) {
  const A = MEDIDAS_ESTRUCTURA.asa;
  const x = lado.includes("w") ? 0 : lado.includes("e") ? k.ancho - A : k.ancho / 2 - A / 2;
  const y = lado.includes("n") ? 0 : lado.includes("s") ? k.alto - A : k.alto / 2 - A / 2;
  return { x, y, ancho: A, alto: A };
}
export const ASAS = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

/** Cuántas estructuras hay por fuera de un nodo: el orden en que se pintan, de fuera a dentro. */
function profundidad(g, n) {
  let r = 0;
  for (let a = n.dentro; a; a = g.nodos.find((k) => k.id === a)?.dentro) r++;
  return r;
}

/**
 * La etiqueta de un terminal que nunca se ha movido: a la izquierda de un
 * control y a la derecha de un indicador, a media altura, como en
 * numeric-terminales-icono.png.
 */
function etiquetaPorDefecto(n, ctx) {
  const salida = ctx.cat.puertos(n).out.length > 0;
  return (k, tam) => [salida ? -(tam.ancho + HUECO_ETIQUETA) : k.ancho + HUECO_ETIQUETA, (k.alto - tam.alto) / 2];
}

/** La caja de la etiqueta de un nodo en el diagrama, o nada si no tiene. */
export function cajaEtiqueta(n, ctx, edicion) {
  if (!n.label) return null;
  return Et.caja(n, "diagrama", caja(n, ctx, edicion), etiquetaPorDefecto(n, ctx), ctx.medir, edicion);
}

/** La caja de un nodo: su posición es la esquina de la tinta de su icono. */
export function caja(n, ctx, edicion) {
  if (esEstructura(n, ctx)) return { x: n.x, y: n.y, ancho: n.tam.ancho, alto: n.tam.alto };
  if (esBorde(n)) return { x: n.x, y: n.y, ancho: TAM_BORDE[n.tipo][0], alto: TAM_BORDE[n.tipo][1] };
  if (esDelPanel(n, ctx)) {
    const M = medidasPanel(n);
    return { x: n.x, y: n.y, ancho: M.ancho, alto: M.alto };
  }
  if (isSubVI(n)) return { x: n.x, y: n.y, ancho: PANE_SIZE, alto: PANE_SIZE };
  if (FN.isFormatNode(n, ctx.cat)) return { x: n.x, y: n.y, ...FN.formatNodeSize(n, ctx.cat) };
  if (UN.isUnbundleByName(n)) return { x: n.x, y: n.y, ...UN.unbundleSize(n, ctx.cat, ctx.medir) };
  if (esExpresion(n)) {
    const M = MEDIDAS_EXPRESION;
    return { x: n.x, y: n.y, ancho: 2 * M.lado + Math.max(M.minimoTexto, anchoTexto(textoExpresion(n, edicion)) + M.relleno), alto: M.alto };
  }
  if (esCompuesto(n, ctx)) {
    const M = medidasCompuesto(n, ctx);
    const entradas = ctx.cat.puertos(n).in.length;
    return { x: n.x, y: n.y, ancho: M.izquierda + M.derecha, alto: entradas * M.celda };
  }
  const c = CONSTANTES[n.tipo];
  if (c?.array && !isUndefinedArray(n.config?.type) && dimensionsOfNode(n.config) === 2) {
    const box = box2D(n, ctx, edicion);
    return { x: n.x, y: n.y, ancho: MEDIDAS_ARRAY_2D.indice + box.ancho, alto: Math.max(MEDIDAS_ARRAY_2D.altoIndice, box.alto) };
  }
  if (c?.array && isUndefinedArray(n.config?.type)) {
    return { x: n.x, y: n.y, ancho: MEDIDAS_ARRAY_INDEFINIDA.indice + MEDIDAS_ARRAY_INDEFINIDA.caja, alto: MEDIDAS_ARRAY_INDEFINIDA.caja };
  }
  if (c?.array) {
    const A = MEDIDAS_ARRAY;
    return { x: n.x, y: n.y, ancho: A.indice + visiblesArray(n) * anchoElementoArray(n, ctx, edicion) + 2 * A.margenCaja, alto: A.alto };
  }
  if (c?.error) return { x: n.x, y: n.y, ancho: MEDIDAS_CONSTANTE_ERROR.ancho, alto: MEDIDAS_CONSTANTE_ERROR.alto };
  if (c?.cadena) {
    const M = MEDIDAS_CADENA;
    const size = (text) => {
      const lineas = text.split("\n");
      return { ancho: Math.max(M.minimo, Math.max(...lineas.map(anchoTexto)) + M.horizontal), alto: lineas.length * M.linea + M.vertical };
    };
    return constantBox(n, ctx, edicion, size);
  }
  if (c) {
    const M = MEDIDAS_CONSTANTE;
    return constantBox(n, ctx, edicion, (text) => ({ ancho: Math.max(M.minimo, anchoTexto(text) + M.relleno) + (c.selector ? 9 : 0), alto: M.alto }));
  }
  const [x0, y0, x1, y1] = G.CAJAS[glifoDe(n, ctx)] ?? [8, 8, 41, 41];
  return { x: n.x, y: n.y, ancho: (x1 - x0) / 1.5, alto: (y1 - y0) / 1.5, dx: x0 / 1.5, dy: y0 / 1.5 };
}

/**
 * The box of a constant that shows one text, `size(text)` wide and tall. While it is being
 * typed into it grows to the left: its right edge, where its wire leaves, stays where the
 * stored text puts it (measured on a wired constant, `reports/2026-10-15-editor-b12-b13-b7.md`
 * §1; that it grows so while typing, and on an unwired constant, is unverified).
 */
function constantBox(n, ctx, edicion, size) {
  const shown = size(textoConstante(n, ctx, edicion));
  const growth = edicion?.nodo === n.id ? shown.ancho - size(textoConstante(n, ctx)).ancho : 0;
  return { x: n.x - growth, y: n.y, ...shown };
}

/** The least width of a terminal's hot zone, so that a small node's terminals can still be hit. */
const MIN_TERMINAL_ZONE = 6;
/**
 * A constant boxes its value and is moved by it, so only its right edge wires: with half of it, a
 * short constant (`5`, `%f`) could not be dragged at all (real-programs-0.3.md B11). LabVIEW's own
 * width is unverified.
 */
const CONSTANT_OUTPUT_ZONE = MIN_TERMINAL_ZONE;

/**
 * How wide the hot zone of each terminal of `n` is. Each side takes somewhat more than a third of
 * the node and the middle is the body, which is what is grabbed to move it; a border object is
 * split between its two faces.
 */
function terminalZoneWidth(n, k, ctx, ins, outs) {
  if (esBorde(n)) return k.ancho / (ins.length && outs.length ? 2 : 1);
  if (esCompuesto(n, ctx)) return medidasCompuesto(n, ctx).izquierda * 0.7;
  if (CONSTANTES[n.tipo]) return CONSTANT_OUTPUT_ZONE;
  return Math.max(MIN_TERMINAL_ZONE, k.ancho * (ins.length ? 0.36 : 0.5));
}

/**
 * Los terminales de un nodo: las entradas repartidas por el borde izquierdo y
 * las salidas por el derecho, en el orden del catálogo, como el connector
 * pane de las primitivas de LabVIEW (Add: x arriba, y abajo, x+y en la punta).
 * `x`, `y` es donde entra el cable; `zona`, lo que se pulsa, y `centro`, de
 * donde sale el cable mientras se tira de él, como en LabVIEW.
 */
export function terminales(n, ctx, edicion) {
  const k = caja(n, ctx, edicion);
  if (isSubVI(n)) return terminalesSubVI(n, k, ctx);
  if (FN.isFormatNode(n, ctx.cat)) return FN.formatNodeTerminals(n, k, ctx.cat);
  if (UN.isUnbundleByName(n)) return UN.unbundleTerminals(n, k, ctx.cat);
  const { in: ins, out: outs } = ctx.cat.puertos(n);
  const anchoZona = terminalZoneWidth(n, k, ctx, ins, outs);
  // Un terminal del panel recibe o da el dato por su flecha.
  const flecha = esDelPanel(n, ctx) ? medidasPanel(n).flecha : null;
  const reparte = (lista, dir) =>
    lista.map((p, i0) => {
      // El túnel de salida de un Case tiene una entrada por marco, pero todas en el mismo sitio.
      const [i, cuantos] = n.tipo === "case-tunnel-out" && dir === "in" ? [0, 1] : [i0, lista.length];
      const fija = dir === "in" && tieneDosDimensiones(n);
      const alto = fija ? PASO_ENTRADAS_DOS_DIMENSIONES : k.alto / cuantos;
      const arriba = fija ? k.y + ENTRADAS_DOS_DIMENSIONES[i] - alto / 2 : k.y + alto * i;
      const zona = { x: dir === "in" ? k.x : k.x + k.ancho - anchoZona, y: arriba, ancho: anchoZona, alto };
      return {
        puerto: p.name,
        // Una constante no tiene nombre en su terminal: LabVIEW no enseña tip.
        etiqueta: p.label ?? p.name,
        dir,
        x: dir === "in" ? k.x : k.x + k.ancho,
        y: flecha !== null ? k.y + flecha : fija ? k.y + ENTRADAS_DOS_DIMENSIONES[i] : k.y + alto * (i + 0.5),
        zona,
        centro: { x: zona.x + zona.ancho / 2, y: zona.y + zona.alto / 2 },
      };
    });
  return [...reparte(ins, "in"), ...reparte(outs, "out")];
}

/**
 * The size of the area of a subVI terminal that is clicked to wire it, centred on the edge of the icon
 * (the wire touches the border of the icon: labview-captures/subvi/caller-x-unwired-diagram.png).
 */
const SUBVI_TERMINAL_ZONE = 6;

/** The terminals of a subVI node: each one on the edge of the icon next to its connector cell (core/model/connector.mjs). */
function terminalesSubVI(n, k, ctx) {
  const half = SUBVI_TERMINAL_ZONE / 2;
  return portsWithAnchors(n, ctx.cat).map((port) => {
    const [x, y] = [k.x + port.anchor.x, k.y + port.anchor.y];
    return {
      puerto: port.name,
      etiqueta: port.label ?? port.name,
      dir: port.dir,
      lado: port.anchor.side,
      x,
      y,
      zona: { x: x - half, y: y - half, ancho: SUBVI_TERMINAL_ZONE, alto: SUBVI_TERMINAL_ZONE },
      centro: { x, y },
    };
  });
}

/** Todos los terminales del diagrama, por `nodo.puerto`. */
export function extremos(g, ctx, edicion) {
  const m = new Map();
  for (const n of g.nodos) for (const t of terminales(n, ctx, edicion)) m.set(`${n.id}.${t.puerto}`, t);
  return m;
}

/**
 * How far right of its source a new wire turns: 7 px, whatever the distance to the input and whichever end the
 * wire was drawn from (measured in LabVIEW 2026 Q3, labview-captures/reports/2026-10-15-wire-bends.md §1, §2, §5).
 */
export const SOURCE_STUB = 7;

/**
 * The bends LabVIEW gives a new wire: one vertical just after the source. If the input lies behind the output,
 * the wire goes around.
 */
export function codosPorDefecto(a, b) {
  if (b.x - a.x >= 2 * SOURCE_STUB) return [a.x + SOURCE_STUB];
  return [a.x + 8, f2((a.y + b.y) / 2), b.x - 8];
}

/**
 * Los puntos de un cable, de la salida `a` a la entrada `b`: sale en
 * horizontal, gira en cada x de `codos` hacia la y siguiente y entra en
 * horizontal.
 */
export function ruta(a, b, codos = codosPorDefecto(a, b)) {
  const pts = [[a.x, a.y]];
  let [x, y] = [a.x, a.y];
  codos.forEach((v, i) => {
    if (i % 2 === 0) x = v;
    else y = v;
    pts.push([x, y]);
  });
  pts.push([x, b.y], [b.x, b.y]);
  return pts;
}

/** Cuánto antes de la entrada baja una rama: 12 px, medido en LabVIEW 2026 Q3. */
const ANTES_RAMA = 12;

/**
 * Una rama que sale del tramo `k` de un cable (de `a` a `b`, con sus `codos`)
 * hacia la entrada `destino`, pinchada en `p`. Sigue el cable hasta ese tramo y
 * gira hacia el destino. Como en LabVIEW, en un tramo horizontal la unión no
 * queda donde se pincha, sino tan cerca del destino como deja el tramo: la rama
 * baja 12 px antes de la entrada. Devuelve los codos de la rama y su punto de
 * unión.
 */
export function rama(codos, a, b, k, destino, p) {
  const pts = ruta(a, b, codos);
  const [[x1, y1], [x2, y2]] = [pts[k], pts[k + 1]];
  const entre = (v, u, w) => Math.min(Math.max(v, Math.min(u, w)), Math.max(u, w));
  if (y1 === y2) {
    const jx = f2(entre(destino.x - ANTES_RAMA, x1, x2));
    const antes = codos.slice(0, k);
    // En el último tramo, el que entra en `b`, falta la y a la que llega.
    if (k > codos.length) antes.push(b.y);
    return { codos: [...antes, jx], union: [jx, y1] };
  }
  const jy = f2(entre(p.y, y1, y2));
  return { codos: [...codos.slice(0, k), jy, f2(destino.x - ANTES_RAMA)], union: [x1, jy] };
}

/**
 * Mover el tramo `k` de un cable: los verticales se mueven de lado y los
 * horizontales de arriba abajo. El primero y el último están pegados a un
 * terminal: moverlos añade un codo. Devuelve los codos nuevos y el índice que
 * tiene ahora el tramo que se arrastra.
 */
export function moverTramo(codos, a, b, k, delta) {
  const n = codos.length + 2; // tramos
  if (k % 2 === 1) {
    const c = [...codos];
    c[k - 1] = f2(c[k - 1] + delta);
    return { codos: c, k };
  }
  if (k > 0 && k < n - 1) {
    const c = [...codos];
    c[k - 1] = f2(c[k - 1] + delta);
    return { codos: c, k };
  }
  if (k === 0) return { codos: [a.x + 8, f2(a.y + delta), ...codos], k: 2 };
  return { codos: [...codos, f2(b.y + delta), b.x - 8], k };
}

const puntos = (r) => r.map(([x, y]) => `${f2(x)},${f2(y)}`).join(" ");

/**
 * The two pixel rows of an undefined array's wire: how far each is shifted from the wire's centre, and its dash
 * offset. The second row is shifted half a pixel right and down, so an offset of 2 puts its dashes one pixel ahead.
 */
const UNDEFINED_ARRAY_ROWS = [[-0.5, 0], [0.5, 2]];

/** Pinta un cable: su color es el de su tipo y su grosor, el de su dimensión. Uno roto se pinta aparte (broken-wire.mjs). */
function trazo(r, tipo) {
  // An array with no element yet: 2 px like any 1D wire, each pixel row dashed 2 on and 2 off in black, the second
  // row one pixel ahead of the first (measured at 1:1 on labview-captures/array-typing/const-wire.png).
  if (isUndefinedArray(tipo)) return UNDEFINED_ARRAY_ROWS.map(([shift, dashOffset]) => `<polyline points="${puntos(r)}" transform="translate(${shift} ${shift})" stroke="#000" stroke-width="1" stroke-dasharray="2 2" stroke-dashoffset="${dashOffset}" shape-rendering="crispEdges"/>`).join("");
  const { color, dimension, error } = aspecto(tipo);
  // Un cable de error mide 3 px: borde oliva y, en el centro, trazos de 2 px amarillos y negros (YYKK).
  if (error) return `<polyline points="${puntos(r)}" stroke="${color}" stroke-width="3"/><polyline points="${puntos(r)}" stroke="#ffff00" stroke-width="1" stroke-dasharray="2 2"/><polyline points="${puntos(r)}" stroke="#000" stroke-width="1" stroke-dasharray="2 2" stroke-dashoffset="-2"/>`;
  if (dimension === 0) return `<polyline points="${puntos(r)}" stroke="${color}" stroke-width="1.33"/>`;
  // Un array de una dimensión: 2 px, de un color sólido (medido a 1:1 en labview-captures/array/array-indicador-terminal.png).
  if (dimension === 1) return `<polyline points="${puntos(r)}" stroke="${color}" stroke-width="2"/>`;
  // Two dimensions or more: 3 px, the type color, white and the type color, solid (labview-captures/array-2d/wire-2d-dbl.png
  // and wire-2d-vs-1d-diagram.png). Three dimensions are drawn the same until they are measured.
  return `<polyline points="${puntos(r)}" stroke="${color}" stroke-width="3"/><polyline points="${puntos(r)}" stroke="#fff" stroke-width="1"/>`;
}

/** How far from a loose end a click still takes it (px): the end itself is not drawn, so this is the whole target. */
const LOOSE_END_HIT_RADIUS = 4;

/** The invisible targets of the loose ends of a wire: clicking one starts wiring it (diagram-editing.mjs `recablear`). */
function looseEndZones(wire, source, sink, reason) {
  return [["de", wire.de, source], ["a", wire.a, sink]]
    .filter(([, end]) => Gr.esSuelto(end))
    .map(([side, , point]) => `<circle class="extremo-suelto" data-cable="${esc(wire.id)}" data-extremo="${side}" data-tip="${esc(reason)}" cx="${f2(point.x)}" cy="${f2(point.y)}" r="${LOOSE_END_HIT_RADIUS}"/>`)
    .join("");
}

/** The colour of the type at one end of a wire, or null when that end is loose (nothing is wired there). */
const endColor = (end, typesByTerminal) => {
  if (Gr.esSuelto(end)) return null;
  return aspecto(typesByTerminal.get(`${end.nodo}.${end.puerto}`) ?? "number").color;
};

/** El tipo que lleva el cable que llega a una entrada, o el de la entrada si no llega ninguno. */
function tipoEntrada(n, t, g, resueltos) {
  const c = g.cables.find((k) => k.a.nodo === n.id && k.a.puerto === t.puerto);
  return c ? resueltos.cables.get(c.id)?.tipo : resueltos.entradas.get(`${n.id}.${t.puerto}`);
}

/**
 * Everything the diagram paints inside the canvas. `d` is the state from
 * diagram-editing.mjs.
 */
export function contenido(d0, ctx, resueltos) {
  // Lo de los marcos escondidos de un Case no se ve; `d` es lo que se pinta y `d0`, lo que hay.
  const g = visibles(d0.g);
  const d = g === d0.g ? d0 : { ...d0, g, completo: d0.g };
  const { seleccion = [], accion, edicion, sobre } = d;
  const elegidos = new Set(seleccion);
  const ext = extremos(g, ctx, edicion);

  let cables = "";
  let cunas = "";
  let tuneles = "";
  for (const c of g.cables) {
    const a = endPoint(c.de, ext);
    const b = endPoint(c.a, ext);
    const info = resueltos.cables.get(c.id);
    const r = ruta(a, b, c.codos);
    const entero = elegidos.has(c.id);
    const tip = info.roto ? ` data-tip="${esc(info.roto)}"` : "";
    cables += `<g class="cable${entero ? " seleccionado" : ""}${info.roto ? " roto" : ""}${d.debug?.litWires.has(c.id) ? " dep-encendido" : ""}" data-cable="${esc(c.id)}"${tip}>`;
    const broken = info.roto && brokenWireMarks(r, { sourceColor: endColor(c.de, resueltos.salidas), sinkColor: endColor(c.a, resueltos.entradas) });
    cables += broken ? broken.dashes : trazo(r, info.tipo);
    for (let k = 0; k < r.length - 1; k++) {
      const [[x1, y1], [x2, y2]] = [r[k], r[k + 1]];
      if (x1 === x2 && y1 === y2) continue;
      const sel = entero || elegidos.has(`${c.id}#${k}`);
      if (sel) cables += `<line class="tramo-elegido" x1="${f2(x1)}" y1="${f2(y1)}" x2="${f2(x2)}" y2="${f2(y2)}"/>`;
      cables += `<line class="tramo-zona" data-cable="${esc(c.id)}" data-tramo="${k}" x1="${f2(x1)}" y1="${f2(y1)}" x2="${f2(x2)}" y2="${f2(y2)}"/>`;
    }
    if (broken) {
      cables += broken.marks;
      cunas += looseEndZones(c, a, b, info.roto);
    }
    cables += `</g>`;
    // En una Flat Sequence, un cable que va de un marco a uno posterior cruza cada separador por un túnel (secuencia-15.png).
    if (Gr.conectado(c)) tuneles += tunelesDeSecuencia(g, c, r, info.tipo);
    // El punto de unión de una rama: un punto del color del cable.
    if (c.union && !info.roto) cunas += `<circle class="union" cx="${f2(c.union[0])}" cy="${f2(c.union[1])}" r="2.2" fill="${aspecto(info.tipo).color}"/>`;
    // El punto de coerción: una cuña roja en el borde de la entrada que convierte.
    const aSelector = g.nodos.find((k) => k.id === c.a.nodo)?.tipo === "case-selector";
    if (!info.roto && (info.coercion || (aSelector && esNumericoNoEntero(info.tipo)))) cunas += `<polygon class="coercion" points="${f2(b.x)},${f2(b.y - 2.7)} ${f2(b.x + 3.3)},${f2(b.y)} ${f2(b.x)},${f2(b.y + 2.7)}"/>`;
  }

  // El cable que se está tirando: punteado, en horizontal hasta la x del ratón
  // y en vertical hasta él.
  let nuevo = "";
  if (accion?.tipo === "cablear") {
    const t = ext.get(`${accion.desde.nodo}.${accion.desde.puerto}`);
    if (t) nuevo = `<polyline class="cable-tirando" points="${puntos([[t.centro.x, t.centro.y], [accion.x, t.centro.y], [accion.x, accion.y]])}"/>`;
  }
  // Wiring a loose end: the same dotted wire, from the point where the end is.
  if (accion?.tipo === "recablear") {
    const wire = g.cables.find((candidate) => candidate.id === accion.cable);
    const start = wire && endPoint(wire[accion.extremo], ext);
    if (start) nuevo = `<polyline class="cable-tirando" points="${puntos([[start.x, start.y], [accion.x, start.y], [accion.x, accion.y]])}"/>`;
  }

  // En una Stacked Sequence, un cable de un marco a uno posterior se ve como su variable local (secuencia-9.png a secuencia-14.png).
  const locales = localesDeApiladas(d0, ctx, resueltos);
  cables += locales.cables;

  // Las estructuras, debajo de todo, de fuera a dentro: son su marco y nada más.
  const estructuras = g.nodos
    .filter((n) => esEstructura(n, ctx))
    .sort((a, b) => profundidad(g, a) - profundidad(g, b))
    .map((n) => estructura(n, ctx, elegidos.has(n.id), d, resueltos))
    .join("");
  const nodos = g.nodos.filter((n) => !esEstructura(n, ctx)).map((n) => nodo(n, d, ctx, resueltos, elegidos.has(n.id))).join("");
  const etiquetas = g.nodos
    .filter((n) => n.label && labelShown(n))
    .map((n) => Et.pintar(n, cajaEtiqueta(n, ctx, edicion), { edicion, elegida: elegidos.has(`${n.id}#etiqueta`) }))
    .join("");
  let rect = "";
  if (accion?.tipo === "rectangulo") {
    const [x, y] = [Math.min(accion.x0, accion.x1), Math.min(accion.y0, accion.y1)];
    rect = `<div class="rectangulo" style="left:${px(x)};top:${px(y)};width:${px(Math.abs(accion.x1 - accion.x0))};height:${px(Math.abs(accion.y1 - accion.y0))}"></div>`;
  }
  let fantasma = "";
  if (accion?.tipo === "colocar" && accion.x !== undefined && ctx.cat.bloque(accion.bloque).estructura) {
    // Una estructura se coloca con un rectángulo: sale de la esquina del primer clic hasta el cursor.
    if (accion.esquina) {
      const [x, y] = [Math.min(accion.esquina.x, accion.x), Math.min(accion.esquina.y, accion.y)];
      fantasma = `<div class="rectangulo-estructura" style="left:${px(x)};top:${px(y)};width:${px(Math.abs(accion.x - accion.esquina.x))};height:${px(Math.abs(accion.y - accion.esquina.y))}"></div>`;
    }
  } else if (accion?.tipo === "colocar" && accion.x !== undefined) {
    const n = { id: "fantasma", tipo: accion.bloque, x: accion.x, y: accion.y, ...(isSubVI({ tipo: accion.bloque }) ? { config: accion.config } : {}) };
    fantasma = `<div class="fantasma">${nodo(n, { g, seleccion: [] }, ctx, null, false)}</div>`;
  }
  const lista = d.lista ? listaAbierta(d, ctx, resueltos) : "";
  const aviso = d.aviso ? `<div class="aviso" style="left:${px(d.aviso.x + 8)};top:${px(d.aviso.y + 8)}">${esc(d.aviso.texto)}</div>` : "";
  const pistas = sobre ? pistasTerminales(g.nodos.find((n) => n.id === sobre.nodo), d, ctx, resueltos) : "";
  // Las cuñas de coerción y las pistas de los terminales, encima de los nodos.
  return `${estructuras}<svg class="cables">${cables}</svg>${tuneles}${locales.cajas}${nodos}${etiquetas}<svg class="cables encima">${cunas}${pistas}${nuevo}</svg>${rect}${fantasma}${lista}${aviso}`;
}

/** El marco de la Flat `s` en que está el nodo `n` —el suyo, o el de la estructura de `s` que lo contiene—, o nada si no está en `s`. */
function marcoEnSecuencia(g, n, s) {
  for (let k = n; k; k = g.nodos.find((x) => x.id === k.dentro)) if (k.dentro === s.id) return k.marco;
  return undefined;
}

/**
 * Las variables locales de las Stacked Sequence visibles. Cada cable que va de
 * un marco a uno posterior es una: una caja de 13 × 13 pegada al borde de
 * abajo, que en el marco donde se escribe lleva la flecha hacia el borde, en
 * los posteriores la lleva hacia dentro y en los anteriores sale en tablero. El
 * cable llega a ella desde su origen, y de ella sale hacia su destino, en el
 * marco de cada uno. Se reparten de izquierda a derecha, a 16 px.
 */
function localesDeApiladas(d0, ctx, resueltos) {
  const g = d0.g;
  const ext = extremos(g, ctx, d0.edicion);
  let cajas = "";
  let cables = "";
  for (const s of g.nodos.filter(esApilada)) {
    if (oculto(g, s)) continue;
    const f = activoDe(s);
    const [x0, y0] = [s.x + G.MEDIDAS_SECUENCIA.lado, s.y + s.tam.alto - G.MEDIDAS_SECUENCIA.banda - 13];
    const cruzan = g.cables.filter(Gr.conectado).filter((c) => {
      const [m1, m2] = [g.nodos.find((n) => n.id === c.de.nodo), g.nodos.find((n) => n.id === c.a.nodo)].map((n) => marcoEnSecuencia(g, n, s));
      return m1 !== undefined && m2 !== undefined && m1 < m2;
    });
    cruzan.forEach((c, i) => {
      const [m1, m2] = [c.de.nodo, c.a.nodo].map((id) => marcoEnSecuencia(g, g.nodos.find((n) => n.id === id), s));
      const tipo = resueltos?.cables.get(c.id)?.tipo;
      const color = aspecto(tipo ?? "number").color;
      const x = x0 + 40 + i * 16;
      const estado = f === m1 ? "escribe" : f > m1 ? "lee" : "no";
      cajas += `<div class="variable-local-secuencia" style="left:${px(x)};top:${px(y0)}">${G.variableLocal(estado, color, "abajo")}</div>`;
      // El cable, en el marco donde empieza y en el donde acaba: de su terminal a la caja y de la caja a su terminal.
      const [de, a] = [ext.get(`${c.de.nodo}.${c.de.puerto}`), ext.get(`${c.a.nodo}.${c.a.puerto}`)];
      if (f === m1) cables += `<g class="cable">${trazo([[de.x, de.y], [x + 6, de.y], [x + 6, y0]], tipo)}</g>`;
      if (f === m2) cables += `<g class="cable">${trazo([[x + 6, y0], [x + 6, a.y], [a.x, a.y]], tipo)}</g>`;
    });
  }
  return { cajas, cables };
}

/**
 * Los túneles de un cable que cruza los separadores de una Flat Sequence: uno
 * de 9 × 9, del color del tipo, centrado en cada separador a la altura en que
 * el cable lo cruza (structures/secuencia-15.png).
 */
function tunelesDeSecuencia(g, c, ruta, tipo) {
  const [de, a] = [g.nodos.find((n) => n.id === c.de.nodo), g.nodos.find((n) => n.id === c.a.nodo)];
  let h = "";
  for (const s of g.nodos.filter(esFlat)) {
    const [m1, m2] = [marcoEnSecuencia(g, de, s), marcoEnSecuencia(g, a, s)];
    if (m1 === undefined || m2 === undefined || m1 >= m2) continue;
    const [xs, as] = [izquierdasMarcos(s), anchosMarcos(s)];
    for (let m = m1; m < m2; m++) {
      const centro = s.x + xs[m] + as[m] + Math.floor(G.MEDIDAS_SECUENCIA.separador / 2);
      const tramo = ruta.findIndex(([x1, y1], i) => i < ruta.length - 1 && y1 === ruta[i + 1][1] && Math.min(x1, ruta[i + 1][0]) <= centro && centro <= Math.max(x1, ruta[i + 1][0]));
      const y = tramo < 0 ? ruta[0][1] : ruta[tramo][1];
      h += `<div class="tunel-secuencia" style="left:${px(centro - 4)};top:${px(Math.floor(y) - 4)}">${G.tunel(aspecto(tipo ?? "number").color)}</div>`;
    }
  }
  return h;
}

/**
 * Al pasar el ratón por un nodo, o al llegarle un cable, LabVIEW enseña sus
 * terminales sin cablear, y el que está bajo el ratón aunque lo esté: un punto
 * del color de su tipo con un tramito de cable hacia fuera.
 */
function pistasTerminales(n, d, ctx, resueltos) {
  if (!n) return "";
  const cableadas = new Set(d.g.cables.flatMap((c) => [`${c.a.nodo}.${c.a.puerto}`, `${c.de.nodo}.${c.de.puerto}`]));
  let h = "";
  for (const t of terminales(n, ctx, d.edicion)) {
    const clave = `${n.id}.${t.puerto}`;
    if (cableadas.has(clave) && d.sobre.puerto !== t.puerto) continue;
    const tipo = (t.dir === "in" ? resueltos.entradas : resueltos.salidas).get(clave);
    const { color } = aspecto(tipo ?? "number");
    // A tip sticks out of the edge it is on: a subVI also has terminals on its top and bottom edges.
    const fuera = t.dir === "in" ? -4.5 : 4.5;
    const vertical = t.lado === "top" || t.lado === "bottom";
    const [dx, dy] = vertical ? [0, t.lado === "top" ? -4.5 : 4.5] : [fuera, 0];
    h += `<g class="pista"><line x1="${f2(t.x)}" y1="${f2(t.y)}" x2="${f2(t.x + dx)}" y2="${f2(t.y + dy)}" stroke="${color}" stroke-width="1.33"/><circle cx="${f2(t.x)}" cy="${f2(t.y)}" r="1.9" fill="${color}"/></g>`;
  }
  return h;
}

/**
 * La constante de error: su valor es `{ status, code, source }` en `config.value`. Cada celda lleva
 * `data-campo` para que un clic en el status lo alterne y un doble clic en code o source escriba en
 * ella; mientras se escribe, la celda enseña lo escrito.
 */
function constanteError(n, edicion) {
  const v = { status: false, code: 0, source: "", ...(n.config?.value ?? {}) };
  const ed = edicion?.nodo === n.id ? edicion : null;
  const texto = (campo, x) => {
    if (ed?.campo !== campo) return esc(x);
    return ed.todo ? `<span class="texto-elegido">${esc(ed.texto)}</span>` : `${esc(ed.texto)}<span class="caret"></span>`;
  };
  const [a, b, c] = MEDIDAS_CONSTANTE_ERROR.celdas;
  return `<div class="constante-error${ed ? " editando" : ""}"><div class="celda-error celda-status" data-campo="status" style="height:${a}px">${v.status ? "T" : "F"}</div><div class="celda-error celda-code" data-campo="code" style="height:${b}px">${texto("code", String(v.code))}</div><div class="celda-error celda-source" data-campo="source" style="height:${c}px"><span>${texto("source", v.source)}</span></div></div>`;
}

/** What a cell shows: its text, or the text being typed into it with its caret or selection. */
function cellContent(text, editing) {
  const escaped = esc(text);
  if (!editing) return `<span>${escaped}</span>`;
  return editing.todo ? `<span class="texto-elegido">${escaped}</span>` : `<span>${escaped}</span><span class="caret"></span>`;
}

/** One row of the index block of a 2D constant: the spinner and the field with the first position shown. */
const indexRow2D = (position) => `<div class="fila-indice"><span class="paso-indice">▴▾</span><span class="campo-indice">${position}</span></div>`;

/**
 * The constant with two dimensions (see MEDIDAS_ARRAY_2D): the index block with its two positions and, flush
 * against it, the grid of tiles. Each tile carries the address "row,column" of the element it shows.
 */
function constanteArray2D(n, k, ctx, edicion) {
  const M = MEDIDAS_ARRAY_2D;
  const [type, value] = [tipoElementoArray(n), valoresArray(n)];
  const first = firstShown(n.config);
  const { rows, columns } = visibleGrid(n.config);
  const pitch = anchoElementoArray(n, ctx, edicion);
  const box = box2D(n, ctx, edicion);
  const tiles = Array.from({ length: rows * columns }, (_, i) => {
    const [row, column] = [Math.floor(i / columns), i % columns];
    const address = addressShown(n, row, column);
    const editing = edicion?.nodo === n.id && edicion.elem === address ? edicion : null;
    const defined = isDefined(value, 2, address);
    return `<div class="celda-grid${defined ? " definida" : ""}${editing ? " editando" : ""}" data-campo="${address}" style="left:${px(column * pitch)};top:${px(row * M.altoCelda)};width:${px(pitch)};height:${px(M.altoCelda)}"><div class="contenido-celda">${cellContent(cellText(n, address, ctx, edicion), editing)}</div></div>`;
  }).join("");
  return `<div class="constante-array dos-dimensiones" style="width:${px(k.ancho)};height:${px(k.alto)};--tipo:${aspecto(type).color}">` +
    `<div class="indice-array-2d" style="width:${px(M.indice)};height:${px(M.altoIndice)}"><div class="interior-indice">${indexRow2D(first.row)}${indexRow2D(first.column)}</div></div>` +
    `<div class="caja-array-2d" style="left:${px(M.indice)};width:${px(box.ancho)};height:${px(box.alto)}"><div class="interior-caja">${tiles}</div></div></div>`;
}

/**
 * The arrows of an array constant's index, 5 × 15 px in the type's color (array-typing/const-num.png): an up arrow,
 * a bar, a double bar, a bar and a down arrow.
 */
const INDEX_ARROWS =
  `<svg width="5" height="15" viewBox="0 0 5 15" shape-rendering="crispEdges" fill="currentColor" aria-hidden="true">` +
  `<rect x="2" y="1" width="1" height="1"/><rect x="1" y="2" width="3" height="2"/><rect x="0" y="4" width="5" height="1"/>` +
  `<rect x="0" y="6" width="5" height="2"/><rect x="0" y="9" width="5" height="1"/><rect x="1" y="10" width="3" height="2"/>` +
  `<rect x="2" y="12" width="1" height="1"/></svg>`;

/** The index of a one-dimensional array constant: a double line in `color` round its arrows and its position. */
const arrayIndexBox = (width, height, color, position) =>
  `<div class="indice-array" style="width:${px(width)};height:${px(height)};--tipo:${color}"><span class="paso-indice">${INDEX_ARROWS}</span><span class="campo-indice">${position}</span></div>`;

/**
 * An array constant with no element yet (DT-060), measured in labview-captures/array-typing/const-empty-crop.png: the
 * shell is 50 × 50 with a black double line (black, 1 px white, black) and a white interior, and the index box,
 * about 32 × 21, is attached on its left, so the whole object is 82 × 50. The typed empty constant stays 52 × 25.
 */
export const MEDIDAS_ARRAY_INDEFINIDA = { indice: 32, altoIndice: 21, caja: 50 };

function constanteArrayIndefinida(n, k) {
  const A = MEDIDAS_ARRAY_INDEFINIDA;
  const index = n.config?.indice ?? 0;
  return `<div class="constante-array indefinida" style="width:${px(k.ancho)};height:${px(k.alto)}">` +
    arrayIndexBox(A.indice, A.altoIndice, "#000", index) +
    `<div class="caja-array-indefinida" style="left:${px(A.indice)};width:${px(A.caja)};height:${px(A.caja)}"></div></div>`;
}

/** The array constant: the index on the left and, to its right, the box with the elements that show. */
function constanteArray(n, k, ctx, edicion) {
  if (isUndefinedArray(n.config?.type)) return constanteArrayIndefinida(n, k);
  if (dimensionsOfNode(n.config) === 2) return constanteArray2D(n, k, ctx, edicion);
  const A = MEDIDAS_ARRAY;
  const [t, valores, k0] = [tipoElementoArray(n), valoresArray(n), n.config?.indice ?? 0];
  const color = aspecto(t).color;
  const ancho = anchoElementoArray(n, ctx, edicion);
  const celdas = Array.from({ length: visiblesArray(n) }, (_, j) => {
    const i = k0 + j;
    const ed = edicion?.nodo === n.id && edicion.elem === i ? edicion : null;
    const txt = esc(ed ? ed.texto : textoElemento(valores[i], t, ctx.separador));
    const valor = ed ? (ed.todo ? `<span class="texto-elegido">${txt}</span>` : `<span>${txt}</span><span class="caret"></span>`) : `<span>${txt}</span>`;
    return `<div class="celda-array${i >= valores.length ? " vacia" : ""}${ed ? " editando" : ""}" data-campo="${i}" style="width:${px(ancho)}">${valor}</div>`;
  }).join("");
  return `<div class="constante-array" style="width:${px(k.ancho)};height:${px(A.alto)};--tipo:${color}">` +
    arrayIndexBox(A.indice, A.altoIndice, color, k0) +
    `<div class="caja-array" style="left:${px(A.indice)};width:${px(k.ancho - A.indice)};height:${px(A.alto)}">${celdas}</div></div>`;
}

/**
 * The handles to stretch an array constant: one on the right edge of the box of elements and, with two
 * dimensions, one on the bottom edge and one in the corner (each shows more columns, rows, or both).
 */
function asasArray(n, k, ctx, edicion, handleClass) {
  const handle = (side, left, top) => `<div class="${handleClass}" data-nodo="${esc(n.id)}" data-asa="${side}" style="left:${px(left - 3)};top:${px(top - 3)}"></div>`;
  if (dimensionsOfNode(n.config) < MAX_EDITOR_DIMENSIONS) return handle("derecha", k.ancho, k.alto / 2);
  const box = box2D(n, ctx, edicion);
  const boxLeft = MEDIDAS_ARRAY_2D.indice;
  return handle("derecha", k.ancho, box.alto / 2) + handle("abajo", boxLeft + box.ancho / 2, box.alto) + handle("esquina", k.ancho, box.alto);
}

/** Whether a wire reaches that input of the node. */
const indexCableado = (g, n, puerto) => g.cables.some((cable) => cable.a.nodo === n.id && cable.a.puerto === puerto);

/**
 * Whether a node that can be stretched shows its handles (reports/2026-10-15-editor-wide.md Q1): a selected
 * node while the mouse is over it, any node while the mouse is on one of its handles (they are there, unseen,
 * until then), and the node whose handle is being dragged. A selected node with the mouse elsewhere shows only
 * its selection.
 */
function showsStretchHandles(n, d, elegido) {
  if (d.accion?.tipo === "estirar") return d.accion.nodo === n.id;
  return d.sobre?.nodo === n.id && (elegido || !!d.sobre.asa);
}

/**
 * Whether a structure shows its eight stretch handles: selected, or while the mouse is on its border
 * (measured, reports/2026-10-15-editor-gestures.md §2). Only the border can be hovered, as the interior
 * does not take the mouse, so hovering the structure is hovering its border. They stay while one is dragged.
 */
function structureShowsStretchHandles(structure, d, selected) {
  if (d.accion?.tipo === "estirar") return d.accion.nodo === structure.id;
  return selected || d.sobre?.nodo === structure.id;
}

function nodo(n, d, ctx, resueltos, elegido) {
  const k = caja(n, ctx, d.edicion);
  const c = CONSTANTES[n.tipo];
  let cuerpo;
  if (esBorde(n)) {
    cuerpo = `<div class="glifo-borde">${glifoBorde(n, resueltos, d.completo ?? d.g)}</div>`;
  } else if (c?.error) {
    cuerpo = constanteError(n, d.edicion);
  } else if (c?.array) {
    cuerpo = constanteArray(n, k, ctx, d.edicion);
  } else if (c) {
    const b = ctx.cat.bloque(n.tipo);
    const tipo = resueltos?.salidas.get(`${n.id}.result`) ?? n.config?.type ?? b.config?.default?.type ?? b.out[0].type;
    const color = aspecto(tipo ?? "number").color;
    const selector = c.selector ? `<span class="selector-constante">◂▸</span>` : "";
    const ed = d.edicion?.nodo === n.id ? d.edicion : null;
    const texto = esc(textoConstante(n, ctx, d.edicion));
    const valor = ed ? (ed.todo ? `<span class="texto-elegido">${texto}</span>` : `<span>${texto}</span><span class="caret"></span>`) : `<span>${texto}</span>`;
    cuerpo = `<div class="constante${c.cadena ? " cadena" : ""}${ed ? " editando" : ""}" style="border-color:${color}">${selector}${valor}</div>`;
  } else if (esDelPanel(n, ctx)) {
    const tipo = resueltos?.salidas.get(`${n.id}.result`) ?? resueltos?.entradas.get(`${n.id}.value`) ?? n.config?.type ?? "number";
    const control = ctx.cat.puertos(n).out.length > 0;
    let hoja = tipo;
    while (esArray(hoja)) hoja = hoja.array;
    const glifo = GRAPH_KINDS.includes(n.tipo)
      ? G.graphTerminal(n.tipo, n.tipo === "xy-graph" || esCluster(tipo), !!n.vista?.compacto)
      : isUndefinedArray(tipo)
      ? (n.vista?.compacto ? G.terminalArrayCompacto(control, COLOR_UNDEFINED_ARRAY, "") : G.terminalArrayIndefinido(control))
      : esArray(tipo)
      ? (n.vista?.compacto ? G.terminalArrayCompacto(control, aspecto(tipo).color, COMPACT_ARRAY_TAGS[hoja] ?? nombre(hoja)) : G.terminalPanelIcono(control, aspecto(tipo).color, nombre(hoja), G.dibujoArray(control)))
      : esError(tipo)
      ? (n.vista?.compacto ? G.terminalPanelCompacto(control, COLORES.error, "") : G.terminalPanelIcono(control, COLORES.error, "", G.dibujoError(control), "cluster"))
      : tipo === "boolean"
      ? G.terminalBooleano(n.config?.style, control, aspecto(tipo).color, !!n.vista?.compacto, !!CV.currentValue(n))
      : tipo === "string"
        ? (n.vista?.compacto ? G.terminalPanelCompacto(control, aspecto(tipo).color, "abc") : G.terminalPanelIcono(control, aspecto(tipo).color, "abc", G.dibujoCadena(control)))
        : (n.vista?.compacto ? G.terminalPanelCompacto : G.terminalPanelIcono)(control, aspecto(tipo).color, nombre(tipo));
    cuerpo = `<div class="glifo-terminal-panel">${glifo}</div>`;
  } else if (isSubVI(n)) {
    cuerpo = `<div class="glifo-subvi">${ctx.cat.findSubVI?.(n.config?.vi) ? G.iconoVI() : G.ICONO_VI_FALTA}</div>`;
  } else if (FN.isFormatNode(n, ctx.cat)) {
    cuerpo = `<div class="glifo-formato">${FN.formatNodeBody(n, k, ctx.cat, resueltos)}</div>`;
  } else if (UN.isUnbundleByName(n)) {
    cuerpo = `<div class="glifo-formato">${UN.unbundleBody(n, k, ctx.cat, resueltos)}</div>${UN.nameRowZones(n, k, ctx.cat)}`;
  } else if (esExpresion(n)) {
    cuerpo = expresion(n, k, ctx, resueltos, d.edicion);
  } else if (esCompuesto(n, ctx)) {
    cuerpo = compuesto(n, k, ctx);
  } else if (n.vista?.terminales && resueltos) {
    cuerpo = vistaTerminales(n, k, d.g, ctx, resueltos);
  } else {
    const clave = glifoDe(n, ctx);
    const glifo = clave === "index-array-2d" ? G.indexArray2DGlyph(indexCableado(d.g, n, "index"), indexCableado(d.g, n, "index-1")) : G.FUNCIONES[clave] ?? "";
    // Un glifo de cadena trae su tamaño (más ancho que los 32 px de la rejilla).
    const [gw, gh] = G.TAMANOS[clave] ?? [];
    cuerpo = `<div class="glifo-nodo" style="left:${px(-k.dx)};top:${px(-k.dy)}${gw ? `;width:${px(gw)};height:${px(gh)}` : ""}">${glifo}</div>`;
  }
  const zonas = terminales(n, ctx, d.edicion)
    .filter((t) => terminalVisible(n, t, d.g))
    .map(
      (t) =>
        `<div class="terminal" data-nodo="${esc(n.id)}" data-puerto="${esc(t.puerto)}" data-dir="${t.dir}"${t.etiqueta ? ` data-tip="${esc(t.etiqueta)}"` : ""} style="left:${px(t.zona.x - k.x)};top:${px(t.zona.y - k.y)};width:${px(t.zona.ancho)};height:${px(t.zona.alto)}"></div>`,
    )
    .join("");
  const editable = c?.editable ? " editable" : "";
  // Hidden handles are still drawn to catch the mouse: hovering one is what shows them on a node that is not selected.
  const handleClass = showsStretchHandles(n, d, elegido) ? "asa" : "asa oculta";
  let asas = "";
  if (c?.array && !isUndefinedArray(n.config?.type)) asas = asasArray(n, k, ctx, d.edicion, handleClass);
  // Initialize Array is stretched downwards to add a dimension size (array-2d/initializearray-contexthelp.png).
  if (n.tipo === "initialize-array") asas = `<div class="${handleClass}" data-nodo="${esc(n.id)}" data-asa="abajo" style="left:${px(k.ancho / 2 - 3)};top:${px(k.alto - 3)}"></div>`;
  // Format Into String and Scan From String are stretched downwards to add rows (format-scan/16-node-stretched.png).
  if (FN.isFormatNode(n, ctx.cat)) {
    const handle = FN.formatNodeHandle(k);
    asas = `<div class="${handleClass}" data-nodo="${esc(n.id)}" data-asa="abajo" style="left:${px(handle.x)};top:${px(handle.y)}"></div>`;
  }
  // Unbundle By Name is stretched downwards by a handle of 6 x 6 px to add rows (cluster palette, stage 2, Q2).
  if (UN.isUnbundleByName(n)) {
    const handle = UN.unbundleHandle(k);
    asas = `<div class="${handleClass}" data-nodo="${esc(n.id)}" data-asa="abajo" style="left:${px(handle.x)};top:${px(handle.y)};width:${px(UN.HANDLE_SIZE)};height:${px(UN.HANDLE_SIZE)}"></div>`;
  }
  if (esCompuesto(n, ctx)) {
    const M = medidasCompuesto(n, ctx);
    const x = M.izquierda - M.asa / 2;
    asas = `<div class="${handleClass}" data-nodo="${esc(n.id)}" data-asa="arriba" style="left:${px(x)};top:${px(0.7)}"></div><div class="${handleClass}" data-nodo="${esc(n.id)}" data-asa="abajo" style="left:${px(x)};top:${px(k.alto - M.asa - 0.7)}"></div>`;
  }
  // Invert: un circulito en el terminal invertido.
  const invertidas = new Set(n.config?.inverted ?? []);
  const circulos = terminales(n, ctx, d.edicion)
    .filter((t) => invertidas.has(t.puerto))
    .map((t) => `<div class="invertida" style="left:${px(t.x - k.x + (t.dir === "in" ? -1.8 : 1.8) - 1.8)};top:${px(t.y - k.y - 1.8)}"></div>`)
    .join("");
  const escribiendo = d.edicion?.nodo === n.id && !d.edicion.etiqueta;
  return `<div class="nodo${elegido || escribiendo ? " seleccionado" : ""}${editable}${litByDebugger(d, n.id)}" data-nodo="${esc(n.id)}" style="left:${px(k.x)};top:${px(k.y)};width:${px(k.ancho)};height:${px(k.alto)}">${cuerpo}${circulos}${zonas}${asas}</div>`;
}

/** While Highlight Execution dims the diagram, the nodes that already ran in this iteration keep their colors (debugging/debug-view.mjs). */
const litByDebugger = (d, id) => (d.debug?.litNodes.has(id) ? " dep-encendido" : "");

/**
 * Una estructura: su marco, las bandas del marco que se agarran (el interior
 * no: un clic dentro es un clic en el fondo) y, seleccionada, el tinte azulado
 * y las ocho asas de estirar (structures/seleccion.png).
 */
function estructura(n, ctx, elegido, d, resueltos) {
  const k = caja(n, ctx);
  const M = MEDIDAS_ESTRUCTURA;
  const caso = esCase(n);
  const sec = esSecuencia(n);
  const esFor = n.tipo === "for-loop";
  const banda = (cls, x, y, ancho, alto) => `<div class="banda-estructura ${cls}" style="left:${px(x)};top:${px(y)};width:${px(ancho)};height:${px(alto)}"></div>`;
  let marco;
  let bandas;
  let tinte = "";
  if (sec) {
    // El borde de película: arriba y abajo 9 px, a los lados 5 y, entre marco y marco, el separador (secuencia-2.png, secuencia-3.png).
    const S = G.MEDIDAS_SECUENCIA;
    // Una Stacked es un solo marco, el ancho de la estructura menos los bordes; una Flat, todos los suyos.
    const as = esApilada(n) ? [k.ancho - 2 * S.lado] : anchosMarcos(n);
    const xs = G.izquierdasSecuencia(as);
    marco = G.marcoSecuencia(k.ancho, k.alto, as);
    bandas =
      banda("b-n", 0, 0, k.ancho, S.banda) + banda("b-s", 0, k.alto - S.banda, k.ancho, S.banda) + banda("b-w", 0, 0, S.lado, k.alto) + banda("b-e", k.ancho - S.lado, 0, S.lado, k.alto) +
      xs.slice(0, -1).map((x, i) => banda("b-m", x + as[i], 0, S.separador, k.alto)).join("");
    // Seleccionada, el interior de cada marco se tiñe (secuencia-seleccion.png).
    if (elegido) tinte = xs.map((x, i) => `<div class="tinte-estructura" style="left:${px(x + 1)};top:${px(S.banda + 1)};width:${px(as[i] - 2)};height:${px(k.alto - 2 * S.banda - 2)}"></div>`).join("");
  } else {
    marco = caso ? G.marcoCase(k.ancho, k.alto) : esFor ? G.marcoFor(k.ancho, k.alto) : G.marcoWhile(k.ancho, k.alto);
    bandas = banda("b-n", 0, 0, k.ancho, M.borde) + banda("b-s", 0, k.alto - M.borde, k.ancho, M.borde) + banda("b-w", 0, 0, M.borde, k.alto) + banda("b-e", k.ancho - M.borde, 0, M.borde, k.alto);
    const [ancho, alto] = esFor ? [k.ancho - 4, k.alto - 4] : [k.ancho, k.alto];
    const dentro = esFor ? 1 : M.borde;
    // Un Case seleccionado sólo enseña sus asas: ni tinte ni contorno (structures/case-seleccion.png).
    if (elegido && !caso) tinte = `<div class="tinte-estructura" style="left:${px(dentro)};top:${px(dentro)};width:${px(ancho - 2 * dentro)};height:${px(alto - 2 * dentro)}"></div>`;
  }
  // Hidden handles are still drawn to catch the mouse: dragging one resizes a structure that is not selected.
  const handleClass = structureShowsStretchHandles(n, d, elegido) ? "asa asa-estructura" : "asa asa-estructura oculta";
  const asas = ASAS.map((l) => {
    const a = cajaAsa(l, k);
    return `<div class="${handleClass}" data-nodo="${esc(n.id)}" data-asa="${l}" style="left:${px(a.x)};top:${px(a.y)}"></div>`;
  }).join("");
  const clase = `${caso ? "estructura-case" : esFlat(n) ? "estructura-flat" : esApilada(n) ? "estructura-stacked" : esFor ? "estructura-for" : "estructura-while"}${elegido ? " seleccionado" : ""}${litByDebugger(d, n.id)}`;
  return `<div class="nodo estructura ${clase}" data-nodo="${esc(n.id)}" style="left:${px(k.x)};top:${px(k.y)};width:${px(k.ancho)};height:${px(k.alto)}">${tinte}${marco}${bandas}${conSelector(n) ? selectorDeMarcos(n, ctx, d, resueltos) : ""}${caso && n.config?.caseInsensitive ? marcaCaseInsensitive() : ""}${asas}</div>`;
}

/**
 * The marker of a string Case that ignores upper and lower case: a small «A=a»
 * in the pink of strings at the bottom-left corner of the frame. Drawn anew; the
 * look is only described in labview-captures/reports/2026-10-10-string-case.md (Q2).
 */
function marcaCaseInsensitive() {
  const pink = aspecto("string").color;
  return `<svg class="marca-case-insensitive" width="19" height="11" style="position:absolute;left:1px;bottom:1px" xmlns="http://www.w3.org/2000/svg"><rect x="0.5" y="0.5" width="18" height="10" fill="var(--paper)" stroke="${pink}"/><text x="2" y="8.5" font-size="8" font-family="Arial, sans-serif" fill="${pink}">A=a</text></svg>`;
}

/**
 * El selector de marcos de un Case (structures/case-1.png): el cuerpo, el texto
 * del marco que se ve —con su selección o su cursor si se escribe en él— y las
 * zonas que se pulsan: la flecha anterior, la siguiente, el triángulo que abre la
 * lista y el texto, que con doble clic se edita.
 */
function selectorDeMarcos(n, ctx, d, resueltos) {
  const M = G.SELECTOR_MARCOS;
  const kind = selectorKind(d.completo ?? d.g, n, resueltos);
  const m = medidasSelector(n, ctx, d.edicion, kind);
  const xd = m.ancho - 9;
  const ed = d.edicion?.marco && d.edicion.nodo === n.id ? d.edicion : null;
  const t = esc(m.actual);
  // A frame whose values no longer name items (a stale name after Edit Items) is red (DT-049).
  const invalido = !ed && esEnum(kind) && !frameMatchesItems(marcosDe(n)[activoDe(n)] ?? {}, kind) ? " texto-invalido" : "";
  const texto = ed
    ? ed.todo
      ? `<rect x="${M.textoX - 1}" y="3" width="${f2(m.anchoActual + 2)}" height="11" fill="var(--text-selected-background)"/><text x="${M.textoX}" y="${M.baseline}" class="texto-selector texto-blanco">${t}</text>`
      : `<text x="${M.textoX}" y="${M.baseline}" class="texto-selector">${t}</text><rect class="caret-selector" x="${f2(M.textoX + m.anchoActual)}" y="3" width="1" height="11" fill="var(--caret)"/>`
    : `<text x="${M.textoX}" y="${M.baseline}" class="texto-selector${invalido}">${t}</text>`;
  const zona = (z, x, ancho) => `<div class="marco-zona" data-nodo="${esc(n.id)}" data-zona="${z}" style="left:${px(x)};top:1px;width:${px(ancho)};height:15px"></div>`;
  const zonas = zona("anterior", 1, M.boton) + zona("texto", M.divisor + 1, xd - M.divisor - 11) + zona("lista", xd - 10, 10) + zona("siguiente", xd + 1, M.boton);
  const cuerpo = G.selectorMarcos(m.texto).replace("</svg>", `${texto}</svg>`);
  return `<div class="selector-de-marcos" style="left:${px(m.x)};top:0">${cuerpo}${zonas}</div>`;
}

/**
 * The drop-down list of the items of an enum or ring constant, with the check mark on the
 * one it shows: what a click on the constant opens (measured, enum report 2026-10-14,
 * question 6; drawn like the Case's list of frames).
 */
function listaValores(d, ctx) {
  const n = d.g.nodos.find((k) => k.id === d.lista.nodo);
  if (!n) return "";
  const M = MEDIDAS_MENU;
  const items = n.tipo === "enum-const" ? n.config?.type?.enum ?? [] : n.config?.items ?? [];
  const ancho = listWidth(items, ctx);
  const filas = items
    .map((t, k) => `<div class="item-menu item-valor${k === (n.config?.value ?? 0) ? " marcado" : ""}" data-nodo="${esc(n.id)}" data-valor="${k}" style="top:${px(M.arriba + k * M.fila)};height:${px(M.fila)}"><span class="texto-menu" style="left:${px(M.texto)}">${esc(t)}</span></div>`)
    .join("");
  return `<div class="menu-contextual lista-marcos" style="left:${px(d.lista.x)};top:${px(d.lista.y)};width:${px(ancho)};height:${px(M.arriba * 2 + items.length * M.fila)}">${filas}</div>`;
}

/** The drop-down list that is open: the names of an Unbundle By Name, the items of an enum or ring constant, or the frames of a Case. */
function listaAbierta(d, ctx, resueltos) {
  const tipo = d.g.nodos.find((n) => n.id === d.lista.nodo)?.tipo;
  if (tipo === UN.BLOCK) return listaElementos(d, ctx);
  return CONSTANTES[tipo]?.selector ? listaValores(d, ctx) : listaMarcos(d, ctx, resueltos);
}

/**
 * The drop-down list of the names of the elements of the cluster wired into an Unbundle By Name, in
 * the order of the cluster, with the check mark on the one the row shows (cluster palette, stage 2,
 * Q3: 83 x 61 px for three names, background #f0f0f0, border #a0a0a0 like the other lists).
 */
function listaElementos(d, ctx) {
  const n = d.g.nodos.find((k) => k.id === d.lista.nodo);
  if (!n) return "";
  const M = MEDIDAS_MENU;
  const nombres = UN.clusterElementNames(d.g, ctx.cat, n.id);
  const actual = n.config?.items?.[d.lista.fila];
  const ancho = listWidth(nombres, ctx);
  const filas = nombres
    .map((t, k) => `<div class="item-menu item-elemento${t === actual ? " marcado" : ""}" data-nodo="${esc(n.id)}" data-elemento="${k}" style="top:${px(M.arriba + k * M.fila)};height:${px(M.fila)}"><span class="texto-menu" style="left:${px(M.texto)}">${esc(t)}</span></div>`)
    .join("");
  return `<div class="menu-contextual lista-marcos" style="left:${px(d.lista.x)};top:${px(d.lista.y)};width:${px(ancho)};height:${px(M.arriba * 2 + nombres.length * M.fila)}">${filas}</div>`;
}

/** La lista desplegable de marcos (structures/case-lista.png): un menú de filas con la marca en el que se ve. */
function listaMarcos(d, ctx, resueltos) {
  const n = d.g.nodos.find((k) => k.id === d.lista.nodo);
  if (!n) return "";
  const M = MEDIDAS_MENU;
  const textos = textosMarcos(n, selectorKind(d.completo ?? d.g, n, resueltos));
  const ancho = listWidth(textos, ctx);
  const filas = textos
    .map((t, k) => `<div class="item-menu item-marco${k === activoDe(n) ? " marcado" : ""}" data-nodo="${esc(n.id)}" data-marco="${k}" style="top:${px(M.arriba + k * M.fila)};height:${px(M.fila)}"><span class="texto-menu" style="left:${px(M.texto)}">${esc(t)}</span></div>`)
    .join("");
  return `<div class="menu-contextual lista-marcos" style="left:${px(d.lista.x)};top:${px(d.lista.y)};width:${px(ancho)};height:${px(M.arriba * 2 + textos.length * M.fila)}">${filas}</div>`;
}

/** El glifo de un nodo del borde de una estructura: los terminales del bucle, un túnel o un shift register, del color de su tipo. */
function glifoBorde(n, resueltos, g) {
  const color = (tipo) => aspecto(tipo ?? "number").color;
  switch (n.tipo) {
    case "loop-iteration": return G.TERMINAL_ITERACION;
    case "loop-count": return G.TERMINAL_CUENTA;
    case "loop-condition": return G.terminalCondicion(n.config?.mode ?? "stop-if-true");
    case "case-selector": {
      // Verde sin cablear; con un cable, el color de lo que lleva (un decimal pasa a entero: azul).
      const c = g?.cables.find((k) => k.a.nodo === n.id);
      const t = c && resueltos?.cables.get(c.id)?.tipo;
      return G.terminalSelector(color(t === undefined ? "boolean" : esNumerico(t) ? "i32" : t));
    }
    case "case-tunnel-out": {
      // Hueco si algún marco no lo cablea; con Use Default If Unwired, relleno y con un punto.
      const cableados = new Set(g?.cables.filter((k) => k.a.nodo === n.id).map((k) => k.a.puerto));
      const todos = (n.config?.marcos ?? 0) > 0 && Array.from({ length: n.config.marcos }, (_, i) => cableados.has(`x-${i}`)).every(Boolean);
      return G.tunel(color(resueltos?.salidas.get(`${n.id}.y`)), n.config?.["use-default"] ? "defecto" : todos ? "lleno" : "hueco");
    }
    case "shift-register-left": {
      const t = resueltos?.salidas.get(`${n.id}.value`);
      return G.registro("left", t ? color(t) : "#000");
    }
    case "shift-register-right": {
      const t = resueltos?.salidas.get(`${n.id}.result`);
      return G.registro("right", t ? color(t) : "#000");
    }
    default: {
      // Un túnel de bucle indexado: un corchete del color del tipo (array/tunel-for-indexado.png).
      const t = resueltos?.salidas.get(`${n.id}.y`);
      return G.tunel(color(t), "lleno", !!n.config?.indexado);
    }
  }
}

/** Expression Node: las celdas de los terminales, del color de su tipo, y la expresión en medio. */
function expresion(n, k, ctx, resueltos, edicion) {
  const M = MEDIDAS_EXPRESION;
  const tipo = resueltos?.salidas.get(`${n.id}.result`) ?? "number";
  const color = aspecto(tipo).color;
  const ed = edicion?.nodo === n.id ? edicion : null;
  const texto = esc(textoExpresion(n, edicion));
  const valor = ed ? (ed.todo ? `<span class="texto-elegido">${texto}</span>` : `<span>${texto}</span><span class="caret"></span>`) : `<span>${texto}</span>`;
  const flecha = (x0, x1) => `<polygon points="${f2(x0)},${f2(M.alto / 2 - 4)} ${f2(x1)},${f2(M.alto / 2)} ${f2(x0)},${f2(M.alto / 2 + 4)}" fill="${color}"/>`;
  const lados = `<svg class="expresion-lados" viewBox="0 0 ${f2(k.ancho)} ${f2(k.alto)}"><rect x="0" y="0" width="${M.lado}" height="${f2(k.alto)}" class="celda"/><rect x="${f2(k.ancho - M.lado)}" y="0" width="${M.lado}" height="${f2(k.alto)}" class="celda"/>${flecha(1.5, M.lado - 1.5)}${flecha(k.ancho - M.lado + 1.5, k.ancho - 1.5)}</svg>`;
  return `<div class="expresion${ed ? " editando" : ""}" style="padding:0 ${M.lado}px">${lados}<div class="texto-expresion">${valor}</div></div>`;
}

function compuesto(n, k, ctx) {
  const M = medidasCompuesto(n, ctx);
  const b = ctx.cat.bloque(n.tipo);
  const simbolo = b.modos ? b.modos[n.config?.mode ?? b.config.mode.value] : b.simbolo;
  const entradas = ctx.cat.puertos(n).in.length;
  let lineas = "";
  for (let i = 1; i < entradas; i++) lineas += `<line x1="0" y1="${f2(i * M.celda)}" x2="${f2(M.izquierda)}" y2="${f2(i * M.celda)}"/>`;
  return `<svg class="compuesto" viewBox="0 0 ${f2(k.ancho)} ${f2(k.alto)}"><rect x="0.5" y="0.5" width="${f2(k.ancho - 1)}" height="${f2(k.alto - 1)}"/><g class="celdas">${lineas}</g><line class="division" x1="${f2(M.izquierda)}" y1="0" x2="${f2(M.izquierda)}" y2="${f2(k.alto)}"/><text x="${f2(M.izquierda + M.derecha / 2)}" y="${f2(k.alto / 2)}">${esc(simbolo)}</text></svg>`;
}

/**
 * Visible Items ▸ Terminals: el nodo deja de enseñar su icono y enseña su
 * connector pane, cada terminal del color de su tipo —el de lo que le llega,
 * si está cableado— y con bordes negros. En Add, las entradas ocupan la mitad
 * izquierda del triángulo, una encima de otra, y la salida, la punta.
 */
function vistaTerminales(n, k, g, ctx, resueltos) {
  const [w, h] = [k.ancho, k.alto];
  const { in: ins, out: outs } = ctx.cat.puertos(n);
  const triangulo = TRIANGULOS.has(ctx.glifos.get(n.tipo));
  const corte = ins.length && outs.length ? w * 0.52 : ins.length ? w : 0;
  const forma = triangulo ? `0,0 ${f2(w)},${f2(h / 2)} 0,${f2(h)}` : `0,0 ${f2(w)},0 ${f2(w)},${f2(h)} 0,${f2(h)}`;
  const id = `recorte-${esc(n.id)}`;
  let regiones = "";
  let lineas = "";
  const ts = terminales(n, ctx);
  ins.forEach((p, i) => {
    const alto = h / ins.length;
    const tipo = tipoEntrada(n, ts.find((t) => t.puerto === p.name), g, resueltos);
    regiones += `<rect x="0" y="${f2(alto * i)}" width="${f2(corte)}" height="${f2(alto)}" fill="${aspecto(tipo ?? "number").color}"/>`;
    if (i) lineas += `<line x1="0" y1="${f2(alto * i)}" x2="${f2(corte)}" y2="${f2(alto * i)}"/>`;
  });
  outs.forEach((p, i) => {
    const alto = h / outs.length;
    const tipo = resueltos.salidas.get(`${n.id}.${p.name}`);
    regiones += `<rect x="${f2(corte)}" y="${f2(alto * i)}" width="${f2(w - corte)}" height="${f2(alto)}" fill="${aspecto(tipo ?? "number").color}"/>`;
    if (i) lineas += `<line x1="${f2(corte)}" y1="${f2(alto * i)}" x2="${f2(w)}" y2="${f2(alto * i)}"/>`;
  });
  if (ins.length && outs.length) lineas += `<line x1="${f2(corte)}" y1="0" x2="${f2(corte)}" y2="${f2(h)}"/>`;
  return `<svg class="vista-terminales" viewBox="0 0 ${f2(w)} ${f2(h)}"><defs><clipPath id="${id}"><polygon points="${forma}"/></clipPath></defs><g clip-path="url(#${id})">${regiones}<g class="divisiones">${lineas}</g></g><polygon class="contorno" points="${forma}"/></svg>`;
}

/** Los nodos que toca un rectángulo, para seleccionar arrastrando por el fondo. */
export function dentroDe(g0, ctx, r) {
  const g = visibles(g0);
  const [x0, x1] = [Math.min(r.x0, r.x1), Math.max(r.x0, r.x1)];
  const [y0, y1] = [Math.min(r.y0, r.y1), Math.max(r.y0, r.y1)];
  return g.nodos
    .filter((n) => {
      const k = caja(n, ctx);
      // Una estructura se elige rodeándola entera: tocar su interior es seleccionar lo que hay dentro.
      if (esEstructura(n, ctx)) return k.x >= x0 && k.x + k.ancho <= x1 && k.y >= y0 && k.y + k.alto <= y1;
      return k.x < x1 && k.x + k.ancho > x0 && k.y < y1 && k.y + k.alto > y0;
    })
    .map((n) => n.id);
}

/** El menú de clic derecho de cada clase de nodo, en el inventario. */
export function menuDe(n, puerto, g, onElement = false) {
  // Un túnel de entrada de un Case tiene otro menú que el de un bucle (case-menu-tunel-entrada.png).
  if (n.tipo === "tunnel-in" && g?.nodos.find((k) => k.id === n.dentro)?.tipo === "case-structure") return "context.case-tunnel-input";
  if (n.tipo in MENU_ESTRUCTURA) return MENU_ESTRUCTURA[n.tipo];
  if (isSubVI(n)) return "context.subvi";
  // An enum has its own menus, measured with the panel control, the indicator and the
  // constant (DT-049); the diagram terminal of a panel enum uses the same rows.
  if (esEnum(n.config?.type) && (n.tipo === "control" || n.tipo === "indicator")) return n.tipo === "control" ? "context.enum-control" : "context.enum-indicator";
  if (n.tipo === "enum-const") return "context.enum-constant";
  if (n.tipo === "control") return "context.numeric-control";
  if (n.tipo === "bool-control") return "context.boolean-control-terminal";
  // El menú de la constante booleana no está capturado.
  if (n.tipo === "bool-const") return null;
  // Los menús de la constante, el control y el indicador de cadena tampoco (M3: sin capturar).
  if (n.tipo === "str-control" || n.tipo === "str-indicator" || CONSTANTES[n.tipo]?.cadena) return null;
  if (n.tipo === "indicator") return "context.numeric-indicator";
  // The menu of the array constant (labview-captures/array-2d/constant-2d-menu-index.png and constant-2d-menu-shell.png).
  // The element of a typed array constant has its own menu; the index and the margin of the shell keep the array's.
  if (n.tipo === "arr-const") return (onElement && elementMenuRoot(n)) || "context.array-constant";
  // The terminal of a panel array has one menu whose rows follow its element (reports/2026-10-23-array-terminal-menu.md).
  if (n.tipo === "arr-control" || n.tipo === "arr-indicator") return PANEL_ARRAY_TERMINAL_MENU;
  // The right-click menu of the terminal of a graph was not captured.
  if (GRAPH_KINDS.includes(n.tipo)) return null;
  if (UN.isUnbundleByName(n)) return UN.rowHasName(n, UN.rowOfPort(puerto)) ? UN.ROW_MENU : UN.BODY_MENU;
  if (n.tipo === "format-into-string") return "context.format-into-string";
  if (n.tipo === "scan-from-string") return puerto && /^(default|output)-\d+$/.test(puerto) ? "context.scan-from-string-parameter" : "context.scan-from-string";
  if (n.tipo === "compound-arithmetic") return puerto?.startsWith("value-") ? "context.compound-arithmetic-input" : "context.compound-arithmetic";
  if (n.tipo in MENU_COMPARISON) return MENU_COMPARISON[n.tipo];
  return CONSTANTES[n.tipo]?.editable ? "context.numeric-constant" : CONSTANTES[n.tipo] ? null : "context.function";
}

export const PANEL_ARRAY_TERMINAL_MENU = "context.panel-array-terminal";

/** The type tag of a compact array terminal whose element is not numeric: the scalar terminals' tags, unverified for arrays. */
const COMPACT_ARRAY_TAGS = { string: "abc", boolean: "TF" };

/** The frame of an empty array's terminal is black (terminalArrayIndefinido); its compact view keeps it: unverified. */
const COLOR_UNDEFINED_ARRAY = "#000000";

/** El menú de clic derecho del borde de cada estructura y de cada nodo de su borde (labview-captures/structures/menu-*.png). */
const MENU_ESTRUCTURA = {
  "while-loop": "context.while-loop",
  "for-loop": "context.for-loop",
  "loop-iteration": "context.loop-iteration",
  "loop-condition": "context.loop-condition",
  "loop-count": "context.loop-count",
  "tunnel-in": "context.loop-tunnel-input",
  "tunnel-out": "context.loop-tunnel-output",
  "shift-register-left": "context.shift-register",
  "shift-register-right": "context.shift-register",
  "case-structure": "context.case-structure",
  "flat-sequence": "context.flat-sequence",
  "stacked-sequence": "context.stacked-sequence",
  "case-selector": "context.case-selector",
  "case-tunnel-out": "context.case-tunnel-output",
};

/** El menú de las funciones de Comparison: la familia de Equal? tiene Comparison Mode; las de comparar con 0, no. */
const MENU_COMPARISON = {
  ...Object.fromEntries(["equal", "not-equal", "greater", "less", "greater-or-equal", "less-or-equal"].map((b) => [b, "context.comparison-function"])),
  ...Object.fromEntries(["equal-to-0", "not-equal-to-0", "greater-than-0", "less-than-0", "greater-or-equal-to-0", "less-or-equal-to-0", "not-a-number-path-refnum"].map((b) => [b, "context.comparison-with-zero"])),
  select: "context.select",
  "max-and-min": "context.max-and-min",
  "in-range-and-coerce": "context.in-range-and-coerce",
};

/** Filas que en LabVIEW abren un submenú aunque su contenido no esté declarado. Es disposición. */
const CON_SUBMENU = ["visible-items", "numeric-palette", "boolean-palette", "array-palette", "comparison-palette", "replace-comparison", "create", "replace", "change-to-shared-variable-node", "change-mode", "data-operations", "advanced", "representation", "mechanical-action", "structures-palette", "patterns", "linked-input-tunnel", "string-palette", "dialog-and-user-interface-palette", "select-item", "type-palette", "cluster-type-palette", "cluster-class-and-variant-palette", "swap-diagram-with-case", "shift-diagram-to-case", "radix",
  // The graphs (labview-captures/graphs/): rows whose submenus are not declared yet.
  "marker-spacing", "style", "property-node", "invoke-node", "run-time-shortcut-menu", "enabled-state", "update-mode", "export", "x-scale", "y-scale", "common-plots", "color", "line-style", "line-width", "bar-plots", "fill-base-line", "interpolation", "point-style",
  // The Getting Started window's menus (labview-captures/getting-started/).
  "instrumentation", "real-time-module", "merge", "security", "source-control", "vi-analyzer", "import", "shared-variable", "control-and-simulation", "hobbyist", "recent-projects", "recent-files"];

/**
 * El submenú Representation no es una lista: es una rejilla de iconos de 4
 * columnas, a 48 px de paso, con cajas de 32 px (numeric-menu-constante-
 * representacion.png, a escala 1:1). `izquierda` y `arriba` cuentan desde el
 * borde del submenú.
 */
export const MEDIDAS_REJILLA = { columnas: 4, paso: 48, caja: 32, izquierda: 10, arriba: 25, ancho: 206, alto: 220 };

/**
 * Mechanical Action, de front-panel/boolean-menu-mechanical-action.png: otra
 * rejilla de iconos, de 3 columnas y 2 filas, con el nombre de la acción en la
 * franja de arriba al pasar el ratón.
 */
export const MEDIDAS_REJILLA_MECANICA = { columnas: 3, paso: 48, caja: 32, izquierda: 9, arriba: 24, ancho: 156, alto: 123 };

/**
 * Patterns of the connector pane, from connector-menu-patterns.png at 1:1: 6
 * columns of 32 px boxes every 48 px, 9 px from the border on the left and the
 * top, background #f8f8f8, 302 × 301 px with the border. The thumbnails have no
 * name: what a greyed one says is its explanation, on hover (editor-window.mjs).
 */
export const MEDIDAS_REJILLA_PATRONES = { columnas: 6, paso: 48, caja: 32, izquierda: 9, arriba: 9, ancho: 302, alto: 301, sinNombre: true };

/** Los submenús que son una rejilla de iconos: sus medidas y sus iconos, por el último segmento de su id. */
const REJILLAS_MENU = {
  representation: { medidas: MEDIDAS_REJILLA, iconos: G.REPRESENTACIONES },
  "mechanical-action": { medidas: MEDIDAS_REJILLA_MECANICA, iconos: G.ACCIONES_MECANICAS },
  patterns: { medidas: MEDIDAS_REJILLA_PATRONES, iconos: G.PATRONES_CONECTOR },
};

/**
 * The measures of a right-click menu. Rows and separators come from numeric-menu-funcion.png and
 * numeric-menu-constante.png (a video at 150 %: rows of 28.5 px, separators that add 13). The insets
 * were measured again at 1:1 (cluster/w14.png, Unbundle By Name's row menu, 218 px wide): the text
 * starts 22 px from the outer edge, 30 px are left between the longest text and the last pixel of
 * the right border, and a submenu arrow ends 12 px from it; a submenu overlaps its menu by 5 px
 * (reports/2026-10-15-editor-wide.md Q2). `texto`, `derecha` and `flecha` count
 * from the row, which starts 3 px inside the outer edge (the border and the row's own inset).
 */
export const MEDIDAS_MENU = { fila: 19.3, separador: 8.8, arriba: 1.7, texto: 18.6, derecha: 34, flecha: 9, solape: 5, antesAtajo: 12, trasAtajo: 18 };

/**
 * A drop-down list (an Unbundle By Name's names, an enum's items, a Case's frames) has no column for
 * submenu arrows: 25 px between the longest text and its right border (cluster/w13.png, 83 x 61 for
 * status, code and source).
 */
const LIST_RIGHT_INSET = 29;

/** The width of a drop-down list that holds these texts. */
const listWidth = (texts, ctx) => MEDIDAS_MENU.texto + Math.max(0, ...texts.map((text) => ctx.medir(text))) + LIST_RIGHT_INSET;

/** Without the size of the window, a menu opens where it was asked for. */
const NO_LIMITS = { width: Infinity, height: Infinity };

/**
 * Room LabVIEW leaves between a menu that was moved and the edge it would have crossed
 * (reports/2026-10-15-editor-wide.md Q2): 2 px at the bottom of the screen and between a menu flipped
 * to the left and the click; a grid of icons, as Numeric Palette ▸, keeps 6 px at the bottom.
 */
const MENU_EDGE_GAP = 2;
const GRID_EDGE_GAP = 6;

/** The top of a box of `height` that starts at `top`, moved up to end `gap` px above `limit` when it does not fit, never above 0. */
const shiftedUp = (top, height, limit, gap) => (top + height > limit ? Math.max(0, limit - height - gap) : top);

/**
 * Where a right-click menu of `size` opens for a click at `click`, inside a window of `limits`, as LabVIEW
 * does at the edges of the screen (reports/2026-10-15-editor-wide.md Q2): one that does not fit below is
 * moved up until its bottom is 2 px above the edge (it does not open upward from the click), and one that
 * does not fit on the right opens to the left of the click, its right edge 2 px before it. LabVIEW's menus
 * can leave the VI window and only stop at the screen; Solder's are drawn in the window, which stands for
 * the screen.
 */
export function placeMenu(click, size, limits) {
  const x = click.x + size.width > limits.width ? Math.max(0, click.x - size.width - MENU_EDGE_GAP) : click.x;
  return { x, y: shiftedUp(click.y, size.height, limits.height, MENU_EDGE_GAP) };
}

/**
 * Where a submenu of `size` opens beside the menu `parent` (its `x`, `width`, and the `y` of the row that
 * opens it): on the right, overlapping the menu by `solape`, or on the left with the same overlap when it does
 * not fit; moved up like a menu when it does not fit below (reports/2026-10-15-editor-wide.md Q2).
 */
export function placeSubmenu(parent, size, limits, grid = false) {
  const right = parent.x + parent.width - MEDIDAS_MENU.solape;
  const x = right + size.width > limits.width ? Math.max(0, parent.x - size.width + MEDIDAS_MENU.solape) : right;
  return { x, y: shiftedUp(parent.y, size.height, limits.height, grid ? GRID_EDGE_GAP : MENU_EDGE_GAP) };
}

/** El ancho de un texto de menú, a falta de medirlo en pantalla (la ventana pasa el suyo). */
const anchoMenuAproximado = (t) => [...t].reduce((s, c) => s + (/[A-Z]/.test(c) ? 7.3 : /[il.,' ]/.test(c) ? 3.1 : 6.1), 0);

/**
 * Un menú de clic derecho y, si hay uno abierto, su submenú. `menu`:
 * `{ raiz, x, y, abierto }`, en coordenadas de la ventana; `marcados`, los
 * ids que llevan la marca de activado. `limites`, the size of the window: a menu that does not fit
 * is moved to stay inside it (`placeMenu`, `placeSubmenu`).
 */
export function menuContextual(inv, menu, marcados = new Set(), medir = anchoMenuAproximado, variante = {}, limites = NO_LIMITS) {
  const M = MEDIDAS_MENU;
  // Los menús de la barra llevan sus atajos en una segunda columna, como en
  // front-panel/menu-file.png: tras el texto más largo, y a 18 px del borde.
  // Algunos menús cambian de filas y de nombres según el estado (el Case: booleano o numérico, qué marco se ve).
  // Rows can also be greyed by context (`desactivados`, as Remove Dimension on a 1D array) or stand for a hole
  // that explains a limit of Solder (`redirigidos`: the row id to the inventory entry it explains).
  // `submenus`: the rows of a submenu that the diagram decides, as the names of the cluster in Unbundle By Name's Select Item.
  const { ocultos = new Set(), rotulos = new Map(), desactivados = new Set(), redirigidos = new Map(), mostrados = new Set(), submenus = new Map() } = variante;
  // Disable Breakpoint only exists in the menu of something that has a breakpoint (debugging/debug-view.mjs `menuVariants`).
  const { separadores = new Map() } = variante;
  const separadoEn = (e) => separadores.get(e.id) ?? !!e.separado;
  const hijos = (padre) => (submenus.get(padre) ?? inv.hijos(padre)).filter((e) => !ocultos.has(e.id) && (ultimo(e.id) !== "disable-breakpoint" || mostrados.has(e.id)));
  const rotuloDe = (e) => rotulos.get(e.id) ?? e.etiqueta;
  const anchoAtajos = (padre) => Math.max(0, ...hijos(padre).map((e) => (e.atajo ? medir(e.atajo) : 0)));
  const anchoTextos = (padre) => Math.max(...hijos(padre).map((e) => medir(rotuloDe(e))));
  const anchoDe = (padre) => {
    const atajos = anchoAtajos(padre);
    return M.texto + anchoTextos(padre) + (atajos ? M.antesAtajo + atajos + M.trasAtajo : M.derecha);
  };
  const rejilla = (padre, x, y) => {
    const { medidas: R, iconos } = REJILLAS_MENU[ultimo(padre)];
    const celdas = inv
      .hijos(padre)
      .map((e, i) => {
        const [fila, col] = [Math.floor(i / R.columnas), i % R.columnas];
        const clases = `item-menu celda-rep${R.sinNombre ? " celda-patron" : ""}${esHueco(e) ? " hueco" : ""}${marcados.has(e.id) ? " marcado" : ""}`;
        // Al pasar el ratón, el nombre sale en la franja de arriba, centrado en el submenú (CSS, con estas variables).
        const nombre = R.sinNombre ? "" : `<span class="nombre-celda" style="left:${px(-(R.izquierda + col * R.paso))};top:${px(-(R.arriba + fila * R.paso) + 3)};width:${px(R.ancho)}">${esc(e.etiqueta)}</span>`;
        return `<div class="${clases}" data-id="${esc(e.id)}" style="left:${px(R.izquierda + col * R.paso)};top:${px(R.arriba + fila * R.paso)}">${iconos[ultimo(e.id)] ?? ""}${nombre}</div>`;
      })
      .join("");
    return `<div class="menu-contextual rejilla" data-menu="${esc(padre)}" style="left:${px(x)};top:${px(y)};width:${px(R.ancho)};height:${px(R.alto)}">${celdas}</div>`;
  };
  // The size of a menu, known before it is drawn so that it can be placed inside the window.
  const altoDe = (padre) => hijos(padre).reduce((alto, e) => alto + (separadoEn(e) ? M.separador : 0) + M.fila, 2 * M.arriba);
  const tamanoDe = (padre) => (ultimo(padre) in REJILLAS_MENU ? { width: REJILLAS_MENU[ultimo(padre)].medidas.ancho, height: REJILLAS_MENU[ultimo(padre)].medidas.alto } : { width: anchoDe(padre), height: altoDe(padre) });
  const lista = (padre, x, y) => {
    if (ultimo(padre) in REJILLAS_MENU) return rejilla(padre, x, y);
    const ancho = anchoDe(padre);
    let top = M.arriba;
    let filas = "";
    let sub = "";
    for (const e of hijos(padre)) {
      if (separadoEn(e)) {
        filas += `<div class="separador-menu" style="top:${px(top + M.separador / 2 - 0.5)}"></div>`;
        top += M.separador;
      }
      // A row that opens a window ends in "..." and has no arrow, though it shares its name with a submenu (the enum's Select Item... and Unbundle By Name's Select Item ▸).
      const conSub = inv.tieneContenido(e.id) || submenus.has(e.id) || (CON_SUBMENU.includes(ultimo(e.id)) && !e.etiqueta.endsWith("..."));
      const abierto = menu.abierto === e.id;
      const hueco = esHueco(e) || redirigidos.has(e.id);
      const clases = `item-menu${hueco ? " hueco" : ""}${desactivados.has(e.id) ? " desactivado" : ""}${abierto ? " activo" : ""}${marcados.has(e.id) ? " marcado" : ""}`;
      const flecha = conSub ? `<span class="flecha-menu" style="right:${px(M.flecha)}">${G.FLECHA_CATEGORIA}</span>` : "";
      const atajo = e.atajo ? `<span class="atajo-menu" style="left:${px(M.texto + anchoTextos(padre) + M.antesAtajo)}">${esc(e.atajo)}</span>` : "";
      filas += `<div class="${clases}" data-id="${esc(redirigidos.get(e.id) ?? e.id)}" style="top:${px(top)};height:${px(M.fila)}"><span class="texto-menu" style="left:${px(M.texto)}">${esc(rotuloDe(e))}</span>${atajo}${flecha}</div>`;
      if (abierto && (inv.tieneContenido(e.id) || submenus.has(e.id))) {
        const place = placeSubmenu({ x, y: y + top - M.arriba, width: ancho }, tamanoDe(e.id), limites, ultimo(e.id) in REJILLAS_MENU);
        sub = lista(e.id, place.x, place.y);
      }
      top += M.fila;
    }
    return `<div class="menu-contextual" data-menu="${esc(padre)}" style="left:${px(x)};top:${px(y)};width:${px(ancho)};height:${px(top + M.arriba)}">${filas}</div>${sub}`;
  };
  const place = placeMenu({ x: menu.x, y: menu.y }, tamanoDe(menu.raiz), limites);
  return lista(menu.raiz, place.x, place.y);
}

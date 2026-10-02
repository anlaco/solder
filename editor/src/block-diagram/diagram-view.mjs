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
import { CONSTANTES_MATEMATICAS } from "../../../core/model/math-constants.mjs";
import { COLORES, aspecto, esArray, esEntero, esError, esNumerico, formatear, nombre } from "../../../core/model/types.mjs";

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

/** El glifo de un nodo: el de su elemento de la paleta; el de una constante booleana, según su valor. */
const glifoDe = (n, ctx) => (n.tipo === "bool-const" ? (n.config?.value ? "true-constant" : "false-constant") : ctx.glifos.get(n.tipo));

const tipoConfig = (n, ctx) => n.config?.type ?? ctx.cat.bloque(n.tipo).config?.default?.type ?? "number";

/**
 * Constantes que LabVIEW pinta en el diagrama como una caja con su valor, y no
 * con su icono de la paleta; el borde es el color de su tipo. `editable`: se
 * escribe en ellas con doble clic.
 */
export const CONSTANTES = {
  "num-const": { editable: true, texto: (n, ctx) => formatear(n.config?.value ?? 0, tipoConfig(n, ctx), ctx.separador) },
  const: { editable: true, texto: (n, ctx) => formatear(n.config?.value ?? 0, "number", ctx.separador) },
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
  "enum-const": { texto: () => "", selector: true },
  "ring-const": { texto: () => "", selector: true },
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
 * La constante de array, medida a 1:1 en labview-captures/array/constante-array.png (vacía, con un elemento I32):
 * el índice, de 33 × 21 px, y la caja de los elementos pegada a su derecha (solapa 1 px), de 25 px de alto, con
 * dos bordes del color del tipo; cada elemento mide lo que una constante más 2 px de borde y 3 de alto (15 × 21).
 */
export const MEDIDAS_ARRAY = { indice: 33, altoIndice: 21, solape: 1, alto: 25, relleno: 2, bordeElemento: 1, altoElemento: 21 };
/** El tipo de los elementos de una constante de array, y sus valores. */
export const tipoElementoArray = (n) => n.config?.type?.array ?? "number";
export const valoresArray = (n) => n.config?.value ?? [];
/** Cuántos elementos enseña la constante: los que se le han dejado ver (de uno, de fábrica). */
export const visiblesArray = (n) => Math.max(1, n.config?.visibles ?? 1);
const textoElemento = (v, t, sep) => (t === "string" ? String(v ?? "") : t === "boolean" ? (v ? "T" : "F") : formatear(v ?? 0, t, sep));
/** El ancho de la caja de cada elemento de la constante: el del más ancho de los que se ven. */
export function anchoElementoArray(n, ctx, edicion) {
  const [t, valores, k0] = [tipoElementoArray(n), valoresArray(n), n.config?.indice ?? 0];
  let ancho = 0;
  for (let k = 0; k < visiblesArray(n); k++) {
    const txt = edicion?.nodo === n.id && edicion.elem === k0 + k ? edicion.texto : textoElemento(valores[k0 + k], t, ctx.separador);
    ancho = Math.max(ancho, MEDIDAS_CONSTANTE.minimo, anchoTexto(txt) + MEDIDAS_CONSTANTE.relleno);
  }
  return ancho + 2 * MEDIDAS_ARRAY.bordeElemento;
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
 * Cómo se llama un marco: sus valores separados por coma —los rangos, «2..4»—
 * y «Default» al final si lo es («0, Default»); False y True en un booleano.
 */
export function etiquetaMarco(m) {
  const valor = (v) => (typeof v === "boolean" ? (v ? "True" : "False") : typeof v === "number" ? String(v) : `${v.min ?? ""}..${v.max ?? ""}`);
  const partes = (m.valores ?? []).map(valor);
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
export function textosMarcos(n) {
  const ms = marcosDe(n);
  return esApilada(n) ? ms.map((_, k) => `${k} [0..${ms.length - 1}]`) : ms.map(etiquetaMarco);
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

/** El grafo sólo con lo que se ve: sin los nodos de los marcos escondidos ni los cables que llegan a ellos. */
export function visibles(g) {
  const fuera = new Set(g.nodos.filter((n) => oculto(g, n)).map((n) => n.id));
  if (!fuera.size) return g;
  return { ...g, nodos: g.nodos.filter((n) => !fuera.has(n.id)), cables: g.cables.filter((c) => !fuera.has(c.de.nodo) && !fuera.has(c.a.nodo)) };
}

/** Un terminal del túnel de salida de un Case que no es el del marco que se ve no se pinta ni se pulsa. */
const terminalVisible = (n, t, g) => {
  if (n.tipo !== "case-tunnel-out" || t.dir !== "in") return true;
  const caso = g.nodos.find((k) => k.id === n.dentro);
  return !caso || Number(t.puerto.slice(2)) === activoDe(caso);
};

/**
 * Las medidas del selector de marcos de un Case de ancho `ancho`: el del texto
 * más ancho de sus marcos (o el que se escribe) y centrado en el borde de arriba.
 * Devuelve lo que ocupa, dónde empieza (desde la esquina del Case) y el texto.
 */
export function medidasSelector(n, ctx, edicion) {
  const M = G.SELECTOR_MARCOS;
  const escribiendo = edicion?.marco && edicion.nodo === n.id;
  const textos = textosMarcos(n).map((t, k) => (escribiendo && k === activoDe(n) ? edicion.texto : t));
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
  if (c?.array) {
    const A = MEDIDAS_ARRAY;
    return { x: n.x, y: n.y, ancho: A.indice - A.solape + visiblesArray(n) * anchoElementoArray(n, ctx, edicion) + 2 * A.relleno, alto: A.alto };
  }
  if (c?.error) return { x: n.x, y: n.y, ancho: MEDIDAS_CONSTANTE_ERROR.ancho, alto: MEDIDAS_CONSTANTE_ERROR.alto };
  if (c?.cadena) {
    const M = MEDIDAS_CADENA;
    const lineas = textoConstante(n, ctx, edicion).split("\n");
    return { x: n.x, y: n.y, ancho: Math.max(M.minimo, Math.max(...lineas.map(anchoTexto)) + M.horizontal), alto: lineas.length * M.linea + M.vertical };
  }
  if (c) {
    const M = MEDIDAS_CONSTANTE;
    const ancho = Math.max(M.minimo, anchoTexto(textoConstante(n, ctx, edicion)) + M.relleno) + (c.selector ? 9 : 0);
    return { x: n.x, y: n.y, ancho, alto: M.alto };
  }
  const [x0, y0, x1, y1] = G.CAJAS[glifoDe(n, ctx)] ?? [8, 8, 41, 41];
  return { x: n.x, y: n.y, ancho: (x1 - x0) / 1.5, alto: (y1 - y0) / 1.5, dx: x0 / 1.5, dy: y0 / 1.5 };
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
  const { in: ins, out: outs } = ctx.cat.puertos(n);
  // Cada lado se queda con algo más de un tercio del nodo; lo del medio es el
  // cuerpo, que es lo que se agarra para moverlo. Una constante sólo tiene
  // salida: su mitad derecha.
  const anchoZona = esBorde(n) ? k.ancho / (ins.length && outs.length ? 2 : 1) : esCompuesto(n, ctx) ? medidasCompuesto(n, ctx).izquierda * 0.7 : ins.length ? Math.max(6, k.ancho * 0.36) : Math.max(6, k.ancho * 0.5);
  // Un terminal del panel recibe o da el dato por su flecha.
  const flecha = esDelPanel(n, ctx) ? medidasPanel(n).flecha : null;
  const reparte = (lista, dir) =>
    lista.map((p, i0) => {
      // El túnel de salida de un Case tiene una entrada por marco, pero todas en el mismo sitio.
      const [i, cuantos] = n.tipo === "case-tunnel-out" && dir === "in" ? [0, 1] : [i0, lista.length];
      const alto = k.alto / cuantos;
      const zona = { x: dir === "in" ? k.x : k.x + k.ancho - anchoZona, y: k.y + alto * i, ancho: anchoZona, alto };
      return {
        puerto: p.name,
        // Una constante no tiene nombre en su terminal: LabVIEW no enseña tip.
        etiqueta: p.label ?? p.name,
        dir,
        x: dir === "in" ? k.x : k.x + k.ancho,
        y: flecha !== null ? k.y + flecha : k.y + alto * (i + 0.5),
        zona,
        centro: { x: zona.x + zona.ancho / 2, y: zona.y + zona.alto / 2 },
      };
    });
  return [...reparte(ins, "in"), ...reparte(outs, "out")];
}

/** Todos los terminales del diagrama, por `nodo.puerto`. */
export function extremos(g, ctx, edicion) {
  const m = new Map();
  for (const n of g.nodos) for (const t of terminales(n, ctx, edicion)) m.set(`${n.id}.${t.puerto}`, t);
  return m;
}

/** Cuánto se separa el último codo de la entrada: 2 a 6 px del vídeo. */
const ARRIMO = 4;

/**
 * Los codos que LabVIEW da a un cable nuevo: el tramo vertical casi pegado al
 * terminal donde se suelta, que es donde estaba el ratón. Si la entrada queda
 * por detrás de la salida, el cable rodea.
 */
export function codosPorDefecto(a, b, sueltaEnLaSalida = false) {
  if (b.x - a.x >= 2 * ARRIMO) return [sueltaEnLaSalida ? a.x + ARRIMO : b.x - ARRIMO];
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

/** Pinta un cable: su color es el de su tipo y su grosor, el de su dimensión. */
function trazo(r, tipo, roto) {
  if (roto) return `<polyline points="${puntos(r)}" class="cable-roto"/>`;
  const { color, dimension, error } = aspecto(tipo);
  // Un cable de error mide 3 px: borde oliva y, en el centro, trazos de 2 px amarillos y negros (YYKK).
  if (error) return `<polyline points="${puntos(r)}" stroke="${color}" stroke-width="3"/><polyline points="${puntos(r)}" stroke="#ffff00" stroke-width="1" stroke-dasharray="2 2"/><polyline points="${puntos(r)}" stroke="#000" stroke-width="1" stroke-dasharray="2 2" stroke-dashoffset="-2"/>`;
  if (dimension === 0) return `<polyline points="${puntos(r)}" stroke="${color}" stroke-width="1.33"/>`;
  // Un array de una dimensión: 2 px, de un color sólido (medido a 1:1 en labview-captures/array/array-indicador-terminal.png).
  if (dimension === 1) return `<polyline points="${puntos(r)}" stroke="${color}" stroke-width="2"/>`;
  return `<polyline points="${puntos(r)}" stroke="${color}" stroke-width="5"/><polyline points="${puntos(r)}" stroke="#fff" stroke-width="1"/>`;
}

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
    const a = ext.get(`${c.de.nodo}.${c.de.puerto}`);
    const b = ext.get(`${c.a.nodo}.${c.a.puerto}`);
    const info = resueltos.cables.get(c.id);
    const r = ruta(a, b, c.codos);
    const entero = elegidos.has(c.id);
    const tip = info.roto ? ` data-tip="${esc(info.roto)}"` : "";
    cables += `<g class="cable${entero ? " seleccionado" : ""}${info.roto ? " roto" : ""}" data-cable="${esc(c.id)}"${tip}>${trazo(r, info.tipo, info.roto)}`;
    for (let k = 0; k < r.length - 1; k++) {
      const [[x1, y1], [x2, y2]] = [r[k], r[k + 1]];
      if (x1 === x2 && y1 === y2) continue;
      const sel = entero || elegidos.has(`${c.id}#${k}`);
      if (sel) cables += `<line class="tramo-elegido" x1="${f2(x1)}" y1="${f2(y1)}" x2="${f2(x2)}" y2="${f2(y2)}"/>`;
      cables += `<line class="tramo-zona" data-cable="${esc(c.id)}" data-tramo="${k}" x1="${f2(x1)}" y1="${f2(y1)}" x2="${f2(x2)}" y2="${f2(y2)}"/>`;
    }
    if (info.roto) {
      const [[x1, y1], [x2, y2]] = [r[Math.floor((r.length - 1) / 2)], r[Math.floor((r.length - 1) / 2) + 1]];
      const [mx, my] = [(x1 + x2) / 2, (y1 + y2) / 2];
      cables += `<g class="cable-x"><line x1="${mx - 3}" y1="${my - 3}" x2="${mx + 3}" y2="${my + 3}"/><line x1="${mx - 3}" y1="${my + 3}" x2="${mx + 3}" y2="${my - 3}"/></g>`;
    }
    cables += `</g>`;
    // En una Flat Sequence, un cable que va de un marco a uno posterior cruza cada separador por un túnel (secuencia-15.png).
    tuneles += tunelesDeSecuencia(g, c, r, info.tipo);
    // El punto de unión de una rama: un punto del color del cable.
    if (c.union && !info.roto) cunas += `<circle class="union" cx="${f2(c.union[0])}" cy="${f2(c.union[1])}" r="2.2" fill="${aspecto(info.tipo).color}"/>`;
    // El punto de coerción: una cuña roja en el borde de la entrada que convierte.
    const aSelector = g.nodos.find((k) => k.id === c.a.nodo)?.tipo === "case-selector";
    if (info.coercion || (aSelector && esNumericoNoEntero(info.tipo))) cunas += `<polygon class="coercion" points="${f2(b.x)},${f2(b.y - 2.7)} ${f2(b.x + 3.3)},${f2(b.y)} ${f2(b.x)},${f2(b.y + 2.7)}"/>`;
  }

  // El cable que se está tirando: punteado, en horizontal hasta la x del ratón
  // y en vertical hasta él.
  let nuevo = "";
  if (accion?.tipo === "cablear") {
    const t = ext.get(`${accion.desde.nodo}.${accion.desde.puerto}`);
    if (t) nuevo = `<polyline class="cable-tirando" points="${puntos([[t.centro.x, t.centro.y], [accion.x, t.centro.y], [accion.x, accion.y]])}"/>`;
  }

  // En una Stacked Sequence, un cable de un marco a uno posterior se ve como su variable local (secuencia-9.png a secuencia-14.png).
  const locales = localesDeApiladas(d0, ctx, resueltos);
  cables += locales.cables;

  // Las estructuras, debajo de todo, de fuera a dentro: son su marco y nada más.
  const estructuras = g.nodos
    .filter((n) => esEstructura(n, ctx))
    .sort((a, b) => profundidad(g, a) - profundidad(g, b))
    .map((n) => estructura(n, ctx, elegidos.has(n.id), d))
    .join("");
  const nodos = g.nodos.filter((n) => !esEstructura(n, ctx)).map((n) => nodo(n, d, ctx, resueltos, elegidos.has(n.id))).join("");
  const etiquetas = g.nodos
    .filter((n) => n.label)
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
    const n = { id: "fantasma", tipo: accion.bloque, x: accion.x, y: accion.y };
    fantasma = `<div class="fantasma">${nodo(n, { g, seleccion: [] }, ctx, null, false)}</div>`;
  }
  const lista = d.lista ? listaMarcos(d, ctx) : "";
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
    const cruzan = g.cables.filter((c) => {
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
      if (f === m1) cables += `<g class="cable">${trazo([[de.x, de.y], [x + 6, de.y], [x + 6, y0]], tipo, false)}</g>`;
      if (f === m2) cables += `<g class="cable">${trazo([[x + 6, y0], [x + 6, a.y], [a.x, a.y]], tipo, false)}</g>`;
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
    const fuera = t.dir === "in" ? -4.5 : 4.5;
    h += `<g class="pista"><line x1="${f2(t.x)}" y1="${f2(t.y)}" x2="${f2(t.x + fuera)}" y2="${f2(t.y)}" stroke="${color}" stroke-width="1.33"/><circle cx="${f2(t.x)}" cy="${f2(t.y)}" r="1.9" fill="${color}"/></g>`;
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

/** La constante de array: el índice a la izquierda y, a su derecha, la caja con los elementos que se ven. */
function constanteArray(n, k, ctx, edicion) {
  const A = MEDIDAS_ARRAY;
  const [t, valores, k0] = [tipoElementoArray(n), valoresArray(n), n.config?.indice ?? 0];
  const color = aspecto(t).color;
  const ancho = anchoElementoArray(n, ctx, edicion);
  const celdas = Array.from({ length: visiblesArray(n) }, (_, j) => {
    const i = k0 + j;
    const ed = edicion?.nodo === n.id && edicion.elem === i ? edicion : null;
    const txt = esc(ed ? ed.texto : textoElemento(valores[i], t, ctx.separador));
    const valor = ed ? (ed.todo ? `<span class="texto-elegido">${txt}</span>` : `<span>${txt}</span><span class="caret"></span>`) : `<span>${txt}</span>`;
    return `<div class="celda-array${i >= valores.length ? " vacia" : ""}${ed ? " editando" : ""}" data-campo="${i}" style="width:${px(ancho)};border-color:${color}">${valor}</div>`;
  }).join("");
  return `<div class="constante-array" style="width:${px(k.ancho)};height:${px(A.alto)}">` +
    `<div class="indice-array" style="width:${px(A.indice)};height:${px(A.altoIndice)};border-color:${color}"><span class="paso-indice">▴▾</span><span class="campo-indice">${k0}</span></div>` +
    `<div class="caja-array" style="left:${px(A.indice - A.solape)};width:${px(k.ancho - A.indice + A.solape)};height:${px(A.alto)};border-color:${color}">${celdas}</div></div>`;
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
    const glifo = esArray(tipo)
      ? G.terminalPanelIcono(control, aspecto(tipo).color, nombre(hoja), G.dibujoArray(control))
      : esError(tipo)
      ? (n.vista?.compacto ? G.terminalPanelCompacto(control, COLORES.error, "") : G.terminalPanelIcono(control, COLORES.error, "", G.dibujoError(control), "cluster"))
      : tipo === "boolean"
      ? G.terminalBooleano(n.config?.style, control, aspecto(tipo).color, !!n.vista?.compacto, !!n.config?.value)
      : tipo === "string"
        ? (n.vista?.compacto ? G.terminalPanelCompacto(control, aspecto(tipo).color, "abc") : G.terminalPanelIcono(control, aspecto(tipo).color, "abc", G.dibujoCadena(control)))
        : (n.vista?.compacto ? G.terminalPanelCompacto : G.terminalPanelIcono)(control, aspecto(tipo).color, nombre(tipo));
    cuerpo = `<div class="glifo-terminal-panel">${glifo}</div>`;
  } else if (esExpresion(n)) {
    cuerpo = expresion(n, k, ctx, resueltos, d.edicion);
  } else if (esCompuesto(n, ctx)) {
    cuerpo = compuesto(n, k, ctx);
  } else if (n.vista?.terminales && resueltos) {
    cuerpo = vistaTerminales(n, k, d.g, ctx, resueltos);
  } else {
    const clave = glifoDe(n, ctx);
    const glifo = G.FUNCIONES[clave] ?? "";
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
  // Las asas para estirar un nodo de entradas variables, si está seleccionado.
  let asas = "";
  if (elegido && c?.array) asas = `<div class="asa" data-nodo="${esc(n.id)}" data-asa="derecha" style="left:${px(k.ancho - 3)};top:${px(k.alto / 2 - 3)}"></div>`;
  if (elegido && esCompuesto(n, ctx)) {
    const M = medidasCompuesto(n, ctx);
    const x = M.izquierda - M.asa / 2;
    asas = `<div class="asa" data-nodo="${esc(n.id)}" data-asa="arriba" style="left:${px(x)};top:${px(0.7)}"></div><div class="asa" data-nodo="${esc(n.id)}" data-asa="abajo" style="left:${px(x)};top:${px(k.alto - M.asa - 0.7)}"></div>`;
  }
  // Invert: un circulito en el terminal invertido.
  const invertidas = new Set(n.config?.inverted ?? []);
  const circulos = terminales(n, ctx, d.edicion)
    .filter((t) => invertidas.has(t.puerto))
    .map((t) => `<div class="invertida" style="left:${px(t.x - k.x + (t.dir === "in" ? -1.8 : 1.8) - 1.8)};top:${px(t.y - k.y - 1.8)}"></div>`)
    .join("");
  const escribiendo = d.edicion?.nodo === n.id && !d.edicion.etiqueta;
  return `<div class="nodo${elegido || escribiendo ? " seleccionado" : ""}${editable}" data-nodo="${esc(n.id)}" style="left:${px(k.x)};top:${px(k.y)};width:${px(k.ancho)};height:${px(k.alto)}">${cuerpo}${circulos}${zonas}${asas}</div>`;
}

/**
 * Una estructura: su marco, las bandas del marco que se agarran (el interior
 * no: un clic dentro es un clic en el fondo) y, seleccionada, el tinte azulado
 * y las ocho asas de estirar (structures/seleccion.png).
 */
function estructura(n, ctx, elegido, d) {
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
  const asas = elegido
    ? ASAS.map((l) => {
        const a = cajaAsa(l, k);
        return `<div class="asa asa-estructura" data-nodo="${esc(n.id)}" data-asa="${l}" style="left:${px(a.x)};top:${px(a.y)}"></div>`;
      }).join("")
    : "";
  const clase = `${caso ? "estructura-case" : esFlat(n) ? "estructura-flat" : esApilada(n) ? "estructura-stacked" : esFor ? "estructura-for" : "estructura-while"}${elegido ? " seleccionado" : ""}`;
  return `<div class="nodo estructura ${clase}" data-nodo="${esc(n.id)}" style="left:${px(k.x)};top:${px(k.y)};width:${px(k.ancho)};height:${px(k.alto)}">${tinte}${marco}${bandas}${conSelector(n) ? selectorDeMarcos(n, ctx, d) : ""}${asas}</div>`;
}

/**
 * El selector de marcos de un Case (structures/case-1.png): el cuerpo, el texto
 * del marco que se ve —con su selección o su cursor si se escribe en él— y las
 * zonas que se pulsan: la flecha anterior, la siguiente, el triángulo que abre la
 * lista y el texto, que con doble clic se edita.
 */
function selectorDeMarcos(n, ctx, d) {
  const M = G.SELECTOR_MARCOS;
  const m = medidasSelector(n, ctx, d.edicion);
  const xd = m.ancho - 9;
  const ed = d.edicion?.marco && d.edicion.nodo === n.id ? d.edicion : null;
  const t = esc(m.actual);
  const texto = ed
    ? ed.todo
      ? `<rect x="${M.textoX - 1}" y="3" width="${f2(m.anchoActual + 2)}" height="11" fill="#000"/><text x="${M.textoX}" y="${M.baseline}" class="texto-selector texto-blanco">${t}</text>`
      : `<text x="${M.textoX}" y="${M.baseline}" class="texto-selector">${t}</text><rect class="caret-selector" x="${f2(M.textoX + m.anchoActual)}" y="3" width="1" height="11" fill="#000"/>`
    : `<text x="${M.textoX}" y="${M.baseline}" class="texto-selector">${t}</text>`;
  const zona = (z, x, ancho) => `<div class="marco-zona" data-nodo="${esc(n.id)}" data-zona="${z}" style="left:${px(x)};top:1px;width:${px(ancho)};height:15px"></div>`;
  const zonas = zona("anterior", 1, M.boton) + zona("texto", M.divisor + 1, xd - M.divisor - 11) + zona("lista", xd - 10, 10) + zona("siguiente", xd + 1, M.boton);
  const cuerpo = G.selectorMarcos(m.texto).replace("</svg>", `${texto}</svg>`);
  return `<div class="selector-de-marcos" style="left:${px(m.x)};top:0">${cuerpo}${zonas}</div>`;
}

/** La lista desplegable de marcos (structures/case-lista.png): un menú de filas con la marca en el que se ve. */
function listaMarcos(d, ctx) {
  const n = d.g.nodos.find((k) => k.id === d.lista.nodo);
  if (!n) return "";
  const M = MEDIDAS_MENU;
  const textos = textosMarcos(n);
  const ancho = M.texto + Math.max(0, ...textos.map((t) => ctx.medir(t))) + M.derecha;
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
export function menuDe(n, puerto, g) {
  // Un túnel de entrada de un Case tiene otro menú que el de un bucle (case-menu-tunel-entrada.png).
  if (n.tipo === "tunnel-in" && g?.nodos.find((k) => k.id === n.dentro)?.tipo === "case-structure") return "context.case-tunnel-input";
  if (n.tipo in MENU_ESTRUCTURA) return MENU_ESTRUCTURA[n.tipo];
  if (n.tipo === "control") return "context.numeric-control";
  if (n.tipo === "bool-control") return "context.boolean-control-terminal";
  // El menú de la constante booleana no está capturado.
  if (n.tipo === "bool-const") return null;
  // Los menús de la constante, el control y el indicador de cadena tampoco (M3: sin capturar).
  if (n.tipo === "str-control" || n.tipo === "str-indicator" || CONSTANTES[n.tipo]?.cadena) return null;
  if (n.tipo === "indicator") return "context.numeric-indicator";
  // El menú de la constante, el control y el indicador de array tampoco está capturado (array/panel-array-menu.png es el del panel).
  if (n.tipo === "arr-const" || n.tipo === "arr-control" || n.tipo === "arr-indicator") return null;
  if (n.tipo === "compound-arithmetic") return puerto?.startsWith("value-") ? "context.compound-arithmetic-input" : "context.compound-arithmetic";
  if (n.tipo in MENU_COMPARISON) return MENU_COMPARISON[n.tipo];
  return CONSTANTES[n.tipo]?.editable ? "context.numeric-constant" : CONSTANTES[n.tipo] ? null : "context.function";
}

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
const CON_SUBMENU = ["visible-items", "numeric-palette", "boolean-palette", "comparison-palette", "replace-comparison", "create", "replace", "change-to-shared-variable-node", "change-mode", "data-operations", "advanced", "representation", "mechanical-action", "structures-palette", "linked-input-tunnel", "swap-diagram-with-case", "shift-diagram-to-case", "radix"];

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

/** Los submenús que son una rejilla de iconos: sus medidas y sus iconos, por el último segmento de su id. */
const REJILLAS_MENU = {
  representation: { medidas: MEDIDAS_REJILLA, iconos: G.REPRESENTACIONES },
  "mechanical-action": { medidas: MEDIDAS_REJILLA_MECANICA, iconos: G.ACCIONES_MECANICAS },
};

/**
 * Medidas de un menú de clic derecho, de numeric-menu-funcion.png y
 * numeric-menu-constante.png: filas de 28,5 px del vídeo, separadores que
 * añaden 13, la flecha de los submenús a 21 del borde derecho. El ancho se
 * ajusta al texto más largo: 32 px del vídeo a su izquierda y 46 a su derecha,
 * en los dos menús (246 px el de Add, 334 el de la constante).
 */
export const MEDIDAS_MENU = { fila: 19.3, separador: 8.8, arriba: 1.7, texto: 21.6, derecha: 31, flecha: 14, solape: 4, antesAtajo: 12, trasAtajo: 18 };

/** El ancho de un texto de menú, a falta de medirlo en pantalla (la ventana pasa el suyo). */
const anchoMenuAproximado = (t) => [...t].reduce((s, c) => s + (/[A-Z]/.test(c) ? 7.3 : /[il.,' ]/.test(c) ? 3.1 : 6.1), 0);

/**
 * Un menú de clic derecho y, si hay uno abierto, su submenú. `menu`:
 * `{ raiz, x, y, abierto }`, en coordenadas de la ventana; `marcados`, los
 * ids que llevan la marca de activado.
 */
export function menuContextual(inv, menu, marcados = new Set(), medir = anchoMenuAproximado, variante = {}) {
  const M = MEDIDAS_MENU;
  // Los menús de la barra llevan sus atajos en una segunda columna, como en
  // front-panel/menu-file.png: tras el texto más largo, y a 18 px del borde.
  // Algunos menús cambian de filas y de nombres según el estado (el Case: booleano o numérico, qué marco se ve).
  const { ocultos = new Set(), rotulos = new Map() } = variante;
  const hijos = (padre) => inv.hijos(padre).filter((e) => !ocultos.has(e.id));
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
        const clases = `item-menu celda-rep${esHueco(e) ? " hueco" : ""}${marcados.has(e.id) ? " marcado" : ""}`;
        // Al pasar el ratón, el nombre sale en la franja de arriba, centrado en el submenú (CSS, con estas variables).
        const nombre = `<span class="nombre-celda" style="left:${px(-(R.izquierda + col * R.paso))};top:${px(-(R.arriba + fila * R.paso) + 3)};width:${px(R.ancho)}">${esc(e.etiqueta)}</span>`;
        return `<div class="${clases}" data-id="${esc(e.id)}" style="left:${px(R.izquierda + col * R.paso)};top:${px(R.arriba + fila * R.paso)}">${iconos[ultimo(e.id)] ?? ""}${nombre}</div>`;
      })
      .join("");
    return `<div class="menu-contextual rejilla" data-menu="${esc(padre)}" style="left:${px(x)};top:${px(y)};width:${px(R.ancho)};height:${px(R.alto)}">${celdas}</div>`;
  };
  const lista = (padre, x, y) => {
    if (ultimo(padre) in REJILLAS_MENU) return rejilla(padre, x, y);
    const ancho = anchoDe(padre);
    let top = M.arriba;
    let filas = "";
    let sub = "";
    for (const e of hijos(padre)) {
      if (e.separado) {
        filas += `<div class="separador-menu" style="top:${px(top + M.separador / 2 - 0.5)}"></div>`;
        top += M.separador;
      }
      const conSub = inv.tieneContenido(e.id) || CON_SUBMENU.includes(ultimo(e.id));
      const abierto = menu.abierto === e.id;
      const clases = `item-menu${esHueco(e) ? " hueco" : ""}${abierto ? " activo" : ""}${marcados.has(e.id) ? " marcado" : ""}`;
      const flecha = conSub ? `<span class="flecha-menu" style="right:${px(M.flecha)}">${G.FLECHA_CATEGORIA}</span>` : "";
      const atajo = e.atajo ? `<span class="atajo-menu" style="left:${px(M.texto + anchoTextos(padre) + M.antesAtajo)}">${esc(e.atajo)}</span>` : "";
      filas += `<div class="${clases}" data-id="${esc(e.id)}" style="top:${px(top)};height:${px(M.fila)}"><span class="texto-menu" style="left:${px(M.texto)}">${esc(rotuloDe(e))}</span>${atajo}${flecha}</div>`;
      if (abierto && inv.tieneContenido(e.id)) sub = lista(e.id, x + ancho - M.solape, y + top - M.arriba);
      top += M.fila;
    }
    return `<div class="menu-contextual" data-menu="${esc(padre)}" style="left:${px(x)};top:${px(y)};width:${px(ancho)};height:${px(top + M.arriba)}">${filas}</div>${sub}`;
  };
  return lista(menu.raiz, menu.x, menu.y);
}

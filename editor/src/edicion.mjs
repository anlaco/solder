// Editar el Block Diagram: qué hace cada pulsación, movimiento y tecla.
//
// Funciones puras, como estado.mjs: reciben el estado del diagrama y lo que ha
// pasado, y devuelven el estado nuevo. La ventana traduce los eventos del DOM
// a estas llamadas, así que spec/05-editor.md se prueba sin navegador. Lo que
// hacen calca el vídeo labview-captures/block-diagram/numeric-cablear.mp4.
//
// El estado:
//   g          el grafo (grafo.mjs)
//   seleccion  ids de nodos, de cables enteros y de tramos («c3#1»)
//   accion     lo que está a medias:
//     { tipo: "colocar", bloque, x, y, arrastrado }   un bloque cogido de la paleta; una
//                                                      estructura lleva además `esquina`, el primer clic
//     { tipo: "mover", x, y }                          arrastrando la selección
//     { tipo: "cablear", desde, x, y, arrastrado }     un cable que sale de un terminal
//     { tipo: "tramo", cable, k, x, y }                arrastrando un tramo de un cable
//     { tipo: "rectangulo", x0, y0, x1, y1, base }     seleccionar arrastrando por el fondo
//     { tipo: "estirar", nodo, lado, x0, y0, g0 }      estirar un nodo por su asa
//     { tipo: "etiqueta", nodo, x, y }                 arrastrando una etiqueta sola
//   lista      { nodo, x, y } la lista desplegable de marcos de un Case, abierta en el punto del clic
//   sobre      el nodo, y el terminal, que hay bajo el ratón: enseña sus pistas
//   edicion    { nodo, texto, todo } mientras se escribe en una constante,
//              { nodo, etiqueta: true, texto, todo } en la etiqueta de un nodo o
//              { nodo, marco: true, texto, todo } en el selector de marcos de un Case
//   menu       { raiz, nodo, puerto, x, y, en, abierto } el menú de clic derecho de un
//              nodo o de uno de sus terminales; `en`, el punto del lienzo donde se hizo
//   aviso      por qué no se pudo hacer lo último (spec/05 regla 31)

import { CONSTANTES, MEDIDAS_ESTRUCTURA, anchoElementoArray, tipoElementoArray, valoresArray, visiblesArray, MEDIDAS_SECUENCIA, TAM_BORDE, activoDe, anchoSecuencia, anchosMarcos, caja, cajaEtiqueta, codosPorDefecto, dentroDe, esApilada, esBooleano, esBorde, esCase, esEstructura, esFlat, esSecuencia, etiquetaMarco, extremos, izquierdasMarcos, marcoEnX, marcosDe, medidasCompuesto, moverTramo, rama, terminales } from "./diagrama.mjs";
import * as Et from "./etiquetas.mjs";
import * as Gr from "../../nucleo/grafo.mjs";
import { DBL, NUMERICOS, POR_ABREVIATURA, convertirValor, esArray, esEntero, esNumerico, formatear, leerElemento, leerNumero, ponerElemento } from "../../nucleo/tipos.mjs";

/** El valor de una constante de error: el suyo, con lo que falte a cero. */
const valorConstanteError = (n) => ({ status: false, code: 0, source: "", ...(n.config?.value ?? {}) });

export const inicial = () => ({ g: Gr.nuevo(), seleccion: [], accion: null, aviso: null, sobre: null, edicion: null, menu: null });

/** Cuánto hay que mover el ratón para que una pulsación sea un arrastre. */
const UMBRAL = 3;
/** Un bloque cogido de la paleta cuelga del cursor por esta esquina. */
const AGARRE = { x: 4, y: 4 };

const lejos = (a, p) => Math.abs(p.x - a.x) > UMBRAL || Math.abs(p.y - a.y) > UMBRAL;
const cableDe = (id) => id.split("#")[0];
const esEtiqueta = (id) => id.endsWith("#etiqueta");

/**
 * Coger un bloque de la paleta: queda colgando del cursor hasta soltarlo en el
 * diagrama. `config`, la del elemento de la paleta si no es la del catálogo:
 * Compound Arithmetic sale en AND de la paleta Boolean, True Constant vale TRUE.
 */
export const coger = (d, bloque, config) => ({ ...d, accion: { tipo: "colocar", bloque, config }, aviso: null, menu: null });

function colocar(d, ctx, p) {
  let { g, id } = Gr.crearNodo(d.g, ctx.cat, d.accion.bloque, Math.round(p.x - AGARRE.x), Math.round(p.y - AGARRE.y));
  if (d.accion.config) g = Gr.fijarConfig(g, id, d.accion.config);
  // Soltarlo dentro de un bucle lo mete en él (DT-041).
  // Una constante de cadena recién soltada queda lista para escribir en ella (bd-string-constant-editando.png).
  const escribir = CONSTANTES[d.accion.bloque]?.editable && CONSTANTES[d.accion.bloque].cadena ? { nodo: id, texto: "", todo: false, cadena: true } : d.edicion;
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
      const entra = g.cables.find((c) => c.a.nodo === t.id);
      const salen = g.cables.filter((c) => c.de.nodo === t.id);
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
    if (!g.cables.some((k) => k.id === c.id)) continue;
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
  return fijarBordes({ ...g1, nodos }, ctx.cat);
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
export const editarMarco = (d, id) => {
  const s = nodoPor(d.g, id);
  return s && esCase(s) ? { ...d, edicion: { nodo: id, marco: true, texto: etiquetaMarco(marcosDe(s)[activoDe(s)]), todo: true }, seleccion: [], accion: null, menu: null, lista: null } : d;
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
 * Add Case After y Before: un marco nuevo junto al que se ve, que pasa a verse.
 * En un Case numérico lleva el primer entero libre por encima del marco
 * anterior; en uno booleano, sin valores (case-lista-boolean).
 */
export function anadirMarco(g, ctx, id, despues, x) {
  const s = nodoPor(g, id);
  if (esSecuencia(s)) return anadirMarcoSecuencia(g, ctx, id, despues, x);
  const marcos = marcosDe(s);
  const pos = activoDe(s) + (despues ? 1 : 0);
  const nuevo = esBooleano(s) ? { valores: [] } : { valores: [valorNuevo(marcos, marcos[pos - 1])] };
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
 */
export function leerMarco(texto) {
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

/** Confirmar lo escrito en el selector: el marco que se ve toma esos valores; si es el Default, deja de serlo otro (case-edit5.png). */
function escribirMarco(g, ctx, id, texto) {
  const s = nodoPor(g, id);
  const nuevo = leerMarco(texto);
  const booleano = esBooleano(s);
  // Un número en un Case booleano, o True en uno numérico, no se entiende: queda como estaba.
  if (!nuevo || nuevo.valores.some((v) => (typeof v === "boolean") !== booleano)) return g;
  const k = activoDe(s);
  return Gr.fijarMarcos(g, ctx.cat, id, conOrigen(s).map(({ default: _, ...m }, i) => (i === k ? nuevo : nuevo.default ? m : { ...m, ...(marcosDe(s)[i].default && { default: true }) })));
}

/**
 * Al cablear un número al selector de un Case booleano, sus marcos False y True
 * pasan a «0, Default» y «1» (structures/case-3.png, case-lista.png).
 */
function ajustarSelectores(g, ctx) {
  const t = Gr.tipos(g, ctx.cat);
  for (const s of g.nodos) {
    if (!esCase(s) || !esBooleano(s)) continue;
    const sel = g.nodos.find((n) => n.dentro === s.id && n.tipo === "case-selector");
    const c = sel && g.cables.find((k) => k.a.nodo === sel.id);
    const tipo = c && t.cables.get(c.id)?.tipo;
    if (typeof tipo !== "string" || !esNumerico(tipo)) continue;
    const marcos = conOrigen(s).map(({ valores = [], ...m }) => ({ ...m, valores: valores.map((v) => Number(v)), ...(valores.includes(false) && { default: true }) }));
    g = Gr.fijarMarcos(g, ctx.cat, s.id, marcos);
  }
  return g;
}

/**
 * Pulsar el botón principal sobre algo del diagrama. `sobre` es lo que hay
 * debajo, resuelto en el orden de spec/05 §3.2: `{ tipo: "terminal", nodo,
 * puerto, dir }`, `{ tipo: "nodo", id }`, `{ tipo: "tramo", cable, k }` o
 * `{ tipo: "fondo" }`. `p`, el punto en el lienzo; `shift`, si suma a la
 * selección.
 */
export function pulsar(d, ctx, sobre, p, shift = false) {
  if (d.menu) return { ...d, menu: null };
  // La lista de marcos de un Case se cierra al pulsar fuera de ella, y una de sus filas muestra ese marco.
  if (d.lista) return sobre.tipo === "fila-marco" ? mostrarMarco({ ...d, lista: null }, sobre.nodo, sobre.k) : { ...d, lista: null };
  // Pulsar fuera de la constante en la que se escribe confirma lo escrito, y
  // nada más: es lo que se ve en el vídeo.
  const enLoQueSeEscribe = d.edicion?.marco ? sobre.tipo === "marco" && sobre.zona === "texto" && sobre.nodo === d.edicion.nodo : sobre.id === d.edicion?.nodo && sobre.tipo === (d.edicion?.etiqueta ? "etiqueta" : "nodo");
  if (d.edicion && !enLoQueSeEscribe) return confirmar(d, ctx);
  if (d.edicion) return d;
  const { accion } = d;
  if (accion?.tipo === "colocar") return ctx.cat.bloque(accion.bloque).estructura ? pulsarEstructura(d, ctx, p) : colocar(d, ctx, p);
  if (accion?.tipo === "cablear") {
    if (sobre.tipo === "terminal") return terminar(d, ctx, sobre, p);
    if (sobre.tipo === "tramo") return unirACable(d, ctx, sobre, p);
    return d; // cableando con clics: el fondo no corta el cable; Esc sí
  }
  const d0 = { ...d, aviso: null };
  if (sobre.tipo === "marco") return pulsarMarco(d0, sobre, p);
  if (sobre.tipo === "asa") return { ...d0, accion: { tipo: "estirar", nodo: sobre.nodo, lado: sobre.lado, x0: p.x, y0: p.y, y: p.y, g0: d.g } };
  if (sobre.tipo === "terminal") return { ...d0, accion: { tipo: "cablear", desde: sobre, x: p.x, y: p.y, x0: p.x, y0: p.y, arrastrado: false } };
  const elegir = (id) => {
    const ya = d.seleccion.includes(id);
    // Regla 22: el clic selecciona sólo ese; con Shift, se suma o se quita.
    return shift ? (ya ? d.seleccion.filter((s) => s !== id) : [...d.seleccion, id]) : ya ? d.seleccion : [id];
  };
  if (sobre.tipo === "nodo") {
    // Una constante booleana cambia con un clic, como en LabVIEW; si se arrastra, se mueve.
    // La constante de error, igual, con la celda de su status.
    const tipoNodo = d.g.nodos.find((n) => n.id === sobre.id)?.tipo;
    const alternar = tipoNodo === "bool-const" || (tipoNodo === "error-cluster-constant" && sobre.campo === "status") ? sobre.id : null;
    return { ...d0, seleccion: elegir(sobre.id), accion: { tipo: "mover", x: p.x, y: p.y, alternar, campo: sobre.campo, movido: false } };
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
      return { ...d, accion: { ...accion, x: Math.round(p.x - AGARRE.x), y: Math.round(p.y - AGARRE.y), arrastrado: true } };
    case "mover": {
      const [dx, dy] = [Math.round(p.x - accion.x), Math.round(p.y - accion.y)];
      if (!dx && !dy) return d;
      // Regla 23: se mueve todo lo seleccionado. Mover sólo cambia la presentación (regla 25).
      const nodos = d.seleccion.filter((id) => d.g.nodos.some((n) => n.id === id));
      return { ...d, g: desplazar(d.g, ctx, nodos, dx, dy), accion: { ...accion, x: accion.x + dx, y: accion.y + dy, movido: true } };
    }
    case "cablear":
      return { ...d, accion: { ...accion, x: p.x, y: p.y, arrastrado: accion.arrastrado || lejos({ x: accion.x0, y: accion.y0 }, p) } };
    case "tramo": {
      const c = d.g.cables.find((k) => k.id === accion.cable);
      const ext = extremos(d.g, ctx);
      const [a, b] = [ext.get(`${c.de.nodo}.${c.de.puerto}`), ext.get(`${c.a.nodo}.${c.a.puerto}`)];
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
      // Una constante de array enseña un elemento más por cada ancho de elemento que se estira por la derecha.
      const arr = accion.g0.nodos.find((k) => k.id === accion.nodo);
      if (arr?.tipo === "arr-const") {
        const visibles = Math.max(1, visiblesArray(arr) + Math.round((p.x - accion.x0) / anchoElementoArray(arr, ctx)));
        return { ...d, g: Gr.fijarConfig(accion.g0, accion.nodo, { visibles }) };
      }
      if (esEstructura(accion.g0.nodos.find((k) => k.id === accion.nodo), ctx)) return { ...d, g: estirarEstructura(accion, p, ctx) };
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
  let codos;
  if (desde.dir !== sobre.dir) {
    const ext = extremos(d.g, ctx);
    const [de, a] = desde.dir === "out" ? [desde, sobre] : [sobre, desde];
    codos = codosPorDefecto(ext.get(`${de.nodo}.${de.puerto}`), ext.get(`${a.nodo}.${a.puerto}`), sobre.dir === "out");
  }
  const r = unir(d.g, ctx, desde, sobre, codos);
  if (r.motivo) return { ...d, accion: null, aviso: { texto: r.motivo, x: p.x, y: p.y } };
  return { ...d, g: ajustarSelectores(r.g, ctx), accion: null, seleccion: [] };
}

/**
 * Un cable que se está tirando desde una entrada termina en otro cable: sale de
 * él una rama que lleva el mismo dato, con su punto de unión, como en LabVIEW.
 * Desde una salida no se puede: ese cable ya tiene quien lo alimente.
 */
function unirACable(d, ctx, sobre, p) {
  const { desde } = d.accion;
  if (desde.dir === "out") {
    return { ...d, accion: null, aviso: { texto: "Ese cable ya tiene una fuente: un cable sólo puede salir de una salida.", x: p.x, y: p.y } };
  }
  const c = d.g.cables.find((k) => k.id === sobre.cable);
  const ext = extremos(d.g, ctx);
  const [a, b] = [ext.get(`${c.de.nodo}.${c.de.puerto}`), ext.get(`${c.a.nodo}.${c.a.puerto}`)];
  const destino = ext.get(`${desde.nodo}.${desde.puerto}`);
  const r = rama(c.codos ?? codosPorDefecto(a, b), a, b, sobre.k, destino, p);
  const hecho = unir(d.g, ctx, { ...c.de, dir: "out" }, desde, r.codos);
  if (hecho.motivo) return { ...d, accion: null, aviso: { texto: hecho.motivo, x: p.x, y: p.y } };
  return { ...d, g: ajustarSelectores(Gr.fijarUnion(hecho.g, hecho.id, r.union), ctx), accion: null, seleccion: [] };
}

/** Soltar el botón. */
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
      // Lo soltado dentro o fuera de un bucle entra o sale de él.
      if (accion.movido) return { ...d, g: alojar(d.g, ctx, d.seleccion.filter((id) => d.g.nodos.some((n) => n.id === id))), accion: null };
      return { ...d, accion: null };
    case "tramo":
    case "estirar":
    case "etiqueta":
      return { ...d, accion: null };
    case "cablear":
      if (!accion.arrastrado) return d; // un clic en el terminal: el cable sigue al ratón
      if (sobre?.tipo === "terminal") return terminar(d, ctx, sobre, p);
      if (sobre?.tipo === "tramo") return unirACable(d, ctx, sobre, p);
      return { ...d, accion: null };
    case "rectangulo": {
      const dentro = dentroDe(d.g, ctx, accion);
      return { ...d, seleccion: [...new Set([...accion.base, ...dentro])], accion: null };
    }
    default:
      return d;
  }
}

/**
 * El ratón pasa por encima de algo: si es un nodo, o uno de sus terminales, el
 * diagrama enseña sus pistas (diagrama.mjs). Devuelve el mismo estado si no
 * cambia nada, para no repintar.
 */
export function sobrevolar(d, sobre) {
  const nuevo =
    sobre?.tipo === "terminal" ? { nodo: sobre.nodo, puerto: sobre.puerto } : sobre?.tipo === "nodo" && d.edicion?.nodo !== sobre.id ? { nodo: sobre.id } : null;
  const viejo = d.sobre;
  if (nuevo?.nodo === viejo?.nodo && nuevo?.puerto === viejo?.puerto) return d;
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
  // La constante de array: se escribe en un elemento (`campo` es su índice); un booleano se alterna.
  if (n?.tipo === "arr-const") {
    const k = Number(campo ?? n.config?.indice ?? 0);
    const t = tipoElementoArray(n);
    const v = valoresArray(n)[k];
    if (t === "boolean") return { ...d, g: Gr.fijarConfig(d.g, id, { value: ponerElemento(valoresArray(n), k, !v, t) }), seleccion: [id], accion: null, menu: null };
    const texto = t === "string" ? String(v ?? "") : formatear(v ?? 0, t, ctx.separador);
    return { ...d, edicion: { nodo: id, elem: k, texto, todo: true, ...(t === "string" ? { cadena: true } : {}) }, seleccion: [id], accion: null, menu: null };
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
  const e = d.edicion;
  if (!e) return d;
  if (e.etiqueta) return { ...d, g: Gr.fijarEtiqueta(d.g, e.nodo, e.texto), edicion: null };
  if (e.marco) return { ...d, g: escribirMarco(d.g, ctx, e.nodo, e.texto), edicion: null };
  const n = d.g.nodos.find((k) => k.id === e.nodo);
  // Un elemento de una constante de array: se lleva al tipo de sus elementos; lo que no vale lo deja como estaba.
  if (e.elem !== undefined) {
    const t = tipoElementoArray(n);
    const v = leerElemento(e.texto, t);
    return v === undefined ? { ...d, edicion: null } : { ...d, g: Gr.fijarConfig(d.g, n.id, { value: ponerElemento(valoresArray(n), e.elem, v, t) }), edicion: null };
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
  if (n.tipo === "str-const") return { ...d, g: Gr.fijarValor(d.g, n.id, e.texto), edicion: null };
  const b = ctx.cat.bloque(n.tipo);
  const tipo = n.config?.type ?? b.config?.default?.type ?? "number";
  const leido = leerNumero(e.texto, tipo);
  if (!leido) return { ...d, edicion: null };
  const cambiaTipo = b["type-from"] === "config" ? leido.tipo : undefined;
  return { ...d, g: Gr.fijarValor(d.g, n.id, leido.valor, cambiaTipo), edicion: null };
}

// ——— Menús de clic derecho ———

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
  const { nodo, puerto } = d.menu;
  const cerrar = (g) => ({ ...d, g, menu: null });
  const ultimo = id.slice(id.lastIndexOf(".") + 1);
  if (id.endsWith(".visible-items.terminals")) return cerrar(Gr.alternarTerminales(d.g, nodo));
  if (id.endsWith(".view-as-icon")) return cerrar(Gr.alternarIcono(d.g, nodo));
  if (id.endsWith(".invert")) return cerrar(Gr.alternarInvertida(d.g, nodo, puerto ?? "result"));
  if (id.endsWith(".add-input")) return cerrar(Gr.anadirEntrada(d.g, ctx.cat, nodo, puerto));
  if (id.endsWith(".remove-input")) return cerrar(Gr.quitarEntrada(d.g, ctx.cat, nodo, puerto));
  if (id.includes(".change-mode.")) return cerrar(Gr.fijarConfig(d.g, nodo, { mode: ultimo }));
  if (id.includes(".representation.") && POR_ABREVIATURA[ultimo]) return cerrar(Gr.fijarRepresentacion(d.g, nodo, POR_ABREVIATURA[ultimo]));
  if (id.includes(".mechanical-action.")) return cerrar(Gr.fijarConfig(d.g, nodo, { mechanical: ultimo }));
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
  if (id.endsWith(".create.constant")) return crearConstante({ ...d, menu: null }, ctx, nodo, puerto);
  // Add Shift Register: el par aparece en los bordes, a la altura del clic (structures/shift-register.png).
  if (id.endsWith(".add-shift-register")) {
    const s = d.g.nodos.find((k) => k.id === nodo);
    const y = d.menu.en ? d.menu.en.y - TAM_BORDE["shift-register-left"][1] / 2 : s.y + s.tam.alto / 2 - 6;
    return cerrar(fijarBordes(Gr.crearRegistro(d.g, ctx.cat, nodo, Math.round(y)).g, ctx.cat));
  }
  // Los marcos de un Case (structures/case-menu-*.png).
  if (id.endsWith(".add-case-after") || id.endsWith(".add-case-before")) return cerrar(anadirMarco(d.g, ctx, nodo, id.endsWith("after")));
  if (id.endsWith(".delete-this-case")) return cerrar(quitarMarco(d.g, ctx, nodo));
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

/** El terminal de condición de un While, o el nodo mismo si ya lo es. */
const condicionDe = (g, id) => {
  const n = g.nodos.find((k) => k.id === id);
  if (n?.tipo === "loop-condition") return n;
  return n?.tipo === "while-loop" ? g.nodos.find((k) => k.dentro === n.id && k.tipo === "loop-condition") : undefined;
};

/**
 * Las filas que el menú de un Case enseña según lo que es: un Case booleano
 * lleva «Show Case True/False» y «Make This Case True/False» y uno numérico, los
 * de «Show Case...», el Default y Radix; la fila del Default dice «Remove
 * Default» si el marco que se ve lo es. El terminal selector, Boolean o Numeric Palette.
 */
export function variantes(d) {
  const n = d.menu && d.g.nodos.find((k) => k.id === d.menu.nodo);
  const r = d.menu?.raiz;
  const fila = (...ids) => new Set(ids.map((i) => `${r}.${i}`));
  if (n && esCase(n)) {
    const ms = marcosDe(n);
    const m = ms[activoDe(n)];
    if (esBooleano(n)) {
      const otro = m?.valores?.includes(true) ? "False" : "True";
      return { ocultos: fila("show-case", "swap-diagram-with-case", "shift-diagram-to-case", "rearrange-cases", "make-this-the-default-case", "remove-default", "radix"), rotulos: new Map([[`${r}.show-case-other`, `Show Case ${otro}`], [`${r}.make-this-case-other`, `Make This Case ${otro}`]]) };
    }
    return { ocultos: fila("show-case-other", "make-this-case-other", m?.default ? "make-this-the-default-case" : "remove-default"), rotulos: new Map() };
  }
  // Una Stacked de dos marcos: «Show Frame» y «Make This Frame» dicen el número del otro; con más, llevan un submenú (secuencia-menu-stacked.png).
  if (n && esApilada(n)) {
    const otro = marcosDe(n).length === 2 ? ` ${1 - activoDe(n)}` : "";
    return { ocultos: new Set(), rotulos: new Map([[`${r}.show-frame`, `Show Frame${otro}`], [`${r}.make-this-frame`, `Make This Frame${otro}`]]) };
  }
  // Un túnel de entrada indexado ofrece apagar el indexado: la misma fila cambia de nombre.
  if (n?.tipo === "tunnel-in" && n.config?.indexado) return { ocultos: new Set(), rotulos: new Map([[`${r}.enable-indexing`, "Disable Indexing"]]) };
  if (n?.tipo === "case-selector") {
    const caso = d.g.nodos.find((k) => k.id === n.dentro);
    return { ocultos: fila(caso && esBooleano(caso) ? "numeric-palette" : "boolean-palette"), rotulos: new Map() };
  }
  return {};
}

/** Qué filas del menú llevan la marca: Terminals si el nodo los enseña, el modo actual, Invert si lo está, la representación de un número. */
export function marcados(d) {
  const n = d.menu && d.g.nodos.find((k) => k.id === d.menu.nodo);
  if (!n) return new Set();
  const r = d.menu.raiz;
  const m = new Set();
  if (n.vista?.terminales) m.add(`${r}.visible-items.terminals`);
  if (!n.vista?.compacto) m.add(`${r}.view-as-icon`);
  if (n.config?.mode) m.add(`${r}.change-mode.${n.config.mode}`);
  if (n.config?.mechanical) m.add(`${r}.mechanical-action.${n.config.mechanical}`);
  const abrev = r.startsWith("context.numeric-") && NUMERICOS[n.config?.type ?? DBL]?.abrev;
  if (abrev) m.add(`${r}.representation.${abrev.toLowerCase()}`);
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
  if (n.tipo === "case-tunnel-out" && n.config?.["use-default"]) m.add(`${r}.use-default-if-unwired`);
  if (n.tipo === "tunnel-out") m.add(`${r}.tunnel-mode.${n.config?.indexado ? "indexing" : "last-value"}`);
  return m;
}

/** Hueco entre una constante creada y el terminal al que se cablea: 9 px del vídeo. */
const HUECO_CONSTANTE = 6;

/**
 * Create ▸ Constant sobre una entrada: una constante del tipo de la entrada, a
 * su izquierda y a su altura, ya cableada y con el texto seleccionado para
 * escribir, como en compound-create.png.
 */
export function crearConstante(d, ctx, nodo, puerto) {
  const n = d.g.nodos.find((k) => k.id === nodo);
  const t = terminales(n, ctx).find((k) => k.puerto === puerto);
  const tipo = Gr.tipos(d.g, ctx.cat).entradas.get(`${nodo}.${puerto}`);
  const bloque = esEntero(tipo) ? "num-const" : "const";
  let { g, id } = Gr.crearNodo(d.g, ctx.cat, bloque, 0, 0);
  if (bloque === "num-const") g = Gr.fijarValor(g, id, 0, tipo);
  const k = caja(g.nodos.find((m) => m.id === id), ctx);
  g = Gr.mover(g, [id], Math.round(t.x - HUECO_CONSTANTE - k.ancho), Math.round(t.y - k.alto / 2));
  g = Gr.conectar(g, ctx.cat, { nodo: id, puerto: "result", dir: "out" }, { nodo, puerto, dir: "in" }).g;
  return editar({ ...d, g }, ctx, id);
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

/**
 * Supr y Retroceso borran la selección, con los cables de los nodos (spec/05
 * regla 28). Un tramo seleccionado borra su cable entero.
 */
export function borrarSeleccion(d) {
  const nodo = (id) => d.g.nodos.find((n) => n.id === id);
  // Los terminales «i», condición y cuenta no se borran; un shift register se va con su pareja.
  const ids = d.seleccion.filter((id) => !esEtiqueta(id)).map(cableDe).filter((id) => !nodo(id)?.tipo.startsWith("loop-") && nodo(id)?.tipo !== "case-selector");
  const pares = ids.map((id) => nodo(id)?.config?.par).filter(Boolean);
  const todos = [...new Set([...ids, ...pares])];
  return todos.length ? { ...d, g: Gr.borrar(d.g, todos), seleccion: [], aviso: null } : d;
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

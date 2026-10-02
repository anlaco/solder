// El diagrama de un VI como datos: nodos, cables y los tipos que llevan.
//
// Implementa, en el editor, las reglas de spec/03-static-semantics.md que el
// editor necesita para arrastrar y cablear: los puertos salen del catálogo
// (reglas 1 y 3), un cable válido y el motivo de uno roto (regla 5 y
// spec/05-editor.md regla 31), la entrada que ya tiene cable se sustituye
// (spec/05 regla 32), los tipos se resuelven hacia delante (regla 2c) y los
// ciclos se devuelven como dato (regla 9). Los controles e indicadores son
// nodos con sitio en los dos lienzos y una etiqueta (spec/05 §7). Pasará al
// núcleo, `nucleo/`, cuando se escriba el compilador (DT-039).
//
// Módulo puro y sin mutaciones: cada operación devuelve un diagrama nuevo.

import { DBL, ERROR, NUMERICOS, comun, convertirValor, conversion, esArray, esCluster, esEntero, esNumerico, nombre } from "./tipos.mjs";

/** El catálogo de bloques, `docs/schema/blocks.json`. */
export function cargarCatalogo(datos) {
  const bloques = datos.blocks;
  function bloque(tipo) {
    const b = bloques[tipo];
    if (!b) throw new Error(`el bloque «${tipo}» no está en el catálogo`);
    return b;
  }
  /**
   * Los puertos de un nodo, con su dirección; regla 1: el que no existe es un
   * error. Los dinámicos se resuelven aquí y sólo aquí (spec/03 regla 4).
   */
  function puertos(nodo) {
    const b = bloque(nodo.tipo);
    const lista = (dir) => {
      // Bundle y Unbundle: un puerto por campo del cluster de `config.type`.
      if (b[dir] === "dynamic:cluster-fields") {
        const campos = nodo.config?.type?.cluster ?? [];
        return campos.map((f, i) => ({ name: `campo-${i}`, label: f.name, type: f.type, dir }));
      }
      // El túnel de salida de un Case: una entrada por marco, de ese marco (DT-041).
      if (b[dir] === "dynamic:case-frames") {
        const n = nodo.config?.marcos ?? b.config.marcos.value;
        const conDefecto = nodo.config?.["use-default"] ? { default: 0 } : {};
        return Array.from({ length: n }, (_, i) => ({ name: `x-${i}`, label: "", type: { escalar: "C" }, lado: "dentro", marco: i, dir, ...conDefecto }));
      }
      if (b[dir] === "dynamic:compound-inputs") {
        const { prefijo, label, type } = b.entradas;
        const n = nodo.config?.inputs ?? b.config.inputs.value;
        // Las de Merge Errors se rotulan «error in 0», «error in 1»… y se pueden dejar sin cablear.
        const extra = b.entradas.default !== undefined ? { default: b.entradas.default } : {};
        const rotulo = (i) => (prefijo === "error-in-" ? `${label} ${i}` : label);
        return Array.from({ length: n }, (_, i) => ({ name: `${prefijo}${i}`, label: rotulo(i), type, dir, ...extra }));
      }
      return (Array.isArray(b[dir]) ? b[dir] : []).map((p) => ({ ...p, dir }));
    };
    // Un puerto de tipo "error" es el cluster de error (DT-043).
    const conError = (l) => l.map((p) => (p.type === "error" ? { ...p, type: ERROR } : p));
    // Un túnel indexado (autoindexado): fuera, un array de lo que hay dentro.
    const indexado = (l, lado) => (nodo.config?.indexado ? l.map((p) => (p.lado === lado ? { ...p, type: { array: p.type } } : p)) : l);
    const ins = indexado(conError(lista("in")), nodo.tipo === "tunnel-in" ? "fuera" : null);
    const outs = indexado(conError(lista("out")), nodo.tipo === "tunnel-out" ? "fuera" : null);
    return { in: ins, out: outs };
  }
  function puerto(nodo, nombrePuerto, dir) {
    const p = puertos(nodo)[dir].find((q) => q.name === nombrePuerto);
    if (!p) throw new Error(`«${nodo.tipo}» no tiene el puerto de ${dir === "in" ? "entrada" : "salida"} «${nombrePuerto}»`);
    return p;
  }
  return { datos, bloque, puertos, puerto, tiene: (tipo) => tipo in bloques };
}

export const nuevo = () => ({ nodos: [], cables: [], siguiente: 1 });

/**
 * Pone un bloque en el diagrama. El `name` es `tipo_N`, único en el VI (regla
 * 6); la etiqueta, libre, empieza vacía.
 */
export function crearNodo(g, cat, tipo, x, y) {
  const b = cat.bloque(tipo);
  const id = `n${g.siguiente}`;
  const usados = new Set(g.nodos.map((n) => n.name));
  let k = 1;
  while (usados.has(`${tipo}_${k}`)) k++;
  const nodo = { id, tipo, name: `${tipo}_${k}`, x, y };
  if (b.config) {
    nodo.config = {};
    for (const [clave, c] of Object.entries(b.config)) {
      if (clave === "default") nodo.config.value = c.value;
      else if (clave === "type") nodo.config.type = b.config.default?.type ?? c.value;
      else nodo.config[clave] = c.value;
    }
  }
  return { g: { ...g, nodos: [...g.nodos, nodo], siguiente: g.siguiente + 1 }, id };
}

/**
 * La etiqueta que LabVIEW da a un control nuevo: la de su clase («Numeric») y,
 * si ya hay una igual en el VI, con un número detrás («Numeric 2»).
 */
export function etiquetaLibre(g, base) {
  const usadas = new Set(g.nodos.map((n) => n.label?.text));
  if (!usadas.has(base)) return base;
  let k = 2;
  while (usadas.has(`${base} ${k}`)) k++;
  return `${base} ${k}`;
}

/**
 * Pone un control o un indicador: el objeto en el panel, en (px, py), y su
 * terminal en el diagrama, en el mismo sitio (spec/05 regla 38). Son un solo
 * nodo con una posición en cada lienzo y una sola etiqueta, que es la de los
 * dos.
 */
export function crearEnPanel(g, cat, tipo, px, py, etiqueta, config) {
  if (!cat.bloque(tipo).panel) throw new Error(`«${tipo}» no es un control ni un indicador`);
  const r = crearNodo(g, cat, tipo, px, py);
  const texto = etiquetaLibre(g, etiqueta);
  // `config`: con la que lo pone el elemento de la paleta (el Stop Button es un
  // bool-control con otro estilo). Lo que depende del estilo —la acción mecánica
  // de fábrica: Latch When Released en Stop, OK y Cancel— se toma del suyo.
  const porEstilo = (c) => {
    const r2 = { ...c };
    for (const [clave, d] of Object.entries(cat.bloque(tipo).config ?? {})) {
      if (d["by-style"] && !(config && clave in config)) r2[clave] = d["by-style"][c.style] ?? d.value;
    }
    return r2;
  };
  return { g: cambiarNodo(r.g, r.id, (n) => ({ ...n, config: config ? porEstilo({ ...n.config, ...config }) : n.config, label: { text: texto }, panel: { x: px, y: py } })), id: r.id };
}

/** Mueve objetos del panel: su terminal en el diagrama no se mueve. */
export function moverEnPanel(g, ids, dx, dy) {
  const mueve = new Set(ids);
  return { ...g, nodos: g.nodos.map((n) => (mueve.has(n.id) && n.panel ? { ...n, panel: { ...n.panel, x: n.panel.x + dx, y: n.panel.y + dy } } : n)) };
}

/** Cambia el texto de la etiqueta de un nodo: se ve igual en los dos lienzos. */
export const fijarEtiqueta = (g, id, text) => cambiarNodo(g, id, (n) => ({ ...n, label: { ...n.label, text } }));

/**
 * Fija dónde va la etiqueta respecto a su objeto en un lienzo, `"panel"` o
 * `"diagrama"`: en cada uno se mueve por separado, como en el vídeo.
 */
export const fijarSitioEtiqueta = (g, id, lienzo, dx, dy) =>
  cambiarNodo(g, id, (n) => (lienzo === "panel" ? { ...n, panel: { ...n.panel, etiqueta: [dx, dy] } } : { ...n, etiqueta: [dx, dy] }));

/** View As Icon: el terminal de un control se ve con el icono del control o como una caja compacta. */
export const alternarIcono = (g, id) => cambiarNodo(g, id, (n) => ({ ...n, vista: { ...n.vista, compacto: !n.vista?.compacto } }));

/** Mueve nodos: sólo cambia la presentación (spec/05 regla 25). Una estructura se lleva lo que tiene dentro. */
export function mover(g, ids, dx, dy) {
  const mueve = conContenido(g, ids);
  return { ...g, nodos: g.nodos.map((n) => (mueve.has(n.id) ? { ...n, x: n.x + dx, y: n.y + dy } : n)) };
}

/**
 * Borra nodos y cables; los cables de un nodo borrado se van con él (spec/05
 * regla 28). Una estructura se va con todo lo suyo, como Delete en LabVIEW.
 */
export function borrar(g, ids) {
  const fuera = conContenido(g, ids);
  const nodos = g.nodos.filter((n) => !fuera.has(n.id));
  const cables = g.cables.filter((c) => !fuera.has(c.id) && !fuera.has(c.de.nodo) && !fuera.has(c.a.nodo));
  return { ...g, nodos, cables };
}

const nodoDe = (g, id) => g.nodos.find((n) => n.id === id);

// ——— Estructuras (DT-041) ———
//
// Una estructura es un nodo con tamaño (`tam`); lo de su cuerpo lleva `dentro`
// = su id, y también lo de su borde: terminales, túneles y shift registers,
// nodos con un puerto que mira fuera y otro dentro (el `lado` del catálogo).

/** Los ids pedidos y, de cada estructura entre ellos, todo lo que tiene dentro, a cualquier profundidad. */
export function conContenido(g, ids) {
  const r = new Set(ids);
  let crece = true;
  while (crece) {
    crece = false;
    for (const n of g.nodos) {
      if (n.dentro && r.has(n.dentro) && !r.has(n.id)) {
        r.add(n.id);
        crece = true;
      }
    }
  }
  return r;
}

/**
 * El ámbito de un puerto: la estructura en cuyo cuerpo está, o `undefined` en
 * el diagrama del VI. Un puerto que mira fuera del borde está en el ámbito de
 * la estructura misma.
 */
export function ambitoDe(g, cat, nodo, puerto, dir) {
  const n = nodoDe(g, nodo);
  const p = cat.puertos(n)[dir].find((q) => q.name === puerto);
  if (p?.lado === "fuera") return nodoDe(g, n.dentro)?.dentro;
  return n.dentro;
}

/** ¿Es una Flat o una Stacked Sequence? */
export const esSecuencia = (n) => n?.tipo === "flat-sequence" || n?.tipo === "stacked-sequence";

/** El marco de un Case en que está un puerto, o `undefined` si no es de ningún marco (DT-041). */
export function marcoDe(g, cat, nodo, puerto, dir) {
  const n = nodoDe(g, nodo);
  if (n.marco !== undefined) return n.marco;
  return cat.puertos(n)[dir].find((q) => q.name === puerto)?.marco;
}

/**
 * Pone una estructura en (x, y) con su tamaño, y dentro sus terminales: el de
 * iteración abajo a la izquierda, el de condición abajo a la derecha y el de
 * cuenta arriba a la izquierda, como en LabVIEW. El sitio exacto lo afina el
 * editor.
 */
export function crearEstructura(g, cat, tipo, x, y, ancho, alto) {
  const b = cat.bloque(tipo);
  if (!b.estructura) throw new Error(`«${tipo}» no es una estructura`);
  let r = crearNodo(g, cat, tipo, x, y);
  const id = r.id;
  r = { g: cambiarNodo(r.g, id, (n) => ({ ...n, tam: { ancho, alto } })), id };
  const sitio = { "loop-iteration": [x + 8, y + alto - 24], "loop-condition": [x + ancho - 24, y + alto - 24], "loop-count": [x + 8, y + 8], "case-selector": [x, y + alto / 2] };
  let g2 = r.g;
  for (const t of b.terminales ?? []) {
    const k = crearNodo(g2, cat, t, ...sitio[t]);
    g2 = cambiarNodo(k.g, k.id, (n) => ({ ...n, dentro: id }));
  }
  return { g: g2, id };
}

/**
 * Mete nodos en el cuerpo de una estructura, o los saca al diagrama con
 * `undefined`. En un Case, en el marco `marco` (de fábrica, el que se ve). Lo
 * del borde no se mueve de la suya.
 */
export function meter(g, cat, ids, estructura, marco) {
  const mete = new Set(ids);
  const s = estructura && nodoDe(g, estructura);
  const conMarcos = s?.tipo === "case-structure" || esSecuencia(s);
  const k = conMarcos ? (marco ?? s.config?.activo ?? 0) : undefined;
  return {
    ...g,
    nodos: g.nodos.map((n) => {
      if (!mete.has(n.id) || cat.bloque(n.tipo).borde || n.id === estructura) return n;
      const { dentro, marco: _, ...resto } = n;
      if (!estructura) return resto;
      return k === undefined ? { ...resto, dentro: estructura } : { ...resto, dentro: estructura, marco: k };
    }),
  };
}

/**
 * Cambia los marcos de un Case (`marcos`: la lista nueva, cada uno con su
 * índice anterior en `de`, o sin él si es nuevo). Lo de un marco quitado se
 * borra; los túneles de salida ganan o pierden sus entradas, que siguen a su
 * marco.
 */
export function fijarMarcos(g, cat, caso, marcos) {
  const antes = new Map(marcos.map((m, i) => [m.de, i]).filter(([d]) => d !== undefined));
  const quitar = g.nodos.filter((n) => n.dentro === caso && n.marco !== undefined && !antes.has(n.marco)).map((n) => n.id);
  g = borrar(g, quitar);
  const limpios = marcos.map(({ de, ...m }) => m);
  const tuneles = new Set(g.nodos.filter((n) => n.dentro === caso && n.tipo === "case-tunnel-out").map((n) => n.id));
  return {
    ...g,
    nodos: g.nodos.map((n) => {
      if (n.id === caso) return { ...n, config: { ...n.config, marcos: limpios, activo: Math.min(n.config?.activo ?? 0, limpios.length - 1) } };
      if (n.dentro === caso && n.marco !== undefined) return { ...n, marco: antes.get(n.marco) };
      if (tuneles.has(n.id)) return { ...n, config: { ...n.config, marcos: limpios.length } };
      return n;
    }),
    cables: g.cables
      .filter((c) => !tuneles.has(c.a.nodo) || antes.has(Number(c.a.puerto.slice(2))))
      .map((c) => (tuneles.has(c.a.nodo) ? { ...c, a: { ...c.a, puerto: `x-${antes.get(Number(c.a.puerto.slice(2)))}` } } : c)),
  };
}

/** Un túnel en el borde de una estructura: de entrada en el izquierdo, de salida en el derecho, a la altura `y`. */
export function crearTunel(g, cat, estructura, dir, y) {
  const s = nodoDe(g, estructura);
  const caso = s.tipo === "case-structure";
  const r = crearNodo(g, cat, dir === "in" ? "tunnel-in" : caso ? "case-tunnel-out" : "tunnel-out", dir === "in" ? s.x : s.x + s.tam.ancho, y);
  return { g: cambiarNodo(r.g, r.id, (n) => ({ ...n, dentro: estructura, ...(caso && dir !== "in" ? { config: { ...n.config, marcos: s.config.marcos.length } } : {}) })), id: r.id };
}

/** Un shift register: su par de nodos en los bordes izquierdo y derecho, a la altura `y`. */
export function crearRegistro(g, cat, estructura, y) {
  const s = nodoDe(g, estructura);
  const izq = crearNodo(g, cat, "shift-register-left", s.x, y);
  const der = crearNodo(izq.g, cat, "shift-register-right", s.x + s.tam.ancho, y);
  let g2 = cambiarNodo(der.g, izq.id, (n) => ({ ...n, dentro: estructura, config: { ...n.config, par: der.id } }));
  g2 = cambiarNodo(g2, der.id, (n) => ({ ...n, dentro: estructura, config: { ...n.config, par: izq.id } }));
  return { g: g2, izquierdo: izq.id, derecho: der.id };
}

/** Las estructuras que hay entre el diagrama del VI y un ámbito, de fuera a dentro. */
function cadena(g, ambito) {
  const r = [];
  for (let a = ambito; a; a = nodoDe(g, a)?.dentro) r.unshift(a);
  return r;
}

/**
 * Une dos terminales de ámbitos distintos como LabVIEW: el cable pasa por un
 * túnel en el borde de cada estructura que cruza, de salida al subir y de
 * entrada al bajar. Devuelve el diagrama y los ids de los cables, o el motivo.
 */
export function conectarCruzando(g, cat, t1, t2) {
  const [de, a] = t1.dir === "out" ? [t1, t2] : [t2, t1];
  const desde = cadena(g, ambitoDe(g, cat, de.nodo, de.puerto, "out"));
  const hasta = cadena(g, ambitoDe(g, cat, a.nodo, a.puerto, "in"));
  let comun = 0;
  while (comun < desde.length && comun < hasta.length && desde[comun] === hasta[comun]) comun++;
  const yDe = nodoDe(g, de.nodo).y;
  const ids = [];
  let actual = de;
  // Subir: un túnel de salida en cada estructura que se deja.
  // Como LabVIEW: en un For, un túnel de salida nace indexado y uno de entrada
  // también si lo que entra es un array; en un While, no (sin comprobar en la VM).
  const esFor = (s) => nodoDe(g, s)?.tipo === "for-loop";
  const tipoDe = (t) => tipos(g, cat).salidas.get(`${t.nodo}.${t.puerto}`);
  for (const s of desde.slice(comun).reverse()) {
    let t = crearTunel(g, cat, s, "out", yDe);
    if (esFor(s)) t = { g: cambiarNodo(t.g, t.id, (n) => ({ ...n, config: { ...n.config, indexado: true } })), id: t.id };
    // En un Case, el cable entra por la entrada del marco de donde sale.
    const k = marcoDe(t.g, cat, actual.nodo, actual.puerto, "out");
    const puerto = nodoDe(t.g, t.id).tipo === "case-tunnel-out" ? `x-${k ?? 0}` : "x";
    const c = conectar(t.g, cat, actual, { nodo: t.id, puerto, dir: "in" });
    if (c.motivo) return c;
    g = c.g;
    ids.push(c.id);
    actual = { nodo: t.id, puerto: "y", dir: "out" };
  }
  // Bajar: uno de entrada en cada estructura en la que se entra.
  for (const s of hasta.slice(comun)) {
    let t = crearTunel(g, cat, s, "in", nodoDe(g, a.nodo).y);
    if (esFor(s) && esArray(tipoDe(actual))) t = { g: cambiarNodo(t.g, t.id, (n) => ({ ...n, config: { ...n.config, indexado: true } })), id: t.id };
    const c = conectar(t.g, cat, actual, { nodo: t.id, puerto: "x", dir: "in" });
    if (c.motivo) return c;
    g = c.g;
    ids.push(c.id);
    actual = { nodo: t.id, puerto: "y", dir: "out" };
  }
  const c = conectar(g, cat, actual, a);
  if (c.motivo) return c;
  return { g: c.g, ids: [...ids, c.id] };
}

const cambiarNodo = (g, id, f) => ({ ...g, nodos: g.nodos.map((n) => (n.id === id ? f(n) : n)) });

/**
 * Los codos de un cable: dónde gira, en la capa de presentación. Una lista que
 * alterna x e y y empieza y acaba en x: el cable sale en horizontal, gira en
 * cada x hacia la y siguiente y entra en horizontal. Moverlos no cambia el
 * programa (spec/05 regla 25).
 */
export const fijarCodos = (g, id, codos) => ({ ...g, cables: g.cables.map((c) => (c.id === id ? { ...c, codos } : c)) });

/**
 * El punto de unión de una rama: donde un cable sale de otro que lleva el mismo
 * dato. Presentación pura, como los codos: se dibuja un punto ahí.
 */
export const fijarUnion = (g, id, union) => ({ ...g, cables: g.cables.map((c) => (c.id === id ? { ...c, union } : c)) });

/** El valor de una constante y, si cambia, su tipo (una I32 que recibe un decimal pasa a DBL). */
export const fijarValor = (g, id, value, type) =>
  cambiarNodo(g, id, (n) => ({ ...n, config: { ...n.config, value, ...(type !== undefined ? { type } : {}) } }));

/**
 * Representation: cambia el tipo numérico de una constante, un control o un
 * indicador y lleva su valor a ese tipo. La constante DBL de la paleta es la
 * numérica general con la representación puesta, así que al cambiarla pasa a
 * serlo. Los cables se conservan: lo que ya no encaje, se romperá o llevará un
 * punto de coerción al resolver los tipos.
 */
export const fijarRepresentacion = (g, id, tipo) =>
  cambiarNodo(g, id, (n) => {
    if (n.tipo === "const" && tipo === DBL) return n;
    return {
      ...n,
      tipo: n.tipo === "const" ? "num-const" : n.tipo,
      config: { ...n.config, type: tipo, value: convertirValor(n.config?.value ?? 0, tipo) },
    };
  });

/** Cambia campos de la configuración de un nodo: el modo de Compound Arithmetic, sus entradas invertidas… */
export const fijarConfig = (g, id, cambios) => cambiarNodo(g, id, (n) => ({ ...n, config: { ...n.config, ...cambios } }));

const indice = (puerto) => Number(puerto.slice(puerto.lastIndexOf("-") + 1));
const conIndice = (puerto, i) => `${puerto.slice(0, puerto.lastIndexOf("-") + 1)}${i}`;

/**
 * Renumera las entradas de un nodo con entradas variables: `f` da el índice
 * nuevo de cada una, o -1 si desaparece. Sus cables y sus marcas de invertida
 * la siguen; los de las que desaparecen se borran (spec/05 regla 30).
 */
function renumerar(g, id, n, f) {
  const cables = [];
  for (const c of g.cables) {
    if (c.a.nodo !== id || !/-\d+$/.test(c.a.puerto)) {
      cables.push(c);
      continue;
    }
    const nuevo = f(indice(c.a.puerto));
    if (nuevo >= 0) cables.push({ ...c, a: { ...c.a, puerto: conIndice(c.a.puerto, nuevo) } });
  }
  const g2 = cambiarNodo({ ...g, cables }, id, (nodo) => ({
    ...nodo,
    config: {
      ...nodo.config,
      inputs: n,
      inverted: (nodo.config?.inverted ?? []).flatMap((p) => (p === "result" ? [p] : f(indice(p)) >= 0 ? [conIndice(p, f(indice(p)))] : [])),
    },
  }));
  return g2;
}

/** Fija cuántas entradas tiene el nodo: se añaden o se quitan por abajo, como al estirarlo. */
export function fijarEntradas(g, cat, id, n) {
  const nodo = g.nodos.find((k) => k.id === id);
  const n2 = Math.max(cat.bloque(nodo.tipo).entradas.minimo, n);
  return renumerar(g, id, n2, (i) => (i < n2 ? i : -1));
}

/**
 * Estirar por arriba: `extra` entradas nuevas encima (negativo: se quitan las
 * de arriba), y las que había bajan de índice con sus cables.
 */
export function desplazarEntradas(g, cat, id, extra) {
  const nodo = g.nodos.find((k) => k.id === id);
  const n = cat.puertos(nodo).in.length;
  return renumerar(g, id, n + extra, (k) => (k + extra >= 0 ? k + extra : -1));
}

/** Add Input sobre una entrada: la nueva va justo debajo. */
export function anadirEntrada(g, cat, id, puerto) {
  const nodo = g.nodos.find((k) => k.id === id);
  const n = cat.puertos(nodo).in.length;
  const i = indice(puerto);
  return renumerar(g, id, n + 1, (k) => (k > i ? k + 1 : k));
}

/** Remove Input sobre una entrada: se va ella, con su cable, y las de debajo suben. */
export function quitarEntrada(g, cat, id, puerto) {
  const nodo = g.nodos.find((k) => k.id === id);
  const n = cat.puertos(nodo).in.length;
  if (n <= cat.bloque(nodo.tipo).entradas.minimo) return g;
  const i = indice(puerto);
  return renumerar(g, id, n - 1, (k) => (k === i ? -1 : k > i ? k - 1 : k));
}

/** Invert: la entrada o la salida se invierte; en el diagrama lleva un circulito. */
export const alternarInvertida = (g, id, puerto) =>
  cambiarNodo(g, id, (n) => {
    const inv = n.config?.inverted ?? [];
    return { ...n, config: { ...n.config, inverted: inv.includes(puerto) ? inv.filter((p) => p !== puerto) : [...inv, puerto] } };
  });

/** Visible Items ▸ Terminals: el nodo enseña sus terminales en vez de su icono. */
export const alternarTerminales = (g, id) =>
  cambiarNodo(g, id, (n) => ({ ...n, vista: { ...n.vista, terminales: !n.vista?.terminales } }));

/**
 * Une dos terminales, en el orden en que se pulsaron. Devuelve el diagrama y,
 * si no se pudo, el motivo (spec/05 regla 31). Un cable entre tipos que no
 * convierten sí se crea, roto, como en LabVIEW (spec/06-visual.md §5.1): lo
 * dice `tipos()`. Lo que no se crea es lo que no tiene sentido como cable.
 */
export function conectar(g, cat, t1, t2, codos) {
  if (t1.dir === t2.dir) {
    const motivo = t1.dir === "out" ? "Los dos terminales son salidas: un cable va de una salida a una entrada." : "Los dos terminales son entradas: un cable necesita una salida que lo alimente.";
    return { g, motivo };
  }
  const [de, a] = t1.dir === "out" ? [t1, t2] : [t2, t1];
  cat.puerto(nodoDe(g, de.nodo), de.puerto, "out");
  cat.puerto(nodoDe(g, a.nodo), a.puerto, "in");
  // DT-041: un cable no cruza el borde de una estructura; para eso están los túneles (conectarCruzando).
  if (ambitoDe(g, cat, de.nodo, de.puerto, "out") !== ambitoDe(g, cat, a.nodo, a.puerto, "in"))
    return { g, motivo: "Los dos terminales están a distinto lado del borde de una estructura: el cable tiene que pasar por un túnel." };
  const [m1, m2] = [marcoDe(g, cat, de.nodo, de.puerto, "out"), marcoDe(g, cat, a.nodo, a.puerto, "in")];
  // En una secuencia, un marco pasa datos a uno posterior; nunca a uno anterior.
  const secuencia = esSecuencia(nodoDe(g, ambitoDe(g, cat, de.nodo, de.puerto, "out")));
  if (secuencia && m1 !== undefined && m2 !== undefined && m1 > m2) return { g, motivo: "Un marco de una secuencia sólo pasa datos a los que van después." };
  if (!secuencia && m1 !== undefined && m2 !== undefined && m1 !== m2) return { g, motivo: "Los dos terminales están en marcos distintos del Case." };
  const ya = g.cables.find((c) => c.de.nodo === de.nodo && c.de.puerto === de.puerto && c.a.nodo === a.nodo && c.a.puerto === a.puerto);
  if (ya) return { g, id: ya.id };
  // Regla 32: la entrada ocupada se queda con el cable nuevo.
  const cables = g.cables.filter((c) => !(c.a.nodo === a.nodo && c.a.puerto === a.puerto));
  const id = `c${g.siguiente}`;
  const cable = { id, de: { nodo: de.nodo, puerto: de.puerto }, a: { nodo: a.nodo, puerto: a.puerto } };
  if (codos) cable.codos = codos;
  return { g: { ...g, cables: [...cables, cable], siguiente: g.siguiente + 1 }, id };
}

/**
 * Orden topológico (Kahn). Lo que queda fuera está en un ciclo: se devuelve
 * como dato, con los nodos implicados (regla 9).
 */
export function orden(g) {
  const entran = new Map(g.nodos.map((n) => [n.id, 0]));
  const salen = new Map(g.nodos.map((n) => [n.id, []]));
  for (const c of g.cables) {
    entran.set(c.a.nodo, entran.get(c.a.nodo) + 1);
    salen.get(c.de.nodo).push(c.a.nodo);
  }
  const listos = g.nodos.filter((n) => entran.get(n.id) === 0).map((n) => n.id);
  const orden = [];
  while (listos.length) {
    const id = listos.shift();
    orden.push(id);
    for (const d of salen.get(id)) {
      entran.set(d, entran.get(d) - 1);
      if (entran.get(d) === 0) listos.push(d);
    }
  }
  const ciclo = g.nodos.map((n) => n.id).filter((id) => !orden.includes(id));
  return { orden, ciclo };
}

/** Sustituye las variables de un tipo declarado. */
function sustituir(t, vars) {
  if (t && typeof t === "object") {
    if ("num" in t) {
      const v = vars[t.num] ?? DBL;
      return t.flotante && esEntero(v) ? DBL : v;
    }
    // Las funciones que parten o juntan números: la mitad o el doble de bits, sin signo.
    if ("mitad" in t || "doble" in t) {
      const v = vars[t.mitad ?? t.doble];
      if (!esNumerico(v)) return undefined;
      return `u${Math.min(64, Math.max(8, NUMERICOS[v].bits * ("mitad" in t ? 0.5 : 2)))}`;
    }
    if ("elemOArray" in t) return vars[t.elemOArray] ?? DBL;
    if ("logico" in t) {
      // Sin nada cableado, booleano; con coma flotante, el entero de sus mismos bits.
      const v = vars[t.logico] ?? "boolean";
      return esNumerico(v) && !esEntero(v) ? (v === "sgl" ? "i32" : "i64") : v;
    }
    // Comparison: un booleano, un número o una cadena; sin nada cableado, DBL.
    if ("escalar" in t) return vars[t.escalar] ?? DBL;
    // Las funciones de carácter (Decimal Digit?…): una cadena o un número; sin nada cableado, una cadena.
    if ("texto" in t) return vars[t.texto] ?? "string";
    if ("var" in t) return vars[t.var];
    if ("array" in t) {
      const e = sustituir(t.array, vars);
      return e === undefined ? undefined : { array: e };
    }
  }
  return t;
}

/**
 * Lleva un tipo a lo que admite la variable que lo declara: `entero` (la coma
 * flotante pasa al entero de sus mismos bits, como en los modos bit a bit),
 * `min` y `max` (los bits, para Split Number y Join Numbers).
 */
function restringir(t, decl) {
  if (!esNumerico(t)) return t;
  if (decl.entero && !esEntero(t)) t = t === "sgl" ? "i32" : "i64";
  const { bits, signo } = NUMERICOS[typeof t === "string" ? t : "u16"];
  const con = (n) => `${signo ? "i" : "u"}${n}`;
  if (decl.min && bits < decl.min) return con(decl.min);
  if (decl.max && bits > decl.max) return con(decl.max);
  return t;
}

/** Liga las variables de un tipo declarado con el tipo que le llega por el cable. */
function ligar(declarado, llega, vars) {
  if (!declarado || typeof declarado !== "object" || llega === undefined) return;
  if ("num" in declarado) {
    if (!esNumerico(llega)) return;
    vars[declarado.num] = restringir(vars[declarado.num] === undefined ? llega : comun(vars[declarado.num], llega), declarado);
  } else if ("logico" in declarado) {
    // Booleano o numérico: lo que llega primero decide; lo otro, después, rompe el cable.
    if (llega !== "boolean" && !esNumerico(llega)) return;
    const v = vars[declarado.logico];
    vars[declarado.logico] = v === undefined ? llega : v === "boolean" || llega === "boolean" ? v : comun(v, llega);
  } else if ("escalar" in declarado) {
    // Booleano, cadena, cluster o número: lo que llega primero decide; mezclar clases rompe el cable.
    // Comprobado en LabVIEW 2026 Q3 (docs/reference/labview-errors.md §8): un túnel
    // de Case y Select aceptan clusters y cadenas; I32 con DBL da DBL; cadena con número rompe el cable.
    if (llega !== "boolean" && llega !== "string" && !esNumerico(llega) && !esCluster(llega)) return;
    const v = vars[declarado.escalar];
    vars[declarado.escalar] = v === undefined ? llega : !esNumerico(v) || !esNumerico(llega) ? v : comun(v, llega);
  } else if ("texto" in declarado) {
    if (llega !== "string" && !esNumerico(llega)) return;
    if (vars[declarado.texto] === undefined) vars[declarado.texto] = llega;
  } else if ("var" in declarado) {
    if (vars[declarado.var] === undefined) vars[declarado.var] = llega;
  } else if ("array" in declarado && esArray(llega)) ligar(declarado.array, llega.array, vars);
  // Una entrada de Build Array: un elemento o un array de elementos; E es el elemento.
  else if ("elemOArray" in declarado) {
    const e = esArray(llega) ? llega.array : llega;
    if (vars[declarado.elemOArray] === undefined) vars[declarado.elemOArray] = e;
    else if (esNumerico(e) && esNumerico(vars[declarado.elemOArray])) vars[declarado.elemOArray] = comun(vars[declarado.elemOArray], e);
  }
}

/**
 * Los tipos del diagrama, resueltos hacia delante en orden topológico (regla
 * 2c): el tipo de cada terminal de cada nodo, y de cada cable su tipo, si
 * lleva un punto de coerción en su entrada y, si está roto, por qué.
 *
 * Una variable numérica sin nada cableado queda en DBL, que es lo que enseña
 * LabVIEW en una función sin cablear.
 */
export function tipos(g, cat) {
  const r = resolverTipos(g, cat, new Map());
  // Un shift register sin valor inicial cableado toma el tipo de lo que le entra
  // por la derecha, que se resuelve después que él: segunda pasada (DT-041).
  const pistas = new Map();
  for (const n of g.nodos) {
    if (n.tipo !== "shift-register-left" || g.cables.some((c) => c.a.nodo === n.id)) continue;
    const c = g.cables.find((k) => k.a.nodo === n.config?.par && k.a.puerto === "value");
    const t = c && r.salidas.get(`${c.de.nodo}.${c.de.puerto}`);
    if (t !== undefined) pistas.set(n.id, t);
  }
  return pistas.size ? resolverTipos(g, cat, pistas) : r;
}

function resolverTipos(g, cat, pistas) {
  const { orden: ord, ciclo } = orden(g);
  const enCiclo = new Set(ciclo);
  const salidas = new Map(); // `${nodo}.${puerto}` → tipo
  const entradas = new Map();
  const llegaA = new Map(g.cables.map((c) => [`${c.a.nodo}.${c.a.puerto}`, c]));

  const resolverNodo = (n) => {
    const b = cat.bloque(n.tipo);
    const { in: ins, out: outs } = cat.puertos(n);
    const vars = {};
    // El tipo de un nodo que lo toma de su configuración: el suyo o, si no lo
    // tiene escrito, el que declara el catálogo (un control sin tocar es DBL).
    const tipoConfig = b["type-from"] === "config" ? (n.config?.type ?? b.config?.default?.type) : undefined;
    if (tipoConfig) {
      for (const p of [...outs, ...ins]) if (p.type?.var) vars[p.type.var] = tipoConfig;
    }
    for (const p of ins) {
      const c = llegaA.get(`${n.id}.${p.name}`);
      if (c && !enCiclo.has(c.de.nodo)) ligar(p.type, salidas.get(`${c.de.nodo}.${c.de.puerto}`), vars);
    }
    if (pistas.has(n.id) && vars.T === undefined) vars.T = pistas.get(n.id);
    // Sin nada cableado, una variable con `defecto` toma ese tipo (Split Number es U32).
    for (const p of ins) {
      const d = p.type;
      if (d && typeof d === "object" && "num" in d && d.defecto && vars[d.num] === undefined) vars[d.num] = d.defecto;
    }
    // En los modos bit a bit (AND, OR, XOR de Compound Arithmetic) la operación
    // es entera: la coma flotante pasa al entero de sus mismos bits.
    // Con booleanos (como sale de la paleta Boolean) opera sobre booleanos.
    if (b["modos-bit-a-bit"]?.includes(n.config?.mode ?? b.config?.mode?.value)) {
      const llegaBooleano = ins.some((p) => {
        const c = llegaA.get(`${n.id}.${p.name}`);
        return c && salidas.get(`${c.de.nodo}.${c.de.puerto}`) === "boolean";
      });
      if (llegaBooleano) for (const p of [...ins, ...outs]) if (p.type?.num && !vars[p.type.num]) vars[p.type.num] = "boolean";
      for (const p of [...ins, ...outs]) if (p.type?.num && !vars[p.type.num]) vars[p.type.num] = DBL;
      for (const [k, v] of Object.entries(vars)) if (esNumerico(v) && !esEntero(v)) vars[k] = v === "sgl" ? "i32" : "i64";
    }
    for (const p of ins) {
      let t = sustituir(p.type, vars);
      // Build Array: una entrada cableada con un array es un array de E.
      if (p.type && typeof p.type === "object" && "elemOArray" in p.type) {
        const c = llegaA.get(`${n.id}.${p.name}`);
        if (c && esArray(salidas.get(`${c.de.nodo}.${c.de.puerto}`))) t = { array: t };
      }
      entradas.set(`${n.id}.${p.name}`, t);
    }
    for (const p of outs) salidas.set(`${n.id}.${p.name}`, sustituir(p.type, vars));
  };
  for (const id of ord) resolverNodo(nodoDe(g, id));
  for (const id of ciclo) resolverNodo(nodoDe(g, id));

  const cables = new Map();
  for (const c of g.cables) {
    const desde = salidas.get(`${c.de.nodo}.${c.de.puerto}`);
    const hacia = entradas.get(`${c.a.nodo}.${c.a.puerto}`);
    let roto = null;
    let coercion = false;
    if (enCiclo.has(c.de.nodo) && enCiclo.has(c.a.nodo)) roto = "Este cable cierra un ciclo: un nodo no puede depender de su propia salida.";
    else if (desde === undefined || hacia === undefined) roto = "El tipo de uno de los extremos no se puede determinar.";
    else {
      const conv = conversion(desde, hacia);
      if (!conv) roto = `Tipos incompatibles: el terminal espera ${nombre(hacia)} y el cable lleva ${nombre(desde)}.`;
      coercion = conv === "coercion";
    }
    cables.set(c.id, { tipo: desde, coercion, roto });
  }
  return { entradas, salidas, cables, ciclo };
}

/**
 * ¿Se puede ejecutar el VI? No, si hay un cable roto o una entrada sin cable ni
 * valor por defecto (spec/03 regla 10). Es lo que pone la flecha de Run rota.
 * El terminal de un indicador no cuenta: sin cable, conserva su valor, como en
 * LabVIEW.
 */
export function ejecutable(g, cat, resueltos) {
  if ([...resueltos.cables.values()].some((c) => c.roto)) return false;
  const llegan = new Set(g.cables.map((c) => `${c.a.nodo}.${c.a.puerto}`));
  return g.nodos.every((n) => cat.bloque(n.tipo).panel || cat.puertos(n).in.every((p) => !requerido(g, n, p) || llegan.has(`${n.id}.${p.name}`)));
}

/**
 * ¿Hace falta cablear esta entrada? Sí, si no tiene valor por defecto; salvo la
 * cuenta de un For que tiene un túnel de entrada indexado: da tantas vueltas
 * como elementos tenga (DT-041, autoindexado).
 */
export function requerido(g, n, p) {
  if (p.default !== undefined) return false;
  if (n.tipo === "loop-count") return !g.nodos.some((k) => k.dentro === n.dentro && k.tipo === "tunnel-in" && k.config?.indexado);
  return true;
}

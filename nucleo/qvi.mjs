// Leer y escribir un VI en su fichero .qvi (spec/02-syntax.md,
// schema/qvi.schema.json).
//
// El .qvi separa el programa de su presentación: `front-panel` y
// `block-diagram` son lo que se compila; `layout`, dónde está cada cosa en cada
// lienzo, las etiquetas y los codos de los cables, que el compilador no lee. El
// grafo del editor lo junta todo en cada nodo; aquí se reparte al escribir y se
// vuelve a juntar al leer.
//
// Criterio: escribir, leer y volver a escribir da el mismo texto, y lo leído se
// ve igual que lo que se guardó. Los ids del grafo no se guardan: al leer se
// numeran de nuevo, en el orden del fichero. Módulo puro, como grafo.mjs.
//
// Las estructuras (DT-041): el grafo es plano, con `dentro`; el fichero anida
// cada cuerpo en su estructura (spec/02 §5). Lo del borde no son nodos en el
// fichero sino referencias: `bucle.túnel` desde los dos lados, `registro.left` y
// `registro.right` dentro y `bucle.registro` fuera, y `bucle.i`,
// `bucle.condition` y `bucle.N` para los terminales del bucle.

import { ambitoDe, crearEstructura, crearNodo, marcoDe, nuevo } from "./grafo.mjs";

export const VERSION = 1;

/** El `default` del fichero es el `value` del grafo; el resto de la configuración se llama igual. */
const aFichero = (config) => {
  if (!config) return undefined;
  const r = {};
  for (const [k, v] of Object.entries(config)) {
    if (v === undefined) continue;
    r[k === "value" ? "default" : k] = v;
  }
  return Object.keys(r).length ? r : undefined;
};
const aGrafo = (config) => {
  if (!config) return undefined;
  const r = {};
  for (const [k, v] of Object.entries(config)) r[k === "default" ? "value" : k] = v;
  return r;
};

/** Quita las claves sin valor, para que el fichero no lleve `undefined` ni objetos vacíos. */
function limpio(o) {
  const r = {};
  for (const [k, v] of Object.entries(o)) if (v !== undefined) r[k] = v;
  return r;
}

/**
 * El VI como objeto conforme a qvi.schema.json. `cat` es el catálogo de
 * bloques (grafo.mjs): de él sale si un control del panel es control o
 * indicador.
 */
export function escribir(g, cat) {
  const porId = new Map(g.nodos.map((n) => [n.id, n]));
  const panel = [];
  const diagram = {};
  const placPanel = {};
  const BORDE = new Set(["tunnel-in", "tunnel-out", "case-tunnel-out", "shift-register-left", "shift-register-right", "loop-iteration", "loop-condition", "loop-count", "case-selector"]);
  // Un ámbito por estructura (por marco, en un Case) y otro para el diagrama del VI (clave "").
  const ambitos = new Map([["", { nodes: [], wires: [], structures: [] }]]);
  const ambito = (id, marco) => {
    const clave = id === undefined ? "" : marco === undefined ? id : `${id}#${marco}`;
    if (!ambitos.has(clave)) ambitos.set(clave, { nodes: [], wires: [], structures: [] });
    return ambitos.get(clave);
  };
  const TERMINAL = { "loop-iteration": "i", "loop-condition": "condition", "loop-count": "N", "case-selector": "selector" };
  for (const n of g.nodos) {
    const b = cat.bloque(n.tipo);
    const etiqueta = n.label ? { text: n.label.text } : undefined;
    if (BORDE.has(n.tipo)) {
      const s = porId.get(n.dentro);
      // Los terminales se guardan con el nombre de su bucle; un shift register, con el de su lado izquierdo.
      const clave = TERMINAL[n.tipo] ? `${s.name}.${TERMINAL[n.tipo]}` : n.tipo === "shift-register-right" ? `${porId.get(n.config.par).name}.right` : n.name;
      diagram[clave] = limpio({ x: n.x, y: n.y });
      continue;
    }
    if (b.estructura) {
      const hijos = g.nodos.filter((k) => k.dentro === n.id);
      const tunnels = hijos
        .filter((k) => ["tunnel-in", "tunnel-out", "case-tunnel-out"].includes(k.tipo))
        .map((k) => limpio({ name: k.name, dir: k.tipo === "tunnel-in" ? "in" : "out", indexed: k.config?.indexado || undefined, "use-default": k.config?.["use-default"] || undefined }));
      const registros = hijos.filter((k) => k.tipo === "shift-register-left").map((k) => ({ name: k.name }));
      const modo = hijos.find((k) => k.tipo === "loop-condition")?.config?.mode;
      const caso = n.tipo === "case-structure";
      const secuencia = n.tipo === "flat-sequence" || n.tipo === "stacked-sequence";
      ambito(n.dentro, n.marco).structures.push(
        limpio({
          name: n.name,
          kind: n.tipo,
          "condition-mode": modo && modo !== "stop-if-true" ? modo : undefined,
          tunnels: tunnels.length ? tunnels : undefined,
          "shift-registers": registros.length ? registros : undefined,
          body: caso || secuencia ? undefined : ambito(n.id),
          frames: caso || secuencia ? n.config.marcos.map((m, k) => limpio({ match: m.valores?.length ? m.valores : undefined, default: m.default || undefined, body: ambito(n.id, k) })) : undefined,
        }),
      );
      const activo = (caso || n.tipo === "stacked-sequence") && n.config?.activo ? n.config.activo : undefined;
      const anchos = n.tipo === "flat-sequence" && n.config.marcos.every((m) => m.ancho !== undefined) ? n.config.marcos.map((m) => m.ancho) : undefined;
      diagram[n.name] = limpio({ x: n.x, y: n.y, w: n.tam.ancho, h: n.tam.alto, label: etiqueta, "label-offset": n.etiqueta, "active-frame": activo, "frame-widths": anchos });
      continue;
    }
    const esPanel = !!b.panel;
    const config = esPanel ? undefined : aFichero(n.config);
    ambito(n.dentro, n.marco).nodes.push(limpio({ name: n.name, type: n.tipo, config }));
    diagram[n.name] = limpio({
      x: n.x,
      y: n.y,
      label: etiqueta,
      "label-offset": n.etiqueta,
      "show-terminals": n.vista?.terminales || undefined,
      "view-as-icon": n.vista?.compacto ? false : undefined,
    });
    if (esPanel) {
      const salida = cat.puertos(n).out.length > 0;
      const tipoBase = b.config?.default?.type ?? "number";
      panel.push(limpio({ name: n.name, role: salida ? "control" : "indicator", type: n.config?.type ?? tipoBase, default: n.config?.value, style: n.config?.style, "visible-elements": n.config?.visibles, index: n.config?.indice || undefined, "mechanical-action": n.config?.mechanical }));
      if (n.panel) placPanel[n.name] = limpio({ x: n.panel.x, y: n.panel.y, label: etiqueta, "label-offset": n.panel.etiqueta });
    }
  }
  /** La referencia de un puerto en el fichero (spec/02 §5.1). */
  const referencia = (id, puerto) => {
    const n = porId.get(id);
    const s = porId.get(n.dentro);
    if (TERMINAL[n.tipo]) return `${s.name}.${TERMINAL[n.tipo]}`;
    if (n.tipo === "tunnel-in" || n.tipo === "tunnel-out" || n.tipo === "case-tunnel-out") return `${s.name}.${n.name}`;
    if (n.tipo === "shift-register-left") return puerto === "init" ? `${s.name}.${n.name}` : `${n.name}.left`;
    if (n.tipo === "shift-register-right") {
      const izq = porId.get(n.config.par).name;
      return puerto === "result" ? `${s.name}.${izq}` : `${izq}.right`;
    }
    return `${n.name}.${puerto}`;
  };
  const recorridos = {};
  for (const c of g.cables) {
    const from = referencia(c.de.nodo, c.de.puerto);
    const to = referencia(c.a.nodo, c.a.puerto);
    const marco = marcoDe(g, cat, c.de.nodo, c.de.puerto, "out") ?? marcoDe(g, cat, c.a.nodo, c.a.puerto, "in");
    ambito(ambitoDe(g, cat, c.de.nodo, c.de.puerto, "out"), marco).wires.push({ from, to });
    if (c.codos || c.union) recorridos[to] = limpio({ bends: c.codos, junction: c.union });
  }
  // Un ámbito sin nada no lleva listas vacías.
  for (const a of ambitos.values()) {
    for (const k of ["nodes", "wires", "structures"]) if (!a[k].length) delete a[k];
  }
  // El sitio de cada cosa, en el orden en que sale en el fichero: así lo abierto
  // y vuelto a guardar da el mismo texto aunque el grafo se haya creado en otro orden.
  const ordenado = {};
  const poner = (clave) => {
    if (clave in diagram) ordenado[clave] = diagram[clave];
  };
  const recorrer = (a) => {
    for (const n of a.nodes ?? []) poner(n.name);
    for (const e of a.structures ?? []) {
      poner(e.name);
      for (const t of ["N", "i", "condition", "selector"]) poner(`${e.name}.${t}`);
      for (const t of e.tunnels ?? []) poner(t.name);
      for (const r of e["shift-registers"] ?? []) {
        poner(r.name);
        poner(`${r.name}.right`);
      }
      recorrer(e.body ?? {});
      for (const f of e.frames ?? []) recorrer(f.body ?? {});
    }
  };
  recorrer(ambitos.get(""));
  const layout = limpio({
    diagram: ordenado,
    panel: Object.keys(placPanel).length ? placPanel : undefined,
    wires: Object.keys(recorridos).length ? recorridos : undefined,
  });
  const raiz = ambitos.get("");
  return limpio({
    solder: VERSION,
    ...(g.vi ?? {}),
    "front-panel": panel.length ? panel : undefined,
    "block-diagram": limpio({ nodes: raiz.nodes ?? [], wires: raiz.wires, structures: raiz.structures }),
    layout,
  });
}

/** El texto del fichero: JSON con sangría de dos espacios, siempre igual para el mismo VI. */
export const aTexto = (g, cat) => `${JSON.stringify(escribir(g, cat), null, 2)}\n`;

/** Un fichero que no se puede leer, con el motivo. */
export class ErrorQvi extends Error {}

/**
 * Lee un VI. `datos` es el objeto del fichero (o su texto). Las estructuras se
 * reconstruyen planas, con `dentro` (DT-041).
 */
export function leer(datos, cat) {
  const vi = typeof datos === "string" ? JSON.parse(datos) : datos;
  if (vi.solder !== VERSION) throw new ErrorQvi(`versión del formato ${vi.solder}: este Solder lee la ${VERSION}`);
  const bd = vi["block-diagram"] ?? {};
  const lay = vi.layout ?? {};
  const fp = new Map((vi["front-panel"] ?? []).map((i) => [i.name, i]));
  let g = nuevo();
  const porNombre = new Map();
  // Lo que se escribe en el último nodo creado.
  const retocar = (f) => {
    const n = f({ ...g.nodos.at(-1) });
    g = { ...g, nodos: [...g.nodos.slice(0, -1), n] };
    return n;
  };
  const cambiar = (id, f) => (g = { ...g, nodos: g.nodos.map((n) => (n.id === id ? f(n) : n)) });
  // Las estructuras por nombre: su id, el de sus terminales, túneles y shift registers.
  const estructuras = new Map();
  const registros = new Map(); // nombre del registro → { izq, der }
  const cablesPendientes = [];

  function leerAmbito(a, dentro, marco) {
    for (const nodo of a.nodes ?? []) {
      if (!cat.tiene(nodo.type)) throw new ErrorQvi(`el bloque «${nodo.type}» de ${nodo.name} no está en el catálogo`);
      const d = lay.diagram?.[nodo.name] ?? {};
      g = crearNodo(g, cat, nodo.type, d.x ?? 0, d.y ?? 0).g;
      const n = retocar((n) => {
        n.name = nodo.name;
        if (dentro) n.dentro = dentro;
        if (marco !== undefined) n.marco = marco;
        if (cat.bloque(nodo.type).panel) {
          // Un control guarda su tipo y su valor por defecto en el panel, que es donde son programa.
          const item = fp.get(nodo.name);
          const tipoBase = cat.bloque(nodo.type).config?.default?.type ?? "number";
          // Lo que no es de fábrica del bloque se conserva; lo demás lo pone el bloque al crearse.
          const config = limpio({ type: item && item.type !== tipoBase ? item.type : undefined, value: item?.default, style: item?.style, visibles: item?.["visible-elements"], indice: item?.index, mechanical: item?.["mechanical-action"] });
          n.config = { ...n.config, ...config };
          if (!Object.keys(n.config).length) delete n.config;
        } else if (nodo.config) n.config = { ...n.config, ...aGrafo(nodo.config) };
        const p = lay.panel?.[nodo.name];
        const texto = d.label?.text ?? p?.label?.text;
        if (texto !== undefined) n.label = { text: texto };
        if (d["label-offset"]) n.etiqueta = d["label-offset"];
        if (d["show-terminals"] || d["view-as-icon"] === false) {
          n.vista = limpio({ terminales: d["show-terminals"] || undefined, compacto: d["view-as-icon"] === false || undefined });
        }
        if (p) n.panel = limpio({ x: p.x, y: p.y, etiqueta: p["label-offset"] });
        return n;
      });
      porNombre.set(nodo.name, n);
    }
    for (const e of a.structures ?? []) {
      if (!cat.tiene(e.kind) || !cat.bloque(e.kind).estructura) throw new ErrorQvi(`la estructura «${e.kind}» de ${e.name} todavía no se sabe leer`);
      const d = lay.diagram?.[e.name] ?? {};
      const r = crearEstructura(g, cat, e.kind, d.x ?? 0, d.y ?? 0, d.w ?? 200, d.h ?? 150);
      g = r.g;
      cambiar(r.id, (n) => limpio({ ...n, name: e.name, dentro, marco, label: d.label ? { text: d.label.text } : undefined, etiqueta: d["label-offset"] }));
      const caso = e.kind === "case-structure";
      const conMarcos = caso || e.kind === "flat-sequence" || e.kind === "stacked-sequence";
      if (conMarcos) {
        const anchos = e.kind === "flat-sequence" ? d["frame-widths"] : undefined;
        const marcos = (e.frames ?? []).map((f, k) => (caso ? limpio({ valores: f.match ?? [], default: f.default || undefined }) : anchos?.length === e.frames.length ? { ancho: anchos[k] } : {}));
        const activo = e.kind === "flat-sequence" ? {} : { activo: d["active-frame"] ?? 0 };
        cambiar(r.id, (n) => ({ ...n, config: { ...n.config, marcos, ...activo } }));
      }
      const info = { id: r.id, miembros: new Map() };
      estructuras.set(e.name, info);
      // Sus terminales, con su sitio guardado y el modo de la condición.
      for (const n of g.nodos.filter((k) => k.dentro === r.id)) {
        const t = { "loop-iteration": "i", "loop-condition": "condition", "loop-count": "N", "case-selector": "selector" }[n.tipo];
        info.miembros.set(t, n.id);
        const p = lay.diagram?.[`${e.name}.${t}`];
        cambiar(n.id, (k) => ({ ...k, ...(p ? { x: p.x, y: p.y } : {}), ...(t === "condition" && e["condition-mode"] ? { config: { ...k.config, mode: e["condition-mode"] } } : {}) }));
      }
      const enBorde = (tipo, nombre, clave) => {
        const p = lay.diagram?.[clave ?? nombre] ?? {};
        g = crearNodo(g, cat, tipo, p.x ?? 0, p.y ?? 0).g;
        return retocar((n) => ({ ...n, name: nombre, dentro: r.id }));
      };
      for (const t of e.tunnels ?? []) {
        const tipo = t.dir === "in" ? "tunnel-in" : caso ? "case-tunnel-out" : "tunnel-out";
        const n = enBorde(tipo, t.name);
        if (t.indexed) cambiar(n.id, (k) => ({ ...k, config: { ...k.config, indexado: true } }));
        if (tipo === "case-tunnel-out") cambiar(n.id, (k) => ({ ...k, config: { ...k.config, marcos: (e.frames ?? []).length, "use-default": !!t["use-default"] } }));
        info.miembros.set(t.name, n.id);
      }
      for (const sr of e["shift-registers"] ?? []) {
        const izq = enBorde("shift-register-left", sr.name);
        const der = enBorde("shift-register-right", `${sr.name}-right`, `${sr.name}.right`);
        cambiar(izq.id, (n) => ({ ...n, config: { ...n.config, par: der.id } }));
        cambiar(der.id, (n) => ({ ...n, config: { ...n.config, par: izq.id } }));
        registros.set(sr.name, { izq: izq.id, der: der.id });
        info.miembros.set(sr.name, { izq: izq.id, der: der.id });
      }
      if (conMarcos) (e.frames ?? []).forEach((f, k) => leerAmbito(f.body ?? {}, r.id, k));
      else leerAmbito(e.body ?? {}, r.id);
    }
    for (const w of a.wires ?? []) cablesPendientes.push({ ...w, marco });
  }
  leerAmbito(bd, undefined);

  const porId = new Map(g.nodos.map((n) => [n.id, n]));
  /** De una referencia del fichero al puerto del grafo, según vaya de salida (`from`) o de entrada (`to`). */
  const extremo = (ref, dir, marco) => {
    const [nombre, puerto] = ref.split(".");
    const e = estructuras.get(nombre);
    if (e) {
      const m = e.miembros.get(puerto);
      if (m === undefined) throw new ErrorQvi(`«${ref}»: la estructura ${nombre} no tiene «${puerto}»`);
      if (typeof m === "object") return dir === "in" ? { nodo: m.izq, puerto: "init" } : { nodo: m.der, puerto: "result" };
      const n = porId.get(m);
      const p = { "loop-iteration": "i", "loop-condition": "stop", "loop-count": "count", "case-selector": "selector" }[n.tipo];
      if (p) return { nodo: m, puerto: p };
      // La entrada de un túnel de salida de Case es la del marco de donde viene el cable.
      if (n.tipo === "case-tunnel-out" && dir === "in") return { nodo: m, puerto: `x-${marco ?? 0}` };
      return { nodo: m, puerto: dir === "in" ? "x" : "y" };
    }
    const sr = registros.get(nombre);
    if (sr && (puerto === "left" || puerto === "right")) return puerto === "left" ? { nodo: sr.izq, puerto: "value" } : { nodo: sr.der, puerto: "value" };
    const n = porNombre.get(nombre);
    if (!n) throw new ErrorQvi(`el wire va a «${nombre}», que no está en el diagrama`);
    try {
      cat.puerto(n, puerto, dir);
    } catch (err) {
      throw new ErrorQvi(err.message);
    }
    return { nodo: n.id, puerto };
  };
  const cables = cablesPendientes.map((w, i) => {
    const c = { id: `c${g.siguiente + i}`, de: extremo(w.from, "out", w.marco), a: extremo(w.to, "in", w.marco) };
    const codos = lay.wires?.[w.to]?.bends;
    if (codos) c.codos = codos;
    const union = lay.wires?.[w.to]?.junction;
    if (union) c.union = union;
    return c;
  });
  const extra = limpio({ meta: vi.meta, capabilities: vi.capabilities, connector: vi.connector });
  g = { ...g, cables, siguiente: g.siguiente + cables.length };
  if (Object.keys(extra).length) g.vi = extra;
  return g;
}

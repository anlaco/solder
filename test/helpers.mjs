// Lo que comparten los tests: la raíz del repositorio, el inventario real y el
// catálogo de bloques real.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as Gr from "../core/model/graph.mjs";
import { cargarCatalogo as cargarCatalogo_ } from "../core/model/graph.mjs";
import { cargarInventario } from "../editor/src/common/labview-inventory.mjs";

export const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const leer = (ruta) => JSON.parse(readFileSync(path.join(RAIZ, ruta), "utf8"));
export const DATOS = leer("docs/schema/inventario-labview.json");
export const INV = cargarInventario(DATOS);
export const CAT = cargarCatalogo_(leer("docs/schema/blocks.json"));

/**
 * A VI that adds two numbers, built as the editor does: controls `x` and `y`
 * and an indicator `sum` on the panel, wired through an Add. Without a
 * connector: the tests give it one. Returns the graph and the id of each element.
 */
export function buildAdder() {
  let g = Gr.nuevo();
  const place = (block, label, x, y) => {
    const placed = Gr.crearEnPanel(g, CAT, block, x, y, label);
    g = placed.g;
    return placed.id;
  };
  const x = place("control", "x", 20, 20);
  const y = place("control", "y", 20, 80);
  const sum = place("indicator", "sum", 300, 40);
  const created = Gr.crearNodo(g, CAT, "add", 160, 40);
  g = created.g;
  const add = created.id;
  const wire = (from, fromPort, to, toPort) => {
    g = Gr.conectar(g, CAT, { nodo: from, puerto: fromPort, dir: "out" }, { nodo: to, puerto: toPort, dir: "in" }).g;
  };
  wire(x, "result", add, "a");
  wire(y, "result", add, "b");
  wire(add, "result", sum, "value");
  return { g, ids: { x, y, sum, add } };
}

/** Builds a VI with the catalog `cat`; `steps` receives an API that names each node. */
export function buildVI(cat, steps) {
  const vi = { g: Gr.nuevo(), id: {} };
  const api = {
    node(name, block, config, inside) {
      const r = Gr.crearNodo(vi.g, cat, block, 0, 0);
      vi.g = config ? Gr.fijarConfig(r.g, r.id, config) : r.g;
      vi.id[name] = r.id;
      if (inside) vi.g = Gr.meter(vi.g, cat, [r.id], vi.id[inside]);
    },
    loop(name, block) {
      const r = Gr.crearEstructura(vi.g, cat, block, 0, 0, 200, 150);
      vi.g = r.g;
      vi.id[name] = r.id;
      for (const n of vi.g.nodos.filter((k) => k.dentro === r.id)) vi.id[`${name}:${{ "loop-iteration": "i", "loop-condition": "stop", "loop-count": "N" }[n.tipo]}`] = n.id;
    },
    shiftRegister(name, loop) {
      const r = Gr.crearRegistro(vi.g, cat, vi.id[loop], 0);
      vi.g = r.g;
      vi.id[`${name}.left`] = r.izquierdo;
      vi.id[`${name}.right`] = r.derecho;
    },
    wire(from, to) {
      const split = (end) => [end.slice(0, end.lastIndexOf(".")), end.slice(end.lastIndexOf(".") + 1)];
      const [[n1, p1], [n2, p2]] = [split(from), split(to)];
      const r = Gr.conectarCruzando(vi.g, cat, { nodo: vi.id[n1], puerto: p1, dir: "out" }, { nodo: vi.id[n2], puerto: p2, dir: "in" });
      assert.ok(!r.motivo, `${from} → ${to}: ${r.motivo}`);
      vi.g = r.g;
    },
    connector(inputs, outputs) {
      const name = (n) => (typeof n === "string" ? vi.g.nodos.find((k) => k.id === vi.id[n]).name : { ...n, name: vi.g.nodos.find((k) => k.id === vi.id[n.name]).name });
      vi.g = { ...vi.g, vi: { ...vi.g.vi, connector: { inputs: inputs.map(name), outputs: outputs.map(name) } } };
    },
    execution(execution) {
      vi.g = { ...vi.g, vi: { ...vi.g.vi, execution } };
    },
  };
  steps(api);
  return vi;
}

/** The catalog of a caller whose subVIs are `library` (relative path → VI built with buildVI). */
export function callerCatalog(library) {
  const entries = new Map(Object.entries(library).map(([path, vi]) => [path, { key: path, g: vi.g, cat: CAT }]));
  return Gr.conSubVIs(CAT, (path) => entries.get(path) ?? null);
}

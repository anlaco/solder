// Lo que comparten los tests: la raíz del repositorio, el inventario real y el
// catálogo de bloques real.

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

#!/usr/bin/env -S node --experimental-wasm-jspi
// Solder's command line, with no user interface (provisional plan §3):
//
//   cli/solder.mjs run   file.qvi   runs the VI and prints its indicators
//   cli/solder.mjs wat   file.qvi   prints the WebAssembly module as text
//   cli/solder.mjs check file.qvi   says whether it can run and, if not, why
//
// Controls take their default value from the panel. When calling node by hand,
// VIs that wait need `--experimental-wasm-jspi` (DT-040).

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compilar } from "../core/compiler/compiler.mjs";
import { ejecutar } from "../core/runtime/runtime.mjs";
import { cargarCatalogo } from "../core/model/graph.mjs";
import { leer } from "../core/model/qvi-format.mjs";
import { formatear } from "../core/model/types.mjs";
import { wat } from "../core/compiler/wasm-encoder.mjs";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const cat = cargarCatalogo(JSON.parse(readFileSync(path.join(AQUI, "../docs/schema/blocks.json"), "utf8")));

const [orden, fichero] = process.argv.slice(2);
if (!["run", "wat", "check"].includes(orden) || !fichero) {
  console.error("usage: solder.mjs run|wat|check file.qvi");
  process.exit(2);
}

let g;
try {
  g = leer(readFileSync(fichero, "utf8"), cat);
} catch (e) {
  console.error(`${fichero}: ${e.message}`);
  process.exit(1);
}
const c = compilar(g, cat);
if (c.errores) {
  for (const e of c.errores) console.error(`${fichero}: ${e.motivo}`);
  process.exit(1);
}
if (orden === "check") {
  console.log(`${fichero}: se puede ejecutar`);
} else if (orden === "wat") {
  process.stdout.write(wat(c.modulo));
} else {
  const porId = new Map(g.nodos.map((n) => [n.id, n]));
  const valores = Object.fromEntries(c.controles.map((k) => [k.nodo, porId.get(k.nodo).config?.value ?? 0]));
  const escritos = await ejecutar(c, valores);
  for (const i of c.indicadores) {
    const n = porId.get(i.nodo);
    const v = escritos[i.nodo];
    console.log(`${n.label?.text ?? n.name} = ${typeof v === "boolean" ? (v ? "TRUE" : "FALSE") : formatear(v, i.tipo)}`);
  }
}

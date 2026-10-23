#!/usr/bin/env node
// Solder's command line, with no user interface (provisional plan §3):
//
//   cli/solder.mjs run   file.sdg   runs the VI and prints its indicators
//   cli/solder.mjs wat   file.sdg   prints the WebAssembly module as text
//   cli/solder.mjs check file.sdg   says whether it can run and, if not, why
//
// Controls take their default value from the panel. VIs that wait need JSPI (DT-040): on
// a Node that lacks it without a flag, the command line starts itself again with the flag.

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compilar } from "../core/compiler/compiler.mjs";
import { ejecutar } from "../core/runtime/runtime.mjs";
import { cargarCatalogo } from "../core/model/graph.mjs";
import { loadHierarchy } from "../core/model/hierarchy.mjs";
import { leer } from "../core/model/qvi-format.mjs";
import { startValue } from "../core/model/control-values.mjs";
import { formatear } from "../core/model/types.mjs";
import { wat } from "../core/compiler/wasm-encoder.mjs";
import { JSPI_FLAG, jspiNodeArguments } from "./jspi.mjs";

/** On a Node that needs the JSPI flag, runs this command again with it and exits as that run does. */
function relaunchWithJSPIIfNeeded() {
  const missing = jspiNodeArguments();
  if (!missing.length || process.execArgv.includes(JSPI_FLAG)) return;
  const relaunched = spawnSync(process.execPath, [...missing, ...process.execArgv, ...process.argv.slice(1)], { stdio: "inherit" });
  if (relaunched.signal) process.kill(process.pid, relaunched.signal);
  process.exit(relaunched.status);
}

relaunchWithJSPIIfNeeded();

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const cat = cargarCatalogo(JSON.parse(readFileSync(path.join(AQUI, "../docs/schema/blocks.json"), "utf8")));

/** An indicator's value as the panel would show it. */
function shownValue(value, type) {
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return `[${value.map((element) => shownValue(element, type?.array)).join(", ")}]`;
  if (value && typeof value === "object") return `{ ${Object.entries(value).map(([field, element]) => `${field}: ${shownValue(element)}`).join(", ")} }`;
  return formatear(value, type);
}

const [orden, fichero] = process.argv.slice(2);
if (!["run", "wat", "check"].includes(orden) || !fichero) {
  console.error("usage: solder.mjs run|wat|check file.sdg (or an old .qvi)");
  process.exit(2);
}

// The VI and its subVIs, each read from the path its caller stores relative to itself (DT-045).
const resolvePath = (caller, relative) => path.resolve(path.dirname(caller), relative);
const loadVI = (key, viCatalog) => {
  try {
    return leer(readFileSync(key, "utf8"), viCatalog);
  } catch (e) {
    if (e.code === "ENOENT") return null;
    console.error(`${key}: ${e.message}`);
    process.exit(1);
  }
};
const hierarchy = loadHierarchy(path.resolve(fichero), cat, { resolvePath, loadVI });
for (const e of hierarchy.errors) console.error(`${e.vi ?? fichero}: ${e.motivo}`);
if (hierarchy.errors.length) process.exit(1);
const { g, cat: rootCatalog } = hierarchy.vis.get(hierarchy.root);
const c = compilar(g, rootCatalog, { name: path.basename(fichero) });
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
  const valores = Object.fromEntries(c.controles.map((k) => [k.nodo, startValue(porId.get(k.nodo))]));
  const escritos = await ejecutar(c, valores);
  for (const i of c.indicadores) {
    const n = porId.get(i.nodo);
    const v = escritos[i.nodo];
    console.log(`${n.label?.text ?? n.name} = ${shownValue(v, i.tipo)}`);
  }
}

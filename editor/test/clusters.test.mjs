// Clusters (DT-042): un bloque plano con los escalares dentro y las cadenas por
// handle, como en LabVIEW. Bundle escribe sus campos en su propio bloque;
// Unbundle los lee sin copiar; un shift register guarda su copia.

import assert from "node:assert/strict";
import { test } from "node:test";

import { compilar } from "../../nucleo/compilador.mjs";
import { ejecutar } from "../../nucleo/ejecutar.mjs";
import * as Gr from "../../nucleo/grafo.mjs";
import { CAT } from "./comun.mjs";

const PUNTO = { cluster: [{ name: "x", type: "number" }, { name: "ok", type: "boolean" }, { name: "nombre", type: "string" }] };

function vi(nodos, cables) {
  let g = Gr.nuevo();
  const id = {};
  for (const [nombre, bloque, config, dentro] of nodos) {
    const estructura = ["for-loop", "case-structure"].includes(bloque);
    const r = estructura ? Gr.crearEstructura(g, CAT, bloque, 0, 0, 200, 150) : Gr.crearNodo(g, CAT, bloque, 0, 0);
    g = config ? Gr.fijarConfig(r.g, r.id, config) : r.g;
    if (dentro) g = Gr.meter(g, CAT, [r.id], id[dentro[0]], dentro[1]);
    id[nombre] = r.id;
    for (const n of g.nodos.filter((k) => k.dentro === r.id)) id[`${nombre}:${{ "loop-count": "N", "loop-iteration": "i", "case-selector": "sel" }[n.tipo]}`] = n.id;
  }
  const con = (de, a) => {
    const [n1, p1] = [de.slice(0, de.lastIndexOf(".")), de.slice(de.lastIndexOf(".") + 1)];
    const [n2, p2] = [a.slice(0, a.lastIndexOf(".")), a.slice(a.lastIndexOf(".") + 1)];
    const r = Gr.conectar(g, CAT, { nodo: id[n1], puerto: p1, dir: "out" }, { nodo: id[n2], puerto: p2, dir: "in" });
    assert.ok(!r.motivo, `${de} → ${a}: ${r.motivo}`);
    g = r.g;
  };
  for (const [de, a] of cables) con(de, a);
  return { get g() { return g; }, set g(x) { g = x; }, id, con };
}

async function correr(v, valores = {}) {
  const c = compilar(v.g, CAT);
  assert.ok(!c.errores, JSON.stringify(c.errores));
  assert.ok(WebAssembly.validate(c.bytes), "el módulo es WebAssembly válido");
  const nombre = Object.fromEntries(Object.entries(v.id).map(([k, x]) => [x, k]));
  const escritos = await ejecutar(c, Object.fromEntries(Object.entries(valores).map(([k, x]) => [v.id[k], x])));
  return Object.fromEntries(Object.entries(escritos).map(([k, x]) => [nombre[k], x]));
}

test("bundle junta un numero, un booleano y una cadena, y unbundle los separa", async () => {
  const v = vi(
    [["x", "const", { value: 2.5 }], ["ok", "bool-const", { value: true }], ["s", "str-const", { value: "año" }],
     ["b", "bundle", { type: PUNTO }], ["u", "unbundle", { type: PUNTO }],
     ["rx", "indicator"], ["rok", "bool-indicator"], ["rs", "str-indicator"], ["todo", "cluster-indicator", { type: PUNTO }]],
    [["x.result", "b.campo-0"], ["ok.result", "b.campo-1"], ["s.result", "b.campo-2"], ["b.result", "u.value"], ["b.result", "todo.value"],
     ["u.campo-0", "rx.value"], ["u.campo-1", "rok.value"], ["u.campo-2", "rs.value"]],
  );
  assert.deepEqual(await correr(v), { rx: 2.5, rok: true, rs: "año", todo: { x: 2.5, ok: true, nombre: "año" } });
});

test("un control de cluster, con otro cluster dentro, llega igual a un indicador", async () => {
  const T = { cluster: [{ name: "a", type: "i32" }, { name: "p", type: PUNTO }, { name: "z", type: "i64" }] };
  const v = vi([["c", "cluster-control", { type: T }], ["r", "cluster-indicator", { type: T }]], [["c.result", "r.value"]]);
  const valor = { a: -7, p: { x: 1.25, ok: false, nombre: "hola" }, z: 123456789012 };
  assert.deepEqual(await correr(v, { c: valor }), { r: valor });
});

test("un shift register de cluster acumula con su propia copia", async () => {
  const T = { cluster: [{ name: "n", type: "i32" }, { name: "s", type: "string" }] };
  const v = vi(
    [["f", "for-loop"], ["n", "const", { value: 3 }], ["cero", "const", { value: 0 }], ["vacia", "str-const"], ["ini", "bundle", { type: T }],
     ["u", "unbundle", { type: T }, ["f"]], ["mas", "increment", null, ["f"]], ["x", "str-const", { value: "ab" }, ["f"]], ["cat", "concatenate-strings", null, ["f"]],
     ["b", "bundle", { type: T }, ["f"]], ["r", "cluster-indicator", { type: T }]],
    [["n.result", "f:N.count"], ["cero.result", "ini.campo-0"], ["vacia.result", "ini.campo-1"]],
  );
  const sr = Gr.crearRegistro(v.g, CAT, v.id.f, 0);
  v.g = sr.g;
  v.id.izq = sr.izquierdo;
  v.id.der = sr.derecho;
  const cat = CAT.puertos(v.g.nodos.find((n) => n.id === v.id.cat));
  for (const [de, a] of [["ini.result", "izq.init"], ["izq.value", "u.value"], ["u.campo-0", "mas.x"], ["u.campo-1", `cat.${cat.in[0].name}`], ["x.result", `cat.${cat.in[1].name}`],
    ["mas.result", "b.campo-0"], [`cat.${cat.out[0].name}`, "b.campo-1"], ["b.result", "der.value"], ["der.result", "r.value"]]) v.con(de, a);
  assert.deepEqual(await correr(v), { r: { n: 3, s: "ababab" } });
});

test("un tunel de case sin cablear con use default da el cluster vacio", async () => {
  const v = vi(
    [["c", "case-structure"], ["s", "bool-const", { value: false }], ["x", "const", { value: 4 }, ["c", 1]], ["ok", "bool-const", { value: true }, ["c", 1]],
     ["t", "str-const", { value: "sí" }, ["c", 1]], ["b", "bundle", { type: PUNTO }, ["c", 1]], ["r", "cluster-indicator", { type: PUNTO }]],
    [["s.result", "c:sel.selector"], ["x.result", "b.campo-0"], ["ok.result", "b.campo-1"], ["t.result", "b.campo-2"]],
  );
  const tun = Gr.crearTunel(v.g, CAT, v.id.c, "out", 0);
  v.g = Gr.fijarConfig(tun.g, tun.id, { "use-default": true });
  v.id.tun = tun.id;
  v.con("b.result", "tun.x-1");
  v.con("tun.y", "r.value");
  assert.deepEqual(await correr(v), { r: { x: 0, ok: false, nombre: "" } }, "corre el marco False, que no lo cablea");
});

test("dos clusters distintos no se cablean", () => {
  const OTRO = { cluster: [{ name: "x", type: "number" }] };
  const v = vi([["c", "cluster-control", { type: PUNTO }], ["r", "cluster-indicator", { type: OTRO }]], []);
  const g = Gr.conectar(v.g, CAT, { nodo: v.id.c, puerto: "result", dir: "out" }, { nodo: v.id.r, puerto: "value", dir: "in" }).g;
  assert.ok([...Gr.tipos(g, CAT).cables.values()].some((c) => c.roto), "el cable sale roto, como en LabVIEW");
});

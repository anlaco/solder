// While Loop y For Loop (DT-041): el modelo plano con `dentro`, los túneles y
// los shift registers, y su ejecución sobre los clumps de DT-040. Lo que se
// comprueba es lo que hace LabVIEW 2026 Q3 (labview-captures/run/ y spec/04 §5).

import assert from "node:assert/strict";
import { test } from "node:test";

import Ajv2020 from "ajv/dist/2020.js";

import { compilar } from "../../core/compiler/compiler.mjs";
import { ejecutar } from "../../core/runtime/runtime.mjs";
import * as Gr from "../../core/model/graph.mjs";
import { aTexto, leer } from "../../core/model/qvi-format.mjs";
import { CAT, leer as leerJson } from "../helpers.mjs";

/**
 * Un VI con estructuras. `pasos` construye sobre un objeto con el grafo y los
 * ids por nombre: bucle(nombre, tipo, dentro?), nodo(nombre, bloque, config,
 * dentro?), registro(nombre, bucle), tunel(nombre, bucle, dir) y cable("a.p", "b.q").
 */
function construir(pasos) {
  const v = { g: Gr.nuevo(), id: {} };
  const meterEn = (nombre, dentro, marco) => {
    if (dentro) v.g = Gr.meter(v.g, CAT, [v.id[nombre]], v.id[dentro], marco);
  };
  const api = {
    bucle(nombre, tipo, dentro) {
      const r = Gr.crearEstructura(v.g, CAT, tipo, 0, 0, 200, 150);
      v.g = r.g;
      v.id[nombre] = r.id;
      meterEn(nombre, dentro);
      // Sus terminales, por su nombre: «nombre:i», «nombre:stop», «nombre:N».
      for (const n of v.g.nodos.filter((k) => k.dentro === r.id)) v.id[`${nombre}:${{ "loop-iteration": "i", "loop-condition": "stop", "loop-count": "N", "case-selector": "sel" }[n.tipo]}`] = n.id;
    },
    nodo(nombre, bloque, config, dentro, marco) {
      const r = Gr.crearNodo(v.g, CAT, bloque, 0, 0);
      v.g = config ? Gr.fijarConfig(r.g, r.id, config) : r.g;
      v.id[nombre] = r.id;
      meterEn(nombre, dentro, marco);
    },
    marcos(caso, marcos) {
      v.g = Gr.fijarMarcos(v.g, CAT, v.id[caso], marcos);
    },
    registro(nombre, bucle) {
      const r = Gr.crearRegistro(v.g, CAT, v.id[bucle], 0);
      v.g = r.g;
      v.id[`${nombre}.izq`] = r.izquierdo;
      v.id[`${nombre}.der`] = r.derecho;
    },
    tunel(nombre, bucle, dir) {
      const r = Gr.crearTunel(v.g, CAT, v.id[bucle], dir, 0);
      v.g = r.g;
      v.id[nombre] = r.id;
    },
    cable(de, a) {
      const [n1, p1] = [de.slice(0, de.lastIndexOf(".")), de.slice(de.lastIndexOf(".") + 1)];
      const [n2, p2] = [a.slice(0, a.lastIndexOf(".")), a.slice(a.lastIndexOf(".") + 1)];
      const r = Gr.conectar(v.g, CAT, { nodo: v.id[n1], puerto: p1, dir: "out" }, { nodo: v.id[n2], puerto: p2, dir: "in" });
      assert.ok(!r.motivo, `${de} → ${a}: ${r.motivo}`);
      v.g = r.g;
    },
  };
  pasos(api);
  return v;
}

async function correr(v, valores = {}, opciones = {}) {
  const c = compilar(v.g, CAT);
  assert.ok(!c.errores, JSON.stringify(c.errores));
  assert.ok(WebAssembly.validate(c.bytes), "el módulo es WebAssembly válido");
  const nombre = Object.fromEntries(Object.entries(v.id).map(([k, x]) => [x, k]));
  const escritos = await ejecutar(c, Object.fromEntries(Object.entries(valores).map(([k, x]) => [v.id[k], x])), opciones);
  return Object.fromEntries(Object.entries(escritos).map(([k, x]) => [nombre[k], x]));
}

// El ejemplo de siempre: 0 + 1 + … + 9 = 45 con un shift register; el bucle
// para cuando i = 9 (Stop if True), así que corre 10 vueltas.
test("un while suma 0 a 9 con un shift register y para cuando la condicion es cierta", async () => {
  const v = construir((b) => {
    b.bucle("w", "while-loop");
    b.registro("sr", "w");
    b.nodo("cero", "const", { value: 0 });
    b.nodo("suma", "add", null, "w");
    b.nodo("nueve", "const", { value: 9 }, "w");
    b.nodo("igual", "equal", null, "w");
    b.tunel("t", "w", "out");
    b.nodo("total", "indicator");
    b.nodo("ultima", "indicator");
    b.cable("cero.result", "sr.izq.init");
    b.cable("sr.izq.value", "suma.a");
    b.cable("w:i.i", "suma.b");
    b.cable("suma.result", "sr.der.value");
    b.cable("w:i.i", "igual.x");
    b.cable("nueve.result", "igual.y");
    b.cable("igual.result", "w:stop.stop");
    b.cable("w:i.i", "t.x");
    b.cable("sr.der.result", "total.value");
    b.cable("t.y", "ultima.value");
  });
  assert.deepEqual(await correr(v), { total: 45, ultima: 9 });
});

// spec/04 regla 16: un For con N ≤ 0 no corre; sus túneles dan el valor por
// defecto del tipo y sus shift registers, el inicial.
test("un for corre n vueltas y con n cero ninguna", async () => {
  const hacer = (n) =>
    construir((b) => {
      b.bucle("f", "for-loop");
      b.nodo("n", "const", { value: n });
      b.registro("sr", "f");
      b.nodo("siete", "const", { value: 7 });
      b.nodo("mas", "add", null, "f");
      b.tunel("t", "f", "out");
      b.nodo("acum", "indicator");
      b.nodo("ultima", "indicator");
      b.cable("n.result", "f:N.count");
      b.cable("siete.result", "sr.izq.init");
      b.cable("sr.izq.value", "mas.a");
      b.cable("f:i.i", "mas.b");
      b.cable("mas.result", "sr.der.value");
      b.cable("f:i.i", "t.x");
      b.cable("sr.der.result", "acum.value");
      b.cable("t.y", "ultima.value");
    });
  assert.deepEqual(await correr(hacer(5)), { acum: 7 + 0 + 1 + 2 + 3 + 4, ultima: 4 });
  assert.deepEqual(await correr(hacer(0)), { acum: 7, ultima: 0 });
  assert.deepEqual(await correr(hacer(-3)), { acum: 7, ultima: 0 });
});

// labview-captures/run/r1.png y r2.png: el indicador de dentro se escribe en cada
// vuelta, el Stop (Latch) se lee en cada vuelta y vuelve a FALSE, y el de fuera
// sólo recibe el valor cuando el bucle acaba.
test("un while con stop: el indicador de dentro va en vivo, el stop se lee cada vuelta y el tunel sale al acabar", async () => {
  const v = construir((b) => {
    b.bucle("w", "while-loop");
    b.nodo("stop", "bool-control", { mechanical: "latch-when-released" }, "w");
    b.nodo("ms", "const", { value: 20 }, "w");
    b.nodo("espera", "wait-ms", null, "w");
    b.nodo("cuenta", "indicator", null, "w");
    b.tunel("t", "w", "out");
    b.nodo("final", "indicator");
    b.cable("w:i.i", "cuenta.value");
    b.cable("ms.result", "espera.ms");
    b.cable("stop.result", "w:stop.stop");
    b.cable("w:i.i", "t.x");
    b.cable("t.y", "final.value");
  });
  const c = compilar(v.g, CAT);
  const valores = { [v.id.stop]: false };
  const llegadas = [];
  const t0 = performance.now();
  setTimeout(() => (valores[v.id.stop] = true), 110);
  const fin = ejecutar(c, valores, { alEscribir: (n, x) => llegadas.push({ n, x, t: performance.now() - t0 }) });
  await fin;
  const cuentas = llegadas.filter((l) => l.n === v.id.cuenta);
  const final = llegadas.filter((l) => l.n === v.id.final);
  assert.ok(cuentas.length >= 4, `el indicador de dentro se escribe en cada vuelta (${cuentas.length})`);
  assert.deepEqual(cuentas.map((l) => l.x), cuentas.map((_, k) => k), "0, 1, 2…");
  assert.equal(final.length, 1, "el túnel sale una vez");
  assert.ok(final[0].t >= 100, "y cuando el bucle acaba");
  assert.equal(final[0].x, cuentas.at(-1).x, "con el valor de la última vuelta");
  assert.equal(valores[v.id.stop], false, "el Stop vuelve solo a FALSE");
});

test("continue if true invierte la condicion", async () => {
  const v = construir((b) => {
    b.bucle("w", "while-loop");
    b.nodo("tres", "const", { value: 3 }, "w");
    b.nodo("menor", "less", null, "w");
    b.tunel("t", "w", "out");
    b.nodo("ultima", "indicator");
    b.cable("w:i.i", "menor.x");
    b.cable("tres.result", "menor.y");
    b.cable("menor.result", "w:stop.stop");
    b.cable("w:i.i", "t.x");
    b.cable("t.y", "ultima.value");
  });
  v.g = Gr.fijarConfig(v.g, v.id["w:stop"], { mode: "continue-if-true" });
  // Sigue mientras i < 3: corre con i = 0, 1, 2 y 3, y para en la vuelta en que i < 3 es falso.
  assert.deepEqual(await correr(v), { ultima: 3 });
});

test("bucles anidados: un for dentro de otro", async () => {
  const v = construir((b) => {
    b.bucle("fuera", "for-loop");
    b.bucle("dentro", "for-loop", "fuera");
    b.nodo("n1", "const", { value: 4 });
    b.nodo("n2", "const", { value: 3 }, "fuera");
    b.registro("sr", "fuera");
    b.registro("sr2", "dentro");
    b.nodo("uno", "const", { value: 1 }, "dentro");
    b.nodo("mas", "add", null, "dentro");
    b.nodo("cero", "const", { value: 0 });
    b.nodo("total", "indicator");
    b.cable("n1.result", "fuera:N.count");
    b.cable("n2.result", "dentro:N.count");
    b.cable("cero.result", "sr.izq.init");
    b.cable("sr.izq.value", "sr2.izq.init");
    b.cable("sr2.izq.value", "mas.a");
    b.cable("uno.result", "mas.b");
    b.cable("mas.result", "sr2.der.value");
    b.cable("sr2.der.result", "sr.der.value");
    b.cable("sr.der.result", "total.value");
  });
  assert.deepEqual(await correr(v), { total: 12 });
});

// spec/04 regla 12b: dos bucles sin cables entre ellos corren a la vez, cada uno
// a su ritmo; y un bucle sin esperas no bloquea a los demás (cede).
test("dos bucles en paralelo van cada uno a su ritmo y uno sin esperas no bloquea al otro", async () => {
  const v = construir((b) => {
    b.bucle("a", "for-loop");
    b.nodo("na", "const", { value: 5 });
    b.nodo("ma", "const", { value: 20 }, "a");
    b.nodo("wa", "wait-ms", null, "a");
    b.nodo("ia", "indicator", null, "a");
    b.bucle("b", "for-loop");
    b.nodo("nb", "const", { value: 2 });
    b.nodo("mb", "const", { value: 50 }, "b");
    b.nodo("wb", "wait-ms", null, "b");
    b.nodo("ib", "indicator", null, "b");
    b.cable("na.result", "a:N.count");
    b.cable("ma.result", "wa.ms");
    b.cable("a:i.i", "ia.value");
    b.cable("nb.result", "b:N.count");
    b.cable("mb.result", "wb.ms");
    b.cable("b:i.i", "ib.value");
  });
  const t0 = performance.now();
  await correr(v);
  const t = performance.now() - t0;
  assert.ok(t >= 95 && t < 160, `5 × 20 ms y 2 × 50 ms a la vez: ~100 ms, no 200 (${t} ms)`);
});

test("abort para un bucle infinito sin esperas", async () => {
  const v = construir((b) => {
    b.bucle("w", "while-loop");
    b.nodo("no", "bool-const", { value: false }, "w");
    b.nodo("i", "indicator", null, "w");
    b.cable("no.result", "w:stop.stop");
    b.cable("w:i.i", "i.value");
  });
  const parar = new AbortController();
  const vistos = [];
  setTimeout(() => parar.abort(), 60);
  const t0 = performance.now();
  await assert.rejects(ejecutar(compilar(v.g, CAT), {}, { senal: parar.signal, alEscribir: (_, x) => vistos.push(x) }), (e) => e.abortado);
  assert.ok(performance.now() - t0 < 200, "para en el acto");
  assert.ok(vistos.length > 1000, `y mientras tanto el bucle giró (${vistos.length} vueltas)`);
});

test("un cable no cruza el borde de una estructura: conectar cruzando pone los tuneles", () => {
  const v = construir((b) => {
    b.bucle("w", "while-loop");
    b.bucle("w2", "while-loop", "w");
    b.nodo("k", "const", { value: 3 });
    b.nodo("dentro", "increment", null, "w2");
    b.nodo("fuera", "indicator");
  });
  const de = { nodo: v.id.k, puerto: "result", dir: "out" };
  const a = { nodo: v.id.dentro, puerto: "x", dir: "in" };
  assert.match(Gr.conectar(v.g, CAT, de, a).motivo, /túnel/);
  const r = Gr.conectarCruzando(v.g, CAT, de, a);
  assert.equal(r.ids.length, 3, "fuera → túnel de w → túnel de w2 → dentro");
  const tuneles = r.g.nodos.filter((n) => n.tipo === "tunnel-in");
  assert.deepEqual(tuneles.map((n) => n.dentro).sort(), [v.id.w, v.id.w2].sort());
  // Y de vuelta, de dentro afuera, con túneles de salida.
  const r2 = Gr.conectarCruzando(r.g, CAT, { nodo: v.id.dentro, puerto: "result", dir: "out" }, { nodo: v.id.fuera, puerto: "value", dir: "in" });
  assert.equal(r2.g.nodos.filter((n) => n.tipo === "tunnel-out").length, 2);
  assert.ok(!Gr.tipos(r2.g, CAT).cables.values().some((c) => c.roto));
});

test("mover o borrar una estructura se lleva lo que tiene dentro", () => {
  const v = construir((b) => {
    b.bucle("w", "while-loop");
    b.nodo("dentro", "increment", null, "w");
    b.nodo("fuera", "increment");
  });
  const movido = Gr.mover(v.g, [v.id.w], 10, 5);
  const n = (g, k) => g.nodos.find((x) => x.id === v.id[k]);
  assert.deepEqual([n(movido, "dentro").x, n(movido, "fuera").x], [10, 0]);
  const borrado = Gr.borrar(v.g, [v.id.w]);
  assert.deepEqual(borrado.nodos.map((x) => x.id), [v.id.fuera]);
});

test("un while sin cable en su condicion rompe el vi, como en labview", () => {
  const v = construir((b) => b.bucle("w", "while-loop"));
  const c = compilar(v.g, CAT);
  assert.match(c.errores.map((e) => e.motivo).join(), /Loop Condition/);
});

test("un millon de vueltas cuesta poco: el presupuesto de cesion se adapta", async () => {
  const v = construir((b) => {
    b.bucle("f", "for-loop");
    b.nodo("n", "const", { value: 1_000_000 });
    b.registro("sr", "f");
    b.nodo("cero", "const", { value: 0 });
    b.nodo("mas", "add", null, "f");
    b.nodo("total", "indicator");
    b.cable("n.result", "f:N.count");
    b.cable("cero.result", "sr.izq.init");
    b.cable("sr.izq.value", "mas.a");
    b.cable("f:i.i", "mas.b");
    b.cable("mas.result", "sr.der.value");
    b.cable("sr.der.result", "total.value");
  });
  const t0 = performance.now();
  assert.deepEqual(await correr(v), { total: (999_999 * 1_000_000) / 2 });
  assert.ok(performance.now() - t0 < 400, `${performance.now() - t0} ms`);
});

// DT-041 §5: el grafo plano se guarda anidado (spec/02 §5) y se abre igual.
test("un vi con bucles se guarda anidado, cumple el esquema y se abre igual", async () => {
  const v = construir((b) => {
    b.bucle("fuera", "for-loop");
    b.bucle("dentro", "while-loop", "fuera");
    b.nodo("n", "const", { value: 3 });
    b.registro("sr", "fuera");
    b.nodo("cero", "const", { value: 0 });
    b.tunel("t", "dentro", "in");
    b.tunel("s", "dentro", "out");
    b.nodo("mas", "increment", null, "dentro");
    b.nodo("si", "bool-const", { value: true }, "dentro");
    b.nodo("total", "indicator");
    b.cable("n.result", "fuera:N.count");
    b.cable("cero.result", "sr.izq.init");
    b.cable("sr.izq.value", "t.x");
    b.cable("t.y", "mas.x");
    b.cable("mas.result", "s.x");
    b.cable("si.result", "dentro:stop.stop");
    b.cable("s.y", "sr.der.value");
    b.cable("sr.der.result", "total.value");
  });
  v.g = Gr.fijarConfig(v.g, v.id["dentro:stop"], { mode: "continue-if-true" });
  v.g = Gr.fijarConfig(v.g, v.id.si, { value: false });
  const texto = aTexto(v.g, CAT);
  const validar = new Ajv2020({ allErrors: true, strict: false }).compile(leerJson("docs/schema/qvi.schema.json"));
  assert.ok(validar(JSON.parse(texto)), JSON.stringify(validar.errors));
  const fichero = JSON.parse(texto);
  assert.equal(fichero["block-diagram"].structures[0].body.structures[0]["condition-mode"], "continue-if-true");
  const abierto = leer(texto, CAT);
  assert.equal(aTexto(abierto, CAT), texto, "guardar lo abierto da el mismo texto");
  // Y corre igual: tres vueltas de fuera, cada una suma 1 dentro.
  const c = compilar(abierto, CAT);
  assert.ok(!c.errores, JSON.stringify(c.errores));
  assert.deepEqual(Object.values(await ejecutar(c)), [3]);
});

test("el ejemplo while loop suma se abre y da 45", async () => {
  const g = leer(leerJson("docs/schema/examples/while-loop-suma.qvi.json"), CAT);
  assert.deepEqual(Object.values(await ejecutar(compilar(g, CAT))), [45]);
});

// ——— Case Structure ———

test("un case booleano corre el marco true o el false", async () => {
  const v = construir((b) => {
    b.bucle("c", "case-structure");
    b.nodo("s", "bool-control");
    b.nodo("uno", "const", { value: 1 }, "c", 0);
    b.nodo("dos", "const", { value: 2 }, "c", 1);
    b.tunel("t", "c", "out");
    b.nodo("r", "indicator");
    b.cable("s.result", "c:sel.selector");
    b.cable("uno.result", "t.x-0");
    b.cable("dos.result", "t.x-1");
    b.cable("t.y", "r.value");
  });
  assert.deepEqual(await correr(v, { s: false }), { r: 1 });
  assert.deepEqual(await correr(v, { s: true }), { r: 2 });
});

test("un case numerico con rango y default; un decimal se redondea al par", async () => {
  const v = construir((b) => {
    b.bucle("c", "case-structure");
    b.marcos("c", [{ valores: [0], default: true }, { valores: [1] }, { valores: [{ min: 2, max: 4 }] }]);
    b.nodo("x", "control");
    for (const [k, valor] of [[0, 10], [1, 20], [2, 30]]) {
      b.nodo(`k${k}`, "const", { value: valor }, "c", k);
    }
    b.tunel("t", "c", "out");
    b.nodo("r", "indicator");
    b.cable("x.result", "c:sel.selector");
    b.cable("k0.result", "t.x-0");
    b.cable("k1.result", "t.x-1");
    b.cable("k2.result", "t.x-2");
    b.cable("t.y", "r.value");
  });
  const r = async (x) => (await correr(v, { x })).r;
  assert.deepEqual([await r(0), await r(1), await r(3), await r(4), await r(7), await r(-1)], [10, 20, 30, 30, 10, 10]);
  assert.equal(await r(2.5), 30, "2,5 se redondea a 2");
  assert.equal(await r(1.5), 30, "1,5 se redondea a 2, el par");
});

test("en un case solo corre el marco elegido", async () => {
  const v = construir((b) => {
    b.bucle("c", "case-structure");
    b.nodo("s", "bool-const", { value: true });
    b.nodo("cinco", "const", { value: 5 }, "c", 0);
    b.nodo("en-falso", "indicator", null, "c", 0);
    b.nodo("seis", "const", { value: 6 }, "c", 1);
    b.nodo("en-cierto", "indicator", null, "c", 1);
    b.cable("s.result", "c:sel.selector");
    b.cable("cinco.result", "en-falso.value");
    b.cable("seis.result", "en-cierto.value");
  });
  assert.deepEqual(await correr(v), { "en-cierto": 6 });
});

test("un tunel de salida sin cablear en un marco rompe el vi salvo con use default if unwired", async () => {
  const v = construir((b) => {
    b.bucle("c", "case-structure");
    b.nodo("s", "bool-const", { value: false });
    b.nodo("dos", "const", { value: 2 }, "c", 1);
    b.tunel("t", "c", "out");
    b.nodo("r", "indicator");
    b.cable("s.result", "c:sel.selector");
    b.cable("dos.result", "t.x-1");
    b.cable("t.y", "r.value");
  });
  assert.ok(compilar(v.g, CAT).errores, "roto");
  v.g = Gr.fijarConfig(v.g, v.id.t, { "use-default": true });
  assert.deepEqual(await correr(v), { r: 0 }, "el marco False no lo cablea: sale el valor por defecto");
});

test("un case numerico sin default rompe el vi", () => {
  const v = construir((b) => {
    b.bucle("c", "case-structure");
    b.marcos("c", [{ valores: [0] }, { valores: [1] }]);
    b.nodo("k", "const", { value: 1 });
    b.cable("k.result", "c:sel.selector");
  });
  assert.match(compilar(v.g, CAT).errores.map((e) => e.motivo).join(), /Default/);
});

test("un case dentro de un bucle elige en cada vuelta", async () => {
  const v = construir((b) => {
    b.bucle("w", "for-loop");
    b.bucle("c", "case-structure", "w");
    b.marcos("c", [{ valores: [0], default: true }, { valores: [1] }]);
    b.nodo("n", "const", { value: 4 });
    b.nodo("dos", "const", { value: 2 }, "w");
    b.nodo("resto", "quotient-remainder", null, "w");
    b.registro("sr", "w");
    b.nodo("cero", "const", { value: 0 });
    b.tunel("ti", "c", "in");
    b.nodo("mas", "add", null, "c", 1);
    b.nodo("diez", "const", { value: 10 }, "c", 1);
    b.tunel("to", "c", "out");
    b.nodo("r", "indicator");
    b.cable("n.result", "w:N.count");
    b.cable("w:i.i", "resto.x");
    b.cable("dos.result", "resto.y");
    b.cable("resto.remainder", "c:sel.selector");
    b.cable("cero.result", "sr.izq.init");
    b.cable("sr.izq.value", "ti.x");
    b.cable("ti.y", "to.x-0");
    b.cable("ti.y", "mas.a");
    b.cable("diez.result", "mas.b");
    b.cable("mas.result", "to.x-1");
    b.cable("to.y", "sr.der.value");
    b.cable("sr.der.result", "r.value");
  });
  // i = 0, 1, 2, 3: suma 10 en las impares.
  assert.deepEqual(await correr(v), { r: 20 });
});

test("quitar un marco borra lo suyo y los tuneles siguen a sus marcos", () => {
  const v = construir((b) => {
    b.bucle("c", "case-structure");
    b.marcos("c", [{ valores: [0], default: true }, { valores: [1] }, { valores: [2] }]);
    b.nodo("a", "const", { value: 1 }, "c", 1);
    b.nodo("b", "const", { value: 2 }, "c", 2);
    b.tunel("t", "c", "out");
    b.cable("a.result", "t.x-1");
    b.cable("b.result", "t.x-2");
  });
  const g = Gr.fijarMarcos(v.g, CAT, v.id.c, [{ valores: [0], default: true, de: 0 }, { valores: [2], de: 2 }]);
  assert.ok(!g.nodos.some((n) => n.id === v.id.a), "lo del marco 1 se va con él");
  assert.equal(g.nodos.find((n) => n.id === v.id.b).marco, 1, "el marco 2 pasa a ser el 1");
  assert.deepEqual(g.cables.map((c) => c.a.puerto), ["x-1"]);
  assert.equal(CAT.puertos(g.nodos.find((n) => n.id === v.id.t)).in.length, 2);
});

test("un case se guarda con sus marcos, cumple el esquema y se abre igual", async () => {
  const v = construir((b) => {
    b.bucle("c", "case-structure");
    b.marcos("c", [{ valores: [0], default: true }, { valores: [{ min: 2, max: 4 }] }]);
    b.nodo("x", "const", { value: 3 });
    b.nodo("dentro", "const", { value: 7 }, "c", 1);
    b.tunel("ti", "c", "in");
    b.tunel("t", "c", "out");
    b.nodo("r", "indicator");
    b.cable("x.result", "c:sel.selector");
    b.cable("x.result", "ti.x");
    b.cable("ti.y", "t.x-0");
    b.cable("dentro.result", "t.x-1");
    b.cable("t.y", "r.value");
  });
  v.g = Gr.fijarConfig(v.g, v.id.c, { activo: 1 });
  v.g = Gr.fijarConfig(v.g, v.id.t, { "use-default": true });
  const texto = aTexto(v.g, CAT);
  const validar = new Ajv2020({ allErrors: true, strict: false }).compile(leerJson("docs/schema/qvi.schema.json"));
  assert.ok(validar(JSON.parse(texto)), JSON.stringify(validar.errors));
  const e = JSON.parse(texto)["block-diagram"].structures[0];
  assert.deepEqual(e.frames.map((f) => [f.match, f.default]), [[[0], true], [[{ min: 2, max: 4 }], undefined]]);
  const abierto = leer(texto, CAT);
  assert.equal(aTexto(abierto, CAT), texto);
  assert.deepEqual(Object.values(await ejecutar(compilar(abierto, CAT))), [7]);
});

// En LabVIEW, dos Wait en el mismo cuerpo se solapan: la vuelta dura lo que el
// más largo, no la suma. El cuerpo se parte en un subplan (DT-041).
test("dos esperas en el mismo cuerpo se solapan y lo de dentro ve i y el shift register", async () => {
  const v = construir((b) => {
    b.bucle("f", "for-loop");
    b.nodo("n", "const", { value: 4 });
    b.nodo("m1", "const", { value: 50 }, "f");
    b.nodo("w1", "wait-ms", null, "f");
    b.nodo("m2", "const", { value: 30 }, "f");
    b.nodo("w2", "wait-ms", null, "f");
    b.registro("sr", "f");
    b.nodo("cero", "const", { value: 0 });
    b.nodo("mas", "add", null, "f");
    b.nodo("total", "indicator");
    b.cable("n.result", "f:N.count");
    b.cable("m1.result", "w1.ms");
    b.cable("m2.result", "w2.ms");
    b.cable("cero.result", "sr.izq.init");
    b.cable("sr.izq.value", "mas.a");
    b.cable("f:i.i", "mas.b");
    b.cable("mas.result", "sr.der.value");
    b.cable("sr.der.result", "total.value");
  });
  const c = compilar(v.g, CAT);
  assert.equal(c.planes.length, 1, "el cuerpo va en un subplan");
  const t0 = performance.now();
  assert.deepEqual(await correr(v), { total: 0 + 1 + 2 + 3 });
  const t = performance.now() - t0;
  assert.ok(t >= 195 && t < 280, `4 vueltas de máx(50, 30) ms: ~200 ms, no 320 (${t} ms)`);
});

// ——— Flat y Stacked Sequence ———

// Medido en LabVIEW 2026 Q3 (labview-captures/structures/secuencia-*.png): en
// una Flat Sequence, lo que sale de un marco sale al acabar ese marco, no la
// secuencia; el marco siguiente empieza cuando acaba el anterior.
test("una flat sequence corre sus marcos en orden y lo que sale de un marco sale al acabarlo", async () => {
  const v = construir((b) => {
    b.bucle("s", "flat-sequence");
    b.marcos("s", [{ de: 0 }, {}, {}]);
    b.nodo("siete", "const", { value: 7 }, "s", 0);
    b.nodo("ms", "const", { value: 60 }, "s", 1);
    b.nodo("w", "wait-ms", null, "s", 1);
    b.nodo("mas", "increment", null, "s", 2);
    b.nodo("dentro", "indicator", null, "s", 2);
    b.tunel("t", "s", "out");
    b.nodo("fuera", "indicator");
    b.nodo("libre", "indicator");
    b.nodo("k", "const", { value: 1 });
    b.cable("ms.result", "w.ms");
    b.cable("siete.result", "mas.x");
    b.cable("mas.result", "dentro.value");
    b.cable("siete.result", "t.x");
    b.cable("t.y", "fuera.value");
    b.cable("k.result", "libre.value");
  });
  const c = compilar(v.g, CAT);
  assert.ok(!c.errores, JSON.stringify(c.errores));
  const nombre = Object.fromEntries(Object.entries(v.id).map(([k, x]) => [x, k]));
  const t0 = performance.now();
  const llegadas = [];
  await ejecutar(c, {}, { alEscribir: (n, x) => llegadas.push({ que: nombre[n], x, t: performance.now() - t0 }) });
  const de = (q) => llegadas.find((l) => l.que === q);
  assert.ok(de("libre").t < 30, "lo de fuera de la secuencia no la espera");
  assert.ok(de("fuera").t < 30, `lo que sale del marco 0 sale al acabar ese marco (${de("fuera").t} ms)`);
  assert.equal(de("fuera").x, 7);
  assert.ok(de("dentro").t >= 55, "el marco 2 empieza cuando acaba el 1, con su Wait");
  assert.equal(de("dentro").x, 8, "y recibe el dato del marco 0");
});

// La Stacked es un solo nodo: lo que sale, sale al acabar el último marco (ayuda de NI).
test("una stacked sequence da sus salidas al acabar", async () => {
  const v = construir((b) => {
    b.bucle("s", "stacked-sequence");
    b.marcos("s", [{ de: 0 }, {}]);
    b.nodo("siete", "const", { value: 7 }, "s", 0);
    b.nodo("ms", "const", { value: 60 }, "s", 1);
    b.nodo("w", "wait-ms", null, "s", 1);
    b.tunel("t", "s", "out");
    b.nodo("fuera", "indicator");
    b.cable("ms.result", "w.ms");
    b.cable("siete.result", "t.x");
    b.cable("t.y", "fuera.value");
  });
  const t0 = performance.now();
  let t = null;
  await ejecutar(compilar(v.g, CAT), {}, { alEscribir: () => (t = performance.now() - t0) });
  assert.ok(t >= 55, `${t} ms`);
});

test("un marco de una secuencia no pasa datos a uno anterior", () => {
  const v = construir((b) => {
    b.bucle("s", "flat-sequence");
    b.marcos("s", [{ de: 0 }, {}]);
    b.nodo("a", "const", { value: 1 }, "s", 1);
    b.nodo("b", "increment", null, "s", 0);
  });
  const r = Gr.conectar(v.g, CAT, { nodo: v.id.a, puerto: "result", dir: "out" }, { nodo: v.id.b, puerto: "x", dir: "in" });
  assert.match(r.motivo, /después/);
});

test("una secuencia se guarda con sus marcos y se abre igual", async () => {
  const v = construir((b) => {
    b.bucle("s", "stacked-sequence");
    b.marcos("s", [{ de: 0 }, {}, {}]);
    b.nodo("a", "const", { value: 4 }, "s", 0);
    b.nodo("b", "increment", null, "s", 2);
    b.tunel("t", "s", "out");
    b.nodo("r", "indicator");
    b.cable("a.result", "b.x");
    b.cable("b.result", "t.x");
    b.cable("t.y", "r.value");
  });
  const texto = aTexto(v.g, CAT);
  const validar = new Ajv2020({ allErrors: true, strict: false }).compile(leerJson("docs/schema/qvi.schema.json"));
  assert.ok(validar(JSON.parse(texto)), JSON.stringify(validar.errors));
  assert.equal(JSON.parse(texto)["block-diagram"].structures[0].frames.length, 3);
  const abierto = leer(texto, CAT);
  assert.equal(aTexto(abierto, CAT), texto);
  assert.deepEqual(Object.values(await ejecutar(compilar(abierto, CAT))), [5]);
});

// El ancho de cada marco de una Flat es presentación, y se guarda en el layout (`frame-widths`) para que el fichero se abra igual.
test("una flat sequence guarda el ancho de sus marcos y se abre igual", async () => {
  let g = Gr.crearEstructura(Gr.nuevo(), CAT, "flat-sequence", 40, 60, 293, 200);
  const id = g.id;
  g = Gr.fijarMarcos(g.g, CAT, id, [{ de: 0, ancho: 240 }, { ancho: 38 }]);
  const texto = aTexto(g, CAT);
  const validar = new Ajv2020({ allErrors: true, strict: false }).compile(leerJson("docs/schema/qvi.schema.json"));
  assert.ok(validar(JSON.parse(texto)), JSON.stringify(validar.errors));
  assert.deepEqual(Object.values(JSON.parse(texto).layout.diagram)[0]["frame-widths"], [240, 38]);
  const abierto = leer(texto, CAT);
  assert.equal(aTexto(abierto, CAT), texto);
  assert.deepEqual(abierto.nodos[0].config.marcos, [{ ancho: 240 }, { ancho: 38 }]);
  // Sin los anchos, el fichero sigue siendo válido y los marcos quedan sin ancho (el editor los reparte).
  const sin = JSON.parse(texto);
  delete Object.values(sin.layout.diagram)[0]["frame-widths"];
  assert.deepEqual(leer(JSON.stringify(sin), CAT).nodos[0].config.marcos, [{}, {}]);
});

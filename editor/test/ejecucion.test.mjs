// Cómo corre un VI (DT-040): por flujo de datos, con los indicadores escritos en
// el momento, las ramas independientes a la vez, Abort y Latch. Cada caso es un
// circuito construido igual en LabVIEW 2026 Q3 (labview-captures/run/), donde
// se midió lo que aquí se comprueba.

import assert from "node:assert/strict";
import { test } from "node:test";

import { compilar } from "../../nucleo/compilador.mjs";
import { ejecutar } from "../../nucleo/ejecutar.mjs";
import * as Gr from "../../nucleo/grafo.mjs";
import { CAT } from "./comun.mjs";

function vi(nodos, cables) {
  let g = Gr.nuevo();
  const id = {};
  for (const [nombre, bloque, config] of nodos) {
    const r = Gr.crearNodo(g, CAT, bloque, 0, 0);
    g = config ? Gr.fijarConfig(r.g, r.id, config) : r.g;
    id[nombre] = r.id;
  }
  for (const [de, a] of cables) {
    const [n1, p1] = de.split(".");
    const [n2, p2] = a.split(".");
    g = Gr.conectar(g, CAT, { nodo: id[n1], puerto: p1, dir: "out" }, { nodo: id[n2], puerto: p2, dir: "in" }).g;
  }
  return { g, id };
}

/** Ejecuta y apunta cuándo llega cada escritura, en ms desde el Run, por el nombre del indicador. */
async function cronometrar({ g, id }, valores = {}, opciones = {}) {
  const c = compilar(g, CAT);
  assert.ok(!c.errores, JSON.stringify(c.errores));
  const nombre = Object.fromEntries(Object.entries(id).map(([k, v]) => [v, k]));
  const t0 = performance.now();
  const llegadas = [];
  const fin = ejecutar(c, valores, { ...opciones, alEscribir: (nodo, v) => llegadas.push({ que: nombre[nodo], v, t: performance.now() - t0 }) });
  return { c, fin, llegadas, t0 };
}

// En LabVIEW, un Wait de 1000 y otro de 2000 en ramas distintas acaban a 1 s y
// a 2 s, y lo que no depende de ellos sale al empezar (run/r4.png).
test("las ramas independientes corren a la vez y cada indicador se escribe cuando le llega el dato", async () => {
  const circuito = vi(
    [["k1", "const", { value: 60 }], ["w1", "wait-ms"], ["a", "indicator"],
     ["k2", "const", { value: 120 }], ["w2", "wait-ms"], ["b", "indicator"],
     ["k3", "const", { value: 7 }], ["c", "indicator"]],
    [["k1.result", "w1.ms"], ["w1.result", "a.value"], ["k2.result", "w2.ms"], ["w2.result", "b.value"], ["k3.result", "c.value"]],
  );
  const { fin, llegadas, t0 } = await cronometrar(circuito);
  await fin;
  const total = performance.now() - t0;
  assert.deepEqual(llegadas.map((l) => l.que), ["c", "a", "b"]);
  const [c, a, b] = llegadas;
  assert.ok(c.t < 20, `c sale al empezar (${c.t} ms)`);
  assert.ok(a.t >= 55 && a.t < 110, `a, tras su Wait de 60 (${a.t} ms)`);
  assert.ok(b.t >= 115 && b.t < 180, `b, tras su Wait de 120 (${b.t} ms)`);
  assert.ok(total < 180, `las dos esperas se solapan: ${total} ms, no 180`);
  // La salida de Wait es el reloj de milisegundos: la de b va unos 60 ms detrás de la de a.
  assert.ok(Math.abs(b.v - a.v - 60) < 25, `${b.v} - ${a.v}`);
});

test("lo que depende de una espera espera, y dos esperas en cadena se suman", async () => {
  // w2 recibe su tiempo de w1 (w1.result * 0 + 50): no puede empezar antes de que w1 acabe.
  const circuito = vi(
    [["k1", "const", { value: 50 }], ["w1", "wait-ms"], ["cero", "const", { value: 0 }], ["m", "mul"], ["k2", "const", { value: 50 }], ["s", "add"], ["w2", "wait-ms"], ["r", "indicator"]],
    [["k1.result", "w1.ms"], ["w1.result", "m.a"], ["cero.result", "m.b"], ["m.result", "s.a"], ["k2.result", "s.b"], ["s.result", "w2.ms"], ["w2.result", "r.value"]],
  );
  const { fin, llegadas } = await cronometrar(circuito);
  await fin;
  assert.equal(llegadas.length, 1);
  assert.ok(llegadas[0].t >= 95, `r, tras 50 + 50 ms (${llegadas[0].t} ms)`);
});

test("el diagrama se parte en clumps: uno por espera y los instantáneos según de qué esperas dependen", () => {
  const { g } = vi(
    [["k1", "const", { value: 10 }], ["w1", "wait-ms"], ["a", "indicator"], ["k3", "const", { value: 7 }], ["c", "indicator"]],
    [["k1.result", "w1.ms"], ["w1.result", "a.value"], ["k3.result", "c.value"]],
  );
  const { clumps } = compilar(g, CAT);
  // [las constantes y c] → [w1] → [a]
  assert.deepEqual(clumps, [{ deps: [], largo: false }, { deps: [0], largo: true }, { deps: [1], largo: false }]);
  // Sin esperas, todo es un clump: el VI corre de un tirón, sin suspenderse.
  const quieto = vi([["k", "const", { value: 1 }], ["r", "indicator"]], [["k.result", "r.value"]]);
  assert.deepEqual(compilar(quieto.g, CAT).clumps, [{ deps: [], largo: false }]);
});

// En LabVIEW, Abort para el VI en el acto aunque esté a mitad de un Wait, y lo
// que aún no se había escrito no se escribe (run/r3.png).
test("abort para el vi a mitad de una espera y no escribe lo que faltaba", async () => {
  const circuito = vi(
    [["k", "const", { value: 2000 }], ["w", "wait-ms"], ["a", "indicator"], ["k2", "const", { value: 3 }], ["b", "indicator"]],
    [["k.result", "w.ms"], ["w.result", "a.value"], ["k2.result", "b.value"]],
  );
  const parar = new AbortController();
  const { fin, llegadas, t0 } = await cronometrar(circuito, {}, { senal: parar.signal });
  setTimeout(() => parar.abort(), 30);
  await assert.rejects(fin, (e) => e.abortado === true);
  assert.ok(performance.now() - t0 < 200, "para en el acto, no a los 2 s");
  assert.deepEqual(llegadas.map((l) => l.que), ["b"]);
});

// En LabVIEW, el Stop (Latch When Released) vuelve solo a FALSE cuando el
// diagrama lo lee (run/r2.png). Un interruptor (Switch) se queda como está.
test("un control latch vuelve a false cuando el diagrama lo lee y uno switch no", async () => {
  const { g, id } = vi(
    [["stop", "bool-control", { mechanical: "latch-when-released" }], ["sw", "bool-control"], ["a", "bool-indicator"], ["b", "bool-indicator"]],
    [["stop.result", "a.value"], ["sw.result", "b.value"]],
  );
  const c = compilar(g, CAT);
  const valores = { [id.stop]: true, [id.sw]: true };
  const soltados = [];
  const escritos = await ejecutar(c, valores, { alSoltar: (n) => soltados.push(n) });
  assert.deepEqual(escritos, { [id.a]: true, [id.b]: true }, "el diagrama lee TRUE");
  assert.equal(valores[id.stop], false, "y el latch vuelve a FALSE");
  assert.equal(valores[id.sw], true);
  assert.deepEqual(soltados, [id.stop]);
});

test("un control sin entradas se lee al empezar: cambiarlo durante una espera no cuenta, como un control fuera de un bucle en labview", async () => {
  // El control entra en una suma con la salida del Wait: se lee después de la espera.
  const { g, id } = vi(
    [["k", "const", { value: 40 }], ["w", "wait-ms"], ["cero", "const", { value: 0 }], ["m", "mul"], ["x", "control"], ["s", "add"], ["r", "indicator"]],
    [["k.result", "w.ms"], ["w.result", "m.a"], ["cero.result", "m.b"], ["m.result", "s.a"], ["x.result", "s.b"], ["s.result", "r.value"]],
  );
  const c = compilar(g, CAT);
  const valores = { [id.x]: 1 };
  setTimeout(() => (valores[id.x] = 5), 10);
  const escritos = await ejecutar(c, valores);
  // Un control sin entradas está en el primer clump: LabVIEW lo lee al empezar, no tras la espera.
  assert.equal(escritos[id.r], 1);
});

// front-panel/boolean-menu-mechanical-action.png: Stop, OK y Cancel nacen con
// Latch When Released; el resto, con Switch When Pressed.
test("un stop puesto en el panel nace latch y lo que no es botón nace switch", () => {
  const poner = (style) => {
    const r = Gr.crearEnPanel(Gr.nuevo(), CAT, "bool-control", 0, 0, "Boolean", { style });
    return r.g.nodos[0].config.mechanical;
  };
  for (const s of ["stop-button", "ok-button", "cancel-button"]) assert.equal(poner(s), "latch-when-released", s);
  for (const s of ["push-button", "slide-switch"]) assert.equal(poner(s), "switch-when-pressed", s);
  // Elegida a mano, se respeta.
  const r = Gr.crearEnPanel(Gr.nuevo(), CAT, "bool-control", 0, 0, "Boolean", { style: "stop-button", mechanical: "switch-when-pressed" });
  assert.equal(r.g.nodos[0].config.mechanical, "switch-when-pressed");
});

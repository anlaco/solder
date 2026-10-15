// What the diagram paints: wire routes, the terminal view, tips and
// right-click menus, against the LabVIEW video
// (labview-captures/block-diagram/numeric-*). No browser needed: diagram-view.mjs
// returns HTML.

import assert from "node:assert/strict";
import { test } from "node:test";

import { COLORES } from "../../core/model/types.mjs";
import * as D from "../../editor/src/block-diagram/diagram-view.mjs";
import * as ED from "../../editor/src/block-diagram/diagram-editing.mjs";
import * as Gr from "../../core/model/graph.mjs";
import { conectar, crearNodo, nuevo, tipos } from "../../core/model/graph.mjs";
import { idsPintados } from "../../editor/src/window/window-view.mjs";
import { CAT, INV } from "../helpers.mjs";

const CTX = D.contexto(CAT, D.glifosPorBloque(INV), ",");

function con(...bloques) {
  let g = nuevo();
  const ids = [];
  for (const b of bloques) {
    const r = crearNodo(g, CAT, b, 60 * ids.length, 0);
    g = r.g;
    ids.push(r.id);
  }
  return { g, ids };
}

test("un cable sale y entra en horizontal y gira en sus codos", () => {
  const a = { x: 0, y: 10 };
  const b = { x: 100, y: 50 };
  assert.deepEqual(D.ruta(a, b, [60]), [[0, 10], [60, 10], [60, 50], [100, 50]]);
  assert.deepEqual(D.ruta(a, b, [30, 80, 70]), [[0, 10], [30, 10], [30, 80], [70, 80], [70, 50], [100, 50]]);
  assert.equal(D.codosPorDefecto(a, b).length, 1);
  assert.equal(D.codosPorDefecto(b, a).length, 3, "si la entrada queda detrás, rodea");
});

// Vista de terminales, de numeric-vista-terminales.png: la x naranja (DBL), la
// y azul porque le llega un I32, y la salida naranja.
test("la vista de terminales colorea cada terminal con su tipo", () => {
  let { g, ids } = con("const", "num-const", "add");
  const [dbl, i32, add] = ids;
  g = conectar(g, CAT, { nodo: dbl, puerto: "result", dir: "out" }, { nodo: add, puerto: "a", dir: "in" }).g;
  g = conectar(g, CAT, { nodo: i32, puerto: "result", dir: "out" }, { nodo: add, puerto: "b", dir: "in" }).g;
  let d = { ...ED.inicial(), g };
  const sin = D.contenido(d, CTX, tipos(g, CAT));
  assert.doesNotMatch(sin, /vista-terminales/);
  d = ED.orden(ED.abrirMenu(d, "context.function", add, 0, 0), "context.function.visible-items.terminals");
  const html = D.contenido(d, CTX, tipos(d.g, CAT));
  const vista = html.match(/<svg class="vista-terminales"[\s\S]*?<\/svg>/)[0];
  const colores = [...vista.matchAll(/<rect [^>]*fill="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(colores, [COLORES.flotante, COLORES.entero, COLORES.flotante], "x, y y x+y");
  assert.match(vista, /clipPath[\s\S]*polygon points="0,0 /, "recortada con la forma del triángulo");
  assert.match(html, /class="coercion"/, "la y lleva su cuña de coerción");
});

test("las pistas enseñan los terminales sin cablear y el que está bajo el ratón", () => {
  let { g, ids } = con("const", "add");
  g = conectar(g, CAT, { nodo: ids[0], puerto: "result", dir: "out" }, { nodo: ids[1], puerto: "a", dir: "in" }).g;
  const pistas = (sobre) => (D.contenido({ ...ED.inicial(), g, sobre }, CTX, tipos(g, CAT)).match(/class="pista"/g) ?? []).length;
  assert.equal(pistas({ nodo: ids[1] }), 2, "y y x+y; x ya tiene cable");
  assert.equal(pistas({ nodo: ids[1], puerto: "a" }), 3, "el terminal bajo el ratón, aunque esté cableado");
  assert.equal(pistas(null), 0);
});

test("el cable que se tira va punteado en horizontal y luego en vertical", () => {
  const { g, ids } = con("const");
  const d = { ...ED.inicial(), g, accion: { tipo: "cablear", desde: { nodo: ids[0], puerto: "result", dir: "out" }, x: 120, y: 80 } };
  const html = D.contenido(d, CTX, tipos(g, CAT));
  const [, pts] = html.match(/class="cable-tirando" points="([^"]+)"/);
  const p = pts.split(" ").map((s) => s.split(",").map(Number));
  assert.equal(p.length, 3);
  assert.equal(p[0][1], p[1][1], "primero en horizontal");
  assert.deepEqual(p[2], [120, 80], "y acaba en el ratón");
});

test("una constante crece con su texto", () => {
  const { g, ids } = con("num-const");
  const n = g.nodos[0];
  const corto = D.caja(n, CTX).ancho;
  const largo = D.caja(n, CTX, { nodo: ids[0], texto: "43,3" }).ancho;
  assert.ok(largo > corto);
  assert.ok(Math.abs(largo - 26) <= 3, `«43,3» mide ${largo}; en el vídeo, 26`);
});

test("el menú de una función pinta lo declarado en su orden", () => {
  const html = D.menuContextual(INV, { raiz: "context.function", x: 0, y: 0, abierto: "context.function.visible-items" });
  const pintados = idsPintados(html);
  // Disable Breakpoint only appears in the menu of something that has a breakpoint.
  const esperado = [...INV.hijos("context.function"), ...INV.hijos("context.function.visible-items")].map((e) => e.id).filter((id) => !id.endsWith(".disable-breakpoint"));
  assert.deepEqual([...pintados].sort(), [...esperado].sort());
  assert.deepEqual(pintados.slice(0, INV.hijos("context.function").length - 1), INV.hijos("context.function").map((e) => e.id).filter((id) => !id.endsWith(".disable-breakpoint")));
  assert.equal((html.match(/separador-menu/g) ?? []).length, 5, "los separadores de numeric-menu-funcion.png");
  assert.match(html, /class="item-menu" data-id="context\.function\.visible-items\.terminals"/, "Terminals está hecho");
  assert.match(html, /class="item-menu hueco" data-id="context\.function\.visible-items\.label"/);
});

// numeric-menu-constante.png: el menú de la constante es más ancho que el de
// Add (334 px del vídeo frente a 246) porque «Change to Shared Variable Node»
// es más largo; el texto no se sale.
test("un menú se ajusta a su texto más largo", () => {
  const ancho = (raiz) => Number(D.menuContextual(INV, { raiz, x: 0, y: 0 }).match(/width:([\d.]+)px/)[1]);
  const [funcion, constante] = [ancho("context.function"), ancho("context.numeric-constant")];
  assert.ok(Math.abs(funcion - 246 / 1.5) <= 8, `el de Add mide ${funcion}; en el vídeo, 164`);
  assert.ok(Math.abs(constante - 334 / 1.5) <= 10, `el de la constante mide ${constante}; en el vídeo, 223`);
});

// A menu near the edges of the window, as LabVIEW's near the edges of the screen (reports/2026-10-15-editor-wide.md Q2).
test("a menu that does not fit below moves up, one that does not fit on the right opens to the left of the click", () => {
  const SIZE = { width: 165, height: 296 };
  const SCREEN = { width: 1920, height: 1032 };
  assert.deepEqual(D.placeMenu({ x: 1600, y: 480 }, SIZE, SCREEN), { x: 1600, y: 480 }, "where it fits, at the click");
  assert.deepEqual(D.placeMenu({ x: 900, y: 980 }, SIZE, SCREEN), { x: 900, y: 734 }, "its bottom 2 px above the edge, wherever the click was");
  assert.deepEqual(D.placeMenu({ x: 900, y: 800 }, SIZE, SCREEN), { x: 900, y: 734 });
  assert.deepEqual(D.placeMenu({ x: 1800, y: 480 }, SIZE, SCREEN), { x: 1633, y: 480 }, "its right edge 2 px left of the click");
  assert.deepEqual(D.placeMenu({ x: 10, y: 10 }, { width: 100, height: 2000 }, SCREEN), { x: 10, y: 0 }, "taller than the window: from its top");
  // Submenus: Create ▸ (188 x 127) and the Numeric Palette ▸ grid (302 x 364) of the measured menus.
  assert.deepEqual(D.placeSubmenu({ x: 1200, y: 885, width: 165 }, { width: 188, height: 127 }, SCREEN), { x: 1360, y: 885 }, "on the right, 5 px over the menu");
  assert.deepEqual(D.placeSubmenu({ x: 1633, y: 629, width: 165 }, { width: 188, height: 127 }, SCREEN), { x: 1450, y: 629 }, "on the left at the right edge");
  assert.deepEqual(D.placeSubmenu({ x: 1200, y: 872, width: 165 }, { width: 302, height: 364 }, SCREEN, true), { x: 1360, y: 662 }, "a grid keeps 6 px at the bottom");
});

test("an open submenu follows its menu when the menu moves up", () => {
  const menu = { raiz: "context.function", x: 0, y: 0, abierto: "context.function.visible-items" };
  const tops = (html) => [...html.matchAll(/class="menu-contextual" data-menu="[^"]+" style="left:([\d.]+)px;top:([\d.]+)px/g)].map((m) => Number(m[2]));
  const [rootFree, subFree] = tops(D.menuContextual(INV, menu));
  const [rootMoved, subMoved] = tops(D.menuContextual(INV, { ...menu, y: 590 }, new Set(), undefined, {}, { width: 800, height: 600 }));
  assert.ok(rootMoved < 590, "the menu moved up");
  assert.equal(Number((subMoved - rootMoved).toFixed(2)), Number((subFree - rootFree).toFixed(2)), "the submenu stays beside its row");
});

// numeric-terminales-icono.png y numeric-terminales.png (medidas a 1:1 en
// boolean-terminales-icono.png: 38 × 38, y boolean-terminal-compacto.png:
// 32 × 16): con View As Icon, el
// terminal enseña el control en pequeño; sin ella, una caja compacta con DBL.
// El cable entra o sale por la flecha. numeric-menu-control.png y
// numeric-menu-indicador.png: sus menús, con View As Icon marcada.
test("los terminales del panel se ven como icono o compactos", () => {
  const { g, ids } = con("control", "indicator");
  const [control, indicador] = g.nodos;
  assert.deepEqual([D.caja(control, CTX).ancho, D.caja(control, CTX).alto], [38, 38]);
  const t = D.terminales(control, CTX).find((k) => k.puerto === "result");
  assert.deepEqual([t.dir, t.x, t.y], ["out", control.x + 38, control.y + 19.5]);
  assert.equal(D.terminales(indicador, CTX).find((k) => k.puerto === "value").x, indicador.x, "el indicador recibe por la izquierda");
  assert.match(D.contenido({ ...ED.inicial(), g }, CTX, tipos(g, CAT)), />DBL</);

  assert.equal(D.menuDe(control), "context.numeric-control");
  assert.equal(D.menuDe(indicador), "context.numeric-indicator");
  let d = ED.abrirMenu({ ...ED.inicial(), g }, "context.numeric-control", ids[0], 0, 0);
  assert.ok(ED.marcados(d).has("context.numeric-control.view-as-icon"));
  const html = D.menuContextual(INV, d.menu, ED.marcados(d));
  assert.match(html, /class="item-menu marcado" data-id="context\.numeric-control\.view-as-icon"/, "View As Icon está hecha y marcada");
  assert.match(html, /class="item-menu hueco" data-id="context\.numeric-control\.change-to-indicator"/);
  assert.equal((html.match(/separador-menu/g) ?? []).length, 6, "los separadores de numeric-menu-control.png");

  d = ED.orden(d, "context.numeric-control.view-as-icon", CTX);
  const compacto = d.g.nodos[0];
  assert.deepEqual([D.caja(compacto, CTX).ancho, D.caja(compacto, CTX).alto], [32, 16]);
  assert.equal(D.terminales(compacto, CTX)[0].y, compacto.y + 8.5);
  assert.ok(!ED.marcados(ED.abrirMenu(d, "context.numeric-control", ids[0], 0, 0)).has("context.numeric-control.view-as-icon"));
});

// numeric-menu-control-representacion.png y numeric-menu-constante-
// representacion.png: no es una lista sino una rejilla de 4 columnas con los
// iconos de EXT a CSG; la representación actual lleva un marco azul.
test("representation se abre como una rejilla de iconos con la actual marcada", () => {
  const { g, ids } = con("control");
  let d = ED.abrirMenu({ ...ED.inicial(), g }, "context.numeric-control", ids[0], 0, 0);
  d = ED.sobreMenu(d, "context.numeric-control.representation", true);
  const html = D.menuContextual(INV, d.menu, ED.marcados(d));
  assert.match(html, /<div class="menu-contextual rejilla" data-menu="context\.numeric-control\.representation"/);
  const celdas = [...html.matchAll(/class="item-menu celda-rep([^"]*)" data-id="context\.numeric-control\.representation\.(\w+)" style="left:([\d.]+)px;top:([\d.]+)px"/g)];
  assert.deepEqual(celdas.map((c) => c[2]), ["ext", "dbl", "sgl", "fxp", "i64", "i32", "i16", "i8", "u64", "u32", "u16", "u8", "cxt", "cdb", "csg"], "el orden de LabVIEW");
  const R = D.MEDIDAS_REJILLA;
  assert.deepEqual(celdas.slice(0, 5).map((c) => [Number(c[3]), Number(c[4])]), [[10, 25], [58, 25], [106, 25], [154, 25], [10, 73]], "cuatro columnas, a 48 px");
  assert.deepEqual(celdas.filter((c) => c[1].includes("hueco")).map((c) => c[2]), ["ext", "fxp", "cxt", "cdb", "csg"], "lo que Solder no tiene va en gris");
  assert.deepEqual(celdas.filter((c) => c[1].includes("marcado")).map((c) => c[2]), ["dbl"]);
  assert.equal(html.slice(html.indexOf("menu-contextual rejilla")).match(/<svg/g).length, 15, "un icono por celda");
  assert.equal(R.caja, 32);
});

// boolean-terminales-icono.png, boolean-terminal-compacto.png y
// boolean-menu-control.png (diagrama): el terminal de un control booleano es
// verde, lleva «TF» y el dibujo del control; su menú tiene la rejilla de
// Mechanical Action y View As Icon.
test("el terminal de un control booleano se ve como icono o compacto y su menú cambia la acción mecánica", () => {
  let { g, ids } = con("bool-control", "bool-indicator");
  g = Gr.fijarConfig(g, ids[0], { style: "stop-button", mechanical: "latch-when-released" });
  g = Gr.fijarConfig(g, ids[1], { style: "square-led" });
  const [control, indicador] = g.nodos;
  const verde = `stroke="${COLORES.booleano}"`;
  let html = D.contenido({ ...ED.inicial(), g }, CTX, tipos(g, CAT));
  assert.equal((html.match(/>TF</g) ?? []).length, 2);
  assert.ok(html.includes(verde));
  assert.ok(html.includes(">STOP<"), "el terminal enseña el control en pequeño");
  assert.deepEqual([D.caja(control, CTX).ancho, D.caja(control, CTX).alto], [38, 38], "como el numérico");
  assert.equal(D.terminales(control, CTX).find((k) => k.puerto === "result").dir, "out");
  assert.equal(D.terminales(indicador, CTX).find((k) => k.puerto === "value").dir, "in");

  assert.equal(D.menuDe(control), "context.boolean-control-terminal");
  let d = ED.abrirMenu({ ...ED.inicial(), g }, "context.boolean-control-terminal", ids[0], 0, 0);
  assert.ok(ED.marcados(d).has("context.boolean-control-terminal.view-as-icon"));
  assert.ok(ED.marcados(d).has("context.boolean-control-terminal.mechanical-action.latch-when-released"));
  const lista = D.menuContextual(INV, d.menu, ED.marcados(d));
  assert.match(lista, /class="item-menu marcado" data-id="context\.boolean-control-terminal\.view-as-icon"/);
  assert.match(lista, /class="item-menu hueco" data-id="context\.boolean-control-terminal\.change-to-constant"/);
  assert.equal((lista.match(/separador-menu/g) ?? []).length, 5, "los separadores de boolean-menu-control.png");

  // La acción mecánica se cambia también desde aquí.
  d = ED.orden(d, "context.boolean-control-terminal.mechanical-action.switch-when-pressed", CTX);
  assert.equal(d.g.nodos[0].config.mechanical, "switch-when-pressed");

  // Sin View As Icon, la caja compacta con TF.
  d = ED.orden(ED.abrirMenu(d, "context.boolean-control-terminal", ids[0], 0, 0), "context.boolean-control-terminal.view-as-icon", CTX);
  html = D.contenido(d, CTX, tipos(d.g, CAT));
  assert.deepEqual([D.caja(d.g.nodos[0], CTX).ancho, D.caja(d.g.nodos[0], CTX).alto], [32, 16]);
  assert.ok(!html.includes(">STOP<") && html.includes(">TF<"));
});

// ——— While Loop y For Loop (M4): medidas de labview-captures/structures/ ———

const bucle = (tipo, x, y, ancho, alto) => {
  const r = Gr.crearEstructura(Gr.nuevo(), CAT, tipo, x, y, ancho, alto);
  return { g: ED.fijarBordes(r.g, CAT), id: r.id };
};
const hijoDe = (g, id, tipo) => g.nodos.find((n) => n.dentro === id && n.tipo === tipo);
const rect = (g, id) => {
  const k = D.caja(g.nodos.find((n) => n.id === id), CTX);
  return [k.x, k.y, k.ancho, k.alto];
};

// while-loop.png: 200 × 200 en (800, 400) con «i» en (810, 574) y la condición
// en (974, 574), cada una de 16 × 16; borde de 6 px #7f7f7f con las esquinas
// redondeadas y la marca de estirar abajo a la derecha.
test("un while loop se dibuja con las medidas de LabVIEW", () => {
  const { g, id } = bucle("while-loop", 800, 400, 200, 200);
  assert.deepEqual(rect(g, id), [800, 400, 200, 200]);
  assert.deepEqual(rect(g, hijoDe(g, id, "loop-iteration").id), [810, 574, 16, 16]);
  assert.deepEqual(rect(g, hijoDe(g, id, "loop-condition").id), [974, 574, 16, 16]);
  assert.equal(hijoDe(g, id, "loop-count"), undefined, "el While no tiene cuenta");
  const html = D.contenido({ ...ED.inicial(), g }, CTX, tipos(g, CAT));
  assert.match(html, /class="nodo estructura estructura-while"/);
  assert.match(html, /<svg class="marco-bucle" viewBox="0 0 200 200" width="200" height="200"/);
  assert.match(html, /M5,0 H196 V1 H197 V2 H199 V5 H200/, "la esquina redondeada, fila a fila");
  assert.match(html, /#7f7f7f/);
  // El interior no recibe el ratón: sólo las cuatro bandas del marco, de 6 px.
  assert.equal((html.match(/class="banda-estructura/g) ?? []).length, 4);
  assert.ok(!html.includes('data-asa="se"'), "sin seleccionar no hay asas");
  // «i» y la condición con su glifo; Continue if True cambia el de la condición.
  assert.match(html, /stroke="#0000ff" stroke-width="2"/);
  assert.match(html, /stroke="#007f00" stroke-width="1"/);
  assert.match(html, /fill="#ff0000"/, "Stop if True: el disco rojo");
  const continuar = Gr.fijarConfig(g, hijoDe(g, id, "loop-condition").id, { mode: "continue-if-true" });
  const html2 = D.contenido({ ...ED.inicial(), g: continuar }, CTX, tipos(continuar, CAT));
  assert.ok(!html2.includes('fill="#ff0000"') && html2.includes("M6,3h1v1h-1z"), "Continue if True: la flecha circular verde");
  // Con un clic, el tamaño mínimo (48 × 48): «i» y la condición se solapan 4 px (minimo-while.png).
  const mini = bucle("while-loop", 676, 676, 48, 48);
  const [i, c] = [rect(mini.g, hijoDe(mini.g, mini.id, "loop-iteration").id), rect(mini.g, hijoDe(mini.g, mini.id, "loop-condition").id)];
  assert.equal(i[0] + 16 - c[0], 4);
});

// for-loop.png: 300 × 200 en (1100, 400), con las tres hojas dentro de la caja,
// la «N» en la esquina y la «i» a 10 px de la izquierda y 26 del pie.
test("un for loop se dibuja en tres hojas con su cuenta", () => {
  const { g, id } = bucle("for-loop", 1100, 400, 300, 200);
  assert.deepEqual(rect(g, id), [1100, 400, 300, 200]);
  assert.deepEqual(rect(g, hijoDe(g, id, "loop-count").id), [1100, 400, 16, 16]);
  assert.deepEqual(rect(g, hijoDe(g, id, "loop-iteration").id), [1110, 574, 16, 16]);
  assert.equal(hijoDe(g, id, "loop-condition"), undefined, "el For no tiene condición");
  const html = D.contenido({ ...ED.inicial(), g }, CTX, tipos(g, CAT));
  assert.match(html, /class="nodo estructura estructura-for"/);
  assert.equal((html.match(/<rect x="[0-9.]+" y="[0-9.]+" width="295" height="195" fill="#fff" stroke="#000"/g) ?? []).length, 2, "dos hojas detrás");
  assert.match(html, /M0\.5,0\.5 H295\.5 V188\.5 L288\.5,195\.5 H0\.5 Z/, "la delantera, con el doblez");
  assert.equal(D.menuDe(g.nodos.find((n) => n.id === id)), "context.for-loop");
});

// shift-register.png y tunel-*.png: 16 × 12 pegados a los lados con las flechas
// ▼ y ▲, y túneles de 9 × 9 del color de su tipo, del ancho del borde.
test("los túneles y los shift registers se dibujan en el borde con el color de su tipo", () => {
  let { g, id } = bucle("while-loop", 800, 400, 200, 200);
  const sr = Gr.crearRegistro(g, CAT, id, 494);
  g = ED.fijarBordes(sr.g, CAT);
  assert.deepEqual(rect(g, sr.izquierdo), [800, 494, 16, 12]);
  assert.deepEqual(rect(g, sr.derecho), [984, 494, 16, 12]);
  // Un I32 de fuera a un Add de dentro pasa por un túnel de entrada azul; el Add, a otro de salida.
  const k = Gr.crearNodo(g, CAT, "num-const", 700, 440);
  const a = Gr.crearNodo(k.g, CAT, "add", 880, 440);
  g = Gr.meter(a.g, CAT, [a.id], id);
  g = Gr.fijarValor(g, k.id, 3, "i32");
  const c1 = Gr.conectarCruzando(g, CAT, { nodo: k.id, puerto: "result", dir: "out" }, { nodo: a.id, puerto: "a", dir: "in" });
  assert.ok(!c1.motivo, c1.motivo);
  g = ED.fijarBordes(c1.g, CAT);
  const t = g.nodos.find((n) => n.tipo === "tunnel-in");
  assert.deepEqual([rect(g, t.id)[0], rect(g, t.id)[2], rect(g, t.id)[3]], [800, 9, 9], "el de entrada, pegado al lado izquierdo");
  const salida = Gr.crearTunel(g, CAT, id, "out", 446);
  g = ED.fijarBordes(salida.g, CAT);
  assert.deepEqual(rect(g, salida.id).slice(0, 1), [991], "el de salida, a 9 px del lado derecho");
  const html = D.contenido({ ...ED.inicial(), g }, CTX, tipos(g, CAT));
  assert.ok(html.includes(`width="9" height="9"`) && html.includes(`fill="${COLORES.entero}" stroke="#4c4c3d"`), "el túnel lleva el color del I32");
  assert.match(html, /points="2\.5,4 13\.5,4 8,9\.5"/, "la flecha ▼ del shift register de la izquierda");
  assert.match(html, /points="2\.5,8 13\.5,8 8,2\.5"/, "la flecha ▲ del de la derecha");
  // Un túnel tiene un puerto a cada lado del borde: entra por la izquierda y sale por la derecha.
  const ts = D.terminales(t, CTX);
  assert.deepEqual(ts.map((p) => [p.puerto, p.dir]), [["x", "in"], ["y", "out"]]);
  assert.ok(ts[0].x < ts[1].x);
});

// seleccion.png: el tinte f5f5fc, el contorno de trazos y ocho asas de 6 × 6.
test("una estructura seleccionada enseña sus ocho asas", () => {
  const { g, id } = bucle("while-loop", 800, 400, 200, 200);
  const html = D.contenido({ ...ED.inicial(), g, seleccion: [id] }, CTX, tipos(g, CAT));
  assert.deepEqual([...html.matchAll(/data-asa="(\w+)"/g)].map((m) => m[1]), D.ASAS);
  assert.match(html, /class="tinte-estructura"/);
  const k = D.caja(g.nodos.find((n) => n.id === id), CTX);
  assert.deepEqual(D.cajaAsa("nw", k), { x: 0, y: 0, ancho: 6, alto: 6 });
  assert.deepEqual(D.cajaAsa("se", k), { x: 194, y: 194, ancho: 6, alto: 6 });
  assert.deepEqual(D.cajaAsa("n", k), { x: 97, y: 0, ancho: 6, alto: 6 });
  // Rodear la estructura con un rectángulo la elige; tocar sólo su interior, no.
  assert.deepEqual(D.dentroDe(g, CTX, { x0: 790, y0: 390, x1: 1010, y1: 610 }).includes(id), true);
  assert.equal(D.dentroDe(g, CTX, { x0: 850, y0: 450, x1: 900, y1: 500 }).includes(id), false);
});

// ——— Case Structure (M4): case-1.png, case-3.png, case-5.png y case-7.png a 1:1 ———

/** El ancho de cada texto del selector de marcos, tal como lo mide Segoe UI en la ventana (con el selector medido a 17 px de sobra). */
const MEDIDOS = { False: 27.5, True: 25.5, "0, Default": 51.5, 1: 6.4, "7, 9": 19 };
const CTX_MEDIDO = D.contexto(CAT, D.glifosPorBloque(INV), ",", (t) => MEDIDOS[t] ?? t.length * 6.2);

// case-1.png: 300 × 250 en (800, 400): marco de 6 px —1 de línea y 5 de trama de
// puntos—, el selector «?» de 8 × 12 con su base en la mitad del lado izquierdo,
// y el selector de marcos de 63 × 17 centrado en el borde de arriba.
test("un case se dibuja con las medidas de LabVIEW", () => {
  const { g, id } = bucle("case-structure", 800, 400, 300, 250);
  assert.deepEqual(rect(g, id), [800, 400, 300, 250]);
  assert.deepEqual(rect(g, hijoDe(g, id, "case-selector").id), [800, 513, 8, 12]);
  const html = D.contenido({ ...ED.inicial(), g }, CTX_MEDIDO, tipos(g, CAT));
  assert.match(html, /class="nodo estructura estructura-case"/);
  assert.match(html, /<svg class="marco-bucle" viewBox="0 0 300 250" width="300" height="250"/);
  // La trama empieza en (1, 1), de 4 × 4, con los píxeles negros medidos fila a fila.
  assert.match(html, /<pattern id="trama-case" patternUnits="userSpaceOnUse" x="1" y="1" width="4" height="4"><path d="M0,0h1v1h-1zM3,0h1v1h-1zM1,1h1v1h-1zM2,1h1v1h-1zM0,2h1v1h-1zM2,2h1v1h-1zM1,3h1v1h-1zM3,3h1v1h-1z"/);
  assert.match(html, /M1,1 H299 V249 H1 Z M6,6 V244 H294 V6 Z/, "5 px de trama dentro de la línea de 1 px");
  assert.equal((html.match(/class="banda-estructura/g) ?? []).length, 4);
  // El selector de marcos: 45 de texto + 18, a (918, 400) —centrado— y con las cuatro zonas que se pulsan.
  const m = D.medidasSelector(g.nodos.find((n) => n.id === id), CTX_MEDIDO);
  assert.deepEqual([m.texto, m.ancho, m.x], [45, 63, 118]);
  assert.match(html, /<div class="selector-de-marcos" style="left:118px;top:0"><svg class="selector-marcos" viewBox="0 0 63 17" width="63" height="17"/);
  assert.deepEqual([...html.matchAll(/data-zona="(\w+)"/g)].map((k) => k[1]), ["anterior", "texto", "lista", "siguiente"]);
  assert.match(html, /<text x="12" y="13" class="texto-selector">True<\/text>/, "se ve True, con el texto a 4 px del divisor");
  // El cuerpo: líneas de 1 px y divisores a 8 y a 54; la flecha izquierda con su punta en x = 1 y la derecha en 61.
  assert.match(html, /M0,0h63v1h-63zM0,16h63v1h-63zM0,1h1v15h-1zM62,1h1v15h-1zM8,1h1v15h-1zM54,1h1v15h-1z/);
  assert.match(html, /M6,5h1v1h-1zM55,5h1v1h-1z/, "la primera fila de las flechas");
  assert.match(html, /M1,8h6v1h-6zM55,8h6v1h-6z/, "la fila de la punta: 6 de ancho");
  assert.match(html, /M45,6h7v1h-7z/, "el triángulo del desplegable: 7 de ancho en la primera fila");
});

// case-3.png y case-4.png: el selector crece con el texto más ancho de sus
// marcos, y se queda centrado; con «0, Default» mide 87 (69 de texto).
test("el selector de marcos de un case mide lo que en LabVIEW", () => {
  let { g, id } = bucle("case-structure", 800, 400, 300, 250);
  const medida = (g) => D.medidasSelector(g.nodos.find((n) => n.id === id), CTX_MEDIDO);
  g = Gr.fijarMarcos(g, CAT, id, [{ de: 0, valores: [0], default: true }, { de: 1, valores: [1] }]);
  assert.deepEqual([medida(g).texto, medida(g).ancho, medida(g).x], [69, 87, 106], "906 = 800 + 106, como en case-4.png");
  // Aunque se vea el «1», el ancho es el del más largo.
  g = Gr.fijarConfig(g, id, { activo: 1 });
  assert.equal(medida(g).ancho, 87);
  assert.equal(medida(g).actual, "1");
  // Mientras se escribe, cuenta lo escrito.
  assert.ok(D.medidasSelector(g.nodos.find((n) => n.id === id), CTX_MEDIDO, { nodo: id, marco: true, texto: "1, 2, 3, 4, 5, 6, 7", todo: false }).ancho > 87);
  // Los nombres que salen de los marcos.
  assert.deepEqual([{ valores: [0], default: true }, { valores: [{ min: 2, max: 4 }] }, { valores: [7, 9], default: true }, { valores: [false] }, { valores: [true] }, { valores: [] }, { valores: [{ max: 4 }] }, { default: true }].map(D.etiquetaMarco), ["0, Default", "2..4", "7, 9, Default", "False", "True", "", "..4", "Default"]);
});

// case-1.png, case-3.png, case-5.png y case-7.png: el selector es verde sin
// cablear y azul con un entero; el túnel de salida, hueco, relleno o con punto.
test("el terminal selector y los túneles de un case llevan el color de su tipo", () => {
  let { g, id } = bucle("case-structure", 800, 400, 300, 250);
  let html = D.contenido({ ...ED.inicial(), g }, CTX_MEDIDO, tipos(g, CAT));
  const terminal = /<svg class="terminal-selector" viewBox="0 0 8 12" width="8" height="12"[^>]*><rect x="0\.5" y="0\.5" width="7" height="11" fill="#ffffcc" stroke="(#[0-9a-f]+)"/;
  assert.equal(html.match(terminal)[1], COLORES.booleano);
  // Los píxeles de la «?».
  assert.match(html, /M3,2h1v1h-1zM4,2h1v1h-1zM2,3h1v1h-1zM5,3h1v1h-1zM5,4h1v1h-1zM4,5h1v1h-1zM3,6h1v1h-1zM3,7h1v1h-1zM3,9h1v1h-1z/);
  const k = crearNodo(g, CAT, "num-const", 700, 520);
  g = conectar(k.g, CAT, { nodo: k.id, puerto: "result", dir: "out" }, { nodo: hijoDe(k.g, id, "case-selector").id, puerto: "selector", dir: "in" }).g;
  html = D.contenido({ ...ED.inicial(), g }, CTX_MEDIDO, tipos(g, CAT));
  assert.equal(html.match(terminal)[1], COLORES.entero);

  // Túnel de salida: una entrada por marco, todas en el mismo punto (el túnel mide 9 × 9).
  const t = Gr.crearTunel(g, CAT, id, "out", 516);
  g = ED.fijarBordes(t.g, CAT);
  assert.equal(g.nodos.find((n) => n.id === t.id).tipo, "case-tunnel-out");
  assert.deepEqual(rect(g, t.id), [1091, 516, 9, 9]);
  const ts = D.terminales(g.nodos.find((n) => n.id === t.id), CTX_MEDIDO);
  assert.deepEqual(ts.filter((p) => p.dir === "in").map((p) => [p.puerto, p.y]), [["x-0", 520.5], ["x-1", 520.5]]);
  // Hueco: anillo del color y 5 × 5 blancos; con Use Default, relleno con un cuadrito de 3 × 3 y un punto.
  const sinCablear = D.contenido({ ...ED.inicial(), g }, CTX_MEDIDO, tipos(g, CAT));
  assert.match(sinCablear, /class="tunel"[^>]*><rect[^>]*stroke="#4c4c3d"[^>]*\/><rect x="2" y="2" width="5" height="5" fill="#fff"\/>/);
  g = Gr.fijarConfig(g, t.id, { "use-default": true });
  assert.match(D.contenido({ ...ED.inicial(), g }, CTX_MEDIDO, tipos(g, CAT)), /<rect x="3" y="3" width="3" height="3" fill="#fff"\/><rect x="4" y="4" width="1" height="1" fill="#[0-9a-f]+"\/>/);
});

// ——— Flat y Stacked Sequence (M4): secuencia-2.png, secuencia-3.png, secuencia-8.png y secuencia-15.png a 1:1 ———

const secuencia = (tipo, x, y, ancho, alto, marcos) => {
  let g = Gr.crearEstructura(Gr.nuevo(), CAT, tipo, x, y, ancho, alto);
  const id = g.id;
  g = marcos ? Gr.fijarMarcos(g.g, CAT, id, marcos) : g.g;
  return { g: ED.fijarBordes(g, CAT), id };
};

// secuencia-2.png: 250 × 200 en (850, 450). Borde de película #e2e2e2 de 5 px a los lados y 9 arriba y abajo,
// líneas negras de 1 px, un marco de 240 × 182 con su borde de 1 px y agujeros de 6 × 6 cada 12 px.
test("una flat sequence se dibuja con las medidas de LabVIEW", () => {
  const { g, id } = secuencia("flat-sequence", 850, 450, 250, 200);
  assert.deepEqual(rect(g, id), [850, 450, 250, 200]);
  const html = D.contenido({ ...ED.inicial(), g }, CTX, tipos(g, CAT));
  assert.match(html, /class="nodo estructura estructura-flat"/);
  assert.match(html, /<svg class="marco-bucle" viewBox="0 0 250 200" width="250" height="200"/);
  assert.match(html, /<path d="M0,1h250v198h-250zM5,9h240v182h-240z" fill="#e2e2e2" fill-rule="evenodd"\/>/, "gris con el marco recortado");
  assert.match(html, /M0,0h250v1h-250zM0,199h250v1h-250z/, "las líneas de arriba y de abajo");
  assert.match(html, /<rect x="5\.5" y="9\.5" width="239" height="181" fill="none" stroke="#000"/, "el marco, de 240 × 182 con su borde");
  // Los agujeros: el primero entero a 9 px de la esquina y el último, a 237 (1087 - 850); en las dos bandas.
  const agujeros = [...html.matchAll(/<rect x="(-?[\d.]+)" y="([\d.]+)" width="5" height="5" fill="#fff"/g)].map((m) => [Number(m[1]), Number(m[2])]);
  assert.deepEqual(agujeros.slice(0, 2), [[-2.5, 2.5], [-2.5, 192.5]], "uno recortado a la izquierda, por arriba y por abajo");
  assert.ok(agujeros.some(([x, y]) => x === 9.5 && y === 2.5) && agujeros.some(([x, y]) => x === 237.5 && y === 192.5));
  assert.equal(agujeros.length, 44, "22 posiciones en cada banda, las de los extremos recortadas");
  // El zigzag de los lados: dos filas dentro (x = 1) desde la fila 10 y dos fuera, espejado a la derecha.
  assert.match(html, /M1,10h1v2h-1zM248,10h1v2h-1zM0,12h1v2h-1zM249,12h1v2h-1z/);
  // Se agarra por las cuatro bandas: 9 arriba y abajo, 5 a los lados.
  assert.equal((html.match(/class="banda-estructura/g) ?? []).length, 4);
  assert.match(html, /class="banda-estructura b-n" style="left:0px;top:0px;width:250px;height:9px"/);
  assert.match(html, /class="banda-estructura b-w" style="left:0px;top:0px;width:5px;height:200px"/);
});

// secuencia-3.png: con un marco más, 293 de ancho: el marco de 240 acaba en x = 1094, 5 px de separador y el nuevo, de 38.
test("los marcos de una flat sequence van uno al lado del otro con su separador", () => {
  const { g, id } = secuencia("flat-sequence", 850, 450, 293, 200, [{ de: 0, ancho: 240 }, { ancho: 38 }]);
  const html = D.contenido({ ...ED.inicial(), g }, CTX, tipos(g, CAT));
  assert.match(html, /M0,1h293v198h-293zM5,9h240v182h-240zM250,9h38v182h-38z/);
  assert.match(html, /<rect x="250\.5" y="9\.5" width="37" height="181"/);
  assert.equal((html.match(/class="banda-estructura/g) ?? []).length, 5, "y el separador entre los dos, de 5 px");
  assert.match(html, /class="banda-estructura b-m" style="left:245px;top:0px;width:5px;height:200px"/);
  assert.match(html, /x="285\.5" y="2\.5" width="5" height="5"/, "el último agujero, a 1135 - 850");
  // Sin anchos guardados, los marcos se reparten el espacio por igual.
  const sin = secuencia("flat-sequence", 0, 0, 293, 200, [{ de: 0 }, {}]);
  assert.deepEqual(D.anchosMarcos(sin.g.nodos[0]), [139, 139]);
  // Seleccionada, cada marco se tiñe por dentro (secuencia-seleccion.png).
  const elegida = D.contenido({ ...ED.inicial(), g, seleccion: [id] }, CTX, tipos(g, CAT));
  assert.equal((elegida.match(/class="tinte-estructura" style="left:(6|251)px;top:10px;width:(238|36)px;height:180px"/g) ?? []).length, 2);
});

// secuencia-15.png: el cable que cruza de un marco a otro lleva un túnel de 9 × 9 en el separador, a la altura del cable.
test("un cable entre marcos de una flat sequence cruza el separador por un túnel", () => {
  let { g, id } = secuencia("flat-sequence", 850, 450, 293, 200, [{ de: 0, ancho: 240 }, { ancho: 38 }]);
  const a = crearNodo(g, CAT, "const", 900, 540);
  const b = crearNodo(a.g, CAT, "increment", 1104, 540);
  g = Gr.meter(Gr.meter(b.g, CAT, [a.id], id, 0), CAT, [b.id], id, 1);
  g = conectar(g, CAT, { nodo: a.id, puerto: "result", dir: "out" }, { nodo: b.id, puerto: "x", dir: "in" }).g;
  const html = D.contenido({ ...ED.inicial(), g }, CTX, tipos(g, CAT));
  // El separador va de 1095 a 1099: su centro es 1097 y el túnel, de 9, empieza en 1093.
  const t = html.match(/<div class="tunel-secuencia" style="left:(\d+)px;top:(\d+)px"><svg class="tunel" viewBox="0 0 9 9"[^>]*><rect x="0\.5" y="0\.5" width="8" height="8" fill="(#[0-9a-f]+)" stroke="#4c4c3d"/);
  assert.ok(t, "hay un túnel");
  assert.equal(t[1], "1093");
  assert.equal(t[3], COLORES.flotante);
  const y = D.extremos(g, CTX).get(`${a.id}.result`).y;
  assert.equal(Number(t[2]), Math.floor(y) - 4, "centrado en el cable");
  // Un cable dentro de un marco no lo lleva.
  const c = crearNodo(g, CAT, "increment", 1000, 600);
  const g2 = conectar(Gr.meter(c.g, CAT, [c.id], id, 0), CAT, { nodo: a.id, puerto: "result", dir: "out" }, { nodo: c.id, puerto: "x", dir: "in" }).g;
  assert.ok(!D.contenido({ ...ED.inicial(), g: Gr.borrar(g2, [b.id]) }, CTX, tipos(g2, CAT)).includes("tunel-secuencia"));
});

// secuencia-8.png: una Stacked de 346 × 200 enseña un solo marco con su selector «0 [0..1]» (72 × 17), centrado arriba.
test("una stacked sequence se dibuja con su selector y sus variables locales", () => {
  let { g, id } = secuencia("stacked-sequence", 850, 450, 346, 200, [{ de: 0 }, {}]);
  const a = crearNodo(g, CAT, "const", 900, 540);
  const b = crearNodo(a.g, CAT, "increment", 1004, 540);
  g = Gr.meter(Gr.meter(b.g, CAT, [a.id], id, 0), CAT, [b.id], id, 1);
  const s = () => g.nodos.find((n) => n.id === id);
  const html = (activo) => {
    g = Gr.fijarConfig(g, id, { activo });
    return D.contenido({ ...ED.inicial(), g }, CTX_MEDIDO, tipos(g, CAT));
  };
  assert.deepEqual(D.textosMarcos(s()), ["0 [0..1]", "1 [0..1]"]);
  const m = D.medidasSelector(s(), D.contexto(CAT, D.glifosPorBloque(INV), ",", (t) => (t === "0 [0..1]" || t === "1 [0..1]" ? 37 : t.length * 6)));
  assert.deepEqual([m.texto, m.ancho, m.x], [54, 72, 137], "72 de ancho: 987 = 850 + 137, como en secuencia-8.png");
  let h = html(0);
  assert.match(h, /class="nodo estructura estructura-stacked"/);
  assert.match(h, /M0,1h346v198h-346zM5,9h336v182h-336z"/, "un solo marco de 336");
  assert.match(h, /<div class="selector-de-marcos" style="left:\d+px;top:0"/);
  assert.match(h, /<text x="12" y="13" class="texto-selector">0 \[0\.\.1\]<\/text>/);
  assert.ok(h.includes(`data-nodo="${a.id}"`) && !h.includes(`data-nodo="${b.id}"`), "sólo se ve lo del marco que se ve");
  assert.ok(!h.includes("variable-local-secuencia"), "sin cables entre marcos no hay variables locales");
  // Un cable del marco 0 al 1 son dos mitades, la que escribe y la que lee, con su flecha (secuencia-10.png, secuencia-11.png).
  g = conectar(g, CAT, { nodo: a.id, puerto: "result", dir: "out" }, { nodo: b.id, puerto: "x", dir: "in" }).g;
  h = html(0);
  const caja = /<div class="variable-local-secuencia" style="left:(\d+)px;top:(\d+)px"><svg class="variable-local" viewBox="0 0 13 13" width="13" height="13"/;
  assert.equal(h.match(caja)[2], String(450 + 200 - 9 - 13), "pegada al borde de abajo, con su base en la línea (640)");
  assert.match(h, /<rect x="0\.5" y="0\.5" width="12" height="12" fill="#ffffcc" stroke="#[0-9a-f]+"/);
  const escribe = h.match(/<path d="(M[^"]*)" fill="#[0-9a-f]+"\/><\/svg><\/div>/)[1];
  assert.equal(escribe, "M5,3h3v1h-3zM5,4h3v1h-3zM5,5h3v1h-3zM3,6h7v1h-7zM4,7h5v1h-5zM5,8h3v1h-3zM6,9h1v1h-1z", "abajo, la flecha de escribir apunta al borde: hacia abajo");
  h = html(1);
  assert.ok(h.includes(`data-nodo="${b.id}"`) && !h.includes(`data-nodo="${a.id}"`));
  const lee = h.match(/<path d="(M[^"]*)" fill="#[0-9a-f]+"\/><\/svg><\/div>/)[1];
  assert.equal(lee, "M6,3h1v1h-1zM5,4h3v1h-3zM4,5h5v1h-5zM3,6h7v1h-7zM5,7h3v1h-3zM5,8h3v1h-3zM5,9h3v1h-3z", "en el marco que lee, hacia arriba");
  // En un marco anterior al que escribe, tablero de ajedrez.
  const solo = secuencia("stacked-sequence", 0, 0, 346, 200, [{ de: 0 }, {}, {}]);
  const w = crearNodo(solo.g, CAT, "const", 40, 90);
  const x2 = crearNodo(w.g, CAT, "increment", 140, 90);
  let g2 = Gr.meter(Gr.meter(x2.g, CAT, [w.id], solo.id, 1), CAT, [x2.id], solo.id, 2);
  g2 = conectar(g2, CAT, { nodo: w.id, puerto: "result", dir: "out" }, { nodo: x2.id, puerto: "x", dir: "in" }).g;
  g2 = Gr.fijarConfig(g2, solo.id, { activo: 0 });
  assert.match(D.contenido({ ...ED.inicial(), g: g2 }, CTX_MEDIDO, tipos(g2, CAT)), /M1,1h1v1h-1zM3,1h1v1h-1z/, "las celdas del tablero");
});

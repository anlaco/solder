// The Front Panel (spec/05-editor.md §7) and labels, as in
// labview-captures/front-panel/numeric-colocar-etiquetas.mp4. No browser needed:
// front-panel.mjs and labels.mjs are pure functions.

import assert from "node:assert/strict";
import { test } from "node:test";

import * as CV from "../../core/model/control-values.mjs";

import * as D from "../../editor/src/block-diagram/diagram-view.mjs";
import * as ED from "../../editor/src/block-diagram/diagram-editing.mjs";
import * as Et from "../../editor/src/common/labels.mjs";
import * as G from "../../editor/src/common/glyphs.mjs";
import * as Gr from "../../core/model/graph.mjs";
import { COLORES, esError } from "../../core/model/types.mjs";
import * as P from "../../editor/src/front-panel/front-panel.mjs";
import * as UH from "../../editor/src/block-diagram/undo-history.mjs";
import { CAT, INV } from "../helpers.mjs";
import { oldSchoolToken } from "./old-school-theme.mjs";

const CTX = D.contexto(CAT, D.glifosPorBloque(INV), ",");
const FONDO = { tipo: "fondo" };

/** Coger un control de la paleta, llevarlo al panel y hacer clic. */
function poner(p, bloque, pt, config) {
  p = P.coger(p, bloque, config);
  p = P.moverA(p, CTX, pt);
  return P.pulsar(p, CTX, FONDO, pt);
}

/** Poner un control y confirmar su etiqueta tal como sale. */
const ponerYConfirmar = (p, bloque, pt, config) => P.confirmar(poner(p, bloque, pt, config));

// Regla 38, y las dos capturas: front-panel/numeric-control-indicador.png y
// block-diagram/numeric-terminales-icono.png.
test("un control y un indicador numéricos se ponen en el panel con su terminal en el diagrama", () => {
  let p = ponerYConfirmar(P.inicial(), "control", { x: 100, y: 100 });
  p = ponerYConfirmar(p, "indicator", { x: 400, y: 100 });
  const [control, indicador] = p.g.nodos;
  assert.deepEqual([control.tipo, indicador.tipo], ["control", "indicator"]);
  assert.deepEqual([control.label.text, indicador.label.text], ["Numeric", "Numeric 2"], "LabVIEW numera las etiquetas repetidas");
  assert.ok(control.panel && indicador.panel, "cada uno tiene su sitio en el panel");

  const html = P.contenido(p, CTX);
  assert.equal((html.match(/class="objeto-panel/g) ?? []).length, 2);
  assert.match(html, /class="objeto-panel sd-control sd-numeric"[^>]*><span class="sd-incrementer">/, "the control has an incrementer");
  assert.match(html, /class="objeto-panel sd-indicator sd-numeric"[^>]*><span class="sd-field"/, "the indicator only its field (grey in Old School)");
  assert.match(html, />Numeric 2</);

  // En el diagrama: el terminal del control da el dato y el del indicador lo recibe.
  const d = { ...ED.inicial(), g: p.g };
  const ts = D.extremos(p.g, CTX);
  assert.equal(ts.get(`${control.id}.result`).dir, "out");
  assert.equal(ts.get(`${indicador.id}.value`).dir, "in");
  const bd = D.contenido(d, CTX, Gr.tipos(p.g, CAT));
  assert.equal((bd.match(/class="glifo-terminal-panel"/g) ?? []).length, 2);
  assert.match(bd, /data-etiqueta="n2"[^>]*>Numeric 2</, "la etiqueta se ve también en el diagrama");

  // Un indicador sin cablear no rompe el VI, como en LabVIEW (spec/03 regla 10).
  assert.ok(Gr.ejecutable(p.g, CAT, Gr.tipos(p.g, CAT)), "la flecha de Run no se rompe");
  // Se cablean y el VI sigue listo.
  const g = Gr.conectar(p.g, CAT, { nodo: control.id, puerto: "result", dir: "out" }, { nodo: indicador.id, puerto: "value", dir: "in" }).g;
  assert.ok(Gr.ejecutable(g, CAT, Gr.tipos(g, CAT)));

  // Regla 39 (DT-046): borrar el control en el panel se lleva su terminal, pero su cable se queda, roto.
  const sinControl = P.borrarSeleccion({ ...p, g, seleccion: [control.id] });
  assert.deepEqual(sinControl.g.nodos.map((n) => n.id), [indicador.id]);
  assert.equal(sinControl.g.cables.length, 1);
});

// En el vídeo: al soltar el control, su etiqueta sale en negro, seleccionada;
// lo que se escribe la sustituye, Intro baja de línea y un clic fuera confirma.
test("al soltar un control su etiqueta se edita y enter añade una línea", () => {
  let p = poner(P.inicial(), "control", { x: 100, y: 100 });
  assert.equal(p.edicion.texto, "Numeric");
  assert.equal(p.edicion.todo, true, "todo el texto está seleccionado");
  assert.match(P.contenido(p, CTX), /<span class="texto-elegido">Numeric<\/span>/);
  for (const t of ["i", "n", "Enter", "x"]) p = P.teclear(p, t);
  assert.equal(p.edicion.texto, "in\nx");
  assert.match(P.contenido(p, CTX), /in<br>x<span class="caret">/, "cada línea en su renglón");
  p = P.teclear(p, "Backspace");
  p = P.teclear(p, "Backspace");
  p = P.pulsar(p, CTX, FONDO, { x: 300, y: 300 });
  assert.equal(p.edicion, null);
  assert.equal(p.g.nodos[0].label.text, "in", "el clic fuera confirma");

  // Doble clic sobre la etiqueta: se vuelve a escribir en ella. Esc la deja como estaba.
  p = P.editar(p, p.g.nodos[0].id);
  p = P.teclear(p, "o");
  assert.equal(P.escape(p).g.nodos[0].label.text, "in");
  p = P.confirmar(P.teclear(P.teclear(p, "u"), "t"));
  assert.equal(p.g.nodos[0].label.text, "out");

  // La misma etiqueta se escribe desde el diagrama, e Intro también baja de línea.
  let d = ED.editarEtiqueta({ ...ED.inicial(), g: p.g }, p.g.nodos[0].id);
  for (const t of ["O", "u", "t"]) d = ED.teclear(d, t);
  d = ED.confirmar(d, CTX);
  assert.equal(d.g.nodos[0].label.text, "Out");
});

// En el vídeo, la etiqueta se arrastra sola, en cada lienzo por su lado.
test("la etiqueta se mueve sola y en cada lienzo por separado", () => {
  let p = ponerYConfirmar(P.inicial(), "indicator", { x: 200, y: 200 });
  const n = p.g.nodos[0];
  const antes = P.cajaEtiqueta(n, CTX.medir);
  const objeto = P.caja(n);
  assert.equal(antes.x, objeto.x, "encima de la casilla, alineada con ella");
  assert.ok(antes.y + antes.alto <= objeto.y, "y sin pisarla");

  p = P.pulsar(p, CTX, { tipo: "etiqueta", id: n.id }, { x: antes.x + 2, y: antes.y + 2 });
  p = P.moverA(p, CTX, { x: antes.x + 22, y: antes.y - 38 });
  p = P.soltar(p, CTX, FONDO, { x: antes.x + 22, y: antes.y - 38 });
  const movida = P.cajaEtiqueta(p.g.nodos[0], CTX.medir);
  assert.deepEqual([movida.x - antes.x, movida.y - antes.y], [20, -40]);
  assert.deepEqual(P.caja(p.g.nodos[0]), objeto, "el objeto no se mueve");
  assert.deepEqual(D.cajaEtiqueta(p.g.nodos[0], CTX), D.cajaEtiqueta(n, CTX), "en el diagrama sigue donde estaba");

  // Mover el objeto se lleva su etiqueta.
  p = P.pulsar(p, CTX, { tipo: "objeto", id: n.id }, { x: objeto.x + 5, y: objeto.y + 5 });
  p = P.moverA(p, CTX, { x: objeto.x + 15, y: objeto.y + 5 });
  p = P.soltar(p, CTX, FONDO, { x: objeto.x + 15, y: objeto.y + 5 });
  assert.equal(P.cajaEtiqueta(p.g.nodos[0], CTX.medir).x, movida.x + 10);

  // En el diagrama, la etiqueta del indicador va a su derecha y también se mueve sola.
  let d = { ...ED.inicial(), g: p.g };
  const k = D.caja(d.g.nodos[0], CTX);
  const e0 = D.cajaEtiqueta(d.g.nodos[0], CTX);
  assert.ok(e0.x > k.x + k.ancho, "a la derecha del terminal");
  d = ED.pulsar(d, CTX, { tipo: "etiqueta", id: n.id }, { x: e0.x + 1, y: e0.y + 1 });
  d = ED.moverA(d, CTX, { x: e0.x + 1, y: e0.y + 21 });
  d = ED.soltar(d, CTX, FONDO, { x: e0.x + 1, y: e0.y + 21 });
  assert.equal(D.cajaEtiqueta(d.g.nodos[0], CTX).y, e0.y + 20);
  assert.deepEqual(D.caja(d.g.nodos[0], CTX), k, "el terminal no se mueve");
  assert.deepEqual(ED.borrarSeleccion(d).g, d.g, "una etiqueta sola no se borra");
});

test("mientras se arrastra desde la paleta se ve el contorno del control", () => {
  let p = P.coger(P.inicial(), "control");
  p = P.moverA(p, CTX, { x: 120, y: 80 });
  assert.equal(p.accion.arrastrado, true);
  assert.equal((P.contenido(p, CTX).match(/class="contorno-colocar/g) ?? []).length, 2, "el del objeto y el de su etiqueta");
  // Soltar fuera del lienzo no pone nada; soltar dentro, sí.
  assert.equal(P.soltar(p, CTX, null, { x: 0, y: 0 }).g.nodos.length, 0);
  assert.equal(P.soltar(p, CTX, FONDO, { x: 120, y: 80 }).g.nodos.length, 1);
});

test("la otra ventana recibe el vi y olvida lo que ya no existe", () => {
  const p = ponerYConfirmar(P.inicial(), "control", { x: 50, y: 50 });
  const elegido = { ...p, seleccion: [p.g.nodos[0].id, P.idEtiqueta(p.g.nodos[0].id)] };
  assert.deepEqual(P.recibir(elegido, Gr.nuevo()).seleccion, []);
  const d = ED.recibir({ ...ED.inicial(), seleccion: ["n1", "n1#etiqueta"] }, p.g);
  assert.deepEqual(d.seleccion, ["n1", "n1#etiqueta"]);
  assert.equal(d.g, p.g);
});

test("las etiquetas miden su línea más ancha", () => {
  const medir = (t) => t.length * 5;
  assert.deepEqual(Et.tamano("abc\nabcdef", medir), { ancho: 32, alto: 2 * Et.ALTO_LINEA });
  assert.equal(Gr.etiquetaLibre(Gr.nuevo(), "Numeric"), "Numeric");
});

// En LabVIEW 2026 Q3: cada clic en una flecha del incrementador suma o resta 1;
// un clic en la casilla escribe en ella con el cursor al final, Intro confirma
// y lo que no es un número deja el valor como estaba.
test("el valor de un control se escribe en su casilla y cambia con las flechas", () => {
  let p = ponerYConfirmar(P.inicial(), "control", { x: 100, y: 100 });
  const id = p.g.nodos[0].id;
  for (const paso of [1, 1, 1, -1]) p = P.pulsar(p, CTX, { tipo: "paso", id, paso }, { x: 0, y: 0 });
  assert.equal(CV.currentValue(p.g.nodos[0]), 2);
  assert.match(P.contenido(p, CTX), /<span class="sd-value">2<\/span>/);

  p = P.pulsar(p, CTX, { tipo: "casilla", id }, { x: 0, y: 0 });
  assert.deepEqual(p.edicion, { nodo: id, valor: true, texto: "2", shown: "2", todo: false });
  assert.match(P.contenido(p, CTX), /editando-valor/, "el control se enmarca mientras se escribe");
  for (const t of ["5", ",", "5"]) p = P.teclear(p, t);
  p = P.teclear(p, "Enter");
  assert.equal(p.edicion, null);
  assert.equal(CV.currentValue(p.g.nodos[0]), 25.5);

  p = P.editarValor(p, CTX, id, true);
  p = P.confirmar(P.teclear(p, "x"));
  assert.equal(CV.currentValue(p.g.nodos[0]), 25.5, "lo que no es un número no cambia el valor");

  // En un indicador no se escribe: su casilla sólo lo selecciona.
  p = ponerYConfirmar(p, "indicator", { x: 400, y: 100 });
  const ind = p.g.nodos[1].id;
  p = P.pulsar(p, CTX, { tipo: "casilla", id: ind }, { x: 400, y: 100 });
  assert.equal(p.edicion, null);
  assert.deepEqual(p.seleccion, [ind]);
});

// The outer 4 px of a numeric or string control move it; only inside that band does a press type in
// the value box (labview-captures/reports/2026-10-17-panel-move-zones.md).
test("a press near the edge of a control's value box moves the control instead of typing", () => {
  for (const block of ["control", "str-control"]) {
    let p = ponerYConfirmar(P.inicial(), block, { x: 100, y: 100 });
    const node = p.g.nodos[0];
    const box = P.caja(node);
    const middleY = box.y + Math.floor(box.alto / 2);
    const pressAt = (point) => P.pulsar(p, CTX, { tipo: "casilla", id: node.id }, point);

    for (const point of [{ x: box.x + box.ancho - 1, y: middleY }, { x: box.x + box.ancho - 4, y: middleY }, { x: box.x + 30, y: box.y }, { x: box.x + 30, y: box.y + box.alto - 4 }]) {
      const pressed = pressAt(point);
      assert.equal(pressed.edicion, null, `${block}: no typing at ${point.x},${point.y}`);
      assert.equal(pressed.accion?.tipo, "mover", `${block}: the press at ${point.x},${point.y} moves`);
    }
    if (block === "str-control") assert.equal(pressAt({ x: box.x + 3, y: middleY }).accion?.tipo, "mover", "the left edge of a string moves it");
    assert.ok(pressAt({ x: box.x + box.ancho - 5, y: middleY }).edicion, `${block}: 5 px in, the press types`);

    p = P.soltar(P.moverA(pressAt({ x: box.x + box.ancho - 2, y: middleY }), CTX, { x: box.x + box.ancho + 38, y: middleY }), CTX, { tipo: "objeto", id: node.id }, { x: box.x + box.ancho + 38, y: middleY });
    assert.equal(p.g.nodos[0].panel.x, node.panel.x + 40, `${block}: dragged by its edge, it moves`);
  }
});

// Hover cursors and presses on a numeric or string control, selected or not
// (labview-captures/reports/2026-10-17-numeric-cursor-map.md, 2026-10-18-numeric-hover-selected.md).
test("the pointer over a control is the I-beam in its value box, the arrow on its edge and label, and the arrow all over once selected", () => {
  for (const block of ["control", "str-control"]) {
    const p = ponerYConfirmar(P.inicial(), block, { x: 100, y: 100 });
    const node = p.g.nodos[0];
    const box = P.caja(node);
    const middle = { x: box.x + box.ancho - 10, y: box.y + Math.floor(box.alto / 2) };
    const edge = { x: box.x + box.ancho - 2, y: middle.y };
    const valueBox = { tipo: "casilla", id: node.id };
    assert.equal(P.hoverCursor(p, valueBox, middle), "text", `${block}: I-beam inside the value box`);
    assert.equal(P.hoverCursor(p, valueBox, edge), "move", `${block}: arrow on the 4 px band`);
    assert.equal(P.hoverCursor(p, { tipo: "etiqueta", id: node.id }, middle), "move", `${block}: arrow on the label`);
    if (block === "control") assert.equal(P.hoverCursor(p, { tipo: "paso", id: node.id, paso: 1 }, { x: box.x + 5, y: box.y + 5 }), "operate", "finger on the incrementer");

    const selected = { ...p, seleccion: [node.id] };
    assert.equal(P.hoverCursor(selected, valueBox, middle), "move", `${block}: selected, the value box shows the arrow`);
    if (block === "control") assert.equal(P.hoverCursor(selected, { tipo: "paso", id: node.id, paso: 1 }, { x: box.x + 5, y: box.y + 5 }), "move", "selected, the incrementer shows the arrow");
    assert.equal(P.hoverCursor(p, { tipo: "fondo" }, { x: 10, y: 10 }), null, "empty panel keeps the cross");
  }
});

test("a selected control moves when dragged from its value box, a click does not type, and a double click does", () => {
  for (const block of ["control", "str-control"]) {
    let p = ponerYConfirmar(P.inicial(), block, { x: 100, y: 100 });
    const node = p.g.nodos[0];
    const box = P.caja(node);
    const middle = { x: box.x + box.ancho - 10, y: box.y + Math.floor(box.alto / 2) };
    const valueBox = { tipo: "casilla", id: node.id };
    p = { ...p, seleccion: [node.id] };

    const clicked = P.soltar(P.pulsar(p, CTX, valueBox, middle), CTX, valueBox, middle);
    assert.equal(clicked.edicion, null, `${block}: a click on a selected control does not type`);
    assert.deepEqual(clicked.seleccion, [node.id], `${block}: it stays selected`);
    assert.equal(clicked.g.nodos[0].panel.x, node.panel.x, `${block}: and does not move`);

    const to = { x: middle.x + 40, y: middle.y };
    const dragged = P.soltar(P.moverA(P.pulsar(p, CTX, valueBox, middle), CTX, to), CTX, valueBox, to);
    assert.equal(dragged.g.nodos[0].panel.x, node.panel.x + 40, `${block}: dragged from its value box, it moves`);

    assert.ok(P.doubleClickTypes(p, valueBox, middle), `${block}: a double click inside the value box types`);
    assert.ok(!P.doubleClickTypes(p, valueBox, { x: box.x + box.ancho - 2, y: middle.y }), `${block}: not on its 4 px band`);
  }
});

test("dragging the label of a selected control moves the control with it; unselected, the label moves alone", () => {
  let p = ponerYConfirmar(P.inicial(), "control", { x: 100, y: 100 });
  const node = p.g.nodos[0];
  const label = { tipo: "etiqueta", id: node.id };
  const from = { x: 110, y: 90 };
  const to = { x: 150, y: 90 };
  const drag = (state) => P.soltar(P.moverA(P.pulsar(state, CTX, label, from), CTX, to), CTX, label, to);

  assert.equal(drag({ ...p, seleccion: [node.id] }).g.nodos[0].panel.x, node.panel.x + 40, "selected: the control moves");
  assert.equal(drag(p).g.nodos[0].panel.x, node.panel.x, "unselected: only the label moves");
});

// LabVIEW's default format shows 6 significant digits on the panel and 13 on the diagram
// (labview-captures/reports/2026-10-15-numeric-display.md); a value only shown is not rounded.
test("a DBL control shows 1.23457E+8 and keeps 123456789, the constant shows it in full", () => {
  let p = ponerYConfirmar(P.inicial(), "control", { x: 100, y: 100 });
  const id = p.g.nodos[0].id;
  p = P.editarValor(p, CTX, id, true);
  for (const key of "123456789") p = P.teclear(p, key);
  p = P.teclear(p, "Enter");
  assert.match(P.contenido(p, CTX), /<span class="sd-value">1,23457E\+8<\/span>/);
  p = P.confirmar(P.editarValor(p, CTX, id, true));
  assert.equal(CV.currentValue(p.g.nodos[0]), 123456789, "confirming the text shown does not round the value");

  const { g, id: constant } = Gr.crearNodo(Gr.nuevo(), CAT, "const", 100, 100);
  const constantText = (value) => D.CONSTANTES.const.texto(Gr.fijarConfig(g, constant, { value }).nodos[0], CTX);
  assert.equal(constantText(123456789), "123456789");
  assert.equal(constantText(0.00001), "1E-5");
  assert.equal(constantText(3.14159265358979), "3,14159265359");
});

// Un control con otra representación enseña y acepta valores de su tipo: en
// LabVIEW lo escrito se redondea y se satura, sin cambiar el tipo del control.
test("un control entero redondea y satura lo que se le escribe", () => {
  let p = ponerYConfirmar(P.inicial(), "control", { x: 100, y: 100 });
  const id = p.g.nodos[0].id;
  p = { ...p, g: Gr.fijarRepresentacion(p.g, id, "u8") };
  p = P.editarValor(p, CTX, id, true);
  for (const t of ["3", ",", "7"]) p = P.teclear(p, t);
  p = P.confirmar(P.teclear(p, "Enter"));
  assert.equal(CV.currentValue(p.g.nodos[0]), 4);
  assert.equal(p.g.nodos[0].config.type, "u8", "el tipo no cambia");
  assert.match(P.contenido(p, CTX), /<span class="sd-value">4<\/span>/);
  p = P.editarValor(p, CTX, id, true);
  for (const t of ["3", "0", "0"]) p = P.teclear(p, t);
  p = P.confirmar(P.teclear(p, "Enter"));
  assert.equal(CV.currentValue(p.g.nodos[0]), 255, "satura en el rango de U8");
  p = P.pulsar(p, CTX, { tipo: "paso", id, paso: 1 }, { x: 0, y: 0 });
  assert.equal(CV.currentValue(p.g.nodos[0]), 255, "y la flecha no pasa de ahí");
});

// paletas/controls-boolean.png y front-panel/boolean-todos-apagados.png: cada
// control de la subpaleta se pone con su clase, su etiqueta y su acción
// mecánica de fábrica, y su terminal verde («TF») sale en el diagrama
// (block-diagram/boolean-terminales-icono.png).
test("los controles booleanos de la paleta se ponen en el panel con su terminal en el diagrama", () => {
  const hechos = INV.hijos("palette.controls.modern.boolean").filter((e) => e.estado === "built");
  assert.equal(hechos.length, 10);
  let p = P.inicial();
  hechos.forEach((e, i) => {
    p = poner(p, e.bloque, { x: 100 + 90 * (i % 5), y: 100 + 90 * Math.floor(i / 5) }, e.config);
    const n = p.g.nodos.at(-1);
    const estilo = e.id.slice(e.id.lastIndexOf(".") + 1);
    assert.equal(n.tipo, e.bloque);
    assert.equal(n.config.style, estilo);
    assert.equal(CV.currentValue(n), false, "nace apagado");
    assert.ok(p.edicion.texto.startsWith(G.BOOLEANOS[estilo].etiqueta), "la etiqueta de su clase");
    assert.equal(!!G.BOOLEANOS[estilo].indicador, e.bloque === "bool-indicator", "LabVIEW pone los LED como indicadores");
    if (e.bloque === "bool-control") assert.equal(n.config.mechanical, G.BOOLEANOS[estilo].mecanica, "la acción mecánica que se leyó en LabVIEW");
    const k = P.caja(n);
    assert.deepEqual([k.ancho, k.alto], [G.BOOLEANOS[estilo].ancho, G.BOOLEANOS[estilo].alto], "mide lo que en LabVIEW");
    p = P.confirmar(p);
  });
  assert.deepEqual(
    p.g.nodos.map((n) => n.label.text),
    ["Boolean", "Boolean 2", "Boolean 3", "Boolean 4", "Boolean 5", "Boolean 6", "Boolean 7", "OK Button", "Cancel Button", "stop"],
    "LabVIEW numera las repetidas",
  );

  // Cada uno se dibuja en el panel con su clase y, en el diagrama, es un terminal verde con «TF».
  const html = P.contenido(p, CTX);
  assert.equal((html.match(/class="objeto-panel sd-(?:control|indicator) sd-boolean /g) ?? []).length, 10);
  assert.match(html, /data-style="stop-button"/);
  const ts = D.extremos(p.g, CTX);
  for (const n of p.g.nodos) {
    assert.equal(ts.get(`${n.id}.${n.tipo === "bool-control" ? "result" : "value"}`).dir, n.tipo === "bool-control" ? "out" : "in");
  }
  const bd = D.contenido({ ...ED.inicial(), g: p.g }, CTX, Gr.tipos(p.g, CAT));
  assert.equal((bd.match(/class="glifo-terminal-panel"/g) ?? []).length, 10);
  assert.ok((bd.match(/>TF</g) ?? []).length >= 10, "cada terminal lleva TF");
  assert.ok(bd.includes(`stroke="${COLORES.booleano}"`), "el borde es verde");
  assert.ok(!bd.includes(">DBL<"), "ninguno es numérico");

  // Se cablean a las funciones de Boolean: Push Button → Not → Round LED, y el VI sigue listo.
  const [boton, led] = p.g.nodos;
  let g = p.g;
  const no = Gr.crearNodo(g, CAT, "not-op", 300, 300);
  g = Gr.conectar(no.g, CAT, { nodo: boton.id, puerto: "result", dir: "out" }, { nodo: no.id, puerto: "x", dir: "in" }).g;
  g = Gr.conectar(g, CAT, { nodo: no.id, puerto: "result", dir: "out" }, { nodo: led.id, puerto: "value", dir: "in" }).g;
  assert.equal(g.cables.length, 2);
  assert.ok(Gr.ejecutable(g, CAT, Gr.tipos(g, CAT)));
  // Un número no entra en un indicador booleano.
  const num = Gr.crearEnPanel(g, CAT, "control", 0, 0, "Numeric");
  const malo = Gr.conectar(num.g, CAT, { nodo: num.id, puerto: "result", dir: "out" }, { nodo: led.id, puerto: "value", dir: "in" });
  const rotos = [...Gr.tipos(malo.g, CAT).cables.values()].filter((c) => c.roto);
  assert.equal(rotos.length, 1, "el cable se crea, roto, como en LabVIEW");
  assert.ok(!Gr.ejecutable(malo.g, CAT, Gr.tipos(malo.g, CAT)), "y el VI no se puede ejecutar");
  // Borrar un control en el panel se lleva su terminal.
  const sin = P.borrarSeleccion({ ...p, seleccion: [boton.id] });
  assert.equal(sin.g.nodos.length, 9);
});

// Un clic sobre un control booleano lo cambia (Switch When Pressed, la acción
// mecánica de fábrica de los interruptores); arrastrarlo lo mueve y no lo
// cambia, y un indicador no se pulsa. En LabVIEW el clic en modo edición sólo
// selecciona: mientras el panel no tenga modo Run, el clic cambia el valor.
test("un clic en un control booleano cambia su valor y arrastrarlo no", () => {
  let p = ponerYConfirmar(P.inicial(), "bool-control", { x: 150, y: 150 }, { style: "horizontal-toggle-switch", mechanical: "switch-when-pressed" });
  p = ponerYConfirmar(p, "bool-indicator", { x: 350, y: 150 }, { style: "round-led" });
  const [interruptor, led] = p.g.nodos;
  const clic = (p, n, destino) => {
    const k = P.caja(n);
    const pt = { x: k.x + 5, y: k.y + 5 };
    p = P.pulsar(p, CTX, { tipo: "objeto", id: n.id }, pt);
    if (destino) p = P.moverA(p, CTX, destino);
    return P.soltar(p, CTX, { tipo: "fondo" }, destino ?? pt);
  };
  assert.match(P.contenido(p, CTX), /data-style="horizontal-toggle-switch"/);
  p = clic(p, interruptor);
  assert.equal(CV.currentValue(p.g.nodos[0]), true, "un clic lo enciende");
  assert.match(P.contenido(p, CTX), /sd-boolean-switch sd-on[^"]*" [^>]*data-style="horizontal-toggle-switch"/, "and it shows on");
  p = clic(p, p.g.nodos[0]);
  assert.equal(CV.currentValue(p.g.nodos[0]), false, "otro lo apaga");
  const antes = P.caja(p.g.nodos[0]);
  p = clic(p, p.g.nodos[0], { x: 200, y: 260 });
  assert.equal(CV.currentValue(p.g.nodos[0]), false, "arrastrar no lo cambia");
  assert.notEqual(P.caja(p.g.nodos[0]).y, antes.y, "lo mueve");
  p = clic(p, led);
  assert.equal(CV.currentValue(p.g.nodos[1]), false, "un indicador no se pulsa");
  assert.deepEqual(p.seleccion, [led.id], "pero se selecciona");
  // Run deja su valor en el LED, que lo enseña encendido.
  const apagado = P.contenido(p, CTX);
  const encendido = P.contenido({ ...p, valores: { [led.id]: true } }, CTX);
  assert.notEqual(apagado, encendido);
});

// front-panel/boolean-menu-control.png y boolean-menu-mechanical-action.png: el
// clic derecho sobre un control booleano abre su menú; Mechanical Action es una
// rejilla de seis iconos y sólo Switch When Pressed está hecha.
test("el menú de un control booleano cambia su acción mecánica", () => {
  let p = ponerYConfirmar(P.inicial(), "bool-control", { x: 150, y: 150 }, { style: "stop-button", mechanical: "latch-when-released" });
  const n = p.g.nodos[0];
  assert.equal(P.menuDe(n), "context.boolean-control");
  assert.equal(P.menuDe({ tipo: "bool-indicator" }), "context.boolean-indicator");
  assert.equal(P.menuDe({ tipo: "control" }), null, "el de los numéricos aún no está capturado");
  p = ED.abrirMenu(p, "context.boolean-control", n.id, 0, 0);
  const lista = D.menuContextual(INV, p.menu, ED.marcados(p));
  const filas = [...lista.matchAll(/class="item-menu[^"]*" data-id="context\.boolean-control\.([\w-]+)"[^>]*><span class="texto-menu"[^>]*>([^<]+)/g)].map((m) => m[2]);
  assert.deepEqual(filas.slice(0, 4), ["Visible Items", "Find Terminal", "Change to Indicator", "Change to Array"], "el orden de LabVIEW");
  assert.ok(filas.includes("Mechanical Action") && filas.at(-1) === "Properties");
  assert.equal((lista.match(/separador-menu/g) ?? []).length, 5, "los separadores de la captura");

  p = ED.sobreMenu(p, "context.boolean-control.mechanical-action", true);
  const rejilla = D.menuContextual(INV, p.menu, ED.marcados(p));
  assert.match(rejilla, /menu-contextual rejilla" data-menu="context\.boolean-control\.mechanical-action"/);
  const celdas = [...rejilla.matchAll(/class="item-menu celda-rep([^"]*)" data-id="context\.boolean-control\.mechanical-action\.([\w-]+)"/g)];
  assert.deepEqual(celdas.map((c) => c[2]), ["switch-when-pressed", "switch-when-released", "switch-until-released", "latch-when-pressed", "latch-when-released", "latch-until-released"], "el orden de LabVIEW");
  // Hechas: Switch When Pressed y Latch When Released, la del Stop (DT-040).
  assert.deepEqual(celdas.filter((c) => c[1].includes("hueco")).map((c) => c[2]), ["switch-when-released", "switch-until-released", "latch-when-pressed", "latch-until-released"], "las otras cuatro, en gris");
  assert.deepEqual(celdas.filter((c) => c[1].includes("marcado")).map((c) => c[2]), ["latch-when-released"], "la actual lleva el marco");
  assert.equal(rejilla.slice(rejilla.indexOf("menu-contextual rejilla")).match(/<svg/g).length, 6, "un icono por celda");

  // Elegir la hecha cambia la acción mecánica del control.
  p = ED.orden(p, "context.boolean-control.mechanical-action.switch-when-pressed", CTX);
  assert.equal(p.g.nodos[0].config.mechanical, "switch-when-pressed");
  assert.equal(p.menu, null);
  p = ED.abrirMenu(p, "context.boolean-control", n.id, 0, 0);
  assert.ok(ED.marcados(p).has("context.boolean-control.mechanical-action.switch-when-pressed"));
  // Esc cierra el menú.
  assert.equal(P.escape(p).menu, null);
});

// Las cajas de los diez controles booleanos hechos, medidas a 1:1 en
// front-panel/boolean-todos-apagados.png y boolean-todos-tras-clic.png (el
// Push Button también, con la herramienta de selección: 50 × 22), y la
// etiqueta a 4 px del dibujo.
test("los controles booleanos miden lo que en LabVIEW y su etiqueta queda a 4 px", () => {
  const cajas = {
    "push-button": [50, 22], "round-led": [18, 18], "horizontal-toggle-switch": [38, 20], "vertical-toggle-switch": [20, 38],
    "square-led": [30, 14], "slide-switch": [44, 14], "vertical-slide-switch": [16, 46],
    "ok-button": [39, 20], "cancel-button": [47, 20], "stop-button": [39, 20],
  };
  for (const [estilo, medida] of Object.entries(cajas)) {
    const b = G.BOOLEANOS[estilo];
    assert.deepEqual([b.ancho, b.alto], medida, estilo);
    assert.notEqual(b.dibujo(false), b.dibujo(true), `${estilo}: on and off look different`);
  }
  const k = P.cajaObjeto("bool-control", 100, 100, { style: "push-button" });
  assert.equal(k.separacion, 4);
  const n = { id: "n1", tipo: "bool-control", config: { style: "push-button" }, panel: { x: 100, y: 100 }, label: { text: "Boolean" } };
  const e = P.cajaEtiqueta(n, CTX.medir, null);
  assert.equal(e.y + e.alto + 4, 100, "el pie de la etiqueta, a 4 px del control");
});

// Controls ▸ Modern ▸ String & Path, de labview-captures/string/controls-string-path.png y
// panel-string-editando.png: un control y un indicador de cadena, de 100 × 24 px, con su
// terminal rosa en el diagrama; se escribe en el control con Intro como salto de línea y se
// confirma con Enter Text o con un clic fuera.
test("un control y un indicador de cadena se ponen en el panel con su terminal en el diagrama", () => {
  let p = ponerYConfirmar(P.inicial(), "str-control", { x: 100, y: 100 });
  p = ponerYConfirmar(p, "str-indicator", { x: 400, y: 100 });
  const [control, indicador] = p.g.nodos;
  assert.deepEqual([control.tipo, indicador.tipo], ["str-control", "str-indicator"]);
  assert.deepEqual([control.label.text, indicador.label.text], ["String", "String 2"], "LabVIEW numera las etiquetas repetidas");
  const k = P.caja(control);
  assert.deepEqual([k.ancho, k.alto], [100, 24], "la casilla de una cadena mide 100 × 24 px");
  const html = P.contenido(p, CTX);
  assert.equal((html.match(/class="objeto-panel sd-control sd-string"/g) ?? []).length, 1, "the control (a white field in Old School)");
  assert.equal((html.match(/class="objeto-panel sd-indicator sd-string"/g) ?? []).length, 1, "the indicator (a grey one)");
  assert.doesNotMatch(html, /sd-incrementer/);
  // Los terminales del diagrama, de color rosa y con «abc».
  const bd = D.contenido({ ...ED.inicial(), g: p.g }, CTX, Gr.tipos(p.g, CAT));
  assert.equal((bd.match(/class="glifo-terminal-panel"/g) ?? []).length, 2);
  assert.match(bd, new RegExp(COLORES.cadena), "el color de una cadena");
  assert.match(bd, />abc</);
  assert.ok(Gr.ejecutable(p.g, CAT, Gr.tipos(p.g, CAT)));

  // Escribir en el control: un clic pone el cursor al final; Intro baja de línea y no confirma.
  p = P.pulsar(p, CTX, { tipo: "casilla", id: control.id }, { x: 120, y: 112 });
  assert.equal(p.edicion.cadena, true);
  for (const t of ["h", "o", "l", "a", "Enter", "x"]) p = P.teclear(p, t);
  assert.equal(p.edicion.texto, "hola\nx", "Intro es un salto de línea");
  assert.ok(P.contenido(p, CTX).includes(`class="caret"`), "mientras se escribe, el cursor");
  p = P.confirmar(p);
  assert.equal(CV.currentValue(p.g.nodos[0]), "hola\nx", "se guarda tal cual, con su salto de línea");
  assert.equal(p.edicion, null);
  // Un doble clic selecciona todo y lo escrito lo sustituye.
  p = P.editarValor(p, CTX, control.id, true);
  p = P.confirmar(P.teclear(p, "z"));
  assert.equal(CV.currentValue(p.g.nodos[0]), "z");
  // El indicador enseña lo que le llega del VI en ejecución, no su valor.
  const conValor = { ...p, valores: { [indicador.id]: "resultado" } };
  assert.match(P.contenido(conValor, CTX), />resultado</);
  // En un indicador un clic no escribe.
  assert.equal(P.pulsar(p, CTX, { tipo: "casilla", id: indicador.id }, { x: 420, y: 112 }).edicion, null);
  // Borrar el control en el panel borra su terminal.
  const q = P.borrarSeleccion({ ...p, seleccion: [control.id] });
  assert.deepEqual(q.g.nodos.map((n) => n.tipo), ["str-indicator"]);
});

// Controls ▸ Modern ▸ Data Containers ▸ Error In y Error Out (DT-043), de
// labview-captures/errores/301-panel-error-out-1a1.png a 1:1: 155 × 121 px, con status, code y
// source; en el diagrama, un terminal con el marco oliva del cable de error.
test("los controles Error In y Error Out se ponen en el panel con su terminal en el diagrama", () => {
  const pal = (nombre) => INV.entrada(`palette.controls.modern.data-containers.${nombre}`);
  const [eIn, eOut] = [pal("error-in"), pal("error-out")];
  assert.deepEqual([eIn.bloque, eOut.bloque], ["cluster-control", "cluster-indicator"]);
  let p = ponerYConfirmar(P.inicial(), eIn.bloque, { x: 100, y: 100 }, eIn.config);
  p = ponerYConfirmar(p, eOut.bloque, { x: 400, y: 100 }, eOut.config);
  const [control, indicador] = p.g.nodos;
  assert.deepEqual([control.label.text, indicador.label.text], ["error in (no error)", "error out"]);
  const k = P.caja(control);
  assert.deepEqual([k.ancho, k.alto], [155, 121]);
  const html = P.contenido(p, CTX);
  assert.equal((html.match(/class="objeto-panel sd-control sd-error-cluster"/g) ?? []).length, 1);
  assert.equal((html.match(/class="objeto-panel sd-indicator sd-error-cluster"/g) ?? []).length, 1);
  assert.match(html, />status</);
  assert.match(html, />source</);
  // Status FALSE says no error (a green check in Old School: old-school/error-status-ok.svg) and TRUE an error (a red cross).
  assert.equal((html.match(/aria-label="No error"/g) ?? []).length, 2);
  assert.doesNotMatch(html, /aria-label="Error"/);
  const rojo = P.pulsar(p, CTX, { tipo: "campo", id: control.id, campo: "status" }, { x: 120, y: 130 });
  assert.deepEqual(CV.currentValue(rojo.g.nodos[0]), { status: true, code: 0, source: "" }, "un clic en el status lo alterna");
  assert.match(P.contenido(rojo, CTX), /class="objeto-panel sd-control sd-error-cluster sd-on".*aria-label="Error"/);
  // Los terminales del diagrama: el cable de error pasa por ellos y el tipo es el cluster de error.
  const resueltos = Gr.tipos(p.g, CAT);
  assert.ok(esError(resueltos.salidas.get(`${control.id}.result`)));
  assert.ok(esError(resueltos.entradas.get(`${indicador.id}.value`)));
  const bd = D.contenido({ ...ED.inicial(), g: p.g }, CTX, resueltos);
  assert.equal((bd.match(/class="glifo-terminal-panel"/g) ?? []).length, 2);
  assert.match(bd, new RegExp(COLORES.error));

  // Escribir en code y en source del control.
  let q = P.pulsar(p, CTX, { tipo: "campo", id: control.id, campo: "code" }, { x: 160, y: 125 });
  assert.equal(q.edicion.campo, "code");
  for (const t of ["5", "0", "0", "0", "Enter"]) q = P.teclear(q, t);
  assert.equal(q.edicion, null, "Intro confirma el code");
  assert.equal(CV.currentValue(q.g.nodos[0]).code, 5000);
  q = P.pulsar(q, CTX, { tipo: "campo", id: control.id, campo: "source" }, { x: 120, y: 175 });
  assert.equal(q.edicion.cadena, true);
  for (const t of ["p", "r", "Enter", "x"]) q = P.teclear(q, t);
  assert.equal(q.edicion.texto, "pr\nx", "en source Intro baja de línea");
  q = P.confirmar(q);
  assert.deepEqual(CV.currentValue(q.g.nodos[0]), { status: false, code: 5000, source: "pr\nx" });
  // Un code fuera de rango se satura en I32, y lo que no es un número lo deja como estaba.
  let r = P.pulsar(q, CTX, { tipo: "campo", id: control.id, campo: "code" }, { x: 160, y: 125 });
  for (const t of ["9", "9", "9", "9", "9", "9", "9", "9", "9", "9", "9", "9"]) r = P.teclear(r, t);
  assert.equal(CV.currentValue(P.confirmar({ ...r, edicion: { ...r.edicion, todo: false } }).g.nodos[0]).code, 2147483647);
  // En el indicador un clic no escribe, y enseña lo que le llega del VI.
  assert.equal(P.pulsar(p, CTX, { tipo: "campo", id: indicador.id, campo: "code" }, { x: 460, y: 125 }).edicion, null);
  const conValor = { ...p, valores: { [indicador.id]: { status: true, code: 7, source: "algo" } } };
  const html2 = P.contenido(conValor, CTX);
  assert.match(html2, />7</);
  assert.match(html2, />algo</);
  assert.ok(Gr.ejecutable(p.g, CAT, resueltos));
  // Borrar el control en el panel borra su terminal.
  assert.deepEqual(P.borrarSeleccion({ ...p, seleccion: [control.id] }).g.nodos.map((n) => n.tipo), ["cluster-indicator"]);
});

// array/panel-array-1a1.png and array-indicador-terminal.png: an array control with a numeric element measures
// 114 × 37 px (the 41 px index column and the 73 × 34 shell, 3 px down); its terminal on the diagram has the color of
// the element's type. Its elements are typed into, the index scrolls through them and the shell stretches to show more.
test("un control y un indicador de array se ponen en el panel con su terminal en el diagrama", () => {
  const cfg = { type: { array: "number" }, value: [] };
  let p = ponerYConfirmar(P.inicial(), "arr-control", { x: 150, y: 100 }, cfg);
  p = ponerYConfirmar(p, "arr-indicator", { x: 450, y: 100 }, cfg);
  const [control, indicador] = p.g.nodos;
  assert.deepEqual([control.tipo, indicador.tipo], ["arr-control", "arr-indicator"]);
  assert.deepEqual([control.label.text, indicador.label.text], ["Array", "Array 2"]);
  const k = P.caja(control);
  assert.deepEqual([k.ancho, k.alto], [41 + 73, 37]);
  let html = P.contenido(p, CTX);
  assert.equal((html.match(/class="sd-element[ "]/g) ?? []).length, 2);
  assert.equal((html.match(/class="sd-index"/g) ?? []).length, 2);
  // El terminal del diagrama es el de un array de DBL: borde naranja y el dibujo de los índices.
  const bd = D.contenido({ ...ED.inicial(), g: p.g }, CTX, Gr.tipos(p.g, CAT));
  assert.equal((bd.match(/class="glifo-terminal-panel"/g) ?? []).length, 2);
  assert.match(bd, new RegExp(COLORES.flotante));
  assert.match(bd, />123</);
  assert.ok(Gr.ejecutable(p.g, CAT, Gr.tipos(p.g, CAT)));

  // Escribir en el elemento 2 (más allá del final): lo que falta se rellena con ceros.
  p = P.pulsar(p, CTX, { tipo: "elem", id: control.id, k: 2 }, { x: 200, y: 112 });
  assert.equal(p.edicion.elem, 2);
  for (const t of ["7", ",", "5"]) p = P.teclear(p, t);
  p = P.teclear(p, "Enter");
  assert.deepEqual(CV.currentValue(p.g.nodos[0]), [0, 0, 7.5]);
  // El índice se mueve con sus flechas, sin pasar de 0, y los elementos que se ven empiezan en él.
  p = P.pulsar(p, CTX, { tipo: "paso", id: control.id, paso: 1 }, { x: 160, y: 110 });
  p = P.pulsar(p, CTX, { tipo: "paso", id: control.id, paso: 1 }, { x: 160, y: 110 });
  assert.equal(p.g.nodos[0].config.indice, 2);
  assert.match(P.contenido(p, CTX), /data-k="2"[^>]*>.*?7,5/s);
  p = P.pulsar(P.pulsar(P.pulsar(p, CTX, { tipo: "paso", id: control.id, paso: -1 }, { x: 160, y: 120 }), CTX, { tipo: "paso", id: control.id, paso: -1 }, { x: 160, y: 120 }), CTX, { tipo: "paso", id: control.id, paso: -1 }, { x: 160, y: 120 });
  assert.equal(p.g.nodos[0].config.indice, 0);
  // Stretching the shell by its handle shows one more element every 65 px.
  p = { ...p, seleccion: [control.id] };
  assert.match(P.contenido(p, CTX), /class="asa-array"/);
  p = P.pulsar(p, CTX, { tipo: "asa-array", id: control.id }, { x: 260, y: 112 });
  p = P.moverA(p, CTX, { x: 260 + 2 * 65, y: 112 });
  p = P.soltar(p, CTX, FONDO, { x: 394, y: 112 });
  assert.equal(p.g.nodos[0].config.visibles, 3);
  assert.equal((P.contenido(p, CTX).match(/class="sd-element[ "]/g) ?? []).length, 4, "tres en el control y uno en el indicador");
  assert.equal(P.caja(p.g.nodos[0]).ancho, 41 + 3 * 65 + 8);
  // Un array de cadenas y uno de booleanos.
  let q = ponerYConfirmar(P.inicial(), "arr-control", { x: 150, y: 100 }, { type: { array: "string" }, value: ["a"] });
  assert.equal(P.caja(q.g.nodos[0]).ancho, 41 + 100 + 8, "a 108 px shell");
  q = P.pulsar(q, CTX, { tipo: "elem", id: q.g.nodos[0].id, k: 0 }, { x: 200, y: 112 });
  q = P.confirmar(P.teclear(q, "b"));
  assert.deepEqual(CV.currentValue(q.g.nodos[0]), ["ab"]);
  let b = ponerYConfirmar(P.inicial(), "arr-control", { x: 150, y: 100 }, { type: { array: "boolean" }, value: [] });
  b = P.pulsar(b, CTX, { tipo: "elem", id: b.g.nodos[0].id, k: 0 }, { x: 200, y: 112 });
  assert.deepEqual(CV.currentValue(b.g.nodos[0]), [true], "un booleano se alterna con el clic");
});

// array-typing/panel-all-top.png: a numeric control array's shell is 73 × 34, a 4 px bevel round a 65 × 26 element
// (its incrementer and a 54 × 25 field 1 px down); past the end the element is greyed, its interior #ebebeb.
test("a numeric control array's shell is a 4 px bevel round a 65 × 26 element, as in LabVIEW", () => {
  const p = ponerYConfirmar(P.inicial(), "arr-control", { x: 150, y: 100 }, { type: { array: "number" }, value: [] });
  const html = P.contenido(p, CTX);
  assert.match(html, /<span class="sd-elements" style="left:41px;top:3px;width:73px;height:34px">/);
  assert.match(html, /<span class="sd-element sd-empty" data-k="0" style="left:4px;top:4px;width:65px;height:26px">/);
  const bevel = [1, 2, 3, 4].flatMap((n) => [oldSchoolToken(`--panel-array-bevel-dark-${n}`), oldSchoolToken(`--panel-array-bevel-light-${n}`)]);
  assert.deepEqual(bevel, ["#d3d3d3", "#eeeeee", "#c2c2c2", "#f2f2f2", "#b7b7b7", "#ededed", "#b1b1b1", "#eaeaea"], "outside in");
  assert.equal(oldSchoolToken("--panel-array-empty-background"), "#ebebeb");
  assert.equal(oldSchoolToken("--panel-array-empty-text"), "#878787");
  assert.equal(oldSchoolToken("--panel-array-greyed-body"), "#c9c9c9");
});

// array-typing/panel-all-top.png: a numeric indicator array's shell is 61 × 33, a 4 px bevel round a 53 × 25 element
// with no incrementer; past the end its interior is #dbdbdb.
test("a numeric indicator array's shell is a 4 px bevel round a 53 × 25 element, as in LabVIEW", () => {
  const p = ponerYConfirmar(P.inicial(), "arr-indicator", { x: 150, y: 100 }, { type: { array: "number" }, value: [] });
  assert.deepEqual([P.caja(p.g.nodos[0]).ancho, P.caja(p.g.nodos[0]).alto], [41 + 61, 36]);
  const html = P.contenido(p, CTX);
  assert.match(html, /<span class="sd-elements" style="left:41px;top:3px;width:61px;height:33px">/);
  assert.match(html, /<span class="sd-element sd-empty" data-k="0" style="left:4px;top:4px;width:53px;height:25px">/);
  assert.equal(oldSchoolToken("--panel-array-empty-indicator-background"), "#dbdbdb");
});

// array-2d/panel-array-menu-index.png, panel-array-2d-control-empty.png and panel-array-2d-stretched.png.
test("Add Dimension and Remove Dimension on a panel array turn it into a 2D one and back", () => {
  let p = ponerYConfirmar(P.inicial(), "arr-control", { x: 150, y: 100 }, { type: { array: "number" }, value: [1, 2, 3] });
  const id = p.g.nodos[0].id;
  assert.equal(P.menuDe(p.g.nodos[0]), "context.panel-array");
  const filas = INV.hijos("context.panel-array").map((e) => e.etiqueta);
  assert.deepEqual(filas.slice(-5), ["Add Dimension", "Remove Dimension", "Add Element Gap", "Export", "Properties"], "the panel menu has no Size to Widest Element");

  // Remove Dimension is greyed on a 1D array.
  let abierto = ED.abrirMenu(p, "context.panel-array", id, 0, 0);
  assert.match(D.menuContextual(INV, abierto.menu, ED.marcados(abierto), undefined, ED.variantes(abierto)), /item-menu desactivado" data-id="context.panel-array.remove-dimension"/);
  p = ED.orden(abierto, "context.panel-array.add-dimension", CTX);
  const control = p.g.nodos[0];
  assert.deepEqual([control.config.type, CV.currentValue(control)], [{ array: "number", dims: 2 }, [[1, 2, 3]]]);

  // Two index fields 28 px apart in a 41 px column; the box is 65 × columns + 7 wide and 26 × rows + 5 tall.
  const k = P.caja(control);
  assert.deepEqual([k.ancho, k.alto], [41 + 65 + 7, 54], "the index column is taller than one row of elements");
  let html = P.contenido(p, CTX);
  assert.equal((html.match(/class="sd-index"/g) ?? []).length, 2);
  assert.match(html, /data-eje="fila" style="left:0px;top:0px;width:41px/);
  assert.match(html, /data-eje="columna" style="left:0px;top:28px;width:41px/);
  assert.match(html, /class="objeto-panel sd-control sd-array sd-two-dimensions/);

  // Both axes stretch from the corner handle: 3 columns and 4 rows.
  p = { ...p, seleccion: [id] };
  assert.equal((P.contenido(p, CTX).match(/data-lado="(derecha|abajo|esquina)"/g) ?? []).length, 3);
  p = P.pulsar(p, CTX, { tipo: "asa-array", id, lado: "esquina" }, { x: 300, y: 200 });
  p = P.moverA(p, CTX, { x: 300 + 2 * 65, y: 200 + 3 * 26 });
  p = P.soltar(p, CTX, FONDO, { x: 430, y: 278 });
  assert.deepEqual(p.g.nodos[0].config.visibles, [4, 3]);
  const grande = P.caja(p.g.nodos[0]);
  assert.deepEqual([grande.ancho, grande.alto], [41 + 3 * 65 + 7, 3 + 4 * 26 + 5], "stretched cells repeat every 65 px across and 26 px down");
  html = P.contenido(p, CTX);
  assert.equal((html.match(/class="sd-element[ "]/g) ?? []).length, 12);
  assert.equal((html.match(/class="sd-element"/g) ?? []).length, 3, "the three defined elements; the rest are shown greyed");

  // The arrows move each index on its own axis and never go below 0.
  const paso = (eje, valor) => { p = P.pulsar(p, CTX, { tipo: "paso", id, paso: valor, eje }, { x: 160, y: 110 }); };
  paso("fila", 1);
  paso("columna", 1);
  paso("columna", 1);
  assert.deepEqual(p.g.nodos[0].config.indice, [1, 2]);
  paso("fila", -1);
  paso("fila", -1);
  assert.deepEqual(p.g.nodos[0].config.indice, [0, 2]);
  paso("columna", -1);
  paso("columna", -1);
  paso("columna", -1);

  // Writing in a cell beyond the value grows it with the default and addresses it by row and column.
  p = P.pulsar(p, CTX, { tipo: "elem", id, k: "1,2" }, { x: 200, y: 112 });
  assert.equal(p.edicion.elem, "1,2");
  for (const t of ["7", ",", "5"]) p = P.teclear(p, t);
  p = P.teclear(p, "Enter");
  assert.deepEqual(CV.currentValue(p.g.nodos[0]), [[1, 2, 3], [0, 0, 7.5]]);
  assert.match(P.contenido(p, CTX), /data-k="1,2"[^>]*>.*?7,5/s);

  // Remove Dimension keeps the first row and the 1D format.
  p = ED.orden(ED.abrirMenu(p, "context.panel-array", id, 0, 0), "context.panel-array.remove-dimension", CTX);
  assert.deepEqual([p.g.nodos[0].config.type, CV.currentValue(p.g.nodos[0]), p.g.nodos[0].config.visibles], [{ array: "number" }, [1, 2, 3], 3]);
  // At two dimensions Add Dimension explains the limit instead.
  p = ED.orden(ED.abrirMenu(p, "context.panel-array", id, 0, 0), "context.panel-array.add-dimension", CTX);
  abierto = ED.abrirMenu(p, "context.panel-array", id, 0, 0);
  assert.match(D.menuContextual(INV, abierto.menu, ED.marcados(abierto), undefined, ED.variantes(abierto)), /item-menu hueco" data-id="context.array-dimensions-limit"/);
});

test("a 2D indicator shows the rows the run left and ignores a value with other dimensions", () => {
  let p = ponerYConfirmar(P.inicial(), "arr-indicator", { x: 150, y: 100 }, { type: { array: "i32", dims: 2 }, value: [] });
  const id = p.g.nodos[0].id;
  p = { ...p, g: Gr.fijarConfig(p.g, id, { visibles: [2, 2] }) };
  const mostrado = (valores) => [...P.contenido({ ...p, valores }, CTX).matchAll(/<span class="sd-value"><span>([^<]*)<\/span>/g)].map((m) => m[1]);
  assert.deepEqual(mostrado({ [id]: [[1, 2], [3, 4]] }), ["1", "2", "3", "4"]);
  assert.deepEqual(mostrado({ [id]: [1, 2, 3] }), ["0", "0", "0", "0"], "a 1D value left before Add Dimension is not shown");
  assert.equal((P.contenido({ ...p, valores: { [id]: [[1]] } }, CTX).match(/class="sd-element"/g) ?? []).length, 1, "only the cell the run defined is solid");
});

// A tester on Windows saved a VI whose control was still being named: the file had no front panel.
test("a control dropped on the panel exists, with its terminal, before its label is typed", () => {
  const dropped = poner(P.inicial(), "control", { x: 100, y: 100 });
  assert.equal(dropped.g.nodos.length, 1, "the control and its terminal are in the graph");
  assert.deepEqual([dropped.edicion.etiqueta, dropped.edicion.nuevo], [true, true], "its label is waiting to be typed over");
  assert.ok(Et.graphAtRest(dropped), "so the window keeps the step and sends the graph to the diagram");
  // Typing in the label does not make the graph rest again until it is confirmed.
  const typing = P.teclear(dropped, "x");
  assert.ok(Et.graphAtRest(typing), "the typing of a new object does not hold back the object");
  assert.equal(P.confirmar(typing).g.nodos[0].label.text, "x");
});

test("a half-done edit of an existing object, or a drag, is not a graph at rest", () => {
  const placed = ponerYConfirmar(P.inicial(), "control", { x: 100, y: 100 });
  assert.ok(Et.graphAtRest(placed));
  assert.equal(Et.graphAtRest(P.editar(placed, placed.g.nodos[0].id)), false, "renaming an existing label");
  assert.equal(Et.graphAtRest(P.coger(placed, "control")), false, "a control hanging from the cursor");
});

test("a string constant dropped on the diagram exists before its text is typed", () => {
  let d = ED.moverA(ED.coger(ED.inicial(), "str-const"), CTX, { x: 100, y: 100 });
  d = ED.pulsar(d, CTX, FONDO, { x: 100, y: 100 });
  assert.equal(d.g.nodos.length, 1);
  assert.ok(d.edicion?.cadena);
  assert.ok(Et.graphAtRest(d));
});

// array-typing/panel-empty-crop.png and diag-empty-crop.png (DT-060): a fresh Array control is an 80 x 80 shell with
// a 4 px bevel, the index box on its left and no cells; its terminal is 38 x 38 with a black frame and no type tag.
test("a fresh Array control is an empty 80 x 80 shell with a black-framed terminal", () => {
  let p = ponerYConfirmar(P.inicial(), "arr-control", { x: 150, y: 100 });
  p = ponerYConfirmar(p, "arr-indicator", { x: 450, y: 100 });
  const [control] = p.g.nodos;
  assert.deepEqual(control.config.type, { array: "void" });
  const k = P.caja(control);
  assert.deepEqual([k.ancho, k.alto], [41 + 80, 80]);
  const html = P.contenido(p, CTX);
  assert.equal((html.match(/class="sd-element[ "]/g) ?? []).length, 0, "no cells to type into");
  assert.equal((html.match(/class="sd-index"/g) ?? []).length, 2);
  assert.equal((html.match(/sd-undefined/g) ?? []).length, 2);
  assert.match(html, /<span class="sd-elements"[^>]*width:80px;height:80px/);
  // No cells to type into, and no handles to stretch it.
  assert.equal(P.pulsar({ ...p, seleccion: [control.id] }, CTX, { tipo: "elem", id: control.id, k: 0 }, { x: 200, y: 112 }).edicion ?? null, null);
  assert.doesNotMatch(P.contenido({ ...p, seleccion: [control.id] }, CTX), /class="asa-array"/);
  // Its terminal on the diagram: black frame (not a type color) and the generic array drawing, with no tag.
  const bd = D.contenido({ ...ED.inicial(), g: p.g }, CTX, Gr.tipos(p.g, CAT));
  assert.equal((bd.match(/class="glifo-terminal-panel"/g) ?? []).length, 2);
  assert.match(bd, />123</);
  assert.doesNotMatch(bd, new RegExp(COLORES.flotante));
  assert.match(G.terminalArrayIndefinido(true), /viewBox="0 0 38 38"/);
  assert.doesNotMatch(G.terminalArrayIndefinido(true), /<text[^>]*>(DBL|I32|abc)</);
});

// array-typing/ reports, stage 1 Q3-Q5 and stage 2 Q5e (DT-060): the element dropped into an empty shell types the array.
const dropOnShell = (p, shellId, block, config) => {
  const box = P.caja(p.g.nodos.find((n) => n.id === shellId));
  const inside = { x: box.x + box.casilla + 40, y: box.y + 40 };
  return P.pulsar(P.moverA(P.coger(p, block, config), CTX, inside), CTX, FONDO, inside);
};
const freshShell = (block = "arr-control") => {
  const p = ponerYConfirmar(P.inicial(), block, { x: 150, y: 100 });
  return [p, p.g.nodos[0].id];
};

test("an element dropped into an empty panel Array types it and decides control or indicator", () => {
  const cases = [
    ["control", undefined, "arr-control", "number"],
    ["control", { type: "i32" }, "arr-control", "i32"],
    ["indicator", undefined, "arr-indicator", "number"],
    ["str-control", undefined, "arr-control", "string"],
    ["str-indicator", undefined, "arr-indicator", "string"],
    ["bool-control", undefined, "arr-control", "boolean"],
    ["bool-indicator", undefined, "arr-indicator", "boolean"],
    ["control", { type: { enum: ["a", "b"] } }, "arr-control", { enum: ["a", "b"] }],
  ];
  for (const [block, config, arrayBlock, elementType] of cases) {
    const [p0, id] = freshShell();
    const p = dropOnShell(p0, id, block, config);
    assert.equal(p.g.nodos.length, 1, `${block}: no new panel object`);
    const [array] = p.g.nodos;
    assert.equal(array.id, id);
    assert.equal(array.tipo, arrayBlock, block);
    assert.deepEqual(array.config.type, { array: elementType });
    assert.deepEqual(array.config.value, []);
    assert.equal(array.label.text, "Array", "keeps its label");
  }
});

test("flipping a typed-by-drop Array to an indicator keeps its wire", () => {
  let [p, id] = freshShell();
  const made = Gr.crearNodo(p.g, CAT, "array-size", 400, 100);
  const wired = Gr.conectar(made.g, CAT, { nodo: id, puerto: "result", dir: "out" }, { nodo: made.id, puerto: "array", dir: "in" });
  p = { ...p, g: wired.g ?? wired };
  assert.equal(p.g.cables.length, 1);
  const q = dropOnShell(p, id, "indicator");
  assert.equal(q.g.nodos.find((n) => n.id === id).tipo, "arr-indicator");
  assert.equal(q.g.cables.length, 1, "the wire stays");
  assert.equal(q.g.cables[0].de.nodo, id);
  assert.equal(q.g.cables[0].de.puerto, "value");
  Gr.tipos(q.g, CAT); // resolving it does not throw
});

test("an Array, a graph or a cluster dropped on an empty shell, and any element on a typed one, are not nested", () => {
  for (const block of ["arr-control", "waveform-chart", "cluster-control"]) {
    const [p0, id] = freshShell();
    const p = dropOnShell(p0, id, block);
    assert.equal(p.g.nodos.length, 2, `${block} lands as a separate object`);
    assert.deepEqual(p.g.nodos.find((n) => n.id === id).config.type, { array: "void" });
  }
  const [p0, id] = freshShell();
  const typed = dropOnShell(p0, id, "control");
  const again = dropOnShell(typed, id, "str-control");
  assert.equal(again.g.nodos.length, 2, "a typed array does not take a second element");
  assert.deepEqual(again.g.nodos.find((n) => n.id === id).config.type, { array: "number" });
});

test("dropping into a shell is one undo step", () => {
  const [p0, id] = freshShell();
  let history = UH.nuevo(p0.g);
  const p = dropOnShell(p0, id, "str-control");
  history = UH.registrar(history, p.g);
  assert.equal(history.antes.length, 1);
  assert.deepEqual(UH.deshacer(history).g.nodos[0].config.type, { array: "void" });
});

// array-typing/menus-*.png and reports/2026-10-18-array-element-menus.md: the element of a typed array has a menu of
// its own; the index and the margin of the shell keep the array's, and an empty array has no element.
const menuHtml = (opened) => D.menuContextual(INV, opened.menu, ED.marcados(opened), undefined, ED.variantes(opened));
const rowsOf = (html) => [...html.matchAll(/data-id="([^"]+)"[^>]*><span class="texto-menu"[^>]*>([^<]*)</g)].map((m) => m[2]);
const typedPanelArray = (block, config) => {
  const p = ponerYConfirmar(P.inicial(), block, { x: 150, y: 100 }, config);
  return [p, p.g.nodos[0].id];
};

test("the element of a typed panel array has its own menu and Representation retypes the whole array", () => {
  let [p, id] = typedPanelArray("arr-control", { type: { array: "number" }, value: [1.4, 2.6, 3] });
  // On the element: the element's menu (numeric, string or Boolean); elsewhere on the array: the array's.
  assert.equal(P.menuDe(p.g.nodos[0], true), "context.panel-array-element");
  assert.equal(P.menuDe(p.g.nodos[0], false), "context.panel-array");
  assert.equal(P.menuDe({ ...p.g.nodos[0], config: { type: { array: "string" } } }, true), "context.panel-array-element-string");
  assert.equal(P.menuDe({ ...p.g.nodos[0], config: { type: { array: "boolean" } } }, true), "context.panel-array-element-boolean");
  assert.equal(P.menuDe({ ...p.g.nodos[0], config: { type: { array: "void" } } }, true), "context.panel-array", "an empty array has no element");

  // The rows of the control's element, in the order of menus-numeric-control-element.png, and Representation ticked on DBL.
  let opened = ED.abrirMenu(p, "context.panel-array-element", id, 0, 0);
  let html = menuHtml(opened);
  assert.deepEqual(rowsOf(html), [
    "Visible Items", "Change to Indicator", "Change to Element", "Make Type Def.", "Description and Tip...", "Find", "Create", "Replace",
    "Data Operations", "Advanced", "Fit Control to Pane", "Scale Object with Pane", "Representation", "Data Entry...", "Display Format...", "Properties",
  ]);
  assert.match(html, /class="item-menu hueco" data-id="context.panel-array-element.replace"/, "what is not built is a greyed hole");
  assert.ok(ED.marcados(opened).has("context.panel-array-element.representation.dbl"));

  // Representation: the whole array becomes I32, with its values rounded, and the terminal tag follows.
  p = ED.orden(opened, "context.panel-array-element.representation.i32", CTX);
  assert.deepEqual(p.g.nodos[0].config.type, { array: "i32" });
  assert.deepEqual(CV.currentValue(p.g.nodos[0]) ?? p.g.nodos[0].config.value, [1, 3, 3]);
  assert.match(D.contenido({ ...ED.inicial(), g: p.g }, CTX, Gr.tipos(p.g, CAT)), />I32</);
  opened = ED.abrirMenu(p, "context.panel-array-element", id, 0, 0);
  assert.ok(ED.marcados(opened).has("context.panel-array-element.representation.i32"));
  assert.ok(!ED.marcados(opened).has("context.panel-array-element.representation.dbl"));

  // A 2D array keeps its dimensions, and a typed value is converted per cell.
  p = ED.orden(ED.abrirMenu(p, "context.panel-array", id, 0, 0), "context.panel-array.add-dimension", CTX);
  p = ED.orden(ED.abrirMenu(p, "context.panel-array-element", id, 0, 0), "context.panel-array-element.representation.u8", CTX);
  assert.deepEqual(p.g.nodos[0].config.type, { array: "u8", dims: 2 });

  // One undo step.
  const before = ponerYConfirmar(P.inicial(), "arr-control", { x: 150, y: 100 }, { type: { array: "number" }, value: [1.4] });
  const changed = ED.orden(ED.abrirMenu(before, "context.panel-array-element", before.g.nodos[0].id, 0, 0), "context.panel-array-element.representation.i32", CTX);
  const history = UH.registrar(UH.nuevo(before.g), changed.g);
  assert.equal(history.antes.length, 1);
  assert.deepEqual(UH.deshacer(history).g.nodos[0].config.type, { array: "number" });
});

test("the indicator's element menu says Change to Control and has Adapt To Source instead of Data Entry; string and Boolean differ in their tails", () => {
  const [p, id] = typedPanelArray("arr-indicator", { type: { array: "number" }, value: [] });
  const html = menuHtml(ED.abrirMenu(p, "context.panel-array-element", id, 0, 0));
  assert.deepEqual(rowsOf(html).filter((row) => /Control|Adapt|Data Entry|Representation|Display Format/.test(row)), ["Change to Control", "Fit Control to Pane", "Adapt To Source", "Representation", "Display Format..."]);
  assert.equal((html.match(/class="separador-menu"/g) ?? []).length, 5, "Adapt To Source opens the group that Representation opens on a control");

  const [ps, ids] = typedPanelArray("arr-control", { type: { array: "string" }, value: [] });
  const stringMenu = ED.abrirMenu(ps, "context.panel-array-element-string", ids, 0, 0);
  assert.deepEqual(rowsOf(menuHtml(stringMenu)).slice(-9), [
    "Representation", "Normal Display", "'\\' Codes Display", "Password Display", "Hex Display", "Limit to Single Line", "Update Value while Typing", "Enable Wrapping", "Properties",
  ]);
  const ticked = ED.marcados(stringMenu);
  assert.ok(ticked.has("context.panel-array-element-string.normal-display") && ticked.has("context.panel-array-element-string.enable-wrapping"));
  assert.ok(!ticked.has("context.panel-array-element-string.hex-display"));

  const [pb, idb] = typedPanelArray("arr-control", { type: { array: "boolean" }, value: [] });
  assert.deepEqual(rowsOf(menuHtml(ED.abrirMenu(pb, "context.panel-array-element-boolean", idb, 0, 0))).slice(-3), ["Scale Object with Pane", "Mechanical Action", "Properties"]);
});

test("Change to Indicator on an array or on its element flips the whole array and keeps its wires", () => {
  const [p0, id] = typedPanelArray("arr-control", { type: { array: "number" }, value: [1, 2] });
  const made = Gr.crearNodo(p0.g, CAT, "array-size", 400, 100);
  const wired = Gr.conectar(made.g, CAT, { nodo: id, puerto: "result", dir: "out" }, { nodo: made.id, puerto: "array", dir: "in" });
  const p = { ...p0, g: wired.g ?? wired };
  for (const root of ["context.panel-array", "context.panel-array-element"]) {
    const flipped = ED.orden(ED.abrirMenu(p, root, id, 0, 0), `${root}.change-to-indicator`, CTX);
    const array = flipped.g.nodos.find((n) => n.id === id);
    assert.equal(array.tipo, "arr-indicator", root);
    assert.deepEqual(array.config.type, { array: "number" });
    assert.deepEqual(array.config.value, [1, 2]);
    assert.equal(flipped.g.cables.length, 1, "the wire stays");
    assert.equal(flipped.g.cables[0].de.puerto, "value");
    Gr.tipos(flipped.g, CAT); // resolving it does not throw
    // The indicator offers the way back, with the same row renamed.
    const back = ED.abrirMenu(flipped, root, id, 0, 0);
    assert.match(menuHtml(back), new RegExp(`data-id="${root}.change-to-indicator"[^>]*><span class="texto-menu"[^>]*>Change to Control<`));
    assert.equal(ED.orden(back, `${root}.change-to-indicator`, CTX).g.nodos.find((n) => n.id === id).tipo, "arr-control");
    // One undo step.
    const history = UH.registrar(UH.nuevo(p.g), flipped.g);
    assert.equal(history.antes.length, 1);
    assert.equal(UH.deshacer(history).g.nodos.find((n) => n.id === id).tipo, "arr-control");
  }
});

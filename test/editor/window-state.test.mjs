// Rules 53 and 53b: what happens when an element is activated. No browser
// needed: window-state.mjs is pure functions.

import assert from "node:assert/strict";
import { test } from "node:test";

import { abrirSubpaleta, cerrarSubpaletas, clic, clicDerecho, clicFuera, escape, inicial, paletaNueva, tecla } from "../../editor/src/window/window-state.mjs";
import { cargarInventario, esHueco } from "../../editor/src/common/labview-inventory.mjs";
import { celdasSubpaleta, idsPintados, paleta, subpaletas } from "../../editor/src/window/window-view.mjs";
import { ultimo } from "../../editor/src/common/labview-inventory.mjs";
import { INV } from "../helpers.mjs";

const AQUI = { x: 10, y: 20 };
const conPaleta = () => ({ ...inicial(), paleta: paletaNueva("palette.functions", 40, 30) });

test("activar un hueco solo muestra su explicación", () => {
  const id = "window.block-diagram.toolbar.run-continuously";
  const abierto = clic(inicial(), INV, id, AQUI);
  assert.deepEqual(abierto, { abierta: { id, x: 10, y: 20 }, paleta: null, menuBarra: null });
  assert.equal(escape(abierto).abierta, null, "Esc la cierra");
});

test("el clic derecho en el diagrama abre la paleta de funciones", () => {
  const e = clicDerecho(inicial(), INV, "block-diagram", { x: 300, y: 200 });
  assert.equal(e.paleta.raiz, "palette.functions");
  assert.deepEqual([e.paleta.x, e.paleta.y], [300, 200]);
  assert.deepEqual(e.paleta.desplegadas, ["palette.functions.programming"]);
  assert.equal(e.abierta, null);
});

// Como en paletas/controls.png: Modern desplegada, con sus doce carpetas, y las
// categorías de los otros estilos debajo.
test("el clic derecho en el panel abre la paleta de controles con modern desplegada", () => {
  const e = clicDerecho(inicial(), INV, "front-panel", AQUI);
  assert.equal(e.paleta.raiz, "palette.controls");
  assert.deepEqual(e.paleta.desplegadas, ["palette.controls.modern"]);
  assert.equal(e.abierta, null);
  const ids = idsPintados(paleta(INV, e.paleta));
  assert.equal(ids.filter((id) => id.startsWith("palette.controls.modern.")).length, 12);
  assert.ok(ids.indexOf("palette.controls.silver") > ids.indexOf("palette.controls.modern.refnum"));
  assert.ok(!ids.includes("palette.controls.user-controls"), "las categorías ocultas no salen hasta pedirlas");
});

// paletas/controls-numeric.png: la subpaleta, en una rejilla de cuatro columnas,
// con el control y el indicador numéricos hechos y el resto como huecos.
test("la carpeta numeric de controls abre su subpaleta", () => {
  const id = "palette.controls.modern.numeric";
  const conControles = { ...inicial(), paleta: paletaNueva("palette.controls", 40, 30) };
  const abierta = clic(conControles, INV, id, AQUI);
  assert.deepEqual(abierta.paleta.cascada, [{ id, x: 10, y: 20 }]);
  const html = subpaletas(INV, abierta.paleta);
  const ids = idsPintados(html).filter((i) => i.startsWith(`${id}.`) && !i.endsWith("thumbtack"));
  assert.equal(ids.length, 21);
  assert.deepEqual(ids.slice(0, 2), [`${id}.numeric-control`, `${id}.numeric-indicator`]);
  assert.match(html, new RegExp(`class="icono-funcion" data-id="${id}\\.numeric-control"`), "el control está hecho");
  assert.match(html, new RegExp(`class="icono-funcion hueco" data-id="${id}\\.knob"`), "un mando es un hueco");
  assert.equal(clic(abierta, INV, `${id}.numeric-indicator`, AQUI, 1).abierta, null, "un control hecho no se explica: se coge");
});

// El único elemento hecho del inventario: las flechas dobles enseñan y
// esconden las categorías ocultas.
test("las flechas dobles muestran lo oculto", () => {
  const id = "palette.functions.double-arrows";
  const antes = conPaleta();
  const despues = clic(antes, INV, id, AQUI);
  assert.equal(despues.paleta.verOcultas, true);
  assert.equal(despues.abierta, null, "estar hecho no abre ninguna explicación");
  assert.ok(idsPintados(paleta(INV, despues.paleta)).includes("palette.functions.favorites"));
  assert.equal(clic(despues, INV, id, AQUI).paleta.verOcultas, false);
});

// Regla 53b: una categoría con contenido declarado se abre y se cierra.
test("una categoría con contenido se abre y se cierra", () => {
  const id = "palette.functions.programming";
  const cerrada = clic(conPaleta(), INV, id, AQUI);
  assert.deepEqual(cerrada.paleta.desplegadas, []);
  assert.equal(cerrada.abierta, null, "abrir o cerrar un contenedor no es activar un hueco");
  assert.deepEqual(clic(cerrada, INV, id, AQUI).paleta.desplegadas, [id]);
});

test("una categoría sin contenido explica lo que falta", () => {
  assert.equal(clic(conPaleta(), INV, "palette.functions.measurement-io", AQUI).abierta.id, "palette.functions.measurement-io");
  assert.equal(clic(conPaleta(), INV, "palette.functions.programming.cluster-class-and-variant", AQUI).abierta.id, "palette.functions.programming.cluster-class-and-variant");
});

// Regla 53b en una rejilla: la carpeta con contenido abre su subpaleta al lado,
// como en paletas/functions-numeric.png, y no una explicación.
test("una carpeta con contenido abre su subpaleta al lado", () => {
  const id = "palette.functions.programming.numeric";
  const abierta = clic(conPaleta(), INV, id, AQUI);
  assert.deepEqual(abierta.paleta.cascada, [{ id, x: 10, y: 20 }]);
  assert.equal(abierta.abierta, null);
  assert.equal(abrirSubpaleta(abierta, INV, id, 0, { x: 99, y: 99 }), abierta, "pasar otra vez por ella no la mueve");
  assert.ok(idsPintados(subpaletas(INV, abierta.paleta)).includes(`${id}.add`));
  assert.deepEqual(cerrarSubpaletas(abierta, 0).paleta.cascada, [], "otra carpeta de la paleta la cierra");
  assert.deepEqual(clic(abierta, INV, "palette.functions.programming", AQUI).paleta.cascada, [], "plegar su categoría la cierra");
  assert.deepEqual(escape(abierta), inicial());
});

test("una carpeta de una subpaleta sin contenido explica lo que falta", () => {
  const abierta = clic(conPaleta(), INV, "palette.functions.programming.numeric", AQUI);
  const id = "palette.functions.programming.numeric.scaling";
  const e = clic(abierta, INV, id, AQUI, 1);
  assert.equal(e.abierta.id, id);
  assert.equal(e.paleta.cascada.length, 1, "la subpaleta sigue abierta");
  assert.equal(clic(abierta, INV, "palette.functions.programming.numeric.add", AQUI, 1).abierta, null, "una función hecha no se explica: se coge");
});

test("un clic fuera cierra la paleta y la explicación", () => {
  const abierto = clic(conPaleta(), INV, "palette.functions.measurement-io", AQUI);
  const dentro = clicFuera(abierto, { enPaleta: true, enExplicacion: false });
  assert.ok(dentro.paleta, "un clic dentro de la paleta la deja abierta");
  assert.equal(dentro.abierta, null);
  assert.deepEqual(clicFuera(abierto, { enPaleta: false, enExplicacion: false }), inicial());
});

// Regla 53 con el teclado. El inventario del proyecto aún no declara atajos,
// así que se prueba con uno pequeño.
test("el atajo de un hueco muestra su explicación", () => {
  const inv = cargarInventario({
    version: 1,
    referencia: "LabVIEW 2026Q3",
    desbloqueos: { deshacer: { desc: "Historial de operaciones" } },
    entradas: [
      { id: "window.block-diagram", etiqueta: "Block Diagram", estado: "todo", labview: "d", necesita: "deshacer" },
      { id: "window.block-diagram.menu.edit", etiqueta: "Edit", estado: "todo", labview: "e", necesita: "deshacer" },
      { id: "window.block-diagram.menu.edit.undo", etiqueta: "Undo", estado: "todo", labview: "u", necesita: "deshacer", atajo: "Ctrl+Z" },
    ],
  });
  const anclaDe = (id) => (id === "window.block-diagram.menu.edit" ? { x: 5, y: 6 } : null);
  const ctrlZ = { ctrl: true, shift: false, alt: false, tecla: "z" };
  const e = tecla(inicial(), inv, "window.block-diagram", ctrlZ, anclaDe);
  assert.deepEqual(e.abierta, { id: "window.block-diagram.menu.edit.undo", x: 5, y: 6, ancla: "window.block-diagram.menu.edit" }, "se ancla en su menú");
  assert.deepEqual(tecla(inicial(), inv, "window.block-diagram", { ...ctrlZ, shift: true }, anclaDe), inicial(), "otra combinación no abre nada");
  assert.deepEqual(tecla(inicial(), inv, "window.front-panel", ctrlZ, anclaDe), inicial(), "el atajo es de su ventana");
});

// paletas/functions-boolean.png, capturada en LabVIEW 2026 Q3: cinco columnas,
// con la segunda fila corta tras Implies y las constantes en la cuarta.
test("la carpeta boolean abre su subpaleta", () => {
  const id = "palette.functions.programming.boolean";
  const abierta = clic(conPaleta(), INV, id, AQUI);
  assert.deepEqual(abierta.paleta.cascada, [{ id, x: 10, y: 20 }]);
  const { columnas, sitios } = celdasSubpaleta(INV, id);
  assert.equal(columnas, 5);
  const donde = Object.fromEntries(sitios.map((s) => [s.e.id.slice(id.length + 1), [s.fila, s.columna]]));
  assert.deepEqual(donde["compound-arithmetic"], [0, 4]);
  assert.deepEqual(donde.implies, [1, 3]);
  assert.deepEqual(donde["and-array-elements"], [2, 0]);
  assert.deepEqual(donde["false-constant"], [3, 1]);
  assert.ok(!subpaletas(INV, abierta.paleta).includes("icono-funcion hueco"), "todas sus funciones están hechas");
});

// paletas/functions-comparison.png, capturada en LabVIEW 2026 Q3: tres columnas
// y 29 elementos, con las doce comparaciones arriba, Select, Max & Min e In Range
// and Coerce en la quinta fila y, tras ellas, lo que pide cadenas, arrays, rutas,
// VIs maleables o punto fijo, que son huecos.
test("la carpeta comparison abre su subpaleta", () => {
  const id = "palette.functions.programming.comparison";
  const abierta = clic(conPaleta(), INV, id, AQUI);
  assert.deepEqual(abierta.paleta.cascada, [{ id, x: 10, y: 20 }]);
  assert.equal(abierta.abierta, null, "la carpeta está hecha: se abre, no se explica");
  const { columnas, sitios } = celdasSubpaleta(INV, id);
  assert.equal(columnas, 3);
  assert.equal(sitios.length, 29, "los 29 elementos de la captura; la chincheta va en el título");
  const donde = Object.fromEntries(sitios.map((s) => [s.e.id.slice(id.length + 1), [s.fila, s.columna]]));
  assert.deepEqual(donde.equal, [0, 0]);
  assert.deepEqual(donde["less-or-equal-to-0"], [3, 2]);
  assert.deepEqual(donde.select, [4, 0]);
  assert.deepEqual(donde["max-and-min"], [4, 1]);
  assert.deepEqual(donde["in-range-and-coerce"], [4, 2]);
  assert.deepEqual(donde["not-a-number-path-refnum"], [5, 0]);
  assert.deepEqual(donde["fixed-point-overflow"], [9, 1]);
  const huecos = INV.hijos(id).filter((e) => esHueco(e) && !e.id.endsWith(".thumbtack"));
  assert.equal(huecos.length, 8, "lo que pide arrays, rutas, VIs maleables, punto fijo y lo que no se ha medido (Printable?, Lexical Class)");
});

// run/timing-paleta.png, capturada en LabVIEW 2026 Q3: cuatro columnas y 15
// elementos. Hechos los tres que miden el tiempo con el reloj de milisegundos.
test("la carpeta timing abre su subpaleta", () => {
  const id = "palette.functions.programming.timing";
  const abierta = clic(conPaleta(), INV, id, AQUI);
  assert.equal(abierta.abierta, null, "la carpeta está hecha: se abre, no se explica");
  const { columnas, sitios } = celdasSubpaleta(INV, id);
  assert.equal(columnas, 4);
  assert.equal(sitios.length, 15);
  const donde = Object.fromEntries(sitios.map((s) => [s.e.id.slice(id.length + 1), [s.fila, s.columna]]));
  assert.deepEqual(donde["tick-count-ms"], [0, 0]);
  assert.deepEqual(donde["wait-ms"], [0, 2]);
  assert.deepEqual(donde["wait-until-next-ms-multiple"], [0, 3]);
  assert.deepEqual(donde["time-stamp-constant"], [3, 2]);
  const hechos = INV.hijos(id).filter((e) => !esHueco(e)).map((e) => e.id.slice(id.length + 1));
  assert.deepEqual(hechos, ["tick-count-ms", "wait-ms", "wait-until-next-ms-multiple"]);
});

// structures/paleta.png y nombres.png, capturadas en LabVIEW 2026 Q3: cuatro
// columnas y 16 elementos. Hechos el For Loop, el While Loop y el Case Structure; los demás, en gris.
test("la carpeta structures abre su subpaleta", () => {
  const id = "palette.functions.programming.structures";
  const abierta = clic(conPaleta(), INV, id, AQUI);
  assert.equal(abierta.abierta, null, "la carpeta está hecha: se abre, no se explica");
  const { columnas, sitios } = celdasSubpaleta(INV, id);
  assert.equal(columnas, 4);
  const nombres = [
    ["For Loop", "While Loop", "Timed Structures", "Case Structure"],
    ["Event Structure", "In Place Element Structure", "Flat Sequence Structure", "Formula Node"],
    ["Diagram Disable Structure", "Conditional Disable Structure", "Type Specialization Structure", "Shared Variable"],
    ["Local Variable", "Global Variable", "Decorations", "Feedback Node"],
  ];
  assert.deepEqual(sitios.map((s) => [s.fila, s.columna, s.e.etiqueta]), nombres.flatMap((fila, f) => fila.map((n, c) => [f, c, n])));
  const hechos = INV.hijos(id).filter((e) => !esHueco(e)).map((e) => e.id.slice(id.length + 1));
  assert.deepEqual(hechos, ["for-loop", "while-loop", "case-structure", "flat-sequence-structure"]);
  assert.equal(INV.entrada(`${id}.while-loop`).bloque, "while-loop");
  assert.equal(INV.entrada(`${id}.for-loop`).bloque, "for-loop");
  assert.equal(INV.entrada(`${id}.case-structure`).bloque, "case-structure");
  assert.equal(INV.entrada(`${id}.flat-sequence-structure`).bloque, "flat-sequence");
  // Las carpetas de dentro (Timed Structures, Decorations) se pintan como carpetas, y los huecos, en gris.
  const html = subpaletas(INV, abierta.paleta);
  assert.match(html, new RegExp(`class="icono-funcion" data-id="${id}\\.while-loop"`));
  assert.match(html, new RegExp(`class="icono-funcion hueco" data-id="${id}\\.event-structure"`));
  assert.match(html, new RegExp(`class="carpeta hueco" data-id="${id}\\.timed-structures"`));
});

// front-panel/menu-file.png: el menú se abre bajo su título, que se resalta; sus
// filas llevan el atajo en una segunda columna, y los huecos se explican.
test("el menú file se abre bajo su título con sus atajos", async () => {
  const { menuContextual } = await import("../../editor/src/block-diagram/diagram-view.mjs");
  const { ventana } = await import("../../editor/src/window/window-view.mjs");
  const id = "window.front-panel.menu.file";
  const e = clic(inicial(), INV, id, { x: 4, y: 20 });
  assert.deepEqual(e.menuBarra, { id, x: 4, y: 20, abierto: null });
  assert.match(ventana(INV, "front-panel", e), /class="menu abierto" data-id="window\.front-panel\.menu\.file"/);
  const html = menuContextual(INV, { raiz: id, x: 4, y: 20 });
  assert.equal(idsPintados(html).length, 21);
  assert.match(html, /data-id="window\.front-panel\.menu\.file\.save"[^>]*>.*?<span class="atajo-menu"[^>]*>Ctrl\+S</);
  assert.match(html, /class="item-menu hueco" data-id="window\.front-panel\.menu\.file\.save-all"/);
  assert.equal((html.match(/separador-menu/g) ?? []).length, 6, "los separadores de la captura");
  assert.equal(clic(e, INV, id, { x: 4, y: 20 }).menuBarra, null, "pulsarlo otra vez lo cierra");
  assert.equal(escape(e).menuBarra, null);
});

// paletas/controls-boolean.png, capturada en LabVIEW 2026 Q3: tres columnas y
// trece elementos; los nombres, de pasar el ratón por cada uno.
test("la carpeta boolean de controls abre su subpaleta", () => {
  const id = "palette.controls.modern.boolean";
  const conControles = { ...inicial(), paleta: paletaNueva("palette.controls", 40, 30) };
  const abierta = clic(conControles, INV, id, AQUI);
  assert.deepEqual(abierta.paleta.cascada, [{ id, x: 10, y: 20 }]);
  const { columnas, sitios } = celdasSubpaleta(INV, id);
  assert.equal(columnas, 3);
  const nombres = [
    ["Push Button", "Rocker", "Vert Rocker"],
    ["Round LED", "Horizontal Toggle Switch", "Vertical Toggle Switch"],
    ["Square LED", "Slide Switch", "Vertical Slide Switch"],
    ["OK Button", "Cancel Button", "Stop Button"],
    ["Radio Buttons"],
  ];
  assert.deepEqual(sitios.map((s) => [s.fila, s.columna, s.e.etiqueta]), nombres.flatMap((fila, f) => fila.map((n, c) => [f, c, n])));
  const html = subpaletas(INV, abierta.paleta);
  for (const hecho of ["push-button", "round-led", "horizontal-toggle-switch", "square-led", "stop-button"]) {
    assert.match(html, new RegExp(`class="icono-funcion" data-id="${id}\\.${hecho}"`), `${hecho} está hecho`);
  }
  for (const hueco of ["rocker", "vert-rocker", "radio-buttons"]) {
    assert.match(html, new RegExp(`class="icono-funcion hueco" data-id="${id}\\.${hueco}"`), `${hueco} es un hueco`);
  }
  assert.equal(clic(abierta, INV, `${id}.push-button`, AQUI, 1).abierta, null, "un control hecho no se explica: se coge");
  // Con la carpeta Boolean hecha, Modern ya no la pinta como hueco.
  assert.doesNotMatch(paleta(INV, { ...conControles.paleta, desplegadas: ["palette.controls.modern"] }), new RegExp(`carpeta hueco" data-id="${id}"`));
});

// paletas/functions-programming.png y string/string-subpaleta.png, capturadas en
// LabVIEW 2026 Q3: cinco columnas y 28 elementos, de String Length a End Of Line
// Constant; cuatro de ellos son carpetas.
test("la carpeta string abre su subpaleta", () => {
  const id = "palette.functions.programming.string";
  const abierta = clic(conPaleta(), INV, id, AQUI);
  assert.deepEqual(abierta.paleta.cascada, [{ id, x: 10, y: 20 }]);
  assert.equal(abierta.abierta, null, "la carpeta está hecha: se abre, no se explica");
  const { columnas, sitios } = celdasSubpaleta(INV, id);
  assert.equal(columnas, 5);
  assert.equal(sitios.length, 28, "los 28 elementos de la captura; la chincheta va en el título");
  const nombres = [
    ["String Length", "Concatenate Strings", "String Subset", "Trim Whitespace.vi", "Normalize End Of Line.vi"],
    ["Replace Substring", "Search and Replace String", "Match Pattern", "Match Regular Expression", "Path/Array/String Conversion"],
    ["Scan From String", "Format Into String", "Format Date/Time String", "Build Text", "Number/String Conversion"],
    ["Spreadsheet String To Array", "Array To Spreadsheet String", "To Upper Case", "To Lower Case", "Flatten/Unflatten String"],
    ["String Constant", "Empty String Constant", "Space Constant", "Tab Constant", "Additional String Functions"],
    ["Carriage Return Constant", "Line Feed Constant", "End Of Line Constant"],
  ];
  assert.deepEqual(sitios.map((s) => [s.fila, s.columna, s.e.etiqueta]), nombres.flatMap((fila, f) => fila.map((n, c) => [f, c, n])));
  // Lo hecho y lo que está en gris.
  const hechos = INV.hijos(id).filter((e) => !esHueco(e) && e.bloque).map((e) => ultimo(e.id));
  assert.deepEqual(hechos, ["string-length", "concatenate-strings", "string-subset", "trim-whitespace", "replace-substring", "search-and-replace-string", "scan-from-string", "format-into-string", "to-upper-case", "to-lower-case", "string-constant", "empty-string-constant", "space-constant", "tab-constant", "carriage-return-constant", "line-feed-constant", "end-of-line-constant"]);
  const html = subpaletas(INV, abierta.paleta);
  assert.match(html, new RegExp(`class="icono-funcion" data-id="${id}\\.string-length"`));
  assert.match(html, new RegExp(`class="icono-funcion hueco" data-id="${id}\\.match-pattern"`));
  assert.match(html, new RegExp(`class="carpeta" data-id="${id}\\.number-string-conversion"`), "una carpeta con algo hecho no se pinta como hueco");
  assert.match(html, new RegExp(`class="carpeta hueco" data-id="${id}\\.flatten-unflatten-string"`));
  assert.equal(clic(abierta, INV, `${id}.string-length`, AQUI, 1).abierta, null, "una función hecha no se explica: se coge");
});

// string/string-numstr-abierta.png: siete columnas; la segunda fila, cuatro funciones y Scan Value al final.
test("la carpeta number-string conversion abre su subpaleta", () => {
  const padre = "palette.functions.programming.string";
  const id = `${padre}.number-string-conversion`;
  const abierta = clic(clic(conPaleta(), INV, padre, AQUI), INV, id, AQUI, 1);
  assert.equal(abierta.paleta.cascada.length, 2, "se abre en cascada, al lado de String");
  assert.equal(abierta.abierta, null);
  const { columnas, sitios } = celdasSubpaleta(INV, id);
  assert.equal(columnas, 7);
  assert.equal(sitios.length, 12);
  const donde = Object.fromEntries(sitios.map((s) => [ultimo(s.e.id), [s.fila, s.columna]]));
  assert.deepEqual(donde["number-to-decimal-string"], [0, 0]);
  assert.deepEqual(donde["format-value"], [0, 6]);
  assert.deepEqual(donde["decimal-string-to-number"], [1, 0]);
  assert.deepEqual(donde["fract-exp-string-to-number"], [1, 3]);
  assert.deepEqual(donde["scan-value"], [1, 6]);
  assert.deepEqual(INV.hijos(id).filter((e) => esHueco(e) && !e.id.endsWith(".thumbtack")).map((e) => ultimo(e.id)), ["format-value", "scan-value"]);
});

// string/string-additional-abierta.png: cuatro columnas y 13 elementos; Rotate String y Reverse String, hechos.
test("la carpeta additional string functions abre su subpaleta", () => {
  const id = "palette.functions.programming.string.additional-string-functions";
  const { columnas, sitios } = celdasSubpaleta(INV, id);
  assert.equal(columnas, 4);
  assert.equal(sitios.length, 13);
  const donde = Object.fromEntries(sitios.map((s) => [ultimo(s.e.id), [s.fila, s.columna]]));
  assert.deepEqual(donde["search-split-string"], [0, 0]);
  assert.deepEqual(donde["rotate-string"], [2, 0]);
  assert.deepEqual(donde["reverse-string"], [2, 1]);
  assert.deepEqual(donde["create-ni-guid"], [3, 0]);
  assert.deepEqual(INV.hijos(id).filter((e) => !esHueco(e)).map((e) => ultimo(e.id)), ["rotate-string", "reverse-string"]);
});

// controls-string-path.png: tres columnas y cinco elementos; los dos de cadena, hechos, y el resto, en gris.
test("la carpeta string and path de controls abre su subpaleta", () => {
  const id = "palette.controls.modern.string-and-path";
  const conControles = { ...inicial(), paleta: paletaNueva("palette.controls", 40, 30) };
  const abierta = clic(conControles, INV, id, AQUI);
  assert.deepEqual(abierta.paleta.cascada, [{ id, x: 10, y: 20 }]);
  assert.equal(abierta.abierta, null);
  const { columnas, sitios } = celdasSubpaleta(INV, id);
  assert.equal(columnas, 3);
  assert.deepEqual(sitios.map((s) => [s.fila, s.columna, s.e.etiqueta]), [[0, 0, "String Control"], [0, 1, "String Indicator"], [0, 2, "Combo Box"], [1, 0, "File Path Control"], [1, 1, "File Path Indicator"]]);
  const html = subpaletas(INV, abierta.paleta);
  for (const hecho of ["string-control", "string-indicator"]) assert.match(html, new RegExp(`class="icono-funcion" data-id="${id}\\.${hecho}"`), `${hecho} está hecho`);
  for (const hueco of ["combo-box", "file-path-control", "file-path-indicator"]) assert.match(html, new RegExp(`class="icono-funcion hueco" data-id="${id}\\.${hueco}"`), `${hueco} es un hueco`);
  assert.doesNotMatch(paleta(INV, { ...conControles.paleta, desplegadas: ["palette.controls.modern"] }), new RegExp(`carpeta hueco" data-id="${id}"`));
});

// errores/59-paleta-dialog-ui.png: cuatro columnas y 23 elementos, de One Button Dialog a Help.
test("la carpeta dialog and user interface abre su subpaleta", () => {
  const id = "palette.functions.programming.dialog-and-user-interface";
  const abierta = clic(conPaleta(), INV, id, AQUI);
  assert.deepEqual(abierta.paleta.cascada, [{ id, x: 10, y: 20 }]);
  assert.equal(abierta.abierta, null, "la carpeta está hecha: se abre, no se explica");
  const { columnas, sitios } = celdasSubpaleta(INV, id);
  assert.equal(columnas, 4);
  assert.equal(sitios.length, 23);
  const nombres = [
    ["One Button Dialog", "Two Button Dialog", "Three Button Dialog.vi", "Simple Error Handler.vi"],
    ["General Error Handler.vi", "Clear Errors.vi", "Error Ring", "Merge Errors"],
    ["Error Cluster From Error Code.vi", "Find First Error.vi", "Error Cluster Constant", "Multiple Errors"],
    ["Prompt User for Input", "Display Message to User", "Write to System Log.vi", "Wait For Front Panel Activity"],
    ["Generate Front Panel Activity", "Color Box Constant", "Listbox Symbol Ring Constant", "Events"],
    ["Menu", "Cursor", "Help"],
  ];
  assert.deepEqual(sitios.map((s) => [s.fila, s.columna, s.e.etiqueta]), nombres.flatMap((fila, f) => fila.map((n, c) => [f, c, n])));
  const hechos = INV.hijos(id).filter((e) => !esHueco(e)).map((e) => ultimo(e.id));
  assert.deepEqual(hechos, ["simple-error-handler", "clear-errors", "merge-errors", "error-cluster-from-error-code", "error-cluster-constant"]);
  const html = subpaletas(INV, abierta.paleta);
  assert.match(html, new RegExp(`class="icono-funcion" data-id="${id}\\.clear-errors"`));
  assert.match(html, new RegExp(`class="icono-funcion hueco" data-id="${id}\\.error-ring"`));
  assert.match(html, new RegExp(`class="carpeta hueco" data-id="${id}\\.events"`), "las carpetas sin abrir, en gris");
  assert.equal(clic(abierta, INV, `${id}.clear-errors`, AQUI, 1).abierta, null, "una función hecha no se explica: se coge");
  assert.ok(clic(abierta, INV, `${id}.error-ring`, AQUI, 1).abierta, "un hueco se explica");
});

// errores/300-controls-data-containers.png: dos columnas y ocho elementos; los de error, hechos, y el resto, en gris.
test("la carpeta data containers de controls abre su subpaleta", () => {
  const id = "palette.controls.modern.data-containers";
  const conControles = { ...inicial(), paleta: paletaNueva("palette.controls", 40, 30) };
  const abierta = clic(conControles, INV, id, AQUI);
  assert.deepEqual(abierta.paleta.cascada, [{ id, x: 10, y: 20 }]);
  assert.equal(abierta.abierta, null);
  const { columnas, sitios } = celdasSubpaleta(INV, id);
  assert.equal(columnas, 2);
  assert.deepEqual(sitios.map((s) => [s.fila, s.columna, s.e.etiqueta]), [[0, 0, "Array"], [0, 1, "Cluster"], [1, 0, "RealMatrix.ctl"], [1, 1, "ComplexMatrix.ctl"], [2, 0, "Set"], [2, 1, "Map"], [3, 0, "Error In 3D.ctl"], [3, 1, "Error Out 3D.ctl"]]);
  const html = subpaletas(INV, abierta.paleta);
  for (const hecho of ["array", "error-in", "error-out"]) assert.match(html, new RegExp(`class="icono-funcion" data-id="${id}\\.${hecho}"`), `${hecho} está hecho`);
  for (const hueco of ["cluster", "real-matrix", "complex-matrix", "set", "map"]) assert.match(html, new RegExp(`class="icono-funcion hueco" data-id="${id}\\.${hueco}"`), `${hueco} es un hueco`);
});

// Array, de labview-captures/array/subpaleta-array-5-columnas.png: 34 elementos en 5 columnas; la última fila
// deja libre la celda de después de Remove Duplicates.
test("la carpeta array abre su subpaleta", () => {
  const id = "palette.functions.programming.array";
  const abierta = clic(conPaleta(), INV, id, AQUI);
  assert.deepEqual(abierta.paleta.cascada, [{ id, x: 10, y: 20 }]);
  assert.equal(abierta.abierta, null);
  const { columnas, sitios } = celdasSubpaleta(INV, id);
  assert.equal(columnas, 5);
  const visibles = sitios.filter((s) => s.e.etiqueta !== "Thumbtack");
  assert.equal(visibles.length, 34);
  assert.deepEqual([visibles[0], visibles[4], visibles[5], visibles[25]].map((s) => [s.fila, s.columna, s.e.etiqueta]), [[0, 0, "Array Size"], [0, 4, "Delete From Array"], [1, 0, "Initialize Array"], [5, 0, "Array Constant"]]);
  assert.deepEqual(visibles.slice(30).map((s) => [s.fila, s.columna, s.e.etiqueta]), [[6, 0, "Remove Duplicates From 1D Array"], [6, 2, "Unsorted"], [6, 3, "Sorted Array"], [6, 4, "Matrix"]]);
  const html = subpaletas(INV, abierta.paleta);
  for (const hecho of ["array-size", "sort-1d-array", "array-constant", "build-array"]) assert.match(html, new RegExp(`class="icono-funcion" data-id="${id}\\.${hecho}"`), `${hecho} está hecho`);
  for (const hueco of ["reshape-array", "sort-2d-array"]) assert.match(html, new RegExp(`class="icono-funcion hueco" data-id="${id}\\.${hueco}"`), `${hueco} es un hueco`);
  for (const carpeta of ["matrix", "unsorted", "sorted-array"]) assert.match(html, new RegExp(`hueco[^>]*data-id="${id}\\.${carpeta}"`), `${carpeta} es un hueco`);
});

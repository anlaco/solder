// Functions ▸ Programming ▸ File I/O in the editor (DT-067 §10 (a)): the palette with every subpalette as it was measured,
// the path functions and constants that are placed from it and from String ▸ Path/Array/String Conversion, and the File Path
// Control and Indicator of Controls ▸ Modern ▸ String & Path. Every position and name comes from
// labview-captures/reports/2026-10-26-file-io-palette.md §1-2 (local evidence, never committed).

import assert from "node:assert/strict";
import { test } from "node:test";

import * as Gr from "../../core/model/graph.mjs";
import * as D from "../../editor/src/block-diagram/diagram-view.mjs";
import * as ED from "../../editor/src/block-diagram/diagram-editing.mjs";
import * as G from "../../editor/src/common/glyphs.mjs";
import * as P from "../../editor/src/front-panel/front-panel.mjs";
import { esHueco, ultimo } from "../../editor/src/common/labview-inventory.mjs";
import { clic, inicial, paletaNueva } from "../../editor/src/window/window-state.mjs";
import { celdasSubpaleta, subpaletas } from "../../editor/src/window/window-view.mjs";
import { CAT, INV } from "../helpers.mjs";

const CTX = D.contexto(CAT, D.glifosPorBloque(INV), ",", undefined, "windows");
const AQUI = { x: 10, y: 20 };
const ROOT = "palette.functions.programming.file-io";
const withPalette = () => ({ ...inicial(), paleta: paletaNueva("palette.functions", 40, 30) });

/** [row, column, label] of every cell of a subpalette, the thumbtack aside. */
const cells = (id) => celdasSubpaleta(INV, id).sitios.filter((s) => ultimo(s.e.id) !== "thumbtack").map((s) => [s.fila + 1, s.columna + 1, s.e.etiqueta]);

/** [id, columns, cells] of the File I/O palette and of every subpalette one level deep, as measured. */
const GRIDS = [
  [ROOT, 4, [
    [1, 1, "Write Delimited Spreadsheet.vi"], [1, 2, "Read Delimited Spreadsheet.vi"], [1, 3, "Write To Measurement File"], [1, 4, "Read From Measurement File"],
    [2, 1, "Open/Create/Replace File"], [2, 2, "Close File"], [2, 3, "Format Into File"], [2, 4, "Scan From File"],
    [3, 1, "Write to Text File"], [3, 2, "Read from Text File"], [3, 3, "Write to Binary File"], [3, 4, "Read from Binary File"],
    [4, 1, "Build Path"], [4, 2, "Strip Path"], [4, 3, "File Constants"], [4, 4, "Configuration File VIs"],
    [5, 1, "TDM Streaming"], [5, 2, "Storage/DataPlugin"], [5, 3, "Zip"], [5, 4, "XML"],
    [6, 1, "Waveform File I/O"], [6, 4, "Advanced File Functions"]]],
  [`${ROOT}.file-constants`, 3, [
    [1, 1, "Path Constant"], [1, 2, "Current VI's Path"], [1, 3, "Get System Directory"],
    [2, 1, "Empty Path Constant"], [2, 2, "Not A Path Constant"], [2, 3, "Not a Refnum Constant"],
    [3, 1, "Default Directory"], [3, 2, "Default Data Directory"], [3, 3, "VI Library"],
    [4, 1, "Application Directory"], [4, 2, "Temporary Directory"]]],
  [`${ROOT}.configuration-file-vis`, 6, [
    [1, 1, "Open Config Data.vi"], [1, 2, "Read Key.vi"], [1, 3, "Write Key.vi"], [1, 4, "Remove Key.vi"], [1, 5, "Remove Section.vi"], [1, 6, "Close Config Data.vi"],
    [2, 2, "Get Key Names.vi"], [2, 3, "Get Section Names.vi"], [2, 5, "Not A Config Data Refnum.vi"]]],
  [`${ROOT}.tdm-streaming`, 4, [
    [1, 1, "TDMS Open"], [1, 2, "TDMS Write"], [1, 3, "TDMS Read"], [1, 4, "TDMS Close"],
    [2, 1, "TDMS List Contents"], [2, 2, "TDMS Set Properties"], [2, 3, "TDMS Get Properties"], [2, 4, "TDMS Flush"],
    [3, 1, "TDMS File Viewer"], [3, 2, "TDMS Defragment"], [3, 4, "Advanced TDMS"]]],
  [`${ROOT}.tdm-streaming.advanced-tdms`, 5, [
    [1, 1, "TDMS Advanced Open"], [1, 2, "TDMS Advanced Close"], [1, 3, "TDMS Set Channel Information"], [1, 4, "TDMS Create Scaling Information.vi"], [1, 5, "TDMS Delete Data"],
    [2, 1, "TDMS Set Next Write Position"], [2, 2, "TDMS Set Next Read Position"], [2, 3, "TDMS Reserve File Size"], [2, 4, "TDMS Convert Format.vi"],
    [3, 1, "TDMS Advanced Synchronous I/O"], [3, 2, "TDMS Advanced Asynchronous I/O"]]],
  [`${ROOT}.storage-dataplugin`, 4, [
    [1, 1, "Open Data Storage"], [1, 2, "Write Data"], [1, 3, "Read Data"], [1, 4, "Close Data Storage"],
    [2, 1, "Set Properties"], [2, 2, "Get Properties"], [2, 4, "Delete Data.vi"],
    [3, 1, "Data File Viewer"], [3, 2, "Convert to TDM or TDMS.vi"], [3, 3, "Manage DataPlugins"], [3, 4, "Advanced Storage"]]],
  [`${ROOT}.storage-dataplugin.advanced-storage`, 3, [
    [1, 1, "Get Object Info.vi"], [1, 2, "Get Property Info.vi"],
    [2, 1, "Set Property.vi"], [2, 2, "Get Property.vi"], [2, 3, "Merge Storage Refnums.vi"],
    [3, 1, "Create Query Expression.vi"], [3, 2, "Merge Query Expressions.vi"], [3, 3, "Execute Query Expression.vi"],
    [4, 1, "Refnum to ID.vi"], [4, 2, "ID to Refnum"]]],
  [`${ROOT}.zip`, 3, [[1, 1, "New Zip File.vi"], [1, 2, "Add File to Zip.vi"], [1, 3, "Close Zip File.vi"], [2, 1, "Unzip.vi"]]],
  [`${ROOT}.xml`, 1, [[1, 1, "LabVIEW Schema"]]],
  [`${ROOT}.xml.labview-schema`, 2, [
    [1, 1, "Flatten To XML"], [1, 2, "Unflatten From XML"], [2, 1, "Write to XML File.vi"], [2, 2, "Read From XML File.vi"], [3, 1, "Escape XML.vi"], [3, 2, "Unescape XML.vi"]]],
  [`${ROOT}.waveform-file-i-o`, 3, [[1, 1, "Write Waveforms to File.vi"], [1, 2, "Read Waveforms from File.vi"], [1, 3, "Export Waveforms to Spreadsheet File.vi"]]],
  [`${ROOT}.advanced-file-functions`, 6, [
    [1, 1, "Get File Position"], [1, 2, "Get File Size"], [1, 3, "Get Permissions"], [1, 4, "Get Type and Creator"], [1, 5, "Preallocated Read from Binary File"], [1, 6, "File Dialog"],
    [2, 1, "Set File Position"], [2, 2, "Set File Size"], [2, 3, "Set Permissions"], [2, 4, "Set Type and Creator"], [2, 5, "Show in File System.vi"], [2, 6, "Is Name Multiplatform.vi"],
    [3, 1, "Create File with Incrementing Suffix.vi"], [3, 2, "Move"], [3, 3, "Copy"], [3, 4, "Delete"], [3, 5, "Flush File"], [3, 6, "Deny Access"],
    [4, 1, "File/Directory Info"], [4, 2, "Get Volume Info"], [4, 3, "Create Folder"], [4, 4, "List Folder"], [4, 5, "Check if File or Folder Exists.vi"], [4, 6, "Recursive File List.vi"],
    [5, 1, "Path To String"], [5, 2, "String To Path"], [5, 3, "Path to Array of Strings"], [5, 4, "Array of Strings to Path"], [5, 5, "Refnum to Path"], [5, 6, "Path Type"],
    [6, 1, "Compare Two Paths.vi"], [6, 2, "Get File Extension.vi"], [6, 3, "File Checksum.vi"], [6, 4, "Generate Temporary File Path.vi"], [6, 5, "Datalog"], [6, 6, "Packed Library"],
    [7, 1, "Create Directory Recursive.vi"], [7, 2, "Create File and Containing Folders.vi"]]],
  [`${ROOT}.advanced-file-functions.datalog`, 3, [
    [1, 1, "Open/Create/Replace File"], [1, 2, "Close File"],
    [2, 1, "Read Datalog"], [2, 2, "Set Datalog Position"], [2, 3, "Set Number of Records"],
    [3, 1, "Write Datalog"], [3, 2, "Get Datalog Position"], [3, 3, "Get Number of Records"]]],
  [`${ROOT}.advanced-file-functions.packed-library`, 3, [[1, 1, "Get Exported File List.vi"], [1, 2, "Get Exported File Path.vi"], [1, 3, "Packed Library Path.vi"]]],
];

test("the File I/O palette and its subpalettes have the grids and names that were measured", () => {
  for (const [id, columns, expected] of GRIDS) {
    assert.equal(celdasSubpaleta(INV, id).columnas, columns, `${id}: columns`);
    assert.deepEqual(cells(id), expected, id);
  }
  // Every folder opens, one inside the other, as the click on it does, and the last one draws its cells.
  let state = withPalette();
  const chain = [ROOT, `${ROOT}.advanced-file-functions`, `${ROOT}.advanced-file-functions.datalog`];
  chain.forEach((id, level) => { state = clic(state, INV, id, AQUI, level); });
  assert.deepEqual(state.paleta.cascada.map((c) => c.id), chain, "File I/O has contents, so it opens instead of explaining");
  assert.match(subpaletas(INV, state.paleta), /data-id="palette\.functions\.programming\.file-io\.advanced-file-functions\.datalog\.get-number-of-records"/);
  // Every element has an icon: a folder one for a subpalette and a function one for the rest.
  for (const [id] of GRIDS) {
    for (const entry of INV.hijos(id)) {
      const slug = ultimo(entry.id);
      if (slug === "thumbtack") continue;
      assert.ok(G.FUNCIONES[slug] || G.SUBPALETAS[slug], `${entry.id} has an icon`);
      assert.ok(G.FUNCIONES[slug] ? G.CAJAS[slug] : true, `${entry.id} has a box`);
    }
  }
});

test("only the path and file functions and the path constants of File I/O are done and every other element is greyed with its reason", () => {
  const done = [
    "build-path", "strip-path",
    "file-constants.path-constant", "file-constants.empty-path-constant", "file-constants.not-a-path-constant",
    "advanced-file-functions.path-to-string", "advanced-file-functions.string-to-path", "advanced-file-functions.path-to-array-of-strings",
    "advanced-file-functions.array-of-strings-to-path", "advanced-file-functions.path-type",
    // DT-067 §10 (b): the file functions (test/editor/file-io-nodes.test.mjs).
    "open-create-replace-file", "close-file", "write-to-text-file", "read-from-text-file", "advanced-file-functions.get-file-size", "advanced-file-functions.delete",
  ].map((tail) => `${ROOT}.${tail}`);
  const everything = INV.entradas.filter((e) => e.id.startsWith(`${ROOT}.`) && ultimo(e.id) !== "thumbtack" && INV.hijos(e.id).length === 0);
  assert.equal(everything.length, 135, "every measured element is declared (the report's two unread folders of Advanced TDMS are holes without contents)");
  for (const entry of everything) {
    if (done.includes(entry.id)) {
      assert.equal(entry.estado, "built", entry.id);
      continue;
    }
    assert.ok(esHueco(entry), entry.id);
    const { labview, solder } = INV.explicacion(entry);
    assert.ok(labview && /^Missing: /.test(solder), `${entry.id} says what is missing`);
  }
  // The folders that hold something done are done; the others are holes that say why.
  for (const folder of ["", ".file-constants", ".advanced-file-functions"]) assert.equal(INV.entrada(`${ROOT}${folder}`).estado, "built", folder || "File I/O");
  for (const folder of ["configuration-file-vis", "tdm-streaming", "storage-dataplugin", "zip", "xml", "waveform-file-i-o"]) assert.ok(esHueco(INV.entrada(`${ROOT}.${folder}`)), folder);
  // The reasons: file functions with (b), the spreadsheet VIs with (c), the dialogs with (d), the other formats not planned.
  const reason = (tail) => INV.entrada(`${ROOT}.${tail}`).necesita;
  assert.equal(reason("advanced-file-functions.refnum-to-path"), "funciones-de-archivo");
  assert.equal(reason("write-delimited-spreadsheet-vi"), "hojas-de-calculo");
  assert.equal(reason("advanced-file-functions.file-dialog"), "dialogos-de-archivo");
  assert.equal(reason("tdm-streaming.tdms-open"), "formatos-de-archivo");
  assert.match(INV.desbloqueos["formatos-de-archivo"].desc, /Not planned yet/);
  assert.match(INV.desbloqueos["funciones-de-archivo"].ref, /§10 \(b\)/);
  assert.match(INV.desbloqueos["hojas-de-calculo"].ref, /§10 \(c\)/);
  assert.match(INV.desbloqueos["dialogos-de-archivo"].ref, /§10 \(d\)/);
});

test("the greyed and the done elements of File I/O are drawn as such in the open palette", () => {
  let state = clic(withPalette(), INV, ROOT, AQUI, 0);
  state = clic(state, INV, `${ROOT}.advanced-file-functions`, AQUI, 1);
  const html = subpaletas(INV, state.paleta);
  const advanced = `${ROOT}.advanced-file-functions`.replaceAll(".", "\\.");
  assert.match(html, new RegExp(`class="icono-funcion" data-id="${advanced}\\.path-to-string"`), "Path To String is done");
  assert.match(html, new RegExp(`class="icono-funcion" data-id="${advanced}\\.path-type"`), "Path Type is done");
  assert.match(html, new RegExp(`class="icono-funcion hueco" data-id="${advanced}\\.refnum-to-path"`), "Refnum to Path waits for the file refnum");
  assert.match(html, new RegExp(`class="icono-funcion hueco" data-id="${advanced}\\.list-folder"`), "List Folder is greyed");
  assert.match(html, new RegExp(`class="carpeta hueco" data-id="${advanced}\\.datalog"`), "Datalog is a greyed folder");
});

// ——— Placing ———

const PLACEABLE = [
  ["build-path", `${ROOT}.build-path`],
  ["strip-path", `${ROOT}.strip-path`],
  ["path-constant", `${ROOT}.file-constants.path-constant`],
  ["empty-path-constant", `${ROOT}.file-constants.empty-path-constant`],
  ["not-a-path-constant", `${ROOT}.file-constants.not-a-path-constant`],
  ["path-to-string", `${ROOT}.advanced-file-functions.path-to-string`],
  ["string-to-path", `${ROOT}.advanced-file-functions.string-to-path`],
  ["path-to-array-of-strings", `${ROOT}.advanced-file-functions.path-to-array-of-strings`],
  ["array-of-strings-to-path", `${ROOT}.advanced-file-functions.array-of-strings-to-path`],
  ["path-type", `${ROOT}.advanced-file-functions.path-type`],
  ["path-to-string", "palette.functions.programming.string.path-array-string-conversion.path-to-string"],
  ["string-to-path", "palette.functions.programming.string.path-array-string-conversion.string-to-path"],
  ["path-to-array-of-strings", "palette.functions.programming.string.path-array-string-conversion.path-to-array-of-strings"],
  ["array-of-strings-to-path", "palette.functions.programming.string.path-array-string-conversion.array-of-strings-to-path"],
];

test("the path functions and constants are placed from the File I/O palettes and from String", () => {
  for (const [block, id] of PLACEABLE) {
    const entry = INV.entrada(id);
    assert.equal(entry.estado, "built", id);
    assert.equal(entry.bloque, block, id);
    assert.ok(CAT.bloque(block), `${block} is in the catalog`);
    assert.ok(G.FUNCIONES[ultimo(id)] && G.CAJAS[ultimo(id)], `${id} has its icon and box`);
    let d = ED.coger(ED.inicial(), entry.bloque);
    d = ED.pulsar(ED.moverA(d, CTX, { x: 100, y: 100 }), CTX, { tipo: "fondo" }, { x: 100, y: 100 });
    const node = d.g.nodos[0];
    assert.equal(node.tipo, block, id);
    // A terminal for each port of the catalog, in the catalog's order, which is the context help's: inputs top to bottom, then outputs.
    const terminals = D.terminales(node, CTX);
    const { in: inputs, out: outputs } = CAT.puertos(node);
    assert.deepEqual(terminals.map((t) => t.puerto), [...inputs, ...outputs].map((p) => p.name), id);
    const box = D.caja(node, CTX);
    assert.ok(box.ancho > 0 && box.alto > 0, `${id} has a size`);
    for (const side of ["in", "out"]) {
      const ys = terminals.filter((t) => t.dir === side).map((t) => t.y);
      assert.deepEqual([...ys].sort((a, b) => a - b), ys, `${id}: the ${side}puts go down in the catalog's order`);
    }
    Gr.tipos(d.g, CAT); // it resolves with nothing wired
  }
  // The terminals follow the context help's connector order (reports/2026-10-26-file-io-palette.md §3): Build Path takes the base path above the name.
  const build = CAT.puertos({ tipo: "build-path" });
  assert.deepEqual(build.in.map((p) => p.label), ["base path", "name or relative path"]);
  assert.deepEqual(CAT.puertos({ tipo: "strip-path" }).out.map((p) => p.label), ["stripped path", "name"]);
});

test("the path functions have their own icons: 32 x 32 for Build Path and Strip Path, a 23 x 22 triangle for Path Type", () => {
  for (const [block, size] of [["build-path", [32, 32]], ["strip-path", [32, 32]], ["path-type", [23, 22]]]) {
    assert.deepEqual(G.TAMANOS[block], size, `${block}: measured size`);
    const { g } = Gr.crearNodo(Gr.nuevo(), CAT, block, 40, 40);
    const html = D.contenido({ ...ED.inicial(), g }, CTX, Gr.tipos(g, CAT));
    assert.match(html, new RegExp(`data-nodo="n[^"]*"[^>]*>`), block);
    assert.match(html, /<svg/, `${block} is drawn`);
    const box = D.caja(g.nodos[0], CTX);
    assert.deepEqual([box.ancho, box.alto], size, `${block}: the box`);
  }
  assert.match(G.FUNCIONES["build-path"], /fill="var\(--node-fill\)" stroke="var\(--path-node-border\)" stroke-width="1"/, "the node fill and a 1 px border");
  assert.match(G.FUNCIONES["build-path"], /fill="var\(--paper\)" stroke="var\(--ink\)"/, "the checkerboard boxes and the rectangle");
  assert.ok(G.FUNCIONES["build-path"] !== G.FUNCIONES["strip-path"], "each has its drawing");
  assert.match(G.FUNCIONES["path-type"], /M0\.5 0\.5L22\.5 10\.5L0\.5 21\.5Z/, "a triangle pointing right");
  assert.match(G.FUNCIONES["path-type"], />\?<\/text>/, "with a question mark");
  assert.doesNotMatch(G.FUNCIONES["build-path"] + G.FUNCIONES["strip-path"], /p\+n|p-n/, "no generic label");
});

test("the terminals of Build Path and Strip Path are where LabVIEW has them; Path Type's are at row 9-10 and at its tip", () => {
  const rows = (block) => {
    const { g } = Gr.crearNodo(Gr.nuevo(), CAT, block, 100, 100);
    return D.terminales(g.nodos[0], CTX).map((terminal) => [terminal.dir, terminal.x - 100, terminal.y - 100]);
  };
  assert.deepEqual(rows("build-path"), [["in", 0, 8], ["in", 0, 24], ["out", 32, 16]]);
  assert.deepEqual(rows("strip-path"), [["in", 0, 16], ["out", 32, 8], ["out", 32, 24]]);
  assert.deepEqual(rows("path-type"), [["in", 0, 10], ["out", 22, 10.5]], "the input at rows 9-10, the output at row 10 of the tip, x + 22");
});

test("a path constant from the palette draws its box and a Run-ready value", () => {
  for (const block of ["path-constant", "empty-path-constant", "not-a-path-constant"]) {
    const { g } = Gr.crearNodo(Gr.nuevo(), CAT, block, 40, 40);
    const html = D.contenido({ ...ED.inicial(), g }, CTX, Gr.tipos(g, CAT));
    assert.match(html, /class="constante path/, block);
  }
});

// ——— Controls ▸ Modern ▸ String & Path ———

test("File Path Control and Indicator are placed from Controls Modern String and Path with their terminal", () => {
  const folder = "palette.controls.modern.string-and-path";
  for (const [slug, block, kind] of [["file-path-control", "path-control", "control"], ["file-path-indicator", "path-indicator", "indicator"]]) {
    const entry = INV.entrada(`${folder}.${slug}`);
    assert.equal(entry.estado, "built", slug);
    assert.equal(entry.bloque, block);
    assert.ok(G.CONTROLES[slug], `${slug}: the palette icon is drawn`);
    const point = { x: 80, y: 80 };
    const placed = P.confirmar(P.pulsar(P.moverA(P.coger(P.inicial(), entry.bloque), CTX, point), CTX, { tipo: "fondo" }, point));
    assert.equal(placed.g.nodos[0].tipo, block, kind);
    const hasTerminal = D.terminales(placed.g.nodos[0], CTX).length > 0;
    assert.ok(hasTerminal, `${kind}: its terminal is on the diagram`);
  }
  // Combo Box stays greyed. Classic and System do not list the File Path Control in the inventory: there is nothing to grey there.
  assert.ok(esHueco(INV.entrada(`${folder}.combo-box`)));
  assert.equal(INV.entradas.some((e) => /^palette\.controls\.(classic|system)\b/.test(e.id) && /file-path/.test(e.id)), false);
});

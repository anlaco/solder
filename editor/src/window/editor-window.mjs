// One editor window: the Front Panel or the Block Diagram, depending on the URL.
//
// It paints with window-view.mjs, block-diagram/diagram-view.mjs and
// front-panel/front-panel.mjs, and translates DOM events into window-state.mjs
// (windows and palettes), block-diagram/diagram-editing.mjs (the diagram) and
// front-panel/front-panel.mjs (the panel). It decides nothing on its own: what is
// done comes from the inventory (rule 55), and each block's terminals from the
// catalog (spec/03, rule 3).
//
// The two windows are two views of the same VI (spec/05 §7): each one holds a
// copy of the graph and, every time its own comes to rest, sends it to the other
// over a BroadcastChannel (one per VI, as several VIs can be open: DT-045). So a
// control placed on the panel appears on the diagram, and a terminal deleted on
// the diagram disappears from the panel.
//
// A VI is loaded with the subVIs it calls: the main process reads their files
// and hierarchy-client.mjs turns them into the catalog view in which the ports of
// each `subvi` node come from the connector of the VI it calls. That view
// replaces the plain catalog everywhere (`cat`).

import * as CP from "../front-panel/connector-pane.mjs";
import * as D from "../block-diagram/diagram-view.mjs";
import * as DC from "../block-diagram/diagram-clipboard.mjs";
import * as ED from "../block-diagram/diagram-editing.mjs";
import * as EM from "./edit-menu.mjs";
import * as E from "./window-state.mjs";
import * as G from "../common/glyphs.mjs";
import * as Gr from "../../../core/model/graph.mjs";
import * as H from "../block-diagram/undo-history.mjs";
import { cargarInventario, esHueco, ultimo } from "../common/labview-inventory.mjs";
import { addressFromText } from "../common/array-grid.mjs";
import * as P from "../front-panel/front-panel.mjs";
import * as PC from "../front-panel/panel-clipboard.mjs";
import * as Paths from "../common/vi-paths.mjs";
import * as Q from "../../../core/model/qvi-format.mjs";
import * as SN from "../block-diagram/subvi-nodes.mjs";
import * as VP from "./vi-properties.mjs";
import * as V from "./window-view.mjs";
import { buildHierarchy } from "./hierarchy-client.mjs";
import { compilar } from "../../../core/compiler/compiler.mjs";
import { pruneConnector } from "../../../core/model/connector.mjs";

const nombre = new URLSearchParams(location.search).get("ventana") ?? "front-panel";
const prefijo = `window.${nombre}`;
document.title = V.TITULOS[nombre];

const [inv, baseCatalog] = await Promise.all([
  fetch("/inventario.json").then((r) => r.json()).then(cargarInventario),
  fetch("/blocks.json").then((r) => r.json()).then(Gr.cargarCatalogo),
]);
/** The VI these windows show, as the main process knows it (without it, as in a plain browser, a new VI). */
const viInfo = (await window.solder?.iniciar()) ?? { id: "0", text: null, key: Paths.untitledKey(0), name: "Untitled 1", untitledNumber: 1 };
/** The catalog of this VI: the blocks, and for each subVI node the connector of the VI it calls. */
let cat = baseCatalog;
const glifos = D.glifosPorBloque(inv);
/** El Block Diagram edita el diagrama; el Front Panel, el panel. */
const conDiagrama = nombre === "block-diagram";
const conPanel = nombre === "front-panel";

/** ¿Está instalada esta fuente? `document.fonts.check` no sirve para las del sistema. */
function existe(fuente) {
  const ctx = document.createElement("canvas").getContext("2d");
  const medir = (familia) => {
    ctx.font = `72px ${familia}`;
    return ctx.measureText("Solder abcdefghij 0123456789").width;
  };
  return medir(`"${fuente}", monospace`) !== medir("monospace");
}
// Segoe UI a 12 px, la de LabVIEW; si no, Noto Sans a 11,3 px (spec/06-visual.md §10).
document.documentElement.style.setProperty("--fuente", existe("Segoe UI") ? "12px" : "11.3px");

/** El separador decimal del sistema: LabVIEW usa el del idioma de Windows. */
const separador = (1.5).toLocaleString(navigator.language).includes(",") ? "," : ".";
/** El ancho de un texto en la fuente de la ventana, medido en un lienzo: el de los menús y las etiquetas. */
const medirMenu = (() => {
  const lienzo = document.createElement("canvas").getContext("2d");
  return (t) => {
    lienzo.font = `${getComputedStyle(document.documentElement).getPropertyValue("--fuente")} "Segoe UI", "Noto Sans", sans-serif`;
    return lienzo.measureText(t).width;
  };
})();
let ctx = D.contexto(cat, glifos, separador, medirMenu);

// Los cursores de la herramienta automática de LabVIEW.
for (const [clave, c] of Object.entries(G.CURSORES)) {
  document.documentElement.style.setProperty(`--cursor-${clave}`, `url("${c.url}") ${c.punto[0]} ${c.punto[1]}, crosshair`);
}

let estado = E.inicial();
let dia = ED.inicial();
let pan = P.inicial(dia.g);
let historial = H.nuevo(dia.g);

/** El grafo de esta ventana. */
const grafo = () => (conDiagrama ? dia.g : pan.g);

// ——— The two windows, one VI ———

const canal = new BroadcastChannel(`solder-vi-${viInfo.id}`);
/** The last graph that was sent to the other window or came from it. */
let publicado = dia.g;
/** The window answers the other one only once it has loaded its VI: before that, its graph is an empty one. */
let listo = false;

/**
 * The graph has come to rest —nothing half done, no text half written—: the
 * step is kept to undo it and the other window receives it, with the subVI
 * texts it needs to understand it.
 */
function quieto(g) {
  historial = H.registrar(historial, g);
  if (g === publicado) return;
  publicado = g;
  canal.postMessage({ g, subVITexts });
  avisar(g);
}

// ——— The hierarchy: the subVIs of this VI ———
//
// A VI is compiled and drawn with the connectors of the VIs it calls. The main
// process reads their files from disk; a subVI that is saved while its callers
// are open reaches them through `vi:saved` (alGuardarOtroVI).

/** The path this VI is saved at, or the key of an untitled one (see common/vi-paths.mjs). */
let viKey = viInfo.key;
/** The text of every other VI of the hierarchy, by absolute path. */
let subVITexts = {};
/** Why the hierarchy cannot be compiled: a subVI that cannot be found, a recursive call… */
let hierarchyErrors = [];
/** The keys of the subVIs this VI reaches. */
let hierarchyKeys = [];

/**
 * Builds the catalog view of this VI over `g` and the subVI texts held now, and
 * returns `g` without the wires to ports a subVI no longer has.
 */
function rebuildHierarchy(g) {
  const result = buildHierarchy({ rootKey: viKey, rootGraph: g, texts: subVITexts, baseCatalog, readVI: Q.leer });
  cat = result.catalog;
  ctx = D.contexto(cat, glifos, separador, medirMenu);
  hierarchyErrors = result.errors;
  hierarchyKeys = result.keys;
  return SN.pruneOrphanWires(g, cat);
}

/** Puts a graph in this window's view, without it counting as an edit. */
function ponerGrafo(g) {
  if (conDiagrama) dia = { ...dia, g };
  else pan = { ...pan, g };
  publicado = g;
}

/** Reads the subVI files again and redraws: a subVI was saved, or a Run is about to start. */
async function refrescarJerarquia() {
  const { texts } = await window.solder.textosDeSubVIs(Q.aTexto(grafo(), cat));
  subVITexts = texts;
  ponerGrafo(rebuildHierarchy(grafo()));
  pintar();
}

/** Does this graph have a subVI node whose callee this window does not know yet? */
const faltaSubVI = (g) => g.nodos.some((n) => SN.isSubVI(n) && !cat.findSubVI?.(n.config?.vi));

/** Some VI was saved, here or elsewhere (preload `alGuardar`). */
function alGuardarOtroVI({ id, key }) {
  if (id !== viInfo.id) {
    if (hierarchyKeys.includes(key)) refrescarJerarquia();
    return;
  }
  // This VI was saved, maybe for the first time or somewhere else: its subVI paths are now relative to the new file.
  if (key === viKey) return;
  const old = viKey;
  viKey = key;
  ponerGrafo(rebuildHierarchy(Paths.rebaseGraph(grafo(), old, key)));
  pintar();
}
window.solder?.alGuardar(alGuardarOtroVI);

// ——— Save and open (core/model/qvi-format.mjs) ———
//
// The page only turns the VI into text and back; the disk, the system dialogs
// and the asterisk in the title belong to the main process
// (electron/main.mjs), which receives every change to know if anything is unsaved.

/** The VI has changed: the main process compares it with what was saved. */
const avisar = (g) => window.solder?.cambio(Q.aTexto(g, cat));

/** What is being typed is confirmed before saving, as with Enter Text. */
function confirmarEscritura() {
  if (conDiagrama && dia.edicion) cambiarDiagrama(ED.confirmar(dia, ctx));
  if (conPanel && pan.edicion) cambiarPanel(P.confirmar(pan));
}

/** File ▸ Save and Save As. */
async function guardarVI(como) {
  if (!window.solder) return;
  confirmarEscritura();
  await window.solder.guardar(Q.aTexto(grafo(), cat), como);
}

/** A VI just opened or created: it starts with no history and nothing selected. */
function cargar(g) {
  publicado = g;
  historial = H.nuevo(g);
  dia = { ...ED.inicial(), g };
  pan = P.inicial(g);
  pintar();
  avisar(g);
}

/** Loads the VI the main process gave this window: its subVIs first, so that its wires find their ports. */
async function cargarTexto(text) {
  const { texts } = await window.solder.textosDeSubVIs(text);
  subVITexts = texts;
  try {
    const result = buildHierarchy({ rootKey: viKey, rootText: text, texts, baseCatalog, readVI: Q.leer });
    cat = result.catalog;
    ctx = D.contexto(cat, glifos, separador, medirMenu);
    hierarchyErrors = result.errors;
    hierarchyKeys = result.keys;
    cargar(result.graph);
  } catch (e) {
    window.solder.error(e.message);
    window.solder.cerrar();
  }
}

/** File ▸ Open: another VI, in its own windows (or those it already has). */
const abrirVI = () => window.solder?.abrir();

// ——— Run ———
//
// Run compiles the VI to WebAssembly (core/compiler/compiler.mjs) and runs it in
// a worker (run-worker.mjs) by dataflow (DT-040). While it runs, both windows
// are in Run mode, as in LabVIEW (labview-captures/run/): the arrow is filled,
// Abort lights up, the editing tools disappear, the panel loses its grid and the
// diagram cannot be edited. Indicators are painted as their data arrives;
// controls can be operated and the worker reads their new value; a Latch that
// has been read returns to FALSE by itself. With a broken arrow, Run says why,
// like LabVIEW's error list.

let trabajador = null;
/** The VI Properties dialog while it is open (vi-properties.mjs), or `null`. */
let propiedades = null;
/** El VI corre (en cualquiera de las dos ventanas): las dos están en modo Run. */
let ejecutando = false;
/** Esta ventana lanzó el Run: el worker es suyo. */
let lanzado = false;
/** El valor de cada control que ya sabe el worker, para mandarle sólo lo que cambie. */
let vistos = {};
let plazoAbort = null;

/** Lo que llega a los indicadores: se enseña en el panel, no cambia el VI. */
function mostrarValores(valores) {
  pan = { ...pan, valores: { ...(pan.valores ?? {}), ...valores } };
  pintar();
}

const esControl = (n) => n.tipo === "control" || n.tipo === "bool-control" || n.tipo === "str-control" || n.tipo === "cluster-control" || n.tipo === "arr-control";
const valoresDeControles = (g) => Object.fromEntries(g.nodos.filter(esControl).map((n) => [n.id, n.config?.value ?? (n.tipo === "str-control" ? "" : n.tipo === "cluster-control" ? P.ERROR_VACIO : n.tipo === "arr-control" ? [] : 0)]));
/** Dos valores de control iguales: un cluster de error es un objeto y se compara por lo que lleva. */
const mismoValor = (a, b) => a === b || (typeof a === "object" && typeof b === "object" && JSON.stringify(a) === JSON.stringify(b));

/** Las dos ventanas entran en modo Run o salen de él. */
function modoRun(si) {
  ejecutando = si;
  vistos = si ? valoresDeControles(grafo()) : {};
  if (si) {
    // Lo que estuviera a medias se deja: en modo Run no se edita.
    estado = { ...estado, paleta: null, abierta: null, menuBarra: null };
    dia = { ...dia, accion: null, menu: null, edicion: null, seleccion: [] };
    pan = { ...pan, accion: null, menu: null, seleccion: [] };
  }
  pintar();
}

/** Un control cambiado mientras corre: el worker lo lee en la siguiente lectura. */
function mandarControles(g) {
  if (!ejecutando) return;
  for (const [nodo, valor] of Object.entries(valoresDeControles(g))) {
    if (mismoValor(vistos[nodo], valor)) continue;
    vistos[nodo] = valor;
    if (lanzado) trabajador.postMessage({ orden: "control", nodo, valor });
    else canal.postMessage({ control: { nodo, valor } });
  }
}

/** Un Latch leído vuelve a FALSE en las dos ventanas, sin que cuente como edición. */
function soltarLatch(nodo) {
  vistos[nodo] = false;
  if (conDiagrama) dia = { ...dia, g: Gr.fijarValor(dia.g, nodo, false) };
  else pan = { ...pan, g: Gr.fijarValor(pan.g, nodo, false) };
  pintar();
}

function alMensaje(data) {
  if (data.escritos) {
    mostrarValores(data.escritos);
    canal.postMessage({ valores: data.escritos });
  }
  if (data.soltar) {
    soltarLatch(data.soltar);
    canal.postMessage({ soltar: data.soltar });
  }
  if (data.dialogo) {
    dialogoError = data.dialogo;
    pintar();
  }
  if (data.fin) acabar(data);
}

/**
 * El diálogo de error que espera al usuario (DT-043), en la ventana que lanzó el VI: el worker ha
 * parado el VI en la importación y sigue cuando se contesta. Sin él, el VI espera.
 */
let dialogoError = null;
function responderDialogo(valor) {
  if (!dialogoError || !trabajador) return;
  trabajador.postMessage({ orden: "respuesta", id: dialogoError.id, valor });
  dialogoError = null;
  pintar();
}

/** El VI ha acabado, solo, con un error o abortado: las dos ventanas vuelven a editar. */
function acabar(data) {
  clearTimeout(plazoAbort);
  dialogoError = null;
  lanzado = false;
  canal.postMessage({ ejecutando: false });
  modoRun(false);
  if (data.error) window.solder?.avisar("The VI stopped with an error.", data.error);
}

async function ejecutarVI() {
  // Run con el VI corriendo no hace nada, como en LabVIEW.
  if (ejecutando) return;
  confirmarEscritura();
  // The subVIs may have been saved since this VI was opened: Run compiles what is on disk now.
  await refrescarJerarquia();
  if (ejecutando) return;
  const g = grafo();
  if (hierarchyErrors.length) return window.solder?.avisar("The VI cannot run.", hierarchyErrors.join("\n"));
  const c = compilar(g, cat);
  if (c.errores) return window.solder?.avisar("The VI cannot run.", c.errores.map((e) => e.motivo).join("\n"));
  if (!trabajador) {
    trabajador = new Worker(new URL("./run-worker.mjs", import.meta.url), { type: "module" });
    trabajador.onmessage = ({ data }) => alMensaje(data);
  }
  lanzado = true;
  canal.postMessage({ ejecutando: true });
  modoRun(true);
  trabajador.postMessage({ orden: "run", clave: viKey, compilado: { bytes: c.bytes, controles: c.controles, indicadores: c.indicadores, clumps: c.clumps, planes: c.planes, automaticos: c.automaticos, disposicionError: c.disposicionError }, valores: valoresDeControles(g), separador });
}

/**
 * Abort: el VI para en el acto, aunque esté esperando. Si en medio segundo el
 * worker no contesta —un cálculo que no cede—, se termina el worker entero.
 */
function abortar() {
  if (!ejecutando) return;
  if (!lanzado) return canal.postMessage({ abortar: true });
  trabajador.postMessage({ orden: "abort" });
  clearTimeout(plazoAbort);
  plazoAbort = setTimeout(() => {
    trabajador.terminate();
    trabajador = null;
    acabar({ abortado: true });
  }, 500);
}

/** Las órdenes hechas del menú File, por el último segmento de su id. */
const ORDENES_MENU = {
  save: () => guardarVI(false),
  "save-as": () => guardarVI(true),
  open: abrirVI,
  exit: () => window.solder?.salir(),
  "vi-properties": abrirPropiedades,
  // Edit menu (the same commands as the shortcuts):
  undo: () => deshacerPaso(),
  redo: () => rehacerPaso(),
  cut: () => cortar(),
  copy: () => copiar(),
  paste: () => pegar(),
  delete: () => borrarLoSeleccionado(),
  "select-all": () => seleccionarTodo(),
};

/** The orders of the context menus (subVI node, connector pane, icon) that act on the window and not on the graph; they receive the node the menu was opened on. */
const ORDENES_CONTEXTUALES = { "vi-properties": () => abrirPropiedades(), "open-front-panel": (nodeId) => abrirSubVI(nodeId) };

// ——— Edit: undo, copy, cut, paste, delete and select all ———
//
// What is copied is plain data (core/model/clipboard.mjs). It is kept here for
// this window and, through the main process, for every other open VI: the
// system clipboard is not used, so that copying in one VI and pasting in another
// does not depend on what else the user copied (spec/05 rule 73).

/** The last thing copied or cut in this window (`{ viKey, fragment }`), and where the last paste was done. */
let portapapeles = { paquete: null, memoria: null };
/** The last point of the canvas the pointer was over: where Ctrl+V and Edit ▸ Paste paste. */
let punteroEnLienzo = null;

/** The size of this window's canvas: the best guess for the other window's, which this window cannot see. */
function tamanoDelLienzo() {
  const rect = document.querySelector(".lienzo")?.getBoundingClientRect();
  return rect ? { width: Math.round(rect.width), height: Math.round(rect.height) } : undefined;
}

/** Where to paste: the pointer, or the middle of the canvas if it has not been over it yet. */
function dondePegar() {
  if (punteroEnLienzo) return punteroEnLienzo;
  const tam = tamanoDelLienzo() ?? { width: 600, height: 400 };
  return { x: Math.round(tam.width / 2), y: Math.round(tam.height / 2) };
}

/** What the main process says was copied in any VI (it tells every window, and a new window asks). */
function recibirPortapapeles(texto) {
  if (texto) portapapeles = { paquete: JSON.parse(texto), memoria: null };
}

/** Keeps what was copied here and tells the main process, which hands it to the other VIs. */
function guardarEnPortapapeles(fragment) {
  portapapeles = { paquete: { viKey, fragment }, memoria: null };
  window.solder?.portapapeles.guardar(JSON.stringify(portapapeles.paquete));
}

/** The fragment as it reads in this VI: the paths of its subVIs are relative to the file it came from. */
function fragmentoParaEsteVI({ viKey: origen, fragment }) {
  if (origen === viKey) return fragment;
  const nodes = fragment.nodes.map((n) => (SN.isSubVI(n) ? { ...n, config: { ...n.config, vi: Paths.rebaseStoredPath(n.config.vi, origen, viKey) } } : n));
  return { ...fragment, nodes };
}

/** A pasted subVI must be known before it is drawn: its file is read, like Select a VI... does. */
async function conocerSubVIs(fragment) {
  const faltan = fragment.nodes.filter((n) => SN.isSubVI(n) && !cat.findSubVI?.(n.config.vi));
  for (const n of faltan) {
    const { texts } = await window.solder.textosDeVI(Paths.resolveRelative(viKey, n.config.vi));
    subVITexts = { ...subVITexts, ...texts };
  }
  if (faltan.length) ponerGrafo(rebuildHierarchy(grafo()));
}

function copiar() {
  const fragment = conDiagrama ? DC.copySelection(dia) : PC.copySelection(pan);
  if (fragment) guardarEnPortapapeles(fragment);
}

function cortar() {
  if (ejecutando) return;
  if (conDiagrama) {
    const cut = DC.cutSelection(dia);
    if (!cut) return;
    guardarEnPortapapeles(cut.fragment);
    return cambiarDiagrama(cut.d);
  }
  const cut = PC.cutSelection(pan);
  if (!cut) return;
  guardarEnPortapapeles(cut.fragment);
  cambiarPanel(cut.p);
}

async function pegar() {
  if (ejecutando) return;
  const { paquete } = portapapeles;
  if (!paquete) return;
  const fragment = fragmentoParaEsteVI(paquete);
  if (conDiagrama) await conocerSubVIs(fragment);
  const donde = dondePegar();
  if (conDiagrama) {
    const pasted = DC.pasteAt(dia, ctx, fragment, donde, portapapeles.memoria);
    portapapeles = { ...portapapeles, memoria: pasted.memory };
    return cambiarDiagrama(pasted.d);
  }
  const pasted = PC.pasteAt(pan, ctx, fragment, donde, portapapeles.memoria);
  portapapeles = { ...portapapeles, memoria: pasted.memory };
  cambiarPanel(pasted.p);
}

const borrarLoSeleccionado = () => ejecutando || (conDiagrama ? cambiarDiagrama(ED.borrarSeleccion(dia)) : cambiarPanel(P.borrarSeleccion(pan)));
const seleccionarTodo = () => ejecutando || (conDiagrama ? cambiarDiagrama(ED.selectAll(dia)) : cambiarPanel(PC.selectAll(pan)));

function deshacerPaso() {
  if (!ejecutando && !(conDiagrama ? dia.accion : pan.accion)) volver(H.deshacer(historial));
}

function rehacerPaso() {
  if (!ejecutando && !(conDiagrama ? dia.accion : pan.accion)) volver(H.rehacer(historial));
}

/** What the Edit menu greys out and renames, from what this window knows now. */
function variantesDelMenuEdit() {
  const seleccion = conDiagrama ? dia.seleccion : pan.seleccion;
  const hayParaCopiar = conDiagrama ? ED.copyableIds(dia).length > 0 : PC.hasSelection(pan);
  return EM.editMenuVariants(nombre, {
    canUndo: historial.antes.length > 0,
    canRedo: historial.despues.length > 0,
    canCopy: hayParaCopiar,
    hasSelection: seleccion.length > 0,
    clipboardFilled: !!portapapeles.paquete,
  });
}

// ——— VI Properties (vi-properties.mjs) ———

function abrirPropiedades() {
  if (ejecutando || propiedades) return;
  confirmarEscritura();
  estado = { ...estado, paleta: null, abierta: null, menuBarra: null };
  dia = { ...dia, menu: null };
  pan = { ...pan, menu: null };
  propiedades = VP.open(grafo());
  pintar();
}

/** OK writes the dialog into the VI; Cancel leaves it as it was. */
function cerrarPropiedades(aceptar) {
  const dialogo = propiedades;
  propiedades = null;
  estado = { ...estado, abierta: null, menuBarra: null };
  const nuevo = VP.apply(grafo(), dialogo);
  if (aceptar && JSON.stringify(nuevo.vi) !== JSON.stringify(grafo().vi)) {
    if (conDiagrama) cambiarDiagrama({ ...dia, g: nuevo });
    else cambiarPanel({ ...pan, g: nuevo });
  }
  pintar();
}

/** A click inside the dialog: its buttons, the reentrancy options that work and, on what is not done, its explanation. */
function clicPropiedades(ev) {
  const elemento = ev.target.closest("[data-id]");
  if (!elemento) return;
  const id = elemento.dataset.id;
  if (id === `${VP.DIALOG_ID}.ok`) return cerrarPropiedades(true);
  if (id === `${VP.DIALOG_ID}.cancel`) return cerrarPropiedades(false);
  if (id === VP.CATEGORIES_ID) return cambiar(E.abrirMenuBarra(estado, inv, id, anclaMenu(elemento)));
  const opcion = VP.REENTRANCY_OPTIONS.find((o) => o.id === id);
  if (opcion && !esHueco(inv.resolver(id))) {
    propiedades = VP.choose(propiedades, opcion.value);
    return pintar();
  }
  cambiar(E.clic(estado, inv, id, ancla(elemento)));
}

// ——— SubVIs: placing one, opening its Front Panel ———

/** Select a VI...: the file dialog, then the VI follows the cursor until a click drops it (labview-captures/subvi/select-a-vi-dialog.png). */
async function seleccionarVI() {
  if (!conDiagrama || ejecutando) return;
  estado = { ...estado, paleta: null, abierta: null };
  pintar();
  const absolutePath = await window.solder?.elegirVI();
  if (!absolutePath) return;
  const { texts } = await window.solder.textosDeVI(absolutePath);
  subVITexts = { ...subVITexts, ...texts };
  const g = rebuildHierarchy(dia.g);
  dia = ED.coger({ ...dia, g }, "subvi", SN.subVIConfig(Paths.storedPathFor(viKey, absolutePath)));
  pintar();
}

/** Opens the windows of the VI that a `subvi` node calls (or brings them forward if they are open). */
function abrirSubVI(nodeId) {
  const node = grafo().nodos.find((n) => n.id === nodeId);
  if (node?.config?.vi) window.solder?.abrirRuta(Paths.resolveRelative(viKey, node.config.vi));
}

/** The right-click menu of the connector pane (on a cell) or of the icon of the VI. */
function menuDelIcono(ev, elemento) {
  const esConector = elemento.dataset.id === `${prefijo}.connector-pane`;
  const raiz = esConector ? CP.MENU_ROOT : CP.ICON_MENU_ROOT;
  const celda = esConector ? CP.cellUnderPointer(elemento.getBoundingClientRect(), ev) : null;
  estado = { ...estado, paleta: null, abierta: null };
  if (conDiagrama) return cambiarDiagrama(CP.openMenu(dia, raiz, ev.clientX, ev.clientY, celda));
  cambiarPanel(CP.openMenu(pan, raiz, ev.clientX, ev.clientY, celda));
}

canal.onmessage = ({ data }) => {
  // Before this window has loaded its VI, what it holds is not the VI.
  if (!listo) return;
  // Una ventana que acaba de abrirse pide el VI; la que lo tiene lo manda.
  if (data.pide) return canal.postMessage({ g: grafo(), subVITexts });
  // Lo que ya se tiene no es un paso nuevo: la respuesta a una ventana recién abierta, por ejemplo.
  if (data.valores) return mostrarValores(data.valores);
  if ("ejecutando" in data) return modoRun(data.ejecutando);
  if (data.soltar) return soltarLatch(data.soltar);
  if (data.control) {
    if (lanzado) trabajador.postMessage({ orden: "control", ...data.control });
    vistos[data.control.nodo] = data.control.valor;
    return;
  }
  if (data.abortar) return abortar();
  if (data.nuevo) return cargar(data.g);
  if (!data.g || JSON.stringify(data.g) === JSON.stringify(grafo())) return;
  let g = data.g;
  // The other window may have placed a subVI this one has not read yet: its view of the hierarchy comes first.
  if (data.subVITexts && (JSON.stringify(data.subVITexts) !== JSON.stringify(subVITexts) || faltaSubVI(g))) {
    subVITexts = data.subVITexts;
    g = rebuildHierarchy(g);
  }
  publicado = g;
  historial = H.registrar(historial, g);
  if (conDiagrama) dia = ED.recibir(dia, g);
  else pan = P.recibir(pan, g);
  pintar();
};

/** Lo que no se activa con un clic: la ventana, el lienzo y el fondo de las paletas. */
const inerte = (el) => el.dataset.id === prefijo || el.dataset.id === `${prefijo}.workspace` || el.classList.contains("paleta");

/** El nivel de la paleta en que está un elemento: 0 la paleta, 1 su primera subpaleta… */
const nivelDe = (el) => Number(el.closest(".paleta")?.dataset.nivel ?? 0);

/** ¿Es una carpeta de una rejilla, con su subpaleta declarada? */
const abreSubpaleta = (el) => el.classList.contains("carpeta") && inv.tieneContenido(el.dataset.id);

function dentro(el, max) {
  const r = el.getBoundingClientRect();
  if (r.right > max.width) el.style.left = `${Math.max(0, max.width - r.width - 2)}px`;
  if (r.bottom > max.height) el.style.top = `${Math.max(0, max.height - r.height - 2)}px`;
}


function pintar() {
  ctx.panelSize = tamanoDelLienzo();
  const resueltos = Gr.tipos(grafo(), cat);
  const extra = { runRoto: !Gr.ejecutable(grafo(), cat, resueltos) || hierarchyErrors.length > 0, ejecutando, dialogo: dialogoError, numeroVI: viInfo.untitledNumber ?? undefined, propiedades: propiedades ? VP.view(inv, propiedades) : "" };
  if (conDiagrama) {
    extra.lienzo = D.contenido(dia, ctx, resueltos);
    extra.encima = dia.menu ? D.menuContextual(inv, dia.menu, ED.marcados(dia), medirMenu, ED.variantes(dia, ctx)) : "";
    extra.editandoTexto = !!dia.edicion;
  } else {
    extra.lienzo = P.contenido(pan, ctx);
    extra.conectorGlifo = CP.paneGlyph(pan.g, cat, pan.conector?.celda ?? null);
    extra.encima = pan.menu ? D.menuContextual(inv, pan.menu, ED.marcados(pan), medirMenu, ED.variantes(pan, ctx)) : "";
    extra.editandoTexto = !!pan.edicion;
  }
  // El menú de la barra que está abierto, bajo su título.
  if (estado.menuBarra) {
    const variantes = estado.menuBarra.id === EM.editMenuId(nombre) ? variantesDelMenuEdit() : {};
    extra.encima = (extra.encima ?? "") + D.menuContextual(inv, { raiz: estado.menuBarra.id, x: estado.menuBarra.x, y: estado.menuBarra.y }, marcasDelMenuBarra(estado.menuBarra.id), medirMenu, variantes);
  }
  document.body.innerHTML = V.ventana(inv, nombre, estado, extra);
  const ventana = document.querySelector(".ventana");
  ventana.classList.toggle("cableando", dia.accion?.tipo === "cablear");
  // Mientras se arrastra un control desde la paleta, el lienzo lleva un borde punteado.
  ventana.classList.toggle("colocando", pan.accion?.tipo === "colocar" && !!pan.accion.arrastrado);
  const tam = { width: innerWidth, height: innerHeight };
  for (const el of document.querySelectorAll(".paleta, .explicacion, .menu-contextual")) dentro(el, tam);
  if (tip.visible) ponerTip();
}

/** The check marks of a menu opened from the page and not from the menu bar: the current page of VI Properties. */
const marcasDelMenuBarra = (id) => new Set(id === VP.CATEGORIES_ID ? [`${VP.CATEGORIES_ID}.execution`] : []);

function cambiar(nuevo) {
  if (nuevo === estado) return;
  estado = nuevo;
  ocultarEmergente();
  pintar();
}

/** A deleted control or indicator leaves the connector pane too: its terminal goes with it. */
function sinTerminalesHuerfanos(view) {
  const g = pruneConnector(view.g, cat);
  return g === view.g ? view : { ...view, g };
}

/**
 * Changes the diagram. When it comes to rest —nothing half done, no text half
 * written—, the step is kept to undo it.
 */
function cambiarDiagrama(nuevo) {
  if (nuevo === dia) return;
  dia = sinTerminalesHuerfanos(nuevo);
  // What Create made is a step of undo before its value or label is typed: the typing is another one (REPORT.md §A).
  if (!dia.accion && (!dia.edicion || dia.edicion.nuevo)) quieto(dia.g);
  pintar();
}

/** Cambiar el panel. Como el diagrama: el paso se guarda cuando queda quieto. */
function cambiarPanel(nuevo) {
  if (nuevo === pan) return;
  pan = sinTerminalesHuerfanos(nuevo);
  if (!pan.accion && !pan.edicion) quieto(pan.g);
  mandarControles(pan.g);
  pintar();
}

function volver(r) {
  if (!r) return;
  historial = r.h;
  if (conDiagrama) dia = { ...dia, g: r.g, seleccion: [], accion: null, menu: null, edicion: null };
  else pan = { ...pan, g: r.g, seleccion: [], accion: null, edicion: null };
  publicado = r.g;
  canal.postMessage({ g: r.g });
  pintar();
}

/** El punto del evento en coordenadas del lienzo. */
function punto(ev) {
  const r = document.querySelector(".lienzo").getBoundingClientRect();
  return { x: ev.clientX - r.left, y: ev.clientY - r.top };
}

/**
 * Qué hay bajo el ratón en el diagrama, en el orden de spec/05 §3.2: terminal,
 * nodo, tramo de cable, fondo. Fuera del lienzo, nada.
 */
function objetivo(el) {
  if (!el?.closest(".lienzo")) return null;
  const etiqueta = el.closest(".etiqueta");
  if (etiqueta) return { tipo: "etiqueta", id: etiqueta.dataset.etiqueta };
  const asa = el.closest(".asa");
  if (asa) return { tipo: "asa", nodo: asa.dataset.nodo, lado: asa.dataset.asa };
  // El selector de marcos de un Case y las filas de su lista.
  const fila = el.closest(".item-marco");
  if (fila) return { tipo: "fila-marco", nodo: fila.dataset.nodo, k: Number(fila.dataset.marco) };
  const zona = el.closest(".marco-zona");
  if (zona) return { tipo: "marco", nodo: zona.dataset.nodo, zona: zona.dataset.zona };
  const t = el.closest(".terminal");
  if (t) return { tipo: "terminal", nodo: t.dataset.nodo, puerto: t.dataset.puerto, dir: t.dataset.dir };
  const n = el.closest(".nodo");
  // Un nodo con celdas (la constante de error) dice sobre cuál se pulsó.
  if (n && !n.closest(".fantasma")) return { tipo: "nodo", id: n.dataset.nodo, ...(el.closest(".celda-error") ? { campo: el.closest(".celda-error").dataset.campo } : {}), ...(el.closest(".celda-array, .celda-grid") ? { campo: addressFromText(el.closest(".celda-array, .celda-grid").dataset.campo) } : {}) };
  const c = el.closest(".tramo-zona");
  if (c) return { tipo: "tramo", cable: c.dataset.cable, k: Number(c.dataset.tramo) };
  return { tipo: "fondo" };
}

/** Qué hay bajo el ratón en el panel: una etiqueta, un objeto o el fondo. Fuera del lienzo, nada. */
function objetivoPanel(el) {
  if (!el?.closest(".lienzo")) return null;
  const etiqueta = el.closest(".etiqueta");
  if (etiqueta) return { tipo: "etiqueta", id: etiqueta.dataset.etiqueta };
  const campo = el.closest(".ec-campo");
  if (campo) return { tipo: "campo", id: campo.closest(".objeto-panel").dataset.nodo, campo: campo.dataset.campo };
  const asaArray = el.closest(".asa-array");
  if (asaArray) return { tipo: "asa-array", id: asaArray.closest(".objeto-panel").dataset.nodo, lado: asaArray.dataset.lado };
  const elem = el.closest(".elem-array");
  if (elem) return { tipo: "elem", id: elem.closest(".objeto-panel").dataset.nodo, k: addressFromText(elem.dataset.k) };
  const flecha = el.closest(".flecha-inc");
  if (flecha) return { tipo: "paso", id: flecha.closest(".objeto-panel").dataset.nodo, paso: Number(flecha.dataset.paso), eje: flecha.closest(".arr-indice")?.dataset.eje };
  const casilla = el.closest(".casilla");
  if (casilla) return { tipo: "casilla", id: casilla.dataset.casilla };
  const o = el.closest(".objeto-panel");
  if (o) return { tipo: "objeto", id: o.dataset.nodo };
  return { tipo: "fondo" };
}

/** The wire under the pointer: a segment of it, or the terminal of a node it ends at (not a structure's border). */
function cableBajoElRaton(sobreElRaton) {
  if (sobreElRaton?.tipo === "tramo") return dia.g.cables.find((c) => c.id === sobreElRaton.cable);
  if (sobreElRaton?.tipo !== "terminal") return undefined;
  const node = dia.g.nodos.find((n) => n.id === sobreElRaton.nodo);
  return node && !D.esBorde(node) ? ED.wireAtTerminal(dia.g, sobreElRaton.nodo, sobreElRaton.puerto, sobreElRaton.dir) : undefined;
}

/** El nodo de lo que hay bajo el ratón, si es un nodo o uno de sus terminales. */
const nodoDe = (o) => (o?.tipo === "terminal" || o?.tipo === "marco" ? o.nodo : o?.tipo === "nodo" ? o.id : null);

/** Un menú de la barra se abre justo bajo su título, alineado con él. */
const anclaMenu = (el) => {
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.bottom };
};

const ancla = (el) => {
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.bottom + 2 };
};

addEventListener("mousedown", (ev) => {
  if (ev.button !== 0) return;
  // Un diálogo de error es modal: sólo responden sus botones.
  if (document.querySelector(".modal-error")) return;
  // VI Properties is modal too: its buttons answer to the click event.
  if (propiedades && !estado.menuBarra) return;
  // Con un menú de la barra abierto, pulsar fuera de él y de los títulos lo cierra.
  if (estado.menuBarra && !ev.target.closest(".menu-contextual, .menu")) return cambiar({ ...estado, menuBarra: null });
  if (estado.menuBarra) return;
  if (ejecutando) return pulsarEnRun(ev);
  if (dia.menu) {
    if (ev.target.closest(".menu-contextual")) return;
    return cambiarDiagrama({ ...dia, menu: null });
  }
  if (pan.menu) {
    if (ev.target.closest(".menu-contextual")) return;
    return cambiarPanel({ ...pan, menu: null });
  }
  // Una función de la paleta que está hecha se coge: la paleta, que es
  // temporal, se cierra, y el bloque cuelga del cursor hasta soltarlo.
  const funcion = ev.target.closest(".paleta .icono-funcion");
  const e = funcion && inv.resolver(funcion.dataset.id);
  if (e && !esHueco(e) && e.bloque && !!cat.bloque(e.bloque).panel === conPanel) {
    ev.preventDefault();
    estado = { ...estado, paleta: null, abierta: null };
    if (conDiagrama) {
      dia = ED.moverA(ED.coger(dia, e.bloque, e.config), ctx, punto(ev));
      dia = { ...dia, accion: { ...dia.accion, arrastrado: false } };
    } else {
      pan = P.moverA(P.coger(pan, e.bloque, e.config), ctx, punto(ev));
      pan = { ...pan, accion: { ...pan.accion, arrastrado: false } };
    }
    return pintar();
  }
  if (estado.paleta || estado.abierta) {
    const enPaleta = !!ev.target.closest(".paleta");
    const enExplicacion = !!ev.target.closest(".explicacion");
    if (enPaleta && (enExplicacion || !estado.abierta)) return;
    return cambiar(E.clicFuera(estado, { enPaleta, enExplicacion }));
  }
  // A click on a cell of the connector pane selects it, to give it a control or an indicator next.
  const panelConector = conPanel && ev.target.closest(`[data-id="${prefijo}.connector-pane"]`);
  if (panelConector) {
    ev.preventDefault();
    return cambiarPanel(CP.selectCell(pan, CP.cellUnderPointer(panelConector.getBoundingClientRect(), ev)));
  }
  if (conPanel) return pulsarPanel(ev);
  const sobreDiagrama = objetivo(ev.target);
  if (!sobreDiagrama) {
    // Fuera del lienzo: Enter Text, o cualquier otro sitio, confirma lo que se escribe.
    if (dia.edicion) return cambiarDiagrama(ED.confirmar(dia, ctx));
    if (dia.accion) cambiarDiagrama(ED.escape(dia));
    return;
  }
  ev.preventDefault();
  // El doble clic en una constante la edita. Se mira el número de pulsación y
  // no el evento dblclick, que se pierde si el primer clic repinta.
  if (ev.detail >= 2 && sobreDiagrama.tipo === "etiqueta") return cambiarDiagrama(ED.editarEtiqueta(dia, sobreDiagrama.id));
  // Un doble clic en el texto del selector de marcos de un Case escribe en él.
  if (ev.detail >= 2 && sobreDiagrama.tipo === "marco" && sobreDiagrama.zona === "texto") return cambiarDiagrama(ED.editarMarco(dia, sobreDiagrama.nodo));
  // A double click on a subVI opens its Front Panel.
  if (ev.detail >= 2 && sobreDiagrama.tipo === "nodo" && SN.isSubVI(dia.g.nodos.find((n) => n.id === sobreDiagrama.id))) return abrirSubVI(sobreDiagrama.id);
  const id = ev.detail >= 2 && nodoDe(sobreDiagrama);
  if (id && (D.CONSTANTES[dia.g.nodos.find((n) => n.id === id)?.tipo]?.editable || dia.g.nodos.find((n) => n.id === id)?.tipo === "expression-node")) return cambiarDiagrama(ED.editar(dia, ctx, id, sobreDiagrama.campo));
  cambiarDiagrama(ED.pulsar(dia, ctx, sobreDiagrama, punto(ev), ev.shiftKey, ev.ctrlKey || ev.metaKey));
});

// ——— Accionar el panel en modo Run ———
//
// Mientras el VI corre, un clic acciona el control: nada se mueve, se
// selecciona ni se borra, y el diagrama no se edita. Un booleano cambia según
// su acción mecánica: los «When Pressed» al pulsar, los «When Released» al
// soltar; un Switch alterna y un Latch pasa a TRUE hasta que el diagrama lo lee.
// Un numérico se escribe en su casilla o con sus flechas, como parado.

/** El booleano pulsado, para cambiarlo al soltar si su acción es «When Released». */
let pulsado = null;

function pulsarEnRun(ev) {
  if (!conPanel) return;
  const sobre = objetivoPanel(ev.target);
  if (!sobre) {
    if (pan.edicion) cambiarPanel(P.confirmar(pan));
    return;
  }
  ev.preventDefault();
  const n = pan.g.nodos.find((k) => k.id === sobre.id);
  if ((sobre.tipo === "casilla" || sobre.tipo === "paso") && (n?.tipo === "control" || n?.tipo === "str-control")) return cambiarPanel(P.pulsar(pan, ctx, sobre, punto(ev), false));
  // Un array se acciona como parado: se escribe en sus elementos y su índice se mueve (también el de un indicador).
  if ((sobre.tipo === "elem" && n?.tipo === "arr-control") || (sobre.tipo === "paso" && (n?.tipo === "arr-control" || n?.tipo === "arr-indicator"))) return cambiarPanel(P.pulsar(pan, ctx, sobre, punto(ev), false));
  // Un control de error se acciona como parado: el status alterna y code y source se escriben.
  if (sobre.tipo === "campo" && n?.tipo === "cluster-control") return cambiarPanel(P.pulsar(pan, ctx, sobre, punto(ev), false));
  if (sobre.tipo !== "objeto" || n?.tipo !== "bool-control") return;
  pulsado = { id: n.id, antes: !!n.config?.value };
  accionar(n, "pulsar");
}

function soltarEnRun() {
  const p = pulsado;
  pulsado = null;
  const n = p && pan.g.nodos.find((k) => k.id === p.id);
  if (n) accionar(n, "soltar", p.antes);
}

function accionar(n, cuando, antes) {
  const accion = n.config?.mechanical ?? P.estiloDe(n.tipo, n.config)?.mecanica ?? "switch-when-pressed";
  const [modo, , momento] = accion.split("-"); // switch|latch, when|until, pressed|released
  const v = !!n.config?.value;
  let nuevo = v;
  if (momento === "pressed" && cuando === "pulsar") nuevo = modo === "latch" ? true : !v;
  else if (accion.includes("when-released") && cuando === "soltar") nuevo = modo === "latch" ? true : !v;
  else if (accion.includes("until-released")) nuevo = cuando === "pulsar" ? !v : antes;
  if (nuevo !== v) cambiarPanel({ ...pan, g: Gr.fijarValor(pan.g, n.id, nuevo) });
}

/** What can be clicked on a panel object to give it a cell of the connector pane. */
const CONECTABLES = ["objeto", "casilla", "campo", "elem", "paso", "asa-array"];

/** Pulsar en el panel: como en el diagrama, un doble clic en una etiqueta escribe en ella. */
function pulsarPanel(ev) {
  const sobre = objetivoPanel(ev.target);
  if (!sobre) {
    // Fuera del lienzo: Enter Text, o cualquier otro sitio, confirma lo que se escribe.
    if (pan.edicion) return cambiarPanel(P.confirmar(pan));
    if (pan.accion) cambiarPanel(P.escape(pan));
    return;
  }
  ev.preventDefault();
  // A cell of the connector pane is waiting for a control or an indicator: this click gives it one.
  if (pan.conector) return cambiarPanel(CP.assignClicked(pan, cat, CONECTABLES.includes(sobre.tipo) ? sobre.id : null));
  if (ev.detail >= 2 && sobre.tipo === "etiqueta") return cambiarPanel(P.editar(pan, sobre.id));
  // Doble clic en la casilla de un control: todo el valor seleccionado.
  if (ev.detail >= 2 && sobre.tipo === "casilla" && pan.edicion?.valor) return cambiarPanel(P.editarValor(pan, ctx, sobre.id, true));
  if (ev.detail >= 2 && sobre.tipo === "elem" && pan.edicion?.elem === sobre.k) return cambiarPanel(P.editarElemento(pan, ctx, sobre.id, sobre.k, true));
  if (ev.detail >= 2 && sobre.tipo === "campo" && pan.edicion?.campo === sobre.campo) return cambiarPanel(P.editarValor(pan, ctx, sobre.id, true, sobre.campo));
  cambiarPanel(P.pulsar(pan, ctx, sobre, punto(ev), ev.shiftKey, ev.ctrlKey || ev.metaKey));
}

addEventListener("mousemove", (ev) => {
  mostrarTip(ev);
  if (ev.target.closest?.(".lienzo")) punteroEnLienzo = punto(ev);
  if (conPanel) {
    // Pasar por una fila con submenú lo abre; por otra, lo cierra.
    const fila = pan.menu && ev.target.closest(".item-menu");
    if (fila) {
      const nuevo = ED.sobreMenu(pan, fila.dataset.id, inv.tieneContenido(fila.dataset.id));
      if (nuevo !== pan) {
        pan = nuevo;
        pintar();
      }
    }
    if (pan.accion) {
      pan = P.moverA(pan, ctx, punto(ev));
      pintar();
    }
    return;
  }
  let nuevo = dia;
  const item = ev.target.closest(".item-menu");
  if (nuevo.menu && item) nuevo = ED.sobreMenu(nuevo, item.dataset.id, inv.tieneContenido(item.dataset.id));
  if (!nuevo.menu) nuevo = ED.sobrevolar(nuevo, objetivo(ev.target));
  if (nuevo.accion) nuevo = ED.moverA(nuevo, ctx, punto(ev));
  if (nuevo !== dia) {
    dia = nuevo;
    pintar();
  }
});

addEventListener("mouseup", (ev) => {
  if (ev.button !== 0) return;
  if (pulsado) return soltarEnRun();
  if (conPanel && pan.accion) return cambiarPanel(P.soltar(pan, ctx, objetivoPanel(document.elementFromPoint(ev.clientX, ev.clientY)), punto(ev)));
  if (!conDiagrama || !dia.accion) return;
  cambiarDiagrama(ED.soltar(dia, ctx, objetivo(document.elementFromPoint(ev.clientX, ev.clientY)), punto(ev)));
});

addEventListener("click", (ev) => {
  const boton = ev.target.closest(".modal-error .boton-dialogo:not([disabled])");
  if (boton) return responderDialogo(boton.dataset.boton);
  if (ev.target.closest(".modal-error")) return;
  if (ev.target.closest(".explicacion")) return;
  if (propiedades && !ev.target.closest(".menu-contextual")) return clicPropiedades(ev);
  // Una fila del menú de la barra: lo hecho se hace; un hueco, se explica.
  const filaBarra = estado.menuBarra && ev.target.closest(".item-menu");
  if (filaBarra) {
    // A row greyed by the state of the window (Cut with nothing selected) does nothing and leaves the menu open.
    if (filaBarra.classList.contains("desactivado")) return;
    const id = filaBarra.dataset.id;
    const e = inv.resolver(id);
    const orden = !esHueco(e) && ORDENES_MENU[id.slice(id.lastIndexOf(".") + 1)];
    if (orden) {
      cambiar({ ...estado, menuBarra: null });
      return orden();
    }
    return cambiar(E.clic({ ...estado, menuBarra: null }, inv, id, ancla(filaBarra)));
  }
  // Una fila de un menú de clic derecho: un submenú se abre, lo hecho se hace y
  // un hueco se explica (regla 53).
  const fila = (conDiagrama ? dia : pan).menu && ev.target.closest(".item-menu");
  if (fila) {
    const id = fila.dataset.id;
    // The menu belongs to the diagram or the panel: both are handled with the same functions (diagram-editing.mjs).
    const [actual, cambiarActual] = conDiagrama ? [dia, cambiarDiagrama] : [pan, cambiarPanel];
    if (inv.tieneContenido(id)) return cambiarActual(ED.sobreMenu(actual, id, true));
    const e = inv.resolver(id);
    if (!esHueco(e)) {
      // A row greyed by the context (no terminal under the cursor) does nothing.
      if (fila.classList.contains("desactivado")) return;
      const orden = ORDENES_CONTEXTUALES[ultimo(id)];
      if (orden) {
        cambiarActual({ ...actual, menu: null });
        return orden(actual.menu.nodo);
      }
      return cambiarActual(ED.orden(actual, id, ctx));
    }
    const donde = ancla(fila);
    if (conDiagrama) dia = { ...dia, menu: null };
    else pan = { ...pan, menu: null };
    return cambiar(E.clic(estado, inv, id, donde));
  }
  const el = ev.target.closest("[data-id]");
  if (!el || inerte(el)) return;
  // La flecha de Run, hecha: ejecuta el VI; rota, dice por qué no se puede.
  if (el.dataset.id === `${prefijo}.toolbar.run` && !esHueco(inv.resolver(el.dataset.id))) return ejecutarVI();
  if (el.dataset.id === `${prefijo}.toolbar.abort-execution`) return abortar();
  if (el.dataset.id === "palette.functions.select-a-vi" && !esHueco(inv.resolver(el.dataset.id))) return seleccionarVI();
  const donde = abreSubpaleta(el) ? V.anclaSubpaleta(el.getBoundingClientRect()) : el.classList.contains("menu") ? anclaMenu(el) : ancla(el);
  cambiar(E.clic(estado, inv, el.dataset.id, donde, nivelDe(el)));
});

addEventListener("contextmenu", (ev) => {
  ev.preventDefault();
  // En modo Run, LabVIEW da otro menú (el de ejecución), sin capturar todavía.
  if (ejecutando || propiedades) return;
  // The connector pane and the icon have menus of their own.
  const iconoVI = ev.target.closest(".icono-vi");
  if (iconoVI) return menuDelIcono(ev, iconoVI);
  if (!ev.target.closest(".lienzo")) return;
  // En el panel, la paleta sale sobre el fondo y, sobre un control booleano,
  // su menú. El de los numéricos aún no está capturado: sobre ellos, el clic
  // derecho no hace nada.
  if (conPanel) {
    if (pan.edicion) pan = P.confirmar(pan);
    const sobrePanel = objetivoPanel(ev.target);
    if (sobrePanel?.tipo === "objeto") {
      const raizPanel = P.menuDe(pan.g.nodos.find((k) => k.id === sobrePanel.id));
      if (raizPanel) {
        estado = { ...estado, paleta: null, abierta: null };
        return cambiarPanel(ED.abrirMenu(pan, raizPanel, sobrePanel.id, ev.clientX, ev.clientY));
      }
    }
    if (sobrePanel?.tipo !== "fondo") return cambiarPanel(pan);
    pan = { ...pan, menu: null };
    quieto(pan.g);
  }
  // Sobre un nodo, su menú; sobre el fondo, la paleta.
  const o = conDiagrama && objetivo(ev.target);
  // On a wire, or on a terminal that has one, the menu is the wire's (REPORT.md §A).
  const cable = cableBajoElRaton(o);
  if (cable) {
    estado = { ...estado, paleta: null, abierta: null };
    return cambiarDiagrama(ED.abrirMenu(ED.confirmar(dia, ctx), ED.WIRE_MENU_ROOT, cable.id, ev.clientX, ev.clientY, null, punto(ev)));
  }
  const id = nodoDe(o);
  const n = id && dia.g.nodos.find((k) => k.id === id);
  const puerto = o?.tipo === "terminal" ? o.puerto : null;
  const raiz = n && D.menuDe(n, puerto, dia.g);
  if (raiz) {
    estado = { ...estado, paleta: null, abierta: null };
    return cambiarDiagrama(ED.abrirMenu(ED.confirmar(dia, ctx), raiz, id, ev.clientX, ev.clientY, puerto, punto(ev)));
  }
  if (dia.menu) dia = { ...dia, menu: null };
  cambiar(E.clicDerecho(estado, inv, nombre, { x: ev.clientX, y: ev.clientY }));
});

addEventListener("keydown", (ev) => {
  const ctrl = ev.ctrlKey || ev.metaKey;
  // Con un diálogo de error abierto, Intro pulsa su botón de fábrica.
  if (dialogoError) {
    if (ev.key === "Enter") responderDialogo(dialogoError.pregunta === "error-automatico" ? "continuar" : "ok");
    return ev.preventDefault();
  }
  // VI Properties: Esc cancels (or closes what is open over it) and Enter accepts.
  if (propiedades) {
    ev.preventDefault();
    if (ev.key === "Escape") return estado.abierta || estado.menuBarra ? cambiar(E.escape(estado)) : cerrarPropiedades(false);
    if (ev.key === "Enter") cerrarPropiedades(true);
    return;
  }
  // Ctrl+Intro confirma lo escrito en el source de un control de error (labview-captures/errores/35.png).
  if (conPanel && pan.edicion?.campo === "source" && ctrl && ev.key === "Enter") {
    ev.preventDefault();
    return cambiarPanel(P.confirmar(pan));
  }
  // File ▸ Save, Open y Exit, con los atajos de LabVIEW.
  if (ctrl && !ev.shiftKey && !ev.altKey) {
    const orden = { s: "save", o: "open", q: "exit", i: "vi-properties" }[ev.key.toLowerCase()];
    if (orden) {
      ev.preventDefault();
      return ORDENES_MENU[orden]();
    }
    // Ctrl+R: Run, y Ctrl+.: Abort, los atajos de LabVIEW.
    if (ev.key.toLowerCase() === "r") {
      ev.preventDefault();
      return ejecutarVI();
    }
    if (ev.key === ".") {
      ev.preventDefault();
      return abortar();
    }
  }
  if (conDiagrama && dia.edicion && !ctrl) {
    ev.preventDefault();
    // En una constante numérica Intro confirma; en una etiqueta o una cadena empieza otra línea, y
    // se confirma con Enter Text o con un clic fuera, como en LabVIEW.
    if (ev.key === "Enter" && !dia.edicion.etiqueta && !dia.edicion.cadena) return cambiarDiagrama(ED.confirmar(dia, ctx));
    if (ev.key === "Escape") return cambiarDiagrama(ED.escape(dia));
    return cambiarDiagrama(ED.teclear(dia, ev.key));
  }
  if (conPanel && pan.edicion && !ctrl) {
    ev.preventDefault();
    if (ev.key === "Escape") return cambiarPanel(P.escape(pan));
    return cambiarPanel(P.teclear(pan, ev.key));
  }
  // En modo Run no se edita: ni borrar, ni mover con las flechas, ni deshacer.
  if (ejecutando) return;
  if (ev.key === "Escape") {
    if (estado.paleta || estado.abierta || estado.menuBarra) return cambiar(E.escape(estado));
    return conDiagrama ? cambiarDiagrama(ED.escape(dia)) : cambiarPanel(P.escape(pan));
  }
  // Ctrl+C, Ctrl+X, Ctrl+V and Ctrl+A: the Edit menu's shortcuts, on what is selected on this canvas.
  const ordenEdicion = ctrl && !ev.shiftKey && !ev.altKey && !estado.paleta && !(conDiagrama ? dia.edicion : pan.edicion) && { c: copiar, x: cortar, v: pegar, a: seleccionarTodo }[ev.key.toLowerCase()];
  if (ordenEdicion) {
    ev.preventDefault();
    return ordenEdicion();
  }
  if (conPanel && !estado.paleta) {
    if (ctrl && ev.key.toLowerCase() === "z" && !pan.accion) {
      ev.preventDefault();
      return volver(ev.shiftKey ? H.rehacer(historial) : H.deshacer(historial));
    }
    if (ev.key === "Delete" || ev.key === "Backspace") return cambiarPanel(P.borrarSeleccion(pan));
    if (ev.key.startsWith("Arrow")) {
      ev.preventDefault();
      return cambiarPanel(P.flecha(pan, ctx, ev.key, ev.shiftKey));
    }
  }
  if (conDiagrama && !estado.paleta) {
    if (ctrl && ev.key.toLowerCase() === "z" && !dia.accion) {
      ev.preventDefault();
      return volver(ev.shiftKey ? H.rehacer(historial) : H.deshacer(historial));
    }
    if (ev.key === "Delete" || ev.key === "Backspace") return cambiarDiagrama(ED.borrarSeleccion(dia));
    if (ev.key.startsWith("Arrow")) {
      ev.preventDefault();
      return cambiarDiagrama(ED.flecha(dia, ev.key, ev.shiftKey, ctx));
    }
  }
  const pulsacion = { ctrl, shift: ev.shiftKey, alt: ev.altKey, tecla: ev.key };
  const anclaDe = (id) => {
    const el = document.querySelector(`[data-id="${CSS.escape(id)}"]`);
    return el ? ancla(el) : null;
  };
  const nuevo = E.tecla(estado, inv, prefijo, pulsacion, anclaDe);
  if (nuevo !== estado) {
    ev.preventDefault();
    cambiar(nuevo);
  }
});

// Al pasar el ratón por un hueco, su explicación (regla 54). Por una carpeta
// con contenido, su subpaleta se abre al lado, como en LabVIEW; por otra
// carpeta, se cierra lo que colgaba de esa paleta.
let temporizador = null;
let temporizadorCarpeta = null;
let sobre = null;
let emergente = null;

function ocultarEmergente() {
  clearTimeout(temporizador);
  emergente?.remove();
  emergente = null;
}

addEventListener("mouseover", (ev) => {
  // Con un menú de la barra abierto, pasar por otro título lo abre en su lugar.
  const titulo = estado.menuBarra && ev.target.closest(".menu");
  if (titulo && titulo.dataset.id !== estado.menuBarra.id && inv.tieneContenido(titulo.dataset.id)) {
    return cambiar(E.abrirMenuBarra({ ...estado, menuBarra: null }, inv, titulo.dataset.id, anclaMenu(titulo)));
  }
  let el = ev.target.closest("[data-id]");
  if (el === sobre) return;
  sobre = el;
  // En una subpaleta, lo que está bajo el ratón se enmarca y su nombre sale bajo el título.
  if (estado.paleta) {
    const icono = el?.closest(".subpaleta") && (el.classList.contains("icono-funcion") || el.classList.contains("carpeta")) ? el.dataset.id : null;
    if (icono !== (estado.paleta.sobre ?? null)) {
      // Se repinta después del evento: si el ratón llega y pulsa a la vez, la
      // pulsación tiene que caer en el icono que había, no en uno repintado.
      setTimeout(() => {
        if (!estado.paleta || (estado.paleta.sobre ?? null) === icono) return;
        estado = E.sobrePaleta(estado, icono);
        pintar();
        sobre = icono ? document.querySelector(`[data-id="${CSS.escape(icono)}"]`) : null;
      });
    }
  }
  ocultarEmergente();
  clearTimeout(temporizadorCarpeta);
  if (el?.classList.contains("carpeta") && estado.paleta) {
    const [id, nivel] = [el.dataset.id, nivelDe(el)];
    if (abreSubpaleta(el)) {
      const donde = V.anclaSubpaleta(el.getBoundingClientRect());
      temporizadorCarpeta = setTimeout(() => cambiar(E.abrirSubpaleta(estado, inv, id, nivel, donde)), 250);
      return;
    }
    // Otra carpeta: lo que colgaba de su paleta se cierra ya, y después sale su
    // explicación, anclada en la carpeta repintada.
    cambiar(E.cerrarSubpaletas(estado, nivel));
    el = sobre = document.querySelector(`[data-id="${CSS.escape(id)}"]`);
  }
  // The rows of a right-click menu are explained by clicking them, except the nameless thumbnails of the connector patterns: hovering one says why it is greyed.
  if (!el || inerte(el) || ev.target.closest(".explicacion") || (el.closest(".menu-contextual") && !el.classList.contains("celda-patron"))) return;
  const e = inv.resolver(el.dataset.id);
  if (!e || !esHueco(e)) return;
  temporizador = setTimeout(() => {
    emergente = document.createElement("div");
    emergente.className = "emergente";
    emergente.innerHTML = V.explicacion(inv, e);
    const { x, y } = ancla(el);
    emergente.style.left = `${x}px`;
    emergente.style.top = `${y}px`;
    document.body.append(emergente);
    dentro(emergente, { width: innerWidth, height: innerHeight });
  }, 500);
});

addEventListener("mouseleave", ocultarEmergente);

// El tip strip de LabVIEW: el nombre de un terminal, de una función de la
// paleta o, en un cable roto, por qué lo está. Sale enseguida, debajo del
// ratón, y sobrevive a los repintados mientras el ratón siga en lo mismo.
const tip = { clave: null, texto: "", x: 0, y: 0, visible: false, temporizador: null };

function ponerTip() {
  const el = document.createElement("div");
  el.className = "tip";
  el.textContent = tip.texto;
  el.style.left = `${tip.x}px`;
  el.style.top = `${tip.y}px`;
  document.body.append(el);
  dentro(el, { width: innerWidth, height: innerHeight });
}

function ocultarTip() {
  clearTimeout(tip.temporizador);
  document.querySelector(".tip")?.remove();
  Object.assign(tip, { clave: null, visible: false });
}

function mostrarTip(ev) {
  const el = ev.target.closest?.("[data-tip]");
  const e = el?.dataset.id && inv.resolver(el.dataset.id);
  const ocupado = ["colocar", "mover", "tramo", "rectangulo", "etiqueta"].includes((dia.accion ?? pan.accion)?.tipo);
  if (!el || (e && esHueco(e)) || ocupado || dia.menu) return ocultarTip();
  const clave = `${el.dataset.nodo ?? ""}.${el.dataset.puerto ?? el.dataset.cable ?? el.dataset.id ?? ""}`;
  if (clave === tip.clave) return;
  ocultarTip();
  Object.assign(tip, { clave, texto: el.dataset.tip, x: ev.clientX - 3, y: ev.clientY + 24 });
  tip.temporizador = setTimeout(() => {
    tip.visible = true;
    ponerTip();
  }, 150);
}

// Everything above is declared: now the VI is loaded and the window starts to talk to the other one.
window.solder?.portapapeles.alCambiar(recibirPortapapeles);
recibirPortapapeles(await window.solder?.portapapeles.leer());
if (viInfo.text) await cargarTexto(viInfo.text);
pintar();
avisar(grafo());
listo = true;
canal.postMessage({ pide: true });

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
import * as DS from "../debugging/debug-state.mjs";
import * as DV from "../debugging/debug-view.mjs";
import * as EL from "../debugging/error-list.mjs";
import { buildDebugPlan } from "../debugging/debug-plan.mjs";
import * as D from "../block-diagram/diagram-view.mjs";
import * as DC from "../block-diagram/diagram-clipboard.mjs";
import * as ED from "../block-diagram/diagram-editing.mjs";
import * as UN from "../block-diagram/unbundle-by-name.mjs";
import * as EM from "./edit-menu.mjs";
import * as Et from "../common/labels.mjs";
import * as E from "./window-state.mjs";
import * as G from "../common/glyphs.mjs";
import * as Gr from "../../../core/model/graph.mjs";
import * as H from "../block-diagram/undo-history.mjs";
import { cargarInventario, esHueco, ultimo } from "../common/labview-inventory.mjs";
import { addressFromText } from "../common/array-grid.mjs";
import * as MD from "./modal-dialog.mjs";
import * as GM from "../front-panel/graph-menus.mjs";
import * as GS from "../front-panel/graph-state.mjs";
import * as P from "../front-panel/front-panel.mjs";
import * as PC from "../front-panel/panel-clipboard.mjs";
import * as Paths from "../common/vi-paths.mjs";
import * as Q from "../../../core/model/qvi-format.mjs";
import * as SN from "../block-diagram/subvi-nodes.mjs";
import { commandForCtrlKey } from "./shortcuts.mjs";
import * as RV from "./run-values.mjs";
import * as Sync from "./graph-sync.mjs";
import * as VP from "./vi-properties.mjs";
import * as V from "./window-view.mjs";
import { buildHierarchy } from "./hierarchy-client.mjs";
import { compilar } from "../../../core/compiler/compiler.mjs";
import { pruneConnector } from "../../../core/model/connector.mjs";
import * as CV from "../../../core/model/control-values.mjs";

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
/** The stamp of the graph this window holds, to tell a newer copy from an older one (graph-sync.mjs). */
let stamp = Sync.initialStamp();
/** The window answers the other one only once it has loaded its VI: before that, its graph is an empty one. */
let listo = false;

/**
 * Sends the graph this window holds to the other one, stamped as a newer copy,
 * with the subVI texts it needs to understand it. `markModified`: the main
 * process learns the VI changed (the asterisk in the title); a graph rebuilt
 * after a hierarchy change is shared without it.
 */
function publicarGrafo(g, { markModified = true } = {}) {
  publicado = g;
  stamp = Sync.afterLocalChange(stamp, nombre);
  canal.postMessage({ g, subVITexts, stamp });
  if (markModified) avisar(g);
}

/**
 * The graph has come to rest —nothing half done, no text half written—: the
 * step is kept to undo it and the other window receives it.
 */
function quieto(g) {
  // The values of a Run are not steps to undo.
  if (!ejecutando) historial = H.registrar(historial, g);
  if (conDiagrama) setDebug(DS.pruneToGraph(debug, g));
  if (g === publicado) return;
  publicarGrafo(g);
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
 * returns `g` with the wires to ports a subVI no longer has left broken, with a
 * loose end where those terminals were drawn (DT-046). The VI is not marked
 * modified, as in LabVIEW (labview-captures/broken-wires/REPORT.md §2).
 */
function rebuildHierarchy(g) {
  const placeOfOldTerminal = ED.terminalPlacer(ctx);
  const result = buildHierarchy({ rootKey: viKey, rootGraph: g, texts: subVITexts, baseCatalog, readVI: Q.leer });
  cat = result.catalog;
  ctx = D.contexto(cat, glifos, separador, medirMenu);
  hierarchyErrors = result.errors;
  hierarchyKeys = result.keys;
  return Gr.aflojarCablesHuerfanos(g, cat, placeOfOldTerminal);
}

/**
 * Puts a graph in this window's view, without it counting as an edit. `share`:
 * only this window computed it (the rest compute theirs), so the other one is sent it, if it differs.
 */
function ponerGrafo(g, { share = false } = {}) {
  const changed = share && JSON.stringify(g) !== JSON.stringify(grafo());
  if (conDiagrama) dia = { ...dia, g };
  else pan = { ...pan, g };
  if (changed) publicarGrafo(g, { markModified: false });
  else publicado = g;
}

/** Reads the subVI files again and redraws: a subVI was saved, or a Run is about to start. */
async function refrescarJerarquia() {
  const { texts } = await window.solder.textosDeSubVIs(Q.aTexto(grafo(), cat));
  subVITexts = texts;
  ponerGrafo(rebuildHierarchy(grafo()), { share: true });
  pintar();
}

/** Does this graph have a subVI node whose callee this window does not know yet? */
const faltaSubVI = (g) => g.nodos.some((n) => SN.isSubVI(n) && !cat.findSubVI?.(n.config?.vi));

/** The name an error source gives this VI: its file name once saved, "Untitled N" before (spec/04 Rule 21k). */
const currentVIName = () => (Paths.isSavedKey(viKey) ? viKey.split(/[\\/]/).pop() : viInfo.name);

/**
 * The page's own title follows the window's (which the main process sets, asterisk included):
 * tools that find a window by its page, as the tests under Xvfb do, saw "Untitled 1" in every VI
 * (real-programs-0.3.md B16).
 */
const showVINameInPageTitle = () => (document.title = `${currentVIName()} ${conPanel ? "Front Panel" : "Block Diagram"}`);
showVINameInPageTitle();

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
  showVINameInPageTitle();
  ponerGrafo(rebuildHierarchy(Paths.rebaseGraph(grafo(), old, key)));
  pintar();
}
window.solder?.alGuardar(alGuardarOtroVI);
// Leaving this window (switching to the other one) commits what is being typed, as clicking outside does.
addEventListener("blur", () => confirmarEscritura());

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
  stamp = Sync.initialStamp();
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

/**
 * What reaches the indicators: it is shown on the panel and does not change the VI. `series`: each value
 * written to a Waveform Chart since the last time, in order; the chart adds them to its history, which
 * outlives the Run (labview-captures/graphs/REPORT.md §4).
 */
function mostrarValores(valores, series = {}) {
  pan = { ...pan, valores: { ...(pan.valores ?? {}), ...valores }, charts: appendSeries(pan.charts, series) };
  pintar();
}

/** The charts with what the VI wrote to them appended, by the type their wire carries now. */
function appendSeries(charts, series) {
  const nodeIds = Object.keys(series);
  if (!nodeIds.length) return charts;
  const resolved = Gr.tipos(grafo(), cat);
  return nodeIds.reduce((all, nodeId) => {
    const node = grafo().nodos.find((candidate) => candidate.id === nodeId);
    const type = GS.wireTypeOf(grafo(), resolved, nodeId);
    return node && type !== undefined ? GS.appendedToChart(all, nodeId, series[nodeId], type, GS.graphSettings(node).historyLength) : all;
  }, charts ?? {});
}

const valoresDeControles = (g) => Object.fromEntries(g.nodos.filter(RV.isControl).map((n) => [n.id, CV.startValue(n)]));

/** Las dos ventanas entran en modo Run o salen de él. */
function modoRun(si) {
  ejecutando = si;
  if (si) descartarTip();
  if (!si) {
    // The controls keep what was operated; the indicators keep what they show, as their current value
    // (run-values.mjs). Each window does it with the same values, so nothing is shared; it is one step to undo.
    const after = RV.afterRun(grafo(), pan.valores);
    pan = { ...pan, valores: after.shownValues };
    ponerGrafo(after.graph);
    historial = H.registrar(historial, after.graph);
  }
  debug = si ? DS.startRun(debug, grafo(), Date.now()) : DS.endRun(debug, grafo());
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
    if (RV.sameValue(vistos[nodo], valor)) continue;
    vistos[nodo] = valor;
    if (lanzado) trabajador.postMessage({ orden: "control", nodo, valor });
    else canal.postMessage({ control: { nodo, valor } });
  }
}

/** Un Latch leído vuelve a FALSE en las dos ventanas, sin que cuente como edición. */
function soltarLatch(nodo) {
  vistos[nodo] = false;
  if (conDiagrama) dia = { ...dia, g: CV.setCurrentValue(dia.g, nodo, false) };
  else pan = { ...pan, g: CV.setCurrentValue(pan.g, nodo, false) };
  pintar();
}

function alMensaje(data) {
  if (data.escritos || data.series) {
    mostrarValores(data.escritos ?? {}, data.series);
    canal.postMessage({ valores: data.escritos ?? {}, series: data.series });
  }
  if (data.debug) applyDebugEvent(data.debug);
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

async function ejecutarVI({ stepFirst = false } = {}) {
  // Run con el VI corriendo no hace nada, como en LabVIEW.
  if (ejecutando) return;
  confirmarEscritura();
  // The subVIs may have been saved since this VI was opened: Run compiles what is on disk now.
  await refrescarJerarquia();
  if (ejecutando) return;
  const g = grafo();
  // A VI that cannot run opens the Error list, as the broken arrow does in LabVIEW (REPORT.md §5).
  if (errorRows().length) return openErrorList();
  const c = compilar(g, cat, { name: currentVIName() });
  if (c.errores) return window.solder?.avisar("The VI cannot run.", c.errores.map((e) => e.motivo).join("\n"));
  const debugging = allowsDebugging(g) ? { plan: (debugPlan = buildDebugPlan(g, c.debugNodes, ctx, inv)), config: DS.controllerConfig(debug, g), stepFirst } : null;
  if (!trabajador) {
    trabajador = new Worker(new URL("./run-worker.mjs", import.meta.url), { type: "module" });
    trabajador.onmessage = ({ data }) => alMensaje(data);
  }
  lanzado = true;
  canal.postMessage({ ejecutando: true });
  modoRun(true);
  trabajador.postMessage({ orden: "run", clave: viKey, compilado: { bytes: c.bytes, controles: c.controles, indicadores: c.indicadores, clumps: c.clumps, planes: c.planes, automaticos: c.automaticos, disposicionError: c.disposicionError, debugFlag: c.debugFlag, debugNodes: c.debugNodes }, depuracion: debugging, valores: valoresDeControles(g), separador, charts: g.nodos.filter((n) => n.tipo === "waveform-chart").map((n) => n.id) });
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
  "new-vi": () => window.solder?.nuevoVI(),
  close: () => (confirmarEscritura(), window.solder?.cerrarVentana()),
  "close-all": () => (confirmarEscritura(), window.solder?.cerrarTodos()),
  exit: () => (confirmarEscritura(), window.solder?.salir()),
  "getting-started-window": () => window.solder?.inicio.mostrar(),
  "toggle-window": () => (confirmarEscritura(), window.solder?.alternarVentana()),
  "tile-left-and-right": () => (confirmarEscritura(), window.solder?.teselar()),
  "vi-properties": abrirPropiedades,
  // Edit menu (the same commands as the shortcuts):
  undo: () => deshacerPaso(),
  redo: () => rehacerPaso(),
  cut: () => cortar(),
  copy: () => copiar(),
  paste: () => pegar(),
  delete: () => borrarLoSeleccionado(),
  "remove-broken-wires-from-selection": () => quitarCablesRotos(),
  "make-current-values-default": () => changeDefaults(CV.makeCurrentValuesDefault),
  "reinitialize-values-to-default": () => changeDefaults(CV.reinitializeToDefault),
  "make-selected-values-default": () => changeDefaults(CV.makeCurrentValuesDefault),
  "reinitialize-selected-values-to-default": () => changeDefaults(CV.reinitializeToDefault),
  "select-all": () => seleccionarTodo(),
  "remove-breakpoints-from-hierarchy": () => removeAllBreakpoints(),
  // View menu of the diagram:
  "debug-window": () => openDebugWindow(),
  "error-list": () => openErrorList(),
};

/** The orders of the context menus (subVI node, connector pane, icon) that act on the window and not on the graph; they receive the node the menu was opened on. */
const ORDENES_CONTEXTUALES = { "vi-properties": () => abrirPropiedades(), "open-front-panel": (nodeId) => abrirSubVI(nodeId), "list-errors": (wireId) => openErrorList(`wire.${wireId}`) };

// ——— Debugging (DT-047) ———
//
// Highlight Execution, Retain Wire Values, probes, breakpoints and the steps (debugging/debug-state.mjs)
// are state of the VI that is open, shared by its two windows: the diagram is the one that changes it
// and sends it to the panel (`debugState`), and both apply what the run worker reports (`debugEvent`).
// The Debug Window and the Error list are windows of the diagram, drawn over it like the dialogs
// (debugging/debug-view.mjs). The controller that stops and paces the VI is in the run worker.

let debug = DS.initial();
let errorList = EL.initial();
/** The object Show Error framed on the diagram: `{ node }` or `{ wire }`, until the next click on the diagram. */
let errorFocus = null;
/** What the floating windows remember: where they are, the popup that hangs from them and the question of the X. */
let debugUi = { debugWindowAt: null, errorListAt: null, menu: null, askingToCloseProbes: false, drag: null, speedMenuTimer: null, ignoreNextClick: false };
/** The plan of the diagram of the Run in progress, for the names and the kind of container of the node it stops at. */
let debugPlan = null;

const allowsDebugging = (g) => g.vi?.execution?.["allow-debugging"] !== false;

/** The debug state changed here (the diagram): the panel gets it and the worker learns what it wants now. */
function setDebug(next) {
  if (next === debug) return;
  debug = next;
  if (conDiagrama) canal.postMessage({ debugState: debug });
  sendDebugConfig();
  pintar();
}

/** What the controller in the worker must know now: Highlight Execution, probes, breakpoints. */
function sendDebugConfig() {
  if (ejecutando) toWorker({ orden: "debug-config", config: DS.controllerConfig(debug, grafo()) });
}

/** A message for the run worker, which lives in the window that launched the Run (the other one asks over the channel). */
function toWorker(message) {
  if (lanzado) trabajador?.postMessage(message);
  else canal.postMessage({ workerMessage: message });
}

/** What the run worker said about the VI: it is applied here and the other window gets it too. */
function applyDebugEvent(event, fromChannel = false) {
  if (!fromChannel) canal.postMessage({ debugEvent: event });
  debug = DS.applyDebugEvent(debug, event, grafo(), Date.now());
  pintar();
}

/** The toolbar's debugging buttons in the state of the VI now (debugging/debug-state.mjs `toolbarState`). */
function debugToolbar() {
  const paused = debug.run.paused;
  const node = paused && grafo().nodos.find((candidate) => candidate.id === paused.node);
  const container = paused?.container && grafo().nodos.find((candidate) => candidate.id === paused.container);
  return DS.toolbarState({
    phase: DS.phaseOf({ running: ejecutando, run: debug.run }),
    broken: !Gr.ejecutable(grafo(), cat, Gr.tipos(grafo(), cat)) || hierarchyErrors.length > 0,
    allowDebugging: allowsDebugging(grafo()),
    highlight: debug.highlight,
    retain: debug.retain,
    viName: viInfo.name,
    nodeName: paused?.name ?? "",
    nodeIsSubVI: !!node && SN.isSubVI(node),
    container: container ? (container.tipo === "while-loop" || container.tipo === "for-loop" ? "loop" : "structure") : null,
  });
}

/** Highlight Execution button: toggles; held, it opens the menu of speeds (REPORT.md §1). */
const clickHighlight = () => allowsDebugging(grafo()) && setDebug(DS.toggleHighlight(debug));
const clickRetain = () => allowsDebugging(grafo()) && setDebug(DS.toggleRetain(debug));

/** Pause, Continue and the three steps. In edit mode the steps start the VI stopped at its first node (Start Single Stepping, unverified). */
function clickPause() {
  if (!allowsDebugging(grafo())) return;
  if (!ejecutando) return;
  if (debug.run.paused) return toWorker({ orden: "debug-resume", modo: "continue" });
  toWorker({ orden: "debug-pause" });
}

function clickStep(mode) {
  if (!allowsDebugging(grafo())) return;
  if (!ejecutando) return mode === "out" ? undefined : ejecutarVI({ stepFirst: true });
  if (!debug.run.paused) return;
  if (mode === "into" && !debugToolbar()["step-into"].enabled) return;
  toWorker({ orden: "debug-resume", modo: mode });
}

/** What each debugging button does, by the last segment of its id. */
const TOOLBAR_ACTIONS = {
  "highlight-execution": () => clickHighlight(),
  "retain-wire-values": () => clickRetain(),
  pause: () => clickPause(),
  "step-into": () => clickStep("into"),
  "step-over": () => clickStep("over"),
  "step-out": () => clickStep("out"),
};

/** The speed menu hangs from the Highlight Execution button; its rows are the inventory's. */
const HIGHLIGHT_BUTTON_ID = "window.block-diagram.toolbar.highlight-execution";
const SPEED_ROWS = { slow: "slow", medium: "medium", fast: "fast", "very-fast": "very-fast" };

function openSpeedMenu(button) {
  const where = anclaMenu(button);
  estado = E.abrirMenuBarra({ ...estado, menuBarra: null }, inv, HIGHLIGHT_BUTTON_ID, where);
  pintar();
}

/** Releasing over a speed picks it; releasing anywhere else just closes the menu, and the bulb stays on (REPORT.md §1). */
function finishSpeedMenu(ev) {
  const row = ev.target.closest?.(".item-menu");
  const speed = row && Object.keys(SPEED_ROWS).find((key) => row.dataset.id === `${HIGHLIGHT_BUTTON_ID}.${key}`);
  estado = { ...estado, menuBarra: null };
  debugUi.ignoreNextClick = true;
  setDebug(speed ? DS.setHighlightSpeed(debug, speed) : debug.highlight.on ? debug : DS.toggleHighlight(debug));
  pintar();
}

// ——— Probes and breakpoints, from the menus of the diagram ———

/** The orders of the context menus that belong to the debugger; `target` is the node or the wire the menu was opened on. */
function breakpointTarget(menu) {
  return menu.raiz === ED.WIRE_MENU_ROOT ? { wire: menu.nodo } : { node: menu.nodo };
}

const DEBUG_CONTEXT_ORDERS = {
  "add-probe": (_id, menu) => setDebug(DS.addProbe(debug, menu.nodo)),
  "generic-probe": (_id, menu) => setDebug(DS.addProbe(debug, menu.nodo)),
  "add-breakpoint": (_id, menu) => {
    const target = breakpointTarget(menu);
    setDebug(DS.breakpointOn(debug, target) ? DS.removeBreakpoint(debug, target) : DS.addBreakpoint(debug, target));
  },
  "disable-breakpoint": (_id, menu) => setDebug(DS.toggleBreakpointEnabled(debug, breakpointTarget(menu))),
};

// ——— The Debug Window and the Error list ———

const WINDOW_MARGIN = 20;

function defaultWindowPosition(width, height, shift = 0) {
  const size = tamanoDelLienzo() ?? { width: innerWidth, height: innerHeight };
  return { x: Math.max(WINDOW_MARGIN, Math.round((size.width - width) / 2) + shift), y: Math.max(WINDOW_MARGIN, Math.round((size.height - height) / 2) + shift) };
}

function openDebugWindow() {
  if (!conDiagrama) return canal.postMessage({ showTool: "debug-window" });
  debugUi.debugWindowAt ??= defaultWindowPosition(DV.DEBUG_WINDOW.width, DV.DEBUG_WINDOW.height);
  setDebug(DS.openDebugWindow(debug));
}

/** The rows of the Error list for the VI now (cached by graph: compiling on each repaint would be wasteful). */
let errorRowsCache = { graph: null, hierarchy: null, rows: [] };
function errorRows() {
  const g = grafo();
  if (errorRowsCache.graph === g && errorRowsCache.hierarchy === hierarchyErrors) return errorRowsCache.rows;
  const compiled = compilar(g, cat);
  const rows = EL.collect({ graph: g, catalog: cat, resolved: Gr.tipos(g, cat), hierarchyErrors, compileErrors: compiled.errores ?? [], inventory: inv });
  errorRowsCache = { graph: g, hierarchy: hierarchyErrors, rows };
  return rows;
}

/** View ▸ Error List; from a wire's menu (List Errors) the list opens with that wire's error selected. */
function openErrorList(selectedRowId) {
  if (!conDiagrama) return canal.postMessage({ showTool: "error-list" });
  debugUi.errorListAt ??= defaultWindowPosition(DV.ERROR_LIST.width, DV.ERROR_LIST.height, 30);
  const selected = errorRows().some((row) => row.id === selectedRowId) ? selectedRowId : (errorList.selected ?? errorRows()[0]?.id ?? null);
  errorList = { ...errorList, open: true, selected };
  // The tip of what the mouse was resting on would stay over the window until the mouse moved (real-programs-0.3.md B14).
  dia = ED.sobrevolar(dia, null);
  descartarTip();
  pintar();
}

/** Show Error and a double click on a row: the diagram comes to the front and the object gets its marching frame. */
function showError(rowId) {
  const row = errorRows().find((candidate) => candidate.id === (rowId ?? errorList.selected));
  if (!row?.target) return;
  errorFocus = row.target;
  window.focus();
  pintar();
}

/** Remove Breakpoints from Hierarchy: this VI has no subVI breakpoints yet (subVIs are not debugged), so it clears its own. */
function removeAllBreakpoints() {
  const numbers = DS.breakpointsOf(debug).map((item) => item.number);
  if (numbers.length) setDebug(DS.removeItems(debug, numbers));
}

/** The floating windows and their popups, for `pintar`. */
function floatingWindows() {
  if (!conDiagrama) return { windows: "", popup: "" };
  let windows = "";
  let popup = "";
  if (debug.debugWindow.open) {
    windows += DV.debugWindow(inv, debug, grafo(), { viName: viInfo.name, separator: separador, position: debugUi.debugWindowAt ?? defaultWindowPosition(DV.DEBUG_WINDOW.width, DV.DEBUG_WINDOW.height) });
    if (debugUi.menu) popup += D.menuContextual(inv, debugUi.menu, DV.debugWindowMenuMarks(debug), medirMenu, DV.debugWindowMenuVariants(debug), windowSize());
    if (debugUi.askingToCloseProbes) windows += DV.closeProbesDialog(inv);
  }
  if (errorList.open) {
    windows += DV.errorListWindow(inv, { rows: errorRows(), state: errorList, viName: viInfo.name, position: debugUi.errorListAt ?? defaultWindowPosition(DV.ERROR_LIST.width, DV.ERROR_LIST.height, 30) });
  }
  return { windows, popup };
}

/** Closing the Debug Window removes its probes, after asking if there are any (REPORT.md §3, 63). */
function closeDebugWindow() {
  if (DS.probesOf(debug).length) {
    debugUi.askingToCloseProbes = true;
    return pintar();
  }
  setDebug(DS.closeDebugWindow(debug));
}

/** A click on something of the Debug Window or the Error list; true if it was theirs. */
function clickFloating(ev) {
  const target = ev.target.closest("[data-id], [data-fila]");
  const id = target?.dataset.id ?? "";
  const DW = DV.DEBUG_WINDOW_ID;
  const EW = DV.ERROR_LIST_ID;
  if (!target && !debugUi.askingToCloseProbes) return false;
  if (debugUi.askingToCloseProbes) {
    if (id === `${DW}.close-dialog.yes`) {
      debugUi.askingToCloseProbes = false;
      debugUi.menu = null;
      setDebug(DS.closeDebugWindow(debug));
    } else if (id === `${DW}.close-dialog.no`) {
      debugUi.askingToCloseProbes = false;
      pintar();
    }
    return true;
  }
  if (debugUi.menu && target.classList.contains("item-menu")) return clickDebugPopup(id, target);
  if (id.startsWith(`${DW}.`)) return clickDebugWindow(ev, id, target);
  if (target.closest(".debug-window") && target.dataset.fila) {
    setDebug(DS.selectItem(debug, Number(target.dataset.fila), ev.ctrlKey || ev.metaKey));
    return true;
  }
  if (id.startsWith(`${EW}.`)) return clickErrorList(id);
  if (target.closest(".error-list") && target.dataset.fila) {
    errorList = EL.selectRow(errorList, target.dataset.fila);
    if (ev.detail >= 2) showError(target.dataset.fila);
    pintar();
    return true;
  }
  return false;
}

function clickDebugWindow(ev, id, target) {
  const DW = DV.DEBUG_WINDOW_ID;
  const entry = inv.resolver(id);
  if (id === `${DW}.close`) return closeDebugWindow(), true;
  if (id === `${DW}.toolbar.remove-selected`) return !target.classList.contains("desactivado") && setDebug(DS.removeItems(debug, debug.debugWindow.selected)), true;
  if (id === `${DW}.toolbar.enable-disable`) return !target.classList.contains("desactivado") && setDebug(DS.toggleSelectedEnabled(debug)), true;
  if (id === `${DW}.toolbar.debug-options` || id === `${DW}.probe-display.probe-options`) {
    const rect = target.getBoundingClientRect();
    debugUi.menu = debugUi.menu?.raiz === id ? null : { raiz: id, x: rect.left, y: rect.bottom };
    pintar();
    return true;
  }
  if (esHueco(entry)) {
    cambiar(E.clic(estado, inv, id, ancla(target)));
    return true;
  }
  return false;
}

/** A row of the Debug Options menu or of Probe Options. */
function clickDebugPopup(id, row) {
  const DW = DV.DEBUG_WINDOW_ID;
  const entry = inv.resolver(id);
  if (esHueco(entry)) return cambiar(E.clic(estado, inv, id, ancla(row))), true;
  debugUi.menu = null;
  if (id.startsWith(`${DW}.toolbar.debug-options.`)) setDebug(DS.toggleOption(debug, ultimo(id)));
  else pintar();
  return true;
}

function clickErrorList(id) {
  const EW = DV.ERROR_LIST_ID;
  if (id === `${EW}.close` || id === `${EW}.close-x`) {
    errorList = { ...errorList, open: false };
    pintar();
  } else if (id === `${EW}.show-error`) showError();
  else if (esHueco(inv.resolver(id))) cambiar(E.clic(estado, inv, id, { x: 40, y: 40 }));
  return true;
}

/** Dragging a floating window by its title bar. */
function startFloatingDrag(ev) {
  const title = ev.target.closest(".dw-titulo");
  const floating = title?.parentElement;
  if (!floating || ev.target.closest(".dw-cerrar")) return false;
  const isDebug = floating.classList.contains("debug-window");
  const current = isDebug ? debugUi.debugWindowAt : debugUi.errorListAt;
  debugUi.drag = { isDebug, dx: ev.clientX - current.x, dy: ev.clientY - current.y };
  return true;
}

function moveFloatingDrag(ev) {
  const { isDebug, dx, dy } = debugUi.drag;
  const position = { x: ev.clientX - dx, y: ev.clientY - dy };
  if (isDebug) debugUi.debugWindowAt = position;
  else debugUi.errorListAt = position;
  pintar();
}

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

/** Delete (key and Edit menu): the wires of what goes stay, broken, where the terminals were (DT-046). */
function borrarLoSeleccionado() {
  if (ejecutando) return;
  if (conDiagrama) return cambiarDiagrama(ED.borrarSeleccion(dia, ctx));
  cambiarPanel(P.borrarSeleccion(pan, ED.terminalPlacer(ctx)));
}

/** Edit ▸ Remove Broken Wires (Ctrl+B): all of them, or those in the selection. */
function quitarCablesRotos() {
  if (ejecutando || !conDiagrama) return;
  cambiarDiagrama(ED.removeBrokenWires(dia, ctx));
}
const seleccionarTodo = () => ejecutando || (conDiagrama ? cambiarDiagrama(ED.selectAll(dia)) : cambiarPanel(PC.selectAll(pan)));

/**
 * Make Current (or Selected) Values Default and Reinitialize (Selected) Values to Default (DT-053): on the
 * panel with something selected, only the selected objects; otherwise every one.
 */
function changeDefaults(operation) {
  if (ejecutando) return;
  confirmarEscritura();
  const ids = conPanel && pan.seleccion.length ? PC.selectedObjects(pan) : undefined;
  if (conDiagrama) cambiarDiagrama({ ...dia, g: operation(dia.g, ids) });
  else cambiarPanel({ ...pan, g: operation(pan.g, ids) });
}

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

// ——— Graphs: their menus in Run mode and the Chart History Length dialog ———

/** The menus of the parts of a graph that have one (labview-captures/graphs/90..98). */
const PART_MENUS = { legend: "context.plot-legend", "plot-swatch": "context.plot-swatch" };

/** The right-click menu of a graph while the VI runs (88, 89); nothing else on the panel has one yet. */
function runModeMenu(ev) {
  if (!conPanel) return;
  const sobre = objetivoPanel(ev.target);
  const node = sobre?.tipo === "objeto" && !sobre.parte && pan.g.nodos.find((candidate) => candidate.id === sobre.id);
  if (node && GS.isGraph(node)) cambiarPanel(ED.abrirMenu(pan, GM.runMenuRoot(node), node.id, ev.clientX, ev.clientY));
}

/** The modal dialog open over this window, if any: Edit Items... or Chart History Length... */
const dialogoModal = () => MD.openDialog(conDiagrama ? dia : null, conPanel ? pan : null);

/** Whichever modal dialog is open, drawn by its own module. */
const dibujarDialogoModal = () => {
  const abierto = dialogoModal();
  return abierto ? abierto.mod.view(inv, abierto.dialog) : "";
};

/**
 * What a key or a click on the open dialog meant (`modal-dialog.mjs` asked its module): the
 * window only applies it. Accepting writes the dialog into the VI; a VI that does not change
 * records no step of undo.
 */
function aplicarEnDialogo(intent, abierto) {
  if (!intent) return;
  const [actual, cambiarActual] = abierto.side === "diagram" ? [dia, cambiarDiagrama] : [pan, cambiarPanel];
  if (intent.dialog && !intent.accept) return cambiarActual({ ...actual, [abierto.field]: intent.dialog });
  if (intent.cancel) return cambiarActual({ ...actual, [abierto.field]: null });
  if (!intent.accept) return;
  const g = MD.accepted(intent.dialog ? { ...abierto, dialog: intent.dialog } : abierto, actual.g);
  return cambiarActual({ ...actual, ...(g !== actual.g && { g }), [abierto.field]: null });
}

/**
 * A click on a modal dialog closes the explanation open over it before `manejar` answers the click.
 * The repaint comes last: repainting first would take the clicked part out of the page, and the next
 * explanation would be anchored at the window's corner.
 */
function conExplicacionCerrada(manejar) {
  const antes = estado;
  estado = E.clicEnDialogoModal(estado, { enExplicacion: false });
  manejar();
  if (estado !== antes) pintar();
}

/** A click on the open dialog: its parts, and on what is not done, its explanation. */
function clicEnDialogo(ev, abierto) {
  const elemento = ev.target.closest("[data-id]");
  const intent = MD.clickIntent(abierto, elemento?.dataset.id, ev.detail);
  // The veil and the parts without an id are not a click on anything.
  if (intent?.explain) return cambiar(E.clic(estado, inv, elemento.dataset.id, ancla(elemento)));
  return aplicarEnDialogo(intent, abierto);
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
  if (data.pide) return canal.postMessage({ g: grafo(), subVITexts, stamp });
  if (data.debugState) {
    debug = data.debugState;
    return pintar();
  }
  if (data.debugEvent) return applyDebugEvent(data.debugEvent, true);
  if (data.workerMessage) return lanzado && trabajador.postMessage(data.workerMessage);
  if (data.showTool) return conDiagrama && (data.showTool === "debug-window" ? openDebugWindow() : openErrorList());
  // Lo que ya se tiene no es un paso nuevo: la respuesta a una ventana recién abierta, por ejemplo.
  if (data.valores) return mostrarValores(data.valores, data.series);
  if ("ejecutando" in data) return modoRun(data.ejecutando);
  if (data.soltar) return soltarLatch(data.soltar);
  if (data.control) {
    if (lanzado) trabajador.postMessage({ orden: "control", ...data.control });
    vistos[data.control.nodo] = data.control.valor;
    return;
  }
  if (data.abortar) return abortar();
  if (data.nuevo) return cargar(data.g);
  if (!data.g) return;
  // A copy older than the one this window holds is not taken: it is answered with the newer one (graph-sync.mjs).
  const verdict = Sync.judgeIncoming(stamp, data.stamp);
  if (verdict === "stale") return canal.postMessage({ g: grafo(), subVITexts, stamp });
  stamp = data.stamp;
  if (JSON.stringify(data.g) === JSON.stringify(grafo())) return;
  let g = data.g;
  // The other window may have placed a subVI this one has not read yet: its view of the hierarchy comes first.
  if (data.subVITexts && (JSON.stringify(data.subVITexts) !== JSON.stringify(subVITexts) || faltaSubVI(g))) {
    subVITexts = data.subVITexts;
    g = rebuildHierarchy(g);
  }
  publicado = g;
  if (!ejecutando) historial = H.registrar(historial, g);
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

/** The size of this window's page, the room a menu has to open in. */
const windowSize = () => ({ width: innerWidth, height: innerHeight });

function dentro(el, max) {
  const r = el.getBoundingClientRect();
  if (r.right > max.width) el.style.left = `${Math.max(0, max.width - r.width - 2)}px`;
  if (r.bottom > max.height) el.style.top = `${Math.max(0, max.height - r.height - 2)}px`;
}


/** Keeps the open palette and its subpalettes in the window as LabVIEW keeps them on the screen (window-view.mjs). */
function placePalettes(room) {
  if (!estado.paleta) return;
  const move = (el, { x, y }) => Object.assign(el.style, { left: `${x}px`, top: `${y}px` });
  const sizeOf = (el) => ({ width: el.offsetWidth, height: el.offsetHeight });
  const palette = document.querySelector(".paleta:not(.subpaleta)");
  if (palette) move(palette, V.placePalette(estado.paleta, sizeOf(palette), room));
  estado.paleta.cascada.forEach((anchor, i) => {
    const sub = document.querySelector(`.subpaleta[data-nivel="${i + 1}"]`);
    if (sub) move(sub, V.placeSubpalette(anchor, anchor.x - V.MEDIDAS_SUBPALETA.anclaX, sizeOf(sub), room));
  });
}

function pintar() {
  ctx.panelSize = tamanoDelLienzo();
  const resueltos = Gr.tipos(grafo(), cat);
  // A chart whose wire changed has lost its history (REPORT §4).
  const charts = GS.reconciledCharts(pan.charts, grafo(), resueltos);
  if (charts !== pan.charts) pan = { ...pan, charts };
  const floating = floatingWindows();
  const extra = { toolbar: debugToolbar(), resaltando: debug.highlight.on && ejecutando, flotantes: floating.windows, runRoto: !Gr.ejecutable(grafo(), cat, resueltos) || hierarchyErrors.length > 0, ejecutando, dialogo: dialogoError, numeroVI: viInfo.untitledNumber ?? undefined, propiedades: (propiedades ? VP.view(inv, propiedades) : "") + dibujarDialogoModal() };
  if (conDiagrama) {
    extra.lienzo = D.contenido({ ...dia, debug: DV.canvasView(debug, dia.g, ejecutando) }, ctx, resueltos) + DV.overlay(debug, dia.g, ctx, resueltos, { now: Date.now(), separator: separador, running: ejecutando, pausedAt: debug.run.paused, errorFocus });
    extra.encima = (dia.menu ? D.menuContextual(inv, dia.menu, ED.marcados(dia, ctx), medirMenu, DV.mergeVariants(ED.variantes(dia, ctx), DV.menuVariants(debug, dia.g, resueltos, dia.menu)), windowSize()) : "") + floating.popup;
    extra.editandoTexto = !!dia.edicion;
  } else {
    extra.lienzo = P.contenido(pan, ctx, resueltos);
    extra.conectorGlifo = CP.paneGlyph(pan.g, cat, pan.conector?.celda ?? null);
    extra.encima = pan.menu ? D.menuContextual(inv, pan.menu, ED.marcados(pan, ctx), medirMenu, ED.variantes(pan, ctx), windowSize()) : "";
    extra.editandoTexto = !!pan.edicion;
  }
  // El menú de la barra que está abierto, bajo su título.
  if (estado.menuBarra) {
    const variantes = estado.menuBarra.id === EM.editMenuId(nombre) ? variantesDelMenuEdit() : {};
    extra.encima = (extra.encima ?? "") + D.menuContextual(inv, { raiz: estado.menuBarra.id, x: estado.menuBarra.x, y: estado.menuBarra.y }, marcasDelMenuBarra(estado.menuBarra.id), medirMenu, variantes, windowSize());
  }
  document.body.innerHTML = V.ventana(inv, nombre, estado, extra);
  const ventana = document.querySelector(".ventana");
  ventana.classList.toggle("cableando", dia.accion?.tipo === "cablear");
  // Mientras se arrastra un control desde la paleta, el lienzo lleva un borde punteado.
  ventana.classList.toggle("colocando", pan.accion?.tipo === "colocar" && !!pan.accion.arrastrado);
  // The right-click menus place themselves inside the window (diagram-view.mjs `placeMenu`); the rest is pushed back in here.
  const tam = windowSize();
  placePalettes(tam);
  for (const el of document.querySelectorAll(".explicacion, .lista-marcos")) dentro(el, tam);
  if (tip.visible) ponerTip();
}

/** The check marks of a menu opened from the page and not from the menu bar: the current page of VI Properties. */
const marcasDelMenuBarra = (id) => new Set(id === VP.CATEGORIES_ID ? [`${VP.CATEGORIES_ID}.execution`] : id === HIGHLIGHT_BUTTON_ID ? [`${HIGHLIGHT_BUTTON_ID}.${debug.highlight.speed}`] : []);

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
  if (Et.graphAtRest(dia)) quieto(dia.g);
  pintar();
}

/** Cambiar el panel. Como el diagrama: el paso se guarda cuando queda quieto. */
function cambiarPanel(nuevo) {
  if (nuevo === pan) return;
  pan = sinTerminalesHuerfanos(nuevo);
  if (Et.graphAtRest(pan)) quieto(pan.g);
  mandarControles(pan.g);
  pintar();
}

function volver(r) {
  if (!r) return;
  historial = r.h;
  if (conDiagrama) dia = { ...dia, g: r.g, seleccion: [], accion: null, menu: null, edicion: null };
  else pan = { ...pan, g: r.g, seleccion: [], accion: null, edicion: null };
  publicarGrafo(r.g);
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
/** What is under the mouse on the diagram at a point: as `objetivo`, but a terminal under a wire wins. */
const objetivoEn = (x, y) => ED.preferTerminalUnderWire(document.elementsFromPoint(x, y).map(objetivo));

function objetivo(el) {
  if (!el?.closest(".lienzo")) return null;
  const etiqueta = el.closest(".etiqueta");
  if (etiqueta) return { tipo: "etiqueta", id: etiqueta.dataset.etiqueta };
  const asa = el.closest(".asa");
  if (asa) return { tipo: "asa", nodo: asa.dataset.nodo, lado: asa.dataset.asa };
  // El selector de marcos de un Case y las filas de su lista; la de ítems, de una constante de enum o de ring.
  const filaValor = el.closest(".item-valor");
  if (filaValor) return { tipo: "fila-valor", nodo: filaValor.dataset.nodo, k: Number(filaValor.dataset.valor) };
  const fila = el.closest(".item-marco");
  if (fila) return { tipo: "fila-marco", nodo: fila.dataset.nodo, k: Number(fila.dataset.marco) };
  // The names in the list of an Unbundle By Name.
  const filaElemento = el.closest(".item-elemento");
  if (filaElemento) return { tipo: "fila-elemento", nodo: filaElemento.dataset.nodo, k: Number(filaElemento.dataset.elemento) };
  const zona = el.closest(".marco-zona");
  if (zona) return { tipo: "marco", nodo: zona.dataset.nodo, zona: zona.dataset.zona };
  const looseEnd = el.closest(".extremo-suelto");
  if (looseEnd) return { tipo: "suelto", cable: looseEnd.dataset.cable, extremo: looseEnd.dataset.extremo };
  const t = el.closest(".terminal");
  if (t) return { tipo: "terminal", nodo: t.dataset.nodo, puerto: t.dataset.puerto, dir: t.dataset.dir };
  const n = el.closest(".nodo");
  // Un nodo con celdas (la constante de error) dice sobre cuál se pulsó.
  if (n && !n.closest(".fantasma")) return { tipo: "nodo", id: n.dataset.nodo, ...(el.closest(".celda-error") ? { campo: el.closest(".celda-error").dataset.campo } : {}), ...(el.closest(".fila-nombre") ? { fila: Number(el.closest(".fila-nombre").dataset.fila) } : {}), ...(el.closest(".celda-array, .celda-grid") ? { campo: addressFromText(el.closest(".celda-array, .celda-grid").dataset.campo) } : {}) };
  const c = el.closest(".tramo-zona");
  if (c) return { tipo: "tramo", cable: c.dataset.cable, k: Number(c.dataset.tramo) };
  return { tipo: "fondo" };
}

/** Qué hay bajo el ratón en el panel: una etiqueta, un objeto o el fondo. Fuera del lienzo, nada. */
/** What `objetivoPanel` calls the parts of a panel object, where its right-click menu opens. */
const PANEL_OBJECT_TARGETS = new Set(["objeto", "casilla", "paso", "elem", "campo", "asa-array"]);

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
  // The legend of a graph and the swatch of a plot are parts of it, with menus of their own.
  const parte = el.closest("[data-parte]");
  if (parte) return { tipo: "objeto", id: parte.closest(".objeto-panel").dataset.nodo, parte: parte.dataset.parte };
  const o = el.closest(".objeto-panel");
  if (o) return { tipo: "objeto", id: o.dataset.nodo };
  return { tipo: "fondo" };
}

/** The wire under the pointer: a segment of it, its loose end, or the terminal of a node it ends at (not a structure's border). */
function cableBajoElRaton(sobreElRaton) {
  if (sobreElRaton?.tipo === "tramo" || sobreElRaton?.tipo === "suelto") return dia.g.cables.find((c) => c.id === sobreElRaton.cable);
  if (sobreElRaton?.tipo !== "terminal") return undefined;
  const node = dia.g.nodos.find((n) => n.id === sobreElRaton.nodo);
  return node && !D.esBorde(node) ? ED.wireAtTerminal(dia.g, sobreElRaton.nodo, sobreElRaton.puerto, sobreElRaton.dir) : undefined;
}

/** The node of what is under the mouse, if it is a node, one of its terminals or one of its stretch handles (they lie on a structure's border band, which answers with its menu). */
const nodoDe = (o) => (o?.tipo === "terminal" || o?.tipo === "marco" || o?.tipo === "asa" ? o.nodo : o?.tipo === "nodo" ? o.id : null);

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
  // Press and hold on Highlight Execution opens its speed menu (REPORT.md §1).
  const bulb = ev.target.closest?.(`[data-id="${HIGHLIGHT_BUTTON_ID}"]`);
  if (bulb && !bulb.classList.contains("desactivado")) debugUi.speedMenuTimer = setTimeout(() => openSpeedMenu(bulb), DS.SPEED_MENU_HOLD_MS);
  if (conDiagrama) {
    if (startFloatingDrag(ev)) return ev.preventDefault();
    if (debugUi.menu && !ev.target.closest(".menu-contextual")) {
      debugUi.menu = null;
      pintar();
    }
    // The frame of Show Error stays until something is clicked on the diagram (unverified how LabVIEW clears it).
    if (errorFocus && ev.target.closest(".lienzo")) errorFocus = null;
  }
  // An error dialog is modal: only its buttons answer.
  if (document.querySelector(".modal-error")) return;
  // VI Properties is modal too: its buttons answer to the click event.
  if (propiedades && !estado.menuBarra) return;
  // Con un menú de la barra abierto, pulsar fuera de él y de los títulos lo cierra.
  if (estado.menuBarra && !ev.target.closest(".menu-contextual, .menu")) return cambiar({ ...estado, menuBarra: null });
  if (estado.menuBarra) return;
  // A modal dialog swallows the mousedown: its parts answer to the click event.
  if (dialogoModal()) return ev.preventDefault();
  if (ejecutando && !pan.menu) return pulsarEnRun(ev);
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
  const sobreDiagrama = objetivoEn(ev.clientX, ev.clientY);
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
  if (ev.detail >= 2 && sobreDiagrama.tipo === "marco" && sobreDiagrama.zona === "texto") return cambiarDiagrama(ED.editarMarco(dia, sobreDiagrama.nodo, ctx));
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
  pulsado = { id: n.id, antes: !!CV.currentValue(n) };
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
  const v = !!CV.currentValue(n);
  let nuevo = v;
  if (momento === "pressed" && cuando === "pulsar") nuevo = modo === "latch" ? true : !v;
  else if (accion.includes("when-released") && cuando === "soltar") nuevo = modo === "latch" ? true : !v;
  else if (accion.includes("until-released")) nuevo = cuando === "pulsar" ? !v : antes;
  if (nuevo !== v) cambiarPanel({ ...pan, g: CV.setCurrentValue(pan.g, n.id, nuevo) });
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
  if (debugUi.drag) return moveFloatingDrag(ev);
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
  if (nuevo.menu && item) nuevo = ED.sobreMenu(nuevo, item.dataset.id, ED.menuRowHasSubmenu(nuevo, ctx, inv, item.dataset.id));
  if (!nuevo.menu) nuevo = ED.sobrevolar(nuevo, objetivoEn(ev.clientX, ev.clientY));
  if (nuevo.accion) nuevo = ED.moverA(nuevo, ctx, punto(ev));
  if (nuevo !== dia) {
    dia = nuevo;
    pintar();
  }
});

addEventListener("mouseup", (ev) => {
  if (ev.button !== 0) return;
  clearTimeout(debugUi.speedMenuTimer);
  if (debugUi.drag) debugUi.drag = null;
  if (estado.menuBarra?.id === HIGHLIGHT_BUTTON_ID) return finishSpeedMenu(ev);
  if (pulsado) return soltarEnRun();
  if (conPanel && pan.accion) return cambiarPanel(P.soltar(pan, ctx, objetivoPanel(document.elementFromPoint(ev.clientX, ev.clientY)), punto(ev)));
  if (!conDiagrama || !dia.accion) return;
  cambiarDiagrama(ED.soltar(dia, ctx, objetivoEn(ev.clientX, ev.clientY), punto(ev)));
});

addEventListener("click", (ev) => {
  if (debugUi.ignoreNextClick) {
    debugUi.ignoreNextClick = false;
    return;
  }
  if (conDiagrama && clickFloating(ev)) return;
  const boton = ev.target.closest(".modal-error .boton-dialogo:not([disabled])");
  if (boton) return responderDialogo(boton.dataset.boton);
  if (ev.target.closest(".modal-error")) return;
  if (ev.target.closest(".explicacion")) return;
  if (propiedades && !ev.target.closest(".menu-contextual")) return conExplicacionCerrada(() => clicPropiedades(ev));
  const enDialogo = dialogoModal();
  if (enDialogo) return conExplicacionCerrada(() => clicEnDialogo(ev, enDialogo));
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
    if (ED.menuRowHasSubmenu(actual, ctx, inv, id)) return cambiarActual(ED.sobreMenu(actual, id, true));
    const e = ED.menuRowEntry(actual, ctx, inv, id);
    if (!esHueco(e)) {
      // A row greyed by the context (no terminal under the cursor) does nothing.
      if (fila.classList.contains("desactivado")) return;
      const orden = ORDENES_CONTEXTUALES[ultimo(id)] ?? DEBUG_CONTEXT_ORDERS[ultimo(id)];
      if (orden) {
        cambiarActual({ ...actual, menu: null });
        return orden(actual.menu.nodo, actual.menu);
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
  const toolbarAction = el.dataset.id.startsWith(`${prefijo}.toolbar.`) && !esHueco(inv.resolver(el.dataset.id)) && !el.classList.contains("desactivado") && TOOLBAR_ACTIONS[ultimo(el.dataset.id)];
  if (toolbarAction) return toolbarAction();
  // La flecha de Run, hecha: ejecuta el VI; rota, dice por qué no se puede.
  if (el.dataset.id === `${prefijo}.toolbar.run` && !esHueco(inv.resolver(el.dataset.id))) return ejecutarVI();
  if (el.dataset.id === `${prefijo}.toolbar.abort-execution`) return abortar();
  if (el.dataset.id === "palette.functions.select-a-vi" && !esHueco(inv.resolver(el.dataset.id))) return seleccionarVI();
  const donde = abreSubpaleta(el) ? V.anclaSubpaleta(el.getBoundingClientRect()) : el.classList.contains("menu") ? anclaMenu(el) : ancla(el);
  cambiar(E.clic(estado, inv, el.dataset.id, donde, nivelDe(el)));
});

addEventListener("contextmenu", (ev) => {
  ev.preventDefault();
  if (propiedades || dialogoModal()) return;
  // In Run mode LabVIEW gives another menu (the run-time one): captured only for the graphs.
  if (ejecutando) return runModeMenu(ev);
  // The connector pane and the icon have menus of their own.
  const iconoVI = ev.target.closest(".icono-vi");
  if (iconoVI) return menuDelIcono(ev, iconoVI);
  if (!ev.target.closest(".lienzo")) return;
  // On the panel the palette comes up over the background and an object's menu over any part of it
  // (its box, arrows, elements or fields too). Plain numerics have no captured menu yet: nothing opens.
  if (conPanel) {
    if (pan.edicion) cambiarPanel(P.confirmar(pan));
    const sobrePanel = objetivoPanel(ev.target);
    if (PANEL_OBJECT_TARGETS.has(sobrePanel?.tipo)) {
      const raizPanel = sobrePanel.parte ? PART_MENUS[sobrePanel.parte] : P.menuDe(pan.g.nodos.find((k) => k.id === sobrePanel.id));
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
  // A name row of an Unbundle By Name has the menu of its output terminal.
  const puerto = o?.tipo === "terminal" ? o.puerto : o?.fila !== undefined ? UN.portOfRow(o.fila) : null;
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
  // A modal dialog (Edit Items..., Select Item..., Chart History Length...): its own module says what the key
  // means — in Edit Items, Enter while a row is being written commits it and opens an empty one
  // below, which is what the window used to take for OK.
  const conTeclaEnDialogo = dialogoModal();
  if (conTeclaEnDialogo) {
    ev.preventDefault();
    // What is open over the dialog takes Escape first and the dialog stays, as in VI Properties
    // above: otherwise closing the explanation of a greyed tab closed the whole dialog with it.
    if (ev.key === "Escape" && (estado.abierta || estado.menuBarra)) return cambiar(E.escape(estado));
    return aplicarEnDialogo(MD.keyIntent(conTeclaEnDialogo, ev), conTeclaEnDialogo);
  }
  // Ctrl+Intro confirma lo escrito en el source de un control de error (labview-captures/errores/35.png).
  if (conPanel && pan.edicion?.campo === "source" && ctrl && ev.key === "Enter") {
    ev.preventDefault();
    return cambiarPanel(P.confirmar(pan));
  }
  // LabVIEW's Ctrl shortcuts that run a menu command (shortcuts.mjs).
  if (ctrl && !ev.shiftKey && !ev.altKey) {
    const orden = commandForCtrlKey(ev.key);
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
  // Ctrl+C, Ctrl+X, Ctrl+V, Ctrl+A and Ctrl+B: the Edit menu's shortcuts, on what is selected on this canvas.
  const ordenEdicion = ctrl && !ev.shiftKey && !ev.altKey && !estado.paleta && !(conDiagrama ? dia.edicion : pan.edicion) && { c: copiar, x: cortar, v: pegar, a: seleccionarTodo, b: quitarCablesRotos }[ev.key.toLowerCase()];
  if (ordenEdicion) {
    ev.preventDefault();
    return ordenEdicion();
  }
  if (conPanel && !estado.paleta) {
    if (ctrl && ev.key.toLowerCase() === "z" && !pan.accion) {
      ev.preventDefault();
      return volver(ev.shiftKey ? H.rehacer(historial) : H.deshacer(historial));
    }
    if (ev.key === "Delete" || ev.key === "Backspace") return borrarLoSeleccionado();
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
    if (ev.key === "Delete" || ev.key === "Backspace") return borrarLoSeleccionado();
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
const tip = { clave: null, texto: "", x: 0, y: 0, visible: false, temporizador: null, descartada: null };

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

/**
 * Run and the Error list take away the tip the mouse was resting on, and it stays away until the
 * mouse goes to something else: the repaint makes Chromium send a mouse move at the same place,
 * which showed it again (real-programs-0.3.md B14).
 */
function descartarTip() {
  const dismissed = tip.clave;
  ocultarTip();
  tip.descartada = dismissed;
}

function mostrarTip(ev) {
  const el = ev.target.closest?.("[data-tip]");
  const e = el?.dataset.id && inv.resolver(el.dataset.id);
  const ocupado = ["colocar", "mover", "tramo", "rectangulo", "etiqueta"].includes((dia.accion ?? pan.accion)?.tipo);
  if (!el || (e && esHueco(e)) || ocupado || dia.menu) return ocultarTip();
  const clave = `${el.dataset.nodo ?? ""}.${el.dataset.puerto ?? el.dataset.cable ?? el.dataset.id ?? ""}`;
  if (clave === tip.clave || clave === tip.descartada) return;
  ocultarTip();
  tip.descartada = null;
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

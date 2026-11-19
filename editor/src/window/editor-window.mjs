// One editor window: the Front Panel or the Block Diagram, depending on the URL.
//
// It paints with window-view.mjs, block-diagram/diagram-view.mjs and
// front-panel/front-panel.mjs, and translates DOM events into window-state.mjs
// (windows and palettes), block-diagram/diagram-editing.mjs (the diagram) and
// front-panel/front-panel.mjs (the panel). It decides nothing on its own: what is
// done comes from the inventory (rule 55), and each block's terminals from the
// catalog (spec/03, rule 3).
//
// The two windows are two views of the same OVI (spec/05 §7): each one holds a
// copy of the graph and, every time its own comes to rest, sends it to the other
// over a BroadcastChannel (one per OVI, as several OVIs can be open: DT-045). So a
// control placed on the panel appears on the diagram, and a terminal deleted on
// the diagram disappears from the panel.
//
// An OVI is loaded with the subOVIs it calls: the main process reads their files
// and hierarchy-client.mjs turns them into the catalog view in which the ports of
// each `subvi` node come from the connector of the OVI it calls. That view
// replaces the plain catalog everywhere (`cat`).

import * as CP from "../front-panel/connector-pane.mjs";
import * as CR from "../front-panel/cluster-reorder.mjs";
import * as DS from "../debugging/debug-state.mjs";
import * as DV from "../debugging/debug-view.mjs";
import * as EL from "../debugging/error-list.mjs";
import { buildDebugPlan, nodeDisplayName } from "../debugging/debug-plan.mjs";
import { createBrowserPool } from "./browser-pool.mjs";
import * as D from "../block-diagram/diagram-view.mjs";
import * as DC from "../block-diagram/diagram-clipboard.mjs";
import * as ED from "../block-diagram/diagram-editing.mjs";
import { DAQ_NAME_DROPDOWN_MENU } from "../common/daq-name-menus.mjs";
import * as UN from "../block-diagram/unbundle-by-name.mjs";
import { followWiredClusters } from "../../../core/model/wired-clusters.mjs";
import * as PN from "../block-diagram/property-nodes.mjs";
import * as EM from "./edit-menu.mjs";
import * as Et from "../common/labels.mjs";
import * as E from "./window-state.mjs";
import * as G from "../common/glyphs.mjs";
import * as Gr from "../../../core/model/graph.mjs";
import { isFreeLabel } from "../../../core/model/free-label.mjs";
import * as H from "../block-diagram/undo-history.mjs";
import { cargarInventario, esHueco, ultimo } from "../common/labview-inventory.mjs";
import { addressFromText } from "../common/array-grid.mjs";
import * as MD from "./modal-dialog.mjs";
import * as GM from "../front-panel/graph-menus.mjs";
import * as GS from "../front-panel/graph-state.mjs";
import { morphInnerHtml } from "./dom-morph.mjs";
import * as P from "../front-panel/front-panel.mjs";
import * as PC from "../front-panel/panel-clipboard.mjs";
import * as Paths from "../common/ovi-paths.mjs";
import * as Q from "../../../core/model/qvi-format.mjs";
import * as SN from "../block-diagram/subovi-nodes.mjs";
import * as PolymorphicNodes from "../block-diagram/polymorphic-nodes.mjs";
import * as ExpressNodes from "../block-diagram/express-nodes.mjs";
import * as ClusterConstant from "../block-diagram/cluster-constant.mjs";
import * as CallLibraryNodes from "../block-diagram/call-library-nodes.mjs";
import * as CallLibraryDialog from "../block-diagram/call-library-dialog.mjs";
import { commandForCtrlKey } from "./shortcuts.mjs";
import * as RV from "./run-values.mjs";
import * as Scroll from "./scrolling.mjs";
import * as Sync from "./graph-sync.mjs";
import * as VP from "./ovi-properties.mjs";
import * as V from "./window-view.mjs";
import { panelStyleFromQuery } from "../front-panel/panel-style.mjs";
import { applyWindowStyle } from "../front-panel/window-stylesheet.mjs";
import { buildHierarchy } from "./hierarchy-client.mjs";
import * as PP from "../front-panel/panel-properties.mjs";
import { compilar, runnableOVI } from "../../../core/compiler/compiler.mjs";
import { patternOf, pruneConnector } from "../../../core/model/connector.mjs";
import * as CV from "../../../core/model/control-values.mjs";
import { pathFromText } from "../../../core/model/paths.mjs";
import { connectDockedPage, outerHtmlOf } from "../common/docked-page.mjs";
import { menuBarModel } from "../common/native-menu-model.mjs";

const nombre = new URLSearchParams(location.search).get("ventana") ?? "front-panel";
/** The style the Front Panel is drawn in (DT-058), chosen by the main process. */
const panelStyle = panelStyleFromQuery(new URLSearchParams(location.search).get("panelStyle"));
const prefijo = `window.${nombre}`;
document.title = V.TITULOS[nombre];

const fetchJson = (url) => fetch(url).then((response) => response.json());
const [inv, baseCatalog] = await Promise.all([
  fetchJson("/inventario.json").then(cargarInventario),
  Promise.all([fetchJson("/blocks.json"), fetchJson("/properties.json")]).then(([blocks, properties]) => Gr.cargarCatalogo(blocks, properties)),
]);
/** The OVI these windows show, as the main process knows it (without it, as in a plain browser, a new OVI). */
const oviInfo = (await window.solder?.iniciar()) ?? { id: "0", text: null, key: Paths.untitledKey(0), name: "Untitled 1", untitledNumber: 1 };
applyWindowStyle(document, oviInfo.windowStyle);
window.solder?.alCambiarEstiloVentana((text) => applyWindowStyle(document, text));
/** The catalog of this OVI: the blocks, and for each subOVI node the connector of the OVI it calls. */
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
// Where the pointer last was over the panel, to work its cursor out again after a repaint replaces the page,
// and the cursor shown there.
let lastPointer = null;
let lastPanelCursor = null;
let dia = ED.inicial();
let pan = P.inicial(dia.g);
let historial = H.nuevo(dia.g);

/** El grafo de esta ventana. */
const grafo = () => (conDiagrama ? dia.g : pan.g);

// ——— The two windows, one OVI ———

const canal = new BroadcastChannel(`solder-vi-${oviInfo.id}`);
/** The last graph that was sent to the other window or came from it. */
let publicado = dia.g;
/** The stamp of the graph this window holds, to tell a newer copy from an older one (graph-sync.mjs). */
let stamp = Sync.initialStamp();
/** The window answers the other one only once it has loaded its OVI: before that, its graph is an empty one. */
let listo = false;
/** Its part of the docked view (common/docked-page.mjs), connected once everything is declared. */
let docking = null;

/**
 * Sends the graph this window holds to the other one, stamped as a newer copy,
 * with the subOVI texts it needs to understand it. `markModified`: the main
 * process learns the OVI changed (the asterisk in the title); a graph rebuilt
 * after a hierarchy change is shared without it.
 */
function publicarGrafo(g, { markModified = true } = {}) {
  publicado = g;
  stamp = Sync.afterLocalChange(stamp, nombre);
  canal.postMessage({ g, subOVITexts, stamp });
  if (markModified) avisar(g);
}

/**
 * The graph has come to rest —nothing half done, no text half written—: the
 * step is kept to undo it and the other window receives it.
 */
function quieto(g, stepName) {
  // The values of a Run are not steps to undo.
  if (!ejecutando) historial = H.registrar(historial, g, stepName);
  if (conDiagrama) setDebug(DS.pruneToGraph(debug, g));
  if (g === publicado) return;
  publicarGrafo(g);
}

// ——— The hierarchy: the subOVIs of this OVI ———
//
// An OVI is compiled and drawn with the connectors of the OVIs it calls. The main
// process reads their files from disk; a subOVI that is saved while its callers
// are open reaches them through `vi:saved` (alGuardarOtroOVI).

/** The path this OVI is saved at, or the key of an untitled one (see common/ovi-paths.mjs). */
let oviKey = oviInfo.key;
/** Where this Solder's ovi.lib is, which `<ovilib>/…` subOVI paths lead to (DT-073). */
const oviLibRoot = oviInfo.oviLibRoot ?? "";
/** The text of every other OVI of the hierarchy, by absolute path. */
let subOVITexts = {};
/** Why the hierarchy cannot be compiled: a subOVI that cannot be found, a recursive call… */
let hierarchyErrors = [];
/** The keys of the subOVIs this OVI reaches. */
let hierarchyKeys = [];

/**
 * Builds the catalog view of this OVI over `g` and the subOVI texts held now, and
 * returns `g` with the wires to ports a subOVI no longer has left broken, with a
 * loose end where those terminals were drawn (DT-046). The OVI is not marked
 * modified, as in LabVIEW (labview-captures/broken-wires/REPORT.md §2).
 */
function rebuildHierarchy(g) {
  const placeOfOldTerminal = ED.terminalPlacer(ctx);
  const result = buildHierarchy({ rootKey: oviKey, rootGraph: g, texts: subOVITexts, baseCatalog, readOVI: Q.leer, oviLibRoot });
  cat = result.catalog;
  ctx = D.contexto(cat, glifos, separador, medirMenu);
  hierarchyErrors = result.errors;
  hierarchyKeys = result.keys;
  // A polymorphic node on Automatic follows what is wired, with the new hierarchy (DT-074).
  return Gr.aflojarCablesHuerfanos(Gr.adaptPolymorphicNodes(g, cat), cat, placeOfOldTerminal);
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

/** Reads the subOVI files again and redraws: a subOVI was saved, or a Run is about to start. */
async function refrescarJerarquia() {
  const { texts } = await window.solder.textosDeSubOVIs(Q.aTexto(grafo(), cat));
  subOVITexts = texts;
  ponerGrafo(rebuildHierarchy(grafo()), { share: true });
  pintar();
}

/** Does this graph have a subOVI node whose callee this window does not know yet? */
const faltaSubOVI = (g) => g.nodos.some((n) => SN.isSubOVI(n) && !cat.findSubOVI?.(n.config?.vi));

/** The name this OVI goes by now, in error sources, the toolbar and the debugging windows: it changes when the OVI is saved. */
const currentOVIName = () => Paths.oviDisplayName(oviKey, oviInfo.name);

/**
 * The page's own title follows the window's (which the main process sets, asterisk included):
 * tools that find a window by its page, as the tests under Xvfb do, saw "Untitled 1" in every OVI
 * (real-programs-0.3.md B16).
 */
const showOVINameInPageTitle = () => (document.title = `${currentOVIName()} ${conPanel ? "Front Panel" : "Block Diagram"}`);
showOVINameInPageTitle();

/** Some OVI was saved, here or elsewhere (preload `alGuardar`). */
function alGuardarOtroOVI({ id, key }) {
  if (id !== oviInfo.id) {
    if (hierarchyKeys.includes(key)) refrescarJerarquia();
    return;
  }
  // This OVI was saved, maybe for the first time or somewhere else: its subOVI paths are now relative to the new file.
  if (key === oviKey) return;
  const old = oviKey;
  oviKey = key;
  showOVINameInPageTitle();
  ponerGrafo(rebuildHierarchy(Paths.rebaseGraph(grafo(), old, key)));
  pintar();
}
window.solder?.alGuardar(alGuardarOtroOVI);
// A subOVI open elsewhere changed in memory or was closed: this caller shows and runs it as it is now (issue #20).
window.solder?.onOVIEdited(({ id, key }) => {
  if (id !== oviInfo.id && hierarchyKeys.includes(key)) refrescarJerarquia();
});
// Leaving this window (switching to the other one) commits what is being typed, as clicking outside does.
addEventListener("blur", () => confirmarEscritura());

// ——— Save and open (core/model/qvi-format.mjs) ———
//
// The page only turns the OVI into text and back; the disk, the system dialogs
// and the asterisk in the title belong to the main process
// (electron/main.mjs), which receives every change to know if anything is unsaved.

/** The OVI has changed: the main process compares it with what was saved. */
const avisar = (g) => window.solder?.cambio(Q.aTexto(g, cat));

/** What is being typed is confirmed before saving, as with Enter Text. */
function confirmarEscritura() {
  if (conDiagrama && dia.edicion) cambiarDiagrama(ED.confirmar(dia, ctx));
  if (conPanel && pan.edicion) cambiarPanel(P.confirmar(pan));
}

/** File ▸ Save and Save As. */
async function guardarOVI(como) {
  if (!window.solder) return;
  confirmarEscritura();
  await window.solder.guardar(Q.aTexto(grafo(), cat), como);
}

/** An OVI just opened or created: it starts with no history and nothing selected. */
function cargar(g) {
  publicado = g;
  stamp = Sync.initialStamp();
  historial = H.nuevo(g);
  dia = { ...ED.inicial(), g };
  pan = P.inicial(g);
  scrollOrigin = g.windows?.[nombre]?.origin ?? { x: 0, y: 0 };
  pintar();
  avisar(g);
}

/** Loads the OVI the main process gave this window: its subOVIs first, so that its wires find their ports. */
async function cargarTexto(text) {
  const { texts } = await window.solder.textosDeSubOVIs(text);
  subOVITexts = texts;
  try {
    const result = buildHierarchy({ rootKey: oviKey, rootText: text, texts, baseCatalog, readOVI: Q.leer, oviLibRoot });
    cat = result.catalog;
    ctx = D.contexto(cat, glifos, separador, medirMenu);
    hierarchyErrors = result.errors;
    hierarchyKeys = result.keys;
    cargar(Gr.adaptPolymorphicNodes(result.graph, cat));
  } catch (e) {
    window.solder.error(e.message);
    window.solder.cerrar();
  }
}

/** File ▸ Open: another OVI, in its own windows (or those it already has). */
const abrirOVI = () => window.solder?.abrir();

// ——— Run ———
//
// Run compiles the OVI to WebAssembly (core/compiler/compiler.mjs) and runs it in
// a worker (run-worker.mjs) by dataflow (DT-040). While it runs, both windows
// are in Run mode, as in LabVIEW (labview-captures/run/): the arrow is filled,
// Abort lights up, the editing tools disappear, the panel loses its grid and the
// diagram cannot be edited. Indicators are painted as their data arrives;
// controls can be operated and the worker reads their new value; a Latch that
// has been read returns to FALSE by itself. With a broken arrow, Run says why,
// like LabVIEW's error list.

let trabajador = null;
/** The threads that run this window's OVIs, created at the first Run and kept (DT-063 §11). */
let pool = null;
/** The OVI Properties dialog while it is open (ovi-properties.mjs), or `null`. */
let propiedades = null;
/** El OVI corre (en cualquiera de las dos ventanas): las dos están en modo Run. */
let ejecutando = false;
/** Esta ventana lanzó el Run: el worker es suyo. */
let lanzado = false;
/** El valor de cada control que ya sabe el worker, para mandarle sólo lo que cambie. */
let vistos = {};
let plazoAbort = null;

/**
 * What reaches the indicators: it is shown on the panel and does not change the OVI. `series`: each value
 * written to a Waveform Chart since the last time, in order; the chart adds them to its history, which
 * outlives the Run (labview-captures/graphs/REPORT.md §4).
 */
function mostrarValores(valores, series = {}) {
  pan = { ...pan, valores: { ...(pan.valores ?? {}), ...valores }, charts: appendSeries(pan.charts, series) };
  pintar();
}

/** The charts with what the OVI wrote to them appended, by the type their wire carries now. */
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
const soltarLatch = (nodo) => setControlFromRun(nodo, false);

/**
 * A control the Run changed —a Latch read, back to FALSE, or Value written by a Property Node (DT-072)—, in both
 * windows and without counting as an edit; the worker already has it, so it is not sent back.
 */
function setControlFromRun(nodo, valor) {
  vistos[nodo] = valor;
  if (conDiagrama) dia = { ...dia, g: CV.setCurrentValue(dia.g, nodo, valor) };
  else pan = { ...pan, g: CV.setCurrentValue(pan.g, nodo, valor) };
  pintar();
}

/**
 * A Property Node's row for the panel (DT-072 §6), asked by the worker that runs: read or written over the panel's run
 * state, which both windows keep; "draw" is answered once what was sent has been painted.
 */
function answerPanelRequest({ id, kind, request }) {
  const worker = trabajador;
  const answer = (valor) => worker && worker === trabajador && worker.postMessage({ orden: "respuesta", id, valor });
  if (kind === "draw") return requestAnimationFrame(() => answer(null));
  const runProps = pan.runProps ?? PP.emptyRunState();
  if (kind === "get") return answer(PP.readProperty(grafo(), runProps, request.nodo, request.property));
  const written = PP.writeProperty(grafo(), runProps, request.nodo, request.property, request.value);
  if (written.graph !== grafo()) ponerGrafo(written.graph, { share: true });
  setRunProps(written.runState);
  canal.postMessage({ runProps: written.runState });
  answer(written.answer);
}

/** The panel's run state (panel-properties.mjs): what Property Nodes changed, drawn by the Front Panel. */
function setRunProps(runProps) {
  pan = { ...pan, runProps };
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
  if (data.archivo) answerFileDialog(data.archivo);
  if (data.panel) answerPanelRequest(data.panel);
  if (data.controlEscrito) {
    setControlFromRun(data.controlEscrito.nodo, data.controlEscrito.valor);
    canal.postMessage({ controlEscrito: data.controlEscrito });
  }
  if (data.fin) acabar(data);
}

/**
 * A Run's file dialog or confirmation (DT-067, amendment of 2026-10-29): the main process shows the system's own,
 * and the answer goes back to the worker that asked, if it is still the one running.
 */
async function answerFileDialog({ id, kind, request }) {
  const worker = trabajador;
  const ask = { confirm: window.solder.confirmRun, "file-dialog": window.solder.fileDialogRun, "choose-file": window.solder.chooseRunFile }[kind];
  const answer = await ask(request);
  if (worker && worker === trabajador) worker.postMessage({ orden: "respuesta", id, valor: answer ?? null });
}

/**
 * El diálogo de error que espera al usuario (DT-043), en la ventana que lanzó el OVI: el worker ha
 * parado el OVI en la importación y sigue cuando se contesta. Sin él, el OVI espera.
 */
let dialogoError = null;
function responderDialogo(valor) {
  if (!dialogoError || !trabajador) return;
  trabajador.postMessage({ orden: "respuesta", id: dialogoError.id, valor });
  dialogoError = null;
  pintar();
}

/** El OVI ha acabado, solo, con un error o abortado: las dos ventanas vuelven a editar. */
function acabar(data) {
  clearTimeout(plazoAbort);
  dialogoError = null;
  lanzado = false;
  canal.postMessage({ ejecutando: false });
  modoRun(false);
  if (data.error) window.solder?.avisar("The OVI stopped with an error.", data.error);
}

async function ejecutarOVI({ stepFirst = false } = {}) {
  // Run con el VI corriendo no hace nada, como en LabVIEW.
  if (ejecutando) return;
  confirmarEscritura();
  // The subOVIs may have been saved since this OVI was opened: Run compiles what is on disk now.
  await refrescarJerarquia();
  if (ejecutando) return;
  const g = grafo();
  // A VI that cannot run opens the Error list, as the broken arrow does in LabVIEW (REPORT.md §5).
  if (errorRows().length) return openErrorList();
  const c = compilar(g, cat, { name: currentOVIName() });
  if (c.errores) return window.solder?.avisar("The OVI cannot run.", c.errores.map((e) => e.motivo).join("\n"));
  // An OVI that talks to instruments gets a port to the I/O process for this Run (DT-065 §3).
  const ioPort = c.usesInstrumentIo ? await instrumentIoPort() : null;
  if (ejecutando) return ioPort?.close();
  const debugging = allowsDebugging(g) ? { plan: (debugPlan = buildDebugPlan(g, c.debugNodes, ctx, inv)), config: DS.controllerConfig(debug, g), stepFirst } : null;
  if (!trabajador) {
    trabajador = new Worker(new URL("./run-worker.mjs", import.meta.url), { type: "module" });
    trabajador.onmessage = ({ data }) => alMensaje(data);
  }
  pool ??= createBrowserPool();
  const poolPorts = pool.connect();
  lanzado = true;
  canal.postMessage({ ejecutando: true });
  modoRun(true);
  const transferred = ioPort ? [...poolPorts, ioPort] : poolPorts;
  trabajador.postMessage({ orden: "run", clave: oviKey, compilado: runnableOVI(c), depuracion: debugging, valores: valoresDeControles(g), separador, charts: g.nodos.filter((n) => n.tipo === "waveform-chart").map((n) => n.id), poolPorts, ioPort }, transferred);
}

/**
 * A port to the instrument I/O process, which the main process sends as a window message because a port
 * cannot cross the context bridge (preload.cjs). Outside Electron there is none: the Run says so if it
 * reaches a VISA function.
 */
function instrumentIoPort() {
  if (!window.solder?.io) return Promise.resolve(null);
  return new Promise((resolve) => {
    const receive = (event) => {
      if (event.source !== window || !event.data?.solderIoPort) return;
      window.removeEventListener("message", receive);
      resolve(event.ports[0]);
    };
    window.addEventListener("message", receive);
    window.solder.io.conectar();
  });
}

// When the I/O process ends, a Run waiting for an instrument fails instead of waiting for ever.
window.solder?.io?.alTerminar(() => trabajador?.postMessage({ orden: "io-exited" }));

/**
 * Abort: el OVI para en el acto, aunque esté esperando. Si en medio segundo el
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
    // Its coordinator is gone, so the pool's threads may still be running that Run: a new pool for the next one.
    pool?.close();
    pool = null;
    acabar({ abortado: true });
  }, 500);
}

/** Las órdenes hechas del menú File, por el último segmento de su id. */
const ORDENES_MENU = {
  save: () => guardarOVI(false),
  "save-as": () => guardarOVI(true),
  open: abrirOVI,
  "new-vi": () => window.solder?.nuevoOVI(),
  new: () => window.solder?.nuevo(),
  "create-project": () => window.solder?.project.create(),
  "open-project": () => window.solder?.project.open(),
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

/** The orders of the context menus (subOVI node, connector pane, icon) that act on the window and not on the graph; they receive the node the menu was opened on. */
const ORDENES_CONTEXTUALES = { "vi-properties": () => abrirPropiedades(), "open-front-panel": (nodeId) => abrirSubOVI(nodeId), "open-polymorphic-ovi": (nodeId) => abrirPolimorfico(nodeId), "list-errors": (wireId) => openErrorList(`wire.${wireId}`) };

// ——— Debugging (DT-047) ———
//
// Highlight Execution, Retain Wire Values, probes, breakpoints and the steps (debugging/debug-state.mjs)
// are state of the OVI that is open, shared by its two windows: the diagram is the one that changes it
// and sends it to the panel (`debugState`), and both apply what the run worker reports (`debugEvent`).
// The Debug Window and the Error list are windows of the diagram, drawn over it like the dialogs
// (debugging/debug-view.mjs). The controller that stops and paces the OVI is in the run worker.

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

/** What the run worker said about the OVI: it is applied here and the other window gets it too. */
function applyDebugEvent(event, fromChannel = false) {
  if (!fromChannel) canal.postMessage({ debugEvent: event });
  debug = DS.applyDebugEvent(debug, event, grafo(), Date.now());
  pintar();
}

/** The toolbar's debugging buttons in the state of the OVI now (debugging/debug-state.mjs `toolbarState`). */
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
    oviName: currentOVIName(),
    nodeName: paused?.name ?? "",
    nodeIsSubOVI: !!node && SN.isSubOVI(node),
    container: container ? (container.tipo === "while-loop" || container.tipo === "for-loop" ? "loop" : "structure") : null,
    stop: paused ? { kind: paused.kind, phase: paused.phase } : null,
    parentName: container ? nodeDisplayName(container, inv) : null,
  });
}

/** The toolbar's buttons that change with the OVI: the debugging ones and the List Warnings triangle (Rule 89b). */
const toolbarButtons = () => ({ ...debugToolbar(), "list-warnings": { enabled: true, tooltip: "List Warnings" } });

/** Highlight Execution button: toggles; held, it opens the menu of speeds (REPORT.md §1). */
const clickHighlight = () => allowsDebugging(grafo()) && setDebug(DS.toggleHighlight(debug));
const clickRetain = () => allowsDebugging(grafo()) && setDebug(DS.toggleRetain(debug));

/** Pause, Continue and the three steps. In edit mode the steps start the OVI stopped at its first node (Start Single Stepping, unverified). */
function clickPause() {
  if (!allowsDebugging(grafo())) return;
  if (!ejecutando) return;
  if (debug.run.paused) return toWorker({ orden: "debug-resume", modo: "continue" });
  toWorker({ orden: "debug-pause" });
}

function clickStep(mode) {
  if (!allowsDebugging(grafo())) return;
  if (!ejecutando) return mode === "out" ? undefined : ejecutarOVI({ stepFirst: true });
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
  // The triangle opens the Error list, as Ctrl+L does, with the warnings shown (warnings-frame-stops §A2).
  "list-warnings": () => openErrorList(),
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

/** The errors of the OVI now (cached by graph: compiling on each repaint would be wasteful). Only these stop Run. */
let errorRowsCache = { graph: null, hierarchy: null, rows: [], warnings: [] };
function errorRows() {
  const g = grafo();
  if (errorRowsCache.graph === g && errorRowsCache.hierarchy === hierarchyErrors) return errorRowsCache.rows;
  const compiled = compilar(g, cat);
  const rows = EL.collect({ graph: g, catalog: cat, resolved: Gr.tipos(g, cat), hierarchyErrors, compileErrors: compiled.errores ?? [], inventory: inv });
  errorRowsCache = { graph: g, hierarchy: hierarchyErrors, rows, warnings: EL.collectWarnings({ graph: g, catalog: cat }) };
  return rows;
}

/** Everything the Error list may show: the errors and, after them, the warnings. */
const listRows = () => [...errorRows(), ...errorRowsCache.warnings];
/** The rows the Error list shows now, with or without the warnings. */
const shownRows = () => EL.visibleRows(listRows(), errorList.showWarnings);

/** Show Warnings is one setting for the whole session (measured): the main process keeps it for every OVI. */
function receiveShowWarnings(showWarnings) {
  if (errorList.showWarnings === !!showWarnings) return;
  errorList = { ...errorList, showWarnings: !!showWarnings };
  pintar();
}

/** View ▸ Error List; from a wire's menu (List Errors) the list opens with that wire's error selected. */
function openErrorList(selectedRowId) {
  if (!conDiagrama) return canal.postMessage({ showTool: "error-list" });
  debugUi.errorListAt ??= defaultWindowPosition(DV.ERROR_LIST.width, DV.ERROR_LIST.height, 30);
  const selected = shownRows().some((row) => row.id === selectedRowId) ? selectedRowId : (errorList.selected ?? shownRows()[0]?.id ?? null);
  errorList = { ...errorList, open: true, selected };
  // The tip of what the mouse was resting on would stay over the window until the mouse moved (real-programs-0.3.md B14).
  dia = ED.sobrevolar(dia, null);
  descartarTip();
  pintar();
}

/** Show Error and a double click on a row: the diagram comes to the front and the object gets its marching frame. */
function showError(rowId) {
  const row = shownRows().find((candidate) => candidate.id === (rowId ?? errorList.selected));
  if (!row?.target) return;
  errorFocus = row.target;
  window.focus();
  pintar();
}

/** Remove Breakpoints from Hierarchy: this OVI has no subOVI breakpoints yet (subOVIs are not debugged), so it clears its own. */
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
    windows += DV.debugWindow(inv, debug, grafo(), { oviName: currentOVIName(), separator: separador, position: debugUi.debugWindowAt ?? defaultWindowPosition(DV.DEBUG_WINDOW.width, DV.DEBUG_WINDOW.height) });
    if (debugUi.menu) popup += D.menuContextual(inv, debugUi.menu, DV.debugWindowMenuMarks(debug), medirMenu, DV.debugWindowMenuVariants(debug), windowSize());
    if (debugUi.askingToCloseProbes) windows += DV.closeProbesDialog(inv);
  }
  if (errorList.open) {
    windows += DV.errorListWindow(inv, { rows: listRows(), state: errorList, oviName: currentOVIName(), position: debugUi.errorListAt ?? defaultWindowPosition(DV.ERROR_LIST.width, DV.ERROR_LIST.height, 30) });
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
  else if (id === `${EW}.show-warnings`) {
    window.solder?.listaDeErrores.fijarMostrarAvisos(!errorList.showWarnings);
    receiveShowWarnings(!errorList.showWarnings);
  }
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
// this window and, through the main process, for every other open OVI: the
// system clipboard is not used, so that copying in one OVI and pasting in another
// does not depend on what else the user copied (spec/05 rule 73).

/** The last thing copied or cut in this window (`{ oviKey, fragment }`), and where the last paste was done. */
let portapapeles = { paquete: null, memoria: null };
/**
 * The last point of the canvas that was clicked: where Ctrl+V and Edit ▸ Paste centre what they paste. LabVIEW pastes
 * on the last click in the window, not where the pointer is (measured, reports/2026-11-14-editing-fixes.md §1).
 */
let punteroEnLienzo = null;

/** The size of this window's canvas: the best guess for the other window's, which this window cannot see. */
function tamanoDelLienzo() {
  const rect = document.querySelector(".lienzo")?.getBoundingClientRect();
  return rect ? { width: Math.round(rect.width), height: Math.round(rect.height) } : undefined;
}

/** Where to paste: the last click on the canvas, or its middle if it has not been clicked yet. */
function dondePegar() {
  if (punteroEnLienzo) return punteroEnLienzo;
  const tam = tamanoDelLienzo() ?? { width: 600, height: 400 };
  return { x: Math.round(tam.width / 2), y: Math.round(tam.height / 2) };
}

/** What the main process says was copied in any OVI (it tells every window, and a new window asks). */
function recibirPortapapeles(texto) {
  if (texto) portapapeles = { paquete: JSON.parse(texto), memoria: null };
}

/** Keeps what was copied here and tells the main process, which hands it to the other OVIs. */
function guardarEnPortapapeles(fragment) {
  portapapeles = { paquete: { oviKey, fragment }, memoria: null };
  window.solder?.portapapeles.guardar(JSON.stringify(portapapeles.paquete));
}

/** The fragment as it reads in this OVI: the paths of its subOVIs are relative to the file it came from. */
function fragmentoParaEsteOVI({ oviKey: origen, fragment }) {
  if (origen === oviKey) return fragment;
  const nodes = fragment.nodes.map((n) => (SN.isSubOVI(n) ? { ...n, config: { ...n.config, vi: Paths.rebaseStoredPath(n.config.vi, origen, oviKey) } } : n));
  return { ...fragment, nodes };
}

/** A pasted subOVI must be known before it is drawn: its file is read, like Select an OVI... does. */
async function conocerSubOVIs(fragment) {
  const faltan = fragment.nodes.filter((n) => SN.isSubOVI(n) && !cat.findSubOVI?.(n.config.vi));
  for (const n of faltan) {
    const { texts } = await window.solder.textosDeOVI(Paths.resolveRelative(oviKey, n.config.vi, oviLibRoot));
    subOVITexts = { ...subOVITexts, ...texts };
  }
  if (faltan.length) ponerGrafo(rebuildHierarchy(grafo()));
}

function copiar() {
  const fragment = conDiagrama ? DC.copySelection(dia) : PC.copySelection(pan, ctx);
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
  const cut = PC.cutSelection(pan, ctx);
  if (!cut) return;
  guardarEnPortapapeles(cut.fragment);
  cambiarPanel(cut.p);
}

async function pegar() {
  if (ejecutando) return;
  const { paquete } = portapapeles;
  if (!paquete) return;
  const fragment = fragmentoParaEsteOVI(paquete);
  if (conDiagrama) await conocerSubOVIs(fragment);
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
    undoName: H.undoName(historial),
    redoName: H.redoName(historial),
    canCopy: hayParaCopiar,
    hasSelection: seleccion.length > 0,
    clipboardFilled: !!portapapeles.paquete,
  });
}

// ——— OVI Properties (ovi-properties.mjs) ———

function abrirPropiedades() {
  if (ejecutando || propiedades) return;
  confirmarEscritura();
  estado = { ...estado, paleta: null, abierta: null, menuBarra: null };
  dia = { ...dia, menu: null };
  pan = { ...pan, menu: null };
  propiedades = VP.open(grafo());
  pintar();
}

/** OK writes the dialog into the OVI; Cancel leaves it as it was. */
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

/** The right-click menu of a graph while the OVI runs (88, 89); nothing else on the panel has one yet. */
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
 * window only applies it. Accepting writes the dialog into the OVI; an OVI that does not change
 * records no step of undo.
 */
function aplicarEnDialogo(intent, abierto) {
  if (!intent) return;
  const [actual, cambiarActual] = abierto.side === "diagram" ? [dia, cambiarDiagrama] : [pan, cambiarPanel];
  if (intent.dialog && !intent.accept) return cambiarActual({ ...actual, [abierto.field]: intent.dialog });
  if (intent.cancel) return cambiarActual({ ...actual, [abierto.field]: null });
  if (!intent.accept) return;
  const g = MD.accepted(intent.dialog ? { ...abierto, dialog: intent.dialog } : abierto, actual.g);
  return cambiarActual({ ...actual, ...(g !== actual.g && { g }), [abierto.field]: null }, abierto.mod.stepName?.());
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
  if (intent?.browse) return browseForLibrary();
  return aplicarEnDialogo(intent, abierto);
}

/**
 * The browse button of the Call Library Function Node's dialog opens the system's file dialog, and the library chosen becomes
 * the text of its library box. Without the Electron bridge (a plain browser) there is no dialog and the button does nothing.
 */
async function browseForLibrary() {
  const chosen = await window.solder?.elegirBiblioteca?.();
  if (chosen && dia.callLibraryDialog) cambiarDiagrama({ ...dia, callLibraryDialog: CallLibraryDialog.withLibrary(dia.callLibraryDialog, chosen) });
}

// ——— SubOVIs: placing one, opening its Front Panel ———

/** Select an OVI...: the file dialog, then the OVI follows the cursor until a click drops it (labview-captures/subvi/select-a-vi-dialog.png). */
async function seleccionarOVI() {
  if (!conDiagrama || ejecutando) return;
  estado = { ...estado, paleta: null, abierta: null };
  pintar();
  const absolutePath = await window.solder?.elegirOVI();
  if (!absolutePath) return;
  const { texts } = await window.solder.textosDeOVI(absolutePath);
  const g = learnCallee(texts);
  let config;
  try {
    config = SN.placedConfig(Paths.storedPathFor(oviKey, absolutePath, oviLibRoot), texts[absolutePath]);
  } catch (error) {
    return window.solder.error(error.message);
  }
  dia = ED.coger({ ...dia, g }, "subvi", config);
  pintar();
}

/** Adds the texts of a callee (and of what it reaches) to the hierarchy and rebuilds it; returns the diagram's graph over it. */
function learnCallee(texts) {
  subOVITexts = { ...subOVITexts, ...texts };
  return rebuildHierarchy(dia.g);
}

/**
 * A palette element that places a subOVI (`bloque: "subvi"` with its `config.vi`, as VISA Configure Serial Port's): the callee's texts
 * are read first, as Select an OVI... does, so that the node is drawn with its icon and its terminals at once.
 */
async function carrySubOVIFromPalette(entry, where) {
  const { texts } = await window.solder.textosDeOVI(Paths.resolveRelative(oviKey, entry.config.vi, oviLibRoot));
  const g = learnCallee(texts);
  dia = ED.moverA(ED.coger({ ...dia, g }, entry.bloque, entry.config), ctx, where);
  dia = { ...dia, accion: { ...dia.accion, arrastrado: false } };
  pintar();
}

/** Open Polymorphic OVI: the window that edits the `.sdp` the node calls. */
function abrirPolimorfico(nodeId) {
  const polymorphic = cat.polymorphicOf?.(grafo().nodos.find((n) => n.id === nodeId));
  if (polymorphic) window.solder?.abrirRuta(polymorphic.key);
}

/** Opens the windows of the OVI that a `subvi` node calls (or brings them forward if they are open). */
function abrirSubOVI(nodeId) {
  const file = SN.fileToOpen(grafo().nodos.find((n) => n.id === nodeId), cat, oviKey, oviLibRoot);
  if (file) window.solder?.abrirRuta(file);
}

/** The right-click menu of the connector pane (on a cell) or of the icon of the OVI. */
function menuDelIcono(ev, elemento) {
  const esConector = elemento.dataset.id === `${prefijo}.connector-pane`;
  const raiz = esConector ? CP.MENU_ROOT : CP.ICON_MENU_ROOT;
  const celda = esConector ? CP.clickedCell(elemento, ev, patternOf(grafo())) : null;
  estado = { ...estado, paleta: null, abierta: null };
  if (conDiagrama) return cambiarDiagrama(CP.openMenu(dia, raiz, ev.clientX, ev.clientY, celda));
  cambiarPanel(CP.openMenu(pan, raiz, ev.clientX, ev.clientY, celda));
}

canal.onmessage = ({ data }) => {
  // Before this window has loaded its OVI, what it holds is not the OVI.
  if (!listo) return;
  // Una ventana que acaba de abrirse pide el OVI; la que lo tiene lo manda.
  if (data.pide) return canal.postMessage({ g: grafo(), subOVITexts, stamp });
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
  if (data.controlEscrito) return setControlFromRun(data.controlEscrito.nodo, data.controlEscrito.valor);
  if (data.runProps) return setRunProps(data.runProps);
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
  if (verdict === "stale") return canal.postMessage({ g: grafo(), subOVITexts, stamp });
  stamp = data.stamp;
  if (JSON.stringify(data.g) === JSON.stringify(grafo())) return;
  let g = data.g;
  // The other window may have placed a subOVI this one has not read yet: its view of the hierarchy comes first.
  if (data.subOVITexts && (JSON.stringify(data.subOVITexts) !== JSON.stringify(subOVITexts) || faltaSubOVI(g))) {
    subOVITexts = data.subOVITexts;
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
  ctx.panelStyle = panelStyle;
  const resueltos = Gr.tipos(grafo(), cat);
  // A chart whose wire changed has lost its history (REPORT §4).
  const charts = GS.reconciledCharts(pan.charts, grafo(), resueltos);
  if (charts !== pan.charts) pan = { ...pan, charts };
  const floating = floatingWindows();
  const extra = { toolbar: toolbarButtons(), resaltando: debug.highlight.on && ejecutando, flotantes: floating.windows, runRoto: !Gr.ejecutable(grafo(), cat, resueltos) || hierarchyErrors.length > 0, ejecutando, conAvisos: !ejecutando && EL.showsWarningButton(listRows(), errorList.showWarnings), dialogo: dialogoError, numeroOVI: oviInfo.untitledNumber ?? undefined, propiedades: (propiedades ? VP.view(inv, propiedades) : "") + dibujarDialogoModal() };
  if (conDiagrama) {
    extra.lienzo = D.contenido({ ...dia, debug: DV.canvasView(debug, dia.g, ejecutando) }, ctx, resueltos) + DV.overlay(debug, dia.g, ctx, resueltos, { now: Date.now(), separator: separador, running: ejecutando, pausedAt: debug.run.paused, errorFocus });
    extra.encima = (dia.menu ? D.menuContextual(inv, dia.menu, ED.marcados(dia, ctx), medirMenu, DV.mergeVariants(ED.variantes(dia, ctx, inv), DV.menuVariants(debug, dia.g, resueltos, dia.menu)), windowSize()) : "") + floating.popup;
    extra.editandoTexto = !!dia.edicion;
    extra.reorder = dia.reorder;
  } else {
    extra.lienzo = P.contenido(pan, ctx, resueltos);
    extra.panelStyle = panelStyle;
    extra.conectorGlifo = CP.paneGlyph(pan.g, cat, pan.conector?.celda ?? null);
    extra.encima = pan.menu ? D.menuContextual(inv, pan.menu, ED.marcados(pan, ctx), medirMenu, ED.variantes(pan, ctx, inv), windowSize()) : "";
    extra.editandoTexto = !!pan.edicion;
    extra.reorder = pan.reorder;
  }
  // El menú de la barra que está abierto, bajo su título.
  if (estado.menuBarra) {
    const variantes = estado.menuBarra.id === EM.editMenuId(nombre) ? variantesDelMenuEdit() : {};
    extra.encima = (extra.encima ?? "") + D.menuContextual(inv, { raiz: estado.menuBarra.id, x: estado.menuBarra.x, y: estado.menuBarra.y }, marcasDelMenuBarra(estado.menuBarra.id), medirMenu, variantes, windowSize());
  }
  extra.origin = scrollOrigin;
  morphInnerHtml(document.body, V.ventana(inv, nombre, estado, extra));
  drawScrollbars();
  const ventana = document.querySelector(".ventana");
  ventana.classList.toggle("cableando", dia.accion?.tipo === "cablear");
  // Mientras se arrastra un control desde la paleta, el lienzo lleva un borde punteado.
  ventana.classList.toggle("colocando", pan.accion?.tipo === "colocar" && !!pan.accion.arrastrado);
  // The right-click menus place themselves inside the window (diagram-view.mjs `placeMenu`); the rest is pushed back in here.
  const tam = windowSize();
  placePalettes(tam);
  for (const el of document.querySelectorAll(".explicacion, .lista-marcos")) dentro(el, tam);
  if (tip.visible) ponerTip();
  if (conPanel) showPanelCursor();
  docking?.afterPaint();
}

/**
 * This window's menus and toolbar for the docked window's own (DT-101 §7): the menu rows with the variants and ticks the
 * drawn menus have, and the toolbar and icons as drawn here, with the window's classes (running, broken arrow…).
 */
function dockedChromeModel() {
  const variantOf = (id) => (id === EM.editMenuId(nombre) ? variantesDelMenuEdit() : {});
  return {
    menus: menuBarModel(inv, `window.${nombre}`, { variantOf, marksOf: marcasDelMenuBarra }),
    toolbar: { kind: nombre, windowClasses: document.querySelector(".ventana")?.className ?? "", html: outerHtmlOf(".ventana > .cabecera > .barra, .ventana > .cabecera > .zona-iconos") },
  };
}

/** A row of the menu bar: what is done is done; a hole is explained at `where`. Clicked here, or chosen in the docked window's menu. */
function runBarMenuRow(id, where) {
  const orden = !esHueco(inv.resolver(id)) && ORDENES_MENU[id.slice(id.lastIndexOf(".") + 1)];
  if (orden) {
    cambiar({ ...estado, menuBarra: null });
    return orden();
  }
  return cambiar(E.clic({ ...estado, menuBarra: null }, inv, id, where));
}

/** Where an explanation opens for a row chosen in the docked window's native menu: near the top left of the page. */
const DOCKED_EXPLANATION_POINT = { x: 40, y: 40 };

/** The check marks of a menu opened from the page and not from the menu bar: the current page of OVI Properties. */
const marcasDelMenuBarra = (id) => new Set(id === VP.CATEGORIES_ID ? [`${VP.CATEGORIES_ID}.execution`] : id === HIGHLIGHT_BUTTON_ID ? [`${HIGHLIGHT_BUTTON_ID}.${debug.highlight.speed}`] : []);

function cambiar(nuevo) {
  if (nuevo === estado) return;
  estado = nuevo;
  ocultarEmergente();
  pintar();
}

/**
 * The one place where an edit is settled before it is drawn and kept: a deleted control or indicator leaves the
 * connector pane too (its terminal goes with it), and a polymorphic node on Automatic calls the instance its wires
 * pick, its wires to terminals the new instance lacks left loose (DT-074). The adaptation belongs to the edit that
 * caused it, not to an undo step of its own. A Bundle or Unbundle follows the cluster wired to it, so after every edit —a
 * wire, a deleted node, an element of a Cluster Constant, a reorder, a Change to, a paste— it takes the wired cluster's
 * type again (DT-098); the undo and redo restore graphs that were already settled. `before` is the view the edit started from.
 */
function settleEdit(before, view) {
  const pruned = pruneConnector(view.g, cat);
  const followed = followWiredClusters(pruned, cat);
  const g = PolymorphicNodes.settlePolymorphicNodes(before.g, followed, cat, ED.terminalPlacer(ctx));
  return g === view.g ? view : { ...view, g };
}

/**
 * Changes the diagram. When it comes to rest —nothing half done, no text half
 * written—, the step is kept to undo it, with its name if it has one.
 */
function cambiarDiagrama(nuevo, stepName) {
  if (nuevo === dia) return;
  dia = settleEdit(dia, nuevo);
  // What Create made is a step of undo before its value or label is typed: the typing is another one (REPORT.md §A).
  if (Et.graphAtRest(dia)) quieto(dia.g, stepName);
  pintar();
}

/** Cambiar el panel. Como el diagrama: el paso se guarda cuando queda quieto. */
function cambiarPanel(nuevo) {
  if (nuevo === pan) return;
  pan = settleEdit(pan, nuevo);
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

/** The point of the event in canvas coordinates: the page point plus how far the canvas is scrolled. */
function punto(ev) {
  const r = document.querySelector(".lienzo").getBoundingClientRect();
  return { x: ev.clientX - r.left + scrollOrigin.x, y: ev.clientY - r.top + scrollOrigin.y };
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
  // The rows of Read Delimited Spreadsheet's instance list.
  const filaInstancia = el.closest(".item-instancia");
  if (filaInstancia) return { tipo: "fila-instancia", nodo: filaInstancia.dataset.nodo, instancia: filaInstancia.dataset.instancia };
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
  if (n && !n.closest(".fantasma")) return { tipo: "nodo", id: n.dataset.nodo, ...(el.closest(".celda-error") ? { campo: el.closest(".celda-error").dataset.campo } : {}), ...(el.closest(".fila-nombre") ? { fila: Number(el.closest(".fila-nombre").dataset.fila) } : {}), ...(el.closest(".fila-propiedad") ? { filaPropiedad: Number(el.closest(".fila-propiedad").dataset.filaPropiedad) } : {}), ...(el.closest(".anillo-instancia") ? { anillo: true, anilloEn: topLeftOf(el.closest(".anillo-instancia")) } : {}), ...(el.closest(".celda-array, .celda-grid") ? { campo: addressFromText(el.closest(".celda-array, .celda-grid").dataset.campo) } : {}) };
  const c = el.closest(".tramo-zona");
  if (c) return { tipo: "tramo", cable: c.dataset.cable, k: Number(c.dataset.tramo) };
  return { tipo: "fondo" };
}

/** Qué hay bajo el ratón en el panel: una etiqueta, un objeto o el fondo. Fuera del lienzo, nada. */
/** What `objetivoPanel` calls the parts of a panel object, where its right-click menu opens. */
const PANEL_OBJECT_TARGETS = new Set(["objeto", "casilla", "paso", "elem", "campo", "asa-array"]);

// The parts of a panel object are found by their data attributes, which every panel style keeps (DT-058).
function objetivoPanel(el) {
  if (!el?.closest(".lienzo")) return null;
  const objectOf = (part) => part.closest(".objeto-panel").dataset.nodo;
  const etiqueta = el.closest(".etiqueta");
  if (etiqueta) return { tipo: "etiqueta", id: etiqueta.dataset.etiqueta };
  const campo = el.closest("[data-campo]");
  if (campo) return { tipo: "campo", id: objectOf(campo), campo: campo.dataset.campo };
  const freeLabelHandle = el.closest("[data-asa-libre]");
  if (freeLabelHandle) return { tipo: "asa-libre", id: freeLabelHandle.dataset.nodo, lado: freeLabelHandle.dataset.asaLibre };
  const controlHandle = el.closest("[data-asa-control]");
  if (controlHandle) return { tipo: "asa-control", id: controlHandle.dataset.nodo, lado: controlHandle.dataset.asaControl };
  const clusterHandle = el.closest("[data-asa-cluster]");
  if (clusterHandle) return { tipo: "asa-cluster", id: clusterHandle.dataset.nodo, lado: clusterHandle.dataset.asaCluster };
  const asaArray = el.closest("[data-asa-array]");
  if (asaArray) return { tipo: "asa-array", id: objectOf(asaArray), lado: asaArray.dataset.lado };
  const elem = el.closest("[data-k]");
  if (elem) return { tipo: "elem", id: objectOf(elem), k: addressFromText(elem.dataset.k) };
  const flecha = el.closest("[data-paso]");
  if (flecha) return { tipo: "paso", id: objectOf(flecha), paso: Number(flecha.dataset.paso), eje: flecha.closest("[data-eje]")?.dataset.eje };
  const casilla = el.closest("[data-casilla]");
  if (casilla) return { tipo: "casilla", id: casilla.dataset.casilla };
  // The legend of a graph and the swatch of a plot are parts of it, with menus of their own.
  const parte = el.closest("[data-parte]");
  if (parte) return { tipo: "objeto", id: objectOf(parte), parte: parte.dataset.parte };
  // A row of the list of a ring's items, open in operate mode (a row that is not built carries no item).
  const ringRow = el.closest(".item-ring");
  if (ringRow) return { tipo: "fila-ring", id: ringRow.dataset.nodo, k: ringRow.dataset.ringItem === undefined ? undefined : Number(ringRow.dataset.ringItem) };
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

/** The top-left corner of an element in window pixels: where a ring's menu opens from. */
const topLeftOf = (el) => {
  const box = el.getBoundingClientRect();
  return { x: box.left, y: box.top };
};

const ancla = (el) => {
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.bottom + 2 };
};

/**
 * The arrow of a VISA resource name (the constant's, or the control's button) opens the menu of the VISA resources
 * flush left under it, and a second press closes it. Solder cannot find resources yet, so the menu only has its
 * greyed Refresh row, which says why (spec/05-editor.md, VISA resource name). The arrow of a DAQ name control
 * does the same with its own list, which has Browse..., greyed for the same reason.
 */
function toggleNameDropdown(ev, arrow, menuRoot = ED.VISA_DROPDOWN_MENU) {
  ev.preventDefault();
  const nodeId = arrow.closest("[data-nodo]")?.dataset.nodo;
  const owner = conPanel ? pan : dia;
  if (!nodeId) return;
  const closing = owner.menu?.raiz === menuRoot;
  const settled = conPanel ? P.confirmar(pan) : ED.confirmar(dia, ctx);
  const box = arrow.closest(".constante, .objeto-panel").getBoundingClientRect();
  const next = closing ? { ...settled, menu: null } : ED.abrirMenu(settled, menuRoot, nodeId, box.left, box.bottom);
  if (conPanel) cambiarPanel(next);
  else cambiarDiagrama(next);
}

/**
 * The browse button of a File Path Control opens the system's file dialog and the path chosen becomes the control's
 * value, as if it had been typed. The dialog's options (Browse Options..., spec/05-editor.md) are not offered yet: it picks
 * one existing file. Without the Electron bridge (a plain browser) there is no dialog and the button does nothing.
 */
async function browseForPath(ev, button) {
  ev.preventDefault();
  const nodeId = button.closest("[data-nodo]")?.dataset.nodo;
  if (!conPanel || !nodeId || !window.solder?.elegirRuta) return;
  const chosen = await window.solder.elegirRuta();
  if (chosen) cambiarPanel(P.fijarRuta(P.confirmar(pan), nodeId, pathFromText(chosen, ctx.pathRules)));
}

addEventListener("mousedown", (ev) => {
  if (ev.button !== 0) return;
  if (ev.target.closest?.(".lienzo")) punteroEnLienzo = punto(ev);
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
  // OVI Properties is modal too: its buttons answer to the click event.
  if (propiedades && !estado.menuBarra) return;
  // Con un menú de la barra abierto, pulsar fuera de él y de los títulos lo cierra.
  if (estado.menuBarra && !ev.target.closest(".menu-contextual, .menu")) return cambiar({ ...estado, menuBarra: null });
  if (estado.menuBarra) return;
  // A modal dialog swallows the mousedown: its parts answer to the click event.
  if (dialogoModal()) return ev.preventDefault();
  const browseButton = ev.target.closest?.("[data-browse]");
  if (browseButton && !ev.target.closest(".menu-contextual")) return browseForPath(ev, browseButton);
  const visaDropdown = ev.target.closest?.("[data-visa-dropdown]");
  if (visaDropdown && !ev.target.closest(".menu-contextual")) return toggleNameDropdown(ev, visaDropdown);
  const daqDropdown = ev.target.closest?.("[data-daq-dropdown]");
  if (daqDropdown && !ev.target.closest(".menu-contextual")) return toggleNameDropdown(ev, daqDropdown, DAQ_NAME_DROPDOWN_MENU);
  if (reorderOfWindow()) return pressWhileReordering(ev);
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
    // A subOVI (a polymorphic OVI of ovi.lib, say) is carried once its file has been read, so that it is drawn with its icon.
    if (conDiagrama && e.bloque === "subvi") {
      carrySubOVIFromPalette(e, punto(ev));
      return pintar();
    }
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
    return cambiarPanel(CP.selectCell(pan, CP.clickedCell(panelConector, ev, patternOf(grafo()))));
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
  // A double click on a subOVI opens its Front Panel.
  if (ev.detail >= 2 && sobreDiagrama.tipo === "nodo" && SN.isSubOVI(dia.g.nodos.find((n) => n.id === sobreDiagrama.id))) return abrirSubOVI(sobreDiagrama.id);
  // A double click on an Express OVI opens its configuration dialog (DT-069 §3).
  const doubleClicked = ev.detail >= 2 && sobreDiagrama.tipo === "nodo" && dia.g.nodos.find((n) => n.id === sobreDiagrama.id);
  if (doubleClicked && ExpressNodes.isExpressNode(doubleClicked, cat)) return cambiarDiagrama(ED.openConfiguration(dia, ctx, doubleClicked.id));
  // A double click on a Call Library Function Node opens its configuration dialog (DT-080).
  if (doubleClicked && CallLibraryNodes.isCallLibraryNode(doubleClicked)) return cambiarDiagrama(ED.openCallLibraryConfiguration(dia, doubleClicked.id));
  // A double click on empty space starts a free label; on a free label, types into it again (DT-085).
  if (ev.detail >= 2 && sobreDiagrama.tipo === "fondo" && !dia.accion?.tipo?.startsWith("colocar")) return cambiarDiagrama(ED.startFreeLabel(dia, ctx, punto(ev)));
  if (doubleClicked && isFreeLabel(doubleClicked) && !dia.edicion) return cambiarDiagrama(ED.editFreeLabel(dia, doubleClicked.id));
  const id = ev.detail >= 2 && nodoDe(sobreDiagrama);
  // A double click on an element of a Cluster Constant types into it as into a free constant (DT-095).
  if (id && ClusterConstant.isEditableElement(dia.g, id)) return cambiarDiagrama(ED.editar(dia, ctx, id));
  if (id && (D.CONSTANTES[dia.g.nodos.find((n) => n.id === id)?.tipo]?.editable || dia.g.nodos.find((n) => n.id === id)?.tipo === "expression-node")) return cambiarDiagrama(ED.editar(dia, ctx, id, sobreDiagrama.campo));
  cambiarDiagrama(ED.pulsar(dia, ctx, sobreDiagrama, punto(ev), ev.shiftKey, ev.ctrlKey || ev.metaKey));
});

// ——— Accionar el panel en modo Run ———
//
// Mientras el OVI corre, un clic acciona el control: nada se mueve, se
// selecciona ni se borra, y el diagrama no se edita. Un booleano cambia según
// su acción mecánica: los «When Pressed» al pulsar, los «When Released» al
// soltar; un Switch alterna y un Latch pasa a TRUE hasta que el diagrama lo lee.
// Un numérico se escribe en su casilla o con sus flechas, como parado.

/**
 * A press while Reorder Controls In Cluster... is on: an element's frame takes the field's number, ✓ and ✗ answer, and
 * anything else does nothing (front-panel/cluster-reorder.mjs).
 */
function pressWhileReordering(ev) {
  if (ev.target.closest(".menus")) return;
  ev.preventDefault();
  const frame = ev.target.closest("[data-reorder-element]");
  const button = ev.target.closest("[data-reorder]");
  const hit = frame ? { element: Number(frame.dataset.reorderElement) } : button ? { button: button.dataset.reorder } : null;
  if (conPanel) cambiarPanel(CR.pressInReorder(pan, cat, hit));
  else cambiarDiagrama(CR.pressInReorder(dia, cat, hit));
}

/** The state of Reorder Controls In Cluster... of the window in view, on the panel or on a Cluster Constant, or null. */
const reorderOfWindow = () => (conPanel ? pan : dia).reorder ?? null;

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
  // The list of a ring's items is open: a row picks its item, a press anywhere else closes it (DT-091).
  if (pan.lista) return cambiarPanel(P.pressRingList(pan, sobre));
  // A control a Property Node disabled cannot be operated (DT-072 §6, measured for Disabled 1 and 2).
  if (!PP.isOperable(pan.runProps, sobre.id)) return;
  const n = pan.g.nodos.find((k) => k.id === sobre.id);
  // A press on a ring control's box opens the list of its items (the arrows step as for any numeric).
  if (P.opensRingList(pan, sobre)) return cambiarPanel(P.openRingList(pan, sobre.id));
  if ((sobre.tipo === "casilla" || sobre.tipo === "paso") && (n?.tipo === "control" || n?.tipo === "str-control" || n?.tipo === "visa-control" || n?.tipo === "daq-name-control" || n?.tipo === "path-control")) return cambiarPanel(P.pulsar(pan, ctx, sobre, punto(ev), false));
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

/**
 * The edit-mode pointer over the panel (styles.css): worked out again on every move and every repaint, since
 * selecting a control changes it without moving. While a press drags something, the pointer stays as it was.
 */
function showPanelCursor() {
  const canvas = document.querySelector(".lienzo");
  if (!canvas || !lastPointer) return;
  if (pan.accion) {
    if (lastPanelCursor) canvas.dataset.cursor = lastPanelCursor;
    return;
  }
  const under = document.elementFromPoint(lastPointer.clientX, lastPointer.clientY);
  lastPanelCursor = ejecutando ? null : P.hoverCursor(pan, objetivoPanel(under), punto(lastPointer));
  if (lastPanelCursor) canvas.dataset.cursor = lastPanelCursor;
  else delete canvas.dataset.cursor;
}

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
  // A double click on empty space starts a free label; on a free label, types into it again (DT-085).
  if (ev.detail >= 2 && sobre.tipo === "fondo" && pan.accion?.tipo !== "colocar") return cambiarPanel(P.startFreeLabel(pan, ctx, punto(ev)));
  if (ev.detail >= 2 && sobre.tipo === "objeto" && !pan.edicion && isFreeLabel(pan.g.nodos.find((n) => n.id === sobre.id))) return cambiarPanel(P.editFreeLabel(pan, sobre.id));
  // Doble clic en la casilla de un control: todo el valor seleccionado.
  if (ev.detail >= 2 && sobre.tipo === "casilla" && (pan.edicion?.valor || P.doubleClickTypes(pan, sobre, punto(ev)))) return cambiarPanel(P.editarValor(pan, ctx, sobre.id, true));
  if (ev.detail >= 2 && sobre.tipo === "elem" && pan.edicion?.elem === sobre.k) return cambiarPanel(P.editarElemento(pan, ctx, sobre.id, sobre.k, true));
  if (ev.detail >= 2 && sobre.tipo === "campo" && pan.edicion?.campo === sobre.campo) return cambiarPanel(P.editarValor(pan, ctx, sobre.id, true, sobre.campo));
  cambiarPanel(P.pulsar(pan, ctx, sobre, punto(ev), ev.shiftKey, ev.ctrlKey || ev.metaKey));
}

// ——— Scrolling the canvas (scrolling.mjs) ———

/** The point of the canvas at the top left of its visible area; saved with the OVI, never marking it modified. */
let scrollOrigin = { x: 0, y: 0 };
/** Per axis, what the bars were last drawn from: `{ range, visible, trackLength, thumb }`, or null when nothing scrolls. */
const scrollAxes = { x: null, y: null };
/** A press on a bar that is still held: an arrow repeating, or the thumb being dragged. */
let barPress = null;
/** The frame loop that scrolls while something is dragged outside the canvas. */
let autoscroll = null;

const AXIS_SIZE = { x: "width", y: "height" };
const BAR_START = { x: "left", y: "top" };
const POINTER_ALONG = { x: "clientX", y: "clientY" };
const MILLISECONDS_PER_SECOND = 1000;

/** Every box drawn on the canvas, in canvas coordinates: what the scroll range is measured from. */
function canvasContentBoxes() {
  const layer = document.querySelector(".capa-desplazada");
  if (!layer) return [];
  const corner = layer.getBoundingClientRect();
  // The wires' layer covers the whole canvas: its paths are measured instead.
  const drawn = [...layer.children].filter((element) => !element.matches("svg.cables"));
  const wires = [...layer.querySelectorAll("svg.cables > *")];
  return [...drawn, ...wires]
    .map((element) => element.getBoundingClientRect())
    .filter((box) => box.width > 0 || box.height > 0)
    .map((box) => ({ left: box.left - corner.left, top: box.top - corner.top, right: box.right - corner.left, bottom: box.bottom - corner.top }));
}

/** Draws both bars from the canvas as it is now painted: the range is worked out again every time (no memory). */
function drawScrollbars() {
  const canvas = document.querySelector(".lienzo");
  if (!canvas) return;
  const boxes = canvasContentBoxes();
  const visibleSize = canvas.getBoundingClientRect();
  for (const axis of ["x", "y"]) {
    const bar = document.querySelector(`.barra-desplazamiento[data-axis="${axis}"]`);
    const visible = visibleSize[AXIS_SIZE[axis]];
    const range = Scroll.scrollRange(Scroll.contentExtent(boxes, axis), scrollOrigin[axis], visible);
    const trackLength = bar.getBoundingClientRect()[AXIS_SIZE[axis]] - 2 * Scroll.ARROW_BUTTON_LENGTH;
    if (!Scroll.isScrollable(range) || trackLength <= 0) {
      scrollAxes[axis] = null;
      bar.innerHTML = "";
      continue;
    }
    const thumb = Scroll.thumbOf(range, scrollOrigin[axis], visible, trackLength);
    scrollAxes[axis] = { range, visible, trackLength, thumb };
    bar.innerHTML = `<div class="flecha atras"></div><div class="pulgar" style="${BAR_START[axis]}:${Scroll.ARROW_BUTTON_LENGTH + thumb.start}px;${AXIS_SIZE[axis]}:${thumb.length}px"></div><div class="flecha adelante"></div>`;
  }
}

/** Shows the canvas from `origin` and tells the main process, which saves it with the OVI. */
function scrollTo(origin) {
  const rounded = { x: Math.round(origin.x), y: Math.round(origin.y) };
  if (rounded.x === scrollOrigin.x && rounded.y === scrollOrigin.y) return;
  scrollOrigin = rounded;
  window.solder?.scrolled(scrollOrigin);
  pintar();
}

const scrollBy = (axis, distance) => scrollTo({ ...scrollOrigin, [axis]: scrollOrigin[axis] + distance });

/** One step of a press on a bar: an arrow moves by the window's step, the track by a whole view. */
function stepBar(axis, part) {
  const visible = scrollAxes[axis]?.visible ?? 0;
  const steps = { "arrow-back": -Scroll.ARROW_STEP[nombre], "arrow-forward": Scroll.ARROW_STEP[nombre], "track-back": -visible, "track-forward": visible };
  scrollBy(axis, steps[part]);
}

function pressBar(ev, bar) {
  const axis = bar.dataset.axis;
  const drawn = scrollAxes[axis];
  ev.preventDefault();
  ev.stopPropagation();
  if (!drawn) return;
  const position = ev[POINTER_ALONG[axis]] - bar.getBoundingClientRect()[BAR_START[axis]];
  const part = Scroll.partOfBar(position, drawn.trackLength + 2 * Scroll.ARROW_BUTTON_LENGTH, drawn.thumb);
  if (part === "thumb") {
    barPress = { axis, thumbStart: drawn.thumb.start, pointerStart: ev[POINTER_ALONG[axis]], range: drawn.range };
    return;
  }
  stepBar(axis, part);
  // An arrow held down repeats (measured); a press on the track pages once (holding it was not measured).
  if (!part.startsWith("arrow")) return;
  const repeat = () => {
    stepBar(axis, part);
    barPress.timer = setTimeout(repeat, Scroll.ARROW_REPEAT.interval);
  };
  barPress = { axis, timer: setTimeout(repeat, Scroll.ARROW_REPEAT.firstDelay) };
}

function dragThumb(ev) {
  const { axis, thumbStart, pointerStart, range } = barPress;
  const drawn = scrollAxes[axis];
  if (!drawn) return;
  const moved = ev[POINTER_ALONG[axis]] - pointerStart;
  scrollTo({ ...scrollOrigin, [axis]: Scroll.originAtThumb(thumbStart + moved, range, drawn.visible, drawn.trackLength) });
}

function releaseBar() {
  clearTimeout(barPress?.timer);
  barPress = null;
}

/** Whether something is being dragged on the canvas: what scrolls by itself when taken outside it. */
function isDraggingOnCanvas() {
  const action = conPanel ? pan.accion : dia.accion;
  // A control chosen from the palette and placed by a click is not dragged until the button goes down.
  return !!action && !(action.tipo === "colocar" && !action.arrastrado);
}

/** Starts or stops the autoscroll from where the pointer is while a drag goes on (measured on the Front Panel). */
function followDragPointer(ev) {
  const canvas = document.querySelector(".lienzo")?.getBoundingClientRect();
  if (!canvas || !isDraggingOnCanvas()) return stopAutoscroll();
  const outside = { x: Scroll.distanceOutside(ev.clientX, canvas.left, canvas.right), y: Scroll.distanceOutside(ev.clientY, canvas.top, canvas.bottom) };
  if (!outside.x && !outside.y) return stopAutoscroll();
  const pointer = { clientX: ev.clientX, clientY: ev.clientY };
  if (autoscroll) return Object.assign(autoscroll, { outside, pointer });
  autoscroll = { outside, pointer, lastTime: performance.now(), frame: requestAnimationFrame(autoscrollFrame) };
}

function autoscrollFrame(now) {
  if (!autoscroll || !isDraggingOnCanvas()) return stopAutoscroll();
  const seconds = (now - autoscroll.lastTime) / MILLISECONDS_PER_SECOND;
  autoscroll.lastTime = now;
  const advance = (distance) => Math.sign(distance) * Scroll.autoscrollSpeed(Math.abs(distance)) * seconds;
  const { outside, pointer } = autoscroll;
  autoscroll.carried = { x: (autoscroll.carried?.x ?? 0) + advance(outside.x), y: (autoscroll.carried?.y ?? 0) + advance(outside.y) };
  // Whole pixels only; what is left over waits for the next frame.
  const whole = { x: Math.trunc(autoscroll.carried.x), y: Math.trunc(autoscroll.carried.y) };
  autoscroll.carried = { x: autoscroll.carried.x - whole.x, y: autoscroll.carried.y - whole.y };
  if (whole.x || whole.y) {
    scrollOrigin = { x: scrollOrigin.x + whole.x, y: scrollOrigin.y + whole.y };
    window.solder?.scrolled(scrollOrigin);
    // What is dragged stays under the pointer while the canvas moves under it.
    if (conPanel) pan = P.moverA(pan, ctx, punto(pointer));
    else dia = ED.moverA(dia, ctx, punto(pointer));
    pintar();
  }
  autoscroll.frame = requestAnimationFrame(autoscrollFrame);
}

function stopAutoscroll() {
  if (autoscroll) cancelAnimationFrame(autoscroll.frame);
  autoscroll = null;
}

// A bigger or smaller window sees more or less of the canvas: the bars are drawn again.
addEventListener("resize", drawScrollbars);
addEventListener(
  "mousedown",
  (ev) => {
    const bar = ev.button === 0 && ev.target.closest?.(".barra-desplazamiento");
    if (bar) pressBar(ev, bar);
  },
  { capture: true },
);
addEventListener(
  "mousemove",
  (ev) => {
    if (barPress?.thumbStart !== undefined) {
      ev.stopPropagation();
      return dragThumb(ev);
    }
    followDragPointer(ev);
  },
  { capture: true },
);
addEventListener(
  "mouseup",
  (ev) => {
    stopAutoscroll();
    if (!barPress) return;
    releaseBar();
    ev.stopPropagation();
  },
  { capture: true },
);

// The wheel over a menu taller than the window scrolls it (diagram-view.mjs `menuScroll`); over the canvas or its
// bars, it scrolls the canvas vertically, also with Shift (measured), and Ctrl with the wheel does nothing.
addEventListener(
  "wheel",
  (ev) => {
    // The list of an Edit Items dialog scrolls with the wheel; over the rest of the dialog the wheel does nothing.
    const openDialog = dialogoModal();
    if (openDialog) {
      ev.preventDefault();
      return ev.target.closest?.(".ficha-lista") ? aplicarEnDialogo(MD.wheelIntent(openDialog, ev.deltaY), openDialog) : undefined;
    }
    const list = ev.target.closest?.(".menu-contextual.desplazable");
    if (!list) {
      if (ev.ctrlKey || !ev.target.closest?.(".lienzo, .barra-desplazamiento")) return;
      ev.preventDefault();
      return scrollBy("y", Scroll.wheelScroll(ev));
    }
    ev.preventDefault();
    const scroll = (state) => ED.desplazarMenu(state, list.dataset.menu, ev.deltaY, Number(list.dataset.scrollMax));
    if (conDiagrama && dia.menu) dia = scroll(dia);
    else if (pan.menu) pan = scroll(pan);
    pintar();
  },
  { passive: false },
);

addEventListener("mousemove", (ev) => {
  if (debugUi.drag) return moveFloatingDrag(ev);
  mostrarTip(ev);
  if (conPanel) {
    // Pasar por una fila con submenú lo abre; por otra, lo cierra.
    const fila = pan.menu && ev.target.closest(".item-menu");
    if (fila) {
      const nuevo = ED.sobreMenu(pan, fila.dataset.row ?? fila.dataset.id, ED.menuRowHasSubmenu(pan, ctx, inv, fila.dataset.id));
      if (nuevo !== pan) {
        pan = nuevo;
        pintar();
      }
    }
    if (pan.accion) {
      pan = P.moverA(pan, ctx, punto(ev));
      pintar();
    }
    lastPointer = { clientX: ev.clientX, clientY: ev.clientY };
    showPanelCursor();
    return;
  }
  let nuevo = dia;
  const item = ev.target.closest(".item-menu");
  if (nuevo.menu && item) nuevo = ED.sobreMenu(nuevo, item.dataset.row ?? item.dataset.id, ED.menuRowHasSubmenu(nuevo, ctx, inv, item.dataset.id));
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
  // The Edit menu is greyed while a cluster is reordered.
  if (ev.target.closest(".menu.desactivado")) return;
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
    return runBarMenuRow(filaBarra.dataset.id, ancla(filaBarra));
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
      return cambiarActual(ED.orden(actual, id, ctx, inv));
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
  // La flecha de Run, hecha: ejecuta el OVI; rota, dice por qué no se puede.
  if (el.dataset.id === `${prefijo}.toolbar.run` && !esHueco(inv.resolver(el.dataset.id))) return ejecutarOVI();
  if (el.dataset.id === `${prefijo}.toolbar.abort-execution`) return abortar();
  if (el.dataset.id === "palette.functions.select-a-vi" && !esHueco(inv.resolver(el.dataset.id))) return seleccionarOVI();
  const donde = abreSubpaleta(el) ? V.anclaSubpaleta(el.getBoundingClientRect()) : el.classList.contains("menu") ? anclaMenu(el) : ancla(el);
  cambiar(E.clic(estado, inv, el.dataset.id, donde, nivelDe(el)));
});

addEventListener("contextmenu", (ev) => {
  ev.preventDefault();
  if (propiedades || dialogoModal()) return;
  // In Run mode LabVIEW gives another menu (the run-time one): captured only for the graphs.
  if (ejecutando) return runModeMenu(ev);
  // Reorder Controls In Cluster... answers only to presses (reports/2026-11-17-cluster-reorder.md §4).
  if (reorderOfWindow()) return;
  // The connector pane and the icon have menus of their own.
  const iconoOVI = ev.target.closest(".icono-vi");
  if (iconoOVI) return menuDelIcono(ev, iconoOVI);
  if (!ev.target.closest(".lienzo")) return;
  // On the panel the palette comes up over the background and an object's menu over any part of it
  // (its box, arrows, elements or fields too). A numeric indicator has no captured menu yet: nothing opens.
  if (conPanel) {
    if (pan.edicion) cambiarPanel(P.confirmar(pan));
    const sobrePanel = objetivoPanel(ev.target);
    if (PANEL_OBJECT_TARGETS.has(sobrePanel?.tipo)) {
      const raizPanel = sobrePanel.parte ? PART_MENUS[sobrePanel.parte] : P.menuDe(pan.g.nodos.find((k) => k.id === sobrePanel.id), sobrePanel.tipo === "elem");
      if (raizPanel) {
        estado = { ...estado, paleta: null, abierta: null };
        return cambiarPanel(ED.abrirMenuDelPanel(pan, raizPanel, sobrePanel.id, ev.clientX, ev.clientY));
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
  // An element of a Cluster Constant is no node of the graph: its menu is its own and the right-click selects it alone.
  const n = id && (dia.g.nodos.find((k) => k.id === id) ?? ClusterConstant.elementNodeAt(dia.g, id));
  // A name row of an Unbundle By Name has the menu of its output terminal; a row of a Property Node, its row's menu.
  const puerto = o?.tipo === "terminal" ? o.puerto : o?.fila !== undefined ? UN.portOfRow(o.fila) : o?.filaPropiedad !== undefined ? PN.portOfRow(o.filaPropiedad) : null;
  const raiz = n && D.menuDe(n, puerto, dia.g, o?.campo !== undefined, cat);
  if (raiz) {
    estado = { ...estado, paleta: null, abierta: null };
    const opened = ED.abrirMenu(ED.confirmar(dia, ctx), raiz, id, ev.clientX, ev.clientY, puerto, punto(ev));
    return cambiarDiagrama(ClusterConstant.isElementId(id) ? { ...opened, seleccion: [id] } : opened);
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
  // OVI Properties: Esc cancels (or closes what is open over it) and Enter accepts.
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
    // What is open over the dialog takes Escape first and the dialog stays, as in OVI Properties
    // above: otherwise closing the explanation of a greyed tab closed the whole dialog with it.
    if (ev.key === "Escape" && (estado.abierta || estado.menuBarra)) return cambiar(E.escape(estado));
    return aplicarEnDialogo(MD.keyIntent(conTeclaEnDialogo, ev), conTeclaEnDialogo);
  }
  // While a cluster is reordered every key goes to the field: digits and deletions; Escape and Enter do nothing (§4-5).
  if (reorderOfWindow()) {
    ev.preventDefault();
    const typed = { reorder: CR.typeInField(reorderOfWindow(), ev.key) };
    return conPanel ? cambiarPanel({ ...pan, ...typed }) : cambiarDiagrama({ ...dia, ...typed });
  }
  // Ctrl+Intro confirma lo escrito en el source de un control de error (labview-captures/errores/35.png).
  if (conPanel && pan.edicion?.campo === "source" && ctrl && ev.key === "Enter") {
    ev.preventDefault();
    return cambiarPanel(P.confirmar(pan));
  }
  // Numpad Enter and Ctrl+Enter end the editing of a label, owned or free, where Enter starts another line (measured,
  // DT-085, labview-captures/reports/2026-11-15-label-enter.md).
  if (Et.endsLabelEdit(ev) && (conDiagrama ? dia.edicion?.etiqueta : conPanel && pan.edicion?.etiqueta)) {
    ev.preventDefault();
    return conDiagrama ? cambiarDiagrama(ED.confirmar(dia, ctx)) : cambiarPanel(P.confirmar(pan));
  }
  // Ctrl+A while a text is being typed selects all of it (LabVIEW: click in the box, then Ctrl+A).
  if (ctrl && !ev.shiftKey && !ev.altKey && ev.key.toLowerCase() === "a" && (conDiagrama ? dia.edicion : conPanel && pan.edicion)) {
    ev.preventDefault();
    return conDiagrama ? cambiarDiagrama(ED.seleccionarTodoTexto(dia)) : cambiarPanel(P.seleccionarTodoTexto(pan));
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
      return ejecutarOVI();
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

// Docked (DT-101 §7), the window's menus and toolbar are the docked window's: it sends here what is chosen there.
docking = connectDockedPage({ layoutApi: window.solder?.layout, buildModel: dockedChromeModel, runMenuRow: (id) => runBarMenuRow(id, DOCKED_EXPLANATION_POINT), repaint: () => listo && pintar() });

// Everything above is declared: now the OVI is loaded and the window starts to talk to the other one.
window.solder?.portapapeles.alCambiar(recibirPortapapeles);
window.solder?.listaDeErrores.alCambiar(receiveShowWarnings);
receiveShowWarnings(await window.solder?.listaDeErrores.mostrarAvisos());
recibirPortapapeles(await window.solder?.portapapeles.leer());
if (oviInfo.text) await cargarTexto(oviInfo.text);
pintar();
avisar(grafo());
listo = true;
canal.postMessage({ pide: true });

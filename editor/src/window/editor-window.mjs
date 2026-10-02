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
// over a BroadcastChannel. So a control placed on the panel appears on the
// diagram, and a terminal deleted on the diagram disappears from the panel.

import * as D from "../block-diagram/diagram-view.mjs";
import * as ED from "../block-diagram/diagram-editing.mjs";
import * as E from "./window-state.mjs";
import * as G from "../common/glyphs.mjs";
import * as Gr from "../../../core/model/graph.mjs";
import * as H from "../block-diagram/undo-history.mjs";
import { cargarInventario, esHueco } from "../common/labview-inventory.mjs";
import { addressFromText } from "../common/array-grid.mjs";
import * as P from "../front-panel/front-panel.mjs";
import * as Q from "../../../core/model/qvi-format.mjs";
import { compilar } from "../../../core/compiler/compiler.mjs";
import * as V from "./window-view.mjs";

const nombre = new URLSearchParams(location.search).get("ventana") ?? "front-panel";
const prefijo = `window.${nombre}`;
document.title = V.TITULOS[nombre];

const [inv, cat] = await Promise.all([
  fetch("/inventario.json").then((r) => r.json()).then(cargarInventario),
  fetch("/blocks.json").then((r) => r.json()).then(Gr.cargarCatalogo),
]);
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
const ctx = D.contexto(cat, glifos, separador, medirMenu);

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

// ——— Las dos ventanas, un solo VI ———

const canal = new BroadcastChannel("solder-vi");
/** El último grafo que se mandó a la otra ventana o que llegó de ella. */
let publicado = dia.g;

/**
 * El grafo ha quedado quieto —sin nada a medias ni texto a medio escribir—:
 * el paso se guarda para deshacerlo y la otra ventana lo recibe.
 */
function quieto(g) {
  historial = H.registrar(historial, g);
  if (g === publicado) return;
  publicado = g;
  canal.postMessage({ g });
  avisar(g);
}

// ——— Save and open (core/model/qvi-format.mjs) ———
//
// The page only turns the VI into text and back; the disk, the system dialogs
// and the asterisk in the title belong to the main process
// (electron/main.mjs), which receives every change to know if anything is unsaved.

/** El VI ha cambiado: el proceso principal compara con lo guardado. */
const avisar = (g) => window.solder?.cambio(Q.aTexto(g, cat));

/** Lo que se está escribiendo se confirma antes de guardar, como con Enter Text. */
function confirmarEscritura() {
  if (conDiagrama && dia.edicion) cambiarDiagrama(ED.confirmar(dia, ctx));
  if (conPanel && pan.edicion) cambiarPanel(P.confirmar(pan));
}

/** File ▸ Save y Save As. */
async function guardarVI(como) {
  if (!window.solder) return;
  confirmarEscritura();
  await window.solder.guardar(Q.aTexto(grafo(), cat), como);
}

/** Un VI recién abierto: empieza sin historia y sin nada seleccionado. */
function cargar(g) {
  publicado = g;
  historial = H.nuevo(g);
  dia = { ...ED.inicial(), g };
  pan = P.inicial(g);
  pintar();
  avisar(g);
}

/** File ▸ Open: el VI se lee aquí y se manda a la otra ventana. */
async function abrirVI() {
  const r = await window.solder?.abrir();
  if (!r) return;
  let g;
  try {
    g = Q.leer(r.texto, cat);
  } catch (e) {
    return window.solder.error(e.message);
  }
  cargar(g);
  canal.postMessage({ g, nuevo: true });
}

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
  if (data.error) window.solder?.avisar("El VI se detuvo con un error.", data.error);
}

async function ejecutarVI() {
  // Run con el VI corriendo no hace nada, como en LabVIEW.
  if (ejecutando) return;
  confirmarEscritura();
  const g = grafo();
  const c = compilar(g, cat);
  if (c.errores) return window.solder?.avisar("El VI no se puede ejecutar.", c.errores.map((e) => e.motivo).join("\n"));
  if (!trabajador) {
    trabajador = new Worker(new URL("./run-worker.mjs", import.meta.url), { type: "module" });
    trabajador.onmessage = ({ data }) => alMensaje(data);
  }
  lanzado = true;
  canal.postMessage({ ejecutando: true });
  modoRun(true);
  trabajador.postMessage({ orden: "run", compilado: { bytes: c.bytes, controles: c.controles, indicadores: c.indicadores, clumps: c.clumps, planes: c.planes, automaticos: c.automaticos, disposicionError: c.disposicionError }, valores: valoresDeControles(g), separador });
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
const ORDENES_MENU = { save: () => guardarVI(false), "save-as": () => guardarVI(true), open: abrirVI, exit: () => window.solder?.salir() };

canal.onmessage = ({ data }) => {
  // Una ventana que acaba de abrirse pide el VI; la que lo tiene lo manda.
  if (data.pide) return canal.postMessage({ g: grafo() });
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
  publicado = data.g;
  historial = H.registrar(historial, data.g);
  if (conDiagrama) dia = ED.recibir(dia, data.g);
  else pan = P.recibir(pan, data.g);
  pintar();
};
canal.postMessage({ pide: true });

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
  const resueltos = Gr.tipos(grafo(), cat);
  const extra = { runRoto: !Gr.ejecutable(grafo(), cat, resueltos), ejecutando, dialogo: dialogoError };
  if (conDiagrama) {
    extra.lienzo = D.contenido(dia, ctx, resueltos);
    extra.encima = dia.menu ? D.menuContextual(inv, dia.menu, ED.marcados(dia), medirMenu, ED.variantes(dia)) : "";
    extra.editandoTexto = !!dia.edicion;
  } else {
    extra.lienzo = P.contenido(pan, ctx);
    extra.encima = pan.menu ? D.menuContextual(inv, pan.menu, ED.marcados(pan), medirMenu, ED.variantes(pan)) : "";
    extra.editandoTexto = !!pan.edicion;
  }
  // El menú de la barra que está abierto, bajo su título.
  if (estado.menuBarra) extra.encima = (extra.encima ?? "") + D.menuContextual(inv, { raiz: estado.menuBarra.id, x: estado.menuBarra.x, y: estado.menuBarra.y }, new Set(), medirMenu);
  document.body.innerHTML = V.ventana(inv, nombre, estado, extra);
  const ventana = document.querySelector(".ventana");
  ventana.classList.toggle("cableando", dia.accion?.tipo === "cablear");
  // Mientras se arrastra un control desde la paleta, el lienzo lleva un borde punteado.
  ventana.classList.toggle("colocando", pan.accion?.tipo === "colocar" && !!pan.accion.arrastrado);
  const tam = { width: innerWidth, height: innerHeight };
  for (const el of document.querySelectorAll(".paleta, .explicacion, .menu-contextual")) dentro(el, tam);
  if (tip.visible) ponerTip();
}

function cambiar(nuevo) {
  if (nuevo === estado) return;
  estado = nuevo;
  ocultarEmergente();
  pintar();
}

/**
 * Cambiar el diagrama. Cuando queda quieto —sin nada a medias ni texto a
 * medio escribir—, el paso se guarda para deshacerlo.
 */
function cambiarDiagrama(nuevo) {
  if (nuevo === dia) return;
  dia = nuevo;
  if (!dia.accion && !dia.edicion) quieto(dia.g);
  pintar();
}

/** Cambiar el panel. Como el diagrama: el paso se guarda cuando queda quieto. */
function cambiarPanel(nuevo) {
  if (nuevo === pan) return;
  pan = nuevo;
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
  const id = ev.detail >= 2 && nodoDe(sobreDiagrama);
  if (id && (D.CONSTANTES[dia.g.nodos.find((n) => n.id === id)?.tipo]?.editable || dia.g.nodos.find((n) => n.id === id)?.tipo === "expression-node")) return cambiarDiagrama(ED.editar(dia, ctx, id, sobreDiagrama.campo));
  cambiarDiagrama(ED.pulsar(dia, ctx, sobreDiagrama, punto(ev), ev.shiftKey));
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
  if (ev.detail >= 2 && sobre.tipo === "etiqueta") return cambiarPanel(P.editar(pan, sobre.id));
  // Doble clic en la casilla de un control: todo el valor seleccionado.
  if (ev.detail >= 2 && sobre.tipo === "casilla" && pan.edicion?.valor) return cambiarPanel(P.editarValor(pan, ctx, sobre.id, true));
  if (ev.detail >= 2 && sobre.tipo === "elem" && pan.edicion?.elem === sobre.k) return cambiarPanel(P.editarElemento(pan, ctx, sobre.id, sobre.k, true));
  if (ev.detail >= 2 && sobre.tipo === "campo" && pan.edicion?.campo === sobre.campo) return cambiarPanel(P.editarValor(pan, ctx, sobre.id, true, sobre.campo));
  cambiarPanel(P.pulsar(pan, ctx, sobre, punto(ev), ev.shiftKey));
}

addEventListener("mousemove", (ev) => {
  mostrarTip(ev);
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
  // Una fila del menú de la barra: lo hecho se hace; un hueco, se explica.
  const filaBarra = estado.menuBarra && ev.target.closest(".item-menu");
  if (filaBarra) {
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
    if (!esHueco(e)) return cambiarActual(ED.orden(actual, id, ctx));
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
  const donde = abreSubpaleta(el) ? V.anclaSubpaleta(el.getBoundingClientRect()) : el.classList.contains("menu") ? anclaMenu(el) : ancla(el);
  cambiar(E.clic(estado, inv, el.dataset.id, donde, nivelDe(el)));
});

addEventListener("contextmenu", (ev) => {
  ev.preventDefault();
  // En modo Run, LabVIEW da otro menú (el de ejecución), sin capturar todavía.
  if (ejecutando) return;
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
  // Ctrl+Intro confirma lo escrito en el source de un control de error (labview-captures/errores/35.png).
  if (conPanel && pan.edicion?.campo === "source" && ctrl && ev.key === "Enter") {
    ev.preventDefault();
    return cambiarPanel(P.confirmar(pan));
  }
  // File ▸ Save, Open y Exit, con los atajos de LabVIEW.
  if (ctrl && !ev.shiftKey && !ev.altKey) {
    const orden = { s: "save", o: "open", q: "exit" }[ev.key.toLowerCase()];
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
  if (!el || inerte(el) || ev.target.closest(".explicacion") || el.closest(".menu-contextual")) return;
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

pintar();
avisar(grafo());

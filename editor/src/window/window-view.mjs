// Las ventanas de un VI y sus paletas, calcadas de LabVIEW 2026Q3, como HTML.
//
// Qué se pinta, en qué orden y en qué estado sale del inventario (reglas 52 y
// 55); este módulo sólo decide la disposición, que es de spec/06-visual.md. Las
// posiciones se calculan aquí, con las medidas de las capturas, y no en el CSS:
// así un test puede comprobarlas sin navegador.
//
// Medidas: capturas a escala 150 %, divididas entre 1,5; la zona cliente empieza
// 2 px a la derecha y 38 px por debajo de la esquina de la captura.

import * as G from "../common/glyphs.mjs";
import { esHueco, nombreVeredicto, ultimo } from "../common/labview-inventory.mjs";
import { CODIGOS, explicar } from "../../../core/runtime/error-codes.mjs";

export const MEDIDAS = {
  altoMenus: 29 / 1.5, // filas 0–28 de la zona cliente
  altoSurco: 5 / 1.5, // filas 29–33
  altoBarra: 33 / 1.5, // filas 34–66
  altoBordeBarra: 3 / 1.5, // filas 67–69; el lienzo empieza en la 70
  altoEstado: 15.3, // filas 943–965
  anchoCanalon: 16, // la franja de la barra de desplazamiento: 24 px
  pasoRejilla: 12, // la rejilla del panel: cada 18 px, desde el borde
  margenBarra: 50.5, // el centro del glifo de Run cae en 93 px
  centroEnterText: 24 / 1.5, // la marca de Enter Text, en el hueco a la izquierda de Run
  anchoBoton: 23,
  anchoBotonDesplegable: 36.5,
  espacioSeparado: 4,
  anchoTextSettings: 146.7, // 399–619 px
  anchoBusqueda: 300, // 1340–1790 px
  antesDeBusqueda: 25.3, // entre el indicador de versión y la búsqueda
  entreDerecha: 1.5,
  margenDerecha: 1.2, // entre la ayuda y la zona de los iconos
  pasoIcono: 33.3,
  ladoIcono: 32.7,
  iconoArriba: 5.3,
  iconoDerecha: 0.7,
  anchoInstancia: 176, // bordes en las columnas 1 y 264
};
MEDIDAS.altoCabecera = MEDIDAS.altoMenus + MEDIDAS.altoSurco + MEDIDAS.altoBarra + MEDIDAS.altoBordeBarra;

/**
 * La paleta, de `paletas/functions-programming-desplegada.png`. Las columnas y
 * las filas se cuentan desde su borde exterior, que mide 1 px; las medidas
 * quedan desde dentro del borde.
 */
const DENTRO = (px) => (px - 1) / 1.5;
export const MEDIDAS_PALETA = {
  ancho: 318 / 1.5, // columnas 0–317, con los bordes
  altoTitulo: 33 / 1.5, // filas 1–33
  altoSeparador: 3 / 1.5, // filas 34–36
  altoFila: 21, // paso de las categorías: 31,5 px
  altoCabecera: 16, // la cabecera de una categoría desplegada es más baja
  margenTexto: 8, // la tinta de la primera letra, en la columna 13
  flechaX: DENTRO(301), // columnas 301–310
  flechaArriba: 2, // 3 px bajo el borde de la fila
  pasoIcono: 48, // 72 px en los dos ejes
  anchoCarpeta: 40, // columnas 12–71
  altoCarpeta: 40, // de la pestaña, en la fila 84, al pie de la caja, en la 143
  margenRejilla: DENTRO(12),
  sobreRejilla: (84 - 37) / 1.5 - 16, // de la cabecera desplegada a la pestaña
  bajoRejilla: 7, // del pie de la última caja al fondo gris: 10,5 px
  columnas: 4,
  altoFlechas: 18, // el centro de las flechas dobles, 13,5 px bajo la última fila
  altoEnlace: 31 / 1.5,
  altoPie: 6.5 / 1.5,
};

/**
 * Una subpaleta, de `paletas/functions-numeric.png`: una ventana aparte, con
 * borde, sombra y barra de título como la paleta, y una rejilla de iconos.
 * Columnas y filas desde su borde exterior, en la columna 296 y la fila 117.
 */
export const MEDIDAS_SUBPALETA = {
  borde: 1 / 1.5,
  altoTitulo: 36 / 1.5, // filas 118–153: 2 px más que la de la paleta
  altoSeparador: 3 / 1.5, // filas 154–156
  lado: 32, // la caja de un icono: 48 px
  paso: 48, // 72 px en los dos ejes
  margenIzquierdo: (311 - 297) / 1.5, // de dentro del borde a la primera caja
  margenDerecho: (749 - 719) / 1.5, // de la última caja a fuera del borde
  sobreRejilla: (194 - 157) / 1.5, // del separador a la primera caja
  bajoRejilla: (696 - 674) / 1.5, // de la última caja a fuera del borde
  subeCarpeta: 4 / 1.5, // una carpeta va 4 px por encima del centro de su celda
  nombreArriba: 4, // el nombre de lo que está bajo el ratón: su centro, 12 px bajo el separador
  /** De la esquina de una carpeta, sin abrir, a la de su subpaleta. */
  anclaX: (296 - 231) / 1.5, // la carpeta Numeric empieza en la columna 231
  anclaY: (117 - 87) / 1.5, // y en la fila 87
};

/**
 * Cómo reparte LabVIEW cada subpaleta en su rejilla. Es disposición: el
 * inventario da el orden y esto, las columnas y las celdas que se saltan.
 * `celdas` fija [fila, columna] de un elemento; los siguientes siguen desde él.
 */
const REJILLAS = {
  "palette.functions.programming.numeric": { columnas: 6, celdas: { "expression-node": [6, 5] } },
  "palette.controls.modern.numeric": { columnas: 4, celdas: {} },
  "palette.controls.modern.boolean": { columnas: 3, celdas: {} },
  "palette.functions.programming.numeric.conversion": { columnas: 4, celdas: {} },
  "palette.functions.programming.numeric.math-and-scientific-constants": { columnas: 4, celdas: {} },
  "palette.functions.programming.numeric.data-manipulation": { columnas: 4, celdas: {} },
  "palette.functions.programming.boolean": { columnas: 5, celdas: { "and-array-elements": [2, 0] } },
  "palette.functions.programming.comparison": { columnas: 3, celdas: {} },
  "palette.functions.programming.timing": { columnas: 4, celdas: {} },
  "palette.functions.programming.structures": { columnas: 4, celdas: {} },
  // String, de labview-captures/string/string-subpaleta.png: 5 columnas y 28 elementos.
  "palette.functions.programming.string": { columnas: 5, celdas: {} },
  // Number/String Conversion: 7 columnas; la segunda fila, cuatro funciones y Scan Value al final.
  "palette.functions.programming.string.number-string-conversion": { columnas: 7, celdas: { "scan-value": [1, 6] } },
  "palette.functions.programming.string.additional-string-functions": { columnas: 4, celdas: {} },
  "palette.functions.programming.string.path-array-string-conversion": { columnas: 4, celdas: {} },
  "palette.functions.programming.string.flatten-unflatten-string": { columnas: 2, celdas: {} },
  "palette.controls.modern.string-and-path": { columnas: 3, celdas: {} },
  // Array, de labview-captures/array/subpaleta-array-5-columnas.png: 5 columnas y 34 elementos; en la
  // última fila, Remove Duplicates y, dejando una celda libre, las tres carpetas.
  "palette.functions.programming.array": { columnas: 5, celdas: { unsorted: [6, 2] } },
  // Dialog & User Interface, de labview-captures/errores/59-paleta-dialog-ui.png: 4 columnas y 23 elementos.
  "palette.functions.programming.dialog-and-user-interface": { columnas: 4, celdas: {} },
  // Cluster, Class, & Variant, from labview-captures/cluster/pal_s.png: 5 columns; rows 1 and 3 end with a free cell,
  // and the last row holds only the Variant folder, in its fifth column.
  "palette.functions.programming.cluster-class-and-variant": { columnas: 5, celdas: { "cluster-constant": [1, 0], "lv-object-constant": [3, 0], variant: [4, 4] } },
  // Data Containers (Array, Matrix & Cluster), de errores/300-controls-data-containers.png: 2 columnas y 8 elementos.
  "palette.controls.modern.data-containers": { columnas: 2, celdas: {} },
  // Graph, from labview-captures/graphs/01-palette-graph-grid.png: 4 × 4; the last row has the folder Controls, a free cell, 3D Picture and 3D Graph.
  "palette.controls.modern.graph": { columnas: 4, celdas: { "3d-picture": [3, 2] } },
  // Its folder Controls, from 02-palette-graph-subfolder-controls.png: 4 + 3.
  "palette.controls.modern.graph.controls": { columnas: 4, celdas: {} },
};
const REJILLA_POR_DEFECTO = { columnas: 6, celdas: {} };

/** Elementos de la barra que LabVIEW alinea a la derecha. Es disposición. */
const A_LA_DERECHA = ["save-version", "search", "nigel", "show-context-help-window"];
/**
 * Elementos de la barra que desaparecen mientras el VI corre: los de editar.
 * Comprobado en LabVIEW 2026 Q3 (labview-captures/run/r1.png): quedan Run, Run
 * Continuously, Abort y Pause.
 */
const AL_EDITAR = ["text-settings", "align-objects", "distribute-objects", "resize-objects", "reorder", "clean-up-diagram"];
/** Elementos de la barra que sólo aparecen mientras se escribe, a la izquierda de Run. */
const AL_ESCRIBIR = ["enter-text"];
/** De la paleta: lo que va en su barra de título o en su pie. */
const EN_TITULO = ["thumbtack", "search"];
const EN_PIE = ["double-arrows", "change-visible-palettes"];
/** Filas que son órdenes y no llevan a una subpaleta: sin flecha. */
const ORDENES = ["select-a-vi", "select-a-control"];

export const TITULOS = {
  "front-panel": "Untitled 1 Front Panel",
  "block-diagram": "Untitled 1 Block Diagram",
};

const px = (n) => `${Number(n.toFixed(2))}px`;
const esc = (t) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const rotulo = (e) => e.muestra ?? e.etiqueta;
const clases = (inv, id, base) => `${base}${esHueco(inv.resolver(id) ?? { estado: "todo" }) ? " hueco" : ""}`;

/** Ancho de un elemento de la barra; el indicador de versión se ajusta a su texto. */
export function anchoDe(e) {
  const n = ultimo(e.id);
  if (n === "text-settings") return MEDIDAS.anchoTextSettings;
  if (n === "search") return MEDIDAS.anchoBusqueda;
  if (G.CON_DESPLEGABLE.has(n)) return MEDIDAS.anchoBotonDesplegable;
  if (G.BARRA[n]) return MEDIDAS.anchoBoton;
  return null;
}

/** Cuánto ocupa a la derecha la zona del connector pane y el icono. */
export const anchoZonaIconos = (ventana) =>
  (ventana === "front-panel" ? 2 : 1) * MEDIDAS.pasoIcono + MEDIDAS.iconoDerecha + 0.7;

/**
 * Dónde va cada elemento de la barra: los de la izquierda, por `left` desde el
 * margen; los de la derecha, por `right` desde la zona de los iconos.
 */
export function disposicionBarra(inv, ventana) {
  const elementos = inv.hijos(`window.${ventana}.toolbar`);
  const izquierda = elementos.filter((e) => !A_LA_DERECHA.includes(ultimo(e.id)) && !AL_ESCRIBIR.includes(ultimo(e.id)));
  const alEscribir = elementos.filter((e) => AL_ESCRIBIR.includes(ultimo(e.id)));
  const derecha = elementos.filter((e) => A_LA_DERECHA.includes(ultimo(e.id)));
  const sitios = new Map();
  let x = MEDIDAS.margenBarra;
  for (const e of izquierda) {
    if (e.separado) x += MEDIDAS.espacioSeparado;
    const ancho = anchoDe(e) ?? rotulo(e).length * 7 + 10;
    sitios.set(e.id, { left: x, ancho });
    x += ancho;
  }
  let r = MEDIDAS.margenDerecha;
  for (let i = derecha.length - 1; i >= 0; i--) {
    const e = derecha[i];
    const ancho = anchoDe(e);
    sitios.set(e.id, { right: r, ancho });
    if (i > 0) r += (ancho ?? 0) + (ultimo(derecha[i - 1].id) === "save-version" ? MEDIDAS.antesDeBusqueda : MEDIDAS.entreDerecha);
  }
  for (const e of alEscribir) sitios.set(e.id, { left: MEDIDAS.centroEnterText - MEDIDAS.anchoBoton / 2, ancho: MEDIDAS.anchoBoton, alEscribir: true });
  return { elementos: [...alEscribir, ...izquierda, ...derecha], sitios };
}

function elementoBarra(inv, e, sitio, extra) {
  const n = ultimo(e.id);
  if (sitio.alEscribir && !extra.editandoTexto) sitio = { ...sitio, oculto: true };
  if (extra.ejecutando && AL_EDITAR.includes(n)) sitio = { ...sitio, oculto: true };
  const pos = sitio.left !== undefined ? `left:${px(sitio.left)}` : `right:${px(sitio.right)}`;
  const ancho = sitio.ancho !== null ? `;width:${px(sitio.ancho)}` : "";
  const estilo = `style="${pos}${ancho}${sitio.oculto ? ";visibility:hidden" : ""}"`;
  const id = `data-id="${esc(e.id)}"`;
  if (n === "text-settings")
    return `<div class="${clases(inv, e.id, "caja-valor")}" ${id} ${estilo}><span class="valor">${esc(rotulo(e))}</span><span class="triangulo">${G.TRIANGULO}</span></div>`;
  if (n === "search")
    return `<div class="${clases(inv, e.id, "caja-busqueda")}" ${id} ${estilo}><span class="selector">${G.SELECTOR}</span><span class="valor">${esc(rotulo(e))}</span><span class="lupa">${G.LUPA}</span></div>`;
  if (n === "save-version") return `<div class="${clases(inv, e.id, "texto-barra")}" ${id} ${estilo}>${esc(rotulo(e))}</div>`;
  if (G.BARRA[n]) {
    // The debugging buttons change glyph, enabled state and tooltip with the state of the VI (debugging/debug-state.mjs).
    const state = extra.toolbar?.[n];
    const glifo = G.BARRA[state?.glyph] ?? (n === "run" && extra.ejecutando ? G.BARRA["run-en-marcha"] : n === "run" && extra.runRoto ? G.BARRA["run-roto"] : G.BARRA[n]);
    const triangulo = G.CON_DESPLEGABLE.has(n) ? `<span class="triangulo">${G.TRIANGULO}</span>` : "";
    // Abort sólo se enciende mientras el VI corre (run/barra-run.png).
    const apagado = (state ? !state.enabled : n === "abort-execution" && !extra.ejecutando) ? " desactivado" : "";
    const tip = state?.tooltip ? ` data-tip="${esc(state.tooltip)}"` : "";
    return `<div class="${clases(inv, e.id, `boton${triangulo ? " con-desplegable" : ""}${apagado}`)}" ${id}${tip} ${estilo}><span class="glifo">${glifo}</span>${triangulo}</div>`;
  }
  // Algo que el editor aún no sabe dibujar: su etiqueta, para que aparezca igual.
  return `<div class="${clases(inv, e.id, "texto-barra")}" ${id} ${estilo}>${esc(rotulo(e))}</div>`;
}

/**
 * Pinta una ventana entera. `extra`: `lienzo`, lo que va dentro del lienzo (el
 * diagrama); `encima`, lo que va sobre todo (un menú de clic derecho);
 * `runRoto`, si el VI no se puede ejecutar; `ejecutando`, si corre (modo Run),
 * `editandoTexto`, `conectorGlifo`, the connector pane drawn with its assigned cells,
 * `numeroVI`, the number on the VI's icon, and `propiedades`, the VI Properties dialog.
 */
export function ventana(inv, nombre, estado, extra = {}) {
  const { lienzo = "", encima = "" } = extra;
  const pre = `window.${nombre}`;
  const zona = anchoZonaIconos(nombre);
  const M = MEDIDAS;

  const menus = inv
    .hijos(`${pre}.menu`)
    // El texto va dos veces: el derecho, invisible, fija el ancho, para que la
    // cursiva de un hueco no desplace a los menús siguientes.
    .map((e) => `<div class="${clases(inv, e.id, `menu${estado.menuBarra?.id === e.id ? " abierto" : ""}`)}" data-id="${esc(e.id)}"><span class="medida">${esc(e.etiqueta)}</span><span class="texto">${esc(e.etiqueta)}</span></div>`)
    .join("");

  const { elementos, sitios } = disposicionBarra(inv, nombre);
  const barra = elementos.map((e) => elementoBarra(inv, e, sitios.get(e.id), extra)).join("");

  const iconos = [];
  let x = 1.3;
  if (nombre === "front-panel") {
    iconos.push(icono(inv, `${pre}.connector-pane`, x, extra.conectorGlifo ?? G.CONNECTOR_PANE));
    x += M.pasoIcono;
  }
  iconos.push(icono(inv, `${pre}.icon`, x, G.iconoVI(extra.numeroVI)));

  const instancia = inv.entrada(`${pre}.application-instance`);
  const estadoHTML = instancia
    ? `<div class="${clases(inv, instancia.id, "instancia")}" data-id="${esc(instancia.id)}" style="width:${px(M.anchoInstancia)}">${esc(rotulo(instancia))}</div>`
    : "";

  return `<div class="ventana ventana-${nombre}${extra.ejecutando ? " ejecutando" : ""}" data-id="${pre}">
  <div class="cabecera" style="height:${px(M.altoCabecera)}">
    <div class="menus" style="height:${px(M.altoMenus)};right:${px(zona)}">${menus}</div>
    <div class="surco" style="top:${px(M.altoMenus)};height:${px(M.altoSurco)};right:${px(zona)}"></div>
    <div class="barra" style="top:${px(M.altoMenus + M.altoSurco)};height:${px(M.altoBarra)};right:${px(zona)}">${barra}</div>
    <div class="borde-barra" style="top:${px(M.altoMenus + M.altoSurco + M.altoBarra)};height:${px(M.altoBordeBarra)}"></div>
    <div class="zona-iconos" style="width:${px(zona)};height:${px(M.altoMenus + M.altoSurco + M.altoBarra)}">${iconos.join("")}</div>
  </div>
  <div class="lienzo lienzo-${nombre}${extra.resaltando ? " resaltando" : ""}" data-id="${pre}.workspace" style="top:${px(M.altoCabecera)};bottom:${px(M.altoEstado)};right:${px(M.anchoCanalon)}">${lienzo}</div>
  <div class="canalon" style="top:${px(M.altoCabecera)};bottom:${px(M.altoEstado)};width:${px(M.anchoCanalon)}"></div>
  <div class="barra-estado" style="height:${px(M.altoEstado)}">${estadoHTML}</div>
  ${estado.paleta ? paleta(inv, estado.paleta) + subpaletas(inv, estado.paleta) : ""}
  ${extra.propiedades ?? ""}
  ${extra.flotantes ?? ""}
  ${encima}
  ${estado.abierta ? explicacionFlotante(inv, estado.abierta) : ""}
  ${extra.dialogo ? dialogoError(extra.dialogo) : ""}
</div>`;
}

function icono(inv, id, left, glifo) {
  return `<div class="${clases(inv, id, "icono-vi")}" data-id="${esc(id)}" style="left:${px(left)};top:${px(MEDIDAS.iconoArriba)};width:${px(MEDIDAS.ladoIcono)};height:${px(MEDIDAS.ladoIcono)}">${glifo}</div>`;
}

/** La paleta abierta. */
export function paleta(inv, estado) {
  const raiz = inv.entrada(estado.raiz);
  if (!raiz) return "";
  const P = MEDIDAS_PALETA;
  const hijo = (n) => inv.entrada(`${raiz.id}.${n}`);

  const chincheta = hijo("thumbtack");
  const busqueda = hijo("search");
  let html = `<div class="paleta" data-id="${esc(raiz.id)}" style="left:${px(estado.x)};top:${px(estado.y)};width:${px(P.ancho)}">`;
  html += `<div class="paleta-titulo" style="height:${px(P.altoTitulo)}">`;
  if (chincheta) html += `<div class="${clases(inv, chincheta.id, "chincheta")}" data-id="${esc(chincheta.id)}">${G.CHINCHETA}</div>`;
  // El nombre de la paleta es el título de una ventana: no se pinta como hueco.
  html += `<span class="paleta-nombre">${esc(raiz.etiqueta)}</span>`;
  if (busqueda)
    html += `<div class="${clases(inv, busqueda.id, "paleta-busqueda")}" data-id="${esc(busqueda.id)}"><span class="lupa">${G.LUPA_PALETA}</span><span class="valor">${esc(rotulo(busqueda))}</span></div>`;
  html += `</div><div class="paleta-separador" style="height:${px(P.altoSeparador)}"></div>`;

  for (const e of inv.hijos(raiz.id)) {
    const n = ultimo(e.id);
    if (EN_TITULO.includes(n) || EN_PIE.includes(n) || (e.oculto && !estado.verOcultas)) continue;
    const desplegada = estado.desplegadas.includes(e.id) && inv.tieneContenido(e.id);
    const flecha = ORDENES.includes(n) ? "" : `<span class="flecha" style="left:${px(P.flechaX)}">${G.FLECHA_CATEGORIA}</span>`;
    html += `<div class="${clases(inv, e.id, `fila${desplegada ? " desplegada" : ""}`)}" data-id="${esc(e.id)}" style="height:${px(desplegada ? P.altoCabecera : P.altoFila)}"><span class="fila-texto" style="left:${px(P.margenTexto)}">${esc(rotulo(e))}</span>${flecha}</div>`;
    if (desplegada) html += rejilla(inv, e.id, estado.cascada?.[0]?.id);
  }

  const flechas = hijo("double-arrows");
  if (flechas)
    html += `<div class="${clases(inv, flechas.id, "flechas-dobles")}" data-id="${esc(flechas.id)}" style="height:${px(P.altoFlechas)}">${G.flechasDobles(estado.verOcultas)}</div>`;
  const enlace = hijo("change-visible-palettes");
  if (enlace && (!enlace.oculto || estado.verOcultas))
    html += `<div class="${clases(inv, enlace.id, "paleta-enlace")}" data-id="${esc(enlace.id)}" style="height:${px(P.altoEnlace)}"><span class="valor">${esc(rotulo(enlace))}</span></div>`;
  html += `<div class="paleta-pie" style="height:${px(P.altoPie)}"></div>`;
  return `${html}</div>`;
}

/**
 * El glifo de una carpeta: las de Controls tienen los suyos, porque sus nombres
 * se repiten en Functions (Numeric, Boolean) con otro contenido.
 */
const glifoCarpeta = (id) => (id.startsWith("palette.controls.") ? G.CARPETAS_CONTROLES : G.SUBPALETAS)[ultimo(id)];

/** El glifo de un elemento de una subpaleta: una función o un control. */
const glifoIcono = (id) => (id.startsWith("palette.controls.") ? G.CONTROLES : G.FUNCIONES)[ultimo(id)];

/** Una carpeta de una rejilla; la abierta lleva el marco de LabVIEW. */
function carpeta(inv, e, left, top, abierta) {
  const glifo = glifoCarpeta(e.id) ?? "";
  const P = MEDIDAS_PALETA;
  const marco = abierta ? `<div class="marco"></div>` : "";
  return `<div class="${clases(inv, e.id, `carpeta${abierta ? " abierta" : ""}`)}" data-id="${esc(e.id)}" style="left:${px(left)};top:${px(top)};width:${px(P.anchoCarpeta)};height:${px(P.altoCarpeta)}">${marco}<div class="pestana"></div><div class="lomo"></div><div class="caja-carpeta">${glifo}</div></div>`;
}

function rejilla(inv, categoria, abierta) {
  const P = MEDIDAS_PALETA;
  const hijos = inv.hijos(categoria).filter((e) => !e.oculto);
  const filas = Math.ceil(hijos.length / P.columnas);
  const alto = P.sobreRejilla + (filas - 1) * P.pasoIcono + P.altoCarpeta + P.bajoRejilla;
  const carpetas = hijos
    .map((e, i) => {
      const [f, c] = [Math.floor(i / P.columnas), i % P.columnas];
      return carpeta(inv, e, P.margenRejilla + c * P.pasoIcono, P.sobreRejilla + f * P.pasoIcono, e.id === abierta);
    })
    .join("");
  return `<div class="rejilla" style="height:${px(alto)}">${carpetas}</div>`;
}

/** Dónde abre su subpaleta una carpeta cuya esquina, sin abrir, está en `r`. */
export const anclaSubpaleta = (r) => ({ x: r.left + MEDIDAS_SUBPALETA.anclaX, y: r.top + MEDIDAS_SUBPALETA.anclaY });

/**
 * How LabVIEW keeps a palette on the screen (labview-captures/reports/2026-10-15-palette-edges.md). Solder's screen is the
 * VI window's page, since its palettes live in the page.
 */
export const PALETTE_EDGES = {
  /** A palette or subpalette never ends lower than this above the bottom of the room (B1, B2: 1025 for 1040). */
  bottomMargin: 15,
  /** The palette's top sits this far above the click (B1). */
  aboveClick: 2,
  /** A palette flipped above the click ends this far below it (B1). */
  flippedBelowClick: 41,
  /**
   * The furthest a palette is pushed up to fit before it flips above the click instead: 71 px still pushes and 86 px
   * flips (B1). Unverified between the two.
   */
  maxPushUp: 78,
  /** A palette that does not fit right of the click ends this far left of it (B3). */
  leftOfClick: 2,
};

/** Where the palette opened by a click at `click` goes, given its size and the room it has. */
export function placePalette(click, size, room) {
  const E = PALETTE_EDGES;
  const x = click.x + size.width <= room.width ? click.x : click.x - E.leftOfClick - size.width;
  const top = click.y - E.aboveClick;
  const lowest = room.height - E.bottomMargin;
  let y = top;
  if (top + size.height > lowest) {
    const pushedUp = lowest - size.height;
    y = top - pushedUp <= E.maxPushUp ? pushedUp : click.y + E.flippedBelowClick - size.height;
  }
  return { x: Math.max(0, x), y: Math.max(0, y) };
}

/**
 * Where a subpalette goes, opened from a folder whose left edge is `folderLeft`, `anchor` being where it opens when
 * it fits: pushed up when it would end too low (B2), and left of its folder when it would leave the room on the right
 * (B3: its right edge about 16 px left of the mouse on the folder, so at the folder's left edge within a few px).
 */
export function placeSubpalette(anchor, folderLeft, size, room) {
  const x = anchor.x + size.width <= room.width ? anchor.x : folderLeft - size.width;
  const lowest = room.height - PALETTE_EDGES.bottomMargin;
  const y = anchor.y + size.height <= lowest ? anchor.y : lowest - size.height;
  return { x: Math.max(0, x), y: Math.max(0, y) };
}

/** Dónde cae cada elemento de una subpaleta: fila y columna de su celda. */
export function celdasSubpaleta(inv, id) {
  const { columnas, celdas } = REJILLAS[id] ?? REJILLA_POR_DEFECTO;
  const elementos = inv.hijos(id).filter((e) => !EN_TITULO.includes(ultimo(e.id)) && !e.oculto);
  const sitios = [];
  let i = 0;
  for (const e of elementos) {
    const fija = celdas[ultimo(e.id)];
    if (fija) i = fija[0] * columnas + fija[1];
    sitios.push({ e, fila: Math.floor(i / columnas), columna: i % columnas });
    i++;
  }
  return { columnas, sitios };
}

/** El tamaño exterior de una subpaleta, con sus bordes. */
export function tamanoSubpaleta(inv, id) {
  const S = MEDIDAS_SUBPALETA;
  const { columnas, sitios } = celdasSubpaleta(inv, id);
  const filas = Math.max(1, ...sitios.map((s) => s.fila + 1));
  return {
    ancho: S.borde + S.margenIzquierdo + (columnas - 1) * S.paso + S.lado + S.margenDerecho,
    alto: S.borde + S.altoTitulo + S.altoSeparador + S.sobreRejilla + (filas - 1) * S.paso + S.lado + S.bajoRejilla,
  };
}

/** Las subpaletas abiertas en cascada al lado de la paleta. */
export function subpaletas(inv, estado) {
  return (estado.cascada ?? [])
    .map((c, i) => {
      const e = inv.entrada(c.id);
      if (!e) return "";
      const S = MEDIDAS_SUBPALETA;
      const { ancho, alto } = tamanoSubpaleta(inv, c.id);
      const chincheta = inv.entrada(`${c.id}.thumbtack`);
      let html = `<div class="paleta subpaleta" data-id="${esc(c.id)}" data-nivel="${i + 1}" style="left:${px(c.x)};top:${px(c.y)};width:${px(ancho)};height:${px(alto)}">`;
      html += `<div class="paleta-titulo" style="height:${px(S.altoTitulo)}">`;
      if (chincheta) html += `<div class="${clases(inv, chincheta.id, "chincheta")}" data-id="${esc(chincheta.id)}">${G.CHINCHETA}</div>`;
      html += `<span class="paleta-nombre">${esc(e.etiqueta)}</span></div>`;
      html += `<div class="paleta-separador" style="height:${px(S.altoSeparador)}"></div>`;
      html += `<div class="rejilla-subpaleta">`;
      const abierta = estado.cascada[i + 1]?.id;
      // El nombre de lo que está bajo el ratón, centrado bajo el título: el
      // hueco sobre la rejilla es para él (numeric-nombre-al-pasar.png).
      const sobre = estado.sobre && inv.entrada(estado.sobre);
      if (sobre && estado.sobre.startsWith(`${c.id}.`) && !estado.sobre.slice(c.id.length + 1).includes(".")) {
        html += `<div class="nombre-sobre" style="top:${px(S.nombreArriba)}">${esc(sobre.etiqueta)}</div>`;
      }
      for (const { e: hijo, fila, columna } of celdasSubpaleta(inv, c.id).sitios) {
        const cx = S.margenIzquierdo + columna * S.paso + S.lado / 2;
        const cy = S.sobreRejilla + fila * S.paso + S.lado / 2;
        if (glifoCarpeta(hijo.id)) {
          const P = MEDIDAS_PALETA;
          html += carpeta(inv, hijo, cx - P.anchoCarpeta / 2, cy - P.altoCarpeta / 2 - S.subeCarpeta, hijo.id === abierta || hijo.id === estado.sobre);
        } else {
          html += `<div class="${clases(inv, hijo.id, "icono-funcion")}" data-id="${esc(hijo.id)}" style="left:${px(cx - S.lado / 2)};top:${px(cy - S.lado / 2)};width:${px(S.lado)};height:${px(S.lado)}">${hijo.id === estado.sobre ? `<div class="marco marco-funcion"></div>` : ""}${glifoIcono(hijo.id) ?? ""}</div>`;
        }
      }
      return `${html}</div></div>`;
    })
    .join("");
}

/** What a hole says about itself (rule 54). */
export function explicacion(inv, e) {
  const { labview, solder } = inv.explicacion(e);
  return `<div class="explicacion-cabeza"><strong>${esc(e.etiqueta)}</strong> <em>${esc(nombreVeredicto(e.estado))}</em></div>${
    labview ? `<p>In ${esc(inv.referencia)}: ${esc(labview)}</p>` : ""
  }<p>In Solder: ${esc(solder)}</p><code>${esc(e.id)}</code>`;
}

function explicacionFlotante(inv, abierta) {
  const e = inv.resolver(abierta.id);
  if (!e) return "";
  return `<div class="explicacion" data-explicacion="${esc(abierta.id)}" style="left:${px(abierta.x)};top:${px(abierta.y)}">${explicacion(inv, e)}</div>`;
}

/**
 * The two error dialogs (DT-043), modal over the window that launched the VI. `d`:
 * `{ id, pregunta, status, code, source }`.
 *
 * - `error-automatico` (automatic error handling, labview-captures/errores/44b-dialogo-x3.png):
 *   the red ✘ icon, the first line in bold, "Possible reason(s):" in bold, the text, the
 *   source detail, "Search ni.com for error" (greyed out: not yet) and the buttons Continue, the
 *   default one, and Stop.
 * - `dialogo-error` (Simple Error Handler): for a defined code it looks like the automatic one but has
 *   only Continue (labview-captures/reports/2026-10-15-seh-85.md); for an undefined code there is no
 *   icon and no bold, the text runs together, and the buttons are OK and "Why not found?" (greyed
 *   out: not yet; 102b-dialogo-x2.png).
 * The text is written by core/runtime/error-codes.mjs.
 */
export function dialogoError(d) {
  const t = explicar(d);
  const definido = d.code in CODIGOS;
  const razones = t.razones.map((r) => `<p>${esc(r)}</p>`).join(`<p class="separador-razones">${"=".repeat(26)}</p>`);
  const detalle = t.detalle ? `<p>${esc(t.detalle)}</p>` : "";
  const barra = `<div class="dialogo-barra"><span class="dialogo-icono-app">${G.ICONO_APP}</span><span class="dialogo-cerrar" aria-hidden="true">✕</span></div>`;
  let cuerpo;
  let pie;
  const automatic = d.pregunta === "error-automatico";
  if (automatic || definido) {
    cuerpo = `<div class="dialogo-cabecera"><span class="dialogo-icono-error">${G.ICONO_ERROR}</span><strong>${esc(t.cabecera)}</strong></div><div class="dialogo-texto">${t.titulo ? `<p><strong>${esc(t.titulo)}</strong></p>` : ""}${razones}${detalle}</div>`;
    // Continue answers the automatic dialog's question; for Simple Error Handler it is its OK.
    const continueButton = `<button class="boton-dialogo defecto" data-boton="${automatic ? "continuar" : "ok"}" autofocus>Continue</button>`;
    const stopButton = automatic ? `<button class="boton-dialogo" data-boton="parar">Stop</button>` : "";
    pie = `<span class="dialogo-enlace hueco">Search ni.com for error</span><span class="dialogo-botones">${continueButton}${stopButton}</span>`;
  } else {
    cuerpo = `<div class="dialogo-texto"><p>${esc(t.cabecera)}</p>${razones}${detalle}</div>`;
    pie = `<span class="dialogo-botones centrado"><button class="boton-dialogo defecto" data-boton="ok" autofocus>OK</button>${definido ? "" : `<button class="boton-dialogo hueco" disabled>Why not found?</button>`}</span>`;
  }
  return `<div class="modal-error" data-dialogo="${esc(d.id)}"><div class="dialogo-error ${d.pregunta}">${barra}<div class="dialogo-cuerpo">${cuerpo}</div><div class="dialogo-pie">${pie}</div></div></div>`;
}

/** Los ids del inventario pintados en un HTML, en orden. Para los tests. */
export const idsPintados = (html) => [...html.matchAll(/data-id="([^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, "&"));

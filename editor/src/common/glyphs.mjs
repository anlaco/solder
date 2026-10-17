// Glifos propios de las barras y de las paletas, en SVG.
//
// Se calca dónde está cada botón y qué hace, no su dibujo (DT-035 §1): los
// iconos de LabVIEW son de NI. Cada glifo se dibuja en una rejilla de 16 × 16.

import { cellRect } from "../../../core/model/connector.mjs";
import { CONNECTOR_PATTERNS } from "../../../core/model/connector-patterns.mjs";
import { CONSTANTES_MATEMATICAS } from "../../../core/model/math-constants.mjs";

const INK = "var(--ink)";
const PAPER = "var(--paper)";
const NODE_FILL = "var(--node-fill)"; // the yellow of the primitives
const NODE_BORDER = "var(--node-border)";
const TERMINAL_FILL = "var(--structure-terminal-fill)";
const TIME_NODE_FILL = "var(--time-node-fill)";
const TIME_NODE_BORDER = "var(--time-node-border)";
const RUN_ARROW_FILL = "var(--run-arrow-fill)";
const WHILE_FRAME = "var(--while-frame)";
const STRUCTURE_LINE = "var(--structure-line)"; // the thin lines of the For and Case frames
// SVG presentation attributes do not take var(), so the radius goes in a style. A theme may round the corners of a node, never change the space it takes. In glyph units (viewBox pixels).
const NODE_CORNER_RADIUS = "var(--node-corner-radius)";
const TUNNEL_BORDER = "var(--tunnel-border)";
const TERMINAL_DIRECTION_ARROW = "var(--terminal-direction-arrow)";
const CONNECTOR_SELECTED_CELL = "var(--connector-selected-cell)";
const f = (n) => Number(n.toFixed(2));

const svg = (cuerpo, caja = "0 0 16 16") =>
  `<svg viewBox="${caja}" aria-hidden="true" focusable="false">${cuerpo}</svg>`;

const linea = (x0, y0, x1, y1, grosor = 1.2, color = INK) =>
  `<line x1="${x0}" y1="${y0}" x2="${x1}" y2="${y1}" stroke="${color}" stroke-width="${grosor}"/>`;

const isNodeBody = (relleno) => relleno === NODE_FILL || relleno === TIME_NODE_FILL;

const caja = (x0, y0, x1, y1, relleno = "none", grosor = 1.2, color = INK) =>
  `<rect x="${x0}" y="${y0}" width="${f(x1 - x0)}" height="${f(y1 - y0)}"${isNodeBody(relleno) ? ` style="rx:${NODE_CORNER_RADIUS}"` : ""} fill="${relleno}" stroke="${color}" stroke-width="${grosor}"/>`;

const lleno = (x0, y0, x1, y1, color, radio = 0) =>
  `<rect x="${x0}" y="${y0}" width="${f(x1 - x0)}" height="${f(y1 - y0)}" rx="${radio}" fill="${color}"/>`;

const poligono = (puntos, relleno, trazo = "none", grosor = 1.2) =>
  `<polygon points="${puntos.map(([x, y]) => `${f(x)},${f(y)}`).join(" ")}" fill="${relleno}" stroke="${trazo}" stroke-width="${grosor}" stroke-linejoin="round"/>`;

const texto = (x, y, t, tam, color = INK, peso = 400) =>
  `<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="central" font-size="${tam}" font-weight="${peso}" fill="${color}">${t}</text>`;

/** Punta de flecha rellena en (x, y), apuntando hacia (dx, dy). */
function flecha(x, y, dx, dy, largo) {
  const n = Math.hypot(dx, dy);
  const [ux, uy] = [dx / n, dy / n];
  const [bx, by] = [x - ux * largo * 0.6, y - uy * largo * 0.6];
  return poligono(
    [
      [x + ux * largo * 0.4, y + uy * largo * 0.4],
      [bx - uy * largo * 0.45, by + ux * largo * 0.45],
      [bx + uy * largo * 0.45, by - ux * largo * 0.45],
    ],
    INK,
  );
}

/** Arco de circunferencia, con punta de flecha al final. */
function arco(cx, cy, r, desde, hasta, grosor) {
  const [x0, y0] = [cx + r * Math.cos(desde), cy + r * Math.sin(desde)];
  const [x1, y1] = [cx + r * Math.cos(hasta), cy + r * Math.sin(hasta)];
  const barrido = hasta > desde ? 1 : 0;
  const grande = Math.abs(hasta - desde) > Math.PI ? 1 : 0;
  const s = barrido ? 1 : -1;
  return (
    `<path d="M${f(x0)} ${f(y0)} A${r} ${r} 0 ${grande} ${barrido} ${f(x1)} ${f(y1)}" fill="none" stroke="${INK}" stroke-width="${grosor}"/>` +
    flecha(x1, y1, -Math.sin(hasta) * s, Math.cos(hasta) * s, r * 0.55)
  );
}

/** Estrella de cuatro puntas, como dos rombos cruzados. */
function destello(cx, cy, r, color) {
  const d = r * 0.28;
  return (
    poligono([[cx, cy - r], [cx + d, cy], [cx, cy + r], [cx - d, cy]], color) +
    poligono([[cx - r, cy], [cx, cy - d], [cx + r, cy], [cx, cy + d]], color)
  );
}

/** El triangulito que LabVIEW pone abajo a la derecha de los botones con menú al mantener pulsado. */
const menuAlMantener = poligono([[16, 16], [12.5, 16], [16, 12.5]], INK);

const flechaRun = poligono(
  [[2, 5.5], [8.5, 5.5], [8.5, 2], [15, 8], [8.5, 14], [8.5, 10.5], [2, 10.5]],
  RUN_ARROW_FILL,
  INK,
  1.4,
);

const cajaPaso = (x0, y0, x1, y1) => caja(x0, y0, x1, y1, PAPER, 1.4);

/** Glifos de la barra de un VI, por el último segmento de su id. */
export const BARRA = {
  run: svg(flechaRun),
  "run-continuously": svg(
    arco(8, 8, 6.3, Math.PI * 1.08, Math.PI * 1.82, 1.7) +
      arco(8, 8, 6.3, Math.PI * 0.08, Math.PI * 0.82, 1.7) +
      `<g transform="translate(4 4) scale(0.5)">${flechaRun}</g>`,
  ),
  // Un semáforo rojo: anillo negro, anillo blanco y un rojo que oscurece hacia
  // abajo, medido a 1:1 en labview-captures/run/barra-run.png. Parado, se ve
  // apagado (clase `desactivado`).
  "abort-execution": svg(
    `<defs><linearGradient id="rojo-abort" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e08585"/><stop offset="0.5" stop-color="#b33636"/><stop offset="1" stop-color="#912a29"/></linearGradient></defs>` +
      `<circle cx="8" cy="8" r="7" fill="${PAPER}" stroke="${INK}" stroke-width="1"/><circle cx="8" cy="8" r="5.5" fill="url(#rojo-abort)"/>`,
  ),
  pause: svg(lleno(4, 3, 6.8, 13, INK, 0.5) + lleno(9.5, 3, 12.3, 13, INK, 0.5)),
  "highlight-execution": svg(
    `<circle cx="8" cy="6.3" r="4.6" fill="#fff4aa" stroke="${INK}" stroke-width="1.2"/>` +
      linea(5.6, 11.6, 10.4, 11.6) +
      linea(6.2, 13.4, 9.8, 13.4) +
      menuAlMantener,
  ),
  "retain-wire-values": svg(
    linea(1, 12, 15, 12, 1.6, "#e17d14") +
      `<circle cx="5" cy="5" r="2.6" fill="none" stroke="${INK}" stroke-width="1.2"/>` +
      linea(5, 7.6, 5, 12) +
      caja(9, 2.5, 14.5, 7.5) +
      menuAlMantener,
  ),
  "step-into": svg(
    cajaPaso(9.5, 8, 15, 14) +
      `<polyline points="1.5,3 1.5,11 7,11" fill="none" stroke="${INK}" stroke-width="1.7"/>` +
      flecha(9, 11, 1, 0, 4),
  ),
  "step-over": svg(cajaPaso(5, 9, 11, 15) + arco(8, 9, 5.5, Math.PI, Math.PI * 2 - 0.35, 1.7)),
  "step-out": svg(
    cajaPaso(1, 8, 7, 14) +
      `<polyline points="7,11 12.5,11 12.5,5" fill="none" stroke="${INK}" stroke-width="1.7"/>` +
      flecha(12.5, 2.5, 0, -1, 4),
  ),
  "align-objects": svg(
    linea(2.5, 1.5, 2.5, 14.5) +
      lleno(3.5, 3, 12.5, 5.4, "#466ebe") +
      lleno(3.5, 7, 9.5, 9.4, "#466ebe") +
      lleno(3.5, 11, 14.5, 13.4, "#466ebe"),
  ),
  "distribute-objects": svg(
    lleno(1.5, 5, 4.5, 11, "#466ebe") +
      lleno(6.5, 5, 9.5, 11, "#466ebe") +
      lleno(11.5, 5, 14.5, 11, "#466ebe") +
      linea(1, 13.5, 15, 13.5) +
      linea(3, 12.2, 3, 14.8) +
      linea(8, 12.2, 8, 14.8) +
      linea(13, 12.2, 13, 14.8),
  ),
  "resize-objects": svg(
    caja(1.5, 1.5, 7.5, 7.5) + caja(5.5, 5.5, 14.5, 14.5, "#c8d7f0") + flecha(13, 13, 1, 1, 4),
  ),
  reorder: svg(caja(6, 1.5, 14.5, 10, "#aabee1") + caja(1.5, 6, 10, 14.5, "#faeca0")),
  "clean-up-diagram": svg(
    linea(13.5, 1.5, 8, 8.5, 1.6, "#966432") +
      poligono([[6.5, 7.5], [10, 10], [7.5, 14.5], [2, 12.5]], "#ebbe3c", INK) +
      destello(13, 11.5, 2.4, "#78aae6"),
  ),
  // El asistente de IA: glifo propio, porque el de Nigel es la marca de NI.
  nigel: svg(destello(7, 8.5, 6, "#3c826e") + destello(13, 3.5, 2.6, "#3c826e")),
  "show-context-help-window": svg(
    `<text x="8" y="8.6" text-anchor="middle" dominant-baseline="central" font-size="17" font-weight="700" fill="#ffde28" stroke="${INK}" stroke-width="1.3" paint-order="stroke">?</text>`,
  ),
};

/** Qué botones de la barra despliegan un menú: llevan triángulo. */
export const CON_DESPLEGABLE = new Set(["align-objects", "distribute-objects", "resize-objects", "reorder"]);

export const LUPA = svg(
  `<circle cx="6.5" cy="6.5" r="4.3" fill="none" stroke="${INK}" stroke-width="1.4"/>` + linea(9.6, 9.6, 14.5, 14.5, 2.2),
);

/** La lupa de la búsqueda de la paleta, más gruesa: 24 × 24 px a 150 %. */
export const LUPA_PALETA = svg(
  `<circle cx="6.3" cy="5.8" r="4.7" fill="none" stroke="${INK}" stroke-width="1.9"/>` + linea(9.7, 9.5, 14.6, 14.6, 2.6),
);

export const TRIANGULO = svg(poligono([[0, 0], [6, 0], [3, 3.6]], INK), "0 0 6 3.6");
export const SELECTOR = svg(poligono([[0, 0], [3.4, 2.5], [0, 5]], INK), "0 0 3.4 5");
/** La flecha de una categoría de la paleta: 10 × 18 px a 150 % (302–310 px). */
export const FLECHA_CATEGORIA = svg(poligono([[0.4, 0.4], [6.4, 6], [0.4, 11.6]], INK, "none", 0), "0 0 6.67 12");

/** Las flechas dobles del pie de la paleta: dos galones de 10 × 6 px a 150 %. */
export function flechasDobles(haciaArriba) {
  const galon = (y) =>
    haciaArriba
      ? `<polyline points="0.33,${f(y + 4)} 3.67,${y} 7,${f(y + 4)}" fill="none" stroke="#3e3e3e" stroke-width="0.95"/>`
      : `<polyline points="0.33,${y} 3.67,${f(y + 4)} 7,${y}" fill="none" stroke="#3e3e3e" stroke-width="0.95"/>`;
  return svg(galon(0.5) + galon(3.5), "0 0 7.33 8");
}

/**
 * The connector pane with the pattern 4-2-2-4 (spec/06-visual.md §3.2), 32 × 32
 * px with its grid lines every 8 px. `terminals`: `{ cell, dir, color }` for
 * each assigned cell: an input fills its cell with the colour of its type; an
 * output is a black cell with a smaller square of that colour
 * (labview-captures/subvi/connector-assigned-zoom8x.png). `selectedCell` is the
 * cell waiting for a control or an indicator to be clicked: how LabVIEW marks
 * it was not captured, so it is drawn with a blue frame of our own.
 */
export function conectorPane(terminals = [], selectedCell = null) {
  let c = lleno(0, 0, 32, 32, PAPER);
  for (const { cell, dir, color } of terminals) {
    const { x, y, width, height } = cellRect(cell);
    c += dir === "in" ? lleno(x, y, x + width, y + height, color) : lleno(x, y, x + width, y + height, INK) + lleno(x + 2, y + 2, x + width - 2, y + height - 2, color);
  }
  c += caja(0.5, 0.5, 31.5, 31.5, "none", 1);
  for (let i = 1; i < 4; i++) c += linea(i * 8, 0, i * 8, 32, 1);
  [4, 2, 2, 4].forEach((filas, i) => {
    for (let k = 1; k < filas; k++) c += linea(i * 8, (32 * k) / filas, i * 8 + 8, (32 * k) / filas, 1);
  });
  if (selectedCell !== null) {
    const { x, y, width, height } = cellRect(selectedCell);
    c += caja(x + 1, y + 1, x + width - 1, y + height - 1, "none", 1.5, CONNECTOR_SELECTED_CELL);
  }
  return svg(c, "0 0 32 32");
}

export const CONNECTOR_PANE = conectorPane();

/**
 * The default icon of a VI: a 32 × 32 drawing with a 1 px black border and, at
 * the bottom right, the number of the untitled VI it was born as, if known
 * (labview-captures/subvi/new-vi-front-panel.png). The drawing is ours: the
 * one in LabVIEW is NI's.
 */
export function iconoVI(numero) {
  const puntos = [];
  for (let i = 0; i <= 20; i++) {
    const t = i / 20;
    puntos.push(`${f(6 + t * 20)},${f(11 - Math.sin(t * Math.PI * 3) * 3.6)}`);
  }
  return svg(
    lleno(0, 0, 32, 32, PAPER) +
      caja(0.5, 0.5, 31.5, 31.5, "none", 1) +
      lleno(4, 4, 28, 18, "#1e2d3c", 1) +
      `<polyline points="${puntos.join(" ")}" fill="none" stroke="#6edc78" stroke-width="1.3"/>` +
      (numero === undefined ? "" : `<text x="28" y="29" text-anchor="end" font-size="10" fill="${INK}">${numero}</text>`),
    "0 0 32 32",
  );
}

/** The icon of a subVI whose file cannot be found: the same frame, dashed and with a question mark. */
export const ICONO_VI_FALTA = svg(
  lleno(0, 0, 32, 32, PAPER) +
    `<rect x="0.5" y="0.5" width="31" height="31" fill="none" stroke="${INK}" stroke-width="1" stroke-dasharray="3 2"/>` +
    `<text x="16" y="17" text-anchor="middle" dominant-baseline="central" font-size="20" fill="${INK}">?</text>`,
  "0 0 32 32",
);

export const ICONO_VI = iconoVI(1);

export const CHINCHETA = svg(
  linea(1, 8, 5, 8) + caja(5, 5.5, 11, 10.5) + linea(11, 3.5, 11, 12.5, 1.6) + lleno(11.5, 5, 14.5, 11, "#969696", 1),
);

// Subpaletas de Programming.
export const SUBPALETAS = {
  structures: svg(
    `<rect x="1.5" y="1.5" width="13" height="13" rx="2" fill="none" stroke="#5a5a5a" stroke-width="2.2"/>` +
      lleno(4.5, 8, 7.5, 11, "#3c5ac8") +
      lleno(9, 8, 12, 11, "#46a050") +
      arco(12.5, 12.5, 2.2, -Math.PI * 0.5, Math.PI * 0.9, 1),
  ),
  array: svg(
    caja(1.5, 2.5, 14.5, 13.5, "none", 1.4, "#c86e1e") +
      linea(8, 2.5, 8, 13.5, 1, "#c86e1e") +
      linea(1.5, 8, 14.5, 8, 1, "#c86e1e") +
      texto(4.8, 5.3, "1", 5) + texto(11.2, 5.3, "2", 5) + texto(4.8, 10.7, "3", 5) + texto(11.2, 10.7, "4", 5),
  ),
  "cluster-class-and-variant": svg(
    caja(1, 1.5, 10.5, 10.5, "none", 1.4, "#8c5a28") +
      lleno(2.5, 3, 6, 6, "#dc3c32") +
      lleno(6.8, 3, 9.2, 9, "#2850be") +
      lleno(2.5, 7, 6, 9, "#46a050") +
      `<rect x="9.5" y="8.5" width="5.5" height="6" rx="1" fill="#3c6edc" stroke="#1e3c8c" stroke-width="0.8"/>`,
  ),
  numeric: svg(
    caja(1, 1, 15, 6.5, "none", 1, "#2850be") +
      texto(8, 3.9, "123", 5.2, "#2850be") +
      poligono([[5, 8], [14, 11.5], [5, 15]], "#faeca0", INK) +
      texto(8, 11.6, "+", 5),
  ),
  boolean: svg(
    lleno(1, 1, 7.5, 7.5, "#28963c") + texto(4.25, 4.35, "T", 5.5, PAPER) +
      caja(8.5, 8.5, 15, 15, "none", 1, "#28963c") + texto(11.75, 11.85, "F", 5.5, "#28963c"),
  ),
  string: svg(
    caja(1, 2, 15, 8.5, "none", 1.3, "#dc46c8") + texto(8, 5.35, "abc", 5.5, "#b428a0") + texto(8, 12.5, "a A", 5),
  ),
  comparison: svg(
    poligono([[3, 1], [13, 4.25], [3, 7.5]], "#faeca0", INK) +
      poligono([[3, 8.5], [13, 11.75], [3, 15]], "#faeca0", INK) +
      texto(6.5, 4.4, "&gt;", 4.5) + texto(6.5, 11.9, "=", 4.5),
  ),
  waveform: (() => {
    let c = `<rect x="0.5" y="2" width="15" height="12" rx="1" fill="#f5f5f5" stroke="${INK}" stroke-width="0.8"/>`;
    [[0, "#d22828"], [2, "#28963c"], [4, "#2850be"]].forEach(([fase, color]) => {
      const puntos = [];
      for (let i = 0; i <= 24; i++) {
        const t = i / 24;
        puntos.push(`${f(2 + t * 12)},${f(8 - Math.sin(t * Math.PI * 4 + fase) * 3.4)}`);
      }
      c += `<polyline points="${puntos.join(" ")}" fill="none" stroke="${color}" stroke-width="0.8"/>`;
    });
    return svg(c);
  })(),
  collection: svg(
    texto(3, 8, "{", 11) + texto(13, 8, "}", 11) +
      [[6.2, 5.5], [9.8, 5.5], [6.2, 10.5], [9.8, 10.5]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.3" fill="#2850be"/>`).join(""),
  ),
  "file-io": svg(lleno(1.5, 1.5, 14.5, 14.5, "#2846aa", 1) + lleno(4.5, 1.5, 11.5, 6, "#c8cdd7") + lleno(3.5, 8.5, 12.5, 14.5, PAPER)),
  timing: svg(
    `<circle cx="8" cy="8.6" r="6.5" fill="${PAPER}" stroke="${INK}" stroke-width="1.4"/>` +
      linea(8, 8.6, 8, 4, 1.2) + linea(8, 8.6, 11, 10, 1.2) + lleno(7, 0.5, 9, 2, INK),
  ),
  "dialog-and-user-interface": svg(
    caja(1, 1.5, 15, 14, PAPER) + lleno(1, 1.5, 15, 4, "#2850be") + caja(8.5, 9.5, 13.5, 12.5) + texto(11, 11, "OK", 3),
  ),
  synchronization: svg(
    lleno(4.5, 0.5, 11.5, 15.5, "#3c3c3c", 2) +
      [[3.2, "#dc3228"], [8, "#f0be1e"], [12.8, "#3caa46"]].map(([y, c]) => `<circle cx="8" cy="${y}" r="1.9" fill="${c}"/>`).join(""),
  ),
  "graphics-and-sound": svg(
    `<circle cx="5" cy="12.5" r="2.2" fill="${INK}"/><circle cx="12" cy="11" r="2.2" fill="${INK}"/>` +
      linea(7, 12.5, 7, 3, 1.3) + linea(14, 11, 14, 1.5, 1.3) + linea(7, 3, 14, 1.5, 2),
  ),
  "application-control": (() => {
    const puntos = [];
    for (let i = 0; i < 16; i++) {
      const a = (Math.PI * 2 * i) / 16;
      const r = i % 2 === 0 ? 7 : 5.2;
      puntos.push([8 + r * Math.cos(a), 8 + r * Math.sin(a)]);
    }
    return svg(poligono(puntos, "none", "#5a5a5a", 1.3) + `<circle cx="8" cy="8" r="2.2" fill="#5a5a5a"/>`);
  })(),
  "report-generation": svg(
    poligono([[2.5, 0.5], [10.5, 0.5], [13.5, 3.5], [13.5, 15.5], [2.5, 15.5]], PAPER, INK) +
      [5, 7.5, 10, 12.5].map((y) => linea(4.5, y, 11.5, y, 0.8, "#6e6e6e")).join(""),
  ),
};

// Subpaletas de Numeric.
Object.assign(SUBPALETAS, {
  conversion: svg(
    poligono([[1.5, 2], [12.5, 2], [14.5, 4.5], [12.5, 7], [1.5, 7]], NODE_FILL, INK, 0.9) +
      texto(7.8, 4.6, "I32", 4.4, INK, 700) +
      poligono([[3.5, 9], [13, 9], [15, 11.5], [13, 14], [3.5, 14]], NODE_FILL, INK, 0.9) +
      texto(9.2, 11.6, "DBL", 4.4, INK, 700),
  ),
  "data-manipulation": svg(
    caja(1.5, 4.5, 14.5, 11.5, PAPER, 0.9) +
      linea(8, 4.5, 8, 11.5, 0.9) +
      texto(4.8, 8.1, "16", 3.6) + texto(11.2, 8.1, "16", 3.6) +
      `<polyline points="4,3.5 4,2 12,2 12,3.5" fill="none" stroke="${INK}" stroke-width="0.7"/>` +
      `<polyline points="4,12.5 4,14 12,14 12,12.5" fill="none" stroke="${INK}" stroke-width="0.7"/>`,
  ),
  complex: svg(caja(2.5, 3, 13.5, 13, NODE_FILL, 1) + texto(8, 8.1, "x+iy", 3.8)),
  scaling: svg(
    caja(1, 2, 15, 14, PAPER, 0.9) + linea(1, 8, 15, 8, 0.9) + texto(8, 5.1, "mx+b", 4.2) +
      `<path d="M2.5 11 q1.2 -2 2.4 0 t2.4 0" fill="none" stroke="${INK}" stroke-width="0.7"/>` +
      flecha(9.3, 11, 1, 0, 1.6) +
      `<path d="M10.5 12.5 l1 -3 l1 3 l1 -3 l1 3" fill="none" stroke="${INK}" stroke-width="0.7"/>`,
  ),
  "fixed-point": svg(
    caja(2, 2.5, 14, 13.5, "#faeca0", 0.9, "#6e6e6e") +
      texto(8, 6.3, "FXP", 4.6, "#2850be", 700) +
      caja(3.5, 9.5, 12.5, 12, PAPER, 0.6) + lleno(7.4, 10.2, 8.6, 11.3, INK),
  ),
  "math-and-scientific-constants": svg(
    caja(1.5, 1.5, 8, 8, "#faeca0", 1.2) + texto(4.75, 4.9, "π", 5, INK, 700) +
      caja(8, 8, 14.5, 14.5, "#faeca0", 1.2) + texto(11.25, 11.1, "e", 5, INK, 700),
  ),
});

// Funciones de las paletas. Cada glifo ocupa la caja de un icono, 32 × 32 px
// CSS, pero se dibuja en una rejilla de 48 × 48: la de los píxeles de la
// captura a 150 %, para copiar sus coordenadas tal cual.
const AZUL = "#0000ff"; // las constantes enteras
const NARANJA = "#ff6633"; // las de coma flotante
const svg48 = (cuerpo) => svg(cuerpo, "0 0 48 48");
/** Texto de un icono. El negrito de LabVIEW es más grueso que el de las fuentes: se engruesa con un trazo. */
const texto48 = (x, y, t, tam, color = INK, peso = 700) =>
  `<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="central" font-family="Arial, 'Liberation Sans', sans-serif" font-size="${tam}" font-weight="${peso}" fill="${color}"${
    peso >= 700 ? ` stroke="${color}" stroke-width="0.8"` : ""
  }>${t}</text>`;

/** El triángulo de una primitiva, con la base a la izquierda y la punta en la salida. */
function triangulo(x0, y0, x1, y1, simbolo) {
  const ym = (y0 + y1) / 2;
  return svg48(
    poligono([[x0, y0], [x1, ym], [x0, y1]], NODE_FILL, NODE_BORDER, 1.5) +
      linea(x0 + 1.6, y0 + 2.6, x0 + 1.6, y1 - 2.6, 1.3, "#85856c") +
      simbolo,
  );
}
const prim = (simbolo) => triangulo(8.75, 8.75, 40, 40.25, simbolo);
const sim = (t, tam = 12, x = 18.5) => texto48(x, 24.8, t, tam);

/** Una constante: caja con el borde del color de su tipo. */
const constante = (x0, y0, x1, y1, color, relleno, t, colorTexto = INK, tam = 13.5) =>
  svg48(caja(x0, y0, x1, y1, relleno, 3, color) + texto48((x0 + x1) / 2, (y0 + y1) / 2 + 0.3, t, tam, colorTexto, 500));

/** Un dado visto en perspectiva: cara frontal, techo y lateral. */
function dado(x, y, l, relleno, trazo, puntos) {
  const d = l * 0.35;
  return (
    poligono([[x, y], [x + d, y - d], [x + l + d, y - d], [x + l, y]], relleno, trazo, 1.2) +
    poligono([[x + l, y], [x + l + d, y - d], [x + l + d, y + l - d], [x + l, y + l]], relleno, trazo, 1.2) +
    poligono([[x, y], [x + l, y], [x + l, y + l], [x, y + l]], relleno, trazo, 1.2) +
    puntos.map(([px, py]) => `<circle cx="${f(x + px * l)}" cy="${f(y + py * l)}" r="${f(l * 0.1)}" fill="${INK}"/>`).join("")
  );
}

export const FUNCIONES = {
  add: prim(linea(14, 24.5, 22.5, 24.5, 2.6) + linea(18.25, 20.25, 18.25, 28.75, 2.6)),
  subtract: prim(linea(14, 24.5, 22.5, 24.5, 2)),
  multiply: prim(linea(15, 21.25, 21.5, 27.75, 2.4) + linea(21.5, 21.25, 15, 27.75, 2.4)),
  divide: prim(
    linea(14, 24.5, 22.5, 24.5, 1.5) +
      `<circle cx="18.25" cy="20.5" r="1.3" fill="${INK}"/><circle cx="18.25" cy="28.5" r="1.3" fill="${INK}"/>`,
  ),
  "quotient-and-remainder": svg48(
    caja(7.75, 6.75, 39.25, 39.25, NODE_FILL, 1.5, NODE_BORDER) + texto48(13.5, 23.5, "÷", 15) + texto48(33, 14.5, "R", 11) + texto48(30, 32.5, "IQ", 11),
  ),
  increment: prim(sim("+1", 12.5, 18)),
  decrement: prim(sim("−1", 12.5, 18)),
  "add-array-elements": triangulo(5.75, 5.75, 41.5, 43.25, texto48(16.5, 25.3, "Σ", 24)),
  "multiply-array-elements": triangulo(5.75, 5.75, 41.5, 43.25, texto48(16.5, 25.3, "Π", 24)),
  "compound-arithmetic": svg48(
    caja(2.75, -0.25, 42.25, 47.25, NODE_FILL, 1.5, NODE_BORDER) +
      linea(24, -0.25, 24, 47.25, 1.2, NODE_BORDER) +
      [11.5, 23.5, 35.5].map((y) => linea(2.75, y, 24, y, 1.2, NODE_BORDER)).join("") +
      texto48(33, 5.5, "+", 10, INK, 400) + texto48(33, 17, "×", 10, INK, 400) +
      texto48(33, 29.5, "^", 10, INK, 400) + texto48(33, 39.5, "v", 9, INK, 400) +
      [[0.5, 5], [0.5, 39], [46, 24.5]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.9" fill="${NODE_FILL}" stroke="${NODE_BORDER}" stroke-width="1"/>`).join(""),
  ),
  "absolute-value": prim(lleno(13.5, 18, 16, 31, INK) + lleno(19, 18, 21.5, 31, INK)),
  "round-to-nearest": prim(
    `<polyline points="16.5,18 13.5,18 13.5,31 16.5,31" fill="none" stroke="${INK}" stroke-width="2.4"/>` +
      `<polyline points="20.5,18 23.5,18 23.5,31 20.5,31" fill="none" stroke="${INK}" stroke-width="2.4"/>`,
  ),
  "round-toward-negative-infinity": prim(
    `<polyline points="13.5,18 13.5,31 16.5,31" fill="none" stroke="${INK}" stroke-width="2.4"/>` +
      `<polyline points="23.5,18 23.5,31 20.5,31" fill="none" stroke="${INK}" stroke-width="2.4"/>`,
  ),
  "round-toward-positive-infinity": prim(
    `<polyline points="16.5,18 13.5,18 13.5,31" fill="none" stroke="${INK}" stroke-width="2.4"/>` +
      `<polyline points="20.5,18 23.5,18 23.5,31" fill="none" stroke="${INK}" stroke-width="2.4"/>`,
  ),
  "scale-by-power-of-2": prim(texto48(18.5, 26, "x2", 10) + texto48(26.5, 19.5, "n", 7, INK, 400)),
  "square-root": prim(`<polyline points="12,26 14,25 16.5,31 19.5,18 25,18" fill="none" stroke="${INK}" stroke-width="2"/>`),
  square: prim(texto48(16.5, 26.5, "x", 12) + texto48(23.5, 19, "2", 8.5)),
  negate: prim(texto48(19.5, 25, "(-x)", 10.5, INK, 400)),
  reciprocal: prim(texto48(14.5, 19.5, "1", 9) + linea(12.5, 31, 22.5, 17, 1.5) + texto48(20.5, 29.5, "x", 11)),
  sign: prim(texto48(16, 17.5, "1", 9) + texto48(22, 25.5, "0", 11) + texto48(14.5, 32, "-1", 9)),
  "numeric-constant": constante(5.5, 13.5, 40.5, 32.5, AZUL, PAPER, "123"),
  "enum-constant": svg48(
    caja(0.5, 13.5, 46.5, 32.5, PAPER, 3, AZUL) +
      poligono([[5, 23], [8, 20.5], [8, 25.5]], AZUL) + poligono([[11.5, 23], [8.5, 20.5], [8.5, 25.5]], AZUL) +
      texto48(28.5, 23.3, "Enum", 10.5, AZUL),
  ),
  "ring-constant": constante(6.5, 13.5, 40.5, 32.5, AZUL, PAPER, "Ring", INK, 12),
  "random-number-0-1": svg48(
    dado(22, 12, 13, NODE_FILL, NODE_BORDER, [[0.25, 0.3], [0.75, 0.7]]) + dado(12.5, 22, 14, NODE_FILL, NODE_BORDER, [[0.25, 0.25], [0.5, 0.5], [0.75, 0.75]]),
  ),
  "random-number-range": svg48(
    caja(0, -0.25, 47.5, 47, PAPER, 2, "#2a2a2a") +
      dado(9, 13, 18, "#444", "#2a2a2a", []) +
      [[14, 20], [21, 26], [30, 16], [33, 26]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.4" fill="#808080"/>`).join("") +
      linea(27, 36.5, 27, 44, 1.2, "#2a2a2a") + linea(44, 36.5, 44, 44, 1.2, "#2a2a2a") +
      linea(29.5, 40.3, 41.5, 40.3, 1.2, "#2a2a2a") + flecha(29, 40.3, -1, 0, 3) + flecha(42, 40.3, 1, 0, 3),
  ),
  "dbl-numeric-constant": constante(5.5, 13.5, 40.5, 32.5, NARANJA, PAPER, "1.23"),
  "positive-infinity": constante(8.5, 12.5, 38.5, 33.5, NARANJA, NODE_FILL, "+∞", NARANJA, 14),
  "negative-infinity": constante(8.5, 12.5, 38.5, 33.5, NARANJA, NODE_FILL, "-∞", NARANJA, 14),
  "machine-epsilon": constante(11.5, 12.5, 37.5, 35.5, NARANJA, NODE_FILL, "ε", NARANJA, 14),
  "not-a-number-constant": constante(5.5, 13.5, 40.5, 32.5, NARANJA, PAPER, "NaN", INK, 12.5),
  "range-limits-for-type": svg48(
    caja(0, 0, 47.5, 22.5, "#ffcc99", 1.5, "#2b221a") +
      linea(8, 3, 8, 12, 1.4) + flecha(8, 13.5, 0, 1, 4.5) + linea(38.5, 3, 38.5, 12, 1.4) + flecha(38.5, 13.5, 0, 1, 4.5) +
      linea(5, 17.5, 42, 17.5, 1, "#80664c") +
      [5, 11, 17, 23, 29, 35, 41].map((x) => linea(x, 17.5, x, 19.5, 1, "#80664c")).join(""),
  ),
  "expression-node": svg48(
    caja(0, 15.75, 47.5, 31, NODE_FILL, 1.5, NODE_BORDER) + linea(5, 15.75, 5, 31, 1.2, NODE_BORDER) + linea(42.5, 15.75, 42.5, 31, 1.2, NODE_BORDER) +
      texto48(23.75, 23.6, "EXPR", 11, NODE_BORDER, 500),
  ),
};

/**
 * La tinta de cada glifo de función en su rejilla de 48 × 48: [x0, y0, x1, y1],
 * medida en paletas/functions-numeric.png. En el diagrama, el nodo ocupa esa
 * caja: es lo que se pulsa y de donde salen los terminales.
 */
const PRIMITIVA = [8, 8, 41, 41];
export const CAJAS = {
  add: PRIMITIVA,
  subtract: PRIMITIVA,
  multiply: PRIMITIVA,
  divide: PRIMITIVA,
  "quotient-and-remainder": [7, 6, 41, 41],
  increment: PRIMITIVA,
  decrement: PRIMITIVA,
  "add-array-elements": [5, 5, 43, 44],
  "multiply-array-elements": [5, 5, 43, 44],
  "compound-arithmetic": [-1, -1, 49, 48],
  "absolute-value": PRIMITIVA,
  "round-to-nearest": PRIMITIVA,
  "round-toward-negative-infinity": PRIMITIVA,
  "round-toward-positive-infinity": PRIMITIVA,
  "scale-by-power-of-2": PRIMITIVA,
  "square-root": PRIMITIVA,
  square: PRIMITIVA,
  negate: PRIMITIVA,
  reciprocal: PRIMITIVA,
  sign: PRIMITIVA,
  "numeric-constant": [4, 12, 43, 35],
  "enum-constant": [-1, 12, 49, 35],
  "ring-constant": [5, 12, 43, 35],
  "random-number-0-1": [11, 6, 41, 39],
  "random-number-range": [-1, -1, 49, 48],
  "dbl-numeric-constant": [4, 12, 43, 35],
  "positive-infinity": [7, 11, 41, 36],
  "negative-infinity": [7, 11, 41, 36],
  "machine-epsilon": [10, 11, 40, 38],
  "not-a-number-constant": [4, 12, 43, 35],
  "range-limits-for-type": [-1, -1, 49, 24],
  "expression-node": [-1, 15, 49, 32],
};

/**
 * La flecha de Run rota: el VI no se puede ejecutar. Dos trozos de la flecha,
 * gris oscuro, separados por una grieta, como en numeric-editar-constante.png.
 */
BARRA["run-roto"] = svg(
  poligono([[1.5, 5.5], [6.5, 5.5], [8.2, 8.3], [6.5, 10.5], [1.5, 10.5]], "#5a5a5a", INK, 1.1) +
    poligono([[9, 2.2], [15, 8], [9, 13.8], [9.6, 10.6], [7.8, 8.3], [9.6, 5.8]], "#5a5a5a", INK, 1.1),
);

/**
 * La flecha de Run mientras el VI corre: rellena de negro y con rayas detrás,
 * medida a 1:1 en labview-captures/run/barra-run.png. El dibujo es propio.
 */
BARRA["run-en-marcha"] = svg(
  poligono([[5, 6], [9, 6], [9, 2], [15.5, 8.5], [9, 15], [9, 11], [5, 11]], INK, INK, 1) +
    linea(1.5, 6, 1.5, 11, 1) + linea(3.5, 6, 3.5, 11, 1) + linea(5.5, 2, 5.5, 5, 1) + linea(7.5, 2, 7.5, 5, 1) + linea(5.5, 12, 5.5, 15, 1) + linea(7.5, 12, 7.5, 15, 1),
);

// ——— The debugging buttons in their other states (labview-captures/debugging/REPORT.md §1, §2, §4 and §6) ———
// The drawings are our own; what is measured is which state changes: the lit bulb with rays, the P of
// Retain Wire Values filled yellow, the red bars of a Pause that became Continue, and the yellow squares of
// the step buttons while the VI is stopped.

const STEP_SQUARE_YELLOW = "#ffe94d";
const STEP_SQUARE_EDGE = "#96960b";

BARRA["highlight-execution-on"] = svg(
  [0, 45, 90, 135, 180, 225, 270, 315]
    .map((degrees) => {
      const radians = (degrees * Math.PI) / 180;
      return linea(f(8 + 6.4 * Math.cos(radians)), f(6.3 + 6.4 * Math.sin(radians)), f(8 + 7.6 * Math.cos(radians)), f(6.3 + 7.6 * Math.sin(radians)), 0.9, "#e08a1e");
    })
    .join("") +
    `<circle cx="8" cy="6.3" r="4.4" fill="#f3d545" stroke="${INK}" stroke-width="1.2"/>` +
    linea(5.6, 11.6, 10.4, 11.6) +
    linea(6.2, 13.4, 9.8, 13.4) +
    menuAlMantener,
);
BARRA["retain-wire-values-on"] = svg(
  linea(1, 12, 15, 12, 1.6, "#e17d14") +
    `<circle cx="5" cy="5" r="2.9" fill="#ffff00" stroke="${INK}" stroke-width="1.2"/>` +
    texto(5, 5.3, "P", 4.2, INK, 700) +
    linea(5, 7.9, 5, 12) +
    caja(9, 2.5, 14.5, 7.5, PAPER) +
    menuAlMantener,
);
BARRA["pause-continue"] = svg(lleno(4, 3, 6.8, 13, "#dd0000", 0.5) + lleno(9.5, 3, 12.3, 13, "#dd0000", 0.5));
BARRA["step-into-enabled"] = svg(
  caja(9.5, 8, 15, 14, STEP_SQUARE_YELLOW, 1.2, STEP_SQUARE_EDGE) +
    `<polyline points="1.5,3 1.5,11 7,11" fill="none" stroke="${INK}" stroke-width="1.7"/>` +
    flecha(9, 11, 1, 0, 4),
);
BARRA["step-over-enabled"] = svg(caja(5, 9, 11, 15, STEP_SQUARE_YELLOW, 1.2, STEP_SQUARE_EDGE) + arco(8, 9, 5.5, Math.PI, Math.PI * 2 - 0.35, 1.7));
BARRA["step-out-enabled"] = svg(
  caja(1, 8, 7, 14, STEP_SQUARE_YELLOW, 1.2, STEP_SQUARE_EDGE) +
    `<polyline points="7,11 12.5,11 12.5,5" fill="none" stroke="${INK}" stroke-width="1.7"/>` +
    flecha(12.5, 2.5, 0, -1, 4),
);

/** The Debug Window's own buttons (its toolbar, REPORT.md §3), drawn anew. */
export const DEBUG_WINDOW_ICONS = {
  "remove-selected": svg(linea(3, 3, 13, 13, 1.4, "#cc1111") + linea(13, 3, 3, 13, 1.4, "#cc1111")),
  "enable-disable": svg(`<circle cx="5.5" cy="9" r="3.3" fill="#cc1111"/><circle cx="10.5" cy="6.5" r="3.3" fill="#e65555"/>`),
  "project-environment-settings": svg(`<ellipse cx="8" cy="9" rx="3.2" ry="4.2" fill="#6a8f3a" stroke="${INK}" stroke-width="1"/>` + linea(5, 5, 3, 2.5) + linea(11, 5, 13, 2.5) + linea(4.8, 9, 2, 9) + linea(11.2, 9, 14, 9)),
  help: svg(texto(8, 8.5, "?", 13, "#2a5db0", 700)),
  "debug-options": svg(`<circle cx="7" cy="8" r="3.3" fill="none" stroke="${INK}" stroke-width="1.6"/>` + [0, 60, 120, 180, 240, 300].map((degrees) => { const r = (degrees * Math.PI) / 180; return linea(f(7 + 3.4 * Math.cos(r)), f(8 + 3.4 * Math.sin(r)), f(7 + 5.2 * Math.cos(r)), f(8 + 5.2 * Math.sin(r)), 1.6); }).join("") + poligono([[12, 7], [15.5, 7], [13.75, 9.4]], INK)),
  "probe-options": svg(`<path d="M2 11 A6 6 0 0 1 14 11" fill="none" stroke="${INK}" stroke-width="1.4"/>` + linea(8, 11, 11.5, 6, 1.4) + poligono([[12, 11.5], [15.5, 11.5], [13.75, 14]], INK)),
  probe: `<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><rect x="2" y="2" width="12" height="12" fill="var(--probe-background)" stroke="#555" stroke-width="1"/></svg>`,
  breakpoint: `<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><circle cx="8" cy="8" r="6" fill="#cc0000"/></svg>`,
  "error-mark": `<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M3.5 3.5 L12.5 12.5 M12.5 3.5 L3.5 12.5" stroke="#cc1111" stroke-width="2.6" stroke-linecap="round"/></svg>`,
};

/** List Warnings: a yellow triangle with a black "!", 14 px wide (REPORT.md §5: body #f3cc0a, edge #b69405). Drawn anew. */
BARRA["list-warnings"] = svg(`<path d="M8 2.2 L14.6 13.6 H1.4 Z" fill="#f3cc0a" stroke="#b69405" stroke-width="1" stroke-linejoin="round"/>` + `<rect x="7.25" y="5.6" width="1.5" height="4.6" fill="#000"/><rect x="7.25" y="11.1" width="1.5" height="1.5" fill="#000"/>`);

/** Enter Text: la marca que confirma lo que se escribe en el diagrama. */
BARRA["enter-text"] = svg(`<polyline points="3,8.6 6.3,12.4 13.2,3.6" fill="none" stroke="${INK}" stroke-width="2.1" stroke-linejoin="miter"/>`);

const cursor = (cuerpo, lado = 24) =>
  `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${lado}" height="${lado}" viewBox="0 0 ${lado} ${lado}" shape-rendering="crispEdges">${cuerpo}</svg>`)}`;

/**
 * Los cursores de la herramienta automática de LabVIEW, dibujados de nuevo a
 * partir del vídeo: la cruz fina sobre el fondo, con su marca arriba a la
 * derecha, y la bobina de cablear sobre un terminal, con la punta del cable
 * abajo a la izquierda, que es el punto activo. `punto` es ese punto, en px.
 */
export const CURSORES = {
  cruz: {
    url: cursor(
      `<path d="M11.5 3v17M3 11.5h17" stroke="#fff" stroke-width="3"/><path d="M11.5 3v17M3 11.5h17" stroke="#000" stroke-width="1"/>` +
        `<rect x="15" y="2" width="2" height="2" fill="#000"/><rect x="14" y="4" width="1" height="1" fill="#000"/><rect x="17" y="4" width="1" height="1" fill="#000"/><rect x="15" y="5" width="2" height="1" fill="#000"/>`,
    ),
    punto: [11, 11],
  },
  bobina: {
    url: cursor(
      `<g transform="rotate(-45 12 12)">` +
        `<rect x="6" y="7" width="13" height="10" fill="${PAPER}" stroke="#000" stroke-width="1"/>` +
        [7, 9, 11, 13, 15, 17].map((x) => [8, 10, 12, 14, 16].map((y) => ((x + y) % 4 === 3 ? `<rect x="${x}" y="${y}" width="1" height="1" fill="#000"/>` : "")).join("")).join("") +
        `<rect x="4" y="5" width="2" height="14" fill="#000"/><rect x="19" y="5" width="2" height="14" fill="#000"/>` +
        `</g><path d="M6 17 L1.5 22.5" stroke="#000" stroke-width="1.5"/>`,
    ),
    punto: [1, 22],
  },
};

// ——— La paleta Controls ———

const AZUL_CONTROL = "#2e64d8"; // el relleno de los deslizadores y las barras
const GRIS_MARCO = "#9a9a9a";

/** Un termómetro: el bulbo abajo y la columna, en rojo hasta `nivel` (0–1). */
function termometro(x, y0, y1, ancho, nivel, color = "#d22828") {
  const r = ancho * 0.9;
  const alto = y1 - y0 - r;
  const hasta = y0 + alto * (1 - nivel);
  return (
    `<rect x="${f(x - ancho / 2)}" y="${y0}" width="${ancho}" height="${f(alto + r)}" rx="${f(ancho / 2)}" fill="${PAPER}" stroke="${INK}" stroke-width="0.8"/>` +
    lleno(x - ancho / 2 + 0.8, hasta, x + ancho / 2 - 0.8, y1 - r, color) +
    `<circle cx="${x}" cy="${f(y1 - r)}" r="${f(r)}" fill="${color}" stroke="${INK}" stroke-width="0.8"/>`
  );
}

/** Las marcas de una escala vertical, con sus números a la izquierda. */
function escalaVertical(x, y0, y1, numeros, tam = 6) {
  let s = linea(x, y0, x, y1, 0.8);
  numeros.forEach((t, i) => {
    const y = y1 - ((y1 - y0) * i) / (numeros.length - 1);
    s += linea(x, y, x + 2, y, 0.8) + texto48(x - 4, y, t, tam, INK, 400);
  });
  return s;
}

/** El incrementador de un control numérico: dos flechitas en una cápsula. */
const incrementador = (x, y, alto) =>
  `<rect x="${x}" y="${y}" width="6" height="${alto}" rx="3" fill="#dcdcdc" stroke="${GRIS_MARCO}" stroke-width="0.8"/>` +
  poligono([[x + 3, y + alto * 0.18], [x + 1.4, y + alto * 0.38], [x + 4.6, y + alto * 0.38]], "#6e6e6e") +
  poligono([[x + 3, y + alto * 0.82], [x + 1.4, y + alto * 0.62], [x + 4.6, y + alto * 0.62]], "#6e6e6e");

/** La casilla hundida de un control o indicador, con su texto. */
const casilla = (x0, y0, x1, y1, t, fondo = PAPER, tam = 9) =>
  caja(x0, y0, x1, y1, fondo, 1.2, "#7a7a7a") + texto48(x0 + 2 + (t.length * tam) / 4.2, (y0 + y1) / 2 + 0.3, t, tam, INK, 400);

/** Un carril con relleno azul: el de un deslizador o una barra. */
function carril(x0, y0, x1, y1, nivel, vertical) {
  let s = caja(x0, y0, x1, y1, "#c8c8c8", 1.4, "#5a5a5a");
  if (vertical) s += lleno(x0 + 1, y1 - (y1 - y0 - 2) * nivel - 1, x1 - 1, y1 - 1, AZUL_CONTROL);
  else s += lleno(x0 + 1, y0 + 1, x0 + 1 + (x1 - x0 - 2) * nivel, y1 - 1, AZUL_CONTROL);
  return s;
}

/** Un arco con marcas: la escala de un mando, un dial o un medidor. */
function escalaCircular(cx, cy, r, desde, hasta, marcas = 7) {
  const [x0, y0] = [cx + r * Math.cos(desde), cy + r * Math.sin(desde)];
  const [x1, y1] = [cx + r * Math.cos(hasta), cy + r * Math.sin(hasta)];
  let s = `<path d="M${f(x0)} ${f(y0)} A${r} ${r} 0 ${hasta - desde > Math.PI ? 1 : 0} 1 ${f(x1)} ${f(y1)}" fill="none" stroke="${INK}" stroke-width="0.8"/>`;
  for (let i = 0; i < marcas; i++) {
    const a = desde + ((hasta - desde) * i) / (marcas - 1);
    s += linea(cx + r * Math.cos(a), cy + r * Math.sin(a), cx + (r + 2.5) * Math.cos(a), cy + (r + 2.5) * Math.sin(a), 0.8);
  }
  return s;
}

const aguja = (cx, cy, largo, a, color = INK) => linea(cx, cy, cx + largo * Math.cos(a), cy + largo * Math.sin(a), 1.4, color);

const flechitasEnum = (x, y, alto) =>
  poligono([[x + 1, y + 0.5], [x, y + alto * 0.4], [x + 2, y + alto * 0.4]], INK) +
  poligono([[x + 1, y + alto - 0.5], [x, y + alto * 0.6], [x + 2, y + alto * 0.6]], INK);

/** Carpetas de Controls ▸ Modern, en la rejilla de 16 × 16 de las subpaletas. */
export const CARPETAS_CONTROLES = {
  numeric: svg(
    `<rect x="1.5" y="1" width="3" height="11" rx="1.5" fill="${PAPER}" stroke="${INK}" stroke-width="0.6"/>` +
      lleno(2.3, 5, 3.7, 12, "#d22828") + `<circle cx="3" cy="13" r="2.2" fill="#d22828" stroke="${INK}" stroke-width="0.6"/>` +
      caja(6.5, 8.5, 15, 14, PAPER, 0.7, "#7a7a7a") + texto(10.8, 11.35, "1.23", 3.6),
  ),
  boolean: svg(
    `<rect x="1.5" y="2" width="5" height="12" rx="2.5" fill="#dcdcdc" stroke="#7a7a7a" stroke-width="0.7"/>` +
      `<circle cx="4" cy="5.5" r="2" fill="#9a9a9a"/>` +
      `<circle cx="11.5" cy="10" r="3.6" fill="#3cc83c" stroke="#1e6e1e" stroke-width="0.7"/>`,
  ),
  "string-and-path": svg(caja(1.5, 1.5, 14.5, 7, PAPER, 0.8) + texto(8, 4.35, "abc", 4.2) + caja(1.5, 9, 14.5, 14.5, PAPER, 0.8) + texto(8, 11.85, "Path", 4)),
  "data-containers": svg(
    caja(1, 1, 9, 7.5, PAPER, 0.7) + texto(3, 2.8, "1", 2.8) + texto(7, 2.8, "2", 2.8) + texto(3, 5.8, "3", 2.8) + texto(7, 5.8, "4", 2.8) +
      caja(10, 1, 15, 7.5, PAPER, 0.7) +
      caja(1, 9, 7, 15, PAPER, 0.7) + texto(4, 12, "x", 3.5) +
      caja(8.5, 9, 15, 15, PAPER, 0.7) + lleno(9.5, 10, 12, 12.5, "#2850be") + lleno(12.5, 12.5, 14.5, 14.5, "#dc3c32"),
  ),
  "list-table-and-tree": svg(
    caja(1, 1, 7.5, 6, PAPER, 0.7) + linea(2, 2.7, 6.5, 2.7, 0.6) + linea(2, 4.4, 6.5, 4.4, 0.6) +
      linea(6, 9, 6, 14, 0.7) + linea(6, 11, 9, 11, 0.7) + linea(6, 14, 9, 14, 0.7) + linea(2, 7.5, 2, 9, 0.7) +
      caja(1, 7.5, 4, 9, PAPER, 0.6) + caja(9, 10, 13, 12, PAPER, 0.6) + caja(9, 13, 13, 15, PAPER, 0.6),
  ),
  graph: svg(
    lleno(1.5, 1, 14.5, 15, "#1e1e1e") +
      `<polyline points="3.5,11 5.5,6 7.5,9 9.5,4 11.5,8 13,6" fill="none" stroke="#3cdc3c" stroke-width="0.9"/>` +
      linea(3, 13, 13.5, 13, 0.5, "#dcdcdc") + linea(3, 3, 3, 13, 0.5, "#dcdcdc"),
  ),
  "ring-and-enum": svg(
    caja(1, 1.5, 15, 6.5, PAPER, 0.7) + texto(6, 4.1, "Ring", 3.4) + poligono([[11.5, 3.3], [14, 3.3], [12.75, 5]], INK) +
      caja(1, 9, 15, 14, PAPER, 0.7) + texto(9.5, 11.6, "Enum", 3.4) + flechitasEnum(2, 9.5, 4),
  ),
  layout: svg(
    poligono([[1, 3], [6, 3], [7.5, 4.8], [15, 4.8], [15, 14], [1, 14]], "#f0f0f0", INK, 0.8) +
      caja(6, 8, 12, 12.5, PAPER, 0.7) + flecha(9, 11, 0, 1, 3),
  ),
  io: svg(
    caja(1.5, 1.5, 9, 7, PAPER, 0.8) + linea(3, 8.5, 7.5, 8.5, 1) +
      caja(4, 9.5, 14.5, 14.5, PAPER, 0.8) + `<polyline points="5.5,13 7,13 7,11 9.5,11 9.5,13 11,13 11,11 13,11" fill="none" stroke="#2850be" stroke-width="0.8"/>`,
  ),
  "variant-and-class": svg(
    poligono([[4, 6], [8, 4], [13, 6], [13, 12.5], [9, 14.5], [4, 12.5]], "#dcdcdc", INK, 0.8) + linea(9, 8, 9, 14.5, 0.8) + linea(4, 6, 9, 8, 0.8) + linea(13, 6, 9, 8, 0.8) +
      caja(2, 1.5, 5, 3.5, PAPER, 0.6) + linea(3.5, 3.5, 3.5, 5.5, 0.6),
  ),
  decorations: svg(
    `<circle cx="4.5" cy="4.5" r="3.2" fill="#f0f0f0" stroke="${INK}" stroke-width="0.8"/>` +
      poligono([[11.5, 1.5], [15, 7.5], [8, 7.5]], "#f0f0f0", INK, 0.8) +
      caja(1.5, 9.5, 7, 15, "#f0f0f0", 0.8) + caja(9, 9.5, 14.5, 15, "#f0f0f0", 0.8),
  ),
  refnum: svg(poligono([[3, 1], [10.5, 1], [13, 3.5], [13, 15], [3, 15]], PAPER, INK, 0.8) + texto(8, 8.8, "#", 6, INK, 700)),
};

const escalaHorizontal = () =>
  linea(8, 29, 40, 29, 0.8) + [["0", 8], ["5", 24], ["10", 40]].map(([t, x]) => linea(x, 27, x, 29, 0.8) + texto48(x, 34, t, 6, INK, 400)).join("");

/** Amplía un dibujo de 48 × 48 desde su centro: los controles de LabVIEW llenan su celda. */
const ampliar = (k, cuerpo) => `<g transform="translate(24 24) scale(${k}) translate(-24 -24)">${cuerpo}</g>`;

/** Controles de Controls ▸ Modern ▸ Numeric, en la rejilla de 48 × 48 de las funciones. */
export const CONTROLES = {
  "numeric-control": svg48(ampliar(1.3, incrementador(6, 16, 16) + casilla(13, 17, 42, 31, "1.23"))),
  "numeric-indicator": svg48(ampliar(1.3, casilla(9, 17, 38, 31, "1.23", "#e4e4e4"))),
  "time-stamp-control": svg48(ampliar(1.1, incrementador(4, 14, 20) + caja(11, 14, 44, 34, PAPER, 1.2, "#7a7a7a") + texto48(27.5, 20, "12:00", 7, INK, 400) + texto48(27.5, 28.5, "11/07", 7, INK, 400))),
  "time-stamp-indicator": svg48(ampliar(1.15, caja(7, 14, 40, 34, "#e4e4e4", 1.2, "#7a7a7a") + texto48(23.5, 20, "12:00", 7, INK, 400) + texto48(23.5, 28.5, "11/07", 7, INK, 400))),
  "vertical-fill-slide": svg48(ampliar(1.2, escalaVertical(15, 9, 38, ["0", "5", "10"]) + carril(22, 8, 28, 39, 0.55, true))),
  "vertical-pointer-slide": svg48(ampliar(1.2, escalaVertical(15, 9, 38, ["0", "5", "10"]) + carril(22, 8, 28, 39, 0.55, true) + poligono([[19, 22], [31, 22], [34, 24.5], [31, 27], [19, 27]], "#f0f0f0", "#6e6e6e", 0.9),)),
  "vertical-progress-bar": svg48(ampliar(1.2, carril(20, 8, 28, 40, 0.5, true))),
  "vertical-graduated-bar": svg48(ampliar(1.2, carril(20, 8, 28, 40, 0.5, true) + [14, 20, 26, 32].map((y) => linea(21, y, 27, y, 0.8, "#e8e8e8")).join(""))),
  "horizontal-fill-slide": svg48(ampliar(1.15, carril(6, 18, 42, 24, 0.55, false) + escalaHorizontal())),
  "horizontal-pointer-slide": svg48(ampliar(1.15, carril(6, 18, 42, 24, 0.55, false) + escalaHorizontal() + poligono([[23, 15], [28, 15], [28, 25], [25.5, 28], [23, 25]], "#f0f0f0", "#6e6e6e", 0.9))),
  "horizontal-progress-bar": svg48(ampliar(1.15, carril(6, 20, 42, 28, 0.5, false))),
  "horizontal-graduated-bar": svg48(ampliar(1.15, carril(6, 20, 42, 28, 0.5, false) + [12, 18, 24, 30, 36].map((x) => linea(x, 21, x, 27, 0.8, "#e8e8e8")).join(""))),
  knob: svg48(ampliar(1.2, escalaCircular(24, 27, 14, Math.PI * 0.8, Math.PI * 2.2) +
      `<circle cx="24" cy="27" r="9" fill="#d2d2d2" stroke="#6e6e6e" stroke-width="1"/>` + aguja(24, 27, 8, Math.PI * 1.35, AZUL_CONTROL),)),
  dial: svg48(ampliar(1.2, escalaCircular(24, 27, 14, Math.PI * 0.8, Math.PI * 2.2) +
      `<circle cx="24" cy="27" r="10" fill="#e6e6e6" stroke="#6e6e6e" stroke-width="1"/><circle cx="24" cy="27" r="5" fill="#bebebe"/>` + aguja(24, 27, 9, Math.PI * 1.6, AZUL_CONTROL),)),
  meter: svg48(ampliar(1.1, `<rect x="5" y="8" width="38" height="30" rx="2" fill="#f5f5f5" stroke="#6e6e6e" stroke-width="1"/>` +
      `<path d="M11 30 A15 15 0 0 1 25 16" fill="none" stroke="#3cb43c" stroke-width="3"/><path d="M25 16 A15 15 0 0 1 38 26" fill="none" stroke="#d23c28" stroke-width="3"/>` +
      aguja(24, 34, 16, Math.PI * 1.62, "#d22828"),)),
  gauge: svg48(ampliar(1.1, `<circle cx="24" cy="25" r="17" fill="#f5f5f5" stroke="#6e6e6e" stroke-width="1.2"/>` + escalaCircular(24, 25, 13, Math.PI * 0.75, Math.PI * 2.25, 9) + aguja(24, 25, 12, Math.PI * 1.25))),
  tank: svg48(ampliar(1.1, escalaVertical(14, 10, 38, ["0", "5", "10"]) + `<rect x="19" y="8" width="18" height="32" rx="4" fill="#f5f5f5" stroke="#6e6e6e" stroke-width="1"/>` + lleno(20, 22, 36, 39, AZUL_CONTROL, 3))),
  thermometer: svg48(ampliar(1.1, escalaVertical(15, 9, 34, ["0", "50", "100"], 5.5) + termometro(26, 7, 41, 6, 0.75))),
  "horizontal-scrollbar": svg48(
    caja(4, 19, 44, 29, "#e8e8e8", 1, "#7a7a7a") + caja(4, 19, 12, 29, "#dcdcdc", 1, "#7a7a7a") + caja(36, 19, 44, 29, "#dcdcdc", 1, "#7a7a7a") +
      poligono([[6, 24], [10, 21.5], [10, 26.5]], "#6e6e6e") + poligono([[42, 24], [38, 21.5], [38, 26.5]], "#6e6e6e") + caja(19, 20, 27, 28, "#cfcfcf", 0.8, "#7a7a7a"),
  ),
  "vertical-scrollbar": svg48(
    caja(19, 4, 29, 44, "#e8e8e8", 1, "#7a7a7a") + caja(19, 4, 29, 12, "#dcdcdc", 1, "#7a7a7a") + caja(19, 36, 29, 44, "#dcdcdc", 1, "#7a7a7a") +
      poligono([[24, 6], [21.5, 10], [26.5, 10]], "#6e6e6e") + poligono([[24, 42], [21.5, 38], [26.5, 38]], "#6e6e6e") + caja(20, 19, 28, 27, "#cfcfcf", 0.8, "#7a7a7a"),
  ),
  "framed-color-box": svg48(ampliar(1.2, `<rect x="9" y="9" width="30" height="30" rx="2" fill="#5a4a3a" stroke="${INK}" stroke-width="1"/>` +
      [[18, 18, "#dc3c32"], [29, 18, "#f0be1e"], [18, 29, "#3cb43c"], [29, 29, AZUL_CONTROL]].map(([x, y, c]) => `<circle cx="${x}" cy="${y}" r="4" fill="${c}"/>`).join(""),)),
};

/** El tipo de un terminal (TF, DBL…): Arial en negrita, sin contorno, con un píxel entre letras. */
const textoTerminal = (x, y, t, tam, color) =>
  `<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="central" font-family="Arial, 'Liberation Sans', sans-serif" font-size="${tam}" font-weight="700" letter-spacing="1" fill="${color}">${t}</text>`;

/**
 * El terminal de un control o indicador en el diagrama, en su vista de icono:
 * el control en pequeño, con su tipo abajo, y la flecha del lado por el que sale
 * (control) o entra (indicador) el dato. Mide 38 × 38 px, medidos con la
 * herramienta de selección sobre block-diagram/boolean-terminales-icono.png
 * (1:1, un control, un indicador y un OK Button, los tres de 38 × 38): un borde
 * del color del tipo en tres capas, de fuera adentro, verde 2 + blanco 1 + verde 1
 * en un control y verde 1 + blanco 2 + verde 1 en un indicador, y dentro 30 × 30
 * de gris #e2. La pestaña del tipo, de 16 × 8, muerde el borde de abajo
 * (columnas 11 a 26); la flecha, de 5 × 9 con el contorno negro y el relleno
 * blanco, está a 19 px de arriba, en el borde de la derecha de un control y en el
 * de la izquierda de un indicador.
 */
export function terminalPanelIcono(control, color, tipo, dibujo) {
  const borde = control
    ? `<rect x="1" y="1" width="36" height="36" fill="${PAPER}" stroke="${color}" stroke-width="2"/>`
    : `<rect x="0.5" y="0.5" width="37" height="37" fill="${PAPER}" stroke="${color}" stroke-width="1"/>`;
  const interior = `<rect x="3.5" y="3.5" width="31" height="31" fill="#e2e2e2" stroke="${color}" stroke-width="1"/>`;
  // `dibujo`: el del control, si no es un numérico (los booleanos).
  const dentro = `<g transform="translate(1 1)">${dibujo ?? (control ? incrementador(6, 9, 13) + casilla(12.5, 11, 29, 20, "1.23", PAPER, 6.5) : casilla(9, 11, 27.5, 20, "1.23", PAPER, 6.5))}</g>`;
  const flechita = control
    ? `<path d="M32.5 15.5 V23.5 L36.5 19.5 Z" fill="${PAPER}" stroke="#000" stroke-width="1"/>`
    : `<path d="M2.5 15.5 V23.5 L6.5 19.5 Z" fill="${PAPER}" stroke="#000" stroke-width="1"/>`;
  // Un cluster no lleva su tipo escrito: lleva su dibujo en la pestaña (tres trazos del color del borde).
  const rotulo = tipo === "cluster" ? `<rect x="13.5" y="31.5" width="11" height="1" fill="${color}"/><rect x="13.5" y="33.5" width="11" height="1" fill="${color}"/><rect x="13.5" y="35.5" width="11" height="1" fill="${color}"/>` : textoTerminal(19, 33.3, tipo, 9.5, color);
  const etiqueta = `<rect x="11.5" y="29.5" width="15" height="8" fill="${PAPER}"/><polyline points="11.5,37 11.5,29.5 26.5,29.5 26.5,37" fill="none" stroke="${color}" stroke-width="1"/>` + rotulo;
  return svg(borde + interior + dentro + flechita + etiqueta, "0 0 38 38");
}

/**
 * El mismo terminal sin vista de icono: una caja compacta con el tipo, de
 * 32 × 16 (block-diagram/boolean-terminal-compacto.png, un control, y
 * boolean-terminal-compacto-indicador.png). Un control: verde 2, blanco 1 y una
 * caja interior de verde 1 desde la columna 3; un indicador: verde 1, blanco 2 y
 * la caja. En el lado del dato, un bloque verde claro de 10 × 12 con la flecha
 * gris oscura (#4c4c3d).
 */
export function terminalPanelCompacto(control, color, tipo) {
  const borde = control
    ? `<rect x="1" y="1" width="30" height="14" fill="${PAPER}" stroke="${color}" stroke-width="2"/>`
    : `<rect x="0.5" y="0.5" width="31" height="15" fill="${PAPER}" stroke="${color}" stroke-width="1"/>`;
  const caja = control
    ? `<rect x="3.5" y="3.5" width="19" height="9" fill="${PAPER}" stroke="${color}" stroke-width="1"/>`
    : `<rect x="9.5" y="3.5" width="19" height="9" fill="${PAPER}" stroke="${color}" stroke-width="1"/>`;
  const bloque = control
    ? `<rect x="22.5" y="2.5" width="9" height="11" fill="#b2d8b2" stroke="#4ca54c" stroke-width="1"/>` + poligono([[28, 5], [28, 11], [30.5, 8]], TERMINAL_DIRECTION_ARROW)
    : `<rect x="0.5" y="2.5" width="9" height="11" fill="#b2d8b2" stroke="#4ca54c" stroke-width="1"/>` + poligono([[4, 5], [4, 11], [6.5, 8]], TERMINAL_DIRECTION_ARROW);
  return svg(borde + caja + bloque + textoTerminal(16.5, 8.2, tipo, 8.4, color), "0 0 32 16");
}

// ——— La subpaleta Boolean ———
//
// Medidas de labview-captures/block-diagram/boolean-funciones.png, tomadas en
// LabVIEW 2026 Q3 a escala 1:1 (un píxel de la pantalla es un píxel CSS) y
// pasadas a la rejilla de 48 × 48, que es 1,5 veces la caja de 32 px.

const VERDE = "#007f00"; // el de las constantes booleanas

/** Una puerta con el frente redondeado, como And: `x0`–`x1` de ancho, `y0`–`y1` de alto. */
const puertaY = (x0, y0, x1, y1) => {
  const r = (y1 - y0) / 2;
  return `<path d="M${x0} ${y0}H${f(x1 - r * 0.8)}A${f(r * 0.8)} ${r} 0 0 1 ${f(x1 - r * 0.8)} ${y1}H${x0}Z" fill="${NODE_FILL}" stroke="${NODE_BORDER}" stroke-width="1.5"/>`;
};

/** Una puerta con la espalda curva y el frente en punta, como Or; `doble` añade la curva de Xor. */
const puertaO = (x0, y0, x1, y1, doble = false) => {
  const ym = (y0 + y1) / 2;
  const hueco = doble ? 4 : 0;
  const a = x0 + hueco;
  let s = `<path d="M${a} ${y0}Q${f(a + 5)} ${ym} ${a} ${y1}Q${f(x1 - 9)} ${y1} ${x1} ${ym}Q${f(x1 - 9)} ${y0} ${a} ${y0}Z" fill="${NODE_FILL}" stroke="${NODE_BORDER}" stroke-width="1.5"/>`;
  if (doble) s += `<path d="M${x0} ${y0}Q${x0 + 5} ${ym} ${x0} ${y1}" fill="none" stroke="${NODE_BORDER}" stroke-width="1.5"/>`;
  return s;
};

/** El circulito de una negación, centrado en (x, y). */
const burbuja = (x, y) => `<circle cx="${x}" cy="${y}" r="2.4" fill="${NODE_FILL}" stroke="${NODE_BORDER}" stroke-width="1.3"/>`;

/** Una caja plana de conversión, con su rótulo. */
const conversionBooleana = (t) => svg48(poligono([[4.5, 16], [42, 16], [44, 20], [44, 28.5], [42, 32.5], [4.5, 32.5], [6.5, 24.25]], NODE_FILL, NODE_BORDER, 1.3) + texto48(25, 24.6, t, 10.5));

/** La constante booleana: TRUE, una T blanca sobre verde; FALSE, una F verde sobre blanco. */
const constanteBooleana = (letra) =>
  svg48(
    caja(13.5, 14.5, 34.5, 33.5, PAPER, 3, VERDE) +
      (letra === "T" ? lleno(17.5, 18.5, 30.5, 29.5, VERDE) + texto48(24, 24.3, letra, 10.5, "#fff") : texto48(24, 24.3, letra, 10.5, VERDE)),
  );

Object.assign(FUNCIONES, {
  and: svg48(puertaY(6, 12, 42, 36) + texto48(21, 24.3, "∧", 15, INK, 700)),
  or: svg48(puertaO(7.5, 12, 40.5, 36) + texto48(21, 24.3, "∨", 15, INK, 700)),
  "exclusive-or": svg48(puertaO(5, 12, 42.5, 36, true) + texto48(23, 24.3, "⊻", 14, INK, 700)),
  not: svg48(burbuja(10, 24) + poligono([[12.5, 12], [39.5, 24], [12.5, 37]], NODE_FILL, NODE_BORDER, 1.5) + texto48(22, 24.3, "¬", 14, INK, 700)),
  "not-and": svg48(puertaY(5, 11.5, 38, 36.5) + burbuja(40.5, 24) + texto48(19, 24.3, "∧", 15, INK, 700)),
  "not-or": svg48(puertaO(5, 12, 37.5, 36) + burbuja(40, 24) + texto48(18.5, 24.3, "∨", 15, INK, 700)),
  "not-exclusive-or": svg48(puertaO(5, 12, 37.5, 36, true) + burbuja(40, 24) + texto48(20.5, 24.3, "⊻", 14, INK, 700)),
  implies: svg48(poligono([[8, 13], [32, 13], [39.5, 24.25], [32, 35.5], [8, 35.5]], NODE_FILL, NODE_BORDER, 1.5) + texto48(21.5, 24.5, "⇒", 15, INK, 700)),
  "and-array-elements": triangulo(5.25, 4.5, 42.75, 43.5, texto48(16, 25, "∀", 21)),
  "or-array-elements": triangulo(5.25, 4.5, 42.75, 43.5, texto48(16, 25, "∃", 21)),
  "number-to-boolean-array": conversionBooleana("#[···]"),
  "boolean-array-to-number": conversionBooleana("[···]#"),
  "boolean-to-0-1": conversionBooleana("?1:0"),
  "true-constant": constanteBooleana("T"),
  "false-constant": constanteBooleana("F"),
});

Object.assign(CAJAS, {
  and: [6, 12, 42, 36],
  or: [7.5, 12, 40.5, 36],
  "exclusive-or": [5, 12, 42.5, 36],
  not: [7.5, 11.5, 39.5, 37],
  "not-and": [5, 11.5, 43, 36.5],
  "not-or": [5, 12, 42.5, 36],
  "not-exclusive-or": [5, 12, 42.5, 36],
  implies: [8, 13, 39.5, 35.5],
  "and-array-elements": [5.25, 4.5, 42.75, 43.5],
  "or-array-elements": [5.25, 4.5, 42.75, 43.5],
  "number-to-boolean-array": [4.5, 16, 44, 32.5],
  "boolean-array-to-number": [4.5, 16, 44, 32.5],
  "boolean-to-0-1": [4.5, 16, 44, 32.5],
  "true-constant": [12, 13.5, 36, 34.5],
  "false-constant": [12, 13.5, 36, 34.5],
});

// ——— La subpaleta Comparison ———
//
// Medidas de labview-captures/block-diagram/comparison-funciones.png, tomadas en
// LabVIEW 2026 Q3 a escala 1:1 y pasadas a la rejilla de 48 × 48 (× 1,5). Una
// comparación es un triángulo de 19 × 20 px (28,5 × 30), más pequeño que el de
// Numeric; Select, de 25 × 27; Max & Min, un cuadrado de 30 × 30, e In Range
// and Coerce, de 30 × 22. Los dibujos de dentro son propios.

const COMPARACION = [9.75, 9, 38.25, 39];
const comparacion = (simbolo) => triangulo(...COMPARACION, simbolo);
/** El símbolo de una comparación: el signo solo, o con su 0 detrás. */
const cmp = (signo, conCero) => (conCero ? texto48(18.5, 24.6, `${signo}0`, 9.5) : texto48(19.5, 24.6, signo, 14));

const COMPARACIONES = {
  equal: ["=", false], "not-equal": ["≠", false], greater: [">", false], less: ["<", false], "greater-or-equal": ["≥", false], "less-or-equal": ["≤", false],
  "equal-to-0": ["=", true], "not-equal-to-0": ["≠", true], "greater-than-0": [">", true], "less-than-0": ["<", true], "greater-or-equal-to-0": ["≥", true], "less-or-equal-to-0": ["≤", true],
};
for (const [bloque, [signo, conCero]] of Object.entries(COMPARACIONES)) {
  FUNCIONES[bloque] = comparacion(cmp(signo, conCero));
  CAJAS[bloque] = COMPARACION;
}

Object.assign(FUNCIONES, {
  select: triangulo(3.75, 3.75, 40.5, 45, texto48(14, 24.5, "?", 13) + texto48(26, 14.5, "T", 8) + texto48(26, 34.5, "F", 8)),
  "max-and-min": svg48(
    caja(1.5, 1.5, 46.5, 46.5, NODE_FILL, 1.5, NODE_BORDER) + linea(1.5, 24, 46.5, 24, 1.2, NODE_BORDER) + texto48(24, 13, "max", 11, INK, 500) + texto48(24, 35, "min", 11, INK, 500),
  ),
  "in-range-and-coerce": svg48(
    caja(1.5, 7.5, 46.5, 40.5, NODE_FILL, 1.5, NODE_BORDER) + texto48(15, 24, "[x]", 12, INK, 500) + texto48(36, 24.5, "?", 14),
  ),
  "not-a-number-path-refnum": comparacion(texto48(19, 24.6, "NaN", 8)),
});
Object.assign(CAJAS, { select: [3.75, 3.75, 40.5, 45], "max-and-min": [1.5, 1.5, 46.5, 46.5], "in-range-and-coerce": [1.5, 7.5, 46.5, 40.5], "not-a-number-path-refnum": COMPARACION });

// Lo que pide cadenas, arrays, rutas, VIs maleables o punto fijo: en su sitio,
// en gris, con un rótulo corto (el dibujo de NI no se copia).
for (const [id, rotulo] of Object.entries({
  "empty-array": "[ ]?", "empty-string-path": '""?', "decimal-digit": "0-9", "hex-digit": "hex", "octal-digit": "oct", printable: "prt",
  "white-space": "ws?", "lexical-class": "cls", "is-path-and-not-empty": "P?", "fixed-point-overflow": "FXP",
})) {
  FUNCIONES[id] = comparacion(texto48(19, 24.6, rotulo, rotulo.length > 3 ? 8 : 10));
  CAJAS[id] = COMPARACION;
}
Object.assign(FUNCIONES, {
  "comparison-express-vi": svg48(caja(4.5, 4.5, 43.5, 43.5, PAPER, 1.5, NODE_BORDER) + texto48(24, 18, "?", 14) + texto48(24, 33, "=&gt;&lt;", 9.5)),
  "assert-type": svg48(caja(4.5, 4.5, 43.5, 43.5, PAPER, 1.5, NODE_BORDER) + texto48(24, 24, "X≡Y", 11)),
  "is-value-changed": comparacion(texto48(19, 24.6, "Δ?", 11)),
});
Object.assign(CAJAS, { "comparison-express-vi": [4.5, 4.5, 43.5, 43.5], "assert-type": [4.5, 4.5, 43.5, 43.5], "is-value-changed": COMPARACION });

// ——— La subpaleta Timing ———
//
// Medidas de labview-captures/run/s15.png, en LabVIEW 2026 Q3 a escala 1:1: un
// nodo de Timing es un cuadrado de 32 × 32 px (la rejilla entera de 48 × 48),
// relleno #ffffcc con borde #4c4c3d. Los dibujos de dentro son propios: un
// reloj, un reloj de pulsera y un metrónomo.

const TIEMPO = [0, 0, 48, 48];
const cajaTiempo = (dentro) => svg48(caja(0.75, 0.75, 47.25, 47.25, TIME_NODE_FILL, 1.5, TIME_NODE_BORDER) + dentro);
const esfera = (cx, cy, r) =>
  `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${PAPER}" stroke="${INK}" stroke-width="2"/>` + linea(cx, cy, cx, cy - r * 0.7, 2) + linea(cx, cy, cx + r * 0.5, cy + r * 0.2, 2);

Object.assign(FUNCIONES, {
  "tick-count-ms": cajaTiempo(esfera(24, 24, 15)),
  "wait-ms": cajaTiempo(lleno(18, 5, 30, 43, "#555", 2) + esfera(24, 24, 10)),
  "wait-until-next-ms-multiple": cajaTiempo(
    poligono([[14, 41], [34, 41], [28.5, 7], [19.5, 7]], PAPER, INK, 2) + linea(24, 36, 31, 12, 2) + lleno(27.5, 17, 33.5, 21, INK),
  ),
});
// Lo que pide time stamps, cadenas, clusters, subVIs, VIs maleables o Express
// VIs: en su sitio, en gris, con un rótulo corto.
for (const [id, rotulo] of Object.entries({
  "high-resolution-relative-seconds": "s.μs", "stall-data-flow": "stall", "get-date-time-string": "→abc", "get-date-time-in-seconds": "now",
  "date-time-to-seconds": "→ts", "seconds-to-date-time": "ts→", "to-time-stamp": "#→ts", "time-delay": "delay", "elapsed-time": "Δt",
  "notification-polling-wait": "poll", "format-date-time-string": "fmt", "time-stamp-constant": "12:00",
})) FUNCIONES[id] = cajaTiempo(texto48(24, 24.5, rotulo, rotulo.length > 3 ? 10 : 13));
for (const id of ["tick-count-ms", "wait-ms", "wait-until-next-ms-multiple", "high-resolution-relative-seconds", "stall-data-flow", "get-date-time-string",
  "get-date-time-in-seconds", "date-time-to-seconds", "seconds-to-date-time", "to-time-stamp", "time-delay", "elapsed-time",
  "notification-polling-wait", "format-date-time-string", "time-stamp-constant"]) CAJAS[id] = TIEMPO;

// ——— Representation ———
//
// Los iconos del submenú Representation: una caja de 32 × 32 con el rótulo de
// la representación y, debajo, su palabra de bits. Medidas de
// labview-captures/block-diagram/numeric-menu-constante-representacion.png, a
// escala 1:1; el dibujo es propio.

const rotuloRep = (t) =>
  `<text x="16" y="8.6" text-anchor="middle" dominant-baseline="central" font-family="'Courier New',Courier,monospace" font-size="10.5" font-weight="700" fill="#000">${t}</text>`;
const cifraRep = (x, y, t, ancla = "middle") =>
  `<text x="${x}" y="${y}" text-anchor="${ancla}" dominant-baseline="central" font-family="'Courier New',Courier,monospace" font-size="6.5" fill="#000">${t}</text>`;
/** Una fila de puntos de x0 a x1, de dos en dos píxeles. */
const puntosRep = (x0, x1, y) =>
  Array.from({ length: Math.floor((x1 - x0) / 2) + 1 }, (_, i) => `<rect x="${x0 + i * 2}" y="${y}" width="1" height="1" fill="#000"/>`).join("");
const cajaRep = (x0, y0, x1, y1) => `<rect x="${x0}" y="${y0}" width="${f(x1 - x0)}" height="${f(y1 - y0)}" fill="none" stroke="#000" stroke-width="1"/>`;
const iconoRep = (rotulo, cuerpo) =>
  svg(`<rect x="0.5" y="0.5" width="31" height="31" fill="#f0f0f0" stroke="#000" stroke-width="1"/>${rotuloRep(rotulo)}${cuerpo}`, "0 0 32 32");

/** Un entero: el rango de bits arriba (`63` … `0`) y su palabra, entera o recortada, abajo. */
const enteroRep = (rotulo, alto, ancho) => {
  const x0 = 28 - ancho;
  const sobra = ancho < 23 ? puntosRep(4, x0 - 1.5, 22) : "";
  const cuerpo = ancho === 23 ? puntosRep(7, 26, 21) : puntosRep(x0 + 3, 25, 21);
  return iconoRep(
    rotulo,
    cifraRep(ancho === 23 ? 6 : x0 - 0.5, 15.5, alto, ancho === 23 ? "middle" : "end") + cifraRep(27, 15.5, "0", "end") + sobra + cajaRep(x0 + 0.5, 18.5, 27.5, 24.5) + cuerpo,
  );
};

export const REPRESENTACIONES = {
  ext: iconoRep("EXT", cajaRep(4.5, 18.5, 27.5, 27.5) + puntosRep(8, 26, 21) + puntosRep(8, 26, 25)),
  dbl: iconoRep("DBL", cajaRep(4.5, 18.5, 27.5, 24.5) + `<rect x="6" y="20" width="3" height="3" fill="#000"/>` + puntosRep(12, 26, 21)),
  sgl: iconoRep("SGL", cajaRep(4.5, 18.5, 27.5, 22.5) + `<rect x="6" y="19.5" width="2" height="2" fill="#000"/>`),
  fxp: iconoRep("FXP", cajaRep(3.5, 20.5, 13.5, 24.5) + cajaRep(16.5, 20.5, 28.5, 24.5) + `<rect x="14" y="23" width="2" height="2" fill="#000"/>` + puntosRep(6, 11, 22) + puntosRep(19, 26, 22)),
  i64: enteroRep("I64", "63", 23),
  i32: enteroRep("I32", "31", 23),
  i16: enteroRep("I16", "15", 12),
  i8: enteroRep("I8", "7", 6),
  u64: enteroRep("U64", "63", 23),
  u32: enteroRep("U32", "31", 23),
  u16: enteroRep("U16", "15", 12),
  u8: enteroRep("U8", "7", 6),
  cxt: iconoRep("CXT", cajaRep(4.5, 16.5, 27.5, 27.5) + puntosRep(8, 26, 20) + puntosRep(8, 26, 24)),
  cdb: iconoRep("CDB", cajaRep(4.5, 17.5, 27.5, 27.5) + puntosRep(8, 26, 20) + puntosRep(8, 26, 24)),
  csg: iconoRep("CSG", cajaRep(4.5, 18.5, 27.5, 26.5) + `<line x1="4.5" y1="22.5" x2="27.5" y2="22.5" stroke="#000"/>`),
};

// ——— La subpaleta Conversion ———
//
// Cada conversión es la misma caja plana de Boolean To (0,1), con su rótulo.

const CONVERSIONES = {
  "to-double-precision-float": "DBL",
  "to-single-precision-float": "SGL",
  "to-quad-integer": "I64",
  "to-long-integer": "I32",
  "to-word-integer": "I16",
  "to-byte-integer": "I8",
  "to-unsigned-quad-integer": "U64",
  "to-unsigned-long-integer": "U32",
  "to-unsigned-word-integer": "U16",
  "to-unsigned-byte-integer": "U8",
};
for (const [bloque, rotulo] of Object.entries(CONVERSIONES)) {
  FUNCIONES[bloque] = conversionBooleana(rotulo);
  CAJAS[bloque] = [4.5, 16, 44, 32.5];
}

// Las conversiones que Solder aún no tiene o no tendrá: se ven en su sitio,
// en gris, con un rótulo corto (el dibujo de NI no se copia).
Object.assign(FUNCIONES, {
  "to-extended-precision-float": conversionBooleana("EXT"),
  "to-fixed-point": conversionBooleana("FXP"),
  "to-extended-precision-complex": conversionBooleana("CXT"),
  "to-double-precision-complex": conversionBooleana("CDB"),
  "to-single-precision-complex": conversionBooleana("CSG"),
  "coerce-to-type": conversionBooleana("→T"),
  "to-time-stamp": conversionBooleana("→TS"),
  "string-to-byte-array": conversionBooleana("s→[ ]"),
  "byte-array-to-string": conversionBooleana("[ ]→s"),
  "convert-unit": conversionBooleana("UNIT"),
  "cast-unit-bases": conversionBooleana("[U]"),
  "color-to-rgb": conversionBooleana("RGB"),
  "rgb-to-color": conversionBooleana("→RGB"),
  "enum-to-array-of-enums": conversionBooleana("E[ ]"),
});

// ——— La subpaleta Data Manipulation ———
//
// Cajas cuadradas con un rótulo corto: el dibujo de NI no se copia.

const cajaDatos = (rotulo, tam = 9) => svg48(caja(8, 8, 40, 40, NODE_FILL, 1.5, NODE_BORDER) + texto48(24, 24.4, rotulo, tam, INK, 700));
Object.assign(FUNCIONES, {
  "split-number": cajaDatos("hi|lo", 8.5),
  "join-numbers": cajaDatos("hi.lo", 8.5),
  "swap-bytes": cajaDatos("8↔8", 9.5),
  "swap-words": cajaDatos("16↔16", 7.5),
  rotate: cajaDatos("⟲", 17),
  "logical-shift": cajaDatos("<<", 13),
  "rotate-left-with-carry": cajaDatos("c⟲", 12),
  "rotate-right-with-carry": cajaDatos("⟳c", 12),
  "mantissa-and-exponent": cajaDatos("m·2ᵉ", 9),
  "type-cast": cajaDatos("(T)", 11),
  "flatten-to-string": cajaDatos("→abc", 8.5),
  "unflatten-from-string": cajaDatos("abc→", 8.5),
  "byte-array-checksum": cajaDatos("HASH", 8.5),
});
for (const b of ["split-number", "join-numbers", "swap-bytes", "swap-words", "rotate", "logical-shift", "rotate-left-with-carry", "rotate-right-with-carry", "mantissa-and-exponent"]) CAJAS[b] = [8, 8, 40, 40];

// ——— Math & Scientific Constants ———
//
// Cajas naranjas con el símbolo de la constante, como las de la paleta.

for (const [bloque, { simbolo }] of Object.entries(CONSTANTES_MATEMATICAS)) {
  const mitad = simbolo.length <= 2 ? 11 : simbolo.length <= 4 ? 15 : 19;
  FUNCIONES[bloque] = constante(24 - mitad, 14, 24 + mitad, 34, NARANJA, PAPER, simbolo, NARANJA, simbolo.length <= 2 ? 14 : 11);
  CAJAS[bloque] = [24 - mitad - 1, 13, 24 + mitad + 1, 35];
}

// ——— Controls ▸ Modern ▸ Boolean ———
//
// Medidas y aspecto de labview-captures/front-panel/boolean-todos-apagados.png
// y boolean-todos-tras-clic.png (LabVIEW 2026 Q3, escala 1:1), píxel a píxel
// (el 2026-10-01, lado a lado con el editor a 1:1, ampliados). La LED redonda
// encendida sale de una foto de la pantalla de la VM con ella en TRUE y la
// cuadrada, de otra. `ancho` y `alto` son la caja del control, sombra incluida;
// el dibujo es propio y de dos estados, apagado (`false`) y encendido (`true`).
// `indicador`: LabVIEW pone los LED como indicadores y los demás como
// controles; `mecanica`, la acción mecánica de fábrica, que se leyó en el
// submenú Mechanical Action de cada uno.

const SOMBRA = "#9a9a9a";
const aro = (cx, cy, rx, ry, relleno, trazo = "#4a4a4a", grosor = 1.1) =>
  `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${relleno}" stroke="${trazo}" stroke-width="${grosor}"/>`;

/** La cápsula del Push Button y de los Rocker: dos mitades, un brillo y, si se pide, la flecha verde. */
const capsula = (w, h, izquierda, derecha, flecha, sombra) => {
  const [rx, ry, cx, cy] = [w / 2 - 1.5, h / 2 - 2, w / 2 - 1, h / 2 - 1];
  const mitad = (sentido, color) => `<path d="M${cx} ${cy - ry} A${rx} ${ry} 0 0 ${sentido} ${cx} ${cy + ry} Z" fill="${color}"/>`;
  return (
    (sombra ? aro(cx + 3, cy + 3, rx, ry, "#b9b9b9", "none", 0) : "") +
    (izquierda === derecha ? aro(cx, cy, rx, ry, izquierda) : mitad(0, izquierda) + mitad(1, derecha)) +
    aro(cx, cy, rx, ry, "none") +
    `<ellipse cx="${f(cx - rx * 0.45)}" cy="${f(cy - ry * 0.45)}" rx="${f(rx * 0.38)}" ry="${f(ry * 0.2)}" fill="#fff" opacity="0.7"/>` +
    (flecha ? poligono([[cx + rx * 0.45, cy - ry * 0.6], [cx + rx * 0.95, cy], [cx + rx * 0.45, cy + ry * 0.6]], flecha) : "")
  );
};

/** Gira un cuarto de vuelta un dibujo de alto `h`, para hacer la versión vertical con el código de la horizontal. */
const girado = (h, cuerpo) => `<g transform="translate(${h} 0) rotate(90)">${cuerpo}</g>`;

const FUENTE = "Arial,'Liberation Sans',sans-serif";
/** Un degradado lineal; `paradas` es [posición, color, opacidad?]. `eje`: x1 y1 x2 y2 en fracciones de la caja. */
const degradado = (id, eje, paradas) =>
  `<linearGradient id="${id}" x1="${eje[0]}" y1="${eje[1]}" x2="${eje[2]}" y2="${eje[3]}">${paradas.map(([o, c, a = 1]) => `<stop offset="${o}" stop-color="${c}" stop-opacity="${a}"/>`).join("")}</linearGradient>`;
const radial = (id, cx, cy, r, paradas) =>
  `<radialGradient id="${id}" cx="${cx}" cy="${cy}" r="${r}">${paradas.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join("")}</radialGradient>`;
/** Un desenfoque, para las sombras y los brillos. */
const difuso = (id, d) => `<filter id="${id}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${d}"/></filter>`;
const defs = (...cosas) => `<defs>${cosas.join("")}</defs>`;
const elipse = (cx, cy, rx, ry, extra) => `<ellipse cx="${f(cx)}" cy="${f(cy)}" rx="${f(rx)}" ry="${f(ry)}" ${extra}/>`;

/**
 * Push Button (50 × 22; boolean-todos-*.png, desde el píxel 671,486): óvalo de
 * 48 × 19 con el contorno gris oscuro (#616161, más negro abajo, #4a4a4a) y un
 * degradado vertical de #d5 a #a8 (apagado) o de #a6 a #8d (encendido); abajo a
 * la derecha, la sombra gris apagado y un halo blanco encendido. La flecha, de
 * 14 × 10 px, es verde oscuro (#3e5e28 a #23420d) o verde vivo (#71ff28 a #55f80d).
 */
const botonPulsador = (e) =>
  defs(
    degradado("pb-a", [0, 0, 0, 1], [[0, "#d6d6d6"], [0.2, "#c8c8c8"], [0.5, "#c0c0c0"], [0.85, "#bcbcbc"], [1, "#a0a0a0"]]),
    degradado("pb-e", [0, 0, 0, 1], [[0, "#adadad"], [0.2, "#9c9c9c"], [0.6, "#969696"], [0.9, "#8d8d8d"], [1, "#707070"]]),
    degradado("pf-a", [0, 0, 1, 0], [[0, "#3e5e28"], [1, "#23420d"]]),
    degradado("pf-e", [0, 0, 1, 0], [[0, "#71ff28"], [1, "#55f80d"]]),
    difuso("pb-d", 1.3),
  ) +
  (e ? elipse(26.5, 11.3, 23.5, 9.2, 'fill="#fff" opacity="0.9" filter="url(#pb-d)"') : elipse(26.8, 11.8, 23.5, 9, 'fill="#000" opacity="0.5" filter="url(#pb-d)"')) +
  elipse(25, 9.6, 23.5, 9.25, `fill="url(#${e ? "pb-e" : "pb-a"})" stroke="#5c5c5c" stroke-width="1.1"`) +
  `<path d="M14 18.8 Q25 20 36 18.8" fill="none" stroke="#3a3a3a" stroke-width="1.4"/>` +
  elipse(14, 4, 8, 2.1, `fill="#fff" opacity="${e ? 0.3 : 0.65}" filter="url(#pb-d)"`) +
  poligono([[31, 5.2], [44.6, 10], [31, 14.8]], `url(#${e ? "pf-e" : "pf-a"})`);

/**
 * Round LED (18 × 18, desde 1138,290): esfera de 16 px de diámetro con un
 * degradado radial desde el brillo arriba a la izquierda; apagada, verde
 * muy oscuro (#3f6029 a #122903); encendida, #82ff3f a #38bf03. Un halo gris
 * arriba a la izquierda y otro blanco abajo a la derecha, como la sombra de un
 * bisel.
 */
const ledRedondo = (e) =>
  defs(
    radial("rl-a", 0.38, 0.3, 0.78, [[0, "#5d8a3f"], [0.25, "#3b5f26"], [0.65, "#254a10"], [1, "#122903"]]),
    radial("rl-e", 0.38, 0.3, 0.78, [[0, "#9bff6a"], [0.25, "#6bff15"], [0.7, "#4ce808"], [1, "#37bc03"]]),
    difuso("rl-d", 0.7),
  ) +
  `<circle cx="9.9" cy="10" r="7.7" fill="none" stroke="#fff" stroke-width="1.6" filter="url(#rl-d)"/>` +
  `<circle cx="8.9" cy="8.9" r="7.9" fill="none" stroke="#000" stroke-opacity="0.2" stroke-width="1.6" filter="url(#rl-d)"/>` +
  `<circle cx="9.1" cy="9.1" r="7.4" fill="url(#${e ? "rl-e" : "rl-a"})" stroke="${e ? "#5f9a45" : "#4f6a40"}" stroke-width="0.8"/>` +
  elipse(6.9, 5.7, 2.3, 1.6, `fill="#fff" opacity="${e ? 0.4 : 0.22}" filter="url(#rl-d)"`);

/**
 * Square LED (30 × 14, desde 980,420): bisel de 3 px (gris #d3, #c2, #b7 arriba
 * y a la izquierda; blanco #ee, #f2, #ed abajo y a la derecha) alrededor de una
 * ventana de 24 × 8 con degradado en diagonal, #52703e a #162f04 apagada y
 * #7fff3a a #42d505 encendida, y un reflejo arriba a la izquierda.
 */
const ledCuadrado = (e) => {
  const bisel = (colores, tl) =>
    colores
      .map((c, i) => `<polyline points="${tl ? `${i + 0.5},${13.5 - i} ${i + 0.5},${i + 0.5} ${29.5 - i},${i + 0.5}` : `${29.5 - i},${i + 0.5} ${29.5 - i},${13.5 - i} ${i + 0.5},${13.5 - i}`}" fill="none" stroke="${c}" stroke-width="1"/>`)
      .join("");
  return (
    defs(
      degradado("sl-a", [0, 0, 1, 1], [[0, "#4a6a34"], [0.35, "#3a5a25"], [0.7, "#21400c"], [1, "#162f04"]]),
      degradado("sl-e", [0, 0, 0.3, 1], [[0, "#82ff3e"], [0.5, "#5cff13"], [1, "#42d505"]]),
      difuso("sl-d", 0.9),
    ) +
    bisel(["#eeeeee", "#f2f2f2", "#ededed"], false) + bisel(["#d3d3d3", "#c2c2c2", "#b7b7b7"], true) +
    `<rect x="3" y="3" width="24" height="8" fill="url(#${e ? "sl-e" : "sl-a"})"/>` +
    elipse(9, 4.7, 4.5, 1.1, `fill="${e ? "#d8ffc0" : "#a8c89a"}" opacity="${e ? 0.35 : 0.5}" filter="url(#sl-d)"`)
  );
};

/**
 * Toggle horizontal (47 × 20, desde 1284,290). La palanca es una cápsula de
 * 25 × 14 con la bola clara (#f0 con un brillo) y el vástago negro (#2a); apagado
 * apunta a la izquierda y encendido, a la derecha y más abajo, con una sombra
 * larga hacia la esquina. Tras ella, un aro gris de 12 px de diámetro.
 */
const palancaH = (e) =>
  defs(
    degradado("th-bola", [0, 0, 0, 1], [[0, "#f2f2f2"], [0.5, "#bdbdbd"], [1, "#7a7a7a"]]),
    degradado("th-claro", [0, 0, 0, 1], [[0, "#e4e4e4"], [0.3, "#c4c4c4"], [0.75, "#8e8e8e"], [1, "#4a4a4a"]]),
    degradado("th-vastago", [0, 0, 0, 1], [[0, "#5a5a5a"], [0.4, "#303030"], [1, "#1c1c1c"]]),
    difuso("th-d", 1.4),
  ) +
  (e
    ? `<rect x="24" y="6" width="24" height="8.5" rx="4.25" transform="rotate(21 24 10)" fill="#000" opacity="0.32" filter="url(#th-d)"/>` +
      `<circle cx="17" cy="5.5" r="4.6" fill="#d4d4d4" opacity="0.7" stroke="#b0b0b0"/>` +
      `<rect x="16" y="1" width="22" height="10.5" rx="5" fill="url(#th-claro)"/>` +
      `<rect x="33.5" y="2" width="4.5" height="8.5" rx="2.2" fill="#2a2a2a"/>` +
      elipse(31, 5, 1.8, 2.4, 'fill="#fff" opacity="0.7"') + elipse(18.5, 3.5, 1.8, 1.5, 'fill="#fff" opacity="0.8"')
    : elipse(15.7, 14.7, 6, 4.7, 'fill="#000" opacity="0.28" filter="url(#th-d)"') +
      `<circle cx="21" cy="5.5" r="6" fill="#c8c8c8" opacity="0.75" stroke="#a8a8a8"/>` +
      `<rect x="0" y="1" width="22.5" height="10.5" rx="5" fill="url(#th-vastago)"/>` +
      `<rect x="0" y="1" width="8" height="10.5" rx="5" fill="url(#th-bola)"/>` +
      elipse(3.6, 4.4, 1.8, 1.8, 'fill="#fff" opacity="0.9"'));

/**
 * Toggle vertical (20 × 47, desde 838,412): la palanca vertical de 10 × 21, con
 * la bola clara arriba (encendido) o abajo (apagado) y la sombra al lado.
 */
const palancaV = (e) =>
  defs(
    degradado("tv-bola", [0, 0, 1, 0], [[0, "#f4f4f4"], [0.5, "#b8b8b8"], [1, "#6a6a6a"]]),
    degradado("tv-claro", [0, 0, 1, 0], [[0, "#e0e0e0"], [0.55, "#a8a8a8"], [0.85, "#8a8a8a"], [1, "#333"]]),
    degradado("tv-vastago", [0, 0, 1, 0], [[0, "#6a6a6a"], [0.55, "#303030"], [1, "#222"]]),
    difuso("tv-d", 1.4),
  ) +
  (e
    ? elipse(16, 15, 4.8, 6, 'fill="#000" opacity="0.28" filter="url(#tv-d)"') +
      elipse(6.5, 22.3, 6.4, 2.7, 'fill="#c0c0c0" opacity="0.8" stroke="#a8a8a8"') +
      `<rect x="1.2" y="0" width="10.3" height="21.5" rx="5" fill="url(#tv-vastago)"/>` +
      `<rect x="1.2" y="0" width="10.3" height="8" rx="4.5" fill="url(#tv-bola)"/>` + elipse(5.6, 3.2, 2, 1.8, 'fill="#fff" opacity="0.9"')
    : `<rect x="11" y="20" width="8.5" height="26" rx="4.2" transform="rotate(-23 11 20)" fill="#000" opacity="0.3" filter="url(#tv-d)"/>` +
      elipse(6.2, 16.5, 6.4, 3.2, 'fill="#c8c8c8" opacity="0.8" stroke="#b0b0b0"') +
      `<rect x="1.1" y="15.5" width="9.7" height="21.5" rx="4.8" fill="url(#tv-claro)"/>` +
      `<rect x="2.5" y="35" width="7" height="2.3" rx="1" fill="#222" opacity="0.8"/>` +
      elipse(4.6, 17.4, 1.6, 1.2, 'fill="#fff" opacity="0.8"') + elipse(5, 32, 2, 1.5, 'fill="#fff" opacity="0.9"'));

/**
 * Slide Switch (44 × 14, desde 1125,421): carril elíptico #6a6a82 de 44 × 12 con
 * el canto gris (#8f8f8f) y un filo blanco abajo a la derecha, y la tapa de
 * 31 × 10 (#dc arriba a #93 abajo, canto oscuro a la derecha y abajo, #373737);
 * apagada, a la izquierda; encendida, a la derecha.
 */
const deslizador = (vertical, e) => {
  const [w, h] = vertical ? [16, 46] : [44, 14];
  const largo = vertical ? h : w;
  const [a, b] = vertical ? [largo - 15.5, 15.5] : [17.8, largo - 17.2];
  const centro = vertical ? (e ? 15.5 : 30.5) : e ? 27.3 : 17.8;
  void a; void b;
  const tapa = vertical
    ? elipse(w / 2 - 0.2, centro, 6.8, 15.5, 'fill="url(#ds-tv)" stroke="#8e8e8e" stroke-width="0.9"') + elipse(w / 2 - 3, centro - 7, 1.8, 4, 'fill="#fff" opacity="0.6" filter="url(#ds-d)"') + `<path d="M${w / 2 + 5} ${centro - 8} Q${w / 2 + 6.5} ${centro} ${w / 2 + 5} ${centro + 9}" fill="none" stroke="#222" stroke-width="1.1"/>`
    : elipse(centro, h / 2 - 1.2, 15.5, 5.3, 'fill="url(#ds-th)" stroke="#8e8e8e" stroke-width="0.9"') + elipse(centro - 8, h / 2 - 3.7, 4, 1.4, 'fill="#fff" opacity="0.6" filter="url(#ds-d)"') + `<path d="M${centro - 7} ${h / 2 + 3.9} Q${centro + 3} ${h / 2 + 4.4} ${centro + 12} ${h / 2 + 2}" fill="none" stroke="#2a2a2a" stroke-width="1.1"/>`;
  return (
    defs(
      degradado("ds-th", [0, 0, 0.35, 1], [[0, "#e0e0e0"], [0.35, "#cacaca"], [0.7, "#bcbcbc"], [1, "#9a9a9a"]]),
      degradado("ds-tv", [0, 0, 1, 0.3], [[0, "#e0e0e0"], [0.45, "#c4c4c4"], [1, "#9a9a9a"]]),
      difuso("ds-d", 0.7),
    ) +
    elipse(w / 2 + 0.6, h / 2 + 0.2, w / 2 - 0.5, h / 2 - 0.8, 'fill="#fff" opacity="0.85"') +
    elipse(w / 2, h / 2 - 1, w / 2 - 0.5, h / 2 - 1.2, 'fill="#6a6a82" stroke="#8f8f8f" stroke-width="0.9"') +
    tapa
  );
};

/**
 * OK, Cancel y Stop (39 × 20, 47 × 20 y 39 × 20; desde 827,543): marco negro
 * (#434343) de 1 px; cara #c7 a #d2 a la izquierda (4 px), plana #bf en medio, y
 * oscureciéndose a la derecha (#aa a #5e en 5 px) y abajo (#78 en la última fila);
 * pulsado, la cara es #96 y el marco, #3f. El rótulo, en Arial de 12 px.
 */
const boton = (w, rotulo, color, e) =>
  defs(
    degradado(`bt-v${e}`, [0, 0, 0, 1], e
      ? [[0, "#7a7a7a"], [0.1, "#9c9c9c"], [0.25, "#b2b2b2"], [0.5, "#a3a3a3"], [0.85, "#8b8b8b"], [1, "#5a5a5a"]]
      : [[0, "#cecece"], [0.2, "#d6d6d6"], [0.5, "#c8c8c8"], [0.8, "#b4b4b4"], [0.94, "#acacac"], [1, "#787878"]]),
    degradado(`bt-h${e}`, [0, 0, 1, 0], [[0, "#000", 0], [0.82, "#000", 0], [1, "#000", e ? 0.45 : 0.62]]),
    degradado("bt-i", [0, 0, 1, 0], [[0, "#fff", 0.2], [1, "#fff", 0]]),
    degradado(`bt-p${e}`, [0, 0, 0, 1], e ? [[0, "#a6a6a6"], [1, "#8f8f8f"]] : [[0, "#c9c9c9"], [1, "#b2b2b2"]]),
  ) +
  `<rect x="0.5" y="0.5" width="${w - 1}" height="19" fill="url(#bt-v${e})" stroke="${e ? "#3f3f3f" : "#434343"}" stroke-width="1"/>` +
  `<rect x="1" y="1" width="${w - 2}" height="18" fill="url(#bt-h${e})"/>` +
  `<rect x="1" y="1" width="4" height="17" fill="url(#bt-i)"/>` +
  `<rect x="5" y="4" width="${w - 11}" height="12" fill="url(#bt-p${e})"/>` +
  `<text x="${w / 2}" y="13.7" text-anchor="middle" font-family="${FUENTE}" font-size="11.4" fill="${color}">${rotulo}</text>`;

/** El grupo de botones de radio: sólo se pinta, de momento (es un cluster). */
const radios = () =>
  `<rect x="1" y="1" width="98" height="98" fill="#b4b4b4" stroke="#e8e8e8" stroke-width="2"/>` +
  [[16, true, "Radio Selection 1"], [51, false, "Radio Selection 2"]]
    .map(([y, on, t]) => `<text x="5" y="${y}" font-family="Arial,'Liberation Sans',sans-serif" font-size="11" fill="#000">${t}</text><circle cx="11" cy="${y + 15}" r="5" fill="${on ? "#0a64c8" : "#fff"}" stroke="#333" stroke-width="0.8"/>${on ? `<circle cx="11" cy="${y + 15}" r="2" fill="${PAPER}"/>` : ""}<text x="20" y="${y + 15.5}" dominant-baseline="central" font-family="Arial,'Liberation Sans',sans-serif" font-size="11" fill="#000">OFF/ON</text>`)
    .join("");

/**
 * The incrementer of a numeric control on the panel: two arrows in a grey capsule, 16 × 25 px
 * (front-panel/numeric-panel.png). The Old School panel style takes it as an SVG file (DT-058 §9).
 */
export const INCREMENTER = {
  width: 16,
  height: 25,
  drawing: `<rect x="1" y="2" width="11" height="21" rx="5.5" fill="#dedede" stroke="#9c9c9c" stroke-width="1"/><polygon points="6.5,5 3.8,10 9.2,10" fill="#7a7a7a"/><polygon points="6.5,20 3.8,15 9.2,15" fill="#7a7a7a"/>`,
};

/**
 * Los controles booleanos de la paleta, por el último segmento de su id (que es
 * el `style` del control): `dibujo(encendido)` da el SVG interior, en una caja
 * de `ancho` × `alto` px.
 */
export const BOOLEANOS = {
  "push-button": { ancho: 50, alto: 22, indicador: false, mecanica: "switch-when-pressed", etiqueta: "Boolean", dibujo: botonPulsador },
  rocker: { ancho: 50, alto: 22, indicador: false, mecanica: "switch-when-pressed", etiqueta: "Boolean", dibujo: (e) => capsula(50, 22, e ? "#8c8c8c" : "#d0d0d0", "#e2e2e2", null, !e) },
  "vert-rocker": { ancho: 22, alto: 50, indicador: false, mecanica: "switch-when-pressed", etiqueta: "Boolean", dibujo: (e) => girado(22, capsula(50, 22, e ? "#8c8c8c" : "#d0d0d0", "#e2e2e2", null, !e)) },
  "round-led": { ancho: 18, alto: 18, indicador: true, etiqueta: "Boolean", dibujo: ledRedondo },
  "horizontal-toggle-switch": { ancho: 38, alto: 20, indicador: false, mecanica: "switch-when-pressed", etiqueta: "Boolean", dibujo: palancaH },
  "vertical-toggle-switch": { ancho: 20, alto: 38, indicador: false, mecanica: "switch-when-pressed", etiqueta: "Boolean", dibujo: palancaV },
  "square-led": { ancho: 30, alto: 14, indicador: true, etiqueta: "Boolean", dibujo: ledCuadrado },
  "slide-switch": { ancho: 44, alto: 14, indicador: false, mecanica: "switch-when-pressed", etiqueta: "Boolean", dibujo: (e) => deslizador(false, e) },
  "vertical-slide-switch": { ancho: 16, alto: 46, indicador: false, mecanica: "switch-when-pressed", etiqueta: "Boolean", dibujo: (e) => deslizador(true, e) },
  "ok-button": { ancho: 39, alto: 20, indicador: false, mecanica: "latch-when-released", etiqueta: "OK Button", dibujo: (e) => boton(39, "OK", "#000", e) },
  "cancel-button": { ancho: 47, alto: 20, indicador: false, mecanica: "latch-when-released", etiqueta: "Cancel Button", dibujo: (e) => boton(47, "Cancel", "#000", e) },
  "stop-button": { ancho: 39, alto: 20, indicador: false, mecanica: "latch-when-released", etiqueta: "stop", dibujo: (e) => boton(39, "STOP", "#ff0000", e) },
  "radio-buttons": { ancho: 100, alto: 100, indicador: false, etiqueta: "Radio Buttons", dibujo: () => radios() },
};

/** El dibujo de un control booleano en su caja, listo para ponerlo en el panel. */
export const dibujoBooleano = (estilo, encendido) => {
  const b = BOOLEANOS[estilo] ?? BOOLEANOS["push-button"];
  return `<svg viewBox="0 0 ${b.ancho} ${b.alto}" aria-hidden="true" focusable="false">${b.dibujo(!!encendido)}</svg>`;
};

/**
 * El mismo dibujo, pequeño, dentro del terminal del diagrama (38 × 38): como en
 * boolean-terminales-icono.png, el ancho de 28 px de un Push Button o un OK
 * Button, y 12 px de ancho el LED redondo (0,75 de su tamaño), centrados en (18,5, 19).
 */
const dibujoTerminal = (estilo, encendido) => {
  const b = BOOLEANOS[estilo] ?? BOOLEANOS["push-button"];
  const k = Math.min(0.75, 28 / b.ancho, 24 / b.alto);
  return `<g transform="translate(${f(18.5 - (b.ancho * k) / 2)} ${f(18 - (b.alto * k) / 2)}) scale(${f(k)})">${b.dibujo(!!encendido)}</g>`;
};

/** El terminal booleano del diagrama: como el numérico, con «TF» y el dibujo del control dentro. */
export const terminalBooleano = (estilo, control, color, compacto, encendido = false) =>
  compacto ? terminalPanelCompacto(control, color, "TF") : terminalPanelIcono(control, color, "TF", dibujoTerminal(estilo, encendido));

// En la paleta, cada control se ve pequeño en su celda de 48 × 48 (0,93 en esas unidades, 0,62 en píxeles), y los grandes caben.
for (const [estilo, b] of Object.entries(BOOLEANOS)) {
  const k = Math.min(0.93, 44 / Math.max(b.ancho, b.alto));
  CONTROLES[estilo] = svg48(`<g transform="translate(${f(24 - (b.ancho * k) / 2)} ${f(24 - (b.alto * k) / 2)}) scale(${k})">${b.dibujo(false)}</g>`);
}

// ——— Mechanical Action ———
//
// Los seis iconos del submenú (front-panel/boolean-menu-mechanical-action.png):
// en una caja de 32 × 32, el ratón (M) arriba, el valor (V) en medio, y abajo el
// interruptor o la lectura (RD, en los Latch). El dibujo es propio.

const marcaRaton =
  `<text x="2" y="5.5" font-family="'Courier New',monospace" font-size="6" font-weight="700" fill="#000">M</text><text x="3" y="14.5" font-family="'Courier New',monospace" font-size="6" font-weight="700" fill="#000">V</text>` +
  `<polyline points="9,3.5 13,3.5 13,8.5 24,8.5 24,3.5 30,3.5" fill="none" stroke="#000" stroke-width="1.1"/>` +
  poligono([[13, 9.5], [11.5, 7], [14.5, 7]], "#000") + poligono([[24, 5], [22.5, 7.5], [25.5, 7.5]], "#000");
const onda = (puntos) => `<polyline points="${puntos}" fill="none" stroke="#000" stroke-width="1.1"/>`;
const interruptor =
  linea(3, 26, 28, 26, 1, "#000") + linea(9, 26, 19, 21, 1, "#000") +
  `<circle cx="9" cy="26" r="1.2" fill="#f0f0f0" stroke="#000" stroke-width="0.8"/><circle cx="21" cy="26" r="1.2" fill="#f0f0f0" stroke="#000" stroke-width="0.8"/>`;
const pulsador = interruptor + linea(15, 21, 15, 24, 1, "#000") + linea(12, 21, 18, 21, 1.4, "#000");
const lectura = (marcas) =>
  `<text x="2" y="26" font-family="'Courier New',monospace" font-size="6" font-weight="700" fill="#000">RD</text>` + linea(10, 26, 29, 26, 1, "#000") + marcas.map((x) => linea(x, 22, x, 26, 1.1, "#000")).join("");
const iconoMecanica = (valor, abajo) => svg(`<rect x="0.5" y="0.5" width="31" height="31" fill="#f0f0f0" stroke="#000" stroke-width="1"/>${marcaRaton}${onda(valor)}${abajo}`, "0 0 32 32");
export const ACCIONES_MECANICAS = {
  "switch-when-pressed": iconoMecanica("9,19 13,19 13,13 30,13", interruptor),
  "switch-when-released": iconoMecanica("9,19 24,19 24,13 30,13", interruptor),
  "switch-until-released": iconoMecanica("9,19 13,19 13,13 24,13 24,19 30,19", pulsador),
  "latch-when-pressed": iconoMecanica("9,19 13,19 13,13 18,13 18,19 30,19", lectura([17, 24])),
  "latch-when-released": iconoMecanica("9,19 24,19 24,13 29,13 29,19 30,19", lectura([26, 29])),
  "latch-until-released": iconoMecanica("9,19 13,19 13,13 29,13 29,19 30,19", lectura([17, 27])),
};

// ——— Connector patterns: the thumbnails of the Patterns submenu ———
//
// 32 × 32, a white box with 1 px black lines, one rectangle per cell, no labels
// (labview-captures/subvi/connector-menu-patterns.png at 1:1). Drawn anew from
// the cells of core/model/connector-patterns.mjs.

const patternCellBox = ({ left, top, right, bottom }) =>
  `<rect x="${left + 0.5}" y="${top + 0.5}" width="${right - left}" height="${bottom - top}" fill="none" stroke="#000" stroke-width="1"/>`;

/** The thumbnail of a connector pattern: the white frame and the lines of its cells. */
export const patternThumbnail = (pattern) =>
  svg(`<rect x="0.5" y="0.5" width="31" height="31" fill="${PAPER}"/>${pattern.cells.map(patternCellBox).join("")}`, "0 0 32 32");

/** The thumbnails of the 36 patterns, by pattern id (`pattern-01` … `pattern-36`). */
export const PATRONES_CONECTOR = Object.fromEntries(CONNECTOR_PATTERNS.map((pattern) => [pattern.id, patternThumbnail(pattern)]));

// ——— Estructuras: While Loop y For Loop (M4) ———
//
// Medidas de labview-captures/structures/ (while-loop.png, for-loop.png,
// shift-register.png, tunel-*.png, minimo-*.png), en LabVIEW 2026 Q3 a escala
// 1:1, píxel a píxel. Los dibujos son propios: las capturas sólo dan formas,
// tamaños y colores.

/** Un SVG de `ancho` × `alto` px, tal cual, que sobresale de su caja (el marco de un bucle). */
const fijo = (ancho, alto, cuerpo, clase = "") =>
  `<svg${clase ? ` class="${clase}"` : ""} viewBox="0 0 ${ancho} ${alto}" width="${ancho}" height="${alto}" aria-hidden="true" focusable="false">${cuerpo}</svg>`;


/**
 * El marco de un While Loop de `w` × `h` px: 6 px de gris #7f7f7f con las
 * esquinas redondeadas a su manera (el escalón de cada fila, medido), y abajo a
 * la derecha la marca de estirar, que sobresale 1 px.
 */
export function marcoWhile(w, h) {
  const fuera = `M5,0 H${w - 4} V1 H${w - 3} V2 H${w - 1} V5 H${w} V${h} H5 V${h - 1} H2 V${h - 3} H1 V${h - 4} H0 V5 H1 V2 H2 V1 H5 Z`;
  const dentro = `M6,6 H${w - 6} V${h - 6} H6 Z`;
  // Entre el marco y la marca de estirar hay 2 px en blanco, y en el pie una muesca de 3 px.
  const cortes = `M${w - 6},${h - 11} h6 v2 h-6 Z M${w - 4},${h - 1} h3 v1 h-3 Z`;
  const marca = `<polygon points="${w - 9.5},${h - 9} ${w + 1},${h - 9} ${w + 1},${h + 1} ${w},${h + 1} ${w},${h - 6} ${w - 6.5},${h - 6}" fill="${WHILE_FRAME}"/>`;
  return fijo(w, h, `<path d="${fuera} ${dentro} ${cortes}" fill="${WHILE_FRAME}" fill-rule="evenodd"/>${marca}`, "marco-bucle");
}

/**
 * El marco de un For Loop de `w` × `h` px: tres hojas de papel de línea negra de
 * 1 px, desplazadas 2 px, con el doblez abajo a la derecha. El tamaño del bucle
 * es el de las tres hojas juntas, y la delantera mide 4 px menos.
 */
export function marcoFor(w, h) {
  const [W, H] = [w - 4, h - 4];
  const hoja = (k) => `<rect x="${2 * k + 0.5}" y="${2 * k + 0.5}" width="${W - 1}" height="${H - 1}" fill="${PAPER}" stroke="${STRUCTURE_LINE}" stroke-width="1"/>`;
  const delantera = `<path d="M0.5,0.5 H${W - 0.5} V${H - 7.5} L${W - 7.5},${H - 0.5} H0.5 Z" fill="${PAPER}" stroke="${STRUCTURE_LINE}" stroke-width="1"/>`;
  const doblez = `<path d="M${W - 8.5},${H - 8.5} H${W - 0.5} L${W - 8.5},${H - 0.5} Z" fill="${PAPER}" stroke="${STRUCTURE_LINE}" stroke-width="1"/>`;
  return fijo(w, h, `${hoja(2)}${hoja(1)}${delantera}${doblez}`, "marco-bucle");
}

const marcoCaja = (color, grosor, relleno = TERMINAL_FILL) =>
  `<rect x="${grosor / 2}" y="${grosor / 2}" width="${16 - grosor}" height="${16 - grosor}" fill="${relleno}" stroke="${color}" stroke-width="${grosor}"/>`;

/** El terminal de iteración: 16 × 16, borde azul de 2 px y una «i» de 2 px de trazo. */
export const TERMINAL_ITERACION = fijo(16, 16, `${marcoCaja("#0000ff", 2)}<rect x="7" y="4" width="2" height="1" fill="#0000ff"/><rect x="7" y="6" width="2" height="7" fill="#0000ff"/>`, "terminal-bucle");

/** El terminal de cuenta del For: como el de iteración, con una «N». */
const PIXELES_N = { 3: [4, 10], 4: [4, 5, 10], 5: [4, 5, 6, 10], 6: [4, 5, 6, 7, 10], 7: [4, 6, 7, 8, 10], 8: [4, 7, 8, 9, 10], 9: [4, 8, 9, 10], 10: [4, 9, 10], 11: [4, 10] };
export const TERMINAL_CUENTA = fijo(
  16,
  16,
  `${marcoCaja("#0000ff", 2)}<path d="${Object.entries(PIXELES_N).flatMap(([y, xs]) => xs.map((x) => `M${x},${y}h1v1h-1z`)).join("")}" fill="#0000ff"/>`,
  "terminal-bucle",
);

/** Los píxeles de la flecha circular de Continue if True, por fila (structures/condicion-continuar.png). */
const PIXELES_CONTINUAR = { 3: [6, 7, 8], 4: [5, 9], 5: [4], 6: [3, 11], 7: [3, 10, 11, 12], 8: [3, 9, 10, 11, 12, 13], 9: [3, 11], 10: [4, 10], 11: [5, 9], 12: [6, 7, 8] };

/**
 * El terminal de condición: 16 × 16, borde verde de 1 px. Con Stop if True, una
 * señal de stop (un octógono negro y un disco rojo); con Continue if True, una
 * flecha circular verde.
 */
export const terminalCondicion = (modo) => {
  const dentro =
    modo === "continue-if-true"
      ? `<path d="${Object.entries(PIXELES_CONTINUAR).flatMap(([y, xs]) => xs.map((x) => `M${x},${y}h1v1h-1z`)).join("")}" fill="#007f00"/>`
      : `<polygon points="5.5,2.5 10.5,2.5 13.5,5.5 13.5,10.5 10.5,13.5 5.5,13.5 2.5,10.5 2.5,5.5" fill="none" stroke="#000" stroke-width="1"/><circle cx="8" cy="8" r="4" fill="#ff0000"/>`;
  return fijo(16, 16, `${marcoCaja("#007f00", 1)}${dentro}`, "terminal-bucle");
};

/**
 * Un túnel: 9 × 9, borde de 1 px #4c4c3d y el color del tipo que lleva. En un
 * Case, el de salida es `hueco` si algún marco no lo cablea (un anillo del color
 * y blanco dentro) y, con Use Default If Unwired, lleva un cuadrito blanco de
 * 3 × 3 con un punto del color (structures/case-5.png y case-7.png).
 */
export const tunel = (color, modo = "lleno", indexado = false) =>
  fijo(
    9,
    9,
    indexado
      ? // An indexed tunnel (labview-captures/array/tunel-for-indexado.png, at 1:1): a yellow fill and a bracket
        // in the color of the type, 5 × 5 px, with 2 px serifs.
        `<rect x="0.5" y="0.5" width="8" height="8" fill="${TERMINAL_FILL}" stroke="${TUNNEL_BORDER}" stroke-width="1"/>` +
          [[3, 2, 1, 5], [3, 2, 2, 1], [3, 6, 2, 1], [7, 2, 1, 5], [6, 2, 2, 1], [6, 6, 2, 1]].map(([x, y, w, h]) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${color}"/>`).join("")
      : `<rect x="0.5" y="0.5" width="8" height="8" fill="${color}" stroke="${TUNNEL_BORDER}" stroke-width="1"/>` +
      (modo === "hueco" ? `<rect x="2" y="2" width="5" height="5" fill="${PAPER}"/>` : modo === "defecto" ? `<rect x="3" y="3" width="3" height="3" fill="${PAPER}"/><rect x="4" y="4" width="1" height="1" fill="${color}"/>` : ""),
    "tunel",
  );

// ——— Case Structure (M4) ———
//
// Medidas de labview-captures/structures/case-1.png, case-3.png y case-5.png a
// 1:1: un marco de 6 px —una línea negra de 1 px por fuera y 5 px de trama
// de puntos—, el selector de marcos de 17 px de alto pegado a la línea de
// arriba y centrado, y el terminal «?» de 8 × 12 en el lado izquierdo.

/** Los píxeles negros de la trama del marco del Case en su baldosa de 4 × 4, por fila (medidos). */
const TRAMA_CASE = [[0, 3], [1, 2], [0, 2], [1, 3]];

/**
 * El marco de un Case de `w` × `h` px: la línea negra de 1 px por fuera y 5 px
 * de trama, que empieza en (1, 1) y sigue igual por los cuatro lados.
 */
export function marcoCase(w, h) {
  const baldosa = TRAMA_CASE.flatMap((xs, y) => xs.map((x) => `M${x},${y}h1v1h-1z`)).join("");
  const trama = `<pattern id="trama-case" patternUnits="userSpaceOnUse" x="1" y="1" width="4" height="4"><path d="${baldosa}" fill="${STRUCTURE_LINE}"/></pattern>`;
  const banda = `M1,1 H${w - 1} V${h - 1} H1 Z M6,6 V${h - 6} H${w - 6} V6 Z`;
  return fijo(w, h, `<defs>${trama}</defs><path d="${banda}" fill="url(#trama-case)" fill-rule="evenodd"/><rect x="0.5" y="0.5" width="${w - 1}" height="${h - 1}" fill="none" stroke="${STRUCTURE_LINE}" stroke-width="1"/>`, "marco-bucle");
}

/** Medidas del selector de marcos: alto, ancho de cada botón y de lo que sobra por los lados del texto. */
export const SELECTOR_MARCOS = { alto: 17, boton: 7, divisor: 8, sobraTexto: 17, textoX: 12, baseline: 13 };

/** Las filas de una flecha de 7 de alto: su ancho en cada fila, de la 5 a la 11 (los píxeles medidos). */
const ANCHOS_FLECHA = [1, 3, 5, 6, 5, 3, 1];

/**
 * El cuerpo del selector de marcos de un Case: fondo blanco, bordes y divisores
 * de 1 px, las flechas anterior y siguiente y el triángulo del desplegable.
 * `texto` es el ancho del área del texto (45 con «True» y «False»); el selector
 * mide `texto + 18`. El texto va aparte, encima.
 */
export function selectorMarcos(texto) {
  const M = SELECTOR_MARCOS;
  const W = texto + 18;
  const xd = W - 9; // el divisor de la derecha
  const px = (x, y, ancho) => `M${x},${y}h${ancho}v1h-${ancho}z`;
  let flechas = "";
  ANCHOS_FLECHA.forEach((ancho, i) => {
    const y = 5 + i;
    // La izquierda, de 6 hacia atrás; la derecha, desde el divisor.
    flechas += px(7 - ancho, y, ancho) + px(xd + 1, y, ancho);
  });
  // El desplegable: un triángulo de 7 de ancho y 4 de alto.
  for (let i = 0; i < 4; i++) flechas += px(xd - 9 + i, 6 + i, 7 - 2 * i);
  const lineas = `<path d="M0,0h${W}v1h-${W}zM0,16h${W}v1h-${W}zM0,1h1v15h-1zM${W - 1},1h1v15h-1zM${M.divisor},1h1v15h-1zM${xd},1h1v15h-1z" fill="#000"/>`;
  return `<svg class="selector-marcos" viewBox="0 0 ${W} ${M.alto}" width="${W}" height="${M.alto}" aria-hidden="true" focusable="false"><rect x="0" y="0" width="${W}" height="${M.alto}" fill="${PAPER}"/>${lineas}<path d="${flechas}" fill="#000"/></svg>`;
}

/** Los píxeles de la «?» del terminal selector, en su caja de 8 × 12 (medidos). */
const PIXELES_INTERROGANTE = [[3, 2], [4, 2], [2, 3], [5, 3], [5, 4], [4, 5], [3, 6], [3, 7], [3, 9]];

/** El terminal selector de un Case: 8 × 12, borde de 1 px y «?» del color del tipo cableado (verde sin cablear). */
export const terminalSelector = (color) =>
  fijo(
    8,
    12,
    `<rect x="0.5" y="0.5" width="7" height="11" fill="${TERMINAL_FILL}" stroke="${color}" stroke-width="1"/><path d="${PIXELES_INTERROGANTE.map(([x, y]) => `M${x},${y}h1v1h-1z`).join("")}" fill="${color}"/>`,
    "terminal-selector",
  );

/**
 * Un shift register: 16 × 12, borde de 2 px y una flecha de 10 × 5; a la izquierda
 * apunta hacia abajo y a la derecha hacia arriba. Negro sin cablear, del color
 * del tipo si lo tiene.
 */
export const registro = (lado, color = "#000") =>
  fijo(
    16,
    12,
    `<rect x="1" y="1" width="14" height="10" fill="${TERMINAL_FILL}" stroke="${color}" stroke-width="2"/>` +
      (lado === "left" ? `<polygon points="2.5,4 13.5,4 8,9.5" fill="${color}"/>` : `<polygon points="2.5,8 13.5,8 8,2.5" fill="${color}"/>`),
    "registro",
  );

// ——— Flat y Stacked Sequence (M4) ———
//
// Medidas de labview-captures/structures/secuencia-*.png, en LabVIEW 2026 Q3 a
// escala 1:1: un borde de película de #e2e2e2 con una línea negra de 1 px
// arriba y abajo, un zigzag de 2 px en los lados y agujeros de 6 × 6 cada 12 px;
// dentro, uno o varios marcos de borde negro de 1 px, separados 5 px.

export const MEDIDAS_SECUENCIA = {
  lado: 5, // de la esquina al borde del primer marco, y del último a la esquina contraria
  banda: 9, // de la línea de arriba al borde de los marcos (y de abajo): una línea, gris, agujeros, gris
  separador: 5, // entre dos marcos
  marcoMinimo: 38, // lo que mide un marco nuevo, y lo menos que puede medir
  paso: 12, // entre un agujero y el siguiente
  primerAgujero: 9, // el primero, desde la esquina: la rejilla de agujeros empieza 3 px antes y se recorta
};
const GRIS_PELICULA = "var(--sequence-film)"; // the frame of a Flat Sequence

/** La x de cada marco de una secuencia, desde su esquina, con los `anchos` de sus marcos. */
export function izquierdasSecuencia(anchos) {
  const M = MEDIDAS_SECUENCIA;
  let x = M.lado;
  return anchos.map((a) => {
    const r = x;
    x += a + M.separador;
    return r;
  });
}

/**
 * El borde de película de una secuencia de `w` × `h` px con marcos de ancho
 * `anchos`: gris con los marcos recortados, las líneas negras de arriba y abajo,
 * el zigzag de los lados (2 filas en x = 1 y 2 en x = 0, empezando en la fila
 * 10 y espejado a la derecha), los agujeros recortados a x ∈ [1, w - 1] y el
 * borde de cada marco.
 */
export function marcoSecuencia(w, h, anchos) {
  const M = MEDIDAS_SECUENCIA;
  const xs = izquierdasSecuencia(anchos);
  const alto = h - 2 * M.banda;
  const px = (x, y, ancho, altura = 1) => `M${x},${y}h${ancho}v${altura}h-${ancho}z`;
  const interiores = anchos.map((a, k) => px(xs[k], M.banda, a, alto)).join("");
  const gris = `<path d="${px(0, 1, w, h - 2)}${interiores}" fill="${GRIS_PELICULA}" fill-rule="evenodd"/>`;
  // Dos filas en cada columna: (y - 10) mod 4 en 0 y 1, la de dentro (x = 1); en 2 y 3, la de fuera.
  let zigzag = "";
  for (let y = 1; y < h - 1; ) {
    const fase = (((y - 10) % 4) + 4) % 4;
    const [x, filas] = [fase < 2 ? 1 : 0, Math.min(2 - (fase % 2), h - 1 - y)];
    zigzag += px(x, y, 1, filas) + px(w - 1 - x, y, 1, filas);
    y += filas;
  }
  const lineas = px(0, 0, w) + px(0, h - 1, w) + zigzag;
  let agujeros = "";
  for (let x = M.primerAgujero - M.paso; x < w; x += M.paso) {
    for (const y of [2, h - 8]) {
      agujeros += `<rect x="${x + 0.5}" y="${y + 0.5}" width="5" height="5" fill="${PAPER}" stroke="${STRUCTURE_LINE}" stroke-width="1"/>`;
    }
  }
  const recorte = `<clipPath id="recorte-pelicula-${w}x${h}"><rect x="1" y="0" width="${w - 2}" height="${h}"/></clipPath>`;
  const marcos = anchos.map((a, k) => `<rect x="${xs[k] + 0.5}" y="${M.banda + 0.5}" width="${a - 1}" height="${alto - 1}" fill="none" stroke="${STRUCTURE_LINE}" stroke-width="1"/>`).join("");
  return fijo(w, h, `<defs>${recorte}</defs>${gris}<path d="${lineas}" fill="${STRUCTURE_LINE}"/><g clip-path="url(#recorte-pelicula-${w}x${h})">${agujeros}</g>${marcos}`, "marco-bucle");
}

/**
 * La variable local de una secuencia apilada: 13 × 13, relleno #ffffcc y borde de
 * 1 px, negro sin cablear y del color del tipo si lo lleva. `estado`: «libre»
 * (sin cablear), «escribe» (la flecha apunta al borde donde está), «lee» (se
 * aleja de él) o «no» (un marco anterior al que la escribe: tablero de
 * ajedrez del color y el relleno). `borde` es «arriba» o «abajo».
 */
export function variableLocal(estado, color, borde) {
  const c = estado === "libre" ? "#000" : color;
  // La flecha: cabeza de 1, 3, 5 y 7 de ancho y cola de 3, en las filas 3 a 9 de la caja (medido).
  const cabeza = [[6, 6], [5, 7], [4, 8], [3, 9]];
  const cola = [[5, 7], [5, 7], [5, 7]];
  const hacia = (estado === "escribe") === (borde === "arriba") ? "arriba" : "abajo";
  const filasFlecha = hacia === "arriba" ? [...cabeza, ...cola] : [...cola, ...[...cabeza].reverse()];
  let cuerpo = `<rect x="0.5" y="0.5" width="12" height="12" fill="${TERMINAL_FILL}" stroke="${c}" stroke-width="1"/>`;
  if (estado === "escribe" || estado === "lee") {
    cuerpo += `<path d="${filasFlecha.map(([x0, x1], i) => `M${x0},${3 + i}h${x1 - x0 + 1}v1h-${x1 - x0 + 1}z`).join("")}" fill="${c}"/>`;
  } else if (estado === "no") {
    let t = "";
    for (let y = 1; y < 12; y++) for (let x = 1; x < 12; x++) if (!((x + y) % 2)) t += `M${x},${y}h1v1h-1z`;
    cuerpo += `<path d="${t}" fill="${c}"/>`;
  }
  return fijo(13, 13, cuerpo, "variable-local");
}

// Los iconos de la subpaleta Structures (paletas capturadas en structures/paleta.png),
// en la rejilla de 48 × 48. Los que no están hechos se pintan igual, en gris.
const cajaAzul = (x, y, l, glifo = "") => `<rect x="${x}" y="${y}" width="${l}" height="${l}" fill="${TERMINAL_FILL}" stroke="#0000ff" stroke-width="2"/>${glifo}`;
const marcaI = (x, y) => lleno(x + 3.2, y + 1.6, x + 4.8, y + 2.4, "#0000ff") + lleno(x + 3.2, y + 3.2, x + 4.8, y + 6.8, "#0000ff");
const pestana = (x, y) => caja(x, y, x + 12, y + 5, PAPER, 1.2, "#555") + poligono([[x + 2.5, y + 2.5], [x + 5, y + 1], [x + 5, y + 4]], "#555") + poligono([[x + 9.5, y + 2.5], [x + 7, y + 1], [x + 7, y + 4]], "#555");
const hoja = (relleno) => caja(5.5, 12.5, 42.5, 42.5, relleno, 1.6, "#333") + pestana(18, 9.5);

Object.assign(FUNCIONES, {
  "for-loop":
    svg48(
      caja(11, 11, 41, 41, PAPER, 1.4, "#000") + caja(9, 9, 39, 39, PAPER, 1.4, "#000") + caja(7, 7, 37, 37, PAPER, 1.4, "#000") +
        cajaAzul(7, 7, 10, `<rect x="9.5" y="9.5" width="1.2" height="5" fill="#0000ff"/><rect x="13.5" y="9.5" width="1.2" height="5" fill="#0000ff"/>${linea(10, 10, 14.5, 14, 1.2, "#0000ff")}`) +
        cajaAzul(12, 26, 9, marcaI(11, 25.5)),
    ),
  "while-loop":
    svg48(
      `<rect x="9" y="9" width="30" height="30" rx="3" fill="none" stroke="#7f7f7f" stroke-width="5"/>` +
        cajaAzul(13, 27, 9, marcaI(12, 26.5)) +
        `<rect x="27" y="27" width="9" height="9" fill="${TERMINAL_FILL}" stroke="#d22" stroke-width="1.5"/><circle cx="31.5" cy="31.5" r="2.2" fill="#f22"/>`,
    ),
  "case-structure":
    svg48(
      `<rect x="6" y="6" width="36" height="36" fill="${PAPER}" stroke="#000" stroke-width="3" stroke-dasharray="1.5 1.5"/>` +
        `<rect x="7.5" y="17" width="9" height="11" fill="${TERMINAL_FILL}" stroke="#007f00" stroke-width="1.4"/>` + texto48(12, 22.7, "?", 9, "#007f00") +
        pestana(18, 4),
    ),
  "event-structure":
    svg48(
      `<rect x="6" y="6" width="36" height="36" fill="#f0e8a8" stroke="#999" stroke-width="1.4"/>` +
        caja(15, 15, 37, 37, PAPER, 1.4, "#000") + texto48(26, 27, "e", 16, "#c800c8", 400) +
        cajaAzul(6.5, 6.5, 9, lleno(9, 9.5, 13, 10.5, "#0000ff") + lleno(9, 12.5, 13, 13.5, "#0000ff")) + pestana(18, 5),
    ),
  "in-place-element-structure":
    svg48(
      caja(9, 9, 39, 39, NODE_FILL, 1.8, "#222") + lleno(2, 22, 46, 26, "#3c64c8") +
        caja(15, 15, 33, 33, NODE_FILL, 1.8, "#222") + lleno(9, 21, 15, 27, "#3c64c8") + lleno(33, 21, 39, 27, "#3c64c8"),
    ),
  "flat-sequence-structure":
    svg48(
      lleno(5, 5, 43, 43, "#444") + lleno(9, 11, 23, 37, PAPER) + lleno(25, 11, 39, 37, PAPER) +
        [8, 15, 22, 29, 36].map((x) => lleno(x, 6.5, x + 3, 9, "#bbb") + lleno(x, 39, x + 3, 41.5, "#bbb")).join(""),
    ),
  "formula-node":
    svg48(
      lleno(5, 5, 43, 43, "#555") + lleno(10, 12, 38, 38, PAPER) + texto48(24, 25, "y=f(x)", 8.5, INK, 400) +
        lleno(5, 15, 12, 23, PAPER) + texto48(8.5, 19.2, "x", 7, INK, 400) + lleno(36, 25, 43, 33, PAPER) + texto48(39.5, 29.2, "y", 7, INK, 400),
    ),
  "diagram-disable-structure": svg48(hoja(PAPER)),
  "conditional-disable-structure": svg48(hoja(NODE_FILL)),
  "type-specialization-structure":
    svg48(
      caja(5.5, 12.5, 42.5, 42.5, PAPER, 1.4, "#888") + pestana(18, 9.5) +
        lleno(12, 20, 21, 29, "#e600e6") + lleno(26, 17, 35, 26, "#009600") + lleno(28, 28, 37, 37, "#0000ff") + lleno(12, 31, 21, 40, "#8c8c00"),
    ),
  "shared-variable":
    svg48(
      caja(6, 6, 42, 42, PAPER, 2.6, "#000") + caja(18, 10, 30, 38, PAPER, 1.4, "#000") +
        poligono([[34, 14], [40, 20], [34, 26]], "#000") + texto48(12, 33, "?!", 7, INK, 700) + texto48(36, 34, "?!", 7, INK, 700),
    ),
  "local-variable":
    svg48(caja(6, 18, 42, 34, "#f0f0f0", 1.6, "#222") + poligono([[10, 21], [18, 26], [10, 31]], "#000") + poligono([[22, 31], [22, 25], [27, 21], [32, 25], [32, 31]], "#000")),
  "global-variable":
    svg48(
      caja(6, 18, 42, 34, "#f0f0f0", 1.6, "#222") + poligono([[10, 21], [18, 26], [10, 31]], "#000") +
        `<circle cx="30" cy="26" r="6" fill="#555"/>` + linea(24, 26, 36, 26, 1, "#fff") + linea(30, 20, 30, 32, 1, "#fff"),
    ),
  "feedback-node":
    svg48(caja(6, 17, 42, 31, NODE_FILL, 2.2, "#000") + linea(14, 24, 36, 24, 3, "#000") + poligono([[10, 24], [19, 19], [19, 29]], "#000")),
});
// Las carpetas de Structures: una ventanita y, en su pestaña, el nombre en forma de dibujo.
Object.assign(SUBPALETAS, {
  "timed-structures": svg(
    caja(1.5, 3.5, 14.5, 14.5, PAPER, 1, "#555") + caja(3.5, 6.5, 12.5, 12.5, "#cde0f5", 0.8, "#3c78c8") + lleno(5, 8, 11, 9.4, "#3c78c8") + lleno(5, 10, 8, 11.2, "#3c78c8"),
  ),
  decorations: svg(caja(1.5, 3.5, 14.5, 14.5, PAPER, 1, "#555") + lleno(3, 5, 7, 9, "#9a9a9a") + linea(9, 5, 13, 9, 0.9) + lleno(3, 10, 7, 14, PAPER) + caja(3, 10, 7, 14, "none", 0.8) + `<circle cx="11" cy="12" r="2" fill="#bbb"/>`),
});

// ——— Functions ▸ Programming ▸ String (M3) ———
//
// Medidas de labview-captures/string/bd-funciones-1.png, tomadas en LabVIEW 2026
// Q3 a escala 1:1: cada función es una caja amarilla de la altura que lleva (String
// Length, 32 × 17; String Subset y Replace Substring, 44 × 32; To Upper Case, 37 ×
// 11…), más ancha que la rejilla de 32 × 32 de la paleta, así que su glifo trae su
// propio tamaño (TAMANOS, en píxeles) y la paleta lo encoge para que quepa. Los
// dibujos de dentro son propios: un rótulo corto, no el icono de NI. Lo que no
// está medido (las que están en gris, y las de Number/String Conversion que no
// se cogieron) mide 32 × 32, 44 × 32 o 44 × 38 según sus terminales.

const ROSA = "#ff33cc";

/** El tamaño en píxeles de los glifos que no caben en la rejilla de 32 × 32 (los de cadena). */
export const TAMANOS = {};

/** Una función de cadena: caja amarilla de `w` × `h` px con un rótulo. */
function nodoCadena(id, w, h, rotulo, tam = 10) {
  const [W, H] = [w * 1.5, h * 1.5];
  FUNCIONES[id] = svg(caja(0.75, 0.75, W - 0.75, H - 0.75, NODE_FILL, 1.5, NODE_BORDER) + texto48(W / 2, H / 2 + 0.3, rotulo, tam, INK, 700), `0 0 ${f(W)} ${f(H)}`);
  CAJAS[id] = [0, 0, W, H];
  TAMANOS[id] = [w, h];
}

// [id, ancho, alto, rótulo, tamaño]: lo medido en LabVIEW...
for (const [id, w, h, r, t] of [
  ["string-length", 32, 17, "|abc|", 10],
  ["string-subset", 44, 32, "[ab]c", 12],
  ["trim-whitespace", 44, 20, "␣abc␣", 11],
  ["replace-substring", 44, 32, "a→X", 12],
  ["search-and-replace-string", 32, 37, "a⇒X", 10],
  ["to-upper-case", 37, 11, "a→A", 9],
  ["to-lower-case", 37, 11, "A→a", 9],
  ["rotate-string", 44, 17, "abc↺", 11],
  ["reverse-string", 44, 17, "cba", 11],
  ["number-to-decimal-string", 44, 32, "#→dec", 10],
  ["number-to-fractional-string", 44, 38, "#→f", 11],
  ["decimal-string-to-number", 44, 32, "dec→#", 10],
  // ...lo que sigue el mismo patrón que lo medido...
  ["number-to-hexadecimal-string", 44, 32, "#→hex", 10],
  ["number-to-octal-string", 44, 32, "#→oct", 10],
  ["number-to-exponential-string", 44, 38, "#→e", 11],
  ["number-to-engineering-string", 44, 38, "#→eng", 9],
  ["hexadecimal-string-to-number", 44, 32, "hex→#", 10],
  ["octal-string-to-number", 44, 32, "oct→#", 10],
  ["fract-exp-string-to-number", 44, 38, "f/e→#", 10],
  // ...y los huecos, en gris.
  ["normalize-end-of-line", 32, 32, "EOL", 9], ["match-pattern", 32, 32, "pat", 9], ["match-regular-expression", 32, 32, "re", 11],
  ["scan-from-string", 32, 32, "%→", 11], ["format-into-string", 32, 32, "→%", 11], ["build-text", 32, 32, "txt", 9],
  ["format-value", 32, 32, "%#", 11], ["scan-value", 32, 32, "%←", 11], ["spreadsheet-string-to-array", 32, 32, "s→[ ]", 8], ["array-to-spreadsheet-string", 32, 32, "[ ]→s", 8],
  ["search-split-string", 32, 32, "a|b", 10], ["pick-line", 32, 32, "ln", 11], ["match-first-string", 32, 32, "1st", 9], ["match-true-false-string", 32, 32, "T/F", 9],
  ["scan-string-for-tokens", 32, 32, "tok", 9], ["search-and-replace-pattern", 32, 32, "re→", 9], ["index-string-array", 32, 32, "[i]", 11], ["append-true-false-string", 32, 32, "?a:b", 8],
  ["delimited-string-to-1d-string-array", 32, 32, "s→[ ]", 8], ["1d-string-array-to-delimited-string", 32, 32, "[ ]→s", 8], ["create-ni-guid", 32, 32, "GUID", 8],
  ["path-to-array-of-strings", 32, 32, "p→[ ]", 8], ["array-of-strings-to-path", 32, 32, "[ ]→p", 8], ["path-to-string", 32, 32, "p→s", 10], ["string-to-path", 32, 32, "s→p", 10],
  ["system-string-to-utf-8-string", 32, 32, "→UTF8", 8], ["utf-8-string-to-system-string", 32, 32, "UTF8→", 8],
  ["variant-to-flattened-string", 32, 32, "V→s", 10], ["flattened-string-to-variant", 32, 32, "s→V", 10], ["flatten-to-xml", 32, 32, "→XML", 8], ["unflatten-from-xml", 32, 32, "XML→", 8],
  ["flatten-to-json", 32, 32, "→JSON", 8], ["unflatten-from-json", 32, 32, "JSON→", 8], ["install-jsontext-add-on", 32, 32, "JSON", 8],
]) nodoCadena(id, w, h, r, t);

// Concatenate Strings is drawn as a column of cells (diagram-view.mjs: `compuesto`); its glyph is for the palette.
FUNCIONES["concatenate-strings"] = svg(
  caja(1.5, 7.5, 46.5, 40.5, NODE_FILL, 1.5, NODE_BORDER) + linea(24, 7.5, 24, 40.5, 1.2, NODE_BORDER) + linea(1.5, 24, 24, 24, 1.2, NODE_BORDER) + texto48(36, 24.3, "abc", 10, INK, 700),
  "0 0 48 48",
);
CAJAS["concatenate-strings"] = [1.5, 7.5, 46.5, 40.5];

// Las constantes de cadena: una caja con el borde rosa y su texto; las fijas, con un signo.
const cadenaConstante = (t, tam = 11) => svg48(caja(10, 14, 38, 34, PAPER, 3, ROSA) + texto48(24, 24.3, t, tam, INK, 500));
Object.assign(FUNCIONES, {
  "string-constant": cadenaConstante("abc"),
  "empty-string-constant": cadenaConstante("“”", 14),
  "space-constant": cadenaConstante("␣", 15),
  "tab-constant": cadenaConstante("⇥", 15),
  "carriage-return-constant": cadenaConstante("↵", 15),
  "line-feed-constant": cadenaConstante("↓", 15),
  "end-of-line-constant": cadenaConstante("↲", 15),
});
for (const id of ["string-constant", "empty-string-constant", "space-constant", "tab-constant", "carriage-return-constant", "line-feed-constant", "end-of-line-constant"]) CAJAS[id] = [9, 13, 39, 35];

// Los signos de las constantes fijas, en el diagrama.
export const SIGNOS_CADENA = { "empty-string-constant": "", "space-constant": "␣", "tab-constant": "⇥", "carriage-return-constant": "↵", "line-feed-constant": "↓", "end-of-line-constant": "↲" };

// Las carpetas de String.
Object.assign(SUBPALETAS, {
  "number-string-conversion": svg(
    caja(2, 1.5, 9, 6, PAPER, 0.9, "#2850be") + texto(5.5, 3.8, "0.0", 3.6, "#2850be") +
      linea(5.5, 6, 5.5, 10, 0.9) + poligono([[5.5, 11.2], [4, 9], [7, 9]], INK) +
      caja(7, 11, 14.5, 15, PAPER, 0.9, ROSA) + texto(10.75, 13.1, "0.0", 3.4, ROSA),
  ),
  "additional-string-functions": svg(
    caja(2.5, 1.5, 12.5, 6, NODE_FILL, 0.9, NODE_BORDER) + texto(7.5, 3.8, "abc", 3.6) +
      caja(4, 6.5, 14, 11, NODE_FILL, 0.9, NODE_BORDER) + texto(9, 8.8, "a→b", 3.4) +
      caja(5.5, 11.5, 15.5, 15.5, NODE_FILL, 0.9, NODE_BORDER) + texto(10.5, 13.6, "[ ]", 3.4),
  ),
  "path-array-string-conversion": svg(
    caja(1.5, 1.5, 8.5, 6, NODE_FILL, 0.9, NODE_BORDER) + texto(5, 3.8, "abc", 3.4) +
      caja(7, 9, 15, 14.5, NODE_FILL, 0.9, NODE_BORDER) + texto(11, 11.8, "[ ]", 3.6) + poligono([[4, 7], [6, 9.5], [2.5, 9.5]], INK),
  ),
  "flatten-unflatten-string": svg(
    poligono([[3, 3.5], [8, 1.5], [12.5, 3.5], [12.5, 8], [8, 10], [3, 8]], "#e6c84a", INK, 0.8) + linea(8, 5.5, 8, 10, 0.8) +
      poligono([[4, 12], [13, 12], [11.5, 14.5], [2.5, 14.5]], NODE_FILL, NODE_BORDER, 0.8),
  ),
});

// Controls ▸ Modern ▸ String & Path.
const cajaTexto = (x0, y0, x1, y1, t, fondo) => caja(x0, y0, x1, y1, fondo, 1.2, "#7a7a7a") + texto48(x0 + 3 + (t.length * 9) / 4.2, (y0 + y1) / 2 + 0.3, t, 9, INK, 400);
Object.assign(CONTROLES, {
  "string-control": svg48(ampliar(1.3, cajaTexto(5, 18, 43, 30, "abc", PAPER))),
  "string-indicator": svg48(ampliar(1.3, cajaTexto(5, 18, 43, 30, "abc", "#d6d6d6"))),
  "combo-box": svg48(ampliar(1.3, cajaTexto(5, 18, 43, 30, "abc", PAPER) + caja(34, 18.5, 43, 29.5, "#e4e4e4", 1, "#7a7a7a") + poligono([[36, 22], [41, 22], [38.5, 26.5]], "#6e6e6e"))),
  "file-path-control": svg48(ampliar(1.3, caja(5, 18, 43, 30, PAPER, 1.2, "#7a7a7a") + lleno(5.6, 18.6, 15, 29.4, "#4cd2ff") + texto48(29, 24.3, "Path", 8, INK, 400))),
  "file-path-indicator": svg48(ampliar(1.3, caja(5, 18, 43, 30, "#d6d6d6", 1.2, "#7a7a7a") + lleno(5.6, 18.6, 15, 29.4, "#4cd2ff") + texto48(29, 24.3, "Path", 8, INK, 400))),
});

/** El dibujo del control de cadena dentro de su terminal en el diagrama (vista de icono). */
export const dibujoCadena = (control) => (control ? cajaTexto(3.5, 11, 27.5, 21, "abc", PAPER) : cajaTexto(3.5, 11, 27.5, 21, "abc", "#d6d6d6"));


// ——— Errores y Dialog & User Interface (M6, DT-043) ———
//
// Dibujos propios (DT-035 §8): lo que se calca de labview-captures/errores/ son las medidas, los
// colores y el orden, no el dibujo de NI. Medidas del cluster de error en el panel (a 1:1,
// 301-panel-error-out-1a1.png): 155 × 121 px, gris con relieve, el rótulo «status» y el pulsador de
// 20 × 19 px con ✔ verde (FALSE) o ✘ rojo (TRUE), el rótulo «code» con su campo con prefijo «d»
// (en un control, con ▲▼), y el rótulo «source» con una caja de unas 4 líneas con barra a la derecha.

/** El cluster de error en el terminal del diagrama: la caja gris con las barras de colores de sus campos. */
export const dibujoError = (control) =>
  `<rect x="2.5" y="2.5" width="26" height="26" fill="#bdbdbd" stroke="#4d4d4d" stroke-width="1.5"/>` +
  `<rect x="6" y="6" width="9" height="3" fill="#ff77d5" stroke="#000" stroke-width="0.8"/><rect x="19" y="6" width="3.5" height="3.5" fill="${control ? "#e8e8e8" : "#c8c8c8"}" stroke="#000" stroke-width="0.8"/>` +
  `<rect x="9" y="12" width="12" height="3" fill="#ff6633" stroke="#000" stroke-width="0.8"/>` +
  `<rect x="5" y="19" width="4" height="4" fill="#00a000" stroke="#000" stroke-width="0.8"/><rect x="13" y="18.5" width="10" height="3" fill="#0000ff" stroke="#000" stroke-width="0.8"/>`;

/** El pulsador del status de un error: ✔ verde con FALSE y ✘ rojo con TRUE (36-error-in-5000.png). */
export const estadoError = (status) =>
  svg(
    `<rect x="0.5" y="0.5" width="19" height="18" fill="#cfcfcf" stroke="#7c7c7c"/><rect x="1.5" y="1.5" width="17" height="16" fill="#d9d9d9" stroke="#f4f4f4"/>` +
      (status
        ? `<path d="M5.5 4.5 L14.5 14 M14.5 4.5 L5.5 14" stroke="#000" stroke-width="3.6" stroke-linecap="round"/><path d="M5.5 4.5 L14.5 14 M14.5 4.5 L5.5 14" stroke="#e8101c" stroke-width="2.2" stroke-linecap="round"/>`
        : `<path d="M4.5 9.5 L8 13.5 L15.5 4.5" fill="none" stroke="#000" stroke-width="3.6" stroke-linejoin="round" stroke-linecap="round"/><path d="M4.5 9.5 L8 13.5 L15.5 4.5" fill="none" stroke="#12e012" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>`),
    "0 0 20 19",
  );

// Los iconos de Dialog & User Interface: lo medido son los terminales (docs/reference/labview-errors.md §5);
// el dibujo es una caja amarilla con un rótulo, como las funciones de cadena, y los huecos, en gris por el CSS.
for (const [id, r, t] of [
  ["one-button-dialog", "OK", 11], ["two-button-dialog", "OK|✕", 9], ["three-button-dialog", "Y|N|C", 9],
  ["simple-error-handler", "✕?!", 11], ["general-error-handler", "✕?!+", 9], ["clear-errors", "✕→0", 10],
  ["error-ring", "?!▾", 11], ["error-cluster-from-error-code", "#→✕", 10], ["find-first-error", "1.º✕", 9],
  ["prompt-user-for-input", "?…", 11], ["display-message-to-user", "msg", 10], ["write-to-system-log", "log", 10],
  ["wait-for-front-panel-activity", "⌛FP", 9], ["generate-front-panel-activity", "FP→", 9], ["color-box-constant", "▇", 14], ["listbox-symbol-ring-constant", "▤▾", 11],
]) nodoCadena(id, 32, 32, r, t);

// Merge Errors is, like Concatenate Strings, a column of cells that stretches (diagram-view.mjs: `compuesto`).
FUNCIONES["merge-errors"] = svg(
  caja(1.5, 7.5, 46.5, 40.5, NODE_FILL, 1.5, NODE_BORDER) + linea(24, 7.5, 24, 40.5, 1.2, NODE_BORDER) + linea(1.5, 24, 24, 24, 1.2, NODE_BORDER) + texto48(36, 24.3, "✕+✕", 10, INK, 700),
  "0 0 48 48",
);
CAJAS["merge-errors"] = [1.5, 7.5, 46.5, 40.5];

// La constante de error en la paleta: el marco oliva con sus tres celdas (202.png).
const celdaError = (y, alto, color, texto_, relleno = PAPER) => caja(14.5, y, 33.5, y + alto, relleno, 2, color) + (texto_ ? texto48(24, y + alto / 2 + 0.3, texto_, 9, color, 700) : "");
FUNCIONES["error-cluster-constant"] = svg48(
  caja(11.5, 5.5, 36.5, 42.5, PAPER, 1, "#7f7f00") + celdaError(8, 9, "#007f00", "F") + celdaError(17, 12, "#0000ff", "0") + celdaError(29, 12, "#ff00ff", ""),
);
CAJAS["error-cluster-constant"] = [11, 5, 37, 43];

// Las carpetas de la paleta: las cinco que no se abren todavía.
Object.assign(SUBPALETAS, {
  "multiple-errors": svg(caja(2, 3.5, 14, 14.5, PAPER, 0.9) + texto(8, 9.3, "?!", 5.4, INK, 700) + linea(2, 3.5, 5, 1.5, 0.9) + linea(5, 1.5, 9, 1.5, 0.9)),
  events: svg(caja(2, 3.5, 14, 14.5, PAPER, 0.9) + texto(8, 9.3, "e", 7, "#2850be", 700) + linea(2, 3.5, 5, 1.5, 0.9) + linea(5, 1.5, 9, 1.5, 0.9)),
  menu: svg(caja(1.5, 3.5, 14.5, 14.5, PAPER, 0.9) + texto(8, 9, "menu", 4.4) + linea(1.5, 3.5, 4.5, 1.5, 0.9) + linea(4.5, 1.5, 9, 1.5, 0.9)),
  cursor: svg(caja(1.5, 3.5, 14.5, 14.5, PAPER, 0.9) + poligono([[5, 5.5], [5, 12], [7.4, 10], [9.4, 13.4], [10.7, 12.7], [8.8, 9.4], [11.5, 9.3]], INK) + linea(1.5, 3.5, 4.5, 1.5, 0.9) + linea(4.5, 1.5, 9, 1.5, 0.9)),
  help: svg(caja(1.5, 3.5, 14.5, 14.5, PAPER, 0.9) + texto(8, 9.2, "?", 8, "#2850be", 700) + linea(1.5, 3.5, 4.5, 1.5, 0.9) + linea(4.5, 1.5, 9, 1.5, 0.9)),
});

// Controls ▸ Modern ▸ Data Containers (labview-captures/errores/300-controls-data-containers.png).
const GRIS_ERROR = "#a8a8a8";
const controlError = (entra) =>
  caja(7, 9, 41, 39, GRIS_ERROR, 1.4, "#6a6a6a") + lleno(10.5, 12, 17, 19, "#cfcfcf") + texto48(13.7, 15.7, entra ? "✔" : "✔", 7, "#12a012", 700) +
  caja(20, 12, 38, 19, entra ? PAPER : "#d6d6d6", 1, "#7a7a7a") + caja(10, 23, 38, 36, entra ? PAPER : "#d6d6d6", 1, "#7a7a7a");
const celdaMatriz = (x, y, t) => texto48(x, y, t, 5.5, INK, 400);
const matriz = (t, color) =>
  caja(9, 7, 39, 41, PAPER, 1.2, "#6a6a6a") + [14, 21, 28].map((y) => [15, 24, 33].map((x) => celdaMatriz(x, y, "x")).join("")).join("") + texto48(24, 36, t, 6, color, 700);
Object.assign(CONTROLES, {
  "error-in": svg48(ampliar(1.15, controlError(true))),
  "error-out": svg48(ampliar(1.15, controlError(false))),
  array: svg48(ampliar(1.15, caja(8, 14, 40, 34, PAPER, 1.2, "#6a6a6a") + linea(20, 14, 20, 34, 1) + linea(8, 24, 20, 24, 1) + celdaMatriz(14, 19, "0") + celdaMatriz(14, 29, "1") + caja(23, 18, 37, 30, PAPER, 1, "#7a7a7a"))),
  cluster: svg48(ampliar(1.15, caja(7, 9, 41, 39, GRIS_ERROR, 1.4, "#6a6a6a") + lleno(11, 14, 28, 20, "#ff77d5") + lleno(11, 24, 33, 30, "#ff6633") + lleno(11, 33, 20, 37, "#00a000") + lleno(26, 33, 37, 37, "#2850be"))),
  "real-matrix": svg48(ampliar(1.15, matriz("DBL", "#ff6633"))),
  "complex-matrix": svg48(ampliar(1.15, matriz("CDB", "#ff6633"))),
  set: svg48(ampliar(1.15, `<circle cx="19" cy="24" r="10" fill="none" stroke="#6a6a6a" stroke-width="1.4"/><circle cx="29" cy="24" r="10" fill="none" stroke="#6a6a6a" stroke-width="1.4"/>`)),
  map: svg48(ampliar(1.15, caja(7, 13, 21, 35, PAPER, 1.2, "#6a6a6a") + caja(27, 13, 41, 35, PAPER, 1.2, "#6a6a6a") + linea(21, 24, 27, 24, 1.4) + poligono([[27, 24], [24, 21.5], [24, 26.5]], INK))),
});

/** El icono de la ventana de un diálogo, en pequeño (como el del programa en la barra de título). */
export const ICONO_APP = svg(`<rect x="1" y="1" width="14" height="14" rx="2" fill="#3a2c18"/><polygon points="5,4 12,8 5,12" fill="#f2c600"/>`);
/** El icono de un diálogo de error: un círculo rojo con una ✕ blanca, de 40 px. */
export const ICONO_ERROR = svg(
  `<circle cx="20" cy="20" r="18" fill="#c8281e" stroke="#7a120c" stroke-width="2"/><circle cx="20" cy="15" r="13" fill="#e8564a" opacity="0.45"/><path d="M13 13 L27 27 M27 13 L13 27" stroke="#fff" stroke-width="5" stroke-linecap="round"/>`,
  "0 0 40 40",
);


// ——— Functions ▸ Programming ▸ Array (M6) ———
//
// Medidas de labview-captures/array/60-funciones.png (cada función soltada en el diagrama, a 1:1; la tinta
// de cada nodo): el ancho es 32 en casi todas. Los dibujos son propios (DT-035 §8): una caja amarilla con
// un rótulo corto, como las de String; los huecos, en gris por el CSS. Las que se estiran (Build Array,
// Interleave) miden 32 × 9 y 32 × 17 en su tamaño mínimo.
// [id, ancho, alto, rótulo, tamaño]
for (const [id, w, h, r, t] of [
  ["array-size", 32, 21, "[ ]#", 11],
  ["index-array", 32, 27, "[i]", 12],
  ["replace-array-subset", 32, 33, "[i]←", 11],
  ["insert-into-array", 32, 33, "[+]", 12],
  ["delete-from-array", 32, 33, "[−]", 12],
  ["initialize-array", 32, 27, "[n×]", 10],
  ["array-subset", 32, 35, "[a‥b]", 10],
  ["array-max-and-min", 32, 32, "↑↓", 13],
  ["reshape-array", 32, 27, "[m×n]", 8],
  ["sort-1d-array", 32, 32, "[↗]", 12],
  ["sort-2d-array", 44, 32, "[↗]²", 11],
  ["shuffle-1d-array", 32, 32, "[~]", 12],
  ["shuffle-2d-array", 32, 32, "[~]²", 11],
  ["reverse-1d-array", 32, 23, "[⇄]", 12],
  ["search-1d-array", 32, 32, "[?]", 12],
  ["split-1d-array", 32, 32, "[|]", 12],
  ["rotate-1d-array", 32, 18, "[↻]", 11],
  ["increment-array-element", 32, 32, "[+1]", 10],
  ["decrement-array-element", 32, 32, "[−1]", 10],
  ["interpolate-1d-array", 32, 32, "y=", 11],
  ["threshold-1d-array", 32, 32, "y→i", 9],
  ["interleave-1d-arrays", 32, 17, "[∷]", 11],
  ["decimate-1d-array", 32, 17, "[⋮]", 11],
  ["transpose-2d-array", 32, 25, "ᵀ", 12],
  ["array-to-cluster", 25, 11, "[ ]→", 9],
  ["cluster-to-array", 25, 11, "→[ ]", 9],
  ["array-to-matrix", 32, 15, "[ ]→M", 8],
  ["matrix-to-array", 32, 15, "M→[ ]", 8],
  ["remove-duplicates-from-1d-array", 32, 32, "[≠]", 12],
]) nodoCadena(id, w, h, r, t);

// Index Array and Initialize Array with two dimensions are 32 × 35 instead of 32 × 27 (labview-captures/array-2d/
// indexarray-2d-node-icon.png, indexarray-2d-wired-array-only.png and initializearray-contexthelp.png: eight more px
// for the second index or size, which are 8 px apart). The size of Initialize Array with two sizes is taken from
// Index Array's: unverified.
nodoCadena("index-array-2d", 32, 35, "", 12);
nodoCadena("initialize-array-2d", 32, 35, "[n×m]", 10);

/** What an index of Index Array takes out of a 2D array: with none wired the whole grid, with one a 1D row or column, with both a single element. */
const salidaIndexArray2D = (cableados) => {
  const celda = (x, y) => lleno(x, y, x + 5, y + 5, NODE_BORDER);
  if (cableados === 0) return celda(30, 18) + celda(37, 18) + celda(30, 25) + celda(37, 25);
  if (cableados === 1) return celda(28, 21.5) + celda(34, 21.5) + celda(40, 21.5);
  return lleno(33, 20.5, 41, 28.5, NODE_BORDER);
};

/**
 * The drawing of Index Array with two dimensions: the array input on the left, the row index and the column index
 * below it (hollow when unwired, filled when wired) and, on the right, what comes out. Drawn anew; the layout is the
 * one measured in labview-captures/array-2d/indexarray-2d-node-icon.png.
 */
export function indexArray2DGlyph(rowWired, columnWired) {
  const entrada = (y, cableada, ancho, alto) => caja(5, y - alto / 2, 5 + ancho, y + alto / 2, cableada ? NODE_BORDER : NODE_FILL, 1, NODE_BORDER);
  return svg(
    caja(0.75, 0.75, 47.25, 51.75, NODE_FILL, 1.5, NODE_BORDER) +
      caja(5, 9, 15, 19.5, NODE_FILL, 1, NODE_BORDER) + linea(10, 9, 10, 19.5, 1, NODE_BORDER) + linea(5, 14.25, 15, 14.25, 1, NODE_BORDER) +
      entrada(33.75, rowWired, 10, 5) + entrada(45.75, columnWired, 5, 7) +
      salidaIndexArray2D(Number(rowWired) + Number(columnWired)),
    "0 0 48 52.5",
  );
}

// Build Array se estira como Compound Arithmetic: una caja de 32 × 9 con una celda por entrada.
FUNCIONES["build-array"] = svg48(caja(0.75, 0.75, 47.25, 13.25, NODE_FILL, 1.5, NODE_BORDER) + caja(5, 4, 12, 10, PAPER, 1, NODE_BORDER) + caja(36, 4, 43, 10, PAPER, 1, NODE_BORDER) + texto48(24, 7.3, "…", 8));
CAJAS["build-array"] = [0, 0, 48, 14];
TAMANOS["build-array"] = [32, 9];

// La constante de array en la paleta: un índice y la caja de su elemento.
FUNCIONES["array-constant"] = svg48(
  caja(6, 12, 18, 22, PAPER, 1, NODE_BORDER) + texto48(12, 17.3, "0", 6) + caja(21, 12, 40, 36, PAPER, 2, "#4c4c4c") + caja(24, 15, 37, 33, PAPER, 1, "#4c4c4c"),
);
CAJAS["array-constant"] = [5, 11, 41, 37];

// Las carpetas de Array.
Object.assign(SUBPALETAS, {
  unsorted: svg(caja(3.5, 4, 12.5, 14.5, PAPER, 0.9) + texto(8, 9.5, "⋮", 6) + linea(3.5, 4, 6, 2, 0.9) + linea(6, 2, 10, 2, 0.9)),
  "sorted-array": svg(caja(3.5, 4, 12.5, 14.5, PAPER, 0.9) + texto(8, 9.5, "↗", 6) + linea(3.5, 4, 6, 2, 0.9) + linea(6, 2, 10, 2, 0.9)),
  matrix: svg(caja(2.5, 3.5, 13.5, 14.5, PAPER, 0.9) + texto(8, 9, "[xx]", 3.6) + linea(2.5, 3.5, 5, 1.5, 0.9) + linea(5, 1.5, 9, 1.5, 0.9)),
});


// ——— Functions ▸ Programming ▸ Cluster, Class, & Variant ———
//
// Sizes of the four bundle and unbundle nodes measured at 1:1 in labview-captures/cluster/d1.png (the body, without
// the terminal stubs). The others are holes not yet dropped in LabVIEW and take the unmeasured 32 × 32. The drawings
// are our own (DT-035 §8): a yellow box with a short label.
// [id, width, height, label, size]
for (const [id, w, h, r, t] of [
  ["unbundle-by-name", 30, 17, "→.n", 10],
  ["bundle-by-name", 30, 17, ".n→", 10],
  ["unbundle", 32, 17, "→∷", 11],
  ["bundle", 32, 17, "∷→", 11],
  ["cluster-constant", 32, 32, "{ }", 12],
  ["build-cluster-array", 32, 32, "[{ }]", 10],
  ["index-and-bundle-cluster-array", 32, 32, "[{i}]", 10],
  ["call-parent-class-method", 32, 32, "↑m", 12],
  ["to-more-specific-class", 32, 32, "↓C", 12],
  ["to-more-generic-class", 32, 32, "↑C", 12],
  ["preserve-run-time-class", 32, 32, "=C", 12],
  ["lv-object-constant", 32, 32, "Obj", 10],
  ["get-lv-class-default-value", 32, 32, "C⇐", 11],
  ["get-lv-class-path", 32, 32, "C:/", 11],
  ["get-lv-class-default-value-by-name", 32, 32, "C⇐n", 9],
  ["get-lv-class-name", 32, 32, "C→n", 10],
]) nodoCadena(id, w, h, r, t);

// The Variant folder: a box with the two handles of the variant terminal, drawn anew.
SUBPALETAS.variant = svg(caja(3.5, 4, 12.5, 12, NODE_FILL, 0.9, NODE_BORDER) + lleno(1.5, 6.5, 3.5, 9.5, NODE_BORDER) + lleno(12.5, 6.5, 14.5, 9.5, NODE_BORDER) + linea(3.5, 4, 6, 2, 0.9) + linea(6, 2, 10, 2, 0.9));

/**
 * El dibujo del terminal de un array en el diagrama (labview-captures/array/array-control-terminal-diagrama.png y
 * array-indicador-terminal.png): tres celdas de índice i, j y k a la izquierda y la caja de los elementos arriba a
 * la derecha, con «123». El borde y la pestaña son del color del tipo del elemento.
 */
export const dibujoArray = (control) =>
  `<rect x="2.5" y="2.5" width="4.5" height="4.5" fill="#cfcfcf" stroke="#000" stroke-width="0.8"/><rect x="2.5" y="7" width="4.5" height="4.5" fill="#cfcfcf" stroke="#000" stroke-width="0.8"/><rect x="2.5" y="11.5" width="4.5" height="4.5" fill="#cfcfcf" stroke="#000" stroke-width="0.8"/>` +
  texto(4.75, 5, "i", 3.6, "#000", 700) + texto(4.75, 9.5, "j", 3.6, "#000", 700) + texto(4.75, 14, "k", 3.6, "#000", 700) +
  `<rect x="8" y="2.5" width="${control ? 18 : 17}" height="7" fill="#a8a8a8" stroke="#4c4c4c" stroke-width="1"/>` + texto(17, 6.2, "123", 4.6, "#000", 700);

// ——— Waveform Chart, Waveform Graph and XY Graph (labview-captures/graphs/) ———

/**
 * The border of the terminal of an XY Graph and of a chart or a graph with a cluster wired:
 * #993300, measured at 1:1 on 60-diagram-terminals.png and 74-diagram-chart-cluster-two-scalars.png.
 */
export const GRAPH_CLUSTER_COLOR = "#993300";

/**
 * What the terminal of a graph shows inside its 38 × 38 icon (60, at 16×): a small plot, black with a dark
 * edge on the top and left and a light one on the bottom and right, 17 × 17 px from (12, 7), with tick marks
 * and digit smudges around it and the line of the data in white; the XY Graph's has tan grid lines. The
 * coordinates are those of `terminalPanelIcono`'s drawing (the icon's, less one).
 */
export function graphDrawing(kind) {
  const [left, top, size] = [11, 6, 17];
  const grid = kind === "xy-graph" ? [5, 9, 13].map((offset) => `<rect x="${left + offset}" y="${top}" width="1" height="${size}" fill="#cc9966"/><rect x="${left}" y="${top + offset}" width="${size}" height="1" fill="#cc9966"/>`).join("") : "";
  const line = kind === "waveform-chart" ? "12,12 15,9 18,15 22,10 27,13" : "12,16 15,8 19,15 23,11 27,18";
  const marks = [[8, 6], [8, 14], [8, 22]].map(([x, y]) => `<rect x="${x}" y="${y}" width="2" height="1" fill="#000"/>`).join("") + [[11, 25], [19, 25], [27, 25]].map(([x, y]) => `<rect x="${x}" y="${y}" width="1" height="2" fill="#000"/>`).join("") +
    `<rect x="3" y="6" width="4" height="1" fill="#000"/><rect x="4" y="8" width="3" height="1" fill="#000"/><rect x="3" y="14" width="3" height="1" fill="#000"/><rect x="3" y="22" width="3" height="3" fill="none" stroke="#000" stroke-width="1"/>`;
  return `<rect x="${left}" y="${top}" width="${size + 1}" height="${size + 1}" fill="#404040"/><rect x="${left + 1}" y="${top + 1}" width="${size}" height="${size}" fill="#000"/>` +
    `<rect x="${left + size}" y="${top + 1}" width="1" height="${size}" fill="#d9d9d9"/><rect x="${left + 1}" y="${top + size}" width="${size}" height="1" fill="#d9d9d9"/>` +
    grid + `<polyline points="${line}" fill="none" stroke="#fff" stroke-width="1" shape-rendering="crispEdges"/>` + marks;
}

/**
 * The terminal of a graph on the diagram: an indicator whose border is orange with the tag DBL, or
 * #993300 with the cluster tag when a cluster is wired and always on an XY Graph. `compacto` is the
 * view without icon, whose drawing for a graph was not captured (the box of every other terminal).
 */
export function graphTerminal(kind, cluster, compacto) {
  const color = cluster ? GRAPH_CLUSTER_COLOR : "#ff7f00";
  return compacto ? terminalPanelCompacto(false, color, cluster ? "" : "DBL") : terminalPanelIcono(false, color, cluster ? "cluster" : "DBL", graphDrawing(kind));
}

/** A plot in a palette icon: black with a coloured grid and a white trace, in a grey frame. */
function graphPaletteIcon(kind) {
  const grid = kind === "waveform-chart" ? "" : [14, 20, 26, 32].map((offset) => `<rect x="${offset}" y="9" width="1" height="26" fill="${kind === "xy-graph" ? "#8a8a00" : "#00802a"}"/><rect x="9" y="${offset + 1}" width="30" height="1" fill="${kind === "xy-graph" ? "#8a8a00" : "#00802a"}"/>`).join("");
  const trace = kind === "xy-graph" ? "12,32 18,14 25,28 31,12 36,22" : "10,26 16,14 22,28 28,12 34,24 38,18";
  return svg48(ampliar(1.05, `<rect x="4" y="5" width="40" height="38" fill="#bfbfbf" stroke="#6e6e6e" stroke-width="1"/><rect x="8" y="9" width="32" height="26" fill="#000"/>${grid}<polyline points="${trace}" fill="none" stroke="#fff" stroke-width="1.4"/>` +
    `<rect x="8" y="37" width="32" height="1" fill="#404040"/>${[10, 24, 38].map((x) => `<rect x="${x}" y="36" width="1" height="3" fill="#000"/>`).join("")}`));
}
Object.assign(CONTROLES, { "waveform-chart": graphPaletteIcon("waveform-chart"), "waveform-graph": graphPaletteIcon("waveform-graph"), "xy-graph": graphPaletteIcon("xy-graph") });

// Controls ▸ Modern ▸ Ring & Enum, drawn anew after enum-edit/13-ringenum.png: the rings and the enum
// have the Numeric Control's incrementer, the Menu Ring is a grey drop-down, and the picture rings show
// a green square under a yellow circle.
const RING_TEXT_SIZE = 8.5;
const ringBox = (x0, y0, x1, y1, text, fill = PAPER) =>
  caja(x0, y0, x1, y1, fill, 1.2, "#7a7a7a") + texto48((x0 + x1) / 2, (y0 + y1) / 2 + 0.3, text, RING_TEXT_SIZE, INK, 600);
const ringPicture = (x0, y0, x1, y1) => {
  const width = x1 - x0;
  const height = y1 - y0;
  return caja(x0, y0, x1, y1, PAPER, 1.2, "#7a7a7a") +
    `<circle cx="${f(x0 + width * 0.62)}" cy="${f(y0 + height * 0.38)}" r="${f(height * 0.24)}" fill="#f0e000" stroke="${INK}" stroke-width="0.6"/>` +
    caja(f(x0 + width * 0.18), f(y0 + height * 0.42), f(x0 + width * 0.5), f(y0 + height * 0.8), "#00b000", 0.6, INK);
};
Object.assign(CONTROLES, {
  "text-ring": svg48(ampliar(1.3, incrementador(6, 16, 16) + ringBox(13, 17, 42, 31, "Ring"))),
  "menu-ring": svg48(ampliar(1.3, ringBox(7, 17, 41, 31, "Ring", "#c8c8c8") + poligono([[34, 22.5], [39, 22.5], [36.5, 26]], "#6e6e6e"))),
  enum: svg48(ampliar(1.3, incrementador(6, 16, 16) + ringBox(13, 17, 42, 31, "Enum"))),
  "pict-ring": svg48(ampliar(1.3, incrementador(9, 14, 16) + ringPicture(16, 14, 37, 35))),
  "text-and-pict-ring": svg48(ampliar(1.2, incrementador(7, 8, 16) + ringPicture(14, 7, 35, 28) + ringBox(14, 30, 35, 40, "Ring"))),
});

// The two folders of Controls ▸ Modern ▸ Graph ▸ Controls (02-palette-graph-subfolder-controls.png).
Object.assign(CARPETAS_CONTROLES, {
  controls: svg(`<circle cx="8" cy="8" r="6" fill="#f0f0f0" stroke="${INK}" stroke-width="0.8"/><circle cx="8" cy="8" r="3.4" fill="none" stroke="#7a7a7a" stroke-width="0.6"/>${linea(8, 2, 8, 14, 0.6, "#7a7a7a")}${linea(2, 8, 14, 8, 0.6, "#7a7a7a")}`),
  datatypes: svg(`${caja(2, 2.5, 14, 13.5, PAPER, 0.8)}${linea(2, 6, 14, 6, 0.6)}${linea(6.5, 2.5, 6.5, 13.5, 0.6)}`),
});

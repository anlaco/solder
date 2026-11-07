// Free labels (DT-085) as the panel and the diagram draw them, measured in LabVIEW 2026 Q3
// (labview-captures/reports/2026-11-07-free-labels-look.md):
//
// - On the diagram the box has a 1 px border and a pale yellow fill, while typed and after; inside, 1 px of padding
//   on each side of the text and none above or below, so one line is 15 + 2 high and "Hello" is 33 wide. A double
//   click puts the box's corner 7 px above the click.
// - On the panel the box has no border: white while typed, and only the text once confirmed. "Hello" is 29 wide
//   and one line 15 high; the box's corner is 1 px right of the click and 6 px above it.
// - Empty, the box is 7 wide on the panel and 11 on the diagram: the text area never gets narrower than 5 px.
//
// The text, its typing and its confirming are those of an owned label (labels.mjs): `label.text`, an `edicion`
// with `etiqueta: true`, Enter for a new line. What is particular is in `edicion.libre`.

import { ALTO_LINEA, medirAproximado, textoDe } from "./labels.mjs";

const esc = (text) => String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const px = (value) => `${Number(value.toFixed(2))}px`;

/** The narrowest the text area gets, so an empty label still shows its caret (measured: 7 px empty on the panel). */
const NARROWEST_TEXT = 5;
/** One pixel at each side of the text, as an owned label has. */
const TEXT_SIDE_PADDING = 1;
/** The diagram's box: a 1 px border round the text area, and 1 px more of padding at each side. */
const DIAGRAM_BORDER = 1;
const DIAGRAM_SIDE_PADDING = 1;

/** Where the box's top-left corner goes for a double click at `point`, on each canvas (measured). */
const OFFSET_FROM_CLICK = { diagrama: { x: 0, y: -7 }, panel: { x: 1, y: -6 } };

export const cornerForClick = (canvas, point) => ({ x: Math.round(point.x + OFFSET_FROM_CLICK[canvas].x), y: Math.round(point.y + OFFSET_FROM_CLICK[canvas].y) });

/** The size of a free label's box on `canvas`, from its text; a label that was resized keeps its size (`tam`). */
export function size(node, canvas, measure = medirAproximado, edicion = null) {
  if (node.tam) return { ancho: node.tam.ancho, alto: node.tam.alto };
  const lines = textoDe(node, edicion).split("\n");
  const textWidth = Math.max(NARROWEST_TEXT, ...lines.map((line) => measure(line))) + 2 * TEXT_SIDE_PADDING;
  const textHeight = lines.length * ALTO_LINEA;
  if (canvas === "panel") return { ancho: textWidth, alto: textHeight };
  const frame = 2 * DIAGRAM_BORDER;
  return { ancho: textWidth + frame + 2 * DIAGRAM_SIDE_PADDING, alto: textHeight + frame };
}

/** The box of a free label on `canvas`: where it is and its size. */
export function box(node, canvas, measure, edicion) {
  const place = canvas === "panel" ? node.panel : node;
  return { x: place.x, y: place.y, ...size(node, canvas, measure, edicion) };
}

/** The typing into this free label, if it is the one typed into. */
export const typingInto = (node, edicion) => (edicion?.libre && edicion.nodo === node.id ? edicion : null);

/** The text of a free label as HTML, with the caret or the selected text while it is typed. */
export function contentHtml(node, edicion) {
  const typing = typingInto(node, edicion);
  const lines = textoDe(node, edicion).split("\n").map(esc);
  if (!typing) return lines.join("<br>");
  if (typing.todo) return lines.map((line) => `<span class="texto-elegido">${line || "&nbsp;"}</span>`).join("<br>");
  return `${lines.join("<br>")}<span class="caret"></span>`;
}

/**
 * The class of the text box inside a free label's node or panel object: typed or at rest, and `con-tamano` once it
 * was resized, when its text wraps inside the box (at words, or inside a word that does not fit) and what does not fit
 * is cut (measured).
 */
export const textClass = (node, edicion) => `texto-etiqueta-libre${typingInto(node, edicion) ? " editando" : ""}${node.tam ? " con-tamano" : ""}`;

/** The eight handles a free label is resized by, 6 x 6 px inside its corners and at the middle of its sides (measured). */
export const HANDLE_SIDES = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
const HANDLE_SIZE = 6;

/** Where a handle goes, from the box's own corner. */
export function handleBox(side, box) {
  const x = side.includes("w") ? 0 : side.includes("e") ? box.ancho - HANDLE_SIZE : box.ancho / 2 - HANDLE_SIZE / 2;
  const y = side.includes("n") ? 0 : side.includes("s") ? box.alto - HANDLE_SIZE : box.alto / 2 - HANDLE_SIZE / 2;
  return { x, y };
}

/**
 * The handles of a free label as HTML. `shown`: selected or hovered; hidden ones are still drawn to catch the mouse.
 * `inset`: what the element's own border shifts its children by, so the handles sit on the box's corners.
 */
export function handlesHtml(node, box, { shown, inset = 0, attribute = "data-asa" }) {
  const handleClass = shown ? "asa asa-estructura" : "asa asa-estructura oculta";
  return HANDLE_SIDES.map((side) => {
    const place = handleBox(side, box);
    return `<div class="${handleClass}" data-nodo="${esc(node.id)}" ${attribute}="${side}" style="left:${px(place.x - inset)};top:${px(place.y - inset)}"></div>`;
  }).join("");
}

/**
 * The box a handle on `side` drags to, moved by (dx, dy) from `box`, never smaller than `smallest`: a left or top
 * handle dragged past it stops the box there instead of sliding it on.
 */
export function stretchedBox(box, side, dx, dy, smallest) {
  const stretched = { ...box };
  if (side.includes("e")) stretched.ancho = Math.max(smallest.ancho, box.ancho + dx);
  if (side.includes("s")) stretched.alto = Math.max(smallest.alto, box.alto + dy);
  if (side.includes("w")) {
    stretched.ancho = Math.max(smallest.ancho, box.ancho - dx);
    stretched.x = box.x + box.ancho - stretched.ancho;
  }
  if (side.includes("n")) {
    stretched.alto = Math.max(smallest.alto, box.alto - dy);
    stretched.y = box.y + box.alto - stretched.alto;
  }
  return stretched;
}

/** The box of an empty label on `canvas`: the smallest a free label is resized to. */
export const smallestSize = (canvas) => size({ label: { text: "" } }, canvas);

/** The right-click menus of a free label, measured (reports/2026-11-07-free-labels-behaviour.md §1). */
export const DIAGRAM_MENU_ROOT = "context.diagram-free-label";
export const PANEL_MENU_ROOT = "context.panel-free-label";

/** The canvas a free label belongs to. */
export const canvasOf = (node) => (node.panel ? "panel" : "diagrama");

/**
 * The rows its menu ticks: Size To Text until the label is resized, and the defaults LabVIEW ticks (Vertical
 * Arrangement ▸ None, Representation ▸ System Encoding on the diagram, Enable Hyperlinks on the panel).
 */
export function menuMarks(root, node) {
  const marks = new Set([`${root}.vertical-arrangement.none`]);
  if (!node.tam) marks.add(`${root}.size-to-text`);
  if (root === DIAGRAM_MENU_ROOT) marks.add(`${root}.text-representation.system-encoding`);
  if (root === PANEL_MENU_ROOT) marks.add(`${root}.enable-hyperlinks`);
  return marks;
}

/**
 * Size To Text: ticked, the box follows the text; clicking it on a resized label fits the box to its text again,
 * keeping its corner (measured). Unticking it keeps the box as it is now, fixed.
 */
export function toggleSizeToText(g, id, measure, canvas) {
  const resize = (node) => {
    if (node.tam) {
      const { tam: _size, ...fitted } = node;
      return fitted;
    }
    return { ...node, tam: size(node, canvas, measure) };
  };
  return { ...g, nodos: g.nodos.map((node) => (node.id === id ? resize(node) : node)) };
}

/**
 * A free label stretched by one of its eight handles from `box0` by (dx, dy). Its size is kept from then on (Size To
 * Text is cleared, measured), never smaller than an empty label's box.
 */
export function resized(node, canvas, box0, side, dx, dy) {
  const box = stretchedBox(box0, side, Math.round(dx), Math.round(dy), smallestSize(canvas));
  const place = { x: box.x, y: box.y };
  const tam = { ancho: box.ancho, alto: box.alto };
  return canvas === "panel" ? { ...node, panel: { ...node.panel, ...place }, tam } : { ...node, ...place, tam };
}

export { px, esc };

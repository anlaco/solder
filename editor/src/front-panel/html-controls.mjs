// The Front Panel's controls as plain HTML (DT-058): the only drawing of the panel, which every panel style (Old
// School, Plain, Solder, Solder Night) dresses with its sheet over panel-styles/plain.css, the mother template.
//
// Only markup: what each object holds and how it is edited is decided in front-panel.mjs, which calls these
// builders with the object's box (the same as in Old School: a style changes neither sizes nor terminals) and
// the HTML of its values. Two sets of names live side by side:
//   - the public API (DT-056 §7), frozen once published: `.sd-control` / `.sd-indicator`, a kind class
//     (`.sd-numeric`, `.sd-boolean`…), `data-label`, the parts (`.sd-field`, `.sd-value`, `.sd-incrementer`…) and
//     the state (`.sd-on`, `aria-pressed`, `aria-checked`, `.sd-selected`);
//   - the editor's own hooks, which no style should touch: `.objeto-panel` and the data attributes the editor
//     reads to know what was clicked (`data-nodo`, `data-casilla`, `data-paso`, `data-eje`, `data-k`,
//     `data-campo`, `data-parte`, `data-asa-array`).
// Some parts are only ornament in Plain (ORNAMENT_CLASSES): plain.css hides them and a style that wants them shows
// them (DT-058 §9), as Old School does to put LabVIEW's illustrations there.
// The elements carry ARIA roles (button, switch, radio) instead of native buttons and inputs, which would take the
// keyboard focus away from the editor; typing is drawn by the editor as in Old School.

import { browseFolderGlyph, pathGlyph, visaIoGlyph } from "../common/glyphs.mjs";

/** Every kind of object an HTML panel draws: each one has rules in plain.css (DT-058 §3, a test checks it). */
export const PLAIN_KINDS = ["numeric", "enum", "string", "visa", "path", "boolean", "error-cluster", "array", "waveform-chart", "waveform-graph", "xy-graph"];

/** The parts that are only ornament in Plain: hidden by plain.css, shown by the style that draws them (a test checks it). */
export const ORNAMENT_CLASSES = ["sd-art", "sd-visa-glyph", "sd-path-glyph", "sd-radix", "sd-code-arrows", "sd-scrollbar", "sd-frame", "sd-plot-frame", "sd-swatch-frame"];

/** An illustration a style may paint over the whole object, such as Old School's drawing of a Boolean. */
const ART = `<span class="sd-art" aria-hidden="true"></span>`;

/** The Boolean styles by how Plain draws them: something pressed, something flipped, a light or a choice. */
const BUTTON_STYLES = new Set(["push-button", "rocker", "vert-rocker", "ok-button", "cancel-button", "stop-button"]);
const SWITCH_STYLES = new Set(["horizontal-toggle-switch", "vertical-toggle-switch", "slide-switch", "vertical-slide-switch"]);
const LED_STYLES = new Set(["round-led", "square-led"]);
const VERTICAL_STYLES = new Set(["vert-rocker", "vertical-toggle-switch", "vertical-slide-switch"]);
/** The text LabVIEW writes on its dialog buttons; the other Boolean controls show none. */
const BUTTON_TEXT = { "ok-button": "OK", "cancel-button": "Cancel", "stop-button": "STOP" };
/** The two choices of a fresh Radio Buttons control, as the Old School drawing shows them (glyphs.mjs). */
const RADIO_CHOICES = ["Radio Selection 1", "Radio Selection 2"];

export const escapeHtml = (text) => String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const px = (n) => `${Number(n.toFixed(2))}px`;
const boxStyle = (box) => `left:${px(box.x)};top:${px(box.y)};width:${px(box.ancho)};height:${px(box.alto)}`;

/**
 * The root of an object: its box on the panel, the public classes and the editor's hooks. `frame`:
 * `{ id, kind, isControl, box, label, selected, editing, classes, attributes }`.
 */
function objectFrame(frame, inner) {
  const classes = [
    "objeto-panel",
    frame.isControl ? "sd-control" : "sd-indicator",
    `sd-${frame.kind}`,
    ...(frame.classes ?? []),
    ...(frame.selected ? ["seleccionado", "sd-selected"] : []),
    ...(frame.editing ? ["editando-valor", "sd-editing"] : []),
  ];
  return `<div class="${classes.join(" ")}" data-nodo="${escapeHtml(frame.id)}" data-label="${escapeHtml(frame.label ?? "")}"${frame.attributes ?? ""} style="${boxStyle(frame.box)}">${inner}</div>`;
}

/** The two arrows of an incrementer; `axis` names the index of an array they move. */
const incrementer = (axis) =>
  `<span class="sd-incrementer"${axis ? ` data-eje="${axis}"` : ""}>` +
  `<span class="sd-step sd-step-up" role="button" aria-label="Increment" data-paso="1"></span>` +
  `<span class="sd-step sd-step-down" role="button" aria-label="Decrement" data-paso="-1"></span></span>`;

/** The arrows of an array's numeric element: only drawn, since its index steps, not the element (front-panel.mjs). */
const DECORATIVE_INCREMENTER = `<span class="sd-incrementer sd-decorative" aria-hidden="true"><span class="sd-step sd-step-up"></span><span class="sd-step sd-step-down"></span></span>`;

/** A field that shows a value: `valueHtml` is already escaped (it may hold the caret of the text being typed). */
const field = (id, valueHtml) => `<span class="sd-field"${id ? ` data-casilla="${escapeHtml(id)}"` : ""}><span class="sd-value">${valueHtml}</span></span>`;

/** A numeric control or indicator, or an enum (`enum: true`): an incrementer on a control, and its field. */
export function numericHtml(frame, { valueHtml, withIncrementer, isEnum }) {
  return objectFrame({ ...frame, kind: isEnum ? "enum" : "numeric" }, (withIncrementer ? incrementer() : "") + field(frame.id, valueHtml));
}

/** A string control or indicator: its text, with the lines it has. */
export const stringHtml = (frame, { valueHtml }) => objectFrame({ ...frame, kind: "string" }, field(frame.id, valueHtml));

/**
 * A VISA resource name control or indicator: the icon cell, the text field with its resource string and, on a control,
 * the dropdown button that lists the VISA resources (`data-visa-dropdown`, which the window answers). The I/O glyph is
 * ornament: Plain writes "I/O" in the cell and Old School draws the glyph.
 */
export function visaHtml(frame, { valueHtml }) {
  const icon = `<span class="sd-visa-icon"><span class="sd-visa-glyph" aria-hidden="true">${visaIoGlyph()}</span></span>`;
  const dropdown = frame.isControl ? `<span class="sd-dropdown" role="button" aria-haspopup="menu" aria-label="VISA resources" data-visa-dropdown></span>` : "";
  return objectFrame({ ...frame, kind: "visa" }, icon + field(frame.id, valueHtml) + dropdown);
}

/**
 * A File Path Control or Indicator: the type cell with the path glyph and the text field with the path. A control has
 * the browse button (`data-browse`, which the window answers with the system's file dialog) outside the box, to its right.
 */
export function pathHtml(frame, { valueHtml }) {
  const cell = `<span class="sd-path-cell"><span class="sd-path-glyph" aria-hidden="true">${pathGlyph()}</span></span>`;
  const browse = frame.isControl ? `<span class="sd-browse" role="button" aria-label="Browse for path" data-browse>${browseFolderGlyph()}</span>` : "";
  return objectFrame({ ...frame, kind: "path" }, cell + field(frame.id, valueHtml) + browse);
}

/** The inside of a Boolean, by its style (`data-style` keeps the exact one, so a style can tell a rocker from a push button). */
function booleanInner(style, on) {
  if (LED_STYLES.has(style)) return `<span class="sd-led" role="img" aria-label="${on ? "On" : "Off"}"><span class="sd-led-lens"></span></span>`;
  if (SWITCH_STYLES.has(style)) return `<span class="sd-switch" role="switch" aria-checked="${on}"><span class="sd-switch-thumb"></span></span>`;
  if (style === "radio-buttons") {
    const choices = RADIO_CHOICES.map((text, index) => `<span class="sd-radio" role="radio" aria-checked="${index === 0}"><span class="sd-radio-mark"></span>${escapeHtml(text)}</span>`);
    return `<span class="sd-radio-group" role="radiogroup">${choices.join("")}</span>`;
  }
  return `<span class="sd-button" role="button" aria-pressed="${on}">${escapeHtml(BUTTON_TEXT[style] ?? "")}</span>`;
}

/** A Boolean control or indicator: a button, a switch, an LED or a group of radio buttons. */
export function booleanHtml(frame, { style, on }) {
  const shape = BUTTON_STYLES.has(style) ? "sd-boolean-button" : SWITCH_STYLES.has(style) ? "sd-boolean-switch" : LED_STYLES.has(style) ? "sd-boolean-led" : "sd-boolean-radio";
  const classes = [shape, ...(VERTICAL_STYLES.has(style) ? ["sd-vertical"] : []), ...(on ? ["sd-on"] : [])];
  return objectFrame({ ...frame, kind: "boolean", classes, attributes: ` data-style="${escapeHtml(style)}"` }, ART + booleanInner(style, on));
}

/**
 * An error in or error out cluster: status, code and source, each with its caption. `fieldHtml(name)` gives the
 * escaped text of a field (or what is being typed into it).
 */
export function errorClusterHtml(frame, { status, fieldHtml }) {
  const part = (name, caption, inner) => `<span class="sd-error-part sd-error-${name}"><span class="sd-caption">${caption}</span>${inner}</span>`;
  // Ornament: the radix the code is shown in, the arrows of a control's code and the source's scrollbar, as LabVIEW draws them.
  const radix = `<span class="sd-radix" aria-hidden="true">d</span>`;
  const codeArrows = frame.isControl ? `<span class="sd-code-arrows" aria-hidden="true"></span>` : "";
  const scrollbar = `<span class="sd-scrollbar" aria-hidden="true"></span>`;
  return objectFrame(
    { ...frame, kind: "error-cluster", classes: status ? ["sd-on"] : [] },
    part("status", "status", `<span class="sd-error-light" data-campo="status" role="img" aria-label="${status ? "Error" : "No error"}"></span>`) +
      part("code", "code", `<span class="sd-field" data-campo="code">${radix}${codeArrows}<span class="sd-value">${fieldHtml("code")}</span></span>`) +
      part("source", "source", `<span class="sd-field" data-campo="source"><span class="sd-value">${fieldHtml("source")}</span>${scrollbar}</span>`),
  );
}

/**
 * One element of an array: `address` is its place (`data-k`), `place` its box inside the array's box, `on` the value
 * of a Boolean element.
 */
export function arrayElementHtml({ address, place, defined, editing, elementType, valueHtml, on, isControl, selected = false }) {
  const classes = ["sd-element", ...(defined ? [] : ["sd-empty"]), ...(editing ? ["sd-editing"] : []), ...(selected ? ["seleccionado"] : [])];
  const inside =
    elementType === "boolean"
      ? `<span class="sd-element-boolean" role="switch" aria-checked="${!!on}">${valueHtml}</span>`
      : `<span class="sd-field${elementType === "string" ? " sd-element-string" : ""}"><span class="sd-value">${valueHtml}</span></span>`;
  const step = isControl && elementType !== "string" && elementType !== "boolean" ? DECORATIVE_INCREMENTER : "";
  return `<span class="${classes.join(" ")}" data-k="${address}" style="left:${px(place.x)};top:${px(place.y)};width:${px(place.width)};height:${px(place.height)}">${step}${inside}</span>`;
}

/**
 * An array: its index (one per dimension) and the box of the elements it shows. `indices`: `{ axis, box, position }`;
 * `elementsBox`, the box of the elements inside the object; `handles`, the editor's resize handles while it is selected.
 */
export function arrayHtml(frame, { indices, elementsBox, elementsHtml, handles, undefinedElement = false }) {
  const indexHtml = indices
    .map(({ axis, box, position }) => `<span class="sd-index" data-eje="${axis}" style="left:${px(box.x)};top:${px(box.y)};width:${px(box.width)};height:${px(box.height)}">${incrementer(axis)}<span class="sd-field"><span class="sd-value">${position}</span></span></span>`)
    .join("");
  const elements = `<span class="sd-elements" style="left:${px(elementsBox.x)};top:${px(elementsBox.y)};width:${px(elementsBox.width)};height:${px(elementsBox.height)}">${elementsHtml}</span>`;
  return objectFrame({ ...frame, kind: "array", classes: [...(indices.length === 2 ? ["sd-two-dimensions"] : []), ...(undefinedElement ? ["sd-undefined"] : [])] }, indexHtml + elements + handles);
}

/** A graph: its SVG (graph-view.mjs), in the box of its frame. */
export const graphHtml = (frame, { kind, svg }) => objectFrame({ ...frame, kind, isControl: false, attributes: ` data-grafico="${escapeHtml(kind)}"` }, svg);

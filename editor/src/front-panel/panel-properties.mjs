// What the Front Panel answers a Property Node while an OVI runs (DT-072 §6): the panel's own state, which LabVIEW
// keeps in its user interface thread. A pure module over the graph and the panel's run state, so the window and the
// tests answer alike.
//
// The run state is, by node id, what a Property Node changed: `{ visible, disabled }`, and which control has the
// key focus. Measured in LabVIEW 2026 Q3 (labview-captures/reports/2026-10-30-panel-property-node-behavior.md):
// Visible FALSE hides a control and its label; Disabled 1 keeps the look and stops the control, 2 also greys it;
// Key Focus reads TRUE after a write while the panel is open. Unverified: whether these outlive the Run, and what
// Label.Text and Position written while running do; here the label and the place change as an edit would.

import { caja } from "./front-panel.mjs";
import * as Gr from "../../../core/model/graph.mjs";

/** The values of Disabled, in the order of its enum (measured). */
export const DISABLED = Object.freeze({ enabled: 0, disabled: 1, grayed: 2 });

/** LabVIEW's error for a control's caption when it has none (measured on the Caption row; Caption.Text unverified). */
const NO_CAPTION_ERROR = 1320;

export const emptyRunState = () => ({ objects: {}, keyFocus: null });

const objectState = (runState, nodeId) => runState.objects[nodeId] ?? {};

/** Whether the panel shows the object (Visible). */
export const isVisible = (runState, nodeId) => objectState(runState ?? emptyRunState(), nodeId).visible !== false;

/** Disabled: 0 enabled, 1 disabled, 2 disabled and greyed out. */
export const disabledOf = (runState, nodeId) => objectState(runState ?? emptyRunState(), nodeId).disabled ?? DISABLED.enabled;

/** Whether a click while running may operate the object: it is shown and enabled. */
export const isOperable = (runState, nodeId) => isVisible(runState, nodeId) && disabledOf(runState, nodeId) === DISABLED.enabled;

const nodeOf = (g, nodeId) => g.nodos.find((node) => node.id === nodeId);

/** A property read: its value, or `{ error }`. */
export function readProperty(g, runState, nodeId, property) {
  const node = nodeOf(g, nodeId);
  switch (property) {
    case "Visible":
      return isVisible(runState, nodeId);
    case "Disabled":
      return disabledOf(runState, nodeId);
    case "Key Focus":
      return runState.keyFocus === nodeId;
    case "Label:Text":
      return node?.label?.text ?? "";
    case "Has Caption":
      return false;
    case "Position":
      return { Left: node.panel.x, Top: node.panel.y };
    case "Bounds": {
      const box = caja(node);
      return { Width: box.ancho, Height: box.alto };
    }
    default:
      // The caption's rows: Solder's controls have no caption yet.
      return { error: NO_CAPTION_ERROR };
  }
}

/**
 * A property written: `{ runState, graph, answer }`, where `graph` is the graph changed (a label or a place), or
 * the same one, and `answer` is nothing or `{ error }`.
 */
export function writeProperty(g, runState, nodeId, property, value) {
  const withObject = (changes) => ({ ...runState, objects: { ...runState.objects, [nodeId]: { ...objectState(runState, nodeId), ...changes } } });
  const unchanged = { runState, graph: g, answer: undefined };
  switch (property) {
    case "Visible":
      return { ...unchanged, runState: withObject({ visible: !!value }) };
    case "Disabled":
      return { ...unchanged, runState: withObject({ disabled: Number(value) }) };
    case "Key Focus":
      // Writing FALSE to the control that has it takes the focus away; to any other one, nothing (unverified).
      return { ...unchanged, runState: { ...runState, keyFocus: value ? nodeId : runState.keyFocus === nodeId ? null : runState.keyFocus } };
    case "Label:Text":
      return { ...unchanged, graph: Gr.fijarEtiqueta(g, nodeId, String(value)) };
    case "Position": {
      const node = nodeOf(g, nodeId);
      return { ...unchanged, graph: Gr.moverEnPanel(g, [nodeId], value.Left - node.panel.x, value.Top - node.panel.y) };
    }
    default:
      // The caption's rows: Solder's controls have no caption yet.
      return { ...unchanged, answer: { error: NO_CAPTION_ERROR } };
  }
}

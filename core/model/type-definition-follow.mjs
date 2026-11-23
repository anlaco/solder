// How an OVI's objects follow the type definitions they are linked to (DT-096 §4, DT-104 stage b), as measured in
// LabVIEW 2026 Q3 (labview-captures/reports/2026-11-23-typedef-instances.md; 2026-11-17-typedef-update.md Q3):
//
// - An instance follows its definition when the OVI opens and when File ▸ Apply Changes is chosen in the definition's
//   editor; Save alone does not apply (Q6). Following is silent and does not mark the OVI modified (Q5, Q6).
// - An update that would lose or change a default the instance holds is not made: the OVI is broken until Review and
//   Update from Type Def... approves it ("cannot update from type definition without incorrectly preserving default
//   values", Q5).
// - An instance with Auto-Update from Type Def. unticked never follows by itself: when the definition differs the OVI
//   is broken ("Control does not match its type definition", Q2); ticking it again follows at once. A strict instance
//   has no such row and always follows.
// - A definition saved but not applied leaves the instances that differ broken until it is applied (Q6: the instance
//   is drawn ghosted). The words LabVIEW gives then were not read: Solder says that it does not match.
//
// Pure. The instance's own block of each element (a control's are controls, an indicator's indicators) is the
// editor's knowledge: it passes `toInstanceElement`, as type-definition-update.mjs asks.

import { readTypeDefinition, typeDefinitionLink } from "./type-definition.mjs";
import { updateFromDefinition } from "./type-definition-update.mjs";

/** What an instance does with its definition. */
export const FOLLOWING = Object.freeze({ matches: "matches", update: "update", review: "review", mismatch: "mismatch" });

/** Does the instance follow its definition by itself? Auto-Update is ticked unless the link says otherwise; strict always. */
export const followsAutomatically = (link) => !!link && (link.strict || link["auto-update"] !== false);

/** The Error list's words for an instance that does not match its definition (measured, Q2), with its label. */
export const mismatchReason = (label) => `Type Definition '${label || " "}': Control does not match its type definition.`;
export const MISMATCH_DETAIL = "You must right-click this control and select Update or Disconnect from Type Def.";

/** The Error list's words for an update that waits for a review (measured, Q5), Solder in LabVIEW's place. */
export const reviewReason = (label) => `Type Definition '${label || " "}': Solder cannot update from type definition without incorrectly preserving default values.`;
export const REVIEW_DETAIL = "You must right-click this control and select Review and Update from Type Def...";

/** The same value whatever the order of its keys: an update spreads configurations, which reorders them. */
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).filter((key) => value[key] !== undefined).sort().map((key) => [key, canonical(value[key])]));
}
const sameObject = (left, right) => JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));

/** `object` without its default values, at every level of its elements. */
function withoutDefaultValues(object) {
  const { value: _default, ...config } = object.config ?? {};
  return { ...object, config: config.elements ? { ...config, elements: config.elements.map(withoutDefaultValues) } : config };
}

/** An element's place matters to a strict instance; the place of the object itself in the control editor matters to none. */
const withoutOwnPlace = ({ x: _x, y: _y, ...object }) => object;

/**
 * Whether the type definition of `currentText` has something to Apply over `appliedText`, the `.octl` last applied (File
 * ▸ Apply Changes of the control editor, measured greyed at open, after Apply, after a change of default values only, and
 * after Save; enabled after a structural change, reports/2026-11-23-typedef-instances.md Q3, Q6): its ring or its
 * object differs in anything but default values. Unmeasured: moving the object in the editor (taken as no change).
 */
export function hasChangesToApply(catalog, appliedText, currentText) {
  const [applied, current] = [appliedText, currentText].map((text) => readTypeDefinition(text, catalog));
  const structure = (definition) => withoutOwnPlace(withoutDefaultValues(definition.object));
  return applied.kind !== current.kind || !sameObject(structure(applied), structure(current));
}

/**
 * What `instance` does with `definition` (the object of its `.octl`): `{ state }`, with `node` (the instance updated)
 * when it is `update`, and `review` (type-definition-update.mjs) when it is `review`.
 */
export function followDefinition(catalog, instance, definition, toInstanceElement) {
  const { node, review } = updateFromDefinition(catalog, instance, definition, toInstanceElement);
  if (review === null && sameObject(node, instance)) return { state: FOLLOWING.matches };
  if (!followsAutomatically(typeDefinitionLink(instance))) return { state: FOLLOWING.mismatch };
  if (review) return { state: FOLLOWING.review, review };
  return { state: FOLLOWING.update, node };
}

/** The Error list's entry for an instance that is left behind its definition. */
const brokenEntry = (instance, state) => {
  const label = instance.label?.text;
  return state === FOLLOWING.review
    ? { node: instance.name, motivo: reviewReason(label), detail: REVIEW_DETAIL }
    : { node: instance.name, motivo: mismatchReason(label), detail: MISMATCH_DETAIL };
};

/**
 * The graph `g` with its instances following their definitions. `definitionOf(instance)` gives the definition's object,
 * or null when it is missing (an error of its own, hierarchy.mjs). With `apply` (the OVI opens, Apply Changes), the
 * instances that can follow are updated; without it (a definition saved, not applied) they are left as they are and
 * broken. Returns `{ g, broken }`: the graph (the same one when nothing changed) and the Error list's entries
 * `{ node, motivo, detail }` of the instances left behind.
 */
export function followDefinitions(catalog, g, definitionOf, { apply, toInstanceElement }) {
  const broken = [];
  let changed = false;
  const nodos = g.nodos.map((node) => {
    if (typeof typeDefinitionLink(node)?.path !== "string") return node;
    const definition = definitionOf(node);
    if (!definition) return node;
    const following = followDefinition(catalog, node, definition, toInstanceElement);
    if (following.state === FOLLOWING.matches) return node;
    if (following.state === FOLLOWING.update && apply) {
      changed = true;
      return following.node;
    }
    broken.push(brokenEntry(node, following.state === FOLLOWING.update ? FOLLOWING.mismatch : following.state));
    return node;
  });
  return { g: changed ? { ...g, nodos } : g, broken };
}

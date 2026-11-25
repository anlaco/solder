// Updating an object from the type definition it follows (DT-096 §4), as LabVIEW does when the `.ctl` is applied
// (measured: reports/2026-11-17-typedef-update.md Q3).
//
// - The object keeps its role (control, indicator or constant), its label, its place and its own default value; it
//   takes the definition's data: types, enum and ring items, elements.
// - A scalar panel object takes the definition's block when it differs (Replace ▸ Round LED in the control editor, then
//   Apply Changes): the same node, so its wires stay, in its own role (a control stays a control). What LabVIEW does with
//   an instance whose definition's block was replaced was not measured: unverified. The editor knows which block is the
//   counterpart (`toInstanceBlock`); with none, the instance cannot follow and is reported (`unfollowable`), not guessed.
// - A cluster's elements are matched by label, so a value follows its element when the elements are reordered
//   (measured), the unlabelled ones (a Cluster Constant's) by their place in the order; a new element takes the
//   definition's value. Whether LabVIEW matches by name or by an element's own identity is unverified: a renamed
//   element keeps its link (reports/2026-11-23-typedef-instances.md Q4), but what it follows then was not measured.
// - An enum's value follows its item by text when the item moves (measured); a numeric's is converted to the new
//   representation (3.7 becomes 4 in an I32, measured).
// - A non-strict instance keeps its own look (the elements' places and styles); a strict one takes the definition's
//   (measured: an element's size reached a strict instance only). The same holds for the object's own size.
// - When the update would lose or change a default the object holds (an element with a value removed, a value
//   converted, a held enum item renamed or removed), it is not applied: LabVIEW breaks the VI until Review and Update
//   from Type Def... approves the new default. An object whose defaults are all zero updates silently (measured: the
//   indicator at 0).
//
// Pure. The block an element takes in the instance (a control's elements are controls, an indicator's indicators, a
// constant's constants) is the editor's knowledge: it passes `toInstanceElement(element, instance)`, given the
// definition's element and the instance being updated, whose block says which of the three it is. The same for the
// block of a scalar instance: `toInstanceBlock(definition, instance)` gives `{ tipo, config }`, or null for none.

import { convertirValor, esEnum, esNumerico } from "./types.mjs";
import { hasElements, withDerivedCluster } from "./user-cluster.mjs";
import { typeDefinitionLink } from "./type-definition.mjs";

/** The keys of a configuration that are data, which every instance follows; the rest is look, which only a strict one follows. */
const DATA_KEYS = ["type", "items", "allow-undefined", "elements"];

/** A value whose loss LabVIEW does not ask about: the type's zero, or none stored. */
const isZeroDefault = (value) => value === undefined || value === 0 || value === false || value === "";

/** `config` with only its data keys. */
const dataOf = (config = {}) => Object.fromEntries(DATA_KEYS.filter((key) => key in config).map((key) => [key, config[key]]));

/** The value an enum holds after its items change: the same item where it still is, else the same number, within the items. */
function followedEnumValue(ownValue, ownItems, newItems) {
  const index = ownValue ?? 0;
  const followed = newItems.indexOf(ownItems[index]);
  if (followed >= 0) return { value: followed, kept: true };
  return { value: Math.min(index, newItems.length - 1), kept: false };
}

/** A scalar's value under its new type, and whether it is the value it had. */
function convertedValue(ownConfig, newType) {
  const ownValue = ownConfig?.value;
  if (ownValue === undefined) return { value: undefined, kept: true };
  if (esEnum(newType) && esEnum(ownConfig.type)) return followedEnumValue(ownValue, ownConfig.type.enum, newType.enum);
  if (esNumerico(newType) && typeof ownValue === "number") {
    const value = convertirValor(ownValue, newType);
    return { value, kept: Object.is(value, ownValue) };
  }
  return { value: ownValue, kept: true };
}

/**
 * What a scalar panel object takes when the definition's block is not its own: `{ own, losses }`, the node with the
 * counterpart's block and configuration (the editor gives it, in the object's role) and the default it held lost, the
 * new block having the definition's. Null when the block is the same; `{ unfollowable: true }` when there is no
 * counterpart. A cluster's family is its own, and a constant's block is not the definition's.
 */
function withDefinitionBlock(own, definition, context) {
  const isScalarPanelObject = context.toInstanceBlock && !hasElements(definition) && !hasElements(own) && context.catalog.bloque(own.tipo)?.panel;
  const counterpart = isScalarPanelObject && context.toInstanceBlock(definition, own);
  if (counterpart === null) return { unfollowable: true };
  if (!counterpart || counterpart.tipo === own.tipo) return null;
  const { value: _definitionValue, ...config } = counterpart.config ?? {};
  const losses = isZeroDefault(own.config?.value) ? [] : [{ label: own.label?.text ?? "", previous: own.config.value, proposed: undefined }];
  // The new block has its own size; a size the old one was given does not carry over (as in Replace ▸, DT-092).
  const panel = own.panel && { x: own.panel.x, y: own.panel.y };
  return { own: { ...own, tipo: counterpart.tipo, ...(panel && { panel }), config: { ...config, ...(own.config?.typedef && { typedef: own.config.typedef }) } }, losses };
}

/**
 * An object (the instance, or one of its elements) updated from its counterpart in the definition. Returns the object
 * and the defaults it would lose, each `{ label, previous, proposed }`.
 */
function updatedObject(own, definition, context) {
  const base = context.strict ? { ...definition.config } : { ...own.config, ...dataOf(definition.config) };
  const { value: _definitionValue, ...config } = base;
  const losses = [];
  if (hasElements(definition)) {
    const updated = updatedElements(own.config?.elements ?? [], definition.config.elements, context);
    config.elements = updated.elements;
    losses.push(...updated.losses);
  } else {
    const converted = convertedValue(own.config, definition.config?.type);
    if (converted.value !== undefined) config.value = converted.value;
    if (!converted.kept && !isZeroDefault(own.config?.value)) losses.push({ label: own.label?.text ?? "", previous: own.config.value, proposed: converted.value });
  }
  return { object: withDerivedCluster(context.catalog, { ...own, config }), losses };
}

/**
 * The element of the instance that `definitionElement` (the one at `index` of the definition's) updates: the one with
 * its label, or, when it has none, the one at its place of the order (a Cluster Constant's elements have no label, so
 * matching by label would take the last for all). An element is matched once.
 */
function ownElementFor(ownElements, definitionElement, index, matched) {
  const label = definitionElement.label?.text ?? "";
  if (label !== "") return ownElements.find((own) => own.label?.text === label && !matched.has(own));
  const positional = ownElements[index];
  return positional && (positional.label?.text ?? "") === "" && !matched.has(positional) ? positional : undefined;
}

/** A cluster's elements updated from the definition's, matched by label; the removed ones that held a value are losses. */
function updatedElements(ownElements, definitionElements, context) {
  const matched = new Set();
  const losses = [];
  const elements = definitionElements.map((definitionElement, index) => {
    const fresh = context.toInstanceElement(definitionElement);
    const own = ownElementFor(ownElements, definitionElement, index, matched);
    if (!own) return withDerivedCluster(context.catalog, fresh);
    matched.add(own);
    const updated = updatedObject({ ...own, tipo: fresh.tipo }, fresh, context);
    losses.push(...updated.losses);
    const place = context.strict ? { x: fresh.x, y: fresh.y } : { x: own.x, y: own.y };
    return { ...updated.object, ...place };
  });
  for (const removed of ownElements.filter((element) => !matched.has(element))) {
    if (!isZeroDefault(removed.config?.value)) losses.push({ label: removed.label?.text ?? "", previous: removed.config.value, proposed: undefined });
  }
  return { elements, losses };
}

/** A strict instance's panel with the size of the definition's object, when the definition has one; a non-strict one keeps its own (the look rule). */
const sizeFollowed = (object, definition) => (object.panel && definition.w !== undefined ? { panel: { ...object.panel, w: definition.w, h: definition.h } } : {});

/**
 * `instance` updated from `definition` (the object of its `.octl`, core/model/type-definition.mjs). Returns
 * `{ node, review }`: with nothing lost, `node` is the updated instance and `review` null; otherwise `node` is the
 * instance unchanged and `review` is `{ updated, previous, proposed, losses }`, what Review and Update from Type
 * Def... shows and applies once approved: the update, the previous and the new default, and what changes in it.
 */
export function updateFromDefinition(catalog, instance, definition, toInstanceElement = (element, _instance) => element, toInstanceBlock) {
  const link = typeDefinitionLink(instance);
  const context = { catalog, strict: !!link?.strict, toInstanceElement: (element) => toInstanceElement(element, instance), toInstanceBlock };
  let own = instance;
  const losses = [];
  const followed = withDefinitionBlock(instance, definition, context);
  if (followed?.unfollowable) return { node: instance, review: null, unfollowable: true };
  if (followed) {
    ({ own } = followed);
    losses.push(...followed.losses);
  }
  const updatedOwn = updatedObject(own, definition, context);
  losses.push(...updatedOwn.losses);
  const { object } = updatedOwn;
  const updated = { ...object, config: { ...object.config, ...(link && { typedef: link }) }, ...(context.strict && sizeFollowed(object, definition)) };
  if (!losses.length) return { node: updated, review: null };
  return { node: instance, review: { updated, previous: instance.config?.value, proposed: updated.config?.value, losses } };
}

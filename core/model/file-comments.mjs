// The `comment` any object of a Solder file may hold (DT-100 §6): the user's text, which no reader gives a meaning to
// and every writer puts back on the object it was on. A pure module, shared by the four formats.
//
// A reader takes the comments out before it reads (`takeComments`), so nothing downstream (the graph, the compiler, the
// editor) ever sees a `comment` key; it keeps them in a table by the place of their object, and the writer puts them
// back on the objects at the same places (`putComments`). A place names an array's element by what identifies it, not by
// its position, so that a comment follows its object when the list is re-sorted or another element is removed: an
// element's `name`, an instance's `ovi`, a wire's two ends; only what has none of them is named by its position.
//
// The comment is written as the first key of its object, so that a person reading the file meets it before what it
// talks about; a comment typed elsewhere in the object moves there on the next save, still on its object.

export const COMMENT_KEY = "comment";

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

/** What names an element of an array in a place: see the module's comment. */
export function elementIdentity(element, index) {
  if (isObject(element)) {
    if (typeof element.name === "string") return `name=${element.name}`;
    if (typeof element.ovi === "string") return `ovi=${element.ovi}`;
    if ("from" in element && "to" in element) return `wire=${JSON.stringify([element.from, element.to])}`;
  }
  return `#${index}`;
}

/**
 * The place of every object is a list of steps from the file's root: a key, or an element's identity. `stepInto(place,
 * key, child, index)` gives a child's place from its parent's; formats that need more (the `.ovi` gives a node's objects
 * to the node, ovi-comments.mjs) pass their own.
 */
export const pathStep = (place, key, child, index) => (index === undefined ? [...place, key] : [...place, key, elementIdentity(child, index)]);

/**
 * Keys whose value is data, never read for comments: a cluster's value is an object keyed by its fields' names
 * (spec/03), and a field may well be called `comment`.
 */
const DATA_VALUE_KEYS = new Set(["default"]);

/** A copy of `object` with every object in it rebuilt by `rebuild(object, place)`, children first. */
function mapObject(object, place, stepInto, rebuild) {
  const copy = {};
  for (const [key, child] of Object.entries(object)) {
    if (child === null || typeof child !== "object" || DATA_VALUE_KEYS.has(key)) copy[key] = child;
    else if (Array.isArray(child)) copy[key] = mapArray(child, place, key, stepInto, rebuild);
    else copy[key] = mapObject(child, stepInto(place, key, child), stepInto, rebuild);
  }
  return rebuild(copy, place);
}

/** The same for the array held at `key` of the object at `parentPlace`; an array inside an array is held at "[]". */
function mapArray(array, parentPlace, key, stepInto, rebuild) {
  return array.map((element, index) => {
    if (element === null || typeof element !== "object") return element;
    const place = stepInto(parentPlace, key, element, index);
    return Array.isArray(element) ? mapArray(element, place, "[]", stepInto, rebuild) : mapObject(element, place, stepInto, rebuild);
  });
}

/** A place as a key of the table of comments. */
export const placeKey = (place) => JSON.stringify(place);

/** @typedef {{ stepInto?: (place: any, key: string, child: object, index?: number) => any, rootPlace?: any }} PlaceOptions */

/**
 * The file without its comments, and the comments as `[place, text]` pairs, each place as `stepInto` builds it from
 * `rootPlace`. A `comment` that is not text is not the user's comment in this sense and is left where it is.
 * @param {object} file
 * @param {PlaceOptions} [options]
 */
export function takeComments(file, { stepInto = pathStep, rootPlace = [] } = {}) {
  const comments = [];
  const stripped = mapObject(file, rootPlace, stepInto, (object, place) => {
    if (typeof object[COMMENT_KEY] !== "string") return object;
    const { [COMMENT_KEY]: text, ...rest } = object;
    comments.push([place, text]);
    return rest;
  });
  return { file: stripped, comments };
}

/**
 * The file with the comment `commentAt(place)` gives (or none, for undefined) put first in each object.
 * @param {object} file
 * @param {(place: any) => string | undefined} commentAt
 * @param {PlaceOptions} [options]
 */
export function putComments(file, commentAt, { stepInto = pathStep, rootPlace = [] } = {}) {
  return mapObject(file, rootPlace, stepInto, (object, place) => {
    const text = commentAt(place);
    return text === undefined ? object : { [COMMENT_KEY]: text, ...object };
  });
}

/** The comments of a file as a table by place, the form a format keeps beside what it read: `{ [placeKey]: text }`. */
export const commentTable = (comments) => (comments.length ? Object.fromEntries(comments.map(([place, text]) => [placeKey(place), text])) : undefined);

/** The comment of `place` in a table made by `commentTable` (which may be undefined). */
export const fromTable = (table) => (place) => table?.[placeKey(place)];

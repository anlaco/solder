// The comments of an `.ovi` (DT-100 §6), kept where the editor's graph keeps the objects they are on. A pure module.
//
// A node of the graph is several objects of the file: its entry in `nodes` or `structures`, its `front-panel` item, its
// places in `layout.diagram` and `layout.panel`, its connector terminal, and what each of those holds (a configuration,
// a cluster's elements, a structure's frames). A comment on any of them belongs to the node, `node.comments`, by its place
// within the node: so it goes where the node goes (into a structure), it leaves with the node when the
// node is deleted, and a later node that takes the same name does not find it. A wire inside a structure is the
// structure's, by its frame and its two ends: a Case's frames may each hold a wire between the same two terminals. Every
// other comment (the file's, a wire of the OVI's own diagram, a free label's, the metadata's) stays in the graph's own
// table, `g.comments`, by its place in the file.

import { elementIdentity, placeKey, putComments, takeComments } from "./file-comments.mjs";

/** The arrays whose elements, named by `name`, are nodes of the graph (a structure's tunnels and shift registers too). */
const NODE_ARRAYS = new Set(["front-panel", "nodes", "structures", "tunnels", "shift-registers"]);

/** The connector's arrays: a terminal names the panel object it stands for. */
const CONNECTOR_ARRAYS = new Set(["inputs", "outputs"]);

/** The layout's maps whose keys are a node's name, or a name and what of it (`while_1.i`, `register_1.right`). */
const LAYOUT_PLACES = new Set(["diagram", "panel"]);

const FILE_ROOT = Object.freeze({ owner: null, path: [] });

/** Is `place` the object at `path` of the file itself, outside any node? */
const isFilePlace = (place, ...path) => place.owner === null && place.path.length === path.length && path.every((step, index) => place.path[index] === step);

/** A node's name as the layout writes it, before the dot of a structure's terminal or a register's right side. */
const ownerOfLayoutKey = (key) => key.split(".")[0];

/** The place of an object of the `.ovi`: which node owns it (null for none) and its path from there. */
function oviStep(place, key, child, index) {
  if (index === undefined) {
    if (place.owner === null && place.path.length === 2 && place.path[0] === "layout" && LAYOUT_PLACES.has(place.path[1])) return { owner: ownerOfLayoutKey(key), path: [`@layout.${place.path[1]}`, key] };
    return { owner: place.owner, path: [...place.path, key] };
  }
  const identity = elementIdentity(child, index);
  const ownsNode = NODE_ARRAYS.has(key) || (CONNECTOR_ARRAYS.has(key) && isFilePlace(place, "connector"));
  if (ownsNode && typeof child.name === "string") return { owner: child.name, path: [`@${key}`] };
  return { owner: place.owner, path: [...place.path, key, identity] };
}

const OVI_PLACES = { stepInto: oviStep, rootPlace: FILE_ROOT };

/**
 * The `.ovi` file without its comments, and its comments split by owner: `byNode` maps a node's name to its table
 * (`{ [path]: text }`), `rest` is the table of everything else (`{ [place]: text }`).
 */
export function separateOviComments(file) {
  const { file: stripped, comments } = takeComments(file, OVI_PLACES);
  const byNode = new Map();
  const rest = {};
  for (const [place, text] of comments) {
    if (place.owner === null) rest[placeKey(place)] = text;
    else byNode.set(place.owner, { ...byNode.get(place.owner), [placeKey(place.path)]: text });
  }
  return { file: stripped, byNode, rest };
}

/**
 * The graph with each node's comments on the node and the rest in `g.comments`; a comment whose node is not in the graph
 * (a hand-written file) is kept in `g.comments` by its whole place, and goes back where it was while nothing takes it.
 */
export function withOviComments(g, { byNode, rest }) {
  const remaining = { ...rest };
  const unclaimed = new Map(byNode);
  const nodes = g.nodos.map((node) => {
    const own = node.name === undefined ? undefined : unclaimed.get(node.name);
    if (!own) return node;
    unclaimed.delete(node.name);
    return { ...node, comments: own };
  });
  for (const [owner, table] of unclaimed) for (const [path, text] of Object.entries(table)) remaining[placeKey({ owner, path: JSON.parse(path) })] = text;
  const commented = { ...g, nodos: nodes };
  if (Object.keys(remaining).length) commented.comments = remaining;
  return commented;
}

/** The `.ovi` file written from `g` with the comments of its nodes and its own put back. */
export function putOviComments(file, g) {
  const byName = new Map(g.nodos.filter((node) => node.comments && node.name !== undefined).map((node) => [node.name, node.comments]));
  if (!byName.size && !g.comments) return file;
  const commentAt = (place) => byName.get(place.owner)?.[placeKey(place.path)] ?? g.comments?.[placeKey(place)];
  return putComments(file, commentAt, OVI_PLACES);
}

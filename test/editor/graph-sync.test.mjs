// The two windows of a VI hold one graph each and swap copies over a
// BroadcastChannel (editor-window.mjs). graph-sync.mjs stamps every copy so
// that messages that cross on their way cannot leave each window holding the
// other's older version (the saved .qvi must be what the user last saw).

import assert from "node:assert/strict";
import { test } from "node:test";

import * as Sync from "../../editor/src/window/graph-sync.mjs";

/** A window as the page behaves: the graph it holds, its stamp and the messages that have not reached it yet. */
function makeWindow(name, graph) {
  return { name, graph, stamp: Sync.initialStamp(), inbox: [] };
}

/** The window changes its graph: it holds it and sends it to the other one. */
function edit(window, other, graph) {
  window.graph = graph;
  window.stamp = Sync.afterLocalChange(window.stamp, window.name);
  other.inbox.push({ graph, stamp: window.stamp });
}

/** The window reads its next message, as canal.onmessage does. */
function receive(window, other) {
  const message = window.inbox.shift();
  const verdict = Sync.judgeIncoming(window.stamp, message.stamp);
  if (verdict === "stale") return other.inbox.push({ graph: window.graph, stamp: window.stamp });
  window.stamp = message.stamp;
  window.graph = message.graph;
}

/** Delivers everything that is on its way, in both directions, until the windows are quiet. */
function settle(a, b) {
  while (a.inbox.length || b.inbox.length) {
    if (a.inbox.length) receive(a, b);
    if (b.inbox.length) receive(b, a);
  }
}

test("a newer copy is taken and an older one is answered with the newer", () => {
  const held = { revision: 3, origin: "block-diagram" };
  assert.equal(Sync.judgeIncoming(held, { revision: 4, origin: "front-panel" }), "newer");
  assert.equal(Sync.judgeIncoming(held, { revision: 2, origin: "front-panel" }), "stale");
  assert.equal(Sync.judgeIncoming(held, { ...held }), "same");
  assert.deepEqual(Sync.afterLocalChange(held, "front-panel"), { revision: 4, origin: "front-panel" });
});

test("changes made one after the other, in either window, reach the other window in order", () => {
  const diagram = makeWindow("block-diagram", "start");
  const panel = makeWindow("front-panel", "start");
  edit(diagram, panel, "tick count deleted");
  settle(diagram, panel);
  edit(panel, diagram, "stop button released");
  settle(diagram, panel);
  edit(diagram, panel, "stop dragged into the loop");
  settle(diagram, panel);
  assert.equal(panel.graph, "stop dragged into the loop");
  assert.equal(diagram.graph, panel.graph);
});

test("copies that cross on their way do not swap the windows' graphs: both end on the same one", () => {
  const diagram = makeWindow("block-diagram", "start");
  const panel = makeWindow("front-panel", "start");
  // Each window changes its copy before the other's message has arrived.
  edit(diagram, panel, "diagram's version");
  edit(panel, diagram, "panel's version");
  settle(diagram, panel);
  assert.equal(diagram.graph, panel.graph, "without stamps each would now hold the other's version");
  assert.equal(diagram.stamp.revision, panel.stamp.revision);
  assert.deepEqual(diagram.stamp, panel.stamp);
});

test("a stale message that arrives late does not overwrite a newer graph", () => {
  const diagram = makeWindow("block-diagram", "start");
  const panel = makeWindow("front-panel", "start");
  edit(diagram, panel, "first");
  edit(diagram, panel, "second");
  // The panel reads the second one first (a message overtaken on its way) and then the first.
  panel.inbox.reverse();
  settle(diagram, panel);
  assert.equal(panel.graph, "second");
  assert.equal(diagram.graph, "second");
});

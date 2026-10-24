// The window is redrawn by bringing the live page to a fresh render (dom-morph.mjs): what did not
// change stays the same element, so a click that spans a redraw still reaches its button.

import assert from "node:assert/strict";
import { test } from "node:test";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";

import { morphChildren } from "../../editor/src/window/dom-morph.mjs";

const parse = (markup) => new DOMParser().parseFromString(`<body>${markup}</body>`, "text/xml").documentElement;
const markupOf = (body) => Array.from(body.childNodes).map((node) => new XMLSerializer().serializeToString(node)).join("");

/** Morphs `before` into `after` and returns the live body. */
function morph(before, after) {
  const live = parse(before);
  morphChildren(live, parse(after));
  return live;
}

test("an element whose markup did not change is the same element after a redraw, while an indicator changes", () => {
  const live = parse(`<div class="toolbar"><span data-id="abort">x</span></div><div class="value">41</div>`);
  const abortButton = live.getElementsByTagName("span")[0];
  morphChildren(live, parse(`<div class="toolbar"><span data-id="abort">x</span></div><div class="value">42</div>`));
  assert.equal(live.getElementsByTagName("span")[0], abortButton, "the Abort button was replaced by a new element");
  assert.equal(markupOf(live), `<div class="toolbar"><span data-id="abort">x</span></div><div class="value">42</div>`);
});

test("attributes are set, changed and removed as in the fresh render", () => {
  const live = morph(`<a class="old" title="t">x</a>`, `<a class="new" data-id="7">x</a>`);
  assert.equal(markupOf(live), `<a class="new" data-id="7">x</a>`);
});

test("children are added, removed and replaced when their kind changes", () => {
  assert.equal(markupOf(morph(`<p>a</p>`, `<p>a</p><p>b</p>text`)), `<p>a</p><p>b</p>text`);
  assert.equal(markupOf(morph(`<p>a</p><p>b</p><i>c</i>`, `<p>a</p>`)), `<p>a</p>`);
  assert.equal(markupOf(morph(`<p>a</p><i>b</i>`, `<p>a</p><b>b</b>`)), `<p>a</p><b>b</b>`);
});

test("nested markup ends exactly as the fresh render", () => {
  const after = `<svg viewBox="0 0 4 4"><g class="wire"><path d="M0 0L4 4"/></g></svg><ul><li>1</li><li>2</li></ul>`;
  assert.equal(markupOf(morph(`<svg viewBox="0 0 2 2"><g><path d="M0 0"/><path d="M1 1"/></g></svg><ul><li>9</li></ul>`, after)), after);
});

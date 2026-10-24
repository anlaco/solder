// Brings the live page to the markup of a fresh render by changing only what differs, instead of
// replacing the whole body. A window is drawn from its state on every change, and while a VI runs
// that is on every value it writes; replacing the body made every element a new one each time, so
// a press and a release on a toolbar button landed on two different elements and the browser
// never made a click of them (Abort could not stop a loop that writes all the time). Elements whose
// markup did not change stay the same objects, with their hover and their press.
//
// Elements are matched by position: the window's markup keeps its structure from one render to the
// next. It uses only the core DOM (child nodes and attributes as array-likes, insert and remove, the
// `data` of text), so it runs on any DOM.

const ELEMENT_NODE = 1;

/** Makes the children of `live` the children of `fresh`; the nodes that are new are moved out of `fresh`. */
export function morphChildren(live, fresh) {
  const liveChildren = Array.from(live.childNodes);
  const freshChildren = Array.from(fresh.childNodes);
  freshChildren.forEach((freshChild, index) => {
    if (index < liveChildren.length) morphNode(live, liveChildren[index], freshChild);
    else live.appendChild(freshChild);
  });
  for (const extra of liveChildren.slice(freshChildren.length)) live.removeChild(extra);
}

function morphNode(parent, liveNode, freshNode) {
  if (liveNode.nodeType !== freshNode.nodeType || liveNode.nodeName !== freshNode.nodeName) {
    parent.replaceChild(freshNode, liveNode);
    return;
  }
  if (liveNode.nodeType !== ELEMENT_NODE) {
    if (liveNode.data !== freshNode.data) liveNode.data = freshNode.data;
    return;
  }
  syncAttributes(liveNode, freshNode);
  morphChildren(liveNode, freshNode);
}

function syncAttributes(live, fresh) {
  for (const { namespaceURI, name, value } of Array.from(fresh.attributes)) {
    if (live.getAttribute(name) === value) continue;
    if (namespaceURI) live.setAttributeNS(namespaceURI, name, value);
    else live.setAttribute(name, value);
  }
  for (const { name } of Array.from(live.attributes)) if (!fresh.hasAttribute(name)) live.removeAttribute(name);
}

/** Draws `html` as the content of `element`, keeping every node whose markup did not change. */
export function morphInnerHtml(element, html) {
  const fresh = element.ownerDocument.createElement(element.nodeName);
  fresh.innerHTML = html;
  morphChildren(element, fresh);
}

// The window style of a VI (DT-058 §1–2) in its page: a <style> after every other sheet, so its rules win over the
// editor's panel style with the same specificity.

const ELEMENT_ID = "sd-window-style";

/** Puts `text` as the page's window style; an empty text leaves the panel in the editor's style. */
export function applyWindowStyle(page, text) {
  let element = page.getElementById(ELEMENT_ID);
  if (!element) {
    element = page.createElement("style");
    element.id = ELEMENT_ID;
  }
  element.textContent = text ?? "";
  // Appended again each time, so it stays last even if another sheet was added after it.
  page.head.append(element);
}

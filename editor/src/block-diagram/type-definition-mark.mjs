// The mark of a diagram object that follows a type definition (DT-096, DT-104), as measured in LabVIEW 2026 Q3
// (labview-captures/reports/2026-11-24-typedef-mark-and-footer.md Q1): a right triangle in the object's top-left corner,
// legs of 8 px, drawn from the outer corner over the border, its rows 8, 7, … 1 px wide with no anti-aliasing. A linked
// constant's is dark grey; a linked control's terminal's is black. The Front Panel object shows none.

import { typeDefinitionLink } from "../../../core/model/type-definition.mjs";

const LEG = 8;

/** The staircase of the triangle, one step a row, so no edge pixel is blended (measured: one flat colour). */
const STAIRCASE = (() => {
  const steps = [];
  for (let row = 0; row < LEG; row++) steps.push(`H${LEG - row}V${row + 1}`);
  return `M0 0${steps.join("")}H0Z`;
})();

/** The mark's HTML for `node`, or "" when it follows no type definition. Its colour is the theme's (styles.css). */
export function typeDefinitionMarkHtml(node) {
  if (typeof typeDefinitionLink(node)?.path !== "string") return "";
  const kind = node.panel ? "terminal" : "constant";
  return `<svg class="typedef-mark typedef-mark-${kind}" width="${LEG}" height="${LEG}" viewBox="0 0 ${LEG} ${LEG}" shape-rendering="crispEdges" aria-hidden="true"><path d="${STAIRCASE}"/></svg>`;
}

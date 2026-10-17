// Old School's illustrations as SVG files of the panel style (DT-058 §9): what CSS does not draw (the incrementer's
// capsule, and later the gradients of the Booleans and the check of an error's status) is taken by old-school.css
// as background images from panel-styles/old-school/.
//
// The drawings stay in glyphs.mjs, which the palette and the diagram's terminals also use; the files are written
// from them by scripts/old-school-art.mjs, and a test fails when a file differs from what this module gives, so the
// two never drift. Each file is the inline drawing of the old panel, which a pixel diff showed to give the same pixels
// as a background image.

import { INCREMENTER } from "../common/glyphs.mjs";

/** The directory of the files, relative to editor/src/panel-styles/. */
export const OLD_SCHOOL_ART_DIRECTORY = "old-school";

const svgFile = ({ width, height, drawing }) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${drawing}</svg>\n`;

/** Every file of the style: its name and its content. */
export const oldSchoolArt = () => [{ name: "incrementer.svg", content: svgFile(INCREMENTER) }];

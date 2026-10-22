// Old School's illustrations as SVG files of the panel style (DT-058 §9): what CSS does not draw (the incrementer's
// capsule, the Booleans, the status and the code's arrows of an error cluster) is taken by old-school.css as
// background images from panel-styles/old-school/.
//
// The drawings stay in glyphs.mjs, which the palette and the diagram's terminals also use; the files are written
// from them by scripts/old-school-art.mjs, and a test fails when a file differs from what this module gives, so the
// two never drift. Each file is the inline drawing of the old panel, which a pixel diff showed to give the same pixels
// as a background image.

import { ARRAY_INDEX_INCREMENTER, BOOLEANOS, ERROR_CODE_ARROWS, ERROR_STATUS_SIZE, INCREMENTER, errorStatusDrawing } from "../common/glyphs.mjs";

/** The directory of the files, relative to editor/src/panel-styles/. */
export const OLD_SCHOOL_ART_DIRECTORY = "old-school";

/**
 * The room around a Boolean's drawing for what spills out of its box (shadows, the bat of a toggle switch), as
 * `overflow: visible` let it spill in the old drawing; old-school.css places the image as far out (`inset`).
 */
export const BOOLEAN_ART_MARGIN = 12;

/** A Boolean's text font, which the old drawing took from styles.css and an SVG file must carry. */
const BOOLEAN_TEXT_FONT = `<style>text{font-family:Arial,"Liberation Sans",sans-serif}</style>`;

const svgFile = ({ x = 0, y = 0, width, height, drawing }) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${x} ${y} ${width} ${height}">${drawing}</svg>\n`;

/** The file of a Boolean in one state, by its style (glyphs.mjs, BOOLEANOS). */
export const booleanArtName = (style, on) => `boolean-${style}-${on ? "on" : "off"}.svg`;

/** The file of the status of an error cluster: a check with no error, a cross with one. */
export const errorStatusArtName = (status) => `error-status-${status ? "error" : "ok"}.svg`;

/**
 * Every file of the style: its name and its content. `themeTokens`, the custom properties of themes/old-school.css,
 * resolve the few theme colors a drawing asks for (the paper of a radio button), since an image cannot read the
 * page's CSS: the style looks the same under every editor theme.
 */
export function oldSchoolArt(themeTokens) {
  const resolved = (drawing) =>
    drawing.replace(/var\((--[\w-]+)\)/g, (reference, token) => {
      if (!themeTokens.has(token)) throw new Error(`old-school-art: ${token} is not a token of themes/old-school.css`);
      return themeTokens.get(token);
    });
  const booleans = Object.entries(BOOLEANOS).flatMap(([style, { ancho, alto, dibujo }]) =>
    [false, true].map((on) => ({
      name: booleanArtName(style, on),
      content: svgFile({
        x: -BOOLEAN_ART_MARGIN,
        y: -BOOLEAN_ART_MARGIN,
        width: ancho + 2 * BOOLEAN_ART_MARGIN,
        height: alto + 2 * BOOLEAN_ART_MARGIN,
        drawing: BOOLEAN_TEXT_FONT + resolved(dibujo(on)),
      }),
    })),
  );
  const errorStatus = [false, true].map((status) => ({ name: errorStatusArtName(status), content: svgFile({ ...ERROR_STATUS_SIZE, drawing: errorStatusDrawing(status) }) }));
  const codeArrows = { name: "error-code-arrows.svg", content: svgFile(ERROR_CODE_ARROWS) };
  const arrayIndexIncrementer = { name: "array-index-incrementer.svg", content: svgFile(ARRAY_INDEX_INCREMENTER) };
  return [{ name: "incrementer.svg", content: svgFile(INCREMENTER) }, arrayIndexIncrementer, ...booleans, ...errorStatus, codeArrows];
}

/** The custom properties a theme sheet defines on `:root`, read from its text. */
export const themeTokensOf = (css) => new Map([...css.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map(([, token, value]) => [token, value.trim()]));

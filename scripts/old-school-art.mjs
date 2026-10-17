// Writes the SVG files of the Old School panel style from the drawings of glyphs.mjs (DT-058 §9).
//
//   node scripts/old-school-art.mjs
//
// Run it after changing one of those drawings; test/editor/panel-styles.test.mjs fails until then.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { OLD_SCHOOL_ART_DIRECTORY, oldSchoolArt, themeTokensOf } from "../editor/src/panel-styles/old-school-art.mjs";

const EDITOR_SOURCE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../editor/src");
const PANEL_STYLES = path.join(EDITOR_SOURCE, "panel-styles");
const OLD_SCHOOL_THEME = path.join(EDITOR_SOURCE, "themes/old-school.css");
const directory = path.join(PANEL_STYLES, OLD_SCHOOL_ART_DIRECTORY);

mkdirSync(directory, { recursive: true });
const files = oldSchoolArt(themeTokensOf(readFileSync(OLD_SCHOOL_THEME, "utf8")));
for (const { name, content } of files) writeFileSync(path.join(directory, name), content);
console.log(`${files.length} files in ${path.relative(process.cwd(), directory)}`);

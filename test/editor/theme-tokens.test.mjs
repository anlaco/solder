// DT-056 §8–9: every color a theme changes lives in a token of editor/src/themes/old-school.css, and nothing
// asks for a token that no theme defines. That Old School still looks the same is checked pixel by pixel
// against the editor before the change, not here.

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { OLD_SCHOOL_TOKENS, rootCustomProperties } from "./old-school-theme.mjs";

const EDITOR_SOURCE = new URL("../../editor/src/", import.meta.url);
const read = (relativePath) => readFileSync(new URL(relativePath, EDITOR_SOURCE), "utf8");
const withoutComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");

const STYLESHEETS_WITHOUT_COLORS = ["styles.css", "getting-started/getting-started.css"];
const COLOR_LITERAL = /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?)\(|\b(?:white|black|red|green|blue|yellow|gray|grey|silver)\b/i;

// Old School's node colors, measured in LabVIEW 2026 Q3: the yellow of the primitives and the borders of a
// node. The Solder theme makes the nodes white with a graphite border, so no glyph or view may keep them.
const NODE_COLORS_MEASURED = ["#ffffcc", "#4c4c3d", "#2b2b22"];

function sourceFiles(directory = EDITOR_SOURCE) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const url = new URL(entry.name + (entry.isDirectory() ? "/" : ""), directory);
    if (entry.isDirectory()) return sourceFiles(url);
    return /\.(mjs|css)$/.test(entry.name) ? [url] : [];
  });
}

// Layout properties (`--panels-top`, `--escala`…) are not tokens: the views set them on the element, in a
// `style` attribute or with setProperty, so they count as defined too.
const propertiesSetByViews = sourceFiles()
  .filter((url) => url.pathname.endsWith(".mjs"))
  .flatMap((url) => [...readFileSync(url, "utf8").matchAll(/[;"`\s(](--[\w-]+)(?::|["']\s*,)/g)].map(([, name]) => name));

const definedTokens = new Set([
  ...OLD_SCHOOL_TOKENS.keys(),
  ...STYLESHEETS_WITHOUT_COLORS.flatMap((path) => [...rootCustomProperties(read(path)).keys()]),
  ...propertiesSetByViews,
]);

test("the Old School theme declares its tokens and nothing else", () => {
  const theme = withoutComments(read("themes/old-school.css"));
  assert.ok(OLD_SCHOOL_TOKENS.size > 0, "the theme declares no token");
  assert.match(theme.trim(), /^(:root\s*\{[^}]*\}\s*)+$/, "the theme has rules other than :root");
});

test("the stylesheets keep no color of their own", () => {
  for (const path of STYLESHEETS_WITHOUT_COLORS) {
    const declarations = [...withoutComments(read(path)).matchAll(/([\w-]+)\s*:\s*([^;{}]+)/g)];
    const withColor = declarations.filter(([, , value]) => COLOR_LITERAL.test(value)).map(([declaration]) => declaration.trim());
    assert.deepEqual(withColor, [], `${path} has colors outside the theme`);
  }
});

test("every token used without a fallback is defined", () => {
  for (const url of sourceFiles()) {
    const used = [...readFileSync(url, "utf8").matchAll(/var\(\s*(--[\w-]+)\s*\)/g)].map(([, name]) => name);
    const undefinedTokens = [...new Set(used)].filter((name) => !definedTokens.has(name));
    assert.deepEqual(undefinedTokens, [], `${url.pathname} uses tokens that no stylesheet defines`);
  }
});

test("the node colors of Old School live only in the theme", () => {
  for (const url of sourceFiles()) {
    if (url.pathname.endsWith("/themes/old-school.css")) continue;
    const source = readFileSync(url, "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "").toLowerCase();
    const kept = NODE_COLORS_MEASURED.filter((color) => source.includes(color));
    assert.deepEqual(kept, [], `${url.pathname} keeps node colors`);
  }
});

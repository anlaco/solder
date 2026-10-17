// Reads the tokens of the Old School theme, so a test can check a measured LabVIEW color
// against the token that now holds it (DT-056 §9).

import { readFileSync } from "node:fs";

export const THEME_URL = new URL("../../editor/src/themes/old-school.css", import.meta.url);

const withoutComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");

/** The custom properties declared in every `:root` block of a stylesheet, as a Map of name to value. */
export function rootCustomProperties(css) {
  const properties = new Map();
  for (const [, body] of withoutComments(css).matchAll(/:root\s*\{([^}]*)\}/g)) {
    for (const [, name, value] of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) properties.set(name, value.trim());
  }
  return properties;
}

export const OLD_SCHOOL_TOKENS = rootCustomProperties(readFileSync(THEME_URL, "utf8"));

/** The Old School value of a token, lower-cased; fails loudly when the token does not exist. */
export function oldSchoolToken(name) {
  const value = OLD_SCHOOL_TOKENS.get(name);
  if (value === undefined) throw new Error(`the Old School theme has no token ${name}`);
  return value.toLowerCase();
}

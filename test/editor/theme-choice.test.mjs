// DT-056 §6: SOLDER_THEME chooses the theme; development starts in Old School and a release in Solder.
// A theme other than Old School only redefines tokens Old School declares, and the color a window shows
// before its page paints matches the theme's token.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { THEMES, chosenThemeName } from "../../editor/electron/theme.mjs";
import { OLD_SCHOOL_TOKENS, rootCustomProperties } from "./old-school-theme.mjs";

const themeTokens = (name) => {
  const { stylesheet } = THEMES[name];
  if (!stylesheet) return OLD_SCHOOL_TOKENS;
  const own = rootCustomProperties(readFileSync(new URL(`../../editor/src/themes/${stylesheet}`, import.meta.url), "utf8"));
  return new Map([...OLD_SCHOOL_TOKENS, ...own]);
};

test("development starts in Old School and a release in Solder", () => {
  assert.equal(chosenThemeName(undefined, false), "old-school");
  assert.equal(chosenThemeName(undefined, true), "solder");
  assert.equal(chosenThemeName("solder", false), "solder");
  assert.equal(chosenThemeName("old-school", true), "old-school");
});

test("an unknown theme is reported and the default is used", () => {
  const warnings = [];
  assert.equal(chosenThemeName("neon", false, (message) => warnings.push(message)), "old-school");
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /neon/);
});

test("a theme redefines only tokens that Old School declares", () => {
  for (const [name, { stylesheet }] of Object.entries(THEMES)) {
    if (!stylesheet) continue;
    const own = rootCustomProperties(readFileSync(new URL(`../../editor/src/themes/${stylesheet}`, import.meta.url), "utf8"));
    assert.ok(own.size > 0, `${name} redefines nothing`);
    const unknown = [...own.keys()].filter((token) => !OLD_SCHOOL_TOKENS.has(token));
    assert.deepEqual(unknown, [], `${name} defines tokens Old School does not have`);
  }
});

test("the background of a window before it paints is the theme's own", () => {
  for (const [name, theme] of Object.entries(THEMES)) {
    const tokens = themeTokens(name);
    for (const { token, color } of [theme.windowBackground, theme.gettingStartedBackground]) {
      const expanded = (value) => value.toLowerCase().replace(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/, "#$1$1$2$2$3$3");
      assert.equal(expanded(tokens.get(token)), expanded(color), `${name}: ${token}`);
    }
  }
});

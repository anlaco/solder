// The editor calls Solder's program unit an OVI, never a VI (DT-071): its menus, palettes, windows, dialogs and
// tooltips. What it shows comes from two places, the LabVIEW inventory (the names of menus, palettes and context
// menus, and why a hole is missing) and the string literals of the code (the editor's window titles, dialogs, notices
// and tooltips, and the core's error messages, which the editor shows); both are read here. What is said about LabVIEW itself keeps its word: an inventory entry's `labview`
// text is shown as "In LabVIEW 2026 Q3: …", and NI's file names such as `Trim Whitespace.vi` keep their extension.

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

import { DATOS, RAIZ } from "../helpers.mjs";

/** "VI", "VIs", "VI's", "subVI", "SubVIs"… as a word; `config.vi` and `trim-whitespace-vi` are not shown. */
const VI_WORD = /\b(?:sub|Sub)?VI(?:s|'s)?\b/;

/** Texts the editor shows that name a LabVIEW thing which is not Solder's unit, and so keep "VI". */
const ALLOWED_TEXTS = new Set([
  // A family of LabVIEW's own classes, under a Property Node's Select Class ▸ (property-node-panel/hm-sc.png).
  "VI Server",
]);

const SOURCE_EXTENSIONS = [".mjs", ".cjs", ".js", ".html"];

function sourceFilesUnder(folder) {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(folder, entry.name);
    if (entry.isDirectory()) return sourceFilesUnder(entryPath);
    return SOURCE_EXTENSIONS.includes(path.extname(entry.name)) ? [entryPath] : [];
  });
}

// After one of these characters a slash starts a regular expression, not a division.
const BEFORE_REGEX = new Set([..."(,=:[!&|?{};+-*%<>~^"]);
const KEYWORDS_BEFORE_REGEX = new Set(["return", "typeof", "case", "of", "in", "do", "else", "void", "yield", "await"]);

/**
 * The string literals of a JavaScript source, and the text of its template literals outside their `${…}`: enough of
 * a tokenizer to tell them from comments and regular expressions, which never reach the screen.
 */
function stringLiterals(source) {
  const literals = [];
  // One entry per open template literal: how many braces deep its current `${…}` is.
  const templateBraceDepths = [];
  let lastSignificant = "";
  let index = 0;

  const previousWord = () => /([A-Za-z_$][\w$]*)\s*$/.exec(source.slice(Math.max(0, index - 12), index))?.[1];

  function readQuoted(quote) {
    let text = "";
    for (index++; index < source.length && source[index] !== quote; index++) {
      if (source[index] === "\\") index++;
      text += source[index];
    }
    index++;
    literals.push(text);
  }

  /** Reads template text up to its end or to a `${`; returns whether it stopped at a `${`. */
  function readTemplateText() {
    let text = "";
    while (index < source.length) {
      const character = source[index];
      if (character === "\\") {
        text += source[index + 1];
        index += 2;
      } else if (character === "`") {
        index++;
        literals.push(text);
        return false;
      } else if (character === "$" && source[index + 1] === "{") {
        index += 2;
        literals.push(text);
        return true;
      } else {
        text += character;
        index++;
      }
    }
    literals.push(text);
    return false;
  }

  function enterTemplateText() {
    if (readTemplateText()) templateBraceDepths.push(0);
    lastSignificant = "`";
  }

  function skipRegex() {
    let inClass = false;
    for (index++; index < source.length; index++) {
      const character = source[index];
      if (character === "\\") index++;
      else if (character === "[") inClass = true;
      else if (character === "]") inClass = false;
      else if (character === "/" && !inClass) break;
      else if (character === "\n") break;
    }
    index++;
  }

  while (index < source.length) {
    const character = source[index];
    const next = source[index + 1];
    if (character === "/" && next === "/") index = source.indexOf("\n", index) === -1 ? source.length : source.indexOf("\n", index);
    else if (character === "/" && next === "*") index = source.indexOf("*/", index + 2) === -1 ? source.length : source.indexOf("*/", index + 2) + 2;
    else if (character === "'" || character === '"') {
      readQuoted(character);
      lastSignificant = character;
    } else if (character === "`") {
      index++;
      enterTemplateText();
    } else if (character === "/" && (lastSignificant === "" || BEFORE_REGEX.has(lastSignificant) || KEYWORDS_BEFORE_REGEX.has(previousWord()))) {
      skipRegex();
      lastSignificant = "/";
    } else if (character === "{" && templateBraceDepths.length) {
      templateBraceDepths[templateBraceDepths.length - 1]++;
      lastSignificant = character;
      index++;
    } else if (character === "}" && templateBraceDepths.length && templateBraceDepths[templateBraceDepths.length - 1] === 0) {
      templateBraceDepths.pop();
      index++;
      enterTemplateText();
    } else {
      if (character === "}" && templateBraceDepths.length) templateBraceDepths[templateBraceDepths.length - 1]--;
      if (!/\s/.test(character)) lastSignificant = character;
      index++;
    }
  }
  return literals;
}

/** The visible text of an HTML page: without its comments, tags and scripts. */
const htmlText = (source) =>
  source
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<script[\s\S]*?<\/script>/g, "")
    .replace(/<style[\s\S]*?<\/style>/g, "")
    .replace(/<[^>]*>/g, "\n")
    .split("\n");

const sayVI = (text) => VI_WORD.test(text) && !ALLOWED_TEXTS.has(text);

test("the tokenizer finds the strings and leaves comments and regular expressions out", () => {
  const source = [
    "// a comment that says VI",
    "/* and another VI */",
    'const title = "New OVI"; const pattern = /VI"s/g;',
    "const tip = `Finish ${kind === 'loop' ? `the ${name}` : name} now`;",
    "return /x/.test(a) ? 'yes' : 'no';",
  ].join("\n");
  assert.deepEqual(stringLiterals(source), ["New OVI", "Finish ", "loop", "the ", "", " now", "yes", "no"]);
});

test("the names of the inventory's menus, palettes and dialogs say OVI, not VI (DT-071)", () => {
  const saysVI = DATOS.entradas.filter((entry) => sayVI(entry.etiqueta)).map((entry) => `${entry.id}: ${entry.etiqueta}`);
  assert.deepEqual(saysVI, []);
});

test("why a hole is missing, as Solder tells it, says OVI, not VI (DT-071)", () => {
  const saysVI = Object.entries(DATOS.desbloqueos)
    .filter(([, unlock]) => sayVI(unlock.desc))
    .map(([id, unlock]) => `${id}: ${unlock.desc}`);
  assert.deepEqual(saysVI, []);
});

test("the editor's own texts and the core's error messages say OVI, not VI (DT-071)", () => {
  const sourceFiles = ["editor", "core"].flatMap((folder) => sourceFilesUnder(path.join(RAIZ, folder)));
  const saysVI = sourceFiles.flatMap((file) => {
    const source = readFileSync(file, "utf8");
    const texts = file.endsWith(".html") ? htmlText(source) : stringLiterals(source);
    return texts.filter(sayVI).map((text) => `${path.relative(RAIZ, file)}: ${text.trim()}`);
  });
  assert.deepEqual(saysVI, []);
});

test("a LabVIEW file name keeps its .vi, and the word VI is caught", () => {
  assert.ok(!sayVI("Trim Whitespace.vi"));
  assert.ok(sayVI("Select a VI..."));
  assert.ok(sayVI("Create SubVI"));
});

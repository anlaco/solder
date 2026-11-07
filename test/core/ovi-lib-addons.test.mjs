// <ovilib> paths over several folders (DT-081 §4): ovi.lib plus each add-on's ovi.lib. The page cannot ask the disk,
// so main builds a locator once at start-up (an index of which folder holds each file) and the resolving stays pure.

import assert from "node:assert/strict";
import { test } from "node:test";

import * as OviLib from "../../core/model/ovi-lib.mjs";

const OVI_LIB = "/opt/solder/ovi.lib";
const DAQ = "/home/ana/.local/share/solder/addons/daq/1/ovi.lib";
const FILES = {
  [OVI_LIB]: ["Instr/Configure.sdg", "Utility/Add Two.sdg", "Shared/Clash.sdg"],
  [DAQ]: ["DAQ/Start Task.sdg", "DAQ/Read.sdg", "Shared/Clash.sdg"],
};
const locator = () => OviLib.buildOviLibLocator([OVI_LIB, DAQ], (root) => FILES[root]);

test("a path into an add-on resolves to the add-on's folder, and Solder's own paths still resolve to ovi.lib", () => {
  assert.equal(OviLib.resolveOviLibPath("<ovilib>/DAQ/Start Task.sdg", locator()), `${DAQ}/DAQ/Start Task.sdg`);
  assert.equal(OviLib.resolveOviLibPath("<ovilib>/Utility/Add Two.sdg", locator()), `${OVI_LIB}/Utility/Add Two.sdg`);
  assert.equal(OviLib.resolveOviLibPath("<ovilib>\\DAQ\\Read.sdg", locator()), `${DAQ}/DAQ/Read.sdg`, "with Windows separators");
});

test("a file in two folders resolves to ovi.lib's, and one found nowhere resolves under ovi.lib to be reported missing", () => {
  assert.equal(OviLib.resolveOviLibPath("<ovilib>/Shared/Clash.sdg", locator()), `${OVI_LIB}/Shared/Clash.sdg`);
  assert.equal(OviLib.resolveOviLibPath("<ovilib>/Nowhere/Ghost.sdg", locator()), `${OVI_LIB}/Nowhere/Ghost.sdg`);
});

test("a name like 'constructor' is just a missing file, not a trap in the index", () => {
  assert.equal(OviLib.resolveOviLibPath("<ovilib>/constructor", locator()), `${OVI_LIB}/constructor`);
});

test("an OVI chosen inside an add-on is stored by its symbolic path, unless ovi.lib's own file would hide it", () => {
  assert.equal(OviLib.oviLibPathFor(`${DAQ}/DAQ/Read.sdg`, locator()), "<ovilib>/DAQ/Read.sdg");
  assert.equal(OviLib.oviLibPathFor(`${OVI_LIB}/Utility/Add Two.sdg`, locator()), "<ovilib>/Utility/Add Two.sdg");
  assert.equal(OviLib.oviLibPathFor(`${DAQ}/Shared/Clash.sdg`, locator()), null, "the symbolic path would lead to ovi.lib's copy");
  assert.equal(OviLib.oviLibPathFor(`${DAQ}/DAQ/New.sdg`, locator()), null, "a file not in the index would resolve under ovi.lib");
  assert.equal(OviLib.oviLibPathFor("/home/ana/vis/mine.sdg", locator()), null);
});

test("the hierarchy marks an add-on's OVIs as ovi.lib's", () => {
  assert.equal(OviLib.hierarchyName(`${DAQ}/DAQ/Read.sdg`, locator()), "Read.sdg (ovi.lib)");
  assert.equal(OviLib.hierarchyName("/home/ana/vis/mine.sdg", locator()), "mine.sdg");
});

test("the locator is plain data, so it crosses from the main process to the page unchanged", () => {
  const copy = JSON.parse(JSON.stringify(locator()));
  assert.equal(OviLib.resolveOviLibPath("<ovilib>/DAQ/Read.sdg", copy), `${DAQ}/DAQ/Read.sdg`);
});

test("with a plain folder, as before, nothing changes", () => {
  assert.equal(OviLib.resolveOviLibPath("<ovilib>/Utility/Add Two.sdg", OVI_LIB), `${OVI_LIB}/Utility/Add Two.sdg`);
  assert.equal(OviLib.resolveOviLibPath("<ovilib>/Utility/Add Two.sdg", ""), "<ovilib>/Utility/Add Two.sdg");
  assert.equal(OviLib.oviLibPathFor(`${OVI_LIB}/Utility/Add Two.sdg`, OVI_LIB), "<ovilib>/Utility/Add Two.sdg");
});

// Add-ons (DT-081): the layout, the manifest and which parts a Solder accepts. The disk is replaced by a small
// in-memory tree, so these tests do not depend on the machine they run on.

import assert from "node:assert/strict";
import { test } from "node:test";

import * as Addons from "../../core/model/addons.mjs";

/** An in-memory file system from `{ "/path/to/file": "text" }`; folders exist wherever a file lies under them. */
function fakeFileSystem(files) {
  const paths = Object.keys(files);
  return {
    listDirectories(folder) {
      const prefix = `${folder.replace(/\/+$/, "")}/`;
      const names = paths.filter((file) => file.startsWith(prefix)).map((file) => file.slice(prefix.length).split("/")).filter((parts) => parts.length > 1).map((parts) => parts[0]);
      return [...new Set(names)];
    },
    readText: (file) => files[file] ?? null,
  };
}

const manifest = (fields) => JSON.stringify({ AddonName: "daq", ApiVersion: "v1", MinimumSupportedSolderVersion: "0.12.0", ...fields });
const SYSTEM = "/usr/share/solder/addons";
const USER = "/home/ana/.local/share/solder/addons";
const find = (files, options = {}) => Addons.findAddons({ addonsFolders: [SYSTEM, USER], fileSystem: fakeFileSystem(files), platform: "linux-x64", solderVersion: "0.12.0-beta", ...options });

test("a manifest needs a name, an API version equal to 'v' plus its folder, and a minimum Solder", () => {
  assert.deepEqual(Addons.parseAddonManifest(manifest({}), "1").manifest.AddonName, "daq");
  assert.match(Addons.parseAddonManifest("{not json", "1").problem, /not valid JSON/);
  assert.match(Addons.parseAddonManifest(manifest({ AddonName: " " }), "1").problem, /no AddonName/);
  assert.match(Addons.parseAddonManifest(manifest({ ApiVersion: "v2" }), "1").problem, /expected "v1"/);
  assert.match(Addons.parseAddonManifest(JSON.stringify({ AddonName: "daq", ApiVersion: "v1" }), "1").problem, /MinimumSupportedSolderVersion/);
  assert.match(Addons.parseAddonManifest(manifest({ SupportedPlatform: 7 }), "1").problem, /SupportedPlatform/);
});

test("versions compare number by number, not as text", () => {
  assert.equal(Addons.isVersionAtLeast("0.10.0-beta", "0.9.0"), true, "0.10 is above 0.9");
  assert.equal(Addons.isVersionAtLeast("0.12.0-beta", "0.12.0"), true, "the beta label does not count");
  assert.equal(Addons.isVersionAtLeast("0.11.9", "0.12.0"), false);
  assert.equal(Addons.isVersionAtLeast("1", "0.99.99"), true, "a missing part is zero");
});

test("an add-on is found in the system folder and in the user's, with its common and native parts together", () => {
  const { addons, problems } = find({
    [`${SYSTEM}/daq/1/sdaddoninfo.json`]: manifest({}),
    [`${SYSTEM}/daq-linux-x64/1/sdaddoninfo.json`]: manifest({ SupportedPlatform: "linux-x64" }),
    [`${SYSTEM}/daq-windows-x64/1/sdaddoninfo.json`]: manifest({ SupportedPlatform: "windows-x64" }),
    [`${USER}/scopes/26.3/sdaddoninfo.json`]: manifest({ AddonName: "scopes", ApiVersion: "v26.3" }),
    [`${USER}/notes/readme.txt`]: "not an add-on",
  });
  assert.deepEqual(problems, []);
  assert.deepEqual(addons.map((addon) => [addon.name, addon.apiVersion]), [["daq", "v1"], ["scopes", "v26.3"]]);
  assert.deepEqual(addons[0].folders, [`${SYSTEM}/daq/1`, `${SYSTEM}/daq-linux-x64/1`], "the Windows part is left out on Linux");
});

test("a broken manifest or a too-new add-on is reported and skipped, and the others still load", () => {
  const { addons, problems } = find({
    [`${SYSTEM}/broken/1/sdaddoninfo.json`]: "{oops",
    [`${SYSTEM}/future/1/sdaddoninfo.json`]: manifest({ AddonName: "future", MinimumSupportedSolderVersion: "9.0.0" }),
    [`${SYSTEM}/daq/1/sdaddoninfo.json`]: manifest({}),
  });
  assert.deepEqual(addons.map((addon) => addon.name), ["daq"]);
  assert.equal(problems.length, 2);
  assert.match(problems.find((entry) => entry.folder.includes("broken")).problem, /not valid JSON/);
  assert.match(problems.find((entry) => entry.folder.includes("future")).problem, /needs Solder 9\.0\.0/);
});

test("the same add-on in both folders uses the user's copy, and says so", () => {
  const { addons, problems } = find({
    [`${SYSTEM}/daq/1/sdaddoninfo.json`]: manifest({}),
    [`${USER}/daq/1/sdaddoninfo.json`]: manifest({}),
  });
  assert.deepEqual(addons[0].folders, [`${USER}/daq/1`]);
  assert.match(problems[0].problem, /the later copy is used/);
});

test("<ovilib> paths are looked for in ovi.lib first and then in each add-on's ovi.lib folder", () => {
  const addons = [{ name: "daq", apiVersion: "v1", folders: ["/a/daq/1", "/a/daq-linux-x64/1"] }];
  assert.deepEqual(Addons.oviLibRoots("/opt/solder/ovi.lib", addons), ["/opt/solder/ovi.lib", "/a/daq/1/ovi.lib", "/a/daq-linux-x64/1/ovi.lib"]);
  assert.deepEqual(Addons.oviLibRoots("/opt/solder/ovi.lib", []), ["/opt/solder/ovi.lib"], "with no add-ons, only Solder's own");
});

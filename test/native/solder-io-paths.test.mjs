// Where the installed app finds its native files (issue #23). electron-builder packs the app into `app.asar`, an
// archive, and copies the native files beside it into `app.asar.unpacked` (package.json, `asarUnpack`). Electron's
// `require` of a `.node` goes there by itself, but the memory bridge's path is handed to the system's loader
// (LoadLibraryExW, dlopen), which cannot open a file inside the archive: VISA failed in every installed copy with
// "the memory bridge does not load".

import test from "node:test";
import assert from "node:assert/strict";
import { nativeFilePath, memoryBridgeRelativePath } from "../../native/solder-io-node/solder-io.mjs";

const PACKED_MODULE_ON_WINDOWS = "file:///C:/Users/someone/AppData/Local/Programs/Solder/resources/app.asar/native/solder-io-node/solder-io.mjs";
const PACKED_MODULE_ON_LINUX = "file:///opt/Solder/resources/app.asar/native/solder-io-node/solder-io.mjs";
const REPOSITORY_MODULE = "file:///home/someone/solder/native/solder-io-node/solder-io.mjs";

const POSIX = { windows: false };

test("installed on Windows, the memory bridge is looked for outside the archive", () => {
  assert.equal(
    nativeFilePath(memoryBridgeRelativePath("win32", "x64"), PACKED_MODULE_ON_WINDOWS, { windows: true }),
    "C:\\Users\\someone\\AppData\\Local\\Programs\\Solder\\resources\\app.asar.unpacked\\native\\solder-io-node\\memory-bridge\\win32-x64\\lvrt.dll",
  );
});

test("installed on Linux, the memory bridge is looked for outside the archive", () => {
  assert.equal(
    nativeFilePath(memoryBridgeRelativePath("linux", "x64"), PACKED_MODULE_ON_LINUX, POSIX),
    "/opt/Solder/resources/app.asar.unpacked/native/solder-io-node/memory-bridge/linux-x64/libsolder_memory_bridge.so",
  );
});

test("run from the repository, a native file is beside the module", () => {
  assert.equal(nativeFilePath("solder-io-linux-x64.node", REPOSITORY_MODULE, POSIX), "/home/someone/solder/native/solder-io-node/solder-io-linux-x64.node");
});

test("a folder merely named like the archive is not taken for it", () => {
  const module = "file:///home/someone/my-app.asar-notes/solder/native/solder-io-node/solder-io.mjs";
  assert.equal(nativeFilePath("x.node", module, POSIX), "/home/someone/my-app.asar-notes/solder/native/solder-io-node/x.node");
});

// Loads Solder's own VISA (DT-065), the addon `scripts/build-native.mjs` builds. Its functions answer
// promises with VISA's status codes: open(resource) → { session, status, nameOut }, write(session, bytes) →
// { count, status }, read(session, count) → { data, status }, close(session) → status, and, at once,
// attributes(session) (with `serial` on a serial session, DT-070), changeAttributes(session, { timeoutMs,
// terminationCharacter, terminationCharacterEnabled, baudRate, dataBits, parity, stopBits, flowControl,
// endModeForReads }) and bytesAtPort(session) → { count, status }. The file functions (DT-067) answer LabVIEW's error codes, 0 for none:
// fileOpen(name, operation, access) → { refnum, error }, fileClose(refnum) → { name, error },
// fileWrite(refnum, bytes, convertEol) → error, fileWriteLines(refnum, lines, convertEol) → error,
// fileRead(refnum, count, convertEol) → { text, error }, fileReadLine(refnum, convertEol) → { text, error },
// fileReadLines(refnum, count) → { lines, error }, fileSize(refnum) → { size, error }, fileMoveToEnd(refnum) → error,
// fileDelete(name, entireHierarchy) → error, and, at once,
// fileName(refnum). callLibrary({ library, function, returnKind, arguments: [{ kind, bytes }], uiThread }) →
// { status, returned, arguments } calls a native library for the Call Library Function Node (DT-080). The memory
// bridge next to the addon is installed as it loads (DT-088 §4).

import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

/** The addon's file for a system and processor: one per platform, so a release can carry Linux's and Windows'. */
export const addonFileName = (platform = process.platform, arch = process.arch) => `solder-io-${platform}-${arch}.node`;

/** The folder electron-builder packs the app into: an archive, which only Electron's own `fs` and `require` read. */
const PACKED_APP_FOLDER = /([\\/])app\.asar([\\/])/;
/** Where electron-builder copies the files `asarUnpack` lists (package.json), as real files the system can load. */
const UNPACKED_APP_FOLDER = "$1app.asar.unpacked$2";

/**
 * The path of a native file beside this module, outside the archive when the app is installed (issue #23): the
 * system's loader (LoadLibraryExW, dlopen) cannot open a file inside `app.asar`. `windows` gives Windows' path on
 * any system, for the tests.
 */
export function nativeFilePath(relativePath, moduleUrl = import.meta.url, { windows = process.platform === "win32" } = {}) {
  return fileURLToPath(new URL(`./${relativePath}`, moduleUrl), { windows }).replace(PACKED_APP_FOLDER, UNPACKED_APP_FOLDER);
}

export const ADDON_PATH = nativeFilePath(addonFileName());

/**
 * The memory bridge's file on each system (DT-088 §4): the library that offers LabVIEW's memory functions, by LabVIEW's
 * names, to the libraries the Call Library Function Node loads. On Windows it is `lvrt.dll`, the module a library built
 * with LabVIEW's `labview.lib` looks them up in (measured, 2026-11-08).
 */
const MEMORY_BRIDGE_FILE = { linux: "libsolder_memory_bridge.so", darwin: "libsolder_memory_bridge.dylib", win32: "lvrt.dll" };

/** Where the memory bridge of a system and processor sits, beside the addon: a folder of its own, since its name is fixed. */
export const memoryBridgeRelativePath = (platform = process.platform, arch = process.arch) => `memory-bridge/${platform}-${arch}/${MEMORY_BRIDGE_FILE[platform]}`;

export const MEMORY_BRIDGE_PATH = nativeFilePath(memoryBridgeRelativePath());

let solderIo = null;

/**
 * Solder's VISA with the shape every host shares (core/runtime/io-protocol.mjs): the addon's operations,
 * with the bytes to write given as a Uint8Array, which a message port carries and a Buffer is not.
 */
export function loadSolderIo() {
  if (solderIo) return solderIo;
  const addon = createRequire(import.meta.url)(ADDON_PATH);
  // Before any library is loaded, so that a library that resizes handles finds the functions it calls. Without the
  // bridge, such a library does not load (error 12), as it would not outside LabVIEW; the others still run.
  if (existsSync(MEMORY_BRIDGE_PATH)) addon.installMemoryBridge(MEMORY_BRIDGE_PATH);
  const asBuffer = (bytes) => Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  solderIo = {
    ...addon,
    write: (session, bytes) => addon.write(session, asBuffer(bytes)),
    fileWrite: (refnum, bytes, convertEol) => addon.fileWrite(refnum, asBuffer(bytes), convertEol),
    fileWriteLines: (refnum, lines, convertEol) => addon.fileWriteLines(refnum, lines.map(asBuffer), convertEol),
    callLibrary: async (request) => {
      const arguments_ = request.arguments.map((argument) => ({ kind: argument.kind, bytes: asBuffer(argument.bytes) }));
      const answer = await addon.callLibrary({ ...request, arguments: arguments_ });
      const asBytes = (buffer) => new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength).slice();
      return { status: answer.status, returned: asBytes(answer.returned), arguments: answer.arguments.map(asBytes) };
    },
  };
  return solderIo;
}

/**
 * Solder's I/O whose Call Library Function Node loads a library by the name `locateLibrary(name)` gives: the add-ons'
 * copy by its full path (DT-087, amendment of 2026-11-13 §8; `editor/electron/installed-addons.mjs`).
 */
export const withLibraryLocator = (io, locateLibrary) => ({
  ...io,
  callLibrary: (request) => io.callLibrary({ ...request, library: locateLibrary(request.library) }),
});

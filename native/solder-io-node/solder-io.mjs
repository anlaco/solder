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
// { status, returned, arguments } calls a native library for the Call Library Function Node (DT-080).

import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

/** The addon's file for a system and processor: one per platform, so a release can carry Linux's and Windows'. */
export const addonFileName = (platform = process.platform, arch = process.arch) => `solder-io-${platform}-${arch}.node`;

export const ADDON_PATH = fileURLToPath(new URL(`./${addonFileName()}`, import.meta.url));

let solderIo = null;

/**
 * Solder's VISA with the shape every host shares (core/runtime/io-protocol.mjs): the addon's operations,
 * with the bytes to write given as a Uint8Array, which a message port carries and a Buffer is not.
 */
export function loadSolderIo() {
  if (solderIo) return solderIo;
  const addon = createRequire(import.meta.url)(ADDON_PATH);
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

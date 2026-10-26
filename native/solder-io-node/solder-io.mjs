// Loads Solder's own VISA (DT-065), the addon `scripts/build-native.mjs` builds. Its functions answer
// promises with VISA's status codes: open(resource) → { session, status }, write(session, bytes) →
// { count, status }, read(session, count) → { data, status }, close(session) → status, and, at once,
// attributes(session) and changeAttributes(session, { timeoutMs, terminationCharacter,
// terminationCharacterEnabled }).

import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

export const ADDON_PATH = fileURLToPath(new URL("./solder-io.node", import.meta.url));

let solderIo = null;

/**
 * Solder's VISA with the shape every host shares (core/runtime/io-protocol.mjs): the addon's operations,
 * with the bytes to write given as a Uint8Array, which a message port carries and a Buffer is not.
 */
export function loadSolderIo() {
  if (solderIo) return solderIo;
  const addon = createRequire(import.meta.url)(ADDON_PATH);
  const asBuffer = (bytes) => Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  solderIo = { ...addon, write: (session, bytes) => addon.write(session, asBuffer(bytes)) };
  return solderIo;
}

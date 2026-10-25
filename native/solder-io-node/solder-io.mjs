// Loads Solder's own VISA (DT-065), the addon `scripts/build-native.mjs` builds. Its functions answer
// promises with VISA's status codes: open(resource) → { session, status }, write(session, data) →
// { count, status }, read(session, count) → { data, status }, close(session) → status, and, at once,
// attributes(session) and changeAttributes(session, { timeoutMs, terminationCharacter,
// terminationCharacterEnabled }).

import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

export const ADDON_PATH = fileURLToPath(new URL("./solder-io.node", import.meta.url));

let solderIo = null;

export function loadSolderIo() {
  solderIo ??= createRequire(import.meta.url)(ADDON_PATH);
  return solderIo;
}

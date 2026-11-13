// The editor's instrument I/O process (DT-065 §3): an Electron utilityProcess that loads Solder's VISA,
// native code, so that a fault in it ends this process and not the editor. The main process hands it
// one message port per Run that talks to instruments; the Run's coordinator asks through it
// (core/runtime/io-protocol.mjs). One resource manager serves every Run, as VISA's default one does.

import { IO_OPERATIONS, serveSolderIo } from "../../core/runtime/io-protocol.mjs";
import { loadSolderIo, withLibraryLocator } from "../../native/solder-io-node/solder-io.mjs";
import { addonLibraryLocator, handedLibraryFolders } from "./installed-addons.mjs";

/** Solder's VISA and files, or, when this build has no addon, operations that each say so. */
function solderIoOrMissing() {
  try {
    // A library an add-on brings is loaded by its full path (DT-087, amendment of 2026-11-13 §8).
    return withLibraryLocator(loadSolderIo(), addonLibraryLocator(handedLibraryFolders(process.env)));
  } catch (error) {
    const missing = () => Promise.reject(new Error(`Solder's I/O could not be loaded: ${error.message}`));
    // Every operation the protocol serves, the file ones included, so that none of them fails with "not a function".
    return Object.fromEntries(IO_OPERATIONS.map((operation) => [operation, missing]));
  }
}

const solderIo = solderIoOrMissing();

process.parentPort.on("message", ({ ports }) => {
  for (const port of ports) {
    serveSolderIo(solderIo, {
      onRequest: (listener) => port.on("message", ({ data }) => listener(data)),
      answer: (message) => port.postMessage(message),
    });
    port.start();
  }
});

// The editor's instrument I/O process (DT-065 §3): an Electron utilityProcess that loads Solder's VISA,
// native code, so that a fault in it ends this process and not the editor. The main process hands it
// one message port per Run that talks to instruments; the Run's coordinator asks through it
// (core/runtime/io-protocol.mjs). One resource manager serves every Run, as VISA's default one does.

import { serveSolderIo } from "../../core/runtime/io-protocol.mjs";
import { loadSolderIo } from "../../native/solder-io-node/solder-io.mjs";

/** Solder's VISA, or, when this build has no addon, operations that each say so. */
function solderIoOrMissing() {
  try {
    return loadSolderIo();
  } catch (error) {
    const missing = () => Promise.reject(new Error(`Solder's VISA could not be loaded: ${error.message}`));
    return { open: missing, write: missing, read: missing, close: missing, attributes: missing, changeAttributes: missing };
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

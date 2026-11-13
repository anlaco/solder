// Run by test/end-to-end/io-process.test.mjs as `electron io-process-check.mjs`, with SOLDER_TEST_RESOURCE
// naming an instrument that answers `*IDN?`. It starts the editor's I/O process as the main process does,
// asks the instrument through it, crashes it, asks again, and prints what happened as one line of JSON.

import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { app, MessageChannelMain, utilityProcess } from "electron";

const REPOSITORY = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
// As URLs: on Windows an absolute path is not one the module loader takes.
const repositoryModule = (relativePath) => import(pathToFileURL(path.join(REPOSITORY, relativePath)).href);
const { createInstrumentIoProcess } = await repositoryModule("editor/electron/instrument-io-process.mjs");
const { createIoClient } = await repositoryModule("core/runtime/io-protocol.mjs");
/**
 * How the I/O process is made to crash: a segmentation fault where there are signals; Windows has none to send from
 * outside, and ending the process is the nearest thing.
 */
const CRASH_SIGNAL = process.platform === "win32" ? "SIGKILL" : "SIGSEGV";

let lastChild = null;
let exitsTold = 0;
const instrumentIo = createInstrumentIoProcess({
  fork: () => (lastChild = utilityProcess.fork(path.join(REPOSITORY, "editor/electron/io-process.mjs"), [], { serviceName: "Solder instrument I/O" })),
  createChannel: () => new MessageChannelMain(),
  onExit: () => exitsTold++,
});

/** A MessagePortMain seen as the MessagePort the run worker has. */
const clientOf = (port) =>
  createIoClient({
    set onmessage(listener) {
      port.on("message", listener);
      port.start();
    },
    postMessage: (message) => port.postMessage(message),
    close: () => port.close(),
  });

async function askIdentity(client) {
  const { session } = await client.open(process.env.SOLDER_TEST_RESOURCE);
  await client.changeAttributes(session, { terminationCharacterEnabled: true });
  await client.write(session, new TextEncoder().encode("*IDN?\n"));
  const { data } = await client.read(session, 100);
  await client.close(session);
  return new TextDecoder().decode(data);
}

app.whenReady().then(async () => {
  const report = {};
  try {
    report.first = await askIdentity(clientOf(instrumentIo.connect()));
    const crashed = lastChild;
    const exited = new Promise((resolve) => crashed.once("exit", resolve));
    process.kill(crashed.pid, CRASH_SIGNAL);
    report.exitCode = await exited;
    report.exitsTold = exitsTold;
    report.afterCrash = await askIdentity(clientOf(instrumentIo.connect()));
    report.newProcess = lastChild.pid !== crashed.pid;
  } catch (error) {
    report.error = error.message;
  }
  console.log(`REPORT ${JSON.stringify(report)}`);
  instrumentIo.stop();
  app.quit();
});

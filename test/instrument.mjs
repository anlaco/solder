// A small SCPI instrument for the tests of Solder's VISA (DT-065 §5): it listens on a free local port and
// answers `*IDN?` with IDENTITY. No hardware, no NI-VISA.

import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";

export const IDENTITY = "Solder,Test Instrument,0,1.0\n";

/**
 * Starts the instrument; resolves to its resource string and a way to stop it, which also drops the
 * connections of sessions left open.
 */
export async function startInstrument() {
  const connections = new Set();
  const server = createServer((connection) => {
    connections.add(connection);
    connection.on("close", () => connections.delete(connection));
    let pending = "";
    connection.on("data", (chunk) => {
      pending += chunk;
      let newline;
      while ((newline = pending.indexOf("\n")) >= 0) {
        if (pending.slice(0, newline).trim() === "*IDN?") connection.write(IDENTITY);
        pending = pending.slice(newline + 1);
      }
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const resource = `TCPIP0::127.0.0.1::${server.address().port}::SOCKET`;
  const stop = () => {
    server.close();
    for (const connection of connections) connection.destroy();
  };
  return { resource, stop };
}

/** What the serial test instrument answers to `*IDN?` (native/solder-io/tests/pseudo_terminal). */
export const SERIAL_IDENTITY = "SOLDER,SERIAL-RESPONDER,0,1\n";

/** Serial ports here are pseudo-terminals, which Windows does not have. */
export const HAS_SERIAL_TEST_INSTRUMENT = process.platform !== "win32";

const SERIAL_TEST_INSTRUMENT = fileURLToPath(new URL("../target/debug/serial-test-instrument", import.meta.url));

/**
 * Starts the serial test instrument (DT-070 §9), which `npm test`'s Cargo step builds: a pseudo-terminal
 * that answers line commands. Resolves to its resource string (`ASRL/dev/pts/N::INSTR`) and a way to stop it.
 */
export async function startSerialInstrument() {
  const instrument = spawn(SERIAL_TEST_INSTRUMENT, [], { stdio: ["pipe", "pipe", "inherit"] });
  const lines = createInterface({ input: instrument.stdout });
  const resource = await new Promise((resolve, reject) => {
    instrument.once("error", reject);
    instrument.once("exit", (code) => reject(new Error(`The serial test instrument ended (${code}).`)));
    lines.once("line", resolve);
  });
  return { resource, stop: () => instrument.stdin.end() };
}

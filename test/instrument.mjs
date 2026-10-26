// A small SCPI instrument for the tests of Solder's VISA (DT-065 §5): it listens on a free local port and
// answers `*IDN?` with IDENTITY. No hardware, no NI-VISA.

import { createServer } from "node:net";

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

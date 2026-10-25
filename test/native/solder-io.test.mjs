// Solder's own VISA seen from Node (DT-065): the addon answers promises with VISA's codes, and a Read
// that waits for its timeout leaves the JavaScript thread free. The read rules themselves are tested
// in Rust (native/solder-io/tests).

import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:net";
import { loadSolderIo } from "../../native/solder-io-node/solder-io.mjs";

const IDENTITY = "Solder,Test Instrument,0,1.0\n";
const VI_SUCCESS_MAX_CNT = 1073676294;
const VI_ERROR_TMO = -1073807339;
const VI_ERROR_INV_OBJECT = -1073807346;
const TEST_TIMEOUT_MS = 200;
const TICK_MS = 10;

/** An instrument on a free local port that answers `*IDN?`; resolves to its resource string and a way to stop it. */
async function startInstrument() {
  const server = createServer((connection) => {
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
  return { resource, stop: () => server.close() };
}

test("solder-io opens, writes, reads and closes a socket with VISA's codes", async () => {
  const io = loadSolderIo();
  const instrument = await startInstrument();
  try {
    const { session, status } = await io.open(instrument.resource);
    assert.equal(status, 0);
    assert.deepEqual(io.attributes(session), { status: 0, timeoutMs: 2000, terminationCharacter: 10, terminationCharacterEnabled: false });
    assert.deepEqual(await io.write(session, Buffer.from("*IDN?\n")), { count: 6, status: 0 });
    const first = await io.read(session, 5);
    assert.equal(first.data.toString(), "Solde");
    assert.equal(first.status, VI_SUCCESS_MAX_CNT);
    assert.equal(await io.close(session), 0);
    assert.equal((await io.read(session, 1)).status, VI_ERROR_INV_OBJECT);
  } finally {
    instrument.stop();
  }
});

test("solder-io waits for a timeout without blocking the JavaScript thread", async () => {
  const io = loadSolderIo();
  const instrument = await startInstrument();
  try {
    const { session } = await io.open(instrument.resource);
    assert.equal(io.changeAttributes(session, { timeoutMs: TEST_TIMEOUT_MS }), 0);
    await io.write(session, Buffer.from("*IDN?\n"));
    let ticks = 0;
    const ticker = setInterval(() => ticks++, TICK_MS);
    const read = await io.read(session, 100);
    clearInterval(ticker);
    assert.equal(read.data.toString(), IDENTITY);
    assert.equal(read.status, VI_ERROR_TMO);
    // Blocked, the thread would see no tick at all while the read waits.
    assert.ok(ticks >= 5, `${ticks} ticks during a ${TEST_TIMEOUT_MS} ms wait`);
    await io.close(session);
  } finally {
    instrument.stop();
  }
});

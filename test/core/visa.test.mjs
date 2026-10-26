// VISA in a Run (DT-065 §4, DT-066): VISA Open, Write, Read and Close are external waits, answered by the
// Run's coordinator through Solder's own VISA, on one thread and on a pool, against an instrument that
// the test starts on a local port. The values are LabVIEW's, measured with NI-VISA 26.5
// (labview-captures/reports/2026-10-25-visa-read-socket.md).

import assert from "node:assert/strict";
import { after, test } from "node:test";
import { MessageChannel } from "node:worker_threads";

import { compilar } from "../../core/compiler/compiler.mjs";
import { ejecutar } from "../../core/runtime/runtime.mjs";
import { createNodePool } from "../../core/runtime/node-pool.mjs";
import { ERROR } from "../../core/model/types.mjs";
import { IDENTITY, startInstrument } from "../instrument.mjs";
import { loadSolderIo } from "../../native/solder-io-node/solder-io.mjs";
import { createIoClient, serveSolderIo } from "../../core/runtime/io-protocol.mjs";
import { CAT, buildVI } from "../helpers.mjs";

const VI_SUCCESS_MAX_CNT = 1073676294;
const VI_WARN_NULL_OBJECT = 1073676418;
const THREADS = 2;

const pool = createNodePool(THREADS);
after(() => pool.close());

/** Open → Write `*IDN?\n` → Read `byteCount` → Close, errors chained, with the read and each error out shown. */
const identityQuery = (resource, byteCount, { errorIn } = {}) =>
  buildVI(CAT, (b) => {
    b.node("name", "visa-resource-constant", { value: resource });
    b.node("open", "visa-open");
    b.node("query", "str-const", { value: "*IDN?\n" });
    b.node("write", "visa-write");
    b.node("count", "const", { value: byteCount, type: "u32" });
    b.node("read", "visa-read");
    b.node("close", "visa-close");
    b.node("buffer", "str-indicator");
    b.node("returned", "indicator", { type: "u32" });
    b.node("written", "indicator", { type: "u32" });
    b.node("readError", "cluster-indicator", { type: ERROR, style: "error-out" });
    b.node("closeError", "cluster-indicator", { type: ERROR, style: "error-out" });
    if (errorIn) {
      b.node("incoming", "error-cluster-constant", { value: errorIn });
      b.wire("incoming.result", "open.error-in");
    }
    b.wire("name.result", "open.resource");
    b.wire("open.resource-out", "write.resource");
    b.wire("query.result", "write.write-buffer");
    b.wire("open.error-out", "write.error-in");
    b.wire("write.resource-out", "read.resource");
    b.wire("count.result", "read.byte-count");
    b.wire("write.error-out", "read.error-in");
    b.wire("read.resource-out", "close.resource");
    b.wire("read.error-out", "close.error-in");
    b.wire("read.read-buffer", "buffer.value");
    b.wire("read.return-count", "returned.value");
    b.wire("write.return-count", "written.value");
    b.wire("read.error-out", "readError.value");
    b.wire("close.error-out", "closeError.value");
  });

/** Runs `vi` with Solder's VISA, on the pool when `poolPorts` is given; the writes come back by the names `vi` gave its nodes. */
async function run(vi, options = {}) {
  const compiled = compilar(vi.g, CAT);
  assert.ok(!compiled.errores, JSON.stringify(compiled.errores));
  const byId = Object.fromEntries(Object.entries(vi.id).map(([name, nodeId]) => [nodeId, name]));
  const written = await ejecutar(compiled, {}, { io: loadSolderIo(), ...options });
  return Object.fromEntries(Object.entries(written).map(([nodeId, value]) => [byId[nodeId], value]));
}

for (const [where, options] of [["on one thread", () => ({})], ["on a pool", () => ({ poolPorts: pool.connect() })]]) {
  test(`VISA Open, Write, Read and Close talk to an instrument ${where}`, async () => {
    const instrument = await startInstrument();
    try {
      const shown = await run(identityQuery(instrument.resource, IDENTITY.length), options());
      assert.equal(shown.buffer, IDENTITY);
      assert.equal(shown.returned, IDENTITY.length);
      assert.equal(shown.written, "*IDN?\n".length);
      // The byte count was reached: a warning, which Close passes on unchanged (measured).
      const warning = { status: false, code: VI_SUCCESS_MAX_CNT, source: "VISA Read" };
      assert.deepEqual(shown.readError, warning);
      assert.deepEqual(shown.closeError, warning);
    } finally {
      instrument.stop();
    }
  });
}

test("with an error in, the VISA functions do nothing and pass the error on", async () => {
  const instrument = await startInstrument();
  try {
    const errorIn = { status: true, code: 5000, source: "upstream" };
    const shown = await run(identityQuery(instrument.resource, IDENTITY.length, { errorIn }));
    assert.equal(shown.buffer, "");
    assert.equal(shown.returned, 0);
    assert.equal(shown.written, 0);
    assert.deepEqual(shown.readError, errorIn);
    assert.deepEqual(shown.closeError, errorIn);
  } finally {
    instrument.stop();
  }
});

/** Write `*IDN?\n` and Read straight from a resource name constant, with no VISA Open; optionally Close twice before. */
const queryWithoutOpen = (resource, byteCount) =>
  buildVI(CAT, (b) => {
    b.node("name", "visa-resource-constant", { value: resource });
    b.node("query", "str-const", { value: "*IDN?\n" });
    b.node("write", "visa-write");
    b.node("count", "const", { value: byteCount, type: "u32" });
    b.node("read", "visa-read");
    b.node("buffer", "str-indicator");
    b.node("writeError", "cluster-indicator", { type: ERROR, style: "error-out" });
    b.wire("name.result", "write.resource");
    b.wire("query.result", "write.write-buffer");
    b.wire("write.resource-out", "read.resource");
    b.wire("count.result", "read.byte-count");
    b.wire("write.error-out", "read.error-in");
    b.wire("read.read-buffer", "buffer.value");
    b.wire("write.error-out", "writeError.value");
  });

test("Write and Read on a resource name never opened open it from the name, as LabVIEW does", async () => {
  const instrument = await startInstrument();
  try {
    const shown = await run(queryWithoutOpen(instrument.resource, IDENTITY.length));
    assert.equal(shown.buffer, IDENTITY);
    assert.deepEqual(shown.writeError, { status: false, code: 0, source: "" });
  } finally {
    instrument.stop();
  }
});

/** Open → Close → Close again → Write → Read, errors chained, with each Close's error out shown. */
const queryAfterClose = (resource, byteCount) =>
  buildVI(CAT, (b) => {
    b.node("name", "visa-resource-constant", { value: resource });
    b.node("open", "visa-open");
    b.node("close", "visa-close");
    b.node("closeAgain", "visa-close");
    b.node("query", "str-const", { value: "*IDN?\n" });
    b.node("write", "visa-write");
    b.node("count", "const", { value: byteCount, type: "u32" });
    b.node("read", "visa-read");
    b.node("buffer", "str-indicator");
    b.node("closeError", "cluster-indicator", { type: ERROR, style: "error-out" });
    b.node("closeAgainError", "cluster-indicator", { type: ERROR, style: "error-out" });
    b.wire("name.result", "open.resource");
    b.wire("open.resource-out", "close.resource");
    b.wire("open.error-out", "close.error-in");
    b.wire("open.resource-out", "closeAgain.resource");
    b.wire("close.error-out", "closeAgain.error-in");
    b.wire("open.resource-out", "write.resource");
    b.wire("closeAgain.error-out", "write.error-in");
    b.wire("query.result", "write.write-buffer");
    b.wire("write.resource-out", "read.resource");
    b.wire("count.result", "read.byte-count");
    b.wire("write.error-out", "read.error-in");
    b.wire("read.read-buffer", "buffer.value");
    b.wire("close.error-out", "closeError.value");
    b.wire("closeAgain.error-out", "closeAgainError.value");
  });

test("closing a closed session is a warning, and Write and Read after Close open it again", async () => {
  const instrument = await startInstrument();
  try {
    const shown = await run(queryAfterClose(instrument.resource, IDENTITY.length));
    assert.deepEqual(shown.closeError, { status: false, code: 0, source: "" });
    assert.deepEqual(shown.closeAgainError, { status: false, code: VI_WARN_NULL_OBJECT, source: "VISA Close" });
    assert.equal(shown.buffer, IDENTITY);
  } finally {
    instrument.stop();
  }
});

/** Solder's VISA served over a message port, as the editor's I/O process serves it to a Run's coordinator. */
function ioThroughAPort() {
  const { port1, port2 } = new MessageChannel();
  serveSolderIo(loadSolderIo(), { onRequest: (listener) => port1.on("message", listener), answer: (message) => port1.postMessage(message) });
  const client = createIoClient(port2);
  return { client, close: () => (client.disconnect(), port1.close()) };
}

test("a Run talks to an instrument through a message port to the I/O, as in the editor", async () => {
  const instrument = await startInstrument();
  const io = ioThroughAPort();
  try {
    const shown = await run(identityQuery(instrument.resource, IDENTITY.length), { io: io.client, poolPorts: pool.connect() });
    assert.equal(shown.buffer, IDENTITY);
    assert.deepEqual(shown.closeError, { status: false, code: VI_SUCCESS_MAX_CNT, source: "VISA Read" });
  } finally {
    io.close();
    instrument.stop();
  }
});

test("when the I/O process ends, a Run waiting for an instrument fails instead of hanging", async () => {
  const instrument = await startInstrument();
  const io = ioThroughAPort();
  const LOST_AFTER_MS = 50;
  try {
    // More bytes than the instrument sends: the Read waits for its 2 s timeout.
    const running = run(identityQuery(instrument.resource, 1000), { io: io.client });
    setTimeout(() => io.client.fail("The instrument I/O process stopped."), LOST_AFTER_MS);
    const start = performance.now();
    await assert.rejects(running, /The instrument I\/O process stopped/);
    assert.ok(performance.now() - start < 1000, "it fails at once, not at the Read's timeout");
  } finally {
    io.close();
    instrument.stop();
  }
});

test("a Run with VISA but no instrument I/O fails and says why", async () => {
  const vi = identityQuery("TCPIP0::127.0.0.1::1::SOCKET", 1);
  await assert.rejects(run(vi, { io: undefined }), /Instrument I\/O is not available/);
});

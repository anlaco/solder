// How the main process keeps the instrument I/O process (DT-065 §3), tried with a fake Electron: started
// by the first Run that needs it, shared by the next ones, started again after it ends.

import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "node:test";

import { createInstrumentIoProcess } from "../../editor/electron/instrument-io-process.mjs";

/** A fake utilityProcess that records the ports it is given. */
function fakeChild() {
  const child = new EventEmitter();
  child.ports = [];
  child.killed = false;
  child.postMessage = (_message, ports) => child.ports.push(...ports);
  child.kill = () => (child.killed = true);
  return child;
}

function fakeElectron() {
  const children = [];
  let exits = 0;
  let channels = 0;
  const io = createInstrumentIoProcess({
    fork: () => children[children.push(fakeChild()) - 1],
    createChannel: () => ({ port1: `child end ${++channels}`, port2: `Run end ${channels}` }),
    onExit: () => exits++,
  });
  return { io, children, exits: () => exits };
}

test("the I/O process starts with the first Run that needs it and serves the next ones", () => {
  const { io, children } = fakeElectron();
  assert.equal(children.length, 0, "no process until a Run needs it");
  assert.equal(io.connect(), "Run end 1");
  assert.equal(io.connect(), "Run end 2");
  assert.equal(children.length, 1);
  assert.deepEqual(children[0].ports, ["child end 1", "child end 2"]);
});

test("when the I/O process ends the windows are told, and the next Run starts a new one", () => {
  const { io, children, exits } = fakeElectron();
  io.connect();
  children[0].emit("exit", 139);
  assert.equal(exits(), 1);
  io.connect();
  assert.equal(children.length, 2);
  assert.deepEqual(children[1].ports, ["child end 2"]);
});

test("quitting Solder ends the I/O process", () => {
  const { io, children } = fakeElectron();
  io.connect();
  io.stop();
  assert.ok(children[0].killed);
});

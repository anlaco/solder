import { test } from "node:test";
import assert from "node:assert/strict";
import { createTurnYielder } from "../../core/runtime/turn-yielder.mjs";

const NEVER_WOKEN_MS = 500;
const withinTime = (promise) =>
  Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error("a yield was never woken")), NEVER_WOKEN_MS))]);

// Issue #1: two parallel loops whose waits end in the same task (Windows coalesces timers) yield
// before the first message arrives; the first loop must not stay suspended for ever.
test("two yields through the MessageChannel at once both wake up, as in a worker", async () => {
  const { yieldTurn, close } = createTurnYielder({ immediate: null });
  try {
    await withinTime(Promise.all([yieldTurn(), yieldTurn()]));
  } finally {
    close();
  }
});

test("yields through the MessageChannel wake up in the order they were made", async () => {
  const { yieldTurn, close } = createTurnYielder({ immediate: null });
  const woken = [];
  try {
    await withinTime(Promise.all([1, 2, 3].map((n) => yieldTurn().then(() => woken.push(n)))));
    assert.deepEqual(woken, [1, 2, 3]);
  } finally {
    close();
  }
});

test("with setImmediate, two yields at once both wake up", async () => {
  const { yieldTurn, close } = createTurnYielder();
  await withinTime(Promise.all([yieldTurn(), yieldTurn()]));
  close();
});

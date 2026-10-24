import { test } from "node:test";
import assert from "node:assert/strict";
import { createRealHost, createScheduler, createVirtualHost } from "../../core/runtime/scheduler.mjs";

/** A scheduler on a virtual clock, with the trace of what it did. */
function setUp(threadCount = 1) {
  const host = createVirtualHost();
  const events = [];
  const scheduler = createScheduler({ host, threadCount, onTrace: (event) => events.push(event) });
  return { host, scheduler, events };
}

const starts = (events) => events.filter((event) => event.event === "start").map((event) => event.clump);

test("a clump starts only when the clumps it depends on have ended, in order of readiness", async () => {
  const { scheduler, events } = setUp();
  await scheduler.run([{ run: () => {} }, { deps: [0], run: () => {} }, { run: () => {} }, { deps: [1, 2], run: () => {} }]);
  assert.deepEqual(starts(events), ["c0", "c2", "c1", "c3"]);
});

test("a Run with no clumps ends at once", async () => {
  const { scheduler } = setUp();
  await scheduler.run([]);
});

test("a clump that yields goes behind the clumps already ready", async () => {
  const { scheduler } = setUp();
  const order = [];
  const loop = (name) => async (context) => {
    for (let iteration = 0; iteration < 3; iteration++) {
      order.push(`${name}${iteration}`);
      await context.yield();
    }
  };
  await scheduler.run([{ run: loop("a") }, { run: loop("b") }]);
  assert.deepEqual(order, ["a0", "b0", "a1", "b1", "a2", "b2"]);
});

test("timers wake in order of deadline, and a tie in the order the waits were made (issue #1)", async () => {
  const { scheduler, host } = setUp();
  const woken = [];
  const waitUntil = (name, deadline) => async (context) => {
    await context.sleepUntil(deadline);
    woken.push(`${name}@${host.now()}`);
  };
  await scheduler.run([{ run: waitUntil("late", 30) }, { run: waitUntil("first", 10) }, { run: waitUntil("second", 10) }]);
  assert.deepEqual(woken, ["first@10", "second@10", "late@30"]);
});

test("two loops of 1000 ms and 500 ms interleave exactly on the virtual clock", async () => {
  const { scheduler, host } = setUp();
  const resumes = [];
  const loop = (name, period) => async (context) => {
    for (let deadline = period; deadline <= 3000; deadline += period) {
      await context.sleepUntil(deadline);
      resumes.push(`${name}@${host.now()}`);
    }
  };
  await scheduler.run([{ run: loop("slow", 1000) }, { run: loop("fast", 500) }]);
  assert.deepEqual(resumes, [
    "fast@500", "slow@1000", "fast@1000", "fast@1500", "slow@2000", "fast@2000", "fast@2500", "slow@3000", "fast@3000",
  ]);
});

/** Clumps that each stay busy across a turn of the host between two yields; returns how many ran at once at most. */
async function mostAtOnce(threadCount, clumpCount) {
  const { scheduler } = setUp(threadCount);
  let running = 0;
  let most = 0;
  const nextHostTurn = () => new Promise((resolve) => setImmediate(resolve));
  // Clump k stays busy for k + 1 turns of the host, so some park while others still run and the
  // scheduler takes turns with threads busy.
  const compute = (busyTurns) => async (context) => {
    for (let slice = 0; slice < 3; slice++) {
      running++;
      most = Math.max(most, running);
      for (let turn = 0; turn < busyTurns; turn++) await nextHostTurn();
      running--;
      await context.yield();
    }
  };
  await scheduler.run(Array.from({ length: clumpCount }, (_, index) => ({ run: compute(index + 1) })));
  return most;
}

test("with one thread, one clump runs at a time", async () => {
  assert.equal(await mostAtOnce(1, 4), 1);
});

test("with a pool of threads, as many clumps run at once as there are threads (DT-063)", async () => {
  assert.equal(await mostAtOnce(2, 4), 2);
  assert.equal(await mostAtOnce(4, 4), 4);
  assert.equal(await mostAtOnce(8, 3), 3);
});

test("each thread is given the next ready clump, the lowest free thread first", async () => {
  const { scheduler, events } = setUp(2);
  await scheduler.run([{ run: () => {} }, { run: () => {} }, { run: () => {} }]);
  assert.deepEqual(
    events.filter((event) => event.event === "start").map((event) => [event.clump, event.thread]),
    [["c0", 0], ["c1", 1], ["c2", 0]],
  );
});

test("a non-reentrant subVI serves one call at a time, in the order the calls arrived", async () => {
  const { scheduler } = setUp(4);
  const inside = [];
  let callsInside = 0;
  const call = (name) => async (context) => {
    await context.acquire("Compute.vi");
    callsInside++;
    assert.equal(callsInside, 1, "two calls inside a non-reentrant subVI at once");
    inside.push(name);
    await context.yield();
    callsInside--;
    context.release("Compute.vi");
  };
  await scheduler.run([{ run: call("first") }, { run: call("second") }, { run: call("third") }]);
  assert.deepEqual(inside, ["first", "second", "third"]);
});

test("a clump that starts a subplan waits for it, and the subplan runs by dataflow", async () => {
  const { scheduler, events } = setUp();
  const order = [];
  await scheduler.run([
    {
      name: "loop",
      run: async (context) => {
        order.push("before");
        await context.join([{ run: () => order.push("x") }, { deps: [0], run: () => order.push("y") }]);
        order.push("after");
      },
    },
  ]);
  assert.deepEqual(order, ["before", "x", "y", "after"]);
  assert.deepEqual(starts(events), ["loop", "loop.0", "loop.1"]);
});

test("a clump waiting for an answer from outside gets it at the start of a turn, and the Run does not stop meanwhile", async () => {
  const { scheduler } = setUp();
  let answer;
  let answerDialog;
  const dialog = new Promise((resolve) => (answerDialog = resolve));
  const run = scheduler.run([{ run: async (context) => (answer = await context.waitFor(dialog, "error dialog")) }]);
  await new Promise((resolve) => setTimeout(resolve, 5));
  answerDialog("continue");
  await run;
  assert.equal(answer, "continue");
});

test("an answer from outside that fails is thrown in the clump that waited", async () => {
  const { scheduler } = setUp();
  const refused = new Error("the dialog was closed");
  let caught;
  await scheduler.run([
    {
      run: async (context) => {
        try {
          await context.waitFor(Promise.reject(refused), "dialog");
        } catch (error) {
          caught = error;
        }
      },
    },
  ]);
  assert.equal(caught, refused);
});

test("while one clump at a time is asked for, a clump starts only when the started ones end, or wait for a subplan (DT-047)", async () => {
  const host = createVirtualHost();
  const events = [];
  const scheduler = createScheduler({ host, oneClumpAtATime: () => true, onTrace: (event) => events.push(event) });
  const twoSlices = async (context) => {
    await context.yield();
    await context.yield();
  };
  await scheduler.run([
    { name: "a", run: twoSlices },
    { name: "b", run: twoSlices },
    { name: "loop", run: (context) => context.join([{ name: "body0", run: twoSlices }, { name: "body1", run: twoSlices }]) },
  ]);
  const startsAndEnds = events.filter((event) => event.event === "start" || event.event === "end").map((event) => `${event.event} ${event.clump}`);
  assert.deepEqual(startsAndEnds, [
    "start a", "end a", "start b", "end b", "start loop", "start body0", "end body0", "start body1", "end body1", "end loop",
  ]);
});

test("an import finds the clump that called it: the one running on its host thread", async () => {
  const { scheduler } = setUp();
  const seen = [];
  const importCalledBy = () => seen.push(scheduler.currentContext().name);
  await scheduler.run([
    { name: "first", run: async (context) => (importCalledBy(), await context.yield(), importCalledBy()) },
    { name: "second", run: () => importCalledBy() },
  ]);
  assert.deepEqual(seen, ["first", "second", "first"]);
  assert.equal(scheduler.currentContext(), null);
  assert.throws(() => createScheduler({ host: createVirtualHost(), threadCount: 2 }).currentContext(), /one clump at a time/);
});

test("Abort rejects the parked clumps, clears the timers and ends the Run as aborted", async () => {
  const { scheduler, host } = setUp(2); // two threads, so both clumps have parked by the first turn
  const rejected = [];
  const sleeper = (deadline) => async (context) => {
    try {
      await context.sleepUntil(deadline);
    } catch (error) {
      rejected.push(error.abortado);
      throw error;
    }
  };
  const run = scheduler.run([{ run: sleeper(1000) }, { run: sleeper(2000) }]);
  await new Promise((resolve) => setImmediate(resolve));
  scheduler.abort();
  await assert.rejects(run, (error) => error.abortado === true);
  assert.deepEqual(rejected, [true, true]);
  assert.equal(host.now(), 0, "the clock jumped to a timer that Abort should have cleared");
});

test("a Run whose clumps can no longer be woken ends with an error naming them", async () => {
  const { scheduler } = setUp();
  const run = scheduler.run([
    { name: "holder", run: (context) => context.acquire("Subvi.vi") }, // ends without releasing it
    { name: "caller", deps: [0], run: (context) => context.acquire("Subvi.vi") },
  ]);
  await assert.rejects(run, (error) => {
    assert.deepEqual(error.deadlock, ["caller"]);
    assert.match(error.message, /caller waits for its turn at a non-reentrant subVI/);
    return true;
  });
});

test("an error in a clump ends the Run with that error", async () => {
  const { scheduler } = setUp();
  const fault = new Error("fault in a clump");
  await assert.rejects(
    scheduler.run([
      { run: async (context) => context.sleepUntil(100) },
      {
        run: () => {
          throw fault;
        },
      },
    ]),
    fault,
  );
});

test("a scheduler needs at least one thread", () => {
  assert.throws(() => createScheduler({ host: createVirtualHost(), threadCount: 0 }), RangeError);
});

// ——— The real host ———

const NEVER_RUN_MS = 500;
const withinTime = (promise) =>
  Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error("a turn never ran")), NEVER_RUN_MS))]);
const turnOf = (host) => new Promise((resolve) => host.soon(resolve));

// Issue #1: two parallel loops whose waits end in the same task (Windows coalesces timers) asked for
// a turn before the first message arrived; the first one must not be lost.
test("two turns asked for through the MessageChannel at once both run, as in a worker", async () => {
  const host = createRealHost({ immediate: null });
  try {
    await withinTime(Promise.all([turnOf(host), turnOf(host)]));
  } finally {
    host.close();
  }
});

test("turns through the MessageChannel run in the order they were asked for", async () => {
  const host = createRealHost({ immediate: null });
  const order = [];
  try {
    await withinTime(Promise.all([1, 2, 3].map((n) => turnOf(host).then(() => order.push(n)))));
    assert.deepEqual(order, [1, 2, 3]);
  } finally {
    host.close();
  }
});

test("on the real host two waits that end together both wake, in the order they were made", async () => {
  const host = createRealHost({ immediate: null });
  const scheduler = createScheduler({ host });
  const deadline = host.now() + 5;
  const woken = [];
  const waiter = (name) => async (context) => {
    await context.sleepUntil(deadline);
    woken.push(name);
  };
  try {
    await withinTime(scheduler.run([{ run: waiter("first") }, { run: waiter("second") }]));
    assert.deepEqual(woken, ["first", "second"]);
  } finally {
    host.close();
  }
});

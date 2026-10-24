import { test } from "node:test";
import assert from "node:assert/strict";
import { createScheduler, createVirtualHost } from "../../core/runtime/scheduler.mjs";

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
  const run = scheduler.run([{ name: "dialog", run: async (context) => (answer = await context.waitExternal("error dialog")) }]);
  await new Promise((resolve) => setTimeout(resolve, 5));
  scheduler.wake("dialog", "continue");
  await run;
  assert.equal(answer, "continue");
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

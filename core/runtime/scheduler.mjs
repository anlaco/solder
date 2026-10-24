// The scheduler of one Run (DT-061, amended by DT-063): the only thing that starts or resumes a
// clump, in an order of its own, never the host's. It hands ready clumps to a pool of threads, as
// LabVIEW hands them to the threads of its execution systems; with one thread the order of resumes
// is exact and the same in every host, which is what the reference traces check.
//
// A clump is a function that runs until it ends or parks. It parks by awaiting one of the methods
// of the context it is given (`yield`, `sleepUntil`, `acquire`, `join`, `waitExternal`), and only
// the scheduler wakes it. The host gives three things: the time, one timer for the earliest
// deadline, and "run the next turn" (`createVirtualHost` is a host whose clock jumps, for tests).

/** The error a Run ends with when it is aborted: not a fault of the VI. */
export const abortedError = () => Object.assign(new Error("The VI was aborted."), { abortado: true });

/** Why a parked clump waits, for the deadlock message. */
const PARK_REASONS = {
  yield: "yields its turn",
  timer: "waits for a timer",
  lock: "waits for its turn at a non-reentrant subVI",
  join: "waits for the clumps it started",
  external: "waits for an answer from outside",
};

/**
 * Makes the scheduler of one Run.
 * @param {{ host: Host, threadCount?: number, onTrace?: (event: TraceEvent) => void }} options
 *   `threadCount` threads run clumps at once (DT-063); `onTrace` hears every start, resume, park and end.
 * @typedef {{ now(): number, setTimer(at: number, wake: () => void): unknown, clearTimer(timer: unknown): void, soon(turn: () => void): void }} Host
 * @typedef {{ event: "start" | "resume" | "park" | "end", clump: string, thread: number, at: number, reason?: string }} TraceEvent
 * @typedef {{ name?: string, deps?: number[], run: (context: ClumpContext) => unknown }} ClumpSpec
 */
export function createScheduler({ host, threadCount = 1, onTrace }) {
  if (!Number.isInteger(threadCount) || threadCount < 1) throw new RangeError(`A scheduler needs at least one thread, not ${threadCount}.`);

  const readyQueue = [];
  const timerQueue = []; // ordered by (deadline, sequence)
  const inbox = [];
  const lockWaiters = new Map(); // lock → clumps waiting for it, oldest first; present while the lock is held
  const parkedClumps = new Set();
  const threads = Array.from({ length: threadCount }, () => null); // the clump each thread runs, or null
  let liveClumps = 0;
  let sequence = 0;
  let turnRequested = false;
  let hostTimer = null;
  let hostTimerDeadline = Infinity;
  let finished = false;
  let settleRun = null;

  const trace = (event, clump, extra = {}) => onTrace?.({ event, clump: clump.name, thread: clump.thread, at: host.now(), ...extra });

  // ——— Clumps and groups ———

  /** A set of clumps that depend on each other by index; it ends when all of them have ended. */
  function addGroup(specs, prefix, onEnd) {
    const group = { remaining: specs.length, onEnd };
    const clumps = specs.map((spec, index) => ({
      name: spec.name ?? `${prefix}${index}`,
      run: spec.run,
      group,
      waitingFor: spec.deps?.length ?? 0,
      dependents: [],
      started: false,
      thread: -1,
      resume: null,
      reject: null,
      parkReason: null,
    }));
    specs.forEach((spec, index) => spec.deps?.forEach((dependency) => clumps[dependency].dependents.push(clumps[index])));
    liveClumps += clumps.length;
    if (!clumps.length) onEnd();
    for (const clump of clumps) if (clump.waitingFor === 0) readyQueue.push(clump);
    return clumps;
  }

  function endClump(clump) {
    trace("end", clump);
    freeThread(clump);
    liveClumps--;
    for (const dependent of clump.dependents) if (--dependent.waitingFor === 0) readyQueue.push(dependent);
    if (--clump.group.remaining === 0) clump.group.onEnd();
    requestTurn();
  }

  function freeThread(clump) {
    threads[clump.thread] = null;
    clump.thread = -1;
  }

  // ——— Parking and waking ———

  function park(clump, reason, enqueue) {
    if (finished) return Promise.reject(abortedError());
    return new Promise((resume, reject) => {
      trace("park", clump, { reason: reason.kind });
      freeThread(clump);
      clump.parkReason = reason;
      clump.resume = resume;
      clump.reject = reject;
      parkedClumps.add(clump);
      enqueue();
      requestTurn();
    });
  }

  function makeReady(clump, value) {
    clump.wakeValue = value;
    readyQueue.push(clump);
  }

  function contextOf(clump) {
    return {
      name: clump.name,
      yield: () => park(clump, { kind: "yield" }, () => readyQueue.push(clump)),
      sleepUntil: (deadline) =>
        park(clump, { kind: "timer" }, () => {
          insertTimer({ deadline, sequence: sequence++, clump });
        }),
      acquire: (lock) => {
        if (!lockWaiters.has(lock)) {
          lockWaiters.set(lock, []);
          return Promise.resolve();
        }
        return park(clump, { kind: "lock", lock }, () => lockWaiters.get(lock).push(clump));
      },
      release: (lock) => {
        const next = lockWaiters.get(lock)?.shift();
        if (next) makeReady(next);
        else lockWaiters.delete(lock);
        requestTurn();
      },
      join: (specs) =>
        park(clump, { kind: "join" }, () => {
          addGroup(specs, `${clump.name}.`, () => makeReady(clump));
        }),
      waitExternal: (tag) => park(clump, { kind: "external", tag }, () => {}),
    };
  }

  function insertTimer(timer) {
    const position = timerQueue.findIndex((other) => other.deadline > timer.deadline);
    timerQueue.splice(position < 0 ? timerQueue.length : position, 0, timer);
  }

  // ——— Turns ———

  function requestTurn() {
    if (turnRequested || finished) return;
    turnRequested = true;
    host.soon(turn);
  }

  function turn() {
    turnRequested = false;
    if (finished) return;
    readInbox();
    if (finished) return;
    moveDueTimers();
    dispatch();
    armHostTimer();
    detectDeadlock();
  }

  function readInbox() {
    for (const message of inbox.splice(0)) {
      if (message.kind === "abort") return endRun(abortedError());
      if (message.kind === "wake" && message.clump.parkReason?.kind === "external") makeReady(message.clump, message.value);
    }
  }

  function moveDueTimers() {
    const now = host.now();
    while (timerQueue.length && timerQueue[0].deadline <= now) readyQueue.push(timerQueue.shift().clump);
  }

  function dispatch() {
    for (let thread = 0; thread < threads.length && readyQueue.length; thread++) {
      if (threads[thread]) continue;
      runOn(thread, readyQueue.shift());
    }
  }

  function runOn(thread, clump) {
    threads[thread] = clump;
    clump.thread = thread;
    if (clump.started) {
      trace("resume", clump);
      parkedClumps.delete(clump);
      clump.parkReason = null;
      const value = clump.wakeValue;
      clump.wakeValue = undefined;
      clump.resume(value);
      return;
    }
    clump.started = true;
    trace("start", clump);
    let result;
    try {
      result = clump.run(contextOf(clump));
    } catch (error) {
      return endRun(error);
    }
    if (result && typeof result.then === "function") result.then(() => endClump(clump), endRun);
    else endClump(clump);
  }

  function armHostTimer() {
    const earliest = timerQueue[0]?.deadline ?? Infinity;
    if (earliest === hostTimerDeadline) return;
    if (hostTimer !== null) host.clearTimer(hostTimer);
    hostTimer = null;
    hostTimerDeadline = earliest;
    if (earliest !== Infinity)
      hostTimer = host.setTimer(earliest, () => {
        hostTimer = null;
        hostTimerDeadline = Infinity;
        requestTurn();
      });
  }

  // Nothing runs, nothing is ready, no timer is pending and nobody outside is expected to answer:
  // the clumps still alive can never be woken (issue #1 would have ended here, not hung).
  function detectDeadlock() {
    if (!liveClumps || threads.some(Boolean) || readyQueue.length || timerQueue.length || inbox.length) return;
    const parked = [...parkedClumps];
    if (parked.some((clump) => clump.parkReason.kind === "external")) return;
    const who = parked.map((clump) => `${clump.name} ${PARK_REASONS[clump.parkReason.kind]}`).join("; ");
    endRun(Object.assign(new Error(`The VI can no longer go on: ${who || "no clump can run"}.`), { deadlock: parked.map((clump) => clump.name) }));
  }

  function endRun(error) {
    if (finished) return;
    finished = true;
    if (hostTimer !== null) host.clearTimer(hostTimer);
    for (const clump of parkedClumps) clump.reject(abortedError());
    parkedClumps.clear();
    timerQueue.length = 0;
    readyQueue.length = 0;
    settleRun(error);
  }

  return {
    /** Runs the top-level clumps; resolves when every clump has ended, rejects with the first error, Abort or deadlock. */
    run(specs) {
      return new Promise((resolve, reject) => {
        settleRun = (error) => (error ? reject(error) : resolve());
        addGroup(specs, "c", () => {
          if (finished) return;
          finished = true;
          settleRun(null);
        });
        requestTurn();
      });
    },
    /** Abort, read at the start of the next turn (DT-061 §5). */
    abort() {
      inbox.push({ kind: "abort" });
      requestTurn();
    },
    /** The answer to a clump that waits for something outside (a dialog, the debugger). */
    wake(clumpName, value) {
      const clump = [...parkedClumps].find((parked) => parked.name === clumpName);
      if (!clump) return;
      inbox.push({ kind: "wake", clump, value });
      requestTurn();
    },
  };
}

/**
 * A host for tests whose clock jumps to the next deadline when nothing else is left to do
 * (DT-061 §6), so an interleaving of parallel waits is checked exactly and at once.
 * `spend(ms)` moves the clock on, as if a clump had computed for that long.
 */
export function createVirtualHost({ start = 0 } = {}) {
  let now = start;
  const turns = [];
  const timers = new Set();
  let pumping = false;

  // A step runs after every pending promise job, so the clumps resumed by the last turn have
  // parked or ended before the next turn or the next jump of the clock.
  const step = () => {
    pumping = false;
    if (turns.length) {
      turns.shift()();
    } else if (timers.size) {
      const earliest = [...timers].reduce((first, timer) => (timer.at < first.at ? timer : first));
      timers.delete(earliest);
      now = Math.max(now, earliest.at);
      earliest.wake();
    } else return;
    pump();
  };
  const pump = () => {
    if (pumping) return;
    pumping = true;
    setImmediate(step);
  };

  return {
    now: () => now,
    spend: (milliseconds) => {
      now += milliseconds;
    },
    soon: (turn) => {
      turns.push(turn);
      pump();
    },
    setTimer: (at, wake) => {
      const timer = { at, wake };
      timers.add(timer);
      pump();
      return timer;
    },
    clearTimer: (timer) => timers.delete(timer),
  };
}

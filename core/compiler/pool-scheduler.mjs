// The scheduler of a Run, in the module itself and over its shared memory (DT-063 §9): every
// thread of the pool runs `run_thread`, which takes a ready clump, calls it through the table,
// reads how it returned and goes on, so passing from one clump to the next never crosses into
// JavaScript. Only the outside world stays in JavaScript (the clock, dialogs, the debugger and,
// until DT-063 §10, the panel).
//
// It keeps the rules of the reference model, `core/runtime/scheduler.mjs` (DT-061): dataflow order,
// timers by (deadline, sequence), typed park reasons, Abort and deadlock as states. With one thread
// the ready queue is FIFO and `run_thread` runs one clump per call ("a turn"), so the order of
// resumes is the model's; with more, each thread takes the newest clump of its own deque (its
// inputs are still in that core's cache) and a thread with nothing to do steals the oldest of
// another's (Chase and Lev, "Dynamic Circular Work-Stealing Deque", 2005).
//
// The state of a clump goes IDLE → READY → RUNNING → PARKED → READY … → ENDED. A clump can be woken
// (a timer, its turn at a subVI, the end of its subplan, an answer from outside) while it is still
// returning from the park on its thread; then it goes RUNNING → WAKE_PENDING, and the thread puts it
// back as ready as soon as it has returned, so no clump is resumed before its state is saved.
//
// Every address the functions use comes from the header at SCHEDULER, which the compiler fills for
// each module: the functions are the same in every module.

import { HEAP_LOCK, SCHEDULER } from "./linear-memory.mjs";

// ——— The header (offsets from SCHEDULER) ———
export const HEADER = {
  clumps: 0, // address of the clump records
  clumpCount: 4,
  groups: 8, // address of the group records: group 0 is the top-level VI, group p + 1 is plan p
  groupCount: 12,
  dependents: 16, // address of the I32 ids of every clump's dependents, clump after clump
  threads: 20, // how many threads run clumps
  deques: 24, // address of the first deque, 8-aligned
  dequeMask: 28, // a deque holds a power of two of clump ids, at least the number of clumps
  dequeStride: 32, // bytes from one deque to the next
  dequesAllocated: 36,
  abort: 40,
  runState: 44,
  liveClumps: 48,
  externalWaits: 52, // clumps waiting for an answer from outside the Run
  workEpoch: 56, // raised whenever there is new work or a new earliest deadline; threads sleep on it
  idleThreads: 60,
  timerLock: 64,
  timerCount: 68,
  timerHeap: 72,
  timerSequence: 76,
  subVILockLock: 80, // guards every subVI lock's waiters
  subVILocks: 84,
  oneClumpAtATime: 88,
  runningClumps: 92,
};

// ——— A clump's record ———
export const CLUMP_BYTES = 72;
export const CLUMP = {
  waitingFor: 0, // the wires it still waits for
  state: 4,
  parkKind: 8,
  wakeValue: 12, // what it resumes with
  deadline: 16, // F64, while it waits for a timer
  group: 24,
  initialDependencies: 28,
  dependentsStart: 32,
  dependentsCount: 36,
  lastBudgetCall: 40, // F64: the budget of iterations of a loop (DT-041)
  lastYield: 48, // F64
  iterations: 56,
  lock: 60, // the subVI lock it waits for
  started: 64,
};

export const GROUP_BYTES = 16;
export const GROUP = { remaining: 0, parent: 4, first: 8, count: 12 };

// A non-reentrant subVI's lock: held, and a FIFO of the clumps waiting for it (DT-061 §2).
export const LOCK_BYTES = 16;
const LOCK = { held: 0, head: 4, tail: 8, waiters: 12 };

const TIMER_BYTES = 16;
const TIMER = { deadline: 0, sequence: 8, clump: 12 };
const DEQUE_HEADER_BYTES = 16;
const DEQUE = { top: 0, bottom: 8 };

export const STATE = { idle: 0, ready: 1, running: 2, parked: 3, wakePending: 4, ended: 5 };
export const PARK_KIND = { none: 0, yield: 1, timer: 2, lock: 3, join: 4, external: 5 };
/** What `run_thread` returns: the state of the Run when it is over, or how the call ended. */
export const RUN_STATUS = { running: 0, done: 1, aborted: 2, deadlock: 3, stepped: 4, idle: 5 };

// A loop yields its turn every ~8 ms, and its budget of iterations is adjusted so that it calls
// every ~1 ms (DT-041).
const YIELD_EVERY_MS = 8;
const MOST_ITERATIONS = 1 << 24;
const SHORTEST_ELAPSED_MS = 0.001;
const NANOSECONDS_PER_MS = 1e6;
const WAKE_EVERY_THREAD = 0x7fffffff;
const NONE = -1;

/** The number of clump ids a deque holds for `clumpCount` clumps: a power of two, never less. */
export const dequeCapacity = (clumpCount) => 2 ** Math.max(1, Math.ceil(Math.log2(Math.max(clumpCount, 2))));
export const dequeStride = (clumpCount) => DEQUE_HEADER_BYTES + dequeCapacity(clumpCount) * 4;

const ins = (op, arg) => (arg === undefined ? { op } : { op, arg });
const get = (local) => ins("local.get", local);
const set = (local) => ins("local.set", local);
const tee = (local) => ins("local.tee", local);
const k = (n) => ins("i32.const", n);
const header = (field) => SCHEDULER + HEADER[field];
/** A field of the header that is fixed during a Run. */
const readHeader = (field) => [k(0), ins("i32.load", header(field))];
const loadHeader = (field) => [k(0), ins("i32.atomic.load", header(field))];
const storeHeader = (field, value) => [k(0), ...value, ins("i32.atomic.store", header(field))];
/** Adds `delta` to a field of the header and leaves its value from before. */
const addHeader = (field, delta) => [k(0), k(delta), ins("i32.atomic.rmw.add", header(field))];
const ifThen = (condition, body, elseBody) => [...condition, ins("if"), ...body, ...(elseBody ? [ins("else"), ...elseBody] : []), ins("end")];
/** `for (index = from; index < to; index++) body`, with `to` re-evaluated every turn. */
const forEach = (index, from, to, body) => [
  ...from, set(index),
  ins("block"), ins("loop"),
  get(index), ...to, ins("i32.ge_s"), ins("br_if", 1),
  ...body,
  get(index), k(1), ins("i32.add"), set(index), ins("br", 0),
  ins("end"), ins("end"),
];

/**
 * The scheduler's functions, in the order they go in the module. `functionIndex(name)` gives the index
 * of a function by name (an import, a memory function or one of these); `globals` the per-thread
 * globals; `clumpType` the type index of a clump, `() → ()`.
 */
export function schedulerFunctions({ functionIndex, globals, clumpType }) {
  const call = (name) => ins("call", functionIndex(name));
  const currentClump = [ins("global.get", globals.currentClump)];
  const currentThread = [ins("global.get", globals.currentThread)];
  const raiseParking = [k(1), ins("global.set", globals.parking)];
  const recordOf = (clump) => [...clump, call("clump_record")];
  const fn = (nombre, params, results, locales, cuerpo) => ({ nombre, params, results, locales, cuerpo });

  /** The address of slot `index` (an I64 local) of the deque at `deque` (a local). */
  const slot = (deque, index) => [get(deque), k(DEQUE_HEADER_BYTES), ins("i32.add"), get(index), ins("i32.wrap_i64"), ...readHeader("dequeMask"), ins("i32.and"), k(4), ins("i32.mul"), ins("i32.add")];
  /** Parks the calling clump for `kind`: the clump sees `parking` and returns. */
  const park = (kind) => [...recordOf(currentClump), k(kind), ins("i32.store", CLUMP.parkKind), ...raiseParking, k(0)];

  return [
    fn("clump_record", ["i32"], ["i32"], [], [...readHeader("clumps"), get(0), k(CLUMP_BYTES), ins("i32.mul"), ins("i32.add")]),
    fn("group_record", ["i32"], ["i32"], [], [...readHeader("groups"), get(0), k(GROUP_BYTES), ins("i32.mul"), ins("i32.add")]),
    fn("lock_record", ["i32"], ["i32"], [], [...readHeader("subVILocks"), get(0), k(LOCK_BYTES), ins("i32.mul"), ins("i32.add")]),
    fn("deque", ["i32"], ["i32"], [], [...readHeader("deques"), get(0), ...readHeader("dequeStride"), ins("i32.mul"), ins("i32.add")]),

    // notify_work(all): there is something new to do; wakes one sleeping thread, or all of them.
    fn("notify_work", ["i32"], [], [], [
      ...addHeader("workEpoch", 1), ins("drop"),
      ...ifThen(loadHeader("idleThreads"), [k(0), k(WAKE_EVERY_THREAD), k(1), get(0), ins("select"), ins("memory.atomic.notify", header("workEpoch")), ins("drop")]),
    ]),

    // push(thread, clump): onto the bottom of the thread's own deque; only its owner pushes there.
    fn("push", ["i32", "i32"], [], ["i32", "i64"], [
      get(0), call("deque"), set(2),
      get(2), ins("i64.atomic.load", DEQUE.bottom), set(3),
      ...slot(2, 3), get(1), ins("i32.atomic.store"),
      get(2), get(3), ins("i64.const", 1), ins("i64.add"), ins("i64.atomic.store", DEQUE.bottom),
      k(0), call("notify_work"),
    ]),

    // take_own(thread) → the newest clump of the thread's own deque, or -1.
    fn("take_own", ["i32"], ["i32"], ["i32", "i64", "i64", "i32"], [
      get(0), call("deque"), set(1),
      get(1), ins("i64.atomic.load", DEQUE.bottom), ins("i64.const", 1), ins("i64.sub"), set(2),
      get(1), get(2), ins("i64.atomic.store", DEQUE.bottom),
      get(1), ins("i64.atomic.load", DEQUE.top), set(3),
      ...ifThen([get(3), get(2), ins("i64.gt_s")], [get(1), get(2), ins("i64.const", 1), ins("i64.add"), ins("i64.atomic.store", DEQUE.bottom), k(NONE), ins("return")]),
      ...slot(1, 2), ins("i32.atomic.load"), set(4),
      // The last one: a thief may take it at the same time, and only one of them wins it.
      ...ifThen([get(3), get(2), ins("i64.eq")], [
        ...ifThen([get(1), get(3), get(3), ins("i64.const", 1), ins("i64.add"), ins("i64.atomic.rmw.cmpxchg", DEQUE.top), get(3), ins("i64.ne")], [k(NONE), set(4)]),
        get(1), get(2), ins("i64.const", 1), ins("i64.add"), ins("i64.atomic.store", DEQUE.bottom),
      ]),
      get(4),
    ]),

    // steal(victim) → the oldest clump of the victim's deque, or -1 (empty, or another thief won it).
    fn("steal", ["i32"], ["i32"], ["i32", "i64", "i64", "i32"], [
      get(0), call("deque"), set(1),
      get(1), ins("i64.atomic.load", DEQUE.top), set(2),
      get(1), ins("i64.atomic.load", DEQUE.bottom), set(3),
      ...ifThen([get(2), get(3), ins("i64.ge_s")], [k(NONE), ins("return")]),
      ...slot(1, 2), ins("i32.atomic.load"), set(4),
      ...ifThen([get(1), get(2), get(2), ins("i64.const", 1), ins("i64.add"), ins("i64.atomic.rmw.cmpxchg", DEQUE.top), get(2), ins("i64.ne")], [k(NONE), ins("return")]),
      get(4),
    ]),

    // any_going() → whether a started clump has not ended and does not wait for its subplan: while
    // Highlight Execution runs clumps one at a time, a new one waits for it (DT-047).
    fn("any_going", [], ["i32"], ["i32", "i32"], [
      ...forEach(0, [k(0)], readHeader("clumpCount"), [
        get(0), call("clump_record"), set(1),
        ...ifThen([
          get(1), ins("i32.load", CLUMP.started),
          get(1), ins("i32.atomic.load", CLUMP.state), k(STATE.ended), ins("i32.ne"), ins("i32.and"),
          get(1), ins("i32.load", CLUMP.parkKind), k(PARK_KIND.join), ins("i32.ne"), ins("i32.and"),
        ], [k(1), ins("return")]),
      ]),
      k(0),
    ]),

    // take_one_at_a_time() → the oldest clump of deque 0 that may run while Highlight Execution is on
    // (one that already started, or any when nothing else is going), taken out of the deque; or -1.
    // Only with one thread.
    fn("take_one_at_a_time", [], ["i32"], ["i32", "i64", "i64", "i32", "i32"], [
      call("any_going"), set(4),
      k(0), call("deque"), set(0),
      get(0), ins("i64.load", DEQUE.top), set(1),
      ins("block"), ins("loop"),
      ...ifThen([get(1), get(0), ins("i64.load", DEQUE.bottom), ins("i64.ge_s")], [k(NONE), ins("return")]),
      ...slot(0, 1), ins("i32.load"), set(3),
      get(3), call("clump_record"), ins("i32.load", CLUMP.started), get(4), ins("i32.eqz"), ins("i32.or"), ins("br_if", 1),
      get(1), ins("i64.const", 1), ins("i64.add"), set(1), ins("br", 0),
      ins("end"), ins("end"),
      // The ones after it move up one place.
      get(0), ins("i64.load", DEQUE.bottom), ins("i64.const", 1), ins("i64.sub"), set(2),
      ins("block"), ins("loop"),
      get(1), get(2), ins("i64.ge_s"), ins("br_if", 1),
      ...slot(0, 1), get(1), ins("i64.const", 1), ins("i64.add"), set(1), ...slot(0, 1), ins("i32.load"), ins("i32.store"),
      ins("br", 0),
      ins("end"), ins("end"),
      get(0), get(2), ins("i64.store", DEQUE.bottom),
      get(3),
    ]),

    // take(thread) → the next clump this thread runs, or -1. One thread takes the oldest (FIFO, the
    // model's order); a thread of a pool, the newest of its own and then the oldest of another's,
    // the coordinator's deque (the last one) included.
    fn("take", ["i32"], ["i32"], ["i32", "i32", "i32"], [
      ...ifThen(loadHeader("oneClumpAtATime"), [call("take_one_at_a_time"), ins("return")]),
      ...readHeader("threads"), k(1), ins("i32.eq"),
      ins("if"), get(0), call("steal"), set(1), ins("else"), get(0), call("take_own"), set(1), ins("end"),
      ...ifThen([get(1), k(0), ins("i32.ge_s")], [get(1), ins("return")]),
      ...readHeader("threads"), k(1), ins("i32.add"), set(3),
      ...forEach(2, [k(1)], [get(3)], [
        get(0), get(2), ins("i32.add"), get(3), ins("i32.rem_u"), call("steal"), tee(1),
        k(0), ins("i32.ge_s"), ins("if"), get(1), ins("return"), ins("end"),
      ]),
      k(NONE),
    ]),

    // start_ready(thread, clump): a clump whose wires have all been written becomes ready.
    fn("start_ready", ["i32", "i32"], [], [], [get(1), call("clump_record"), k(STATE.ready), ins("i32.atomic.store", CLUMP.state), get(0), get(1), call("push")]),

    // make_ready(thread, clump, value): a parked clump is woken with `value`; one still returning
    // from its park is marked, and its thread makes it ready once it has returned.
    fn("make_ready", ["i32", "i32", "i32"], [], ["i32", "i32"], [
      get(1), call("clump_record"), set(3),
      get(3), get(2), ins("i32.store", CLUMP.wakeValue),
      ins("block"), ins("loop"),
      get(3), ins("i32.atomic.load", CLUMP.state), set(4),
      ...ifThen([get(4), k(STATE.parked), ins("i32.eq")], [
        ...ifThen([get(3), k(STATE.parked), k(STATE.ready), ins("i32.atomic.rmw.cmpxchg", CLUMP.state), k(STATE.parked), ins("i32.eq")], [get(0), get(1), call("push"), ins("return")]),
        ins("br", 1),
      ]),
      ...ifThen([get(4), k(STATE.running), ins("i32.eq")], [
        ...ifThen([get(3), k(STATE.running), k(STATE.wakePending), ins("i32.atomic.rmw.cmpxchg", CLUMP.state), k(STATE.running), ins("i32.eq")], [ins("return")]),
        ins("br", 1),
      ]),
      ins("end"), ins("end"),
    ]),

    // group_ended(thread, group): the top-level VI ends the Run; a subplan wakes the clump that started it.
    fn("group_ended", ["i32", "i32"], [], [], [
      ...ifThen([get(1), ins("i32.eqz")],
        [...storeHeader("runState", [k(RUN_STATUS.done)]), k(1), call("notify_work")],
        [get(0), get(1), call("group_record"), ins("i32.load", GROUP.parent), k(0), call("make_ready")]),
    ]),

    // group_start(thread, group): every clump of the group waits for its wires again, and those that
    // wait for none are ready, in order.
    fn("group_start", ["i32", "i32"], [], ["i32", "i32", "i32", "i32", "i32"], [
      get(1), call("group_record"), set(2),
      get(2), ins("i32.load", GROUP.first), set(3),
      get(2), ins("i32.load", GROUP.count), set(4),
      get(2), get(4), ins("i32.atomic.store", GROUP.remaining),
      k(0), k(0), ins("i32.atomic.load", header("liveClumps")), get(4), ins("i32.add"), ins("i32.atomic.store", header("liveClumps")),
      ...forEach(5, [get(3)], [get(3), get(4), ins("i32.add")], [
        get(5), call("clump_record"), set(6),
        get(6), get(6), ins("i32.load", CLUMP.initialDependencies), ins("i32.atomic.store", CLUMP.waitingFor),
        get(6), k(STATE.idle), ins("i32.atomic.store", CLUMP.state),
        get(6), k(PARK_KIND.none), ins("i32.store", CLUMP.parkKind),
        get(6), k(0), ins("i32.store", CLUMP.started),
      ]),
      ...ifThen([get(4), ins("i32.eqz")], [get(0), get(1), call("group_ended"), ins("return")]),
      ...forEach(5, [get(3)], [get(3), get(4), ins("i32.add")], [
        ...ifThen([get(5), call("clump_record"), ins("i32.load", CLUMP.initialDependencies), ins("i32.eqz")], [get(0), get(5), call("start_ready")]),
      ]),
    ]),

    // clump_ended(thread, clump): its dependents may start, and its group may end.
    fn("clump_ended", ["i32", "i32"], [], ["i32", "i32", "i32", "i32"], [
      get(1), call("clump_record"), set(2),
      get(2), k(STATE.ended), ins("i32.atomic.store", CLUMP.state),
      ...addHeader("liveClumps", -1), ins("drop"),
      get(2), ins("i32.load", CLUMP.dependentsStart), set(3),
      get(3), get(2), ins("i32.load", CLUMP.dependentsCount), ins("i32.add"), set(4),
      ...forEach(3, [get(3)], [get(4)], [
        ...readHeader("dependents"), get(3), k(4), ins("i32.mul"), ins("i32.add"), ins("i32.load"), set(5),
        ...ifThen([get(5), call("clump_record"), k(1), ins("i32.atomic.rmw.sub", CLUMP.waitingFor), k(1), ins("i32.eq")], [get(0), get(5), call("start_ready")]),
      ]),
      ...ifThen([get(2), ins("i32.load", CLUMP.group), call("group_record"), k(1), ins("i32.atomic.rmw.sub", GROUP.remaining), k(1), ins("i32.eq")],
        [get(0), get(2), ins("i32.load", CLUMP.group), call("group_ended")]),
    ]),

    // ——— Timers: a binary heap ordered by (deadline, sequence), under its lock ———
    fn("timer_entry", ["i32"], ["i32"], [], [...readHeader("timerHeap"), get(0), k(TIMER_BYTES), ins("i32.mul"), ins("i32.add")]),
    // timer_before(a, b) → whether entry a goes before entry b.
    fn("timer_before", ["i32", "i32"], ["i32"], ["f64", "f64"], [
      get(0), call("timer_entry"), ins("f64.load", TIMER.deadline), set(2),
      get(1), call("timer_entry"), ins("f64.load", TIMER.deadline), set(3),
      get(2), get(3), ins("f64.lt"),
      get(2), get(3), ins("f64.eq"),
      get(0), call("timer_entry"), ins("i32.load", TIMER.sequence), get(1), call("timer_entry"), ins("i32.load", TIMER.sequence), ins("i32.lt_s"),
      ins("i32.and"), ins("i32.or"),
    ]),
    fn("timer_swap", ["i32", "i32"], [], ["i32", "i32", "i64", "i64"], [
      get(0), call("timer_entry"), set(2),
      get(1), call("timer_entry"), set(3),
      get(2), ins("i64.load", 0), set(4), get(2), ins("i64.load", 8), set(5),
      get(2), get(3), ins("i64.load", 0), ins("i64.store", 0), get(2), get(3), ins("i64.load", 8), ins("i64.store", 8),
      get(3), get(4), ins("i64.store", 0), get(3), get(5), ins("i64.store", 8),
    ]),
    // timer_insert(clump): its deadline is in its record.
    fn("timer_insert", ["i32"], [], ["i32", "i32", "i32"], [
      k(header("timerLock")), call("lock"),
      ...readHeader("timerCount"), tee(1), call("timer_entry"), set(3),
      get(3), get(0), call("clump_record"), ins("f64.load", CLUMP.deadline), ins("f64.store", TIMER.deadline),
      get(3), ...readHeader("timerSequence"), ins("i32.store", TIMER.sequence),
      ...storeHeader("timerSequence", [...readHeader("timerSequence"), k(1), ins("i32.add")]),
      get(3), get(0), ins("i32.store", TIMER.clump),
      ...storeHeader("timerCount", [get(1), k(1), ins("i32.add")]),
      ins("block"), ins("loop"),
      get(1), ins("i32.eqz"), ins("br_if", 1),
      get(1), k(1), ins("i32.sub"), k(1), ins("i32.shr_u"), set(2),
      get(1), get(2), call("timer_before"), ins("i32.eqz"), ins("br_if", 1),
      get(1), get(2), call("timer_swap"),
      get(2), set(1), ins("br", 0),
      ins("end"), ins("end"),
      k(header("timerLock")), call("unlock"),
      k(1), call("notify_work"),
    ]),
    // timer_pop_due(now) → the clump of the earliest timer if it is due, taken out; or -1.
    fn("timer_pop_due", ["f64"], ["i32"], ["i32", "i32", "i32", "i32", "i32", "i32"], [
      ...ifThen([...loadHeader("timerCount"), ins("i32.eqz")], [k(NONE), ins("return")]),
      k(header("timerLock")), call("lock"),
      ...readHeader("timerCount"), set(2),
      ...ifThen([get(2), ins("i32.eqz"), k(0), call("timer_entry"), ins("f64.load", TIMER.deadline), get(0), ins("f64.gt"), ins("i32.or")], [k(header("timerLock")), call("unlock"), k(NONE), ins("return")]),
      k(0), call("timer_entry"), ins("i32.load", TIMER.clump), set(1),
      get(2), k(1), ins("i32.sub"), set(2),
      ...storeHeader("timerCount", [get(2)]),
      k(0), call("timer_entry"), get(2), call("timer_entry"), k(TIMER_BYTES), ins("memory.copy"),
      // Sift the moved entry down.
      k(0), set(3),
      ins("block"), ins("loop"),
      get(3), k(1), ins("i32.shl"), k(1), ins("i32.add"), tee(4), get(2), ins("i32.ge_s"), ins("br_if", 1),
      get(4), set(6),
      get(4), k(1), ins("i32.add"), tee(5), get(2), ins("i32.lt_s"),
      ins("if"), ...ifThen([get(5), get(4), call("timer_before")], [get(5), set(6)]), ins("end"),
      get(6), get(3), call("timer_before"), ins("i32.eqz"), ins("br_if", 1),
      get(6), get(3), call("timer_swap"),
      get(6), set(3), ins("br", 0),
      ins("end"), ins("end"),
      k(header("timerLock")), call("unlock"),
      get(1),
    ]),
    // next_deadline() → the earliest deadline, or +∞.
    fn("next_deadline", [], ["f64"], ["f64"], [
      k(header("timerLock")), call("lock"),
      ins("f64.const", Infinity), set(0),
      ...ifThen(readHeader("timerCount"), [k(0), call("timer_entry"), ins("f64.load", TIMER.deadline), set(0)]),
      k(header("timerLock")), call("unlock"),
      get(0),
    ]),

    // ——— What a clump calls to park ———
    // yield_point() → the next budget of iterations of a loop; parks to yield every ~8 ms (DT-041), or when the Run is aborted.
    fn("yield_point", [], ["i32"], ["i32", "f64", "f64", "i32"], [
      ...recordOf(currentClump), set(0),
      call("reloj_real"), set(1),
      get(1), get(0), ins("f64.load", CLUMP.lastBudgetCall), ins("f64.sub"), ins("f64.const", SHORTEST_ELAPSED_MS), ins("f64.max"), set(2),
      // Math.round of the iterations that fit in one millisecond, between 1 and MOST_ITERATIONS.
      get(0), ins("i32.load", CLUMP.iterations), ins("f64.convert_i32_s"), get(2), ins("f64.div"), ins("f64.const", 0.5), ins("f64.add"), ins("f64.floor"),
      ins("f64.const", MOST_ITERATIONS), ins("f64.min"), ins("f64.const", 1), ins("f64.max"), ins("i32.trunc_sat_f64_s"), set(3),
      get(0), get(3), ins("i32.store", CLUMP.iterations),
      get(0), get(1), ins("f64.store", CLUMP.lastBudgetCall),
      ...ifThen([...loadHeader("abort"), ins("i32.eqz"), get(1), get(0), ins("f64.load", CLUMP.lastYield), ins("f64.sub"), ins("f64.const", YIELD_EVERY_MS), ins("f64.lt"), ins("i32.and")], [get(3), ins("return")]),
      ...park(PARK_KIND.yield),
    ]),
    // wait(ms) → the millisecond timer when it resumes: Wait (ms).
    fn("wait", ["f64"], ["i32"], [], [
      ...recordOf(currentClump), call("ahora"), get(0), ins("f64.add"), ins("f64.store", CLUMP.deadline),
      ...park(PARK_KIND.timer),
    ]),
    // wait_multiple(m) → the millisecond timer when it resumes: Wait Until Next ms Multiple.
    fn("wait_multiple", ["f64"], ["i32"], ["f64"], [
      ins("f64.const", 0), set(1),
      ...ifThen([get(0), ins("f64.const", 0), ins("f64.gt")], [
        call("reloj"), ins("f64.convert_i32_u"), set(1),
        get(0), get(1), get(1), get(0), ins("f64.div"), ins("f64.trunc"), get(0), ins("f64.mul"), ins("f64.sub"), ins("f64.sub"), set(1),
      ]),
      ...recordOf(currentClump), call("ahora"), get(1), ins("f64.add"), ins("f64.store", CLUMP.deadline),
      ...park(PARK_KIND.timer),
    ]),
    // run_plan(plan) → 0 when every clump of the plan has ended: a subplan, or a subVI that waits.
    fn("run_plan", ["i32"], ["i32"], [], [
      get(0), k(1), ins("i32.add"), call("group_record"), ...currentClump, ins("i32.store", GROUP.parent),
      ...recordOf(currentClump), k(PARK_KIND.join), ins("i32.store", CLUMP.parkKind),
      ...currentThread, get(0), k(1), ins("i32.add"), call("group_start"),
      ...raiseParking, k(0),
    ]),
    // enter_subvi(plan) → 0 once the calling clump holds the non-reentrant subVI.
    fn("enter_subvi", ["i32"], ["i32"], ["i32"], [
      k(header("subVILockLock")), call("lock"),
      get(0), k(1), ins("i32.add"), call("lock_record"), set(1),
      ...ifThen([get(1), ins("i32.load", LOCK.held), ins("i32.eqz")], [get(1), k(1), ins("i32.store", LOCK.held), k(header("subVILockLock")), call("unlock"), k(0), ins("return")]),
      k(header("subVILockLock")), call("unlock"),
      ...recordOf(currentClump), get(0), k(1), ins("i32.add"), ins("i32.store", CLUMP.lock),
      ...park(PARK_KIND.lock),
    ]),
    // leave_subvi(plan): the subVI goes to the oldest call waiting for it, or is free.
    fn("leave_subvi", ["i32"], [], ["i32", "i32"], [
      k(header("subVILockLock")), call("lock"),
      get(0), k(1), ins("i32.add"), call("lock_record"), set(1),
      ...ifThen([get(1), ins("i32.load", LOCK.head), get(1), ins("i32.load", LOCK.tail), ins("i32.ne")], [
        get(1), ins("i32.load", LOCK.waiters), get(1), ins("i32.load", LOCK.head), ...readHeader("clumpCount"), ins("i32.rem_u"), k(4), ins("i32.mul"), ins("i32.add"), ins("i32.load"), set(2),
        get(1), get(1), ins("i32.load", LOCK.head), k(1), ins("i32.add"), ins("i32.store", LOCK.head),
        k(header("subVILockLock")), call("unlock"),
        ...currentThread, get(2), k(0), call("make_ready"), ins("return"),
      ]),
      get(1), k(0), ins("i32.store", LOCK.held),
      k(header("subVILockLock")), call("unlock"),
    ]),
    // park_external() → the calling clump, parked until JavaScript answers with wake_external.
    fn("park_external", [], ["i32"], [], [
      ...recordOf(currentClump), k(PARK_KIND.external), ins("i32.store", CLUMP.parkKind),
      ...addHeader("externalWaits", 1), ins("drop"),
      ...raiseParking, ...currentClump,
    ]),
    // wake_external(thread, clump, value): the answer from outside, pushed onto `thread`'s deque.
    fn("wake_external", ["i32", "i32", "i32"], [], [], [get(0), get(1), get(2), call("make_ready"), ...addHeader("externalWaits", -1), ins("drop")]),

    // after_park(thread, clump): the clump has returned parked; it goes where its reason says.
    fn("after_park", ["i32", "i32"], [], ["i32", "i32", "i32"], [
      get(1), call("clump_record"), set(2),
      ...ifThen([get(2), k(STATE.running), k(STATE.parked), ins("i32.atomic.rmw.cmpxchg", CLUMP.state), k(STATE.running), ins("i32.ne")], [
        // Woken while it was returning.
        get(2), k(STATE.ready), ins("i32.atomic.store", CLUMP.state), get(0), get(1), call("push"), ins("return"),
      ]),
      get(2), ins("i32.load", CLUMP.parkKind), set(4),
      ...ifThen([get(4), k(PARK_KIND.yield), ins("i32.eq")], [get(0), get(1), k(0), call("make_ready"), ins("return")]),
      ...ifThen([get(4), k(PARK_KIND.timer), ins("i32.eq")], [get(1), call("timer_insert"), ins("return")]),
      ...ifThen([get(4), k(PARK_KIND.lock), ins("i32.eq")], [
        k(header("subVILockLock")), call("lock"),
        get(2), ins("i32.load", CLUMP.lock), call("lock_record"), set(3),
        // The subVI may have been left after the clump found it held.
        ...ifThen([get(3), ins("i32.load", LOCK.held), ins("i32.eqz")], [
          get(3), k(1), ins("i32.store", LOCK.held),
          k(header("subVILockLock")), call("unlock"),
          get(0), get(1), k(0), call("make_ready"), ins("return"),
        ]),
        get(3), ins("i32.load", LOCK.waiters), get(3), ins("i32.load", LOCK.tail), ...readHeader("clumpCount"), ins("i32.rem_u"), k(4), ins("i32.mul"), ins("i32.add"), get(1), ins("i32.store"),
        get(3), get(3), ins("i32.load", LOCK.tail), k(1), ins("i32.add"), ins("i32.store", LOCK.tail),
        k(header("subVILockLock")), call("unlock"),
      ]),
    ]),

    // run_one(thread, clump): resumes or starts the clump and puts it where it goes next.
    fn("run_one", ["i32", "i32"], [], ["i32", "i32", "f64"], [
      get(1), ins("global.set", globals.currentClump),
      get(1), call("clump_record"), set(2),
      get(2), k(STATE.running), ins("i32.atomic.store", CLUMP.state),
      ...addHeader("runningClumps", 1), ins("drop"),
      get(2), k(1), ins("i32.store", CLUMP.started),
      get(2), ins("i32.load", CLUMP.parkKind), set(3),
      get(2), k(PARK_KIND.none), ins("i32.store", CLUMP.parkKind),
      // What it resumes with: after a timer, the millisecond timer now; after a yield, the next budget.
      get(3), k(PARK_KIND.timer), ins("i32.eq"),
      ins("if"), call("reloj"), ins("global.set", globals.resumeValue),
      ins("else"),
      get(3), k(PARK_KIND.yield), ins("i32.eq"),
      ins("if"),
      call("reloj_real"), set(4), get(2), get(4), ins("f64.store", CLUMP.lastBudgetCall), get(2), get(4), ins("f64.store", CLUMP.lastYield),
      get(2), ins("i32.load", CLUMP.iterations), ins("global.set", globals.resumeValue),
      ins("else"), get(2), ins("i32.load", CLUMP.wakeValue), ins("global.set", globals.resumeValue), ins("end"),
      ins("end"),
      k(0), ins("global.set", globals.parking),
      get(1), ins("call_indirect", clumpType),
      ins("global.get", globals.parking),
      ins("if"), get(0), get(1), call("after_park"), ins("else"), get(0), get(1), call("clump_ended"), ins("end"),
      ...addHeader("runningClumps", -1), ins("drop"),
    ]),

    // stuck() → whether the clumps still alive can never be woken: nothing runs, is ready or has a
    // timer, and nobody outside is expected to answer (issue #1 would have ended here, not hung).
    fn("stuck", [], ["i32"], ["i32"], [
      ...ifThen([...loadHeader("liveClumps"), ins("i32.eqz"), ...loadHeader("runningClumps"), ins("i32.or"), ...loadHeader("timerCount"), ins("i32.or"), ...loadHeader("externalWaits"), ins("i32.or")], [k(0), ins("return")]),
      ...forEach(0, [k(0)], [...readHeader("threads"), k(1), ins("i32.add")], [
        ...ifThen([get(0), call("deque"), ins("i64.atomic.load", DEQUE.top), get(0), call("deque"), ins("i64.atomic.load", DEQUE.bottom), ins("i64.lt_s")], [k(0), ins("return")]),
      ]),
      k(1),
    ]),

    // run_thread(thread, blocking) → a RUN_STATUS. Not blocking (one thread, JavaScript drives the
    // turns): one clump, then `stepped`, or `idle` when nothing is ready. Blocking (a thread of a
    // pool): clumps until the Run is over, sleeping while there is nothing to do.
    fn("run_thread", ["i32", "i32"], ["i32"], ["i32", "i32", "f64", "i64"], [
      get(0), ins("global.set", globals.currentThread),
      ins("block"), ins("loop"),
      // Read before looking for work, so a push made after the look wakes this thread.
      ...loadHeader("workEpoch"), set(3),
      ...ifThen(loadHeader("runState"), [...loadHeader("runState"), ins("return")]),
      ...ifThen(loadHeader("abort"), [
        k(0), k(RUN_STATUS.running), k(RUN_STATUS.aborted), ins("i32.atomic.rmw.cmpxchg", header("runState")), ins("drop"),
        k(1), call("notify_work"), ...loadHeader("runState"), ins("return"),
      ]),
      call("ahora"), set(4),
      ins("block"), ins("loop"),
      get(4), call("timer_pop_due"), tee(2), k(0), ins("i32.lt_s"), ins("br_if", 1),
      get(0), get(2), k(0), call("make_ready"), ins("br", 0),
      ins("end"), ins("end"),
      get(0), call("take"), tee(2), k(0), ins("i32.ge_s"),
      ins("if"),
      get(0), get(2), call("run_one"),
      ...ifThen([get(1), ins("i32.eqz")], [k(RUN_STATUS.stepped), ins("return")]),
      ins("br", 1),
      ins("end"),
      ...ifThen([get(1), ins("i32.eqz")], [
        ...ifThen([call("stuck")], [...storeHeader("runState", [k(RUN_STATUS.deadlock)]), k(RUN_STATUS.deadlock), ins("return")]),
        k(RUN_STATUS.idle), ins("return"),
      ]),
      ...ifThen([...addHeader("idleThreads", 1), k(1), ins("i32.add"), ...readHeader("threads"), ins("i32.eq"), call("stuck"), ins("i32.and")], [
        k(0), k(RUN_STATUS.running), k(RUN_STATUS.deadlock), ins("i32.atomic.rmw.cmpxchg", header("runState")), ins("drop"),
        ...addHeader("idleThreads", -1), ins("drop"),
        k(1), call("notify_work"), ...loadHeader("runState"), ins("return"),
      ]),
      // Sleep until there is work, or until the earliest deadline.
      call("next_deadline"), set(4),
      ins("i64.const", -1n), set(5),
      ...ifThen([get(4), ins("f64.const", Infinity), ins("f64.ne")], [get(4), call("ahora"), ins("f64.sub"), ins("f64.const", NANOSECONDS_PER_MS), ins("f64.mul"), ins("f64.const", 0), ins("f64.max"), ins("i64.trunc_sat_f64_s"), set(5)]),
      k(0), get(3), get(5), ins("memory.atomic.wait32", header("workEpoch")), ins("drop"),
      ...addHeader("idleThreads", -1), ins("drop"),
      ins("br", 0),
      ins("end"), ins("end"),
      k(RUN_STATUS.running),
    ]),

    // prepare_run(threads, now): the Run starts afresh on `threads` threads, at real time `now`.
    fn("prepare_run", ["i32", "f64"], [], ["i32", "i32", "i32"], [
      k(0), k(0), ins("i32.store", HEAP_LOCK),
      ...["abort", "runState", "liveClumps", "externalWaits", "workEpoch", "idleThreads", "timerLock", "timerCount", "timerSequence", "subVILockLock", "oneClumpAtATime", "runningClumps"].flatMap((field) => storeHeader(field, [k(0)])),
      ...storeHeader("threads", [get(0)]),
      // One deque per thread and one for the coordinator; kept with the memory for the next Run.
      get(0), k(1), ins("i32.add"), set(2),
      ...ifThen([...readHeader("dequesAllocated"), get(2), ins("i32.lt_s")], [
        ...storeHeader("deques", [get(2), ...readHeader("dequeStride"), ins("i32.mul"), k(8), ins("i32.add"), call("asignar"), k(7), ins("i32.add"), k(-8), ins("i32.and")]),
        ...storeHeader("dequesAllocated", [get(2)]),
      ]),
      ...forEach(3, [k(0)], [get(2)], [get(3), call("deque"), tee(4), ins("i64.const", 0), ins("i64.store", DEQUE.top), get(4), ins("i64.const", 0), ins("i64.store", DEQUE.bottom)]),
      ...forEach(3, [k(0)], readHeader("groupCount"), [get(3), call("lock_record"), tee(4), k(0), ins("i32.store", LOCK.held), get(4), k(0), ins("i32.store", LOCK.head), get(4), k(0), ins("i32.store", LOCK.tail)]),
      ...forEach(3, [k(0)], readHeader("clumpCount"), [
        get(3), call("clump_record"), tee(4), get(1), ins("f64.store", CLUMP.lastBudgetCall),
        get(4), get(1), ins("f64.store", CLUMP.lastYield),
        get(4), k(1), ins("i32.store", CLUMP.iterations),
      ]),
      k(0), k(0), call("group_start"),
    ]),
    fn("request_abort", [], [], [], [...storeHeader("abort", [k(1)]), k(1), call("notify_work")]),
    fn("set_one_at_a_time", ["i32"], [], [], storeHeader("oneClumpAtATime", [get(0)])),
  ];
}

/** The names of the scheduler's functions, in module order. */
export const SCHEDULER_FUNCTION_NAMES = schedulerFunctions({ functionIndex: () => 0, globals: { parking: 0, resumeValue: 0, currentClump: 0, currentThread: 0 }, clumpType: 0 }).map((f) => f.nombre);
/** The functions JavaScript calls. */
export const SCHEDULER_EXPORTS = ["prepare_run", "run_thread", "next_deadline", "park_external", "wake_external", "request_abort", "set_one_at_a_time"];
/** What a clump calls to park; each answers through `resumeValue` (stackless.mjs). */
export const SCHEDULER_PARK_PRIMITIVES = ["yield_point", "wait", "wait_multiple", "run_plan", "enter_subvi"];

/**
 * The scheduler's tables for one module: `clumps` in id order, each `{ group, deps: [ids] }` with
 * the ids of the clumps it waits for; `groups`, each `{ first, count }`. `reserve(bytes)` gives an
 * 8-aligned address in the data space. Returns the header and the tables as data: `[{ desde, bytes }]`.
 */
export function schedulerData({ clumps, groups, reserve }) {
  const clumpCount = clumps.length;
  const dependents = clumps.map(() => []);
  clumps.forEach((clump, id) => clump.deps.forEach((dependency) => dependents[dependency].push(id)));
  const records = new DataView(new ArrayBuffer(clumpCount * CLUMP_BYTES));
  const dependentIds = dependents.flat();
  const dependentsTable = new DataView(new ArrayBuffer(Math.max(dependentIds.length, 1) * 4));
  dependentIds.forEach((id, index) => dependentsTable.setInt32(index * 4, id, true));
  let start = 0;
  clumps.forEach((clump, id) => {
    const at = id * CLUMP_BYTES;
    records.setInt32(at + CLUMP.group, clump.group, true);
    records.setInt32(at + CLUMP.initialDependencies, clump.deps.length, true);
    records.setInt32(at + CLUMP.dependentsStart, start, true);
    records.setInt32(at + CLUMP.dependentsCount, dependents[id].length, true);
    start += dependents[id].length;
  });
  const groupTable = new DataView(new ArrayBuffer(groups.length * GROUP_BYTES));
  groups.forEach(({ first, count }, index) => {
    groupTable.setInt32(index * GROUP_BYTES + GROUP.first, first, true);
    groupTable.setInt32(index * GROUP_BYTES + GROUP.count, count, true);
  });
  const addresses = {
    clumps: reserve(Math.max(records.byteLength, 8)),
    dependents: reserve(dependentsTable.byteLength),
    groups: reserve(groupTable.byteLength),
    timerHeap: reserve(Math.max(clumpCount, 1) * TIMER_BYTES),
    subVILocks: reserve(groups.length * LOCK_BYTES),
  };
  // Each lock's waiters: at most every clump once.
  const locks = new DataView(new ArrayBuffer(groups.length * LOCK_BYTES));
  groups.forEach((_, index) => locks.setInt32(index * LOCK_BYTES + LOCK.waiters, reserve(Math.max(clumpCount, 1) * 4), true));
  const head = new DataView(new ArrayBuffer(Object.keys(HEADER).length * 4));
  const put = (field, value) => head.setInt32(HEADER[field], value, true);
  put("clumps", addresses.clumps);
  put("clumpCount", clumpCount);
  put("groups", addresses.groups);
  put("groupCount", groups.length);
  put("dependents", addresses.dependents);
  put("dequeMask", dequeCapacity(clumpCount) - 1);
  put("dequeStride", dequeStride(clumpCount));
  put("timerHeap", addresses.timerHeap);
  put("subVILocks", addresses.subVILocks);
  const bytes = (view) => new Uint8Array(view.buffer);
  return [
    { desde: SCHEDULER, bytes: bytes(head) },
    { desde: addresses.clumps, bytes: bytes(records) },
    { desde: addresses.dependents, bytes: bytes(dependentsTable) },
    { desde: addresses.groups, bytes: bytes(groupTable) },
    { desde: addresses.subVILocks, bytes: bytes(locks) },
  ];
}

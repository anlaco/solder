// The debugger of a Run (DT-047), on the side of the run worker: it receives the
// hooks the compiled VI calls after each node and decides what happens next: report
// the values, hold the VI at a breakpoint, a step or a Pause, and set the pace of
// Highlight Execution. It knows nothing of the page except the messages it sends
// (see run-worker.mjs for the protocol) and the plan the page gave it.
//
// The compiled VI only has a hook AFTER each node, but LabVIEW stops BEFORE a node
// (labview-captures/debugging/REPORT.md §4). The controller recovers "before" from the
// plan: every report of a node counts as the arrival of its value at the nodes it
// feeds, and a node whose reported inputs have all arrived is "ready", about to fire.
// A breakpoint on a node holds the VI at the report that made it ready; a node with
// no reported inputs (a constant) cannot be caught before, so it stops right after it.
// The borders of the structures (tunnels, shift registers, the loop's "i") report too:
// their values reach the nodes they feed, but the VI never stops before or at one of
// them, since they are not nodes; nor at a constant or a panel terminal. Single stepping
// also stops at the frames of the structures (before one runs, at the end of a loop's
// iteration, of a Case's frame, of a Flat Sequence's frame) and once more at the end of
// the diagram (labview-captures/reports/2026-10-16-warnings-frame-stops.md §B).

/** The speeds of Highlight Execution, in the order of its menu (REPORT.md §1). */
export const SPEEDS = ["slow", "medium", "fast", "very-fast"];
export const DEFAULT_SPEED = "medium";
export const SPEED_LABELS = { slow: "Slow", medium: "Medium", fast: "Fast", "very-fast": "Very Fast" };

/**
 * How fast the band of a wire grows, in px per second. Slow and Medium are measured on a
 * 270 px wire (about 500 and 1000 px/s, 8 fps captures: estimates); Fast and Very Fast
 * are extrapolated from the measured iteration times (2.0 s, 0.8 s, 0.25 s, 0.15 s of
 * animation per iteration) and are UNVERIFIED.
 */
export const WIRE_PIXELS_PER_SECOND = { slow: 500, medium: 1000, fast: 3200, "very-fast": 5300 };

/** How long a node stays lit when it has no wire to animate (unverified; scaled like the iteration times). */
export const MINIMUM_NODE_PACE_MS = { slow: 120, medium: 50, fast: 15, "very-fast": 5 };

/** How long the values of a VI that runs free are gathered before they are sent to the page. */
export const VALUE_BATCH_MS = 40;

/** The whole diagram is drawn dimmed for about 0.6 s before the data flows (REPORT.md §1, frames 1-5). */
export const INITIAL_DIM_MS = 600;

/** How long the animation of one node takes: its longest outgoing wire at the speed of the setting. */
export function paceFor(speed, longestWirePixels = 0) {
  const growing = (longestWirePixels / WIRE_PIXELS_PER_SECOND[speed]) * 1000;
  return Math.round(Math.max(MINIMUM_NODE_PACE_MS[speed], growing));
}

/** What the page tells the controller about the diagram of the VI that runs. */
export const EMPTY_PLAN = { successors: {}, inputCounts: {}, containers: {}, loops: [], parents: {}, wireLengths: {}, wires: {}, quiet: [] };

/**
 * @param {object} options
 * @param {Array} options.debugNodes  `compilado.debugNodes`: index → `{ vi, nodo, outputs }`.
 * @param {object} options.plan       see EMPTY_PLAN.
 * @param {(message: object) => void} options.send  talks to the page.
 * @param {(ms: number) => Promise<void>} options.sleep
 * @param {() => number} options.now
 */
export function createDebugController({ debugNodes, plan = EMPTY_PLAN, send, sleep = (ms) => new Promise((done) => setTimeout(done, ms)), now = Date.now }) {
  let config = { active: false, highlight: { on: false, speed: DEFAULT_SPEED }, retain: false, nodeBreakpoints: {}, wireBreakpoints: [] };
  /**
   * `null` runs free; "any" stops at the next node that is about to run or frame; `{ outOf }` finishes a
   * structure first (`outOf: null`, the whole block diagram: it stops only at its end).
   */
  let stepMode = null;
  let paused = null;
  let pendingValues = [];
  let arrivals = {};
  let readyQueue = [];
  let initialDimPending = true;
  const loopSet = new Set(plan.loops);
  const quietSet = new Set(plan.quiet ?? []);
  const nodeNames = plan.names ?? {};
  let seenSinceStepOut = new Set();
  let flushTimer = null;

  const isActive = () => config.active || config.highlight.on || stepMode !== null;
  const refreshActive = () => hooks.activar?.(isActive());

  function containerChain(nodeId) {
    const chain = [];
    for (let container = plan.containers[nodeId]; container; container = plan.parents[container]) chain.push(container);
    return chain;
  }
  const isInside = (nodeId, container) => containerChain(nodeId).includes(container);

  /** Holds every hook (every clump) until `resume` or `release`. */
  function pauseAt(where) {
    flush();
    paused = { ...where, release: null, gate: null };
    paused.gate = new Promise((go) => (paused.release = go));
    stepMode = null;
    send({ debug: { paused: { node: where.node, kind: where.kind, ...(where.phase && { phase: where.phase }), ...(where.frameIndex !== undefined && { frameIndex: where.frameIndex }), wire: where.wire, container: plan.containers[where.node] ?? null, name: nodeNames[where.node] ?? null } } });
    refreshActive();
    return paused.gate;
  }

  /** The nodes the report of `node` made ready: all of their reported inputs have now arrived. */
  function markArrivals(node) {
    readyQueue = readyQueue.filter((queued) => queued !== node);
    delete arrivals[node];
    const newlyReady = [];
    for (const successor of plan.successors[node] ?? []) {
      // By source: a value that arrives again (a tunnel, each iteration) does not stand in for a missing one.
      const arrived = (arrivals[successor] ??= new Set()).add(node);
      if (arrived.size >= (plan.inputCounts[successor] ?? 1)) {
        delete arrivals[successor];
        if (!readyQueue.includes(successor)) readyQueue.push(successor);
        newlyReady.push(successor);
      }
    }
    return newlyReady;
  }

  const hasEnabledBreakpoint = (node) => config.nodeBreakpoints[node] === true;

  function stepModeStopsBefore(candidate) {
    if (quietSet.has(candidate)) return false;
    if (stepMode === "any") return true;
    if (stepMode?.outOf === undefined || stepMode.outOf === null) return false;
    const outside = !isInside(candidate, stepMode.outOf);
    // From a node inside a loop, Step Out finishes the iteration; from the end of an iteration, the whole loop.
    return outside || (loopSet.has(stepMode.outOf) && !stepMode.whole && seenSinceStepOut.has(candidate));
  }

  /**
   * Where the VI has to stop after the report of `node`, if anywhere. Stepping stops before a node, or at one
   * that has no inputs to wait for (it cannot be caught before), but never at a border (`border`: a tunnel, a
   * shift register, "i"), a constant or a panel terminal; a breakpoint on a constant still does.
   */
  function whereToStop(node, border) {
    const wire = config.wireBreakpoints.find((entry) => entry.enabled && entry.from === node);
    if (wire) return { kind: "wire", node, wire: wire.wire };
    const breakpointReady = readyQueue.find(hasEnabledBreakpoint);
    if (breakpointReady) return { kind: "before", node: breakpointReady };
    if (hasEnabledBreakpoint(node) && !(plan.inputCounts[node] > 0)) return { kind: "at", node };
    if (stepMode !== null) {
      const candidate = readyQueue.find(stepModeStopsBefore);
      if (candidate) return { kind: "before", node: candidate };
      if (stepMode === "any" && !(plan.inputCounts[node] > 0) && !border && !quietSet.has(node)) return { kind: "at", node };
    }
    return null;
  }

  const flushValues = () => {
    const values = pendingValues;
    pendingValues = [];
    return values;
  };

  /** Without Highlight Execution a loop may report thousands of values a second: the page gets the latest ones in batches. */
  function flush() {
    clearTimeout(flushTimer);
    flushTimer = null;
    const latest = new Map();
    for (const entry of flushValues()) latest.set(`${entry.node}.${entry.port}`, entry);
    if (latest.size) send({ debug: { values: [...latest.values()] } });
  }
  const scheduleFlush = () => {
    flushTimer ??= setTimeout(flush, VALUE_BATCH_MS);
  };

  async function afterNode(node, border = false) {
    // Another clump already stopped the VI: nothing goes on until it is released.
    while (paused) await paused.gate;
    const pace = config.highlight.on ? paceFor(config.highlight.speed, plan.wireLengths[node] ?? 0) : 0;
    if (config.highlight.on) send({ debug: { ran: node, values: flushValues(), pace } });
    else scheduleFlush();
    if (stepMode?.outOf !== undefined) seenSinceStepOut.add(node);
    if (config.highlight.on) {
      if (initialDimPending) await sleep(INITIAL_DIM_MS);
      initialDimPending = false;
      await sleep(pace);
    }
    const stop = (markArrivals(node), whereToStop(node, border));
    if (stop) await pauseAt(stop);
    while (paused) await paused.gate;
  }

  /**
   * What Step Out finishes from a stop: the structure whose iteration or frame just ended; from a structure's
   * start, the one holding it; from a node, its structure. `null` is the whole block diagram.
   */
  function structureToFinish(stop) {
    if (stop.kind === "frame" && stop.phase !== "start" && stop.phase !== "between") return { outOf: stop.node, whole: true };
    return { outOf: plan.containers[stop.node] ?? null };
  }

  /** Whether stepping stops at a frame of the structure `node`. */
  function stepModeStopsAtFrame(node) {
    if (stepMode === "any") return true;
    if (stepMode?.outOf === undefined || stepMode.outOf === null) return false;
    return node !== stepMode.outOf && !isInside(node, stepMode.outOf);
  }

  async function afterFrame(node, phase, frameIndex) {
    while (paused) await paused.gate;
    if (stepModeStopsAtFrame(node)) await pauseAt({ kind: "frame", node, phase, ...(frameIndex !== undefined && { frameIndex }) });
    while (paused) await paused.gate;
  }

  const hooks = {
    activar: null,
    alConectar() {
      initialDimPending = config.highlight.on;
      refreshActive();
    },
    alValor(index, outputIndex, value) {
      const info = debugNodes[index];
      if (info.vi !== "") return;
      const port = info.outputs[outputIndex].port;
      pendingValues.push({ node: info.nodo, port, value, at: now() });
    },
    alNodo(index) {
      const info = debugNodes[index];
      if (info.vi !== "") return paused ? paused.gate : undefined;
      if (info.frame) return afterFrame(info.nodo, info.frame, info.frameIndex);
      return afterNode(info.nodo, info.border === true);
    },
    unoACadaVez: () => config.highlight.on,
  };

  return {
    hooks,
    /** The page changed what it wants (Highlight Execution, probes, breakpoints…), also in the middle of a Run. */
    configure(next) {
      config = { ...config, ...next, highlight: { ...config.highlight, ...(next.highlight ?? {}) } };
      refreshActive();
    },
    /** Pause button: stop before the next node that is about to run. */
    requestPause() {
      stepMode = "any";
      seenSinceStepOut = new Set();
      refreshActive();
    },
    /** Start Single Stepping, from edit mode: the VI starts and stops before its first node. */
    startStepping() {
      stepMode = "any";
      refreshActive();
    },
    /** Continue, Step Into, Step Over and Step Out of a paused VI. */
    resume(mode = "continue") {
      if (!paused) return;
      const node = paused.node;
      if (paused.kind === "diagram") stepMode = null;
      else if (mode === "over" || mode === "into") stepMode = "any";
      else if (mode === "out") {
        stepMode = structureToFinish(paused);
        seenSinceStepOut = new Set();
      } else stepMode = null;
      const finished = paused;
      paused = null;
      // A node held "before" is about to run: it is no longer waiting.
      if (finished.kind === "before") readyQueue = readyQueue.filter((queued) => queued !== finished.node);
      send({ debug: { resumed: true } });
      refreshActive();
      finished.release();
    },
    /** The Run ended: what was gathered goes to the page. */
    flush,
    /** The VI's diagram finished: while stepping, it stops once more at its end, until it is told to go on. */
    async finishDiagram() {
      if (stepMode === null) return;
      await pauseAt({ kind: "diagram", node: null });
      while (paused) await paused.gate;
    },
    /** Abort: nothing may stay held. */
    release() {
      stepMode = null;
      const finished = paused;
      paused = null;
      finished?.release();
    },
    isPaused: () => paused !== null,
    get state() {
      return { paused, stepMode, readyQueue: [...readyQueue] };
    },
  };
}

// Stackless clumps (DT-063 §8): a function that may park is rewritten so that it saves its state
// and returns instead of suspending, and goes on from where it stopped when it is called again, on
// any thread. Nothing of a parked clump lives on a stack, so no clump belongs to a thread.
//
// The protocol with the host:
// - A park primitive (an import, or a function of the scheduler in the module itself) either answers
//   at once (it does not park) or asks to park: it sets the global `parking` to 1 and returns. The function then stores the locals it still needs
//   (those read after that point before being written again) and the number of the point where it
//   parked into its frame in the data space, and returns.
// - To resume, the host sets `resumeValue` to what the import finally answers, clears `parking` and
//   calls the function again. Its prologue sees a point number in the frame, restores the locals and
//   rewinds: every statement before that point is skipped, every branch on the way is taken as when
//   it parked (the locals that decided it are the same), and at the point the answer is taken from
//   `resumeValue` instead of calling the import.
// - A call to another function that may park (a synchronous subVI, which parks only for the
//   debugger) is a park point too: when the callee returns parked, the caller parks as well, and on
//   resume it calls the callee again, which rewinds itself.
//
// WebAssembly has no goto, so rewinding cannot jump into a loop. Each function therefore has more
// than one copy of its code:
// - The running copy is the original with, after each call that may park, a check of `parking`
//   that leaves through one exit outside every loop. A function with debugger hooks (DT-047) has two
//   running copies, with and without them, and takes the one the debug flag asks for when it starts
//   or resumes: a VI that allows debugging runs at full speed while nobody debugs it, and turning
//   debugging on reaches a loop at its next yield.
// - The rewinding copy runs only when the function is called to resume: each statement that comes
//   before a park point is guarded by "not rewinding", each structure that contains park points is
//   entered only if the point is inside it, and an `if` takes the branch that holds the point. A
//   loop is rewound for one iteration only, the one it parked in, and then goes on in a running copy.
// Park points are numbered in order, so the points of any structure are one range. Measured on a
// compute loop (DT-063 §8): as fast as with JSPI with debugging off, and faster with it allowed.
//
// Frame layout: [point number, i32][padding][local 0][local 1]…, each local in 8 bytes.

const BLOCK_OPS = new Set(["block", "loop", "if"]);
const TERMINATORS = new Set(["br", "return", "unreachable"]);
const BINARY = /\.(eq|ne|lt|gt|le|ge|lt_[su]|gt_[su]|le_[su]|ge_[su]|add|sub|mul|div|div_[su]|rem_[su]|and|or|xor|shl|shr_[su]|rotl|rotr|min|max)$/;
const LOCAL_BYTES = 8;
const FRAME_HEADER_BYTES = 8;
const NOT_PARKED = 0;

const ins = (op, arg) => (arg === undefined ? { op } : { op, arg });

/** How many values an instruction takes from the stack and leaves on it; a call, by its callee's type. */
function stackEffect(instruction, typeOfCall) {
  const { op } = instruction;
  if (op === "call") {
    const { params, results } = typeOfCall(instruction.arg);
    return [params.length, results.length];
  }
  if (op === "nop" || op === "atomic.fence") return [0, 0];
  // The scheduler's only indirect call takes a clump, which has no parameters and no results.
  if (op === "call_indirect") return [1, 0];
  if (op === "data.drop") return [0, 0];
  if (op === "memory.init") return [3, 0];
  if (op.endsWith(".cmpxchg") || op.startsWith("memory.atomic.wait")) return [3, 1];
  if (op.endsWith(".xchg") || op === "memory.atomic.notify") return [2, 1];
  if (op === "drop" || op === "local.set" || op === "global.set" || op === "br_if") return [1, 0];
  if (op === "select") return [3, 1];
  if (op === "local.get" || op === "global.get" || op === "memory.size" || op.endsWith(".const")) return [0, 1];
  if (op === "local.tee" || op === "memory.grow") return [1, 1];
  if (op === "memory.copy" || op === "memory.fill") return [3, 0];
  if (op.includes(".store")) return [2, 0];
  if (op.includes(".load")) return [1, 1];
  if (BINARY.test(op)) return [2, 1];
  return [1, 1]; // the unary operations and conversions
}

/**
 * The body as a tree: an instruction, or a structure `{ op, body, elseBody }`. Every branch points
 * at the structure it leaves (`target`), not at a depth, so wrapping code in new blocks keeps it
 * right. Instructions are copied, since the compiler reuses some instruction objects.
 */
function parse(body) {
  const root = { op: "function", body: [] };
  const open = [{ node: root, list: root.body }];
  for (const instruction of body) {
    const { list } = open.at(-1);
    if (BLOCK_OPS.has(instruction.op)) {
      const node = { op: instruction.op, body: [], elseBody: null };
      list.push(node);
      open.push({ node, list: node.body });
    } else if (instruction.op === "else") {
      const top = open.at(-1);
      top.node.elseBody = [];
      top.list = top.node.elseBody;
    } else if (instruction.op === "end") {
      open.pop();
    } else if (instruction.op === "br" || instruction.op === "br_if") {
      list.push({ op: instruction.op, target: open[open.length - 1 - instruction.arg].node });
    } else list.push({ ...instruction });
  }
  return root;
}

const sameSet = (a, b) => a.size === b.size && [...a].every((x) => b.has(x));
const union = (a, b) => new Set([...a, ...b]);

/**
 * For each park call, the locals that are read after it before being written again: the only
 * ones it has to save. Saving every local would keep them all alive across the whole function,
 * and the engine would then spill a loop's values out of its registers.
 */
function liveAfterParkCalls(tree, isParkCall) {
  const liveAtLabel = new Map(); // a structure → the locals live where a branch to it goes
  const liveAfter = new Map();
  const liveAtTarget = (target) => (target === tree ? new Set() : liveAtLabel.get(target) ?? new Set());
  function backward(items, liveOut) {
    let live = new Set(liveOut);
    for (let index = items.length - 1; index >= 0; index--) {
      const item = items[index];
      if (item.op === "loop") {
        // A branch to a loop goes back to its start: the body's own live-in, to a fixed point.
        let entry = liveAtLabel.get(item) ?? new Set();
        for (;;) {
          liveAtLabel.set(item, entry);
          const next = union(entry, backward(item.body, live));
          if (sameSet(next, entry)) break;
          entry = next;
        }
        live = new Set(entry);
      } else if (item.body) {
        liveAtLabel.set(item, live);
        const thenIn = backward(item.body, live);
        live = union(thenIn, item.elseBody ? backward(item.elseBody, live) : live);
      } else if (item.target) live = item.op === "br" ? new Set(liveAtTarget(item.target)) : union(live, liveAtTarget(item.target));
      else if (item.op === "return" || item.op === "unreachable") live = new Set();
      else if (item.op === "local.get") live.add(item.arg);
      else if (item.op === "local.set" || item.op === "local.tee") live.delete(item.arg);
      else if (isParkCall(item)) liveAfter.set(item, new Set(live));
    }
    return live;
  }
  backward(tree.body, new Set());
  return liveAfter;
}

/**
 * Rewrites the functions of a module that may park. `functions` are `{ locales, cuerpo }` in module
 * order after `importCount` imports; `parkPrimitives` are the indices of the functions —imports or
 * functions of the module's scheduler— that park the clump themselves and answer through
 * `resumeValue`; `typeOfCall(index)` gives `{ params, results }`; `allocateFrame(bytes)` reserves a frame in
 * the data space; `parkingGlobal` and `resumeValueGlobal` are the indices of the two globals.
 * Returns the rewritten functions and the frame address of each rewritten one.
 */
export function makeStackless(functions, { importCount, parkPrimitives, typeOfCall, allocateFrame, parkingGlobal, resumeValueGlobal, debugFlagAddress = null }) {
  const trees = functions.map((f) => parse(f.cuerpo));
  // A function parks if it calls an import that parks or a function that parks: to a fixed point.
  const parks = new Set();
  const isParkCall = (instruction) =>
    instruction.op === "call" && (parkPrimitives.has(instruction.arg) || parks.has(instruction.arg - importCount));
  const containsParkCall = (items) => items.some((item) => (item.body ? containsParkCall(item.body) || containsParkCall(item.elseBody ?? []) : isParkCall(item)));
  for (let changed = true; changed; ) {
    changed = false;
    trees.forEach((tree, index) => {
      if (!parks.has(index) && containsParkCall(tree.body)) {
        parks.add(index);
        changed = true;
      }
    });
  }
  const frames = [];
  const rewritten = functions.map((f, index) => {
    if (!parks.has(index)) return f;
    const result = rewriteFunction(f, trees[index], { isParkCall, parkPrimitives, typeOfCall, parkingGlobal, resumeValueGlobal, allocateFrame, debugFlagAddress });
    frames.push(result.frame);
    return result.f;
  });
  return { functions: rewritten, frames };
}

function rewriteFunction(f, tree, context) {
  const { isParkCall, parkPrimitives, typeOfCall, parkingGlobal, resumeValueGlobal, debugFlagAddress } = context;
  const locales = [...f.locales];
  const newLocal = (type) => locales.push(type) - 1;
  const resumeAt = newLocal("i32");
  const parkedAt = newLocal("i32");
  const liveAfter = liveAfterParkCalls(tree, isParkCall);
  // The running copy leaves through one exit outside every loop, where the locals of the point it
  // parked at are saved: an exit from inside a loop, even one never taken, makes the engine compile
  // the loop worse.
  const runningExit = {};

  // Number the park points in order and give every structure the range of the points inside it.
  const pointOf = new Map();
  const rangeOf = new Map();
  const number = (items) => {
    for (const item of items) {
      if (item.body) {
        const first = pointOf.size + 1;
        number(item.body);
        const thenLast = pointOf.size;
        number(item.elseBody ?? []);
        if (pointOf.size >= first) rangeOf.set(item, { first, last: pointOf.size, thenLast });
      } else if (isParkCall(item)) pointOf.set(item, pointOf.size + 1);
    }
  };
  number(tree.body);

  const out = [];
  const labels = [tree]; // the structures open in the output; a wrapper is a fresh object
  // While a loop is rewound for one iteration, going on to its next iteration is leaving that copy.
  const retarget = new Map();
  const depthOf = (target) => labels.length - 1 - labels.lastIndexOf(retarget.get(target) ?? target);
  const open = (op, label = {}) => {
    out.push(ins(op));
    labels.push(label);
  };
  const close = () => {
    out.push(ins("end"));
    labels.pop();
  };
  const notRewinding = () => [ins("local.get", resumeAt), ins("i32.eqz")];
  const inRange = (first, last) => [ins("local.get", resumeAt), ins("i32.const", first), ins("i32.sub"), ins("i32.const", last - first + 1), ins("i32.lt_u")];
  // The frame is reserved once every local is known, at the end: until then the saving and restoring
  // of the locals are placeholders, and an access to the point number is marked to get its address.
  const save = (locals) => ({ op: "save-locals", locals });
  const RESTORE = { op: "restore-locals" };
  const pointAccess = (op) => ({ op, arg: 0, pointAccess: true });
  const setPoint = (point) => [ins("i32.const", 0), ins("i32.const", point), pointAccess("i32.store")];

  function emitItems(items) {
    for (const item of items) {
      if (item.body) {
        open(item.op, item);
        emitItems(item.body);
        if (item.elseBody) {
          out.push(ins("else"));
          emitItems(item.elseBody);
        }
        close();
      } else if (item.target) out.push(ins(item.op, depthOf(item.target)));
      else out.push(item);
    }
  }

  /**
   * A debugger hook as the compiler emits it (DT-047): the debug flag read, then an `if` with the
   * hook. It starts at `items[index]`.
   */
  const isDebugHook = (items, index) =>
    debugFlagAddress !== null &&
    items[index]?.op === "i32.const" && items[index].arg === debugFlagAddress &&
    items[index + 1]?.op === "i32.load" && !items[index + 1].arg &&
    items[index + 2]?.op === "if";
  const hasDebugHooks = (function find(items) {
    return items.some((item, index) => isDebugHook(items, index) || (item.body && (find(item.body) || find(item.elseBody ?? []))));
  })(tree.body);
  const DEBUG_HOOK_LENGTH = 3;

  /**
   * A running copy: the code as it was, parking when a call it makes asks to. Without `debugging`,
   * the debugger's hooks are left out, so that a VI that allows debugging runs at full speed while
   * nobody debugs it; a clump takes the copy with the hooks when it starts or resumes with the flag set.
   */
  function emitRunning(items, debugging) {
    for (let index = 0; index < items.length; index++) {
      const item = items[index];
      if (!debugging && isDebugHook(items, index)) {
        index += DEBUG_HOOK_LENGTH - 1;
        continue;
      }
      if (item.body) {
        open(item.op, item);
        emitRunning(item.body, debugging);
        if (item.elseBody) {
          out.push(ins("else"));
          emitRunning(item.elseBody, debugging);
        }
        close();
      } else if (item.target) out.push(ins(item.op, depthOf(item.target)));
      else {
        out.push(item);
        // The call's answer may still be on the stack: the branch leaves it there.
        if (isParkCall(item)) {
          out.push(ins("global.get", parkingGlobal));
          open("if");
          out.push(ins("i32.const", pointOf.get(item)), ins("local.set", parkedAt), ins("br", depthOf(runningExit)));
          close();
        }
      }
    }
  }

  /** The statements of a sequence: runs of items from an empty stack to an empty stack. */
  function statements(items) {
    const list = [];
    let current = [];
    let height = 0;
    const heights = []; // the height before each item of `current`
    for (const item of items) {
      heights.push(height);
      current.push(item);
      if (item.body) height -= item.op === "if" ? 1 : 0;
      else if (TERMINATORS.has(item.op)) height = 0;
      else {
        const [taken, left] = stackEffect(item, typeOfCall);
        height += left - taken;
      }
      if (height === 0) {
        list.push({ items: current, heights: [...heights] });
        current = [];
        heights.length = 0;
      }
    }
    if (current.length) throw new Error("Stackless: a sequence ends with values left on the stack.");
    return list;
  }

  const parksInside = (item) => (item.body ? rangeOf.has(item) : isParkCall(item));

  function emitSequence(items) {
    const list = statements(items);
    const lastParking = list.findLastIndex((statement) => statement.items.some(parksInside));
    let guarded = [];
    const flush = () => {
      if (!guarded.length) return;
      out.push(...notRewinding());
      open("if");
      emitItems(guarded);
      close();
      guarded = [];
    };
    const plain = (items, index) => {
      if (index < lastParking) guarded.push(...items);
      else {
        flush();
        emitItems(items);
      }
    };
    list.forEach((statement, index) => {
      const parking = statement.items.map((item, position) => (parksInside(item) ? position : -1)).filter((position) => position >= 0);
      if (!parking.length) return plain(statement.items, index);
      if (parking.length > 1) throw new Error("Stackless: two park points in one statement.");
      flush();
      const position = parking[0];
      const item = statement.items[position];
      const prefix = statement.items.slice(0, position);
      if (item.body) {
        if (statement.items.length > position + 1) throw new Error("Stackless: a structure that parks is followed by more of its statement.");
        emitStructure(item, prefix);
        return;
      }
      const { params, results } = typeOfCall(item.arg);
      if (statement.heights[position] !== params.length) throw new Error("Stackless: values under the arguments of a park point.");
      const answer = results.length ? newLocal(results[0]) : null;
      emitParkCall(item, prefix, answer);
      const suffix = statement.items.slice(position + 1);
      if (suffix.length) plain([ins("local.get", answer), ...suffix], index);
      else if (answer !== null) throw new Error("Stackless: the answer of a park point is left unused.");
    });
    flush();
  }

  function emitParkCheck(call) {
    out.push(ins("global.get", parkingGlobal));
    open("if");
    out.push(save(liveAfter.get(call)), ...setPoint(pointOf.get(call)), ins("return"));
    close();
  }

  function emitParkCall(call, args, answer) {
    const point = pointOf.get(call);
    const answersThroughResumeValue = parkPrimitives.has(call.arg);
    out.push(...notRewinding());
    open("if");
    emitItems(args);
    out.push(call);
    if (answer !== null) out.push(ins("local.set", answer));
    emitParkCheck(call);
    out.push(ins("else"));
    out.push(ins("local.get", resumeAt), ins("i32.const", point), ins("i32.eq"));
    open("if");
    out.push(ins("i32.const", NOT_PARKED), ins("local.set", resumeAt), ...setPoint(NOT_PARKED));
    if (answersThroughResumeValue) {
      if (answer !== null) out.push(ins("global.get", resumeValueGlobal), ins("local.set", answer));
    } else {
      // The callee rewinds itself; it takes no arguments (a subVI's inputs are in its slots).
      if (args.length) throw new Error("Stackless: a function that parks is called with arguments.");
      out.push(call);
      emitParkCheck(call);
    }
    close();
    close();
  }

  function emitStructure(node, prefix) {
    const { first, last, thenLast } = rangeOf.get(node);
    const enter = () => [...notRewinding(), ...inRange(first, last), ins("i32.or")];
    if (node.op === "loop") {
      if (prefix.length) throw new Error("Stackless: a loop that parks has values before it.");
      emitLoop(node, first, last);
      return;
    }
    if (node.op !== "if") {
      if (prefix.length) throw new Error("Stackless: a block that parks has values before it.");
      out.push(...enter());
      open("if");
      open(node.op, node);
      emitSequence(node.body);
      close();
      close();
      return;
    }
    // The condition is computed when running; when rewinding, the branch that holds the point is taken.
    const condition = newLocal("i32");
    out.push(...notRewinding());
    open("if");
    emitItems(prefix);
    out.push(ins("local.set", condition));
    out.push(ins("else"));
    out.push(...(thenLast >= first ? inRange(first, thenLast) : [ins("i32.const", 0)]), ins("local.set", condition));
    close();
    out.push(...enter());
    open("if");
    out.push(ins("local.get", condition));
    open("if", node);
    emitSequence(node.body);
    if (node.elseBody) {
      out.push(ins("else"));
      emitSequence(node.elseBody);
    }
    close();
    close();
  }

  /**
   * A loop while rewinding: not rewinding, straight to its running copy; rewinding to a point inside
   * it, the iteration it parked in, then the running copy for the next ones; rewinding to a point
   * after it, the loop had already ended and is skipped.
   */
  function emitLoop(node, first, last) {
    const after = {};
    const nextIteration = {};
    open("block", after);
    open("block", nextIteration);
    out.push(...notRewinding(), ins("br_if", depthOf(nextIteration)));
    out.push(...inRange(first, last), ins("i32.eqz"), ins("br_if", depthOf(after)));
    retarget.set(node, nextIteration);
    emitSequence(node.body);
    retarget.delete(node);
    // The body ended without going on to another iteration: the loop is over.
    out.push(ins("br", depthOf(after)));
    close();
    emitByDebugFlag((debugging) => {
      open("loop", node);
      emitRunning(node.body, debugging);
      close();
    });
    close();
  }

  /** `emit(debugging)` for the copy the debug flag asks for, or the one copy if there are no hooks. */
  function emitByDebugFlag(emit) {
    if (!hasDebugHooks) return emit(true);
    out.push(ins("i32.const", debugFlagAddress), ins("i32.load"));
    open("if");
    emit(true);
    out.push(ins("else"));
    emit(false);
    close();
  }

  // Prologue: the point it parked at, if any, and then every other local as it was; then the
  // rewinding copy if it parked, the running one if not.
  const prologue = [ins("i32.const", 0), pointAccess("i32.load"), ins("local.tee", resumeAt), ins("if"), RESTORE, ins("end")];
  open("block", runningExit);
  out.push(ins("local.get", resumeAt));
  open("if");
  emitSequence(tree.body);
  out.push(ins("else"));
  emitByDebugFlag((debugging) => emitRunning(tree.body, debugging));
  close();
  out.push(ins("return"));
  close();
  for (const [call, point] of pointOf) {
    out.push(ins("local.get", parkedAt), ins("i32.const", point), ins("i32.eq"));
    open("if");
    out.push(save(liveAfter.get(call)), ...setPoint(point), ins("return"));
    close();
  }
  const frame = context.allocateFrame(FRAME_HEADER_BYTES + LOCAL_BYTES * locales.length);
  const slot = (local) => frame + FRAME_HEADER_BYTES + LOCAL_BYTES * local;
  // A local that was not saved is dead where the function parked: what it reads back is never used.
  const saveCode = (locals) => [...locals].sort((a, b) => a - b).flatMap((local) => [ins("i32.const", 0), ins("local.get", local), ins(`${locales[local]}.store`, slot(local))]);
  const restore = locales.flatMap((type, local) => (local === resumeAt ? [] : [ins("i32.const", 0), ins(`${type}.load`, slot(local)), ins("local.set", local)]));
  const fill = (instruction) => {
    if (instruction.op === "save-locals") return saveCode(instruction.locals);
    if (instruction === RESTORE) return restore;
    if (instruction.pointAccess) return [ins(instruction.op, frame)];
    return [instruction];
  };
  return { f: { ...f, locales, cuerpo: [...prologue, ...out].flatMap(fill) }, frame };
}

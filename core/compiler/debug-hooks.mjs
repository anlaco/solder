// The debug hooks (DT-047): after a node, on a structure's border and at a structure's frame.
// Part of compileOVI (compile-ovi.mjs): `ovi` is the state of the OVI being compiled, shared by its parts; a part
// calls another's functions through it, when they are called.

import { importIndex } from "./host-imports.mjs";
import { panelData } from "./panel-data.mjs";
import { ins } from "./instructions.mjs";
import { wasmTypeOf } from "./wasm-types.mjs";
import { i32 } from "./linear-memory.mjs";

export function createDebugHooks(ovi) {
  const { module, instanceKey, g } = ovi;
  const contexto = (...args) => ovi.contexto(...args);

  // Allow Debugging (VI Properties ▸ Execution), on by default as in LabVIEW (DT-047).
  const allowDebugging = g.vi?.execution?.["allow-debugging"] !== false;

  /**
   * The debug hook after node `id` (DT-047): only while the host has set the
   * debug flag, the value of each output and then the node, which may suspend.
   */
  function debugHook(id, outputs, { border = false, frame = null, frameIndex = null } = {}) {
    if (!allowDebugging) return [];
    const entry = { vi: instanceKey, nodo: id, outputs: outputs.map(({ port, type }) => ({ port, tipo: type, ...panelData(type) })) };
    const index = module.debugNodes.push({ ...entry, ...(border && { border: true }), ...(frame && { frame }), ...(frameIndex !== null && { frameIndex }) }) - 1;
    const values = outputs.flatMap(({ type, local }, j) => [ins("i32.const", index), ins("i32.const", j), ins("local.get", local), ins("call", importIndex(`valor_${wasmTypeOf(type)}`))]);
    return [ins("i32.const", module.debugFlag), ins("i32.load"), ins("if"), ...values, ins("i32.const", index), ins("call", importIndex("nodo")), ins("drop"), ins("end")];
  }
  /**
   * The debug hook of a border element of a structure —a tunnel, a shift register, the
   * loop's "i"— whose one output `port` is in `local`: it shows its value on the wire that
   * leaves it, but the debugger never stops before it, since it is not a node.
   */
  function borderHook(id, port, local, k) {
    return debugHook(id, [{ port, type: contexto(id, k).tOut(0), local }], { border: true });
  }

  /**
   * The debug hook of a structure's frame, where single stepping stops (labview-captures/reports/
   * 2026-10-16-warnings-frame-stops.md §B): `phase` is "start" (before a structure runs), "iteration" (the end of
   * a loop's iteration), "end" (a Case's frame finished), "between" (a Flat Sequence going to its next frame),
   * "frame-end" and "last-frame-end" (a Flat Sequence's frame finished).
   */
  const frameHook = (sid, phase, frameIndex = null) => debugHook(sid, [], { frame: phase, frameIndex });

  return { allowDebugging, debugHook, borderHook, frameHook };
}

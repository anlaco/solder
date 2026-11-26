// The Feedback Node's two halves (DT-109): the first gives the value stored `delay` executions ago, the second stores
// the incoming one. Its memory is in the data space, as an uninitialized shift register's (DT-045): a ring of `delay`
// slots, the ring's position and an "initialized" flag. Part of compileOVI (compile-ovi.mjs): `ovi` is the state of the
// OVI being compiled, shared by its parts.

import { copyValueTo, isByReference } from "./memory-ops.mjs";
import { constantOf } from "./constants.mjs";
import { esCluster } from "../model/types.mjs";
import { ins } from "./instructions.mjs";
import { clusterLayout, wasmTypeOf } from "./wasm-types.mjs";
import { FEEDBACK_NODE, feedbackDelay, initializingLoop } from "../model/feedback-node.mjs";

/** Every slot is 8-byte aligned, the widest scalar's alignment. */
const SLOT_ALIGNMENT = 8;
/** A string's or an array's slot is a cell, which holds its handle. */
const CELL_BYTES = 4;

/** The bytes of a slot for a value of type `type`: a cluster's block, a cell, or the scalar itself. */
function slotBytes(type) {
  const bytes = esCluster(type) ? clusterLayout(type).tam : isByReference(type) ? CELL_BYTES : wasmTypeOf(type).endsWith("64") ? 8 : 4;
  return Math.ceil(bytes / SLOT_ALIGNMENT) * SLOT_ALIGNMENT;
}

export function createFeedbackNodes(ovi) {
  const { g, porId, resueltos, bufer, module, llegaA } = ovi;
  const states = new Map();

  /** The memory of the Feedback Node `id`, reserved the first time it is asked for. */
  function feedbackState(id) {
    if (states.has(id)) return states.get(id);
    const node = porId.get(id);
    const type = resueltos.salidas.get(`${id}.output`);
    const delay = feedbackDelay(node);
    const bytes = slotBytes(type);
    const state = {
      type, delay, bytes,
      slots: bufer(delay * bytes, SLOT_ALIGNMENT),
      position: bufer(4, 4),
      initialized: bufer(4, 4),
      // A string, an array or a cluster leaves the node from a place of its own, never from a slot the store rewrites.
      outputPlace: isByReference(type) ? bufer(bytes, SLOT_ALIGNMENT) : null,
      loop: initializingLoop(g, node),
    };
    const initializerWired = llegaA.has(`${id}.initializer`);
    if (initializerWired && state.loop === null) module.firstCallFlags.push(state.initialized);
    states.set(id, state);
    return state;
  }

  /** The instructions that leave the address of the slot at the ring's position. */
  const currentSlot = (state) => [ins("i32.const", state.slots), ins("i32.const", state.position), ins("i32.load"), ins("i32.const", state.bytes), ins("i32.mul"), ins("i32.add")];

  /** Stores the value that `value` leaves at the address that `address` leaves. */
  function storeValue(state, address, value, temporal) {
    if (isByReference(state.type)) return copyValueTo(state.type, value, address, temporal);
    return [...address, ...value, ins(`${wasmTypeOf(state.type)}.store`)];
  }

  /** Fills every slot with the value in the local `value` and puts the ring at its start. */
  function fillSlots(state, value, temporal) {
    const slot = temporal("i32");
    const end = state.slots + state.delay * state.bytes;
    return [
      ins("i32.const", state.slots), ins("local.set", slot),
      ins("block"), ins("loop"), ins("local.get", slot), ins("i32.const", end), ins("i32.ge_u"), ins("br_if", 1),
      ...storeValue(state, [ins("local.get", slot)], [ins("local.get", value)], temporal),
      ins("local.get", slot), ins("i32.const", state.bytes), ins("i32.add"), ins("local.set", slot), ins("br", 0), ins("end"), ins("end"),
      ins("i32.const", state.position), ins("i32.const", 0), ins("i32.store"),
    ];
  }

  /**
   * The first half, as a node emitter: before its first execution since it was last initialized, every slot gets the
   * initializer (or the type's default); then it leaves the value at the ring's position.
   */
  function emitFeedbackRead(e) {
    const state = feedbackState(e.nodo.id);
    const value = e.temporal(wasmTypeOf(state.type));
    const initializer = e.cableada(1) ? e.entrada(1) : constantOf(state.type, 0);
    const initialize = [...initializer, ins("local.set", value), ...fillSlots(state, value, e.temporal), ins("i32.const", state.initialized), ins("i32.const", 1), ins("i32.store")];
    const read = isByReference(state.type)
      ? [...copyValueTo(state.type, currentSlot(state), [ins("i32.const", state.outputPlace)], e.temporal), ins("i32.const", state.outputPlace)]
      : [...currentSlot(state), ins(`${wasmTypeOf(state.type)}.load`)];
    return [ins("i32.const", state.initialized), ins("i32.load"), ins("i32.eqz"), ins("if"), ...initialize, ins("end"), ...read];
  }

  /**
   * The second half, `id`, into the clump `k`: with `enable` TRUE (unwired, it is), the incoming value goes into the slot
   * read last and the ring moves on. It has no outputs and is not a node of the editor's, so it has no debug hook.
   */
  function emitFeedbackStore(id, k) {
    const x = ovi.contexto(id, k);
    const state = feedbackState(x.n.config.of);
    const enable = x.cableada(1) ? x.entrada(1) : [ins("i32.const", 1)];
    const next = x.nuevoLocal("i32");
    const advance = [
      ins("i32.const", state.position), ins("i32.load"), ins("i32.const", 1), ins("i32.add"), ins("local.tee", next),
      ins("i32.const", 0), ins("local.get", next), ins("i32.const", state.delay), ins("i32.lt_u"), ins("select"), ins("local.set", next),
      ins("i32.const", state.position), ins("local.get", next), ins("i32.store"),
    ];
    k.cuerpo.push(...enable, ins("if"), ...storeValue(state, currentSlot(state), x.entrada(0), x.nuevoLocal), ...advance, ins("end"));
  }

  /** The Feedback Nodes initialized at each start of a loop, by the loop's id. */
  const initializedByLoop = new Map();
  for (const node of g.nodos.filter((candidate) => candidate.tipo === FEEDBACK_NODE)) {
    const loop = initializingLoop(g, node);
    if (loop !== null) initializedByLoop.set(loop, [...(initializedByLoop.get(loop) ?? []), node.id]);
  }

  /** At each start of the loop `loopId`, the Feedback Nodes initialized there are made to initialize again. */
  const feedbackResetsAt = (loopId) => (initializedByLoop.get(loopId) ?? []).flatMap((id) => [ins("i32.const", feedbackState(id).initialized), ins("i32.const", 0), ins("i32.store")]);

  return { emitFeedbackRead, emitFeedbackStore, feedbackResetsAt };
}

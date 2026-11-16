// SubOVI calls (DT-045): the instance a subOVI node calls, the slots of its connector in the data space, and the call
// itself, each input written into its slot and each output read back.

import { connectorPorts } from "../model/graph.mjs";
import { esArray, esCluster, inMemory } from "../model/types.mjs";
import { constantOf } from "./constants.mjs";
import { ins } from "./instructions.mjs";
import { copyValueTo, isByReference } from "./memory-ops.mjs";
import { FIRST_COMPILED_FUNCTION, callScheduler } from "./runtime-functions.mjs";
import { clusterLayout, wasmTypeOf } from "./wasm-types.mjs";

/**
 * The instance of a subOVI that a `subvi` node calls (DT-045): a non-reentrant OVI has one for all its callers; a
 * preallocated-clone reentrant OVI, one per call site. Each instance has its own data space —slots for its connector,
 * cells and buffers— and either a function that is called directly (it never waits) or a plan that the host runs (it
 * waits). `compileCallee` is compileOVI, passed in so that the two modules do not import each other.
 */
export function subOVIInstance(callee, node, module, callerKey, compileCallee) {
  const reentrant = callee.g.vi?.execution?.reentrancy === "preallocated";
  const key = reentrant ? `${callee.key}@${callerKey}/${node.id}` : callee.key;
  if (module.instances.has(key)) return module.instances.get(key);
  const slots = new Map();
  const ports = connectorPorts(callee);
  for (const port of [...ports.in, ...ports.out]) {
    const type = inMemory(port.type);
    slots.set(port.name, { address: slotFor(type, module), type });
  }
  const callerCell = module.bufer(4, 4);
  const chainIndex = module.callChain.push({ name: oviNameOf(callee.key), callerCell }) - 1;
  const compiled = compileCallee(callee.g, callee.cat, module, slots, key, chainIndex);
  if (compiled.errores) return { errores: compiled.errores.map((error) => ({ ...error, vi: callee.key })) };
  const { clumps } = compiled;
  const waits = clumps.length > 1 || clumps.some((k) => k.largo);
  const instance = {
    key, slots, chainIndex, callerCell,
    direct: waits ? null : module.directFunctions.push(clumps[0] ?? { locales: [], cuerpo: [] }) - 1,
    plan: waits ? module.planes.push(clumps) - 1 : null,
  };
  module.instances.set(key, instance);
  return instance;
}

/** The name of an OVI as an error source gives it: its file name, without the folders of its key. */
const oviNameOf = (key) => key.split(/[\\/]/).pop();

/** A slot of the data space for a value of type `t`: 8 bytes for a scalar, a cell for a string or an array, a buffer for a cluster. */
function slotFor(t, module) {
  if (esCluster(t)) return module.bufer(clusterLayout(t).tam);
  if (t === "string" || esArray(t)) return module.bufer(4, 4);
  return module.bufer(8);
}

/** Stores the value that `value` leaves on the stack into `slot`: a scalar, or a copy of a string, array or cluster. */
export function storeInSlot(t, slot, value, temporal) {
  if (isByReference(t)) return copyValueTo(t, value, [ins("i32.const", slot.address)], temporal);
  return [ins("i32.const", slot.address), ...value, ins(`${wasmTypeOf(t)}.store`)];
}

/** Leaves on the stack the value in `slot`: a scalar, or the address of the string, array or cluster. */
const loadFromSlot = (t, slot) => (isByReference(t) ? [ins("i32.const", slot.address)] : [ins("i32.const", slot.address), ins(`${wasmTypeOf(t)}.load`)]);

/**
 * A control inside a subOVI: a connector control reads the value the caller left
 * in its slot; any other one gives its default value, as nobody can set it.
 */
export function subOVIControl(node, slot) {
  const t = node.tOut(0);
  return slot ? loadFromSlot(t, slot) : defaultValueCode(node, t, node.nodo.config?.value);
}

/** The instructions that leave the value `value` of type `t`, as a constant of the module. */
function defaultValueCode(node, t, value) {
  if (t === "string") return [ins("i32.const", node.cadena(String(value ?? "")))];
  if (esArray(t)) return [ins("i32.const", node.arrayConstante(t, value ?? []))];
  if (esCluster(t)) {
    const buffer = node.bufer(clusterLayout(t).tam);
    node.clusterConstante(t, value ?? {}, buffer);
    return [ins("i32.const", buffer)];
  }
  return constantOf(t, value === true ? 1 : value ?? 0);
}

/**
 * A call to a subOVI (DT-045): each input into its slot —an unwired one, with the
 * default value of the subOVI's control—, the call, and each output read back. A
 * string, array or cluster output is copied into the caller's own buffer, since
 * the next call overwrites the slot. A subOVI that waits is entered before its
 * inputs are written and left after its outputs are read, so that a parallel
 * call to the same instance cannot touch its slots in between.
 */
export function callSubOVI(node, instance) {
  const laidOut = (ports) => ports.map((port) => ({ ...port, type: inMemory(port.type) }));
  const inputs = laidOut(node.cat.puertos(node.nodo).in);
  const outputs = laidOut(node.cat.puertos(node.nodo).out);
  const waits = instance.direct === null;
  // A non-reentrant OVI serves one call at a time (DT-045): the call enters (waiting while another one
  // is inside) before it writes its inputs, runs the plan, reads its outputs and leaves. Writing the
  // inputs before waiting let a second call overwrite the first one's (bug #30).
  const code = waits ? [ins("i32.const", instance.plan), callScheduler("enter_subvi"), ins("drop")] : [];
  code.push(ins("i32.const", instance.callerCell), ins("i32.const", node.chainIndex), ins("i32.store"));
  inputs.forEach((port, i) => {
    const slot = instance.slots.get(port.calleeName ?? port.name);
    const value = node.cableada(i) ? node.entrada(i) : defaultValueCode(node, port.type, port.defaultValue);
    code.push(...storeInSlot(port.type, slot, value, node.temporal));
  });
  if (instance.direct !== null) code.push(ins("call", FIRST_COMPILED_FUNCTION + instance.direct));
  else code.push(ins("i32.const", instance.plan), callScheduler("run_plan"), ins("drop"));
  for (const port of outputs) {
    const slot = instance.slots.get(port.calleeName ?? port.name);
    if (!isByReference(port.type)) {
      code.push(...loadFromSlot(port.type, slot));
      continue;
    }
    const own = esCluster(port.type) ? node.bufer(clusterLayout(port.type).tam) : node.celda();
    code.push(...copyValueTo(port.type, loadFromSlot(port.type, slot), [ins("i32.const", own)], node.temporal), ins("i32.const", own));
  }
  if (waits) code.push(ins("i32.const", instance.plan), callScheduler("leave_subvi"));
  return code;
}

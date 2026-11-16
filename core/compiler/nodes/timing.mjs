// Programming ▸ Timing: Time Delay (DT-069). Wait (ms) and Wait Until Next ms Multiple are parked by the scheduler
// itself (pool-scheduler.mjs), from compile-ovi.mjs.

import { ins } from "../instructions.mjs";
import { callScheduler } from "../runtime-functions.mjs";
import { convertValue } from "../wasm-types.mjs";

const MS_PER_SECOND = 1000;

/**
 * Time Delay (DT-069): it waits the wired seconds, or the configured ones when the terminal is unwired; it waits
 * also with an error in, which passes unchanged; 0, a negative number and NaN do not wait (measured,
 * labview-captures/reports/2026-10-29-time-delay.md). Unverified: how LabVIEW rounds a fraction of a millisecond;
 * here it is cut off.
 */
export function timeDelay(node) {
  const seconds = node.cableada(0) ? [...node.entrada(0), ...convertValue(node.tIn(0), "number")] : [ins("f64.const", node.nodo.config?.delay ?? node.cat.bloque("time-delay").config.delay.value)];
  const milliseconds = node.temporal("f64");
  return [
    ...seconds, ins("f64.const", MS_PER_SECOND), ins("f64.mul"), ins("f64.floor"), ins("local.tee", milliseconds),
    ins("f64.const", 0), ins("local.get", milliseconds), ins("f64.const", 0), ins("f64.gt"), ins("select"),
    callScheduler("wait"), ins("drop"),
    ...node.entrada(1),
  ];
}

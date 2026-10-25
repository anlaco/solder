// The panel in the shared memory, as LabVIEW's transfer buffer (DT-063 §10): every control and
// indicator of the top-level VI has a record in the data space. The diagram reads and writes the
// records and never waits for the editor; the host (one coordinating thread) writes into the
// controls what the editor sends and walks the indicators to send the editor what changed.
//
// A record: [0] a reader-writer lock (linear-memory.mjs; only a string, array or cluster takes it),
// [16] how many times it was written, [20] how many times a Latch was released (controls), [24] the value: a scalar in 8 bytes, a string or an array as a handle, a cluster
// in place. A chart keeps a ring of its last writes instead of one value, as long as its history.

import { READ_WRITE_LOCK_BYTES } from "./linear-memory.mjs";

export const PANEL_RECORD = {
  lock: 0,
  version: READ_WRITE_LOCK_BYTES, // an indicator's writes, or a chart's
  released: READ_WRITE_LOCK_BYTES + 4, // a Latch control's releases
  value: READ_WRITE_LOCK_BYTES + 8,
};

/** The chart history buffer: Chart History Length... shows 1024 by default (labview-captures/graphs/50-chart-history-length-dialog.png). */
export const DEFAULT_CHART_HISTORY = 1024;

const SCALAR_BYTES = 8;
const HANDLE_BYTES = 4;

/** The bytes one value of `type` takes in a record, rounded up to 8: `clusterBytes` is a cluster's size. */
export function slotBytes(type, clusterBytes) {
  const bytes = clusterBytes ?? (type === "string" || type?.array !== undefined ? HANDLE_BYTES : SCALAR_BYTES);
  return (bytes + 7) & ~7;
}

/** The bytes of a record whose values (one, or a chart's `historyLength`) take `slot` bytes each. */
export const recordBytes = (slot, historyLength = 1) => PANEL_RECORD.value + slot * historyLength;

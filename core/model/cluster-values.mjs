// The value of a cluster (DT-095 §1, amended on 2026-11-16): the list of its elements' values, in cluster order, as
// LabVIEW gives it over VI Server (`["", false, 0]`). It cannot be a record by element name: a cluster's elements may
// share a label or have none, as those of a Cluster Constant, and equal names would be one value.
//
// The clusters Solder itself defines —the error cluster, a VISA resource name and a DAQ task in memory— have fixed,
// distinct names, and the runtime and the files written before this rule hold them as records by name. So a record is
// still taken wherever a value comes in, and those clusters are still read as records.

import { DAQ_TASK_LAYOUT } from "./daq-name.mjs";
import { ERROR, VISA_RESOURCE_LAYOUT } from "./types.mjs";

const NAMED_CLUSTERS = [ERROR, VISA_RESOURCE_LAYOUT, DAQ_TASK_LAYOUT].map((type) => JSON.stringify(type));

/** Is this one of Solder's own clusters, whose value is a record by name? */
export const isNamedCluster = (type) => NAMED_CLUSTERS.includes(JSON.stringify(type));

/** The value of the element at `index`, called `name`, in the cluster value `value`: a list in cluster order, or a record by name. */
export const elementValueIn = (value, index, name) => (Array.isArray(value) ? value[index] : value?.[name]);

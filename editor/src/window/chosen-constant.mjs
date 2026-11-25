// Functions palette ▸ Select an OVI... given an `.octl` of a type definition (DT-107): it places a constant that follows it,
// the reverse of what Make Type Def. does on a constant. Measured in LabVIEW 2026 Q3 (labview-captures/reports/
// 2026-11-25-placing-a-control.md Q2): OneTD.ctl, a Type Definition of a Numeric, places a linked Numeric Constant on the
// cursor. A plain Control, several objects, and the other kinds of object were not tried there, and place nothing here. A
// pure module: the file's text and the path to store come from the caller.

import { esEnum } from "../../../core/model/types.mjs";
import { linkFor, readTypeDefinition } from "../../../core/model/type-definition.mjs";
import { BLOCK as CLUSTER_CONSTANT } from "../block-diagram/cluster-constant-geometry.mjs";
import { toInstanceElement } from "./type-definition-instances.mjs";

/**
 * The constant of the `.octl` `text`, `{ bloque, config }`, linked to the file as stored at `storedPath`; null when the file
 * is not a type definition of one numeric control (the only measured case). An unreadable file throws its `ErrorQvi`.
 */
export function constantToPlace(text, catalog, storedPath) {
  const { kind, object } = readTypeDefinition(text, catalog);
  const link = linkFor(storedPath, kind);
  const isNumeric = object?.tipo === "control" && !object.config?.elements && !esEnum(object.config?.type);
  if (!link || !isNumeric) return null;
  // Whatever makes a constant of a control's element does it here: a Cluster Constant's elements are made the same way.
  const { tipo, config } = toInstanceElement(object, { tipo: CLUSTER_CONSTANT });
  return { bloque: tipo, config: { ...config, typedef: link } };
}

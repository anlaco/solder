// The Property Node inside a Run (DT-072): an external wait, like VISA's. Its clump parks, the coordinator runs
// the rows here, top to bottom, writes what they read and the error out into the shared memory and answers.
//
// The rules are LabVIEW's, measured in labview-captures/reports/2026-10-30-panel-property-node-behavior.md: with an
// error in nothing runs, the read rows give their defaults and the error passes; a warning in runs and passes; a
// failing row stops the node and the rows after it give defaults, unless Ignore Errors inside Node is on, when
// every row runs and the error is still given. A panel control's error names the row ("arg N", from 1) and the
// property after "<APPEND>"; with Ignore Errors on, the source stops before it. An Instr row's error names only the
// row (measured, 2026-10-26-visa-property-node-behavior.md), and its rows are VISA attributes of `native/solder-io`.
// An explicit node of a control's class finds its control by the refnum wired in, a control reference's; it runs as
// the implicit node does (measured, 2026-11-03-control-reference-run.md and -errors.md).

/** The record of one row, as the compiler lays it out (compiler.mjs, FORMAT_ROW_BYTES). */
const ROW_BYTES = 16;
const ROW_BITS_OFFSET = 4;
const ROW_VALUE_OFFSET = 8;

/** What the import answers its clump with: the work is in the outputs it wrote. */
const ANSWERED = 0;

const NO_ERROR = { status: false, code: 0, source: "" };

/** LabVIEW's error for reading Value of a Boolean with a latch mechanical action (measured). */
export const LATCH_VALUE_READ_ERROR = 1193;

/** LabVIEW's error for a Property Node whose reference is not a valid refnum (measured on a null refnum). */
export const INVALID_REFNUM_ERROR = 1055;

/** VISA's codes for an attribute a session does not have and for a value it refuses (measured). */
const VI_ERROR_NSUP_ATTR = -1073807331;
const VI_ERROR_NSUP_ATTR_STATE = -1073807330;

/** The largest Timeout Value VISA takes: 2147483648 and above are refused (measured). */
const LARGEST_TIMEOUT_MS = 2147483647;

/**
 * Instr's properties: how each reads from a session's attributes (`read(attributes, resource)`) and what it asks
 * `changeAttributes` for (`change(value)`). A serial one on a session that is not serial is VI_ERROR_NSUP_ATTR.
 */
const serialAttribute = (key) => ({ read: (attributes) => (attributes.serial ? attributes.serial[key] : { error: VI_ERROR_NSUP_ATTR }), change: (value) => ({ [key]: value }) });
const INSTR_PROPERTIES = {
  "General Settings:Timeout Value": { read: (attributes) => attributes.timeoutMs, change: (value) => (value > LARGEST_TIMEOUT_MS ? { error: VI_ERROR_NSUP_ATTR_STATE } : { timeoutMs: value }) },
  "General Settings:Resource Name": { read: (attributes, resource) => resource["resource name"] },
  "General Settings:Resource Class": { read: (attributes, resource) => resourceClassOf(resource["resource name"]) },
  "Message Based Settings:Termination Character": { read: (attributes) => attributes.terminationCharacter, change: (value) => ({ terminationCharacter: value }) },
  "Message Based Settings:Termination Character Enable": { read: (attributes) => attributes.terminationCharacterEnabled, change: (value) => ({ terminationCharacterEnabled: value }) },
  "Serial Settings:Baud Rate": serialAttribute("baudRate"),
  "Serial Settings:Data Bits": serialAttribute("dataBits"),
  "Serial Settings:Parity": serialAttribute("parity"),
  "Serial Settings:Stop Bits": serialAttribute("stopBits"),
  "Serial Settings:Flow Control": serialAttribute("flowControl"),
  "Serial Settings:End Mode for Reads": serialAttribute("endModeForReads"),
};
const BYTES_AT_SERIAL_PORT = "Serial Settings:Number of Bytes at Serial Port";

/**
 * A resource's class, the last part of its name: `SOCKET` for `TCPIP0::…::SOCKET` (measured), `INSTR` for
 * `ASRL1::INSTR`; an alias such as `COM1` is taken as `INSTR` (unverified).
 */
const resourceClassOf = (name) => (name.includes("::") ? name.slice(name.lastIndexOf("::") + 2).toUpperCase() : "INSTR");

/** The function an error source names. */
const FUNCTION_NAME = "Property Node";

/** The value a read row gives when it does not run: zero, FALSE, the empty string, or a cluster of them. */
const defaultOf = (type) => {
  if (type?.cluster) return Object.fromEntries(type.cluster.map((field) => [field.name, defaultOf(field.type)]));
  return type === "string" ? "" : type === "boolean" ? false : 0;
};

const isInteger = (type) => typeof type === "string" && /^[iu](8|16|32|64)$/.test(type);

/**
 * The Property Node import of a Run, `property_node(index, rows, referenceIn, errorIn, referenceOut, errorOut,
 * chainIndex)`. `panel` runs a panel control's rows: `{ readValue(link), writeValue(link, value), get(link, property),
 * set(link, property, value) }`, each answering a value (a write, nothing) or `{ error }`, at once or by a promise.
 */
export function createPropertyNodeFunction({ compilado, host, memory, panel, instr }) {
  const { leerCluster, ponerCluster, leerCadena, ponerCadena, functionSource } = host;
  const errorLayout = compilado.disposicionError;
  const view = () => new DataView(memory.buffer);

  function readRowValue(record, type, row) {
    const memoryView = view();
    if (type?.cluster) return leerCluster(memoryView.getInt32(record + ROW_VALUE_OFFSET, true), row.disposicion);
    if (type === "string") return leerCadena(memoryView.getInt32(record + ROW_VALUE_OFFSET, true));
    if (type === "boolean") return memoryView.getInt32(record + ROW_VALUE_OFFSET, true) !== 0;
    if (isInteger(type) || typeof type === "object") return Number(memoryView.getBigInt64(record + ROW_VALUE_OFFSET, true));
    return memoryView.getFloat64(record + ROW_VALUE_OFFSET, true);
  }

  function writeRowValue(record, type, value, row) {
    const memoryView = view();
    if (type?.cluster) return ponerCluster(memoryView.getInt32(record + ROW_VALUE_OFFSET, true), row.disposicion, value);
    if (type === "string") return ponerCadena(memoryView.getInt32(record + ROW_BITS_OFFSET, true), String(value));
    if (type === "boolean") return memoryView.setInt32(record + ROW_VALUE_OFFSET, value ? 1 : 0, true);
    if (isInteger(type) || typeof type === "object") return memoryView.setBigInt64(record + ROW_VALUE_OFFSET, BigInt(Math.trunc(Number(value))), true);
    return memoryView.setFloat64(record + ROW_VALUE_OFFSET, Number(value), true);
  }

  /** Runs one row against the panel: `{ value }` for a read, `{}` for a write, or `{ error }`. */
  function runPanelRow(link, row, value) {
    const isValue = row.property === "Value" || row.property === "Value (Signaling)";
    if (isValue && !row.write && link.mecanica?.startsWith("latch")) return { error: LATCH_VALUE_READ_ERROR };
    if (isValue) return row.write ? panel.writeValue(link, value) : panel.readValue(link);
    return row.write ? panel.set(link, row.property, value) : panel.get(link, row.property);
  }

  /** Runs one row against a VISA session: `{ value }`, `{}` or `{ error }` with VISA's status. */
  async function runInstrRow(session, resource, row, value) {
    const io = instr.io();
    if (row.property === BYTES_AT_SERIAL_PORT) {
      const { count, status } = await io.bytesAtPort(session);
      return status < 0 ? { error: status } : count;
    }
    const property = INSTR_PROPERTIES[row.property];
    if (!row.write) {
      const attributes = await io.attributes(session);
      return attributes.status < 0 ? { error: attributes.status } : property.read(attributes, resource);
    }
    const change = property.change(value);
    if (change.error !== undefined) return change;
    const status = await io.changeAttributes(session, change);
    return status < 0 ? { error: status } : undefined;
  }

  /** The panel control a control reference's refnum names, or null for Not A Refnum or an unknown one. */
  const controlOfRefnum = (refnum) => compilado.controlReferences?.[refnum - 1] ?? null;

  const asResult = (answer) => (answer && typeof answer === "object" && "error" in answer ? answer : { value: answer });
  const errorSource = (row, rowNumber, chainIndex, { ignoreErrors, isInstr }) => {
    const source = functionSource(FUNCTION_NAME, chainIndex, rowNumber);
    return ignoreErrors || isInstr ? source : `${source}<APPEND>\nProperty Name: <b>${row.property}</b>`;
  };

  return {
    property_node: async (index, rowsAddress, referenceIn, errorIn, referenceOut, errorOut, chainIndex) => {
      const { class: className, link: implicitLink, rows, ignoreErrors } = compilado.propertyNodes[index];
      const isInstr = className === "Instr";
      // An explicit node of a control's class reaches its control through the refnum wired in (DT-072 §2).
      const link = implicitLink ?? (isInstr ? null : controlOfRefnum(referenceIn));
      const recordOf = (row) => rowsAddress + row * ROW_BYTES;
      const giveDefaults = (from) => rows.forEach((row, k) => k >= from && !row.write && writeRowValue(recordOf(k), row.tipo, defaultOf(row.tipo), row));
      const resource = isInstr ? leerCluster(referenceIn, compilado.disposicionVisa) : null;
      if (isInstr) ponerCluster(referenceOut, compilado.disposicionVisa, resource);
      const incoming = leerCluster(errorIn, errorLayout);
      if (incoming.status) {
        giveDefaults(0);
        ponerCluster(errorOut, errorLayout, incoming);
        return ANSWERED;
      }
      // An Instr node opens a name that has no live session, as VISA Write and Read do (measured).
      let session = null;
      if (isInstr) {
        const opened = await instr.session(resource, referenceOut);
        if (opened.status !== undefined) {
          giveDefaults(0);
          ponerCluster(errorOut, errorLayout, { status: true, code: opened.status, source: errorSource(rows[0], 1, chainIndex, { isInstr }) });
          return ANSWERED;
        }
        session = opened.session;
      }
      // A refnum that names no control fails the whole node, whatever a warning in said, and with Ignore Errors on
      // too; its source names no row (measured, reports/2026-11-03-control-reference-errors.md Q2, Q3, Q6).
      if (!isInstr && link === null) {
        giveDefaults(0);
        ponerCluster(errorOut, errorLayout, { status: true, code: INVALID_REFNUM_ERROR, source: functionSource(FUNCTION_NAME, chainIndex) });
        return ANSWERED;
      }
      const runRow = (row, value) => (isInstr ? runInstrRow(session, resource, row, value) : runPanelRow(link, row, value));
      let failure = null;
      for (let k = 0; k < rows.length; k++) {
        const row = rows[k];
        const result = asResult(await runRow(row, row.write ? readRowValue(recordOf(k), row.tipo, row) : undefined));
        if (result.error === undefined) {
          if (!row.write) writeRowValue(recordOf(k), row.tipo, result.value ?? defaultOf(row.tipo), row);
          continue;
        }
        if (!row.write) writeRowValue(recordOf(k), row.tipo, defaultOf(row.tipo), row);
        failure ??= { status: true, code: result.error, source: errorSource(row, k + 1, chainIndex, { ignoreErrors, isInstr }) };
        if (!ignoreErrors) {
          giveDefaults(k + 1);
          break;
        }
      }
      ponerCluster(errorOut, errorLayout, failure ?? (incoming.code !== 0 ? incoming : NO_ERROR));
      return ANSWERED;
    },
  };
}

/** The names of the Property Node's imports, the ones a pool thread hands to the coordinator. */
export const PROPERTY_NODE_FUNCTION_NAMES = ["property_node"];

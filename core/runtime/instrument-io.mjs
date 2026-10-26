// Solder's VISA inside a Run (DT-065 §4, DT-066). Each VISA function of a VI is an external wait: its
// clump parks, the Run's coordinator asks the I/O for it here, writes the outputs into the shared
// memory and answers, and the clump is woken. No thread of the Run ever blocks on an instrument.
//
// `io` is Solder's VISA: the addon in Node (native/solder-io-node), the editor's I/O process later.
// Its operations answer promises with VISA's status codes.

/** VISA's VI_SUCCESS. A positive status is a warning, a negative one an error. */
const VI_SUCCESS = 0;

/** VISA's VI_WARN_NULL_OBJECT: what Close gives for a session that is not open (measured as 0x3FFF0082). */
const VI_WARN_NULL_OBJECT = 1073676418;

/** No session yet: a VISA resource name constant, or the session of an Open that failed. */
const NO_SESSION = 0;

/** What the import answers its clump with: the work is in the outputs it wrote. */
const ANSWERED = 0;

const NO_ERROR = { status: false, code: 0, source: "" };
const EMPTY = new Uint8Array(0);

/**
 * The VISA functions a compiled VI imports, each `(...addresses) → ANSWERED | Promise`. `host` is the
 * Run's createHostFunctions over `memory`; `compilado` gives the layouts of the error cluster and of the VISA
 * resource name. Without `io` (an editor with no I/O process yet), a VISA function fails the Run.
 */
export function createVisaFunctions({ io, host, memory, compilado }) {
  const writeCount = (address, count) => new DataView(memory.buffer).setUint32(address, count, true);
  const { leerCluster, ponerCluster, putBytes, readBytes, functionSource } = host;
  const errorLayout = compilado.disposicionError;
  const resourceLayout = compilado.disposicionVisa;
  const readError = (address) => leerCluster(address, errorLayout);
  const readResource = (address) => leerCluster(address, resourceLayout);
  const writeResource = (address, resource) => ponerCluster(address, resourceLayout, resource);
  // An error or a warning carries the function and where it ran, as LabVIEW's source does ("VISA Read in visa-read.vi").
  const writeStatus = (address, status, functionName, chainIndex) =>
    ponerCluster(address, errorLayout, status === VI_SUCCESS ? NO_ERROR : { status: status < 0, code: status, source: functionSource(functionName, chainIndex) });
  const requireIo = () => {
    if (!io) throw new Error("Instrument I/O is not available in this Run.");
    return io;
  };

  /**
   * A VISA function's common shape: with an error in it does no work (measured): the error passes
   * unchanged, the resource name passes through and a read buffer and a return count give their
   * defaults. Otherwise `work(resource)` talks to the instrument and gives the status.
   */
  const visaFunction = (functionName, { resourceIn, errorIn, resourceOut, bufferCell, countOut, errorOut, chainIndex }, work) => {
    const incoming = readError(errorIn);
    const resource = readResource(resourceIn);
    if (resourceOut) writeResource(resourceOut, resource);
    if (bufferCell) putBytes(bufferCell, EMPTY);
    if (countOut) writeCount(countOut, 0);
    if (incoming.status) {
      ponerCluster(errorOut, errorLayout, incoming);
      return ANSWERED;
    }
    return Promise.resolve(work(requireIo(), resource)).then((status) => {
      // A warning that came in is passed on unless the function has its own status (unverified which wins).
      if (status === VI_SUCCESS && incoming.code !== 0) ponerCluster(errorOut, errorLayout, incoming);
      else writeStatus(errorOut, status, functionName, chainIndex);
      return ANSWERED;
    });
  };

  // LabVIEW ties a resource name to its session (measured, labview-captures/reports/2026-10-26-visa-edges.md):
  // Write and Read on a name never opened, or whose session was closed, open it from the name and go on.
  // The sessions opened here, by name, for this Run (whether LabVIEW closes them when the VI stops: unverified).
  const sessionsByName = new Map();
  const isLive = (visa, session) => session !== NO_SESSION && visa.attributes(session).status === VI_SUCCESS;
  /** The live session of `resource`, opened from its name if it has none: `{ session }` or `{ status }` when that Open failed. */
  const sessionOf = async (visa, resource, resourceOut) => {
    const name = resource["resource name"];
    const live = [resource.session, sessionsByName.get(name) ?? NO_SESSION].find((session) => isLive(visa, session));
    if (live !== undefined) return useSession(resource, resourceOut, live);
    const opened = await visa.open(name);
    if (opened.status < 0) return { status: opened.status };
    sessionsByName.set(name, opened.session);
    return useSession(resource, resourceOut, opened.session);
  };
  const useSession = (resource, resourceOut, session) => {
    if (resourceOut) writeResource(resourceOut, { ...resource, session });
    return { session };
  };

  return {
    // Every Open gives a session of its own (measured: a new refnum each time).
    visa_open: (resourceIn, timeoutMs, errorIn, resourceOut, errorOut, chainIndex) =>
      visaFunction("VISA Open", { resourceIn, errorIn, resourceOut, errorOut, chainIndex }, async (visa, resource) => {
        const { session, status } = await visa.open(resource["resource name"]);
        if (status >= 0) {
          sessionsByName.set(resource["resource name"], session);
          writeResource(resourceOut, { ...resource, session });
        }
        return status;
      }),
    visa_write: (resourceIn, buffer, errorIn, resourceOut, countOut, errorOut, chainIndex) =>
      visaFunction("VISA Write", { resourceIn, errorIn, resourceOut, countOut, errorOut, chainIndex }, async (visa, resource) => {
        const { session, status: openStatus } = await sessionOf(visa, resource, resourceOut);
        if (openStatus !== undefined) return openStatus;
        const { count, status } = await visa.write(session, Buffer.from(readBytes(buffer)));
        writeCount(countOut, count);
        return status;
      }),
    visa_read: (resourceIn, byteCount, errorIn, resourceOut, bufferCell, countOut, errorOut, chainIndex) =>
      visaFunction("VISA Read", { resourceIn, errorIn, resourceOut, bufferCell, countOut, errorOut, chainIndex }, async (visa, resource) => {
        const { session, status: openStatus } = await sessionOf(visa, resource, resourceOut);
        if (openStatus !== undefined) return openStatus;
        const { data, status } = await visa.read(session, byteCount >>> 0);
        putBytes(bufferCell, data);
        writeCount(countOut, data.length);
        return status;
      }),
    // Closing a session that is not open is a warning, not an error (measured).
    visa_close: (resourceIn, errorIn, errorOut, chainIndex) =>
      visaFunction("VISA Close", { resourceIn, errorIn, resourceOut: 0, errorOut, chainIndex }, (visa, resource) => {
        if (!isLive(visa, resource.session)) return VI_WARN_NULL_OBJECT;
        if (sessionsByName.get(resource["resource name"]) === resource.session) sessionsByName.delete(resource["resource name"]);
        return visa.close(resource.session);
      }),
  };
}

/** The names of the VISA imports, the ones a pool thread hands to the coordinator. */
export const VISA_FUNCTION_NAMES = ["visa_open", "visa_write", "visa_read", "visa_close"];

// Solder's VISA over a message port (DT-065 §3): the editor's I/O process serves it, and a Run's
// coordinator, in the run worker, is its client. Every operation is a request with an id that answers
// once; the bytes travel as Uint8Array.
//
//   request  { id, operation, args }      operation: open, write, read, close, attributes, changeAttributes
//   answer   { id, answer } | { id, error }

/** The operations a client may ask for: those of native/solder-io-node/solder-io.mjs. */
export const IO_OPERATIONS = ["open", "write", "read", "close", "attributes", "changeAttributes"];

/**
 * Serves `solderIo` to the requests that `onRequest(listener)` hears, answering through `answer(message)`.
 * A failure of one operation answers its request with the error and leaves the others alone.
 */
export function serveSolderIo(solderIo, { onRequest, answer }) {
  onRequest(async ({ id, operation, args }) => {
    try {
      if (!IO_OPERATIONS.includes(operation)) throw new Error(`Unknown instrument I/O operation "${operation}".`);
      answer({ id, answer: await solderIo[operation](...args) });
    } catch (error) {
      answer({ id, error: error.message });
    }
  });
}

/**
 * Solder's VISA as seen through `port` (a MessagePort): each operation answers a promise. `fail(reason)`
 * rejects every request still waiting, as when the I/O process ends; later requests fail at once.
 */
export function createIoClient(port) {
  const waiting = new Map();
  let nextId = 1;
  let failure = null;
  port.onmessage = ({ data: { id, answer, error } }) => {
    const request = waiting.get(id);
    if (!request) return;
    waiting.delete(id);
    if (error !== undefined) request.reject(new Error(error));
    else request.resolve(answer);
  };
  const ask = (operation, args) =>
    new Promise((resolve, reject) => {
      if (failure) return reject(failure);
      const id = nextId++;
      waiting.set(id, { resolve, reject });
      port.postMessage({ id, operation, args });
    });
  const client = Object.fromEntries(IO_OPERATIONS.map((operation) => [operation, (...args) => ask(operation, args)]));
  client.fail = (reason) => {
    failure = new Error(reason);
    for (const request of waiting.values()) request.reject(failure);
    waiting.clear();
  };
  client.disconnect = () => {
    client.fail("The instrument I/O was disconnected.");
    port.close();
  };
  return client;
}

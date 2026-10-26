// How the main process keeps the instrument I/O process (DT-065 §3): started by the first Run that talks
// to an instrument, kept for the next ones, started again after it ends. Electron is given from outside
// (`fork`, `createChannel`), so this can be tried without it.

/**
 * `fork()` starts the I/O process (a utilityProcess), `createChannel()` gives `{ port1, port2 }`, and
 * `onExit()` is told when the process ends while Runs may be using it. `connect()` gives a new port to it.
 */
export function createInstrumentIoProcess({ fork, createChannel, onExit }) {
  let child = null;
  const start = () => {
    const started = fork();
    started.once("exit", () => {
      if (child === started) child = null;
      onExit();
    });
    return started;
  };
  return {
    /** A port to the I/O process, starting it if it is not running. */
    connect() {
      child ??= start();
      const { port1, port2 } = createChannel();
      child.postMessage(null, [port1]);
      return port2;
    },
    /** Ends the I/O process, when Solder quits. */
    stop() {
      child?.kill();
      child = null;
    },
  };
}

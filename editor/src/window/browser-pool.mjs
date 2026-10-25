// The window's pool of threads for its Runs (DT-063 §11): created at the first Run, one worker per
// logical processor, as each of LabVIEW's execution systems has, and alive while the window is, so a
// Run starts at once. Each Run gets one new port per thread (`connect`) and hands them to its
// coordinator, the run worker.

export function createBrowserPool(threads = navigator.hardwareConcurrency || 1) {
  const workers = Array.from({ length: threads }, () => new Worker(new URL("./pool-worker.mjs", import.meta.url), { type: "module" }));
  return {
    threads,
    /** One port per thread for the next Run; the other end goes to the thread. */
    connect() {
      return workers.map((worker) => {
        const { port1, port2 } = new MessageChannel();
        worker.postMessage({ port: port2 }, [port2]);
        return port1;
      });
    },
    /** Ends every thread: after a Run whose coordinator had to be ended, they may still be running it. */
    close: () => workers.forEach((worker) => worker.terminate()),
  };
}

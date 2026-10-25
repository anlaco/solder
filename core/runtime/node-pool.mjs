// A pool of threads for Runs in Node (DT-063 §11): the command line and the tests. Its workers live as
// long as the pool; each Run connects to them through new ports (`connect`), which `ejecutar` takes
// as `poolPorts`.

import { availableParallelism } from "node:os";
import { Worker } from "node:worker_threads";

/** A pool of `threads` workers, by default one per logical processor, as LabVIEW's execution systems have. */
export function createNodePool(threads = availableParallelism()) {
  const workers = Array.from({ length: threads }, () => {
    const worker = new Worker(new URL("./pool-thread-node.mjs", import.meta.url));
    // An idle pool does not keep the process alive; a Run's ports do while it runs.
    worker.unref();
    return worker;
  });
  return {
    threads,
    /** One port per thread for the next Run. */
    connect() {
      return workers.map((worker) => {
        const { port1, port2 } = new MessageChannel();
        worker.postMessage({ port: port2 }, [port2]);
        return port1;
      });
    },
    close: () => Promise.all(workers.map((worker) => worker.terminate())),
  };
}

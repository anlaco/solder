// A thread of a pool in Node (node-pool.mjs): the ports of each Run arrive from the pool.

import { parentPort } from "node:worker_threads";
import { servePoolThread } from "./pool-thread.mjs";

servePoolThread((listen) => parentPort.on("message", ({ port }) => listen(port)));

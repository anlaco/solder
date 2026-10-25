// A thread of the window's pool of threads (DT-063 §11): the window sends it a port for each Run
// (browser-pool.mjs), and the Run's coordinator, the run worker, talks to it through that port.

import { servePoolThread } from "../../../core/runtime/pool-thread.mjs";

servePoolThread((listen) => {
  onmessage = ({ data }) => data.port && listen(data.port);
});

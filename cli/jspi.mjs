// Which Node needs `--experimental-wasm-jspi`. JSPI ships without a flag from Node 24.20 on,
// Node 24.19 still needs the flag, and Node 26 refuses to start with it ("bad option"), so
// the flag cannot be written into a script or a shebang: it is passed only to a Node that
// lacks JSPI (DT-061, "What was measured" 1).

export const JSPI_FLAG = "--experimental-wasm-jspi";

/** Whether this WebAssembly can suspend a clump while it waits (DT-040). */
export const hasJSPI = (webAssembly = globalThis.WebAssembly) =>
  typeof webAssembly.Suspending === "function" && typeof webAssembly.promising === "function";

/** The arguments a Node like this one needs before a script to run VIs that wait. */
export const jspiNodeArguments = (webAssembly = globalThis.WebAssembly) => (hasJSPI(webAssembly) ? [] : [JSPI_FLAG]);

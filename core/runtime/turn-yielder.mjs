// How a running VI gives its thread back for a moment (DT-041), so that the other clumps, the
// panel and Abort can run. In Node it yields with setImmediate, which lets due timers run; a
// MessageChannel does not. In a worker there is no setImmediate, and a MessageChannel is
// immediate where setTimeout(0) takes up to 4 ms.

/**
 * Makes the yield of one Run: `yieldTurn()` returns a promise that resolves on the next turn of
 * the event loop; `close()` releases the channel when the Run ends.
 * @param {{ immediate?: ((callback: () => void) => unknown) | null }} [host] setImmediate; null where there is none, as in a worker
 */
export function createTurnYielder({ immediate = globalThis.setImmediate } = {}) {
  let channel = null;
  // Several clumps may yield before the first message arrives (issue #1: on Windows two waits that
  // end together run in one task), so each message wakes the oldest waiting yield, never only the last.
  const waitingYields = [];
  const yieldTurn = () =>
    new Promise((resume) => {
      if (typeof immediate === "function") return immediate(resume);
      if (!channel) {
        channel = new MessageChannel();
        channel.port1.onmessage = () => waitingYields.shift()?.();
        channel.port1.unref?.();
      }
      waitingYields.push(resume);
      channel.port2.postMessage(0);
    });
  const close = () => channel?.port1.close();
  return { yieldTurn, close };
}

// The values a running OVI sends reach the window once per frame of the display, never once per message.
//
// The run worker passes over the panel every 16 ms (core/runtime/runtime.mjs, DISPLAY_PASS_MS) and each pass is a
// message. Painting the whole window for each one cost 9 to 13 ms in the Front Panel, so a panel a little bigger, or a
// busier machine, fell behind and its messages piled up (reports/2026-11-21-visual-faults-editor.md). LabVIEW redraws
// an indicator at a steady pace and never stops for a value it was sent (reports/2026-11-21-indicator-redraw-labview.md):
// here the values are merged as they come and painted at the next frame, so a frame shows the newest values and a
// late frame drops the ones in between, as LabVIEW's asynchronous display does.

/**
 * `paint()` draws the window; `requestFrame(callback)` is the page's `requestAnimationFrame`. `request()` asks for a
 * paint at the next frame, any number of times before it; `painted()` says the window was just painted for another
 * reason, so the frame asked for has nothing left to do.
 */
export function createFramePainter({ paint, requestFrame }) {
  let pending = false;
  const paintIfPending = () => {
    if (!pending) return;
    pending = false;
    paint();
  };
  return {
    request() {
      if (pending) return;
      pending = true;
      requestFrame(paintIfPending);
    },
    painted() {
      pending = false;
    },
  };
}

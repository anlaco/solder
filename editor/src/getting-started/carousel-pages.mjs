// The texts of the Getting Started window: the eight pages of its carousel and the two captions at the bottom.
// LabVIEW's own are NI's, so these are written anew about Solder (CLAUDE.md rule 3). Their links lead to web
// pages that Solder does not have yet, so they are greyed; the reason comes from the inventory
// (`window.getting-started.carousel-link` and `.caption-link`).

export const LINK_LABEL = "Read more";

export const CAROUSEL_PAGES = [
  {
    heading: "Start with Solder",
    body: "Solder is a free visual language: you draw a program as a diagram of blocks joined by wires, and the values flow along them. Press Ctrl+N to open a blank VI, place a control on its front panel and wire it on the block diagram.",
  },
  {
    heading: "Learn from the examples",
    body: "The examples folder holds small VIs that each show one idea: arithmetic, loops, strings, arrays and subVIs. Open one with Open Existing, run it, then change a wire and run it again to see what moves.",
  },
  {
    heading: "What is new in this version",
    body: "This release adds this window, the list of recent files and the Close and Close All commands. VIs are now saved as .sdg files, and the editor asks before it closes a VI that has unsaved changes.",
  },
  {
    heading: "Think in dataflow",
    body: "A block runs as soon as all its inputs have a value, and not before. There is no line order to follow: two blocks that do not depend on each other may run at the same time.",
  },
  {
    heading: "Find a bug with the debugger",
    body: "Turn on Highlight Execution to watch values travel along the wires, place a probe on a wire to read what passes through it, or set a breakpoint on a block to stop the VI right before it runs.",
  },
  {
    heading: "Build with subVIs",
    body: "Any VI can be used as a block of another one. Give it a connector pane with its inputs and outputs, save it, and drop it on a diagram with Select a VI. Small VIs are easier to read and to test.",
  },
  {
    heading: "Know the file formats",
    body: "A VI is a text file with the extension .sdg that holds only the diagram, so it can be read, compared and kept under version control. Solder compiles it to WebAssembly when you run it.",
  },
  {
    heading: "Report a problem",
    body: "If a VI behaves differently from what you expect, or the editor looks different from LabVIEW, tell us. Say which version you use and attach a small VI that shows the problem.",
  },
];

/** The two captions at the bottom of the window, left and middle. */
export const CAPTIONS = [
  { heading: "Find Drivers and Add-ons", body: "Connect to devices and add libraries to Solder." },
  { heading: "Community and Support", body: "Ask questions, share your VIs and report problems." },
];

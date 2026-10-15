// The Ctrl shortcuts that run a command of the menu bar, by key. The editor
// window looks the command up in its table of orders (editor-window.mjs).
// Ctrl+E and Ctrl+T are LabVIEW's Window shortcuts, measured in
// labview-captures/editor-checks/REPORT.md §4 and §7; Ctrl+N and Ctrl+W are
// New VI and Close (labview-captures/reports/2026-10-15-file-close.md).

/** The command of each Ctrl+key shortcut, by the last segment of its menu id. */
export const CTRL_SHORTCUT_COMMANDS = {
  n: "new-vi",
  w: "close",
  s: "save",
  o: "open",
  q: "exit",
  i: "vi-properties",
  d: "debug-window",
  l: "error-list",
  e: "toggle-window",
  t: "tile-left-and-right",
};

/** The command for Ctrl+`key`, or undefined when the key is not a shortcut. */
export const commandForCtrlKey = (key) => CTRL_SHORTCUT_COMMANDS[key.toLowerCase()];

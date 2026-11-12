// Whether a script was run directly (`node scripts/x.mjs`) or imported by another one. Comparing `import.meta.url` with
// `file://${process.argv[1]}` works only on Linux and macOS: on Windows the one is `file:///C:/…` and the other
// `C:\…`, so a script that checked that way never ran its own work there.

import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * True when `scriptPath` (by default the script Node was started with) is the module at `moduleUrl`. Windows paths are
 * compared without regard to case or the kind of slash, as Windows compares them.
 */
export function isRunDirectly(moduleUrl, scriptPath = process.argv[1], platform = process.platform) {
  if (!scriptPath) return false;
  const windows = platform === "win32";
  const paths = windows ? path.win32 : path.posix;
  const comparable = (filePath) => (windows ? paths.resolve(filePath).toLowerCase() : paths.resolve(filePath));
  return comparable(fileURLToPath(moduleUrl, { windows })) === comparable(scriptPath);
}

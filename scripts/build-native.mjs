// Builds Solder's own VISA for Node (DT-065) with Cargo and leaves it where `loadSolderIo` finds it.
// `--release` builds it optimized, as `npm run dist` needs; without it, the debug build of the tests.

import { spawnSync } from "node:child_process";
import { copyFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ADDON_PATH } from "../native/solder-io-node/solder-io.mjs";

const REPOSITORY_ROOT = fileURLToPath(new URL("..", import.meta.url));
const ADDON_CRATE = "solder-io-node";

/** The file name Cargo gives a `cdylib` on each operating system. */
const LIBRARY_FILE_NAME = {
  linux: "libsolder_io_node.so",
  darwin: "libsolder_io_node.dylib",
  win32: "solder_io_node.dll",
};

export function buildNative({ release = false } = {}) {
  const profileArguments = release ? ["--release"] : [];
  const { status } = spawnSync("cargo", ["build", "--quiet", "-p", ADDON_CRATE, ...profileArguments], {
    cwd: REPOSITORY_ROOT,
    stdio: "inherit",
  });
  if (status !== 0) throw new Error(`cargo build -p ${ADDON_CRATE} failed`);
  const profileDirectory = release ? "release" : "debug";
  const libraryFileName = LIBRARY_FILE_NAME[process.platform];
  if (!libraryFileName) throw new Error(`no addon file name known for ${process.platform}`);
  copyFileSync(new URL(`target/${profileDirectory}/${libraryFileName}`, `file://${REPOSITORY_ROOT}`), ADDON_PATH);
}

if (import.meta.url === `file://${process.argv[1]}`) buildNative({ release: process.argv.includes("--release") });

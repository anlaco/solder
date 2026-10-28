// Builds Solder's own VISA for Node (DT-065) with Cargo and leaves it where `loadSolderIo` finds it.
// `--release` builds it optimized, as `npm run dist` needs; without it, the debug build of the tests.

import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ADDON_PATH, addonFileName } from "../native/solder-io-node/solder-io.mjs";

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

/**
 * The addons a release packs that this machine does not build (DT-062): Windows' is built in the Windows virtual
 * machine (`cargo build --release -p solder-io-node`) and its `solder_io_node.dll` copied here under this name.
 */
const ADDONS_BUILT_ELSEWHERE = [addonFileName("win32", "x64")];

/** Fails when an addon the release packs is missing, since electron-builder would leave it out without a word. */
export function requireReleaseAddons() {
  const missing = ADDONS_BUILT_ELSEWHERE.filter((fileName) => !existsSync(new URL(`../native/solder-io-node/${fileName}`, import.meta.url)));
  if (missing.length) throw new Error(`The release needs ${missing.join(", ")} in native/solder-io-node/ (built in the Windows virtual machine).`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  buildNative({ release: process.argv.includes("--release") });
  if (process.argv.includes("--for-release")) requireReleaseAddons();
}

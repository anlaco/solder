// Builds Solder's own VISA for Node (DT-065) with Cargo and leaves it where `loadSolderIo` finds it.
// `--release` builds it optimized, as `npm run dist` needs; without it, the debug build of the tests.

import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isRunDirectly } from "./entry-point.mjs";
import { ADDON_PATH, MEMORY_BRIDGE_PATH, addonFileName, memoryBridgeRelativePath } from "../native/solder-io-node/solder-io.mjs";

const REPOSITORY_ROOT = fileURLToPath(new URL("..", import.meta.url));
const ADDON_CRATE = "solder-io-node";
/** The library that offers LabVIEW's memory functions to the libraries the addon loads (DT-088 §4). */
const MEMORY_BRIDGE_CRATE = "solder-memory-bridge";

/** The file name Cargo gives a crate's `cdylib` on each operating system. */
function cargoLibraryFileName(crate, platform = process.platform) {
  const stem = crate.replaceAll("-", "_");
  const fileName = { linux: `lib${stem}.so`, darwin: `lib${stem}.dylib`, win32: `${stem}.dll` }[platform];
  if (!fileName) throw new Error(`no library file name known for ${platform}`);
  return fileName;
}

export function buildNative({ release = false } = {}) {
  const profileArguments = release ? ["--release"] : [];
  const { status } = spawnSync("cargo", ["build", "--quiet", "-p", ADDON_CRATE, "-p", MEMORY_BRIDGE_CRATE, ...profileArguments], {
    cwd: REPOSITORY_ROOT,
    stdio: "inherit",
  });
  if (status !== 0) throw new Error(`cargo build -p ${ADDON_CRATE} -p ${MEMORY_BRIDGE_CRATE} failed`);
  const built = (crate) => new URL(`target/${release ? "release" : "debug"}/${cargoLibraryFileName(crate)}`, `file://${REPOSITORY_ROOT}`);
  copyFileSync(built(ADDON_CRATE), ADDON_PATH);
  mkdirSync(path.dirname(MEMORY_BRIDGE_PATH), { recursive: true });
  copyFileSync(built(MEMORY_BRIDGE_CRATE), MEMORY_BRIDGE_PATH);
}

/**
 * The addons a release packs that this machine does not build (DT-062): Windows' is built in the Windows virtual
 * machine (`cargo build --release -p solder-io-node -p solder-memory-bridge`) and its `solder_io_node.dll` and
 * `solder_memory_bridge.dll` copied here as `solder-io-win32-x64.node` and `memory-bridge/win32-x64/lvrt.dll`.
 */
const ADDONS_BUILT_ELSEWHERE = [addonFileName("win32", "x64"), memoryBridgeRelativePath("win32", "x64")];

/** Fails when an addon the release packs is missing, since electron-builder would leave it out without a word. */
export function requireReleaseAddons() {
  const missing = ADDONS_BUILT_ELSEWHERE.filter((fileName) => !existsSync(new URL(`../native/solder-io-node/${fileName}`, import.meta.url)));
  if (missing.length) throw new Error(`The release needs ${missing.join(", ")} in native/solder-io-node/ (built in the Windows virtual machine).`);
}

if (isRunDirectly(import.meta.url)) {
  buildNative({ release: process.argv.includes("--release") });
  if (process.argv.includes("--for-release")) requireReleaseAddons();
}

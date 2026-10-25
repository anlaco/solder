// `npm test`: every test of the repository. First Solder's own VISA (DT-065) is built and its Rust
// tests run, since the Node tests load it. Arguments are passed on to `node --test`; with no file
// among them, every test file runs.

import { spawnSync } from "node:child_process";
import { buildNative } from "./build-native.mjs";

const EVERY_TEST_FILE = "test/**/*.test.mjs";

const passedArguments = process.argv.slice(2);
const namesAFile = passedArguments.some((argument) => !argument.startsWith("-"));
const testFiles = namesAFile ? [] : [EVERY_TEST_FILE];

buildNative();
const rustTests = spawnSync("cargo", ["test", "--quiet", "--workspace"], { stdio: "inherit" });
if (rustTests.status !== 0) process.exit(rustTests.status ?? 1);

const { status, signal } = spawnSync(process.execPath, ["--test", ...passedArguments, ...testFiles], {
  stdio: "inherit",
});
if (signal) process.kill(process.pid, signal);
process.exit(status);

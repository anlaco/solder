// `npm test`: every test of the repository, in a Node started with the JSPI flag only when it
// needs it (cli/jspi.mjs). Arguments are passed on to `node --test`; with no file among them,
// every test file runs.

import { spawnSync } from "node:child_process";
import { jspiNodeArguments } from "../cli/jspi.mjs";

const EVERY_TEST_FILE = "test/**/*.test.mjs";

const passedArguments = process.argv.slice(2);
const namesAFile = passedArguments.some((argument) => !argument.startsWith("-"));
const testFiles = namesAFile ? [] : [EVERY_TEST_FILE];

const { status, signal } = spawnSync(process.execPath, [...jspiNodeArguments(), "--test", ...passedArguments, ...testFiles], {
  stdio: "inherit",
});
if (signal) process.kill(process.pid, signal);
process.exit(status);

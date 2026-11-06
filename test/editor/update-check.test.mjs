// The beta's update at start-up (DT-082): only a packaged Solder looks, the user is
// asked before anything is downloaded, and the download waits for Solder to close.

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  UPDATE_ANSWERS,
  UPDATE_BUTTONS,
  UPDATE_BUTTON_ANSWERS,
  UPDATE_OUTCOMES,
  checkForUpdatesAtStart,
  shouldCheckForUpdates,
  updateAvailableText,
} from "../../editor/electron/update-check.mjs";

/** A stand-in for electron-updater's autoUpdater that offers `newVersion` (or nothing) and records what it was asked. */
function fakeUpdater({ newVersion = null, checkFails = false } = {}) {
  const calls = [];
  return {
    calls,
    autoDownload: true,
    autoInstallOnAppQuit: false,
    async checkForUpdates() {
      calls.push("check");
      if (checkFails) throw new Error("no network");
      return newVersion ? { isUpdateAvailable: true, updateInfo: { version: newVersion } } : { isUpdateAvailable: false, updateInfo: { version: "0.8.0-beta" } };
    },
    async downloadUpdate() {
      calls.push("download");
    },
    quitAndInstall() {
      calls.push("quit-and-install");
    },
  };
}

/** Runs the check with `answer` to the first message and records what the user was shown. */
async function runCheck(updater, answer = UPDATE_ANSWERS.download) {
  const shown = [];
  const logged = [];
  const outcome = await checkForUpdatesAtStart(updater, {
    currentVersion: "0.8.0-beta",
    ask: async (text) => {
      shown.push(text.title);
      return answer;
    },
    tell: async (text) => shown.push(text.title),
    log: (message) => logged.push(message),
  });
  return { outcome, shown, logged };
}

test("only a packaged Solder looks for updates, and never during captures or when told not to", () => {
  assert.equal(shouldCheckForUpdates({ isPackaged: true, env: {} }), true);
  assert.equal(shouldCheckForUpdates({ isPackaged: false, env: {} }), false);
  assert.equal(shouldCheckForUpdates({ isPackaged: true, env: { SOLDER_CAPTURAS: "/tmp/x" } }), false);
  assert.equal(shouldCheckForUpdates({ isPackaged: true, env: { SOLDER_NO_UPDATE_CHECK: "1" } }), false);
});

test("with no newer release nothing is shown or downloaded", async () => {
  const updater = fakeUpdater();
  const { outcome, shown } = await runCheck(updater);
  assert.equal(outcome, UPDATE_OUTCOMES.upToDate);
  assert.deepEqual(shown, []);
  assert.deepEqual(updater.calls, ["check"]);
});

test("nothing is downloaded before the user answers, and Later downloads nothing", async () => {
  const updater = fakeUpdater({ newVersion: "0.9.0-beta" });
  const { outcome, shown } = await runCheck(updater, UPDATE_ANSWERS.later);
  assert.equal(updater.autoDownload, false);
  assert.equal(outcome, UPDATE_OUTCOMES.declined);
  assert.deepEqual(shown, ["Update Available"]);
  assert.deepEqual(updater.calls, ["check"]);
});

test("Download downloads, says so, and leaves the install for when Solder closes", async () => {
  const updater = fakeUpdater({ newVersion: "0.9.0-beta" });
  const { outcome, shown } = await runCheck(updater, UPDATE_ANSWERS.download);
  assert.equal(outcome, UPDATE_OUTCOMES.downloaded);
  assert.deepEqual(shown, ["Update Available", "Update Ready"]);
  assert.deepEqual(updater.calls, ["check", "download"], "Solder never restarts by itself");
  assert.equal(updater.autoInstallOnAppQuit, true);
});

test("a failed check is only logged", async () => {
  const { outcome, shown, logged } = await runCheck(fakeUpdater({ checkFails: true }));
  assert.equal(outcome, UPDATE_OUTCOMES.failed);
  assert.deepEqual(shown, []);
  assert.match(logged[0], /no network/);
});

test("the offer names both versions and warns that ovi.lib is replaced", () => {
  const text = updateAvailableText("0.8.0-beta", "0.9.0-beta");
  assert.match(text.message, /0\.9\.0-beta/);
  assert.match(text.message, /0\.8\.0-beta/);
  assert.match(text.detail, /ovi\.lib/);
  assert.deepEqual(UPDATE_BUTTONS, ["Download", "Later"]);
  assert.deepEqual(UPDATE_BUTTON_ANSWERS, [UPDATE_ANSWERS.download, UPDATE_ANSWERS.later]);
});

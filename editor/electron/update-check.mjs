// The beta's update at start-up (DT-082): a packaged Solder asks GitHub for a newer
// release once when it starts; if there is one, the user is asked before anything is
// downloaded, and the download is installed when Solder closes, so Solder never
// restarts by itself with unsaved OVIs open.
//
// Pure: the updater (electron-updater's autoUpdater) and the dialog are given by the
// main process, so the flow is tested without Electron or the network.

/** What the check ended in, for the log and the tests. */
export const UPDATE_OUTCOMES = {
  skipped: "skipped",
  upToDate: "up-to-date",
  declined: "declined",
  downloaded: "downloaded",
  failed: "failed",
};

/** The answers of the first message, and its buttons in order. */
export const UPDATE_ANSWERS = { download: "download", later: "later" };
export const UPDATE_BUTTONS = ["Download", "Later"];
export const UPDATE_BUTTON_ANSWERS = [UPDATE_ANSWERS.download, UPDATE_ANSWERS.later];

/**
 * Whether this Solder looks for updates: only a packaged one, never during the captures
 * (`SOLDER_CAPTURAS`) and never when `SOLDER_NO_UPDATE_CHECK` is set.
 */
export const shouldCheckForUpdates = ({ isPackaged, env }) => isPackaged && !env.SOLDER_CAPTURAS && !env.SOLDER_NO_UPDATE_CHECK;

/** The message that offers `newVersion` to whoever runs `currentVersion`; it warns that ovi.lib is replaced. */
export const updateAvailableText = (currentVersion, newVersion) => ({
  title: "Update Available",
  message: `Solder ${newVersion} is available. You have ${currentVersion}.`,
  detail:
    "The update is downloaded now and installed when you close Solder.\n\n" +
    "The update replaces ovi.lib: any change you made to an OVI of ovi.lib will be lost.",
});

/** The message shown when the download has ended. */
export const updateReadyText = (newVersion) => ({
  title: "Update Ready",
  message: `Solder ${newVersion} has been downloaded.`,
  detail: "It will be installed when you close Solder.",
});

/**
 * Looks for an update once and, with the user's consent, downloads it to be installed
 * on closing. `updater` is electron-updater's autoUpdater (or a fake with the same
 * members); `ask(text)` shows the first message and gives one of `UPDATE_ANSWERS`;
 * `tell(text)` shows the second; `log(message)` records a failure. Returns one of
 * `UPDATE_OUTCOMES`.
 */
export async function checkForUpdatesAtStart(updater, { currentVersion, ask, tell, log }) {
  updater.autoDownload = false;
  updater.autoInstallOnAppQuit = true;
  try {
    const result = await updater.checkForUpdates();
    if (!result?.isUpdateAvailable) return UPDATE_OUTCOMES.upToDate;
    const newVersion = result.updateInfo.version;
    const answer = await ask(updateAvailableText(currentVersion, newVersion));
    if (answer !== UPDATE_ANSWERS.download) return UPDATE_OUTCOMES.declined;
    await updater.downloadUpdate();
    await tell(updateReadyText(newVersion));
    return UPDATE_OUTCOMES.downloaded;
  } catch (error) {
    log(`The update check failed: ${error.message}`);
    return UPDATE_OUTCOMES.failed;
  }
}

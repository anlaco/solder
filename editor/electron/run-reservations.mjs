// The subOVIs a running OVI reserves. LabVIEW puts a subVI whose caller runs into run mode: its windows refuse every
// edit, silently, until the caller stops (measured: labview-captures/reports/2026-11-19-subvi-checks-0.14-labview.md
// §1). A page that starts a Run says which OVIs its hierarchy calls; every page learns the keys reserved now and checks
// its own. The bookkeeping is pure (`createReservations`); `registerRunReservations` wires it to Electron.

/** Which OVIs each running page reserves, by the page's `webContents` id. */
export function createReservations() {
  const byPage = new Map();
  return {
    /** A page started (`keys`, the OVIs its Run calls) or stopped (`null`) a Run. */
    set(pageId, keys) {
      if (keys) byPage.set(pageId, new Set(keys));
      else byPage.delete(pageId);
    },
    /** Every OVI key reserved now, by any running page. */
    keys: () => [...new Set([...byPage.values()].flatMap((keys) => [...keys]))],
  };
}

/** Listens to the pages' Runs and tells every page the keys reserved, now and whenever they change. */
export function registerRunReservations({ ipcMain, webContents }) {
  const reservations = createReservations();
  const announce = () => {
    const keys = reservations.keys();
    for (const contents of webContents.getAllWebContents()) if (!contents.isDestroyed()) contents.send("ovi:reserved", keys);
  };
  const watched = new Set();
  ipcMain.on("ovi:run-state", (event, keys) => {
    const pageId = event.sender.id;
    reservations.set(pageId, keys);
    // A window closed mid-Run ends its Run with it.
    if (!watched.has(pageId)) {
      watched.add(pageId);
      event.sender.once("destroyed", () => {
        watched.delete(pageId);
        reservations.set(pageId, null);
        announce();
      });
    }
    announce();
  });
  ipcMain.handle("ovi:reserved-keys", () => reservations.keys());
}

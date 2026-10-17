// Captures every page that render.mjs wrote as a PNG next to it, in a window the size of the editor's captures.
//
//   DISPLAY=:99 GTK_USE_PORTAL=0 node_modules/electron/dist/electron --no-sandbox scripts/panel-pixels/capture.cjs <directory> [width height]
//
// A real Electron window on the virtual screen of the labview skill (Xvfb :99), so the pixels come from the same
// renderer as the editor's, at a device scale factor of 1.

const { app, BrowserWindow } = require("electron");
const { readdirSync, writeFileSync } = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const [directoryArgument, widthArgument = "1400", heightArgument = "900"] = process.argv
  .slice(1)
  .filter((argument) => !argument.startsWith("--") && path.resolve(argument) !== __filename);
const DIRECTORY = path.resolve(directoryArgument);
const [WIDTH, HEIGHT] = [Number(widthArgument), Number(heightArgument)];
/** Time for late layout (fonts) before the capture. */
const SETTLE_MILLISECONDS = 300;

app.disableHardwareAcceleration();
app.commandLine.appendSwitch("force-device-scale-factor", "1");

app.whenReady().then(async () => {
  const window = new BrowserWindow({ width: WIDTH, height: HEIGHT, useContentSize: true, show: true, webPreferences: { sandbox: true } });
  const pages = readdirSync(DIRECTORY).filter((name) => name.endsWith(".html"));
  for (const name of pages) {
    await window.loadURL(pathToFileURL(path.join(DIRECTORY, name)).href);
    await window.webContents.executeJavaScript("document.fonts.ready.then(() => true)");
    await new Promise((resolve) => setTimeout(resolve, SETTLE_MILLISECONDS));
    const image = await window.webContents.capturePage({ x: 0, y: 0, width: WIDTH, height: HEIGHT });
    writeFileSync(path.join(DIRECTORY, name.replace(/\.html$/, ".png")), image.toPNG());
  }
  console.log(`${pages.length} captures in ${DIRECTORY}`);
  app.quit();
}).catch((error) => {
  console.error(error);
  app.exit(1);
});

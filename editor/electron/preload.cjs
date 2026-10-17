// What the page can ask of the main process: saving and opening VIs with the
// system dialogs, telling it that the VI changed (for the asterisk in the title
// and rule 41), reading the files of a VI's subVIs and opening other VIs. The
// page never touches the disk: it only passes text.

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("solder", {
  /**
   * The VI these windows belong to: `{ id, text, key, name, untitledNumber, windowStyle }`; `text` is null for a new
   * VI, and `windowStyle` is the text of the `.css` next to its file, or "" (DT-058 §2).
   */
  iniciar: () => ipcRenderer.invoke("vi:init"),
  /** Saves the text of the VI; `como`, Save As. Returns `{ ruta, nombre, texto }` (the text as written), or nothing if cancelled. */
  guardar: (texto, como) => ipcRenderer.invoke("vi:guardar", texto, como),
  /** File ▸ Open: another VI, in its own windows. */
  abrir: () => ipcRenderer.invoke("vi:abrir"),
  /** Opens the windows of the VI at an absolute path (a subVI), or brings them forward if it is already open. */
  abrirRuta: (ruta) => ipcRenderer.invoke("vi:open-path", ruta),
  /** The file dialog of Select a VI...: the absolute path chosen, or nothing. */
  elegirVI: () => ipcRenderer.invoke("vi:choose-subvi"),
  /** The text of every VI reached from this one, by absolute path: `{ texts, missing }`. */
  textosDeSubVIs: (texto) => ipcRenderer.invoke("vi:subvi-texts", texto),
  /** The same for the VI at an absolute path, which is included. */
  textosDeVI: (ruta) => ipcRenderer.invoke("vi:subvi-texts-of", ruta),
  /** The VI has become this: the main process decides whether there are unsaved changes. */
  cambio: (texto) => ipcRenderer.send("vi:cambio", texto),
  /** A file that could not be opened, with the reason. */
  error: (mensaje) => ipcRenderer.send("vi:error", mensaje),
  /** A notice with its detail: why the VI cannot run, for example. */
  avisar: (mensaje, detalle) => ipcRenderer.send("vi:avisar", mensaje, detalle),
  /** Closes the windows of this VI without asking (it could not be read). */
  cerrar: () => ipcRenderer.send("vi:close"),
  /** File ▸ New VI: a blank VI in its own windows. */
  nuevoVI: () => ipcRenderer.send("vi:new"),
  /** File ▸ Close: the whole VI from its Front Panel, only the window from its Block Diagram. */
  cerrarVentana: () => ipcRenderer.send("vi:close-window"),
  /** File ▸ Close All. */
  cerrarTodos: () => ipcRenderer.send("vi:close-all"),
  /** File ▸ Exit. */
  salir: () => ipcRenderer.send("vi:salir"),
  /** Ctrl+E: brings forward the other window of this VI (Front Panel or Block Diagram). */
  alternarVentana: () => ipcRenderer.send("vi:toggle-window"),
  /** Ctrl+T, Window ▸ Tile Left and Right: the two windows of this VI side by side. */
  teselar: () => ipcRenderer.send("vi:tile"),
  /** What was copied in any VI, as text: one clipboard for all the open VIs (spec/05 rule 73). */
  portapapeles: {
    guardar: (texto) => ipcRenderer.send("clipboard:write", texto),
    leer: () => ipcRenderer.invoke("clipboard:read"),
    /** Something was copied or cut in some window: `callback(text)`. */
    alCambiar: (callback) => ipcRenderer.on("clipboard:changed", (_event, texto) => callback(texto)),
  },
  /** The Error list's Show Warnings: one setting for the session, shared by every VI. */
  listaDeErrores: {
    mostrarAvisos: () => ipcRenderer.invoke("error-list:show-warnings"),
    fijarMostrarAvisos: (on) => ipcRenderer.send("error-list:set-show-warnings", on),
    /** Some window changed it: `callback(on)`. */
    alCambiar: (callback) => ipcRenderer.on("error-list:show-warnings-changed", (_event, on) => callback(on)),
  },
  /** The Getting Started window (DT-052). */
  inicio: {
    /** What it remembers and Solder's version: `{ recentFiles, carouselPage, version }`. */
    iniciar: () => ipcRenderer.invoke("start:init"),
    /** Opens a file of the recent list. */
    abrirReciente: (ruta) => ipcRenderer.invoke("start:open-recent", ruta),
    /** View ▸ Getting Started Window...: shows it, from any VI. */
    mostrar: () => ipcRenderer.send("start:show"),
    /** The recent files or the carousel page changed: `callback(state)`. */
    alCambiar: (callback) => ipcRenderer.on("start:state", (_event, state) => callback(state)),
  },
  /** This VI's window style changed on disk, or the VI was saved next to another one: `callback(text)`. */
  alCambiarEstiloVentana: (callback) => ipcRenderer.on("vi:window-style", (_event, text) => callback(text)),
  /** Some VI was saved, at this absolute path: `callback({ id, key })`. The callers of a saved subVI must see its new connector. */
  alGuardar: (callback) => ipcRenderer.on("vi:saved", (_event, saved) => callback(saved)),
});

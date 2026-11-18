// What the page can ask of the main process: saving and opening OVIs with the
// system dialogs, telling it that the OVI changed (for the asterisk in the title
// and rule 41), reading the files of an OVI's subOVIs and opening other OVIs. The
// page never touches the disk: it only passes text.

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("solder", {
  /**
   * The OVI these windows belong to: `{ id, text, key, name, untitledNumber, windowStyle }`; `text` is null for a new
   * OVI, and `windowStyle` is the text of the `.css` next to its file, or "" (DT-058 §2).
   */
  iniciar: () => ipcRenderer.invoke("ovi:init"),
  /** Saves the text of the OVI; `como`, Save As. Returns `{ ruta, nombre, texto }` (the text as written), or nothing if cancelled. */
  guardar: (texto, como) => ipcRenderer.invoke("ovi:guardar", texto, como),
  /** File ▸ Open: another OVI, in its own windows. */
  abrir: () => ipcRenderer.invoke("ovi:abrir"),
  /** Opens the windows of the OVI at an absolute path (a subOVI), or brings them forward if it is already open. */
  abrirRuta: (ruta) => ipcRenderer.invoke("ovi:open-path", ruta),
  /** The file dialog of Select an OVI...: the absolute path chosen, or nothing. */
  elegirOVI: () => ipcRenderer.invoke("ovi:choose-subovi"),
  /** The file dialog of a File Path Control's browse button: the absolute path chosen, or nothing. */
  elegirRuta: () => ipcRenderer.invoke("path:choose"),
  /** The file dialog of the Call Library Function Node's browse button: the absolute path of the library chosen, or nothing. */
  elegirBiblioteca: () => ipcRenderer.invoke("library:choose"),
  /** A Run's file dialog `{ title, mode }` (DT-067, amendment of 2026-10-29): the system's name of the file chosen, or nothing. */
  chooseRunFile: (request) => ipcRenderer.invoke("run:choose-file", request),
  /** File Dialog's request (DT-069): `{ paths, exists }`, or nothing for Cancel. */
  fileDialogRun: (request) => ipcRenderer.invoke("run:file-dialog", request),
  /** A Run's confirmation `{ message, detail }`: whether OK was pressed. */
  confirmRun: (question) => ipcRenderer.invoke("run:confirm", question),
  /** The text of every OVI reached from this one, by absolute path: `{ texts, missing }`. */
  textosDeSubOVIs: (texto) => ipcRenderer.invoke("ovi:subovi-texts", texto),
  /** The same for the OVI at an absolute path, which is included. */
  textosDeOVI: (ruta) => ipcRenderer.invoke("ovi:subovi-texts-of", ruta),
  /** This window's canvas was scrolled to `{ x, y }`: saved with the OVI, without making it modified (DT-078). */
  scrolled: (origin) => ipcRenderer.send("ovi:scrolled", origin),
  /** The OVI has become this: the main process decides whether there are unsaved changes. */
  cambio: (texto) => ipcRenderer.send("ovi:cambio", texto),
  /** A file that could not be opened, with the reason. */
  error: (mensaje) => ipcRenderer.send("ovi:error", mensaje),
  /** A notice with its detail: why the OVI cannot run, for example. */
  avisar: (mensaje, detalle) => ipcRenderer.send("ovi:avisar", mensaje, detalle),
  /** Closes the windows of this OVI without asking (it could not be read). */
  cerrar: () => ipcRenderer.send("ovi:close"),
  /** File ▸ New OVI: a blank OVI in its own windows. */
  nuevoOVI: () => ipcRenderer.send("ovi:new"),
  /** File ▸ New...: the New dialog, over this window; its OK opens a blank OVI or a polymorphic OVI. */
  nuevo: () => ipcRenderer.send("ovi:new-dialog"),
  /** The New dialog's own buttons: OK with what was chosen, or Cancel. */
  dialogoNuevo: {
    aceptar: (creation) => ipcRenderer.send("new-dialog:accept", creation),
    cancelar: () => ipcRenderer.send("new-dialog:cancel"),
  },
  /** The Polymorphic OVI window's Add...: the file dialog "Select the OVI to Open"; the absolute path chosen, or nothing. */
  elegirInstancia: () => ipcRenderer.invoke("polymorphic:choose-instance"),
  /** Its Edit Icon...: the file dialog for an SVG icon; the text of the file, or nothing (a Solder deviation: LabVIEW opens its Icon Editor). */
  elegirIcono: () => ipcRenderer.invoke("polymorphic:choose-icon"),
  /** File ▸ Close: the whole OVI from its Front Panel, only the window from its Block Diagram. */
  cerrarVentana: () => ipcRenderer.send("ovi:close-window"),
  /** File ▸ Close All. */
  cerrarTodos: () => ipcRenderer.send("ovi:close-all"),
  /** File ▸ Exit. */
  salir: () => ipcRenderer.send("ovi:salir"),
  /** Ctrl+E: brings forward the other window of this OVI (Front Panel or Block Diagram). */
  alternarVentana: () => ipcRenderer.send("ovi:toggle-window"),
  /** Ctrl+T, Window ▸ Tile Left and Right: the two windows of this OVI side by side. */
  teselar: () => ipcRenderer.send("ovi:tile"),
  /** What was copied in any OVI, as text: one clipboard for all the open OVIs (spec/05 rule 73). */
  portapapeles: {
    guardar: (texto) => ipcRenderer.send("clipboard:write", texto),
    leer: () => ipcRenderer.invoke("clipboard:read"),
    /** Something was copied or cut in some window: `callback(text)`. */
    alCambiar: (callback) => ipcRenderer.on("clipboard:changed", (_event, texto) => callback(texto)),
  },
  /** The Error list's Show Warnings: one setting for the session, shared by every OVI. */
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
    /** View ▸ Getting Started Window...: shows it, from any OVI. */
    mostrar: () => ipcRenderer.send("start:show"),
    /** The recent files or the carousel page changed: `callback(state)`. */
    alCambiar: (callback) => ipcRenderer.on("start:state", (_event, state) => callback(state)),
  },
  /** This OVI's window style changed on disk, or the OVI was saved next to another one: `callback(text)`. */
  alCambiarEstiloVentana: (callback) => ipcRenderer.on("ovi:window-style", (_event, text) => callback(text)),
  /**
   * Solder's VISA for a Run (DT-065 §3). A port cannot cross the context bridge, so it reaches the page as a
   * window message `{ solderIoPort: true }` with the port in its `ports`.
   */
  io: {
    /** Asks for a port to the instrument I/O process. */
    conectar: () => ipcRenderer.send("io:connect"),
    /** The I/O process ended: `callback()`. A Run waiting for an instrument must fail. */
    alTerminar: (callback) => ipcRenderer.on("io:exited", () => callback()),
  },
  /** The Project Explorer window (DT-099). */
  project: {
    /** The project this window shows: `{ name, text }`; `text` is the `.sdproj`'s text, or null for a blank project. */
    start: () => ipcRenderer.invoke("project:init"),
    /** File ▸ Close: closes this window. */
    close: () => ipcRenderer.send("project:close"),
    /** The project could not be read: the main process says why and closes the window. */
    error: (message) => ipcRenderer.send("project:error", message),
  },
  /** Some OVI was saved, at this absolute path: `callback({ id, key })`. The callers of a saved subOVI must see its new connector. */
  alGuardar: (callback) => ipcRenderer.on("ovi:saved", (_event, saved) => callback(saved)),
});

ipcRenderer.on("io:port", (event) => window.postMessage({ solderIoPort: true }, "*", event.ports));

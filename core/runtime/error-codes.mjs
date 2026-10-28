// Los textos de los errores (DT-043 §5).
//
// Los códigos son los de LabVIEW (son datos: 7 es «fichero no encontrado»); los
// textos los hemos redactado nosotros. Los de LabVIEW son ficheros de NI y no se
// copian ni se parafrasean de cerca. La estructura sí se calca (medida en 2026 Q3,
// docs/reference/labview-errors.md §4 y §6): una primera línea «Error N occurred
// at <origen>» (o «Warning N …» con status FALSE, y «an unidentified location»
// sin origen), «Possible reason(s):» y, por cada razón, «LabVIEW: (Hex 0x…) texto»;
// varias razones se separan con una línea de «=». Un código sin definir no lleva
// «Possible reason(s)»: lleva un párrafo que lo dice.
//
// Módulo puro: sin DOM. Lo usan el núcleo (Simple Error Handler) y el editor
// (los dos diálogos y Explain Error).

/** Las razones de cada código, en el orden en que se enseñan. */
export const CODIGOS = {
  1: ["One of the inputs given to the function is not acceptable, for instance a file path that holds characters the operating system forbids."],
  2: ["There was not enough free memory to finish the operation.", "The operating system could not find the file it was asked for."],
  // File I/O (DT-067).
  4: ["The end of the file came before everything that was asked for could be read; what was read is still given."],
  5: ["The file is open, and the operation needs it closed: close it first."],
  6: ["The file operation failed for a reason the operating system gave and that has no more specific code."],
  7: ["The file does not exist where it was looked for: it may have been moved, renamed or deleted. Check the path."],
  8: ["The file exists but this user is not allowed to do that with it: check its permissions.", "The file was opened with an access mode that does not allow this, for instance a write on a file opened read-only."],
  10: ["A file with that name already exists, and the operation asked for one that did not."],
  42: ["An error happened that has no more specific code."],
  43: ["The person using the program cancelled the operation."],
  56: ["The network operation took longer than the time allowed for it, either by the program or by the system."],
  63: ["The serial port filled its receive buffer before the data were read.", "The server refused the network connection."],
  66: ["The other end closed the network connection."],
  // Format Into String and Scan From String (spec/04 Rule 21j).
  81: ["A format specifier does not suit the type of the value it was given, for instance %d for a string."],
  82: ["The format string holds a specifier that is not recognized."],
  83: ["The function has more inputs or outputs than the format string has specifiers for."],
  84: ["The format string has more specifiers than the function has inputs or outputs."],
  85: ["The text could not be read with the format string: it does not hold the kind of data the format asks for at that point."],
  // File I/O (DT-067).
  1059: ["The path names a folder, and the operation needs a file."],
  1430: ["The path is empty, relative or not a path, and the operation needs an absolute path to a file or folder."],
};

const SEPARADOR = "=".repeat(26);

/** El código en hexadecimal, en mayúsculas y sin ceros a la izquierda: 5000 es «0x1388». */
export const hex = (code) => `0x${(code >>> 0).toString(16).toUpperCase()}`;

/** El origen y el detalle de un `source`: lo que va antes y después de «<APPEND>». */
export function partirSource(source = "") {
  const i = source.indexOf("<APPEND>");
  if (i < 0) return { origen: source, detalle: "" };
  return { origen: source.slice(0, i), detalle: source.slice(i + "<APPEND>".length).replace(/^\r?\n/, "") };
}

/** La primera línea: «Error 7 occurred at …», «Warning 7 occurred at …». */
export function cabecera({ status, code, source }) {
  const { origen } = partirSource(source);
  return `${status ? "Error" : "Warning"} ${code} occurred at ${origen || "an unidentified location"}`;
}

/** Las razones de un código, ya con su prefijo, o `null` si no está definido. */
export function razones(code) {
  const r = CODIGOS[code];
  return r ? r.map((t) => `LabVIEW: (Hex ${hex(code)}) ${t}`) : null;
}

/** El párrafo de un código que no está en la tabla (8 dígitos en el hexadecimal, como en LabVIEW). */
const indefinido = (code) =>
  `This error code has no description. That happens when nobody wrote one for it, or when a number that is not an error code was wired to an error code input. It can also be a code from something outside the program, such as the operating system or a third-party component: searching the Web for the number (${code}) or its hexadecimal form (0x${(code >>> 0).toString(16).toUpperCase().padStart(8, "0")}) may help.`;

/**
 * La explicación de un error, por partes, para pintarla: la cabecera, el
 * «Possible reason(s):» si el código está definido, sus razones y el detalle del
 * source. `texto` es todo junto, con líneas en blanco entre partes.
 */
export function explicar(err) {
  const r = razones(err.code);
  const { detalle } = partirSource(err.source);
  const partes = { cabecera: cabecera(err), titulo: r ? "Possible reason(s):" : null, razones: r ?? [indefinido(err.code)], detalle };
  const cuerpo = r ? r.join(`\n${SEPARADOR}\n`) : partes.razones[0];
  partes.texto = [partes.cabecera, partes.titulo, cuerpo, detalle].filter(Boolean).join("\n\n");
  return partes;
}

/** El `message` de Simple Error Handler: «No Error» sin error, y si no, la explicación. */
export function mensaje(err) {
  if (!err.status && !err.code) return "No Error";
  return explicar(err).texto;
}

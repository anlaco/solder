// The LabVIEW inventory (DT-035): what the reference's interface shows and
// where Solder stands on each thing.
//
// The editor takes each element's verdict from here instead of deciding it in
// its own code (spec/05-editor.md, rule 55). A pure module, with no DOM, so the
// window and the tests use it alike.

export const VEREDICTOS = ["built", "todo", "elsewhere", "never"];

const VERDICT_NAMES = { built: "done", todo: "not yet", elsewhere: "done another way", never: "will not be done" };

/** Everything that is not `built` is a hole: it is shown, but does nothing. */
export const esHueco = (entrada) => entrada.estado !== "built";

export const nombreVeredicto = (estado) => VERDICT_NAMES[estado];

export const ultimo = (id) => id.slice(id.lastIndexOf(".") + 1);

/** "Reading a VI" → "reading a VI", to follow "Missing:". */
const lowerFirst = (text) => (text ? text[0].toLowerCase() + text.slice(1) : text);

export function cargarInventario(datos) {
  const porId = new Map(datos.entradas.map((e) => [e.id, e]));

  /** La entrada declarada con ese id exacto. */
  const entrada = (id) => porId.get(id);

  /**
   * La entrada que decide la situación de `id`: la más específica que lo
   * contiene (DT-035 §5). Una entrada `built` sólo se cubre a sí misma: lo
   * hecho se declara uno a uno.
   */
  function resolver(id) {
    for (let prefijo = id; ; ) {
      const e = porId.get(prefijo);
      if (e && (prefijo === id || e.estado !== "built")) return e;
      const punto = prefijo.lastIndexOf(".");
      if (punto < 0) return undefined;
      prefijo = prefijo.slice(0, punto);
    }
  }

  /** Los hijos directos de `padre`, en el orden del fichero, que es el de LabVIEW. */
  function hijos(padre) {
    const prefijo = `${padre}.`;
    return datos.entradas.filter((e) => e.id.startsWith(prefijo) && !e.id.slice(prefijo.length).includes("."));
  }

  /** Un contenedor se abre sólo si su contenido está declarado (regla 53b). */
  const tieneContenido = (id) => hijos(id).length > 0;

  /** What the explanation of a hole must say (rule 54). */
  function explicacion(e) {
    let solder;
    if (e.estado === "todo") {
      const unlock = datos.desbloqueos[e.necesita];
      solder = !unlock
        ? `Missing: ${e.necesita}.`
        : unlock.ref
          ? `Missing: ${lowerFirst(unlock.desc)}. Where: ${unlock.ref}.`
          : `Missing: ${lowerFirst(unlock.desc)}. Not specified yet.`;
    } else if (e.estado === "elsewhere") solder = e.solder ?? "";
    else if (e.estado === "never") solder = e.porque ?? "";
    else solder = "Done.";
    return { labview: e.labview ?? null, solder };
  }

  return {
    datos,
    referencia: datos.referencia,
    entradas: datos.entradas,
    desbloqueos: datos.desbloqueos,
    entrada,
    resolver,
    hijos,
    tieneContenido,
    explicacion,
  };
}

/**
 * Traduce un atajo del inventario, como «Ctrl+Shift+E». Ctrl es Cmd en macOS,
 * igual que en LabVIEW.
 */
export function atajo(texto) {
  const partes = texto.split("+").map((p) => p.trim());
  const tecla = partes.pop();
  if (!tecla || partes.some((p) => !["Ctrl", "Shift", "Alt"].includes(p))) return null;
  return { ctrl: partes.includes("Ctrl"), shift: partes.includes("Shift"), alt: partes.includes("Alt"), tecla: tecla.toUpperCase() };
}

/** ¿Encaja la pulsación con el atajo? */
export function pulsa(atajoLeido, { ctrl, shift, alt, tecla }) {
  return (
    !!atajoLeido &&
    atajoLeido.ctrl === ctrl &&
    atajoLeido.shift === shift &&
    atajoLeido.alt === alt &&
    atajoLeido.tecla === tecla.toUpperCase()
  );
}

// El worker donde corre un VI (DT-039, decisión 3; DT-040): fuera del hilo de
// la página, para que la interfaz no se congele mientras el VI trabaja.
//
// Recibe:
//   { orden: "run", compilado, valores, separador }  el módulo, el valor de los controles y el separador decimal del sistema
//   { orden: "control", nodo, valor }      un control cambiado mientras corre
//   { orden: "abort" }                     Abort
//   { orden: "respuesta", id, valor }      lo que contestó el usuario a un diálogo: «continuar» o «parar»
//                                          en el del manejo automático de errores, o nada en el de Simple Error Handler
// Manda:
//   { escritos: { nodo: valor } }           lo que llega a los indicadores, en vivo
//   { soltar: nodo }                         un Latch leído, que vuelve a FALSE
//   { dialogo: { id, pregunta, status, code, source } }   un diálogo de error que espera respuesta (DT-043):
//                                          «error-automatico» (Continue o Stop) o «dialogo-error» (OK)
//   { fin: true, error?, abortado? }         el VI ha acabado
//
// Las escrituras se juntan y salen cuando el VI cede (una espera) o acaba: un
// bucle que escribe miles de veces por segundo no inunda la página, y el panel
// enseña el último valor, como LabVIEW.

import { ejecutar } from "../../../core/runtime/runtime.mjs";

let valores = null;
let parar = null;
let pendientes = {};
let programado = false;
/** Los diálogos que esperan al usuario: su id y cómo seguir. */
const respuestas = new Map();
let siguiente = 0;

/** Saca un diálogo en la página y espera lo que conteste; antes, lo escrito hasta ahora, para que el panel lo enseñe. */
function preguntar(pregunta, error) {
  vaciar();
  return new Promise((ok) => {
    const id = ++siguiente;
    respuestas.set(id, ok);
    postMessage({ dialogo: { id, pregunta, status: error.status, code: error.code, source: error.source } });
  });
}

function vaciar() {
  programado = false;
  if (!Object.keys(pendientes).length) return;
  postMessage({ escritos: pendientes });
  pendientes = {};
}

onmessage = async ({ data }) => {
  if (data.orden === "control") {
    if (valores) valores[data.nodo] = data.valor;
    return;
  }
  if (data.orden === "respuesta") {
    respuestas.get(data.id)?.(data.valor);
    return respuestas.delete(data.id);
  }
  if (data.orden === "abort") {
    parar?.abort();
    // Un diálogo abierto no puede dejar el VI esperando: Abort lo contesta.
    for (const ok of respuestas.values()) ok("parar");
    return respuestas.clear();
  }
  if (data.orden !== "run") return;
  valores = { ...data.valores };
  parar = new AbortController();
  const opciones = {
    senal: parar.signal,
    separador: data.separador,
    alErrorAutomatico: (e) => preguntar("error-automatico", e),
    alDialogoError: (e) => preguntar("dialogo-error", e),
    alEscribir: (nodo, v) => {
      pendientes[nodo] = v;
      if (!programado) {
        programado = true;
        setTimeout(vaciar);
      }
    },
    alSoltar: (nodo) => postMessage({ soltar: nodo }),
  };
  try {
    await ejecutar(data.compilado, valores, opciones);
    vaciar();
    postMessage({ fin: true });
  } catch (e) {
    vaciar();
    postMessage(e.abortado ? { fin: true, abortado: true } : { fin: true, error: e.message });
  } finally {
    valores = null;
    parar = null;
  }
};

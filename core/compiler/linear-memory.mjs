// La memoria de un VI compilado, como la de LabVIEW (DT-042): un data space de
// handles y un montón sin recolector.
//
// Mapa de la memoria lineal:
//   0                el handle nulo: un array o una cadena vacíos
//   CIMA (4)         dónde acaba el montón (I32)
//   LISTAS (8)       la cabeza de la lista libre de cada clase de tamaño (32 × I32)
//   CELDAS (136)     el data space: una celda (I32) por cada búfer de un nodo; la
//                    celda es el *handle* y guarda la dirección del bloque
//   …                las constantes (zona estática, que no se escribe nunca)
//   …                el montón
// Un bloque del montón lleva delante 4 bytes con su clase c: caben 2^c bytes.
// Una cadena es un bloque [longitud I32][bytes]; un array de una dimensión,
// [tamaño I32][4 de relleno][datos], para que un DBL quede alineado a 8.
//
// Las funciones de aquí se emiten en cada módulo, antes que las del VI.

export const CIMA = 4;
export const LISTAS = 8;
export const CELDAS = LISTAS + 32 * 4;

const ins = (op, arg) => (arg === undefined ? { op } : { op, arg });
const get = (l) => ins("local.get", l);
const set = (l) => ins("local.set", l);
const tee = (l) => ins("local.tee", l);
const k = (n) => ins("i32.const", n);

/**
 * Las funciones de la memoria, en el orden en que van en el módulo. `llamar(n)`
 * da el índice de la función interna `n`. Cada una: { nombre, params, results,
 * locales, cuerpo }.
 */
export function funcionesMemoria(llamar) {
  // asignar(tam) → dirección de un bloque donde caben `tam` bytes.
  const asignar = {
    nombre: "asignar",
    params: ["i32"],
    results: ["i32"],
    locales: ["i32", "i32", "i32"], // 1 clase, 2 dirección, 3 páginas que faltan
    cuerpo: [
      // clase = max(4, 32 − clz(tam − 1))
      k(32), get(0), k(1), ins("i32.sub"), ins("i32.clz"), ins("i32.sub"), tee(1), k(4), get(1), k(4), ins("i32.gt_u"), ins("select"), set(1),
      // ¿hay uno libre de esa clase?
      get(1), k(2), ins("i32.shl"), ins("i32.load", LISTAS), tee(2),
      ins("if"),
      get(1), k(2), ins("i32.shl"), get(2), ins("i32.load"), ins("i32.store", LISTAS),
      get(2), ins("return"),
      ins("end"),
      // Si no, del final del montón: cabecera y 2^clase bytes.
      k(0), ins("i32.load", CIMA), k(4), ins("i32.add"), set(2),
      k(0), get(2), k(1), get(1), ins("i32.shl"), ins("i32.add"), ins("i32.store", CIMA),
      // Que quepa en la memoria: crecer las páginas que falten.
      k(0), ins("i32.load", CIMA), ins("memory.size"), k(16), ins("i32.shl"), ins("i32.sub"), tee(3), k(0), ins("i32.gt_s"),
      ins("if"),
      get(3), k(65535), ins("i32.add"), k(16), ins("i32.shr_u"), ins("memory.grow"), ins("drop"),
      ins("end"),
      get(2), k(4), ins("i32.sub"), get(1), ins("i32.store"),
      get(2),
    ],
  };
  // liberar(dirección): el bloque vuelve a la lista de su clase.
  const liberar = {
    nombre: "liberar",
    params: ["i32"],
    results: [],
    locales: ["i32"],
    cuerpo: [
      get(0), ins("i32.eqz"), ins("if"), ins("return"), ins("end"),
      get(0), k(4), ins("i32.sub"), ins("i32.load"), k(2), ins("i32.shl"), set(1),
      get(0), get(1), ins("i32.load", LISTAS), ins("i32.store"),
      get(1), get(0), ins("i32.store", LISTAS),
    ],
  };
  // redimensionar(celda, tam) → dirección: el bloque de la celda, con sitio para
  // `tam` bytes. Crece en su sitio mientras cabe; si no, se mueve (y se copia lo
  // que tenía) y el viejo se libera. La celda queda apuntando al bloque.
  const redimensionar = {
    nombre: "redimensionar",
    params: ["i32", "i32"],
    results: ["i32"],
    locales: ["i32", "i32", "i32"], // 2 bloque viejo, 3 nuevo, 4 capacidad vieja
    cuerpo: [
      get(0), ins("i32.load"), tee(2),
      ins("if"),
      k(1), get(2), k(4), ins("i32.sub"), ins("i32.load"), ins("i32.shl"), tee(4), get(1), ins("i32.ge_u"),
      ins("if"), get(2), ins("return"), ins("end"),
      ins("end"),
      get(1), ins("call", llamar("asignar")), set(3),
      get(2),
      ins("if"),
      get(3), get(2), get(4), get(1), get(4), get(1), ins("i32.lt_u"), ins("select"), ins("memory.copy"),
      get(2), ins("call", llamar("liberar")),
      ins("end"),
      get(0), get(3), ins("i32.store"),
      get(3),
    ],
  };
  // longitud(handle) → los bytes de una cadena (o el tamaño de un array); 0 si está vacía.
  const longitud = {
    nombre: "longitud",
    params: ["i32"],
    results: ["i32"],
    locales: ["i32"],
    cuerpo: [get(0), ins("i32.load"), tee(1), ins("if"), get(1), ins("i32.load"), ins("return"), ins("end"), k(0)],
  };
  // datos(handle) → dónde empiezan los bytes (detrás de la longitud); 0 si está vacía.
  const datos = {
    nombre: "datos",
    params: ["i32"],
    results: ["i32"],
    locales: ["i32"],
    cuerpo: [get(0), ins("i32.load"), tee(1), ins("if"), get(1), k(4), ins("i32.add"), ins("return"), ins("end"), k(0)],
  };
  // copiar(origen, celda): la cadena o el array del handle `origen`, copiado al
  // bloque de `celda` (que crece si hace falta). Es lo que hace un shift register
  // con su valor: guardarse el suyo.
  const copiar = {
    nombre: "copiar",
    params: ["i32", "i32"],
    results: [],
    locales: ["i32", "i32"], // 2 longitud, 3 bloque destino
    cuerpo: [
      get(0), get(1), ins("i32.eq"), ins("if"), ins("return"), ins("end"),
      get(0), ins("call", llamar("longitud")), set(2),
      get(1), get(2), k(4), ins("i32.add"), ins("call", llamar("redimensionar")), tee(3), get(2), ins("i32.store"),
      get(3), k(4), ins("i32.add"), get(0), ins("call", llamar("datos")), get(2), ins("memory.copy"),
    ],
  };
  // datos8(handle) → dónde empiezan los elementos de un array; 0 si está vacío.
  const datos8 = {
    nombre: "datos8",
    params: ["i32"],
    results: ["i32"],
    locales: ["i32"],
    cuerpo: [get(0), ins("i32.load"), tee(1), ins("if"), get(1), k(8), ins("i32.add"), ins("return"), ins("end"), k(0)],
  };
  // nuevo_array(celda, n, tam, ref) → dónde empiezan sus elementos: el bloque de
  // la celda, con sitio para n elementos de `tam` bytes y n escrito. Con `ref`
  // (elementos que son celdas: cadenas, clusters), lo nuevo se pone a cero, para
  // que no herede basura de un bloque reutilizado.
  const nuevoArray = {
    nombre: "nuevo_array",
    params: ["i32", "i32", "i32", "i32"],
    results: ["i32"],
    locales: ["i32", "i32"], // 4 n de antes, 5 bloque
    cuerpo: [
      get(0), ins("call", llamar("longitud")), set(4),
      get(0), k(8), get(1), get(2), ins("i32.mul"), ins("i32.add"), ins("call", llamar("redimensionar")), tee(5), get(1), ins("i32.store"),
      get(3), get(1), get(4), ins("i32.gt_s"), ins("i32.and"),
      ins("if"),
      get(5), k(8), ins("i32.add"), get(4), get(2), ins("i32.mul"), ins("i32.add"), k(0), get(1), get(4), ins("i32.sub"), get(2), ins("i32.mul"), ins("memory.fill"),
      ins("end"),
      get(5), k(8), ins("i32.add"),
    ],
  };
  return [asignar, liberar, redimensionar, longitud, datos, copiar, datos8, nuevoArray];
}

/** Los nombres de las funciones de la memoria que se exportan, para que el anfitrión escriba en el data space. */
export const EXPORTADAS = ["redimensionar", "nuevo_array"];

/**
 * Los bytes de una cadena en un bloque de la zona estática: [longitud][bytes],
 * alineado a 4. Devuelve el bloque y su tamaño.
 */
export function bloqueCadena(texto) {
  const b = typeof texto === "string" ? new TextEncoder().encode(texto) : texto;
  const r = new Uint8Array(4 + b.length);
  new DataView(r.buffer).setInt32(0, b.length, true);
  r.set(b, 4);
  return r;
}

/** Un I32 en 4 bytes, para los datos de la memoria. */
export function i32(n) {
  const r = new Uint8Array(4);
  new DataView(r.buffer).setInt32(0, n, true);
  return r;
}

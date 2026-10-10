// Running a compiled VI (core/compiler/compiler.mjs): instantiating its
// WebAssembly module and running its clumps by dataflow (DT-040).
//
// This is the module's host: it hands over control values when the module reads
// them and collects indicator values when it writes them, at that moment. It
// also provides time: the millisecond clock and waits, which suspend the calling
// clump (JSPI) and let the others run. It provides nothing else: a VI has no
// gates other than what is imported into it (DT-039, decision 4). The editor's
// worker and the command line, in Node, use it the same way.

import { NUMERICOS, flattenArrayValue, nestArrayValue, representacion } from "../model/types.mjs";
import { FUNCIONES } from "../compiler/expression-parser.mjs";
import { tipoWasm } from "../compiler/compiler.mjs";
import { mensaje as mensajeDeError } from "./error-codes.mjs";
import { aEntero64, cientifica, fraccionaria, noFinito, rellenar, separar } from "./number-text.mjs";
import { formatIntoString, scanFromString } from "./format-string.mjs";

/** The size of one row record of Format Into String and Scan From String in memory (the compiler's FORMAT_ROW_BYTES). */
const FORMAT_ROW_BYTES = 16;
// Strings travel as "binary strings" (one character per byte, see CADENAS); the
// format engine works on text, so UTF-8 is decoded on the way in and encoded out.
const decodificar = (binaria) => new TextDecoder().decode(Uint8Array.from(binaria, (c) => c.charCodeAt(0)));
const codificar = (texto) => aBinario(new TextEncoder().encode(texto));


// ——— Funciones de cadena que dependen del formato de LabVIEW (DT-042 b) ———
//
// Una cadena de LabVIEW son bytes, así que aquí van como «cadenas binarias»: un
// carácter de JavaScript por byte. Todo lo de abajo está medido en LabVIEW 2026
// Q3 (labview-captures/string/prueba-*.png) salvo lo que dice «sin comprobar».

const aBinario = (u8) => {
  let r = "";
  for (let i = 0; i < u8.length; i += 8192) r += String.fromCharCode.apply(null, u8.subarray(i, i + 8192));
  return r;
};
const aBytes = (b) => Uint8Array.from(b, (c) => c.charCodeAt(0));

export const CADENAS = {
  /** String Subset. */
  sub: (s, off, len) => (off < 0 && (off = 0), off >= s.length || len < 0 ? "" : s.substr(off, len)),
  mayus: (s) => s.replace(/[a-z]/g, (c) => c.toUpperCase()),
  minus: (s) => s.replace(/[A-Z]/g, (c) => c.toLowerCase()),
  invertir: (s) => [...s].reverse().join(""),
  rotar: (s) => s.slice(1) + s.slice(0, 1),
  /** Trim Whitespace.vi: location 0 = ambos extremos, 1 = el principio, 2 = el final (sin comprobar el orden). */
  recortar(s, loc) {
    let r = s;
    if (loc !== 2) r = r.replace(/^[ \t\r\n]+/, "");
    if (loc !== 1) r = r.replace(/[ \t\r\n]+$/, "");
    return r;
  },
  /** Replace Substring: [result string, replaced substring]. */
  reemplazar(s, sub, off, len) {
    if (off < 0 || off > s.length) return [s, ""];
    const l = Math.max(0, Math.min(len, s.length - off));
    return [s.slice(0, off) + sub + s.slice(off + l), s.substr(off, l)];
  },
  /** Search and Replace String: { resultado, n, pasado }. */
  buscar(s, buscar, reemp, off, ignorar, todos) {
    const o = Math.min(Math.max(off, 0), s.length);
    const pajar = ignorar ? CADENAS.mayus(s) : s;
    const aguja = ignorar ? CADENAS.mayus(buscar) : buscar;
    let r = s.slice(0, o);
    let i = o;
    let n = 0;
    let pasado = -1;
    while (i <= s.length) {
      const j = pajar.indexOf(aguja, i);
      if (j < 0) break;
      r += s.slice(i, j) + reemp;
      n++;
      pasado = r.length;
      i = j + aguja.length;
      if (!aguja.length) {
        // Una cadena vacía coincide en cada posición: se pasa el byte siguiente.
        if (j < s.length) r += s[j];
        i = j + 1;
      }
      if (!todos) break;
    }
    return { resultado: r + s.slice(Math.min(i, s.length)), n, pasado };
  },
  /** Comparar cadenas: byte a byte; si una es el principio de la otra, la corta es la menor. */
  cmp: (a, b) => (a < b ? -1 : a > b ? 1 : 0),
  /** The same, ignoring ASCII case (Case Insensitive Match; non-ASCII letters unverified). */
  cmpCaseInsensitive: (a, b) => CADENAS.cmp(CADENAS.minus(a), CADENAS.minus(b)),
  dec: (x, w) => rellenar(aEntero64(x).toString(), w),
  hex: (x, w, bits) => rellenar(BigInt.asUintN(bits, aEntero64(x)).toString(16).toUpperCase(), w, "0"),
  oct: (x, w, bits) => rellenar(BigInt.asUintN(bits, aEntero64(x)).toString(8), w, "0"),
  frac: (x, w, p, sep) => rellenar(Number.isFinite(x) ? separar(fraccionaria(x, Math.max(0, p)), sep) : noFinito(x), w),
  exp: (x, w, p, sep) => rellenar(Number.isFinite(x) ? separar(cientifica(x, Math.max(0, p), false), sep) : noFinito(x), w),
  eng: (x, w, p, sep) => rellenar(Number.isFinite(x) ? separar(cientifica(x, Math.max(0, p), true), sep) : noFinito(x), w),
  /** Leer un número desde `off`: { valor, pasado }; valor NaN si no hay ninguno. */
  leer(s, off, patron) {
    const m = patron.exec(s.slice(Math.max(0, off)));
    return m ? { texto: m[1], pasado: Math.max(0, off) + m[0].length } : { texto: null, pasado: Math.max(0, off) };
  },
  leerDec(s, off) {
    const r = CADENAS.leer(s, off, /^[ \t\r\n]*([+-]?\d+)/);
    return { valor: r.texto === null ? NaN : Number(r.texto), pasado: r.pasado };
  },
  leerHex(s, off) {
    const r = CADENAS.leer(s, off, /^[ \t\r\n]*([0-9A-Fa-f]+)/);
    return { valor: r.texto === null ? NaN : parseInt(r.texto, 16), pasado: r.pasado };
  },
  leerOct(s, off) {
    const r = CADENAS.leer(s, off, /^[ \t\r\n]*([0-7]+)/);
    return { valor: r.texto === null ? NaN : parseInt(r.texto, 8), pasado: r.pasado };
  },
  leerFrac(s, off) {
    const r = CADENAS.leer(s, off, /^[ \t\r\n]*([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?|[+-]?inf)/i);
    return { valor: r.texto === null ? NaN : /inf/i.test(r.texto) ? (r.texto[0] === "-" ? -Infinity : Infinity) : Number(r.texto), pasado: r.pasado };
  },
};

/** El valor de un control, en la forma que espera el módulo. */
function aWasm(v, tipo) {
  if (tipo === "boolean") return v ? 1 : 0;
  const vt = tipoWasm(tipo);
  if (vt === "i64") return BigInt(Math.round(Number(v ?? 0)));
  if (vt === "i32") return Math.round(Number(v ?? 0)) | 0;
  return Number(v ?? 0);
}

/** Lo que escribe el módulo en un indicador, como número de JavaScript o booleano. */
function deWasm(v, tipo) {
  if (tipo === "boolean") return v !== 0;
  const r = representacion(tipo);
  if (typeof v === "bigint") return Number(r === "u64" ? BigInt.asUintN(64, v) : v);
  if (r === "u32") return v >>> 0;
  return NUMERICOS[r]?.entero ? v | 0 : v;
}

/** Las funciones del Expression Node que el compilador importa. */
const funcionesMath = Object.fromEntries(
  Object.entries(FUNCIONES)
    .filter(([, f]) => f.js)
    .map(([n, f]) => [`fn_${n}`, f.js]),
);

/** ¿Trae este motor JSPI, para suspender un clump mientras espera? */
export const conJSPI = typeof WebAssembly.Suspending === "function" && typeof WebAssembly.promising === "function";

/** El error con que acaba un VI abortado: no es un fallo del VI. */
export const abortado = () => Object.assign(new Error("El VI se abortó."), { abortado: true });

/** El reloj de milisegundos de LabVIEW: un U32 que da la vuelta, con el cero sin definir. */
const reloj = () => Math.floor(performance.now()) >>> 0;

/**
 * Corre los clumps por flujo de datos: cada uno en cuanto han acabado todos de
 * los que depende, y a la vez los que no dependen entre sí. `correr(i)` lanza
 * el clump i y devuelve una promesa si tarda. Acaba cuando acaban todos; el
 * primer error (o el Abort) lo para todo.
 */
export function planificar(clumps, correr, senal) {
  return new Promise((ok, mal) => {
    const faltan = clumps.map((k) => k.deps.length);
    const siguen = clumps.map(() => []);
    clumps.forEach((k, i) => k.deps.forEach((d) => siguen[d].push(i)));
    let hechos = 0;
    let roto = false;
    const fallo = (e) => {
      if (!roto) {
        roto = true;
        mal(e);
      }
    };
    const acabar = (i) => {
      if (roto) return;
      hechos++;
      for (const s of siguen[i]) if (--faltan[s] === 0) lanzar(s);
      if (hechos === clumps.length) ok();
    };
    const lanzar = (i) => {
      if (roto) return;
      if (senal?.aborted) return fallo(abortado());
      let r;
      try {
        r = correr(i);
      } catch (e) {
        return fallo(e);
      }
      if (r && typeof r.then === "function") r.then(() => acabar(i), fallo);
      else acabar(i);
    };
    if (!clumps.length) return ok();
    senal?.addEventListener("abort", () => fallo(abortado()), { once: true });
    clumps.forEach((k, i) => {
      if (!k.deps.length) lanzar(i);
    });
  });
}

/**
 * What a VI and its subVIs keep from one Run to the next while they stay loaded
 * (DT-045, measured in LabVIEW 2026 Q3: a functional global counts 1, 2 in one
 * Run and 3, 4 in the next). The whole memory —data spaces, uninitialized shift
 * registers, buffers— is kept and put back into the next instance of the same
 * module; another module (the VI was edited and recompiled) starts afresh.
 * `estado` is an object the caller keeps between Runs.
 */
function restoreState(estado, bytes, memory) {
  if (!estado?.memory || !sameBytes(estado.bytes, bytes)) return;
  const missingPages = (estado.memory.byteLength - memory.buffer.byteLength) / PAGE_BYTES;
  if (missingPages > 0) memory.grow(missingPages);
  new Uint8Array(memory.buffer).set(estado.memory);
}

function saveState(estado, bytes, memory) {
  if (!estado || !memory) return;
  estado.bytes = bytes;
  estado.memory = new Uint8Array(memory.buffer).slice();
}

const PAGE_BYTES = 65536;

/** Is it the same module? The editor recompiles on every Run, so it is compared by content. */
const sameBytes = (a, b) => !!a && a.length === b.length && a.every((byte, i) => byte === b[i]);

/**
 * Ejecuta el VI compilado. `valores` da el valor de cada control por su id de
 * nodo, y se lee cada vez que el diagrama lee el control: quien llama puede
 * cambiarlo mientras el VI corre. Devuelve el valor de cada indicador escrito,
 * por id. `opciones`:
 * - `alEscribir(nodo, valor)`: cada escritura en un indicador, en el momento.
 * - `alSoltar(nodo)`: un control Latch que el diagrama ha leído a TRUE y que
 *   vuelve solo a FALSE (comprobado en LabVIEW con el botón Stop).
 * - `separador`: el separador decimal del sistema, para los números a cadena con
 *   «use system decimal point?» (por defecto, el punto).
 * - `depurador` (DT-047): `{ alValor(nodo, salida, valor), alNodo(nodo), unoACadaVez() }`. With it the
 *   VI reports every node and the value of its outputs while debugging is on: `alNodo` may return a promise
 *   (a breakpoint, a step, Highlight Execution's pace) and the clump waits for it. The runtime gives it
 *   `activar(on)` to turn debugging on or off, also in the middle of a Run; `unoACadaVez()` true makes the
 *   clumps run one at a time, as LabVIEW does with Highlight Execution. `compilado.debugNodes[i]` says which
 *   node index `i` is.
 * - `estado`: an object kept between Runs, through which the VI keeps its
 *   state while it stays loaded (DT-045).
 * - `senal`: un AbortSignal; el Abort para el VI aunque esté esperando, y la
 *   promesa se rechaza con un error `abortado`.
 */
export async function ejecutar(compilado, valores = {}, opciones = {}) {
  const { bytes, controles, indicadores, clumps } = compilado;
  const { alEscribir, alSoltar, senal, separador = "." } = opciones;
  if (clumps.some((k) => k.largo) && !conJSPI)
    throw new Error("Este VI espera (Wait…) y este motor de JavaScript no trae JSPI. En Node: node --experimental-wasm-jspi.");
  const escritos = {};
  const leer = (i) => {
    const { nodo, tipo, mecanica } = controles[i];
    const v = valores[nodo];
    if (v && mecanica?.startsWith("latch")) {
      valores[nodo] = false;
      alSoltar?.(nodo);
    }
    return aWasm(v, tipo);
  };
  const escribir = (i, v) => {
    const { nodo, tipo } = indicadores[i];
    escritos[nodo] = deWasm(v, tipo);
    alEscribir?.(nodo, escritos[nodo]);
  };
  const panel = {};
  for (const vt of ["i32", "i64", "f32", "f64"]) {
    panel[`leer_${vt}`] = leer;
    panel[`escribir_${vt}`] = escribir;
  }
  // Las cadenas (DT-042): el control se escribe en su celda, en UTF-8, como
  // [longitud][bytes]; el indicador se lee de su handle. La memoria se vuelve a
  // mirar cada vez porque puede haber crecido.
  let ex = null;
  const memoria = () => new DataView(ex.memoria.buffer);
  panel.leer_cad = (i, celda) => {
    const { nodo } = controles[i];
    const bytes = new TextEncoder().encode(String(valores[nodo] ?? ""));
    const p = ex.redimensionar(celda, 4 + bytes.length);
    memoria().setInt32(p, bytes.length, true);
    new Uint8Array(ex.memoria.buffer, p + 4, bytes.length).set(bytes);
  };
  // Los clusters (DT-042): campo a campo, según la disposición que da el
  // compilador; sus cadenas, en sus celdas. Un valor de cluster es un objeto con
  // un valor por nombre de campo.
  const ponerCadena = (celda, texto) => {
    const bytes = new TextEncoder().encode(String(texto ?? ""));
    const p = ex.redimensionar(celda, 4 + bytes.length);
    memoria().setInt32(p, bytes.length, true);
    new Uint8Array(ex.memoria.buffer, p + 4, bytes.length).set(bytes);
  };
  const leerCadena = (handle) => {
    const m = memoria();
    const p = m.getInt32(handle, true);
    const n = p ? m.getInt32(p, true) : 0;
    return new TextDecoder().decode(new Uint8Array(ex.memoria.buffer, p + 4, n).slice());
  };
  const ponerCluster = (dir, d, v = {}) => {
    for (const c of d.campos) {
      const x = v[c.nombre];
      const a = dir + c.off;
      if (c.disposicion) ponerCluster(a, c.disposicion, x);
      else if (c.tipo === "string") ponerCadena(a, x);
      else {
        const m = memoria();
        const w = aWasm(x, c.tipo);
        ({ i32: () => m.setInt32(a, w, true), i64: () => m.setBigInt64(a, w, true), f32: () => m.setFloat32(a, w, true), f64: () => m.setFloat64(a, w, true) })[c.wasm]();
      }
    }
  };
  const leerCluster = (dir, d) => {
    const r = {};
    for (const c of d.campos) {
      const a = dir + c.off;
      if (c.disposicion) r[c.nombre] = leerCluster(a, c.disposicion);
      else if (c.array) r[c.nombre] = leerArray(a, c.array.elemento, c.array.dims);
      else if (c.tipo === "string") r[c.nombre] = leerCadena(a);
      else {
        const m = memoria();
        const w = { i32: () => m.getInt32(a, true), i64: () => m.getBigInt64(a, true), f32: () => m.getFloat32(a, true), f64: () => m.getFloat64(a, true) }[c.wasm]();
        r[c.nombre] = deWasm(w, c.tipo);
      }
    }
    return r;
  };
  // Los arrays (DT-042): [n][relleno][elementos] en el bloque de la celda; un
  // valor de array es un array de JavaScript. Lo nuevo de un array de cadenas o
  // de clusters lo pone a cero `nuevo_array`.
  const LEER = { "i32.load8_s": "getInt8", "i32.load8_u": "getUint8", "i32.load16_s": "getInt16", "i32.load16_u": "getUint16", "i32.load": "getInt32", "i64.load": "getBigInt64", "f32.load": "getFloat32", "f64.load": "getFloat64" };
  const ESCRIBIR = { "i32.store8": "setInt8", "i32.store16": "setInt16", "i32.store": "setInt32", "i64.store": "setBigInt64", "f32.store": "setFloat32", "f64.store": "setFloat64" };
  // An array of two dimensions is nested JavaScript arrays, its rows (DT-044):
  // in memory, [rows][columns][elements in row order].
  const ponerArray = (celda, el, valor = [], dims = 1) => {
    const { sizes, elements: lista } = flattenArrayValue(valor, dims, undefined);
    const p = memoria().getInt32(celda, true);
    // `nuevo_array` reads the old element count in the first word.
    if (p && dims > 1) memoria().setInt32(p, memoria().getInt32(p, true) * memoria().getInt32(p + 4, true), true);
    const d = ex.nuevo_array(celda, lista.length, el.tam, el.ref ? 1 : 0);
    sizes.forEach((size, dimension) => memoria().setInt32(d - 8 + 4 * dimension, size, true));
    lista.forEach((v, k) => {
      const a = d + k * el.tam;
      if (el.tipo === "string") ponerCadena(a, v);
      else if (el.disposicion) ponerCluster(a, el.disposicion, v);
      else memoria()[ESCRIBIR[el.guarda]](a, aWasm(v, el.tipo), true);
    });
  };
  const leerArray = (handle, el, dims = 1) => {
    const m = memoria();
    const p = m.getInt32(handle, true);
    const sizes = Array.from({ length: dims }, (_, dimension) => (p ? m.getInt32(p + 4 * dimension, true) : 0));
    const n = sizes.reduce((product, size) => product * size, 1);
    const elements = Array.from({ length: n }, (_, k) => {
      const a = p + 8 + k * el.tam;
      if (el.tipo === "string") return leerCadena(a);
      if (el.disposicion) return leerCluster(a, el.disposicion);
      return deWasm(m[LEER[el.carga]](a, true), el.tipo);
    });
    return nestArrayValue(elements, sizes);
  };
  panel.leer_arr = (i, celda) => ponerArray(celda, controles[i].elemento, valores[controles[i].nodo], controles[i].dims);
  panel.escribir_arr = (i, handle) => {
    const { nodo, elemento, dims } = indicadores[i];
    escritos[nodo] = leerArray(handle, elemento, dims);
    alEscribir?.(nodo, escritos[nodo]);
  };
  panel.leer_clu = (i, dir) => ponerCluster(dir, controles[i].disposicion, valores[controles[i].nodo]);
  panel.escribir_clu = (i, dir) => {
    const { nodo, disposicion } = indicadores[i];
    escritos[nodo] = leerCluster(dir, disposicion);
    alEscribir?.(nodo, escritos[nodo]);
  };
  panel.escribir_cad = (i, handle) => {
    const { nodo } = indicadores[i];
    const m = memoria();
    const p = m.getInt32(handle, true);
    const n = p ? m.getInt32(p, true) : 0;
    escritos[nodo] = new TextDecoder().decode(new Uint8Array(ex.memoria.buffer, p + 4, n).slice());
    alEscribir?.(nodo, escritos[nodo]);
  };
  // Las funciones de cadena (DT-042 b): leen los handles de la memoria y dejan su resultado en la celda.
  const leerCad = (handle) => {
    const m = memoria();
    const p = m.getInt32(handle, true);
    const n = p ? m.getInt32(p, true) : 0;
    return aBinario(new Uint8Array(ex.memoria.buffer, p + 4, n));
  };
  const escribirCad = (celda, texto) => {
    const p = ex.redimensionar(celda, 4 + texto.length);
    memoria().setInt32(p, texto.length, true);
    new Uint8Array(ex.memoria.buffer, p + 4, texto.length).set(aBytes(texto));
  };
  // Las funciones de array de una dimensión con elementos de tamaño fijo: leen los bytes de los
  // elementos de los handles y dejan el resultado en la celda (DT-042 d).
  const KINDS = ["getFloat32", "getFloat64", "getBigInt64", "getInt32", "getInt16", "getUint16", "getInt8", "getUint8"];
  const crudo = (handle, tam) => {
    const m = memoria();
    const p = m.getInt32(handle, true);
    const n = p ? m.getInt32(p, true) : 0;
    return Array.from({ length: n }, (_, k) => new Uint8Array(ex.memoria.buffer, p + 8 + k * tam, tam).slice());
  };
  const ponerCrudo = (celda, tam, lista) => {
    const d = ex.nuevo_array(celda, lista.length, tam, 0);
    lista.forEach((b, k) => new Uint8Array(ex.memoria.buffer, d + k * tam, tam).set(b));
  };
  const valorCrudo = (b, kind) => new DataView(b.buffer)[KINDS[kind]](0, true);
  const acotar = (i, n) => Math.min(Math.max(i, 0), n);
  const arr = {
    a_reemplazar: (c, a, tam, i, b) => {
      const l = crudo(a, tam);
      crudo(b, tam).forEach((x, k) => {
        if (i + k >= 0 && i + k < l.length) l[i + k] = x;
      });
      ponerCrudo(c, tam, l);
    },
    // Medido en LabVIEW: con un índice fuera de [0, n] (Insert) o de [0, n) (Delete), el array sale igual.
    // Sin cablear el índice, Insert añade al final y Delete quita los últimos.
    a_insertar: (c, a, tam, i, b, cableado) => {
      const l = crudo(a, tam);
      const k = cableado ? i : l.length;
      if (k >= 0 && k <= l.length) l.splice(k, 0, ...crudo(b, tam));
      ponerCrudo(c, tam, l);
    },
    a_borrar: (c1, c2, a, tam, i, len, cableado) => {
      const l = crudo(a, tam);
      const n = acotar(len, l.length);
      const desde = cableado ? i : l.length - n;
      const quitados = desde >= 0 && desde < l.length ? l.splice(desde, n) : [];
      ponerCrudo(c1, tam, l);
      ponerCrudo(c2, tam, quitados);
    },
    a_ordenar: (c, a, tam, kind) => {
      const l = crudo(a, tam);
      l.sort((x, y) => {
        const [u, v] = [valorCrudo(x, kind), valorCrudo(y, kind)];
        return u < v ? -1 : u > v ? 1 : 0;
      });
      ponerCrudo(c, tam, l);
    },
    a_rotar: (c, a, tam, n) => {
      const l = crudo(a, tam);
      const r = new Array(l.length);
      l.forEach((x, i) => (r[(((i + n) % l.length) + l.length) % l.length] = x));
      ponerCrudo(c, tam, r);
    },
    a_partir: (c1, c2, a, tam, i) => {
      const l = crudo(a, tam);
      const k = acotar(i, l.length);
      ponerCrudo(c1, tam, l.slice(0, k));
      ponerCrudo(c2, tam, l.slice(k));
    },
    a_sumar: (c, a, tam, kind, i, delta) => {
      const l = crudo(a, tam);
      if (i >= 0 && i < l.length) {
        const dv = new DataView(l[i].buffer);
        const g = KINDS[kind];
        const s = g.replace("get", "set");
        if (kind === 2) dv[s](0, dv[g](0, true) + BigInt(delta), true);
        else dv[s](0, dv[g](0, true) + delta, true);
      }
      ponerCrudo(c, tam, l);
    },
  };
  let extra = 0;
  const cad = {
    sub: (c, s, o, l) => escribirCad(c, CADENAS.sub(leerCad(s), o, l)),
    mayus: (c, s) => escribirCad(c, CADENAS.mayus(leerCad(s))),
    minus: (c, s) => escribirCad(c, CADENAS.minus(leerCad(s))),
    invertir: (c, s) => escribirCad(c, CADENAS.invertir(leerCad(s))),
    rotar: (c, s) => escribirCad(c, CADENAS.rotar(leerCad(s))),
    recortar: (c, s, loc) => escribirCad(c, CADENAS.recortar(leerCad(s), loc)),
    reemplazar: (c1, c2, s, sub, o, l) => {
      const [r, quitado] = CADENAS.reemplazar(leerCad(s), leerCad(sub), o, l);
      escribirCad(c1, r);
      escribirCad(c2, quitado);
    },
    buscar: (c, s, b, r, o, flags) => {
      const res = CADENAS.buscar(leerCad(s), leerCad(b), leerCad(r), o, flags & 1, flags & 2);
      escribirCad(c, res.resultado);
      extra = res.pasado;
      return res.n;
    },
    extra: () => extra,
    cmp: (a, b) => CADENAS.cmp(leerCad(a), leerCad(b)),
    cmp_ci: (a, b) => CADENAS.cmpCaseInsensitive(leerCad(a), leerCad(b)),
    dec: (c, x, w, bits) => escribirCad(c, CADENAS.dec(x, w, bits)),
    hex: (c, x, w, bits) => escribirCad(c, CADENAS.hex(x, w, bits)),
    oct: (c, x, w, bits) => escribirCad(c, CADENAS.oct(x, w, bits)),
    // use system decimal point? da el separador del sistema; si no, el punto.
    frac: (c, x, w, p, sis) => escribirCad(c, CADENAS.frac(x, w, p, sis ? separador : ".")),
    exp: (c, x, w, p, sis) => escribirCad(c, CADENAS.exp(x, w, p, sis ? separador : ".")),
    eng: (c, x, w, p, sis) => escribirCad(c, CADENAS.eng(x, w, p, sis ? separador : ".")),
  };
  // Format Into String and Scan From String (spec/04 Rule 21j): rows of FORMAT_ROW_BYTES, see the compiler.
  const ROW_KINDS = ["float", "signed", "unsigned", "bool", "string"];
  const readRows = (address, count) =>
    Array.from({ length: count }, (_, k) => {
      const record = address + k * FORMAT_ROW_BYTES;
      const m = memoria();
      const kind = ROW_KINDS[m.getInt32(record, true)];
      const bits = m.getInt32(record + 4, true);
      if (kind === "float") return { kind, value: m.getFloat64(record + 8, true) };
      if (kind === "bool") return { kind, value: m.getInt32(record + 8, true) !== 0 };
      if (kind === "string") return { kind, value: decodificar(leerCad(m.getInt32(record + 8, true))), cell: bits };
      const raw = m.getBigInt64(record + 8, true);
      return { kind: "int", bits, signed: kind === "signed", value: kind === "signed" ? raw : BigInt.asUintN(bits, raw) };
    });
  const writeRow = (record, row, value) => {
    const m = memoria();
    if (row.kind === "float") m.setFloat64(record + 8, value, true);
    else if (row.kind === "bool") m.setInt32(record + 8, value ? 1 : 0, true);
    else if (row.kind === "string") escribirCad(row.cell, codificar(value));
    else m.setBigInt64(record + 8, BigInt.asIntN(64, BigInt(value)), true);
  };
  /**
   * The VIs from the one at `chainIndex` up to the top level, as an error source names them:
   * "Parse Reply.qvi->Instrument Protocol.qvi" (spec/04 Rule 21k). Each call wrote its caller's
   * index into the callee's cell; an unnamed top-level VI ends the chain.
   */
  const callChainText = (chainIndex) => {
    const names = [];
    for (let index = chainIndex; ; ) {
      const { name, callerCell } = compilado.callChain[index];
      if (name) names.push(name);
      if (callerCell === null) return names.join("->");
      index = memoria().getInt32(callerCell, true);
    }
  };
  /** The source of an error a function raises: the function, its argument if any, and where it ran. */
  const functionSource = (functionName, chainIndex, arg) => {
    const where = compilado.callChain ? callChainText(chainIndex) : "";
    return `${functionName}${arg ? ` (arg ${arg})` : ""}${where ? ` in ${where}` : ""}`;
  };
  /** The error cluster a format function leaves: the one that came in, or its own with the argument it is about. */
  const formatError = (errorOut, errorIn, source, chainIndex, result) => {
    const incoming = leerCluster(errorIn, compilado.disposicionError);
    const own = result.error ? { status: true, code: result.error, source: functionSource(leerCad(source), chainIndex, result.arg) } : incoming;
    ponerCluster(errorOut, compilado.disposicionError, own);
  };
  // With an error in, nothing is done: the error passes, the result is empty and each output gives its default (measured).
  const errorComesIn = (errorIn) => leerCluster(errorIn, compilado.disposicionError).status;
  cad.formatear = (cell, format, initial, rows, count, errorIn, errorOut, source, chainIndex) => {
    const result = errorComesIn(errorIn) ? { text: "" } : formatIntoString(decodificar(leerCad(format)), decodificar(leerCad(initial)), readRows(rows, count), separador);
    escribirCad(cell, codificar(result.text));
    formatError(errorOut, errorIn, source, chainIndex, result);
  };
  cad.escanear = (cell, input, format, location, rows, count, errorIn, errorOut, source, chainIndex) => {
    const defaults = readRows(rows, count);
    const text = decodificar(leerCad(input));
    const result = errorComesIn(errorIn)
      ? { values: defaults.map((row) => row.value), remaining: "", offset: 0 }
      : scanFromString(text, decodificar(leerCad(format)), location >>> 0, defaults, separador);
    defaults.forEach((row, k) => writeRow(rows + k * FORMAT_ROW_BYTES, row, result.values[k]));
    escribirCad(cell, codificar(result.remaining));
    formatError(errorOut, errorIn, source, chainIndex, result);
    return codificar(text.slice(0, result.offset)).length;
  };
  for (const [nombre, f] of [["leer_dec", CADENAS.leerDec], ["leer_hex", CADENAS.leerHex], ["leer_oct", CADENAS.leerOct], ["leer_frac", CADENAS.leerFrac]])
    cad[nombre] = (s, o) => {
      const r = f(leerCad(s), o);
      extra = r.pasado;
      return r.valor;
    };
  const dormir = (ms) =>
    new Promise((ok, mal) => {
      if (senal?.aborted) return mal(abortado());
      const fuera = () => {
        clearTimeout(t);
        mal(abortado());
      };
      const t = setTimeout(() => {
        senal?.removeEventListener("abort", fuera);
        ok();
      }, ms);
      senal?.addEventListener("abort", fuera, { once: true });
    });
  const suspendible = (f) => (conJSPI ? new WebAssembly.Suspending(f) : f);
  // Ceder en un bucle (DT-041): el bucle llama cuando agota su presupuesto de
  // vueltas; aquí se ajusta para que llame cada ~1 ms, y cada ~8 ms se suspende
  // de verdad para que corran los demás clumps, el panel y Abort. En un worker se
  // suspende por un MessageChannel, que es inmediato (setTimeout(0) tarda hasta 4
  // ms); en Node, por setImmediate.
  let canalCeder = null;
  const ceder1 = () =>
    new Promise((ok) => {
      // En Node, setImmediate deja correr a los temporizadores; un MessageChannel no.
      if (typeof setImmediate === "function") return setImmediate(ok);
      if (!canalCeder) {
        canalCeder = new MessageChannel();
        canalCeder.port1.unref?.();
      }
      canalCeder.port1.onmessage = ok;
      canalCeder.port2.postMessage(0);
    });
  let presupuesto = 1;
  let ultimaLlamada = performance.now();
  let ultimaCesion = ultimaLlamada;
  const ceder = suspendible(() => {
    if (senal?.aborted) throw abortado();
    const ahora = performance.now();
    const pasado = Math.max(ahora - ultimaLlamada, 0.001);
    presupuesto = Math.max(1, Math.min(1 << 24, Math.round((presupuesto * 1) / pasado)));
    if (ahora - ultimaCesion < 8) {
      ultimaLlamada = ahora;
      return presupuesto;
    }
    return ceder1().then(() => {
      if (senal?.aborted) throw abortado();
      ultimaLlamada = ultimaCesion = performance.now();
      return presupuesto;
    });
  });
  // Un subplan: los clumps de un cuerpo con varios nodos largos, a la vez (DT-041).
  let correrClump = null;
  const correr_plan = suspendible(async (p) => {
    await planificar(compilado.planes[p], (i) => correrClump(`p${p}c${i}`, compilado.planes[p][i].largo), senal);
    return 0;
  });
  // A subVI that waits (DT-045): a non-reentrant VI serves one call at a time, as LabVIEW
  // serializes simultaneous calls. A call enters (waiting while another one is inside), writes its
  // inputs, runs, reads its outputs and leaves; leaving hands the subVI to the next waiting call.
  const subVIWaiters = new Map(); // plan → resolvers of the calls waiting to enter; present while busy
  const entrar_subvi = suspendible((p) => {
    const waiters = subVIWaiters.get(p);
    if (!waiters) {
      subVIWaiters.set(p, []);
      return 0;
    }
    return new Promise((enter) => waiters.push(enter)).then(() => {
      if (senal?.aborted) throw abortado();
      return 0;
    });
  });
  const salir_subvi = (p) => {
    const next = subVIWaiters.get(p)?.shift();
    if (next) next();
    else subVIWaiters.delete(p);
  };
  const correr_subvi = suspendible(async (p) => {
    await planificar(compilado.planes[p], (i) => correrClump(`p${p}c${i}`, compilado.planes[p][i].largo), senal);
    return 0;
  });
  // Manejo automático de errores (DT-043): el diálogo lo saca quien llama
  // (`alErrorAutomatico`, que resuelve «continuar» o «parar»). Sin él —la línea
  // de órdenes—, el VI se detiene con el error.
  const error_automatico = suspendible(async (i, dir) => {
    const err = leerCluster(dir, compilado.disposicionError);
    const nodo = compilado.automaticos?.[i];
    if (!opciones.alErrorAutomatico) throw Object.assign(new Error(`Error ${err.code} occurred at ${err.source}`), { error: err, nodo });
    const r = await opciones.alErrorAutomatico({ ...err, nodo });
    if (r === "parar") throw abortado();
    return 0;
  });
  // Simple Error Handler (DT-043): su diálogo propio (`alDialogoError`, que resuelve cuando el
  // usuario pulsa OK) y sus salidas. Sin diálogo —la línea de órdenes—, no espera. Sin
  // comprobar en LabVIEW: «type of dialog» distinto de 1, y un aviso (status FALSE) a la entrada.
  const dialogo_error = suspendible(async (errIn, code, src, tipo, buf, celdaSrc, celdaMsg) => {
    const entrada = leerCluster(errIn, compilado.disposicionError);
    const err = !entrada.status && code !== 0 ? { status: true, code, source: leerCadena(src) } : entrada;
    const texto = mensajeDeError(err);
    if (err.status) await opciones.alDialogoError?.({ ...err, mensaje: texto });
    if (senal?.aborted) throw abortado();
    ponerCluster(buf, compilado.disposicionError, err);
    ponerCadena(celdaSrc, err.source);
    ponerCadena(celdaMsg, texto);
    return err.status ? 1 : 0;
  });
  // Debugging (DT-047): the hooks the compiled VI calls while the debug flag is set.
  const depurador = opciones.depurador;
  const valorDepurado = (nodo, salida, valor) => {
    const out = compilado.debugNodes?.[nodo]?.outputs?.[salida];
    if (!out || !depurador) return;
    if (out.tipo === "string") return depurador.alValor(nodo, salida, leerCadena(valor));
    if (out.disposicion) return depurador.alValor(nodo, salida, leerCluster(valor, out.disposicion));
    if (out.elemento) return depurador.alValor(nodo, salida, leerArray(valor, out.elemento, out.dims));
    depurador.alValor(nodo, salida, deWasm(valor, out.tipo));
  };
  const dep = {
    ...Object.fromEntries(["i32", "i64", "f32", "f64"].map((vt) => [`valor_${vt}`, valorDepurado])),
    nodo: suspendible((nodo) => {
      const espera = depurador?.alNodo(nodo);
      if (espera && typeof espera.then === "function") return espera.then(() => {
        if (senal?.aborted) throw abortado();
        return 0;
      });
      return 0;
    }),
  };
  const tiempo = {
    reloj,
    ceder,
    error_automatico,
    dialogo_error,
    correr_plan,
    entrar_subvi,
    correr_subvi,
    salir_subvi,
    esperar: suspendible(async (ms) => {
      await dormir(ms);
      return reloj();
    }),
    esperar_multiplo: suspendible(async (m) => {
      await dormir(m > 0 ? m - (reloj() % m) : 0);
      return reloj();
    }),
  };
  const { instance } = await WebAssembly.instantiate(bytes, { panel, tiempo, cad, arr, dep, math: { random: Math.random, pow: Math.pow, ...funcionesMath } });
  ex = instance.exports;
  restoreState(opciones.estado, bytes, ex.memoria);
  if (depurador && compilado.debugFlag !== undefined) {
    depurador.activar = (on) => memoria().setInt32(compilado.debugFlag, on ? 1 : 0, true);
    depurador.alConectar?.();
  }
  const prometidas = new Map();
  // With a debugger every clump may stop at a node, so every one runs as a promise; with
  // Highlight Execution they run one at a time (DT-047).
  let enSerie = Promise.resolve();
  const correrUno = (nombre, largo) => {
    if (!largo && !(depurador && conJSPI)) return ex[nombre]();
    if (!prometidas.has(nombre)) prometidas.set(nombre, WebAssembly.promising(ex[nombre]));
    return prometidas.get(nombre)();
  };
  correrClump = (nombre, largo) => {
    if (!depurador?.unoACadaVez?.()) return correrUno(nombre, largo);
    const turno = enSerie.catch(() => {}).then(() => correrUno(nombre, largo));
    enSerie = turno;
    return turno;
  };
  if (clumps.some((k) => k.largo) || compilado.planes?.length) {
    if (!conJSPI) throw new Error("Este VI espera (Wait…) y este motor de JavaScript no trae JSPI. En Node: node --experimental-wasm-jspi.");
  }
  try {
    await planificar(clumps, (i) => correrClump(`c${i}`, clumps[i].largo), senal);
  } finally {
    saveState(opciones.estado, bytes, ex.memoria);
    canalCeder?.port1.close();
  }
  return escritos;
}

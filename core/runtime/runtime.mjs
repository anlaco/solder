// Running a compiled VI (core/compiler/compiler.mjs): instantiating its
// WebAssembly module and running its clumps by dataflow (DT-040).
//
// This is the module's host and the Run's coordinator: it writes the control
// values into the panel's memory and passes over the indicators to report what
// changed (DT-063 §10). It also provides the clocks; the waits, yields, subplans and subVI turns are the
// module's own scheduler (pool-scheduler.mjs, DT-063 §9), which this host drives
// turn by turn on one thread. It provides nothing else: a VI has no
// gates other than what is imported into it (DT-039, decision 4). The editor's
// worker and the command line, in Node, use it the same way.

import { NUMERICOS, flattenArrayValue, nestArrayValue, representacion } from "../model/types.mjs";
import { FUNCIONES } from "../compiler/expression-parser.mjs";
import { MAXIMUM_PAGES, SHARED_MEMORY_IMPORT, tipoWasm } from "../compiler/compiler.mjs";
import { mensaje as mensajeDeError } from "./error-codes.mjs";
import { aEntero64, cientifica, fraccionaria, noFinito, rellenar, separar } from "./number-text.mjs";
import { formatIntoString, scanFromString } from "./format-string.mjs";
import { abortedError, createRealHost } from "./scheduler.mjs";
import { CLUMP, CLUMP_BYTES, HEADER, PARK_KIND, RUN_STATUS, STATE } from "../compiler/pool-scheduler.mjs";
import { SCHEDULER } from "../compiler/linear-memory.mjs";
import { PANEL_RECORD } from "../compiler/panel-memory.mjs";
import { VISA_FUNCTION_NAMES, createVisaFunctions } from "./instrument-io.mjs";

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

/** The error a VI that was aborted ends with: not a fault of the VI. */
export const abortado = abortedError;

/** LabVIEW's millisecond clock on a host's time: a U32 that wraps, with its zero undefined. */
/** The millisecond timer (a U32 that wraps) of a clock in milliseconds. */
export const millisecondTimerOf = (clock) => () => Math.floor(clock()) >>> 0;
const millisecondTimer = (host) => millisecondTimerOf(() => host.now());

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

/** What `debugValueReader` gives for an output the debugger does not know. */
export const NO_DEBUG_VALUE = Symbol("no debug value");

/**
 * Reads the value a debug hook reports (DT-047) on the thread that runs the clump, before the clump
 * goes on and changes it: output `salida` of debug node `nodo`, whose WebAssembly value is `valor` (a
 * string, array or cluster goes by address).
 */
export function debugValueReader(compilado, { leerCadena, leerCluster, leerArray }) {
  return (nodo, salida, valor) => {
    const out = compilado.debugNodes?.[nodo]?.outputs?.[salida];
    if (!out) return NO_DEBUG_VALUE;
    if (out.tipo === "string") return leerCadena(valor);
    if (out.disposicion) return leerCluster(valor, out.disposicion);
    if (out.elemento) return leerArray(valor, out.elemento, out.dims);
    return deWasm(valor, out.tipo);
  };
}

/**
 * The functions of the host that run on the thread that calls them: the string, array and Format/Scan
 * functions the module imports, over that thread's instance (`exports()`, which exists once the module
 * is instantiated) and the shared `memory`, and the readers and writers of values in the memory. Every
 * thread of a pool makes its own (DT-063 §1); the coordinator too.
 */
export function createHostFunctions({ compilado, separador = ".", memory, exports }) {
  // The memory is looked at again every time, since it may have grown.
  const memoria = () => new DataView(memory.buffer);
  // Los clusters (DT-042): campo a campo, según la disposición que da el
  // compilador; sus cadenas, en sus celdas. Un valor de cluster es un objeto con
  // un valor por nombre de campo.
  // A LabVIEW string is bytes: an instrument's answer goes in as it came, text goes in as UTF-8.
  const putBytes = (cell, bytes) => {
    const block = exports().redimensionar(cell, 4 + bytes.length);
    memoria().setInt32(block, bytes.length, true);
    new Uint8Array(memory.buffer, block + 4, bytes.length).set(bytes);
  };
  const readBytes = (handle) => {
    const m = memoria();
    const block = m.getInt32(handle, true);
    const length = block ? m.getInt32(block, true) : 0;
    return new Uint8Array(memory.buffer, block + 4, length).slice();
  };
  const ponerCadena = (celda, texto) => putBytes(celda, new TextEncoder().encode(String(texto ?? "")));
  const leerCadena = (handle) => new TextDecoder().decode(readBytes(handle));
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
    const d = exports().nuevo_array(celda, lista.length, el.tam, el.ref ? 1 : 0);
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
  // Las funciones de cadena (DT-042 b): leen los handles de la memoria y dejan su resultado en la celda.
  const leerCad = (handle) => {
    const m = memoria();
    const p = m.getInt32(handle, true);
    const n = p ? m.getInt32(p, true) : 0;
    return aBinario(new Uint8Array(memory.buffer, p + 4, n));
  };
  const escribirCad = (celda, texto) => {
    const p = exports().redimensionar(celda, 4 + texto.length);
    memoria().setInt32(p, texto.length, true);
    new Uint8Array(memory.buffer, p + 4, texto.length).set(aBytes(texto));
  };
  // Las funciones de array de una dimensión con elementos de tamaño fijo: leen los bytes de los
  // elementos de los handles y dejan el resultado en la celda (DT-042 d).
  const KINDS = ["getFloat32", "getFloat64", "getBigInt64", "getInt32", "getInt16", "getUint16", "getInt8", "getUint8"];
  const crudo = (handle, tam) => {
    const m = memoria();
    const p = m.getInt32(handle, true);
    const n = p ? m.getInt32(p, true) : 0;
    return Array.from({ length: n }, (_, k) => new Uint8Array(memory.buffer, p + 8 + k * tam, tam).slice());
  };
  const ponerCrudo = (celda, tam, lista) => {
    const d = exports().nuevo_array(celda, lista.length, tam, 0);
    lista.forEach((b, k) => new Uint8Array(memory.buffer, d + k * tam, tam).set(b));
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
  /** The value of type `type` at `address` of the memory: a scalar, a string's or array's handle, or a cluster. */
  const readValue = (address, indicator) => {
    const { tipo, elemento, dims, disposicion } = indicator;
    if (tipo === "string") return leerCadena(address);
    if (disposicion) return leerCluster(address, disposicion);
    if (elemento) return leerArray(address, elemento, dims);
    return deWasm(atomicScalar(memory, address, tipoWasm(tipo)), tipo);
  };
  const math = { random: Math.random, pow: Math.pow, ...funcionesMath };
  return { cad, arr, math, putBytes, readBytes, ponerCadena, leerCadena, ponerCluster, leerCluster, ponerArray, leerArray, readValue, functionSource };
}

/**
 * Runs the compiled VI. `valores` gives the value of each control by its node id; the caller may
 * change it while the VI runs, and what changed reaches the panel's memory at the start of the next
 * turn (DT-063 §10). Returns the value of each indicator written, by id. `opciones`:
 * - `alEscribir(nodo, valor)`: an indicator that changed since the last pass over the panel, with its
 *   last value; a Waveform Chart, every write its history still holds, in order. The panel is passed
 *   at the end of each turn, before a dialog or the debugger shows something, and when the Run ends.
 * - `alAcabarTurno()`: the clumps of a turn have parked or ended, or the Run ended (DT-061 §4): the
 *   moment to send what was written to the panel.
 * - `alSoltar(nodo)`: a Latch control that the diagram read as TRUE and that goes back to FALSE by
 *   itself (checked in LabVIEW with the Stop button).
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
 * - `host`: where time and turns come from (scheduler.mjs); by default the real one. The reference traces
 *   run on `createVirtualHost`, whose clock jumps.
 * - `senal`: un AbortSignal; el Abort para el VI aunque esté esperando, y la
 *   promesa se rechaza con un error `abortado`.
 */
export async function ejecutar(compilado, valores = {}, opciones = {}) {
  const { bytes, controles, indicadores, clumps } = compilado;
  const { alEscribir, alSoltar, senal, separador = "." } = opciones;
  const escritos = {};

  let ex = null;
  const memory = new WebAssembly.Memory({ initial: compilado.memoryPages, maximum: MAXIMUM_PAGES, shared: true });
  const hostFunctions = createHostFunctions({ compilado, separador, memory, exports: () => ex });
  const { cad, arr, math, ponerCadena, leerCadena, ponerCluster, leerCluster, ponerArray, leerArray, readValue } = hostFunctions;
  const memoria = () => new DataView(memory.buffer);
  // The controls are records of the panel too: at the start of each turn, what the caller changed in
  // `valores` (the editor's messages, in the worker) is written into them, a string, array or cluster
  // under the write lock. A Latch that the diagram read as TRUE goes back to FALSE here, and the
  // caller is told (checked in LabVIEW with the Stop button).
  const NOT_WRITTEN = Symbol("not written");
  const writtenToMemory = controles.map(() => NOT_WRITTEN);
  const releasesSeen = controles.map(() => 0);
  const writeControl = (control, shownValue) => {
    const { record, tipo, elemento, dims, disposicion } = control;
    const value = control.resourceName ? resourceNameValue(shownValue) : shownValue;
    const address = record + PANEL_RECORD.value;
    if (tipo !== "string" && !elemento && !disposicion) return storeAtomicScalar(memory, address, tipoWasm(tipo), aWasm(value, tipo));
    ex.write_lock(record + PANEL_RECORD.lock);
    if (tipo === "string") ponerCadena(address, value);
    else if (disposicion) ponerCluster(address, disposicion, value);
    else ponerArray(address, elemento, value, dims);
    ex.write_unlock(record + PANEL_RECORD.lock);
  };
  const syncControls = () => {
    controles.forEach((control, index) => {
      const { nodo, record, mecanica } = control;
      if (mecanica?.startsWith("latch")) {
        const releases = Atomics.load(new Int32Array(memory.buffer), (record + PANEL_RECORD.released) / 4);
        if (releases !== releasesSeen[index]) {
          releasesSeen[index] = releases;
          valores[nodo] = false;
          writtenToMemory[index] = false;
          alSoltar?.(nodo);
        }
      }
      if (valores[nodo] === writtenToMemory[index]) return;
      writeControl(control, valores[nodo]);
      writtenToMemory[index] = valores[nodo];
    });
  };
  // The indicators are records of the panel in the memory (DT-063 §10): the diagram writes them and
  // never waits; this walk, at the end of each turn and before anything the editor shows (a dialog,
  // the debugger), reports what changed since the last one. A value written twice in between is
  // reported once, as LabVIEW's panel skips values; a chart reports every write its history still holds.
  const writesSeen = indicadores.map(() => 0);
  const walkIndicators = () => {
    indicadores.forEach((indicator, index) => {
      const { nodo, record, historyLength } = indicator;
      const writes = Atomics.load(new Int32Array(memory.buffer), (record + PANEL_RECORD.version) / 4);
      if (writes === writesSeen[index]) return;
      const locked = historyLength || indicator.tipo === "string" || indicator.disposicion || indicator.elemento;
      if (locked) ex.read_lock(record + PANEL_RECORD.lock);
      if (historyLength) {
        for (let write = Math.max(writesSeen[index], writes - historyLength); write < writes; write++) {
          escritos[nodo] = readValue(record + PANEL_RECORD.value + (write % historyLength) * indicator.slot, indicator);
          alEscribir?.(nodo, escritos[nodo]);
        }
      } else {
        const value = readValue(record + PANEL_RECORD.value, indicator);
        escritos[nodo] = indicator.resourceName ? value["resource name"] : value;
        alEscribir?.(nodo, escritos[nodo]);
      }
      if (locked) ex.read_unlock(record + PANEL_RECORD.lock);
      writesSeen[index] = writes;
    });
  };
  // Every clump runs, parks and is resumed by the module's own scheduler (DT-061, DT-063 §9): the
  // order is ours, never the host's. Here one thread runs the clumps, one per turn, and JavaScript
  // drives the turns, so the order is exactly the reference model's (scheduler.mjs). With a debugger
  // every clump may stop at a node; with Highlight Execution they run one at a time, as LabVIEW does (DT-047).
  const depurador = opciones.depurador;
  const host = opciones.host ?? createRealHost();
  const reloj = millisecondTimer(host);
  // An import that has to wait for the outside (a dialog, the debugger) parks its clump: the
  // scheduler marks it and the clump saves its state and returns; when the answer comes, the clump
  // is woken with it.
  const isPromise = (value) => !!value && typeof value.then === "function";
  let failRun = null;
  let requestTurn = () => {};
  /** What an import that may wait answers: `answer` itself, or, when it is a promise, park until it settles. */
  const parkOn = (answer) => {
    if (!isPromise(answer)) return answer;
    const clump = ex.park_external();
    answer.then(
      (value) => {
        ex.wake_external(COORDINATOR_THREAD, clump, Number(value) | 0);
        requestTurn();
      },
      (error) => failRun(error),
    );
    return 0;
  };
  /** `then(answer)` now, or when `answer` settles if it is a promise. */
  const whenAnswered = (answer, then) => (isPromise(answer) ? answer.then(then) : then(answer));
  // Manejo automático de errores (DT-043): el diálogo lo saca quien llama
  // (`alErrorAutomatico`, que resuelve «continuar» o «parar»). Sin él —la línea
  // de órdenes—, el VI se detiene con el error.
  // The dialogs answer at once or with a promise; on one thread the clump parks on it (`parkOn`), on a
  // pool the coordinator wakes the clump that a thread parked (runOnPool).
  const automaticErrorDialog = (i, dir) => {
    walkIndicators();
    const err = leerCluster(dir, compilado.disposicionError);
    const nodo = compilado.automaticos?.[i];
    if (!opciones.alErrorAutomatico) throw Object.assign(new Error(`Error ${err.code} occurred at ${err.source}`), { error: err, nodo });
    return whenAnswered(opciones.alErrorAutomatico({ ...err, nodo }), (answer) => {
      if (answer === "parar") throw abortado();
      return 0;
    });
  };
  // Simple Error Handler (DT-043): su diálogo propio (`alDialogoError`, que resuelve cuando el
  // usuario pulsa OK) y sus salidas. Sin diálogo —la línea de órdenes—, no espera. Sin
  // comprobar en LabVIEW: «type of dialog» distinto de 1, y un aviso (status FALSE) a la entrada.
  const errorHandlerDialog = (errIn, code, src, tipo, buf, celdaSrc, celdaMsg) => {
    const entrada = leerCluster(errIn, compilado.disposicionError);
    const err = !entrada.status && code !== 0 ? { status: true, code, source: leerCadena(src) } : entrada;
    const texto = mensajeDeError(err);
    // The outputs are written once the dialog is closed, before the clump goes on.
    const writeOutputs = () => {
      ponerCluster(buf, compilado.disposicionError, err);
      ponerCadena(celdaSrc, err.source);
      ponerCadena(celdaMsg, texto);
      return err.status ? 1 : 0;
    };
    if (!err.status) return writeOutputs();
    walkIndicators();
    return whenAnswered(opciones.alDialogoError?.({ ...err, mensaje: texto }), writeOutputs);
  };
  const visaFunctions = createVisaFunctions({ io: opciones.io, host: hostFunctions, memory, compilado });
  const externalWaits = { error_automatico: automaticErrorDialog, dialogo_error: errorHandlerDialog, ...visaFunctions };
  // Debugging (DT-047): the hooks the compiled VI calls while the debug flag is set.
  const readDebugValue = debugValueReader(compilado, { leerCadena, leerCluster, leerArray });
  const valorDepurado = (nodo, salida, valor) => {
    if (!depurador) return;
    const value = readDebugValue(nodo, salida, valor);
    if (value !== NO_DEBUG_VALUE) depurador.alValor(nodo, salida, value);
  };
  const debuggerStop = (nodo) => {
    walkIndicators();
    return whenAnswered(depurador?.alNodo(nodo), () => 0);
  };
  externalWaits.debugger_node = debuggerStop;
  const dep = {
    ...Object.fromEntries(["i32", "i64", "f32", "f64"].map((vt) => [`valor_${vt}`, valorDepurado])),
    nodo: (nodo) => parkOn(debuggerStop(nodo)),
  };
  const tiempo = {
    reloj,
    ahora: () => host.now(),
    reloj_real: () => performance.now(),
    error_automatico: (...args) => parkOn(automaticErrorDialog(...args)),
    dialogo_error: (...args) => parkOn(errorHandlerDialog(...args)),
  };
  const io = Object.fromEntries(VISA_FUNCTION_NAMES.map((name) => [name, (...args) => parkOn(visaFunctions[name](...args))]));
  const sharedMemory = { [SHARED_MEMORY_IMPORT.modulo]: { [SHARED_MEMORY_IMPORT.nombre]: memory } };
  const { instance } = await WebAssembly.instantiate(bytes, { ...sharedMemory, tiempo, cad, arr, dep, math, io });
  ex = instance.exports;
  ex.initialize();
  restoreState(opciones.estado, bytes, ex.memoria);
  // A Run that was aborted left its parked clumps' frames behind: every clump starts afresh.
  for (const frame of compilado.frames ?? []) memoria().setInt32(frame, 0, true);
  if (depurador && compilado.debugFlag !== undefined) {
    depurador.activar = (on) => memoria().setInt32(compilado.debugFlag, on ? 1 : 0, true);
    depurador.alConectar?.();
  }
  if (senal?.aborted) throw abortado();
  const passOverPanel = () => {
    walkIndicators();
    syncControls();
    opciones.alAcabarTurno?.();
  };
  // A Run on a pool (DT-063 §11), unless it starts being debugged: then it runs on this thread, so that
  // Highlight Execution runs one clump at a time. Debugging turned on later reaches the pool's threads,
  // which send their nodes and values here.
  const debuggedFromTheStart = depurador && compilado.debugFlag !== undefined && memoria().getInt32(compilado.debugFlag, true) !== 0;
  if (opciones.poolPorts?.length && !debuggedFromTheStart) {
    try {
      await runOnPool({ ex, memory, bytes, compilado, separador, ports: opciones.poolPorts, externalWaits, onDebugValue: (nodo, salida, value) => depurador?.alValor(nodo, salida, value), passOverPanel, senal });
    } finally {
      saveState(opciones.estado, bytes, ex.memoria);
    }
    return escritos;
  }
  try {
    await runTurns({ ex, host, compilado, oneClumpAtATime: () => !!depurador?.unoACadaVez?.(), onTurnEnd: () => {
      walkIndicators();
      syncControls();
      opciones.alAcabarTurno?.();
    }, senal, setFail: (fail) => (failRun = fail), setRequestTurn: (request) => (requestTurn = request) });
  } finally {
    saveState(opciones.estado, bytes, ex.memoria);
    host.close?.();
  }
  return escritos;
}

/**
 * A VISA resource name as it lives in memory, from the text a panel shows (DT-066): with no session yet; the
 * first VISA function that uses it opens one from the name, as LabVIEW does.
 */
const resourceNameValue = (text) => ({ "resource name": text ?? "", session: 0 });

/** The scalar of WebAssembly type `wasmType` at `address`, read in one atomic load (a thread may be writing it). */
function atomicScalar(memory, address, wasmType) {
  if (wasmType === "i64" || wasmType === "f64") {
    const bits = Atomics.load(new BigInt64Array(memory.buffer), address / 8);
    return wasmType === "i64" ? bits : new Float64Array(new BigInt64Array([bits]).buffer)[0];
  }
  const bits = Atomics.load(new Int32Array(memory.buffer), address / 4);
  return wasmType === "i32" ? bits : new Float32Array(new Int32Array([bits]).buffer)[0];
}

/** Stores the scalar `value` of WebAssembly type `wasmType` at `address`, in one atomic store. */
function storeAtomicScalar(memory, address, wasmType, value) {
  if (wasmType === "i64" || wasmType === "f64") {
    const bits = wasmType === "i64" ? BigInt.asIntN(64, BigInt(value)) : new BigInt64Array(new Float64Array([value]).buffer)[0];
    return void Atomics.store(new BigInt64Array(memory.buffer), address / 8, bits);
  }
  const bits = wasmType === "i32" ? value | 0 : new Int32Array(new Float32Array([value]).buffer)[0];
  Atomics.store(new Int32Array(memory.buffer), address / 4, bits);
}

/** The thread that answers from outside the Run: with one thread, the same one that runs the clumps. */
const COORDINATOR_THREAD = 0;
const ONE_THREAD = 1;
const NOT_BLOCKING = 0;

/**
 * Runs a Run's clumps on this thread through the module's scheduler, one clump per turn (DT-063 §9,
 * with one thread): a turn starts once the clump of the last one has parked or ended, and between
 * turns the host runs the messages that came in (the panel, Abort) and the answers from outside, as in
 * the reference model. Resolves when the Run ends; rejects when it is aborted, deadlocks or fails.
 */
function runTurns({ ex, host, compilado, oneClumpAtATime, onTurnEnd = () => {}, senal, setFail, setRequestTurn }) {
  return new Promise((resolve, reject) => {
    let finished = false;
    let turnRequested = false;
    let hostTimer = null;
    let hostTimerDeadline = Infinity;
    const finish = (error) => {
      if (finished) return;
      finished = true;
      onTurnEnd();
      if (hostTimer !== null) host.clearTimer(hostTimer);
      senal?.removeEventListener("abort", abortRun);
      if (error) reject(error);
      else resolve();
    };
    const requestTurn = () => {
      if (turnRequested || finished) return;
      turnRequested = true;
      host.soon(turn);
    };
    const abortRun = () => {
      ex.request_abort();
      requestTurn();
    };
    const armHostTimer = () => {
      const earliest = ex.next_deadline();
      if (earliest === hostTimerDeadline) return;
      if (hostTimer !== null) host.clearTimer(hostTimer);
      hostTimer = null;
      hostTimerDeadline = earliest;
      if (earliest !== Infinity)
        hostTimer = host.setTimer(earliest, () => {
          hostTimer = null;
          hostTimerDeadline = Infinity;
          requestTurn();
        });
    };
    function turn() {
      turnRequested = false;
      if (finished) return;
      onTurnEnd();
      ex.set_one_at_a_time(oneClumpAtATime() ? 1 : 0);
      let status;
      try {
        status = ex.run_thread(COORDINATOR_THREAD, NOT_BLOCKING);
      } catch (error) {
        return finish(error);
      }
      if (status === RUN_STATUS.done) return finish(null);
      if (status === RUN_STATUS.aborted) return finish(abortado());
      if (status === RUN_STATUS.deadlock) return finish(deadlockError(ex, compilado));
      if (status === RUN_STATUS.stepped) requestTurn();
      armHostTimer();
    }
    setFail(finish);
    setRequestTurn(requestTurn);
    senal?.addEventListener("abort", abortRun, { once: true });
    ex.prepare_run(ONE_THREAD, performance.now());
    // The first turn runs at once: what depends on nothing starts when the Run does.
    turn();
  });
}

/** How often the coordinator passes over the panel while a pool runs: about one frame of the display (unverified in LabVIEW). */
const DISPLAY_PASS_MS = 16;

/**
 * Runs a Run's clumps on a pool of threads (DT-063 §9–11), each behind one of `ports`
 * (pool-thread.mjs): this thread is the coordinator. It prepares the Run, hands every thread the
 * module and the memory, answers the external waits they ask for (a dialog, the debugger, an
 * instrument) and wakes their clumps with the answer,
 * passes over the panel at the display's pace, and turns Abort and failures into the memory's abort
 * flag. Resolves when every thread is done; rejects when the Run is aborted, deadlocks or fails.
 */
async function runOnPool({ ex, memory, bytes, compilado, separador, ports, externalWaits, onDebugValue, passOverPanel, senal }) {
  const module = await WebAssembly.compile(bytes);
  const threads = ports.length;
  const coordinatorThread = threads;
  let failure = null;
  const fail = (error) => {
    failure ??= error;
    ex.request_abort();
  };
  const abortRun = () => ex.request_abort();
  senal?.addEventListener("abort", abortRun, { once: true });
  passOverPanel();
  ex.prepare_run(threads, sharedClock());
  const pass = setInterval(passOverPanel, DISPLAY_PASS_MS);
  const answerExternalWait = ({ name, clump, args }) => {
    Promise.resolve()
      .then(() => externalWaits[name](...args))
      .then((answer) => ex.wake_external(coordinatorThread, clump, Number(answer) | 0), fail);
  };
  const runs = ports.map(
    (port, thread) =>
      new Promise((resolve) => {
        port.onmessage = ({ data }) => {
          if (data.externalWait) return answerExternalWait(data.externalWait);
          if (data.debugValue) return onDebugValue(...data.debugValue);
          if (data.error) fail(Object.assign(new Error(data.error.message), { abortado: data.error.abortado }));
          resolve();
        };
        port.postMessage({ start: { module, memory, thread, compilado: { disposicionError: compilado.disposicionError, disposicionVisa: compilado.disposicionVisa, callChain: compilado.callChain, debugNodes: compilado.debugNodes }, separador } });
      }),
  );
  try {
    await Promise.all(runs);
  } finally {
    clearInterval(pass);
    senal?.removeEventListener("abort", abortRun);
    for (const port of ports) port.close?.();
    passOverPanel();
  }
  if (failure) throw failure;
  const state = Atomics.load(new Int32Array(memory.buffer), (SCHEDULER + HEADER.runState) / 4);
  if (state === RUN_STATUS.aborted) throw abortado();
  if (state === RUN_STATUS.deadlock) throw deadlockError(ex, compilado);
}

/** The clock the threads of a pool share: each thread's `performance.now()` starts at its own origin. */
export const sharedClock = () => performance.timeOrigin + performance.now();

/** Why a parked clump waits, for the deadlock message. */
const PARK_REASONS = {
  [PARK_KIND.yield]: "yields its turn",
  [PARK_KIND.timer]: "waits for a timer",
  [PARK_KIND.lock]: "waits for its turn at a non-reentrant subVI",
  [PARK_KIND.join]: "waits for the clumps it started",
  [PARK_KIND.external]: "waits for an answer from outside",
};

/** The error of a Run whose clumps can no longer go on, naming each parked clump and what it waits for. */
function deadlockError(ex, compilado) {
  const memory = new DataView(ex.memoria.buffer);
  const names = [...compilado.clumps.map((_, index) => `c${index}`), ...compilado.planes.flatMap((plan, p) => plan.map((_, index) => `p${p}c${index}`))];
  const records = memory.getInt32(SCHEDULER + HEADER.clumps, true);
  const parked = names.filter((_, id) => memory.getInt32(records + id * CLUMP_BYTES + CLUMP.state, true) === STATE.parked);
  const reasonOf = (name) => PARK_REASONS[memory.getInt32(records + names.indexOf(name) * CLUMP_BYTES + CLUMP.parkKind, true)];
  const who = parked.map((name) => `${name} ${reasonOf(name)}`).join("; ");
  return Object.assign(new Error(`The VI can no longer go on: ${who || "no clump can run"}.`), { deadlock: parked });
}

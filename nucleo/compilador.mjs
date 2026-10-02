// Compila el diagrama de un VI a un módulo WebAssembly (DT-039).
//
// El diagrama se parte en clumps, como hace LabVIEW (DT-040): cada nodo que
// tarda (Wait (ms)…) va en el suyo, y los instantáneos se agrupan por los
// nodos que tardan de los que dependen. El módulo exporta un clump por función
// (`c0`, `c1`…) y el anfitrión los lanza por flujo de datos: cada uno cuando han
// acabado aquellos de los que recibe algo, y a la vez los que no dependen entre
// sí (nucleo/ejecutar.mjs). Los valores que pasan de un clump a otro viajan por
// globales del módulo; dentro de un clump, por locales.
//
// Los controles se leen y los indicadores se escriben por importaciones del
// panel (`panel.leer_f64(índice)`, `panel.escribir_f64(índice, valor)`…), en el
// momento en que el diagrama llega a ellos, así que el módulo no toca nada que
// no se le dé: es el anfitrión quien decide de dónde salen los valores y adónde
// van. El tiempo también se importa (`tiempo.esperar`, que suspende el clump).
//
// Los tipos son los que resuelve grafo.mjs, con sus coerciones: cada valor se
// convierte del tipo del cable al del terminal al que entra, como hace LabVIEW
// con su punto de coerción. Lo que el compilador aún no sabe emitir se devuelve
// como error, con el nodo; no se emite nada a medias.

import { ejecutable, orden, requerido, tipos } from "./grafo.mjs";
import { CONSTANTES_MATEMATICAS } from "./constantes.mjs";
import { FUNCIONES, analizar } from "./expresion.mjs";
import { ERROR, NUMERICOS, esArray, esCluster, esEntero, esNumerico, limites, representacion } from "./tipos.mjs";
import { codificar } from "./wasm.mjs";
import { CELDAS, CIMA, EXPORTADAS, bloqueCadena, funcionesMemoria, i32 } from "./memoria.mjs";

/** El tipo de WebAssembly con que se representa un tipo de Solder. */
export function tipoWasm(t) {
  if (t === "boolean") return "i32";
  // Una cadena viaja como su handle: la dirección de su celda en el data space;
  // un cluster, como la dirección de su bloque plano (DT-042).
  if (t === "string" || esCluster(t) || esArray(t)) return "i32";
  if (!esNumerico(t)) return null;
  const r = representacion(t);
  if (r === "number") return "f64";
  if (r === "sgl") return "f32";
  return NUMERICOS[r].bits === 64 ? "i64" : "i32";
}

const conSigno = (t) => NUMERICOS[representacion(t)]?.signo ?? true;
const bits = (t) => NUMERICOS[representacion(t)]?.bits ?? 32;
const esFlotante = (t) => esNumerico(t) && !esEntero(t);

/** Las importaciones del panel y de matemáticas, siempre en este orden: sus índices no cambian. */
const VT = ["i32", "i64", "f32", "f64"];
const IMPORTACIONES = [
  ...VT.map((vt) => ({ modulo: "panel", nombre: `leer_${vt}`, params: ["i32"], results: [vt] })),
  ...VT.map((vt) => ({ modulo: "panel", nombre: `escribir_${vt}`, params: ["i32", vt], results: [] })),
  // Una cadena del panel: el anfitrión la escribe en la celda del control o la lee del handle.
  { modulo: "panel", nombre: "leer_cad", params: ["i32", "i32"], results: [] },
  { modulo: "panel", nombre: "escribir_cad", params: ["i32", "i32"], results: [] },
  // Un cluster del panel: el anfitrión lo escribe en el bloque del control o lo lee del indicador.
  { modulo: "panel", nombre: "leer_clu", params: ["i32", "i32"], results: [] },
  // Un array del panel, igual: el anfitrión lo escribe en la celda del control o lo lee del handle.
  { modulo: "panel", nombre: "leer_arr", params: ["i32", "i32"], results: [] },
  { modulo: "panel", nombre: "escribir_arr", params: ["i32", "i32"], results: [] },
  { modulo: "panel", nombre: "escribir_clu", params: ["i32", "i32"], results: [] },
  // Las funciones de cadena que dependen del formato de LabVIEW, en JavaScript sobre la
  // misma memoria (DT-042 b): reciben handles y la celda donde dejar su resultado.
  ...[["sub", 4], ["reemplazar", 6]].map(([nombre, n]) => ({ modulo: "cad", nombre, params: Array(n).fill("i32"), results: [] })),
  ...["mayus", "minus", "invertir", "rotar"].map((nombre) => ({ modulo: "cad", nombre, params: ["i32", "i32"], results: [] })),
  { modulo: "cad", nombre: "recortar", params: ["i32", "i32", "i32"], results: [] },
  { modulo: "cad", nombre: "buscar", params: Array(6).fill("i32"), results: ["i32"] },
  { modulo: "cad", nombre: "extra", params: [], results: ["i32"] },
  { modulo: "cad", nombre: "cmp", params: ["i32", "i32"], results: ["i32"] },
  // celda, número, width y los bits de su tipo (un hexadecimal negativo es su complemento a dos).
  ...["dec", "hex", "oct"].map((nombre) => ({ modulo: "cad", nombre, params: ["i32", "f64", "i32", "i32"], results: [] })),
  ...["frac", "exp", "eng"].map((nombre) => ({ modulo: "cad", nombre, params: ["i32", "f64", "i32", "i32", "i32"], results: [] })),
  ...["leer_dec", "leer_hex", "leer_oct", "leer_frac"].map((nombre) => ({ modulo: "cad", nombre, params: ["i32", "i32"], results: ["f64"] })),
  // Las funciones de array de una dimensión con elementos de tamaño fijo, en JavaScript sobre la memoria.
  { modulo: "arr", nombre: "a_reemplazar", params: Array(5).fill("i32"), results: [] },
  { modulo: "arr", nombre: "a_insertar", params: Array(6).fill("i32"), results: [] },
  { modulo: "arr", nombre: "a_borrar", params: Array(7).fill("i32"), results: [] },
  { modulo: "arr", nombre: "a_ordenar", params: Array(4).fill("i32"), results: [] },
  { modulo: "arr", nombre: "a_rotar", params: Array(4).fill("i32"), results: [] },
  { modulo: "arr", nombre: "a_partir", params: Array(5).fill("i32"), results: [] },
  { modulo: "arr", nombre: "a_sumar", params: Array(6).fill("i32"), results: [] },
  { modulo: "math", nombre: "random", params: [], results: ["f64"] },
  { modulo: "math", nombre: "pow", params: ["f64", "f64"], results: ["f64"] },
  // Las funciones del Expression Node que WebAssembly no trae, con su número de argumentos.
  ...Object.entries(FUNCIONES)
    .filter(([, f]) => f.js)
    .map(([nombre, f]) => ({ modulo: "math", nombre: `fn_${nombre}`, params: Array(f.args).fill("f64"), results: ["f64"] })),
  // El reloj de milisegundos (U32) y las esperas, que suspenden el clump que las llama.
  { modulo: "tiempo", nombre: "reloj", params: [], results: ["i32"] },
  { modulo: "tiempo", nombre: "esperar", params: ["f64"], results: ["i32"] },
  { modulo: "tiempo", nombre: "esperar_multiplo", params: ["f64"], results: ["i32"] },
  // Al final de una vuelta, cuando se acaba su presupuesto: deja correr a los
  // demás clumps y al panel si ha pasado un rato, y da el presupuesto siguiente.
  { modulo: "tiempo", nombre: "ceder", params: [], results: ["i32"] },
  // Corre un subplan —los clumps de un cuerpo con varios nodos largos— y
  // espera a que acaben todos (suspende quien lo llama).
  { modulo: "tiempo", nombre: "correr_plan", params: ["i32"], results: ["i32"] },
  // Manejo automático de errores (DT-043): el error de un nodo con «error out» sin
  // cablear; el anfitrión saca el diálogo y espera Continue o Stop (suspende).
  { modulo: "tiempo", nombre: "error_automatico", params: ["i32", "i32"], results: ["i32"] },
  // Simple Error Handler (DT-043): decide el error (el de «error in» o el del código y el source),
  // saca su diálogo si lo hay y espera, y deja «error out», «source out» y «message» en sus
  // sitios. Da «error?». Params: error in, código, handle del source, tipo de diálogo, búfer de
  // «error out», celda de «source out», celda de «message».
  { modulo: "tiempo", nombre: "dialogo_error", params: ["i32", "i32", "i32", "i32", "i32", "i32", "i32"], results: ["i32"] },
];

/** Los nodos que tardan: cada uno corre en su clump y cede mientras espera. */
export const LARGOS = new Set(["wait-ms", "wait-until-next-ms-multiple", "simple-error-handler"]);
const idImport = (nombre) => IMPORTACIONES.findIndex((i) => i.nombre === nombre);

const ins = (op, arg) => (arg === undefined ? { op } : { op, arg });

/** Una constante de un tipo de Solder. */
/** Dónde van status, code y source en un cluster de error (DT-043). */
const ERR = (() => {
  const c = disposicion(ERROR).campos;
  return { status: c[0].off, code: c[1].off, source: c[2].off, tam: disposicion(ERROR).tam };
})();

/** Dónde está el cluster «cero» de este módulo: el valor por defecto de cualquier cluster (todo a 0, cadenas vacías). */
let zonaCero = 0;

/**
 * La disposición de un cluster en memoria, como en LabVIEW (DT-042 §3): sus
 * campos en orden, los escalares dentro, alineados a su tamaño; una cadena, como
 * la celda de su handle; un cluster dentro de otro, en línea. `tam` va alineado a 8.
 */
export function disposicion(t) {
  let off = 0;
  const campos = [];
  for (const f of t.cluster) {
    let tam;
    if (esCluster(f.type)) tam = disposicion(f.type).tam;
    else tam = ["f64", "i64"].includes(tipoWasm(f.type)) ? 8 : 4;
    const al = esCluster(f.type) ? 8 : tam;
    off = (off + al - 1) & ~(al - 1);
    campos.push({ off, nombre: f.name, tipo: f.type });
    off += tam;
  }
  return { tam: (off + 7) & ~7, campos };
}

function constante(t, v) {
  if (esCluster(t)) return [ins("i32.const", zonaCero)];
  // Un array vacío es el handle 0, como en LabVIEW.
  if (esArray(t)) return [ins("i32.const", 0)];
  const vt = tipoWasm(t);
  if (vt === "f64" || vt === "f32") return [ins(`${vt}.const`, Number(v))];
  if (vt === "i64") return [ins("i64.const", typeof v === "bigint" ? BigInt.asIntN(64, v) : BigInt(Math.trunc(Number(v))))];
  return [ins("i32.const", Number(v) | 0)];
}

/** Recorta un entero de 8 o 16 bits a su tamaño, como hace LabVIEW al desbordarse. */
function estrechar(t) {
  if (!esEntero(t) || bits(t) > 16) return [];
  if (conSigno(t)) return [ins(bits(t) === 8 ? "i32.extend8_s" : "i32.extend16_s")];
  return [ins("i32.const", bits(t) === 8 ? 0xff : 0xffff), ins("i32.and")];
}

/**
 * Convierte el valor de la pila de `desde` a `hacia`. De coma flotante a entero
 * se redondea al más cercano y se satura, como LabVIEW (ayuda de NI, «Numeric
 * Conversion»); entre enteros se conservan los bits bajos (sin comprobar en
 * LabVIEW: el tipo común nunca estrecha, así que hoy no ocurre).
 */
export function convertir(desde, hacia) {
  if (desde === hacia || JSON.stringify(desde) === JSON.stringify(hacia)) return [];
  const [a, b] = [tipoWasm(desde), tipoWasm(hacia)];
  if (desde === "boolean" || hacia === "boolean") return a === b ? [] : null;
  const r = [];
  if (esFlotante(desde) && esFlotante(hacia)) {
    if (a !== b) r.push(ins(b === "f64" ? "f64.promote_f32" : "f32.demote_f64"));
    return r;
  }
  if (!esFlotante(desde) && esFlotante(hacia)) {
    r.push(ins(`${b}.convert_${a}_${conSigno(desde) ? "s" : "u"}`));
    return r;
  }
  if (esFlotante(desde) && !esFlotante(hacia)) {
    r.push(ins(`${a}.nearest`));
    if (bits(hacia) <= 16) {
      const R = { 8: [-128, 127, 0, 255], 16: [-32768, 32767, 0, 65535] }[bits(hacia)];
      const [lo, hi] = conSigno(hacia) ? R.slice(0, 2) : R.slice(2);
      r.push(ins(`${a}.const`, lo), ins(`${a}.max`), ins(`${a}.const`, hi), ins(`${a}.min`));
    }
    r.push(ins(`${b}.trunc_sat_${a}_${conSigno(hacia) ? "s" : "u"}`));
    return r;
  }
  if (a === "i32" && b === "i64") r.push(ins(conSigno(desde) ? "i64.extend_i32_s" : "i64.extend_i32_u"));
  if (a === "i64" && b === "i32") r.push(ins("i32.wrap_i64"));
  return [...r, ...estrechar(hacia)];
}


// ——— Data Manipulation: operaciones sobre los bits de un entero ———
//
// Un entero de menos de 32 bits vive en un i32 con su signo (o ceros) extendido;
// los de 64, en un i64. Cada operación trabaja con los bits del ancho del tipo y
// vuelve a dejar el resultado en esa forma (`estrechar`).

/** Una constante entera del tipo de valor `vt` («i32» o «i64»). */
const kte = (vt, n) => ins(`${vt}.const`, vt === "i64" ? BigInt(n) : Number(n));
/** Los `bits` bajos a uno (sólo para anchos de menos de 32 bits). */
const mascara = (bits) => (1n << BigInt(bits)) - 1n;

/** Swap Bytes: los dos bytes de cada palabra de 16 bits. */
function intercambiarBytes(e) {
  const t = e.tIn(0);
  const [w, vt] = [bits(t), tipoWasm(t)];
  if (w === 8) return e.entrada(0);
  const m = w === 16 ? 0xff : w === 32 ? 0x00ff00ff : 0x00ff00ff00ff00ffn;
  const x = e.temporal(vt);
  return [
    ...e.entrada(0), ins("local.tee", x), kte(vt, m), ins(`${vt}.and`), kte(vt, 8), ins(`${vt}.shl`),
    ins("local.get", x), kte(vt, 8), ins(`${vt}.shr_u`), kte(vt, m), ins(`${vt}.and`), ins(`${vt}.or`),
    ...estrechar(t),
  ];
}

/** Swap Words: las dos palabras de 16 bits de cada entero largo. */
function intercambiarPalabras(e) {
  const t = e.tIn(0);
  const [w, vt] = [bits(t), tipoWasm(t)];
  if (w <= 16) return e.entrada(0);
  if (w === 32) return [...e.entrada(0), kte("i32", 16), ins("i32.rotl")];
  const x = e.temporal("i64");
  const m = 0x0000ffff0000ffffn;
  return [
    ...e.entrada(0), ins("local.tee", x), kte(vt, m), ins("i64.and"), kte(vt, 16), ins("i64.shl"),
    ins("local.get", x), kte(vt, 16), ins("i64.shr_u"), kte(vt, m), ins("i64.and"), ins("i64.or"),
  ];
}

/** El desplazamiento `y`, ya como i32. */
const desplazamiento = (e) => [...e.entrada(1), ...convertir(e.tIn(1), "i32")];

/** Rotate: x rotado a la izquierda y bits; con y negativo, a la derecha. */
function rotar(e) {
  const t = e.tIn(0);
  const w = bits(t);
  if (w === 32) return [...e.entrada(0), ...desplazamiento(e), ins("i32.rotl")];
  if (w === 64) return [...e.entrada(0), ...desplazamiento(e), ins("i64.extend_i32_s"), ins("i64.rotl")];
  const [v, n] = [e.temporal("i32"), e.temporal("i32")];
  const m = Number(mascara(w));
  return [
    ...e.entrada(0), kte("i32", m), ins("i32.and"), ins("local.set", v),
    ...desplazamiento(e), kte("i32", w - 1), ins("i32.and"), ins("local.set", n),
    ins("local.get", v), ins("local.get", n), ins("i32.shl"),
    ins("local.get", v), kte("i32", w), ins("local.get", n), ins("i32.sub"), ins("i32.shr_u"),
    ins("i32.or"), kte("i32", m), ins("i32.and"), ...estrechar(t),
  ];
}

/** Logical Shift: x << y, con ceros; a la derecha si y es negativo; cero si y se sale del ancho. */
function desplazar(e) {
  const t = e.tIn(0);
  const [w, vt] = [bits(t), tipoWasm(t)];
  const [v, y] = [e.temporal(vt), e.temporal("i32")];
  const ext = vt === "i64" ? [ins("i64.extend_i32_s")] : [];
  const enteroMascara = w < 32 ? [kte("i32", Number(mascara(w))), ins("i32.and")] : [];
  return [
    ...e.entrada(0), ...enteroMascara, ins("local.set", v),
    ...desplazamiento(e), ins("local.set", y),
    // Dentro de rango: -(w-1) <= y <= w-1  ⇔  (y + w-1) <u 2w-1.
    ins("local.get", v), ins("local.get", y), ...ext, ins(`${vt}.shl`),
    ins("local.get", v), kte("i32", 0), ins("local.get", y), ins("i32.sub"), ...ext, ins(`${vt}.shr_u`),
    ins("local.get", y), kte("i32", -1), ins("i32.gt_s"), ins("select"),
    kte(vt, 0),
    ins("local.get", y), kte("i32", w - 1), ins("i32.add"), kte("i32", 2 * w - 1), ins("i32.lt_u"), ins("select"),
    ...estrechar(t),
  ];
}

/** Rotate Left / Right With Carry: sale [acarreo, valor]. */
const rotarConAcarreo = (haciaLaIzquierda) => (e) => {
  const t = e.tIn(1);
  const [w, vt] = [bits(t), tipoWasm(t)];
  const [x, c] = [e.temporal(vt), e.temporal("i32")];
  const aVt = vt === "i64" ? [ins("i64.extend_i32_u")] : [];
  const aI32 = vt === "i64" ? [ins("i32.wrap_i64")] : [];
  const entra = [...e.entrada(1), ...(haciaLaIzquierda || w >= 32 ? [] : [kte("i32", Number(mascara(w))), ins("i32.and")]), ins("local.set", x), ...e.entrada(0), ins("local.set", c)];
  if (haciaLaIzquierda) {
    return [
      ...entra,
      ins("local.get", x), kte(vt, w - 1), ins(`${vt}.shr_u`), ...aI32, kte("i32", 1), ins("i32.and"),
      ins("local.get", x), kte(vt, 1), ins(`${vt}.shl`), ins("local.get", c), ...aVt, ins(`${vt}.or`), ...estrechar(t),
    ];
  }
  return [
    ...entra,
    ins("local.get", x), kte(vt, 1), ins(`${vt}.and`), ...aI32,
    ins("local.get", x), kte(vt, 1), ins(`${vt}.shr_u`), ins("local.get", c), ...aVt, kte(vt, w - 1), ins(`${vt}.shl`), ins(`${vt}.or`), ...estrechar(t),
  ];
};

/** Split Number: [hi, lo], cada uno sin signo y de la mitad de bits. */
function partirNumero(e) {
  const t = e.tIn(0);
  const [w, vt] = [bits(t), tipoWasm(t)];
  const x = e.temporal(vt);
  const mitad = w / 2;
  if (w === 64) return [...e.entrada(0), ins("local.set", x), ins("local.get", x), kte("i64", 32), ins("i64.shr_u"), ins("i32.wrap_i64"), ins("local.get", x), ins("i32.wrap_i64")];
  const m = Number(mascara(mitad));
  return [
    ...e.entrada(0), ins("local.set", x),
    ins("local.get", x), kte("i32", mitad), ins("i32.shr_u"), kte("i32", m), ins("i32.and"),
    ins("local.get", x), kte("i32", m), ins("i32.and"),
  ];
}

/** Join Numbers: (hi.lo), sin signo y del doble de bits. */
function juntarNumeros(e) {
  const t = e.tIn(0);
  const w = bits(t);
  if (w === 32) return [...e.entrada(0), ins("i64.extend_i32_u"), kte("i64", 32), ins("i64.shl"), ...e.entrada(1), ins("i64.extend_i32_u"), ins("i64.or")];
  const m = Number(mascara(w));
  return [
    ...e.entrada(0), kte("i32", m), ins("i32.and"), kte("i32", w), ins("i32.shl"),
    ...e.entrada(1), kte("i32", m), ins("i32.and"), ins("i32.or"),
  ];
}

/** Mantissa & Exponent: número = mantisa * 2^exponente, con 1 <= |mantisa| < 2; 0 da (0, 0). */
function mantisaYExponente(e) {
  const t = e.tOut(0);
  const f32 = tipoWasm(t) === "f32";
  const [vt, ft] = f32 ? ["i32", "f32"] : ["i64", "f64"];
  const [desp, anchoExp, sesgo] = f32 ? [23, 0xff, 127] : [52, 0x7ff, 1023];
  const [x, ex] = [e.temporal(vt), e.temporal(vt)];
  const aVt = f32 ? [ins("i32.reinterpret_f32")] : [ins("i64.reinterpret_f64")];
  const deVt = f32 ? [ins("f32.reinterpret_i32")] : [ins("f64.reinterpret_i64")];
  const cero = [ins(`${ft}.const`, 0)];
  const exponente = [ins("local.get", x), kte(vt, desp), ins(`${vt}.shr_u`), kte(vt, anchoExp), ins(`${vt}.and`), ins("local.set", ex)];
  const esCero = [ins("local.get", ex), ins(`${vt}.eqz`)];
  const exp0 = [ins("local.get", ex), kte(vt, sesgo), ins(`${vt}.sub`), ins(f32 ? "f32.convert_i32_s" : "f64.convert_i64_s")];
  // La mantisa: los bits del número con el exponente puesto a 0 (el sesgo).
  const limpia = [ins("local.get", x), kte(vt, f32 ? ~(0xff << 23) : ~(0x7ffn << 52n)), ins(`${vt}.and`), kte(vt, f32 ? sesgo << 23 : BigInt(sesgo) << 52n), ins(`${vt}.or`), ...deVt];
  // `select` devuelve el primero si la condición es verdadera: con exponente 0, el cero.
  return [
    ...e.entrada(0), ...aVt, ins("local.set", x), ...exponente,
    ...cero, ...limpia, ...esCero, ins("select"),
    ...cero, ...exp0, ...esCero, ins("select"),
  ];
}


/**
 * Expression Node: la fórmula se calcula en DBL y el resultado vuelve al tipo
 * del terminal, redondeado al par (comprobado en LabVIEW: con un I32, 3/2 da 2,
 * 5/2 da 2 y 5*2.7 da 14). `^` es el o exclusivo y sólo vale con enteros.
 */
function expresion(e) {
  const r = analizar(e.nodo.config?.expression ?? "x");
  if (r.error) throw new Error(`la expresión «${e.nodo.config?.expression}» no vale: ${r.error}`);
  if (r.xor && !esEntero(e.tIn(0))) throw new Error("el o exclusivo «^» necesita un entero (Integer type required); la potencia es «**»");
  const x = e.temporal("f64");
  const aEntero = [ins("f64.nearest"), ins("i64.trunc_sat_f64_s")];
  const emitirAst = (a) => {
    if ("n" in a) return [ins("f64.const", a.n)];
    if ("var" in a) return [ins("local.get", x)];
    if ("neg" in a) return [...emitirAst(a.a), ins("f64.neg")];
    if ("fn" in a) {
      const f = FUNCIONES[a.fn];
      return [...a.args.flatMap(emitirAst), f.wasm ? ins(f.wasm) : ins("call", idImport(`fn_${a.fn}`))];
    }
    const [ia, ib] = [emitirAst(a.a), emitirAst(a.b)];
    if (a.op === "**") return [...ia, ...ib, ins("call", idImport("pow"))];
    if (a.op === "%") return [...ia, ...ib, ins("call", idImport("fn_mod"))];
    if (a.op === "^") return [...ia, ...aEntero, ...ib, ...aEntero, ins("i64.xor"), ins("f64.convert_i64_s")];
    return [...ia, ...ib, ins({ "+": "f64.add", "-": "f64.sub", "*": "f64.mul", "/": "f64.div" }[a.op])];
  };
  return [...e.entrada(0), ...convertir(e.tIn(0), "number"), ins("local.set", x), ...emitirAst(r.ast), ...convertir("number", e.tOut(0))];
}

// ——— Cadenas ———

const get = (l) => ins("local.get", l);
const k32 = (n) => ins("i32.const", n);

/** Concatenate Strings: todas sus entradas, una tras otra, en la celda del nodo. */
function concatenar(e) {
  const n = e.cat.puertos(e.nodo).in.length;
  const [hs, ls, p, celda] = [Array.from({ length: n }, () => e.temporal("i32")), Array.from({ length: n }, () => e.temporal("i32")), e.temporal("i32"), e.celda()];
  const salida = [];
  for (let i = 0; i < n; i++) salida.push(...e.entrada(i), ins("local.set", hs[i]), get(hs[i]), llamarMemoria("longitud"), ins("local.set", ls[i]));
  // total = suma de las longitudes
  salida.push(k32(celda), k32(4));
  for (let i = 0; i < n; i++) salida.push(get(ls[i]), ins("i32.add"));
  salida.push(llamarMemoria("redimensionar"), ins("local.tee", p));
  salida.push(k32(0));
  for (let i = 0; i < n; i++) salida.push(get(ls[i]), ins("i32.add"));
  salida.push(ins("i32.store"));
  // los bytes: p + 4 + (longitudes de las anteriores)
  for (let i = 0; i < n; i++) {
    salida.push(get(p), k32(4), ins("i32.add"));
    for (let j = 0; j < i; j++) salida.push(get(ls[j]), ins("i32.add"));
    salida.push(get(hs[i]), llamarMemoria("datos"), get(ls[i]), ins("memory.copy"));
  }
  salida.push(k32(celda));
  return salida;
}

/** Una función de cadena del anfitrión: deja su resultado en la celda del nodo y su handle en la pila. */
function llamarCad(e, nombre, entradas) {
  const celda = e.celda();
  return [k32(celda), ...entradas.flatMap((i) => e.entrada(i)), ins("call", idImport(nombre)), k32(celda)];
}

/** Number To Decimal/Hexadecimal/Octal String: número (f64) y width. */
function numeroACadena(e, nombre) {
  const celda = e.celda();
  const t = e.tIn(0);
  return [k32(celda), ...e.entrada(0), ...convertir(t, "number"), ...e.entrada(1), k32(esEntero(t) ? bits(t) : 64), ins("call", idImport(nombre)), k32(celda)];
}

/** Number To Fractional/Exponential/Engineering String: use system decimal point?, número, width y precision. */
function numeroACadenaFlotante(e, nombre) {
  const celda = e.celda();
  return [k32(celda), ...e.entrada(1), ...convertir(e.tIn(1), "number"), ...e.entrada(2), ...e.entrada(3), ...e.entrada(0), ins("call", idImport(nombre)), k32(celda)];
}

/**
 * Decimal/Hexadecimal/Octal/Fract-Exp String To Number: `primera` es la posición
 * de string entre las entradas (la de default es la última). Si no hay número,
 * sale default y offset past number es offset.
 */
function cadenaANumero(e, nombre, primera) {
  const [v, n] = [e.temporal("f64"), e.temporal("i32")];
  const t = e.tOut(1);
  return [
    ...e.entrada(primera), ...e.entrada(primera + 1), ins("call", idImport(nombre)), ins("local.set", v),
    ins("call", idImport("extra")), ins("local.set", n),
    get(n),
    ...e.entrada(primera + 2), ...convertir(e.tIn(primera + 2), t),
    get(v), ...convertir("number", t),
    get(v), get(v), ins("f64.ne"), ins("select"),
  ];
}

/** Las funciones de carácter: el primer byte de una cadena (-1 si está vacía) o el código de un número. */
function claseDeCaracter(e, prueba) {
  const c = e.temporal("i32");
  const cargar =
    e.tIn(0) === "string"
      ? [...e.entrada(0), ins("local.tee", c), llamarMemoria("datos"), ins("i32.load8_u"), k32(-1), get(c), llamarMemoria("longitud"), ins("select")]
      : [...e.entrada(0), ...convertir(e.tIn(0), "i32")];
  return [...cargar, ins("local.set", c), ...prueba(c)];
}

/**
 * Lo que emite cada bloque. Recibe `e`: `e.entrada(i)` deja en la pila la
 * entrada i ya en el tipo de su terminal, `e.tIn(i)` y `e.tOut(j)` son esos
 * tipos, `e.temporal(vt)` reserva un local y `e.nodo` es el nodo. Devuelve las
 * instrucciones que dejan en la pila sus salidas, en orden.
 */
const BLOQUES = {
  const: (e) => constante(e.tOut(0), e.nodo.config?.value ?? 0),
  "num-const": (e) => constante(e.tOut(0), e.nodo.config?.value ?? 0),
  "bool-const": (e) => [ins("i32.const", e.nodo.config?.value ? 1 : 0)],
  "enum-const": (e) => constante(e.tOut(0), e.nodo.config?.value ?? 0),
  "ring-const": (e) => constante(e.tOut(0), e.nodo.config?.value ?? 0),
  // Range Limits For Type: sólo importa el tipo cableado, no su valor.
  "range-limits-for-type": (e) => {
    const { min, max } = limites(e.tIn(0));
    return [...constante(e.tOut(0), max), ...constante(e.tOut(1), min)];
  },
  "positive-infinity": () => [ins("f64.const", Infinity)],
  "negative-infinity": () => [ins("f64.const", -Infinity)],
  "machine-epsilon": () => [ins("f64.const", Number.EPSILON)],
  ...Object.fromEntries(Object.entries(CONSTANTES_MATEMATICAS).map(([n, k]) => [n, () => [ins("f64.const", k.valor)]])),
  "not-a-number": () => [ins("f64.const", NaN)],
  "random-number": () => [ins("call", idImport("random"))],
  // Cadenas (DT-042): la constante vive en la zona estática; las demás escriben en su celda.
  "str-const": (e) => [ins("i32.const", e.cadena(e.nodo.config?.value ?? ""))],
  "string-length": (e) => [...e.entrada(0), llamarMemoria("longitud")],
  "concatenate-strings": concatenar,
  "string-subset": (e) => llamarCad(e, "sub", [0, 1, 2]),
  "to-upper-case": (e) => llamarCad(e, "mayus", [0]),
  "to-lower-case": (e) => llamarCad(e, "minus", [0]),
  "reverse-string": (e) => llamarCad(e, "invertir", [0]),
  "rotate-string": (e) => llamarCad(e, "rotar", [0]),
  "trim-whitespace": (e) => llamarCad(e, "recortar", [1, 0]),
  "replace-substring": (e) => {
    // Sin cablear length, son los bytes de substring.
    const largo = e.cableada(3) ? e.entrada(3) : [...e.entrada(1), llamarMemoria("longitud")];
    const [c1, c2] = [e.celda(), e.celda()];
    return [ins("i32.const", c1), ins("i32.const", c2), ...e.entrada(0), ...e.entrada(1), ...e.entrada(2), ...largo, ins("call", idImport("reemplazar")), ins("i32.const", c1), ins("i32.const", c2)];
  },
  "search-and-replace-string": (e) => {
    const [celda, n] = [e.celda(), e.temporal("i32")];
    // ignore case? es el bit 0 y replace all?, el bit 1.
    return [
      ins("i32.const", celda), ...e.entrada(3), ...e.entrada(4), ...e.entrada(5), ...e.entrada(6),
      ...e.entrada(1), ...e.entrada(2), ins("i32.const", 1), ins("i32.shl"), ins("i32.or"),
      ins("call", idImport("buscar")), ins("local.set", n),
      ins("i32.const", celda), ins("local.get", n), ins("call", idImport("extra")),
      ...e.entrada(7), // error out: pasa el que entra (un aviso sigue su camino)
    ];
  },
  // Number/String Conversion. El número llega como f64 y el anfitrión lo formatea (DT-042 b).
  "number-to-decimal-string": (e) => numeroACadena(e, "dec"),
  "number-to-hexadecimal-string": (e) => numeroACadena(e, "hex"),
  "number-to-octal-string": (e) => numeroACadena(e, "oct"),
  "number-to-fractional-string": (e) => numeroACadenaFlotante(e, "frac"),
  "number-to-exponential-string": (e) => numeroACadenaFlotante(e, "exp"),
  "number-to-engineering-string": (e) => numeroACadenaFlotante(e, "eng"),
  "decimal-string-to-number": (e) => cadenaANumero(e, "leer_dec", 0),
  "hexadecimal-string-to-number": (e) => cadenaANumero(e, "leer_hex", 0),
  "octal-string-to-number": (e) => cadenaANumero(e, "leer_oct", 0),
  "fract-exp-string-to-number": (e) => cadenaANumero(e, "leer_frac", 1),
  // Las constantes de cadena fijas de la paleta String.
  ...Object.fromEntries(
    ["empty-string-constant", "space-constant", "tab-constant", "carriage-return-constant", "line-feed-constant", "end-of-line-constant"].map((n) => [n, (e) => [ins("i32.const", e.cadena(e.cat.bloque(n).value))]]),
  ),
  "empty-string-path": (e) => [...e.entrada(0), llamarMemoria("longitud"), ins("i32.eqz")],
  "decimal-digit": (e) => claseDeCaracter(e, (c) => [get(c), k32(48), ins("i32.sub"), k32(10), ins("i32.lt_u")]),
  "octal-digit": (e) => claseDeCaracter(e, (c) => [get(c), k32(48), ins("i32.sub"), k32(8), ins("i32.lt_u")]),
  "hex-digit": (e) => claseDeCaracter(e, (c) => [
    get(c), k32(48), ins("i32.sub"), k32(10), ins("i32.lt_u"),
    get(c), k32(32), ins("i32.or"), k32(97), ins("i32.sub"), k32(6), ins("i32.lt_u"), ins("i32.or"),
  ]),
  // Espacio, HT, LF, VT, FF y CR (la ayuda de NI: «space, h/v tab, cr, lf, ff»).
  "white-space": (e) => claseDeCaracter(e, (c) => [get(c), k32(32), ins("i32.eq"), get(c), k32(9), ins("i32.sub"), k32(5), ins("i32.lt_u"), ins("i32.or")]),
  // Clusters (DT-042): Bundle escribe sus campos en su bloque; Unbundle los lee sin copiar.
  bundle: (e) => {
    const d = disposicion(e.tOut(0));
    const b = e.bufer(d.tam);
    const r = [];
    d.campos.forEach((c, i) => {
      if (porReferencia(c.tipo)) r.push(...copiarValor(c.tipo, e.entrada(i), b + c.off, e.temporal));
      else r.push(ins("i32.const", b + c.off), ...e.entrada(i), ins(`${tipoWasm(c.tipo)}.store`));
    });
    return [...r, ins("i32.const", b)];
  },
  unbundle: (e) => {
    const x = e.temporal("i32");
    const r = [...e.entrada(0), ins("local.set", x)];
    for (const c of disposicion(e.tIn(0)).campos) {
      if (porReferencia(c.tipo)) r.push(ins("local.get", x), ins("i32.const", c.off), ins("i32.add"));
      else r.push(ins("local.get", x), ins(`${tipoWasm(c.tipo)}.load`, c.off));
    }
    return r;
  },
  // El cluster de error (DT-043).
  "error-cluster-constant": (e) => [ins("i32.const", e.clusterConstante(ERROR, e.nodo.config?.value ?? {}))],
  "clear-errors": (e) => {
    // Sin código específico, todo a cero; con él, sólo si coincide (sin comprobar en LabVIEW).
    const [x, k, borra] = [e.temporal("i32"), e.temporal("i32"), e.temporal("i32")];
    const b = e.bufer(ERR.tam);
    const g = (l) => ins("local.get", l);
    return [
      ...e.entrada(0), ins("local.set", k), ...e.entrada(1), ins("local.set", x),
      g(k), ins("i32.eqz"), g(x), ins("i32.load", ERR.code), g(k), ins("i32.eq"), ins("i32.or"), ins("local.set", borra),
      g(borra), ins("if"),
      ins("i32.const", b), ins("i32.const", 0), ins("i32.store", ERR.status), ins("i32.const", b), ins("i32.const", 0), ins("i32.store", ERR.code),
      ...copiarValor("string", [ins("i32.const", 0)], b + ERR.source, e.temporal),
      ins("else"), ...copiarValor(ERROR, [g(x)], b, e.temporal), ins("end"),
      g(k), ins("i32.const", 0), ins("i32.ne"), g(borra), ins("i32.and"),
      ins("i32.const", b),
    ];
  },
  "merge-errors": (e) => {
    // Los errores antes que los avisos; en cada clase, el primero de arriba. Sin ninguno, la primera entrada.
    const n = e.cat.puertos(e.nodo).in.length;
    const [r, hay] = [e.temporal("i32"), e.temporal("i32")];
    const ent = Array.from({ length: n }, () => e.temporal("i32"));
    const c = [];
    ent.forEach((l, i) => c.push(...e.entrada(i), ins("local.set", l)));
    c.push(ins("local.get", ent[0]), ins("local.set", r), ins("i32.const", 0), ins("local.set", hay));
    for (const campo of [ERR.status, ERR.code]) {
      for (const l of ent) {
        c.push(ins("local.get", hay), ins("i32.eqz"), ins("local.get", l), ins("i32.load", campo), ins("i32.const", 0), ins("i32.ne"), ins("i32.and"),
          ins("if"), ins("local.get", l), ins("local.set", r), ins("i32.const", 1), ins("local.set", hay), ins("end"));
      }
    }
    return [...c, ins("local.get", r)];
  },
  "error-cluster-from-error-code": (e) => {
    // Un código distinto de 0: un error (o un aviso) con el mensaje como source (sin comprobar en LabVIEW qué source pone).
    // Con 0, pasa el error que entra. El envoltorio de «pasa-error» ya trata un error a la entrada.
    const b = e.bufer(ERR.tam);
    const [code, x] = [e.temporal("i32"), e.temporal("i32")];
    return [
      ...e.entrada(4), ins("local.set", x), ...e.entrada(2), ins("local.tee", code),
      ins("if"),
      ins("i32.const", b), ...e.entrada(0), ins("i32.eqz"), ins("i32.store", ERR.status),
      ins("i32.const", b), ins("local.get", code), ins("i32.store", ERR.code),
      ...copiarValor("string", e.entrada(3), b + ERR.source, e.temporal),
      ins("else"), ...copiarValor(ERROR, [ins("local.get", x)], b, e.temporal), ins("end"),
      ins("i32.const", b),
    ];
  },
  "simple-error-handler": (e) => {
    // Todo lo decide el anfitrión (nucleo/ejecutar.mjs): el diálogo espera al usuario.
    const [b, src, msg] = [e.bufer(ERR.tam), e.celda(), e.celda()];
    return [
      ...e.entrada(3), ...e.entrada(0), ...e.entrada(1), ...e.entrada(2),
      ins("i32.const", b), ins("i32.const", src), ins("i32.const", msg), ins("call", idImport("dialogo_error")),
      ins("i32.const", b), ins("i32.load", ERR.code), ins("i32.const", src), ins("i32.const", b), ins("i32.const", msg),
    ];
  },
  // Arrays de una dimensión (DT-042): un bloque [n][relleno][elementos]; cada nodo, en su celda.
  "array-size": (e) => [...e.entrada(0), llamarMemoria("longitud")],
  "index-array": (e) => {
    // Fuera de rango, el valor por defecto del tipo (spec/04 §6).
    const t = e.tOut(0);
    const el = elemento(t);
    const [h, i, r] = [e.temporal("i32"), e.temporal("i32"), e.temporal(tipoWasm(t))];
    const g = (l) => ins("local.get", l);
    return [
      ...e.entrada(0), ins("local.set", h), ...e.entrada(1), ins("local.set", i),
      ...constante(t, 0), ins("local.set", r),
      g(i), ins("i32.const", 0), ins("i32.ge_s"), g(i), g(h), llamarMemoria("longitud"), ins("i32.lt_s"), ins("i32.and"),
      ins("if"), ...cargarElemento(t, [g(h), llamarMemoria("datos8"), g(i), ins("i32.const", el.tam), ins("i32.mul"), ins("i32.add")]), ins("local.set", r), ins("end"),
      g(r),
    ];
  },
  "build-array": (e) => {
    // Un elemento se añade; un array se concatena. Varios arrays sin «Concatenate Inputs» dan un 2D, todavía no.
    const t = e.tOut(0).array;
    const el = elemento(t);
    const n = e.cat.puertos(e.nodo).in.length;
    const esArr = Array.from({ length: n }, (_, i) => esArray(e.tIn(i)));
    if (esArr.every(Boolean) && !e.nodo.config?.concatenate) throw new Error("Build Array con arrays sin «Concatenate Inputs» da un array de 2 dimensiones: todavía no (M6).");
    const celda = e.celda();
    const ent = esArr.map(() => e.temporal("i32"));
    const valores = esArr.map((a) => (a ? null : e.temporal(tipoWasm(t))));
    const [total, d] = [e.temporal("i32"), e.temporal("i32")];
    const g = (l) => ins("local.get", l);
    const c = [];
    esArr.forEach((a, i) => c.push(...e.entrada(i), ins("local.set", a ? ent[i] : valores[i])));
    c.push(ins("i32.const", 0), ins("local.set", total));
    esArr.forEach((a, i) => c.push(g(total), ...(a ? [g(ent[i]), llamarMemoria("longitud")] : [ins("i32.const", 1)]), ins("i32.add"), ins("local.set", total)));
    c.push(ins("i32.const", celda), g(total), ins("i32.const", el.tam), ins("i32.const", el.ref ? 1 : 0), llamarMemoria("nuevo_array"), ins("local.set", d));
    esArr.forEach((a, i) => {
      if (!a) {
        c.push(...guardarElemento(t, [g(d)], [g(valores[i])], e.temporal), g(d), ins("i32.const", el.tam), ins("i32.add"), ins("local.set", d));
        return;
      }
      // Un array entero: sus elementos, detrás de lo que ya hay.
      const [m, o, j] = [e.temporal("i32"), e.temporal("i32"), e.temporal("i32")];
      c.push(g(ent[i]), llamarMemoria("longitud"), ins("local.set", m), g(ent[i]), llamarMemoria("datos8"), ins("local.set", o));
      if (!el.ref) c.push(g(d), g(o), g(m), ins("i32.const", el.tam), ins("i32.mul"), ins("memory.copy"));
      else {
        const paso = (l) => [g(l), g(j), ins("i32.const", el.tam), ins("i32.mul"), ins("i32.add")];
        c.push(ins("i32.const", 0), ins("local.set", j), ins("block"), ins("loop"), g(j), g(m), ins("i32.ge_s"), ins("br_if", 1),
          ...copiarA(t, paso(o), paso(d), e.temporal), g(j), ins("i32.const", 1), ins("i32.add"), ins("local.set", j), ins("br", 0), ins("end"), ins("end"));
      }
      c.push(g(d), g(m), ins("i32.const", el.tam), ins("i32.mul"), ins("i32.add"), ins("local.set", d));
    });
    return [...c, ins("i32.const", celda)];
  },
  "initialize-array": (e) => {
    const t = e.tIn(0);
    const el = elemento(t);
    const celda = e.celda();
    const [v, n, d, i] = [e.temporal(tipoWasm(t)), e.temporal("i32"), e.temporal("i32"), e.temporal("i32")];
    const g = (l) => ins("local.get", l);
    const sitio = [g(d), g(i), ins("i32.const", el.tam), ins("i32.mul"), ins("i32.add")];
    return [
      ...e.entrada(0), ins("local.set", v), ...e.entrada(1), ins("local.tee", n), ins("i32.const", 0), g(n), ins("i32.const", 0), ins("i32.gt_s"), ins("select"), ins("local.set", n),
      ins("i32.const", celda), g(n), ins("i32.const", el.tam), ins("i32.const", el.ref ? 1 : 0), llamarMemoria("nuevo_array"), ins("local.set", d),
      ins("i32.const", 0), ins("local.set", i), ins("block"), ins("loop"), g(i), g(n), ins("i32.ge_s"), ins("br_if", 1),
      ...guardarElemento(t, sitio, [g(v)], e.temporal), g(i), ins("i32.const", 1), ins("i32.add"), ins("local.set", i), ins("br", 0), ins("end"), ins("end"),
      ins("i32.const", celda),
    ];
  },
  "array-subset": (e) => {
    // Desde `index` (recortado a [0, n]), `length` elementos (recortado a lo que queda; sin cablear, todo lo que queda).
    const t = e.tOut(0).array;
    const el = elemento(t);
    const celda = e.celda();
    const [h, n, a, l, o, d, i] = Array.from({ length: 7 }, () => e.temporal("i32"));
    const g = (x) => ins("local.get", x);
    const c = [
      ...e.entrada(0), ins("local.tee", h), llamarMemoria("longitud"), ins("local.set", n),
      ...e.entrada(1), ins("local.set", a),
      g(a), ins("i32.const", 0), g(a), ins("i32.const", 0), ins("i32.gt_s"), ins("select"), ins("local.set", a),
      g(a), g(n), g(a), g(n), ins("i32.lt_s"), ins("select"), ins("local.set", a),
      ...(e.cableada(2) ? e.entrada(2) : [g(n)]), ins("local.set", l),
      g(l), ins("i32.const", 0), g(l), ins("i32.const", 0), ins("i32.gt_s"), ins("select"), ins("local.set", l),
      g(l), g(n), g(a), ins("i32.sub"), g(l), g(n), g(a), ins("i32.sub"), ins("i32.lt_s"), ins("select"), ins("local.set", l),
      g(h), llamarMemoria("datos8"), g(a), ins("i32.const", el.tam), ins("i32.mul"), ins("i32.add"), ins("local.set", o),
      ins("i32.const", celda), g(l), ins("i32.const", el.tam), ins("i32.const", el.ref ? 1 : 0), llamarMemoria("nuevo_array"), ins("local.set", d),
    ];
    if (!el.ref) c.push(g(d), g(o), g(l), ins("i32.const", el.tam), ins("i32.mul"), ins("memory.copy"));
    else {
      const paso = (x) => [g(x), g(i), ins("i32.const", el.tam), ins("i32.mul"), ins("i32.add")];
      c.push(ins("i32.const", 0), ins("local.set", i), ins("block"), ins("loop"), g(i), g(l), ins("i32.ge_s"), ins("br_if", 1),
        ...copiarA(t, paso(o), paso(d), e.temporal), g(i), ins("i32.const", 1), ins("i32.add"), ins("local.set", i), ins("br", 0), ins("end"), ins("end"));
    }
    return [...c, ins("i32.const", celda)];
  },
  "reverse-1d-array": (e) => {
    const t = e.tOut(0).array;
    const el = elemento(t);
    const celda = e.celda();
    const [h, n, o, d, i] = Array.from({ length: 5 }, () => e.temporal("i32"));
    const g = (x) => ins("local.get", x);
    const origen = [g(o), g(n), ins("i32.const", 1), ins("i32.sub"), g(i), ins("i32.sub"), ins("i32.const", el.tam), ins("i32.mul"), ins("i32.add")];
    const destino = [g(d), g(i), ins("i32.const", el.tam), ins("i32.mul"), ins("i32.add")];
    return [
      ...e.entrada(0), ins("local.tee", h), llamarMemoria("longitud"), ins("local.set", n), g(h), llamarMemoria("datos8"), ins("local.set", o),
      ins("i32.const", celda), g(n), ins("i32.const", el.tam), ins("i32.const", el.ref ? 1 : 0), llamarMemoria("nuevo_array"), ins("local.set", d),
      ins("i32.const", 0), ins("local.set", i), ins("block"), ins("loop"), g(i), g(n), ins("i32.ge_s"), ins("br_if", 1),
      ...(el.ref ? copiarA(t, origen, destino, e.temporal) : [...destino, ...origen, ins(el.carga), ins(el.guarda)]),
      g(i), ins("i32.const", 1), ins("i32.add"), ins("local.set", i), ins("br", 0), ins("end"), ins("end"),
      ins("i32.const", celda),
    ];
  },
  "array-max-min": (e) => {
    // Medido en LabVIEW: el primero en caso de empate; un NaN no cuenta; vacío, 0 y −1.
    const t = e.tOut(0);
    const el = elemento(t);
    const vt = tipoWasm(t);
    const real = vt === "f64" || vt === "f32";
    const [h, n, o, i, mi, ni] = Array.from({ length: 6 }, () => e.temporal("i32"));
    const [x, mx, mn] = [e.temporal(vt), e.temporal(vt), e.temporal(vt)];
    const g = (l) => ins("local.get", l);
    return [
      ...e.entrada(0), ins("local.tee", h), llamarMemoria("longitud"), ins("local.set", n), g(h), llamarMemoria("datos8"), ins("local.set", o),
      ...constante(t, 0), ins("local.set", mx), ...constante(t, 0), ins("local.set", mn), ins("i32.const", -1), ins("local.set", mi), ins("i32.const", -1), ins("local.set", ni),
      ins("i32.const", 0), ins("local.set", i), ins("block"), ins("loop"), g(i), g(n), ins("i32.ge_s"), ins("br_if", 1),
      g(o), g(i), ins("i32.const", el.tam), ins("i32.mul"), ins("i32.add"), ins(el.carga), ins("local.set", x),
      ...(real ? [g(x), g(x), ins(`${vt}.eq`), ins("if")] : []),
      g(mi), ins("i32.const", 0), ins("i32.lt_s"), g(x), g(mx), instruccionComparar(t, "gt"), ins("i32.or"), ins("if"), g(x), ins("local.set", mx), g(i), ins("local.set", mi), ins("end"),
      g(ni), ins("i32.const", 0), ins("i32.lt_s"), g(x), g(mn), instruccionComparar(t, "lt"), ins("i32.or"), ins("if"), g(x), ins("local.set", mn), g(i), ins("local.set", ni), ins("end"),
      ...(real ? [ins("end")] : []),
      g(i), ins("i32.const", 1), ins("i32.add"), ins("local.set", i), ins("br", 0), ins("end"), ins("end"),
      g(mx), g(mi), g(mn), g(ni),
    ];
  },
  "search-1d-array": (e) => {
    const t = e.tIn(1);
    if (esCluster(t) || esArray(t)) throw new Error("Search 1D Array con clusters, todavía no (M6).");
    const el = elemento(t);
    const [h, n, o, i, r] = Array.from({ length: 5 }, () => e.temporal("i32"));
    const v = e.temporal(tipoWasm(t));
    const g = (l) => ins("local.get", l);
    const actual = [g(o), g(i), ins("i32.const", el.tam), ins("i32.mul"), ins("i32.add")];
    const igual = t === "string" ? [...actual, g(v), ins("call", idImport("cmp")), ins("i32.eqz")] : [...actual, ins(el.carga), g(v), instruccionComparar(t, "eq")];
    return [
      ...e.entrada(0), ins("local.tee", h), llamarMemoria("longitud"), ins("local.set", n), g(h), llamarMemoria("datos8"), ins("local.set", o),
      ...e.entrada(1), ins("local.set", v), ...e.entrada(2), ins("local.set", i),
      g(i), ins("i32.const", 0), g(i), ins("i32.const", 0), ins("i32.gt_s"), ins("select"), ins("local.set", i),
      ins("i32.const", -1), ins("local.set", r),
      ins("block"), ins("loop"), g(i), g(n), ins("i32.ge_s"), ins("br_if", 1),
      ...igual, ins("if"), g(i), ins("local.set", r), ins("br", 2), ins("end"),
      g(i), ins("i32.const", 1), ins("i32.add"), ins("local.set", i), ins("br", 0), ins("end"), ins("end"),
      g(r),
    ];
  },
  // Las que cambian el array en sitio ajeno: JavaScript sobre los bytes de los elementos (nada de cadenas ni clusters).
  "replace-array-subset": (e) => arrJs(e, "a_reemplazar", "Replace Array Subset", [() => e.entrada(1), () => comoArray(e, 2)]),
  "insert-into-array": (e) => arrJs(e, "a_insertar", "Insert Into Array", [() => (e.cableada(1) ? e.entrada(1) : [ins("i32.const", 0)]), () => comoArray(e, 2), () => [ins("i32.const", e.cableada(1) ? 1 : 0)]]),
  "delete-from-array": (e) => {
    const t = e.tOut(0).array;
    sinReferencias(t, "Delete From Array");
    const [c1, c2] = [e.celda(), e.celda()];
    return [
      ins("i32.const", c1), ins("i32.const", c2), ...e.entrada(0), ins("i32.const", elemento(t).tam),
      ...(e.cableada(2) ? e.entrada(2) : [ins("i32.const", 0)]), ...(e.cableada(1) ? e.entrada(1) : [ins("i32.const", 1)]),
      ins("i32.const", e.cableada(2) ? 1 : 0), ins("call", idImport("a_borrar")), ins("i32.const", c1), ins("i32.const", c2),
    ];
  },
  "sort-1d-array": (e) => arrJs(e, "a_ordenar", "Sort 1D Array", [() => [ins("i32.const", kindDe(e.tOut(0).array))]]),
  "rotate-1d-array": (e) => arrJs(e, "a_rotar", "Rotate 1D Array", [() => (e.cableada(0) ? e.entrada(0) : [ins("i32.const", 1)])], 1),
  "split-1d-array": (e) => {
    const t = e.tOut(0).array;
    sinReferencias(t, "Split 1D Array");
    const [c1, c2] = [e.celda(), e.celda()];
    return [ins("i32.const", c1), ins("i32.const", c2), ...e.entrada(0), ins("i32.const", elemento(t).tam), ...e.entrada(1), ins("call", idImport("a_partir")), ins("i32.const", c1), ins("i32.const", c2)];
  },
  "increment-array-element": (e) => arrSumar(e, 1),
  "decrement-array-element": (e) => arrSumar(e, -1),
  "add-array-elements": (e) => reducir(e, "add", 0),
  "multiply-array-elements": (e) => reducir(e, "mul", 1),
  "and-array-elements": (e) => reducir(e, "and", 1),
  "or-array-elements": (e) => reducir(e, "or", 0),
  "arr-const": (e) => [ins("i32.const", e.arrayConstante(e.tOut(0), e.nodo.config?.value ?? []))],
  "arr-control": (e) => {
    const celda = e.celda();
    return [ins("i32.const", e.indice), ins("i32.const", celda), ins("call", idImport("leer_arr")), ins("i32.const", celda)];
  },
  "cluster-control": (e) => {
    const b = e.bufer(disposicion(e.tOut(0)).tam);
    return [ins("i32.const", e.indice), ins("i32.const", b), ins("call", idImport("leer_clu")), ins("i32.const", b)];
  },
  "str-control": (e) => {
    const celda = e.celda();
    return [ins("i32.const", e.indice), ins("i32.const", celda), ins("call", idImport("leer_cad")), ins("i32.const", celda)];
  },
  // Timing: el reloj de milisegundos de LabVIEW es un U32 que da la vuelta.
  "tick-count-ms": () => [ins("call", idImport("reloj"))],
  "wait-ms": (e) => [...e.entrada(0), ...convertir(e.tIn(0), "u32"), ins("f64.convert_i32_u"), ins("call", idImport("esperar"))],
  "wait-until-next-ms-multiple": (e) => [...e.entrada(0), ...convertir(e.tIn(0), "u32"), ins("f64.convert_i32_u"), ins("call", idImport("esperar_multiplo"))],
  control: (e) => [ins("i32.const", e.indice), ins("call", idImport(`leer_${tipoWasm(e.tOut(0))}`))],
  // Un control booleano se lee igual: el booleano viaja como i32 0/1.
  "bool-control": (e) => [ins("i32.const", e.indice), ins("call", idImport(`leer_${tipoWasm(e.tOut(0))}`))],

  add: (e) => aritmetica(e, "add"),
  sub: (e) => aritmetica(e, "sub"),
  mul: (e) => aritmetica(e, "mul"),
  div: (e) => {
    const t = e.tOut(0);
    return [...e.entrada(0), ...convertir(e.tIn(0), t), ...e.entrada(1), ...convertir(e.tIn(1), t), ins(`${tipoWasm(t)}.div`)];
  },
  increment: (e) => [...e.entrada(0), ...constante(e.tOut(0), 1), ins(`${tipoWasm(e.tOut(0))}.add`), ...estrechar(e.tOut(0))],
  decrement: (e) => [...e.entrada(0), ...constante(e.tOut(0), 1), ins(`${tipoWasm(e.tOut(0))}.sub`), ...estrechar(e.tOut(0))],
  negate: (e) => {
    const t = e.tOut(0);
    if (esFlotante(t)) return [...e.entrada(0), ins(`${tipoWasm(t)}.neg`)];
    return [...constante(t, 0), ...e.entrada(0), ins(`${tipoWasm(t)}.sub`), ...estrechar(t)];
  },
  "absolute-value": (e) => {
    const t = e.tOut(0);
    const vt = tipoWasm(t);
    if (esFlotante(t)) return [...e.entrada(0), ins(`${vt}.abs`)];
    if (!conSigno(t)) return e.entrada(0);
    const x = e.temporal(vt);
    return [...e.entrada(0), ins("local.set", x), ...constante(t, 0), ins("local.get", x), ins(`${vt}.sub`), ...estrechar(t), ins("local.get", x), ins("local.get", x), ...constante(t, 0), ins(`${vt}.lt_s`), ins("select")];
  },
  square: (e) => {
    const vt = tipoWasm(e.tOut(0));
    const x = e.temporal(vt);
    return [...e.entrada(0), ins("local.tee", x), ins("local.get", x), ins(`${vt}.mul`), ...estrechar(e.tOut(0))];
  },
  "square-root": (e) => [...e.entrada(0), ...convertir(e.tIn(0), e.tOut(0)), ins(`${tipoWasm(e.tOut(0))}.sqrt`)],
  reciprocal: (e) => {
    const t = e.tOut(0);
    return [...constante(t, 1), ...e.entrada(0), ...convertir(e.tIn(0), t), ins(`${tipoWasm(t)}.div`)];
  },
  "round-to-nearest": (e) => redondeo(e, "nearest"),
  "round-toward-negative-infinity": (e) => redondeo(e, "floor"),
  "round-toward-positive-infinity": (e) => redondeo(e, "ceil"),
  sign: (e) => {
    const t = e.tOut(0);
    const vt = tipoWasm(t);
    const x = e.temporal(vt);
    const s = !esFlotante(t) && !conSigno(t) ? "_u" : esFlotante(t) ? "" : "_s";
    // (x > 0) − (x < 0), que da −1, 0 o 1, en el tipo de la entrada.
    return [...e.entrada(0), ins("local.set", x), ins("local.get", x), ...constante(t, 0), ins(`${vt}.gt${s}`), ins("local.get", x), ...constante(t, 0), ins(`${vt}.lt${s}`), ins("i32.sub"), ...convertir("i32", t)];
  },
  "quotient-remainder": (e) => {
    // floor(x/y) y x − y·floor(x/y), calculados en DBL. Un I64 enorme pierde precisión.
    const t = e.tOut(0);
    const [x, y, q] = [e.temporal("f64"), e.temporal("f64"), e.temporal("f64")];
    return [
      ...e.entrada(0), ...convertir(e.tIn(0), "number"), ins("local.set", x),
      ...e.entrada(1), ...convertir(e.tIn(1), "number"), ins("local.set", y),
      ins("local.get", x), ins("local.get", y), ins("f64.div"), ins("f64.floor"), ins("local.set", q),
      ins("local.get", x), ins("local.get", y), ins("local.get", q), ins("f64.mul"), ins("f64.sub"), ...convertir("number", t),
      ins("local.get", q), ...convertir("number", t),
    ];
  },
  "scale-by-power-of-2": (e) => {
    const t = e.tOut(0);
    const vt = tipoWasm(t);
    if (esFlotante(t)) return [...e.entrada(1), ins("f64.const", 2), ...e.entrada(0), ins("f64.convert_i32_s"), ins("call", idImport("pow")), ...convertir("number", t), ins(`${vt}.mul`)];
    // Con enteros, un desplazamiento: a la derecha si n < 0, a la izquierda si no.
    const [x, n] = [e.temporal(vt), e.temporal("i32")];
    const ext = vt === "i64" ? [ins("i64.extend_i32_s")] : [];
    return [
      ...e.entrada(1), ins("local.set", x), ...e.entrada(0), ins("local.set", n),
      ins("local.get", x), ins("i32.const", 0), ins("local.get", n), ins("i32.sub"), ...ext, ins(`${vt}.shr_${conSigno(t) ? "s" : "u"}`),
      ins("local.get", x), ins("local.get", n), ...ext, ins(`${vt}.shl`),
      ins("local.get", n), ins("i32.const", 0), ins("i32.lt_s"), ins("select"), ...estrechar(t),
    ];
  },
  "random-number-range": (e) => {
    const t = e.tOut(0);
    const [lo, hi] = [e.temporal("f64"), e.temporal("f64")];
    return [
      ...e.entrada(0), ...convertir(e.tIn(0), "number"), ins("local.set", lo),
      ...e.entrada(1), ...convertir(e.tIn(1), "number"), ins("local.set", hi),
      ins("local.get", lo), ins("call", idImport("random")), ins("local.get", hi), ins("local.get", lo), ins("f64.sub"), ins("f64.mul"), ins("f64.add"),
      ...(esFlotante(t) ? convertir("number", t) : [ins("f64.floor"), ...convertir("number", t)]),
    ];
  },
  "compound-arithmetic": (e) => compuesto(e),

  "and-op": (e) => logica(e, "and"),
  "or-op": (e) => logica(e, "or"),
  "xor-op": (e) => logica(e, "xor"),
  "nand-op": (e) => [...logica(e, "and"), ...negar(e.tOut(0))],
  "nor-op": (e) => [...logica(e, "or"), ...negar(e.tOut(0))],
  "nxor-op": (e) => [...logica(e, "xor"), ...negar(e.tOut(0))],
  "not-op": (e) => [...e.entrada(0), ...negar(e.tOut(0))],
  "implies-op": (e) => [...e.entrada(0), ...negar(e.tIn(0)), ...e.entrada(1), ins(`${tipoWasm(e.tOut(0))}.or`), ...estrechar(e.tOut(0))],
  "boolean-to-0-1": (e) => e.entrada(0),

  // La subpaleta Comparison. Los dos operandos llegan ya en el tipo común.
  equal: (e) => comparar(e, "eq"),
  "not-equal": (e) => comparar(e, "ne"),
  greater: (e) => comparar(e, "gt"),
  less: (e) => comparar(e, "lt"),
  "greater-or-equal": (e) => comparar(e, "ge"),
  "less-or-equal": (e) => comparar(e, "le"),
  "equal-to-0": (e) => compararConCero(e, "eq"),
  "not-equal-to-0": (e) => compararConCero(e, "ne"),
  "greater-than-0": (e) => compararConCero(e, "gt"),
  "less-than-0": (e) => compararConCero(e, "lt"),
  "greater-or-equal-to-0": (e) => compararConCero(e, "ge"),
  "less-or-equal-to-0": (e) => compararConCero(e, "le"),
  // t, s, f: `select` de WebAssembly da su primer operando si la condición es distinta de 0.
  select: (e) => [...e.entrada(0), ...e.entrada(2), ...e.entrada(1), ins("select")],
  "max-and-min": mayorYMenor,
  "in-range-and-coerce": enRango,
  "not-a-number-path-refnum": (e) => {
    if (!esFlotante(e.tIn(0))) return [ins("i32.const", 0)];
    const x = e.temporal(tipoWasm(e.tIn(0)));
    return [...e.entrada(0), ins("local.tee", x), ins("local.get", x), ins(`${tipoWasm(e.tIn(0))}.ne`)];
  },
  "expression-node": expresion,
  "split-number": partirNumero,
  "join-numbers": juntarNumeros,
  "swap-bytes": intercambiarBytes,
  "swap-words": intercambiarPalabras,
  rotate: rotar,
  "logical-shift": desplazar,
  "rotate-left-with-carry": rotarConAcarreo(true),
  "rotate-right-with-carry": rotarConAcarreo(false),
  "mantissa-and-exponent": mantisaYExponente,
  // La subpaleta Conversion: el número llega en su tipo y sale en el de la función.
  ...Object.fromEntries(
    ["to-double-precision-float", "to-single-precision-float", "to-quad-integer", "to-long-integer", "to-word-integer", "to-byte-integer", "to-unsigned-quad-integer", "to-unsigned-long-integer", "to-unsigned-word-integer", "to-unsigned-byte-integer"].map((n) => [
      n,
      (e) => [...e.entrada(0), ...convertir(e.tIn(0), e.tOut(0))],
    ]),
  ),
};

function aritmetica(e, op) {
  const t = e.tOut(0);
  return [...e.entrada(0), ...e.entrada(1), ins(`${tipoWasm(t)}.${op}`), ...estrechar(t)];
}

function redondeo(e, op) {
  const t = e.tOut(0);
  return esFlotante(t) ? [...e.entrada(0), ins(`${tipoWasm(t)}.${op}`)] : e.entrada(0);
}

/**
 * La instrucción que compara dos valores de tipo `t`: `op` es eq, ne, gt, lt,
 * ge o le. Los enteros con signo y los sin signo usan la comparación que les
 * toca; en coma flotante, las de IEEE: con un NaN todo es FALSE salvo `ne`.
 */
function instruccionComparar(t, op) {
  const vt = tipoWasm(t);
  if (esFlotante(t) || op === "eq" || op === "ne") return ins(`${vt}.${op}`);
  return ins(`${vt}.${op}_${t === "boolean" || conSigno(t) ? "s" : "u"}`);
}

function comparar(e, op) {
  if (esCluster(e.tIn(0)) || esCluster(e.tIn(1))) throw new Error("Comparar clusters todavía no se sabe compilar (M6).");
  // Las cadenas se comparan byte a byte, en el anfitrión: -1, 0 o 1.
  if (e.tIn(0) === "string") return [...e.entrada(0), ...e.entrada(1), ins("call", idImport("cmp")), k32(0), ins(`i32.${op}${op === "eq" || op === "ne" ? "" : "_s"}`)];
  return [...e.entrada(0), ...e.entrada(1), instruccionComparar(e.tIn(0), op)];
}

function compararConCero(e, op) {
  return [...e.entrada(0), ...constante(e.tIn(0), 0), instruccionComparar(e.tIn(0), op)];
}

/**
 * El mayor (`op` = "max") o el menor ("min") de dos locales `a` y `b` de tipo
 * `t`. En coma flotante, como Max & Min de LabVIEW (comprobado en 2026 Q3): un
 * NaN se ignora si el otro es un número, y con dos NaN sale NaN. `f64.max` de
 * WebAssembly, en cambio, propaga el NaN; por eso el resultado se corrige con
 * `u`, un local temporal.
 */
function mayorOMenor(t, op, a, b, u) {
  const vt = tipoWasm(t);
  const [ga, gb] = [ins("local.get", a), ins("local.get", b)];
  if (!esFlotante(t)) return extremo(t, op, a, b);
  return [
    gb, ga, gb, ins(`${vt}.${op}`), ga, ga, ins(`${vt}.ne`), ins("select"), ins("local.set", u),
    ga, ins("local.get", u), gb, gb, ins(`${vt}.ne`), ins("select"),
  ];
}

/** El mayor o el menor de dos locales; en coma flotante, un NaN lo contagia (es el de WebAssembly). */
function extremo(t, op, a, b) {
  const [ga, gb] = [ins("local.get", a), ins("local.get", b)];
  if (esFlotante(t)) return [ga, gb, ins(`${tipoWasm(t)}.${op}`)];
  return [ga, gb, ga, gb, instruccionComparar(t, op === "max" ? "gt" : "lt"), ins("select")];
}

/** Max & Min: salen max(x,y) y min(x,y). */
function mayorYMenor(e) {
  const t = e.tOut(0);
  const vt = tipoWasm(t);
  const [a, b, u] = [e.temporal(vt), e.temporal(vt), e.temporal(vt)];
  return [
    ...e.entrada(0), ins("local.set", a), ...e.entrada(1), ins("local.set", b),
    ...mayorOMenor(t, "max", a, b, u), ...mayorOMenor(t, "min", a, b, u),
  ];
}

/**
 * In Range and Coerce (upper limit, x, lower limit). In Range? compara con los
 * límites tal cual vienen, incluyendo cada extremo o no según `config`; con
 * los límites cruzados da FALSE. coerced(x) lleva x al rango con los límites
 * ordenados, y es NaN si x o un límite lo son. Comprobado en LabVIEW 2026 Q3.
 */
function enRango(e) {
  const t = e.tOut(0);
  const vt = tipoWasm(t);
  const [U, X, L, lo, hi, r] = Array.from({ length: 6 }, () => e.temporal(vt));
  const cfg = e.nodo.config ?? {};
  const [incluyeSup, incluyeInf] = [cfg["include-upper-limit"] ?? false, cfg["include-lower-limit"] ?? true];
  const g = (l) => ins("local.get", l);
  return [
    ...e.entrada(0), ins("local.set", U), ...e.entrada(1), ins("local.set", X), ...e.entrada(2), ins("local.set", L),
    // coerced(x) = mín(máx(x, mín(L, U)), máx(L, U))
    ...extremo(t, "min", L, U), ins("local.set", lo),
    ...extremo(t, "max", L, U), ins("local.set", hi),
    ...extremo(t, "max", X, lo), ins("local.set", r),
    ...extremo(t, "min", r, hi),
    // In Range?
    g(X), g(L), instruccionComparar(t, incluyeInf ? "ge" : "gt"),
    g(X), g(U), instruccionComparar(t, incluyeSup ? "le" : "lt"),
    ins("i32.and"),
  ];
}

/**
 * Suma, producto, AND u OR de los elementos de un array (Add/Multiply Array
 * Elements y And/Or Array Elements): empieza en `neutro` y opera elemento a
 * elemento, en el tipo de los elementos (un entero da la vuelta, como en LabVIEW).
 */
function reducir(e, op, neutro) {
  const t = e.tOut(0);
  const el = elemento(t);
  const vt = tipoWasm(t);
  const [h, n, o, i] = [e.temporal("i32"), e.temporal("i32"), e.temporal("i32"), e.temporal("i32")];
  const r = e.temporal(vt);
  const g = (l) => ins("local.get", l);
  return [
    ...e.entrada(0), ins("local.tee", h), llamarMemoria("longitud"), ins("local.set", n), g(h), llamarMemoria("datos8"), ins("local.set", o),
    ...constante(t, neutro), ins("local.set", r),
    ins("i32.const", 0), ins("local.set", i), ins("block"), ins("loop"), g(i), g(n), ins("i32.ge_s"), ins("br_if", 1),
    g(r), g(o), g(i), ins("i32.const", el.tam), ins("i32.mul"), ins("i32.add"), ins(el.carga), ins(`${vt}.${op}`), ...estrechar(t), ins("local.set", r),
    g(i), ins("i32.const", 1), ins("i32.add"), ins("local.set", i), ins("br", 0), ins("end"), ins("end"),
    g(r),
  ];
}


const KINDS = ["f32.load", "f64.load", "i64.load", "i32.load", "i32.load16_s", "i32.load16_u", "i32.load8_s", "i32.load8_u"];
/** Cómo se lee un elemento escalar, para el anfitrión: un número de `KINDS`. */
const kindDe = (t) => KINDS.indexOf(elemento(t).carga);
function sinReferencias(t, nombre) {
  if (elemento(t).ref) throw new Error(`${nombre} con cadenas, clusters o arrays como elementos: todavía no (M6).`);
}
/** Deja en la pila el handle de un array con lo que entra por `i`: él mismo, o un array de un solo elemento. */
function comoArray(e, i) {
  const t = e.tOut(0).array;
  if (esArray(e.tIn(i))) return e.entrada(i);
  const [celda, v] = [e.celda(), e.temporal(tipoWasm(t))];
  const el = elemento(t);
  return [
    ...e.entrada(i), ins("local.set", v),
    ins("i32.const", celda), ins("i32.const", 1), ins("i32.const", el.tam), ins("i32.const", 0), llamarMemoria("nuevo_array"), ins("drop"),
    ...guardarElemento(t, [ins("i32.const", celda), ins("i32.load"), ins("i32.const", 8), ins("i32.add")], [ins("local.get", v)], e.temporal),
    ins("i32.const", celda),
  ];
}
/** Una función de array hecha en JavaScript: celda de salida, array, tamaño del elemento y sus argumentos. `primera`: la entrada del array. */
function arrJs(e, nombre, titulo, args, primera = 0) {
  const t = e.tOut(0).array;
  sinReferencias(t, titulo);
  const celda = e.celda();
  return [ins("i32.const", celda), ...e.entrada(primera), ins("i32.const", elemento(t).tam), ...args.flatMap((a) => a()), ins("call", idImport(nombre)), ins("i32.const", celda)];
}
function arrSumar(e, delta) {
  const t = e.tOut(0).array;
  const celda = e.celda();
  return [ins("i32.const", celda), ...e.entrada(0), ins("i32.const", elemento(t).tam), ins("i32.const", kindDe(t)), ...e.entrada(1), ins("i32.const", delta), ins("call", idImport("a_sumar")), ins("i32.const", celda)];
}

/** Negación lógica: de un booleano, su contrario; de un entero, todos sus bits. */
function negar(t) {
  if (t === "boolean") return [ins("i32.eqz")];
  const vt = tipoWasm(t);
  return [...constante(t, -1), ins(`${vt}.xor`), ...estrechar(t)];
}

function logica(e, op) {
  return [...e.entrada(0), ...e.entrada(1), ins(`${tipoWasm(e.tOut(0))}.${op}`)];
}

/**
 * Compound Arithmetic: su operación sobre todas las entradas, con las
 * invertidas negadas (suma), en recíproco (producto) o negadas bit a bit.
 */
function compuesto(e) {
  const t = e.tOut(0);
  const vt = tipoWasm(t);
  const b = e.cat.bloque(e.nodo.tipo);
  const modo = e.nodo.config?.mode ?? b.config.mode.value;
  const invertidas = new Set(e.nodo.config?.inverted ?? []);
  const n = e.cat.puertos(e.nodo).in.length;
  const invertir = () => {
    if (modo === "add") return esFlotante(t) ? [ins(`${vt}.neg`)] : [...constante(t, -1), ins(`${vt}.mul`)];
    if (modo === "multiply") {
      const x = e.temporal(vt);
      return [ins("local.set", x), ...constante(t, 1), ins("local.get", x), ins(esFlotante(t) ? `${vt}.div` : `${vt}.div_s`)];
    }
    return negar(t);
  };
  const op = { add: "add", multiply: "mul", and: "and", or: "or", xor: "xor" }[modo];
  const r = [];
  for (let i = 0; i < n; i++) {
    r.push(...e.entrada(i));
    if (invertidas.has(`value-${i}`)) r.push(...invertir());
    if (i) r.push(ins(`${vt}.${op}`), ...estrechar(t));
  }
  if (invertidas.has("result")) r.push(...invertir());
  return r;
}

/**
 * La acción mecánica de un control booleano: la elegida o, si no, la de fábrica
 * de su estilo (Stop, OK y Cancel traen Latch When Released; comprobado en
 * LabVIEW 2026 Q3, front-panel/boolean-menu-mechanical-action.png).
 */
function mecanica(cat, n) {
  const def = cat.bloque(n.tipo).config?.mechanical;
  if (!def) return undefined;
  return n.config?.mechanical ?? def["by-style"]?.[n.config?.style] ?? def.value;
}

/**
 * Los tipos que el compilador sabe llevar hoy por un cable: numéricos,
 * booleanos, cadenas, clusters de ellos y arrays de una dimensión de ellos.
 */
const escalar = (t) =>
  t === "boolean" || t === "string" || esNumerico(t) || (esCluster(t) && t.cluster.every((f) => escalar(f.type))) || (esArray(t) && !esArray(t.array) && escalar(t.array));

/** ¿Es un valor que vive por referencia (una celda o un bloque): cadena, cluster o array? */
const porReferencia = (t) => t === "string" || esCluster(t) || esArray(t);

/**
 * Cómo se guarda un elemento de un array (DT-042): su tamaño y cómo se carga y
 * se escribe. Un elemento que es una cadena, un cluster o un array va por
 * referencia: su dirección dentro del array es su handle.
 */
function elemento(t) {
  if (porReferencia(t)) return { tam: esCluster(t) ? disposicion(t).tam : 4, ref: true };
  if (t === "boolean") return { tam: 1, carga: "i32.load8_u", guarda: "i32.store8" };
  const r = representacion(t);
  const n = NUMERICOS[r];
  if (!n.entero) return n.bits === 32 ? { tam: 4, carga: "f32.load", guarda: "f32.store" } : { tam: 8, carga: "f64.load", guarda: "f64.store" };
  if (n.bits === 64) return { tam: 8, carga: "i64.load", guarda: "i64.store" };
  if (n.bits === 32) return { tam: 4, carga: "i32.load", guarda: "i32.store" };
  if (n.bits === 16) return { tam: 2, carga: n.signo ? "i32.load16_s" : "i32.load16_u", guarda: "i32.store16" };
  return { tam: 1, carga: n.signo ? "i32.load8_s" : "i32.load8_u", guarda: "i32.store8" };
}

/** El elemento de tipo `t` que está en la dirección que deja `dir`: su valor o, si va por referencia, esa dirección. */
const cargarElemento = (t, dir) => (elemento(t).ref ? dir : [...dir, ins(elemento(t).carga)]);

/** Lo que necesita el anfitrión para leer y escribir un valor compuesto del panel: la disposición de un cluster o el elemento de un array. */
function datosDePanel(t) {
  if (esCluster(t)) return { disposicion: disposicionCompleta(t) };
  if (esArray(t)) return { elemento: { ...elemento(t.array), tipo: t.array, ...(esCluster(t.array) ? { disposicion: disposicionCompleta(t.array) } : {}) } };
  return {};
}

/** La disposición de un cluster con la de sus clusters de dentro, para que el anfitrión lo lea y lo escriba. */
function disposicionCompleta(t) {
  const d = disposicion(t);
  return { ...d, campos: d.campos.map((c) => ({ ...c, wasm: tipoWasm(c.tipo), ...(esCluster(c.tipo) ? { disposicion: disposicionCompleta(c.tipo) } : {}) })) };
}

/**
 * Copia el valor de tipo `t` que deja en la pila `origen` (un handle o la
 * dirección de un cluster) a `destino` (una dirección fija): una cadena, a su
 * celda; un cluster, campo a campo, con sus cadenas copiadas. Para guardarse un
 * valor propio, como un shift register o un Bundle (DT-042).
 */
function copiarValor(t, origen, destino, temporal) {
  return copiarA(t, origen, [ins("i32.const", destino)], temporal);
}

/** Como copiarValor, con el destino calculado: las instrucciones que dejan su dirección. */
function copiarA(t, origen, destino, temporal) {
  if (t === "string") return [...origen, ...destino, llamarMemoria("copiar")];
  const [de, a] = [temporal("i32"), temporal("i32")];
  const r = [...origen, ins("local.set", de), ...destino, ins("local.set", a)];
  const g = (l) => ins("local.get", l);
  if (esArray(t)) {
    // n elementos al bloque de la celda destino: de golpe o, si van por referencia, uno a uno.
    const e = elemento(t.array);
    const [n, od, dd, i] = [temporal("i32"), temporal("i32"), temporal("i32"), temporal("i32")];
    r.push(
      g(de), llamarMemoria("longitud"), ins("local.set", n), g(de), llamarMemoria("datos8"), ins("local.set", od),
      g(a), g(n), ins("i32.const", e.tam), ins("i32.const", e.ref ? 1 : 0), llamarMemoria("nuevo_array"), ins("local.set", dd),
    );
    if (!e.ref) r.push(g(dd), g(od), g(n), ins("i32.const", e.tam), ins("i32.mul"), ins("memory.copy"));
    else {
      const paso = (l) => [g(l), g(i), ins("i32.const", e.tam), ins("i32.mul"), ins("i32.add")];
      r.push(ins("i32.const", 0), ins("local.set", i), ins("block"), ins("loop"), g(i), g(n), ins("i32.ge_s"), ins("br_if", 1),
        ...copiarA(t.array, paso(od), paso(dd), temporal),
        g(i), ins("i32.const", 1), ins("i32.add"), ins("local.set", i), ins("br", 0), ins("end"), ins("end"));
    }
    return r;
  }
  for (const c of disposicion(t).campos) {
    const sitio = (l) => [g(l), ins("i32.const", c.off), ins("i32.add")];
    if (porReferencia(c.tipo)) r.push(...copiarA(c.tipo, sitio(de), sitio(a), temporal));
    else {
      const vt = tipoWasm(c.tipo);
      r.push(g(a), g(de), ins(`${vt}.load`, c.off), ins(`${vt}.store`, c.off));
    }
  }
  return r;
}

/** Guarda en la dirección que deja `dir` el elemento de tipo `t` que deja `valor`. */
function guardarElemento(t, dir, valor, temporal) {
  const e = elemento(t);
  return e.ref ? copiarA(t, valor, dir, temporal) : [...dir, ...valor, ins(e.guarda)];
}

/** Las funciones de la memoria van las primeras del módulo: su índice, por nombre. */
const MEMORIA_NOMBRES = ["asignar", "liberar", "redimensionar", "longitud", "datos", "copiar", "datos8", "nuevo_array"];
const MEMORIA = funcionesMemoria((n) => IMPORTACIONES.length + MEMORIA_NOMBRES.indexOf(n));
const llamarMemoria = (n) => ({ op: "call", arg: IMPORTACIONES.length + MEMORIA_NOMBRES.indexOf(n) });

/**
 * Orden topológico (Kahn) de los nodos de un ámbito, uniendo cada nodo a su
 * representante en él (el propio nodo, o la estructura del ámbito que lo
 * contiene). Lo que no es del ámbito —el borde de su estructura— ya está.
 */
function ordenArriba(g, arriba, raiz, cadenas = []) {
  const entran = new Map(arriba.map((id) => [id, 0]));
  const salen = new Map(arriba.map((id) => [id, new Set()]));
  for (const [de, a] of [...g.cables.map((c) => [raiz(c.de.nodo), raiz(c.a.nodo)]), ...cadenas]) {
    if (de === a || !salen.has(de) || !salen.has(a) || salen.get(de).has(a)) continue;
    salen.get(de).add(a);
    entran.set(a, entran.get(a) + 1);
  }
  const listos = arriba.filter((id) => entran.get(id) === 0);
  const r = [];
  while (listos.length) {
    const id = listos.shift();
    r.push(id);
    for (const d of salen.get(id)) if (entran.set(d, entran.get(d) - 1).get(d) === 0) listos.push(d);
  }
  return r;
}

/**
 * Parte el diagrama del VI en clumps. Una estructura, con todo lo suyo, cuenta
 * como un solo nodo (`raiz`), y es larga (DT-041). Un nodo largo va solo en el suyo; un instantáneo,
 * con los demás instantáneos que dependen de los mismos nodos largos (directa o
 * indirectamente). Así un instantáneo corre en cuanto acaba el último nodo largo
 * del que depende, que es cuando le llegan sus datos: lo que se ve en el panel
 * (cuándo se escribe un indicador, cuándo se lee un control) es lo mismo que si
 * cada nodo corriera por su cuenta. Cada clump lleva los índices de los clumps
 * de los que recibe algo (`deps`).
 */
function partir(g, ids, raiz, largo, cadenas = []) {
  const entran = new Map(ids.map((id) => [id, []]));
  for (const [de, a] of [...g.cables.map((c) => [raiz(c.de.nodo), raiz(c.a.nodo)]), ...cadenas]) {
    if (de !== a && entran.has(a) && entran.has(de)) entran.get(a).push(de);
  }
  const dependeDe = new Map(); // nodo → los nodos largos de los que depende
  const clumpDe = new Map();
  const porClave = new Map();
  const clumps = [];
  for (const id of ids) {
    const L = new Set();
    for (const p of entran.get(id)) {
      for (const x of dependeDe.get(p)) L.add(x);
      if (largo(p)) L.add(p);
    }
    dependeDe.set(id, L);
    const clave = largo(id) ? `largo:${id}` : [...L].sort().join(",");
    if (!porClave.has(clave)) porClave.set(clave, clumps.push({ largo: largo(id), deps: new Set(), locales: [], cuerpo: [] }) - 1);
    clumpDe.set(id, porClave.get(clave));
  }
  for (const [x, y] of [...g.cables.map((c) => [raiz(c.de.nodo), raiz(c.a.nodo)]), ...cadenas]) {
    const [de, a] = [clumpDe.get(x), clumpDe.get(y)];
    if (de !== undefined && a !== undefined && de !== a) clumps[a].deps.add(de);
  }
  return { clumpDe, clumps };
}

/**
 * Compila un VI. Devuelve `{ bytes, modulo, controles, indicadores, clumps }`,
 * con los controles y los indicadores en el orden de sus índices y, por cada
 * clump (la función exportada `c<i>`), de cuáles depende y si tarda; o
 * `{ errores }`: los motivos por los que no se puede, cada uno con su nodo si lo
 * tiene.
 */
export function compilar(g, cat) {
  const resueltos = tipos(g, cat);
  if (!ejecutable(g, cat, resueltos)) {
    const errores = [...resueltos.cables.entries()].filter(([, c]) => c.roto).map(([id, c]) => ({ cable: id, motivo: c.roto }));
    const llegan = new Set(g.cables.map((c) => `${c.a.nodo}.${c.a.puerto}`));
    for (const n of g.nodos) {
      if (cat.bloque(n.tipo).panel) continue;
      for (const p of cat.puertos(n).in) {
        if (requerido(g, n, p) && !llegan.has(`${n.id}.${p.name}`)) errores.push({ nodo: n.id, motivo: `A «${n.label?.text ?? n.name}» le falta un cable en su entrada «${p.label ?? p.name}».` });
      }
    }
    return { errores };
  }
  const { orden: ids } = orden(g);
  const porId = new Map(g.nodos.map((n) => [n.id, n]));
  const llegaA = new Map(g.cables.map((c) => [`${c.a.nodo}.${c.a.puerto}`, c]));
  const esEstructura = (id) => !!cat.bloque(porId.get(id).tipo).estructura;
  // Un bucle tarda; un Case, sólo si algo suyo tarda (si no, es instantáneo y va
  // en el clump de lo que le rodea, como cualquier nodo).
  // Cada marco de una Flat Sequence es, para el flujo de datos, un elemento
  // propio (`secuencia#k`), encadenado al anterior: en LabVIEW lo que sale de un
  // marco sale al acabar ese marco, no la secuencia (comprobado en 2026 Q3,
  // labview-captures/structures/secuencia-*.png). La Stacked es un solo nodo.
  const deMarco = (item) => (typeof item === "string" && item.includes("#") ? item.split("#") : null);
  const esFlat = (id) => porId.get(id)?.tipo === "flat-sequence";
  const esLargo = (id) => {
    const m = deMarco(id);
    if (m) return g.nodos.some((k) => k.dentro === m[0] && k.marco === Number(m[1]) && esLargo(k.id));
    const n = porId.get(id);
    if (LARGOS.has(n.tipo) || n.tipo === "while-loop" || n.tipo === "for-loop") return true;
    // Un «error out» sin cablear puede sacar el diálogo del manejo automático, que espera al usuario.
    if (g.vi?.["automatic-error-handling"] !== false && n.tipo !== "simple-error-handler" && cat.puertos(n).out.some((p) => p.name === "error-out") && !g.cables.some((c) => c.de.nodo === id && c.de.puerto === "error-out")) return true;
    return esEstructura(id) && g.nodos.some((k) => k.dentro === id && esLargo(k.id));
  };
  /** El marco de una Flat al que pertenece un hijo suyo: el suyo, el del primero que lee un túnel de entrada o el del que alimenta uno de salida. */
  const marcoEnFlat = (d, seq) => {
    if (d.marco !== undefined) return d.marco;
    const hijo = (x) => {
      let n = porId.get(x);
      while (n && n.dentro !== seq) n = porId.get(n.dentro);
      return n;
    };
    if (d.tipo === "tunnel-in") {
      const ks = g.cables.filter((c) => c.de.nodo === d.id).map((c) => hijo(c.a.nodo)?.marco).filter((k) => k !== undefined);
      return ks.length ? Math.min(...ks) : 0;
    }
    const c = llegaA.get(`${d.id}.x`);
    const k = c && hijo(c.de.nodo)?.marco;
    return k ?? porId.get(seq).config.marcos.length - 1;
  };
  // El representante de un nodo en un ámbito: él mismo, la estructura de ese
  // ámbito que lo contiene o, en una Flat, el marco; `raiz`, en el del VI.
  const representante = (id, ambito) => {
    let n = porId.get(id);
    let hijo = null;
    while (n && n.dentro !== ambito) {
      hijo = n;
      n = porId.get(n.dentro);
    }
    if (n && esFlat(n.id) && hijo) {
      while (hijo.dentro !== n.id) hijo = porId.get(hijo.dentro);
      return `${n.id}#${marcoEnFlat(hijo, n.id)}`;
    }
    return n?.id;
  };
  const raiz = (id) => representante(id, undefined);
  /** Una lista de un ámbito con cada Flat cambiada por sus marcos, y las cadenas que los ordenan. */
  const conMarcos = (lista) => {
    const r = [];
    const cadenas = [];
    for (const id of lista) {
      if (!esFlat(id)) {
        r.push(id);
        continue;
      }
      const n = porId.get(id).config.marcos.length;
      for (let k = 0; k < n; k++) {
        r.push(`${id}#${k}`);
        if (k) cadenas.push([`${id}#${k - 1}`, `${id}#${k}`]);
      }
    }
    return { lista: r, cadenas };
  };
  // El diagrama del VI en orden, con cada estructura como un bloque: va después
  // de lo que entra por sus túneles y antes de lo que lee sus salidas.
  const deArriba = conMarcos(ids.filter((id) => !porId.get(id).dentro));
  const arriba = ordenArriba(g, deArriba.lista, raiz, deArriba.cadenas);
  const { clumpDe: clumpRaiz, clumps } = partir(g, arriba, raiz, esLargo, deArriba.cadenas);
  const clumpDe = (id) => clumpRaiz.get(raiz(id));
  const globales = [];
  // El data space (DT-042): una celda por búfer; las constantes, aparte.
  let espacio = 0; // bytes del data space ya reservados
  const bufer = (tam, al = 8) => {
    espacio = (espacio + al - 1) & ~(al - 1);
    const d = CELDAS + espacio;
    espacio += tam;
    return d;
  };
  const nuevaCelda = () => bufer(4, 4);
  // El cluster «cero»: tan grande como el mayor cluster del VI; no se escribe nunca.
  const tamMax = Math.max(0, ...[...resueltos.entradas.values(), ...resueltos.salidas.values()].filter(esCluster).map((t) => disposicion(t).tam));
  zonaCero = bufer(Math.max(tamMax, 8));
  const constantes = []; // { celda, bytes }
  const cadena = (texto) => {
    const celda = nuevaCelda();
    constantes.push({ celda, bytes: bloqueCadena(texto) });
    return celda;
  };
  const datosFijos = []; // { desde, bytes }: escalares de las constantes de cluster
  /**
   * Una constante de array: su bloque [n][relleno][elementos] en el data space,
   * ya escrito al instanciar, y la celda que lo apunta. Sus cadenas, en la zona
   * estática; sus clusters, con clusterConstante.
   */
  const arrayConstante = (t, valores) => {
    const el = elemento(t.array);
    const celda = nuevaCelda();
    if (!valores.length) return celda;
    const b = bufer(8 + valores.length * el.tam);
    datosFijos.push({ desde: b, bytes: i32(valores.length) }, { desde: celda, bytes: i32(b) });
    valores.forEach((v, i) => {
      const dir = b + 8 + i * el.tam;
      if (t.array === "string") constantes.push({ celda: dir, bytes: bloqueCadena(String(v ?? "")) });
      else if (esCluster(t.array)) clusterConstante(t.array, v, dir);
      else {
        const bytes = new Uint8Array(el.tam);
        const dv = new DataView(bytes.buffer);
        const x = t.array === "boolean" ? (v ? 1 : 0) : Number(v ?? 0);
        ({ 1: () => dv.setInt8(0, x), 2: () => dv.setInt16(0, x, true), 4: () => (el.carga === "f32.load" ? dv.setFloat32(0, x, true) : dv.setInt32(0, x, true)), 8: () => (el.carga === "f64.load" ? dv.setFloat64(0, x, true) : dv.setBigInt64(0, BigInt(Math.trunc(x)), true)) })[el.tam]();
        datosFijos.push({ desde: dir, bytes });
      }
    });
    return celda;
  };
  /** Una constante de cluster: su bloque en el data space, ya escrito al instanciar; sus cadenas, en la zona estática. */
  const clusterConstante = (t, v, dir = null) => {
    const d = disposicion(t);
    const b = dir ?? bufer(d.tam);
    for (const c of d.campos) {
      const x = v?.[c.nombre];
      if (esCluster(c.tipo)) clusterConstante(c.tipo, x, b + c.off);
      else if (c.tipo === "string") constantes.push({ celda: b + c.off, bytes: bloqueCadena(String(x ?? "")) });
      else {
        const vt = tipoWasm(c.tipo);
        const bytes = new Uint8Array(vt === "f64" || vt === "i64" ? 8 : 4);
        const dv = new DataView(bytes.buffer);
        if (vt === "f64") dv.setFloat64(0, Number(x ?? 0), true);
        else if (vt === "f32") dv.setFloat32(0, Number(x ?? 0), true);
        else if (vt === "i64") dv.setBigInt64(0, BigInt(Math.trunc(Number(x ?? 0))), true);
        else dv.setInt32(0, c.tipo === "boolean" ? (x ? 1 : 0) : Number(x ?? 0) | 0, true);
        datosFijos.push({ desde: b + c.off, bytes });
      }
    }
    return b;
  };
  const planes = []; // los subplanes: por cada uno, sus clumps
  // Manejo automático de errores, activo de fábrica (VI Properties ▸ Execution).
  const autoErrores = g.vi?.["automatic-error-handling"] !== false;
  const automaticos = []; // los nodos que pueden sacar el diálogo, por índice
  const valor = new Map(); // `${nodo}.${puerto}` → { local, global, clump }
  const controles = [];
  const indicadores = [];
  const errores = [];
  // Las salidas que alguien lee desde otro clump necesitan una global.
  const cruzan = new Set(g.cables.filter((c) => clumpDe(c.de.nodo) !== clumpDe(c.a.nodo)).map((c) => `${c.de.nodo}.${c.de.puerto}`));

  /** Lo que hace falta para emitir un nodo en el clump `k`. */
  function contexto(id, k) {
    const n = porId.get(id);
    const { in: entradas, out: salidas } = cat.puertos(n);
    const tIn = (i) => resueltos.entradas.get(`${id}.${entradas[i].name}`);
    const tOut = (j) => resueltos.salidas.get(`${id}.${salidas[j].name}`);
    const nuevoLocal = (vt) => k.locales.push(vt) - 1;
    const entrada = (i) => {
      const c = llegaA.get(`${id}.${entradas[i].name}`);
      if (!c) return constante(tIn(i), entradas[i].default ?? 0);
      const t = resueltos.salidas.get(`${c.de.nodo}.${c.de.puerto}`);
      const v = valor.get(`${c.de.nodo}.${c.de.puerto}`);
      // El nodo de origen ya dio un error: no hay valor, y el VI no se emitirá.
      if (!v) return [];
      // Leído desde otra función —un clump de un subplan, o el bucle que lo
      // llama—: el valor pasa a una global. Como cada salida se asigna una vez
      // por ejecución, basta copiarla al final de lo que su función lleva
      // emitido: en el bucle, eso queda antes de llamar al subplan.
      if (v.clump !== k && v.global === undefined) {
        v.global = globales.push(tipoWasm(t)) - 1;
        v.clump.cuerpo.push(ins("local.get", v.local), ins("global.set", v.global));
      }
      const leer = v.clump === k ? ins("local.get", v.local) : ins("global.get", v.global);
      // Un array con otro tipo de elemento se convierte entero en un búfer propio:
      // el punto de coerción de LabVIEW (DT-042).
      if (esArray(t) && esArray(tIn(i)) && JSON.stringify(t.array) !== JSON.stringify(tIn(i).array)) return convertirArray(t, tIn(i), [leer]);
      return [leer, ...convertir(t, tIn(i))];
    };
    /** Copia el array que deja `origen` a una celda nueva, convirtiendo cada elemento de `desde.array` a `hacia.array`. */
    const convertirArray = (desde, hacia, origen) => {
      const [ed, eh] = [desde.array, hacia.array];
      const conv = convertir(ed, eh);
      if (porReferencia(ed) || porReferencia(eh) || conv === null) throw new Error(`No se puede convertir un array de ${JSON.stringify(ed)} en uno de ${JSON.stringify(eh)}.`);
      const [elD, elH] = [elemento(ed), elemento(eh)];
      const celda = nuevaCelda();
      const [h, n, o, d, j] = Array.from({ length: 5 }, () => nuevoLocal("i32"));
      const g = (l) => ins("local.get", l);
      return [
        ...origen, ins("local.tee", h), llamarMemoria("longitud"), ins("local.set", n), g(h), llamarMemoria("datos8"), ins("local.set", o),
        ins("i32.const", celda), g(n), ins("i32.const", elH.tam), ins("i32.const", 0), llamarMemoria("nuevo_array"), ins("local.set", d),
        ins("i32.const", 0), ins("local.set", j), ins("block"), ins("loop"), g(j), g(n), ins("i32.ge_s"), ins("br_if", 1),
        g(d), g(j), ins("i32.const", elH.tam), ins("i32.mul"), ins("i32.add"),
        g(o), g(j), ins("i32.const", elD.tam), ins("i32.mul"), ins("i32.add"), ins(elD.carga), ...conv, ins(elH.guarda),
        g(j), ins("i32.const", 1), ins("i32.add"), ins("local.set", j), ins("br", 0), ins("end"), ins("end"),
        ins("i32.const", celda),
      ];
    };
    const cableada = (i) => llegaA.has(`${id}.${entradas[i].name}`);
    return { n, entradas, salidas, tIn, tOut, nuevoLocal, entrada, cableada, nombre: n.label?.text ?? n.name };
  }

  /** El valor de una salida está en el local `l`; si alguien lo lee desde otro clump, también en una global. */
  function dejar(k, id, puerto, l, vt) {
    const v = { local: l, clump: k };
    if (cruzan.has(`${id}.${puerto}`)) {
      v.global = globales.push(vt) - 1;
      k.cuerpo.push(ins("local.get", l), ins("global.set", v.global));
    }
    valor.set(`${id}.${puerto}`, v);
  }

  function emitirNodo(id, k) {
    const { n, entradas, salidas, tIn, tOut, nuevoLocal, entrada, cableada, nombre } = contexto(id, k);
    const tiposNodo = [...entradas.map((_, i) => tIn(i)), ...salidas.map((_, j) => tOut(j))];
    if (tiposNodo.some((t) => !escalar(t))) return errores.push({ nodo: id, motivo: `«${nombre}» lleva un tipo que el compilador aún no sabe emitir.` });
    // Un indicador sin cable no se escribe: conserva su valor, como en LabVIEW.
    if (["indicator", "bool-indicator", "str-indicator", "cluster-indicator", "arr-indicator"].includes(n.tipo)) {
      if (!llegaA.has(`${id}.value`)) return;
      indicadores.push({ nodo: id, name: n.name, tipo: tIn(0), ...datosDePanel(tIn(0)) });
      const escribe = tIn(0) === "string" ? "escribir_cad" : esCluster(tIn(0)) ? "escribir_clu" : esArray(tIn(0)) ? "escribir_arr" : `escribir_${tipoWasm(tIn(0))}`;
      k.cuerpo.push(ins("i32.const", indicadores.length - 1), ...entrada(0), ins("call", idImport(escribe)));
      return;
    }
    const emitir = BLOQUES[n.tipo];
    if (!emitir) return errores.push({ nodo: id, motivo: `El compilador aún no sabe emitir «${nombre}» (${n.tipo}).` });
    const e = { nodo: n, cat, tIn, tOut, entrada, cableada, temporal: nuevoLocal, indice: controles.length, celda: nuevaCelda, cadena, bufer, clusterConstante, arrayConstante };
    if (["control", "bool-control", "str-control", "cluster-control", "arr-control"].includes(n.tipo))
      controles.push({ nodo: id, name: n.name, tipo: tOut(0), mecanica: mecanica(cat, n), ...datosDePanel(tOut(0)) });
    try {
      const b = cat.bloque(n.tipo);
      const ie = entradas.findIndex((p) => p.name === "error-in");
      const oe = salidas.findIndex((p) => p.name === "error-out");
      if (b["pasa-error"] && ie >= 0 && oe >= 0) k.cuerpo.push(...pasaError(e, salidas, ie, oe, emitir(e)));
      else k.cuerpo.push(...emitir(e));
    } catch (fallo) {
      return errores.push({ nodo: id, motivo: fallo.message });
    }
    const locs = salidas.map((_, j) => nuevoLocal(tipoWasm(tOut(j))));
    for (let j = locs.length - 1; j >= 0; j--) k.cuerpo.push(ins("local.set", locs[j]));
    salidas.forEach((p, j) => dejar(k, id, p.name, locs[j], tipoWasm(tOut(j))));
    // Manejo automático de errores (DT-043): un «error out» sin cablear que lleva un error para el VI y lo cuenta.
    const oe = salidas.findIndex((p) => p.name === "error-out");
    if (oe >= 0 && autoErrores && n.tipo !== "simple-error-handler" && !g.cables.some((c) => c.de.nodo === id && c.de.puerto === "error-out")) {
      k.cuerpo.push(ins("local.get", locs[oe]), ins("i32.load", ERR.status), ins("if"),
        ins("i32.const", automaticos.push(id) - 1), ins("local.get", locs[oe]), ins("call", idImport("error_automatico")), ins("drop"), ins("end"));
    }
  }

  /**
   * El envoltorio de una función con «error in» y «error out» (DT-043, medido en
   * LabVIEW): con status TRUE a la entrada no trabaja, sus salidas dan el valor
   * por defecto y «error out» es el mismo cluster; si no, trabaja (`trabajo`
   * deja sus salidas en la pila, «error out» incluido).
   */
  function pasaError(e, salidas, ie, oe, trabajo) {
    const locs = salidas.map((_, j) => e.temporal(tipoWasm(e.tOut(j))));
    const x = e.temporal("i32");
    const c = [...e.entrada(ie), ins("local.tee", x), ins("i32.load", ERR.status), ins("if")];
    salidas.forEach((_, j) => c.push(...(j === oe ? [ins("local.get", x)] : constante(e.tOut(j), 0)), ins("local.set", locs[j])));
    c.push(ins("else"), ...trabajo);
    for (let j = locs.length - 1; j >= 0; j--) c.push(ins("local.set", locs[j]));
    c.push(ins("end"), ...locs.map((l) => ins("local.get", l)));
    return c;
  }

  /**
   * Un While o un For, en línea en la función de su clump (DT-041): los túneles
   * de entrada se leen una vez; cada vuelta corre el cuerpo en orden
   * topológico, guarda lo de los shift registers y los túneles de salida, mira
   * la condición y cede si se le acaba el presupuesto; al acabar, los túneles
   * de salida dan el valor de la última vuelta. Un For con N ≤ 0 no corre: sus
   * túneles dan el valor por defecto y sus shift registers el inicial.
   */
  function emitirEstructura(sid, k) {
    const s = porId.get(sid);
    const deAqui = ids.filter((id) => porId.get(id).dentro === sid);
    const BORDE = new Set(["tunnel-in", "tunnel-out", "shift-register-left", "shift-register-right", "loop-iteration", "loop-condition", "loop-count"]);
    // El cuerpo, en orden con cada estructura de dentro como un bloque; el borde, aparte.
    const hijos = [...deAqui.filter((id) => BORDE.has(porId.get(id).tipo)), ...ordenArriba(g, deAqui.filter((id) => !BORDE.has(porId.get(id).tipo)), (id) => representante(id, sid))];
    const de = (tipo) => hijos.filter((id) => porId.get(id).tipo === tipo);
    const L = (vt) => k.locales.push(vt) - 1;
    const c = k.cuerpo;
    // Antes de la primera vuelta: lo que entra por el borde. Un túnel indexado
    // guarda su array (handle, longitud, datos) y da su elemento en cada vuelta.
    const indexados = [];
    for (const id of de("tunnel-in")) {
      const x = contexto(id, k);
      const l = L(tipoWasm(x.tOut(0)));
      if (porId.get(id).config?.indexado) {
        const [h, m, d] = [L("i32"), L("i32"), L("i32")];
        c.push(...x.entrada(0), ins("local.tee", h), llamarMemoria("longitud"), ins("local.set", m), ins("local.get", h), llamarMemoria("datos8"), ins("local.set", d));
        indexados.push({ t: x.tOut(0), l, m, d });
      } else c.push(...x.entrada(0), ins("local.set", l));
      valor.set(`${id}.y`, { local: l, clump: k });
    }
    const registros = de("shift-register-left").map((id) => {
      const x = contexto(id, k);
      const vt = tipoWasm(x.tOut(0));
      const [ahora, nuevo] = [L(vt), L(vt)];
      // Una cadena: el shift register tiene su propia celda y se guarda una copia,
      // para que quien la produjo pueda reescribir su búfer en la vuelta siguiente.
      const t = x.tOut(0);
      const celda = t === "string" || esArray(t) ? nuevaCelda() : esCluster(t) ? bufer(disposicion(t).tam) : null;
      if (celda !== null) c.push(...copiarValor(t, x.entrada(0), celda, x.nuevoLocal), ins("i32.const", celda), ins("local.set", ahora));
      else c.push(...x.entrada(0), ins("local.set", ahora));
      valor.set(`${id}.value`, { local: ahora, clump: k });
      return { izq: id, der: porId.get(id).config.par, ahora, nuevo, vt, celda, t };
    });
    // La cuenta de un For: la cableada, recortada a la longitud de cada array indexado.
    let n = null;
    for (const id of de("loop-count")) {
      n = L("i32");
      const cableada = llegaA.has(`${id}.count`);
      c.push(...(cableada ? contexto(id, k).entrada(0) : indexados.length ? [ins("local.get", indexados[0].m)] : [ins("i32.const", 0)]), ins("local.set", n));
      for (const x of indexados) c.push(ins("local.get", x.m), ins("local.get", n), ins("local.get", x.m), ins("local.get", n), ins("i32.lt_s"), ins("select"), ins("local.set", n));
    }
    const i = L("i32");
    for (const id of de("loop-iteration")) valor.set(`${id}.i`, { local: i, clump: k });
    const presupuesto = L("i32");
    const salidas = de("tunnel-out").map((id) => {
      const x = contexto(id, k);
      // Un túnel de salida indexado va llenando el array de su celda, una vuelta cada vez.
      if (porId.get(id).config?.indexado) return { id, l: L("i32"), indexado: { celda: nuevaCelda(), n: L("i32"), t: x.tIn(0) } };
      return { id, l: L(tipoWasm(x.tOut(0))) };
    });
    const parada = L("i32");

    // Cada vez que se entra en la estructura —un bucle dentro de otro entra
    // muchas—, i vuelve a 0 y los túneles de salida al valor por defecto.
    c.push(ins("i32.const", 0), ins("local.set", i));
    for (const t of salidas) {
      if (t.indexado) {
        const el = elemento(t.indexado.t);
        c.push(ins("i32.const", 0), ins("local.set", t.indexado.n), ins("i32.const", t.indexado.celda), ins("i32.const", 0), ins("i32.const", el.tam), ins("i32.const", el.ref ? 1 : 0), llamarMemoria("nuevo_array"), ins("drop"));
      } else c.push(...constante(contexto(t.id, k).tOut(0), 0), ins("local.set", t.l));
    }
    c.push(ins("block"));
    if (n !== null) c.push(ins("local.get", n), ins("i32.const", 0), ins("i32.le_s"), ins("br_if", 0));
    c.push(ins("loop"));
    // El elemento de cada túnel indexado en esta vuelta (fuera del array, el valor por defecto).
    for (const x of indexados) {
      const el = elemento(x.t);
      c.push(...constante(x.t, 0), ins("local.set", x.l), ins("local.get", i), ins("local.get", x.m), ins("i32.lt_s"),
        ins("if"), ...cargarElemento(x.t, [ins("local.get", x.d), ins("local.get", i), ins("i32.const", el.tam), ins("i32.mul"), ins("i32.add")]), ins("local.set", x.l), ins("end"));
    }
    emitirCuerpo(deAqui.filter((id) => !BORDE.has(porId.get(id).tipo)), sid, k);
    for (const t of salidas) {
      if (!t.indexado) {
        c.push(...contexto(t.id, k).entrada(0), ins("local.set", t.l));
        continue;
      }
      const { celda, n: m, t: te } = t.indexado;
      const el = elemento(te);
      const d = L("i32");
      c.push(
        ins("i32.const", celda), ins("local.get", m), ins("i32.const", 1), ins("i32.add"), ins("i32.const", el.tam), ins("i32.const", el.ref ? 1 : 0), llamarMemoria("nuevo_array"), ins("local.set", d),
        ...guardarElemento(te, [ins("local.get", d), ins("local.get", m), ins("i32.const", el.tam), ins("i32.mul"), ins("i32.add")], contexto(t.id, k).entrada(0), L),
        ins("local.get", m), ins("i32.const", 1), ins("i32.add"), ins("local.set", m),
      );
    }
    for (const r of registros) c.push(...contexto(r.der, k).entrada(0), ins("local.set", r.nuevo));
    for (const id of de("loop-condition")) {
      c.push(...contexto(id, k).entrada(0));
      if (porId.get(id).config?.mode === "continue-if-true") c.push(ins("i32.eqz"));
      c.push(ins("local.set", parada));
    }
    for (const r of registros) {
      if (r.celda !== null) c.push(...copiarValor(r.t, [ins("local.get", r.nuevo)], r.celda, L));
      else c.push(ins("local.get", r.nuevo), ins("local.set", r.ahora));
    }
    // i + 1, sin pasar de 2^31 − 1: LabVIEW lo deja ahí.
    c.push(ins("local.get", i), ins("local.get", i), ins("i32.const", 0x7fffffff), ins("i32.ne"), ins("i32.add"), ins("local.set", i));
    c.push(
      ins("local.get", presupuesto), ins("i32.const", 1), ins("i32.sub"), ins("local.tee", presupuesto), ins("i32.const", 0), ins("i32.le_s"),
      ins("if"), ins("call", idImport("ceder")), ins("local.set", presupuesto), ins("end"),
    );
    if (n !== null) c.push(ins("local.get", i), ins("local.get", n), ins("i32.lt_s"), ins("br_if", 0));
    else c.push(ins("local.get", parada), ins("i32.eqz"), ins("br_if", 0));
    c.push(ins("end"), ins("end"));
    // Al acabar: lo que sale por el borde.
    for (const t of salidas) {
      if (t.indexado) c.push(ins("i32.const", t.indexado.celda), ins("local.set", t.l));
      dejar(k, t.id, "y", t.l, tipoWasm(contexto(t.id, k).tOut(0)));
    }
    for (const r of registros) dejar(k, r.der, "result", r.ahora, r.vt);
    void s;
  }

  /**
   * Un Case, en línea (DT-041): los túneles de entrada se leen una vez; el
   * selector, redondeado a entero si es decimal, elige un marco por una cadena
   * de if/else (sus valores y rangos, en orden; el Default, al final); sólo corre
   * lo de ese marco, y cada túnel de salida toma lo que le llega en él, o el
   * valor por defecto con Use Default If Unwired.
   */
  function emitirCase(sid, k) {
    const s = porId.get(sid);
    const marcos = s.config?.marcos ?? [];
    const deAqui = ids.filter((id) => porId.get(id).dentro === sid);
    const c = k.cuerpo;
    const L = (vt) => k.locales.push(vt) - 1;
    for (const id of deAqui.filter((x) => porId.get(x).tipo === "tunnel-in")) {
      const x = contexto(id, k);
      const l = L(tipoWasm(x.tOut(0)));
      c.push(...x.entrada(0), ins("local.set", l));
      valor.set(`${id}.y`, { local: l, clump: k });
    }
    const sel = L("i32");
    // Lo que rompe la flecha de Run en LabVIEW: un selector numérico sin Default,
    // uno booleano sin sus dos marcos, o un valor en dos marcos.
    const nombre = s.label?.text ?? s.name;
    const vistos = new Set();
    for (const m of marcos) {
      for (const v of m.valores ?? []) {
        const clave = JSON.stringify(v);
        if (vistos.has(clave)) errores.push({ nodo: sid, motivo: `En «${nombre}», el valor ${clave} está en dos marcos.` });
        vistos.add(clave);
      }
    }
    for (const id of deAqui.filter((x) => porId.get(x).tipo === "case-selector")) {
      const x = contexto(id, k);
      const t = x.tIn(0);
      if (t === "boolean" && !(vistos.has("true") && vistos.has("false")) && !marcos.some((m) => m.default)) errores.push({ nodo: sid, motivo: `«${nombre}» necesita un marco True y otro False.` });
      if (t !== "boolean" && !marcos.some((m) => m.default)) errores.push({ nodo: sid, motivo: `«${nombre}» necesita un marco Default: hay valores del selector que no tienen marco.` });
      c.push(...x.entrada(0));
      if (t !== "boolean") c.push(...convertir(t, "i32"));
      c.push(ins("local.set", sel));
    }
    const salidas = deAqui.filter((x) => porId.get(x).tipo === "case-tunnel-out").map((id) => {
      const x = contexto(id, k);
      const l = L(tipoWasm(x.tOut(0)));
      c.push(...constante(x.tOut(0), 0), ins("local.set", l));
      return { id, l, x };
    });
    const marco = (m) => {
      emitirCuerpo(deAqui.filter((id) => porId.get(id).marco === m), sid, k);
      for (const t of salidas) {
        if (!llegaA.has(`${t.id}.x-${m}`)) continue;
        c.push(...t.x.entrada(m), ins("local.set", t.l));
      }
    };
    const valorI32 = (v) => (v === true ? 1 : v === false ? 0 : Math.round(v));
    const condicion = (valores) => {
      const r = [];
      valores.forEach((v, j) => {
        if (v && typeof v === "object") {
          const partes = [];
          if (v.min !== undefined && v.min !== null) partes.push([ins("local.get", sel), ins("i32.const", v.min), ins("i32.ge_s")]);
          if (v.max !== undefined && v.max !== null) partes.push([ins("local.get", sel), ins("i32.const", v.max), ins("i32.le_s")]);
          r.push(...partes.flat(), ...(partes.length === 2 ? [ins("i32.and")] : partes.length ? [] : [ins("i32.const", 1)]));
        } else r.push(ins("local.get", sel), ins("i32.const", valorI32(v)), ins("i32.eq"));
        if (j) r.push(ins("i32.or"));
      });
      return r.length ? r : [ins("i32.const", 0)];
    };
    const conValores = marcos.map((m, i) => ({ m, i })).filter(({ m }) => m.valores?.length);
    const porDefecto = marcos.findIndex((m) => m.default);
    // if (marco 0) … else if (marco 1) … else (Default)
    for (const { m, i } of conValores) {
      // Un marco con valores que además es el Default: sus valores van al Default.
      if (i === porDefecto) continue;
      c.push(...condicion(m.valores), ins("if"));
      marco(i);
      c.push(ins("else"));
    }
    if (porDefecto >= 0) marco(porDefecto);
    for (const { i } of conValores) if (i !== porDefecto) c.push(ins("end"));
    for (const t of salidas) dejar(k, t.id, "y", t.l, tipoWasm(t.x.tOut(0)));
  }

  /**
   * El cuerpo de una estructura (o de un marco). Con menos de dos nodos largos,
   * en línea y en orden. Con más, como LabVIEW los corre a la vez —dos Wait en
   * el mismo bucle se solapan—, se parte en clumps (un subplan): cada uno es una
   * función, y la estructura llama a `correr_plan`, que los corre por flujo de
   * datos y espera a todos (DT-041).
   */
  function emitirCuerpo(cuerpo, sid, k) {
    const rep = (id) => representante(id, sid);
    const { lista, cadenas } = conMarcos(cuerpo);
    const orden = ordenArriba(g, lista, rep, cadenas);
    if (orden.filter(esLargo).length < 2) {
      for (const id of orden) emitirEn(id, k);
      return;
    }
    const { clumpDe: deSub, clumps: sub } = partir(g, orden, rep, esLargo, cadenas);
    const p = planes.push(sub) - 1;
    for (const id of orden) emitirEn(id, sub[deSub.get(id)]);
    k.cuerpo.push(ins("i32.const", p), ins("call", idImport("correr_plan")), ins("drop"));
  }

  /**
   * Un marco de una Flat Sequence: los túneles de entrada que lee primero, su
   * cuerpo y los túneles de salida que alimenta, que dan su valor al acabar el
   * marco. Lo que pasa de un marco a otro, si van en clumps distintos, viaja por
   * una global (DT-041).
   */
  function emitirMarcoFlat(seq, m, k) {
    const deAqui = ids.filter((id) => porId.get(id).dentro === seq);
    const c = k.cuerpo;
    for (const id of deAqui.filter((x) => porId.get(x).tipo === "tunnel-in" && marcoEnFlat(porId.get(x), seq) === m)) {
      const x = contexto(id, k);
      const vt = tipoWasm(x.tOut(0));
      const l = k.locales.push(vt) - 1;
      c.push(...x.entrada(0), ins("local.set", l));
      valor.set(`${id}.y`, { local: l, clump: k });
    }
    emitirCuerpo(deAqui.filter((id) => porId.get(id).marco === m), seq, k);
    for (const id of deAqui.filter((x) => porId.get(x).tipo === "tunnel-out" && marcoEnFlat(porId.get(x), seq) === m)) {
      const x = contexto(id, k);
      const vt = tipoWasm(x.tOut(0));
      const l = k.locales.push(vt) - 1;
      c.push(...x.entrada(0), ins("local.set", l));
      dejar(k, id, "y", l, vt);
    }
  }

  /**
   * Una Stacked Sequence, en línea: los túneles de entrada se leen una vez;
   * cada marco corre entero, en orden, y sus datos llegan a los marcos de
   * después como locales; los túneles de salida dan su valor cuando acaba el
   * último marco, porque la secuencia es un nodo (de la ayuda de NI: es lo que
   * la distingue de la Flat).
   */
  function emitirSecuencia(sid, k) {
    const s = porId.get(sid);
    const deAqui = ids.filter((id) => porId.get(id).dentro === sid);
    const c = k.cuerpo;
    for (const id of deAqui.filter((x) => porId.get(x).tipo === "tunnel-in")) {
      const x = contexto(id, k);
      const l = k.locales.push(tipoWasm(x.tOut(0))) - 1;
      c.push(...x.entrada(0), ins("local.set", l));
      valor.set(`${id}.y`, { local: l, clump: k });
    }
    (s.config?.marcos ?? []).forEach((_, m) => emitirCuerpo(deAqui.filter((id) => porId.get(id).marco === m), sid, k));
    for (const id of deAqui.filter((x) => porId.get(x).tipo === "tunnel-out")) {
      const x = contexto(id, k);
      const vt = tipoWasm(x.tOut(0));
      const l = k.locales.push(vt) - 1;
      c.push(...x.entrada(0), ins("local.set", l));
      dejar(k, id, "y", l, vt);
    }
  }

  const emitirEn = (id, k) => {
    const m = deMarco(id);
    if (m) return emitirMarcoFlat(m[0], Number(m[1]), k);
    const tipo = porId.get(id).tipo;
    if (tipo === "case-structure") return emitirCase(id, k);
    if (tipo === "flat-sequence" || tipo === "stacked-sequence") return emitirSecuencia(id, k);
    return esEstructura(id) ? emitirEstructura(id, k) : emitirNodo(id, k);
  };
  for (const id of arriba) emitirEn(id, clumps[clumpRaiz.get(id)]);
  if (errores.length) return { errores };

  const tiposF = [];
  const tipo = (params, results) => {
    const clave = JSON.stringify([params, results]);
    let i = tiposF.findIndex((t) => JSON.stringify([t.params, t.results]) === clave);
    if (i < 0) i = tiposF.push({ params, results }) - 1;
    return i;
  };
  // La zona estática, detrás del data space; el montón, detrás (alineado a 8).
  const datos = [];
  let libre = CELDAS + ((espacio + 7) & ~7);
  for (const { celda, bytes } of constantes) {
    datos.push({ desde: libre, bytes }, { desde: celda, bytes: i32(libre) });
    libre = (libre + bytes.length + 3) & ~3;
  }
  datos.push(...datosFijos);
  datos.push({ desde: CIMA, bytes: i32((libre + 7) & ~7) });
  const primera = IMPORTACIONES.length + MEMORIA.length;
  const modulo = {
    tipos: tiposF,
    importaciones: IMPORTACIONES.map((im) => ({ modulo: im.modulo, nombre: im.nombre, tipo: tipo(im.params, im.results) })),
    funciones: [
      ...MEMORIA.map((f) => ({ tipo: tipo(f.params, f.results), locales: f.locales, cuerpo: f.cuerpo })),
      ...[...clumps, ...planes.flat()].map((k) => ({ tipo: tipo([], []), locales: k.locales, cuerpo: k.cuerpo })),
    ],
    globales,
    memoria: { paginas: 1 },
    datos,
    exportaciones: [
      ...EXPORTADAS.map((nombre) => ({ nombre, funcion: IMPORTACIONES.length + MEMORIA_NOMBRES.indexOf(nombre) })),
      ...[...clumps.map((_, i) => `c${i}`), ...planes.flatMap((sub, p) => sub.map((_, i) => `p${p}c${i}`))].map((nombre, i) => ({ nombre, funcion: primera + i })),
    ],
  };
  const plan = (lista) => lista.map((k) => ({ deps: [...k.deps], largo: k.largo }));
  return { bytes: codificar(modulo), modulo, controles, indicadores, clumps: plan(clumps), planes: planes.map(plan), automaticos, disposicionError: disposicionCompleta(ERROR) };
}

// La expresión de un Expression Node: una fórmula de una sola variable, como
// «x*2+1» o «sqrt(a)**2». Se analiza a un árbol que el compilador emite.
//
// La sintaxis es la del Formula Node de LabVIEW, que es la de C, comprobada en
// LabVIEW 2026 Q3 (labview-captures/expresion/):
// - `**` es la potencia, asociativa por la derecha y más fuerte que el menos de
//   delante: -x**2 = -(x**2) y x**3**2 = x**9.
// - `^` es el o exclusivo bit a bit, más débil que + y -, y sólo vale con
//   enteros: con un DBL, LabVIEW da «Integer type required».
// - `%` es el resto truncado, como fmod de C (-2.5 % 2 = -0.5).
// - Números con decimales y exponente. La constante `pi`.
// - Las funciones de FUNCIONES, con su número de argumentos.
// Sin hacer: la coma como operador, las comparaciones, los lógicos, los
// desplazamientos y `sizeOfDim`, que espera a los arrays.
//
// Módulo puro: lo usan el compilador, el ejecutor y el editor.

/** frexp en base 2: x = m * 2^e, con 1 <= |m| < 2; 0, Inf y NaN dan (x, 0). */
function partir(x) {
  if (x === 0 || !Number.isFinite(x)) return [x, 0];
  let e = Math.floor(Math.log2(Math.abs(x)));
  let m = x / 2 ** e;
  if (Math.abs(m) >= 2) [m, e] = [m / 2, e + 1];
  if (Math.abs(m) < 1) [m, e] = [m * 2, e - 1];
  return [m, e];
}

/**
 * Las funciones de la ayuda contextual del Expression Node, con su número de
 * argumentos. `wasm`, la instrucción que la calcula; sin ella, `js`, que el
 * compilador importa del módulo `math`. Comprobados en LabVIEW: sinc(x) =
 * sin(x)/x; int redondea al par; intrz trunca; mod y rem truncan los dos, como
 * `%`; getexp y getman parten en base 2 (-2.5 → 1 y -1.25).
 */
export const FUNCIONES = {
  abs: { args: 1, wasm: "f64.abs" },
  acos: { args: 1, js: Math.acos },
  acosh: { args: 1, js: Math.acosh },
  asin: { args: 1, js: Math.asin },
  asinh: { args: 1, js: Math.asinh },
  atan: { args: 1, js: Math.atan },
  atanh: { args: 1, js: Math.atanh },
  ceil: { args: 1, wasm: "f64.ceil" },
  cos: { args: 1, js: Math.cos },
  cosh: { args: 1, js: Math.cosh },
  cot: { args: 1, js: (x) => 1 / Math.tan(x) },
  csc: { args: 1, js: (x) => 1 / Math.sin(x) },
  exp: { args: 1, js: Math.exp },
  expm1: { args: 1, js: Math.expm1 },
  floor: { args: 1, wasm: "f64.floor" },
  getexp: { args: 1, js: (x) => partir(x)[1] },
  getman: { args: 1, js: (x) => partir(x)[0] },
  int: { args: 1, wasm: "f64.nearest" },
  intrz: { args: 1, wasm: "f64.trunc" },
  ln: { args: 1, js: Math.log },
  lnp1: { args: 1, js: Math.log1p },
  log: { args: 1, js: Math.log10 },
  log2: { args: 1, js: Math.log2 },
  max: { args: 2, wasm: "f64.max" },
  min: { args: 2, wasm: "f64.min" },
  mod: { args: 2, js: (x, y) => x % y },
  rand: { args: 0, js: Math.random },
  rem: { args: 2, js: (x, y) => x % y },
  sec: { args: 1, js: (x) => 1 / Math.cos(x) },
  sign: { args: 1, js: Math.sign },
  sin: { args: 1, js: Math.sin },
  sinc: { args: 1, js: (x) => (x === 0 ? 1 : Math.sin(x) / x) },
  sinh: { args: 1, js: Math.sinh },
  sqrt: { args: 1, wasm: "f64.sqrt" },
  tan: { args: 1, js: Math.tan },
  tanh: { args: 1, js: Math.tanh },
};

/** Las de la ayuda que aún no se pueden usar, con el motivo. */
const PENDIENTES = { sizeOfDim: "waits for arrays" };

const CONSTANTES = { pi: Math.PI };

function lexemas(texto) {
  const r = [];
  const re = /\s*(?:(\d+\.?\d*(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?)|([A-Za-z_]\w*)|(\*\*|.))/gy;
  let m;
  let fin = 0;
  while (fin < texto.length && (m = re.exec(texto))) {
    fin = re.lastIndex;
    if (m[1] !== undefined) r.push({ t: "num", v: Number(m[1]) });
    else if (m[2] !== undefined) r.push({ t: "id", v: m[2] });
    else if (m[3] !== undefined && m[3].trim()) r.push({ t: "op", v: m[3] });
  }
  return r;
}

/**
 * Analiza una expresión. Devuelve `{ ast, variable, xor }` —`variable` es el
 * nombre de la única variable, o null si no usa ninguna; `xor`, si usa `^`, que
 * sólo vale con enteros— o `{ error }` con el motivo. El árbol: `{ n: número }`,
 * `{ var }`, `{ op, a, b }`, `{ neg, a }`, `{ fn, args }`.
 */
export function analizar(texto) {
  const toks = lexemas(texto);
  let i = 0;
  let variable = null;
  let xor = false;
  const error = (m) => {
    throw new Error(m);
  };
  const ver = () => toks[i];
  const op = (c) => ver()?.t === "op" && ver().v === c;

  function oExclusivo() {
    let a = suma();
    while (op("^")) {
      i++;
      xor = true;
      a = { op: "^", a, b: suma() };
    }
    return a;
  }
  function suma() {
    let a = producto();
    while (op("+") || op("-")) {
      const o = toks[i++].v;
      a = { op: o, a, b: producto() };
    }
    return a;
  }
  function producto() {
    let a = unario();
    while (op("*") || op("/") || op("%")) {
      const o = toks[i++].v;
      a = { op: o, a, b: unario() };
    }
    return a;
  }
  function unario() {
    if (op("-")) {
      i++;
      return { neg: true, a: unario() };
    }
    if (op("+")) {
      i++;
      return unario();
    }
    return potencia();
  }
  function potencia() {
    const a = atomo();
    if (op("**")) {
      i++;
      // Asociativa por la derecha; el exponente puede llevar signo.
      return { op: "**", a, b: unario() };
    }
    return a;
  }
  function atomo() {
    const t = toks[i++];
    if (!t) error("the expression ends too early");
    if (t.t === "num") return { n: t.v };
    if (t.t === "id") {
      if (op("(")) {
        if (Object.hasOwn(PENDIENTES, t.v)) error(`the function "${t.v}" ${PENDIENTES[t.v]}`);
        const f = Object.hasOwn(FUNCIONES, t.v) && FUNCIONES[t.v];
        if (!f) error(`the function "${t.v}" does not exist`);
        i++;
        const args = [];
        if (!op(")")) {
          args.push(oExclusivo());
          while (op(",")) {
            i++;
            args.push(oExclusivo());
          }
        }
        if (!op(")")) error("a closing parenthesis is missing");
        i++;
        if (args.length !== f.args) error(`"${t.v}" takes ${f.args} argument${f.args === 1 ? "" : "s"}`);
        return { fn: t.v, args };
      }
      if (Object.hasOwn(CONSTANTES, t.v)) return { n: CONSTANTES[t.v] };
      if (variable !== null && variable !== t.v) error(`only one variable is allowed: "${variable}" and "${t.v}"`);
      variable = t.v;
      return { var: t.v };
    }
    if (t.v === "(") {
      const a = oExclusivo();
      if (!op(")")) error("a closing parenthesis is missing");
      i++;
      return a;
    }
    return error(`unexpected "${t.v}"`);
  }

  try {
    if (!texto.trim()) return { error: "the expression is empty" };
    const ast = oExclusivo();
    if (i < toks.length) error(`unexpected "${toks[i].v ?? toks[i].t}"`);
    return { ast, variable, xor };
  } catch (e) {
    return { error: e.message };
  }
}

/** El o exclusivo de dos valores enteros guardados en DBL. */
const oExcl = (a, b) => Number(BigInt(Math.round(a)) ^ BigInt(Math.round(b)));

/** Evalúa el árbol con un valor para la variable: la referencia contra la que se prueba el compilador. */
export function evaluar(ast, x) {
  if ("n" in ast) return ast.n;
  if ("var" in ast) return x;
  if ("neg" in ast) return -evaluar(ast.a, x);
  if ("fn" in ast) {
    const args = ast.args.map((a) => evaluar(a, x));
    const f = FUNCIONES[ast.fn];
    if (f.js) return f.js(...args);
    return { abs: Math.abs, ceil: Math.ceil, floor: Math.floor, sqrt: Math.sqrt, intrz: Math.trunc, max: Math.max, min: Math.min, int: redondearPar }[ast.fn](...args);
  }
  const [a, b] = [evaluar(ast.a, x), evaluar(ast.b, x)];
  return { "+": a + b, "-": a - b, "*": a * b, "/": a / b, "%": a % b, "**": a ** b, "^": oExcl(a, b) }[ast.op];
}

function redondearPar(v) {
  const r = Math.round(v);
  return r - v === 0.5 && r % 2 !== 0 ? r - 1 : r;
}

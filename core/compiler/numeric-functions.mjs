// The numeric functions every compiled module carries (DT-039): what an instruction sequence cannot do on the stack
// alone, because it needs its operand twice.

const ins = (op, arg) => (arg === undefined ? { op } : { op, arg });

/**
 * not_a_number_to_infinity(x) → x, or +∞ when x is NaN. A float becomes an integer saturated, and LabVIEW gives the
 * largest value of the integer type for NaN, as for +∞ (measured in 2026 Q3, labview-captures/reports/
 * 2026-11-16-numeric-edges.md Q4); WebAssembly's saturating truncation gives 0.
 */
const notANumberToInfinity = {
  nombre: "not_a_number_to_infinity",
  params: ["f64"],
  results: ["f64"],
  locales: [],
  cuerpo: [ins("local.get", 0), ins("f64.const", Infinity), ins("local.get", 0), ins("local.get", 0), ins("f64.eq"), ins("select")],
};

/** The numeric functions, in the order they go in the module. */
export const NUMERIC_FUNCTIONS = [notANumberToInfinity];
export const NUMERIC_FUNCTION_NAMES = NUMERIC_FUNCTIONS.map((numericFunction) => numericFunction.nombre);

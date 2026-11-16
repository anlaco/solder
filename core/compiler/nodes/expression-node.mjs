// Numeric ▸ Expression Node: the formula is computed in DBL and the result goes back to the terminal's type, rounded to
// even (checked in LabVIEW: with an I32, 3/2 gives 2, 5/2 gives 2 and 5*2.7 gives 14). `^` is the exclusive or and
// works only on integers; the power is `**`.

import { esEntero } from "../../model/types.mjs";
import { FUNCIONES, analizar } from "../expression-parser.mjs";
import { importIndex } from "../host-imports.mjs";
import { ins } from "../instructions.mjs";
import { convertValue } from "../wasm-types.mjs";

const BINARY_INSTRUCTIONS = { "+": "f64.add", "-": "f64.sub", "*": "f64.mul", "/": "f64.div" };

/** The instructions of one expression tree over `variable`, the local that holds x. */
function emitTree(tree, variable) {
  const emit = (subtree) => emitTree(subtree, variable);
  const toInteger = [ins("f64.nearest"), ins("i64.trunc_sat_f64_s")];
  if ("n" in tree) return [ins("f64.const", tree.n)];
  if ("var" in tree) return [ins("local.get", variable)];
  if ("neg" in tree) return [...emit(tree.a), ins("f64.neg")];
  if ("fn" in tree) {
    const builtIn = FUNCIONES[tree.fn];
    return [...tree.args.flatMap(emit), builtIn.wasm ? ins(builtIn.wasm) : ins("call", importIndex(`fn_${tree.fn}`))];
  }
  const [left, right] = [emit(tree.a), emit(tree.b)];
  if (tree.op === "**") return [...left, ...right, ins("call", importIndex("pow"))];
  if (tree.op === "%") return [...left, ...right, ins("call", importIndex("fn_mod"))];
  if (tree.op === "^") return [...left, ...toInteger, ...right, ...toInteger, ins("i64.xor"), ins("f64.convert_i64_s")];
  return [...left, ...right, ins(BINARY_INSTRUCTIONS[tree.op])];
}

/** Expression Node: its formula over its input, converted to and from DBL. */
export function expressionNode(node) {
  const parsed = analizar(node.nodo.config?.expression ?? "x");
  if (parsed.error) throw new Error(`the expression "${node.nodo.config?.expression}" is not valid: ${parsed.error}`);
  if (parsed.xor && !esEntero(node.tIn(0))) throw new Error("exclusive or \"^\" needs an integer (Integer type required); the power is \"**\"");
  const variable = node.temporal("f64");
  return [...node.entrada(0), ...convertValue(node.tIn(0), "number"), ins("local.set", variable), ...emitTree(parsed.ast, variable), ...convertValue("number", node.tOut(0))];
}

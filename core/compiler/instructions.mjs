// The instructions the compiler emits, as plain objects that wasm-encoder.mjs encodes: `{ op }` or `{ op, arg }`, with
// WebAssembly's own text names for `op` ("i32.add", "local.get"). The compiler builds about 1,400 of them, so the
// builder keeps the short name `ins`, read as WebAssembly's mnemonics are; the two most frequent forms have their own.

/** One instruction: its WebAssembly text name and, when it takes one, its immediate argument. */
export const ins = (op, arg) => (arg === undefined ? { op } : { op, arg });

/** Pushes the value of a local. */
export const localGet = (local) => ins("local.get", local);

/** Pushes a 32-bit integer constant. */
export const i32Const = (value) => ins("i32.const", value);

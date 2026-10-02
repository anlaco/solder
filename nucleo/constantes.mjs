// Las constantes de la subpaleta Math & Scientific Constants. Nombres, símbolos
// y valores de la ayuda contextual de LabVIEW 2026 Q3 (paletas/functions-numeric-
// math-constants.png); todas son DBL. Las físicas, con las unidades de la ayuda.
//
// Módulo puro: lo usan el compilador, que las emite, y el editor, que las rotula.

export const CONSTANTES_MATEMATICAS = {
  pi: { simbolo: "π", valor: Math.PI },
  "pi-multiplied-by-2": { simbolo: "2π", valor: 2 * Math.PI },
  "pi-divided-by-2": { simbolo: "π/2", valor: Math.PI / 2 },
  "reciprocal-of-pi": { simbolo: "1/π", valor: 1 / Math.PI },
  "natural-logarithm-of-pi": { simbolo: "lnπ", valor: Math.log(Math.PI) },
  "natural-logarithm-base": { simbolo: "e", valor: Math.E },
  "reciprocal-of-e": { simbolo: "1/e", valor: 1 / Math.E },
  "base-10-logarithm-of-e": { simbolo: "log₁₀e", valor: Math.LOG10E },
  "natural-logarithm-of-10": { simbolo: "ln10", valor: Math.LN10 },
  "natural-logarithm-of-2": { simbolo: "ln2", valor: Math.LN2 },
  "plancks-constant": { simbolo: "h", valor: 6.62607015e-34 },
  "elementary-charge": { simbolo: "e", valor: 1.602176634e-19 },
  "speed-of-light-in-vacuum": { simbolo: "c", valor: 299792458 },
  "gravitational-constant": { simbolo: "G", valor: 6.6743e-11 },
  "avogadro-constant": { simbolo: "Nₐ", valor: 6.02214076e23 },
  "rydberg-constant": { simbolo: "R∞", valor: 10973731.56816 },
  "molar-gas-constant": { simbolo: "R", valor: 8.314462618 },
};

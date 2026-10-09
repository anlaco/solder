// Exact number-to-text conversions shared by the String functions (DT-042 b):
// the decimal value of a double, rounding to nearest with ties to even, and
// the fractional and scientific notations, measured in LabVIEW 2026 Q3
// (labview-captures/string/prueba-*.png, labview-captures/format-scan/).

/** El valor exacto de un double: |x| = N / 10^s, con N entero. */
export function decimalExacto(x) {
  const v = new DataView(new ArrayBuffer(8));
  v.setFloat64(0, Math.abs(x));
  const bits = v.getBigUint64(0);
  const e = Number((bits >> 52n) & 0x7ffn);
  const frac = bits & 0xfffffffffffffn;
  const m = e === 0 ? frac : frac | (1n << 52n);
  const dos = (e === 0 ? 1 : e) - 1075; // |x| = m · 2^dos
  if (dos >= 0) return { N: m << BigInt(dos), s: 0 };
  // m / 2^k = m · 5^k / 10^k
  return { N: m * 5n ** BigInt(-dos), s: -dos };
}

/** N · 10^p / den, redondeado al más cercano y, en un empate, al par (como printf de C). */
export function dividirAlPar(num, den) {
  const q = num / den;
  const r2 = (num % den) * 2n;
  return r2 > den || (r2 === den && q % 2n === 1n) ? q + 1n : q;
}
export const pot10 = (n) => 10n ** BigInt(n);
export const unir = (q, p) => {
  const d = q.toString().padStart(p + 1, "0");
  return p ? `${d.slice(0, -p)}.${d.slice(-p)}` : d;
};

/** Pasa el separador decimal «.» al del sistema. */
export const separar = (t, sep) => (sep === "." ? t : t.replace(".", sep));

/** Rellena hasta `ancho` caracteres: a la izquierda si es positivo y a la derecha si es negativo. */
export const rellenar = (t, ancho, caracter = " ") => {
  const w = Math.abs(ancho);
  return t.length >= w ? t : ancho > 0 ? t.padStart(w, caracter) : t.padEnd(w, " ");
};

export const noFinito = (x) => (Number.isNaN(x) ? "NaN" : x > 0 ? "Inf" : "-Inf");
export const negativo = (x) => x < 0 || Object.is(x, -0);

/** Un número de coma flotante, redondeado al entero más cercano y, en un empate, al par, y saturado a I64. */
export function aEntero64(x) {
  if (Number.isNaN(x)) return 0n;
  const { N, s } = decimalExacto(Number.isFinite(x) ? x : Math.sign(x) * Number.MAX_VALUE);
  const q = dividirAlPar(N, pot10(s));
  const v = x < 0 ? -q : q;
  return v > 2n ** 63n - 1n ? 2n ** 63n - 1n : v < -(2n ** 63n) ? -(2n ** 63n) : v;
}

/** La notación fraccionaria con `p` decimales. */
export function fraccionaria(x, p) {
  const { N, s } = decimalExacto(x);
  const q = dividirAlPar(N * pot10(p), pot10(s));
  return (negativo(x) ? "-" : "") + unir(q, p);
}

/** La notación exponencial (`ingenieria` falso) o de ingeniería (exponente múltiplo de 3): d.dddE+n, el exponente sin ceros de relleno. */
export function cientifica(x, p, ingenieria) {
  const signo = negativo(x) ? "-" : "";
  const { N, s } = decimalExacto(x);
  if (N === 0n) return `${signo}${unir(0n, p)}E+0`;
  let E = N.toString().length - 1 - s; // |x| = d,ddd · 10^E
  for (;;) {
    const E3 = ingenieria ? Math.floor(E / 3) * 3 : E;
    const k = E - E3 + 1; // cifras enteras de la mantisa
    // mantisa = |x| / 10^E3, con p decimales
    const e10 = s + E3;
    const q = e10 >= 0 ? dividirAlPar(N * pot10(p), pot10(e10)) : N * pot10(p - e10);
    if (q.toString().length > k + p) {
      E++; // el redondeo llevó la mantisa a 10^k: se renormaliza
      continue;
    }
    return `${signo}${unir(q, p)}E${E3 < 0 ? "-" : "+"}${Math.abs(E3)}`;
  }
}


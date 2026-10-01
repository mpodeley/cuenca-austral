/** Mismos supuestos que pipeline/arps.py: el navegador sólo evalúa curvas, no ajusta. */
export const DMIN = -Math.log(1 - 0.08) / 12
export const Q_ECON = { gas: 1.0, oil: 0.3 }

export const hyperbolic = (t: number, qi: number, di: number, b: number) => qi / Math.pow(1 + b * di * t, 1 / b)

/** Tasas de los meses siguientes al último dato, ancladas en la última tasa real. */
export function project(qLast: number, tLast: number, months: number, di: number, b: number): number[] {
  const out: number[] = []
  let q = qLast
  for (let k = 0; k < months; k++) {
    q *= Math.exp(-Math.max(di / (1 + b * di * (tLast + k)), DMIN))
    out.push(q)
  }
  return out
}

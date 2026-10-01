import type { Fluid } from '../types'

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

export function num(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  return value.toLocaleString('es-AR', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

/** Decimales según magnitud: 1.234 · 123 · 12,3 · 1,23 */
export function auto(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  const size = Math.abs(value)
  return num(value, size >= 100 ? 0 : size >= 10 ? 1 : 2)
}

export const pct = (value: number | null | undefined, digits = 0) =>
  value === null || value === undefined ? '—' : `${num(value * 100, digits)} %`

/** "2026-08" → "ago 26" */
export function monthLabel(month: string | null | undefined): string {
  if (!month) return '—'
  return `${MONTHS[Number(month.slice(5, 7)) - 1]} ${month.slice(2, 4)}`
}

export function monthAt(origin: string, index: number): string {
  const total = Number(origin.slice(0, 4)) * 12 + Number(origin.slice(5, 7)) - 1 + index
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`
}

/**
 * Las tasas se publican en Mm³/d (gas) y m³/d (petróleo). A escala de bloque o
 * cuenca el gas se muestra en MMm³/d cuando supera los 1.000 Mm³/d.
 */
export function rateUnit(fluid: Fluid, max: number): { unit: string; div: number } {
  if (fluid === 'oil') return { unit: 'm³/d', div: 1 }
  return max >= 1000 ? { unit: 'MMm³/d', div: 1000 } : { unit: 'Mm³/d', div: 1 }
}

export function rate(fluid: Fluid, value: number | null | undefined): string {
  if (value === null || value === undefined) return '—'
  const { unit, div } = rateUnit(fluid, value)
  return `${auto(value / div)} ${unit}`
}

/** Acumuladas y EUR: gas en MMm³, petróleo en Mm³. */
export const volumeUnit = (fluid: Fluid) => (fluid === 'gas' ? 'MMm³' : 'Mm³')
export const volume = (fluid: Fluid, value: number | null | undefined) =>
  value === null || value === undefined ? '—' : `${auto(value)} ${volumeUnit(fluid)}`

export function title(text: string): string {
  return text.toLowerCase().replace(/(^|[\s\-(/.])([a-záéíóúñ])/g, (_, lead: string, letter: string) => lead + letter.toUpperCase())
}

const SHORT: Array<[RegExp, string]> = [
  [/COMPAÑÍA GENERAL DE COMBUSTIBLES S\.A\./i, 'CGC'], [/TOTAL AUSTRAL S\.A\./i, 'TotalEnergies (Total Austral)'],
  [/PETROLERA SANTA MARIA SAU/i, 'Petrolera Santa María'], [/GEOPARK.*/i, 'GeoPark'], [/PAN AMERICAN ENERGY.*/i, 'PAE'],
  [/PETROQUIMICA COMODORO RIVADAVIA S\.A\./i, 'PCR'], [/ENAP SIPETROL.*/i, 'Enap Sipetrol'],
]
export function operatorName(name: string): string {
  for (const [pattern, short] of SHORT) if (pattern.test(name)) return short
  return title(name.replace(/\s+S\.?\s?A\.?(\s?U\.?)?$|\s+S\.E\.$|\s+ARGENTINA S A$/i, ''))
}

export function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return NaN
  const position = (sorted.length - 1) * q
  const low = Math.floor(position)
  const high = Math.ceil(position)
  return sorted[low] + (sorted[high] - sorted[low]) * (position - low)
}

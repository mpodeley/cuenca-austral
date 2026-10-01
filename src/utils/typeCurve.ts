import type { Fluid, SeriesFile, Well } from '../types'
import { quantile } from './format'

export const MIN_WELLS = 8
export const MIN_AT_T = 4
const MIN_MONTHS = 12
const MAX_MONTHS = 120

export interface TypeCurve { n: number; points: Array<{ t: number; p10: number; p50: number; p90: number; n: number }> }

/**
 * Pozo tipo "en vivo": percentiles por mes en producción. Sólo entran pozos cuyo
 * arranque se observa (después de enero 2006) y cuyo fluido principal coincide.
 * Convención petrolera: P10 es el caso alto.
 */
export function computeTypeCurve(wells: Well[], series: SeriesFile, fluid: Fluid): TypeCurve | null {
  const cohort: number[][] = []
  for (const well of wells) {
    if (well.pre2006 || well.fluido !== fluid) continue
    const rates = series.wells[well.id]?.[fluid]
    if (rates && rates.length >= MIN_MONTHS) cohort.push(rates)
  }
  if (cohort.length < MIN_WELLS) return null
  const points: TypeCurve['points'] = []
  for (let t = 0; t < MAX_MONTHS; t++) {
    const alive = cohort.filter(rates => rates.length > t).map(rates => rates[t]).sort((a, b) => a - b)
    if (alive.length < MIN_AT_T) break
    points.push({ t, p10: quantile(alive, 0.9), p50: quantile(alive, 0.5), p90: quantile(alive, 0.1), n: alive.length })
  }
  return { n: cohort.length, points }
}

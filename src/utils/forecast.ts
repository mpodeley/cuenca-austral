import type { FieldForecast, Fluid, ForecastFile } from '../types'

export type Case = 'bajo' | 'central' | 'alto'
export interface Scenario { actividad: number; crecimiento: number; tope: number; caso: Case; aniosInventario: number }
export interface FieldEdit { ritmo?: number; inventario?: number }

export const PRESETS: Record<'ajuste' | 'base' | 'aceleracion', Scenario & { titulo: string; relato: string }> = {
  ajuste: {
    titulo: 'Ajuste', actividad: 0.5, crecimiento: 0, tope: 1, caso: 'central', aniosInventario: 10,
    relato: 'Se perfora la mitad del ritmo de los últimos cinco años. La cuenca queda cerca de su declinación natural.',
  },
  base: {
    titulo: 'Base', actividad: 1, crecimiento: 0, tope: 1, caso: 'central', aniosInventario: 10,
    relato: 'Cada campo sigue perforando al ritmo promedio de los últimos cinco años, con pozos como la mediana histórica.',
  },
  aceleracion: {
    titulo: 'Aceleración', actividad: 1.5, crecimiento: 10, tope: 2, caso: 'central', aniosInventario: 10,
    relato: 'La actividad arranca un 50 % por encima del ritmo reciente y crece 10 % por año hasta duplicarse.',
  },
}

export interface FieldResult { base: number[]; nuevos: number[]; pozos: number[]; inventario: number; ritmo: number }
export interface Result { hist: number[]; base: number[]; nuevos: number[]; pozos: number[]; campos: Record<string, FieldResult> }

const add = (target: number[], source: number[]) => { for (let i = 0; i < source.length; i++) target[i] += source[i] }

/** Pozos nuevos por mes de un campo: ritmo histórico × actividad × crecimiento, hasta agotar el inventario. */
export function schedule(pace: number, scenario: Scenario, inventory: number, months: number): number[] {
  const wells: number[] = []
  let drilled = 0
  for (let month = 0; month < months; month++) {
    const growth = Math.min(Math.pow(1 + scenario.crecimiento / 100, Math.floor(month / 12)), scenario.tope)
    const count = Math.max(0, Math.min((pace / 12) * scenario.actividad * growth, inventory - drilled))
    drilled += count
    wells.push(count)
  }
  return wells
}

/** Producción de los pozos nuevos: cada tanda mensual sigue el pozo tipo desde su mes de entrada. */
export function convolve(wells: number[], profile: number[], factor: number): number[] {
  const out = new Array<number>(wells.length).fill(0)
  for (let start = 0; start < wells.length; start++) {
    if (!wells[start]) continue
    for (let t = 0; start + t < wells.length && t < profile.length; t++) out[start + t] += wells[start] * profile[t] * factor
  }
  return out
}

export function fieldForecast(field: FieldForecast, fluid: Fluid, scenario: Scenario, edit: FieldEdit = {}): FieldResult {
  const base = fluid === 'gas' ? field.base_gas : field.base_oil
  const months = base.length
  const profile = field.tipo[fluid]
  const ritmo = edit.ritmo ?? field.ritmo
  const inventario = edit.inventario ?? Math.round(ritmo * scenario.aniosInventario)
  // Los pozos nuevos de un campo son de su fluido principal: sólo aportan a ese pronóstico.
  if (!profile || field.fluido !== fluid || ritmo <= 0) return { base, nuevos: new Array(months).fill(0), pozos: new Array(months).fill(0), inventario, ritmo }
  const factor = scenario.caso === 'bajo' ? profile.k_bajo : scenario.caso === 'alto' ? profile.k_alto : 1
  const pozos = schedule(ritmo, scenario, inventario, months)
  return { base, nuevos: convolve(pozos, profile.p50, factor), pozos, inventario, ritmo }
}

export function runForecast(data: ForecastFile, fluid: Fluid, scenario: Scenario, edits: Record<string, FieldEdit> = {}, only?: string[]): Result {
  const months = data.meses
  const result: Result = { hist: new Array(data.n).fill(0), base: new Array(months).fill(0), nuevos: new Array(months).fill(0), pozos: new Array(months).fill(0), campos: {} }
  for (const [name, field] of Object.entries(data.campos)) {
    if (only && !only.includes(name)) continue
    const one = fieldForecast(field, fluid, scenario, edits[name])
    result.campos[name] = one
    add(result.hist, fluid === 'gas' ? field.hist_gas : field.hist_oil)
    add(result.base, one.base); add(result.nuevos, one.nuevos); add(result.pozos, one.pozos)
  }
  return result
}

/** Promedio de los 12 meses que terminan en el mes ``years`` × 12 del pronóstico. */
export const yearAverage = (series: number[], years: number) => {
  const slice = series.slice(years * 12 - 12, years * 12)
  return slice.reduce((sum, value) => sum + value, 0) / (slice.length || 1)
}

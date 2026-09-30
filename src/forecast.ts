import type { ArpsParams, ForecastPoint, Well } from './types'

export const FORECAST_MONTHS = 240

export function arpsRate(month: number, params: ArpsParams): number {
  const di = params.diAnnual / 12
  const terminal = params.terminalAnnual / 12
  const b = Math.max(0.01, params.b)
  const transitionMonth = Math.max(0, (di / terminal - 1) / (b * di))

  if (month <= transitionMonth) {
    return params.qi / Math.pow(1 + b * di * month, 1 / b)
  }

  const transitionRate = params.qi / Math.pow(1 + b * di * transitionMonth, 1 / b)
  return transitionRate * Math.exp(-terminal * (month - transitionMonth))
}

export function alignedGasRates(wells: Well[]): number[][] {
  return wells
    .map((well) => well.production
      .filter((point) => point.gasMm3 > 0)
      .map((point) => point.producingDays > 0 ? point.gasMm3 / point.producingDays : point.gasMm3 / 30.4375))
    .filter((series) => series.length >= 12)
}

function percentile(values: number[], p: number): number {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const index = (sorted.length - 1) * p
  const lower = Math.floor(index)
  const upper = Math.ceil(index)
  if (lower === upper) return sorted[lower]
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower)
}

export function empiricalCurve(series: number[][], p: number, maxMonths = 60): number[] {
  return Array.from({ length: maxMonths }, (_, month) =>
    percentile(series.map((well) => well[month]).filter((value): value is number => Number.isFinite(value)), p),
  )
}

export function fitArps(curve: number[]): ArpsParams {
  const usable = curve.filter((value) => value > 0)
  if (!usable.length) return { qi: 1, diAnnual: 0.45, b: 0.8, terminalAnnual: 0.05 }

  let best: ArpsParams = { qi: Math.max(...usable.slice(0, 3)), diAnnual: 0.45, b: 0.8, terminalAnnual: 0.05 }
  let bestError = Number.POSITIVE_INFINITY
  const qiBase = best.qi

  for (const qiScale of [0.9, 1, 1.1, 1.25]) {
    for (let di = 0.15; di <= 1.5; di += 0.05) {
      for (let b = 0.2; b <= 1.6; b += 0.1) {
        const candidate = { qi: qiBase * qiScale, diAnnual: di, b, terminalAnnual: 0.05 }
        const error = usable.reduce((sum, observed, month) => {
          const predicted = arpsRate(month, candidate)
          const residual = Math.log1p(observed) - Math.log1p(predicted)
          return sum + residual * residual
        }, 0)
        if (error < bestError) {
          bestError = error
          best = candidate
        }
      }
    }
  }
  return best
}

export function buildForecast(wells: Well[], params: ArpsParams): ForecastPoint[] {
  const series = alignedGasRates(wells)
  const observed = empiricalCurve(series, 0.5)
  return Array.from({ length: FORECAST_MONTHS }, (_, month) => {
    const central = arpsRate(month, params)
    return {
      month,
      observed: observed[month] || undefined,
      low: central * 0.75,
      central,
      high: central * 1.25,
    }
  })
}

export function blockForecast(
  typeCurve: ForecastPoint[],
  existingMonthlyRate: number,
  newWellsPerMonth: number,
  inventory: number,
  months = 120,
): number[] {
  let drilled = 0
  return Array.from({ length: months }, (_, month) => {
    const base = existingMonthlyRate * Math.exp(-0.12 / 12 * month)
    let additions = 0
    for (let start = 0; start <= month && drilled < inventory; start += 1) {
      const wellsThisMonth = Math.min(newWellsPerMonth, inventory - start * newWellsPerMonth)
      if (wellsThisMonth <= 0) break
      additions += (typeCurve[month - start]?.central ?? 0) * 30.4375 * wellsThisMonth
      drilled = Math.min(inventory, drilled + wellsThisMonth)
    }
    drilled = 0
    return base + additions
  })
}


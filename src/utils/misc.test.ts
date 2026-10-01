import { describe, expect, it } from 'vitest'
import { parseRoute, routeHash } from '../App'
import { auto, monthAt, monthLabel, operatorName, quantile, rate, title } from './format'
import { binIndex, projY, quantileBreaks } from './geo'
import { hyperbolic, project, DMIN } from './arps'
import { computeTypeCurve } from './typeCurve'
import type { SeriesFile, Well } from '../types'

describe('rutas', () => {
  it('ida y vuelta con nombres que traen barra y espacios', () => {
    const route = { tab: 'campo' as const, id: 'CAMPO INDIO ESTE - EL CERRITO/A' }
    expect(parseRoute(routeHash(route))).toEqual(route)
  })
  it('una ruta desconocida cae en el mapa', () => {
    expect(parseRoute('#/nada')).toEqual({ tab: 'mapa' })
    expect(parseRoute('')).toEqual({ tab: 'mapa' })
  })
})

describe('formato', () => {
  it('meses', () => {
    expect(monthLabel('2026-08')).toBe('ago 26')
    expect(monthAt('2006-01', 247)).toBe('2026-08')
  })
  it('el gas pasa a MMm³/d por encima de mil Mm³/d', () => {
    expect(rate('gas', 20926)).toBe('20,9 MMm³/d')
    expect(rate('gas', 466)).toBe('466 Mm³/d')
    expect(rate('oil', 783)).toBe('783 m³/d')
  })
  it('decimales según magnitud y nombres legibles', () => {
    expect([auto(1234.5), auto(12.34), auto(1.234), auto(null)]).toEqual(['1.235', '12,3', '1,23', '—'])
    expect(title('TIERRA DEL FUEGO - FRACCION B')).toBe('Tierra Del Fuego - Fraccion B')
    expect(operatorName('COMPAÑÍA GENERAL DE COMBUSTIBLES S.A.')).toBe('CGC')
    expect(operatorName('ROCH S.A.')).toBe('Roch')
  })
  it('cuantiles', () => {
    expect(quantile([1, 2, 3, 4, 5], 0.5)).toBe(3)
    expect(quantileBreaks([0, null, 1, 2, 3, 4], 2)).toEqual([3])
    expect(binIndex(2, [3])).toBe(0)
    expect(binIndex(3, [3])).toBe(1)
  })
  it('el norte queda arriba', () => {
    expect(projY(-49)).toBeLessThan(projY(-54))
  })
})

describe('arps', () => {
  it('la proyección nunca declina más lento que la terminal', () => {
    const rates = project(100, 500, 12, 0.001, 1)
    expect(rates[0]).toBeCloseTo(100 * Math.exp(-DMIN))
    expect(hyperbolic(0, 80, 0.05, 0.5)).toBe(80)
  })
})

describe('pozo tipo en vivo', () => {
  const well = (id: string, extra: Partial<Well> = {}) => ({ id, pre2006: false, fluido: 'gas', ...extra }) as Well
  const series = (count: number): SeriesFile => ({ t0: '2006-01', n: 100, wells: Object.fromEntries(Array.from({ length: count }, (_, i) => [String(i), { m0: 5, gas: new Array(20).fill(i + 1), oil: [], agua: [] }])) })
  it('pide un mínimo de pozos', () => {
    expect(computeTypeCurve([well('0'), well('1')], series(2), 'gas')).toBeNull()
  })
  it('P10 es el caso alto y los pozos anteriores a 2006 no entran', () => {
    const wells = [...Array.from({ length: 9 }, (_, i) => well(String(i))), well('9', { pre2006: true })]
    const curve = computeTypeCurve(wells, series(10), 'gas')!
    expect(curve.n).toBe(9)
    expect(curve.points[0].p50).toBe(5)
    expect(curve.points[0].p10).toBeGreaterThan(curve.points[0].p90)
  })
})

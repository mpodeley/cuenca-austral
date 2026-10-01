import { describe, expect, it } from 'vitest'
import { convolve, fieldForecast, runForecast, schedule, yearAverage } from './forecast'
import type { Scenario } from './forecast'
import type { FieldForecast, ForecastFile } from '../types'

const flat: Scenario = { actividad: 1, crecimiento: 0, tope: 1, caso: 'central', aniosInventario: 100 }
const field = (overrides: Partial<FieldForecast> = {}): FieldForecast => ({
  hist_gas: [10, 10], hist_oil: [1, 1], hist_agua: [0, 0], activos: [1, 1],
  base_gas: new Array(24).fill(5), base_oil: new Array(24).fill(1),
  tipo: { gas: { p50: new Array(24).fill(2), k_bajo: 0.5, k_alto: 2, n: 10, origen: 'bloque', eur: 1 }, oil: null },
  pozos_anio: {}, ritmo: 12, fluido: 'gas', offshore: false, operador: 'X', ...overrides,
})

describe('schedule', () => {
  it('reparte el ritmo anual en meses', () => {
    expect(schedule(12, flat, 1000, 24).every(count => count === 1)).toBe(true)
  })
  it('deja de perforar al agotar el inventario', () => {
    const wells = schedule(12, flat, 5, 24)
    expect(wells.reduce((a, b) => a + b, 0)).toBe(5)
    expect(wells[5]).toBe(0)
  })
  it('crece por año hasta el tope', () => {
    const wells = schedule(12, { ...flat, crecimiento: 50, tope: 2 }, 1000, 48)
    expect([wells[0], wells[12], wells[24], wells[36]]).toEqual([1, 1.5, 2, 2])
  })
})

describe('convolve', () => {
  it('cada tanda sigue el pozo tipo desde su mes de entrada', () => {
    expect(convolve([1, 1, 0, 0], [10, 5], 1)).toEqual([10, 15, 5, 0])
  })
})

describe('fieldForecast', () => {
  it('suma pozos nuevos sólo al fluido principal del campo', () => {
    expect(fieldForecast(field(), 'gas', flat).nuevos[0]).toBe(2)
    expect(fieldForecast(field(), 'oil', flat).nuevos.every(value => value === 0)).toBe(true)
  })
  it('los casos bajo y alto escalan el pozo tipo', () => {
    expect(fieldForecast(field(), 'gas', { ...flat, caso: 'bajo' }).nuevos[0]).toBe(1)
    expect(fieldForecast(field(), 'gas', { ...flat, caso: 'alto' }).nuevos[0]).toBe(4)
  })
  it('una edición del campo pisa el ritmo y el inventario', () => {
    const result = fieldForecast(field(), 'gas', flat, { ritmo: 24, inventario: 3 })
    expect(result.pozos.slice(0, 3)).toEqual([2, 1, 0])
  })
  it('sin actividad sólo queda la base', () => {
    const result = fieldForecast(field(), 'gas', { ...flat, actividad: 0 })
    expect(result.nuevos.every(value => value === 0)).toBe(true)
    expect(result.base[0]).toBe(5)
  })
})

describe('runForecast', () => {
  const data = { t0: '2006-01', n: 2, meses: 24, cuenca: { hist_gas: [], hist_oil: [], hist_agua: [], activos: [], pozos_anio: {} }, campos: { A: field(), B: field({ ritmo: 0 }) } } as ForecastFile
  it('la cuenca es la suma de los campos', () => {
    const result = runForecast(data, 'gas', flat)
    expect(result.hist).toEqual([20, 20])
    expect(result.base[0]).toBe(10)
    expect(result.nuevos[1]).toBe(4)
  })
  it('puede limitarse a un campo', () => {
    expect(runForecast(data, 'gas', flat, {}, ['B']).nuevos.every(value => value === 0)).toBe(true)
  })
  it('promedia el año pedido', () => {
    expect(yearAverage([...new Array(12).fill(1), ...new Array(12).fill(3)], 2)).toBe(3)
  })
})

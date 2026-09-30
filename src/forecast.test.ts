import { describe, expect, it } from 'vitest'
import { arpsRate, blockForecast, fitArps } from './forecast'

describe('declinación Arps', () => {
  it('declina de forma monótona y positiva', () => {
    const params = { qi: 10, diAnnual: 0.8, b: 0.9, terminalAnnual: 0.05 }
    const rates = Array.from({ length: 240 }, (_, month) => arpsRate(month, params))
    expect(rates.every((rate) => rate > 0)).toBe(true)
    expect(rates.every((rate, index) => index === 0 || rate <= rates[index - 1])).toBe(true)
  })

  it('recupera aproximadamente una curva conocida', () => {
    const source = { qi: 8, diAnnual: 0.65, b: 0.8, terminalAnnual: 0.05 }
    const curve = Array.from({ length: 48 }, (_, month) => arpsRate(month, source))
    const fitted = fitArps(curve)
    expect(fitted.qi).toBeCloseTo(source.qi, 0)
    expect(fitted.diAnnual).toBeCloseTo(source.diAnnual, 1)
    expect(fitted.b).toBeCloseTo(source.b, 0)
  })
})

describe('pronóstico de bloque', () => {
  const curve = Array.from({ length: 24 }, (_, month) => ({ month, low: 0.75, central: 1, high: 1.25 }))

  it('no incorpora pozos futuros en el escenario base', () => {
    const result = blockForecast(curve, 100, 0, 20, 12)
    expect(result[0]).toBe(100)
    expect(result[11]).toBeLessThan(100)
  })

  it('respeta un inventario nulo', () => {
    expect(blockForecast(curve, 100, 2, 0, 3)).toEqual(blockForecast(curve, 100, 0, 0, 3))
  })
})


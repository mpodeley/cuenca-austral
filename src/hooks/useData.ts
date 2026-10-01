import { useEffect, useState } from 'react'
import type { Block, Concession, Envelope, ForecastFile, MapContext, SeriesFile, Well } from '../types'

const cache = new Map<string, Promise<unknown>>()

/** Cada archivo se baja una sola vez por sesión, aunque lo pidan varias pestañas. */
function fetchJson<T>(name: string): Promise<Envelope<T>> {
  if (!cache.has(name)) {
    cache.set(name, fetch(`${import.meta.env.BASE_URL}data/${name}`).then(response => {
      if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`)
      return response.json()
    }))
  }
  return cache.get(name) as Promise<Envelope<T>>
}

export interface Loaded<T> { data: T | null; sourceDate: string | null; error: string | null }

function useJson<T>(name: string | null): Loaded<T> {
  const [state, setState] = useState<Loaded<T>>({ data: null, sourceDate: null, error: null })
  useEffect(() => {
    if (!name) return
    let alive = true
    fetchJson<T>(name)
      .then(envelope => alive && setState({ data: envelope.data, sourceDate: envelope.source_date, error: null }))
      .catch((error: Error) => alive && setState({ data: null, sourceDate: null, error: error.message }))
    return () => { alive = false }
  }, [name])
  return state
}

export const useBlocks = () => useJson<Block[]>('blocks.json')
export const useConcessions = () => useJson<Concession[]>('concesiones_austral.json')
export const useContext = () => useJson<MapContext>('contexto.json')
export const useWells = (enabled = true) => useJson<Well[]>(enabled ? 'wells.json' : null)
export const useSeries = (enabled = true) => useJson<SeriesFile>(enabled ? 'well_series.json' : null)
export const useForecast = () => useJson<ForecastFile>('forecast.json')

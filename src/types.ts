export type ProductionPoint = {
  month: string
  gasMm3: number
  oilM3: number
  waterM3: number
  producingDays: number
}

export type Well = {
  id: string
  name: string
  blockId: string
  block: string
  operator: string
  province: string
  status: string
  environment: 'onshore' | 'offshore'
  longitude: number
  latitude: number
  firstProduction: string | null
  lastProduction: string | null
  formation: string | null
  production: ProductionPoint[]
}

export type Block = {
  id: string
  name: string
  operator: string
  province: string
  environment: 'onshore' | 'offshore'
  areaKm2: number | null
  wellCount: number
  activeWellCount: number
  firstProduction: string | null
  lastProduction: string | null
  cumulativeGasMm3: number
  latestGasMm3: number
  geometry: Polygon | MultiPolygon
}

export type Dataset = {
  metadata: {
    generatedAt: string
    dataThrough: string
    mode: 'official' | 'demo'
    disclaimer: string
  }
  basin: FeatureCollection
  blocks: Block[]
  wells: Well[]
}

export type ArpsParams = {
  qi: number
  diAnnual: number
  b: number
  terminalAnnual: number
}

export type ForecastPoint = {
  month: number
  observed?: number
  low: number
  central: number
  high: number
}
import type { FeatureCollection, MultiPolygon, Polygon } from 'geojson'


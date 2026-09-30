import type { Dataset } from './types'
import type { FeatureCollection } from 'geojson'

export async function loadDataset(): Promise<Dataset> {
  const response = await fetch(`${import.meta.env.BASE_URL}data/dataset.json`)
  if (!response.ok) throw new Error(`No se pudo cargar el dataset (${response.status})`)
  return response.json() as Promise<Dataset>
}

export function blockFeatureCollection(dataset: Dataset): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: dataset.blocks.map((block) => ({
      type: 'Feature',
      id: block.id,
      geometry: block.geometry,
      properties: {
        id: block.id,
        name: block.name,
        operator: block.operator,
        environment: block.environment,
      },
    })),
  }
}

export function wellFeatureCollection(dataset: Dataset): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: dataset.wells.map((well) => ({
      type: 'Feature',
      id: well.id,
      geometry: { type: 'Point', coordinates: [well.longitude, well.latitude] },
      properties: {
        id: well.id,
        name: well.name,
        blockId: well.blockId,
        status: well.status,
        environment: well.environment,
      },
    })),
  }
}

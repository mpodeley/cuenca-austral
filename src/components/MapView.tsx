import { useEffect, useRef } from 'react'
import * as maplibregl from 'maplibre-gl'
import type { Map, MapLayerMouseEvent } from 'maplibre-gl'
import { blockFeatureCollection, wellFeatureCollection } from '../data'
import type { Dataset } from '../types'

type Props = {
  dataset: Dataset
  selectedBlockId: string | null
  showBlocks: boolean
  showWells: boolean
  onSelectBlock: (id: string) => void
}

const STYLE: maplibregl.StyleSpecification = {
  version: 8,
  glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
  sources: {
    basemap: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '© OpenStreetMap contributors',
    },
  },
  layers: [
    { id: 'background', type: 'background', paint: { 'background-color': '#071217' } },
    { id: 'basemap', type: 'raster', source: 'basemap', paint: { 'raster-opacity': 0.32, 'raster-saturation': -0.8 } },
  ],
}

export function MapView({ dataset, selectedBlockId, showBlocks, showWells, onSelectBlock }: Props) {
  const container = useRef<HTMLDivElement>(null)
  const mapRef = useRef<Map | null>(null)
  const selectRef = useRef(onSelectBlock)
  selectRef.current = onSelectBlock

  useEffect(() => {
    if (!container.current || mapRef.current) return
    const map = new maplibregl.Map({
      container: container.current,
      style: STYLE,
      center: [-67.8, -51.5],
      zoom: 4.8,
      minZoom: 3,
      maxZoom: 13,
    })
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right')
    map.on('load', () => {
      map.addSource('basin', { type: 'geojson', data: dataset.basin })
      map.addLayer({
        id: 'basin-line', type: 'line', source: 'basin',
        paint: { 'line-color': '#5ce1e6', 'line-opacity': 0.45, 'line-width': 1.2, 'line-dasharray': [3, 2] },
      })
      map.addSource('blocks', { type: 'geojson', data: blockFeatureCollection(dataset) })
      map.addLayer({
        id: 'blocks-fill', type: 'fill', source: 'blocks',
        paint: {
          'fill-color': ['case', ['==', ['get', 'environment'], 'offshore'], '#4b8bd8', '#d6a84b'],
          'fill-opacity': 0.25,
        },
      })
      map.addLayer({
        id: 'blocks-line', type: 'line', source: 'blocks',
        paint: { 'line-color': '#e6edf1', 'line-opacity': 0.75, 'line-width': 1.1 },
      })
      map.addSource('wells', { type: 'geojson', data: wellFeatureCollection(dataset), cluster: true, clusterRadius: 36 })
      map.addLayer({
        id: 'clusters', type: 'circle', source: 'wells', filter: ['has', 'point_count'],
        paint: { 'circle-color': '#5ce1e6', 'circle-radius': ['step', ['get', 'point_count'], 13, 25, 17, 100, 21], 'circle-opacity': 0.85 },
      })
      map.addLayer({
        id: 'cluster-count', type: 'symbol', source: 'wells', filter: ['has', 'point_count'],
        layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-size': 11 },
        paint: { 'text-color': '#071217' },
      })
      map.addLayer({
        id: 'wells-point', type: 'circle', source: 'wells', filter: ['!', ['has', 'point_count']],
        paint: { 'circle-color': '#f7f9fa', 'circle-radius': 3, 'circle-stroke-color': '#071217', 'circle-stroke-width': 1 },
      })

      map.on('click', 'blocks-fill', (event: MapLayerMouseEvent) => {
        const id = event.features?.[0]?.properties?.id
        if (id) selectRef.current(id)
      })
      map.on('mouseenter', 'blocks-fill', () => { map.getCanvas().style.cursor = 'pointer' })
      map.on('mouseleave', 'blocks-fill', () => { map.getCanvas().style.cursor = '' })
    })
    mapRef.current = map
    return () => { map.remove(); mapRef.current = null }
  }, [dataset])

  useEffect(() => {
    const map = mapRef.current
    if (!map?.isStyleLoaded()) return
    for (const layer of ['blocks-fill', 'blocks-line']) {
      if (map.getLayer(layer)) map.setLayoutProperty(layer, 'visibility', showBlocks ? 'visible' : 'none')
    }
    for (const layer of ['clusters', 'cluster-count', 'wells-point']) {
      if (map.getLayer(layer)) map.setLayoutProperty(layer, 'visibility', showWells ? 'visible' : 'none')
    }
  }, [showBlocks, showWells])

  useEffect(() => {
    const map = mapRef.current
    if (!map?.isStyleLoaded() || !map.getLayer('blocks-fill')) return
    map.setPaintProperty('blocks-fill', 'fill-opacity', [
      'case', ['==', ['get', 'id'], selectedBlockId ?? ''], 0.7, 0.25,
    ])
  }, [selectedBlockId])

  return <div ref={container} className="map" aria-label="Mapa de concesiones y pozos de la Cuenca Austral" />
}

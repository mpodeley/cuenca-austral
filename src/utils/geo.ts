/** Proyección y utilidades del mapa SVG. Las coordenadas del mapa son Mercator en "grados". */

export interface Bounds { minX: number; minY: number; maxX: number; maxY: number }

const RAD = Math.PI / 180

export const projX = (lon: number) => lon
/** El eje Y del SVG crece hacia abajo: el norte queda arriba. */
export const projY = (lat: number) => -Math.log(Math.tan(Math.PI / 4 + (lat * RAD) / 2)) / RAD

/** Vista inicial: toda la cuenca productiva, de Santa Cruz a Tierra del Fuego. */
export const BASIN_VIEW: Bounds = { minX: -72.4, maxX: -66.2, minY: projY(-48.9), maxY: projY(-54.4) }

export function ringPath(ring: number[][]): string {
  let path = ''
  for (let index = 0; index < ring.length; index++) {
    path += `${index ? 'L' : 'M'}${projX(ring[index][0]).toFixed(4)} ${projY(ring[index][1]).toFixed(4)}`
  }
  return `${path}Z`
}

export const polygonsPath = (polygons: number[][][][]) => polygons.map(polygon => polygon.map(ringPath).join('')).join('')

export function linePath(line: number[][]): string {
  return line.map((point, index) => `${index ? 'L' : 'M'}${projX(point[0]).toFixed(4)} ${projY(point[1]).toFixed(4)}`).join('')
}

export function boundsOf(points: Array<[number, number]>): Bounds | null {
  if (!points.length) return null
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const [lon, lat] of points) {
    const x = projX(lon), y = projY(lat)
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
  return { minX, minY, maxX, maxY }
}

export function polygonBounds(polygons: number[][][][]): Bounds | null {
  return boundsOf(polygons.flatMap(polygon => polygon[0].map(point => [point[0], point[1]] as [number, number])))
}

/** Agranda los límites un porcentaje y garantiza una extensión mínima (en grados). */
export function pad(bounds: Bounds, fraction = 0.15, minSpan = 0.25): Bounds {
  const width = Math.max(bounds.maxX - bounds.minX, minSpan)
  const height = Math.max(bounds.maxY - bounds.minY, minSpan)
  const cx = (bounds.minX + bounds.maxX) / 2, cy = (bounds.minY + bounds.maxY) / 2
  return { minX: cx - width * (0.5 + fraction), maxX: cx + width * (0.5 + fraction), minY: cy - height * (0.5 + fraction), maxY: cy + height * (0.5 + fraction) }
}

/** Cortes por cuantiles para una coropleta de ``steps`` tonos. Ignora nulos y ceros. */
export function quantileBreaks(values: Array<number | null | undefined>, steps: number): number[] {
  const sorted = values.filter((value): value is number => typeof value === 'number' && value > 0).sort((a, b) => a - b)
  if (!sorted.length) return []
  const breaks: number[] = []
  for (let step = 1; step < steps; step++) breaks.push(sorted[Math.min(sorted.length - 1, Math.floor((sorted.length * step) / steps))])
  return [...new Set(breaks)]
}

export function binIndex(value: number, breaks: number[]): number {
  let index = 0
  while (index < breaks.length && value >= breaks[index]) index++
  return index
}

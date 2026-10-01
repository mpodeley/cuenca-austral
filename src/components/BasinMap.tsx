import { memo, useMemo, useRef, useState } from 'react'
import type { MouseEvent, PointerEvent, ReactNode } from 'react'
import { C, card } from '../theme'
import type { Concession, MapContext, Well } from '../types'
import { usePanZoom } from '../hooks/usePanZoom'
import { useCoarsePointer } from '../hooks/useViewport'
import { linePath, polygonsPath, projX, projY, ringPath } from '../utils/geo'
import type { Bounds } from '../utils/geo'

export type Hover = { kind: 'well'; well: Well } | { kind: 'block'; concession: Concession } | null

interface Props {
  home: Bounds
  height: number | string
  context: MapContext
  concessions: Concession[]
  blockFill?: (concession: Concession) => string | null
  highlight?: string | null
  showBlocks?: boolean
  showBasin?: boolean
  wells?: Well[]
  wellColor?: (well: Well) => string
  onBlockClick?: (concession: Concession) => void
  onWellClick?: (well: Well) => void
  tooltip?: (hover: NonNullable<Hover>) => ReactNode
}

const non = { vectorEffect: 'non-scaling-stroke' as const }

const Backdrop = memo(function Backdrop({ context, showBasin }: { context: MapContext; showBasin: boolean }) {
  return (
    <g pointerEvents="none">
      <path d={context.tierra.map(ringPath).join('')} fill={C.land} />
      {context.limites.map((line, index) => <path key={index} d={linePath(line)} fill="none" stroke={C.border} strokeWidth={1} strokeDasharray="5 4" style={non} />)}
      {showBasin && <path d={polygonsPath(context.cuenca)} fill="none" stroke={C.cyan} strokeOpacity={0.45} strokeWidth={1.2} strokeDasharray="7 5" style={non} />}
    </g>
  )
})

/** Los pozos se dibujan como trazos de largo cero con extremos redondos: un punto de tamaño fijo en pantalla a cualquier zoom. */
const WellDots = memo(function WellDots({ wells, wellColor, width }: { wells: Well[]; wellColor: (well: Well) => string; width: number }) {
  const groups = useMemo(() => {
    const byColor = new Map<string, string>()
    for (const well of wells) {
      if (well.lon === null || well.lat === null) continue
      const color = wellColor(well)
      byColor.set(color, `${byColor.get(color) ?? ''}M${projX(well.lon).toFixed(4)} ${projY(well.lat).toFixed(4)}h0`)
    }
    return [...byColor]
  }, [wells, wellColor])
  return (
    <g pointerEvents="none" fill="none" strokeLinecap="round">
      {groups.map(([color, path]) => <path key={color} d={path} stroke={color} strokeWidth={width} strokeOpacity={0.9} style={non} />)}
    </g>
  )
})

export function BasinMap({ home, height, context, concessions, blockFill, highlight, showBlocks = true, showBasin = true, wells, wellColor, onBlockClick, onWellClick, tooltip }: Props) {
  const ref = useRef<SVGSVGElement>(null)
  const coarse = useCoarsePointer()
  const { viewBox, unit, zoom, zoomAt, reset, wasDrag, toMap, handlers } = usePanZoom(ref, home)
  const [hover, setHover] = useState<Hover>(null)

  const points = useMemo(
    () => (wells ?? []).filter(well => well.lon !== null && well.lat !== null).map(well => ({ x: projX(well.lon!), y: projY(well.lat!), well })),
    [wells],
  )
  const paths = useMemo(() => concessions.map(concession => ({ concession, d: polygonsPath(concession.p) })), [concessions])

  const nearestWell = (clientX: number, clientY: number, pixels: number): Well | null => {
    const position = toMap(clientX, clientY)
    if (!position) return null
    let best: Well | null = null
    let bestDistance = (pixels * unit) ** 2
    for (const point of points) {
      const distance = (point.x - position[0]) ** 2 + (point.y - position[1]) ** 2
      if (distance < bestDistance) { bestDistance = distance; best = point.well }
    }
    return best
  }

  const blockUnder = (target: EventTarget): Concession | null => {
    const index = (target as SVGElement).dataset?.index
    return index === undefined ? null : paths[Number(index)].concession
  }

  const onMove = (event: PointerEvent<SVGSVGElement>) => {
    handlers.onPointerMove(event)
    if (coarse || event.buttons) return
    const well = nearestWell(event.clientX, event.clientY, 7)
    const concession = well ? null : blockUnder(event.target)
    const next: Hover = well ? { kind: 'well', well } : concession ? { kind: 'block', concession } : null
    setHover(current => {
      if (current?.kind === 'well' && next?.kind === 'well' && current.well === next.well) return current
      if (current?.kind === 'block' && next?.kind === 'block' && current.concession === next.concession) return current
      return current === next ? current : next
    })
  }

  const onClick = (event: MouseEvent<SVGSVGElement>) => {
    if (wasDrag()) return
    const well = onWellClick ? nearestWell(event.clientX, event.clientY, coarse ? 14 : 7) : null
    if (well) return onWellClick!(well)
    // El puntero queda capturado por el SVG durante el arrastre, así que el destino del click se busca por posición.
    const element = document.elementFromPoint(event.clientX, event.clientY)
    const concession = element ? blockUnder(element) : null
    if (concession && onBlockClick) onBlockClick(concession)
  }

  const button = { ...card, padding: 0, width: 30, height: 30, fontSize: 16, lineHeight: 1, color: C.text2, borderRadius: 8 }
  const hoveredBlock = hover?.kind === 'block' ? hover.concession : null

  return (
    <div style={{ position: 'relative', height, background: C.mapBg, borderRadius: 10, overflow: 'hidden', border: `1px solid ${C.border}` }}>
      <svg
        ref={ref} viewBox={viewBox} width="100%" height="100%" role="img" aria-label="Mapa de concesiones y pozos de la Cuenca Austral"
        style={{ display: 'block', touchAction: 'none', cursor: hover && (hover.kind === 'well' ? onWellClick : onBlockClick) ? 'pointer' : 'grab' }}
        {...handlers} onPointerMove={onMove} onPointerLeave={() => setHover(null)} onClick={onClick}
      >
        <Backdrop context={context} showBasin={showBasin} />
        {showBlocks && paths.map(({ concession, d }, index) => {
          const fill = blockFill?.(concession) ?? null
          const selected = highlight === concession.nombre
          const hovered = hoveredBlock === concession
          return (
            <path
              key={concession.nombre} data-index={index} d={d} fillRule="evenodd"
              fill={fill ?? (concession.con_datos ? '#ffffff' : '#000000')} fillOpacity={fill ? 0.85 : hovered ? 0.1 : concession.con_datos ? 0.04 : 0}
              stroke={selected ? C.blue : hovered ? C.text : concession.con_datos ? C.muted : C.dim}
              strokeWidth={selected ? 2.4 : hovered ? 1.6 : 1} strokeDasharray={concession.geometria === 'derivada' ? '3 3' : undefined}
              pointerEvents="all" style={non}
            />
          )
        })}
        {wells && wellColor && <WellDots wells={wells} wellColor={wellColor} width={zoom > 6 ? 7 : zoom > 2.5 ? 5 : 3.5} />}
        {hover?.kind === 'well' && hover.well.lon !== null && (
          <path d={`M${projX(hover.well.lon)} ${projY(hover.well.lat!)}h0`} stroke={C.text} strokeWidth={11} strokeLinecap="round" fill="none" strokeOpacity={0.9} pointerEvents="none" style={non} />
        )}
      </svg>
      {hover && tooltip && (
        <div style={{ ...card, position: 'absolute', top: 10, left: 10, maxWidth: 300, padding: 12, fontSize: 12, pointerEvents: 'none', background: `${C.surface}f2` }}>{tooltip(hover)}</div>
      )}
      <div style={{ position: 'absolute', top: 10, right: 10, display: 'grid', gap: 6 }}>
        <button style={button} onClick={() => zoomAt(1.5)} aria-label="Acercar">＋</button>
        <button style={button} onClick={() => zoomAt(1 / 1.5)} aria-label="Alejar">－</button>
        <button style={button} onClick={reset} aria-label="Volver a la vista inicial">⟲</button>
      </div>
    </div>
  )
}

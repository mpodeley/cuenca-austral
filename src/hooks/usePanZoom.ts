import { useCallback, useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react'
import type { Bounds } from '../utils/geo'

interface View { cx: number; cy: number; unit: number }  // unit: unidades de mapa por píxel
interface Size { width: number; height: number }

const DRAG_THRESHOLD = 8  // px: por debajo, soltar el puntero cuenta como clic

function fit(bounds: Bounds, size: Size): View {
  const unit = Math.max((bounds.maxX - bounds.minX) / size.width, (bounds.maxY - bounds.minY) / size.height)
  return { cx: (bounds.minX + bounds.maxX) / 2, cy: (bounds.minY + bounds.maxY) / 2, unit }
}

/**
 * Paneo y zoom de un SVG moviendo su viewBox: rueda, arrastre y pellizco.
 * El viewBox siempre tiene la proporción del elemento, así la conversión
 * pantalla ↔ mapa es lineal.
 */
export function usePanZoom(ref: RefObject<SVGSVGElement | null>, home: Bounds) {
  const [size, setSize] = useState<Size>({ width: 800, height: 500 })
  const [view, setView] = useState<View>(() => fit(home, { width: 800, height: 500 }))
  const touched = useRef(false)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const drag = useRef({ moved: 0, pinch: 0 })
  const homeKey = `${home.minX},${home.minY},${home.maxX},${home.maxY}`
  const homeUnit = fit(home, size).unit

  useEffect(() => {
    const element = ref.current
    if (!element) return
    const measure = () => {
      const rect = element.getBoundingClientRect()
      if (rect.width && rect.height) setSize({ width: rect.width, height: rect.height })
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [ref])

  // Mientras nadie movió el mapa, sigue encuadrando la vista de inicio.
  useEffect(() => {
    if (!touched.current) setView(fit(home, size))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [homeKey, size.width, size.height])

  const zoomAt = useCallback((factor: number, clientX?: number, clientY?: number) => {
    touched.current = true
    setView(current => {
      const rect = ref.current?.getBoundingClientRect()
      const unit = Math.min(homeUnit * 2.2, Math.max(homeUnit / 60, current.unit / factor))
      if (!rect || clientX === undefined || clientY === undefined) return { ...current, unit }
      const dx = clientX - rect.left - rect.width / 2, dy = clientY - rect.top - rect.height / 2
      return { cx: current.cx + dx * (current.unit - unit), cy: current.cy + dy * (current.unit - unit), unit }
    })
  }, [homeUnit, ref])

  useEffect(() => {
    const element = ref.current
    if (!element) return
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      zoomAt(event.deltaY < 0 ? 1.25 : 0.8, event.clientX, event.clientY)
    }
    element.addEventListener('wheel', onWheel, { passive: false })
    return () => element.removeEventListener('wheel', onWheel)
  }, [ref, zoomAt])

  const onPointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (pointers.current.size === 1) drag.current = { moved: 0, pinch: 0 }
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }

  const onPointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const previous = pointers.current.get(event.pointerId)
    if (!previous) return
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    const active = [...pointers.current.values()]
    if (active.length === 2) {
      const distance = Math.hypot(active[0].x - active[1].x, active[0].y - active[1].y)
      if (drag.current.pinch) zoomAt(distance / drag.current.pinch, (active[0].x + active[1].x) / 2, (active[0].y + active[1].y) / 2)
      drag.current.pinch = distance
      drag.current.moved = DRAG_THRESHOLD + 1
      return
    }
    const dx = event.clientX - previous.x, dy = event.clientY - previous.y
    drag.current.moved += Math.abs(dx) + Math.abs(dy)
    if (drag.current.moved > DRAG_THRESHOLD) {
      touched.current = true
      setView(current => ({ ...current, cx: current.cx - dx * current.unit, cy: current.cy - dy * current.unit }))
    }
  }

  const onPointerUp = (event: ReactPointerEvent<SVGSVGElement>) => {
    pointers.current.delete(event.pointerId)
    drag.current.pinch = 0
  }

  const reset = () => { touched.current = false; setView(fit(home, size)) }
  const wasDrag = () => drag.current.moved > DRAG_THRESHOLD

  /** Coordenadas de mapa del punto de pantalla. */
  const toMap = (clientX: number, clientY: number): [number, number] | null => {
    const rect = ref.current?.getBoundingClientRect()
    if (!rect) return null
    return [view.cx + (clientX - rect.left - rect.width / 2) * view.unit, view.cy + (clientY - rect.top - rect.height / 2) * view.unit]
  }

  const viewBox = `${view.cx - (size.width / 2) * view.unit} ${view.cy - (size.height / 2) * view.unit} ${size.width * view.unit} ${size.height * view.unit}`
  return { viewBox, unit: view.unit, zoom: homeUnit / view.unit, zoomAt, reset, wasDrag, toMap, handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp } }
}

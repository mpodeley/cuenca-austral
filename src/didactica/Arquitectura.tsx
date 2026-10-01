import { useMemo, useState } from 'react'
import { colorDeColumna } from './Drawer'
import { ARISTAS, COLUMNAS, MODULOS, NODOS, REPO, linajeDe, modulo, nodo, repoUrl } from './registro'
import { Panel } from '../components/ui'
import { C, mono } from '../theme'
import type { Route } from '../App'

const COL_W = 196, BOX_W = 164, BOX_H = 46, GAP_Y = 16, TOP = 54
const PANTALLA: Record<string, string> = { mapa: 'Mapa', campo: 'Yacimiento', pozos: 'Pozos', pronostico: 'Pronóstico', general: 'General' }

/** Posición de cada nodo: una columna por etapa, centrada en vertical. */
function layout() {
  const rows = Math.max(...COLUMNAS.map(col => NODOS.filter(item => item.col === col.id).length))
  const height = TOP + rows * (BOX_H + GAP_Y) + 8
  const at = new Map<string, { x: number; y: number }>()
  COLUMNAS.forEach((col, index) => {
    const items = NODOS.filter(item => item.col === col.id)
    const offset = TOP + ((rows - items.length) * (BOX_H + GAP_Y)) / 2
    items.forEach((item, row) => at.set(item.id, { x: index * COL_W + (COL_W - BOX_W) / 2, y: offset + row * (BOX_H + GAP_Y) }))
  })
  return { at, width: COLUMNAS.length * COL_W, height }
}

const Step = ({ title, text, href }: { title: string; text: string; href?: string }) => (
  <div style={{ flex: '1 1 150px', background: C.surfaceAlt, border: `1px solid ${C.border}`, borderRadius: 10, padding: 12 }}>
    <strong style={{ color: C.text, fontSize: 13 }}>{title}</strong>
    <p style={{ margin: '4px 0 0', fontSize: 12, color: C.muted, lineHeight: 1.5 }}>{text}</p>
    {href && <a href={href} target="_blank" rel="noreferrer" style={{ ...mono, fontSize: 11.5 }}>ver archivo ↗</a>}
  </div>
)
const Arrow = () => <span aria-hidden style={{ alignSelf: 'center', color: C.dim }}>→</span>

export function Arquitectura({ foco, go }: { foco?: string; go: (route: Route) => void }) {
  const { at, width, height } = useMemo(layout, [])
  const [nodoSel, setNodoSel] = useState<string | null>(null)
  const [hover, setHover] = useState<string | null>(null)
  const mod = modulo(foco)

  // Prioridad: nodo bajo el cursor, nodo elegido, módulo enfocado por la ruta.
  const activo = hover ?? nodoSel
  const resaltado = useMemo(() => (activo ? linajeDe([activo]) : mod ? new Set(mod.linaje) : null), [activo, mod])
  const on = (id: string) => !resaltado || resaltado.has(id)
  const detalle = nodo(nodoSel ?? '')
  const usanNodo = detalle ? MODULOS.filter(item => item.linaje.includes(detalle.id)) : []
  const elegirModulo = (id: string) => { setNodoSel(null); go({ tab: 'como-se-hizo', id: id ? `arquitectura/${id}` : 'arquitectura' }) }

  return (
    <>
      <Panel title="De la fuente pública a la pantalla" note="Cada caja es un archivo o un script del repositorio. Pasá el cursor o tocá una caja para ver de qué depende y qué alimenta. Elegí un módulo para ver el recorrido de su dato.">
        <label style={{ fontSize: 12.5, color: C.muted }}>¿De dónde sale…?{' '}
          <select value={mod?.id ?? ''} onChange={event => elegirModulo(event.target.value)} style={{ background: C.surfaceAlt, border: `1px solid ${C.border}`, borderRadius: 8, padding: '6px 10px', color: C.text2, maxWidth: '100%' }}>
            <option value="">todo el sistema</option>
            {Object.entries(PANTALLA).map(([key, label]) => (
              <optgroup key={key} label={label}>{MODULOS.filter(item => item.pantalla === key).map(item => <option key={item.id} value={item.id}>{item.titulo}</option>)}</optgroup>
            ))}
          </select>
        </label>
        {mod && <p style={{ margin: '10px 0 0', fontSize: 13, color: C.text2, lineHeight: 1.55 }}><strong>{mod.titulo}.</strong> {mod.queHace}</p>}

        <div className="scroll-x" style={{ marginTop: 12 }}>
          <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', minWidth: 880, display: 'block' }} role="img" aria-label="Esquema de arquitectura: fuentes, pipeline, datos versionados, archivos web, cálculo en el navegador y pantallas">
            {COLUMNAS.map((col, index) => (
              <g key={col.id}>
                <text x={index * COL_W + COL_W / 2} y={18} textAnchor="middle" fill={colorDeColumna(col.id)} fontSize={12} fontWeight={600} style={{ textTransform: 'uppercase', letterSpacing: 0.8 }}>{col.titulo}</text>
                <text x={index * COL_W + COL_W / 2} y={34} textAnchor="middle" fill={C.dim} fontSize={10}>{col.nota}</text>
              </g>
            ))}
            {ARISTAS.map(([from, to]) => {
              const a = at.get(from)!, b = at.get(to)!
              const x1 = a.x + BOX_W, y1 = a.y + BOX_H / 2, x2 = b.x, y2 = b.y + BOX_H / 2, bend = (x2 - x1) / 2
              const lit = !!resaltado && resaltado.has(from) && resaltado.has(to)
              return <path key={`${from}-${to}`} d={`M${x1} ${y1}C${x1 + bend} ${y1} ${x2 - bend} ${y2} ${x2} ${y2}`} fill="none" stroke={lit ? C.orange : C.border} strokeWidth={lit ? 1.8 : 1} strokeOpacity={resaltado && !lit ? 0.25 : 0.9} />
            })}
            {NODOS.map(item => {
              const position = at.get(item.id)!
              const color = colorDeColumna(item.col)
              const selected = nodoSel === item.id
              return (
                <g
                  key={item.id} transform={`translate(${position.x} ${position.y})`} opacity={on(item.id) ? 1 : 0.28} style={{ cursor: 'pointer' }}
                  role="button" tabIndex={0} aria-label={`${item.titulo}: ${item.que}`} aria-pressed={selected}
                  onMouseEnter={() => setHover(item.id)} onMouseLeave={() => setHover(null)}
                  onClick={() => setNodoSel(selected ? null : item.id)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setNodoSel(selected ? null : item.id) } }}
                >
                  <rect width={BOX_W} height={BOX_H} rx={8} fill={selected ? `${color}33` : C.surfaceAlt} stroke={color} strokeWidth={selected ? 2 : 1} />
                  <text x={BOX_W / 2} y={BOX_H / 2 + 4} textAnchor="middle" fill={C.text} fontSize={11.5} fontFamily="var(--font-mono)">{item.titulo}</text>
                </g>
              )
            })}
          </svg>
        </div>

        {detalle ? (
          <div style={{ marginTop: 12, background: C.surfaceAlt, border: `1px solid ${colorDeColumna(detalle.col)}66`, borderRadius: 10, padding: 14 }}>
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8, color: colorDeColumna(detalle.col) }}>{COLUMNAS.find(col => col.id === detalle.col)?.titulo}</div>
            <strong style={{ ...mono, color: C.text, fontSize: 14 }}>{detalle.titulo}</strong>
            <p style={{ margin: '6px 0 8px', fontSize: 13, color: C.text2, lineHeight: 1.55 }}>{detalle.que}</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px', fontSize: 12.5 }}>
              {detalle.archivo && <a href={repoUrl(detalle)} target="_blank" rel="noreferrer" style={mono}>{detalle.archivo}{detalle.simbolo ? ` · ${detalle.simbolo}` : ''} ↗</a>}
              {detalle.url && <a href={detalle.url} target="_blank" rel="noreferrer">abrir la fuente ↗</a>}
              {detalle.ruta && <button onClick={() => go({ tab: detalle.ruta as Route['tab'] })} style={{ background: 'none', border: 0, padding: 0, color: '#60a5fa' }}>ir a la pantalla →</button>}
            </div>
            {usanNodo.length > 0 && (
              <p style={{ margin: '10px 0 0', fontSize: 12, color: C.muted, lineHeight: 1.9 }}>Lo usan:{' '}
                {usanNodo.map(item => <button key={item.id} onClick={() => elegirModulo(item.id)} style={{ background: `${C.orange}22`, border: 0, borderRadius: 999, color: C.orange, padding: '1px 9px', marginRight: 6, fontSize: 11.5 }}>{item.titulo}</button>)}
              </p>
            )}
          </div>
        ) : mod ? (
          <div style={{ marginTop: 12, display: 'grid', gap: 6 }}>
            {mod.codigo.map(ref => <a key={ref.archivo + (ref.simbolo ?? '')} href={repoUrl(ref)} target="_blank" rel="noreferrer" style={{ ...mono, fontSize: 12 }}>{ref.archivo}{ref.simbolo ? ` · ${ref.simbolo}` : ''} ↗ <span style={{ color: C.muted, fontFamily: 'var(--font-body)' }}>— {ref.nota}</span></a>)}
          </div>
        ) : null}
      </Panel>

      <Panel title="Cómo llega un cambio al sitio" note="Nada se publica a mano. Cada cambio pasa por las mismas pruebas, y los datos nuevos llegan como una propuesta que alguien revisa.">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <Step title="1. Un cambio" text="La persona pide algo; el agente edita archivos y los guarda en un commit con su explicación." href={`${REPO}/commits/main`} />
          <Arrow />
          <Step title="2. Pruebas" text="GitHub corre las pruebas del pipeline, las de la interfaz y la compilación." href={`${REPO}/blob/main/.github/workflows/ci.yml`} />
          <Arrow />
          <Step title="3. Rama principal" text="Si todo pasa, el cambio se integra en main." href={`${REPO}/actions`} />
          <Arrow />
          <Step title="4. Publicación" text="GitHub Pages compila y sirve el sitio. No hay servidor propio." href={`${REPO}/blob/main/.github/workflows/pages.yml`} />
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
          <Step title="Cada mes" text="Una tarea programada baja el año en curso y el anterior, y recalcula todo." href={`${REPO}/blob/main/.github/workflows/refresh-data.yml`} />
          <Arrow />
          <Step title="Control de calidad" text="Si falta un mes o la producción cae de golpe, la tarea falla y no propone nada." href={repoUrl({ archivo: 'pipeline/build_data.py', simbolo: 'quality' })} />
          <Arrow />
          <Step title="Pedido de cambio" text="Los datos nuevos llegan como un pull request: una persona mira el reporte antes de aceptarlo." href={`${REPO}/pulls`} />
        </div>
        <p style={{ margin: '12px 0 0', fontSize: 12.5 }}>El mismo esquema, en el repositorio: <a href={`${REPO}/blob/main/ARCHITECTURE.md`} target="_blank" rel="noreferrer">ARCHITECTURE.md ↗</a></p>
      </Panel>
    </>
  )
}

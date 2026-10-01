import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { useDidactica } from './Contexto'
import { COLUMNAS, decisionUrl, modulo, nodo, repoUrl } from './registro'
import { C, mono } from '../theme'
import { useNarrow } from '../hooks/useViewport'
import type { Route } from '../App'

const COL_COLOR: Record<string, string> = { fuentes: C.cyan, pipeline: C.orange, store: C.purple, web: C.blue, navegador: C.lime, pantallas: C.text2 }
export const colorDeColumna = (col: string) => COL_COLOR[col] ?? C.muted

const H = ({ children }: { children: ReactNode }) => <h4 style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, color: C.muted, margin: '18px 0 8px', fontWeight: 500 }}>{children}</h4>

/** Botón que abre el panel de un módulo. En modo clase lleva etiqueta; si no, es sólo el ícono. */
export function ComoBoton({ id, small }: { id: string; small?: boolean }) {
  const { abrir, clase } = useDidactica()
  if (!modulo(id)) return null
  return (
    <button
      onClick={event => { event.stopPropagation(); event.preventDefault(); abrir(id) }} title="¿Cómo se hizo esto?" aria-label={`¿Cómo se hizo? ${modulo(id)!.titulo}`}
      style={{ ...mono, flex: 'none', border: `1px solid ${clase ? C.orange : C.border}`, background: clase ? `${C.orange}22` : 'transparent', color: clase ? C.orange : C.muted, borderRadius: 999, padding: small ? '0 6px' : '2px 9px', fontSize: 11, lineHeight: '18px', textTransform: 'none', letterSpacing: 0 }}
    >{small ? '?' : clase ? '</> cómo se hizo' : '</>'}</button>
  )
}

export function Drawer({ go }: { go: (route: Route) => void }) {
  const { abierto, cerrar } = useDidactica()
  const narrow = useNarrow()
  const panel = useRef<HTMLDivElement>(null)
  const item = modulo(abierto)

  useEffect(() => {
    if (!item) return
    const previous = document.activeElement as HTMLElement | null
    panel.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') cerrar()
      if (event.key !== 'Tab' || !panel.current) return
      const focusable = panel.current.querySelectorAll<HTMLElement>('a, button')
      const first = focusable[0], last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('keydown', onKey); previous?.focus?.() }
  }, [item, cerrar])

  if (!item) return null
  const pasos = item.linaje.map(nodo).filter(step => !!step)
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100 }}>
      <div onClick={cerrar} style={{ position: 'absolute', inset: 0, background: '#020617aa' }} />
      <div
        ref={panel} role="dialog" aria-modal="true" aria-label={`Cómo se hizo: ${item.titulo}`} tabIndex={-1}
        style={{
          position: 'absolute', background: C.surface, overflowY: 'auto', padding: narrow ? '16px 16px 28px' : '22px 24px 32px', outline: 'none',
          ...(narrow ? { left: 0, right: 0, bottom: 0, maxHeight: '86vh', borderRadius: '16px 16px 0 0', borderTop: `1px solid ${C.border}` } : { top: 0, right: 0, bottom: 0, width: 460, borderLeft: `1px solid ${C.border}` }),
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'start' }}>
          <div>
            <div style={{ ...mono, fontSize: 11, color: C.orange }}>{'</>'} cómo se hizo</div>
            <h3 style={{ fontSize: 19, color: C.text, marginTop: 4 }}>{item.titulo}</h3>
          </div>
          <button onClick={cerrar} aria-label="Cerrar" style={{ background: 'none', border: `1px solid ${C.border}`, borderRadius: 8, width: 30, height: 30, color: C.text2, flex: 'none' }}>×</button>
        </div>
        <p style={{ margin: '12px 0 0', fontSize: 13.5, lineHeight: 1.6, color: C.text2 }}>{item.queHace}</p>

        <H>Cómo se calcula</H>
        <ol style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.6, color: C.text2 }}>{item.comoSeCalcula.map(step => <li key={step} style={{ marginBottom: 4 }}>{step}</li>)}</ol>

        <H>El recorrido del dato</H>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
          {pasos.map((step, index) => (
            <span key={step!.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              {index > 0 && <span style={{ color: C.dim }} aria-hidden>→</span>}
              <a
                href={step!.archivo ? repoUrl(step!) : step!.url} target="_blank" rel="noreferrer" title={`${COLUMNAS.find(col => col.id === step!.col)?.titulo}: ${step!.que}`}
                style={{ ...mono, fontSize: 11.5, textDecoration: 'none', color: colorDeColumna(step!.col), border: `1px solid ${colorDeColumna(step!.col)}66`, borderRadius: 6, padding: '2px 7px' }}
              >{step!.titulo}</a>
            </span>
          ))}
        </div>
        <button onClick={() => { cerrar(); go({ tab: 'como-se-hizo', id: `arquitectura/${item.id}` }) }} style={{ background: 'none', border: 0, padding: 0, color: '#60a5fa', fontSize: 12.5, marginTop: 10 }}>Ver este recorrido en el esquema de arquitectura →</button>

        <H>El código, en el repositorio</H>
        <div style={{ display: 'grid', gap: 6 }}>
          {item.codigo.map(ref => (
            <a key={ref.archivo + (ref.simbolo ?? '')} href={repoUrl(ref)} target="_blank" rel="noreferrer" style={{ display: 'block', textDecoration: 'none', background: C.surfaceAlt, border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 10px' }}>
              <span style={{ ...mono, fontSize: 12, color: '#60a5fa', wordBreak: 'break-all' }}>{ref.archivo}{ref.simbolo ? ` · ${ref.simbolo}` : ''} ↗</span>
              {ref.nota && <span style={{ display: 'block', fontSize: 12, color: C.muted, marginTop: 2 }}>{ref.nota}</span>}
            </a>
          ))}
        </div>

        <H>Para seguir leyendo</H>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px', fontSize: 12.5 }}>
          <button onClick={() => { cerrar(); go({ tab: 'metodologia', id: String(item.metodologia) }) }} style={{ background: 'none', border: 0, padding: 0, color: '#60a5fa' }}>Metodología §{item.metodologia} →</button>
          <button onClick={() => { cerrar(); go({ tab: 'como-se-hizo', id: `proceso/${item.pedido}` }) }} style={{ background: 'none', border: 0, padding: 0, color: '#60a5fa' }}>El pedido que lo originó →</button>
          {item.decisiones.map(id => <a key={id} href={decisionUrl(id)} target="_blank" rel="noreferrer">Decisión {id} ↗</a>)}
        </div>
      </div>
    </div>
  )
}

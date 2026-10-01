import { useEffect, useState } from 'react'
import hitos from './datos/proceso.json'
import tokens from './datos/tokens.json'
import { REPO } from './registro'
import { Panel, Pill } from '../components/ui'
import { C, mono } from '../theme'
import { num } from '../utils/format'

interface Hito { id: string; agente: 'codex' | 'claude'; fecha: string; titulo: string; etapa: string | null; prompts: string[]; hizo: string; salio: string; commits: string[]; giro?: boolean }
interface Uso { entrada: number; cache: number; salida: number; turnos: number; subagentes?: number }

const HITOS = hitos as Hito[]
const USO = tokens.etapas as Record<string, Uso>
const AGENTE = { codex: { nombre: 'Codex', color: C.cyan }, claude: { nombre: 'Claude Code', color: C.orange } }
const KINDS: Array<{ key: 'entrada' | 'cache' | 'salida'; label: string; color: string; que: string }> = [
  { key: 'salida', label: 'salida', color: C.lime, que: 'lo que el modelo escribe: código, comandos y respuestas. Es lo más caro por token.' },
  { key: 'entrada', label: 'entrada nueva', color: C.blue, que: 'lo que el modelo lee por primera vez: tu mensaje, archivos, resultados de comandos.' },
  { key: 'cache', label: 'releído de caché', color: C.dim, que: 'en cada paso el modelo vuelve a leer toda la conversación. Como ya la leyó, se cobra a una fracción.' },
]
/** 1.234.567 → "1,2 M"; 45.541 → "45,5 mil" */
const corto = (value: number) => (value >= 1e6 ? `${num(value / 1e6, 1)} M` : value >= 1e3 ? `${num(value / 1e3, value >= 1e5 ? 0 : 1)} mil` : num(value))
const suma = (agente: 'codex' | 'claude', key: keyof Uso) => HITOS.filter(hito => hito.agente === agente && hito.etapa).reduce((total, hito) => total + (USO[hito.etapa!]?.[key] ?? 0), 0)

function Barras({ uso, max }: { uso: Uso; max: number }) {
  return (
    <div style={{ display: 'grid', gap: 3 }}>
      {KINDS.filter(kind => kind.key !== 'cache').map(kind => (
        <div key={kind.key} style={{ display: 'grid', gridTemplateColumns: '92px 1fr 74px', gap: 8, alignItems: 'center', fontSize: 11.5 }}>
          <span style={{ color: C.muted }}>{kind.label}</span>
          <span style={{ background: C.surfaceAlt, borderRadius: 3, height: 8 }}><span style={{ display: 'block', width: `${Math.max(1, (uso[kind.key] / max) * 100)}%`, height: 8, borderRadius: 3, background: kind.color }} /></span>
          <span style={{ ...mono, textAlign: 'right', color: C.text2 }}>{corto(uso[kind.key])}</span>
        </div>
      ))}
    </div>
  )
}

export function Proceso({ foco }: { foco?: string }) {
  const [abiertos, setAbiertos] = useState<Set<string>>(() => new Set(foco ? [foco] : ['pedido-original', 'reclamo']))
  useEffect(() => {
    if (!foco) return
    setAbiertos(current => new Set(current).add(foco))
    document.getElementById(`hito-${foco}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [foco])
  const toggle = (id: string) => setAbiertos(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next })
  const max = Math.max(...Object.values(USO).flatMap(uso => [uso.entrada, uso.salida]))

  return (
    <>
      <Panel title="Cuánto costó cada etapa, en tokens" note="Un token es un pedacito de palabra. Los agentes cobran por los que leen y por los que escriben. Los totales salen de los registros locales de cada sesión.">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
          {(['codex', 'claude'] as const).map(agente => (
            <div key={agente} style={{ background: C.surfaceAlt, border: `1px solid ${C.border}`, borderRadius: 10, padding: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                <strong style={{ color: AGENTE[agente].color }}>{AGENTE[agente].nombre}</strong>
                <span style={{ ...mono, fontSize: 11, color: C.dim }}>{tokens.agentes[agente].modelo}</span>
              </div>
              <div style={{ ...mono, fontSize: 22, color: C.text, margin: '6px 0 2px' }}>{corto(suma(agente, 'salida'))} <span style={{ fontSize: 12, color: C.muted }}>de salida</span></div>
              <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.6 }}>
                {corto(suma(agente, 'entrada'))} de entrada nueva · {corto(suma(agente, 'cache'))} releídos de caché · {num(suma(agente, 'turnos'))} llamadas al modelo
              </div>
            </div>
          ))}
        </div>
        <div style={{ display: 'grid', gap: 4, marginTop: 12 }}>
          {KINDS.map(kind => (
            <p key={kind.key} style={{ margin: 0, fontSize: 12, color: C.muted, lineHeight: 1.5 }}>
              <span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 2, background: kind.color, marginRight: 6 }} /><strong style={{ color: C.text2 }}>{kind.label}:</strong> {kind.que}
            </p>
          ))}
        </div>
        <p style={{ margin: '10px 0 0', fontSize: 11.5, color: C.dim, lineHeight: 1.5 }}>
          La mayor parte del total es caché: una sesión larga relee su propia conversación cientos de veces. {tokens.nota} El cálculo está en{' '}
          <a href={`${REPO}/blob/main/scripts/tokens_sesiones.py`} target="_blank" rel="noreferrer" style={mono}>scripts/tokens_sesiones.py ↗</a>
        </p>
      </Panel>

      <Panel title="El recorrido, pedido por pedido" note="Los mensajes de la persona están textuales, con sus errores de tipeo: no hizo falta escribir prolijo. Tocá cada etapa para abrirla.">
        <ol style={{ listStyle: 'none', margin: 0, padding: 0, borderLeft: `2px solid ${C.border}`, marginLeft: 8 }}>
          {HITOS.map((hito, index) => {
            const agente = AGENTE[hito.agente]
            const uso = hito.etapa ? USO[hito.etapa] : null
            const open = abiertos.has(hito.id)
            return (
              <li key={hito.id} id={`hito-${hito.id}`} style={{ position: 'relative', padding: '0 0 16px 20px', scrollMarginTop: 56 }}>
                <span aria-hidden style={{ position: 'absolute', left: -8, top: 4, width: 14, height: 14, borderRadius: 999, background: hito.giro ? C.gas : agente.color, border: `3px solid ${C.surface}` }} />
                <button onClick={() => toggle(hito.id)} aria-expanded={open} style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 0, padding: 0 }}>
                  <span style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                    <span style={{ ...mono, fontSize: 11, color: C.dim }}>{String(index + 1).padStart(2, '0')} · {hito.fecha}</span>
                    <Pill color={agente.color}>{agente.nombre}</Pill>
                    {hito.giro && <Pill color={C.gas}>el giro</Pill>}
                    {uso && <span style={{ ...mono, fontSize: 11, color: C.muted }}>{corto(uso.salida)} de salida · {num(uso.turnos)} llamadas{uso.subagentes ? ` · ${uso.subagentes} subagentes` : ''}</span>}
                  </span>
                  <strong style={{ display: 'block', fontSize: 15, color: C.text, margin: '4px 0' }}>{open ? '▾' : '▸'} {hito.titulo}</strong>
                </button>
                {open && (
                  <div style={{ display: 'grid', gap: 10, marginTop: 6 }}>
                    {hito.prompts.map(prompt => (
                      <blockquote key={prompt} style={{ margin: 0, padding: '8px 12px', borderLeft: `3px solid ${C.blue}`, background: C.surfaceAlt, borderRadius: '0 8px 8px 0', ...mono, fontSize: 12.5, lineHeight: 1.6, color: C.text2, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                        <span style={{ display: 'block', fontFamily: 'var(--font-body)', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: 0.8, color: C.blue, marginBottom: 2 }}>la persona</span>{prompt}
                      </blockquote>
                    ))}
                    <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: C.text2 }}><strong style={{ color: agente.color }}>Qué hizo el agente. </strong>{hito.hizo}</p>
                    <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: C.text2 }}><strong style={{ color: C.text }}>Qué salió. </strong>{hito.salio}</p>
                    {uso && <Barras uso={uso} max={max} />}
                    {hito.commits.length > 0 && (
                      <p style={{ margin: 0, fontSize: 12, color: C.muted }}>Commits:{' '}
                        {hito.commits.map(hash => <a key={hash} href={`${REPO}/commit/${hash}`} target="_blank" rel="noreferrer" style={{ ...mono, marginRight: 10 }}>{hash} ↗</a>)}
                      </p>
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ol>
      </Panel>
    </>
  )
}

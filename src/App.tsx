import { Suspense, lazy, useCallback, useEffect, useState } from 'react'
import { Mapa } from './components/Mapa'
import { Loading } from './components/ui'
import { useBlocks } from './hooks/useData'
import { useNarrow } from './hooks/useViewport'
import { C, mono } from './theme'
import { monthLabel } from './utils/format'

// Sólo el mapa va en el bundle inicial; el resto (y la librería de gráficos) se baja al abrir cada pestaña.
const Campos = lazy(() => import('./components/Campos').then(module => ({ default: module.Campos })))
const Pronostico = lazy(() => import('./components/Pronostico').then(module => ({ default: module.Pronostico })))
const Pozos = lazy(() => import('./components/Pozos').then(module => ({ default: module.Pozos })))
const Metodologia = lazy(() => import('./components/Metodologia').then(module => ({ default: module.Metodologia })))
const ComoSeHizo = lazy(() => import('./components/ComoSeHizo').then(module => ({ default: module.ComoSeHizo })))

export const REPO = 'https://github.com/mpodeley/cuenca-austral'

export type Tab = 'mapa' | 'campo' | 'operadora' | 'pronostico' | 'pozos' | 'metodologia' | 'como-se-hizo'
export interface Route { tab: Tab; id?: string }

const TABS: Array<{ tab: Tab; label: string }> = [
  { tab: 'mapa', label: 'Mapa' }, { tab: 'campo', label: 'Yacimiento' }, { tab: 'pronostico', label: 'Pronóstico' },
  { tab: 'pozos', label: 'Pozos' }, { tab: 'como-se-hizo', label: 'Cómo se hizo' },
]
const KNOWN: Tab[] = ['mapa', 'campo', 'operadora', 'pronostico', 'pozos', 'metodologia', 'como-se-hizo']

export function parseRoute(hash: string): Route {
  // Algunos nombres de concesión traen "/": el id es todo lo que sigue a la pestaña, decodificado por segmento.
  const [tab, ...rest] = hash.replace(/^#\/?/, '').split('/')
  if (!KNOWN.includes(tab as Tab)) return { tab: 'mapa' }
  const id = rest.map(decodeURIComponent).join('/')
  return id ? { tab: tab as Tab, id } : { tab: tab as Tab }
}

export function routeHash(route: Route): string {
  return `#/${route.tab}${route.id ? `/${route.id.split('/').map(encodeURIComponent).join('/')}` : ''}`
}

export function App() {
  const narrow = useNarrow()
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.hash))
  const blocks = useBlocks()

  useEffect(() => {
    const onChange = () => setRoute(parseRoute(window.location.hash))
    window.addEventListener('popstate', onChange)
    window.addEventListener('hashchange', onChange)
    return () => { window.removeEventListener('popstate', onChange); window.removeEventListener('hashchange', onChange) }
  }, [])

  const go = useCallback((next: Route) => {
    window.history.pushState(null, '', routeHash(next))
    setRoute(next)
    window.scrollTo({ top: 0 })
  }, [])

  const active: Tab = route.tab === 'operadora' ? 'campo' : route.tab
  return (
    <div style={{ maxWidth: 1240, margin: '0 auto', padding: narrow ? '0 12px 80px' : '0 20px 80px' }}>
      <div style={{ position: 'sticky', top: 0, zIndex: 50, background: C.bg, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', fontSize: 12, borderBottom: `1px solid ${C.border}` }}>
        <span style={{ color: C.muted }}>Curso de IA aplicada a energía · una app hecha con agentes de código</span>
        <a href={REPO} target="_blank" rel="noreferrer" style={{ ...mono, color: C.muted, textDecoration: 'none', whiteSpace: 'nowrap' }}>GitHub ↗</a>
      </div>

      <header style={{ padding: '22px 0 14px' }}>
        <h1 style={{ fontSize: narrow ? 24 : 32, fontWeight: 700, color: C.text }}>Cuenca Austral, pozo por pozo</h1>
        <p style={{ margin: '6px 0 0', fontSize: 11.5, color: C.dim }}>
          Datos públicos de la Secretaría de Energía (Capítulo IV){blocks.sourceDate ? ` · al ${monthLabel(blocks.sourceDate)}` : ''}
        </p>
      </header>

      <nav style={{ display: 'flex', gap: 2, borderBottom: `1px solid ${C.border}`, marginBottom: 16, overflowX: 'auto' }} aria-label="Secciones">
        {TABS.map(item => (
          <button
            key={item.tab} onClick={() => go({ tab: item.tab })} aria-current={active === item.tab ? 'page' : undefined}
            style={{
              border: 0, borderBottom: `2px solid ${active === item.tab ? C.blue : 'transparent'}`, background: active === item.tab ? C.surface : 'none',
              color: active === item.tab ? C.text : C.muted, padding: narrow ? '9px 11px' : '10px 18px', fontSize: 13.5, borderRadius: '8px 8px 0 0', whiteSpace: 'nowrap',
            }}
          >{item.label}</button>
        ))}
      </nav>

      <main style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 16 }}>
        <Suspense fallback={<Loading />}>
          {route.tab === 'mapa' && <Mapa go={go} />}
          {(route.tab === 'campo' || route.tab === 'operadora') && <Campos mode={route.tab} id={route.id} go={go} />}
          {route.tab === 'pronostico' && <Pronostico go={go} />}
          {route.tab === 'pozos' && <Pozos id={route.id} go={go} />}
          {route.tab === 'metodologia' && <Metodologia />}
          {route.tab === 'como-se-hizo' && <ComoSeHizo go={go} />}
        </Suspense>
      </main>

      <footer style={{ marginTop: 28, fontSize: 12, color: C.dim, lineHeight: 1.6 }}>
        <button onClick={() => go({ tab: 'metodologia' })} style={{ background: 'none', border: 0, padding: 0, color: '#60a5fa', fontSize: 13 }}>Cómo está calculado todo esto →</button>
        <p style={{ margin: '8px 0 0' }}>
          Curvas de declinación Arps con declinación terminal mínima; EUR, pozos tipo y pronósticos son estimaciones con fines didácticos y analíticos, no certificaciones de reservas.
        </p>
      </footer>
    </div>
  )
}

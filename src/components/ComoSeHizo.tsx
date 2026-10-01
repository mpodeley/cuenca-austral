import { Arquitectura } from '../didactica/Arquitectura'
import { useDidactica } from '../didactica/Contexto'
import { Proceso } from '../didactica/Proceso'
import { Modelo, Recorrido } from '../didactica/Recorrido'
import { MODULOS, REPO, repoUrl } from '../didactica/registro'
import { Panel } from './ui'
import { C, card, mono, td, th } from '../theme'
import { useNarrow } from '../hooks/useViewport'
import type { Route } from '../App'

const PAGINAS = [
  { id: 'inicio', label: 'Inicio' }, { id: 'proceso', label: 'Proceso' }, { id: 'arquitectura', label: 'Arquitectura' },
  { id: 'recorrido', label: 'Un dato, de punta a punta' }, { id: 'modelo', label: 'El modelo, para tocar' }, { id: 'auditar', label: 'Auditar' },
] as const
type Pagina = typeof PAGINAS[number]['id']

const LINKS: Array<[string, string, string]> = [
  ['', 'Repositorio completo', 'Código, historial y commits'],
  ['/blob/main/README.md', 'README', 'Cómo ejecutar y entender el proyecto'],
  ['/blob/main/COURSE.md', 'Guía para el curso', 'El proceso, paso a paso, para no programadores'],
  ['/blob/main/ARCHITECTURE.md', 'Arquitectura', 'El esquema y la tabla módulo → código'],
  ['/blob/main/DECISIONS.md', 'Decisiones', 'Qué se eligió, qué se cambió y por qué'],
  ['/blob/main/DATA.md', 'Datos y límites', 'Fuentes, reglas y advertencias'],
  ['/blob/main/data/processed/quality-report.md', 'Control de calidad', 'Conteos, cobertura y validaciones'],
  ['/blob/main/data/processed/manifest.json', 'Manifiesto', 'De qué archivo oficial salió cada año'],
  ['/commits/main', 'Historial de commits', 'Cada etapa, con su explicación'],
  ['/actions', 'Automatizaciones', 'Pruebas, datos mensuales y publicación'],
]

const PASOS: Array<[string, string, Pagina]> = [
  ['Definir el resultado', 'La persona pide un mapa, fichas y pronósticos con datos públicos, «similar a» una app que ya conoce.', 'proceso'],
  ['Encontrar las fuentes', 'El agente busca en el portal de la Secretaría de Energía y anota de qué archivo salió cada año.', 'arquitectura'],
  ['Convertir datos', 'Scripts de Python suman, limpian y ajustan curvas. Los supuestos son constantes a la vista.', 'recorrido'],
  ['Construir la interfaz', 'React dibuja las pestañas; el mapa es SVG propio; el pronóstico corre en el navegador.', 'modelo'],
  ['Probar antes de publicar', 'Las pruebas revisan los cálculos, que la historia no tenga huecos y que cada link al código exista.', 'auditar'],
  ['Publicar y mantener', 'GitHub Pages sirve la web. Una tarea mensual propone los datos nuevos para revisar.', 'arquitectura'],
]

const LECCIONES: Array<[string, string]> = [
  ['El pedido no era el resultado', 'La primera versión cumplía la lista («mapa, fichas, pronósticos») pero no se parecía a la referencia pedida. Compararla contra el ejemplo concreto detectó la diferencia en minutos.'],
  ['«Pasa los controles» no es «está bien»', 'El reporte de calidad decía «pass» con años enteros vacíos: revisaba identificadores y coordenadas, no continuidad en el tiempo. Ahora el build falla si falta un mes.'],
  ['La causa estaba en la fuente, no en el código', 'La API de consulta del portal devolvía errores o cargas parciales; el archivo descargable estaba completo. Cambiar la vía de acceso arregló todos los años a la vez.'],
  ['Los gráficos pueden esconder problemas', 'El gráfico viejo dibujaba un punto por registro, sin fechas: los meses faltantes desaparecían. Ahora el eje es el calendario.'],
  ['Decir lo que no se puede', 'No hay trayectorias públicas para esta cuenca y la historia empieza en 2006. Está escrito en Metodología en lugar de quedar como una capa vacía.'],
]

function Inicio({ go }: { go: (route: Route) => void }) {
  const narrow = useNarrow()
  const { clase, setClase } = useDidactica()
  return (
    <>
      <Panel>
        <h2 style={{ fontSize: 22, color: C.text }}>¿Cómo se hizo esta app?</h2>
        <p style={{ margin: '8px 0 12px', fontSize: 14, color: C.text2, lineHeight: 1.65, maxWidth: 820 }}>
          Se construyó conversando con agentes de código, en vivo, para un curso de IA aplicada a energía. No hace falta saber programar para seguir el proceso: cada módulo de la app tiene un botón <span style={{ ...mono, color: C.orange }}>{'</>'}</span> que explica qué hace, de dónde sale el dato y dónde está su código.
        </p>
        <label style={{ display: 'inline-flex', gap: 8, alignItems: 'center', fontSize: 13, color: clase ? C.orange : C.text2, cursor: 'pointer' }}>
          <input type="checkbox" checked={clase} onChange={event => setClase(event.target.checked)} style={{ accentColor: C.orange }} />
          Modo clase: resaltar cada módulo y mostrar los botones con su etiqueta
        </label>
      </Panel>
      <Panel title="Del pedido a una aplicación" note="Cada paso lleva a la página que lo muestra.">
        <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gridTemplateColumns: narrow ? '1fr' : 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
          {PASOS.map(([title, text, page], index) => (
            <li key={title}>
              <button onClick={() => go({ tab: 'como-se-hizo', id: page })} style={{ ...card, background: C.surfaceAlt, padding: 14, width: '100%', height: '100%', textAlign: 'left' }}>
                <span style={{ ...mono, color: C.blue, fontSize: 12 }}>{String(index + 1).padStart(2, '0')}</span>
                <strong style={{ display: 'block', margin: '4px 0', color: C.text }}>{title} →</strong>
                <span style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.55 }}>{text}</span>
              </button>
            </li>
          ))}
        </ol>
      </Panel>
      <Panel title="Persona + agente">
        <div style={{ display: 'grid', gridTemplateColumns: narrow ? '1fr' : 'repeat(3, minmax(0, 1fr))', gap: 14 }}>
          {[
            ['La persona aportó', 'Objetivo, región, un ejemplo de referencia, criterio de transparencia y las decisiones de producto. También el «esto no es lo que pedí».'],
            ['El agente ejecutó', 'Investigación de fuentes, arquitectura, código, pruebas, documentación y automatizaciones.'],
            ['La revisión sigue siendo humana', 'Fuentes, supuestos técnicos, resultados del pronóstico y cada cambio antes de publicarlo.'],
          ].map(([title, text]) => (
            <div key={title}><strong style={{ color: C.text }}>{title}</strong><p style={{ margin: '4px 0 0', fontSize: 13, color: C.muted, lineHeight: 1.6 }}>{text}</p></div>
          ))}
        </div>
      </Panel>
    </>
  )
}

function Auditar() {
  const { abrir } = useDidactica()
  return (
    <>
      <Panel title="Documentos del repositorio">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 10 }}>
          {LINKS.map(([path, label, note]) => (
            <a key={label} href={`${REPO}${path}`} target="_blank" rel="noreferrer" style={{ ...card, background: C.surfaceAlt, padding: 12, textDecoration: 'none' }}>
              <strong style={{ display: 'block', color: C.text }}>{label} ↗</strong>
              <span style={{ fontSize: 12, color: C.muted }}>{note}</span>
            </a>
          ))}
        </div>
      </Panel>
      <Panel title="Cada módulo y su código" note="El mismo registro que alimenta los botones «cómo se hizo». Una prueba automática falla si alguno de estos archivos o funciones deja de existir.">
        <div className="scroll-x">
          <table>
            <thead><tr>{['Módulo', 'Código'].map(label => <th key={label} style={th}>{label}</th>)}</tr></thead>
            <tbody>
              {MODULOS.map(item => (
                <tr key={item.id}>
                  <td style={{ ...td, verticalAlign: 'top' }}><button onClick={() => abrir(item.id)} style={{ background: 'none', border: 0, padding: 0, color: '#60a5fa', textAlign: 'left' }}>{item.titulo}</button></td>
                  <td style={{ ...td, whiteSpace: 'normal' }}>
                    {item.codigo.map(ref => <a key={ref.archivo + (ref.simbolo ?? '')} href={repoUrl(ref)} target="_blank" rel="noreferrer" style={{ ...mono, fontSize: 11.5, marginRight: 12, display: 'inline-block' }}>{ref.archivo}{ref.simbolo ? `·${ref.simbolo}` : ''}</a>)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      <Panel title="Lo que salió mal la primera vez" accent={C.orange} note="La app se hizo dos veces. El detalle, pedido por pedido, está en Proceso.">
        <div style={{ display: 'grid', gap: 10 }}>
          {LECCIONES.map(([title, text]) => (
            <div key={title}><strong style={{ color: C.text, fontSize: 13.5 }}>{title}</strong><p style={{ margin: '3px 0 0', fontSize: 13, color: C.muted, lineHeight: 1.6 }}>{text}</p></div>
          ))}
        </div>
      </Panel>
    </>
  )
}

export function ComoSeHizo({ sub, go }: { sub?: string; go: (route: Route) => void }) {
  const narrow = useNarrow()
  const [first, ...rest] = (sub ?? 'inicio').split('/')
  const page: Pagina = PAGINAS.some(item => item.id === first) ? (first as Pagina) : 'inicio'
  const foco = rest.join('/') || undefined
  return (
    <>
      <nav aria-label="Páginas de Cómo se hizo" style={{ display: 'flex', gap: 6, flexWrap: narrow ? 'nowrap' : 'wrap', overflowX: 'auto' }}>
        {PAGINAS.map(item => (
          <button key={item.id} onClick={() => go({ tab: 'como-se-hizo', id: item.id === 'inicio' ? undefined : item.id })} aria-current={page === item.id ? 'page' : undefined}
            style={{ border: `1px solid ${page === item.id ? C.orange : C.border}`, background: page === item.id ? `${C.orange}22` : C.surface, color: page === item.id ? C.orange : C.text2, borderRadius: 999, padding: '6px 14px', fontSize: 12.5, whiteSpace: 'nowrap' }}
          >{item.label}</button>
        ))}
      </nav>
      {page === 'inicio' && <Inicio go={go} />}
      {page === 'proceso' && <Proceso foco={foco} />}
      {page === 'arquitectura' && <Arquitectura foco={foco} go={go} />}
      {page === 'recorrido' && <Recorrido go={go} />}
      {page === 'modelo' && <Modelo />}
      {page === 'auditar' && <Auditar />}
    </>
  )
}

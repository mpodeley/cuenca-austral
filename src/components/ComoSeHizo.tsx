import type { ReactNode } from 'react'
import { Panel } from './ui'
import { C, card, mono } from '../theme'
import { useNarrow } from '../hooks/useViewport'
import { REPO } from '../App'
import type { Route } from '../App'

const P = ({ children }: { children: ReactNode }) => <p style={{ margin: '0 0 10px', lineHeight: 1.65, fontSize: 13.5, color: C.text2 }}>{children}</p>

const LINKS: Array<[string, string, string]> = [
  ['', 'Repositorio completo', 'Código, historial y commits'],
  ['/blob/main/README.md', 'README', 'Cómo ejecutar y entender el proyecto'],
  ['/blob/main/COURSE.md', 'Guía para el curso', 'El proceso, paso a paso, para no programadores'],
  ['/blob/main/DECISIONS.md', 'Decisiones', 'Qué se eligió, qué se cambió y por qué'],
  ['/blob/main/DATA.md', 'Datos y límites', 'Fuentes, reglas y advertencias'],
  ['/blob/main/data/processed/quality-report.md', 'Control de calidad', 'Conteos, cobertura y validaciones'],
  ['/blob/main/data/processed/manifest.json', 'Manifiesto', 'De qué archivo oficial salió cada año'],
  ['/commits/main', 'Historial de commits', 'Cada etapa, con su explicación'],
  ['/actions', 'Automatizaciones', 'Pruebas, datos mensuales y publicación'],
]

const STEPS: Array<[string, string]> = [
  ['Definir el resultado', 'La persona pide: un mapa con concesiones y pozos, una ficha por bloque y pronósticos con pozos tipo ajustados a la historia, todo con datos públicos y a la vista en el repositorio.'],
  ['Encontrar las fuentes', 'El agente busca en el portal de datos de la Secretaría de Energía, baja los archivos y deja anotado de qué recurso salió cada año.'],
  ['Convertir datos', 'Scripts de Python suman, limpian y ajustan curvas. Los supuestos están escritos como constantes al principio de cada archivo.'],
  ['Construir la interfaz', 'React dibuja las pestañas; el mapa es SVG propio, sin servicios externos; los gráficos usan Recharts.'],
  ['Probar antes de publicar', 'Las pruebas automáticas revisan los cálculos y que la historia no tenga huecos. Si algo falla, no se publica.'],
  ['Publicar y mantener', 'GitHub Pages sirve la web. Una tarea mensual baja los datos nuevos y propone el cambio para revisar.'],
]

const LESSONS: Array<[string, string]> = [
  ['El pedido no era el resultado', 'La primera versión cumplía la lista ("mapa, fichas, pronósticos") pero no se parecía a la referencia que se había pedido. Mostrar un ejemplo concreto y compararlo contra el resultado detectó la diferencia en minutos.'],
  ['"Pasa los controles" no es "está bien"', 'El reporte de calidad decía "pass" con 2014, 2015, 2017 y casi todo 2024–2025 vacíos. Revisaba identificadores y coordenadas, no continuidad en el tiempo. Ahora el build falla si falta un mes.'],
  ['La causa estaba en la fuente, no en el código', 'La API de consulta del portal devolvía error o cargas parciales; el archivo descargable estaba completo. Cambiar de vía de acceso arregló todos los años de una vez.'],
  ['Los gráficos pueden esconder problemas', 'El gráfico viejo dibujaba un punto por registro, sin fechas: los meses faltantes desaparecían. Ahora el eje es el calendario.'],
  ['Decir lo que no se puede', 'No hay trayectorias públicas para esta cuenca y la historia empieza en 2006. Eso está escrito en Metodología en lugar de quedar como una capa vacía.'],
]

export function ComoSeHizo({ go }: { go: (route: Route) => void }) {
  const narrow = useNarrow()
  return (
    <>
      <Panel>
        <h2 style={{ fontSize: 22, color: C.text }}>¿Cómo se hizo esta app?</h2>
        <p style={{ margin: '8px 0 0', fontSize: 14, color: C.text2, lineHeight: 1.65, maxWidth: 820 }}>
          Este producto se construyó conversando con agentes de código, en vivo, para un curso de IA aplicada a energía. No hace falta saber programar para seguir el proceso: cada decisión, dato y prueba se puede abrir y revisar.
        </p>
      </Panel>

      <Panel title="Del pedido a una aplicación">
        <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gridTemplateColumns: narrow ? '1fr' : 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
          {STEPS.map(([title, text], index) => (
            <li key={title} style={{ ...card, background: C.surfaceAlt, padding: 14 }}>
              <span style={{ ...mono, color: C.blue, fontSize: 12 }}>{String(index + 1).padStart(2, '0')}</span>
              <strong style={{ display: 'block', margin: '4px 0', color: C.text }}>{title}</strong>
              <span style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.55 }}>{text}</span>
            </li>
          ))}
        </ol>
      </Panel>

      <Panel title="Lo que salió mal la primera vez, y cómo se corrigió" accent={C.orange} note="La app se hizo dos veces. Un primer agente entregó una versión que no cumplía el pedido; un segundo agente la revisó contra el pedido original y la rehízo. El recorrido es parte del material del curso.">
        <div style={{ display: 'grid', gap: 10 }}>
          {LESSONS.map(([title, text]) => (
            <div key={title}>
              <strong style={{ color: C.text, fontSize: 13.5 }}>{title}</strong>
              <p style={{ margin: '3px 0 0', fontSize: 13, color: C.muted, lineHeight: 1.6 }}>{text}</p>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="¿Qué podés auditar?">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 10 }}>
          {LINKS.map(([path, label, note]) => (
            <a key={label} href={`${REPO}${path}`} target="_blank" rel="noreferrer" style={{ ...card, background: C.surfaceAlt, padding: 12, textDecoration: 'none' }}>
              <strong style={{ display: 'block', color: C.text }}>{label} ↗</strong>
              <span style={{ fontSize: 12, color: C.muted }}>{note}</span>
            </a>
          ))}
        </div>
      </Panel>

      <Panel title="El pronóstico, sin jerga">
        <P>Un pozo suele producir mucho al comienzo y menos con el tiempo. La curva de Arps describe esa caída con tres números: producción inicial, velocidad de declinación y forma de la curva. Acá se ajustan contra la historia de cada pozo.</P>
        <P>El <strong>pozo tipo</strong> es el pozo "típico" de un bloque: la mediana de sus pozos, mes a mes desde que arrancan. El pronóstico suma dos cosas: lo que seguirán dando los pozos de hoy, y pozos nuevos iguales al pozo tipo, perforados al ritmo que el escenario suponga.</P>
        <P>Los detalles, con cada umbral y cada límite, están en <button onClick={() => go({ tab: 'metodologia' })} style={{ background: 'none', border: 0, padding: 0, color: '#60a5fa' }}>Metodología →</button></P>
      </Panel>

      <Panel title="Persona + agente">
        <div style={{ display: 'grid', gridTemplateColumns: narrow ? '1fr' : 'repeat(3, minmax(0, 1fr))', gap: 14 }}>
          {[
            ['La persona aportó', 'Objetivo, región, un ejemplo de referencia, criterio de transparencia y las decisiones de producto. También el "esto no es lo que pedí".'],
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

import type { Dataset } from '../types'
import type { ReactNode } from 'react'

const REPO = 'https://github.com/mpodeley/cuenca-austral'

export function LearnPanel({ dataset, onClose }: { dataset: Dataset; onClose: () => void }) {
  return (
    <aside className="learn-panel">
      <button className="close" onClick={onClose} aria-label="Cerrar guía">×</button>
      <p className="eyebrow">Guía abierta del proyecto</p>
      <h2>¿Cómo se hizo esta app?</h2>
      <p className="lead">Este producto se construyó conversando con un agente de coding. No hace falta saber programar para seguir el proceso: cada decisión, dato y prueba se puede abrir y revisar.</p>

      <div className="learn-status">
        <span className={`status-dot ${dataset.metadata.mode}`} />
        <div><strong>{dataset.metadata.mode === 'official' ? 'Datos oficiales procesados' : 'Modo demostración'}</strong><p>{dataset.metadata.disclaimer}</p></div>
      </div>

      <section className="journey">
        <h3>Del pedido a una aplicación</h3>
        <ol>
          <Step n="1" title="Definir el resultado">Mapa, fichas por bloque y pronósticos auditables. La persona decide el objetivo; el agente propone cómo implementarlo.</Step>
          <Step n="2" title="Encontrar fuentes públicas">El pipeline apunta a la Secretaría de Energía y registra origen, fecha y huella digital de cada archivo.</Step>
          <Step n="3" title="Convertir datos">Un script limpia nombres, coordenadas y unidades. Los supuestos no quedan escondidos: se guardan en el manifiesto.</Step>
          <Step n="4" title="Construir y explicar">React dibuja la interfaz, MapLibre el mapa y funciones pequeñas calculan las curvas de declinación.</Step>
          <Step n="5" title="Probar antes de publicar">Pruebas automáticas revisan el pipeline, el modelo y la compilación. GitHub Actions repite esos controles.</Step>
          <Step n="6" title="Publicar y mantener">GitHub Pages sirve la web. Una tarea mensual busca datos nuevos y propone un cambio revisable.</Step>
        </ol>
      </section>

      <section>
        <h3>¿Qué podés auditar?</h3>
        <div className="link-grid">
          <DocLink href={REPO} label="Repositorio completo" note="Código, historial y commits" />
          <DocLink href={`${REPO}/blob/main/README.md`} label="README" note="Cómo ejecutar y entender el proyecto" />
          <DocLink href={`${REPO}/blob/main/COURSE.md`} label="Guía para el curso" note="Proceso para no programadores" />
          <DocLink href={`${REPO}/blob/main/DECISIONS.md`} label="Decisiones" note="Qué se eligió y por qué" />
          <DocLink href={`${REPO}/blob/main/DATA.md`} label="Datos y límites" note="Fuentes, reglas y advertencias" />
          <DocLink href={`${REPO}/blob/main/data/processed/manifest.json`} label="Manifiesto" note="Checksums, versiones y supuestos" />
          <DocLink href={`${REPO}/blob/main/data/processed/quality-report.md`} label="Control de calidad" note="Conteos y validaciones" />
          <DocLink href={`${REPO}/actions`} label="Automatizaciones" note="Pruebas, datos y publicación" />
        </div>
      </section>

      <section className="plain-language">
        <h3>El pronóstico, sin jerga</h3>
        <p>Un pozo suele producir mucho al comienzo y menos con el tiempo. La curva Arps describe esa caída con tres números: producción inicial, velocidad de declinación y forma de la curva. Acá se ajustan contra la historia y se pueden mover a mano para ver su efecto.</p>
        <p>El escenario del bloque suma pozos tipo en las fechas que el usuario indique. Arranca con cero pozos futuros para no convertir una suposición en un “dato”.</p>
      </section>

      <section className="human-agent">
        <h3>Persona + agente</h3>
        <div><strong>La persona aportó</strong><p>Objetivo, región, alcance, criterio de transparencia y decisiones del producto.</p></div>
        <div><strong>El agente ejecutó</strong><p>Investigación, arquitectura, código, pruebas, documentación y automatizaciones.</p></div>
        <div><strong>La revisión sigue siendo humana</strong><p>Fuentes, supuestos técnicos, resultados del forecast y cambios antes de publicarlos.</p></div>
      </section>
    </aside>
  )
}

function Step({ n, title, children }: { n: string; title: string; children: ReactNode }) {
  return <li><span>{n}</span><div><strong>{title}</strong><p>{children}</p></div></li>
}

function DocLink({ href, label, note }: { href: string; label: string; note: string }) {
  return <a href={href} target="_blank" rel="noreferrer"><strong>{label} ↗</strong><span>{note}</span></a>
}

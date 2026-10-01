import type { ReactNode } from 'react'
import { Panel } from './ui'
import { C, mono } from '../theme'
import { useBlocks, useForecast } from '../hooks/useData'
import { monthLabel, num } from '../utils/format'
import { REPO } from '../App'

const Code = ({ children }: { children: ReactNode }) => <code style={{ ...mono, background: C.surfaceAlt, borderRadius: 4, padding: '1px 5px', fontSize: 12 }}>{children}</code>
const P = ({ children }: { children: ReactNode }) => <p style={{ margin: '0 0 10px', lineHeight: 1.65, fontSize: 13.5, color: C.text2 }}>{children}</p>
const File = ({ path }: { path: string }) => <a href={`${REPO}/blob/main/${path}`} target="_blank" rel="noreferrer" style={mono}>{path}</a>

export function Metodologia() {
  const blocks = useBlocks()
  const forecast = useForecast()
  const wells = blocks.data?.reduce((total, block) => total + block.n_pozos, 0)
  const official = blocks.data?.filter(block => block.geometria === 'oficial').length
  const derived = blocks.data?.filter(block => block.geometria === 'derivada').length
  const own = forecast.data ? Object.values(forecast.data.campos).filter(field => field.tipo.gas?.origen === 'bloque' || field.tipo.oil?.origen === 'bloque').length : null

  const sections: Array<{ title: string; accent?: string; body: ReactNode }> = [
    {
      title: 'Fuentes de datos y alcance',
      body: <>
        <P>Todo sale de datos públicos de la Secretaría de Energía de la Nación (<a href="https://datos.energia.gob.ar/dataset/produccion-de-petroleo-y-gas-por-pozo" target="_blank" rel="noreferrer">Capítulo IV: producción de petróleo y gas por pozo</a>), filtrados por <Code>cuenca = AUSTRAL</Code>: {wells ? num(wells) : '…'} pozos en {blocks.data?.length ?? '…'} áreas, de enero de 2006 a {monthLabel(blocks.sourceDate)}.</P>
        <P>Se usan los CSV anuales completos, no la API de consulta del portal: esa API responde con error para algunos años y con cargas parciales para otros, aunque el archivo descargable esté entero. El script es <File path="pipeline/fetch_capiv.py" />.</P>
        <P>Las concesiones vienen del shapefile oficial de concesiones de explotación; el contorno de cuenca, del conjunto de cuencas sedimentarias; la costa y el límite internacional, de Natural Earth (dominio público).</P>
      </>,
    },
    {
      title: 'Serie de producción por pozo',
      body: <>
        <P>La fuente trae una fila por pozo, mes y formación. Los volúmenes de un mismo pozo y mes se suman. Las tasas son <strong>promedios por día calendario</strong> (volumen del mes dividido por los días del mes), así la suma de pozos reproduce la producción del bloque.</P>
        <P>Unidades: gas en <Code>Mm³/d</Code> (miles de m³ por día) a escala de pozo y <Code>MMm³/d</Code> a escala de cuenca; petróleo y agua en <Code>m³/d</Code>. Acumuladas y EUR: gas en <Code>MMm³</Code>, petróleo en <Code>Mm³</Code>.</P>
        <P>Un pozo se considera <strong>activo</strong> si produjo gas o petróleo en los últimos 12 meses.</P>
      </>,
    },
    {
      title: 'Meses finales y declaraciones atrasadas',
      body: <>
        <P>Algunas operadoras declaran tarde. Un mes final se descarta entero si los pozos que todavía no declararon representaban más del 10 % de la producción. Si representan menos, el mes se usa y esos pozos <strong>sostienen su última tasa</strong> en los totales de bloque y de cuenca, hasta 6 meses. La ficha del bloque avisa cuando pasa.</P>
        <P>El pipeline corta con error si falta un mes entero o si el total de la cuenca cae a menos del 60 % de la mediana de los meses vecinos. El reporte queda en <File path="data/processed/quality-report.md" />.</P>
      </>,
    },
    {
      title: 'Declinación (Arps hiperbólica)',
      body: <>
        <P>Para cada pozo y fluido se ajusta <Code>q(t) = qi / (1 + b·Di·t)^(1/b)</Code> desde el pico, que es el máximo de la media móvil de tres meses de toda la serie (muchos pozos tienen su mejor etapa después de una reparación). Límites: <Code>b</Code> entre 0,01 y 1 (pozos convencionales: de exponencial a armónica), <Code>Di</Code> entre 0,001 y 0,6 por mes, <Code>qi</Code> entre 0,3 y 3 veces el pico.</P>
        <P>Se necesitan al menos 12 meses con producción desde el pico. El ajuste se descarta si el R² es menor que 0,30. El código es <File path="pipeline/arps.py" />.</P>
      </>,
    },
    {
      title: 'EUR y su banda',
      body: <>
        <P>EUR = acumulada desde 2006 + cola. La cola arranca en la mediana de las últimas tres tasas reales y sigue la hiperbólica ajustada hasta que la declinación baja a la <strong>terminal de 8 % anual</strong>; desde ahí es exponencial. Se corta en el límite económico (1 Mm³/d de gas, 0,3 m³/d de petróleo) o a los 30 años.</P>
        <P>Un pozo inactivo no tiene cola: su EUR es lo que ya produjo. Un pozo activo sin ajuste aceptable usa una exponencial de 12 % anual y queda con confianza baja.</P>
        <P>La banda bajo–alto sale de 200 sorteos Monte Carlo sobre la incertidumbre del ajuste (covarianza de <Code>Di</Code> y <Code>b</Code>), percentiles 10 y 90. Cuando la cola ya corre a declinación terminal el sorteo no la mueve, y la banda pasa a ser ±25 %. La confianza es alta con R² ≥ 0,8 y 36 meses o más; media con R² ≥ 0,5 y 18 meses; baja en el resto.</P>
      </>,
    },
    {
      title: 'Fluido principal',
      body: <P>Cada pozo y cada bloque se clasifica como de gas o de petróleo comparando acumuladas en energía, con la equivalencia aproximada 1.000 m³ de gas ≈ 1 m³ de petróleo.</P>,
    },
    {
      title: 'Pozos tipo',
      body: <>
        <P>Se alinean los pozos por su primer mes con producción y se calculan percentiles mes a mes. Convención petrolera: <strong>P10 es el caso alto</strong> y P90 el bajo. Sólo entran pozos cuyo arranque se observa (posterior a enero de 2006), con al menos 12 meses de historia y cuyo fluido principal coincide.</P>
        <P>Hacen falta 8 pozos para un pozo tipo propio y 4 pozos vivos para calcular cada mes. {own !== null ? `Hoy ${own} bloques tienen pozo tipo propio; ` : ''}el resto usa el de la cuenca onshore u offshore según corresponda, y la tabla del pronóstico lo indica.</P>
        <P>Para el pronóstico, la mediana se ajusta con Arps y se extiende a 20 años. Los casos bajo y alto escalan esa curva con la dispersión entre pozos de la acumulada de los primeros 24 meses (percentiles 10 y 90 sobre la mediana).</P>
      </>,
    },
    {
      title: 'Ficha de bloque',
      body: <>
        <P>Un bloque es el área de concesión que declara cada pozo. La operadora y la provincia son las más frecuentes entre sus pozos. La superficie se calcula del polígono oficial, que no trae ese dato. EUR del bloque = suma de los EUR de sus pozos; <strong>% agotado</strong> = acumulada / EUR.</P>
        <P>Etapa: "Sin producción" si no tiene pozos activos; "Desarrollo activo" con 3 o más pozos nuevos en los últimos tres años; "Maduro" si ya produjo el 80 % o más de su EUR; "En producción" en el resto.</P>
      </>,
    },
    {
      title: 'Pronóstico',
      body: <>
        <P><strong>Base</strong>: cada pozo activo sigue su propia curva, anclada en su última tasa real. Es lo que produciría el bloque sin perforar más.</P>
        <P><strong>Pozos nuevos</strong>: cada campo perfora a su ritmo histórico (promedio de los últimos cinco años calendario) multiplicado por los supuestos del escenario, hasta agotar su inventario. Cada tanda mensual sigue el pozo tipo desde su mes de entrada. El cálculo corre en el navegador (<File path="src/utils/forecast.ts" />).</P>
      </>,
    },
    {
      title: 'Supuestos del pronóstico', accent: C.orange,
      body: <>
        <P>El inventario por defecto es "tantos años al ritmo histórico": es un supuesto para poder mover, no una estimación de locaciones perforables.</P>
        <P>Los pozos nuevos de un campo son de su fluido principal y sólo aportan a ese fluido: el condensado asociado a pozos de gas nuevos no se suma al pronóstico de petróleo.</P>
        <P>No hay restricciones de transporte, plantas ni mercado.</P>
      </>,
    },
    {
      title: 'Limitaciones', accent: C.orange,
      body: <>
        <P><strong>La historia empieza en 2006.</strong> Los pozos que ya producían aparecen como "2006 o antes": no se conoce su arranque ni su acumulada previa, así que su EUR y el % agotado de los bloques viejos están subestimados.</P>
        <P><strong>No hay trayectorias.</strong> La única publicación oficial de trayectorias cubre Vaca Muerta. Los pozos se dibujan en su ubicación de superficie; onshore u offshore se decide por si ese punto cae en tierra.</P>
        <P><strong>{derived ?? '…'} áreas no tienen polígono oficial</strong> ({official ?? '…'} sí). Se dibujan con borde punteado como la envolvente de sus pozos y no tienen superficie.</P>
        <P>Los datos son declaraciones juradas de las operadoras y pueden rectificarse. EUR, pozos tipo y pronósticos son estimaciones didácticas, no certificaciones de reservas.</P>
      </>,
    },
    {
      title: 'Mejoras posibles', accent: C.oil,
      body: <P>Sumar la producción anterior a 2006 desde las series históricas por yacimiento; reservas certificadas por área para contrastar el EUR; capacidad de gasoductos y plantas para limitar el pronóstico; y fechas de perforación para separar pozos perforados de pozos conectados.</P>,
    },
  ]

  return (
    <>
      <Panel>
        <h2 style={{ fontSize: 22, color: C.text }}>Cómo está calculado todo esto</h2>
        <p style={{ margin: '8px 0 0', fontSize: 13.5, color: C.muted, lineHeight: 1.6 }}>Cada número de la app sale de un script del repositorio. Acá están las reglas, en el orden en que se aplican.</p>
      </Panel>
      {sections.map((section, index) => (
        <Panel key={section.title} title={`${index + 1}. ${section.title}`} accent={section.accent}>{section.body}</Panel>
      ))}
    </>
  )
}

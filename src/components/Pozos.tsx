import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis } from 'recharts'
import { Empty, ErrorMsg, Loading, Panel, Pill, Seg } from './ui'
import { C, FLUID_COLOR, FLUID_LABEL, axisTick, inputStyle, mono, selectStyle, td, th, tooltipStyle } from '../theme'
import { useSeries, useWells } from '../hooks/useData'
import { useNarrow } from '../hooks/useViewport'
import type { Fluid, SeriesFile, Well } from '../types'
import { hyperbolic, project } from '../utils/arps'
import { auto, monthAt, monthLabel, num, operatorName, title, volume, volumeUnit } from '../utils/format'
import type { Route } from '../App'

const PAGE = 250
const FORWARD = 60
const CONF_COLOR = { alta: C.lime, media: C.orange, baja: C.gas }

interface Column { key: string; label: string; value: (well: Well) => string | number | null; text?: (well: Well) => ReactNode; numeric?: boolean; mobile?: boolean }
const COLUMNS: Column[] = [
  { key: 'sigla', label: 'Sigla', value: w => w.sigla, mobile: true },
  { key: 'empresa', label: 'Empresa', value: w => operatorName(w.empresa) },
  { key: 'area', label: 'Bloque', value: w => title(w.area), mobile: true },
  { key: 'formacion', label: 'Formación', value: w => title(w.formacion) },
  { key: 'tipo', label: 'Tipo', value: w => w.tipo },
  { key: 'estado', label: 'Estado', value: w => (w.activo ? 'activo' : w.m0 ? 'parado' : 'sin producción'), text: w => <span style={{ color: w.activo ? C.lime : w.m0 ? C.orange : C.dim }}>{w.activo ? 'activo' : w.m0 ? 'parado' : 'sin producción'}</span> },
  { key: 'campana', label: 'Arranque', value: w => w.campana, text: w => (w.campana === null ? '—' : w.pre2006 ? '≤2006' : w.campana), numeric: true },
  { key: 'prof', label: 'Prof. (m)', value: w => w.profundidad, text: w => num(w.profundidad), numeric: true },
  { key: 'qg', label: 'Gas hoy', value: w => w.gas?.q ?? null, text: w => auto(w.gas?.q), numeric: true },
  { key: 'cg', label: 'Gas acum.', value: w => w.cum_gas ?? null, text: w => auto(w.cum_gas), numeric: true },
  { key: 'eg', label: 'EUR gas', value: w => w.gas?.eur ?? null, text: w => auto(w.gas?.eur), numeric: true, mobile: true },
  { key: 'qo', label: 'Petr. hoy', value: w => w.oil?.q ?? null, text: w => auto(w.oil?.q), numeric: true },
  { key: 'co', label: 'Petr. acum.', value: w => w.cum_oil ?? null, text: w => auto(w.cum_oil), numeric: true },
  { key: 'eo', label: 'EUR petr.', value: w => w.oil?.eur ?? null, text: w => auto(w.oil?.eur), numeric: true, mobile: true },
]

/** Historia real, curva ajustada y proyección con banda para un pozo. */
export function declineRows(well: Well, series: SeriesFile, fluid: Fluid) {
  const own = series.wells[well.id]
  const info = well[fluid]
  if (!own || !info) return null
  const rates = own[fluid]
  const rows: Array<{ m: string; real?: number; ajuste?: number; banda?: [number, number] }> = rates.map((value, i) => ({ m: monthAt(series.t0, own.m0 + i), real: value > 0 ? value : undefined }))
  if (info.ajuste_ok && info.qi !== null && info.di !== null && info.b !== null && info.t0 !== null) {
    for (let i = info.t0; i < rates.length; i++) rows[i].ajuste = hyperbolic(i - info.t0, info.qi, info.di, info.b)
    const positive = rates.filter(value => value > 0)
    const cum = (fluid === 'gas' ? well.cum_gas : well.cum_oil) ?? 0
    const tail = info.eur - cum
    if (well.activo && tail > 0 && positive.length) {
      const last = [...positive.slice(-3)].sort((a, b) => a - b)[Math.floor(Math.min(3, positive.length) / 2)]
      const low = (info.eur_lo - cum) / tail, high = (info.eur_hi - cum) / tail
      rows[rows.length - 1].banda = [last, last]
      project(last, rates.length - 1 - info.t0, FORWARD, info.di, info.b).forEach((value, k) => {
        rows.push({ m: monthAt(series.t0, own.m0 + rates.length + k), ajuste: value, banda: [value * low, value * high] })
      })
    }
  }
  return rows
}

function Declinacion({ well, series }: { well: Well; series: SeriesFile | null }) {
  const narrow = useNarrow()
  const [fluidChoice, setFluidChoice] = useState<Fluid | null>(null)
  const [scale, setScale] = useState<'lin' | 'log'>('lin')
  const fluid = fluidChoice ?? well.fluido ?? 'gas'
  const rows = useMemo(() => (series ? declineRows(well, series, fluid) : null), [well, series, fluid])
  const unit = fluid === 'gas' ? 'Mm³/d' : 'm³/d'
  const ticks = rows?.filter(row => row.m.endsWith('-01') && Number(row.m.slice(0, 4)) % (narrow ? 5 : 2) === 0).map(row => row.m)
  return (
    <Panel como="pozo-declinacion" title={<>Declinación — <span style={{ ...mono, textTransform: 'none', color: C.text2 }}>{well.sigla}</span> ({unit})</>}>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 10 }}>
        <Seg label="Fluido:" value={fluid} onChange={setFluidChoice} options={[{ value: 'gas', label: 'Gas' }, { value: 'oil', label: 'Petróleo' }]} />
        <Seg label="Eje Y:" value={scale} onChange={setScale} options={[{ value: 'lin', label: 'Lineal' }, { value: 'log', label: 'Log' }]} />
      </div>
      {!series ? <Loading what="las series de producción (una vez por sesión)" /> : !rows || !rows.some(row => row.real) ? (
        <Empty>Este pozo no registra producción de {FLUID_LABEL[fluid].toLowerCase()} desde 2006.</Empty>
      ) : (
        <ResponsiveContainer width="100%" height={narrow ? 280 : 380}>
          <ComposedChart data={rows} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
            <XAxis dataKey="m" ticks={ticks} tickFormatter={(month: string) => month.slice(0, 4)} tick={axisTick} />
            <YAxis tick={axisTick} width={46} scale={scale === 'log' ? 'log' : 'auto'} domain={scale === 'log' ? ['auto', 'auto'] : [0, 'auto']} allowDataOverflow tickFormatter={(value: number) => auto(value)} />
            <Tooltip contentStyle={tooltipStyle} labelFormatter={(month: string) => monthLabel(month)} formatter={(value: number | number[], name: string) => [Array.isArray(value) ? `${auto(value[0])} – ${auto(value[1])}` : auto(value), name]} />
            <Area dataKey="banda" name="banda bajo–alto" stroke="none" fill={C.orange} fillOpacity={0.2} isAnimationActive={false} connectNulls />
            <Scatter dataKey="real" name="real" fill={FLUID_COLOR[fluid]} isAnimationActive={false} shape={(props: { cx?: number; cy?: number }) => <circle cx={props.cx} cy={props.cy} r={1.8} fill={FLUID_COLOR[fluid]} />} />
            <Line dataKey="real" name="real" stroke={FLUID_COLOR[fluid]} strokeWidth={1} strokeOpacity={0.5} dot={false} isAnimationActive={false} legendType="none" tooltipType="none" />
            <Line dataKey="ajuste" name="ajuste Arps" stroke={C.orange} strokeDasharray="6 4" strokeWidth={1.8} dot={false} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      )}
      <p style={{ margin: '8px 0 0', fontSize: 11.5, color: C.dim }}>
        Promedio diario de cada mes. {well[fluid]?.ajuste_ok ? `El ajuste arranca en el pico y se proyecta ${FORWARD / 12} años.` : 'Sin ajuste aceptable para este fluido: hacen falta al menos 12 meses desde el pico y un R² de 0,30.'}
        {well.pre2006 && ' La fuente empieza en enero de 2006: este pozo ya producía, así que su arranque real no se ve.'}
      </p>
    </Panel>
  )
}

const Field = ({ label, children }: { label: string; children: ReactNode }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '4px 0', borderBottom: `1px solid ${C.border}55`, fontSize: 12.5 }}>
    <span style={{ color: C.muted }}>{label}</span><span style={{ ...mono, textAlign: 'right' }}>{children}</span>
  </div>
)

function Ficha({ well, go }: { well: Well; go: (route: Route) => void }) {
  const fluid = well.fluido ?? 'gas'
  const info = well[fluid]
  const span = info ? info.eur_hi || 1 : 1
  return (
    <Panel como="pozo-ficha" title="Ficha del pozo">
      <Field label="Empresa">{operatorName(well.empresa)}</Field>
      <Field label="Bloque"><button onClick={() => go({ tab: 'campo', id: well.area })} style={{ background: 'none', border: 0, padding: 0, color: '#60a5fa', ...mono }}>{title(well.area)} →</button></Field>
      <Field label="Yacimiento">{title(well.yacimiento) || '—'}</Field>
      <Field label="Formación">{title(well.formacion)}</Field>
      <Field label="Tipo"><Pill color={well.tipo === 'Gasífero' ? C.gas : well.tipo === 'Petrolífero' ? C.oil : C.muted}>{well.tipo || '—'}</Pill></Field>
      <Field label="Estado declarado">{well.estado || '—'}</Field>
      <Field label="Extracción">{well.extraccion || '—'}</Field>
      <Field label="Ubicación">{well.offshore === null ? '—' : well.offshore ? 'offshore' : 'onshore'} · {well.provincia}</Field>
      <Field label="Profundidad">{well.profundidad ? `${num(well.profundidad)} m` : '—'}</Field>
      <Field label="Primer mes">{well.m0 ? (well.pre2006 ? 'ene 06 o antes' : monthLabel(well.m0)) : 'no registra'}</Field>
      <Field label="Último mes con producción">{monthLabel(well.ult_produccion)}</Field>
      {well.m0 && <Field label="Acumulada gas / petróleo">{auto(well.cum_gas)} MMm³ / {auto(well.cum_oil)} Mm³</Field>}
      {info && (
        <>
          <Field label={`EUR ${FLUID_LABEL[fluid].toLowerCase()} (base)`}>{volume(fluid, info.eur)}</Field>
          <Field label="EUR bajo / alto">{auto(info.eur_lo)} / {auto(info.eur_hi)} {volumeUnit(fluid)}</Field>
          <div style={{ position: 'relative', height: 8, background: C.surfaceAlt, borderRadius: 4, margin: '8px 0' }} aria-hidden>
            <div style={{ position: 'absolute', left: `${(info.eur_lo / span) * 100}%`, right: 0, top: 0, bottom: 0, background: `${C.orange}66`, borderRadius: 4 }} />
            <div style={{ position: 'absolute', left: `calc(${(info.eur / span) * 100}% - 1px)`, top: -2, bottom: -2, width: 2, background: C.text }} />
          </div>
          <Field label="Método de la banda">{info.metodo}</Field>
          <Field label="Confianza EUR"><span style={{ color: CONF_COLOR[info.conf] }}>{info.conf}</span></Field>
          <Field label="Arps b">{info.b === null ? '—' : num(info.b, 2)}</Field>
          <Field label="Di (1/mes)">{info.di === null ? '—' : num(info.di, 4)}</Field>
          <Field label="R² del ajuste">{info.r2 === null ? '—' : num(info.r2, 2)}</Field>
        </>
      )}
    </Panel>
  )
}

export function Pozos({ id, go }: { id?: string; go: (route: Route) => void }) {
  const narrow = useNarrow()
  const wells = useWells()
  const series = useSeries()
  const top = useRef<HTMLDivElement>(null)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<'productores' | 'activos' | 'todos'>('productores')
  const [fluid, setFluid] = useState<'todos' | Fluid>('todos')
  const [formation, setFormation] = useState('')
  const [sort, setSort] = useState<{ key: string; desc: boolean }>({ key: 'eg', desc: true })

  const formations = useMemo(() => [...new Set((wells.data ?? []).map(well => well.formacion))].sort(), [wells.data])
  const filtered = useMemo(() => {
    const text = query.trim().toLowerCase()
    const column = COLUMNS.find(item => item.key === sort.key)!
    return (wells.data ?? [])
      .filter(well => (status === 'todos' || (status === 'activos' ? well.activo : well.m0)) && (fluid === 'todos' || well.fluido === fluid) && (!formation || well.formacion === formation))
      .filter(well => !text || `${well.sigla} ${well.empresa} ${well.area}`.toLowerCase().includes(text))
      .sort((a, b) => {
        const x = column.value(a), y = column.value(b)
        if (x === null || y === null) return x === y ? 0 : x === null ? 1 : -1  // los vacíos siempre al final
        const order = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y))
        return sort.desc ? -order : order
      })
  }, [wells.data, query, status, fluid, formation, sort])

  const selected = useMemo(() => (wells.data ?? []).find(well => well.id === id) ?? filtered[0] ?? null, [wells.data, id, filtered])
  useEffect(() => { if (id && narrow) top.current?.scrollIntoView({ behavior: 'smooth' }) }, [id, narrow])

  if (wells.error ?? series.error) return <ErrorMsg error={(wells.error ?? series.error)!} />
  if (!wells.data) return <Loading what="los pozos" />
  const columns = COLUMNS.filter(column => !narrow || column.mobile)

  return (
    <>
      <div ref={top} style={{ display: 'grid', gridTemplateColumns: narrow ? '1fr' : 'minmax(0, 1fr) 320px', gap: 16, scrollMarginTop: 50 }}>
        {selected ? <><Declinacion key={selected.id} well={selected} series={series.data} /><Ficha well={selected} go={go} /></> : <Panel><Empty>Ningún pozo coincide con los filtros.</Empty></Panel>}
      </div>

      <Panel como="pozo-tabla" title={`Pozos — ${num(Math.min(PAGE, filtered.length))} de ${num(filtered.length)}`}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginBottom: 12 }}>
          <input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="sigla / empresa / bloque" aria-label="Buscar pozo" style={{ ...inputStyle, flex: '1 1 180px', maxWidth: 280 }} />
          <Seg value={status} onChange={setStatus} options={[{ value: 'productores', label: 'Produjeron' }, { value: 'activos', label: 'Activos' }, { value: 'todos', label: 'Todos' }]} />
          <Seg value={fluid} onChange={setFluid} options={[{ value: 'todos', label: 'Gas y petróleo' }, { value: 'gas', label: 'Gas' }, { value: 'oil', label: 'Petróleo' }]} />
          <select value={formation} onChange={event => setFormation(event.target.value)} style={selectStyle} aria-label="Formación">
            <option value="">todas las formaciones</option>
            {formations.map(name => <option key={name} value={name}>{title(name)}</option>)}
          </select>
          <a href={`${import.meta.env.BASE_URL}data/wells.csv`} download style={{ marginLeft: 'auto', fontSize: 12.5 }}>⬇ Descargar CSV completo</a>
        </div>
        <div className="scroll-x">
          <table>
            <thead>
              <tr>
                {columns.map(column => (
                  <th key={column.key} style={{ ...th, cursor: 'pointer', textAlign: column.numeric ? 'right' : 'left' }} onClick={() => setSort(current => ({ key: column.key, desc: current.key === column.key ? !current.desc : !!column.numeric }))} aria-sort={sort.key === column.key ? (sort.desc ? 'descending' : 'ascending') : undefined}>
                    {column.label}{sort.key === column.key ? (sort.desc ? ' ↓' : ' ↑') : ''}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, PAGE).map(well => (
                <tr key={well.id} onClick={() => go({ tab: 'pozos', id: well.id })} style={{ cursor: 'pointer', background: well.id === selected?.id ? `${C.blue}22` : undefined }}>
                  {columns.map(column => (
                    <td key={column.key} style={{ ...td, ...(column.numeric || column.key === 'sigla' ? mono : {}), textAlign: column.numeric ? 'right' : 'left' }}>{column.text ? column.text(well) : column.value(well)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p style={{ margin: '10px 0 0', fontSize: 11.5, color: C.dim }}>Tasas en Mm³/d (gas) y m³/d (petróleo); acumuladas y EUR en MMm³ (gas) y Mm³ (petróleo). Se muestran las primeras {PAGE} filas; el CSV trae todos los pozos y columnas.</p>
      </Panel>
    </>
  )
}

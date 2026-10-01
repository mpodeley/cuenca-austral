import { useMemo, useState } from 'react'
import { Area, Bar, BarChart, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { BasinMap } from './BasinMap'
import type { Hover } from './BasinMap'
import { BlockTooltip, WellTooltip } from './Mapa'
import { Empty, ErrorMsg, Kpi, KpiGrid, Legend, Loading, Panel, Pill, Seg } from './ui'
import { C, CATEGORICAL, FLUID_COLOR, FLUID_LABEL, axisTick, mono, operatorColor, selectStyle, td, th, tooltipStyle } from '../theme'
import { useBlocks, useConcessions, useContext, useForecast, useSeries, useWells } from '../hooks/useData'
import { useNarrow } from '../hooks/useViewport'
import type { Block, BlockFluid, Fluid, Well } from '../types'
import { BASIN_VIEW, boundsOf, pad, polygonBounds } from '../utils/geo'
import { auto, monthAt, monthLabel, num, operatorName, pct, quantile, rate, rateUnit, title, volume, volumeUnit } from '../utils/format'
import { MIN_WELLS, computeTypeCurve } from '../utils/typeCurve'
import type { Route } from '../App'

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0)

function mergeFluid(blocks: Block[], fluid: Fluid): BlockFluid {
  const parts = blocks.map(block => block[fluid])
  const eur = sum(parts.map(part => part.eur)), cum = sum(parts.map(part => part.cum))
  return {
    q: sum(parts.map(part => part.q)), cum, eur, eur_lo: sum(parts.map(part => part.eur_lo)), eur_hi: sum(parts.map(part => part.eur_hi)),
    agotado: eur > 0 ? cum / eur : null, pico: 0, pico_mes: null,
  }
}

const yearTicks = (months: string[], every: number) => months.filter(month => month.endsWith('-01') && Number(month.slice(0, 4)) % every === 0)

export function Campos({ mode, id, go }: { mode: 'campo' | 'operadora'; id?: string; go: (route: Route) => void }) {
  const narrow = useNarrow()
  const blocks = useBlocks()
  const concessions = useConcessions()
  const context = useContext()
  const forecast = useForecast()
  const wells = useWells()
  const series = useSeries()
  const [fluidChoice, setFluidChoice] = useState<Fluid | null>(null)
  const [split, setSplit] = useState<'todos' | 'campana' | 'formacion'>('todos')

  const operators = useMemo(() => {
    const counts = new Map<string, number>()
    for (const block of blocks.data ?? []) counts.set(block.operador, (counts.get(block.operador) ?? 0) + block.n_pozos)
    return [...counts].sort((a, b) => b[1] - a[1])
  }, [blocks.data])

  const subject = useMemo(() => {
    if (!blocks.data) return null
    if (mode === 'operadora') {
      const name = id && operators.some(([operator]) => operator === id) ? id : operators[0]?.[0]
      return { name, members: blocks.data.filter(block => block.operador === name) }
    }
    const block = blocks.data.find(item => item.nombre === id) ?? [...blocks.data].sort((a, b) => b.gas.q - a.gas.q)[0]
    return { name: block.nombre, members: [block] }
  }, [blocks.data, mode, id, operators])

  const members = subject?.members ?? []
  const names = useMemo(() => new Set(members.map(block => block.nombre)), [members])
  const totals = useMemo(() => ({ gas: mergeFluid(members, 'gas'), oil: mergeFluid(members, 'oil') }), [members])
  const fluid: Fluid = fluidChoice ?? (totals.gas.cum >= totals.oil.cum ? 'gas' : 'oil')
  const color = FLUID_COLOR[fluid]
  const myWells = useMemo(() => (wells.data ?? []).filter(well => names.has(well.area)), [wells.data, names])

  const history = useMemo(() => {
    if (!forecast.data || !members.length) return null
    const data = forecast.data
    const fields = members.map(block => data.campos[block.nombre]).filter(Boolean)
    const hist = Array.from({ length: data.n }, (_, i) => sum(fields.map(field => (fluid === 'gas' ? field.hist_gas : field.hist_oil)[i])))
    const active = Array.from({ length: data.n }, (_, i) => sum(fields.map(field => field.activos[i])))
    const base = Array.from({ length: 60 }, (_, i) => sum(fields.map(field => (fluid === 'gas' ? field.base_gas : field.base_oil)[i])))
    const { unit, div } = rateUnit(fluid, Math.max(...hist))
    const rows: Array<{ m: string; hist?: number; base?: number; activos?: number }> = hist.map((value, i) => ({ m: monthAt(data.t0, i), hist: value / div, activos: active[i] }))
    rows[rows.length - 1].base = rows[rows.length - 1].hist
    base.forEach((value, i) => rows.push({ m: monthAt(data.t0, data.n + i), base: value / div }))
    const peak = hist.indexOf(Math.max(...hist))
    const byYear = new Map<string, number>()
    for (const field of fields) for (const [year, count] of Object.entries(field.pozos_anio)) byYear.set(year, (byYear.get(year) ?? 0) + count)
    const first = Number(data.t0.slice(0, 4)) + 1, last = Number(monthAt(data.t0, data.n - 1).slice(0, 4))
    const activity = Array.from({ length: last - first + 1 }, (_, i) => ({ anio: String(first + i), pozos: byYear.get(String(first + i)) ?? 0 }))
    const profile = fields.length === 1 ? fields[0].tipo[fluid] : null
    return { rows, unit, peak: { value: hist[peak], month: monthAt(data.t0, peak) }, activity, profile }
  }, [forecast.data, members, fluid])

  const typeCurve = useMemo(() => {
    if (!series.data || !myWells.length) return null
    const all = computeTypeCurve(myWells, series.data, fluid)
    if (!all) return null
    const groups: Array<{ label: string; curve: NonNullable<ReturnType<typeof computeTypeCurve>> }> = []
    if (split !== 'todos') {
      const key = (well: Well) => split === 'formacion' ? title(well.formacion) : well.campana === null ? '' : `${Math.floor((well.campana - 2007) / 5) * 5 + 2007}–${Math.floor((well.campana - 2007) / 5) * 5 + 2011}`
      for (const label of [...new Set(myWells.map(key))].filter(Boolean).sort()) {
        const curve = computeTypeCurve(myWells.filter(well => key(well) === label), series.data, fluid)
        if (curve) groups.push({ label: `${label} (${curve.n})`, curve })
      }
    }
    const rows = all.points.map(point => {
      const row: Record<string, number | number[]> = { t: point.t, banda: [point.p90, point.p10], p50: point.p50 }
      groups.slice(0, 6).forEach((group, index) => { const match = group.curve.points[point.t]; if (match) row[`g${index}`] = match.p50 })
      if (history?.profile?.origen === 'bloque') row.ajuste = history.profile.p50[point.t]
      return row
    })
    return { n: all.n, rows, groups: groups.slice(0, 6) }
  }, [series.data, myWells, fluid, split, history?.profile])

  const distribution = useMemo(() => {
    const eurs = myWells.filter(well => well.fluido === fluid && (well[fluid]?.eur ?? 0) > 0).map(well => well[fluid]!.eur).sort((a, b) => a - b)
    if (eurs.length < MIN_WELLS) return null
    const top = quantile(eurs, 0.95) || eurs[eurs.length - 1]
    const size = top / 12
    const bins = Array.from({ length: 12 }, (_, i) => ({ desde: i * size, label: auto(i * size), pozos: 0 }))
    for (const value of eurs) bins[Math.min(11, Math.floor(value / size))].pozos++
    const mark = (q: number) => bins[Math.min(11, Math.floor(quantile(eurs, q) / size))].label
    return { bins, n: eurs.length, p90: quantile(eurs, 0.1), p50: quantile(eurs, 0.5), p10: quantile(eurs, 0.9), marks: { p90: mark(0.1), p50: mark(0.5), p10: mark(0.9) } }
  }, [myWells, fluid])

  const home = useMemo(() => {
    const polygons = (concessions.data ?? []).filter(concession => names.has(concession.nombre)).flatMap(concession => concession.p)
    const bounds = polygons.length ? polygonBounds(polygons) : boundsOf(myWells.filter(well => well.lon !== null).map(well => [well.lon!, well.lat!]))
    return bounds ? pad(bounds, 0.15) : BASIN_VIEW
  }, [concessions.data, names, myWells])

  const error = blocks.error ?? forecast.error ?? concessions.error ?? context.error ?? wells.error ?? series.error
  if (error) return <ErrorMsg error={error} />
  if (!blocks.data || !subject || !forecast.data || !history) return <Loading />

  const single = mode === 'campo' ? members[0] : null
  const area = sum(members.map(block => block.area_km2 ?? 0))
  const nWells = sum(members.map(block => block.n_pozos)), nActive = sum(members.map(block => block.n_activos)), nProducers = sum(members.map(block => block.n_productores))
  const total = totals[fluid]
  const topWells = [...myWells].filter(well => well[fluid]).sort((a, b) => b[fluid]!.eur - a[fluid]!.eur).slice(0, 12)
  const months = history.rows.map(row => row.m)
  const wellColor = (well: Well) => (well.activo ? C.lime : well.m0 ? C.orange : '#475569')
  const tooltip = (hover: NonNullable<Hover>) => hover.kind === 'well' ? <WellTooltip well={hover.well} /> : <BlockTooltip concession={hover.concession} block={blocks.data!.find(block => block.nombre === hover.concession.nombre)} />

  return (
    <>
      <Panel>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h2 style={{ fontSize: narrow ? 20 : 24, color: C.text }}>{mode === 'operadora' ? operatorName(subject.name) : title(subject.name)}</h2>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
              {single ? (
                <>
                  <button onClick={() => go({ tab: 'operadora', id: single.operador })} style={{ background: 'none', border: 0, padding: 0 }}><Pill color={operatorColor(single.operador)}>{operatorName(single.operador)} →</Pill></button>
                  <Pill>{single.provincia}</Pill>
                  <Pill color={C.blue}>{single.n_offshore === 0 ? 'onshore' : single.n_offshore === single.n_pozos ? 'offshore' : `${single.n_offshore} pozos offshore`}</Pill>
                  <Pill color={single.n_activos ? C.lime : C.dim}>{single.etapa}</Pill>
                  {single.geometria === 'derivada' && <Pill color={C.orange}>sin polígono oficial</Pill>}
                </>
              ) : <Pill>{members.length} concesiones</Pill>}
            </div>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
            <Seg value={mode} onChange={value => go({ tab: value })} options={[{ value: 'campo', label: 'Campo' }, { value: 'operadora', label: 'Operadora' }]} />
            <Seg value={fluid} onChange={setFluidChoice} options={[{ value: 'gas', label: 'Gas' }, { value: 'oil', label: 'Petróleo' }]} />
            <select value={subject.name} onChange={event => go({ tab: mode, id: event.target.value })} style={selectStyle} aria-label={mode === 'campo' ? 'Elegir campo' : 'Elegir operadora'}>
              {mode === 'campo'
                ? [...blocks.data].sort((a, b) => a.nombre.localeCompare(b.nombre)).map(block => <option key={block.nombre} value={block.nombre}>{title(block.nombre)} ({block.n_pozos})</option>)
                : operators.map(([operator, count]) => <option key={operator} value={operator}>{operatorName(operator)} ({count})</option>)}
            </select>
          </div>
        </div>
      </Panel>

      <KpiGrid como="campo-indicadores">
        <Kpi label="Pozos" value={num(nWells)} sub={`${num(nProducers)} produjeron · ${num(nActive)} activos`} />
        <Kpi label={`${FLUID_LABEL[fluid]} hoy`} value={rate(fluid, total.q)} color={color} sub={`pico ${rate(fluid, history.peak.value)} en ${monthLabel(history.peak.month)}`} />
        <Kpi label={`${FLUID_LABEL[fluid]} acumulado`} value={volume(fluid, total.cum)} sub={`${pct(total.agotado)} del EUR · desde 2006`} />
        <Kpi label={`EUR ${FLUID_LABEL[fluid].toLowerCase()}`} value={volume(fluid, total.eur)} sub={`${auto(total.eur_lo)} – ${auto(total.eur_hi)} ${volumeUnit(fluid)}`} />
        <Kpi label="Superficie" value={area ? `${num(area)} km²` : '—'} sub={area ? `${num((nWells / area) * 100, 1)} pozos cada 100 km²` : 'sin polígono oficial'} />
        <Kpi label="Pozos nuevos (5 años)" value={num(sum(members.map(block => block.pozos_5a)))} sub={`${num(sum(members.map(block => block.ritmo)), 1)} por año`} />
      </KpiGrid>

      <div style={{ display: 'grid', gridTemplateColumns: narrow ? '1fr' : 'minmax(0, 5fr) minmax(0, 7fr)', gap: 16 }}>
        <Panel como="campo-mapa" title={mode === 'operadora' ? 'Mapa de la operadora' : 'Mapa del campo'}>
          {concessions.data && context.data ? (
            <BasinMap
              home={home} height={narrow ? 300 : 400} context={context.data} concessions={concessions.data} highlight={single?.nombre}
              blockFill={concession => (names.has(concession.nombre) ? C.blue + '33' : null)} wells={myWells} wellColor={wellColor}
              onWellClick={well => go({ tab: 'pozos', id: well.id })}
              onBlockClick={concession => concession.con_datos && !names.has(concession.nombre) && go({ tab: 'campo', id: concession.nombre })}
              tooltip={tooltip}
            />
          ) : <Loading what="el mapa" />}
          <div style={{ marginTop: 8 }}><Legend items={[{ color: C.lime, label: 'activo' }, { color: C.orange, label: 'produjo y hoy está parado' }, { color: '#475569', label: 'sin producción registrada' }]} /></div>
        </Panel>

        <Panel como="campo-historia" title={`Historia de ${FLUID_LABEL[fluid].toLowerCase()} (${history.unit})`} note="Promedio diario de cada mes. La línea punteada es la base declinante: lo que seguirían produciendo los pozos actuales sin perforar más.">
          <ResponsiveContainer width="100%" height={narrow ? 260 : 340}>
            <ComposedChart data={history.rows} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
              <XAxis dataKey="m" ticks={yearTicks(months, narrow ? 5 : 2)} tickFormatter={(month: string) => month.slice(0, 4)} tick={axisTick} />
              <YAxis yAxisId="q" tick={axisTick} width={46} tickFormatter={(value: number) => auto(value)} />
              <YAxis yAxisId="n" orientation="right" tick={axisTick} width={36} allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} labelFormatter={(month: string) => monthLabel(month)} formatter={(value: number, name: string) => [name === 'pozos activos' ? num(value) : `${auto(value)} ${history.unit}`, name]} />
              <Area yAxisId="q" dataKey="hist" name="historia" stroke={color} fill={color} fillOpacity={0.25} isAnimationActive={false} />
              <Line yAxisId="q" dataKey="base" name="base declinante" stroke={color} strokeDasharray="5 4" dot={false} isAnimationActive={false} />
              <Line yAxisId="n" dataKey="activos" name="pozos activos" stroke={C.muted} strokeWidth={1} dot={false} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
          {single && single.datos_hasta < forecast.sourceDate! && (
            <p style={{ margin: '8px 0 0', fontSize: 11.5, color: C.orange }}>La operadora declaró hasta {monthLabel(single.datos_hasta)}: los meses siguientes sostienen la última tasa de cada pozo.</p>
          )}
        </Panel>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: narrow ? '1fr' : 'repeat(2, minmax(0, 1fr))', gap: 16 }}>
        <Panel como="campo-actividad" title="Actividad por campaña" note="Pozos que entraron en producción cada año. La fuente empieza en enero de 2006: los pozos anteriores no tienen fecha de arranque y no se cuentan acá.">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={history.activity} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
              <XAxis dataKey="anio" tick={axisTick} interval={narrow ? 3 : 1} tickFormatter={(year: string) => `'${year.slice(2)}`} />
              <YAxis tick={axisTick} width={30} allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: '#ffffff10' }} />
              <Bar dataKey="pozos" name="pozos nuevos" fill={C.blue} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>

        <Panel
          como="campo-tipo"
          title={`Pozo tipo — en vivo (${FLUID_LABEL[fluid].toLowerCase()}, ${fluid === 'gas' ? 'Mm³/d' : 'm³/d'})`}
          note={typeCurve ? `${typeCurve.n} pozos de ${FLUID_LABEL[fluid].toLowerCase()} con arranque posterior a 2006, alineados por mes en producción. Banda P90–P10 y mediana.` : undefined}
        >
          {!series.data ? <Loading what="las series de producción (una vez por sesión)" /> : !typeCurve ? (
            <Empty>Hacen falta al menos {MIN_WELLS} pozos de {FLUID_LABEL[fluid].toLowerCase()} con arranque observado para armar un pozo tipo propio. {history.profile ? `El pronóstico usa el pozo tipo de ${history.profile.origen} (${history.profile.n} pozos).` : ''}</Empty>
          ) : (
            <>
              <div style={{ marginBottom: 8 }}>
                <Seg value={split} onChange={setSplit} options={[{ value: 'todos', label: 'Todos' }, { value: 'campana', label: 'por campaña' }, { value: 'formacion', label: 'por formación' }]} />
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <ComposedChart data={typeCurve.rows} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                  <XAxis dataKey="t" tick={axisTick} type="number" domain={[0, 'dataMax']} tickCount={8} />
                  <YAxis tick={axisTick} width={46} tickFormatter={(value: number) => auto(value)} />
                  <Tooltip contentStyle={tooltipStyle} labelFormatter={(t: number) => `mes ${t}`} formatter={(value: number | number[], name: string) => [Array.isArray(value) ? `${auto(value[0])} – ${auto(value[1])}` : auto(value), name]} />
                  <Area dataKey="banda" name="P90–P10" stroke="none" fill={color} fillOpacity={0.18} isAnimationActive={false} />
                  <Line dataKey="p50" name="P50" stroke={color} strokeWidth={2} dot={false} isAnimationActive={false} />
                  {typeCurve.rows[0].ajuste !== undefined && <Line dataKey="ajuste" name="ajuste Arps (pronóstico)" stroke={C.orange} strokeDasharray="5 4" dot={false} isAnimationActive={false} />}
                  {typeCurve.groups.map((group, index) => <Line key={group.label} dataKey={`g${index}`} name={group.label} stroke={CATEGORICAL[index]} dot={false} isAnimationActive={false} />)}
                </ComposedChart>
              </ResponsiveContainer>
              {split !== 'todos' && (typeCurve.groups.length
                ? <Legend items={typeCurve.groups.map((group, index) => ({ color: CATEGORICAL[index], label: group.label }))} />
                : <Empty>Ningún grupo llega a {MIN_WELLS} pozos.</Empty>)}
            </>
          )}
        </Panel>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: narrow ? '1fr' : 'minmax(0, 5fr) minmax(0, 7fr)', gap: 16 }}>
        <Panel como="campo-eur" title={`Distribución de EUR por pozo (${volumeUnit(fluid)})`}>
          {!distribution ? <Empty>Hacen falta al menos {MIN_WELLS} pozos de {FLUID_LABEL[fluid].toLowerCase()} con EUR para mostrar la distribución.</Empty> : (
            <>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={distribution.bins} margin={{ top: 14, right: 0, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
                  <XAxis dataKey="label" tick={axisTick} interval={narrow ? 2 : 1} />
                  <YAxis tick={axisTick} width={30} allowDecimals={false} />
                  <Tooltip contentStyle={tooltipStyle} cursor={{ fill: '#ffffff10' }} labelFormatter={(label: string) => `desde ${label} ${volumeUnit(fluid)}`} />
                  <Bar dataKey="pozos" fill={color} fillOpacity={0.7} isAnimationActive={false} />
                  {(['p90', 'p50', 'p10'] as const).map(key => <ReferenceLine key={key} x={distribution.marks[key]} stroke={C.text2} strokeDasharray="4 3" label={{ value: key.toUpperCase(), fill: C.muted, fontSize: 10, position: 'top' }} />)}
                </BarChart>
              </ResponsiveContainer>
              <p style={{ margin: '8px 0 0', fontSize: 11.5, color: C.dim }}>
                {distribution.n} pozos · P90 {auto(distribution.p90)} · P50 {auto(distribution.p50)} · P10 {auto(distribution.p10)} {volumeUnit(fluid)}. El último tramo agrupa todo lo que supera el percentil 95.
              </p>
            </>
          )}
        </Panel>

        {mode === 'operadora' ? (
          <Panel como="campo-tabla" title={`Campos de ${operatorName(subject.name)} — click para abrir la ficha`}>
            <div className="scroll-x">
              <table>
                <thead><tr>{['Campo', 'Pozos', 'Activos', `${FLUID_LABEL[fluid]} hoy`, 'Acumulado', 'EUR', '% agotado', 'Etapa'].map(label => <th key={label} style={th}>{label}</th>)}</tr></thead>
                <tbody>
                  {[...members].sort((a, b) => b[fluid].q - a[fluid].q).map(block => (
                    <tr key={block.nombre} onClick={() => go({ tab: 'campo', id: block.nombre })} style={{ cursor: 'pointer' }}>
                      <td style={td}>{title(block.nombre)}</td>
                      <td style={{ ...td, ...mono }}>{num(block.n_pozos)}</td><td style={{ ...td, ...mono }}>{num(block.n_activos)}</td>
                      <td style={{ ...td, ...mono }}>{rate(fluid, block[fluid].q)}</td><td style={{ ...td, ...mono }}>{auto(block[fluid].cum)}</td>
                      <td style={{ ...td, ...mono }}>{auto(block[fluid].eur)}</td><td style={{ ...td, ...mono }}>{pct(block[fluid].agotado)}</td>
                      <td style={td}>{block.etapa}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        ) : (
          <Panel como="campo-tabla" title={`Pozos con mayor EUR de ${FLUID_LABEL[fluid].toLowerCase()} — click para ver la declinación`} note={`Hoy en ${fluid === 'gas' ? 'Mm³/d' : 'm³/d'}; acumulado y EUR en ${volumeUnit(fluid)}.`}>
            {!wells.data ? <Loading what="los pozos" /> : (
              <div className="scroll-x">
                <table>
                  <thead><tr>{['Sigla', 'Formación', 'Arranque', 'Estado', 'Hoy', 'Acumulado', 'EUR', 'Confianza'].map(label => <th key={label} style={th}>{label}</th>)}</tr></thead>
                  <tbody>
                    {topWells.map(well => (
                      <tr key={well.id} onClick={() => go({ tab: 'pozos', id: well.id })} style={{ cursor: 'pointer' }}>
                        <td style={{ ...td, ...mono }}>{well.sigla}</td><td style={td}>{title(well.formacion)}</td>
                        <td style={{ ...td, ...mono }}>{well.pre2006 ? '≤2006' : well.campana}</td>
                        <td style={td}><span style={{ color: well.activo ? C.lime : C.orange }}>{well.activo ? 'activo' : 'parado'}</span></td>
                        <td style={{ ...td, ...mono }}>{auto(well[fluid]!.q)}</td>
                        <td style={{ ...td, ...mono }}>{auto(fluid === 'gas' ? well.cum_gas : well.cum_oil)}</td>
                        <td style={{ ...td, ...mono }}>{auto(well[fluid]!.eur)}</td><td style={td}>{well[fluid]!.conf}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        )}
      </div>
    </>
  )
}

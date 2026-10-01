import { useMemo, useState } from 'react'
import { Area, Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Collapse, ErrorMsg, Kpi, KpiGrid, Legend, Loading, Panel, Pill, Seg, Slider } from './ui'
import { C, FLUID_COLOR, FLUID_LABEL, axisTick, inputStyle, mono, selectStyle, td, th, tooltipStyle } from '../theme'
import { useBlocks, useForecast } from '../hooks/useData'
import { useNarrow } from '../hooks/useViewport'
import type { Fluid } from '../types'
import { PRESETS, runForecast, yearAverage } from '../utils/forecast'
import type { Case, FieldEdit, Scenario } from '../utils/forecast'
import { auto, monthAt, monthLabel, num, operatorName, rate, rateUnit, title, volume } from '../utils/format'
import type { Route } from '../App'

type PresetKey = keyof typeof PRESETS
const PRESET_KEYS: PresetKey[] = ['ajuste', 'base', 'aceleracion']
const CASE_LABEL: Record<Case, string> = { bajo: 'P90 (bajo)', central: 'P50 (central)', alto: 'P10 (alto)' }
const scenarioOf = (key: PresetKey): Scenario => { const { titulo: _t, relato: _r, ...scenario } = PRESETS[key]; return scenario }
const sumRange = (values: number[], from: number, to: number) => values.slice(from, to).reduce((total, value) => total + value, 0)

function downloadCsv(name: string, header: string[], rows: Array<Array<string | number>>) {
  const text = [header, ...rows].map(row => row.join(',')).join('\n')
  const link = document.createElement('a')
  link.href = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }))
  link.download = name
  link.click()
  URL.revokeObjectURL(link.href)
}

export function Pronostico({ go }: { go: (route: Route) => void }) {
  const narrow = useNarrow()
  const forecast = useForecast()
  const blocks = useBlocks()
  const [fluid, setFluid] = useState<Fluid>('gas')
  const [preset, setPreset] = useState<PresetKey>('base')
  const [scenario, setScenario] = useState<Scenario>(() => scenarioOf('base'))
  const [edits, setEdits] = useState<Record<string, FieldEdit>>({})
  const [view, setView] = useState('')

  const choose = (key: PresetKey) => { setPreset(key); setScenario(scenarioOf(key)) }
  const set = (patch: Partial<Scenario>) => setScenario(current => ({ ...current, ...patch }))
  const base = scenarioOf(preset)
  const edited = JSON.stringify(scenario) !== JSON.stringify(base) || Object.keys(edits).length > 0

  const model = useMemo(() => {
    if (!forecast.data) return null
    const data = forecast.data
    const only = view ? [view] : undefined
    const current = runForecast(data, fluid, scenario, edits, only)
    const others = PRESET_KEYS.map(key => ({ key, result: runForecast(data, fluid, scenarioOf(key), edits, only) }))
    const total = current.base.map((value, i) => value + current.nuevos[i])
    const { unit, div } = rateUnit(fluid, Math.max(...current.hist, ...total))
    const rows: Array<Record<string, number | string | undefined>> = current.hist.map((value, i) => ({ m: monthAt(data.t0, i), hist: value / div }))
    const last = rows[rows.length - 1]
    last.base = last.hist; last.nuevos = 0
    for (const other of others) last[other.key] = last.hist
    total.forEach((_, i) => {
      const row: Record<string, number | string | undefined> = { m: monthAt(data.t0, data.n + i), base: current.base[i] / div, nuevos: current.nuevos[i] / div }
      for (const other of others) row[other.key] = (other.result.base[i] + other.result.nuevos[i]) / div
      rows.push(row)
    })
    const firstYear = Number(monthAt(data.t0, data.n).slice(0, 4))
    const histYears = Object.entries(view ? data.campos[view].pozos_anio : data.cuenca.pozos_anio).filter(([year]) => Number(year) > 2006 && Number(year) < firstYear)
    const activity: Array<{ anio: string; historico?: number; plan?: number }> = histYears.map(([anio, count]) => ({ anio, historico: count }))
    for (let year = 0; year < 15; year++) activity.push({ anio: String(firstYear + 1 + year), plan: Math.round(sumRange(current.pozos, year * 12, year * 12 + 12) * 10) / 10 })
    const now = sumRange(current.hist, data.n - 3, data.n) / 3
    const plus5 = (result: typeof current) => yearAverage(result.base, 5) + yearAverage(result.nuevos, 5)
    const range = others.map(other => plus5(other.result))
    return {
      current, rows, unit, div, activity, now, base5: yearAverage(current.base, 5), total5: plus5(current),
      range: [Math.min(...range), Math.max(...range)], wells5: sumRange(current.pozos, 0, 60),
      cum20: sumRange(total, 0, 240) * 30.4375 / 1000,
    }
  }, [forecast.data, fluid, scenario, edits, view])

  const table = useMemo(() => {
    if (!forecast.data || !blocks.data || !model) return []
    const all = runForecast(forecast.data, fluid, scenario, edits)
    return blocks.data
      .filter(block => block.n_activos > 0 || block.ritmo > 0)
      .map(block => {
        const field = forecast.data!.campos[block.nombre], result = all.campos[block.nombre]
        return {
          block, field, result, drills: field.fluido === fluid && !!field.tipo[fluid],
          now: block[fluid].q, plus5: yearAverage(result.base, 5) + yearAverage(result.nuevos, 5), wells5: sumRange(result.pozos, 0, 60),
        }
      })
      .sort((a, b) => b.now - a.now)
  }, [forecast.data, blocks.data, model, fluid, scenario, edits])

  if (forecast.error ?? blocks.error) return <ErrorMsg error={(forecast.error ?? blocks.error)!} />
  if (!forecast.data || !blocks.data || !model) return <Loading />

  const color = FLUID_COLOR[fluid]
  const months = model.rows.map(row => row.m as string)
  const ticks = months.filter(month => month.endsWith('-01') && Number(month.slice(0, 4)) % (narrow ? 10 : 5) === 0)
  const edit = (name: string, patch: FieldEdit) => setEdits(current => {
    const next = { ...current[name], ...patch }
    for (const key of Object.keys(next) as Array<keyof FieldEdit>) if (next[key] === undefined || Number.isNaN(next[key])) delete next[key]
    const rest = { ...current }
    if (Object.keys(next).length) rest[name] = next; else delete rest[name]
    return rest
  })
  const exportCsv = () => downloadCsv(
    `pronostico-${fluid}-${view ? view.toLowerCase().replace(/[^a-z0-9]+/g, '-') : 'cuenca'}.csv`,
    ['mes', `historia_${model.unit}`, `base_${model.unit}`, `pozos_nuevos_${model.unit}`, `total_${model.unit}`],
    model.rows.map(row => [row.m as string, row.hist ?? '', row.base ?? '', row.nuevos ?? '', row.hist ?? Number(row.base ?? 0) + Number(row.nuevos ?? 0)].map(value => (typeof value === 'number' ? value.toFixed(3) : value))),
  )

  return (
    <>
      <Panel title="Escenario">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
          <Seg value={fluid} onChange={setFluid} options={[{ value: 'gas', label: 'Gas' }, { value: 'oil', label: 'Petróleo' }]} />
          <Seg value={preset} onChange={choose} options={PRESET_KEYS.map(key => ({ value: key, label: PRESETS[key].titulo }))} />
          {edited && <><Pill color={C.orange}>editado</Pill><button onClick={() => { choose(preset); setEdits({}) }} style={{ background: 'none', border: 0, color: '#60a5fa', fontSize: 12 }}>volver al preset</button></>}
        </div>
        <p style={{ margin: '12px 0 8px', fontSize: 13, color: C.text2, lineHeight: 1.5 }}>{PRESETS[preset].relato}</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', fontSize: 11.5, color: C.muted }}>
          asume:
          <Pill>×{num(scenario.actividad, 2)} del ritmo histórico</Pill>
          <Pill>{scenario.crecimiento ? `actividad +${num(scenario.crecimiento)} %/año (tope ×${num(scenario.tope, 1)})` : 'actividad constante'}</Pill>
          <Pill>pozo tipo {CASE_LABEL[scenario.caso]}</Pill>
          <Pill>{num(scenario.aniosInventario)} años de inventario</Pill>
          <Pill>sin límites de evacuación</Pill>
        </div>
      </Panel>

      <KpiGrid>
        <Kpi label="Producción actual" value={rate(fluid, model.now)} color={color} sub="promedio de los últimos 3 meses" />
        <Kpi label="Base sin perforar +5a" value={rate(fluid, model.base5)} sub={`${num((model.base5 / model.now - 1) * 100)} % vs hoy`} />
        <Kpi label={`${PRESETS[preset].titulo} +5a`} value={rate(fluid, model.total5)} color={C.blue} sub={`${num((model.total5 / model.now - 1) * 100)} % vs hoy`} />
        <Kpi label="Rango +5a (escenarios)" value={`${auto(model.range[0] / model.div)} – ${auto(model.range[1] / model.div)}`} sub={model.unit} />
        <Kpi label="Pozos nuevos en 5 años" value={num(model.wells5)} sub={`${volume(fluid, model.cum20)} en 20 años`} />
      </KpiGrid>

      <Panel title={`${view ? title(view) : 'Cuenca'} — escenario ${PRESETS[preset].titulo} (${model.unit})`}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginBottom: 10 }}>
          <label style={{ fontSize: 12, color: C.muted }}>Ver campo:{' '}
            <select value={view} onChange={event => setView(event.target.value)} style={selectStyle}>
              <option value="">CUENCA (total)</option>
              {table.map(row => <option key={row.block.nombre} value={row.block.nombre}>{title(row.block.nombre)}</option>)}
            </select>
          </label>
          <button onClick={exportCsv} style={{ ...inputStyle, marginLeft: 'auto', fontSize: 12.5 }}>⬇ Descargar escenario (CSV)</button>
        </div>
        <ResponsiveContainer width="100%" height={narrow ? 300 : 400}>
          <ComposedChart data={model.rows} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
            <XAxis dataKey="m" ticks={ticks} tickFormatter={(month: string) => month.slice(0, 4)} tick={axisTick} />
            <YAxis tick={axisTick} width={46} tickFormatter={(value: number) => auto(value)} />
            <Tooltip contentStyle={tooltipStyle} labelFormatter={(month: string) => monthLabel(month)} formatter={(value: number, name: string) => [`${auto(value)} ${model.unit}`, name]} />
            <Area dataKey="hist" name="histórico" stroke={C.gray} fill={C.gray} fillOpacity={0.35} isAnimationActive={false} />
            <Area dataKey="base" name="base (pozos actuales)" stackId="a" stroke={color} fill={color} fillOpacity={0.35} isAnimationActive={false} />
            <Area dataKey="nuevos" name="pozos nuevos" stackId="a" stroke={C.blue} fill={C.blue} fillOpacity={0.35} isAnimationActive={false} />
            {PRESET_KEYS.filter(key => key !== preset || edited).map(key => <Line key={key} dataKey={key} name={`preset ${PRESETS[key].titulo}`} stroke={C.muted} strokeDasharray="4 4" strokeWidth={1} dot={false} isAnimationActive={false} />)}
          </ComposedChart>
        </ResponsiveContainer>
        <div style={{ marginTop: 8 }}><Legend items={[{ color: C.gray, label: 'histórico' }, { color, label: 'base: pozos actuales en declinación' }, { color: C.blue, label: 'pozos nuevos' }, { color: C.muted, label: 'otros presets (línea punteada)' }]} /></div>
      </Panel>

      <Collapse title="Ajustar los supuestos" open>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px 24px', alignItems: 'end' }}>
          <Slider label="Actividad de perforación" value={scenario.actividad} min={0} max={3} step={0.05} preset={base.actividad} onChange={value => set({ actividad: value })} format={value => `×${num(value, 2)} del ritmo histórico`} />
          <Slider label="Crecimiento de la actividad" value={scenario.crecimiento} min={0} max={50} step={1} preset={base.crecimiento} onChange={value => set({ crecimiento: value, tope: Math.max(scenario.tope, value ? 1.5 : 1) })} format={value => `${num(value)} %/año`} />
          <Slider label="Techo del crecimiento" value={scenario.tope} min={1} max={5} step={0.1} preset={base.tope} onChange={value => set({ tope: value })} format={value => `×${num(value, 1)}`} />
          <Slider label="Inventario por campo" value={scenario.aniosInventario} min={1} max={30} step={1} preset={base.aniosInventario} onChange={value => set({ aniosInventario: value })} format={value => `${num(value)} años al ritmo histórico`} />
          <Seg label="Pozo tipo:" value={scenario.caso} onChange={value => set({ caso: value })} options={(['bajo', 'central', 'alto'] as Case[]).map(value => ({ value, label: CASE_LABEL[value] }))} />
        </div>
        <p style={{ margin: '12px 0 0', fontSize: 11.5, color: C.dim, lineHeight: 1.5 }}>
          Doble click sobre un control lo devuelve al valor del preset. El ritmo histórico de cada campo es el promedio de pozos puestos en producción por año en los últimos cinco años calendario.
          No se modelan restricciones de transporte ni de plantas: no hay datos públicos curados de evacuación para la Cuenca Austral.
        </p>
      </Collapse>

      <Panel title="Actividad de perforación — histórico + plan" note="Pozos que entran en producción por año. El plan es un valor esperado: puede no ser entero.">
        <ResponsiveContainer width="100%" height={220}>
          <ComposedChart data={model.activity} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
            <XAxis dataKey="anio" tick={axisTick} interval={narrow ? 4 : 1} tickFormatter={(year: string) => `'${year.slice(2)}`} />
            <YAxis tick={axisTick} width={32} />
            <Tooltip contentStyle={tooltipStyle} cursor={{ fill: '#ffffff10' }} />
            <Bar dataKey="historico" name="histórico" stackId="a" fill={C.gray} isAnimationActive={false} />
            <Bar dataKey="plan" name="plan del escenario" stackId="a" fill={C.blue} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </Panel>

      <Panel title="Programa campo por campo (editable)" note={`Sólo perforan los campos cuyo fluido principal es ${FLUID_LABEL[fluid].toLowerCase()} y que tienen pozo tipo. Editá el ritmo o el inventario de un campo para pisar el supuesto general.`}>
        <div className="scroll-x">
          <table>
            <thead>
              <tr>{['Campo', 'Operadora', 'Activos', 'Hoy', 'Pozos/año', 'Inventario', 'Pozo tipo', 'EUR tipo', '+5 años', 'Nuevos 5a'].map((label, index) => <th key={label} style={{ ...th, textAlign: index > 1 ? 'right' : 'left' }}>{label}</th>)}</tr>
            </thead>
            <tbody>
              {table.map(({ block, field, result, drills, now, plus5, wells5 }) => {
                const profile = field.tipo[fluid]
                const number = { ...inputStyle, ...mono, width: 70, padding: '3px 6px', textAlign: 'right' as const }
                return (
                  <tr key={block.nombre} style={{ background: view === block.nombre ? `${C.blue}22` : undefined }}>
                    <td style={td}><button onClick={() => setView(view === block.nombre ? '' : block.nombre)} style={{ background: 'none', border: 0, padding: 0, color: C.text2 }}>{title(block.nombre)}</button>{' '}
                      <button onClick={() => go({ tab: 'campo', id: block.nombre })} aria-label={`Abrir la ficha de ${title(block.nombre)}`} style={{ background: 'none', border: 0, padding: 0, color: '#60a5fa' }}>→</button></td>
                    <td style={td}>{operatorName(block.operador)}</td>
                    <td style={{ ...td, ...mono, textAlign: 'right' }}>{num(block.n_activos)}</td>
                    <td style={{ ...td, ...mono, textAlign: 'right' }}>{rate(fluid, now)}</td>
                    <td style={{ ...td, textAlign: 'right' }}>{drills ? <input type="number" min={0} step={0.5} value={edits[block.nombre]?.ritmo ?? field.ritmo} onChange={event => edit(block.nombre, { ritmo: event.target.value === '' ? undefined : Number(event.target.value) })} style={number} aria-label={`Pozos por año en ${title(block.nombre)}`} /> : <span style={{ color: C.dim }}>—</span>}</td>
                    <td style={{ ...td, textAlign: 'right' }}>{drills ? <input type="number" min={0} step={1} value={result.inventario} onChange={event => edit(block.nombre, { inventario: event.target.value === '' ? undefined : Number(event.target.value) })} style={number} aria-label={`Inventario de pozos en ${title(block.nombre)}`} /> : <span style={{ color: C.dim }}>—</span>}</td>
                    <td style={{ ...td, textAlign: 'right', color: C.muted }}>{profile ? `${profile.origen} (${profile.n})` : '—'}</td>
                    <td style={{ ...td, ...mono, textAlign: 'right' }}>{profile ? auto(profile.eur) : '—'}</td>
                    <td style={{ ...td, ...mono, textAlign: 'right' }}>{rate(fluid, plus5)}</td>
                    <td style={{ ...td, ...mono, textAlign: 'right' }}>{num(wells5, 1)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  )
}

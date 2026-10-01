import { useMemo, useState } from 'react'
import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis } from 'recharts'
import { repoUrl } from './registro'
import { ErrorMsg, Loading, Panel, Seg, Slider } from '../components/ui'
import { declineRows } from '../components/Pozos'
import { C, FLUID_COLOR, axisTick, mono, selectStyle, tooltipStyle } from '../theme'
import { useBlocks, useForecast, useSeries, useWells } from '../hooks/useData'
import { useNarrow } from '../hooks/useViewport'
import type { Well } from '../types'
import { hyperbolic } from '../utils/arps'
import { PRESETS, fieldForecast } from '../utils/forecast'
import { auto, monthAt, monthLabel, num, operatorName, pct, title, volume, volumeUnit } from '../utils/format'
import type { Route } from '../App'

const DAYS = (month: string) => new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate()
const Code = ({ archivo, simbolo }: { archivo: string; simbolo: string }) => <a href={repoUrl({ archivo, simbolo })} target="_blank" rel="noreferrer" style={{ ...mono, fontSize: 12 }}>{archivo} · {simbolo} ↗</a>

/** Pozos de ejemplo: los de mejor ajuste entre los activos con arranque observado. */
function useEjemplos(wells: Well[] | null) {
  return useMemo(() => (wells ?? [])
    .filter(well => well.activo && !well.pre2006 && well.fluido && well[well.fluido]?.ajuste_ok && (well[well.fluido]!.r2 ?? 0) > 0.75)
    .sort((a, b) => b[b.fluido!]!.eur - a[a.fluido!]!.eur).slice(0, 40), [wells])
}

function Stepper({ step, setStep, labels }: { step: number; setStep: (step: number) => void; labels: string[] }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
      {labels.map((label, index) => (
        <button key={label} onClick={() => setStep(index)} aria-current={index === step ? 'step' : undefined}
          style={{ border: `1px solid ${index === step ? C.blue : C.border}`, background: index === step ? C.blue : index < step ? `${C.blue}22` : C.surfaceAlt, color: index === step ? '#fff' : C.text2, borderRadius: 999, padding: '4px 12px', fontSize: 12 }}
        >{index + 1}. {label}</button>
      ))}
      <button onClick={() => setStep(Math.min(labels.length - 1, step + 1))} disabled={step === labels.length - 1} style={{ marginLeft: 'auto', border: 0, background: 'none', color: step === labels.length - 1 ? C.dim : '#60a5fa', fontSize: 12.5 }}>siguiente →</button>
    </div>
  )
}

const PASOS = ['La fuente', 'La serie', 'El pico', 'El ajuste', 'El EUR', 'El bloque']

export function Recorrido({ go }: { go: (route: Route) => void }) {
  const narrow = useNarrow()
  const wells = useWells()
  const series = useSeries()
  const blocks = useBlocks()
  const ejemplos = useEjemplos(wells.data)
  const [id, setId] = useState('')
  const [step, setStep] = useState(0)
  const well = ejemplos.find(item => item.id === id) ?? ejemplos[0]
  const rows = useMemo(() => (well && series.data ? declineRows(well, series.data, well.fluido!) : null), [well, series.data])

  if (wells.error ?? series.error ?? blocks.error) return <ErrorMsg error={(wells.error ?? series.error ?? blocks.error)!} />
  if (!well || !series.data || !rows || !blocks.data) return <Loading what="un pozo de ejemplo" />

  const fluid = well.fluido!
  const info = well[fluid]!
  const own = series.data.wells[well.id]
  const rates = own[fluid]
  const unit = fluid === 'gas' ? 'Mm³/d' : 'm³/d'
  const volUnit = fluid === 'gas' ? 'Mm³' : 'm³'
  const last = rates.length - 1
  const lastMonth = monthAt(series.data.t0, own.m0 + last)
  const peakMonth = monthAt(series.data.t0, own.m0 + (info.t0 ?? 0))
  const cum = (fluid === 'gas' ? well.cum_gas : well.cum_oil) ?? 0
  const block = blocks.data.find(item => item.nombre === well.area)
  const shown = rows.map(row => ({ m: row.m, real: row.real, ajuste: step >= 3 ? row.ajuste : undefined, banda: step >= 4 ? row.banda : undefined })).filter(row => step >= 4 || row.real !== undefined || row.ajuste !== undefined)
  const ticks = shown.filter(row => row.m.endsWith('-01') && Number(row.m.slice(0, 4)) % (narrow ? 4 : 2) === 0).map(row => row.m)

  const texto = [
    <>La Secretaría de Energía publica una fila por pozo, mes y formación. Para <strong style={mono}>{well.sigla}</strong> en {monthLabel(lastMonth)} las filas suman <strong>{num(rates[last] * DAYS(lastMonth))} {volUnit}</strong> de {fluid === 'gas' ? 'gas' : 'petróleo'}. El script lee el CSV del año entero (unos 300 MB) y se queda sólo con la Cuenca Austral. <Code archivo="pipeline/fetch_capiv.py" simbolo="stream_year" /></>,
    <>Ese volumen se divide por los {DAYS(lastMonth)} días del mes: <strong>{auto(rates[last])} {unit}</strong>. Repetido para cada mes, da una serie de {rates.length} puntos desde {monthLabel(well.m0)}. <Code archivo="pipeline/build_data.py" simbolo="build_wells" /></>,
    <>El pico es el máximo de la media móvil de tres meses: <strong>{auto(info.pico)} {unit}</strong> en {monthLabel(peakMonth)}. El ajuste arranca ahí, porque antes el pozo todavía estaba subiendo. <Code archivo="pipeline/arps.py" simbolo="fit" /></>,
    <>Se busca la curva de Arps que mejor pasa por los puntos: producción inicial <strong>{auto(info.qi)}</strong>, declinación <strong>{num((info.di ?? 0) * 100, 1)} % por mes</strong> y forma <strong>b = {num(info.b, 2)}</strong>. El R² de {num(info.r2, 2)} dice qué tan bien describe la historia (1 sería perfecto). <Code archivo="pipeline/arps.py" simbolo="hyperbolic" /></>,
    <>Ya produjo <strong>{volume(fluid, cum)}</strong>. La curva, anclada en la última tasa real, agrega <strong>{auto(info.eur - cum)} {volumeUnit(fluid)}</strong> más hasta el límite económico. EUR = <strong>{volume(fluid, info.eur)}</strong>, con una banda de {auto(info.eur_lo)} a {auto(info.eur_hi)} y confianza {info.conf}. <Code archivo="pipeline/arps.py" simbolo="eur" /></>,
    <>El pozo declara el área <strong>{title(well.area)}</strong>, de {operatorName(well.empresa)}. {block ? <>Su EUR es el <strong>{pct(info.eur / (block[fluid].eur || 1), 1)}</strong> del EUR de {fluid === 'gas' ? 'gas' : 'petróleo'} del bloque, que suma {num(block.n_productores)} pozos.</> : null} <Code archivo="pipeline/build_data.py" simbolo="build_blocks" /></>,
  ]

  return (
    <Panel title="Un dato, de punta a punta" note="Seguí un pozo real desde el archivo oficial hasta la ficha. Los números son los de la app, no un ejemplo inventado.">
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginBottom: 12 }}>
        <label style={{ fontSize: 12.5, color: C.muted }}>Pozo:{' '}
          <select value={well.id} onChange={event => setId(event.target.value)} style={selectStyle}>
            {ejemplos.map(item => <option key={item.id} value={item.id}>{item.sigla} — {title(item.area)}</option>)}
          </select>
        </label>
        <button onClick={() => go({ tab: 'pozos', id: well.id })} style={{ background: 'none', border: 0, color: '#60a5fa', fontSize: 12.5 }}>ver su ficha →</button>
      </div>
      <Stepper step={step} setStep={setStep} labels={PASOS} />
      <p style={{ margin: '14px 0', fontSize: 13.5, lineHeight: 1.7, color: C.text2, minHeight: narrow ? 0 : 68 }}>{texto[step]}</p>
      {step === 0 ? (
        <div className="scroll-x">
          <table>
            <thead><tr>{['idpozo', 'anio', 'mes', fluid === 'gas' ? 'prod_gas' : 'prod_pet', 'sigla', 'formacion', 'areapermisoconcesion', 'cuenca'].map(label => <th key={label} style={{ ...mono, textAlign: 'left', padding: '6px 10px', fontSize: 11, color: C.muted, borderBottom: `1px solid ${C.border}` }}>{label}</th>)}</tr></thead>
            <tbody><tr>{[well.id, lastMonth.slice(0, 4), Number(lastMonth.slice(5, 7)), num(rates[last] * DAYS(lastMonth), 1), well.sigla, well.formacion, well.area, 'AUSTRAL'].map((value, index) => <td key={index} style={{ ...mono, padding: '6px 10px', fontSize: 12, whiteSpace: 'nowrap' }}>{value}</td>)}</tr></tbody>
          </table>
          <p style={{ margin: '8px 0 0', fontSize: 11.5, color: C.dim }}>Columnas reales del CSV oficial (tiene 38). Si el pozo produce de dos formaciones hay dos filas, y se suman.</p>
        </div>
      ) : step === 5 && block ? (
        <div style={{ display: 'grid', gap: 6 }}>
          <div style={{ height: 14, background: C.surfaceAlt, borderRadius: 7, overflow: 'hidden' }}><div style={{ width: `${Math.max(1, (info.eur / (block[fluid].eur || 1)) * 100)}%`, height: '100%', background: FLUID_COLOR[fluid] }} /></div>
          <p style={{ margin: 0, fontSize: 12.5, color: C.muted }}>EUR del pozo {volume(fluid, info.eur)} de {volume(fluid, block[fluid].eur)} del bloque. <button onClick={() => go({ tab: 'campo', id: well.area })} style={{ background: 'none', border: 0, padding: 0, color: '#60a5fa' }}>Abrir la ficha del bloque →</button></p>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={narrow ? 260 : 340}>
          <ComposedChart data={shown} margin={{ top: 14, right: 4, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
            <XAxis dataKey="m" ticks={ticks} tickFormatter={(month: string) => month.slice(0, 4)} tick={axisTick} />
            <YAxis tick={axisTick} width={46} tickFormatter={(value: number) => auto(value)} />
            <Tooltip contentStyle={tooltipStyle} labelFormatter={(month: string) => monthLabel(month)} formatter={(value: number | number[], name: string) => [Array.isArray(value) ? `${auto(value[0])} – ${auto(value[1])}` : `${auto(value)} ${unit}`, name]} />
            <Area dataKey="banda" name="banda" stroke="none" fill={C.orange} fillOpacity={0.2} isAnimationActive={false} connectNulls />
            <Scatter dataKey="real" name="real" isAnimationActive={false} shape={(props: { cx?: number; cy?: number }) => <circle cx={props.cx} cy={props.cy} r={2} fill={FLUID_COLOR[fluid]} />} />
            <Line dataKey="ajuste" name="ajuste Arps" stroke={C.orange} strokeDasharray="6 4" strokeWidth={1.8} dot={false} isAnimationActive={false} />
            {step >= 2 && <ReferenceLine x={peakMonth} stroke={C.text2} strokeDasharray="4 3" label={{ value: 'pico', fill: C.muted, fontSize: 11, position: 'top' }} />}
          </ComposedChart>
        </ResponsiveContainer>
      )}
    </Panel>
  )
}

export function Modelo() {
  const narrow = useNarrow()
  const wells = useWells()
  const series = useSeries()
  const forecast = useForecast()
  const ejemplos = useEjemplos(wells.data)
  const well = ejemplos[0]
  const info = well ? well[well.fluido!]! : null
  const [params, setParams] = useState<{ qi: number; di: number; b: number } | null>(null)
  const [paso, setPaso] = useState(0)
  const [ritmo, setRitmo] = useState(12)

  const arps = useMemo(() => {
    if (!well || !info || !series.data) return null
    const rates = series.data.wells[well.id][well.fluido!].slice(info.t0 ?? 0)
    const current = params ?? { qi: info.qi!, di: info.di!, b: info.b! }
    const mean = rates.filter(rate => rate > 0).reduce((total, rate, _, list) => total + rate / list.length, 0)
    let residual = 0, total = 0
    const rows = rates.map((rate, t) => {
      const mine = hyperbolic(t, current.qi, current.di, Math.max(current.b, 0.01))
      if (rate > 0) { residual += (rate - mine) ** 2; total += (rate - mean) ** 2 }
      return { t, real: rate > 0 ? rate : undefined, mia: mine, pipeline: hyperbolic(t, info.qi!, info.di!, info.b!) }
    })
    return { rows, r2: 1 - residual / total, current }
  }, [well, info, series.data, params])

  const campo = useMemo(() => {
    if (!forecast.data) return null
    const entry = Object.entries(forecast.data.campos).filter(([, field]) => field.tipo.gas?.origen === 'bloque' && field.fluido === 'gas').sort((a, b) => b[1].tipo.gas!.n - a[1].tipo.gas!.n)[0]
    if (!entry) return null
    const [name, field] = entry
    const result = fieldForecast(field, 'gas', { ...PRESETS.base, aniosInventario: 30 }, { ritmo })
    const rows = result.base.slice(0, 120).map((base, t) => ({
      t, base, tipo: field.tipo.gas!.p50[t], pozos: result.pozos[t], nuevos: result.nuevos[t],
      unaTanda: t >= 12 ? (ritmo / 12) * field.tipo.gas!.p50[t - 12] : 0,
    }))
    return { name, n: field.tipo.gas!.n, rows }
  }, [forecast.data, ritmo])

  if (wells.error ?? series.error ?? forecast.error) return <ErrorMsg error={(wells.error ?? series.error ?? forecast.error)!} />
  if (!well || !info || !arps || !campo) return <Loading what="los modelos" />
  const unit = well.fluido === 'gas' ? 'Mm³/d' : 'm³/d'
  const set = (patch: Partial<{ qi: number; di: number; b: number }>) => setParams({ ...arps.current, ...patch })
  const PASOS = ['La base', 'Un pozo tipo', 'Una tanda', 'Todas las tandas']
  const explicacion = [
    `Lo que seguirían produciendo los pozos de hoy de ${title(campo.name)} si no se perforara más. Cada pozo sigue su propia curva y se suman.`,
    `El pozo tipo del campo: la mediana de ${campo.n} pozos, mes a mes desde que arrancan, ajustada con Arps. Es lo que se supone que rinde un pozo nuevo.`,
    `Los pozos que entran en un mes (${num(ritmo / 12, 1)} con este ritmo) producen como el pozo tipo, pero desplazados: acá, una tanda que entra en el mes 12.`,
    'Cada mes entra una tanda nueva y cada una sigue el pozo tipo desde su mes de entrada. Sumadas, son la franja azul. Total = base + pozos nuevos.',
  ]

  return (
    <>
      <Panel title="Arps, para tocar" note={<>Mové los tres números e intentá que tu curva pase por los puntos de <span style={mono}>{well.sigla}</span>. El pipeline hace lo mismo, pero probando miles de combinaciones.</>}>
        <div style={{ display: 'grid', gridTemplateColumns: narrow ? '1fr' : 'minmax(0, 1fr) 260px', gap: 18 }}>
          <ResponsiveContainer width="100%" height={narrow ? 260 : 320}>
            <ComposedChart data={arps.rows} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
              <XAxis dataKey="t" type="number" domain={[0, 'dataMax']} tick={axisTick} tickCount={8} />
              <YAxis tick={axisTick} width={46} tickFormatter={(value: number) => auto(value)} domain={[0, (max: number) => Math.min(max, info.pico * 1.6)]} allowDataOverflow />
              <Tooltip contentStyle={tooltipStyle} labelFormatter={(t: number) => `mes ${t} desde el pico`} formatter={(value: number, name: string) => [`${auto(value)} ${unit}`, name]} />
              <Scatter dataKey="real" name="real" isAnimationActive={false} shape={(props: { cx?: number; cy?: number }) => <circle cx={props.cx} cy={props.cy} r={2} fill={FLUID_COLOR[well.fluido!]} />} />
              <Line dataKey="pipeline" name="ajuste del pipeline" stroke={C.muted} strokeDasharray="4 4" dot={false} isAnimationActive={false} />
              <Line dataKey="mia" name="tu curva" stroke={C.orange} strokeWidth={2} dot={false} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
          <div style={{ display: 'grid', gap: 14, alignContent: 'start' }}>
            <Slider label="qi — producción inicial" value={arps.current.qi} min={info.pico * 0.3} max={info.pico * 2} step={info.pico / 200} onChange={qi => set({ qi })} format={value => `${auto(value)} ${unit}`} preset={info.qi!} />
            <Slider label="Di — velocidad de caída" value={arps.current.di} min={0.001} max={0.3} step={0.001} onChange={di => set({ di })} format={value => `${num(value * 100, 1)} % por mes`} preset={info.di!} />
            <Slider label="b — forma de la curva" value={arps.current.b} min={0.01} max={1} step={0.01} onChange={b => set({ b })} format={value => (value < 0.05 ? 'exponencial' : value > 0.95 ? 'armónica' : num(value, 2))} preset={info.b!} />
            <div style={{ background: C.surfaceAlt, borderRadius: 8, padding: 10, fontSize: 12.5 }}>
              Tu R²: <strong style={{ ...mono, color: arps.r2 >= (info.r2 ?? 0) - 0.02 ? C.lime : C.orange }}>{num(arps.r2, 2)}</strong> · pipeline: <span style={mono}>{num(info.r2, 2)}</span>
              <button onClick={() => setParams(null)} style={{ display: 'block', background: 'none', border: 0, padding: 0, marginTop: 6, color: '#60a5fa', fontSize: 12 }}>usar el ajuste del pipeline</button>
            </div>
            <p style={{ margin: 0, fontSize: 11.5, color: C.dim, lineHeight: 1.5 }}><span style={mono}>q(t) = qi / (1 + b·Di·t)^(1/b)</span>. Con b cerca de 0 la caída es constante; con b = 1 se va frenando.</p>
          </div>
        </div>
      </Panel>

      <Panel title="El pronóstico, paso a paso" note="Las cuatro piezas que se suman en la pestaña Pronóstico, sobre un campo real.">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center', marginBottom: 10 }}>
          <Seg value={String(paso)} onChange={value => setPaso(Number(value))} options={PASOS.map((label, index) => ({ value: String(index), label: `${index + 1}. ${label}` }))} />
          <div style={{ flex: '1 1 200px', maxWidth: 280 }}><Slider label="Pozos nuevos por año" value={ritmo} min={0} max={40} step={1} onChange={setRitmo} format={value => num(value)} /></div>
        </div>
        <p style={{ margin: '0 0 10px', fontSize: 13.5, lineHeight: 1.6, color: C.text2 }}>{explicacion[paso]}</p>
        <ResponsiveContainer width="100%" height={narrow ? 260 : 320}>
          <ComposedChart data={campo.rows} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
            <XAxis dataKey="t" type="number" domain={[0, 119]} tick={axisTick} tickCount={11} tickFormatter={(t: number) => `${t / 12}a`} ticks={[0, 12, 24, 36, 48, 60, 72, 84, 96, 108]} />
            <YAxis tick={axisTick} width={46} tickFormatter={(value: number) => auto(value)} />
            <Tooltip contentStyle={tooltipStyle} labelFormatter={(t: number) => `mes ${t}`} formatter={(value: number, name: string) => [`${auto(value)} Mm³/d`, name]} />
            {paso !== 1 && <Area dataKey="base" name="base" stackId="a" stroke={C.gas} fill={C.gas} fillOpacity={0.3} isAnimationActive={false} />}
            {paso === 1 && <Line dataKey="tipo" name="pozo tipo (un pozo)" stroke={C.orange} strokeWidth={2} dot={false} isAnimationActive={false} />}
            {paso === 2 && <Area dataKey="unaTanda" name="la tanda del mes 12" stackId="a" stroke={C.orange} fill={C.orange} fillOpacity={0.4} isAnimationActive={false} />}
            {paso === 3 && <Area dataKey="nuevos" name="pozos nuevos" stackId="a" stroke={C.blue} fill={C.blue} fillOpacity={0.35} isAnimationActive={false} />}
          </ComposedChart>
        </ResponsiveContainer>
        <p style={{ margin: '10px 0 0', fontSize: 12.5 }}><Code archivo="src/utils/forecast.ts" simbolo="schedule" /> · <Code archivo="src/utils/forecast.ts" simbolo="convolve" /> · <Code archivo="pipeline/build_data.py" simbolo="type_profile" /></p>
      </Panel>
    </>
  )
}

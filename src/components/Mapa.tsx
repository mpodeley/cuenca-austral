import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { BasinMap } from './BasinMap'
import type { Hover } from './BasinMap'
import { Check, ErrorMsg, Legend, Loading, Panel, Pill } from './ui'
import { C, RAMPS, inputStyle, mono, operatorColor, selectStyle } from '../theme'
import { useBlocks, useConcessions, useContext, useWells } from '../hooks/useData'
import { useCoarsePointer, useNarrow } from '../hooks/useViewport'
import type { Block, Concession, Well } from '../types'
import { BASIN_VIEW, binIndex, quantileBreaks } from '../utils/geo'
import { auto, num, operatorName, pct, rate, title, volume } from '../utils/format'
import type { Route } from '../App'

interface Metric { key: string; label: string; group: string; ramp: string[]; value: (block: Block) => number | null; format: (value: number) => string }

const main = (block: Block) => block[block.fluido ?? 'gas']
const METRICS: Metric[] = [
  { key: 'q_gas', label: 'Gas hoy', group: 'Producción', ramp: RAMPS.gas, value: b => b.gas.q, format: v => rate('gas', v) },
  { key: 'q_oil', label: 'Petróleo hoy', group: 'Producción', ramp: RAMPS.oil, value: b => b.oil.q, format: v => rate('oil', v) },
  { key: 'cum_gas', label: 'Gas acumulado', group: 'Producción', ramp: RAMPS.gas, value: b => b.gas.cum, format: v => volume('gas', v) },
  { key: 'cum_oil', label: 'Petróleo acumulado', group: 'Producción', ramp: RAMPS.oil, value: b => b.oil.cum, format: v => volume('oil', v) },
  { key: 'eur_gas', label: 'EUR gas', group: 'EUR', ramp: RAMPS.gas, value: b => b.gas.eur, format: v => volume('gas', v) },
  { key: 'eur_oil', label: 'EUR petróleo', group: 'EUR', ramp: RAMPS.oil, value: b => b.oil.eur, format: v => volume('oil', v) },
  { key: 'agotado', label: '% agotado', group: 'Madurez', ramp: RAMPS.depletion, value: b => main(b).agotado, format: v => pct(v) },
  { key: 'pozos', label: 'Pozos', group: 'Actividad', ramp: RAMPS.count, value: b => b.n_pozos, format: v => num(v) },
  { key: 'activos', label: 'Pozos activos', group: 'Actividad', ramp: RAMPS.count, value: b => b.n_activos, format: v => num(v) },
  { key: 'nuevos', label: 'Pozos nuevos (5 años)', group: 'Actividad', ramp: RAMPS.count, value: b => b.pozos_5a, format: v => num(v) },
]

type WellMode = 'estado' | 'fluido' | 'campana' | 'ambiente' | 'tipo'
const WELL_MODES: Array<{ key: WellMode; label: string }> = [
  { key: 'estado', label: 'estado' }, { key: 'fluido', label: 'fluido principal' }, { key: 'campana', label: 'campaña' },
  { key: 'ambiente', label: 'onshore / offshore' }, { key: 'tipo', label: 'tipo de pozo' },
]
const NEVER = '#475569'
const VINTAGES: Array<[number, string, string]> = [[2006, '2006 o antes', C.gray], [2011, '2007–2011', C.purple], [2016, '2012–2016', C.blue], [2021, '2017–2021', C.orange], [9999, '2022 en adelante', C.lime]]
const TYPES: Record<string, string> = { 'Gasífero': C.gas, 'Petrolífero': C.oil, 'Inyección de Agua': C.cyan, 'Inyección de Gas': C.orange, 'Sumidero': C.purple }

const wellPalette: Record<WellMode, { color: (well: Well) => string; legend: Array<{ color: string; label: string }> }> = {
  estado: {
    color: well => (well.activo ? C.lime : well.m0 ? C.orange : NEVER),
    legend: [{ color: C.lime, label: 'activo (produjo en los últimos 12 meses)' }, { color: C.orange, label: 'produjo y hoy está parado' }, { color: NEVER, label: 'sin producción registrada' }],
  },
  fluido: {
    color: well => (well.fluido === 'gas' ? C.gas : well.fluido === 'oil' ? C.oil : NEVER),
    legend: [{ color: C.gas, label: 'gas' }, { color: C.oil, label: 'petróleo' }, { color: NEVER, label: 'sin producción registrada' }],
  },
  campana: {
    color: well => (well.campana === null ? NEVER : VINTAGES.find(([limit]) => well.campana! <= limit)![2]),
    legend: [...VINTAGES.map(([, label, color]) => ({ color, label })), { color: NEVER, label: 'sin producción registrada' }],
  },
  ambiente: {
    color: well => (well.offshore ? C.blue : C.orange),
    legend: [{ color: C.orange, label: 'onshore' }, { color: C.blue, label: 'offshore' }],
  },
  tipo: {
    color: well => TYPES[well.tipo] ?? NEVER,
    legend: [...Object.entries(TYPES).map(([label, color]) => ({ color, label: label.toLowerCase() })), { color: NEVER, label: 'otro' }],
  },
}

const Row = ({ label, children }: { label: string; children: ReactNode }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '1.5px 0' }}>
    <span style={{ color: C.muted }}>{label}</span><span style={{ ...mono, textAlign: 'right' }}>{children}</span>
  </div>
)

export function BlockTooltip({ concession, block }: { concession: Concession; block?: Block }) {
  return (
    <>
      <strong style={{ fontSize: 13.5, color: C.text }}>{title(concession.nombre)}</strong>
      <div style={{ color: operatorColor(concession.operador), margin: '2px 0 6px' }}>{operatorName(concession.operador)}</div>
      {!block ? (
        <p style={{ margin: 0, color: C.dim }}>Sin producción registrada en Capítulo IV.{concession.area_km2 ? ` Superficie: ${num(concession.area_km2)} km².` : ''}</p>
      ) : (
        <>
          <div style={{ marginBottom: 6 }}><Pill color={block.n_activos ? C.lime : C.dim}>{block.etapa}</Pill></div>
          <Row label="Pozos (activos)">{num(block.n_pozos)} ({num(block.n_activos)})</Row>
          <Row label="Superficie">{block.area_km2 ? `${num(block.area_km2)} km²` : 'sin polígono oficial'}</Row>
          <Row label="Gas hoy">{rate('gas', block.gas.q)}</Row>
          <Row label="Petróleo hoy">{rate('oil', block.oil.q)}</Row>
          <Row label="Gas acum. / EUR">{auto(block.gas.cum)} / {volume('gas', block.gas.eur)}</Row>
          <Row label="Petróleo acum. / EUR">{auto(block.oil.cum)} / {volume('oil', block.oil.eur)}</Row>
          <Row label="% agotado">{pct(main(block).agotado)}</Row>
          <Row label="Campañas">{block.campana_min ?? '—'}–{block.campana_max ?? '—'}</Row>
          {concession.geometria === 'derivada' && <p style={{ margin: '6px 0 0', color: C.orange }}>Contorno aproximado: envolvente de sus pozos (sin polígono oficial).</p>}
        </>
      )}
    </>
  )
}

export function WellTooltip({ well }: { well: Well }) {
  return (
    <>
      <strong style={{ ...mono, fontSize: 13, color: C.text }}>{well.sigla}</strong>
      <div style={{ color: C.muted, margin: '2px 0 6px' }}>{operatorName(well.empresa)} · {title(well.area)}</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
        <Pill color={well.activo ? C.lime : well.m0 ? C.orange : C.dim}>{well.estado || 'sin estado'}</Pill>
        <Pill color={TYPES[well.tipo] ?? C.muted}>{well.tipo || 'sin tipo'}</Pill>
      </div>
      <Row label="Formación">{title(well.formacion)}</Row>
      <Row label="Profundidad">{well.profundidad ? `${num(well.profundidad)} m` : '—'}</Row>
      <Row label="Primera producción">{well.m0 ? (well.pre2006 ? '2006 o antes' : well.campana) : 'no registra'}</Row>
      {well.gas && <Row label="Gas hoy / EUR">{auto(well.gas.q)} Mm³/d / {volume('gas', well.gas.eur)}</Row>}
      {well.oil && <Row label="Petróleo hoy / EUR">{auto(well.oil.q)} m³/d / {volume('oil', well.oil.eur)}</Row>}
    </>
  )
}

export function Mapa({ go }: { go: (route: Route) => void }) {
  const narrow = useNarrow()
  const coarse = useCoarsePointer()
  const blocks = useBlocks()
  const concessions = useConcessions()
  const context = useContext()
  const [wantWells, setWantWells] = useState(false)
  const wells = useWells(wantWells)
  const [showBlocks, setShowBlocks] = useState(true)
  const [showWells, setShowWells] = useState(true)
  const [showBasin, setShowBasin] = useState(true)
  const [metricKey, setMetricKey] = useState('')
  const [wellMode, setWellMode] = useState<WellMode>('estado')
  const [onlyProducers, setOnlyProducers] = useState(false)
  const [query, setQuery] = useState('')

  // El padrón de pozos pesa más que el resto: se pide cuando el mapa base ya está en pantalla.
  useEffect(() => { const timer = setTimeout(() => setWantWells(true), 50); return () => clearTimeout(timer) }, [])

  const byName = useMemo(() => new Map((blocks.data ?? []).map(block => [block.nombre, block])), [blocks.data])
  const metric = METRICS.find(item => item.key === metricKey)
  const breaks = useMemo(() => (metric && blocks.data ? quantileBreaks(blocks.data.map(metric.value), metric.ramp.length) : []), [metric, blocks.data])

  const blockFill = useCallback((concession: Concession) => {
    if (!metric) return null
    const block = byName.get(concession.nombre)
    const value = block ? metric.value(block) : null
    return value && value > 0 ? metric.ramp[Math.min(metric.ramp.length - 1, binIndex(value, breaks))] : null
  }, [metric, byName, breaks])

  const visibleWells = useMemo(() => (wells.data ?? []).filter(well => !onlyProducers || well.m0), [wells.data, onlyProducers])
  const palette = wellPalette[wellMode]

  const matches = useMemo(() => {
    const text = query.trim().toLowerCase()
    if (text.length < 2 || !blocks.data) return []
    return blocks.data.filter(block => block.nombre.toLowerCase().includes(text) || block.operador.toLowerCase().includes(text)).slice(0, 6)
  }, [query, blocks.data])

  const error = blocks.error ?? concessions.error ?? context.error ?? wells.error
  if (error) return <ErrorMsg error={error} />
  if (!blocks.data || !concessions.data || !context.data) return <Loading what="el mapa" />

  const withData = concessions.data.filter(concession => concession.con_datos).length
  const tooltip = (hover: NonNullable<Hover>) =>
    hover.kind === 'well' ? <WellTooltip well={hover.well} /> : <BlockTooltip concession={hover.concession} block={byName.get(hover.concession.nombre)} />

  return (
    <Panel>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 16px', alignItems: 'center', marginBottom: 10 }}>
        <Check checked={showBlocks} onChange={setShowBlocks}>{narrow ? 'concesiones' : 'Concesiones'}</Check>
        <Check checked={showWells} onChange={setShowWells}>{narrow ? 'pozos' : 'Pozos'}</Check>
        <Check checked={showBasin} onChange={setShowBasin}>{narrow ? 'cuenca' : 'Contorno de cuenca'}</Check>
        <div style={{ position: 'relative', flex: '1 1 200px', maxWidth: 320 }}>
          <input
            type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar bloque u operadora…" aria-label="Buscar bloque u operadora"
            style={{ ...inputStyle, width: '100%' }}
          />
          {matches.length > 0 && (
            <div style={{ position: 'absolute', zIndex: 5, top: '100%', left: 0, right: 0, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, marginTop: 4, overflow: 'hidden' }}>
              {matches.map(block => (
                <button key={block.nombre} onClick={() => go({ tab: 'campo', id: block.nombre })} style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 0, padding: '7px 10px', fontSize: 12.5 }}>
                  {title(block.nombre)} <span style={{ color: C.dim }}>· {operatorName(block.operador)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <span style={{ ...mono, fontSize: 11.5, color: C.dim, marginLeft: 'auto' }}>
          {concessions.data.length} concesiones · {withData} con datos · {wells.data ? `${num(wells.data.length)} pozos` : 'cargando pozos…'}
        </span>
      </div>

      <details style={{ marginBottom: 10 }}>
        <summary style={{ fontSize: 12, color: C.muted }}>Ajustar qué se colorea</summary>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 18px', alignItems: 'center', padding: '10px 0 2px', fontSize: 12 }}>
          <label>bloques por:{' '}
            <select value={metricKey} onChange={event => setMetricKey(event.target.value)} style={selectStyle}>
              <option value="">sin colorear</option>
              {[...new Set(METRICS.map(item => item.group))].map(group => (
                <optgroup key={group} label={group}>{METRICS.filter(item => item.group === group).map(item => <option key={item.key} value={item.key}>{item.label}</option>)}</optgroup>
              ))}
            </select>
          </label>
          <label>pozos por:{' '}
            <select value={wellMode} onChange={event => setWellMode(event.target.value as WellMode)} style={selectStyle}>
              {WELL_MODES.map(mode => <option key={mode.key} value={mode.key}>{mode.label}</option>)}
            </select>
          </label>
          <Check checked={onlyProducers} onChange={setOnlyProducers}>sólo pozos que produjeron</Check>
        </div>
      </details>

      <BasinMap
        home={BASIN_VIEW} height={narrow ? '66vh' : 'min(72vh, 660px)'} context={context.data} concessions={concessions.data}
        showBlocks={showBlocks} showBasin={showBasin} blockFill={blockFill}
        wells={showWells ? visibleWells : undefined} wellColor={palette.color}
        onBlockClick={concession => concession.con_datos && go({ tab: 'campo', id: concession.nombre })}
        onWellClick={well => go({ tab: 'pozos', id: well.id })}
        tooltip={tooltip}
      />

      <div style={{ display: 'grid', gap: 6, marginTop: 10 }}>
        {showWells && <Legend items={palette.legend} />}
        {metric && (
          <Legend items={[
            ...metric.ramp.slice(0, breaks.length + 1).map((color, index) => ({
              color, label: index === 0 ? `< ${metric.format(breaks[0])}` : index === breaks.length ? `≥ ${metric.format(breaks[index - 1])}` : `${metric.format(breaks[index - 1])} – ${metric.format(breaks[index])}`,
            })),
            { color: C.surface, label: 'sin datos' },
          ]} />
        )}
        <p style={{ margin: 0, fontSize: 11.5, color: C.dim, lineHeight: 1.5 }}>
          {coarse ? 'Tocá un bloque para abrir su ficha o un pozo para ver su declinación; arrastrá para mover, pellizcá para acercar.' : 'Click en un bloque para abrir su ficha, o en un pozo para ver su declinación; rueda para zoom, arrastrar para mover.'}
          {' '}Los pozos son puntos en su ubicación de superficie: no hay trayectorias públicas para la Cuenca Austral. Las concesiones con borde punteado no tienen polígono oficial y se dibujan como la envolvente de sus pozos. La línea celeste punteada es el contorno oficial de la cuenca sedimentaria.
        </p>
      </div>
    </Panel>
  )
}


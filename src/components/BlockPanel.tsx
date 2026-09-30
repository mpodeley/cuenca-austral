import { useMemo, useState } from 'react'
import { alignedGasRates, blockForecast, buildForecast, empiricalCurve, fitArps } from '../forecast'
import type { ArpsParams, Block, Well } from '../types'
import { LineChart } from './LineChart'

const number = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 })

export function BlockPanel({ block, wells, onClose }: { block: Block; wells: Well[]; onClose: () => void }) {
  const eligible = useMemo(() => alignedGasRates(wells), [wells])
  const fitted = useMemo(() => fitArps(empiricalCurve(eligible, 0.5)), [eligible])
  const [params, setParams] = useState<ArpsParams>(fitted)
  const [newWells, setNewWells] = useState(0)
  const [inventory, setInventory] = useState(0)
  const forecast = useMemo(() => buildForecast(wells, params), [wells, params])
  const blockSeries = useMemo(
    () => blockForecast(forecast, block.latestGasMm3, newWells, inventory),
    [forecast, block.latestGasMm3, newWells, inventory],
  )
  const setParam = (key: keyof ArpsParams, value: number) => setParams((current) => ({ ...current, [key]: value }))

  return (
    <aside className="panel">
      <button className="close" onClick={onClose} aria-label="Cerrar ficha">×</button>
      <p className="eyebrow">Ficha de concesión</p>
      <h2>{block.name}</h2>
      <p className="operator">{block.operator} · {block.environment === 'offshore' ? 'Costa afuera' : block.province}</p>

      <div className="metrics">
        <Metric label="Pozos" value={block.wellCount} />
        <Metric label="Activos" value={block.activeWellCount} />
        <Metric label="Gas acumulado" value={`${number.format(block.cumulativeGasMm3)} Mm³`} />
        <Metric label="Último mes" value={`${number.format(block.latestGasMm3)} Mm³`} />
      </div>

      <section>
        <div className="section-title"><h3>Historia de gas</h3><span>{block.firstProduction?.slice(0, 4) ?? '—'}–{block.lastProduction?.slice(0, 4) ?? '—'}</span></div>
        <LineChart series={[{ label: 'Producción mensual', color: '#5ce1e6', values: aggregateProduction(wells) }]} />
      </section>

      <section>
        <div className="section-title"><h3>Pozo tipo</h3><span>{eligible.length} pozos elegibles</span></div>
        {eligible.length < 10 && <p className="notice">Muestra menor al umbral recomendado de 10 pozos. El resultado se presenta con cautela.</p>}
        <LineChart unit="Mm³/d" series={[
          { label: 'Historia P50', color: '#f2c66d', values: forecast.slice(0, 60).map((point) => point.observed ?? 0) },
          { label: 'Arps ajustado', color: '#5ce1e6', values: forecast.slice(0, 60).map((point) => point.central) },
        ]} />
        <div className="controls three">
          <Range label="qi (Mm³/d)" value={params.qi} min={0.01} max={Math.max(1, params.qi * 2)} step={0.01} onChange={(value) => setParam('qi', value)} />
          <Range label="Di anual" value={params.diAnnual} min={0.05} max={1.5} step={0.01} onChange={(value) => setParam('diAnnual', value)} />
          <Range label="b" value={params.b} min={0.1} max={2} step={0.05} onChange={(value) => setParam('b', value)} />
        </div>
        <p className="method">Arps hiperbólico con transición a 5% anual. Ajuste sobre tasas por día productivo; horizonte de 20 años.</p>
      </section>

      <section>
        <div className="section-title"><h3>Pronóstico de bloque</h3><span>Escenario editable</span></div>
        <div className="controls two">
          <Range label="Pozos nuevos/mes" value={newWells} min={0} max={4} step={0.25} onChange={setNewWells} />
          <Range label="Inventario máximo" value={inventory} min={0} max={100} step={1} onChange={setInventory} />
        </div>
        <LineChart series={[{ label: 'Gas del bloque', color: '#a7ef9b', values: blockSeries }]} />
        <p className="method">El escenario base no supone perforaciones futuras. Los valores editados son supuestos del usuario, no datos oficiales.</p>
      </section>
    </aside>
  )
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return <div><span>{label}</span><strong>{value}</strong></div>
}

function Range({ label, value, min, max, step, onChange }: { label: string; value: number; min: number; max: number; step: number; onChange: (value: number) => void }) {
  return <label className="range"><span>{label}<b>{number.format(value)}</b></span><input type="range" value={value} min={min} max={max} step={step} onChange={(event) => onChange(Number(event.target.value))} /></label>
}

function aggregateProduction(wells: Well[]): number[] {
  const months = [...new Set(wells.flatMap((well) => well.production.map((point) => point.month)))].sort()
  return months.map((month) => wells.reduce((sum, well) => sum + (well.production.find((point) => point.month === month)?.gasMm3 ?? 0), 0))
}


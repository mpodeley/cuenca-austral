import { useEffect, useMemo, useState } from 'react'
import { loadDataset } from './data'
import type { Dataset } from './types'
import { BlockPanel } from './components/BlockPanel'
import { MapView } from './components/MapView'
import { LearnPanel } from './components/LearnPanel'

export function App() {
  const [dataset, setDataset] = useState<Dataset | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null)
  const [showBlocks, setShowBlocks] = useState(true)
  const [showWells, setShowWells] = useState(true)
  const [showLearn, setShowLearn] = useState(false)

  useEffect(() => { loadDataset().then(setDataset).catch((reason: Error) => setError(reason.message)) }, [])

  const selectedBlock = dataset?.blocks.find((block) => block.id === selectedBlockId) ?? null
  const selectedWells = useMemo(
    () => dataset?.wells.filter((well) => well.blockId === selectedBlockId) ?? [],
    [dataset, selectedBlockId],
  )
  const matches = useMemo(() => {
    if (!dataset || query.trim().length < 2) return []
    const normalized = query.toLocaleLowerCase('es')
    return dataset.blocks.filter((block) => `${block.name} ${block.operator}`.toLocaleLowerCase('es').includes(normalized)).slice(0, 6)
  }, [dataset, query])

  if (error) return <main className="center-state"><h1>No pudimos abrir los datos</h1><p>{error}</p><p>Ejecutá <code>npm run data:demo</code> o el pipeline oficial.</p></main>
  if (!dataset) return <main className="center-state"><div className="loader" /><p>Cargando la Cuenca Austral…</p></main>

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand"><span className="brand-mark">CA</span><div><h1>Cuenca Austral</h1><p>pozo por pozo</p></div></div>
        <div className="search-wrap">
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar bloque u operador…" aria-label="Buscar bloque u operador" />
          {matches.length > 0 && <div className="results">{matches.map((block) => <button key={block.id} onClick={() => { setSelectedBlockId(block.id); setQuery('') }}><strong>{block.name}</strong><span>{block.operator}</span></button>)}</div>}
        </div>
        <div className="top-actions">
          <button className="learn-button" onClick={() => setShowLearn(true)}>Cómo se hizo</button>
          <a className="repo-button" href="https://github.com/mpodeley/cuenca-austral" target="_blank" rel="noreferrer">GitHub ↗</a>
          <div className="cutoff"><span>Datos hasta</span><strong>{dataset.metadata.dataThrough}</strong></div>
        </div>
      </header>

      <MapView dataset={dataset} selectedBlockId={selectedBlockId} showBlocks={showBlocks} showWells={showWells} onSelectBlock={setSelectedBlockId} />

      <div className="layer-control">
        <p>Capas</p>
        <label><input type="checkbox" checked={showBlocks} onChange={(event) => setShowBlocks(event.target.checked)} /><i className="swatch blocks" />Concesiones</label>
        <label><input type="checkbox" checked={showWells} onChange={(event) => setShowWells(event.target.checked)} /><i className="swatch wells" />Pozos</label>
        <small><i className="swatch offshore" />Offshore <i className="swatch onshore" />Onshore</small>
      </div>

      <div className={`data-badge ${dataset.metadata.mode}`} title={dataset.metadata.disclaimer}>
        <span />{dataset.metadata.mode === 'official' ? 'Datos oficiales procesados' : 'Dataset demostrativo trazable'}
      </div>

      {selectedBlock && <BlockPanel key={selectedBlock.id} block={selectedBlock} wells={selectedWells} onClose={() => setSelectedBlockId(null)} />}
      {showLearn && <LearnPanel dataset={dataset} onClose={() => setShowLearn(false)} />}
      {!selectedBlock && <div className="hint"><span>↖</span> Elegí una concesión para abrir su ficha y pronóstico</div>}
    </main>
  )
}

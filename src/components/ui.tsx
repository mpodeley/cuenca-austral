import type { CSSProperties, ReactNode } from 'react'
import { C, card, mono } from '../theme'
import { useNarrow } from '../hooks/useViewport'
import { ComoBoton } from '../didactica/Drawer'
import { useDidactica } from '../didactica/Contexto'

/** ``como`` es el id del módulo en el registro didáctico: agrega el botón «cómo se hizo». */
export function Panel({ title, note, accent, children, style, como }: { title?: ReactNode; note?: ReactNode; accent?: string; children: ReactNode; style?: CSSProperties; como?: string }) {
  const narrow = useNarrow()
  const { clase } = useDidactica()
  return (
    <section data-como={como} style={{ ...card, padding: narrow ? 12 : 20, borderLeft: accent ? `3px solid ${accent}` : card.border, ...(como && clase ? { outline: `1px dashed ${C.orange}88`, outlineOffset: 3 } : {}), ...style }}>
      {(title || como) && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 10, marginBottom: note ? 4 : 12 }}>
          <h3 style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: 1, color: C.muted, fontWeight: 500 }}>{title}</h3>
          {como && <ComoBoton id={como} />}
        </div>
      )}
      {note && <p style={{ margin: '0 0 12px', fontSize: 12, color: C.dim, lineHeight: 1.5 }}>{note}</p>}
      {children}
    </section>
  )
}

export function Kpi({ label, value, sub, color }: { label: string; value: ReactNode; sub?: ReactNode; color?: string }) {
  return (
    <div style={{ ...card, padding: 14 }}>
      <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8, color: C.muted }}>{label}</div>
      <div style={{ ...mono, fontSize: 22, fontWeight: 600, color: color ?? C.text, marginTop: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 11.5, color: C.dim, marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

export function KpiGrid({ children, como }: { children: ReactNode; como?: string }) {
  const { clase } = useDidactica()
  return (
    <div data-como={como} style={{ position: 'relative', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, ...(como && clase ? { outline: `1px dashed ${C.orange}88`, outlineOffset: 3, borderRadius: 12 } : {}) }}>
      {children}
      {como && <span style={{ position: 'absolute', top: 8, right: 8 }}><ComoBoton id={como} /></span>}
    </div>
  )
}

/** Control segmentado: una opción activa entre pocas. */
export function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: Array<{ value: T; label: string }>; onChange: (value: T) => void; label?: string }) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      {label && <span style={{ fontSize: 11.5, color: C.muted }}>{label}</span>}
      <div role="group" aria-label={label} style={{ display: 'inline-flex', border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden' }}>
        {options.map(option => (
          <button
            key={option.value} onClick={() => onChange(option.value)} aria-pressed={option.value === value}
            style={{ border: 0, padding: '5px 11px', fontSize: 12, background: option.value === value ? C.blue : C.surfaceAlt, color: option.value === value ? '#fff' : C.muted }}
          >{option.label}</button>
        ))}
      </div>
    </div>
  )
}

export function Pill({ color = C.muted, children }: { color?: string; children: ReactNode }) {
  return <span style={{ display: 'inline-block', background: `${color}22`, color, borderRadius: 999, padding: '2px 9px', fontSize: 11.5, whiteSpace: 'nowrap' }}>{children}</span>
}

export function Collapse({ title, children, open, como }: { title: ReactNode; children: ReactNode; open?: boolean; como?: string }) {
  const { clase } = useDidactica()
  return (
    <details data-como={como} open={open} style={{ ...card, padding: 0, ...(como && clase ? { outline: `1px dashed ${C.orange}88`, outlineOffset: 3 } : {}) }}>
      <summary style={{ padding: '14px 20px', fontSize: 13, textTransform: 'uppercase', letterSpacing: 1, color: C.muted }}>{title}{como && <span style={{ float: 'right' }}><ComoBoton id={como} /></span>}</summary>
      <div style={{ padding: '0 20px 20px' }}>{children}</div>
    </details>
  )
}

export function Check({ checked, onChange, children }: { checked: boolean; onChange: (checked: boolean) => void; children: ReactNode }) {
  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: C.text2, cursor: 'pointer' }}>
      <input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} />{children}
    </label>
  )
}

export function Slider({ label, value, min, max, step, onChange, format, preset }: { label: string; value: number; min: number; max: number; step: number; onChange: (value: number) => void; format: (value: number) => string; preset?: number }) {
  return (
    <label style={{ display: 'block', fontSize: 12, color: C.text2 }} onDoubleClick={() => preset !== undefined && onChange(preset)}>
      <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <span>{label}</span><span style={{ ...mono, color: preset !== undefined && value !== preset ? C.orange : C.muted }}>{format(value)}</span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={event => onChange(Number(event.target.value))} />
    </label>
  )
}

export const Loading = ({ what = 'la hoja' }: { what?: string }) => <p style={{ color: C.muted, padding: 20 }}>Cargando {what}…</p>
export const ErrorMsg = ({ error }: { error: string }) => <p style={{ color: C.gas, padding: 20 }}>Error: {error}</p>
export const Empty = ({ children }: { children: ReactNode }) => <p style={{ color: C.dim, fontSize: 12.5, margin: 0, padding: '18px 0' }}>{children}</p>

export function Legend({ items }: { items: Array<{ color: string; label: string }> }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', fontSize: 11.5, color: C.muted }}>
      {items.map(item => (
        <span key={item.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, background: item.color, display: 'inline-block' }} />{item.label}
        </span>
      ))}
    </div>
  )
}

import type { CSSProperties } from 'react'
import type { Fluid } from './types'

export const C = {
  bg: '#0f172a', surface: '#1e293b', surfaceAlt: '#172033', mapBg: '#0b1220', land: '#162238', border: '#334155',
  text: '#f1f5f9', text2: '#e2e8f0', muted: '#94a3b8', dim: '#64748b',
  gas: '#ef4444', oil: '#10b981', water: '#06b6d4',
  blue: '#3b82f6', orange: '#f59e0b', purple: '#8b5cf6', cyan: '#06b6d4', lime: '#84cc16', gray: '#6b7280',
}

export const FLUID_COLOR: Record<Fluid, string> = { gas: C.gas, oil: C.oil }
export const FLUID_LABEL: Record<Fluid, string> = { gas: 'Gas', oil: 'Petróleo' }
export const CATEGORICAL = [C.blue, C.orange, C.oil, C.purple, C.gas, C.cyan, C.lime, '#ec4899', '#eab308', '#14b8a6', '#f97316', '#a3a3a3']

const OPERATOR_COLORS: Record<string, string> = {
  'TOTAL AUSTRAL S.A.': C.blue, 'COMPAÑÍA GENERAL DE COMBUSTIBLES S.A.': C.orange, 'VELITEC S.A.': C.purple,
  'VENOIL S.A.': C.cyan, 'ROCH S.A.': C.lime, 'INTEROIL ARGENTINA S A': '#ec4899', 'PETROLERA SANTA MARIA SAU': C.oil,
}
export const operatorColor = (name: string) => OPERATOR_COLORS[name] ?? C.muted

export const card: CSSProperties = { background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20 }
export const mono: CSSProperties = { fontFamily: 'var(--font-mono)' }
export const selectStyle: CSSProperties = { background: C.surfaceAlt, border: `1px solid ${C.border}`, borderRadius: 8, padding: '6px 10px', color: C.text2, maxWidth: '100%' }
export const inputStyle: CSSProperties = { ...selectStyle }
export const th: CSSProperties = { textAlign: 'left', padding: '8px 10px', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6, color: C.muted, borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap', fontWeight: 600 }
export const td: CSSProperties = { padding: '7px 10px', fontSize: 12.5, borderBottom: `1px solid ${C.border}55`, whiteSpace: 'nowrap' }
export const axisTick = { fontSize: 11, fill: C.muted }
export const tooltipStyle: CSSProperties = { background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12 }

/** Rampas de 5 tonos, de claro a intenso, para coropletas por cuantiles. */
export const RAMPS = {
  gas: ['#3f1d24', '#7f1d1d', '#b91c1c', '#ef4444', '#fca5a5'],
  oil: ['#12332b', '#065f46', '#059669', '#10b981', '#6ee7b7'],
  count: ['#172554', '#1e3a8a', '#1d4ed8', '#3b82f6', '#93c5fd'],
  depletion: ['#3b2a12', '#78350f', '#b45309', '#f59e0b', '#fcd34d'],
}

type Series = { label: string; color: string; values: number[] }

export function LineChart({ series, height = 190, unit = 'Mm³' }: { series: Series[]; height?: number; unit?: string }) {
  const width = 620
  const padding = { top: 15, right: 15, bottom: 30, left: 48 }
  const count = Math.max(...series.map((item) => item.values.length), 1)
  const max = Math.max(...series.flatMap((item) => item.values), 1)
  const x = (index: number) => padding.left + index / Math.max(count - 1, 1) * (width - padding.left - padding.right)
  const y = (value: number) => height - padding.bottom - value / max * (height - padding.top - padding.bottom)

  return (
    <div className="chart-wrap">
      <svg className="chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Serie temporal">
        {[0, 0.5, 1].map((ratio) => (
          <g key={ratio}>
            <line x1={padding.left} x2={width - padding.right} y1={y(max * ratio)} y2={y(max * ratio)} className="grid-line" />
            <text x={padding.left - 7} y={y(max * ratio) + 4} textAnchor="end" className="axis-label">{(max * ratio).toFixed(max < 10 ? 1 : 0)}</text>
          </g>
        ))}
        {series.map((item) => {
          const path = item.values.map((value, index) => `${index === 0 ? 'M' : 'L'}${x(index)},${y(value)}`).join(' ')
          return <path key={item.label} d={path} fill="none" stroke={item.color} strokeWidth="2.2" vectorEffect="non-scaling-stroke" />
        })}
        <text x={padding.left} y={height - 7} className="axis-label">0</text>
        <text x={width - padding.right} y={height - 7} textAnchor="end" className="axis-label">{count - 1} meses</text>
        <text x={5} y={12} className="axis-label">{unit}</text>
      </svg>
      <div className="chart-legend">
        {series.map((item) => <span key={item.label}><i style={{ background: item.color }} />{item.label}</span>)}
      </div>
    </div>
  )
}


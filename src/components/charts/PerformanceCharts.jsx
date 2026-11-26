import { useState } from 'react'
import {
  Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, PolarAngleAxis, PolarGrid,
  PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { percent } from '../../utils/analyticsMetrics.js'

const tones = ['#22c55e', '#ff3344', '#ffb800', '#94a3b8']
const tooltipStyle = { background: '#081c2c', borderColor: '#24536a', color: '#e2e8f0' }

function Panel({ title, detail, children, rows, label }) {
  return <section className="ws-card data-chart">
    <h2>{title}</h2>
    {detail && <p>{detail}</p>}
    {children}
    {rows?.length > 0 && <details>
      <summary>{label || 'View chart values'}</summary>
      <ul>{rows.map(([key, value]) => <li key={key}><strong>{key}</strong> · {value}</li>)}</ul>
    </details>}
  </section>
}

function TooltipCard({ active, payload, label }) {
  if (!active || !payload?.length) return null
  const datum = payload[0].payload
  return <div className="data-tooltip">
    <strong>{datum.name ?? label}</strong>
    {payload.map((item) => <p key={item.dataKey}>{item.name} {item.dataKey.includes('rate') ? percent(item.value) : item.value}</p>)}
    {datum.selected !== undefined && <p>{datum.selected + datum.rejected} completed decisions</p>}
    {datum.attempted !== undefined && <p>{datum.attempted} attempted rounds</p>}
    {datum.cleared !== undefined && <p>{datum.cleared} cleared · {datum.rejected} rejected</p>}
  </div>
}

export function RoundPerformanceChart({ categories, radar = false }) {
  const assessed = categories.filter((category) => category.attempted > 0)
  return <Panel title={radar ? 'Skill Telemetry' : 'Round Performance'}
    detail="Clearance uses only cleared and rejected rounds."
    rows={categories.map((c) => [c.name, c.attempted ? `${percent(c.clearance_rate)} · ${c.cleared} cleared · ${c.rejected} rejected · ${c.attempted} attempted` : 'Not assessed'])}>
    {assessed.length === 0 ? <p>Insufficient data. No rounds have a recorded outcome.</p>
      : <div className="data-chart-canvas">
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          {radar && assessed.length >= 3 ? <RadarChart data={assessed} outerRadius="59%">
            <PolarGrid stroke="#24536a" /><PolarAngleAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 10 }} />
            <PolarRadiusAxis domain={[0, 100]} tick={false} />
            <Radar name="Clearance" dataKey="clearance_rate" stroke="#00d9ff" fill="#00d9ff" fillOpacity={0.23} isAnimationActive={false} />
            <Tooltip content={<TooltipCard />} />
          </RadarChart> : <BarChart data={assessed} layout="vertical" margin={{ left: 0, right: 14 }}>
            <XAxis type="number" domain={[0, 100]} tickFormatter={(value) => value + '%'} tick={{ fill: '#94a3b8', fontSize: 10 }} />
            <YAxis type="category" dataKey="name" width={88} tick={{ fill: '#94a3b8', fontSize: 10 }} />
            <Tooltip content={<TooltipCard />} cursor={{ fill: '#00d9ff12' }} />
            <Bar dataKey="clearance_rate" name="Clearance" isAnimationActive={false}>
              {assessed.map((c) => <Cell key={c.id} fill={c.clearance_rate < 50 ? '#ffb800' : '#00d9ff'} />)}
            </Bar>
          </BarChart>}
        </ResponsiveContainer>
      </div>}
  </Panel>
}

export function InterviewOutcomeChart({ summary }) {
  const rows = ['selected', 'rejected', 'pending', 'withdrawn'].map((name, index) => ({
    name, value: summary[name], color: tones[index],
  }))
  return <Panel title="Interview Outcomes" detail="Share of all recorded interviews."
    rows={summary.total_interviews ? rows.map(({ name, value }) => [name, `${value} · ${percent(value / summary.total_interviews * 100)}`]) : []}>
    {summary.total_interviews ? <div className="data-chart-canvas">
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <PieChart><Pie data={rows} dataKey="value" nameKey="name" innerRadius="50%" outerRadius="76%" isAnimationActive={false}>
          {rows.map((row) => <Cell key={row.name} fill={row.color} />)}
        </Pie><Tooltip contentStyle={tooltipStyle} itemStyle={{ color: '#e2e8f0' }} /></PieChart>
      </ResponsiveContainer>
    </div> : <p>No interviews in this period.</p>}
  </Panel>
}

export function PerformanceTrendChart({ data, kind = 'performance' }) {
  const [series, setSeries] = useState(kind === 'weakness' ? 'weaknesses' : kind === 'activity' ? 'interviews' : 'overall')
  const category = data.categories.find((item) => String(item.id) === series)
  const categoryMonths = new Map(data.category_months.filter((item) => item.round_type_id === category?.id).map((item) => [item.month, item]))
  const rows = data.months.map((month) => category
    ? { month: month.month, name: month.month.slice(0, 7), clearance_rate: categoryMonths.get(month.month)?.clearance_rate ?? null,
        attempted: categoryMonths.get(month.month)?.attempted ?? 0 }
    : { ...month, name: month.month.slice(0, 7) })
  const activity = kind === 'activity'
  const weaknesses = kind === 'weakness'
  const percentages = !weaknesses && !activity
  const lines = percentages
    ? (series === 'overall' ? [['selection_rate', 'Selection rate', '#22c55e'], ['clearance_rate', 'Round clearance', '#00d9ff']]
      : [[series === 'selection_rate' ? 'selection_rate' : 'clearance_rate', series === 'selection_rate' ? 'Selection rate' : 'Round clearance', '#00d9ff']])
    : [[series, { interviews: 'Interviews', selected: 'Selected', rejected: 'Rejected', weaknesses: 'Reports', average_severity: 'Average severity' }[series],
        series === 'rejected' ? '#ff3344' : series === 'selected' ? '#22c55e' : '#00d9ff']]
  const textual = rows.map((row) => [row.name, lines.map(([key, label]) =>
    `${label} ${percentages ? percent(row[key]) : row[key] == null ? 'Insufficient data' : Number(row[key]).toFixed(series === 'average_severity' ? 1 : 0)}`).join(' · ')
    + (percentages ? ` · ${row.attempted} attempts${row.selected === undefined ? '' : ` · ${row.selected + row.rejected} decisions`}` : '')])
  return <Panel title={weaknesses ? 'Weakness Trends' : activity ? 'Monthly Interview Activity' : 'Performance Growth'}
    detail={percentages ? 'Monthly rates use recorded outcomes. Gaps indicate insufficient data.' : undefined} rows={textual}>
    <label className="data-series">Chart series <select value={series} onChange={(e) => setSeries(e.target.value)}>
      {weaknesses ? <><option value="weaknesses">Report frequency</option><option value="average_severity">Average severity</option></>
        : activity ? <><option value="interviews">All interviews</option><option value="selected">Selections</option><option value="rejected">Rejections</option></>
          : <>
            <option value="overall">Selection and round clearance</option><option value="selection_rate">Selection rate</option>
            <option value="clearance_rate">Round clearance</option>
            {data.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </>}
    </select></label>
    {rows.some((row) => lines.some(([key]) => row[key] != null)) ? <div className="data-chart-canvas">
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <LineChart data={rows} margin={{ left: 0, right: 18, top: 12, bottom: 6 }}>
          <CartesianGrid stroke="#24536a" strokeDasharray="3 4" />
          <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 10 }} minTickGap={18} />
          <YAxis width={42} domain={percentages ? [0, 100] : series === 'average_severity' ? [0, 5] : [0, 'auto']}
            tickFormatter={(value) => percentages ? value + '%' : value} tick={{ fill: '#94a3b8', fontSize: 10 }} />
          <Tooltip content={<TooltipCard />} />
          {lines.map(([key, label, color]) => <Line key={key} name={label} dataKey={key} stroke={color}
            strokeWidth={2} connectNulls={false} isAnimationActive={false} />)}
        </LineChart>
      </ResponsiveContainer>
    </div> : <p>Insufficient data for this series.</p>}
  </Panel>
}

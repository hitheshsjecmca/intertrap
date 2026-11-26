import { useState } from 'react'
import { dateRange } from '../../utils/analyticsMetrics.js'

export default function DateRangeFilter({ onChange }) {
  const [preset, setPreset] = useState('all')
  const [custom, setCustom] = useState({ from: '', to: '' })
  const [issue, setIssue] = useState('')
  function apply(event) {
    event.preventDefault()
    if (!custom.from || !custom.to || custom.from > custom.to) {
      setIssue('Choose a start date and an end date in order.')
      return
    }
    setIssue('')
    onChange(custom)
  }
  return <form className="ws-card data-filters" onSubmit={apply}>
    <label>Date range <select value={preset} onChange={(e) => {
      const next = e.target.value
      setPreset(next); setIssue('')
      if (next !== 'custom') onChange(dateRange(next))
    }}>
      <option value="all">All time</option><option value="30">Last 30 days</option>
      <option value="90">Last 90 days</option><option value="6m">Last 6 months</option><option value="custom">Custom date range</option>
    </select></label>
    {preset === 'custom' && <>
      <label>From <input type="date" value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} /></label>
      <label>To <input type="date" value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} /></label>
      <button type="submit" className="ws-button">Apply dates</button>
    </>}
    {issue && <p role="alert" className="ws-error">{issue}</p>}
  </form>
}

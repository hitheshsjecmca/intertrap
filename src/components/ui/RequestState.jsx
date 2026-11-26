import { LoadingSignal } from './HudVisuals.jsx'

export function RequestState({ request, label }) {
  if (request.loading) return <div className="ws-card data-spaced">
    <LoadingSignal>{label}</LoadingSignal>
    <div className="data-skeleton" aria-hidden="true"><span /><span /><span /></div>
  </div>
  if (request.error) return <div className="ws-card data-spaced">
    <p role="alert" className="ws-error">{request.error}</p>
    <button type="button" className="ws-button ws-secondary" onClick={request.retry}>Retry</button>
  </div>
  return null
}

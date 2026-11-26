import { Link } from 'react-router-dom'

export function AddInterviewLink() {
  return <Link className="ws-button" to="/interviews/new">+ Add Interview</Link>
}

export function PageHeading({ title, description, action }) {
  return <header className="ws-heading">
    <div><h1>{title}</h1><p>{description}</p></div>
    {action}
  </header>
}

export function EmptyState({ title, children }) {
  return <section className="ws-card ws-empty"><h2>{title}</h2><p>{children}</p></section>
}

export function StatusBadge({ status }) {
  return <span className="ws-badge" data-status={status}>{status.replaceAll('_', ' ')}</span>
}

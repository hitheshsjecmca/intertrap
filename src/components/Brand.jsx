import { Link } from 'react-router-dom'

export default function Brand() {
  return (
    <Link className="brand" to="/">
      <span className="brand-mark" aria-hidden="true">IT</span>
      InterTrap
    </Link>
  )
}

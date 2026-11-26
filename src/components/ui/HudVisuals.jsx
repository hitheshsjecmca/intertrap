export function IntelligenceCore({ compact = false }) {
  return <div className={compact ? 'hud-core hud-core-compact' : 'hud-core'} aria-hidden="true">
    <span className="hud-core-ring hud-core-outer" />
    <span className="hud-core-ring hud-core-middle" />
    <span className="hud-core-ring hud-core-inner" />
    <span className="hud-core-center">IRIS</span>
  </div>
}

export function TelemetryGrid() {
  return <svg className="hud-telemetry" viewBox="0 0 220 148" aria-hidden="true" fill="none">
    <path d="M110 7 184 45 184 103 110 141 36 103 36 45Z
      M110 24 165 52 165 96 110 124 55 96 55 52Z
      M110 41 148 60 148 88 110 107 72 88 72 60Z
      M110 58 129 68 129 80 110 90 91 80 91 68Z" />
    <path d="M110 7v134M36 45l148 58M36 103l148-58" />
    <circle cx="110" cy="74" r="3" />
  </svg>
}

export function ProgressDial({ value, label }) {
  return <div className="hud-dial" role="img" aria-label={label} style={{ '--dial-value': value ?? 0 }}>
    <span aria-hidden="true">{value == null ? '—' : `${Math.round(value)}%`}</span>
  </div>
}

export function LoadingSignal({ children }) {
  return <p className="hud-loading" role="status"><span aria-hidden="true" />{children}</p>
}

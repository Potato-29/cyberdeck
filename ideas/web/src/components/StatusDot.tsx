import type { Status } from '../lib/api'

const LABELS: Record<Status, string> = {
  spark: 'spark',
  brewing: 'brewing',
  building: 'building',
  shipped: 'shipped',
  parked: 'parked',
  dropped: 'dropped',
}

export function statusColor(status: Status): string {
  return `var(--status-${status})`
}

export function StatusDot({ status, label = true }: { status: Status; label?: boolean }) {
  return (
    <span className="status-label">
      <span className="dot" style={{ background: statusColor(status) }} aria-hidden="true" />
      {label && <span>{LABELS[status]}</span>}
    </span>
  )
}

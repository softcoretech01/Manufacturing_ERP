/**
 * Shared formatters (V0-UIR-018).
 * Dates are never ambiguous dd/mm vs mm/dd. Amounts use the Indian numbering
 * system when the base currency is INR.
 */

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—'
  const d = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(d.getTime())) return '—'
  return `${String(d.getDate()).padStart(2, '0')}-${MONTHS[d.getMonth()]}-${d.getFullYear()}`
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '—'
  const d = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(d.getTime())) return '—'
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  return `${formatDate(d)} ${time}`
}

export function formatTimeAgo(value: string | Date | null | undefined): string {
  if (!value) return '—'
  const d = typeof value === 'string' ? new Date(value) : value
  const secs = Math.floor((Date.now() - d.getTime()) / 1000)
  if (secs < 60) return 'just now'
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `${days}d ago`
  return formatDate(d)
}

/** Indian grouping: 1,23,45,678.00 */
export function formatAmount(value: number | null | undefined, decimals = 2): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  const neg = value < 0
  const abs = Math.abs(value)
  const [whole, frac = ''] = abs.toFixed(decimals).split('.')
  let out: string
  if (whole.length <= 3) {
    out = whole
  } else {
    const last3 = whole.slice(-3)
    const rest = whole.slice(0, -3)
    out = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + last3
  }
  const result = decimals > 0 ? `${out}.${frac}` : out
  return neg ? `−${result}` : result
}

export function formatCurrency(value: number | null | undefined, code = 'INR'): string {
  if (value === null || value === undefined) return '—'
  const symbol = code === 'INR' ? '₹' : code === 'USD' ? '$' : code === 'EUR' ? '€' : code + ' '
  return `${symbol}${formatAmount(value)}`
}

/** Compact Indian short form for KPI tiles: 1.24 Cr, 82.4 L, 12.5 K */
export function formatCompact(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—'
  const abs = Math.abs(value)
  const sign = value < 0 ? '−' : ''
  if (abs >= 1e7) return `${sign}${(abs / 1e7).toFixed(2)} Cr`
  if (abs >= 1e5) return `${sign}${(abs / 1e5).toFixed(2)} L`
  if (abs >= 1e3) return `${sign}${(abs / 1e3).toFixed(1)} K`
  return `${sign}${abs.toFixed(0)}`
}

export function formatQty(value: number | null | undefined, decimals = 3): string {
  if (value === null || value === undefined) return '—'
  return formatAmount(value, decimals).replace(/\.?0+$/, (m) => (m.includes('.') ? '' : m))
}

export function formatPercent(value: number | null | undefined, decimals = 1): string {
  if (value === null || value === undefined) return '—'
  return `${value.toFixed(decimals)}%`
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('')
}

export function pluralise(n: number, one: string, many?: string): string {
  return n === 1 ? one : (many ?? one + 's')
}

export function formatDateTime(iso: string | null): string {
  if (iso === null) return '—'
  return new Date(iso).toLocaleString('zh-CN', { hour12: false })
}

export function formatMillis(value: number | null): string {
  return value === null ? '—' : `${value.toLocaleString('zh-CN')} ms`
}

export function formatNumber(value: number | null): string {
  return value === null ? '—' : value.toLocaleString('zh-CN')
}

export function shortFingerprint(value: string): string {
  if (value.length <= 16) return value
  return `${value.slice(0, 8)}…${value.slice(-6)}`
}

// /billing: time and cost per project over a date range, from the per-session
// records token-grid keeps in $.store (`time:<sessionId>`).

import type { DayTotals, SessionTime } from '../types'

export const dayKey = (at: number): string => {
  const d = new Date(at)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** Adds one request to a session's record, bucketed by local date. */
export const addRequest = (saved: SessionTime | undefined, root: string, at: number, ms: number, usd: number | undefined): SessionTime => {
  const day = dayKey(at)
  const days: Record<string, DayTotals> = { ...(saved?.days ?? {}) }
  const d = days[day] ?? { ms: 0, usd: 0, turns: 0 }
  days[day] = { ms: d.ms + ms, usd: d.usd + (usd ?? 0), turns: d.turns + 1 }
  return {
    root: saved?.root ?? root,
    firstAt: saved?.firstAt ?? at - ms,
    lastAt: at,
    lastMs: ms,
    activeMs: (saved?.activeMs ?? 0) + ms,
    turns: (saved?.turns ?? 0) + 1,
    days,
  }
}

type Range = { from: string; to: string; label: string }

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Reads a range word: today, week (last 7 days), month (default), last-month, all, YYYY-MM or YYYY-MM-DD. */
export const rangeOf = (word: string | undefined, now: number): Range | null => {
  const today = dayKey(now)
  const d = new Date(now)
  const monthRange = (y: number, m: number): Range => {
    const p = (n: number) => String(n).padStart(2, '0')
    const last = new Date(y, m + 1, 0).getDate()
    return { from: `${y}-${p(m + 1)}-01`, to: `${y}-${p(m + 1)}-${p(last)}`, label: `${MONTHS[m]} ${y}` }
  }
  const w = (word ?? 'month').toLowerCase()
  if (w === 'today') return { from: today, to: today, label: 'Today' }
  if (w === 'week') return { from: dayKey(now - 6 * 86_400_000), to: today, label: 'Last 7 days' }
  if (w === 'month') return monthRange(d.getFullYear(), d.getMonth())
  if (w === 'last-month') return monthRange(d.getMonth() === 0 ? d.getFullYear() - 1 : d.getFullYear(), (d.getMonth() + 11) % 12)
  if (w === 'all') return { from: '0000-00-00', to: '9999-99-99', label: 'All time' }
  let m = /^(\d{4})-(\d{2})$/.exec(w)
  if (m) return monthRange(+m[1], +m[2] - 1)
  m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(w)
  if (m) return { from: w, to: w, label: w }
  return null
}

const base = (root: string): string => root.split('/').filter(Boolean).pop() ?? root

const hm = (ms: number): string => {
  const m = Math.round(ms / 60_000)
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`
}
const hours = (ms: number): string => (ms / 3_600_000).toFixed(2)

type Totals = { ms: number; usd: number; turns: number; sessions: number }

export const USAGE = 'Usage: /billing [today | week | month | last-month | all | YYYY-MM | YYYY-MM-DD] [project] [csv]'

/** Builds the report text. Records made before per-day buckets count on their last day. */
export const billingReport = (records: readonly SessionTime[], args: string, now: number): string => {
  const words = args.trim().split(/\s+/).filter(Boolean)
  const csv = words.some(w => w.toLowerCase() === 'csv')
  const rest = words.filter(w => w.toLowerCase() !== 'csv')
  let range = rangeOf(rest[0], now)
  let filter = rest.slice(1).join(' ')
  if (!range) {
    range = rangeOf(undefined, now)!
    filter = rest.join(' ')
  }
  const { from, to } = range
  const want = filter.toLowerCase()

  // Name projects by folder; two folders with one name get their parent too.
  const roots = [...new Set(records.map(r => r.root))]
  const nameOf = (root: string): string => {
    const clash = roots.some(o => o !== root && base(o) === base(root))
    return clash ? root.split('/').filter(Boolean).slice(-2).join('/') : base(root)
  }

  const byProject = new Map<string, Totals>()
  const rows: { day: string; root: string; t: DayTotals }[] = []
  for (const r of records) {
    if (want && !r.root.toLowerCase().includes(want)) continue
    const days = r.days ?? { [dayKey(r.lastAt)]: { ms: r.activeMs, usd: 0, turns: r.turns } }
    let counted = false
    for (const [day, t] of Object.entries(days)) {
      if (day < from || day > to) continue
      const p = byProject.get(r.root) ?? { ms: 0, usd: 0, turns: 0, sessions: 0 }
      p.ms += t.ms
      p.usd += t.usd
      p.turns += t.turns
      if (!counted) p.sessions += 1
      counted = true
      byProject.set(r.root, p)
      rows.push({ day, root: r.root, t })
    }
  }

  const span = from === '0000-00-00' ? 'all recorded time' : from === to ? from : `${from} to ${to}`
  const head = `Billing: ${range.label} (${span})${filter ? `, projects matching "${filter}"` : ''}`
  if (byProject.size === 0) return `${head}\nNo time recorded in this range.\n${USAGE}`

  if (csv) {
    // One line per project per day, ready for a spreadsheet or an invoice.
    const merged = new Map<string, DayTotals>()
    for (const { day, root, t } of rows) {
      const k = `${day}\u0000${root}`
      const m = merged.get(k) ?? { ms: 0, usd: 0, turns: 0 }
      merged.set(k, { ms: m.ms + t.ms, usd: m.usd + t.usd, turns: m.turns + t.turns })
    }
    const q = (s: string) => `"${s.replace(/"/g, '""')}"`
    const lines = ['date,project,path,minutes,hours,usd,requests']
    for (const [k, t] of [...merged].sort(([a], [b]) => a.localeCompare(b))) {
      const [day, root] = k.split('\u0000')
      lines.push([day, q(nameOf(root)), q(root), Math.round(t.ms / 60_000), hours(t.ms), t.usd.toFixed(2), t.turns].join(','))
    }
    return `${head}\n\n\`\`\`csv\n${lines.join('\n')}\n\`\`\``
  }

  const list = [...byProject].sort(([, a], [, b]) => b.ms - a.ms)
  const total = list.reduce<Totals>(
    (s, [, t]) => ({ ms: s.ms + t.ms, usd: s.usd + t.usd, turns: s.turns + t.turns, sessions: s.sessions + t.sessions }),
    { ms: 0, usd: 0, turns: 0, sessions: 0 },
  )
  const table = [
    '| Project | Time | Hours | Cost | Requests | Sessions |',
    '|---|---:|---:|---:|---:|---:|',
    ...list.map(([root, t]) => `| ${nameOf(root)} | ${hm(t.ms)} | ${hours(t.ms)} | $${t.usd.toFixed(2)} | ${t.turns} | ${t.sessions} |`),
    `| **Total** | **${hm(total.ms)}** | **${hours(total.ms)}** | **$${total.usd.toFixed(2)}** | **${total.turns}** | **${total.sessions}** |`,
  ]
  return [
    head,
    '',
    ...table,
    '',
    'Time is Claude working on your requests (send to end of reply, approval waits included), not your own reading or typing time. Cost is the /cost estimate at API prices. Add `csv` for one line per project per day.',
  ].join('\n')
}

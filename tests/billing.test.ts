import { expect, test } from 'claude-code/testing'

import { addRequest, billingReport, dayKey, rangeOf } from '../hooks/billing'

const NOW = new Date(2026, 10, 17, 15, 0).getTime()
const DAY = 86_400_000

const session = (root: string, reqs: [number, number, number][]) =>
  reqs.reduce((s, [at, ms, usd]) => addRequest(s, root, at, ms, usd), undefined as ReturnType<typeof addRequest> | undefined)!

const A = session('/Users/x/App/FinValut', [
  [NOW - 2 * DAY, 30 * 60_000, 1.5],
  [NOW, 45 * 60_000, 2.25],
])
const B = session('/Users/x/App/clientco', [[NOW - 40 * DAY, 60 * 60_000, 4]])

test('requests bucket by local date', () => {
  expect(Object.keys(A.days ?? {})).toEqual([dayKey(NOW - 2 * DAY), dayKey(NOW)])
  expect(A.activeMs).toBe(75 * 60_000)
  expect(A.turns).toBe(2)
})

test('ranges', () => {
  expect(rangeOf('month', NOW)).toEqual({ from: '2026-11-01', to: '2026-11-30', label: 'Nov 2026' })
  expect(rangeOf('last-month', NOW)?.from).toBe('2026-10-01')
  expect(rangeOf('today', NOW)?.from).toBe('2026-11-17')
  expect(rangeOf('2026-02', NOW)?.to).toBe('2026-02-28')
  expect(rangeOf('clientco', NOW)).toBeNull()
})

test('this month sums per project; older sessions stay out', () => {
  const text = billingReport([A, B], '', NOW)
  expect(text).toContain('| FinValut | 1h 15m | 1.25 | $3.75 | 2 | 1 |')
  expect(text).not.toContain('clientco')
})

test('today counts only today; a project word filters', () => {
  expect(billingReport([A, B], 'today', NOW)).toContain('| FinValut | 0h 45m | 0.75 | $2.25 | 1 | 1 |')
  expect(billingReport([A, B], 'all clientco', NOW)).toContain('| clientco | 1h 00m | 1.00 | $4.00 | 1 | 1 |')
  expect(billingReport([A, B], 'all clientco', NOW)).not.toContain('FinValut |')
  expect(billingReport([A, B], 'clientco', NOW)).toContain('No time recorded')
})

test('csv has one line per project per day', () => {
  const text = billingReport([A], 'month csv', NOW)
  expect(text).toContain('date,project,path,minutes,hours,usd,requests')
  expect(text).toContain(`${dayKey(NOW)},"FinValut","/Users/x/App/FinValut",45,0.75,2.25,1`)
})

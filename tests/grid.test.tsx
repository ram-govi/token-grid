import { expect, mock, test } from 'claude-code/testing'

import { duration, gridSvg, linesOf, outlierColor, writeShareOf } from '../hooks/register'

const BAND = {
  plugin: 'token-grid',
  component: 'AbovePrompt',
  props: { hasSurvey: false, isCollapsed: false, isWorking: false, maxRows: 10, bodyColumns: 100, scroll: { offset: 0, bodyRows: 10 }, view: {} },
} as const

const READING = {
  tokens: 272_300,
  window: 1_000_000,
  percent: 27,
  limits: [
    { kind: 'five_hour', percent: 41 },
    { kind: 'seven_day', percent: 12.5 },
  ],
  usd: 3.21,
}

test('the band shows context and rate limits, on terminal and desktop', async ($, on) => {
  mock.clock(on)
  on('state.get', () => ({ value: { value: READING, version: 1 } }))

  const term = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await term.find({ type: 'Text', text: /272\.3k \/ 1M {2}27% {2}\$3\.21/ })).toBeDefined()
  expect(await term.find({ type: 'Text', text: '5h limit' })).toBeDefined()
  expect(await term.find({ type: 'Text', text: '7d limit' })).toBeDefined()
  await term.unmount()

  const desk = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await desk.find({ type: 'Svg' })).toBeDefined()
  await desk.unmount()
})

test('the last request shows its tokens, cost and share', async ($, on) => {
  mock.clock(on)
  const LAST = { added: 12_300, input: 412_000, output: 3_200, usd: 0.42, share: 13, writeShare: 0.3 }
  on('state.get', (_$, e) => ({
    value: { value: (e as { key: string }).key === 'last' ? LAST : READING, version: 1 },
  }))
  const term = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await term.find({ type: 'Text', text: 'Last req' })).toBeDefined()
  expect(await term.find({ type: 'Text', text: '+12.3k ctx' })).toBeDefined()
  expect(await term.find({ type: 'Text', text: 'out 3.2k' })).toBeDefined()
  expect(await term.find({ type: 'Text', text: /\$0\.42 {2}13%/ })).toBeDefined()
  await term.unmount()

  const desk = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await desk.find({ type: 'Svg' })).toBeDefined()
  await desk.unmount()
})

test('a share under 1% reads <1%, and the desktop keeps double spaces', async ($, on) => {
  mock.clock(on)
  const LAST = { added: 180, input: 152_000, output: 64, usd: 0.03, share: 0.3, writeShare: 0.02 }
  on('state.get', (_$, e) => ({
    value: { value: (e as { key: string }).key === 'last' ? LAST : READING, version: 1 },
  }))
  const term = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await term.find({ type: 'Text', text: /\$0\.03 {2}<1%/ })).toBeDefined()
  await term.unmount()
  expect(gridSvg(linesOf(READING, 0), 700)).toContain('xml:space="preserve"')
})

test('time sits on the right: session total on Context, the request on Last req', () => {
  const LAST = { added: 1, input: 1, output: 1, usd: 0.1, share: 5, writeShare: 0.1 }
  const lines = linesOf(READING, 0, LAST, { lastMs: 134_000, activeMs: 4_320_000, turns: 9 })
  expect(lines.map(l => l.label)).not.toContain('Time')
  expect(lines[0].aside).toBe('⏱ 1h 12m')
  expect(lines[1].aside).toBe('⏱ 2m 14s')
  expect(gridSvg(lines, 700)).toContain('⏱ 2m 14s')
  expect(duration(42_000)).toBe('42s')
  expect(linesOf(READING, 0, null, null).some(l => l.aside)).toBe(false)
})

test('cost colour flags a request well above the session average', () => {
  expect(outlierColor(undefined)).toBeUndefined()
  expect(outlierColor(1.9)).toBeUndefined()
  expect(outlierColor(2)).toBe('#e0a040')
  expect(outlierColor(4.5)).toBe('#e05a4f')
  const LAST = { added: 1, input: 1, output: 1, usd: 1.2, share: 30, vsAvg: 5, writeShare: 0.1 }
  const line = linesOf(READING, 0, LAST)[1]
  expect(line.parts?.find(p => p.text === '$1.20  30%')?.color).toBe('#e05a4f')
  expect(gridSvg([line], 700)).toContain('<tspan fill="#e05a4f">$1.20  30%</tspan>')
  const quiet = linesOf(READING, 0, { ...LAST, vsAvg: 1 })[1]
  expect(quiet.parts?.find(p => p.text === '$1.20  30%')?.color).toBeUndefined()
})

test('write share weighs output at 5x input and cache reads at a tenth', () => {
  expect(writeShareOf({ input_tokens: 0, output_tokens: 1_000, cache_read_input_tokens: 50_000, cache_creation_input_tokens: 0 })).toBe(0.5)
  expect(writeShareOf({ input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 })).toBeUndefined()
})

test('no reading, no row', async ($, on) => {
  mock.clock(on)
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /Context/ })).toBeUndefined()
  await ui.unmount()
})

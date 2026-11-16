import { expect, mock, test } from 'claude-code/testing'

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
  const LAST = { input: 412_000, output: 3_200, usd: 0.42, share: 13 }
  on('state.get', (_$, e) => ({
    value: { value: (e as { key: string }).key === 'last' ? LAST : READING, version: 1 },
  }))
  const term = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await term.find({ type: 'Text', text: 'Last req' })).toBeDefined()
  expect(await term.find({ type: 'Text', text: /in 412k · out 3\.2k {2}\$0\.42 {2}13%/ })).toBeDefined()
  await term.unmount()
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

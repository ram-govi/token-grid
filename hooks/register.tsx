// Token Grid: dotted bars above the prompt for the context window's fill and
// the account's rate-limit windows (5h, 7d), in the savvy-progress dither style.
//
// session.start reads $.session.usage() once; session.measure pushes every
// change after that. The band draws one SVG on the desktop, block text in the
// terminal.

import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionContextUsage, SessionCost, SessionRateLimit } from 'claude-code'

import type { LastTurn, Limit, Reading } from '../types'

const reading = atom({ plugin: 'token-grid', key: 'reading' } as const, null)
const last = atom({ plugin: 'token-grid', key: 'last' } as const, null)
const startUsd = atom({ plugin: 'token-grid', key: 'startUsd' } as const, null)
const startTokens = atom({ plugin: 'token-grid', key: 'startTokens' } as const, null)

const LINE_H = 20
const BAR_H = 12
const CELL = 3
const LABEL_W = 64
const VALUE_W = 190
const FONT = "-apple-system,BlinkMacSystemFont,'SF Pro Text','Segoe UI',sans-serif"

// Fill colour by how full the bar is.
const colorFor = (pct: number): string =>
  pct < 50 ? '#5fbf8f' : pct < 75 ? '#8f8cf4' : pct < 90 ? '#e0a040' : '#e05a4f'
const termColorFor = (pct: number): string => (pct < 50 ? 'green' : pct < 75 ? 'cyan' : pct < 90 ? 'yellow' : 'red')

// Last req: reading (input, cache) in blue, writing (output) in orange.
const READ = '#5b9cf0'
const WRITE = '#e8913a'

// Relative price per token, the same ratio on every Claude model: input 1,
// cache read 0.1, cache write 1.25, output 5. Only the ratio matters here.
export const writeShareOf = (u: { input_tokens: number; output_tokens: number; cache_read_input_tokens: number; cache_creation_input_tokens: number }): number | undefined => {
  const write = 5 * u.output_tokens
  const read = u.input_tokens + 0.1 * u.cache_read_input_tokens + 1.25 * u.cache_creation_input_tokens
  return write + read > 0 ? write / (write + read) : undefined
}

const LIMIT_LABEL: Record<string, string> = { five_hour: '5h limit', seven_day: '7d limit', spend_limit: 'Spend' }

// Deterministic noise so the dither does not shimmer between redraws.
const noise = (x: number, y: number): number => {
  const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453
  return s - Math.floor(s)
}

export const short = (n: number): string =>
  n >= 1e6 ? `${+(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${+(n / 1e3).toFixed(1)}k` : `${Math.round(n)}`

const xml = (s: string): string =>
  s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c)

export const resetIn = (iso: string | undefined, at: number): string => {
  if (!iso) return ''
  const ms = Date.parse(iso) - at
  if (!Number.isFinite(ms) || ms <= 0) return ''
  const h = Math.floor(ms / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  return h >= 24 ? `${Math.floor(h / 24)}d ${h % 24}h` : h ? `${h}h ${m}m` : `${m}m`
}

type Part = { text: string; color?: string }
// split: the share of the filled bar drawn in WRITE, the rest in READ.
type Line = { label: string; pct: number; value: string; parts?: Part[]; split?: number }

export const linesOf = (r: Reading, at: number, lt: LastTurn | null = null): Line[] => {
  const lines: Line[] = [
    {
      label: 'Context',
      pct: r.percent,
      value: `${short(r.tokens)} / ${short(r.window)}  ${r.percent}%${r.usd !== undefined ? `  $${r.usd.toFixed(2)}` : ''}`,
    },
  ]
  if (lt) {
    const tail = [lt.usd !== undefined ? `$${lt.usd.toFixed(2)}` : '', lt.share !== undefined ? (lt.share > 0 && lt.share < 1 ? '<1%' : `${Math.round(lt.share)}%`) : '']
      .filter(Boolean)
      .join('  ')
    const parts: Part[] = [
      { text: `${lt.added < 0 ? '−' : '+'}${short(Math.abs(lt.added))} ctx`, color: READ },
      { text: ' · ' },
      { text: `out ${short(lt.output)}`, color: WRITE },
      ...(tail ? [{ text: `  ${tail}` }] : []),
    ]
    lines.push({
      label: 'Last req',
      pct: lt.share ?? 0,
      value: parts.map(p => p.text).join(''),
      parts,
      split: lt.writeShare,
    })
  }
  for (const l of r.limits) {
    const reset = resetIn(l.resetsAt, at)
    lines.push({
      label: LIMIT_LABEL[l.kind] ?? l.kind,
      pct: Math.min(100, l.percent),
      value: `${Math.round(l.percent)}%${reset ? `  ↻ ${reset}` : ''}`,
    })
  }
  return lines
}

const barSvg = (line: Line, y: number, barW: number, seed: number): string => {
  const color = colorFor(line.pct)
  const raw = Math.round((barW * Math.max(0, Math.min(100, line.pct))) / 100)
  const fillW = line.split !== undefined && line.pct > 0 ? Math.max(raw, 4 * CELL) : raw
  const cols = Math.floor(fillW / CELL)
  const rows = Math.floor(BAR_H / CELL)
  const readCols = line.split === undefined ? cols : Math.round(cols * (1 - line.split))
  const dots: string[] = []
  const writeDots: string[] = []
  // Sparse at the start, dense toward the head, as savvy-progress draws it.
  for (let c = 0; c < cols; c++) {
    const density = 0.35 + 0.6 * Math.pow(c / Math.max(1, cols), 1.2)
    for (let r = 0; r < rows; r++) {
      if (noise(c + seed, r) < density) {
        ;(c < readCols ? dots : writeDots).push(`<rect class="t${Math.floor(noise(r, c + seed) * 4)}" x="${c * CELL + 1}" y="${r * CELL + 1}" width="2" height="2"/>`)
      }
    }
  }
  // Quarter ticks on the empty part.
  const ticks = [25, 50, 75]
    .map(p => Math.round((barW * p) / 100))
    .filter(x => x > fillW + 3)
    .map(x => `<rect x="${x}" y="${BAR_H / 2 - 3}" width="1.5" height="6" rx="0.75"/>`)
    .join('')
  const by = y + (LINE_H - BAR_H) / 2
  return `<text class="m" x="0" y="${y + LINE_H / 2 + 4}" font-family="${FONT}" font-size="12" font-weight="500">${xml(line.label)}</text>
<g transform="translate(${LABEL_W},${by})">
<rect class="k" width="${barW}" height="${BAR_H}" rx="${BAR_H / 2}"/>
<g clip-path="url(#c${seed})"><g fill="${line.split === undefined ? color : READ}">${dots.join('')}</g><g fill="${WRITE}">${writeDots.join('')}</g><g class="tk">${ticks}</g></g>
</g>
<text class="t" xml:space="preserve" x="${LABEL_W + barW + VALUE_W}" y="${y + LINE_H / 2 + 4}" text-anchor="end" font-family="${FONT}" font-size="12" font-variant-numeric="tabular-nums">${line.parts ? line.parts.map(p => (p.color ? `<tspan fill="${p.color}">${xml(p.text)}</tspan>` : `<tspan>${xml(p.text)}</tspan>`)).join('') : xml(line.value)}</text>`
}

export const gridSvg = (lines: Line[], W: number): string => {
  const barW = Math.max(60, W - LABEL_W - VALUE_W - 8)
  const H = lines.length * LINE_H
  const clips = lines
    .map((_, i) => `<clipPath id="c${i * 17}"><rect width="${barW}" height="${BAR_H}" rx="${BAR_H / 2}"/></clipPath>`)
    .join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<style>
.t{fill:#1f1f1f}.m{fill:#6b6b68}.k{fill:#e4e4e2}.tk{fill:#b4b4b0}
@media (prefers-color-scheme: dark){.t{fill:#ececec}.m{fill:#9a9a9a}.k{fill:#2c2c2c}.tk{fill:#5a5a5a}}
.t0,.t1,.t2,.t3{animation:tw 3.2s ease-in-out infinite}
.t1{animation-duration:3.8s;animation-delay:-.7s}.t2{animation-duration:4.4s;animation-delay:-1.3s}.t3{animation-duration:3.5s;animation-delay:-.4s}
@keyframes tw{0%,100%{opacity:1}50%{opacity:.75}}
@media (prefers-reduced-motion: reduce){.t0,.t1,.t2,.t3{animation:none}}
</style>
<defs>${clips}</defs>
${lines.map((l, i) => barSvg(l, i * LINE_H, barW, i * 17)).join('\n')}
</svg>`
}

const filledOf = (pct: number, width: number): number => Math.round((width * Math.max(0, Math.min(100, pct))) / 100)
const blocks = (pct: number, width: number): string => {
  const filled = filledOf(pct, width)
  return '⣿'.repeat(filled) + '⣀'.repeat(Math.max(0, width - filled))
}

const toReading = (context: SessionContextUsage, limits: readonly SessionRateLimit[], cost: SessionCost | undefined): Reading | null => {
  if (!context.window) return null
  const tokens = context.tokens ?? 0
  return {
    tokens,
    window: context.window,
    percent: Math.round(context.percent ?? (tokens / context.window) * 100),
    limits: limits.map((l): Limit => ({ kind: l.kind, percent: l.percentUsed, resetsAt: l.resetsAt })),
    usd: cost?.usd,
  }
}

async function takeReading($: EngineInterface): Promise<Reading | null> {
  try {
    const u = await $.session.usage()
    const r = toReading(u.context, u.rateLimits, u.cost)
    if (r) await update($, reading, () => r)
    return r
  } catch {
    // No reading; the band keeps the last one.
    return null
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    await takeReading($)
    return result
  })

  on('session.measure', async ($, e, next) => {
    const result = await next(e)
    const r = toReading(e.context, e.rateLimits, e.cost)
    if (r) await update($, reading, () => r)
    return result
  })

  // A request = one main-loop turn. Its cost is the session cost's growth from
  // turn.start to turn.complete, subagents included; its tokens are the main
  // loop's own API calls; what it shows is how far it grew the context.
  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) {
      const r = (await takeReading($)) ?? (await read($, reading))
      await update($, startUsd, () => r?.usd ?? null)
      await update($, startTokens, () => r?.tokens ?? null)
    }
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId !== undefined || !e.usage) return result
    const u = e.usage
    const r = await takeReading($)
    const from = await read($, startUsd)
    const fromTokens = await read($, startTokens)
    const usd = r?.usd !== undefined && from !== null ? Math.max(0, r.usd - from) : undefined
    const share = usd !== undefined && r?.usd ? (usd / r.usd) * 100 : undefined
    const lt: LastTurn = {
      added: r && fromTokens !== null ? r.tokens - fromTokens : 0,
      input: u.input_tokens + u.cache_read_input_tokens + u.cache_creation_input_tokens,
      output: u.output_tokens,
      usd,
      share,
      writeShare: writeShareOf(u),
    }
    await update($, last, () => lt)
    return result
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const r = await read($, reading)
    if (r === null || e.props.hasSurvey) return next(e)

    const ui = $.ui.resolve(e)
    const { Box, Text } = ui
    const lines = linesOf(r, await $.clock.now(), await read($, last))

    // The terminal's table lists Svg too, but its band refuses one: text there.
    if (e.surface !== 'terminal' && 'Svg' in ui) {
      const { Svg } = ui
      const width = Math.max(260, Math.min(1600, (e.props.bodyColumns || 100) * 8 - 40))
      const alt = lines.map(l => `${l.label} ${l.value}`).join('; ')
      return <Svg source={gridSvg(lines, width)} alt={alt} width={width} height={lines.length * LINE_H} />
    }

    const cols = e.props.bodyColumns || 80
    const barW = Math.max(8, Math.min(40, cols - 40))
    return (
      <Box flexDirection="column">
        {lines.map(l => (
          <Box key={l.label} flexDirection="row" gap={1}>
            <Box width={9} flexShrink={0}>
              <Text dimColor>{l.label}</Text>
            </Box>
            {l.split === undefined ? (
              <Text color={termColorFor(l.pct)}>{blocks(l.pct, barW)}</Text>
            ) : (
              (() => {
                const filled = l.pct > 0 ? Math.max(2, filledOf(l.pct, barW)) : 0
                const write = Math.round(filled * (l.split ?? 0))
                return (
                  <Text>
                    <Text color={READ}>{'⣿'.repeat(filled - write)}</Text>
                    <Text color={WRITE}>{'⣿'.repeat(write)}</Text>
                    <Text dimColor>{'⣀'.repeat(Math.max(0, barW - filled))}</Text>
                  </Text>
                )
              })()
            )}
            {l.parts ? (
              <Text>
                {l.parts.map((p, i) => (
                  <Text key={i} color={p.color}>
                    {p.text}
                  </Text>
                ))}
              </Text>
            ) : (
              <Text>{l.value}</Text>
            )}
          </Box>
        ))}
      </Box>
    )
  })
}

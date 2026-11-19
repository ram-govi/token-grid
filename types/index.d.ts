export type Limit = { kind: string; percent: number; resetsAt?: string }
export type Reading = {
  tokens: number
  window: number
  percent: number
  limits: Limit[]
  usd?: number
}
/** The last main-loop request: tokens its API calls read and wrote, and what it cost. */
export type LastTurn = {
  /** Tokens the request added to the context window (end minus start; negative after a compact). */
  added: number
  /** Input tokens summed over every API call of the request, cache reads included. */
  input: number
  output: number
  usd?: number
  /** Share of the session's cost, 0-100. */
  share?: number
  /** This request's cost over the session's average per earlier request (2 = twice the usual). */
  vsAvg?: number
  /** Estimated part of the request's cost spent writing (output), 0-1; the rest is reading. */
  writeShare?: number
}
/** Time Claude spent working: the last request, and every request this session. */
export type TimeSpent = {
  lastMs: number
  activeMs: number
  turns: number
}
/** One local date's share of a session: time, cost and requests. */
export type DayTotals = { ms: number; usd: number; turns: number }
/** What $.store keeps per session (key `time:<sessionId>`), so a resume carries on and /billing can sum it. */
export type SessionTime = TimeSpent & { root: string; firstAt: number; lastAt: number; days?: Record<string, DayTotals> }

declare module 'claude-code' {
  interface PluginState {
    'token-grid': { reading: Reading | null; last: LastTurn | null; startUsd: number | null; startTokens: number | null; time: TimeSpent | null }
  }
}

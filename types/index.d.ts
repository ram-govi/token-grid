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
  input: number
  output: number
  usd?: number
  /** Share of the session's cost, 0-100. */
  share?: number
}

declare module 'claude-code' {
  interface PluginState {
    'token-grid': { reading: Reading | null; last: LastTurn | null; startUsd: number | null }
  }
}

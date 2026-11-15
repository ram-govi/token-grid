export type Limit = { kind: string; percent: number; resetsAt?: string }
export type Reading = {
  tokens: number
  window: number
  percent: number
  limits: Limit[]
  usd?: number
}

declare module 'claude-code' {
  interface PluginState {
    'token-grid': { reading: Reading | null }
  }
}

export type LoadPhase = 'idle' | 'loading' | 'ready' | 'error'

export interface LoadState<T> {
  phase: LoadPhase
  data: T | null
  error: unknown | null
}

export interface ScopedResource<T> {
  owner: string
  state: LoadState<T>
}

export function loading<T>(): LoadState<T> {
  return { phase: 'loading', data: null, error: null }
}

export function ready<T>(data: T): LoadState<T> {
  return { phase: 'ready', data, error: null }
}

export function failed<T>(error: unknown): LoadState<T> {
  return { phase: 'error', data: null, error }
}

// 资源与 owner 绑定：切换账号后旧数据在当前提交内即不可见
export function scopedState<T>(
  apiKey: string | null,
  stored: ScopedResource<T> | null,
): LoadState<T> {
  if (apiKey === null) return { phase: 'idle', data: null, error: null }
  if (stored === null || stored.owner !== apiKey) return loading<T>()
  return stored.state
}

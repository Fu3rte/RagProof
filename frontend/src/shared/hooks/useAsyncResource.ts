import { useCallback, useEffect, useState } from 'react'

import { isCancelledError } from '@/shared/http/apiClient'

export type LoadPhase = 'loading' | 'ready' | 'error'

type Settled<T> = { data: T; error: null } | { data: null; error: unknown }

// load 必须稳定（导入函数或 useCallback）：它直接作为 effect 依赖，切换主体靠调用方重挂载
export function useAsyncResource<T>(load: (signal: AbortSignal) => Promise<T>) {
  const [nonce, setNonce] = useState(0)
  const [settled, setSettled] = useState<Settled<T> | null>(null)

  useEffect(() => {
    let active = true
    const controller = new AbortController()
    load(controller.signal)
      .then((data) => {
        if (active) setSettled({ data, error: null })
      })
      .catch((error: unknown) => {
        if (active && !isCancelledError(error)) setSettled({ data: null, error })
      })
    return () => {
      active = false
      controller.abort()
    }
  }, [load, nonce])

  const phase: LoadPhase = settled === null ? 'loading' : settled.error === null ? 'ready' : 'error'
  return {
    phase,
    data: settled?.data ?? null,
    error: settled?.error ?? null,
    reload: useCallback(() => setNonce((value) => value + 1), []),
    commit: useCallback((data: T) => setSettled({ data, error: null }), []),
  }
}

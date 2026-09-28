import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { ReactNode } from 'react'

import { fetchMe } from '@/api/system'

export interface AuthValue {
  apiKey: string | null
  ownerId: string | null
  signal: AbortSignal
  connecting: boolean
  connected: boolean
  connect: (apiKey: string) => Promise<string>
  disconnect: () => void
}

interface Session {
  apiKey: string | null
  ownerId: string | null
  signal: AbortSignal
}

const AuthContext = createContext<AuthValue | null>(null)

// 未连接状态下 pages 不发起请求，该 signal 仅用于占位
const IDLE_SIGNAL = new AbortController().signal
const ANONYMOUS: Session = { apiKey: null, ownerId: null, signal: IDLE_SIGNAL }

export function AuthProvider({ children }: { children: ReactNode }) {
  const controllerRef = useRef<AbortController | null>(null)
  const [session, setSession] = useState<Session>(ANONYMOUS)
  const [connecting, setConnecting] = useState(false)

  // 每次连接、切换或断开都换新 signal，并中断上一代仍在执行的请求
  const beginGeneration = useCallback((): AbortController => {
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    return controller
  }, [])

  const connect = useCallback(
    async (apiKey: string): Promise<string> => {
      const controller = beginGeneration()
      const anonymous: Session = { apiKey: null, ownerId: null, signal: controller.signal }
      setConnecting(true)
      setSession(anonymous)
      try {
        const me = await fetchMe(apiKey, controller.signal)
        setSession({ apiKey, ownerId: me.owner_id, signal: controller.signal })
        return me.owner_id
      } catch (error) {
        setSession(anonymous)
        throw error
      } finally {
        setConnecting(false)
      }
    },
    [beginGeneration],
  )

  const disconnect = useCallback((): void => {
    setSession({ apiKey: null, ownerId: null, signal: beginGeneration().signal })
    setConnecting(false)
  }, [beginGeneration])

  const value = useMemo<AuthValue>(
    () => ({
      apiKey: session.apiKey,
      ownerId: session.ownerId,
      signal: session.signal,
      connecting,
      connected: session.apiKey !== null && session.ownerId !== null,
      connect,
      disconnect,
    }),
    [session, connecting, connect, disconnect],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext)
  if (value === null) {
    throw new Error('useAuth 必须在 AuthProvider 内使用')
  }
  return value
}

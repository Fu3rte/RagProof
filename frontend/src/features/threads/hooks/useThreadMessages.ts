import { useCallback, useState } from 'react'

import { MESSAGE_PAGE_SIZE, listThreadMessages } from '@/features/threads/api/threadClient'
import type { ThreadMessage } from '@/features/threads/types/threads'
import { useAsyncResource } from '@/shared/hooks/useAsyncResource'

export interface MessageWindow {
  messages: ThreadMessage[]
  previousCursor: number | null
}

// 调用方按 thread_id 重挂载本 Hook，切换 Thread 时旧请求的结果不再写入任何状态
export function useThreadMessages(threadId: string) {
  const loadLatest = useCallback(
    async (signal: AbortSignal): Promise<MessageWindow> => {
      const page = await listThreadMessages(threadId, { limit: MESSAGE_PAGE_SIZE }, signal)
      return { messages: page.messages, previousCursor: page.previous_cursor }
    },
    [threadId],
  )
  const resource = useAsyncResource(loadLatest)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [olderError, setOlderError] = useState<unknown | null>(null)

  const loadOlder = useCallback(async (): Promise<void> => {
    const window = resource.data
    if (window === null || window.previousCursor === null || loadingOlder) return
    setLoadingOlder(true)
    setOlderError(null)
    const controller = new AbortController()
    try {
      const page = await listThreadMessages(
        threadId,
        { before: window.previousCursor, limit: MESSAGE_PAGE_SIZE },
        controller.signal,
      )
      // before 严格早于游标，更早页整体前置即保持 sequence 升序
      resource.commit({
        messages: [...page.messages, ...window.messages],
        previousCursor: page.previous_cursor,
      })
    } catch (error: unknown) {
      setOlderError(error)
    } finally {
      setLoadingOlder(false)
    }
  }, [resource, threadId, loadingOlder])

  return {
    window: resource.data,
    phase: resource.phase,
    error: resource.error,
    reload: resource.reload,
    loadOlder,
    loadingOlder,
    olderError,
  }
}

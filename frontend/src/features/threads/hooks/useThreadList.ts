import { useCallback, useState } from 'react'

import { createThread, listThreads } from '@/features/threads/api/threadClient'
import type { ThreadDetail } from '@/features/threads/types/threads'
import { useAsyncResource } from '@/shared/hooks/useAsyncResource'

export function useThreadList() {
  const resource = useAsyncResource(listThreads)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<unknown | null>(null)

  const create = useCallback(
    async (title: string): Promise<ThreadDetail> => {
      const controller = new AbortController()
      setCreating(true)
      setCreateError(null)
      try {
        const created = await createThread(title, controller.signal)
        // 新建结果来自服务端回读，前置到列表，其余条目仍是列表接口的权威数据
        resource.commit([created, ...(resource.data ?? [])])
        return created
      } catch (error: unknown) {
        setCreateError(error)
        throw error
      } finally {
        setCreating(false)
      }
    },
    [resource],
  )

  return {
    threads: resource.data,
    phase: resource.phase,
    error: resource.error,
    reload: resource.reload,
    create,
    creating,
    createError,
  }
}

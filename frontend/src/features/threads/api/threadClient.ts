import { apiRequest } from '@/shared/http/apiClient'
import type {
  ThreadDetail,
  ThreadListResponse,
  ThreadMessagePage,
  ThreadSummary,
} from '@/features/threads/types/threads'

const THREADS_PATH = '/v1/threads'

export const MESSAGE_PAGE_SIZE = 200

export function listThreads(signal: AbortSignal): Promise<ThreadSummary[]> {
  return apiRequest<ThreadListResponse>(THREADS_PATH, { signal }).then((page) => page.threads)
}

// title 留空时提交空对象，由服务端决定默认标题
export function createThread(title: string, signal: AbortSignal): Promise<ThreadDetail> {
  const trimmed = title.trim()
  return apiRequest<ThreadDetail>(THREADS_PATH, {
    method: 'POST',
    body: trimmed.length === 0 ? {} : { title: trimmed },
    signal,
  })
}

export function listThreadMessages(
  threadId: string,
  options: { before?: number; limit: number },
  signal: AbortSignal,
): Promise<ThreadMessagePage> {
  const params = new URLSearchParams({ limit: String(options.limit) })
  if (options.before !== undefined) params.set('before', String(options.before))
  return apiRequest<ThreadMessagePage>(
    `${THREADS_PATH}/${encodeURIComponent(threadId)}/messages?${params}`,
    { signal },
  )
}

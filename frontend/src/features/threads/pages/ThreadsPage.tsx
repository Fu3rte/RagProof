import { useNavigate, useParams } from 'react-router-dom'

import { ThreadList } from '@/features/threads/components/ThreadList'
import { ThreadSelectionHint } from '@/features/threads/components/ThreadSelectionHint'
import { ThreadWorkspace } from '@/features/threads/components/ThreadWorkspace'
import { useThreadList } from '@/features/threads/hooks/useThreadList'
import { isValidThreadId } from '@/features/threads/utils/threadView'

// 选中状态由地址承载：刷新后按 URL 从服务端回读列表与消息历史
export function ThreadsPage() {
  const { threadId } = useParams<{ threadId?: string }>()
  const navigate = useNavigate()
  const list = useThreadList()

  const selected = list.threads?.find((thread) => thread.thread_id === threadId) ?? null

  function handleSelect(nextThreadId: string): void {
    navigate(`/threads/${nextThreadId}`)
  }

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
      <ThreadList
        threads={list.threads}
        phase={list.phase}
        error={list.error}
        selectedId={threadId ?? null}
        creating={list.creating}
        createError={list.createError}
        onReload={list.reload}
        onCreate={(title) =>
          list.create(title).then((created) => {
            handleSelect(created.thread_id)
            return created
          })
        }
        onSelect={handleSelect}
      />

      {threadId === undefined ? (
        <ThreadSelectionHint reason="none" />
      ) : !isValidThreadId(threadId) ? (
        <ThreadSelectionHint reason="invalid" threadId={threadId} />
      ) : (
        <ThreadWorkspace key={threadId} threadId={threadId} thread={selected} />
      )}
    </div>
  )
}

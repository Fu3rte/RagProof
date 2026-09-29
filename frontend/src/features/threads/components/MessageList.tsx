import { RiArrowUpLine, RiRefreshLine } from '@remixicon/react'

import { Button } from '@/components/ui/button'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { MessageRow } from '@/features/threads/components/MessageRow'
import type { MessageWindow } from '@/features/threads/hooks/useThreadMessages'
import { ErrorAlert } from '@/shared/components/ErrorAlert'
import type { LoadPhase } from '@/shared/hooks/useAsyncResource'

interface MessageListProps {
  window: MessageWindow | null
  phase: LoadPhase
  error: unknown | null
  loadingOlder: boolean
  olderError: unknown | null
  onLoadOlder: () => void
  onReload: () => void
}

export function MessageList({
  window,
  phase,
  error,
  loadingOlder,
  olderError,
  onLoadOlder,
  onReload,
}: MessageListProps) {
  if (window === null && phase === 'loading') {
    return (
      <div className="grid gap-2">
        <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
          <Spinner />
          正在读取消息历史…
        </div>
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    )
  }

  if (window === null && phase === 'error' && error !== null) {
    return (
      <div className="grid gap-2">
        <ErrorAlert error={error} />
        <Button variant="outline" size="sm" onClick={onReload}>
          重新读取历史
        </Button>
      </div>
    )
  }

  if (window === null) return null

  return (
    <div className="grid gap-2">
      {window.previousCursor !== null ? (
        <Button
          variant="outline"
          size="sm"
          className="w-fit"
          disabled={loadingOlder}
          onClick={onLoadOlder}
        >
          {loadingOlder ? <Spinner /> : <RiArrowUpLine />}
          加载更早的消息
        </Button>
      ) : (
        <p className="text-muted-foreground text-xs">
          已到达该对话的开头。
        </p>
      )}
      {olderError !== null ? <ErrorAlert error={olderError} /> : null}
      {window.messages.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <RiRefreshLine aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>这条对话还没有消息</EmptyTitle>
            <EmptyDescription>消息历史由服务端的问答运行写入。</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div>
          {window.messages.map((message) => (
            <MessageRow key={message.id} message={message} />
          ))}
        </div>
      )}
    </div>
  )
}

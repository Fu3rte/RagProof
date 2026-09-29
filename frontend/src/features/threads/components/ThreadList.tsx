import { RiRefreshLine } from '@remixicon/react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { NewThreadForm } from '@/features/threads/components/NewThreadForm'
import { ThreadListItem } from '@/features/threads/components/ThreadListItem'
import type { ThreadSummary } from '@/features/threads/types/threads'
import { ErrorAlert } from '@/shared/components/ErrorAlert'
import type { LoadPhase } from '@/shared/hooks/useAsyncResource'

interface ThreadListProps {
  threads: ThreadSummary[] | null
  phase: LoadPhase
  error: unknown | null
  selectedId: string | null
  creating: boolean
  createError: unknown | null
  onReload: () => void
  onCreate: (title: string) => Promise<unknown>
  onSelect: (threadId: string) => void
}

export function ThreadList({
  threads,
  phase,
  error,
  selectedId,
  creating,
  createError,
  onReload,
  onCreate,
  onSelect,
}: ThreadListProps) {
  return (
    <Card className="self-start">
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle>对话</CardTitle>
          <Button
            variant="outline"
            size="icon-xs"
            aria-label="重新读取对话列表"
            disabled={phase === 'loading'}
            onClick={onReload}
          >
            <RiRefreshLine />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3">
        <NewThreadForm creating={creating} error={createError} onCreate={onCreate} />

        {threads === null && phase === 'loading' ? (
          <div className="grid gap-2">
            <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
              <Spinner />
              正在读取对话列表…
            </div>
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : null}

        {threads === null && phase === 'error' && error !== null ? (
          <div className="grid gap-2">
            <ErrorAlert error={error} />
            <Button variant="outline" size="sm" onClick={onReload}>
              重新读取列表
            </Button>
          </div>
        ) : null}

        {threads !== null && threads.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <RiRefreshLine aria-hidden="true" />
              </EmptyMedia>
              <EmptyTitle>还没有对话</EmptyTitle>
              <EmptyDescription>新建对话后即可在这里选择并查看历史消息。</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : null}

        {threads !== null && threads.length > 0 ? (
          <div className="grid">
            {threads.map((thread) => (
              <ThreadListItem
                key={thread.thread_id}
                thread={thread}
                selected={thread.thread_id === selectedId}
                onSelect={onSelect}
              />
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

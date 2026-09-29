import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { MessageList } from '@/features/threads/components/MessageList'
import { useThreadMessages } from '@/features/threads/hooks/useThreadMessages'
import type { ThreadSummary } from '@/features/threads/types/threads'

interface ThreadWorkspaceProps {
  threadId: string
  thread: ThreadSummary | null
}

export function ThreadWorkspace({ threadId, thread }: ThreadWorkspaceProps) {
  const history = useThreadMessages(threadId)

  return (
    <Card>
      <CardHeader>
        <CardTitle>{thread?.title ?? '对话历史'}</CardTitle>
        <CardDescription>
          <span>{threadId}</span>
          {thread !== null ? ` · 服务端记录 ${thread.message_count} 条消息` : null}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <MessageList
          window={history.window}
          phase={history.phase}
          error={history.error}
          loadingOlder={history.loadingOlder}
          olderError={history.olderError}
          onLoadOlder={() => void history.loadOlder()}
          onReload={history.reload}
        />
      </CardContent>
    </Card>
  )
}

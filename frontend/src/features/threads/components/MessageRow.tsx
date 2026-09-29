import { Badge } from '@/components/ui/badge'
import type { MessageRole, ThreadMessage } from '@/features/threads/types/threads'
import { SafeText } from '@/shared/components/SafeText'
import { formatDateTime } from '@/shared/format'

const ROLE_LABELS: Record<MessageRole, string> = {
  user: '提问',
  assistant: '回答',
  system: '系统',
}

const STATUS_VARIANTS: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  completed: 'secondary',
  streaming: 'default',
  failed: 'destructive',
  cancelled: 'outline',
  incomplete: 'outline',
}

export function MessageRow({ message }: { message: ThreadMessage }) {
  return (
    <article
      className="grid gap-1.5 border-border border-b px-2.5 py-2"
    >
      <div className="flex flex-wrap items-center gap-2 text-[0.7rem]">
        <Badge variant="outline">
          {ROLE_LABELS[message.role]}
        </Badge>
        <Badge
          variant={STATUS_VARIANTS[message.status] ?? 'outline'}
        >
          {message.status}
        </Badge>
        <span className="text-muted-foreground">#{message.sequence}</span>
        <span className="text-muted-foreground">{formatDateTime(message.timestamp)}</span>
      </div>
      <SafeText value={message.content} className="text-xs" />
    </article>
  )
}

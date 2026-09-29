import { cn } from 'cn'

import type { ThreadSummary } from '@/features/threads/types/threads'
import { SafeText } from '@/shared/components/SafeText'
import { formatDateTime } from '@/shared/format'

interface ThreadListItemProps {
  thread: ThreadSummary
  selected: boolean
  onSelect: (threadId: string) => void
}

export function ThreadListItem({ thread, selected, onSelect }: ThreadListItemProps) {
  return (
    <button
      type="button"
      aria-current={selected ? 'true' : undefined}
      onClick={() => onSelect(thread.thread_id)}
      className={cn(
        'hover:bg-muted flex w-full flex-col items-start gap-1 border-border border-b px-2.5 py-2 text-left',
        selected && 'border-primary bg-secondary border-l-2',
      )}
    >
      <SafeText value={thread.title} className="w-full text-xs font-medium" />
      <span className="text-muted-foreground flex flex-wrap gap-x-2 text-[0.7rem]">
        <span>
          {thread.message_count} 条消息
        </span>
        <span>
          {formatDateTime(thread.updated_at)}
        </span>
      </span>
    </button>
  )
}

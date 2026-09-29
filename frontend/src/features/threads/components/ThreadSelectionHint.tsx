import { RiChat1Line } from '@remixicon/react'

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'

interface ThreadSelectionHintProps {
  reason: 'none' | 'invalid'
  threadId?: string
}

export function ThreadSelectionHint({ reason, threadId }: ThreadSelectionHintProps) {
  return (
    <Empty
      className="border-border self-start border-dashed py-16"
    >
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <RiChat1Line aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle>{reason === 'none' ? '尚未选择对话' : '地址中的 Thread ID 不合法'}</EmptyTitle>
        <EmptyDescription>
          {reason === 'none'
            ? '从左侧列表选择一条对话，或直接新建一条开始。'
            : `Thread ID 需要形如 thread_ 加 32 位十六进制，当前为 ${threadId ?? ''}。`}
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}

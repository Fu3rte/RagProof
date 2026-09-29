export type MessageRole = 'user' | 'assistant' | 'system'

export interface ThreadSummary {
  thread_id: string
  // 服务端在无标题时回退为 Thread ID，标题字段始终为字符串
  title: string
  message_count: number
  updated_at: string
}

export interface ThreadDetail extends ThreadSummary {
  created_at: string
}

export interface ThreadListResponse {
  threads: ThreadSummary[]
}

export interface ThreadMessage {
  id: number
  run_id: string | null
  sequence: number
  role: MessageRole
  status: string
  content: string
  timestamp: string
}

// before 游标分页：previous_cursor 为 null 表示没有更早的历史
export interface ThreadMessagePage {
  messages: ThreadMessage[]
  previous_cursor: number | null
}

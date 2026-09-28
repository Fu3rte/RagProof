import type { ModelRole } from '@/types/system'

export type RunStatus =
  | 'queued'
  | 'running'
  | 'waiting_input'
  | 'cancelling'
  | 'succeeded'
  | 'failed'
  | 'cancelled'

export interface RunRoleSnapshot {
  role: ModelRole
  model_name: string
  purpose: string
  timeout_seconds: number
  config_fingerprint: string
}

export interface RunEmbeddingSnapshot {
  model_name: string
  dimension: number
  config_fingerprint: string
}

export interface RunConfigSnapshot {
  schema_version: number
  roles: Record<ModelRole, RunRoleSnapshot>
  embedding: RunEmbeddingSnapshot
  config_fingerprint: string
}

// Run 创建时冻结的文档版本集合，后续发布不影响已创建的 Run
export interface RunRetrievalSnapshot {
  schema_version: number
  version_ids: string[]
}

export interface Run {
  id: string
  question: string
  status: RunStatus
  config_snapshot: RunConfigSnapshot
  retrieval_snapshot: RunRetrievalSnapshot
  created_at: string
  updated_at: string
}

export interface RunCreateRequest {
  question: string
  idempotency_key: string
}

export interface RunCreateResponse {
  created: boolean
  run: Run
}

export interface RunListResponse {
  items: Run[]
  offset: number
  limit: number
  total: number
}

export interface RunEvent {
  event_id: string
  run_id: string
  sequence: number
  type: string
  timestamp: string
  data: Record<string, unknown>
}

export interface RunEventPageResponse {
  items: RunEvent[]
  after: number
  next_after: number
}

export const QUESTION_MAX_LENGTH = 4000

export const RUN_STATUS_LABELS: Record<RunStatus, string> = {
  queued: '已登记等待执行',
  running: '执行中',
  waiting_input: '等待补充条件',
  cancelling: '取消中',
  succeeded: '执行成功',
  failed: '执行失败',
  cancelled: '已取消',
}

export type ModelRole = 'fast' | 'grader' | 'answer' | 'evaluator'

export type CheckRole = ModelRole | 'embedding'

export type CheckStatus = 'idle' | 'running' | 'succeeded' | 'failed'

export interface HealthResponse {
  status: string
}

export interface ReadyResponse {
  status: string
  database: string
}

export interface MeResponse {
  owner_id: string
}

export interface TokenUsage {
  input_tokens: number | null
  output_tokens: number | null
  total_tokens: number | null
}

export interface ModelRoleConfiguration {
  role: ModelRole
  model_name: string
  purpose: string
  required_capability: 'structured_output' | 'chat_completion'
  timeout_seconds: number
  config_fingerprint: string
}

export interface EmbeddingConfiguration {
  model_name: string
  dimension: number
  timeout_seconds: number
  required_capability: 'embedding_vector'
  config_fingerprint: string
}

export interface ModelCheckItem {
  role: CheckRole
  success: boolean
  latency_ms: number
  model_name: string
  capability: string
  usage: TokenUsage | null
  embedding_dimension: number | null
  checked_at: string
  error_category: string | null
}

export interface LatestModelCheck {
  status: CheckStatus
  started_at: string | null
  finished_at: string | null
  total_latency_ms: number | null
  config_fingerprint: string | null
  items: ModelCheckItem[]
}

export interface ModelsResponse {
  roles: ModelRoleConfiguration[]
  embedding: EmbeddingConfiguration
  config_fingerprint: string
  latest_check: LatestModelCheck | null
}

export interface ModelCheckResponse {
  status: 'succeeded'
  items: ModelCheckItem[]
  started_at: string
  finished_at: string
  total_latency_ms: number
  config_fingerprint: string
}

export const MODEL_ROLE_ORDER: readonly ModelRole[] = [
  'fast',
  'grader',
  'answer',
  'evaluator',
]

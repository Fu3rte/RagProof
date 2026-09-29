export type ModelRole = 'answer' | 'fast' | 'grader'

export interface ModelProfile {
  id: string
  display_name: string
  provider: 'openai'
  model_name: string
  base_url: string
  timeout_seconds: number
  supports_stream: boolean
  supports_structured_output: boolean
  enabled: boolean
  version: number
}

export interface ModelRoleRequirement {
  supports_stream: boolean
  supports_structured_output: boolean
}

// 控制面是唯一事实来源：写接口整体返回最新控制面
export interface ModelControlPlane {
  catalog_hash: string
  provider_secret_configured: boolean
  profiles: ModelProfile[]
  assignments: Record<ModelRole, ModelProfile | null>
  requirements: Record<ModelRole, ModelRoleRequirement>
}

export interface ModelProfilePayload {
  display_name: string
  provider: 'openai'
  model_name: string
  base_url: string
  timeout_seconds: number
  supports_stream: boolean
  supports_structured_output: boolean
  enabled: boolean
}

export interface ModelDeleteResponse {
  profile_id: string
  deleted: boolean
}

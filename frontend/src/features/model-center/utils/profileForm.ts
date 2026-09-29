import type { ModelProfile, ModelProfilePayload } from '@/features/model-center/types/modelControl'

export interface ProfileFormState {
  display_name: string
  model_name: string
  base_url: string
  timeout_seconds: string
  supports_stream: boolean
  supports_structured_output: boolean
  enabled: boolean
}

export function emptyProfileForm(): ProfileFormState {
  return {
    display_name: '',
    model_name: '',
    base_url: '',
    timeout_seconds: '30',
    supports_stream: true,
    supports_structured_output: true,
    enabled: true,
  }
}

export function profileFormFrom(profile: ModelProfile): ProfileFormState {
  return {
    display_name: profile.display_name,
    model_name: profile.model_name,
    base_url: profile.base_url,
    timeout_seconds: String(profile.timeout_seconds),
    supports_stream: profile.supports_stream,
    supports_structured_output: profile.supports_structured_output,
    enabled: profile.enabled,
  }
}

// 与服务端同规则的前置校验：避免把必然 422 的请求发出去
function baseUrlProblem(value: string): string | null {
  if (value.length === 0) return null
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return 'Base URL 必须是完整的 HTTP 或 HTTPS 地址'
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return 'Base URL 仅支持 http 或 https 协议'
  }
  if (url.hostname.length === 0) return 'Base URL 缺少主机名'
  if (url.username.length > 0 || url.password.length > 0) return 'Base URL 不允许包含凭据'
  if (url.search.length > 0) return 'Base URL 不允许包含 query'
  if (url.hash.length > 0) return 'Base URL 不允许包含 fragment'
  return null
}

export function validateProfileForm(state: ProfileFormState): string | null {
  const displayName = state.display_name.trim()
  const modelName = state.model_name.trim()
  if (displayName.length === 0) return '请填写 Profile 名称'
  if (displayName.length > 120) return 'Profile 名称不超过 120 个字符'
  if (modelName.length === 0) return '请填写模型标识'
  if (modelName.length > 160) return '模型标识不超过 160 个字符'
  const urlProblem = baseUrlProblem(state.base_url.trim())
  if (urlProblem !== null) return urlProblem
  const timeout = Number(state.timeout_seconds)
  if (!Number.isFinite(timeout) || timeout <= 0) return 'Timeout 必须大于 0 秒'
  if (timeout > 600) return 'Timeout 不超过 600 秒'
  return null
}

export function profilePayloadFrom(state: ProfileFormState): ModelProfilePayload {
  return {
    display_name: state.display_name.trim(),
    provider: 'openai',
    model_name: state.model_name.trim(),
    base_url: state.base_url.trim(),
    timeout_seconds: Number(state.timeout_seconds),
    supports_stream: state.supports_stream,
    supports_structured_output: state.supports_structured_output,
    enabled: state.enabled,
  }
}

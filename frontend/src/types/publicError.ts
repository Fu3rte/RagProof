export interface PublicErrorInfo {
  code: string
  message: string
  retryable: boolean
  status?: number
  retryAfterSeconds?: number
  fields?: string[]
}

export interface PublicErrorDetails {
  retryAfterSeconds?: number
  status?: number
}
const CODE_PATTERN = /^[A-Z][A-Z0-9_]{0,63}$/

const DEFAULT_MESSAGES: Record<string, string> = {
  INVALID_REQUEST: '请求参数不正确，请检查后重试',
  AUTHENTICATION_REQUIRED: '应用 API Key 无效或已失效，请重新连接',
  NOT_FOUND: '请求的资源不存在或不属于当前账号',
  IDEMPOTENCY_CONFLICT: '该幂等键已绑定另一个请求，请修改问题后重新登记',
  DOCUMENT_VERSION_CONFLICT: '当前版本已被其他发布改变，请重新加载当前版本后再提交',
  MODEL_CHECK_IN_PROGRESS: '当前账号已有模型能力检查执行中，请稍候',
  MODEL_CHECK_RATE_LIMITED: '模型能力检查处于冷却时间，请稍后重试',
  PROVIDER_CHECK_FAILED: 'Provider 能力检查失败，请检查服务端模型配置',
  PROVIDER_CAPABILITY_MISMATCH: 'Provider 返回结果未满足模型能力契约',
  DATABASE_UNAVAILABLE: '数据库暂不可用，请确认服务已启动',
  REQUEST_CANCELLED: '请求已取消',
  REQUEST_TIMEOUT: '请求超时，请稍后重试',
  NETWORK_UNAVAILABLE: '无法连接后端服务，请检查网络后重试',
  INTERNAL_ERROR: '服务暂时不可用，请稍后重试',
}

const RETRYABLE_CODES = new Set([
  'MODEL_CHECK_IN_PROGRESS',
  'MODEL_CHECK_RATE_LIMITED',
  'PROVIDER_CHECK_FAILED',
  'PROVIDER_CAPABILITY_MISMATCH',
  'DATABASE_UNAVAILABLE',
  'REQUEST_TIMEOUT',
  'NETWORK_UNAVAILABLE',
  'INTERNAL_ERROR',
])

// 这些 code 的文案由前端固定，服务端同名字段不参与渲染，避免上游细节进入用户可见文本
const FIXED_CLIENT_MESSAGE_CODES = new Set([
  'PROVIDER_CHECK_FAILED',
  'PROVIDER_CAPABILITY_MISMATCH',
  'DATABASE_UNAVAILABLE',
  'REQUEST_TIMEOUT',
  'NETWORK_UNAVAILABLE',
  'INTERNAL_ERROR',
])

const STATUS_CODES: Record<number, string> = {
  401: 'AUTHENTICATION_REQUIRED',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  422: 'INVALID_REQUEST',
  429: 'RATE_LIMITED',
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function safeString(value: unknown, maxLength = 240): string | undefined {
  if (typeof value !== 'string') return undefined
  const compact = value.trim()
  return compact ? compact.slice(0, maxLength) : undefined
}

function optionalNumber(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return undefined
  return value
}

function publicErrorMessage(code: string): string {
  return DEFAULT_MESSAGES[code] ?? DEFAULT_MESSAGES.INTERNAL_ERROR!
}

export function normalizePublicErrorInfo(
  value: unknown,
  defaults: PublicErrorDetails = {},
): PublicErrorInfo {
  const outer = asRecord(value) ?? {}
  const source = asRecord(outer.error) ?? outer
  const details = asRecord(source.details) ?? {}
  const rawCode = safeString(source.code, 64)
  const code = rawCode && CODE_PATTERN.test(rawCode) ? rawCode : 'INTERNAL_ERROR'
  const catalogMessage = publicErrorMessage(code)
  const serverMessage = safeString(source.message, 500)
  const message = FIXED_CLIENT_MESSAGE_CODES.has(code)
    ? catalogMessage
    : serverMessage ?? catalogMessage
  const retryAfterSeconds =
    optionalNumber(details.retry_after_seconds) ??
    optionalNumber(source.retry_after_seconds) ??
    defaults.retryAfterSeconds
  const fields = Array.isArray(details.fields)
    ? details.fields.filter((item): item is string => typeof item === 'string')
    : undefined

  return {
    code,
    message,
    retryable: RETRYABLE_CODES.has(code),
    ...(defaults.status !== undefined ? { status: defaults.status } : {}),
    ...(retryAfterSeconds !== undefined ? { retryAfterSeconds } : {}),
    ...(fields !== undefined ? { fields } : {}),
  }
}

export function statusToPublicErrorInfo(
  status: number,
  defaults: PublicErrorDetails = {},
): PublicErrorInfo {
  const code =
    STATUS_CODES[status] ?? (status >= 500 ? 'INTERNAL_ERROR' : 'INVALID_REQUEST')
  return normalizePublicErrorInfo({ error: { code } }, { ...defaults, status })
}

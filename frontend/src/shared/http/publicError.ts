export interface PublicErrorInfo {
  code: string
  message: string
  retryable: boolean
  status?: number
  retryAfterSeconds?: number
  fields?: string[]
}

export interface PublicErrorDefaults {
  status?: number
  retryAfterSeconds?: number
}

const CODE_PATTERN = /^[A-Z][A-Z0-9_]{0,63}$/

const DEFAULT_MESSAGES: Record<string, string> = {
  INVALID_REQUEST: '请求参数不正确，请检查后重试',
  NOT_FOUND: '请求的资源不存在',
  CONFLICT: '请求与服务端当前状态冲突，请重新加载后再试',
  MODEL_CAPABILITY_MISMATCH: '该 Model Profile 不满足角色要求的模型能力',
  PERMISSION_DENIED: '服务端拒绝了该操作',
  DATABASE_UNAVAILABLE: '数据库暂不可用，请确认服务已启动',
  NETWORK_UNAVAILABLE: '无法连接后端服务，请确认 API 已启动',
  REQUEST_TIMEOUT: '请求超时，请稍后重试',
  REQUEST_CANCELLED: '请求已取消',
  INTERNAL_ERROR: '服务暂时不可用，请稍后重试',
}

const RETRYABLE_CODES = new Set([
  'DATABASE_UNAVAILABLE',
  'NETWORK_UNAVAILABLE',
  'REQUEST_TIMEOUT',
  'INTERNAL_ERROR',
])

// 这些 code 的文案由前端固定，服务端同名字段不参与渲染，避免上游细节进入用户可见文本
const FIXED_CLIENT_MESSAGE_CODES = new Set([
  'DATABASE_UNAVAILABLE',
  'NETWORK_UNAVAILABLE',
  'REQUEST_TIMEOUT',
  'INTERNAL_ERROR',
])

const STATUS_CODES: Record<number, string> = {
  401: 'PERMISSION_DENIED',
  403: 'PERMISSION_DENIED',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  422: 'INVALID_REQUEST',
  429: 'CONFLICT',
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function safeString(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string') return undefined
  const compact = value.trim()
  return compact ? compact.slice(0, maxLength) : undefined
}

export function normalizePublicErrorInfo(
  value: unknown,
  defaults: PublicErrorDefaults = {},
): PublicErrorInfo {
  const source = asRecord(asRecord(value)?.error) ?? asRecord(value) ?? {}
  const details = asRecord(source.details) ?? {}
  const rawCode = safeString(source.code, 64)
  const code = rawCode !== undefined && CODE_PATTERN.test(rawCode) ? rawCode : 'INTERNAL_ERROR'
  const catalogMessage = DEFAULT_MESSAGES[code] ?? DEFAULT_MESSAGES.INTERNAL_ERROR!
  const serverMessage = safeString(source.message, 500)
  const fields = Array.isArray(details.fields)
    ? details.fields.filter((item): item is string => typeof item === 'string')
    : undefined

  return {
    code,
    message: FIXED_CLIENT_MESSAGE_CODES.has(code) ? catalogMessage : serverMessage ?? catalogMessage,
    retryable: RETRYABLE_CODES.has(code),
    ...(defaults.status !== undefined ? { status: defaults.status } : {}),
    ...(defaults.retryAfterSeconds !== undefined
      ? { retryAfterSeconds: defaults.retryAfterSeconds }
      : {}),
    ...(fields !== undefined && fields.length > 0 ? { fields } : {}),
  }
}

export function statusToPublicErrorInfo(
  status: number,
  defaults: PublicErrorDefaults = {},
): PublicErrorInfo {
  const code = STATUS_CODES[status] ?? (status >= 500 ? 'INTERNAL_ERROR' : 'INVALID_REQUEST')
  return normalizePublicErrorInfo({ error: { code } }, { ...defaults, status })
}

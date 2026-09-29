import {
  normalizePublicErrorInfo,
  statusToPublicErrorInfo,
  type PublicErrorDefaults,
  type PublicErrorInfo,
} from '@/shared/http/publicError'

export class PublicRequestError extends Error implements PublicErrorInfo {
  readonly code: string
  readonly retryable: boolean
  readonly status?: number
  readonly retryAfterSeconds?: number
  readonly fields?: string[]

  constructor(info: PublicErrorInfo) {
    super(info.message)
    this.name = 'PublicRequestError'
    this.code = info.code
    this.retryable = info.retryable
    this.status = info.status
    this.retryAfterSeconds = info.retryAfterSeconds
    this.fields = info.fields
  }
}

// 非 HTTP 异常（AbortError、断网、超时）在此归一化为同一套公开错误
export function getPublicError(error: unknown): PublicRequestError {
  if (error instanceof PublicRequestError) return error
  const name =
    typeof error === 'object' && error !== null ? (error as { name?: unknown }).name : undefined
  if (name === 'AbortError') {
    return new PublicRequestError(normalizePublicErrorInfo({ code: 'REQUEST_CANCELLED' }))
  }
  if (name === 'TimeoutError') {
    return new PublicRequestError(normalizePublicErrorInfo({ code: 'REQUEST_TIMEOUT' }))
  }
  return new PublicRequestError(normalizePublicErrorInfo({ code: 'NETWORK_UNAVAILABLE' }))
}

export function isCancelledError(error: unknown): boolean {
  return error instanceof PublicRequestError && error.code === 'REQUEST_CANCELLED'
}

async function toPublicRequestError(response: Response): Promise<PublicRequestError> {
  const defaults: PublicErrorDefaults = { status: response.status }
  const retryAfterHeader = response.headers.get('retry-after')
  if (retryAfterHeader !== null) {
    const retryAfter = Number(retryAfterHeader)
    if (Number.isFinite(retryAfter) && retryAfter >= 0) defaults.retryAfterSeconds = retryAfter
  }

  const text = await response.text()
  try {
    return new PublicRequestError(
      normalizePublicErrorInfo(JSON.parse(text) as unknown, defaults),
    )
  } catch {
    return new PublicRequestError(statusToPublicErrorInfo(response.status, defaults))
  }
}

export type ApiMethod = 'GET' | 'POST' | 'PUT' | 'DELETE'

export interface ApiRequestOptions {
  method?: ApiMethod
  body?: unknown
  signal?: AbortSignal
}

export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { accept: 'application/json' }
  let body: string | undefined
  if (options.body !== undefined) {
    headers['content-type'] = 'application/json'
    body = JSON.stringify(options.body)
  }

  let response: Response
  try {
    response = await fetch(path, {
      method: options.method ?? 'GET',
      headers,
      body,
      signal: options.signal,
      credentials: 'omit',
      cache: 'no-store',
    })
  } catch (error) {
    throw getPublicError(error)
  }

  if (!response.ok) throw await toPublicRequestError(response)

  const text = await response.text()
  try {
    return JSON.parse(text) as T
  } catch {
    throw new PublicRequestError(
      statusToPublicErrorInfo(response.status, { status: response.status }),
    )
  }
}

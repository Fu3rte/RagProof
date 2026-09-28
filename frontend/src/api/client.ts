import {
  normalizePublicErrorInfo,
  statusToPublicErrorInfo,
  type PublicErrorDetails,
  type PublicErrorInfo,
} from '@/types/publicError'

const API_BASE = '/api'

interface ApiRequestOptions {
  method?: 'GET' | 'POST'
  apiKey?: string
  body?: unknown
  signal?: AbortSignal
}

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

export function getPublicError(error: unknown): PublicRequestError {
  if (error instanceof PublicRequestError) return error
  const name =
    typeof error === 'object' && error !== null ? (error as { name?: unknown }).name : ''
  if (name === 'AbortError') {
    return new PublicRequestError(normalizePublicErrorInfo({ code: 'REQUEST_CANCELLED' }))
  }
  if (name === 'TimeoutError') {
    return new PublicRequestError(normalizePublicErrorInfo({ code: 'REQUEST_TIMEOUT' }))
  }
  return new PublicRequestError(normalizePublicErrorInfo({ code: 'NETWORK_UNAVAILABLE' }))
}

async function getPublicErrorFromResponse(
  response: Response,
): Promise<PublicRequestError> {
  const details: PublicErrorDetails = { status: response.status }
  const retryAfterHeader = response.headers.get('retry-after')
  if (retryAfterHeader !== null) {
    const retryAfter = Number(retryAfterHeader)
    if (Number.isFinite(retryAfter) && retryAfter >= 0) details.retryAfterSeconds = retryAfter
  }

  const text = await response.text()
  try {
    return new PublicRequestError(
      normalizePublicErrorInfo(JSON.parse(text) as unknown, details),
    )
  } catch {
    return new PublicRequestError(statusToPublicErrorInfo(response.status, details))
  }
}

export function isCancelledError(error: unknown): boolean {
  return error instanceof PublicRequestError && error.code === 'REQUEST_CANCELLED'
}

export function queryString(params: Record<string, string | number>): string {
  const entries = Object.entries(params).map(
    (entry): [string, string] => [entry[0], String(entry[1])],
  )
  return `?${new URLSearchParams(entries)}`
}

export async function apiRequest<T>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  const headers: Record<string, string> = { accept: 'application/json' }
  if (options.apiKey) headers['x-api-key'] = options.apiKey
  let body: string | undefined
  if (options.body !== undefined) {
    headers['content-type'] = 'application/json'
    body = JSON.stringify(options.body)
  }

  let response: Response
  try {
    response = await fetch(`${API_BASE}${path}`, {
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

  if (!response.ok) throw await getPublicErrorFromResponse(response)

  const text = await response.text()
  try {
    return JSON.parse(text) as T
  } catch {
    throw new PublicRequestError(
      statusToPublicErrorInfo(response.status, { status: response.status }),
    )
  }
}

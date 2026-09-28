import { apiRequest, queryString } from '@/api/client'
import type {
  Run,
  RunCreateRequest,
  RunCreateResponse,
  RunEventPageResponse,
  RunListResponse,
} from '@/types/runs'

export function createRun(
  apiKey: string,
  payload: RunCreateRequest,
  signal: AbortSignal,
): Promise<RunCreateResponse> {
  return apiRequest<RunCreateResponse>('/runs', {
    method: 'POST',
    apiKey,
    body: payload,
    signal,
  })
}

export function listRuns(
  apiKey: string,
  params: { offset: number; limit: number },
  signal: AbortSignal,
): Promise<RunListResponse> {
  return apiRequest<RunListResponse>(`/runs${queryString(params)}`, { apiKey, signal })
}

export function fetchRun(
  apiKey: string,
  runId: string,
  signal: AbortSignal,
): Promise<Run> {
  return apiRequest<Run>(`/runs/${encodeURIComponent(runId)}`, { apiKey, signal })
}

export function fetchRunEvents(
  apiKey: string,
  runId: string,
  params: { after: number; limit: number },
  signal: AbortSignal,
): Promise<RunEventPageResponse> {
  return apiRequest<RunEventPageResponse>(
    `/runs/${encodeURIComponent(runId)}/events${queryString(params)}`,
    { apiKey, signal },
  )
}

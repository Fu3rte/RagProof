import { apiRequest } from '@/api/client'
import type {
  HealthResponse,
  MeResponse,
  ModelCheckResponse,
  ModelsResponse,
  ReadyResponse,
} from '@/types/system'

export function fetchHealth(signal: AbortSignal): Promise<HealthResponse> {
  return apiRequest<HealthResponse>('/health', { signal })
}

export function fetchReady(signal: AbortSignal): Promise<ReadyResponse> {
  return apiRequest<ReadyResponse>('/ready', { signal })
}

export function fetchMe(apiKey: string, signal: AbortSignal): Promise<MeResponse> {
  return apiRequest<MeResponse>('/me', { apiKey, signal })
}

export function fetchModels(
  apiKey: string,
  signal: AbortSignal,
): Promise<ModelsResponse> {
  return apiRequest<ModelsResponse>('/models', { apiKey, signal })
}

export function runModelCheck(
  apiKey: string,
  signal: AbortSignal,
): Promise<ModelCheckResponse> {
  return apiRequest<ModelCheckResponse>('/models/check', {
    method: 'POST',
    apiKey,
    signal,
  })
}

import { apiRequest } from '@/shared/http/apiClient'
import type {
  ModelControlPlane,
  ModelDeleteResponse,
  ModelProfilePayload,
  ModelRole,
} from '@/features/model-center/types/modelControl'

const MODELS_PATH = '/v1/models'

export function fetchControlPlane(signal: AbortSignal): Promise<ModelControlPlane> {
  return apiRequest<ModelControlPlane>(MODELS_PATH, { signal })
}

export function createProfile(
  payload: ModelProfilePayload,
  signal: AbortSignal,
): Promise<ModelControlPlane> {
  return apiRequest<ModelControlPlane>(MODELS_PATH, { method: 'POST', body: payload, signal })
}

export function updateProfile(
  profileId: string,
  payload: ModelProfilePayload,
  signal: AbortSignal,
): Promise<ModelControlPlane> {
  return apiRequest<ModelControlPlane>(`${MODELS_PATH}/${encodeURIComponent(profileId)}`, {
    method: 'PUT',
    body: payload,
    signal,
  })
}

// 删除接口只返回删除结果，调用方随后重新读取控制面
export function deleteProfile(
  profileId: string,
  signal: AbortSignal,
): Promise<ModelDeleteResponse> {
  return apiRequest<ModelDeleteResponse>(`${MODELS_PATH}/${encodeURIComponent(profileId)}`, {
    method: 'DELETE',
    signal,
  })
}

export function assignRole(
  role: ModelRole,
  profileId: string,
  signal: AbortSignal,
): Promise<ModelControlPlane> {
  return apiRequest<ModelControlPlane>(
    `${MODELS_PATH}/assignments/${encodeURIComponent(role)}`,
    { method: 'PUT', body: { profile_id: profileId }, signal },
  )
}

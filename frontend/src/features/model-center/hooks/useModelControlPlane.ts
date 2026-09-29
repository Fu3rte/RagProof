import { useCallback, useState } from 'react'

import {
  assignRole,
  createProfile,
  deleteProfile,
  fetchControlPlane,
  updateProfile,
} from '@/features/model-center/api/modelCenterClient'
import type {
  ModelControlPlane,
  ModelProfilePayload,
  ModelRole,
} from '@/features/model-center/types/modelControl'
import { useAsyncResource } from '@/shared/hooks/useAsyncResource'

export type ProfileCommand =
  | { kind: 'create'; payload: ModelProfilePayload }
  | { kind: 'update'; profileId: string; payload: ModelProfilePayload }

// 控制面读写集中在此：写接口返回的完整控制面直接采用，删除后回读服务端事实
export function useModelControlPlane() {
  const resource = useAsyncResource(fetchControlPlane)
  const [saving, setSaving] = useState(false)
  const [actionError, setActionError] = useState<unknown | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const run = useCallback(
    async (request: (signal: AbortSignal) => Promise<ModelControlPlane | null>): Promise<void> => {
      const controller = new AbortController()
      setSaving(true)
      setActionError(null)
      setNotice(null)
      try {
        const result = await request(controller.signal)
        if (result === null) resource.reload()
        else resource.commit(result)
      } catch (error: unknown) {
        setActionError(error)
        throw error
      } finally {
        setSaving(false)
      }
    },
    [resource],
  )

  const saveProfile = useCallback(
    (command: ProfileCommand): Promise<void> => {
      const noticeText =
        command.kind === 'create'
          ? `已创建 Model Profile「${command.payload.display_name}」`
          : `已更新 Model Profile「${command.payload.display_name}」`
      return run(async (signal) => {
        const plane =
          command.kind === 'create'
            ? await createProfile(command.payload, signal)
            : await updateProfile(command.profileId, command.payload, signal)
        setNotice(noticeText)
        return plane
      })
    },
    [run],
  )

  const removeProfile = useCallback(
    (profileId: string): Promise<void> =>
      run(async (signal) => {
        await deleteProfile(profileId, signal)
        return null
      }),
    [run],
  )

  const assign = useCallback(
    (role: ModelRole, profileId: string): Promise<void> =>
      run(async (signal) => {
        const plane = await assignRole(role, profileId, signal)
        setNotice(`已更新 ${role} 职责的模型分配`)
        return plane
      }),
    [run],
  )

  return {
    plane: resource.data,
    phase: resource.phase,
    loadError: resource.error,
    saving,
    actionError,
    notice,
    dismissNotice: useCallback(() => setNotice(null), []),
    reload: resource.reload,
    saveProfile,
    removeProfile,
    assign,
  }
}

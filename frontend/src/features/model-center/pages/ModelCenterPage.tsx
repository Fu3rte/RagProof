import { useState } from 'react'
import { RiAddLine, RiRefreshLine } from '@remixicon/react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { ControlPlaneSummary } from '@/features/model-center/components/ControlPlaneSummary'
import { ProfileDeleteDialog } from '@/features/model-center/components/ProfileDeleteDialog'
import { ProfileDirectory } from '@/features/model-center/components/ProfileDirectory'
import { ProfileFormDialog } from '@/features/model-center/components/ProfileFormDialog'
import { RoleAssignmentSection } from '@/features/model-center/components/RoleAssignmentSection'
import { useModelControlPlane } from '@/features/model-center/hooks/useModelControlPlane'
import type { ModelProfile, ModelRole } from '@/features/model-center/types/modelControl'
import { ErrorAlert } from '@/shared/components/ErrorAlert'

interface EditorState {
  profile: ModelProfile | null
}

// 写操作的失败已进入 actionError / 表单内联提示，调用处只需阻止未处理 rejection
function ignoreHandledError(): void {}

export function ModelCenterPage() {
  const center = useModelControlPlane()
  const [editor, setEditor] = useState<EditorState | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ModelProfile | null>(null)
  const plane = center.plane

  function handleAssign(role: ModelRole, profileId: string): void {
    if (plane?.assignments[role]?.id === profileId) return
    void center.assign(role, profileId).catch(ignoreHandledError)
  }

  function handleConfirmDelete(): Promise<void> {
    if (deleteTarget === null) return Promise.resolve()
    return center
      .removeProfile(deleteTarget.id)
      .then(() => setDeleteTarget(null))
      .catch(() => setDeleteTarget(null))
  }

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-1">
          <p className="text-muted-foreground text-xs">Model control plane</p>
          <h1 className="font-heading text-xl font-semibold">
            模型中心
          </h1>
          <p className="text-muted-foreground text-xs">
            Answer、Fast、Grader 三个职责各自的 Model Profile 与分配，配置只保存无 Secret 的连接信息。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={center.phase === 'loading'}
            onClick={center.reload}
          >
            {center.phase === 'loading' ? <Spinner /> : <RiRefreshLine />}
            刷新目录
          </Button>
          <Button
            size="sm"
            disabled={plane === null}
            onClick={() => setEditor({ profile: null })}
          >
            <RiAddLine />
            新建 Model Profile
          </Button>
        </div>
      </div>

      {center.actionError !== null ? (
        <ErrorAlert error={center.actionError} />
      ) : center.notice !== null ? (
        <Alert>
          <AlertDescription>{center.notice}</AlertDescription>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="关闭提示"
            onClick={center.dismissNotice}
          >
            ×
          </Button>
        </Alert>
      ) : null}

      {plane === null && center.phase === 'loading' ? (
        <div className="grid gap-3">
          <div className="flex items-center gap-2 text-muted-foreground text-xs">
            <Spinner />
            <span>正在同步模型控制面…</span>
          </div>
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      ) : null}

      {plane === null && center.phase === 'error' && center.loadError !== null ? (
        <div className="grid gap-3">
          <ErrorAlert error={center.loadError} />
          <Button variant="outline" size="sm" onClick={center.reload}>
            重新读取控制面
          </Button>
        </div>
      ) : null}

      {plane !== null ? (
        <>
          <ControlPlaneSummary plane={plane} />
          <RoleAssignmentSection plane={plane} saving={center.saving} onAssign={handleAssign} />
          <ProfileDirectory
            plane={plane}
            saving={center.saving}
            onEdit={(profile) => setEditor({ profile })}
            onRequestDelete={(profile) => setDeleteTarget(profile)}
            onCreate={() => setEditor({ profile: null })}
          />
        </>
      ) : null}

      {editor !== null ? (
        <ProfileFormDialog
          key={editor.profile?.id ?? 'create'}
          profile={editor.profile}
          saving={center.saving}
          onOpenChange={(open) => {
            if (!open) setEditor(null)
          }}
          onSubmit={center.saveProfile}
        />
      ) : null}

      {deleteTarget !== null ? (
        <ProfileDeleteDialog
          key={deleteTarget.id}
          profile={deleteTarget}
          saving={center.saving}
          onOpenChange={(open) => {
            if (!open) setDeleteTarget(null)
          }}
          onConfirm={handleConfirmDelete}
        />
      ) : null}
    </div>
  )
}

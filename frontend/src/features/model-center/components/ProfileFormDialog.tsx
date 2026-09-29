import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import type { ProfileCommand } from '@/features/model-center/hooks/useModelControlPlane'
import type { ModelProfile } from '@/features/model-center/types/modelControl'
import {
  emptyProfileForm,
  profileFormFrom,
  profilePayloadFrom,
  validateProfileForm,
} from '@/features/model-center/utils/profileForm'
import type { ProfileFormState } from '@/features/model-center/utils/profileForm'
import { ErrorAlert } from '@/shared/components/ErrorAlert'

interface ProfileFormDialogProps {
  profile: ModelProfile | null
  saving: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (command: ProfileCommand) => Promise<void>
}

const CAPABILITY_FIELDS = [
  { key: 'supports_stream', label: '支持 Stream', hint: '可用于 Answer 流式输出' },
  {
    key: 'supports_structured_output',
    label: '支持 Structured Output',
    hint: '可用于 Fast 改写与 Grader 判定',
  },
  { key: 'enabled', label: '启用 Profile', hint: '停用后不能参与新的分配' },
] as const

export function ProfileFormDialog({
  profile,
  saving,
  onOpenChange,
  onSubmit,
}: ProfileFormDialogProps) {
  const [form, setForm] = useState<ProfileFormState>(() =>
    profile === null ? emptyProfileForm() : profileFormFrom(profile),
  )
  const [validationError, setValidationError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<unknown | null>(null)

  function updateField<K extends keyof ProfileFormState>(key: K, value: ProfileFormState[K]) {
    setForm((previous) => ({ ...previous, [key]: value }))
  }

  async function handleSubmit(): Promise<void> {
    const problem = validateProfileForm(form)
    setValidationError(problem)
    setSubmitError(null)
    if (problem !== null) return
    try {
      await onSubmit(
        profile === null
          ? { kind: 'create', payload: profilePayloadFrom(form) }
          : { kind: 'update', profileId: profile.id, payload: profilePayloadFrom(form) },
      )
      onOpenChange(false)
    } catch (error: unknown) {
      setSubmitError(error)
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next && saving) return
        onOpenChange(next)
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {profile === null ? '新建 Model Profile' : `编辑 ${profile.display_name}`}
          </DialogTitle>
          <DialogDescription>
            只保存无 Secret 的连接配置；Provider 密钥由服务端读取，不经过本表单。
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="profile-display-name">Profile 名称</Label>
            <Input
              id="profile-display-name"
              maxLength={120}
              placeholder="例如：生产回答模型"
              value={form.display_name}
              onChange={(event) => updateField('display_name', event.target.value)}
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="profile-model-name">模型标识</Label>
            <Input
              id="profile-model-name"
              maxLength={160}
              placeholder="例如：doubao-seed-1-6"
              value={form.model_name}
              onChange={(event) => updateField('model_name', event.target.value)}
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="profile-base-url">Base URL</Label>
            <Input
              id="profile-base-url"
              maxLength={512}
              placeholder="留空使用服务端默认 Endpoint"
              value={form.base_url}
              onChange={(event) => updateField('base_url', event.target.value)}
            />
            <p className="text-muted-foreground text-xs">
              仅接受不含用户名、密码、query 与 fragment 的 HTTP/HTTPS 地址。
            </p>
          </div>

          <div className="grid gap-1.5 sm:max-w-48">
            <Label htmlFor="profile-timeout">Timeout（秒）</Label>
            <Input
              id="profile-timeout"
              type="number"
              min={1}
              max={600}
              step={1}
              value={form.timeout_seconds}
              onChange={(event) => updateField('timeout_seconds', event.target.value)}
            />
          </div>

          <fieldset className="grid gap-2 border-border border p-2.5">
            <legend className="px-1 text-xs font-medium">能力声明</legend>
            {CAPABILITY_FIELDS.map((field) => (
              <div key={field.key} className="flex items-start gap-2">
                <Checkbox
                  id={`profile-${field.key}`}
                  checked={form[field.key]}
                  onCheckedChange={(checked) => updateField(field.key, checked === true)}
                />
                <div className="grid gap-0.5">
                  <Label htmlFor={`profile-${field.key}`} className="font-normal">
                    {field.label}
                  </Label>
                  <span className="text-muted-foreground text-xs">{field.hint}</span>
                </div>
              </div>
            ))}
          </fieldset>

          <div className="grid gap-1.5">
            <Label htmlFor="profile-provider">Provider</Label>
            <Select value="openai" disabled>
              <SelectTrigger id="profile-provider">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper">
                <SelectItem value="openai">OpenAI 兼容</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-muted-foreground text-xs">
              当前只支持 OpenAI 兼容接口，Provider 取值由服务端固定。
            </p>
          </div>

          {validationError !== null ? (
            <p className="text-destructive text-xs" role="alert">
              {validationError}
            </p>
          ) : null}
          {submitError !== null ? <ErrorAlert error={submitError} /> : null}
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={saving}>
            取消
          </Button>
          <Button
            size="sm"
            onClick={() => void handleSubmit()}
            disabled={saving}
          >
            {saving ? <Spinner /> : null}
            {profile === null ? '创建 Profile' : '保存修改'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

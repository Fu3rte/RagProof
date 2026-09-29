import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Spinner } from '@/components/ui/spinner'
import type { ModelProfile } from '@/features/model-center/types/modelControl'
import { SafeText } from '@/shared/components/SafeText'

interface ProfileDeleteDialogProps {
  profile: ModelProfile
  saving: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => Promise<void>
}

export function ProfileDeleteDialog({
  profile,
  saving,
  onOpenChange,
  onConfirm,
}: ProfileDeleteDialogProps) {
  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next && saving) return
        onOpenChange(next)
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>删除 Model Profile？</DialogTitle>
          <DialogDescription>
            将删除 <SafeText value={profile.display_name} className="font-medium" />{' '}
            的连接配置。已创建 Run 与历史回答使用的模型快照保持不可变。
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            disabled={saving}
            onClick={() => onOpenChange(false)}
          >
            取消
          </Button>
          <Button
            variant="destructive"
            size="sm"
            disabled={saving}
            onClick={() => void onConfirm()}
          >
            {saving ? <Spinner /> : null}
            确认删除
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

import { Badge } from '@/components/ui/badge'
import { RUN_STATUS_LABELS } from '@/types/runs'
import type { RunStatus } from '@/types/runs'
import type { CheckStatus } from '@/types/system'

type Tone = 'default' | 'secondary' | 'outline' | 'destructive'

const RUN_STATUS_TONES: Record<RunStatus, Tone> = {
  queued: 'secondary',
  running: 'default',
  waiting_input: 'default',
  cancelling: 'outline',
  succeeded: 'default',
  failed: 'destructive',
  cancelled: 'outline',
}

const CHECK_STATUS_TONES: Record<CheckStatus, Tone> = {
  idle: 'outline',
  running: 'secondary',
  succeeded: 'default',
  failed: 'destructive',
}

export function RunStatusBadge({ status }: { status: RunStatus }) {
  return (
    <Badge
      variant={RUN_STATUS_TONES[status]}
      title={RUN_STATUS_LABELS[status]}
      data-testid="run-status-badge"
    >
      {status}
    </Badge>
  )
}

export function CheckStatusBadge({ status }: { status: CheckStatus }) {
  return (
    <Badge variant={CHECK_STATUS_TONES[status]} data-testid="check-status-badge">
      {status}
    </Badge>
  )
}

export function ResultBadge({ success }: { success: boolean }) {
  return (
    <Badge variant={success ? 'default' : 'destructive'}>{success ? '通过' : '失败'}</Badge>
  )
}

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { getPublicError } from '@/shared/http/apiClient'

interface ErrorAlertProps {
  error: unknown
}

// 只展示服务端公开错误的 code/message/字段清单，不泄露 endpoint、原始异常或 Secret
export function ErrorAlert({ error }: ErrorAlertProps) {
  const view = getPublicError(error)
  const hint =
    view.retryAfterSeconds !== undefined
      ? `约 ${Math.ceil(view.retryAfterSeconds)} 秒后可再次尝试`
      : view.retryable
        ? '该操作可以稍后重试'
        : null

  return (
    <Alert variant="destructive">
      <div className="grid gap-1">
        <AlertTitle>{view.message}</AlertTitle>
        <AlertDescription>
          <span>
            {view.code}
            {view.status !== undefined ? ` · HTTP ${view.status}` : ''}
          </span>
          {view.fields !== undefined ? (
            <span>未通过字段：{view.fields.join('、')}</span>
          ) : null}
        </AlertDescription>
        {hint !== null ? (
          <AlertDescription>{hint}</AlertDescription>
        ) : null}
      </div>
    </Alert>
  )
}

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { getPublicError } from '@/api/client'

interface ErrorAlertProps {
  error: unknown
  testId: string
}

export function ErrorAlert({ error, testId }: ErrorAlertProps) {
  const view = getPublicError(error)
  const hint =
    view.retryAfterSeconds !== undefined
      ? `约 ${Math.ceil(view.retryAfterSeconds)} 秒后可再次尝试`
      : view.retryable
        ? '该操作可以稍后重试'
        : null

  return (
    <Alert variant="destructive" data-testid={testId}>
      <div className="grid gap-1">
        <AlertTitle>{view.message}</AlertTitle>
        <AlertDescription>
          <span data-testid={`${testId}-code`}>
            {view.code}
            {view.status !== undefined ? ` · HTTP ${view.status}` : ''}
          </span>
          {view.fields !== undefined ? (
            <span data-testid={`${testId}-fields`}>
              未通过字段：{view.fields.join('、')}
            </span>
          ) : null}
        </AlertDescription>
        {hint ? <AlertDescription data-testid={`${testId}-hint`}>{hint}</AlertDescription> : null}
      </div>
    </Alert>
  )
}

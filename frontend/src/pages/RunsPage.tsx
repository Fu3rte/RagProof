import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { ErrorAlert } from '@/components/ErrorAlert'
import { RunStatusBadge } from '@/components/StatusBadge'
import { SafeText } from '@/components/SafeText'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { isCancelledError } from '@/api/client'
import { createRun, listRuns } from '@/api/runs'
import { useAuth } from '@/context/AuthContext'
import { formatDateTime } from '@/lib/format'
import { failed, loading, ready, scopedState } from '@/lib/load-state'
import type { ScopedResource } from '@/lib/load-state'
import { QUESTION_MAX_LENGTH } from '@/types/runs'
import type { RunCreateResponse, RunListResponse } from '@/types/runs'

const PAGE_SIZE = 20

export function RunsPage() {
  const { apiKey, signal } = useAuth()
  const navigate = useNavigate()

  const [question, setQuestion] = useState('')
  const [idempotencyKey, setIdempotencyKey] = useState<string>(() => crypto.randomUUID())
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<unknown>(null)
  const [submitResult, setSubmitResult] = useState<RunCreateResponse | null>(null)

  const [offset, setOffset] = useState(0)
  const [reloadKey, setReloadKey] = useState(0)
  const [runsResource, setRunsResource] = useState<ScopedResource<RunListResponse> | null>(null)

  const runsState = scopedState(apiKey, runsResource)
  const page = runsState.data

  useEffect(() => {
    if (apiKey === null) return
    let active = true
    const load = async (): Promise<void> => {
      setRunsResource({ owner: apiKey, state: loading<RunListResponse>() })
      try {
        const payload = await listRuns(apiKey, { offset, limit: PAGE_SIZE }, signal)
        if (active) setRunsResource({ owner: apiKey, state: ready(payload) })
      } catch (error: unknown) {
        if (active && !isCancelledError(error)) {
          setRunsResource({ owner: apiKey, state: failed<RunListResponse>(error) })
        }
      }
    }
    void load()
    return () => {
      active = false
    }
  }, [apiKey, signal, offset, reloadKey])

  function handleQuestionChange(value: string): void {
    setQuestion(value)
    setSubmitResult(null)
    setSubmitError(null)
    // 问题文本一变即换用新的幂等键；文本不变时重复提交复用同一 UUID
    setIdempotencyKey(crypto.randomUUID())
  }

  async function handleRegister(): Promise<void> {
    if (apiKey === null || submitting) return
    setSubmitting(true)
    setSubmitError(null)
    try {
      const result = await createRun(
        apiKey,
        { question, idempotency_key: idempotencyKey },
        signal,
      )
      setSubmitResult(result)
      setOffset(0)
      setReloadKey((value) => value + 1)
    } catch (error: unknown) {
      if (!isCancelledError(error)) setSubmitError(error)
    } finally {
      setSubmitting(false)
    }
  }

  const total = page?.total ?? 0
  const items = page?.items ?? []
  const lastIndex = Math.min(offset + PAGE_SIZE, total)
  const canGoPrevious = offset > 0
  const canGoNext = lastIndex < total

  return (
    <div className="grid gap-5">
      <Card>
        <CardHeader>
          <CardTitle>登记问答请求</CardTitle>
          <CardDescription>
            D1 只做请求登记与落库，状态保持 queued；自动问答执行在 D3 接入。
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="run-question">问题</Label>
            <Textarea
              id="run-question"
              data-testid="run-question-input"
              placeholder="例如：本制度适用于哪些人员？"
              rows={4}
              className="max-h-72 overflow-y-auto"
              value={question}
              aria-describedby="run-question-help"
              onChange={(event) => handleQuestionChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault()
                  void handleRegister()
                }
              }}
            />
            <p
              id="run-question-help"
              className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground"
            >
              <span>
                字符数 {question.length} / {QUESTION_MAX_LENGTH}，超长由服务端返回 422
              </span>
              <span>Ctrl / Cmd + Enter 提交</span>
              <span data-testid="idempotency-key">
                本次尝试幂等键 {idempotencyKey.slice(0, 8)}…
              </span>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              onClick={() => void handleRegister()}
              disabled={submitting || question.trim().length === 0}
              data-testid="register-run-button"
            >
              {submitting ? <Spinner /> : null}
              {submitting ? '登记中' : '登记请求'}
            </Button>
          </div>
          {submitError !== null ? (
            <ErrorAlert error={submitError} testId="register-error" />
          ) : null}
          {submitResult !== null ? (
            <Alert data-testid="register-result">
              <div className="grid gap-1">
                <AlertTitle>
                  {submitResult.created ? '已创建新 Run' : '幂等命中，返回原 Run'}
                </AlertTitle>
                <AlertDescription>
                  <div className="flex flex-wrap items-center gap-2">
                    <span>{submitResult.run.id}</span>
                    <RunStatusBadge status={submitResult.run.status} />
                    <Button size="xs" variant="outline" asChild data-testid="register-result-link">
                      <Link to={`/runs/${submitResult.run.id}`}>查看详情</Link>
                    </Button>
                  </div>
                </AlertDescription>
              </div>
            </Alert>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>请求列表</CardTitle>
          <CardDescription>
            GET /api/runs 按 owner 过滤，分页读取；其他账号的记录不会出现。
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {runsState.phase === 'loading' ? (
            <div className="grid gap-2" data-testid="runs-loading">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : null}
          {runsState.phase === 'error' && runsState.error !== null ? (
            <ErrorAlert error={runsState.error} testId="runs-error" />
          ) : null}
          {runsState.phase === 'ready' && items.length === 0 ? (
            <p
              className="border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground"
              data-testid="runs-empty"
            >
              当前账号还没有登记任何请求。
            </p>
          ) : null}
          {runsState.phase === 'ready' && items.length > 0 ? (
            <>
              <Table data-testid="runs-list">
                <TableHeader>
                  <TableRow>
                    <TableHead>问题</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead>创建时间</TableHead>
                    <TableHead>run_id</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((run) => (
                    <TableRow
                      key={run.id}
                      data-testid="run-row"
                      data-run-id={run.id}
                      className="cursor-pointer"
                      onClick={() => navigate(`/runs/${run.id}`)}
                    >
                      <TableCell className="max-w-[28rem]">
                        <SafeText value={run.question} className="line-clamp-2" />
                      </TableCell>
                      <TableCell>
                        <RunStatusBadge status={run.status} />
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {formatDateTime(run.created_at)}
                      </TableCell>
                      <TableCell>
                        <Link
                          to={`/runs/${run.id}`}
                          className="underline underline-offset-2"
                          onClick={(event) => event.stopPropagation()}
                        >
                          {run.id}
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span data-testid="runs-pagination-summary">
                  第 {offset + 1}–{lastIndex} 条，共 {total} 条
                </span>
                <Button
                  size="xs"
                  variant="outline"
                  disabled={!canGoPrevious}
                  onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                  data-testid="runs-previous"
                >
                  上一页
                </Button>
                <Button
                  size="xs"
                  variant="outline"
                  disabled={!canGoNext}
                  onClick={() => setOffset(offset + PAGE_SIZE)}
                  data-testid="runs-next"
                >
                  下一页
                </Button>
              </div>
            </>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}

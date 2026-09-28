import { useCallback, useEffect, useState } from 'react'

import { AuthPanel } from '@/components/AuthPanel'
import { ErrorAlert } from '@/components/ErrorAlert'
import { CheckStatusBadge, ResultBadge } from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
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
import { isCancelledError } from '@/api/client'
import { fetchHealth, fetchModels, fetchReady, runModelCheck } from '@/api/system'
import { useAuth } from '@/context/AuthContext'
import { formatDateTime, formatMillis, formatNumber, shortFingerprint } from '@/lib/format'
import { failed, loading, ready, scopedState } from '@/lib/load-state'
import type { ScopedResource, LoadState } from '@/lib/load-state'
import type { HealthResponse, ModelsResponse, ReadyResponse } from '@/types/system'

interface Readiness {
  health: HealthResponse
  ready: ReadyResponse
}

export function SystemPage() {
  const { apiKey, signal } = useAuth()

  const [readiness, setReadiness] = useState<LoadState<Readiness>>(loading())
  const [modelsResource, setModelsResource] = useState<ScopedResource<ModelsResponse> | null>(
    null,
  )
  const [checkRunning, setCheckRunning] = useState(false)
  const [checkError, setCheckError] = useState<unknown>(null)

  const modelsState = scopedState(apiKey, modelsResource)

  useEffect(() => {
    let active = true
    const load = async (): Promise<void> => {
      setReadiness(loading<Readiness>())
      try {
        const [health, readyPayload] = await Promise.all([fetchHealth(signal), fetchReady(signal)])
        if (active) setReadiness(ready({ health, ready: readyPayload }))
      } catch (error: unknown) {
        if (active && !isCancelledError(error)) setReadiness(failed<Readiness>(error))
      }
    }
    void load()
    return () => {
      active = false
    }
  }, [signal])

  const loadModels = useCallback(
    async (ownerKey: string): Promise<void> => {
      try {
        const payload = await fetchModels(ownerKey, signal)
        setModelsResource({ owner: ownerKey, state: ready(payload) })
      } catch (error: unknown) {
        if (!isCancelledError(error)) {
          setModelsResource({ owner: ownerKey, state: failed<ModelsResponse>(error) })
        }
      }
    },
    [signal],
  )

  useEffect(() => {
    if (apiKey === null) return
    void loadModels(apiKey)
  }, [apiKey, loadModels])

  async function handleModelCheck(): Promise<void> {
    if (apiKey === null || checkRunning) return
    setCheckRunning(true)
    setCheckError(null)
    try {
      await runModelCheck(apiKey, signal)
    } catch (error: unknown) {
      // 失败结果同样按 owner 落库，下面通过 GET /api/models 回读展示
      if (!isCancelledError(error)) setCheckError(error)
    }
    if (!signal.aborted) await loadModels(apiKey)
    setCheckRunning(false)
  }

  const models = modelsState.data
  const latestCheck = models?.latest_check ?? null
  const checkItems = latestCheck?.items ?? []

  return (
    <div className="grid gap-5">
      <AuthPanel />

      <Card>
        <CardHeader>
          <CardTitle>服务与数据库状态</CardTitle>
          <CardDescription>
            GET /api/health 与 GET /api/ready 的真实返回值；ready 在同一请求内执行 SELECT 1。
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {readiness.phase === 'loading' && readiness.data === null ? (
            <Skeleton className="h-16 w-full" data-testid="readiness-loading" />
          ) : null}
          {readiness.phase === 'error' && readiness.error !== null ? (
            <ErrorAlert error={readiness.error} testId="readiness-error" />
          ) : null}
          {readiness.data !== null ? (
            <dl
              className="grid gap-2 text-xs sm:grid-cols-2"
              data-testid="readiness-panel"
            >
              <div className="flex items-center justify-between gap-3 border border-border px-2.5 py-2">
                <dt className="text-muted-foreground">health.status</dt>
                <dd data-testid="health-status">{readiness.data.health.status}</dd>
              </div>
              <div className="flex items-center justify-between gap-3 border border-border px-2.5 py-2">
                <dt className="text-muted-foreground">ready.database</dt>
                <dd data-testid="ready-database">{readiness.data.ready.database}</dd>
              </div>
            </dl>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>四个模型角色与 Embedding 配置</CardTitle>
          <CardDescription>
            配置来源为服务端环境，页面不提交 Provider 地址或 Secret；这里只展示模型名、用途、能力要求与脱敏指纹。
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {modelsState.phase === 'loading' && models === null ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Spinner />
              <span data-testid="models-loading">正在读取模型配置</span>
            </div>
          ) : null}
          {modelsState.phase === 'error' && modelsState.error !== null ? (
            <ErrorAlert error={modelsState.error} testId="models-error" />
          ) : null}
          {models !== null ? (
            <>
              <Table data-testid="models-table">
                <TableHeader>
                  <TableRow>
                    <TableHead>角色</TableHead>
                    <TableHead>模型</TableHead>
                    <TableHead>用途</TableHead>
                    <TableHead>所需能力</TableHead>
                    <TableHead>Timeout</TableHead>
                    <TableHead>配置指纹</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {models.roles.map((role) => (
                    <TableRow key={role.role} data-testid={`model-role-${role.role}`}>
                      <TableCell className="font-medium">{role.role}</TableCell>
                      <TableCell>{role.model_name}</TableCell>
                      <TableCell className="text-muted-foreground">{role.purpose}</TableCell>
                      <TableCell>{role.required_capability}</TableCell>
                      <TableCell>{role.timeout_seconds}s</TableCell>
                      <TableCell title={role.config_fingerprint}>
                        {shortFingerprint(role.config_fingerprint)}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow data-testid="model-role-embedding">
                    <TableCell className="font-medium">embedding</TableCell>
                    <TableCell>{models.embedding.model_name}</TableCell>
                    <TableCell className="text-muted-foreground">
                      知识片段向量化（独立配置）
                    </TableCell>
                    <TableCell>{models.embedding.required_capability}</TableCell>
                    <TableCell>{models.embedding.timeout_seconds}s</TableCell>
                    <TableCell title={models.embedding.config_fingerprint}>
                      {shortFingerprint(models.embedding.config_fingerprint)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>向量维度：{models.embedding.dimension}</span>
                <Separator orientation="vertical" className="h-4" />
                <span title={models.config_fingerprint}>
                  整体配置指纹：{shortFingerprint(models.config_fingerprint)}
                </span>
              </div>
            </>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>真实 Provider 能力检查</CardTitle>
          <CardDescription>
            逐角色执行结构化输出、chat completion 与 Embedding 维度核验；同账号受服务端冷却时间与 lease
            约束，重复点击不会触发重复计费调用。
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <Button
              size="sm"
              onClick={() => void handleModelCheck()}
              disabled={apiKey === null || checkRunning}
              data-testid="model-check-button"
            >
              {checkRunning ? <Spinner /> : null}
              {checkRunning ? '检查执行中' : '运行模型能力检查'}
            </Button>
            {latestCheck ? (
              <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                最近状态 <CheckStatusBadge status={latestCheck.status} />
                <span>
                  总耗时 {formatMillis(latestCheck.total_latency_ms)} · 开始{' '}
                  {formatDateTime(latestCheck.started_at)} · 结束{' '}
                  {formatDateTime(latestCheck.finished_at)}
                </span>
              </span>
            ) : (
              <span className="text-xs text-muted-foreground" data-testid="check-idle">
                尚未运行检查
              </span>
            )}
          </div>
          {checkError !== null ? (
            <ErrorAlert error={checkError} testId="model-check-error" />
          ) : null}
          {checkItems.length > 0 ? (
            <Table data-testid="model-check-table">
              <TableHeader>
                <TableRow>
                  <TableHead>角色</TableHead>
                  <TableHead>结果</TableHead>
                  <TableHead>模型</TableHead>
                  <TableHead>能力</TableHead>
                  <TableHead>耗时</TableHead>
                  <TableHead>usage (in / out / total)</TableHead>
                  <TableHead>向量维度</TableHead>
                  <TableHead>失败类别</TableHead>
                  <TableHead>检查时间</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {checkItems.map((item) => (
                  <TableRow key={item.role} data-testid={`check-item-${item.role}`}>
                    <TableCell className="font-medium">{item.role}</TableCell>
                    <TableCell>
                      <ResultBadge success={item.success} />
                    </TableCell>
                    <TableCell>{item.model_name}</TableCell>
                    <TableCell>{item.capability}</TableCell>
                    <TableCell>{formatMillis(item.latency_ms)}</TableCell>
                    <TableCell>
                      {item.usage === null
                        ? '—'
                        : `${formatNumber(item.usage.input_tokens)} / ${formatNumber(
                            item.usage.output_tokens,
                          )} / ${formatNumber(item.usage.total_tokens)}`}
                    </TableCell>
                    <TableCell>{formatNumber(item.embedding_dimension)}</TableCell>
                    <TableCell>{item.error_category ?? '—'}</TableCell>
                    <TableCell>{formatDateTime(item.checked_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}

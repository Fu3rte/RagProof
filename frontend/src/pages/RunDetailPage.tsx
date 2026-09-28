import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { ErrorAlert } from '@/components/ErrorAlert'
import { RunStatusBadge } from '@/components/StatusBadge'
import { SafeText } from '@/components/SafeText'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { isCancelledError } from '@/api/client'
import { fetchRun, fetchRunEvents } from '@/api/runs'
import { useAuth } from '@/context/AuthContext'
import { formatDateTime, shortFingerprint } from '@/lib/format'
import { failed, loading, ready, scopedState } from '@/lib/load-state'
import type { ScopedResource } from '@/lib/load-state'
import { MODEL_ROLE_ORDER } from '@/types/system'
import { RUN_STATUS_LABELS } from '@/types/runs'
import type { Run, RunEvent } from '@/types/runs'

const EVENT_PAGE_SIZE = 100

interface RunDetail {
  run: Run
  events: RunEvent[]
}

export function RunDetailPage() {
  const { runId } = useParams<{ runId: string }>()
  const { apiKey, signal } = useAuth()
  const [detailResource, setDetailResource] = useState<ScopedResource<RunDetail> | null>(null)

  const detailState = scopedState(apiKey, detailResource)
  const detail = detailState.data

  useEffect(() => {
    if (apiKey === null || runId === undefined) return
    let active = true
    const load = async (): Promise<void> => {
      setDetailResource({ owner: apiKey, state: loading<RunDetail>() })
      try {
        const [run, eventPage] = await Promise.all([
          fetchRun(apiKey, runId, signal),
          fetchRunEvents(apiKey, runId, { after: 0, limit: EVENT_PAGE_SIZE }, signal),
        ])
        const deduplicated = new Map<number, RunEvent>()
        for (const item of eventPage.items) deduplicated.set(item.sequence, item)
        const events = [...deduplicated.values()].sort((a, b) => a.sequence - b.sequence)
        if (active) setDetailResource({ owner: apiKey, state: ready({ run, events }) })
      } catch (error: unknown) {
        if (active && !isCancelledError(error)) {
          setDetailResource({ owner: apiKey, state: failed<RunDetail>(error) })
        }
      }
    }
    void load()
    return () => {
      active = false
    }
  }, [apiKey, signal, runId])

  if (detailState.phase === 'loading' && detail === null) {
    return (
      <div className="grid gap-3" data-testid="run-detail-loading">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  if (detailState.phase === 'error' && detailState.error !== null) {
    return (
      <div className="grid gap-3">
        <Button variant="outline" size="sm" asChild className="w-fit">
          <Link to="/runs">返回请求列表</Link>
        </Button>
        <ErrorAlert error={detailState.error} testId="run-detail-error" />
      </div>
    )
  }

  if (detail === null) {
    return (
      <p className="text-xs text-muted-foreground" data-testid="run-detail-empty">
        该 Run 尚无可用数据。
      </p>
    )
  }

  const { run, events } = detail
  const snapshot = run.config_snapshot

  return (
    <div className="grid gap-5">
      <div>
        <Button variant="outline" size="sm" asChild>
          <Link to="/runs">返回请求列表</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Run 概要</CardTitle>
          <CardDescription>
            GET /api/runs/{'{run_id}'} 的落库事实：问题、状态、时间与冻结配置快照。
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <dl className="grid gap-2 text-xs sm:grid-cols-2">
            <div className="grid gap-1 border border-border px-2.5 py-2">
              <dt className="text-muted-foreground">run_id</dt>
              <dd className="wrap-anywhere" data-testid="detail-run-id">
                {run.id}
              </dd>
            </div>
            <div className="grid gap-1 border border-border px-2.5 py-2">
              <dt className="text-muted-foreground">执行状态</dt>
              <dd className="flex items-center gap-2">
                <RunStatusBadge status={run.status} />
                <span data-testid="detail-status-label">{RUN_STATUS_LABELS[run.status]}</span>
              </dd>
            </div>
            <div className="grid gap-1 border border-border px-2.5 py-2">
              <dt className="text-muted-foreground">创建时间</dt>
              <dd title={run.created_at}>{formatDateTime(run.created_at)}</dd>
            </div>
            <div className="grid gap-1 border border-border px-2.5 py-2">
              <dt className="text-muted-foreground">更新时间</dt>
              <dd title={run.updated_at}>{formatDateTime(run.updated_at)}</dd>
            </div>
          </dl>
          <div className="grid gap-1 border border-border px-2.5 py-2">
            <div className="text-xs text-muted-foreground">问题原文（不可信文本）</div>
            <div data-testid="detail-question">
              <SafeText value={run.question} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>配置快照</CardTitle>
          <CardDescription>
            Run 创建时冻结的非敏感配置；后续环境改动不会影响该 Run 的快照。
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <Table data-testid="snapshot-table">
            <TableHeader>
              <TableRow>
                <TableHead>角色</TableHead>
                <TableHead>模型</TableHead>
                <TableHead>用途</TableHead>
                <TableHead>Timeout</TableHead>
                <TableHead>配置指纹</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {MODEL_ROLE_ORDER.map((role) => (
                <TableRow key={role} data-testid={`snapshot-role-${role}`}>
                  <TableCell className="font-medium">{snapshot.roles[role].role}</TableCell>
                  <TableCell>{snapshot.roles[role].model_name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {snapshot.roles[role].purpose}
                  </TableCell>
                  <TableCell>{snapshot.roles[role].timeout_seconds}s</TableCell>
                  <TableCell title={snapshot.roles[role].config_fingerprint}>
                    {shortFingerprint(snapshot.roles[role].config_fingerprint)}
                  </TableCell>
                </TableRow>
              ))}
              <TableRow data-testid="snapshot-role-embedding">
                <TableCell className="font-medium">embedding</TableCell>
                <TableCell>{snapshot.embedding.model_name}</TableCell>
                <TableCell className="text-muted-foreground">
                  向量维度 {snapshot.embedding.dimension}
                </TableCell>
                <TableCell>—</TableCell>
                <TableCell title={snapshot.embedding.config_fingerprint}>
                  {shortFingerprint(snapshot.embedding.config_fingerprint)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
          <div className="text-xs text-muted-foreground" data-testid="snapshot-fingerprint">
            快照 schema v{snapshot.schema_version} · 整体配置指纹{' '}
            <span title={snapshot.config_fingerprint}>
              {shortFingerprint(snapshot.config_fingerprint)}
            </span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>知识快照</CardTitle>
          <CardDescription>
            该 Run 创建时冻结的文档版本集合，检索只在此集合内执行；之后的新版本不会改写这里的事实。
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <div
            className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"
            data-testid="run-retrieval-snapshot"
          >
            <span>快照 schema v{run.retrieval_snapshot.schema_version}</span>
            <span>
              冻结文档版本 {run.retrieval_snapshot.version_ids.length} 个
            </span>
          </div>
          {run.retrieval_snapshot.version_ids.length === 0 ? (
            <p className="text-xs text-muted-foreground" data-testid="run-retrieval-snapshot-empty">
              该 Run 创建时没有可用文档版本。
            </p>
          ) : (
            <ol className="grid gap-1">
              {run.retrieval_snapshot.version_ids.map((versionId) => (
                <li
                  key={versionId}
                  className="wrap-anywhere border border-border px-2.5 py-1.5 text-xs"
                  data-testid="run-retrieval-version"
                >
                  {versionId}
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>执行事件</CardTitle>
          <CardDescription>
            GET /api/runs/{'{run_id}'}/events?after=0&amp;limit=100；sequence 在 Run
            内单调递增，首个 run.created 为 1。
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {events.length === 0 ? (
            <p className="text-xs text-muted-foreground" data-testid="events-empty">
              暂无已落库事件。
            </p>
          ) : (
            <Table data-testid="run-events-table">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">sequence</TableHead>
                  <TableHead>type</TableHead>
                  <TableHead>时间</TableHead>
                  <TableHead>event_id</TableHead>
                  <TableHead>payload</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.map((event) => (
                  <TableRow key={event.event_id} data-testid={`event-row-${event.sequence}`}>
                    <TableCell className="font-medium" data-testid={`event-sequence-${event.sequence}`}>
                      {event.sequence}
                    </TableCell>
                    <TableCell>{event.type}</TableCell>
                    <TableCell className="whitespace-nowrap" title={event.timestamp}>
                      {formatDateTime(event.timestamp)}
                    </TableCell>
                    <TableCell className="wrap-anywhere">{event.event_id}</TableCell>
                    <TableCell>
                      <SafeText
                        value={JSON.stringify(event.data, null, 2)}
                        as="pre"
                        className="text-[0.7rem]"
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

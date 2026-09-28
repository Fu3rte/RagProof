import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { cn } from 'cn'

import { ErrorAlert } from '@/components/ErrorAlert'
import { SafeText } from '@/components/SafeText'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
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
import { getPublicError, isCancelledError } from '@/api/client'
import {
  createDocumentVersion,
  fetchDocument,
  fetchDocumentVersion,
  listDocumentChunks,
  listDocumentVersions,
} from '@/api/documents'
import { useAuth } from '@/context/AuthContext'
import { formatDateTime, formatNumber, shortFingerprint } from '@/lib/format'
import { failed, loading, ready, scopedState } from '@/lib/load-state'
import type { LoadState, ScopedResource } from '@/lib/load-state'
import {
  CHUNK_PAGE_SIZE,
  DOCUMENT_CONTENT_MAX_LENGTH,
  DOCUMENT_METADATA_MAX_LENGTH,
  DOCUMENT_TITLE_MAX_LENGTH,
  VERSION_PAGE_SIZE,
} from '@/types/documents'
import type {
  ChunkSummary,
  DocumentDetail,
  DocumentPublishResponse,
  DocumentVersionDetail,
  DocumentVersionSummary,
  PageResponse,
} from '@/types/documents'

interface VersionForm {
  title: string
  topic: string
  region: string
  person_type: string
  effective_date: string
  content: string
}

const EMPTY_FORM: VersionForm = {
  title: '',
  topic: '',
  region: '',
  person_type: '',
  effective_date: '',
  content: '',
}

// chunk 响应绑定所属版本，版本切换时旧页数据立即不可见
interface ChunkPayload {
  versionId: string
  page: PageResponse<ChunkSummary>
}

// 版本详情同样绑定发起请求的版本，旧版本的响应不会投影到新展示版本
interface VersionSlot {
  versionId: string
  detail: LoadState<DocumentVersionDetail>
}

type ChunksView =
  | { phase: 'idle' }
  | { phase: 'loading' }
  | { phase: 'error'; error: unknown }
  | { phase: 'ready'; versionId: string; page: PageResponse<ChunkSummary> }

function selectChunksView(
  state: LoadState<ChunkPayload | null>,
  versionId: string | null,
): ChunksView {
  if (versionId === null) return { phase: 'idle' }
  if (state.phase === 'error' && state.error !== null) {
    return { phase: 'error', error: state.error }
  }
  if (state.phase === 'ready' && state.data !== null && state.data.versionId === versionId) {
    return { phase: 'ready', versionId: state.data.versionId, page: state.data.page }
  }
  return { phase: 'loading' }
}

function selectVersionView(
  state: LoadState<VersionSlot | null>,
  versionId: string | null,
): LoadState<DocumentVersionDetail> {
  if (versionId === null) return { phase: 'idle', data: null, error: null }
  if (state.phase === 'ready' && state.data !== null && state.data.versionId === versionId) {
    return state.data.detail
  }
  return loading<DocumentVersionDetail>()
}

function formFromVersion(version: DocumentVersionDetail): VersionForm {
  return {
    title: version.title,
    topic: version.topic,
    region: version.region,
    person_type: version.person_type,
    effective_date: version.effective_date,
    content: version.content,
  }
}

function SummaryCell({
  label,
  testId,
  children,
}: {
  label: string
  testId?: string
  children: ReactNode
}) {
  return (
    <div className="grid gap-1 border border-border px-2.5 py-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="wrap-anywhere" data-testid={testId}>
        {children}
      </dd>
    </div>
  )
}

export function DocumentDetailPage() {
  const { documentId } = useParams<{ documentId: string }>()
  const { apiKey, signal } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()

  const [documentResource, setDocumentResource] =
    useState<ScopedResource<DocumentDetail> | null>(null)
  const [versionsResource, setVersionsResource] =
    useState<ScopedResource<PageResponse<DocumentVersionSummary>> | null>(null)
  const [versionResource, setVersionResource] =
    useState<ScopedResource<VersionSlot | null> | null>(null)
  const [chunksResource, setChunksResource] =
    useState<ScopedResource<ChunkPayload | null> | null>(null)

  const [versionsReloadKey, setVersionsReloadKey] = useState(0)
  const [versionReloadKey, setVersionReloadKey] = useState(0)
  const [chunksReloadKey, setChunksReloadKey] = useState(0)
  const [chunkPageRequest, setChunkPageRequest] = useState<{
    versionId: string
    offset: number
  } | null>(null)

  const [form, setForm] = useState<VersionForm>(EMPTY_FORM)
  const [submitting, setSubmitting] = useState(false)
  const [reloading, setReloading] = useState(false)
  const [publishError, setPublishError] = useState<unknown>(null)
  const [publishResult, setPublishResult] = useState<DocumentPublishResponse | null>(null)

  const seededVersionRef = useRef<string | null>(null)
  const ownerRef = useRef<string | null>(apiKey)

  // 每次提交先同步当前 owner，供异步回调在写入前比对，旧账号的迟到响应无法落进 state
  useEffect(() => {
    ownerRef.current = apiKey
  })

  const documentState = scopedState(apiKey, documentResource)
  const document = documentState.data
  const versionsState = scopedState(apiKey, versionsResource)
  const currentVersionId = document === null ? null : document.current_version_id
  const versionParam = searchParams.get('version')
  const chunkParam = searchParams.get('chunk')
  const displayedVersionId =
    versionParam === null || versionParam.length === 0 ? currentVersionId : versionParam
  const targetChunkId = chunkParam === null || chunkParam.length === 0 ? null : chunkParam
  const versionView = selectVersionView(scopedState(apiKey, versionResource), displayedVersionId)
  const versionDetail = versionView.phase === 'ready' ? versionView.data : null
  const versionError =
    versionView.phase === 'error' && versionView.error !== null ? versionView.error : null
  const versionsPage = versionsState.data
  const versions = versionsPage === null ? [] : versionsPage.items
  const chunksView = selectChunksView(scopedState(apiKey, chunksResource), displayedVersionId)
  const chunksPage = chunksView.phase === 'ready' ? chunksView.page : null
  const chunksVersionId = chunksView.phase === 'ready' ? chunksView.versionId : null
  const chunkOffset =
    chunkPageRequest !== null && chunkPageRequest.versionId === displayedVersionId
      ? chunkPageRequest.offset
      : 0

  useEffect(() => {
    if (apiKey === null || documentId === undefined) return
    let active = true
    const load = async (): Promise<void> => {
      setDocumentResource({ owner: apiKey, state: loading<DocumentDetail>() })
      try {
        const payload = await fetchDocument(apiKey, documentId, signal)
        if (active && ownerRef.current === apiKey) {
          setDocumentResource({ owner: apiKey, state: ready(payload) })
        }
      } catch (error: unknown) {
        if (active && !isCancelledError(error) && ownerRef.current === apiKey) {
          setDocumentResource({ owner: apiKey, state: failed<DocumentDetail>(error) })
        }
      }
    }
    void load()
    return () => {
      active = false
    }
  }, [apiKey, signal, documentId])

  useEffect(() => {
    if (apiKey === null || documentId === undefined) return
    let active = true
    const load = async (): Promise<void> => {
      setVersionsResource({
        owner: apiKey,
        state: loading<PageResponse<DocumentVersionSummary>>(),
      })
      try {
        const payload = await listDocumentVersions(
          apiKey,
          documentId,
          { offset: 0, limit: VERSION_PAGE_SIZE },
          signal,
        )
        if (active && ownerRef.current === apiKey) {
          setVersionsResource({ owner: apiKey, state: ready(payload) })
        }
      } catch (error: unknown) {
        if (active && !isCancelledError(error) && ownerRef.current === apiKey) {
          setVersionsResource({
            owner: apiKey,
            state: failed<PageResponse<DocumentVersionSummary>>(error),
          })
        }
      }
    }
    void load()
    return () => {
      active = false
    }
  }, [apiKey, signal, documentId, versionsReloadKey])

  useEffect(() => {
    if (apiKey === null || documentId === undefined || displayedVersionId === null) return
    const requestedVersionId = displayedVersionId
    let active = true
    const store = (detail: LoadState<DocumentVersionDetail>): void => {
      if (active && ownerRef.current === apiKey) {
        setVersionResource({
          owner: apiKey,
          state: ready<VersionSlot | null>({ versionId: requestedVersionId, detail }),
        })
      }
    }
    const load = async (): Promise<void> => {
      store(loading<DocumentVersionDetail>())
      try {
        const payload = await fetchDocumentVersion(
          apiKey,
          documentId,
          requestedVersionId,
          signal,
        )
        store(ready(payload))
      } catch (error: unknown) {
        if (!isCancelledError(error)) store(failed<DocumentVersionDetail>(error))
      }
    }
    void load()
    return () => {
      active = false
    }
  }, [apiKey, signal, documentId, displayedVersionId, versionReloadKey])

  useEffect(() => {
    if (apiKey === null || documentId === undefined || displayedVersionId === null) return
    const requestedVersionId = displayedVersionId
    let active = true
    const store = (state: LoadState<ChunkPayload | null>): void => {
      if (active && ownerRef.current === apiKey) {
        setChunksResource({ owner: apiKey, state })
      }
    }
    const load = async (): Promise<void> => {
      store(loading<ChunkPayload | null>())
      try {
        let page = await listDocumentChunks(
          apiKey,
          documentId,
          requestedVersionId,
          { offset: chunkOffset, limit: CHUNK_PAGE_SIZE },
          signal,
        )
        // chunk 定位：服务端按 ordinal 排序，只能以 total 为界顺序翻页，命中即停
        if (targetChunkId !== null && !page.items.some((item) => item.id === targetChunkId)) {
          const pageCount = Math.max(1, Math.ceil(page.total / CHUNK_PAGE_SIZE))
          const lastOffset = (pageCount - 1) * CHUNK_PAGE_SIZE
          let nextOffset = page.offset + CHUNK_PAGE_SIZE
          while (nextOffset <= lastOffset) {
            page = await listDocumentChunks(
              apiKey,
              documentId,
              requestedVersionId,
              { offset: nextOffset, limit: CHUNK_PAGE_SIZE },
              signal,
            )
            if (page.items.some((item) => item.id === targetChunkId)) break
            nextOffset += CHUNK_PAGE_SIZE
          }
        }
        store(ready<ChunkPayload | null>({ versionId: requestedVersionId, page }))
      } catch (error: unknown) {
        if (!isCancelledError(error)) store(failed<ChunkPayload | null>(error))
      }
    }
    void load()
    return () => {
      active = false
    }
  }, [
    apiKey,
    signal,
    documentId,
    displayedVersionId,
    chunkOffset,
    targetChunkId,
    chunksReloadKey,
  ])

  // 只在展示版本变化时用服务端值填表；同一版本的后台刷新不覆盖用户输入
  useEffect(() => {
    if (displayedVersionId === null || versionDetail === null) return
    if (seededVersionRef.current === displayedVersionId) return
    seededVersionRef.current = displayedVersionId
    setForm(formFromVersion(versionDetail))
  }, [displayedVersionId, versionDetail])

  function updateForm(field: keyof VersionForm, value: string): void {
    setForm((previous) => ({ ...previous, [field]: value }))
    setPublishError(null)
    setPublishResult(null)
  }

  function selectVersion(versionId: string): void {
    setSearchParams({ version: versionId })
  }

  async function handlePublish(): Promise<void> {
    if (apiKey === null || documentId === undefined || submitting) return
    setSubmitting(true)
    setPublishError(null)
    setPublishResult(null)
    try {
      const result = await createDocumentVersion(
        apiKey,
        documentId,
        {
          ...form,
          // CAS 条件只取本页加载到的 Document.current_version_id，与展示版本无关
          expected_current_version_id: currentVersionId,
        },
        signal,
      )
      setPublishResult(result)
      seededVersionRef.current = null
      setSearchParams({ version: result.version.id })
      setVersionReloadKey((value) => value + 1)
      setVersionsReloadKey((value) => value + 1)
      setChunksReloadKey((value) => value + 1)
      const freshDocument = await fetchDocument(apiKey, documentId, signal)
      if (ownerRef.current === apiKey) {
        setDocumentResource({ owner: apiKey, state: ready(freshDocument) })
      }
    } catch (error: unknown) {
      if (!isCancelledError(error)) setPublishError(error)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleConflictReload(): Promise<void> {
    if (apiKey === null || documentId === undefined || reloading) return
    setReloading(true)
    try {
      const [freshDocument, freshVersions] = await Promise.all([
        fetchDocument(apiKey, documentId, signal),
        listDocumentVersions(apiKey, documentId, { offset: 0, limit: VERSION_PAGE_SIZE }, signal),
      ])
      if (ownerRef.current !== apiKey) return
      const serverVersionId = freshDocument.current_version_id
      setDocumentResource({ owner: apiKey, state: ready(freshDocument) })
      setVersionsResource({ owner: apiKey, state: ready(freshVersions) })
      setPublishError(null)
      seededVersionRef.current = null
      setVersionReloadKey((value) => value + 1)
      setChunksReloadKey((value) => value + 1)
      setSearchParams(serverVersionId === null ? {} : { version: serverVersionId })
    } catch (error: unknown) {
      if (!isCancelledError(error)) setPublishError(error)
    } finally {
      setReloading(false)
    }
  }

  const detailError =
    documentState.phase === 'error' && documentState.error !== null
      ? documentState.error
      : versionError
  const conflictError =
    publishError === null ? null : getPublicError(publishError).code === 'DOCUMENT_VERSION_CONFLICT'

  if (documentState.phase === 'loading' && document === null) {
    return (
      <div className="grid gap-3" data-testid="document-detail-loading" aria-live="polite">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  if (detailError !== null) {
    return (
      <div className="grid gap-3">
        <Button variant="outline" size="sm" asChild className="w-fit">
          <Link to="/documents">返回文档列表</Link>
        </Button>
        <ErrorAlert error={detailError} testId="document-detail-error" />
      </div>
    )
  }

  if (document === null) {
    return (
      <p className="text-xs text-muted-foreground" data-testid="document-detail-empty">
        该文档尚无可用数据。
      </p>
    )
  }

  const chunkTotal = chunksPage === null ? 0 : chunksPage.total
  const chunkCurrentOffset = chunksPage === null ? 0 : chunksPage.offset
  const chunkLastIndex =
    chunksPage === null ? 0 : Math.min(chunkCurrentOffset + CHUNK_PAGE_SIZE, chunkTotal)

  return (
    <div className="grid gap-5">
      <div>
        <Button variant="outline" size="sm" asChild>
          <Link to="/documents">返回文档列表</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>文档概要</CardTitle>
          <CardDescription>
            GET /api/documents/{'{document_id}'} 返回的稳定文档身份、当前版本指针与版本派生元数据。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-2 text-xs sm:grid-cols-2">
            <SummaryCell label="document_id" testId="detail-document-id">
              {document.id}
            </SummaryCell>
            <SummaryCell label="标题">
              <SafeText value={document.title} />
            </SummaryCell>
            <SummaryCell label="current_version_id" testId="detail-current-version-id">
              {document.current_version_id === null ? '—' : document.current_version_id}
            </SummaryCell>
            <SummaryCell label="当前版本号">{formatNumber(document.version_number)}</SummaryCell>
            <SummaryCell label="chunk 数">{formatNumber(document.chunk_count)}</SummaryCell>
            <SummaryCell label="主题">
              <SafeText value={document.topic ?? '—'} />
            </SummaryCell>
            <SummaryCell label="地区">
              <SafeText value={document.region ?? '—'} />
            </SummaryCell>
            <SummaryCell label="人员类型">
              <SafeText value={document.person_type ?? '—'} />
            </SummaryCell>
            <SummaryCell label="生效日期">
              <SafeText value={document.effective_date ?? '—'} />
            </SummaryCell>
            <SummaryCell label="发布时间">{formatDateTime(document.published_at)}</SummaryCell>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>发布新版本</CardTitle>
          <CardDescription>
            初值复制当前展示版本的正文与元数据；提交时携带页面读取到的 expected_current_version_id，
            由服务端在短事务内做 CAS 校验。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-3"
            data-testid="version-publish-form"
            onSubmit={(event) => {
              event.preventDefault()
              void handlePublish()
            }}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="version-title">标题（上限 {DOCUMENT_TITLE_MAX_LENGTH} 字符）</Label>
                <Input
                  id="version-title"
                  data-testid="version-title-input"
                  value={form.title}
                  onChange={(event) => updateForm('title', event.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="version-topic">
                  主题（上限 {DOCUMENT_METADATA_MAX_LENGTH} 字符）
                </Label>
                <Input
                  id="version-topic"
                  data-testid="version-topic-input"
                  value={form.topic}
                  onChange={(event) => updateForm('topic', event.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="version-region">
                  地区（上限 {DOCUMENT_METADATA_MAX_LENGTH} 字符）
                </Label>
                <Input
                  id="version-region"
                  data-testid="version-region-input"
                  value={form.region}
                  onChange={(event) => updateForm('region', event.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="version-person-type">
                  人员类型（上限 {DOCUMENT_METADATA_MAX_LENGTH} 字符）
                </Label>
                <Input
                  id="version-person-type"
                  data-testid="version-person-type-input"
                  value={form.person_type}
                  onChange={(event) => updateForm('person_type', event.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="version-effective-date">生效日期</Label>
                <Input
                  id="version-effective-date"
                  type="date"
                  data-testid="version-effective-date-input"
                  value={form.effective_date}
                  onChange={(event) => updateForm('effective_date', event.target.value)}
                />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="version-content">正文</Label>
              <Textarea
                id="version-content"
                data-testid="version-content-input"
                rows={12}
                className="max-h-[28rem] overflow-y-auto"
                aria-describedby="version-content-help"
                value={form.content}
                onChange={(event) => updateForm('content', event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                    event.preventDefault()
                    void handlePublish()
                  }
                }}
              />
              <p
                id="version-content-help"
                className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground"
              >
                <span data-testid="version-content-count">
                  当前字符数 {form.content.length} / {DOCUMENT_CONTENT_MAX_LENGTH}
                </span>
                <span>Ctrl / Cmd + Enter 提交</span>
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                type="submit"
                disabled={submitting}
                data-testid="version-submit-button"
              >
                {submitting ? <Spinner /> : null}
                {submitting ? '正在构建' : '发布新版本'}
              </Button>
            </div>
            <div className="grid gap-2" aria-live="polite">
              {publishError !== null ? (
                <>
                  <ErrorAlert error={publishError} testId="version-publish-error" />
                  {conflictError === true ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-fit"
                      disabled={reloading}
                      onClick={() => void handleConflictReload()}
                      data-testid="version-conflict-reload"
                    >
                      {reloading ? <Spinner /> : null}
                      {reloading ? '正在重新加载' : '重新加载当前版本'}
                    </Button>
                  ) : null}
                </>
              ) : null}
              {publishResult !== null ? (
                <Alert data-testid="version-publish-result">
                  <div className="grid gap-1">
                    <AlertTitle>
                      {publishResult.created ? '已发布新版本' : '已复用版本'}
                    </AlertTitle>
                    <AlertDescription>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="wrap-anywhere">{publishResult.version.id}</span>
                        <span>v{publishResult.version.version_number}</span>
                        <span>chunk 数 {formatNumber(publishResult.version.chunk_count)}</span>
                        <Button size="xs" variant="outline" asChild>
                          <Link
                            to={`/documents/${encodeURIComponent(document.id)}?version=${encodeURIComponent(publishResult.version.id)}`}
                          >
                            查看该版本
                          </Link>
                        </Button>
                      </div>
                    </AlertDescription>
                  </div>
                </Alert>
              ) : null}
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>历史版本与完整原文</CardTitle>
          <CardDescription>
            版本一经发布即不可变；点击版本行切换该版本，URL 的 version 参数记录当前展示版本。
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {versionsState.phase === 'loading' ? (
            <div className="grid gap-2" data-testid="versions-loading" aria-live="polite">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : null}
          {versionsState.phase === 'error' && versionsState.error !== null ? (
            <ErrorAlert error={versionsState.error} testId="versions-error" />
          ) : null}
          {versionsState.phase === 'ready' && versions.length === 0 ? (
            <p
              className="border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground"
              data-testid="version-list-empty"
            >
              尚无历史版本。
            </p>
          ) : null}
          {versionsState.phase === 'ready' && versions.length > 0 ? (
            <Table data-testid="version-list">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-24">版本号</TableHead>
                  <TableHead>version_id</TableHead>
                  <TableHead>发布时间</TableHead>
                  <TableHead className="w-24">chunk 数</TableHead>
                  <TableHead className="w-24">指针</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {versions.map((version) => (
                  <TableRow
                    key={version.id}
                    data-testid="version-row"
                    data-version-id={version.id}
                    className="cursor-pointer"
                    onClick={() => selectVersion(version.id)}
                  >
                    <TableCell className="font-medium">v{version.version_number}</TableCell>
                    <TableCell className="wrap-anywhere">
                      <Link
                        to={`/documents/${encodeURIComponent(document.id)}?version=${encodeURIComponent(version.id)}`}
                        className="underline underline-offset-2"
                        onClick={(event) => event.stopPropagation()}
                      >
                        {version.id}
                      </Link>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {formatDateTime(version.published_at)}
                    </TableCell>
                    <TableCell>{formatNumber(version.chunk_count)}</TableCell>
                    <TableCell>
                      {version.id === currentVersionId ? (
                        <Badge variant="secondary" data-testid="version-current-badge">
                          current
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : null}

          {displayedVersionId === null ? (
            <p className="text-xs text-muted-foreground" data-testid="version-detail-empty">
              该文档尚无已发布版本，没有可读取的原文。
            </p>
          ) : null}
          {displayedVersionId !== null && versionDetail === null ? (
            <div className="grid gap-2" data-testid="version-detail-loading" aria-live="polite">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-32 w-full" />
            </div>
          ) : null}
          {versionDetail !== null ? (
            <>
              <dl className="grid gap-2 text-xs sm:grid-cols-2">
                <SummaryCell label="version_id">{versionDetail.id}</SummaryCell>
                <SummaryCell label="版本号">v{versionDetail.version_number}</SummaryCell>
                <SummaryCell label="标题">
                  <SafeText value={versionDetail.title} />
                </SummaryCell>
                <SummaryCell label="主题">
                  <SafeText value={versionDetail.topic} />
                </SummaryCell>
                <SummaryCell label="地区">
                  <SafeText value={versionDetail.region} />
                </SummaryCell>
                <SummaryCell label="人员类型">
                  <SafeText value={versionDetail.person_type} />
                </SummaryCell>
                <SummaryCell label="生效日期">
                  <SafeText value={versionDetail.effective_date} />
                </SummaryCell>
                <SummaryCell label="发布时间">
                  {formatDateTime(versionDetail.published_at)}
                </SummaryCell>
                <SummaryCell label="chunk 数">{formatNumber(versionDetail.chunk_count)}</SummaryCell>
                <SummaryCell label="正文字符数">{versionDetail.content.length}</SummaryCell>
                <SummaryCell label="build_fingerprint">
                  <span title={versionDetail.build_fingerprint}>
                    {shortFingerprint(versionDetail.build_fingerprint)}
                  </span>
                </SummaryCell>
                <SummaryCell label="embedding_model">
                  <SafeText value={versionDetail.embedding_model} />
                </SummaryCell>
                <SummaryCell label="embedding_dimension">
                  {versionDetail.embedding_dimension}
                </SummaryCell>
                <SummaryCell label="chunk_size">{versionDetail.chunk_size}</SummaryCell>
                <SummaryCell label="chunk_overlap">{versionDetail.chunk_overlap}</SummaryCell>
                <SummaryCell label="content_sha256">
                  {versionDetail.content_sha256}
                </SummaryCell>
              </dl>
              <div className="grid gap-1">
                <div className="text-xs text-muted-foreground">完整原文（不可信文本，保留换行）</div>
                <div
                  className="max-h-[32rem] overflow-y-auto border border-border bg-muted/30 px-2.5 py-2"
                  data-testid="version-content"
                >
                  <SafeText value={versionDetail.content} as="pre" className="text-[0.7rem]" />
                </div>
              </div>
            </>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>chunk 明细</CardTitle>
          <CardDescription>
            GET /api/documents/{'{document_id}'}/versions/{'{version_id}'}/chunks 按 ordinal 升序分页，
            正文与 hash 全部来自服务端。
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {chunksView.phase === 'idle' ? (
            <p className="text-xs text-muted-foreground" data-testid="chunks-no-version">
              该文档尚无已发布版本，没有可读取的 chunk。
            </p>
          ) : null}
          {chunksView.phase === 'loading' ? (
            <div className="grid gap-2" data-testid="chunks-loading" aria-live="polite">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : null}
          {chunksView.phase === 'error' ? (
            <ErrorAlert error={chunksView.error} testId="chunks-error" />
          ) : null}
          {chunksView.phase === 'ready' && chunkTotal === 0 ? (
            <p
              className="border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground"
              data-testid="chunks-empty"
            >
              该版本没有 chunk。
            </p>
          ) : null}
          {chunksView.phase === 'ready' && chunkTotal > 0 && chunksVersionId !== null ? (
            <>
              <Table data-testid="chunks-list">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-20">ordinal</TableHead>
                    <TableHead>chunk_id</TableHead>
                    <TableHead className="w-28">字符数</TableHead>
                    <TableHead>content_sha256</TableHead>
                    <TableHead>正文</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {chunksView.page.items.map((chunk) => {
                    const isTarget = chunk.id === targetChunkId
                    return (
                      <TableRow
                        key={chunk.id}
                        data-testid="chunk-row"
                        data-chunk-id={chunk.id}
                        aria-current={isTarget ? 'true' : undefined}
                        className={cn(
                          'align-top',
                          isTarget ? 'border-l-2 border-primary bg-secondary' : null,
                        )}
                      >
                        <TableCell className="font-medium">{chunk.ordinal}</TableCell>
                        <TableCell className="wrap-anywhere">{chunk.id}</TableCell>
                        <TableCell>{formatNumber(chunk.character_count)}</TableCell>
                        <TableCell className="wrap-anywhere">{chunk.content_sha256}</TableCell>
                        <TableCell className="max-w-[36rem] whitespace-normal">
                          <div className="max-h-56 overflow-y-auto">
                            <SafeText value={chunk.content} as="pre" className="text-[0.7rem]" />
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span data-testid="chunks-pagination-summary">
                  第 {chunkCurrentOffset + 1}–{chunkLastIndex} 条，共 {chunkTotal} 个 chunk
                </span>
                <Button
                  size="xs"
                  variant="outline"
                  disabled={chunkCurrentOffset <= 0}
                  onClick={() =>
                    setChunkPageRequest({
                      versionId: chunksVersionId,
                      offset: Math.max(0, chunkCurrentOffset - CHUNK_PAGE_SIZE),
                    })
                  }
                  data-testid="chunks-previous"
                >
                  上一页
                </Button>
                <Button
                  size="xs"
                  variant="outline"
                  disabled={chunkLastIndex >= chunkTotal}
                  onClick={() =>
                    setChunkPageRequest({
                      versionId: chunksVersionId,
                      offset: chunkCurrentOffset + CHUNK_PAGE_SIZE,
                    })
                  }
                  data-testid="chunks-next"
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

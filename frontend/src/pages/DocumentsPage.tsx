import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'

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
import { isCancelledError } from '@/api/client'
import { createDocument, listDocuments, previewRetrieval } from '@/api/documents'
import { useAuth } from '@/context/AuthContext'
import { formatDateTime, formatMillis, formatNumber } from '@/lib/format'
import { failed, loading, ready, scopedState } from '@/lib/load-state'
import type { ScopedResource } from '@/lib/load-state'
import {
  DOCUMENT_CONTENT_MAX_LENGTH,
  DOCUMENT_METADATA_MAX_LENGTH,
  DOCUMENT_PAGE_SIZE,
  DOCUMENT_TITLE_MAX_LENGTH,
  RETRIEVAL_QUERY_MAX_LENGTH,
  RETRIEVAL_TOP_K_DEFAULT,
  RETRIEVAL_TOP_K_MAX,
  RETRIEVAL_TOP_K_MIN,
} from '@/types/documents'
import type {
  DocumentPublishResponse,
  DocumentSummary,
  PageResponse,
  RetrievalPreviewResponse,
} from '@/types/documents'

type DocumentListResponse = PageResponse<DocumentSummary>

const DECODE_INVALID_UTF8_MESSAGE = '所选文件不是有效的 UTF-8 文本，正文保持原值。'
const DECODE_READ_FAILED_MESSAGE = '读取所选文件失败，正文保持原值。'
const DECODE_TYPE_REJECTED_MESSAGE = '请选择 .txt 纯文本文件，正文保持原值。'

function nullableText(value: string | null): string {
  return value === null ? '—' : value
}

function stripTxtSuffix(name: string): string {
  return name.replace(/\.txt$/i, '')
}

export function DocumentsPage() {
  const { apiKey, ownerId, signal } = useAuth()
  const navigate = useNavigate()

  const [title, setTitle] = useState('')
  const [topic, setTopic] = useState('')
  const [region, setRegion] = useState('')
  const [personType, setPersonType] = useState('')
  const [effectiveDate, setEffectiveDate] = useState('')
  const [content, setContent] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [decodeError, setDecodeError] = useState<string | null>(null)
  const [createResource, setCreateResource] = useState<
    ScopedResource<DocumentPublishResponse> | null
  >(null)
  const [createFailure, setCreateFailure] = useState<ScopedResource<null> | null>(null)

  const [offset, setOffset] = useState(0)
  const [reloadKey, setReloadKey] = useState(0)
  const [documentsResource, setDocumentsResource] = useState<
    ScopedResource<DocumentListResponse> | null
  >(null)

  const decodeGenerationRef = useRef(0)

  useEffect(() => {
    return () => {
      // 卸载后仍在进行的文件解码不得写入状态
      decodeGenerationRef.current += 1
    }
  }, [])

  const documentsState = scopedState(apiKey, documentsResource)
  const createState = scopedState(apiKey, createResource)
  const createFailureState = scopedState(apiKey, createFailure)

  const page = documentsState.data
  const createResult = createState.data
  const items = page?.items ?? []
  const total = page?.total ?? 0
  const lastIndex = Math.min(offset + DOCUMENT_PAGE_SIZE, total)
  const canGoPrevious = offset > 0
  const canGoNext = lastIndex < total

  useEffect(() => {
    if (apiKey === null) return
    let active = true
    const load = async (): Promise<void> => {
      setDocumentsResource({ owner: apiKey, state: loading<DocumentListResponse>() })
      try {
        const payload = await listDocuments(apiKey, { offset, limit: DOCUMENT_PAGE_SIZE }, signal)
        if (active) setDocumentsResource({ owner: apiKey, state: ready(payload) })
      } catch (error: unknown) {
        if (active && !isCancelledError(error)) {
          setDocumentsResource({ owner: apiKey, state: failed<DocumentListResponse>(error) })
        }
      }
    }
    void load()
    return () => {
      active = false
    }
  }, [apiKey, signal, offset, reloadKey])

  async function handleFileSelect(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const files = event.target.files
    const file = files === null ? null : files.item(0)
    // 立即清空 value，再次选择同一个文件同样触发读取
    event.target.value = ''
    if (file === null) return

    const acceptable = file.name.toLowerCase().endsWith('.txt') || file.type === 'text/plain'
    if (!acceptable) {
      setDecodeError(DECODE_TYPE_REJECTED_MESSAGE)
      return
    }

    decodeGenerationRef.current += 1
    const generation = decodeGenerationRef.current
    const sessionSignal = signal
    try {
      const buffer = await file.arrayBuffer()
      // fatal 让非法字节序列就地抛错，避免用替换字符把损坏正文当成成功结果
      const decoded = new TextDecoder('utf-8', { fatal: true }).decode(buffer)
      if (decodeGenerationRef.current !== generation || sessionSignal.aborted) return
      setContent(decoded)
      setTitle((current) => (current.trim().length === 0 ? stripTxtSuffix(file.name) : current))
      setDecodeError(null)
    } catch (error: unknown) {
      if (decodeGenerationRef.current !== generation || sessionSignal.aborted) return
      // TextDecoder 的 fatal 失败是 TypeError，其余是文件本身读取失败
      setDecodeError(
        error instanceof TypeError ? DECODE_INVALID_UTF8_MESSAGE : DECODE_READ_FAILED_MESSAGE,
      )
    }
  }

  async function handleCreate(): Promise<void> {
    if (apiKey === null || submitting) return
    setSubmitting(true)
    setDecodeError(null)
    setCreateFailure(null)
    setCreateResource(null)
    const owner = apiKey
    const sessionSignal = signal
    try {
      const result = await createDocument(
        owner,
        {
          title,
          topic,
          region,
          person_type: personType,
          effective_date: effectiveDate,
          content,
        },
        sessionSignal,
      )
      // 账号 generation 已翻转则不再落任何服务端事实，也不清空表单
      if (sessionSignal.aborted) return
      setCreateResource({ owner, state: ready(result) })
      setTitle('')
      setTopic('')
      setRegion('')
      setPersonType('')
      setEffectiveDate('')
      setContent('')
      setOffset(0)
      setReloadKey((value) => value + 1)
    } catch (error: unknown) {
      if (!isCancelledError(error) && !sessionSignal.aborted) {
        setCreateFailure({ owner, state: failed<null>(error) })
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="grid gap-5">
      <Card>
        <CardHeader>
          <CardTitle>录入制度文档</CardTitle>
          <CardDescription>
            POST /api/documents 由服务端切分 chunk、调用 Embedding 并发布版本；正文为空或超过
            {DOCUMENT_CONTENT_MAX_LENGTH} 字符同样提交，真实 422 由服务端返回。
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <div className="grid gap-3" data-testid="document-create-form">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="document-title">标题</Label>
                <Input
                  id="document-title"
                  data-testid="document-title-input"
                  value={title}
                  aria-describedby="document-title-help"
                  onChange={(event) => setTitle(event.target.value)}
                />
                <p id="document-title-help" className="text-xs text-muted-foreground">
                  上限 {DOCUMENT_TITLE_MAX_LENGTH} 字符
                </p>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="document-effective-date">生效日期</Label>
                <Input
                  id="document-effective-date"
                  type="date"
                  data-testid="document-effective-date-input"
                  value={effectiveDate}
                  aria-describedby="document-effective-date-help"
                  onChange={(event) => setEffectiveDate(event.target.value)}
                />
                <p id="document-effective-date-help" className="text-xs text-muted-foreground">
                  缺失或格式不符由服务端返回 422
                </p>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="document-topic">主题</Label>
                <Input
                  id="document-topic"
                  data-testid="document-topic-input"
                  value={topic}
                  aria-describedby="document-topic-help"
                  onChange={(event) => setTopic(event.target.value)}
                />
                <p id="document-topic-help" className="text-xs text-muted-foreground">
                  上限 {DOCUMENT_METADATA_MAX_LENGTH} 字符
                </p>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="document-region">地区</Label>
                <Input
                  id="document-region"
                  data-testid="document-region-input"
                  value={region}
                  aria-describedby="document-region-help"
                  onChange={(event) => setRegion(event.target.value)}
                />
                <p id="document-region-help" className="text-xs text-muted-foreground">
                  上限 {DOCUMENT_METADATA_MAX_LENGTH} 字符
                </p>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="document-person-type">人员类型</Label>
                <Input
                  id="document-person-type"
                  data-testid="document-person-type-input"
                  value={personType}
                  aria-describedby="document-person-type-help"
                  onChange={(event) => setPersonType(event.target.value)}
                />
                <p id="document-person-type-help" className="text-xs text-muted-foreground">
                  上限 {DOCUMENT_METADATA_MAX_LENGTH} 字符
                </p>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="document-file">UTF-8 .txt 文件</Label>
                <Input
                  id="document-file"
                  type="file"
                  accept=".txt,text/plain"
                  data-testid="document-file-input"
                  aria-describedby="document-file-help"
                  onChange={(event) => void handleFileSelect(event)}
                />
                <p id="document-file-help" className="text-xs text-muted-foreground">
                  浏览器内严格 UTF-8 解码后写入下方正文，标题为空时使用去掉 .txt 的文件名
                </p>
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="document-content">正文</Label>
              <Textarea
                id="document-content"
                data-testid="document-content-input"
                placeholder="粘贴制度正文，或使用上方文件选择"
                rows={10}
                className="max-h-96 overflow-y-auto"
                value={content}
                aria-describedby="document-content-help"
                onChange={(event) => setContent(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                    event.preventDefault()
                    void handleCreate()
                  }
                }}
              />
              <p
                id="document-content-help"
                className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground"
              >
                <span data-testid="document-content-count">
                  当前字符数 {content.length} / {DOCUMENT_CONTENT_MAX_LENGTH}
                </span>
                <span>Ctrl / Cmd + Enter 提交</span>
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                type="button"
                onClick={() => void handleCreate()}
                disabled={submitting}
                data-testid="document-submit-button"
              >
                {submitting ? <Spinner /> : null}
                {submitting ? '正在构建' : '构建并发布'}
              </Button>
            </div>
          </div>

          <div className="grid gap-2" aria-live="polite">
            {createFailureState.phase === 'error' && createFailureState.error !== null ? (
              <ErrorAlert error={createFailureState.error} testId="document-create-error" />
            ) : decodeError !== null ? (
              <p
                role="alert"
                className="border border-destructive/40 bg-card px-2.5 py-2 text-xs text-destructive"
                data-testid="document-create-error"
              >
                {decodeError}
              </p>
            ) : null}

            {createResult !== null ? (
              <Alert data-testid="document-create-result">
                <div className="grid gap-1">
                  <AlertTitle>
                    {createResult.created ? '已发布新版本' : '同一构建结果已复用'}
                  </AlertTitle>
                  <AlertDescription>
                    <div className="flex flex-wrap items-center gap-2">
                      <span>document_id</span>
                      <span className="wrap-anywhere" data-testid="document-result-id">
                        {createResult.document.id}
                      </span>
                      <span>version_id</span>
                      <span className="wrap-anywhere" data-testid="document-result-version-id">
                        {createResult.version.id}
                      </span>
                      <span data-testid="document-result-version-number">
                        第 {formatNumber(createResult.version.version_number)} 版
                      </span>
                      <span data-testid="document-result-chunk-count">
                        chunk 数 {formatNumber(createResult.version.chunk_count)}
                      </span>
                      <span>发布时间 {formatDateTime(createResult.version.published_at)}</span>
                      <Button size="xs" variant="outline" asChild data-testid="document-result-link">
                        <Link to={`/documents/${createResult.document.id}`}>查看文档</Link>
                      </Button>
                    </div>
                  </AlertDescription>
                </div>
              </Alert>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>文档列表</CardTitle>
          <CardDescription>
            GET /api/documents 按 owner 分页读取，每页 {DOCUMENT_PAGE_SIZE} 条；没有当前版本的文档其版本字段显示为
            —。
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {documentsState.phase === 'loading' ? (
            <div className="grid gap-2" data-testid="documents-loading">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : null}
          {documentsState.phase === 'error' && documentsState.error !== null ? (
            <ErrorAlert error={documentsState.error} testId="documents-error" />
          ) : null}
          {documentsState.phase === 'ready' && items.length === 0 ? (
            <p
              className="border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground"
              data-testid="documents-empty"
            >
              当前账号还没有文档
            </p>
          ) : null}
          {documentsState.phase === 'ready' && items.length > 0 ? (
            <>
              <div className="overflow-x-auto">
                <Table data-testid="documents-list">
                  <TableHeader>
                    <TableRow>
                      <TableHead>标题</TableHead>
                      <TableHead>当前版本</TableHead>
                      <TableHead>chunk 数</TableHead>
                      <TableHead>主题</TableHead>
                      <TableHead>地区</TableHead>
                      <TableHead>人员类型</TableHead>
                      <TableHead>生效日期</TableHead>
                      <TableHead>发布时间</TableHead>
                      <TableHead>document_id</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((row) => (
                      <TableRow
                        key={row.id}
                        data-testid="document-row"
                        data-document-id={row.id}
                        className="cursor-pointer"
                        onClick={() => navigate(`/documents/${row.id}`)}
                      >
                        <TableCell className="max-w-[22rem]">
                          <SafeText value={row.title} className="line-clamp-2" />
                        </TableCell>
                        <TableCell>
                          <div className="grid gap-0.5">
                            <span data-testid="document-row-version-number">
                              {row.version_number === null ? '—' : `第 ${row.version_number} 版`}
                            </span>
                            <span className="wrap-anywhere text-muted-foreground">
                              {nullableText(row.current_version_id)}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span data-testid="document-row-chunk-count">
                            {formatNumber(row.chunk_count)}
                          </span>
                        </TableCell>
                        <TableCell>{nullableText(row.topic)}</TableCell>
                        <TableCell>{nullableText(row.region)}</TableCell>
                        <TableCell>{nullableText(row.person_type)}</TableCell>
                        <TableCell className="whitespace-nowrap">
                          {nullableText(row.effective_date)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {formatDateTime(row.published_at)}
                        </TableCell>
                        <TableCell>
                          <Link
                            to={`/documents/${row.id}`}
                            className="wrap-anywhere underline underline-offset-2"
                            data-testid="document-detail-link"
                            onClick={(event) => event.stopPropagation()}
                          >
                            {row.id}
                          </Link>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span data-testid="documents-pagination-summary">
                  第 {offset + 1}–{lastIndex} 条，共 {total} 条
                </span>
                <Button
                  size="xs"
                  variant="outline"
                  disabled={!canGoPrevious}
                  onClick={() => setOffset(Math.max(0, offset - DOCUMENT_PAGE_SIZE))}
                  data-testid="documents-previous"
                >
                  上一页
                </Button>
                <Button
                  size="xs"
                  variant="outline"
                  disabled={!canGoNext}
                  onClick={() => setOffset(offset + DOCUMENT_PAGE_SIZE)}
                  data-testid="documents-next"
                >
                  下一页
                </Button>
              </div>
            </>
          ) : null}
        </CardContent>
      </Card>

      {/* 账号切换或断开都会让 ownerId 归零，key 变化即整块重挂载，query 与结果同帧清空 */}
      <RetrievalPanel key={ownerId === null ? 'anonymous' : ownerId} />
    </div>
  )
}

function RetrievalPanel() {
  const { apiKey, signal } = useAuth()

  const [query, setQuery] = useState('')
  const [topK, setTopK] = useState(String(RETRIEVAL_TOP_K_DEFAULT))
  const [retrievalResource, setRetrievalResource] = useState<
    ScopedResource<RetrievalPreviewResponse> | null
  >(null)

  const generationRef = useRef(0)
  const controllerRef = useRef<AbortController | null>(null)

  useEffect(() => {
    return () => {
      if (controllerRef.current !== null) controllerRef.current.abort()
    }
  }, [])

  const retrievalState = scopedState(apiKey, retrievalResource)
  const retrieved = retrievalResource !== null && retrievalResource.owner === apiKey
  const retrieving = retrieved && retrievalState.phase === 'loading'
  const response = retrievalState.data
  const hits = response === null ? [] : response.items
  const snapshotVersionIds = response === null ? [] : response.snapshot.version_ids

  async function handleRetrieval(): Promise<void> {
    if (apiKey === null) return
    // 新搜索中断上一次仍在执行的搜索
    if (controllerRef.current !== null) controllerRef.current.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    generationRef.current += 1
    const generation = generationRef.current
    const owner = apiKey
    const sessionSignal = signal
    const abortByAuth = (): void => controller.abort()
    sessionSignal.addEventListener('abort', abortByAuth)
    setRetrievalResource({ owner, state: loading<RetrievalPreviewResponse>() })
    try {
      const payload = await previewRetrieval(
        owner,
        { query, top_k: Number(topK) },
        controller.signal,
      )
      // 仅最新一次请求且 auth generation 未翻转（owner 未变化）才写入
      if (generationRef.current !== generation || sessionSignal.aborted) return
      setRetrievalResource({ owner, state: ready(payload) })
    } catch (error: unknown) {
      if (isCancelledError(error)) return
      if (generationRef.current !== generation || sessionSignal.aborted) return
      setRetrievalResource({ owner, state: failed<RetrievalPreviewResponse>(error) })
    } finally {
      sessionSignal.removeEventListener('abort', abortByAuth)
      if (controllerRef.current === controller) controllerRef.current = null
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>真实检索调试</CardTitle>
        <CardDescription>
          POST /api/retrieval/preview 在当前账号的完整知识快照内检索，无需选择单个文档；结果全部来自服务端。
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="retrieval-query">问题</Label>
          <Textarea
            id="retrieval-query"
            data-testid="retrieval-query-input"
            placeholder="例如：差旅住宿的报销标准是多少？"
            rows={4}
            className="max-h-72 overflow-y-auto"
            value={query}
            aria-describedby="retrieval-query-help"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                event.preventDefault()
                void handleRetrieval()
              }
            }}
          />
          <p
            id="retrieval-query-help"
            className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground"
          >
            <span data-testid="retrieval-query-count">
              当前字符数 {query.length} / {RETRIEVAL_QUERY_MAX_LENGTH}
            </span>
            <span>Ctrl / Cmd + Enter 检索</span>
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="retrieval-top-k">top_k</Label>
            <Input
              id="retrieval-top-k"
              type="number"
              className="w-24"
              min={RETRIEVAL_TOP_K_MIN}
              max={RETRIEVAL_TOP_K_MAX}
              step={1}
              data-testid="retrieval-top-k-input"
              aria-describedby="retrieval-top-k-help"
              value={topK}
              onChange={(event) => setTopK(event.target.value)}
            />
            <p id="retrieval-top-k-help" className="text-xs text-muted-foreground">
              允许 {RETRIEVAL_TOP_K_MIN}–{RETRIEVAL_TOP_K_MAX}，越界由服务端返回 422
            </p>
          </div>
          <Button
            size="sm"
            type="button"
            onClick={() => void handleRetrieval()}
            disabled={retrieving}
            data-testid="retrieval-submit-button"
          >
            {retrieving ? <Spinner /> : null}
            {retrieving ? '正在检索' : '检索'}
          </Button>
        </div>

        <div className="grid gap-3" aria-live="polite">
          {retrievalState.phase === 'error' && retrievalState.error !== null ? (
            <ErrorAlert error={retrievalState.error} testId="retrieval-error" />
          ) : null}

          {retrieving ? (
            <div
              className="flex items-center gap-2 text-xs text-muted-foreground"
              data-testid="retrieval-loading"
            >
              <Spinner />
              正在检索
            </div>
          ) : null}

          {response !== null ? (
            <div className="grid gap-3">
              <div
                className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground"
                data-testid="retrieval-summary"
              >
                <span>top_k {response.top_k}</span>
                <span data-testid="retrieval-duration">耗时 {formatMillis(response.duration_ms)}</span>
                <span data-testid="retrieval-hit-count">命中 {hits.length} 条</span>
              </div>

              <div className="grid gap-1.5">
                <div className="text-xs text-muted-foreground">服务端实际 query</div>
                <div
                  className="border border-border px-2.5 py-1.5 text-xs"
                  data-testid="retrieval-query-echo"
                >
                  <SafeText value={response.query} />
                </div>
              </div>

              <div className="grid gap-1.5" data-testid="retrieval-snapshot">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span>快照 schema v{response.snapshot.schema_version}</span>
                  <span>可检索版本 {snapshotVersionIds.length} 个</span>
                </div>
                {snapshotVersionIds.length > 0 ? (
                  <ol className="grid gap-1">
                    {snapshotVersionIds.map((versionId) => (
                      <li
                        key={versionId}
                        className="wrap-anywhere border border-border px-2.5 py-1 text-xs"
                        data-testid="retrieval-snapshot-version"
                      >
                        {versionId}
                      </li>
                    ))}
                  </ol>
                ) : null}
              </div>

              {hits.length === 0 && snapshotVersionIds.length === 0 ? (
                <p
                  className="border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground"
                  data-testid="retrieval-empty-snapshot"
                >
                  当前账号尚无可检索版本
                </p>
              ) : null}
              {hits.length === 0 && snapshotVersionIds.length > 0 ? (
                <p
                  className="border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground"
                  data-testid="retrieval-empty-results"
                >
                  当前问题没有命中片段
                </p>
              ) : null}

              {hits.map((hit) => (
                <div
                  key={`${hit.rank}-${hit.chunk_id}`}
                  className="grid gap-2 border border-border px-2.5 py-2"
                  data-testid="retrieval-hit"
                  data-rank={hit.rank}
                >
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <Badge variant="secondary" data-testid="retrieval-hit-rank">
                      rank {hit.rank}
                    </Badge>
                    <span title={String(hit.distance)} data-testid="retrieval-hit-distance">
                      distance {hit.distance.toFixed(4)}
                    </span>
                    <span data-testid="retrieval-hit-ordinal">ordinal {hit.ordinal}</span>
                    <Button
                      size="xs"
                      variant="outline"
                      asChild
                      data-testid="retrieval-source-link"
                    >
                      <Link
                        to={`/documents/${hit.document_id}?version=${hit.document_version_id}&chunk=${hit.chunk_id}`}
                      >
                        查看来源
                      </Link>
                    </Button>
                  </div>

                  <div
                    className="max-h-60 overflow-y-auto border border-border bg-muted/30 px-2.5 py-1.5"
                    data-testid="retrieval-hit-content"
                  >
                    <SafeText value={hit.content} className="text-[0.7rem]" />
                  </div>

                  <dl className="grid gap-1 text-xs sm:grid-cols-2">
                    <div className="flex flex-wrap gap-1">
                      <dt className="text-muted-foreground">标题</dt>
                      <dd>
                        <SafeText value={hit.title} />
                      </dd>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      <dt className="text-muted-foreground">主题</dt>
                      <dd>
                        <SafeText value={hit.topic} />
                      </dd>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      <dt className="text-muted-foreground">地区</dt>
                      <dd>
                        <SafeText value={hit.region} />
                      </dd>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      <dt className="text-muted-foreground">人员类型</dt>
                      <dd>
                        <SafeText value={hit.person_type} />
                      </dd>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      <dt className="text-muted-foreground">生效日期</dt>
                      <dd>{hit.effective_date}</dd>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      <dt className="text-muted-foreground">document_id</dt>
                      <dd className="wrap-anywhere">{hit.document_id}</dd>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      <dt className="text-muted-foreground">document_version_id</dt>
                      <dd className="wrap-anywhere">{hit.document_version_id}</dd>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      <dt className="text-muted-foreground">chunk_id</dt>
                      <dd className="wrap-anywhere">{hit.chunk_id}</dd>
                    </div>
                  </dl>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}

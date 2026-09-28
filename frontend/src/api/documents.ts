import { apiRequest, queryString } from '@/api/client'
import type {
  ChunkSummary,
  DocumentCreateRequest,
  DocumentDetail,
  DocumentPublishResponse,
  DocumentSummary,
  DocumentVersionCreateRequest,
  DocumentVersionDetail,
  DocumentVersionSummary,
  PageParams,
  PageResponse,
  RetrievalPreviewRequest,
  RetrievalPreviewResponse,
} from '@/types/documents'

export function createDocument(
  apiKey: string,
  payload: DocumentCreateRequest,
  signal: AbortSignal,
): Promise<DocumentPublishResponse> {
  return apiRequest<DocumentPublishResponse>('/documents', {
    method: 'POST',
    apiKey,
    body: payload,
    signal,
  })
}

export function listDocuments(
  apiKey: string,
  params: PageParams,
  signal: AbortSignal,
): Promise<PageResponse<DocumentSummary>> {
  return apiRequest<PageResponse<DocumentSummary>>(`/documents${queryString(params)}`, {
    apiKey,
    signal,
  })
}

export function fetchDocument(
  apiKey: string,
  documentId: string,
  signal: AbortSignal,
): Promise<DocumentDetail> {
  return apiRequest<DocumentDetail>(`/documents/${encodeURIComponent(documentId)}`, {
    apiKey,
    signal,
  })
}

export function createDocumentVersion(
  apiKey: string,
  documentId: string,
  payload: DocumentVersionCreateRequest,
  signal: AbortSignal,
): Promise<DocumentPublishResponse> {
  return apiRequest<DocumentPublishResponse>(
    `/documents/${encodeURIComponent(documentId)}/versions`,
    { method: 'POST', apiKey, body: payload, signal },
  )
}

export function listDocumentVersions(
  apiKey: string,
  documentId: string,
  params: PageParams,
  signal: AbortSignal,
): Promise<PageResponse<DocumentVersionSummary>> {
  return apiRequest<PageResponse<DocumentVersionSummary>>(
    `/documents/${encodeURIComponent(documentId)}/versions${queryString(params)}`,
    { apiKey, signal },
  )
}

export function fetchDocumentVersion(
  apiKey: string,
  documentId: string,
  versionId: string,
  signal: AbortSignal,
): Promise<DocumentVersionDetail> {
  return apiRequest<DocumentVersionDetail>(
    `/documents/${encodeURIComponent(documentId)}/versions/${encodeURIComponent(versionId)}`,
    { apiKey, signal },
  )
}

export function listDocumentChunks(
  apiKey: string,
  documentId: string,
  versionId: string,
  params: PageParams,
  signal: AbortSignal,
): Promise<PageResponse<ChunkSummary>> {
  return apiRequest<PageResponse<ChunkSummary>>(
    `/documents/${encodeURIComponent(documentId)}/versions/${encodeURIComponent(
      versionId,
    )}/chunks${queryString(params)}`,
    { apiKey, signal },
  )
}

export function previewRetrieval(
  apiKey: string,
  payload: RetrievalPreviewRequest,
  signal: AbortSignal,
): Promise<RetrievalPreviewResponse> {
  return apiRequest<RetrievalPreviewResponse>('/retrieval/preview', {
    method: 'POST',
    apiKey,
    body: payload,
    signal,
  })
}

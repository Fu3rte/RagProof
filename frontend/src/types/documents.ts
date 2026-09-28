// 类型与 backend/schemas/documents.py 的 response model 一一对应；Embedding 数组不进入前端类型。
export interface DocumentSummary {
  id: string
  title: string
  current_version_id: string | null
  version_number: number | null
  chunk_count: number | null
  topic: string | null
  region: string | null
  person_type: string | null
  effective_date: string | null
  published_at: string | null
}

export interface DocumentDetail extends DocumentSummary {
  created_at: string
  updated_at: string
}

export interface DocumentVersionSummary {
  id: string
  document_id: string
  version_number: number
  chunk_count: number
  published_at: string
}

export interface DocumentVersionDetail extends DocumentVersionSummary {
  title: string
  topic: string
  region: string
  person_type: string
  effective_date: string
  content: string
  content_sha256: string
  build_fingerprint: string
  chunk_size: number
  chunk_overlap: number
  embedding_model: string
  embedding_dimension: number
}

export interface ChunkSummary {
  id: string
  ordinal: number
  content: string
  character_count: number
  content_sha256: string
}

export interface DocumentMetadataInput {
  title: string
  topic: string
  region: string
  person_type: string
  effective_date: string
}

export interface DocumentCreateRequest extends DocumentMetadataInput {
  content: string
}

export interface DocumentVersionCreateRequest extends DocumentMetadataInput {
  content: string
  // 页面读取到的 Document current_version_id；无当前版本时为 null
  expected_current_version_id: string | null
}

export interface DocumentPublishResponse {
  created: boolean
  published: boolean
  document: DocumentSummary
  version: DocumentVersionSummary
}

export interface PageResponse<T> {
  items: T[]
  offset: number
  limit: number
  total: number
}

export interface RetrievalSnapshot {
  schema_version: number
  version_ids: string[]
}

export interface RetrievalHit {
  rank: number
  distance: number
  chunk_id: string
  document_id: string
  document_version_id: string
  ordinal: number
  content: string
  title: string
  topic: string
  region: string
  person_type: string
  effective_date: string
}

export interface RetrievalPreviewRequest {
  query: string
  top_k: number
}

export interface RetrievalPreviewResponse {
  snapshot: RetrievalSnapshot
  query: string
  top_k: number
  duration_ms: number
  items: RetrievalHit[]
}

export type PageParams = { offset: number; limit: number }

export const DOCUMENT_TITLE_MAX_LENGTH = 200
export const DOCUMENT_METADATA_MAX_LENGTH = 100
export const DOCUMENT_CONTENT_MAX_LENGTH = 50_000
export const DOCUMENT_PAGE_SIZE = 20
export const CHUNK_PAGE_SIZE = 100
export const VERSION_PAGE_SIZE = 20
export const RETRIEVAL_QUERY_MAX_LENGTH = 4000
export const RETRIEVAL_TOP_K_MIN = 1
export const RETRIEVAL_TOP_K_MAX = 20
export const RETRIEVAL_TOP_K_DEFAULT = 6

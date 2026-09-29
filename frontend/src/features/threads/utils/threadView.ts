// 与服务端 ck_threads_id 一致：非法 id 直接判为不存在，避免把必然 404 的请求发出去
const THREAD_ID_PATTERN = /^thread_[0-9a-f]{32}$/

export function isValidThreadId(value: string): boolean {
  return THREAD_ID_PATTERN.test(value)
}

import type { ModelProfile } from '@/features/model-center/types/modelControl'

// 目录搜索为纯前端过滤：名称、模型标识、Endpoint 与 Provider 参与匹配
export function filterProfiles(profiles: ModelProfile[], query: string): ModelProfile[] {
  const needle = query.trim().toLowerCase()
  if (needle.length === 0) return profiles
  return profiles.filter((profile) =>
    [profile.display_name, profile.model_name, profile.base_url, profile.provider]
      .join('\n')
      .toLowerCase()
      .includes(needle),
  )
}

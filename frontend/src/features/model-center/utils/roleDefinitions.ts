import type { ModelRole } from '@/features/model-center/types/modelControl'

export interface RoleDefinition {
  role: ModelRole
  label: string
  scope: string
  purpose: string
}

// 三职责固定顺序，页面按此顺序展示角色卡
export const ROLE_DEFINITIONS: readonly RoleDefinition[] = [
  {
    role: 'answer',
    label: 'Answer',
    scope: '回答生成',
    purpose: '只依据最终证据生成回答，并给出可核对的出处。',
  },
  {
    role: 'fast',
    label: 'Fast',
    scope: '规划与改写',
    purpose: '拆解复杂问题、改写检索表达与执行有界重写。',
  },
  {
    role: 'grader',
    label: 'Grader',
    scope: '证据判断',
    purpose: '判断证据相关性、充分性与问题歧义。',
  },
]

export const MODEL_ROLES: readonly ModelRole[] = ROLE_DEFINITIONS.map((item) => item.role)

export function roleDefinition(role: ModelRole): RoleDefinition {
  const found = ROLE_DEFINITIONS.find((item) => item.role === role)
  if (found === undefined) throw new Error(`未知的模型职责：${role}`)
  return found
}

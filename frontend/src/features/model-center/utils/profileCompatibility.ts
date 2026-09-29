import type {
  ModelControlPlane,
  ModelProfile,
  ModelRole,
  ModelRoleRequirement,
} from '@/features/model-center/types/modelControl'
import { MODEL_ROLES } from '@/features/model-center/utils/roleDefinitions'

// 能力校验：角色要求由服务端控制面下发，前端只做同一规则的即时判定
function meetsRequirement(
  profile: ModelProfile,
  requirement: ModelRoleRequirement,
): boolean {
  return (
    (!requirement.supports_stream || profile.supports_stream) &&
    (!requirement.supports_structured_output || profile.supports_structured_output)
  )
}

export function eligibleProfiles(
  plane: ModelControlPlane,
  role: ModelRole,
): ModelProfile[] {
  const requirement = plane.requirements[role]
  return plane.profiles.filter(
    (profile) => profile.enabled && meetsRequirement(profile, requirement),
  )
}

export function assignedRoles(plane: ModelControlPlane, profileId: string): ModelRole[] {
  return MODEL_ROLES.filter((role) => plane.assignments[role]?.id === profileId)
}

export function assignedRoleCount(plane: ModelControlPlane): number {
  return MODEL_ROLES.filter((role) => plane.assignments[role] !== null).length
}

export function enabledProfileCount(plane: ModelControlPlane): number {
  return plane.profiles.filter((profile) => profile.enabled).length
}

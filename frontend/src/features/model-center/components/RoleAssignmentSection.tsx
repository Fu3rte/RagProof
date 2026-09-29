import { RoleAssignmentCard } from '@/features/model-center/components/RoleAssignmentCard'
import type { ModelControlPlane, ModelRole } from '@/features/model-center/types/modelControl'
import { eligibleProfiles } from '@/features/model-center/utils/profileCompatibility'
import { ROLE_DEFINITIONS } from '@/features/model-center/utils/roleDefinitions'

interface RoleAssignmentSectionProps {
  plane: ModelControlPlane
  saving: boolean
  onAssign: (role: ModelRole, profileId: string) => void
}

export function RoleAssignmentSection({ plane, saving, onAssign }: RoleAssignmentSectionProps) {
  return (
    <section className="grid gap-3" aria-labelledby="assignment-heading">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="grid gap-1">
          <h2 id="assignment-heading" className="font-heading text-base font-semibold">
            模型职责分配
          </h2>
          <p className="text-muted-foreground text-xs">
            选择后立即写入服务端控制面；已创建的 Run 继续使用其冻结的模型快照。
          </p>
        </div>
      </div>
      <div className="grid gap-3 lg:grid-cols-3">
        {ROLE_DEFINITIONS.map((definition) => (
          <RoleAssignmentCard
            key={definition.role}
            definition={definition}
            requirement={plane.requirements[definition.role]}
            assigned={plane.assignments[definition.role]}
            options={eligibleProfiles(plane, definition.role)}
            saving={saving}
            onAssign={(profileId) => onAssign(definition.role, profileId)}
          />
        ))}
      </div>
    </section>
  )
}

import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type {
  ModelProfile,
  ModelRoleRequirement,
} from '@/features/model-center/types/modelControl'
import type { RoleDefinition } from '@/features/model-center/utils/roleDefinitions'
import { SafeText } from '@/shared/components/SafeText'

interface RoleAssignmentCardProps {
  definition: RoleDefinition
  requirement: ModelRoleRequirement
  assigned: ModelProfile | null
  options: ModelProfile[]
  saving: boolean
  onAssign: (profileId: string) => void
}

export function RoleAssignmentCard({
  definition,
  requirement,
  assigned,
  options,
  saving,
  onAssign,
}: RoleAssignmentCardProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardDescription>{definition.scope}</CardDescription>
          <Badge
            variant={assigned === null ? 'destructive' : 'default'}
          >
            {assigned === null ? '待分配' : '已分配'}
          </Badge>
        </div>
        <CardTitle>{definition.label}</CardTitle>
        <CardDescription>
          <SafeText value={definition.purpose} />
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-2.5">
        <Select
          value={assigned?.id ?? ''}
          onValueChange={onAssign}
          disabled={saving || options.length === 0}
        >
          <SelectTrigger
            className="w-full"
            aria-label={`${definition.label} 模型`}
          >
            <SelectValue placeholder="选择满足能力要求的 Model Profile" />
          </SelectTrigger>
          <SelectContent position="popper">
            {options.map((profile) => (
              <SelectItem key={profile.id} value={profile.id}>
                {`${profile.display_name} · ${profile.model_name}`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex flex-wrap gap-1.5">
          <Badge variant={requirement.supports_stream ? 'default' : 'outline'}>
            {requirement.supports_stream ? '要求 Stream' : '无需 Stream'}
          </Badge>
          <Badge variant={requirement.supports_structured_output ? 'default' : 'outline'}>
            {requirement.supports_structured_output ? '要求 Structured Output' : '无需结构化输出'}
          </Badge>
        </div>
        <p className="text-muted-foreground text-xs">
          {options.length === 0
            ? '没有已启用且满足能力要求的 Profile 可选。'
            : `可分配 Profile ${options.length} 个`}
        </p>
      </CardContent>
    </Card>
  )
}

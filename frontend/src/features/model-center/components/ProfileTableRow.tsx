import { RiDeleteBinLine, RiEditLine } from '@remixicon/react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { TableCell, TableRow } from '@/components/ui/table'
import { ProfileCapabilityFlags } from '@/features/model-center/components/ProfileCapabilityFlags'
import type { ModelProfile, ModelRole } from '@/features/model-center/types/modelControl'
import { roleDefinition } from '@/features/model-center/utils/roleDefinitions'
import { SafeText } from '@/shared/components/SafeText'

interface ProfileTableRowProps {
  profile: ModelProfile
  roles: ModelRole[]
  saving: boolean
  onEdit: (profile: ModelProfile) => void
  onRequestDelete: (profile: ModelProfile) => void
}

export function ProfileTableRow({
  profile,
  roles,
  saving,
  onEdit,
  onRequestDelete,
}: ProfileTableRowProps) {
  const assigned = roles.length > 0
  return (
    <TableRow>
      <TableCell>
        <div className="grid gap-0.5">
          <SafeText value={profile.display_name} className="font-medium" />
          <span className="text-muted-foreground text-xs">v{profile.version}</span>
        </div>
      </TableCell>
      <TableCell>
        <div className="grid gap-0.5">
          <SafeText value={profile.model_name} />
          <span className="text-muted-foreground text-xs">{profile.provider}</span>
          <SafeText
            value={profile.base_url.length > 0 ? profile.base_url : '服务端默认 Endpoint'}
            className="text-muted-foreground text-xs"
          />
        </div>
      </TableCell>
      <TableCell>
        <ProfileCapabilityFlags profile={profile} />
      </TableCell>
      <TableCell>
        <div className="flex flex-wrap gap-1.5">
          {roles.map((role) => (
            <Badge key={role} variant="secondary">
              {roleDefinition(role).label}
            </Badge>
          ))}
          {!assigned ? <span className="text-muted-foreground text-xs">未分配</span> : null}
        </div>
      </TableCell>
      <TableCell>
        <Badge variant={profile.enabled ? 'default' : 'outline'}>
          {profile.enabled ? '已启用' : '已停用'}
        </Badge>
      </TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-1">
          <Button
            variant="outline"
            size="icon-sm"
            aria-label={`编辑 ${profile.display_name}`}
            disabled={saving}
            onClick={() => onEdit(profile)}
          >
            <RiEditLine />
          </Button>
          <Button
            variant="destructive"
            size="icon-sm"
            aria-label={`删除 ${profile.display_name}`}
            disabled={saving || assigned}
            title={assigned ? '已分配职责的 Profile 需先改派其他 Profile' : '删除 Model Profile'}
            onClick={() => onRequestDelete(profile)}
          >
            <RiDeleteBinLine />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  )
}

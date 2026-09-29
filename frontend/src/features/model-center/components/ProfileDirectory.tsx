import { useState } from 'react'
import { RiSearchLine } from '@remixicon/react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ProfileTableRow } from '@/features/model-center/components/ProfileTableRow'
import type { ModelControlPlane, ModelProfile } from '@/features/model-center/types/modelControl'
import { filterProfiles } from '@/features/model-center/utils/profileSearch'
import { assignedRoles } from '@/features/model-center/utils/profileCompatibility'

interface ProfileDirectoryProps {
  plane: ModelControlPlane
  saving: boolean
  onEdit: (profile: ModelProfile) => void
  onRequestDelete: (profile: ModelProfile) => void
  onCreate: () => void
}

export function ProfileDirectory({
  plane,
  saving,
  onEdit,
  onRequestDelete,
  onCreate,
}: ProfileDirectoryProps) {
  const [query, setQuery] = useState('')
  const visible = filterProfiles(plane.profiles, query)
  const searching = query.trim().length > 0

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>Model Profile 目录</CardTitle>
          <div className="relative">
            <RiSearchLine
              className="text-muted-foreground pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2"
              aria-hidden="true"
            />
            <Input
              className="pl-7"
              aria-label="搜索 Model Profile"
              placeholder="搜索名称、模型或 Endpoint"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3">
        {plane.profiles.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <RiSearchLine aria-hidden="true" />
              </EmptyMedia>
              <EmptyTitle>还没有 Model Profile</EmptyTitle>
              <EmptyDescription>创建 Profile 后即可分配给三个模型职责。</EmptyDescription>
            </EmptyHeader>
            <Button size="sm" onClick={onCreate}>
              创建第一个 Profile
            </Button>
          </Empty>
        ) : visible.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>没有匹配的 Model Profile</EmptyTitle>
              <EmptyDescription>尝试其他关键词。</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Profile</TableHead>
                <TableHead>Provider / 模型</TableHead>
                <TableHead>能力</TableHead>
                <TableHead>职责</TableHead>
                <TableHead>状态</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((profile) => (
                <ProfileTableRow
                  key={profile.id}
                  profile={profile}
                  roles={assignedRoles(plane, profile.id)}
                  saving={saving}
                  onEdit={onEdit}
                  onRequestDelete={onRequestDelete}
                />
              ))}
            </TableBody>
          </Table>
        )}
        {searching && visible.length > 0 ? (
          <p className="text-muted-foreground text-xs">
            匹配 {visible.length} / {plane.profiles.length} 个 Profile
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}

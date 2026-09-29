import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import type { ModelControlPlane } from '@/features/model-center/types/modelControl'
import {
  assignedRoleCount,
  enabledProfileCount,
} from '@/features/model-center/utils/profileCompatibility'
import { ROLE_DEFINITIONS } from '@/features/model-center/utils/roleDefinitions'

interface SummaryItem {
  label: string
  value: string
  detail: string
  warning: boolean
}

function buildItems(plane: ModelControlPlane): SummaryItem[] {
  const assigned = assignedRoleCount(plane)
  return [
    {
      label: 'Provider Secret',
      value: plane.provider_secret_configured ? '服务端已配置' : '服务端未配置',
      detail: '密钥只由服务端读取，页面不录入也不回显。',
      warning: !plane.provider_secret_configured,
    },
    {
      label: 'Model Profiles',
      value: `${plane.profiles.length} 个`,
      detail: `其中 ${enabledProfileCount(plane)} 个已启用，可参与职责分配。`,
      warning: false,
    },
    {
      label: 'Assignments',
      value: `${assigned} / ${ROLE_DEFINITIONS.length}`,
      detail: '三职责全部就位后新 Run 才能创建。',
      warning: assigned < ROLE_DEFINITIONS.length,
    },
    {
      label: 'Catalog Hash',
      value: `${plane.catalog_hash.slice(0, 8)}…${plane.catalog_hash.slice(-6)}`,
      detail: '配置变更只影响其后创建的 Run。',
      warning: false,
    },
  ]
}

export function ControlPlaneSummary({ plane }: { plane: ModelControlPlane }) {
  return (
    <div
      className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
      aria-label="模型控制面状态"
    >
      {buildItems(plane).map((item) => (
        <Card key={item.label} className={item.warning ? 'border-destructive/50' : undefined}>
          <CardHeader>
            <CardDescription>{item.label}</CardDescription>
            <CardTitle>{item.value}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-xs">{item.detail}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

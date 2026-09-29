import { Badge } from '@/components/ui/badge'
import { cn } from 'cn'

import type { ModelProfile } from '@/features/model-center/types/modelControl'

export function ProfileCapabilityFlags({ profile }: { profile: ModelProfile }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <Badge variant={profile.supports_stream ? 'default' : 'outline'}>
        <span className={cn(profile.supports_stream ? undefined : 'text-muted-foreground line-through')}>
          Stream
        </span>
      </Badge>
      <Badge variant={profile.supports_structured_output ? 'default' : 'outline'}>
        <span
          className={cn(
            profile.supports_structured_output ? undefined : 'text-muted-foreground line-through',
          )}
        >
          Structured
        </span>
      </Badge>
      <Badge variant="secondary">{profile.timeout_seconds}s</Badge>
    </div>
  )
}

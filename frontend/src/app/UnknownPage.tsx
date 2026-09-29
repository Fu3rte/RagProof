import { Link } from 'react-router-dom'

import { Button } from '@/components/ui/button'

export function UnknownPage() {
  return (
    <div className="grid gap-3">
      <p className="text-muted-foreground text-xs">
        该地址在本项目中不存在。
      </p>
      <Button variant="outline" size="sm" asChild className="w-fit">
        <Link to="/models">前往模型中心</Link>
      </Button>
    </div>
  )
}

import { NavLink, Outlet } from 'react-router-dom'
import { RiDatabase2Line, RiShieldKeyholeLine } from '@remixicon/react'
import { cn } from 'cn'

import { AuthPanel } from '@/components/AuthPanel'
import { Button, buttonVariants } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { useAuth } from '@/context/AuthContext'

const NAV_ITEMS = [
  { to: '/system', label: '系统配置', testId: 'nav-system' },
  { to: '/documents', label: '文档管理', testId: 'nav-documents' },
  { to: '/runs', label: '执行记录', testId: 'nav-runs' },
]

export function Layout() {
  const { connected, connecting, ownerId, disconnect } = useAuth()

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-sidebar">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3">
          <div className="flex items-center gap-2">
            <RiDatabase2Line className="size-5" aria-hidden="true" />
            <div className="leading-tight">
              <div className="font-heading text-sm font-semibold">RagProof</div>
              <div className="text-[0.7rem] text-muted-foreground">
                中文制度知识库 · D2 文档版本与真实检索
              </div>
            </div>
          </div>

          <nav aria-label="主导航" className="flex items-center gap-1">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                data-testid={item.testId}
                className={({ isActive }) =>
                  cn(
                    buttonVariants({ variant: 'ghost', size: 'sm' }),
                    isActive
                      ? 'border border-border bg-secondary font-semibold text-foreground'
                      : 'text-muted-foreground',
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            {connecting ? (
              <span
                className="flex items-center gap-1.5 text-xs text-muted-foreground"
                data-testid="connection-state"
              >
                <Spinner />
                正在校验 API Key
              </span>
            ) : null}
            {connected ? (
              <>
                <span
                  className="flex items-center gap-1.5 border border-border bg-background px-2 py-1 text-xs"
                  data-testid="connection-owner"
                >
                  <RiShieldKeyholeLine className="size-3.5" aria-hidden="true" />
                  当前账号 owner_id：{ownerId}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={disconnect}
                  data-testid="disconnect-button"
                >
                  断开连接
                </Button>
              </>
            ) : null}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 py-6">
        {connected ? (
          <Outlet />
        ) : (
          <div className="mx-auto max-w-xl">
            <AuthPanel />
          </div>
        )}
      </main>
    </div>
  )
}

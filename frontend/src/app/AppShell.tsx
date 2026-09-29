import { NavLink, Outlet } from 'react-router-dom'
import { RiBook2Line } from '@remixicon/react'
import { cn } from 'cn'

import { buttonVariants } from '@/components/ui/button'

const NAV_ITEMS = [
  { to: '/threads', label: '问答工作台' },
  { to: '/models', label: '模型中心' },
]

export function AppShell() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-border bg-sidebar border-b">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3">
          <div className="flex items-center gap-2">
            <RiBook2Line className="size-5" aria-hidden="true" />
            <div className="leading-tight">
              <div className="font-heading text-sm font-semibold">RagProof</div>
              <div className="text-muted-foreground text-[0.7rem]">本机单人知识库问答</div>
            </div>
          </div>

          <nav aria-label="主导航" className="flex items-center gap-1">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    buttonVariants({ variant: 'ghost', size: 'sm' }),
                    isActive
                      ? 'border-border bg-secondary text-foreground border font-semibold'
                      : 'text-muted-foreground',
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  )
}

import { useState } from 'react'

import { ErrorAlert } from '@/components/ErrorAlert'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import { isCancelledError } from '@/api/client'
import { useAuth } from '@/context/AuthContext'

export function AuthPanel() {
  const { ownerId, connected, connecting, connect, disconnect } = useAuth()
  const [keyInput, setKeyInput] = useState('')
  const [error, setError] = useState<unknown>(null)

  async function handleConnect(): Promise<void> {
    setError(null)
    try {
      await connect(keyInput.trim())
      setKeyInput('')
    } catch (caught: unknown) {
      if (!isCancelledError(caught)) setError(caught)
    }
  }

  return (
    <Card data-testid="auth-panel">
      <CardHeader>
        <CardTitle>账号连接</CardTitle>
        <CardDescription>
          应用 API Key 仅保存在浏览器内存中，不写入 localStorage、Cookie 或任何持久化介质；
          页面刷新后需要重新输入并连接。
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {connected ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs" data-testid="connect-state">
              已连接：owner_id {ownerId ?? ''}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                disconnect()
                setError(null)
              }}
              data-testid="system-disconnect-button"
            >
              断开连接
            </Button>
          </div>
        ) : (
          <>
            <div className="grid gap-1.5">
              <Label htmlFor="api-key">应用 API Key</Label>
              <Input
                id="api-key"
                type="password"
                autoComplete="off"
                spellCheck={false}
                placeholder="输入服务端配置的演示 API Key"
                value={keyInput}
                data-testid="api-key-input"
                onChange={(event) => setKeyInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    void handleConnect()
                  }
                }}
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                onClick={() => void handleConnect()}
                disabled={connecting || keyInput.trim().length === 0}
                data-testid="connect-button"
              >
                {connecting ? <Spinner /> : null}
                {connecting ? '连接中' : '连接'}
              </Button>
              <span className="text-xs text-muted-foreground" data-testid="connect-state">
                {connecting ? '正在校验凭据' : '未连接'}
              </span>
            </div>
            {error !== null ? <ErrorAlert error={error} testId="connect-error" /> : null}
          </>
        )}
      </CardContent>
    </Card>
  )
}

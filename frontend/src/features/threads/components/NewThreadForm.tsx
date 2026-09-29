import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { ErrorAlert } from '@/shared/components/ErrorAlert'

interface NewThreadFormProps {
  creating: boolean
  error: unknown | null
  onCreate: (title: string) => Promise<unknown>
}

export function NewThreadForm({ creating, error, onCreate }: NewThreadFormProps) {
  const [title, setTitle] = useState('')

  async function submit(): Promise<void> {
    try {
      await onCreate(title)
      setTitle('')
    } catch {
      // 失败已按公开错误呈现，此处只阻止未处理的 rejection
    }
  }

  return (
    <div className="grid gap-2">
      <div className="flex gap-2">
        <Input
          aria-label="新对话标题"
          maxLength={120}
          placeholder="新对话标题（可留空）"
          value={title}
          disabled={creating}
          onChange={(event) => setTitle(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              void submit()
            }
          }}
        />
        <Button size="sm" disabled={creating} onClick={() => void submit()}>
          {creating ? <Spinner /> : null}
          新建
        </Button>
      </div>
      {error !== null ? <ErrorAlert error={error} /> : null}
    </div>
  )
}

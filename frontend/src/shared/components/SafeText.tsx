import { cn } from 'cn'

interface SafeTextProps {
  value: string
  className?: string
  as?: 'span' | 'pre'
}

// 模型输出与服务端文本一律按不可信输入处理：仅作为文本节点渲染，绝不解析 HTML
export function SafeText({ value, className, as = 'span' }: SafeTextProps) {
  const classes = cn('wrap-anywhere break-words whitespace-pre-wrap', className)
  if (as === 'pre') {
    return <pre className={classes}>{value}</pre>
  }
  return <span className={classes}>{value}</span>
}

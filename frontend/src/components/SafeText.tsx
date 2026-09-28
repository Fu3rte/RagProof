import { cn } from 'cn'

interface SafeTextProps {
  value: string
  className?: string
  as?: 'span' | 'pre'
}

// 文档与模型输出都是不可信文本：只作为 React children 文本节点渲染，不解析 HTML
export function SafeText({ value, className, as = 'span' }: SafeTextProps) {
  const classes = cn('break-words whitespace-pre-wrap wrap-anywhere', className)
  if (as === 'pre') {
    return <pre className={classes}>{value}</pre>
  }
  return <span className={classes}>{value}</span>
}

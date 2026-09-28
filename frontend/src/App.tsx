import { BrowserRouter, Link, Navigate, Route, Routes } from 'react-router-dom'

import { Layout } from '@/components/Layout'
import { Button } from '@/components/ui/button'
import { AuthProvider } from '@/context/AuthContext'
import { DocumentDetailPage } from '@/pages/DocumentDetailPage'
import { DocumentsPage } from '@/pages/DocumentsPage'
import { RunDetailPage } from '@/pages/RunDetailPage'
import { RunsPage } from '@/pages/RunsPage'
import { SystemPage } from '@/pages/SystemPage'

function UnknownPage() {
  return (
    <div className="grid gap-3">
      <p className="text-xs text-muted-foreground" data-testid="unknown-page">
        该地址在本项目中不存在。
      </p>
      <Button variant="outline" size="sm" asChild className="w-fit">
        <Link to="/system">前往系统配置页</Link>
      </Button>
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path="/" element={<Navigate to="/system" replace />} />
          <Route element={<Layout />}>
            <Route path="/system" element={<SystemPage />} />
            <Route path="/documents" element={<DocumentsPage />} />
            <Route path="/documents/:documentId" element={<DocumentDetailPage />} />
            <Route path="/runs" element={<RunsPage />} />
            <Route path="/runs/:runId" element={<RunDetailPage />} />
            <Route path="*" element={<UnknownPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}

import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'

import { AppShell } from '@/app/AppShell'
import { ModelCenterPage } from '@/features/model-center/pages/ModelCenterPage'
import { ThreadsPage } from '@/features/threads/pages/ThreadsPage'
import { UnknownPage } from '@/app/UnknownPage'

export function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<Navigate to="/threads" replace />} />
          <Route path="/threads" element={<ThreadsPage />} />
          <Route path="/threads/:threadId" element={<ThreadsPage />} />
          <Route path="/models" element={<ModelCenterPage />} />
          <Route path="*" element={<UnknownPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

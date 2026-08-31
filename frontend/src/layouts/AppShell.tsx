import { Navigate, Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'
import { CommandPalette } from './CommandPalette'
import { useAuth } from '@/store/auth'

export function AppShell() {
  const userUid = useAuth((s) => s.userUid)

  if (!userUid) return <Navigate to="/login" replace />

  return (
    <div className="flex h-screen overflow-hidden bg-bg">
      <Sidebar />
      <div className="flex min-w-0 min-h-0 flex-1 flex-col">
        <Topbar />
        <main className="min-w-0 min-h-0 flex-1 overflow-y-auto p-4 flex flex-col gap-4">
          <Outlet />
        </main>
        <footer className="no-print border-t border-border px-5 py-2.5 text-2xs text-fg-subtle">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>
              SSB Industries Private Limited ·{' '}
              <span className="font-mono">v0.1.0-prototype</span>
            </span>
            <span>Organisation &amp; Access Control are live on the FastAPI backend; other modules are still prototype data.</span>
          </div>
        </footer>
      </div>
      <CommandPalette />
    </div>
  )
}

import { Navigate, Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'
import { CommandPalette } from './CommandPalette'
import { useAuth } from '@/store/auth'

export function AppShell() {
  const userUid = useAuth((s) => s.userUid)

  if (!userUid) return <Navigate to="/login" replace />

  return (
    <div className="flex min-h-screen bg-bg">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main className="min-w-0 flex-1 p-[32px] flex flex-col gap-[24px]">
          <Outlet />
        </main>
        <footer className="no-print border-t border-border px-5 py-2.5 text-2xs text-fg-subtle">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>
              SSB Industries Private Limited ·{' '}
              <span className="font-mono">v0.1.0-prototype</span>
            </span>
            <span>Frontend prototype — data is mocked in the browser; no backend is attached.</span>
          </div>
        </footer>
      </div>
      <CommandPalette />
    </div>
  )
}

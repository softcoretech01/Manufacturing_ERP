import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Bell,
  Building2,
  CalendarRange,
  Check,
  ChevronDown,
  CircleUser,
  ClipboardCheck,
  Factory,
  GitBranch,
  HelpCircle,
  LogOut,
  Monitor,
  Moon,
  Search,
  Settings,
  Sun,
  UserCog,
} from 'lucide-react'
import { cn } from '@/lib/cn'
import { Button } from '@/components/ui/Button'
import { Menu, MenuItem, MenuLabel, MenuSeparator } from '@/components/ui/Menu'
import { Avatar, ProgressBar } from '@/components/ui/Misc'
import { Badge } from '@/components/ui/Badge'
import { formatTimeAgo } from '@/lib/format'
import { PORTALS, portalOf } from '@/config/portals'
import { useActiveContext, useAuth, useCurrentUser } from '@/store/auth'
import { useUi } from '@/store/ui'
import { branches, companies, financialYears, plants } from '@/mock/data'
import { inAppNotifications } from '@/mock/data2'
import { useInbox } from '@/hooks/useWorkflow'
import { Drawer } from '@/components/ui/Modal'

export function Topbar() {
  const navigate = useNavigate()
  const user = useCurrentUser()
  const { logout } = useAuth()
  return (
    <>
      <header className="no-print sticky top-0 z-40 flex h-topbar shrink-0 items-center justify-end gap-2 border-b border-border bg-surface/95 px-3 backdrop-blur">
        {/* ── Right cluster ─────────────────────────────────────────────── */}
        <div className="flex items-center gap-1">

          <Menu
            align="right"
            trigger={
              <button className="ml-1 inline-flex items-center gap-2 rounded px-1.5 py-1 transition-colors hover:bg-surface-3">
                <Avatar name={user?.fullName ?? 'Guest'} size="sm" />
                <span className="hidden min-w-0 text-left lg:block">
                  <span className="block max-w-[9rem] truncate text-xs font-medium leading-tight text-fg">
                    {user?.fullName ?? 'Guest'}
                  </span>
                  <span className="block max-w-[9rem] truncate text-[10px] leading-tight text-fg-subtle">
                    {user?.designation ?? '—'}
                  </span>
                </span>
                <ChevronDown className="h-3 w-3 shrink-0 text-fg-subtle" />
              </button>
            }
          >
            <div className="border-b border-border px-3 py-2">
              <p className="text-sm font-medium text-fg">{user?.fullName}</p>
              <p className="text-2xs text-fg-muted">{user?.email}</p>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {user?.roles.map((r) => (
                  <Badge key={r} tone="brand" size="sm" dot={false}>
                    {r}
                  </Badge>
                ))}
              </div>
            </div>

            <MenuSeparator />
            <MenuItem
              label="Sign out"
              icon={<LogOut />}
              danger
              onClick={() => {
                logout()
                navigate('/login')
              }}
            />
          </Menu>
        </div>
      </header>
    </>
  )
}

/* ─────────────────────────── Context picker ─────────────────────────── */

function ContextPicker({
  icon,
  label,
  title,
  options,
  value,
  onChange,
  heading,
}: {
  icon: React.ReactNode
  label: string
  title: string
  options: { id: string; label: string; sub: string }[]
  value: string
  onChange: (v: string) => void
  heading: string
}) {
  return (
    <Menu
      trigger={
        <button
          title={title}
          className="inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded px-2 text-xs font-medium text-fg transition-colors hover:bg-surface-3"
        >
          <span className="text-fg-subtle">{icon}</span>
          {label}
          <ChevronDown className="h-3 w-3 text-fg-subtle" />
        </button>
      }
    >
      <MenuLabel>{heading}</MenuLabel>
      <div className="max-h-72 min-w-[260px] overflow-y-auto">
        {options.map((o) => (
          <button
            key={o.id}
            onClick={() => onChange(o.id)}
            className="flex w-full items-start gap-2 px-3 py-1.5 text-left transition-colors hover:bg-surface-3"
          >
            <span className="mt-0.5 w-3.5 shrink-0">
              {value === o.id && <Check className="h-3.5 w-3.5 text-brand-600" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm text-fg">{o.label}</span>
              {o.sub && <span className="block truncate font-mono text-[10px] text-fg-subtle">{o.sub}</span>}
            </span>
          </button>
        ))}
      </div>
    </Menu>
  )
}

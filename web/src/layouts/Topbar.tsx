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
  const { company, branch, plant, fy } = useActiveContext()
  const { setCompany, setBranch, setPlant, setFy, setPortal, logout } = useAuth()
  const portal = portalOf(useAuth((s) => s.portal))
  const { theme, setTheme, setCommandOpen, readNotifications, markRead, markAllRead } = useUi()
  const [notifOpen, setNotifOpen] = useState(false)

  // Real approval queue: this user's pending workflow tasks (V1-WFL S-WFL-03).
  const pending = useInbox(false).data ?? []
  const overdue = pending.filter((t) => t.overdue).length
  const notifications = inAppNotifications.map((n) => ({
    ...n,
    isRead: n.isRead || readNotifications.includes(n.uid),
  }))
  const unread = notifications.filter((n) => !n.isRead).length

  const companyBranches = branches.filter((b) => b.companyUid === company.uid)
  const companyPlants = plants.filter((p) => p.companyUid === company.uid)
  const companyFys = financialYears.filter((f) => f.companyUid === company.uid && f.status !== 'FUTURE')

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === '/') {
        e.preventDefault()
        setCommandOpen(true)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [setCommandOpen])

  return (
    <>
      <header className="no-print sticky top-0 z-40 flex h-topbar shrink-0 items-center gap-2 border-b border-border bg-surface/95 px-3 backdrop-blur">
        {/* ── Portal switcher ───────────────────────────────────────────── */}
        <Menu
          align="left"
          trigger={
            <button
              type="button"
              title={`Portal: ${portal.name}`}
              className="flex shrink-0 items-center gap-1.5 rounded px-1.5 py-1 text-xs text-fg-muted transition-colors hover:bg-surface-3 hover:text-fg"
            >
              <span className={cn('flex h-5 w-5 items-center justify-center rounded ring-1 ring-inset', portal.accent)}>
                <portal.icon className="h-3 w-3" />
              </span>
              <span className="hidden font-medium sm:inline">{portal.name}</span>
              <ChevronDown className="h-3 w-3 shrink-0" />
            </button>
          }
        >
          <MenuLabel>Switch portal</MenuLabel>
          {PORTALS.filter((p) => p.status === 'LIVE').map((p) => (
            <MenuItem
              key={p.code}
              icon={<p.icon className="h-3.5 w-3.5" />}
              label={
                <span className="flex w-full items-center justify-between gap-3">
                  <span>{p.name}</span>
                  {p.code === portal.code && <Check className="h-3.5 w-3.5 text-brand-600" />}
                </span>
              }
              onClick={() => {
                setPortal(p.code)
                navigate(p.home)
              }}
            />
          ))}
          <MenuSeparator />
          <MenuLabel>Later volumes</MenuLabel>
          {PORTALS.filter((p) => p.status === 'PLANNED').slice(0, 5).map((p) => (
            <MenuItem key={p.code} icon={<p.icon className="h-3.5 w-3.5" />} label={p.name} disabled />
          ))}
        </Menu>

        <span className="h-5 w-px shrink-0 bg-border" />

        {/* ── Context switchers ─────────────────────────────────────────── */}
        <div className="flex items-center gap-1 overflow-x-auto">
          <ContextPicker
            icon={<Building2 className="h-3.5 w-3.5" />}
            label={company.code}
            title={company.legalName}
            options={companies.map((c) => ({ id: c.uid, label: c.legalName, sub: c.code }))}
            value={company.uid}
            onChange={setCompany}
            heading="Company"
          />
          <span className="text-fg-subtle">/</span>
          <ContextPicker
            icon={<GitBranch className="h-3.5 w-3.5" />}
            label={branch?.code ?? 'All'}
            title={branch?.name ?? 'All branches'}
            options={[
              { id: '__all', label: 'All branches', sub: '' },
              ...companyBranches.map((b) => ({ id: b.uid, label: b.name, sub: b.gstin ?? 'no separate GSTIN' })),
            ]}
            value={branch?.uid ?? '__all'}
            onChange={(v) => setBranch(v === '__all' ? null : v)}
            heading="Branch"
          />
          <span className="text-fg-subtle">/</span>
          <ContextPicker
            icon={<Factory className="h-3.5 w-3.5" />}
            label={plant?.code ?? 'All'}
            title={plant?.name ?? 'All plants'}
            options={[
              { id: '__all', label: 'All plants', sub: '' },
              ...companyPlants.map((p) => ({ id: p.uid, label: p.name, sub: `${p.linesCount} lines` })),
            ]}
            value={plant?.uid ?? '__all'}
            onChange={(v) => setPlant(v === '__all' ? null : v)}
            heading="Plant"
          />
          <span className="text-fg-subtle">/</span>
          <ContextPicker
            icon={<CalendarRange className="h-3.5 w-3.5" />}
            label={fy.code}
            title={`${fy.startDate} → ${fy.endDate}`}
            options={companyFys.map((f) => ({
              id: f.uid,
              label: f.code,
              sub: f.isCurrent ? 'Current · Open' : f.status === 'OPEN' ? 'Open' : 'Closed',
            }))}
            value={fy.uid}
            onChange={setFy}
            heading="Financial year"
          />
        </div>

        {/* ── Global search ─────────────────────────────────────────────── */}
        <button
          onClick={() => setCommandOpen(true)}
          className="ml-2 hidden h-8 min-w-0 max-w-md flex-1 items-center gap-2 rounded border border-border bg-surface-2 px-2.5 text-left text-xs text-fg-subtle transition-colors hover:border-border-strong hover:bg-surface-3 md:flex"
        >
          <Search className="h-3.5 w-3.5 shrink-0" />
          <span className="flex-1 truncate">Search documents, parties, items, batches…</span>
          <span className="kbd">Ctrl</span>
          <span className="kbd">/</span>
        </button>

        {/* ── Right cluster ─────────────────────────────────────────────── */}
        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="icon-sm" className="md:hidden" onClick={() => setCommandOpen(true)}>
            <Search className="h-4 w-4" />
          </Button>

          <Link
            to="/workflow/inbox"
            className={cn(
              'relative inline-flex h-8 items-center gap-1.5 rounded px-2 text-xs font-medium transition-colors',
              overdue > 0 ? 'text-danger hover:bg-danger/10' : 'text-fg-muted hover:bg-surface-3 hover:text-fg',
            )}
            title={`${pending.length} approvals pending, ${overdue} overdue`}
          >
            <ClipboardCheck className="h-4 w-4" />
            <span className="tabular">{pending.length}</span>
            {overdue > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-danger opacity-70" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-danger" />
              </span>
            )}
          </Link>

          <button
            onClick={() => setNotifOpen(true)}
            className="relative inline-flex h-8 w-8 items-center justify-center rounded text-fg-muted transition-colors hover:bg-surface-3 hover:text-fg"
            title={`${unread} unread notifications`}
          >
            <Bell className="h-4 w-4" />
            {unread > 0 && (
              <span className="absolute right-0.5 top-0.5 flex h-3.5 min-w-[0.875rem] items-center justify-center rounded-full bg-danger px-0.5 text-[9px] font-bold text-white tabular">
                {unread}
              </span>
            )}
          </button>



          <Button variant="ghost" size="icon-sm" title="Help (?)" onClick={() => setCommandOpen(true)}>
            <HelpCircle className="h-4 w-4" />
          </Button>

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
            <MenuItem label="My profile" icon={<CircleUser />} onClick={() => navigate('/profile')} />
            <MenuItem label="Preferences" icon={<Settings />} onClick={() => navigate('/profile?tab=preferences')} />
            <MenuItem label="Switch demo user" icon={<UserCog />} onClick={() => navigate('/login?switch=1')} />
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

      {/* ── Notification centre ───────────────────────────────────────────── */}
      <Drawer
        open={notifOpen}
        onClose={() => setNotifOpen(false)}
        title="Notifications"
        description={`${unread} unread of ${notifications.length}`}
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => markAllRead(notifications.map((n) => n.uid))}>
              Mark all read
            </Button>
            <Button size="sm" onClick={() => { setNotifOpen(false); navigate('/admin/notifications') }}>
              Notification settings
            </Button>
          </>
        }
      >
        <div className="space-y-1.5">
          {notifications.map((n) => (
            <button
              key={n.uid}
              onClick={() => {
                markRead(n.uid)
                if (n.link && n.link !== '#') {
                  setNotifOpen(false)
                  navigate(n.link)
                }
              }}
              className={cn(
                'flex w-full gap-2.5 rounded border p-2.5 text-left transition-colors',
                n.isRead ? 'border-border bg-surface hover:bg-surface-2' : 'border-brand-500/30 bg-brand-500/5 hover:bg-brand-500/10',
              )}
            >
              <span
                className={cn(
                  'mt-1 h-1.5 w-1.5 shrink-0 rounded-full',
                  n.urgency === 'CRITICAL' ? 'bg-danger' : n.urgency === 'HIGH' ? 'bg-pending' : 'bg-fg-subtle',
                )}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <p className={cn('truncate text-sm', n.isRead ? 'text-fg-muted' : 'font-medium text-fg')}>
                    {n.title}
                  </p>
                  <span className="shrink-0 text-[10px] text-fg-subtle">{formatTimeAgo(n.at)}</span>
                </div>
                <p className="mt-0.5 line-clamp-2 text-xs text-fg-muted">{n.body}</p>
                <span className="mt-1 inline-block rounded bg-surface-3 px-1.5 py-0.5 text-[10px] text-fg-subtle">
                  {n.category}
                </span>
              </div>
            </button>
          ))}
        </div>
      </Drawer>
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

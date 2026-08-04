import { useEffect, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { ChevronDown, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { cn } from '@/lib/cn'
import { navigationFor, type NavItem } from '@/config/navigation'
import { portalOf } from '@/config/portals'
import { useAuth, usePermissions } from '@/store/auth'
import { useUi } from '@/store/ui'
import { isApprovable } from '@/lib/procFlow'
import { approvalTasks } from '@/mock/data2'

export function Sidebar() {
  const collapsed = useUi((s) => s.sidebarCollapsed)
  const toggle = useUi((s) => s.toggleSidebar)
  const portalCode = useAuth((s) => s.portal)
  const { has } = usePermissions()
  const { pathname } = useLocation()
  const [open, setOpen] = useState<Record<string, boolean>>({})

  const portal = portalOf(portalCode)
  const navigation = navigationFor(portal.code)

  // Auto-expand ONLY the group containing the active route (Accordion style).
  useEffect(() => {
    for (const group of navigation) {
      if (group.children?.some((c) => c.to && pathname.startsWith(c.to))) {
        setOpen({ [group.label]: true })
        break
      }
    }
  }, [pathname, navigation])

  const pendingCount = approvalTasks.filter((t) => t.status === 'PENDING' && isApprovable(t.documentType)).length

  const visible = (item: NavItem) => !item.permission || has(item.permission)

  return (
    <aside
      className={cn(
        'no-print sticky top-0 z-30 flex h-screen shrink-0 flex-col border-r border-border bg-surface transition-[width] duration-200',
        collapsed ? 'w-sidebar-collapsed' : 'w-sidebar',
      )}
    >
      {/* Brand + active portal */}
      <div className="flex h-topbar shrink-0 items-center gap-2.5 border-b border-border px-3">
        <div
          className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded ring-1 ring-inset', portal.accent)}
          title={portal.name}
        >
          <portal.icon className="h-3.5 w-3.5" />
        </div>
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold leading-tight text-fg">{portal.name}</p>
            <p className="truncate text-2xs leading-tight text-fg-subtle">SSB Industries</p>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {navigation.map((group) => {
          if (!group.children) {
            if (!visible(group)) return null
            return (
              <NavRow
                key={group.label}
                item={group}
                collapsed={collapsed}
                badgeCount={group.badge === 'approvals' ? pendingCount : undefined}
              />
            )
          }

          const children = group.children.filter(visible)
          if (!children.length) return null
          const isOpen = collapsed ? false : (open[group.label] ?? false)

          return (
            <div key={group.label} className="mb-0.5">
              <button
                type="button"
                onClick={() => {
                  if (collapsed) toggle()
                  setOpen((o) => (o[group.label] ? {} : { [group.label]: true }))
                }}
                title={collapsed ? group.label : undefined}
                className={cn(
                  'group flex w-full items-center gap-2.5 rounded-[12px] px-4 py-3 text-left text-[15px] font-medium transition-all duration-200',
                  'text-[#5B6478] hover:bg-[#F5F8FF] hover:text-fg',
                  collapsed && 'justify-center',
                )}
              >
                {group.icon && <group.icon className="h-5 w-5 shrink-0 text-[#7C8AA5] group-hover:text-brand-500" />}
                {!collapsed && (
                  <>
                    <span className="flex-1 truncate">{group.label}</span>
                    <ChevronDown
                      className={cn('h-4 w-4 shrink-0 transition-transform text-[#7C8AA5] group-hover:text-brand-500', isOpen && 'rotate-180')}
                    />
                  </>
                )}
              </button>
              {isOpen && (
                <div className="mt-0.5 space-y-0.5 border-l border-border pl-3 ml-3.5">
                  {children.map((child) => (
                    <NavRow
                      key={child.label}
                      item={child}
                      collapsed={false}
                      nested
                      badgeCount={child.badge === 'approvals' ? pendingCount : undefined}
                    />
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </nav>

      {/* Collapse toggle */}
      <div className="shrink-0 border-t border-border p-2">
        <button
          type="button"
          onClick={toggle}
          className={cn(
            'flex w-full items-center gap-2.5 rounded px-2 py-1.5 text-xs text-fg-muted transition-colors hover:bg-surface-3 hover:text-fg',
            collapsed && 'justify-center',
          )}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          {!collapsed && <span>Collapse</span>}
        </button>
      </div>
    </aside>
  )
}

function NavRow({
  item,
  collapsed,
  nested,
  badgeCount,
}: {
  item: NavItem
  collapsed: boolean
  nested?: boolean
  badgeCount?: number
}) {
  if (item.comingSoon || !item.to) {
    return (
      <div
        title="Delivered in a later volume"
        className={cn(
          'flex cursor-not-allowed items-center gap-2.5 rounded-[12px] px-4 py-3 text-[15px] text-fg-subtle border-l-[4px] border-transparent',
          collapsed && 'justify-center',
        )}
      >
        {item.icon && <item.icon className="h-5 w-5 shrink-0 opacity-50 text-[#7C8AA5]" />}
        {!collapsed && (
          <>
            <span className="flex-1 truncate">{item.label}</span>
            <span className="rounded bg-surface-3 px-1.5 py-0.5 text-[10px] uppercase tracking-wide">soon</span>
          </>
        )}
      </div>
    )
  }

  return (
    <NavLink
      to={item.to}
      end={item.to === '/'}
      title={collapsed ? item.label : undefined}
      className={({ isActive }) =>
        cn(
          'group flex items-center gap-2.5 rounded-[12px] px-4 py-3 text-[15px] transition-all duration-200',
          isActive
            ? 'bg-[#EEF3FF] font-medium text-brand-500 border-l-[4px] border-brand-500'
            : 'text-[#5B6478] hover:bg-[#F5F8FF] hover:text-fg border-l-[4px] border-transparent',
          collapsed && 'justify-center',
          nested && 'text-[13px] py-2.5 px-4',
        )
      }
    >
      {({ isActive }) => (
        <>
          {item.icon && (
            <item.icon
              className={cn(
                'shrink-0',
                isActive ? 'text-brand-500' : 'text-[#7C8AA5] group-hover:text-brand-500',
                nested ? 'h-4 w-4' : 'h-5 w-5'
              )}
            />
          )}
          {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
          {!collapsed && badgeCount !== undefined && badgeCount > 0 && (
            <span className={cn('rounded-full px-1.5 text-[10px] font-semibold tabular', isActive ? 'bg-white text-brand-500' : 'bg-brand-500 text-white')}>
              {badgeCount}
            </span>
          )}
        </>
      )}
    </NavLink>
  )
}

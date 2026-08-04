import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type Theme = 'light' | 'dark' | 'system'
type Density = 'comfortable' | 'compact'

interface UiState {
  theme: Theme
  density: Density
  sidebarCollapsed: boolean
  commandOpen: boolean
  notificationsOpen: boolean
  readNotifications: string[]

  setTheme: (t: Theme) => void
  setDensity: (d: Density) => void
  toggleSidebar: () => void
  setCommandOpen: (v: boolean) => void
  setNotificationsOpen: (v: boolean) => void
  markRead: (uid: string) => void
  markAllRead: (uids: string[]) => void
}

export const useUi = create<UiState>()(
  persist(
    (set) => ({
      theme: 'light',
      density: 'comfortable',
      sidebarCollapsed: false,
      commandOpen: false,
      notificationsOpen: false,
      readNotifications: [],

      setTheme: (theme) => {
        set({ theme })
        applyTheme(theme)
      },
      setDensity: (density) => set({ density }),
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setCommandOpen: (commandOpen) => set({ commandOpen }),
      setNotificationsOpen: (notificationsOpen) => set({ notificationsOpen }),
      markRead: (uid) => set((s) => ({ readNotifications: [...new Set([...s.readNotifications, uid])] })),
      markAllRead: (uids) => set((s) => ({ readNotifications: [...new Set([...s.readNotifications, ...uids])] })),
    }),
    {
      name: 'ssberp.ui',
      partialize: (s) => ({
        theme: s.theme,
        density: s.density,
        sidebarCollapsed: s.sidebarCollapsed,
        readNotifications: s.readNotifications,
      }),
    },
  ),
)

export function applyTheme(theme: Theme) {
  const dark =
    theme === 'dark' ||
    (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', dark)
  try {
    localStorage.setItem('ssberp.theme', theme)
  } catch {
    /* storage unavailable — theme still applies for this session */
  }
}

// Keep 'system' in sync with OS changes.
if (typeof window !== 'undefined') {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (useUi.getState().theme === 'system') applyTheme('system')
  })
}

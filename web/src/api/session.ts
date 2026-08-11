/**
 * Real API session: tokens + the active company context.
 *
 * This holds CLIENT auth state (tokens, which company the user is acting in) —
 * which is exactly what Zustand is for (CLAUDE.md §7). Server DATA never lives
 * here; that flows through TanStack Query. It is intentionally separate from the
 * mock `store/auth.ts` so the prototype keeps working while screens migrate.
 *
 * The active `companyUid` is folded into every query key (see `hooks/`), so
 * switching company transparently re-scopes all Organisation queries — the
 * multi-company behaviour CLAUDE.md §4.3 requires.
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface SessionState {
  accessToken: string | null
  refreshToken: string | null
  userUid: string | null
  userName: string | null
  companyUid: string | null

  setAuth: (v: {
    accessToken: string
    refreshToken: string
    userUid: string
    userName: string
    companyUid: string
  }) => void
  setTokens: (accessToken: string, refreshToken: string) => void
  setCompany: (companyUid: string) => void
  clear: () => void
}

export const useSession = create<SessionState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      userUid: null,
      userName: null,
      companyUid: null,
      setAuth: (v) =>
        set({
          accessToken: v.accessToken,
          refreshToken: v.refreshToken,
          userUid: v.userUid,
          userName: v.userName,
          companyUid: v.companyUid,
        }),
      setTokens: (accessToken, refreshToken) => set({ accessToken, refreshToken }),
      setCompany: (companyUid) => set({ companyUid }),
      clear: () =>
        set({
          accessToken: null,
          refreshToken: null,
          userUid: null,
          userName: null,
          companyUid: null,
        }),
    }),
    { name: 'ssberp.session' },
  ),
)

/** Non-reactive snapshot for the fetch client (which is not a React component). */
export function getSession() {
  return useSession.getState()
}

export function setTokens(accessToken: string, refreshToken: string) {
  useSession.getState().setTokens(accessToken, refreshToken)
}

export function clearSession() {
  useSession.getState().clear()
}

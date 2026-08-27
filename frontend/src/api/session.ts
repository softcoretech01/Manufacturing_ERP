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

  /**
   * The active branch / plant / financial year the user is working in. These
   * are a client-side view filter over data the backend already scopes by
   * company (§4.3): the header pickers set them, and screens that care read
   * them. `null` branch/plant means "all"; `fyUid` defaults to the current FY
   * once the list loads.
   */
  branchUid: string | null
  plantUid: string | null
  fyUid: string | null

  setAuth: (v: {
    accessToken: string
    refreshToken: string
    userUid: string
    userName: string
    companyUid: string
  }) => void
  setTokens: (accessToken: string, refreshToken: string) => void
  setCompany: (companyUid: string) => void
  setBranch: (branchUid: string | null) => void
  setPlant: (plantUid: string | null) => void
  setFy: (fyUid: string | null) => void
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
      branchUid: null,
      plantUid: null,
      fyUid: null,
      setAuth: (v) =>
        set({
          accessToken: v.accessToken,
          refreshToken: v.refreshToken,
          userUid: v.userUid,
          userName: v.userName,
          companyUid: v.companyUid,
          // A fresh login re-resolves context; never carry a prior company's
          // branch/plant/FY selection across (§4.3).
          branchUid: null,
          plantUid: null,
          fyUid: null,
        }),
      setTokens: (accessToken, refreshToken) => set({ accessToken, refreshToken }),
      // Switching company drops the branch/plant/FY picks that belonged to the
      // old company so stale cross-company selections cannot linger.
      setCompany: (companyUid) => set({ companyUid, branchUid: null, plantUid: null, fyUid: null }),
      setBranch: (branchUid) => set({ branchUid }),
      setPlant: (plantUid) => set({ plantUid }),
      setFy: (fyUid) => set({ fyUid }),
      clear: () =>
        set({
          accessToken: null,
          refreshToken: null,
          userUid: null,
          userName: null,
          companyUid: null,
          branchUid: null,
          plantUid: null,
          fyUid: null,
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

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
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware'

/**
 * "Remember me" decides where the session lives, which is the only thing that
 * can actually make it survive a closed browser:
 *
 *   remembered  → localStorage   (still signed in tomorrow)
 *   not         → sessionStorage (signed out when the browser closes)
 *
 * The flag itself is always in localStorage — it is a preference, not a
 * credential, and it has to be readable before the session is rehydrated.
 */
const REMEMBER_KEY = 'ssberp.remember'

export function isRemembered(): boolean {
  try {
    return localStorage.getItem(REMEMBER_KEY) === '1'
  } catch {
    return false
  }
}

/** Call before signing in, so the tokens are written to the right store. */
export function setRemember(remember: boolean): void {
  try {
    if (remember) localStorage.setItem(REMEMBER_KEY, '1')
    else localStorage.removeItem(REMEMBER_KEY)
  } catch {
    // Private mode with storage blocked: the session simply stays in memory.
  }
}

export const rememberAwareStorage: StateStorage = {
  // Read the per-tab copy first, then fall back to the remembered one. The
  // fallback is also what carries an existing session over from before this
  // choice existed, rather than signing everyone out once.
  getItem: (name) => {
    try {
      return sessionStorage.getItem(name) ?? localStorage.getItem(name)
    } catch {
      return null
    }
  },
  // Writing to one store always clears the other, so a session can never be
  // left behind in localStorage after the user unticks the box.
  setItem: (name, value) => {
    try {
      if (isRemembered()) {
        localStorage.setItem(name, value)
        sessionStorage.removeItem(name)
      } else {
        sessionStorage.setItem(name, value)
        localStorage.removeItem(name)
      }
    } catch {
      /* storage unavailable */
    }
  },
  removeItem: (name) => {
    try {
      sessionStorage.removeItem(name)
      localStorage.removeItem(name)
    } catch {
      /* storage unavailable */
    }
  },
}

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
    { name: 'ssberp.session', storage: createJSONStorage(() => rememberAwareStorage) },
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

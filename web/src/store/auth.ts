import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { branches, companies, financialYears, plants, roles, users } from '@/mock/data'
import type { PortalCode } from '@/config/portals'
import type { User } from '@/types'

/**
 * Auth + active context store.
 *
 * Mirrors the server-side TenantContext: who is asking, which company/branch/
 * plant/FY they are working in, and what they may do. In the real system
 * permissions are resolved server-side and never trusted from the client — here
 * they are computed from the mock role definitions.
 */

interface AuthState {
  userUid: string | null
  companyUid: string
  branchUid: string | null
  plantUid: string | null
  fyUid: string

  /**
   * The portal the user signed into. It selects which navigation tree and
   * landing screen they get; it never widens or narrows their permissions,
   * which are resolved from their roles regardless of where they entered.
   */
  portal: PortalCode

  login: (loginId: string) => { ok: boolean; error?: string }
  loginAsDemo: (userUid: string) => void
  logout: () => void

  setPortal: (code: PortalCode) => void
  setCompany: (uid: string) => void
  setBranch: (uid: string | null) => void
  setPlant: (uid: string | null) => void
  setFy: (uid: string) => void
}

export const useAuth = create<AuthState>()(
  persist(
    (set) => ({
      userUid: null,
      companyUid: 'cmp-01',
      branchUid: 'brn-01',
      plantUid: 'plt-01',
      fyUid: 'fy-03',
      portal: 'ADMIN',

      login: (loginId) => {
        const user = users.find(
          (u) => u.loginId.toLowerCase() === loginId.trim().toLowerCase() ||
                 u.email.toLowerCase() === loginId.trim().toLowerCase(),
        )
        // The response to an unknown account is deliberately indistinguishable
        // from a wrong password (V1-IAM-BR-006 — no account enumeration).
        if (!user) return { ok: false, error: 'Incorrect login id or password.' }
        if (user.status === 'SUSPENDED' || user.status === 'DEACTIVATED') {
          return { ok: false, error: 'Incorrect login id or password.' }
        }
        if (user.status === 'PENDING_ACTIVATION') {
          return { ok: false, error: 'Incorrect login id or password.' }
        }
        applyUser(set, user)
        return { ok: true }
      },

      loginAsDemo: (userUid) => {
        const user = users.find((u) => u.uid === userUid)
        if (user) applyUser(set, user)
      },

      logout: () => set({ userUid: null }),

      setPortal: (portal) => set({ portal }),

      setCompany: (uid) => {
        // Switching company re-resolves context; it never carries the previous
        // company's cached authorisations (V1-IAM-BR-008).
        const firstBranch = branches.find((b) => b.companyUid === uid)
        const firstPlant = plants.find((p) => p.companyUid === uid)
        const fy = financialYears.find((f) => f.companyUid === uid && f.isCurrent)
        set({
          companyUid: uid,
          branchUid: firstBranch?.uid ?? null,
          plantUid: firstPlant?.uid ?? null,
          fyUid: fy?.uid ?? 'fy-03',
        })
      },
      setBranch: (uid) => set({ branchUid: uid }),
      setPlant: (uid) => set({ plantUid: uid }),
      setFy: (uid) => set({ fyUid: uid }),
    }),
    { name: 'ssberp.auth' },
  ),
)

function applyUser(set: (partial: Partial<AuthState>) => void, user: User) {
  set({
    userUid: user.uid,
    companyUid: user.defaultCompanyUid,
    branchUid: user.defaultBranchUid,
    plantUid: user.defaultPlantUid,
    fyUid: financialYears.find((f) => f.companyUid === user.defaultCompanyUid && f.isCurrent)?.uid ?? 'fy-03',
  })
}

/* ─────────────────────────── Selectors ─────────────────────────── */

export function useCurrentUser(): User | null {
  const uid = useAuth((s) => s.userUid)
  return uid ? (users.find((u) => u.uid === uid) ?? null) : null
}

export function useActiveContext() {
  const { companyUid, branchUid, plantUid, fyUid } = useAuth()
  return {
    company: companies.find((c) => c.uid === companyUid) ?? companies[0],
    branch: branches.find((b) => b.uid === branchUid) ?? null,
    plant: plants.find((p) => p.uid === plantUid) ?? null,
    fy: financialYears.find((f) => f.uid === fyUid) ?? financialYears[2],
  }
}

/**
 * Effective permissions = union of all held roles, minus explicit denials.
 * Deny always wins over allow (V1-IAM-BR-003).
 */
export function usePermissions() {
  const user = useCurrentUser()

  const held = user ? roles.filter((r) => user.roles.includes(r.code)) : []
  const allowed = new Set(held.flatMap((r) => r.permissions))
  const denied = new Set(held.flatMap((r) => r.deniedPermissions))

  const has = (code: string) => {
    if (denied.has(code)) return false
    return allowed.has(code)
  }

  return {
    roles: held,
    allowed,
    denied,
    has,
    hasAny: (...codes: string[]) => codes.some(has),
    hasAll: (...codes: string[]) => codes.every(has),
    /** Which role granted a permission — used by the "effective permissions" view. */
    grantedBy: (code: string) => held.find((r) => r.permissions.includes(code))?.code ?? null,
  }
}

/** Field-level security: is this field hidden/read-only for the current user? */
export function useFieldAccess(entity: string, field: string): 'HIDDEN' | 'READ_ONLY' | 'EDITABLE' {
  const { roles: held } = usePermissions()
  const policies = held.flatMap((r) => r.fieldPolicies).filter((p) => p.entity === entity && p.field === field)
  if (!policies.length) return 'EDITABLE'
  // Most permissive across roles wins (V1-IAM-BR-002).
  if (policies.some((p) => p.access === 'EDITABLE')) return 'EDITABLE'
  if (policies.some((p) => p.access === 'READ_ONLY')) return 'READ_ONLY'
  return 'HIDDEN'
}

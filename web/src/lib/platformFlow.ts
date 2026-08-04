/**
 * Volume 15 — the platform engine.
 *
 * The admin screens already existed; what did not was the logic underneath
 * them. This file is that logic: which approval rule a document actually hits,
 * who the approver resolves to once delegation is applied, when a task
 * escalates, whether a user may perform an action, whether an imported row is
 * acceptable, and whether a password meets policy.
 *
 * Everything here is pure. The screens read it; nothing here reads the screens.
 */

import type {
  ApprovalLevel, ApprovalRule, ApprovalTask, Delegation, FieldPolicy, Role, User,
} from '@/types'
import type {
  ImportField, ImportIssue, ImportSpec, ManagedDocument, PasswordPolicy, SecurityPolicy,
} from '@/types/platform'

const live = <T extends { deletedAt?: string | null }>(rows: T[]) => rows.filter((r) => !r.deletedAt)

/** Local-date parse; `new Date('2026-07-30')` is UTC midnight and shifts a day in IST. */
export function parseDate(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1)
}

export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function hoursBetween(fromIso: string, toIso: string): number {
  return (new Date(toIso).getTime() - new Date(fromIso).getTime()) / 3_600_000
}

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((parseDate(toIso).getTime() - parseDate(fromIso).getTime()) / 86_400_000)
}

/* ═══════════════════════ Approval rule selection ═══════════════════════ */

export interface RuleMatch {
  rule: ApprovalRule | null
  /** Rules that were considered but did not apply, and why. */
  rejected: { rule: ApprovalRule; reason: string }[]
  /** True when the amount falls under the rule's auto-approve threshold. */
  autoApproved: boolean
  reason: string
}

/**
 * Which rule a document hits.
 *
 * Rules are tried in priority order and the first match wins — not the
 * narrowest, not the highest value. Priority is explicit because "most
 * specific" is ambiguous the moment two rules differ on different dimensions,
 * and an ambiguous approval matrix is one nobody can audit.
 */
export function selectApprovalRule(
  ctx: { documentType: string; subType?: string | null; amount: number; branchCode?: string; plantCode?: string },
  rules: ApprovalRule[],
): RuleMatch {
  const rejected: { rule: ApprovalRule; reason: string }[] = []

  const candidates = rules
    .filter((r) => r.isActive)
    .slice()
    .sort((a, b) => a.priority - b.priority)

  for (const rule of candidates) {
    if (rule.documentType !== ctx.documentType) continue

    if (rule.subType && ctx.subType && rule.subType !== ctx.subType) {
      rejected.push({ rule, reason: `Applies to ${rule.subType}, this is ${ctx.subType}.` })
      continue
    }
    // A blank branch or plant on the rule means "any".
    if (rule.branchCode && ctx.branchCode && rule.branchCode !== ctx.branchCode) {
      rejected.push({ rule, reason: `Applies to branch ${rule.branchCode}.` })
      continue
    }
    if (rule.plantCode && ctx.plantCode && rule.plantCode !== ctx.plantCode) {
      rejected.push({ rule, reason: `Applies to plant ${rule.plantCode}.` })
      continue
    }
    if (rule.conditionType === 'AMOUNT_BAND') {
      if (rule.minAmount !== null && ctx.amount < rule.minAmount) {
        rejected.push({ rule, reason: `Band starts at ${rule.minAmount.toLocaleString('en-IN')}.` })
        continue
      }
      if (rule.maxAmount !== null && ctx.amount > rule.maxAmount) {
        rejected.push({ rule, reason: `Band ends at ${rule.maxAmount.toLocaleString('en-IN')}.` })
        continue
      }
    }

    const autoApproved = rule.autoApproveBelow !== null && ctx.amount < rule.autoApproveBelow
    return {
      rule,
      rejected,
      autoApproved,
      reason: autoApproved
        ? `${rule.name} applies, and ${ctx.amount.toLocaleString('en-IN')} is below its ${rule.autoApproveBelow?.toLocaleString('en-IN')} auto-approve threshold.`
        : `${rule.name} applies (priority ${rule.priority}).`,
    }
  }

  return {
    rule: null,
    rejected,
    autoApproved: false,
    reason: `No active rule covers a ${ctx.documentType} of ${ctx.amount.toLocaleString('en-IN')}. The document cannot be submitted until one exists.`,
  }
}

/**
 * Gaps and overlaps in the matrix for one document type.
 *
 * A gap is a value nothing covers, which means a document that cannot be
 * submitted. An overlap is two rules at the same priority both matching, which
 * means the outcome depends on array order — the thing an audit will find.
 */
export function matrixCoverage(documentType: string, rules: ApprovalRule[]): {
  gaps: { from: number; to: number | null }[]
  overlaps: { a: ApprovalRule; b: ApprovalRule; from: number; to: number | null }[]
  bands: { rule: ApprovalRule; from: number; to: number | null }[]
} {
  const bands = rules
    .filter((r) => r.isActive && r.documentType === documentType && r.conditionType === 'AMOUNT_BAND')
    .map((r) => ({ rule: r, from: r.minAmount ?? 0, to: r.maxAmount }))
    .sort((a, b) => a.from - b.from)

  const gaps: { from: number; to: number | null }[] = []
  const overlaps: { a: ApprovalRule; b: ApprovalRule; from: number; to: number | null }[] = []

  // Only a catch-all rule (ALWAYS) removes the need for full band coverage.
  const hasCatchAll = rules.some((r) => r.isActive && r.documentType === documentType && r.conditionType === 'ALWAYS')

  let cursor = 0
  for (const b of bands) {
    if (!hasCatchAll && b.from > cursor) gaps.push({ from: cursor, to: b.from })
    cursor = b.to === null ? Number.POSITIVE_INFINITY : Math.max(cursor, b.to)
  }
  if (!hasCatchAll && cursor !== Number.POSITIVE_INFINITY) gaps.push({ from: cursor, to: null })

  for (let i = 0; i < bands.length; i++) {
    for (let j = i + 1; j < bands.length; j++) {
      const a = bands[i]
      const b = bands[j]
      const aTo = a.to ?? Number.POSITIVE_INFINITY
      const bTo = b.to ?? Number.POSITIVE_INFINITY
      const from = Math.max(a.from, b.from)
      const to = Math.min(aTo, bTo)
      // Same priority means the winner depends on ordering, which is the bug.
      if (from < to && a.rule.priority === b.rule.priority) {
        overlaps.push({ a: a.rule, b: b.rule, from, to: to === Number.POSITIVE_INFINITY ? null : to })
      }
    }
  }

  return { gaps, overlaps, bands }
}

/* ═══════════════════════ Delegation ═══════════════════════ */

export interface ResolvedApprover {
  /** Who the rule names. */
  nominalUid: string
  nominalName: string
  /** Who will actually see it, after delegation. */
  effectiveUid: string
  effectiveName: string
  /** The chain followed, where a delegate had delegated onward. */
  chain: { fromName: string; toName: string; reason: string; validTo: string }[]
  isDelegated: boolean
  note: string
}

/**
 * Who actually receives a task.
 *
 * Delegation chains: if A delegates to B and B is also away and has delegated
 * to C, the task lands with C. The walk is depth-limited and cycle-guarded —
 * A→B→A would otherwise loop for ever, and people do set that up by accident
 * when two managers cover each other.
 */
export function resolveApprover(
  userUid: string,
  users: User[],
  delegations: Delegation[],
  documentType: string,
  today = isoDate(new Date()),
  maxHops = 5,
): ResolvedApprover {
  const nameOf = (uid: string) => users.find((u) => u.uid === uid)?.fullName ?? uid

  const chain: ResolvedApprover['chain'] = []
  const seen = new Set<string>([userUid])
  let current = userUid

  for (let hop = 0; hop < maxHops; hop++) {
    const d = delegations.find(
      (x) =>
        x.status === 'ACTIVE' &&
        x.fromUserUid === current &&
        x.validFrom <= today &&
        x.validTo >= today &&
        (x.documentTypes.length === 0 || x.documentTypes.includes(documentType)),
    )
    if (!d) break
    if (seen.has(d.toUserUid)) {
      // A cycle. Stop where we are rather than looping; the task stays with the
      // last person outside the loop.
      chain.push({ fromName: nameOf(current), toName: nameOf(d.toUserUid), reason: 'Cycle — delegation ignored', validTo: d.validTo })
      break
    }
    chain.push({ fromName: nameOf(current), toName: nameOf(d.toUserUid), reason: d.reason, validTo: d.validTo })
    seen.add(d.toUserUid)
    current = d.toUserUid
  }

  const isDelegated = current !== userUid
  return {
    nominalUid: userUid,
    nominalName: nameOf(userUid),
    effectiveUid: current,
    effectiveName: nameOf(current),
    chain,
    isDelegated,
    note: isDelegated
      ? `Delegated from ${nameOf(userUid)} to ${nameOf(current)}${chain.length > 1 ? ` through ${chain.length} hops` : ''}.`
      : 'No delegation in force; the named approver receives it.',
  }
}

/** Delegations that would loop, which resolve to nobody useful. */
export function delegationCycles(delegations: Delegation[], today = isoDate(new Date())): Delegation[][] {
  const active = delegations.filter((d) => d.status === 'ACTIVE' && d.validFrom <= today && d.validTo >= today)
  const out: Delegation[][] = []

  for (const start of active) {
    const path: Delegation[] = [start]
    const seen = new Set([start.fromUserUid])
    let current = start.toUserUid
    for (let i = 0; i < 10; i++) {
      if (seen.has(current)) {
        if (current === start.fromUserUid) out.push([...path])
        break
      }
      seen.add(current)
      const next = active.find((d) => d.fromUserUid === current)
      if (!next) break
      path.push(next)
      current = next.toUserUid
    }
  }
  // De-duplicate cycles found from different starting points.
  const keys = new Set<string>()
  return out.filter((cycle) => {
    const key = cycle.map((d) => d.uid).sort().join('|')
    if (keys.has(key)) return false
    keys.add(key)
    return true
  })
}

/* ═══════════════════════ Escalation ═══════════════════════ */

export interface EscalationState {
  task: ApprovalTask
  hoursWaiting: number
  /** Minutes left before it is due; negative once past. The authoritative figure. */
  minutesRemaining: number
  hoursRemaining: number
  isOverdue: boolean
  overdueHours: number
  /** Which escalation step has been reached, from the level's rules. */
  escalatedTo: string | null
  /** How urgent it looks to the person watching the queue. */
  severity: 'NORMAL' | 'DUE_SOON' | 'OVERDUE' | 'ESCALATED'
  note: string
}

/** Minutes as a person would say them: 40 minutes, 3 hours, 2 days. */
function saySpan(minutes: number): string {
  const m = Math.abs(Math.round(minutes))
  if (m < 60) return `${m} minute${m === 1 ? '' : 's'}`
  const h = Math.round(m / 60)
  if (h < 48) return `${h} hour${h === 1 ? '' : 's'}`
  return `${Math.round(h / 24)} days`
}

/**
 * Where a pending task stands against its service level.
 *
 * The `isOverdue` flag on the record is not trusted — it is a snapshot taken
 * when the row was written, and a queue that reads it will report a task as on
 * time three days after it went past its date.
 */
export function escalationState(
  task: ApprovalTask,
  now = new Date().toISOString(),
  escalateAfterHours: number | null = null,
): EscalationState {
  const hoursWaiting = Math.max(0, hoursBetween(task.assignedAt, now))

  /**
   * Everything derives from whole minutes, so the flag and the figure shown
   * beside it can never disagree. Deriving `isOverdue` from an exact fraction
   * while displaying a rounded hour is how a task two minutes late comes to
   * read "0 hours past its due time" — which looks like it is not late.
   */
  const minutesRemaining = Math.round((new Date(task.dueAt).getTime() - new Date(now).getTime()) / 60_000)
  const hoursRemaining = Math.round((minutesRemaining / 60) * 10) / 10
  const isOverdue = task.status === 'PENDING' && minutesRemaining < 0
  const overdueHours = isOverdue ? Math.round((Math.abs(minutesRemaining) / 60) * 10) / 10 : 0

  const threshold = escalateAfterHours ?? 48
  const escalated = task.status === 'PENDING' && hoursWaiting >= threshold

  const severity: EscalationState['severity'] = task.status !== 'PENDING'
    ? 'NORMAL'
    : escalated ? 'ESCALATED' : isOverdue ? 'OVERDUE' : minutesRemaining <= 8 * 60 ? 'DUE_SOON' : 'NORMAL'

  return {
    task,
    hoursWaiting: Math.round(hoursWaiting * 10) / 10,
    minutesRemaining,
    hoursRemaining,
    isOverdue,
    overdueHours,
    escalatedTo: escalated ? 'Next level up' : null,
    severity,
    note: task.status !== 'PENDING'
      ? `Already ${task.status.toLowerCase()}.`
      : escalated
        ? `Waiting ${saySpan(hoursWaiting * 60)}, past the ${threshold}-hour escalation threshold.`
        : isOverdue
          ? `${saySpan(minutesRemaining)} past its due time.`
          : `${saySpan(minutesRemaining)} left.`,
  }
}

/* ═══════════════════════ Level completion ═══════════════════════ */

export interface LevelDecision {
  approverUid: string
  approverName: string
  decision: 'APPROVED' | 'REJECTED' | 'PENDING'
}

/**
 * Whether an approval level is satisfied.
 *
 * ANY_ONE closes on the first approval; ALL needs everyone; QUORUM_N needs a
 * count. A rejection at any mode stops the document — one person saying no is
 * not outvoted by two saying yes, because approval is a control, not a poll.
 */
export function levelSatisfied(level: ApprovalLevel, decisions: LevelDecision[]): {
  satisfied: boolean
  rejected: boolean
  approvals: number
  needed: number
  note: string
} {
  const approvals = decisions.filter((d) => d.decision === 'APPROVED').length
  const rejections = decisions.filter((d) => d.decision === 'REJECTED')
  const total = decisions.length

  const needed =
    level.approvalMode === 'ANY_ONE' ? 1
      : level.approvalMode === 'ALL' ? Math.max(1, total)
        : Math.max(1, level.quorumCount ?? 1)

  if (rejections.length > 0) {
    return {
      satisfied: false,
      rejected: true,
      approvals,
      needed,
      note: `${rejections[0].approverName} rejected it. One rejection stops the document whatever the others said.`,
    }
  }

  const satisfied = approvals >= needed
  return {
    satisfied,
    rejected: false,
    approvals,
    needed,
    note: satisfied
      ? `${approvals} of ${needed} required approvals received.`
      : `${approvals} of ${needed} received; waiting on ${needed - approvals} more.`,
  }
}

/**
 * Whether a change to an approved document sends it back round.
 *
 * Only fields the rule names as material restart the workflow. Changing a
 * delivery note does not; changing the value or the supplier does.
 */
export function restartRequired(rule: ApprovalRule, changedFields: string[]): {
  restart: boolean
  triggeredBy: string[]
  note: string
} {
  if (!rule.restartOnChange) {
    return { restart: false, triggeredBy: [], note: 'This rule does not restart on amendment.' }
  }
  const triggeredBy = changedFields.filter((f) => rule.materialChangeFields.includes(f))
  return {
    restart: triggeredBy.length > 0,
    triggeredBy,
    note: triggeredBy.length
      ? `${triggeredBy.join(', ')} ${triggeredBy.length === 1 ? 'is a material field' : 'are material fields'}; the approvals already given are void.`
      : 'Nothing material changed, so the approvals stand.',
  }
}

/* ═══════════════════════ RBAC ═══════════════════════ */

export interface EffectiveAccess {
  /** Permission codes the user holds after grants and denials. */
  granted: Set<string>
  /** Denied wins over granted, always. */
  denied: Set<string>
  fieldPolicies: FieldPolicy[]
  roles: Role[]
  sensitive: string[]
}

/**
 * A user's effective permissions.
 *
 * A denial on any one role removes the permission however many other roles
 * grant it. Deny-wins is the only safe precedence: the alternative is that
 * adding a role can silently widen access somebody deliberately removed.
 */
export function effectiveAccess(user: User, roles: Role[], permissions: { code: string; isSensitive: boolean }[] = []): EffectiveAccess {
  const mine = roles.filter((r) => user.roles.includes(r.code) && r.isActive)
  const granted = new Set<string>()
  const denied = new Set<string>()

  for (const r of mine) {
    for (const p of r.permissions) granted.add(p)
    for (const p of r.deniedPermissions) denied.add(p)
  }
  for (const d of denied) granted.delete(d)

  return {
    granted,
    denied,
    fieldPolicies: mine.flatMap((r) => r.fieldPolicies),
    roles: mine,
    sensitive: [...granted].filter((c) => permissions.find((p) => p.code === c)?.isSensitive),
  }
}

/** Whether a permission code is held, honouring `MODULE.*` wildcards. */
export function can(access: EffectiveAccess, code: string): boolean {
  if (access.denied.has(code)) return false
  if (access.granted.has(code)) return true
  // A wildcard grant covers everything beneath it, but an explicit denial still wins.
  const [module, entity] = code.split('.')
  return access.granted.has(`${module}.*`) || access.granted.has(`${module}.${entity}.*`)
}

/**
 * Field-level access, resolved across every role.
 *
 * The most restrictive policy wins, for the same reason denial wins on
 * permissions: a second role must never be able to reveal a field the first
 * one hid.
 */
export function fieldAccess(access: EffectiveAccess, entity: string, field: string): 'HIDDEN' | 'READ_ONLY' | 'EDITABLE' {
  const applicable = access.fieldPolicies.filter((p) => p.entity === entity && p.field === field)
  if (!applicable.length) return 'EDITABLE'
  if (applicable.some((p) => p.access === 'HIDDEN')) return 'HIDDEN'
  if (applicable.some((p) => p.access === 'READ_ONLY')) return 'READ_ONLY'
  return 'EDITABLE'
}

/** Whether a user may see a record, by company/branch/plant scope and row rule. */
export function inDataScope(
  user: User,
  record: { companyUid?: string; branchUid?: string | null; plantUid?: string | null; ownerUid?: string; department?: string },
): { allowed: boolean; reason: string } {
  if (record.companyUid && user.scope.companies.length && !user.scope.companies.includes(record.companyUid)) {
    return { allowed: false, reason: 'Outside the companies this user is scoped to.' }
  }
  if (record.branchUid && user.scope.branches.length && !user.scope.branches.includes(record.branchUid)) {
    return { allowed: false, reason: 'Outside the branches this user is scoped to.' }
  }
  if (record.plantUid && user.scope.plants.length && !user.scope.plants.includes(record.plantUid)) {
    return { allowed: false, reason: 'Outside the plants this user is scoped to.' }
  }
  if (user.rowRule === 'OWN' && record.ownerUid && record.ownerUid !== user.uid) {
    return { allowed: false, reason: 'This user may only see their own records.' }
  }
  if (user.rowRule === 'DEPARTMENT' && record.department && record.department !== user.department) {
    return { allowed: false, reason: `This user sees only ${user.department} records.` }
  }
  return { allowed: true, reason: 'Within scope.' }
}

/**
 * Segregation-of-duties conflicts a user actually holds.
 *
 * Checked against effective permissions rather than role names, because a
 * conflict assembled from two innocuous roles is exactly the one nobody spots.
 */
export function sodConflicts(
  access: EffectiveAccess,
  rules: { code: string; name: string; permissionA: string; permissionB: string; severity: string }[],
): { rule: (typeof rules)[number]; holdsBoth: boolean }[] {
  return rules
    .map((rule) => ({ rule, holdsBoth: can(access, rule.permissionA) && can(access, rule.permissionB) }))
    .filter((x) => x.holdsBoth)
}

/* ═══════════════════════ Password policy ═══════════════════════ */

export interface PasswordCheck {
  ok: boolean
  failures: string[]
  /** 0–100, from length and variety. Not a promise, an indication. */
  strength: number
  strengthLabel: 'Very weak' | 'Weak' | 'Fair' | 'Strong' | 'Very strong'
}

/** Whether a password satisfies policy, and roughly how strong it is. */
export function checkPassword(password: string, policy: PasswordPolicy, user?: { loginId: string; fullName: string }): PasswordCheck {
  const failures: string[] = []

  if (password.length < policy.minLength) failures.push(`At least ${policy.minLength} characters — this has ${password.length}.`)
  if (policy.requireUpper && !/[A-Z]/.test(password)) failures.push('At least one capital letter.')
  if (policy.requireLower && !/[a-z]/.test(password)) failures.push('At least one small letter.')
  if (policy.requireDigit && !/[0-9]/.test(password)) failures.push('At least one digit.')
  if (policy.requireSymbol && !/[^A-Za-z0-9]/.test(password)) failures.push('At least one symbol.')

  const lower = password.toLowerCase()
  for (const word of policy.bannedWords) {
    if (word && lower.includes(word.toLowerCase())) { failures.push(`Must not contain "${word}".`); break }
  }
  if (policy.disallowUserInfo && user) {
    if (user.loginId && lower.includes(user.loginId.toLowerCase())) failures.push('Must not contain the login id.')
    else {
      const part = user.fullName.split(/\s+/).find((p) => p.length >= 4 && lower.includes(p.toLowerCase()))
      if (part) failures.push(`Must not contain "${part}".`)
    }
  }

  /**
   * Length, variety and distinct characters.
   *
   * Length is weighted hardest and the variety component is capped, because a
   * short password using all four character classes is not as strong as a long
   * one — and a formula that saturates at nine characters tells the user their
   * weak password is as good as it gets.
   */
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((re) => re.test(password)).length
  const distinct = new Set(password).size
  let strength = Math.round(
    Math.min(50, password.length * 3) +   // length, dominant, caps at ~17 characters
    classes * 8 +                          // variety, at most 32
    Math.min(18, distinct * 1.5),          // repetition penalty by omission
  )
  strength = Math.max(0, Math.min(100, strength))
  if (distinct <= 2 && password.length > 0) strength = Math.min(strength, 15)
  if (/^(.)\1+$/.test(password)) strength = 5

  const strengthLabel: PasswordCheck['strengthLabel'] =
    strength >= 85 ? 'Very strong' : strength >= 65 ? 'Strong' : strength >= 45 ? 'Fair' : strength >= 25 ? 'Weak' : 'Very weak'

  return { ok: failures.length === 0, failures, strength, strengthLabel }
}

/** Days until a password must be changed, negative once it has expired. */
export function passwordAge(lastChangedIso: string | null, policy: PasswordPolicy, today = isoDate(new Date())): {
  ageDays: number | null
  daysRemaining: number | null
  expired: boolean
} {
  if (!lastChangedIso || policy.expiryDays <= 0) return { ageDays: null, daysRemaining: null, expired: false }
  const ageDays = daysBetween(lastChangedIso, today)
  const daysRemaining = policy.expiryDays - ageDays
  return { ageDays, daysRemaining, expired: daysRemaining < 0 }
}

/** Whether an address falls inside a CIDR range. IPv4 only, which is what the allow-list uses. */
export function ipInCidr(ip: string, cidr: string): boolean {
  const [range, bitsRaw] = cidr.split('/')
  const bits = bitsRaw === undefined ? 32 : Number(bitsRaw)
  if (!Number.isFinite(bits) || bits < 0 || bits > 32) return false

  const toInt = (a: string) => {
    const parts = a.split('.').map(Number)
    if (parts.length !== 4 || parts.some((p) => !Number.isFinite(p) || p < 0 || p > 255)) return null
    return ((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3]
  }
  const a = toInt(ip)
  const b = toInt(range)
  if (a === null || b === null) return false
  if (bits === 0) return true
  const mask = (0xffffffff << (32 - bits)) >>> 0
  return ((a & mask) >>> 0) === ((b & mask) >>> 0)
}

/** Whether an address may reach the application under the policy. */
export function ipAllowed(ip: string, policy: SecurityPolicy): { allowed: boolean; reason: string } {
  const denied = policy.ipDenyList.find((d) => ipInCidr(ip, d.cidr))
  if (denied) return { allowed: false, reason: `${ip} is in the denied range ${denied.cidr} — ${denied.reason}.` }

  if (!policy.ipAllowList.length) return { allowed: true, reason: 'No allow-list configured; any address may connect.' }

  const hit = policy.ipAllowList.find((a) => ipInCidr(ip, a.cidr))
  return hit
    ? { allowed: true, reason: `${ip} is inside ${hit.cidr} (${hit.label}).` }
    : { allowed: false, reason: `${ip} is in none of the ${policy.ipAllowList.length} allowed ranges.` }
}

/* ═══════════════════════ Import validation ═══════════════════════ */

/** One value against one field definition. */
export function validateCell(value: string, field: ImportField, references: Record<string, string[]> = {}): string | null {
  const raw = (value ?? '').trim()

  if (!raw) return field.required ? `${field.label} is required.` : null

  switch (field.type) {
    case 'NUMBER': {
      const n = Number(raw)
      if (!Number.isFinite(n)) return `${field.label} must be a number, not "${raw}".`
      if (field.min !== undefined && n < field.min) return `${field.label} must be at least ${field.min}.`
      if (field.max !== undefined && n > field.max) return `${field.label} must be at most ${field.max}.`
      return null
    }
    case 'DATE': {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return `${field.label} must be a date as YYYY-MM-DD, not "${raw}".`
      const d = parseDate(raw)
      if (Number.isNaN(d.getTime())) return `${field.label} is not a real date.`
      // Guard against 2026-02-31, which Date silently rolls forward.
      if (isoDate(d) !== raw) return `${raw} is not a real date.`
      return null
    }
    case 'BOOLEAN':
      return ['true', 'false', 'yes', 'no', 'y', 'n', '1', '0'].includes(raw.toLowerCase())
        ? null
        : `${field.label} must be yes or no, not "${raw}".`
    case 'ENUM':
      return field.options?.includes(raw) ? null : `${field.label} must be one of ${field.options?.join(', ')} — got "${raw}".`
    case 'REFERENCE': {
      const known = references[field.referenceOf ?? ''] ?? []
      if (!known.length) return null // nothing to check against
      return known.includes(raw) ? null : `${raw} does not exist in ${field.referenceOf}.`
    }
    default:
      if (field.maxLength && raw.length > field.maxLength) return `${field.label} is longer than ${field.maxLength} characters.`
      return null
  }
}

export interface ImportValidation {
  rows: { rowNo: number; data: Record<string, string>; errors: string[]; warnings: string[]; isDuplicate: boolean; duplicateOf: number | null }[]
  issues: ImportIssue[]
  validRows: number
  errorRows: number
  warningRows: number
  duplicateRows: number
  /** Whether the run may be committed under the spec's all-or-nothing setting. */
  canCommit: boolean
  summary: string
}

/**
 * Validate a whole file before anything is written.
 *
 * Duplicates are detected within the file as well as against what exists —
 * a spreadsheet with the same customer twice is the ordinary case, and a
 * validator that only checks the database imports the second one over the first.
 */
export function validateImport(
  rows: Record<string, string>[],
  spec: ImportSpec,
  ctx: { references?: Record<string, string[]>; existingKeys?: string[] } = {},
): ImportValidation {
  const references = ctx.references ?? {}
  const existingKeys = new Set((ctx.existingKeys ?? []).map((k) => k.toLowerCase()))
  const keyFields = spec.fields.filter((f) => f.isKey)

  const seenKeys = new Map<string, number>()
  const issues: ImportIssue[] = []

  const out = rows.map((data, i) => {
    const rowNo = i + 1
    const errors: string[] = []
    const warnings: string[] = []

    for (const field of spec.fields) {
      const problem = validateCell(data[field.key] ?? '', field, references)
      if (problem) {
        errors.push(problem)
        issues.push({ rowNo, field: field.key, severity: 'ERROR', message: problem })
      }
    }

    // Unmapped columns are a warning, not an error — an extra column in the
    // spreadsheet is usually a note somebody added, not a mistake.
    for (const key of Object.keys(data)) {
      if (!spec.fields.some((f) => f.key === key)) {
        const msg = `Column "${key}" is not part of this import and will be ignored.`
        warnings.push(msg)
        issues.push({ rowNo, field: key, severity: 'WARNING', message: msg })
      }
    }

    let isDuplicate = false
    let duplicateOf: number | null = null

    if (keyFields.length) {
      const key = keyFields.map((f) => (data[f.key] ?? '').trim().toLowerCase()).join('|')
      if (key.replace(/\|/g, '')) {
        if (seenKeys.has(key)) {
          isDuplicate = true
          duplicateOf = seenKeys.get(key) as number
          const msg = `Same ${keyFields.map((f) => f.label).join(' + ')} as row ${duplicateOf}.`
          if (spec.onDuplicate === 'REJECT') { errors.push(msg); issues.push({ rowNo, field: null, severity: 'ERROR', message: msg }) }
          else { warnings.push(`${msg} It will be ${spec.onDuplicate.toLowerCase()}d.`); issues.push({ rowNo, field: null, severity: 'WARNING', message: msg }) }
        } else {
          seenKeys.set(key, rowNo)
          if (existingKeys.has(key)) {
            isDuplicate = true
            const msg = `A record with this ${keyFields.map((f) => f.label).join(' + ')} already exists.`
            if (spec.onDuplicate === 'REJECT') { errors.push(msg); issues.push({ rowNo, field: null, severity: 'ERROR', message: msg }) }
            else { warnings.push(`${msg} It will be ${spec.onDuplicate.toLowerCase()}d.`); issues.push({ rowNo, field: null, severity: 'WARNING', message: msg }) }
          }
        }
      }
    }

    return { rowNo, data, errors, warnings, isDuplicate, duplicateOf }
  })

  const errorRows = out.filter((r) => r.errors.length).length
  const warningRows = out.filter((r) => !r.errors.length && r.warnings.length).length
  const duplicateRows = out.filter((r) => r.isDuplicate).length
  const validRows = out.length - errorRows

  const canCommit = out.length > 0 && (spec.allOrNothing ? errorRows === 0 : validRows > 0)

  return {
    rows: out,
    issues,
    validRows,
    errorRows,
    warningRows,
    duplicateRows,
    canCommit,
    summary: out.length === 0
      ? 'The file has no rows.'
      : errorRows === 0
        ? `All ${out.length} rows are valid${duplicateRows ? `, ${duplicateRows} of them duplicates that will be ${spec.onDuplicate.toLowerCase()}d` : ''}.`
        : spec.allOrNothing
          ? `${errorRows} of ${out.length} rows have errors. This import is all-or-nothing, so nothing will be written until they are fixed.`
          : `${errorRows} of ${out.length} rows have errors and will be skipped; ${validRows} will be imported.`,
  }
}

/** Parse a pasted CSV block into rows keyed by its header. */
export function parseDelimited(text: string, delimiter = ','): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0)
  if (lines.length < 2) return []
  const headers = splitLine(lines[0], delimiter).map((h) => h.trim())
  return lines.slice(1).map((line) => {
    const cells = splitLine(line, delimiter)
    const row: Record<string, string> = {}
    headers.forEach((h, i) => { row[h] = (cells[i] ?? '').trim() })
    return row
  })
}

/** Split one line, honouring double quotes so a quoted comma survives. */
function splitLine(line: string, delimiter: string): string[] {
  const out: string[] = []
  let cur = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') { cur += '"'; i++ }
      else quoted = !quoted
    } else if (ch === delimiter && !quoted) {
      out.push(cur)
      cur = ''
    } else {
      cur += ch
    }
  }
  out.push(cur)
  return out
}

/* ═══════════════════════ Document management ═══════════════════════ */

export interface DocState {
  document: ManagedDocument
  current: ManagedDocument['revisions'][number] | null
  revisionCount: number
  isCheckedOut: boolean
  /** Days until expiry; negative once expired. Null where it never expires. */
  daysToExpiry: number | null
  isExpired: boolean
  isDueForReview: boolean
  canUpload: boolean
  note: string
}

/** Where a document stands: current revision, lock, expiry. */
export function documentState(doc: ManagedDocument, today = isoDate(new Date()), byWhom?: string): DocState {
  const current = doc.revisions.find((r) => r.revision === doc.currentRevision) ?? null
  const daysToExpiry = doc.expiresOn ? daysBetween(today, doc.expiresOn) : null
  const isExpired = daysToExpiry !== null && daysToExpiry < 0
  const isDueForReview = daysToExpiry !== null && daysToExpiry >= 0 && daysToExpiry <= doc.reviewLeadDays
  const isCheckedOut = !!doc.checkedOutBy
  const canUpload = !isCheckedOut || doc.checkedOutBy === byWhom

  return {
    document: doc,
    current,
    revisionCount: doc.revisions.length,
    isCheckedOut,
    daysToExpiry,
    isExpired,
    isDueForReview,
    canUpload,
    note: isExpired
      ? `Expired ${Math.abs(daysToExpiry as number)} days ago. It must not be used.`
      : isDueForReview
        ? `Expires in ${daysToExpiry} days — start the renewal now.`
        : isCheckedOut
          ? `Checked out by ${doc.checkedOutBy}; nobody else may upload a revision.`
          : 'Current and available.',
  }
}

/** What stops a new revision being uploaded. */
export function uploadBlockers(doc: ManagedDocument, byWhom: string): string[] {
  const out: string[] = []
  if (doc.checkedOutBy && doc.checkedOutBy !== byWhom) out.push(`${doc.checkedOutBy} has this checked out. Ask them to check it in first.`)
  if (doc.status === 'ARCHIVED') out.push('Archived documents are read-only.')
  return out
}

/** The next revision label: 1, 2, 3 — or A, B, C where the document uses letters. */
export function nextRevision(doc: ManagedDocument): string {
  if (!doc.revisions.length) return '1'
  const last = doc.currentRevision
  if (/^[A-Z]$/.test(last)) return String.fromCharCode(last.charCodeAt(0) + 1)
  const n = Number(last)
  return Number.isFinite(n) ? String(n + 1) : `${last}.1`
}

/** Folder tree built from the flat folder paths. */
export interface FolderNode {
  name: string
  path: string
  children: FolderNode[]
  documentCount: number
  depth: number
}

export function folderTree(docs: ManagedDocument[]): FolderNode[] {
  const roots: FolderNode[] = []
  const countAt = (path: string) => live(docs).filter((d) => d.folder === path).length

  for (const doc of live(docs)) {
    const parts = doc.folder.split('/').filter(Boolean)
    let level = roots
    let path = ''
    parts.forEach((name, i) => {
      path = path ? `${path}/${name}` : name
      let node = level.find((n) => n.name === name)
      if (!node) {
        node = { name, path, children: [], documentCount: 0, depth: i }
        level.push(node)
      }
      level = node.children
    })
  }

  // Count after the tree exists so every node gets its own direct count.
  const walk = (nodes: FolderNode[]) => {
    for (const n of nodes) { n.documentCount = countAt(n.path); walk(n.children) }
  }
  walk(roots)

  const sortAll = (nodes: FolderNode[]): FolderNode[] =>
    nodes.sort((a, b) => a.name.localeCompare(b.name)).map((n) => ({ ...n, children: sortAll(n.children) }))
  return sortAll(roots)
}

/** Every document in a folder and everything beneath it. */
export function documentsUnder(path: string, docs: ManagedDocument[]): ManagedDocument[] {
  return live(docs).filter((d) => d.folder === path || d.folder.startsWith(`${path}/`))
}

/* ═══════════════════════ Monitoring ═══════════════════════ */

export interface LogSummary {
  total: number
  byLevel: Record<string, number>
  bySource: Record<string, number>
  errorRate: number
  unacknowledged: number
  /** Messages seen more than once — the ones worth fixing first. */
  recurring: { message: string; count: number; lastAt: string; source: string }[]
}

/**
 * What the log is telling you.
 *
 * Recurring messages are grouped because a hundred instances of one fault is
 * one problem, and a list that shows it a hundred times buries the other
 * ninety-nine problems underneath it.
 */
export function summariseLogs(logs: { level: string; source: string; message: string; at: string; acknowledged: boolean; deletedAt?: string | null }[]): LogSummary {
  const rows = live(logs)
  const byLevel: Record<string, number> = {}
  const bySource: Record<string, number> = {}
  const groups = new Map<string, { count: number; lastAt: string; source: string }>()

  for (const l of rows) {
    byLevel[l.level] = (byLevel[l.level] ?? 0) + 1
    bySource[l.source] = (bySource[l.source] ?? 0) + 1
    if (l.level === 'ERROR' || l.level === 'FATAL' || l.level === 'WARN') {
      const e = groups.get(l.message) ?? { count: 0, lastAt: l.at, source: l.source }
      e.count += 1
      if (l.at > e.lastAt) e.lastAt = l.at
      groups.set(l.message, e)
    }
  }

  const errors = (byLevel.ERROR ?? 0) + (byLevel.FATAL ?? 0)

  return {
    total: rows.length,
    byLevel,
    bySource,
    errorRate: rows.length ? Math.round((errors / rows.length) * 1000) / 10 : 0,
    unacknowledged: rows.filter((l) => !l.acknowledged && (l.level === 'ERROR' || l.level === 'FATAL')).length,
    recurring: [...groups.entries()]
      .map(([message, v]) => ({ message, ...v }))
      .filter((g) => g.count > 1)
      .sort((a, b) => b.count - a.count),
  }
}

/* ═══════════════════════ Labels ═══════════════════════ */

export const DOC_CATEGORY_LABEL: Record<string, string> = {
  DRAWING: 'Drawing',
  SOP: 'Standard operating procedure',
  WORK_INSTRUCTION: 'Work instruction',
  QUALITY_CERTIFICATE: 'Quality certificate',
  INSPECTION_REPORT: 'Inspection report',
  MACHINE_MANUAL: 'Machine manual',
  CONTRACT: 'Contract',
  PURCHASE: 'Purchase document',
  SALES: 'Sales document',
  HR: 'HR document',
  FINANCE: 'Finance document',
  STATUTORY: 'Statutory document',
}

export const LOG_SOURCE_LABEL: Record<string, string> = {
  API: 'API', DATABASE: 'Database', JOB: 'Background job',
  INTEGRATION: 'Integration', AUTH: 'Authentication', WORKFLOW: 'Workflow', APPLICATION: 'Application',
}

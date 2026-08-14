import { useEffect, useRef, useState } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft,
  Check,
  Delete,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Mail,
  Moon,
  ScanLine,
  Smartphone,
  Sun,
  User as UserIcon,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/cn'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Alert, Avatar } from '@/components/ui/Misc'
import { HeroSection } from '@/components/auth/HeroSection'
import { useAuth } from '@/store/auth'
import { useSession } from '@/api/session'
import { users } from '@/mock/data'
import { PORTALS, portalOf, type PortalCode } from '@/config/portals'
import type { User } from '@/types'
import { login as apiLogin } from '@/api/organisation'
import { ProblemError } from '@/api/client'

type Step = 'credentials' | 'forgot' | 'otp' | 'reset' | 'pin'

export function LoginPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { userUid, loginAsDemo, portal, setPortal } = useAuth()
  // A real API token is required, not just the mock routing user: otherwise a
  // stale mock session (or an expired token) would bounce the user off the login
  // page and trap them on API-backed screens that 401 with no way to re-auth.
  const apiToken = useSession((s) => s.accessToken)
  const [darkMode, setDarkMode] = useState(false)

  const switching = Boolean(params.get('switch'))
  const [step, setStep] = useState<Step>('credentials')

  const chosen = portalOf(portal)

  if (userUid && apiToken && !switching) return <Navigate to={chosen.home} replace />

  const handlePortalPick = (code: PortalCode) => {
    setPortal(code)
    if (userUid) navigate(portalOf(code).home)
  }

  return (
    <div className="relative flex h-[100dvh] overflow-hidden" style={{ background: '#0F172A' }}>

      {/* Top bar — logo left, theme toggle right */}
      <div className="absolute inset-x-0 top-0 z-30 flex items-center justify-between px-8 py-6">
        {/* Brand */}
        <div className="flex items-center gap-3.5">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600 text-sm font-extrabold tracking-tighter text-white shadow-lg shadow-blue-900/40 ring-1 ring-inset ring-white/20">
            SSB
          </div>
          <div>
            <p className="text-[17px] font-semibold leading-tight tracking-tight text-white drop-shadow">SSB Industries</p>
            <p className="text-[12px] leading-tight text-white/60">Manufacturing ERP</p>
          </div>
        </div>

      </div>

      {/* ── Main two-column layout ── */}
      <div className="relative z-10 flex w-full max-w-[1920px] mx-auto h-[100dvh]">

        {/* LEFT — 45% hero */}
        <div className="hidden lg:flex lg:w-[45%] flex-col pt-24 pb-24">
          <HeroSection />
        </div>

        {/* RIGHT — 55% login panel */}
        <div className="flex w-full lg:w-[55%] items-center justify-end py-4 lg:py-6 pr-4 lg:pr-6 overflow-y-auto">
          <div className="w-full h-full max-h-[820px] max-w-5xl">

            {/* Premium white card wrapping Sign-in + Portal chooser side by side */}
            <div
              className="overflow-hidden rounded-[32px] h-full shadow-[0_32px_80px_rgba(0,0,0,0.3)] bg-surface border border-border"
              style={{
                animation: 'fadeSlideUp 0.35s ease both',
              }}
            >
              <div className="flex flex-col lg:flex-row h-full">

                {/* ─── LEFT column inside card: Portal chooser ─── */}
                <div className="w-full lg:w-[380px] xl:w-[440px] p-7 xl:p-10 border-b border-border lg:border-b-0 lg:border-r bg-surface flex flex-col">
                  <PortalChooser active={portal} onPick={handlePortalPick} />
                </div>

                {/* ─── RIGHT column inside card: Sign-in form ─── */}
                <div className="flex-1 min-w-0 p-8 xl:p-14 flex flex-col justify-center">
                  {step === 'credentials' && (
                    <Credentials
                      onNext={setStep}
                      portal={chosen}
                      onSuccess={() => {
                        // The backend authenticated the user; drive the mock UI
                        // shell (nav, portals, permissions) with the sysadmin.
                        loginAsDemo('usr-16')
                        navigate(chosen.home)
                      }}
                    />
                  )}
                  {step === 'forgot' && (
                    <Forgot onBack={() => setStep('credentials')} onNext={() => setStep('otp')} />
                  )}
                  {step === 'otp' && (
                    <Otp onBack={() => setStep('forgot')} onNext={() => setStep('reset')} />
                  )}
                  {step === 'reset' && <ResetPassword onDone={() => setStep('credentials')} />}
                  {step === 'pin' && (
                    <PinLogin
                      onBack={() => setStep('credentials')}
                      onDone={() => {
                        loginAsDemo('usr-12')
                        navigate(chosen.home)
                      }}
                    />
                  )}
                </div>

              </div>
            </div>



          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="absolute bottom-0 inset-x-0 z-20 border-t border-white/10 bg-black/20 py-2 text-center text-[12px] text-white/50">
        © {new Date().getFullYear()} SSB Industries. All rights reserved.
        <span className="mx-3 text-white/20">|</span>
        Version 1.0.0
        <span className="mx-3 text-white/20">|</span>
        support@ssbindustries.com
      </div>

      {/* Keyframe definition */}
      <style>{`
        @keyframes fadeSlideUp {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0);    }
        }
      `}</style>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
   PORTAL CHOOSER
   ═══════════════════════════════════════════════════════════ */

function PortalChooser({ active, onPick }: { active: PortalCode; onPick: (c: PortalCode) => void }) {
  const live = PORTALS.filter((p) => p.status === 'LIVE')
  const [focus, setFocus] = useState<PortalCode | null>(null)
  const [cursor, setCursor] = useState(0)
  const typed = useRef<{ digits: string; timer: number | null }>({ digits: '', timer: null })

  useEffect(() => {
    const clearTyped = () => {
      if (typed.current.timer !== null) window.clearTimeout(typed.current.timer)
      typed.current = { digits: '', timer: null }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement && e.key.length === 1) return
      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault()
        const next = typed.current.digits + e.key
        const index = Number(next) - 1
        const extendable = live.some((_, i) => {
          const label = String(i + 1)
          return label.length > next.length && label.startsWith(next)
        })
        if (!extendable) { clearTyped(); if (live[index]) onPick(live[index].code); return }
        if (live[index]) { setFocus(null); setCursor(index) }
        if (typed.current.timer !== null) window.clearTimeout(typed.current.timer)
        typed.current = {
          digits: next,
          timer: window.setTimeout(() => {
            const settled = Number(typed.current.digits) - 1
            clearTyped()
            if (live[settled]) onPick(live[settled].code)
          }, 450),
        }
        return
      }
      const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 2, ArrowUp: -2 }[e.key]
      if (step) {
        e.preventDefault(); clearTyped(); setFocus(null)
        setCursor((c) => Math.max(0, Math.min(live.length - 1, c + step)))
        return
      }
      if (e.key === 'Enter' && live[cursor] && !(e.target instanceof HTMLInputElement)) {
        e.preventDefault(); clearTyped(); onPick(live[cursor].code); return
      }
      if (e.key === 'Escape') clearTyped()
    }
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey); clearTyped() }
  }, [live, cursor, onPick])

  return (
    <div className="flex flex-col h-full">
      <div className="mb-5">
        <h2 className="text-[24px] font-bold tracking-tight text-fg">Choose your portal</h2>
        <p className="mt-0.5 text-[15px] text-fg-muted">Switch any time from the header</p>
      </div>

      {/* 2-column portal grid */}
      <div className="grid grid-cols-2 gap-3">
        {live.map((p, i) => {
          const Icon = p.icon
          const isActive = active === p.code
          const isCursor = !focus && i === cursor
          return (
            <button
              key={p.code}
              type="button"
              onClick={() => onPick(p.code)}
              onMouseEnter={() => { setFocus(p.code); setCursor(i) }}
              onMouseLeave={() => setFocus(null)}
              className={cn(
                'group relative flex items-center gap-3 rounded-[12px] border p-3 text-left transition-all duration-200',
                isActive
                  ? 'border-brand-500 bg-[#EEF3FF] shadow-sm'
                  : isCursor
                    ? 'border-border-strong bg-surface-2'
                    : 'border-border bg-surface hover:border-brand-300 hover:bg-[#F5F8FF] hover:shadow-sm',
              )}
              style={{ minHeight: 56 }}
            >
              {/* Gradient icon */}
              <span
                className={cn(
                  'relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-sm transition-transform duration-200 group-hover:-translate-y-0.5',
                  p.gradient,
                )}
              >
                <Icon className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                {/* Small index badge */}
                <span className="block truncate text-[13px] font-semibold text-fg leading-snug">{p.name}</span>
                <span className="block text-[11px] font-medium text-fg-subtle mt-0.5">#{i + 1}</span>
              </span>
            </button>
          )
        })}
      </div>


    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
   CREDENTIALS
   ═══════════════════════════════════════════════════════════ */

function Credentials({
  onNext,
  onSuccess,
  portal,
}: {
  onNext: (s: Step) => void
  onSuccess: () => void
  portal: { name: string; icon: LucideIcon; gradient: string }
}) {
  const [loginId, setLoginId] = useState('admin')
  const [password, setPassword] = useState('admin123')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [remember, setRemember] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      // Authenticate against the real FastAPI backend; this stores the JWT +
      // active company in the session, so the Organisation screens can load.
      await apiLogin(loginId.trim(), password)
      onSuccess()
    } catch (err) {
      setError(
        err instanceof ProblemError
          ? (Array.isArray(err.problem.detail) ? err.problem.detail.map((d: any) => d.msg).join(', ') : err.problem.detail) || 'Incorrect login id or password.'
          : 'Cannot reach the backend. Check it is running and VITE_API_BASE_URL is correct.',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col">
      {/* Selected portal badge */}
      <div className="mb-6 flex items-center justify-center">
        {(() => {
          const PortalIcon = portal.icon
          return (
            <div className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 bg-[#2F5BFF] shadow-sm">
              <PortalIcon className="h-4 w-4 text-white" />
              <span className="text-[15px] font-semibold text-white">{portal.name}</span>
            </div>
          )
        })()}
      </div>

      {/* Heading */}
      <div className="mb-8 text-center">
        <h1 className="text-[32px] font-bold tracking-tight text-fg">Welcome back!</h1>
        <p className="mt-1.5 text-[15px] text-fg-muted">Sign in to continue to SSB ERP</p>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-danger/20 bg-danger/10 p-3 text-sm text-danger">
          {error}
        </div>
      )}

      {/* Username */}
      <div className="space-y-5">
        <div>
          <label className="block text-[13px] font-medium text-fg mb-1.5">User name</label>
          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-fg-subtle">
              <UserIcon className="h-[18px] w-[18px]" />
            </span>
            <input
              required
              autoFocus
              autoComplete="username"
              value={loginId}
              onChange={(e) => setLoginId(e.target.value)}
              className="block h-[48px] w-full rounded-[12px] border border-transparent bg-slate-100 pl-11 pr-4 text-[15px] text-fg transition-all duration-200 focus:bg-white focus:border-brand-500 focus:outline-none focus:ring-[3px] focus:ring-brand-500/20 hover:bg-slate-200"
            />
          </div>
        </div>

        {/* Password */}
        <div>
          <label className="block text-[13px] font-medium text-fg mb-1.5">Password</label>
          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-fg-subtle">
              <Lock className="h-[18px] w-[18px]" />
            </span>
            <input
              required
              type={show ? 'text' : 'password'}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="block h-[48px] w-full rounded-[12px] border border-transparent bg-slate-100 pl-11 pr-11 text-[15px] text-fg transition-all duration-200 focus:bg-white focus:border-brand-500 focus:outline-none focus:ring-[3px] focus:ring-brand-500/20 hover:bg-slate-200"
            />
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              className="absolute inset-y-0 right-0 flex items-center pr-4 text-fg-subtle hover:text-brand-500"
              tabIndex={-1}
            >
              {show ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
            </button>
          </div>
        </div>

        {/* Remember me + Forgot */}
        <div className="flex items-center justify-between px-0.5">
          <label className="flex cursor-pointer items-center gap-2 text-[15px] text-fg-muted select-none">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="h-4 w-4 rounded border-border-strong accent-brand-500"
            />
            Remember me
          </label>
          <button
            type="button"
            onClick={() => onNext('forgot')}
            className="text-[15px] font-medium text-brand-500 transition-colors hover:text-brand-600 hover:underline"
          >
            Forgot password?
          </button>
        </div>
      </div>

      {/* Sign In button */}
      <button
        type="submit"
        disabled={busy}
        className="mt-6 flex h-[48px] w-full items-center justify-center rounded-[12px] bg-[#2F5BFF] text-[15px] font-semibold text-white transition-all duration-200 hover:bg-brand-600 shadow-[0_4px_12px_rgba(47,91,255,0.24)] disabled:opacity-60"
      >
        {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Login'}
      </button>
    </form>
  )
}

/* Microsoft four-square SVG */
function MicrosoftMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={className} aria-hidden focusable="false">
      <rect x="1" y="1" width="8" height="8" fill="#F25022" />
      <rect x="11" y="1" width="8" height="8" fill="#7FBA00" />
      <rect x="1" y="11" width="8" height="8" fill="#00A4EF" />
      <rect x="11" y="11" width="8" height="8" fill="#FFB900" />
    </svg>
  )
}

/* ═══════════════════════════════════════════════════════════
   FORGOT PASSWORD
   ═══════════════════════════════════════════════════════════ */

function Forgot({ onBack, onNext }: { onBack: () => void; onNext: () => void }) {
  const [via, setVia] = useState<'email' | 'sms'>('email')
  const [busy, setBusy] = useState(false)
  return (
    <div>
      <BackLink onClick={onBack}>Back to sign in</BackLink>
      <h2 className="text-2xl font-bold tracking-tight text-gray-900">Reset your password</h2>
      <p className="mt-2 text-sm text-gray-500">
        We'll send a one-time code valid for 10 minutes.
      </p>

      <div className="mt-6">
        <label className="block text-[13px] font-medium text-gray-700 mb-1.5">Login ID or email</label>
        <div className="relative">
          <Mail className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            autoFocus
            placeholder="sysadmin"
            className="block h-[52px] w-full rounded-[14px] border border-gray-300 pl-11 pr-4 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/25"
          />
        </div>
      </div>

      <div className="mt-4">
        <p className="mb-2 text-[13px] font-medium text-gray-700">Send the code by</p>
        <div className="grid grid-cols-2 gap-2.5">
          {(['email', 'sms'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setVia(m)}
              className={cn(
                'flex items-center gap-2.5 rounded-[14px] border px-3 py-3 text-left text-sm transition-all',
                via === m ? 'border-blue-500 bg-blue-50 font-semibold text-blue-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50',
              )}
            >
              {m === 'email' ? <Mail className="h-4 w-4" /> : <Smartphone className="h-4 w-4" />}
              {m === 'sms' ? 'SMS' : 'Email'}
            </button>
          ))}
        </div>
      </div>

      <button
        type="button"
        className="mt-6 flex h-[52px] w-full items-center justify-center rounded-[14px] bg-gradient-to-r from-blue-600 to-blue-800 text-[15px] font-semibold text-white transition-all hover:-translate-y-0.5 hover:shadow-md"
        onClick={() => { setBusy(true); setTimeout(() => { setBusy(false); onNext() }, 450) }}
      >
        {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Send code'}
      </button>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
   OTP
   ═══════════════════════════════════════════════════════════ */

function Otp({ onBack, onNext }: { onBack: () => void; onNext: () => void }) {
  const [seconds, setSeconds] = useState(120)
  useEffect(() => {
    const t = setInterval(() => setSeconds((s) => Math.max(0, s - 1)), 1000)
    return () => clearInterval(t)
  }, [])
  const mm = String(Math.floor(seconds / 60)).padStart(2, '0')
  const ss = String(seconds % 60).padStart(2, '0')

  return (
    <div>
      <BackLink onClick={onBack}>Back</BackLink>
      <h2 className="text-2xl font-bold tracking-tight text-gray-900">Enter the code</h2>
      <p className="mt-2 text-sm text-gray-500">
        Sent to <span className="font-medium text-gray-800">i•••@ssbindustries.co.in</span>
      </p>
      <input
        className="mt-6 block h-[52px] w-full rounded-[14px] border border-gray-300 text-center font-mono text-xl tracking-[0.5em] focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/25"
        maxLength={6}
        placeholder="000000"
        inputMode="numeric"
        autoFocus
      />
      <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
        <span>Expires in <span className="font-mono font-semibold text-gray-800">{mm}:{ss}</span></span>
        <button disabled={seconds > 0} className="font-medium text-blue-600 hover:underline disabled:text-gray-400 disabled:no-underline">
          Resend code
        </button>
      </div>
      <button
        type="button"
        onClick={onNext}
        className="mt-6 flex h-[52px] w-full items-center justify-center rounded-[14px] bg-gradient-to-r from-blue-600 to-blue-800 text-[15px] font-semibold text-white transition-all hover:-translate-y-0.5"
      >
        Verify code
      </button>
      <p className="mt-3 text-center text-xs text-gray-400">3 attempts remaining</p>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
   RESET PASSWORD
   ═══════════════════════════════════════════════════════════ */

const RULES = [
  { id: 'len', label: 'At least 10 characters', test: (v: string) => v.length >= 10 },
  { id: 'upper', label: 'One uppercase letter', test: (v: string) => /[A-Z]/.test(v) },
  { id: 'lower', label: 'One lowercase letter', test: (v: string) => /[a-z]/.test(v) },
  { id: 'digit', label: 'One number', test: (v: string) => /\d/.test(v) },
  { id: 'special', label: 'One special character', test: (v: string) => /[^A-Za-z0-9]/.test(v) },
]

function ResetPassword({ onDone }: { onDone: () => void }) {
  const [pw, setPw] = useState('')
  const [confirm, setConfirm] = useState('')
  const allOk = RULES.every((r) => r.test(pw)) && pw === confirm && pw.length > 0

  return (
    <div>
      <h2 className="text-2xl font-bold tracking-tight text-gray-900">Set new password</h2>
      <p className="mt-2 text-sm text-gray-500">You cannot reuse any of your last five passwords.</p>
      <div className="mt-6 space-y-4">
        <Input label="New password" type="password" required value={pw} onChange={(e) => setPw(e.target.value)} autoFocus leftIcon={<Lock className="h-4 w-4" />} />
        <Input
          label="Confirm new password"
          type="password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          leftIcon={<Lock className="h-4 w-4" />}
          error={confirm && pw !== confirm ? 'Passwords do not match' : undefined}
        />
      </div>
      <div className="mt-4 space-y-2 rounded-xl border border-gray-200 bg-gray-50 p-3.5">
        {RULES.map((r) => {
          const ok = r.test(pw)
          return (
            <div key={r.id} className="flex items-center gap-2.5 text-xs">
              <span className={cn('flex h-4 w-4 items-center justify-center rounded-full transition-colors', ok ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-400')}>
                {ok ? <Check className="h-2.5 w-2.5" /> : <span className="h-1 w-1 rounded-full bg-current" />}
              </span>
              <span className={ok ? 'text-gray-800' : 'text-gray-400'}>{r.label}</span>
            </div>
          )
        })}
      </div>
      <button
        type="button"
        disabled={!allOk}
        onClick={onDone}
        className="mt-6 flex h-[52px] w-full items-center justify-center rounded-[14px] bg-gradient-to-r from-blue-600 to-blue-800 text-[15px] font-semibold text-white transition-all hover:-translate-y-0.5 disabled:opacity-50"
      >
        Set password and sign in
      </button>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
   PIN LOGIN
   ═══════════════════════════════════════════════════════════ */

function PinLogin({ onBack, onDone }: { onBack: () => void; onDone: () => void }) {
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const press = (d: string) => {
    if (pin.length >= 6) return
    const next = pin + d
    setPin(next)
    if (next.length === 6) { setBusy(true); setTimeout(onDone, 450) }
  }
  return (
    <div>
      <BackLink onClick={onBack}>Back to standard sign in</BackLink>
      <h2 className="text-2xl font-bold tracking-tight text-gray-900">Shop floor sign in</h2>
      <p className="mt-2 text-sm text-gray-500">Scan your badge, or enter your 6-digit PIN.</p>
      <button className="mt-5 flex w-full items-center justify-center gap-2.5 rounded-xl border-2 border-dashed border-gray-300 py-6 text-sm font-medium text-gray-500 transition hover:border-blue-500 hover:text-blue-600">
        <ScanLine className="h-5 w-5" /> Scan badge
      </button>
      <div className="mt-6 flex justify-center gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <span key={i} className={cn('h-3 w-3 rounded-full transition-all', i < pin.length ? 'scale-110 bg-blue-600' : 'bg-gray-300')} />
        ))}
      </div>
      <div className="mx-auto mt-6 grid max-w-[16rem] grid-cols-3 gap-2.5">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <PinKey key={d} onClick={() => press(d)}>{d}</PinKey>
        ))}
        <PinKey onClick={() => setPin('')} muted>C</PinKey>
        <PinKey onClick={() => press('0')}>0</PinKey>
        <PinKey onClick={() => setPin((p) => p.slice(0, -1))} muted><Delete className="h-4 w-4" /></PinKey>
      </div>
      {busy && <p className="mt-5 flex items-center justify-center gap-2 text-xs text-gray-400"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Signing in…</p>}
    </div>
  )
}

function PinKey({ children, onClick, muted }: { children: React.ReactNode; onClick: () => void; muted?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex h-14 items-center justify-center rounded-xl border text-lg font-medium transition-all active:scale-95',
        muted ? 'border-gray-200 bg-gray-50 text-gray-500 hover:bg-gray-100' : 'border-gray-200 bg-white text-gray-800 shadow-sm hover:border-blue-300 hover:bg-blue-50',
      )}
    >
      {children}
    </button>
  )
}

/* ═══════════════════════════════════════════════════════════
   SHARED
   ═══════════════════════════════════════════════════════════ */

function BackLink({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="mb-5 inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 transition-colors hover:text-gray-900"
    >
      <ArrowLeft className="h-3.5 w-3.5" /> {children}
    </button>
  )
}

/* ═══════════════════════════════════════════════════════════
   DEMO USERS
   ═══════════════════════════════════════════════════════════ */

const DEMO = ['usr-16', 'usr-01', 'usr-02', 'usr-04', 'usr-06', 'usr-05', 'usr-12', 'usr-15']

function DemoUsers({ onPick }: { onPick: (uid: string) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="mt-4 rounded-2xl border border-white/20 bg-white/10 backdrop-blur-md px-5 py-3">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between text-[12px] font-medium text-white/70 transition-colors hover:text-white"
      >
        <span>Prototype — sign in as a demo user</span>
        <span className="text-base leading-none text-white/40">{open ? '−' : '+'}</span>
      </button>
      {open && (
        <div className="mt-3 grid grid-cols-2 gap-1.5">
          {DEMO.map((uid) => {
            const u = users.find((x) => x.uid === uid)!
            return (
              <button
                key={uid}
                onClick={() => onPick(uid)}
                className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-2.5 py-2 text-left transition-all hover:border-white/20 hover:bg-white/10"
              >
                <Avatar name={u.fullName} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[11px] font-medium text-white/90">{u.fullName}</span>
                  <span className="block truncate text-[10px] text-white/40">{u.designation}</span>
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

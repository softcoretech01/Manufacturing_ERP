/**
 * Real HTTP client for the ERP backend (CLAUDE.md §6, §7).
 *
 * This is the seam that replaces mock data with the FastAPI API. It:
 *  - reads the base URL from an env var (never hard-coded),
 *  - attaches the RS256 access token,
 *  - on a 401, rotates the refresh token once and retries,
 *  - parses RFC-9457 `application/problem+json` into a typed {@link ProblemError},
 *  - returns the parsed body (list endpoints are enveloped as `{ data, meta }`).
 *
 * It is deliberately additive: existing mock screens keep working until each is
 * migrated to the TanStack Query hooks in `src/hooks/`.
 */

import { getSession, setTokens, clearSession } from './session'

const BASE_URL: string =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:8000/api/v1'

export interface PageMeta {
  page: number
  page_size: number
  total: number
  total_pages: number
  sort?: string | null
}

export interface Page<T> {
  data: T[]
  meta: PageMeta
}

export interface ProblemDetail {
  type: string
  title: string
  status: number
  detail: string
  instance?: string
  correlation_id?: string
  rule_code?: string
  errors?: { field: string; code: string; message: string }[]
}

/** Typed error carrying the problem+json body so the UI can show field errors. */
export class ProblemError extends Error {
  readonly status: number
  readonly problem: ProblemDetail
  constructor(problem: ProblemDetail) {
    super(problem.detail || problem.title)
    this.name = 'ProblemError'
    this.status = problem.status
    this.problem = problem
  }
  /** Machine-readable problem type slug, e.g. 'concurrent-modification'. */
  get kind(): string {
    return this.problem.type.split('/').pop() ?? 'error'
  }
}

interface RequestOptions {
  params?: Record<string, string | number | boolean | undefined | null>
  body?: unknown
  headers?: Record<string, string>
  /** Internal: prevents infinite refresh recursion. */
  _retried?: boolean
}

function buildUrl(path: string, params?: RequestOptions['params']): string {
  const base = BASE_URL.replace(/\/$/, '')
  // Support both an absolute base (http://host/api/v1) and a relative one
  // (/api/v1, served same-origin via the Vite dev proxy).
  const absolute = /^https?:\/\//i.test(base) ? base + path : window.location.origin + base + path
  const url = new URL(absolute)
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v))
    }
  }
  return url.toString()
}

async function parse(res: Response): Promise<unknown> {
  if (res.status === 204) return undefined
  const text = await res.text()
  const body = text ? JSON.parse(text) : undefined
  if (!res.ok) {
    // problem+json (or any JSON error) → typed error
    throw new ProblemError(
      (body as ProblemDetail | undefined) ?? {
        type: 'about:blank',
        title: res.statusText,
        status: res.status,
        detail: res.statusText,
      },
    )
  }
  return body
}

/** One rotation attempt shared across concurrent 401s. */
let refreshing: Promise<boolean> | null = null

async function tryRefresh(): Promise<boolean> {
  const { refreshToken } = getSession()
  if (!refreshToken) return false
  if (!refreshing) {
    refreshing = (async () => {
      try {
        const res = await fetch(buildUrl('/auth/refresh'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: refreshToken }),
        })
        if (!res.ok) return false
        const data = (await res.json()) as { access_token: string; refresh_token: string }
        setTokens(data.access_token, data.refresh_token)
        return true
      } catch {
        return false
      } finally {
        refreshing = null
      }
    })()
  }
  return refreshing
}

async function request<T>(method: string, path: string, opts: RequestOptions = {}): Promise<T> {
  const { accessToken } = getSession()
  const headers: Record<string, string> = { Accept: 'application/json', ...opts.headers }
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json'
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`

  const res = await fetch(buildUrl(path, opts.params), {
    method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  })

  if (res.status === 401 && !opts._retried && (await tryRefresh())) {
    return request<T>(method, path, { ...opts, _retried: true })
  }
  if (res.status === 401) {
    // The session is gone and refresh could not recover it. Clear it and send the
    // user to sign in, rather than leaving them on an API-backed page that just
    // keeps erroring with "Missing Authorization header". The path guard avoids a
    // redirect loop while ON /login (e.g. a wrong-password 401 shows inline there).
    clearSession()
    if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
      window.location.assign('/login')
    }
  }
  return (await parse(res)) as T
}

export const api = {
  get: <T>(path: string, params?: RequestOptions['params']) => request<T>('GET', path, { params }),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, { body }),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, { body }),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, { body }),
  del: <T>(path: string) => request<T>('DELETE', path),
}

/**
 * Client-side field validators — immediate feedback that mirrors the server rules
 * (app/core/validators.py + organisation domain rules). The backend remains the
 * source of truth; these just save a round-trip and show the error inline.
 */

export const patterns = {
  pan: /^[A-Z]{5}[0-9]{4}[A-Z]$/,
  gstin: /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/,
  email: /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/,
  pincode: /^[1-9][0-9]{5}$/,
  phone: /^\+?[0-9][0-9\s-]{6,19}$/,
}

const messages: Record<keyof typeof patterns, string> = {
  pan: 'PAN must match AAAAA9999A.',
  gstin: 'GSTIN format is invalid.',
  email: 'Enter a valid e-mail, e.g. name@company.com.',
  pincode: 'Pincode must be 6 digits.',
  phone: 'Digits, spaces and hyphens only (7–20 chars).',
}

/** Returns an error string if `value` is non-empty and malformed, else undefined.
 * Empty values pass (use `required` separately for mandatory fields). */
export function checkField(kind: keyof typeof patterns, value: string): string | undefined {
  const v = value.trim()
  if (!v) return undefined
  return patterns[kind].test(v) ? undefined : messages[kind]
}

/** Validate a map of {field: [kind, value]} and return {field: message} for the bad ones. */
export function collectErrors(
  spec: Record<string, [keyof typeof patterns, string]>,
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [field, [kind, value]] of Object.entries(spec)) {
    const msg = checkField(kind, value)
    if (msg) out[field] = msg
  }
  return out
}

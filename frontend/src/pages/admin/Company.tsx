import { useEffect, useState } from 'react'
import { Building2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader, DataRow } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Alert, PageHeader } from '@/components/ui/Misc'
import { Input, Select } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { ProblemError } from '@/api/client'
import { useSession } from '@/api/session'
import { useCompanies, useUpdateCompany } from '@/hooks/useOrganisation'
import { collectErrors } from '@/lib/validate'

/** Wired to the live FastAPI backend — the active company's profile. */

const STATES = [
  { code: '33', name: 'Tamil Nadu' },
  { code: '29', name: 'Karnataka' },
  { code: '27', name: 'Maharashtra' },
  { code: '24', name: 'Gujarat' },
  { code: '07', name: 'Delhi' },
  { code: '36', name: 'Telangana' },
]

interface FormState {
  legal_name: string
  trade_name: string
  pan: string
  gst_state_code: string
  phone: string
  email: string
  website: string
  address_line1: string
  pincode: string
}

export function CompanyPage() {
  const toast = useToast()
  const companyUid = useSession((s) => s.companyUid)
  const { data, isLoading, error, refetch } = useCompanies({ page_size: 5 })
  const company = data?.data?.[0]
  const updateCompany = useUpdateCompany()

  const [form, setForm] = useState<FormState>({
    legal_name: '', trade_name: '', pan: '', gst_state_code: '33',
    phone: '', email: '', website: '', address_line1: '', pincode: '',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const set = (p: Partial<FormState>) => setForm((f) => ({ ...f, ...p }))

  useEffect(() => {
    if (company) {
      setForm((f) => ({
        ...f,
        legal_name: company.legal_name,
        trade_name: company.trade_name ?? '',
        pan: company.pan ?? '',
        gst_state_code: company.gst_state_code ?? '33',
      }))
    }
  }, [company])

  function save() {
    if (!company) return
    // Client-side format checks mirror the server rules (immediate feedback).
    const clientErrors = collectErrors({
      pan: ['pan', form.pan],
      email: ['email', form.email],
      pincode: ['pincode', form.pincode],
      phone: ['phone', form.phone],
    })
    if (Object.keys(clientErrors).length) {
      setErrors(clientErrors)
      toast.error('Check the highlighted fields', 'Some values are not in the expected format.')
      return
    }
    setErrors({})
    updateCompany.mutate(
      {
        uid: company.uid,
        body: {
          version: company.version,
          legal_name: form.legal_name.trim(),
          trade_name: form.trade_name.trim() || null,
          pan: form.pan.trim().toUpperCase() || null,
          gst_state_code: form.gst_state_code,
          phone: form.phone.trim() || null,
          email: form.email.trim() || null,
          website: form.website.trim() || null,
          address_line1: form.address_line1.trim() || null,
          pincode: form.pincode.trim() || null,
        },
      },
      {
        onSuccess: () => toast.success('Company saved', `${form.legal_name} updated.`),
        onError: (e) => {
          if (e instanceof ProblemError) {
            const fe: Record<string, string> = {}
            for (const x of e.problem.errors ?? []) fe[x.field] = x.message
            setErrors(fe)
            toast.error(e.problem.title || 'Save failed', e.problem.detail)
          } else {
            toast.error('Save failed', 'Unknown error.')
          }
        },
      },
    )
  }

  return (
    <div>
      <PageHeader
        title={company?.legal_name ?? 'Company'}
        description={company ? `${company.trade_name ?? '—'} · ${company.code}` : 'Loading…'}
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Organisation' }, { label: 'Company' }]}
        badge={company && <Badge tone={company.is_active ? 'success' : 'neutral'}>{company.is_active ? 'Active' : 'Inactive'}</Badge>}
        actions={<Button variant="primary" size="sm" onClick={save} loading={updateCompany.isPending} disabled={!company}>Save</Button>}
      />

      {!companyUid && <Alert tone="warning" title="Not signed in to the backend">Sign in first so the app has an API session.</Alert>}
      {error && (
        <Alert tone="danger" title="Could not load the company">
          {error instanceof ProblemError ? error.problem.detail : 'Is the backend running?'}{' '}
          <button className="underline" onClick={() => refetch()}>Retry</button>
        </Alert>
      )}
      {isLoading && <p className="py-10 text-center text-sm text-fg-subtle">Loading company…</p>}

      {company && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="Legal identity" description="Statutory name and tax identifiers." />
            <CardBody className="space-y-3.5">
              <Input label="Company code" value={company.code} readOnly className="bg-surface-2"
                hint="Auto-generated · not editable" onChange={() => {}} />
              <Input label="Legal name" required value={form.legal_name} error={errors.legal_name} maxLength={200}
                onChange={(e) => set({ legal_name: e.target.value })} />
              <Input label="Trade name" value={form.trade_name} maxLength={200}
                onChange={(e) => set({ trade_name: e.target.value })} />
              <div className="grid grid-cols-2 gap-3">
                <Input label="PAN" value={form.pan} error={errors.pan} maxLength={10} placeholder="AABCS1429B"
                  onChange={(e) => set({ pan: e.target.value.toUpperCase() })} />
                <Select label="State (GST code)" value={form.gst_state_code}
                  onChange={(e) => set({ gst_state_code: e.target.value })}
                  options={STATES.map((s) => ({ value: s.code, label: `${s.name} (${s.code})` }))} />
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Contact & address" description="Used on printed documents." />
            <CardBody className="space-y-3.5">
              <Input label="Address" value={form.address_line1} maxLength={200}
                placeholder="Plot 42, SIDCO Industrial Estate" onChange={(e) => set({ address_line1: e.target.value })} />
              <div className="grid grid-cols-2 gap-3">
                <Input label="Pincode" value={form.pincode} error={errors.pincode} maxLength={6}
                  inputMode="numeric" placeholder="600001"
                  onChange={(e) => set({ pincode: e.target.value.replace(/[^0-9]/g, '') })} />
                <Input label="Phone" value={form.phone} error={errors.phone} maxLength={20}
                  inputMode="tel" placeholder="+91 98400 12345"
                  onChange={(e) => set({ phone: e.target.value })} />
              </div>
              <Input label="Email" type="email" value={form.email} error={errors.email} maxLength={150}
                onChange={(e) => set({ email: e.target.value })} />
              <Input label="Website" value={form.website} maxLength={150} placeholder="https://…"
                onChange={(e) => set({ website: e.target.value })} />
            </CardBody>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader title="Locale & accounting" description="Set at bootstrap; immutable here." />
            <CardBody className="grid gap-x-8 gap-y-1 py-1 sm:grid-cols-2">
              <DataRow label="Base currency" value={company.base_currency_code} />
              <DataRow label="FY start month" value={String(company.fy_start_month)} />
              <DataRow label="Timezone" value={company.timezone} />
              <DataRow label="Locale" value={company.locale} />
              <DataRow label="Entity type" value={company.entity_type ?? '—'} />
              <DataRow label="Version" value={String(company.version)} />
            </CardBody>
            <div className="border-t border-border p-3">
              <Alert tone="info">
                <Building2 className="mr-1 inline h-3.5 w-3.5" />
                Statutory registrations (GST/IEC/PF/ESI), branding and document templates are managed in a
                later phase. Base currency and FY start month are fixed once the first financial year exists.
              </Alert>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}

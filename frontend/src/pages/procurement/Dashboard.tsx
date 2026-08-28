import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileText, FileCheck2, Timer, PackageCheck, AlertTriangle } from 'lucide-react'
import { PageHeader, Section } from '@/components/ui/Misc'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { cn } from '@/lib/cn'
import { formatCurrency } from '@/lib/format'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1'

export function ProcurementDashboardPage() {
  const navigate = useNavigate()
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`${API_URL}/procurement/dashboard/`)
      .then((res) => res.json())
      .then((json) => {
        setData(json)
        setLoading(false)
      })
      .catch((err) => {
        console.error(err)
        setLoading(false)
      })
  }, [])

  if (loading || !data) return <div className="p-8 text-center text-fg-muted">Loading dashboard...</div>

  const { kpis, recentPo, recentGrn, overduePo } = data

  const kpiTiles = [
    { label: 'Pending PR Approvals', count: kpis.prPending, icon: FileText, tone: 'warning' as const },
    { label: 'Open RFQs', count: kpis.rfqOpen, icon: Timer, tone: 'progress' as const },
    { label: 'Pending PO Approvals', count: kpis.poPending, icon: FileCheck2, tone: 'warning' as const },
    { label: 'Open POs', count: kpis.openPoCount, icon: FileCheck2, tone: 'success' as const },
    { label: 'Pending GRNs', count: kpis.qcPending, icon: PackageCheck, tone: 'warning' as const },
  ]

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Procurement Dashboard"
        description="Overview of current procurement activities and pending approvals."
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Procurement' }]}
      />

      <div className="flex-1 overflow-auto p-6 bg-gray-50/50 space-y-6">
        
        {/* KPIs */}
        <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {kpiTiles.map((k, i) => (
            <div key={i} className="card p-4 flex flex-col justify-center items-center text-center space-y-2 bg-white">
              <span className={cn(
                'flex h-10 w-10 items-center justify-center rounded',
                k.tone === 'warning' && 'bg-warning/10 text-warning',
                k.tone === 'progress' && 'bg-progress/10 text-progress',
                k.tone === 'success' && 'bg-success/10 text-success'
              )}>
                <k.icon className="h-5 w-5" />
              </span>
              <span className="text-2xl font-bold text-fg">{k.count}</span>
              <span className="text-sm font-medium text-fg-muted">{k.label}</span>
            </div>
          ))}
        </div>

        {/* Recent Activity */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Recent POs */}
          <Card>
            <CardHeader title="Recent Purchase Orders" />
            <CardBody className="p-0">
              <table className="grid-table w-full">
                <thead>
                  <tr>
                    <th>PO Number</th>
                    <th>Supplier</th>
                    <th className="text-right">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {recentPo?.slice(0, 5).map((po: any) => (
                    <tr key={po.uid}>
                      <td className="font-medium text-brand-600 cursor-pointer" onClick={() => navigate('/procurement/orders')}>{po.docNo}</td>
                      <td>{po.supplierName}</td>
                      <td className="text-right">{formatCurrency(po.totalValue)}</td>
                    </tr>
                  ))}
                  {(!recentPo || recentPo.length === 0) && (
                    <tr><td colSpan={3} className="text-center py-4 text-gray-500">No recent purchase orders.</td></tr>
                  )}
                </tbody>
              </table>
            </CardBody>
          </Card>

          {/* Recent GRNs */}
          <Card>
            <CardHeader title="Recent Goods Receipts" />
            <CardBody className="p-0">
              <table className="grid-table w-full">
                <thead>
                  <tr>
                    <th>GRN Number</th>
                    <th>PO Number</th>
                    <th>Supplier</th>
                  </tr>
                </thead>
                <tbody>
                  {recentGrn?.slice(0, 5).map((grn: any) => (
                    <tr key={grn.uid}>
                      <td className="font-medium text-brand-600 cursor-pointer" onClick={() => navigate('/procurement/grn')}>{grn.docNo}</td>
                      <td>{grn.poNo}</td>
                      <td>{grn.supplierName}</td>
                    </tr>
                  ))}
                  {(!recentGrn || recentGrn.length === 0) && (
                    <tr><td colSpan={3} className="text-center py-4 text-gray-500">No recent goods receipts.</td></tr>
                  )}
                </tbody>
              </table>
            </CardBody>
          </Card>

        </div>
      </div>
    </div>
  )
}

import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'

import { formatCurrency, formatDate } from '../../lib/formatters'
import type { DashboardLatestPayment } from '../../services/dashboard-service'
import { DashboardEmpty } from './dashboard-main-chart'

export function LatestPaymentsTable({ payments }: { payments: DashboardLatestPayment[] }) {
  return (
    <section className="dashboard-panel dashboard-table-panel">
      <header className="dashboard-panel-header"><div><span className="dashboard-eyebrow">Financeiro</span><h2>Ultimos pagamentos</h2></div><Link to="/pagamentos">Ver todos <ArrowRight size={15} /></Link></header>
      {payments.length ? <div className="dashboard-table-wrap"><table><thead><tr><th>Cliente</th><th>Data</th><th>Valor</th><th>Forma</th></tr></thead><tbody>{payments.map((payment) => <tr key={payment.id}><td><Link to={`/clientes/${payment.clientId}`}>{payment.clientName}</Link></td><td>{formatDate(payment.date)}</td><td>{formatCurrency(payment.total)}</td><td><span className="soft-badge">{payment.method}</span></td></tr>)}</tbody></table></div> : <DashboardEmpty message="Os pagamentos recentes aparecerao nesta lista." />}
    </section>
  )
}

import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'

import { formatCurrency, formatDate } from '../../lib/formatters'
import type { DashboardLatestSale } from '../../services/dashboard-service'
import { DashboardEmpty } from './dashboard-main-chart'

export function LatestSalesTable({ sales }: { sales: DashboardLatestSale[] }) {
  return (
    <section className="dashboard-panel dashboard-table-panel">
      <header className="dashboard-panel-header"><div><span className="dashboard-eyebrow">Comercial</span><h2>Ultimas vendas</h2></div><Link to="/vendas">Ver todas <ArrowRight size={15} /></Link></header>
      {sales.length ? <div className="dashboard-table-wrap"><table><thead><tr><th>Cliente</th><th>Data</th><th>Valor</th><th>Status</th></tr></thead><tbody>{sales.map((sale) => <tr key={sale.id}><td><Link to={`/vendas/${sale.id}`}>{sale.clientName}</Link></td><td>{formatDate(sale.date)}</td><td>{formatCurrency(sale.total)}</td><td><span className={`soft-badge badge-${sale.status}`}>{sale.status}</span></td></tr>)}</tbody></table></div> : <DashboardEmpty message="As vendas recentes aparecerao nesta lista." />}
    </section>
  )
}

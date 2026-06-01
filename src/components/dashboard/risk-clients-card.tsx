import { ArrowRight, ShieldAlert } from 'lucide-react'
import { Link } from 'react-router-dom'

import { formatCurrency } from '../../lib/formatters'
import type { DashboardRiskClient } from '../../services/dashboard-service'
import { DashboardEmpty } from './dashboard-main-chart'

export function RiskClientsCard({ clients }: { clients: DashboardRiskClient[] }) {
  return (
    <section className="dashboard-panel">
      <header className="dashboard-panel-header"><div><span className="dashboard-eyebrow">Prioridade</span><h2>Clientes em risco</h2></div><Link to="/cobrancas">Ver todos <ArrowRight size={15} /></Link></header>
      {clients.length ? <div className="dashboard-list">{clients.map((client) => <Link className="risk-client-row" key={client.clientId} to={`/clientes/${client.clientId}`}><span className="risk-icon"><ShieldAlert size={16} /></span><div><strong>{client.name}</strong><small>{formatCurrency(client.overdueTotal)} em atraso</small></div><b>{client.daysLate}d</b></Link>)}</div> : <DashboardEmpty message="Nenhum cliente possui parcelas em atraso." />}
    </section>
  )
}

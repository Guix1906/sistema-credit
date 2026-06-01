import { ArrowRight, BellRing } from 'lucide-react'
import { Link } from 'react-router-dom'

import type { DashboardAlert } from '../../services/dashboard-service'
import { DashboardEmpty } from './dashboard-main-chart'

export function AlertsCard({ alerts }: { alerts: DashboardAlert[] }) {
  return (
    <section className="dashboard-panel">
      <header className="dashboard-panel-header"><div><span className="dashboard-eyebrow">Atencao</span><h2>Alertas</h2></div><Link to="/cobrancas">Ver todos <ArrowRight size={15} /></Link></header>
      {alerts.length ? <div className="dashboard-list">{alerts.map((alert) => <article className="dashboard-alert-row" key={alert.id}><span className={`alert-icon alert-${alert.severity}`}><BellRing size={16} /></span><div><strong>{alert.title}</strong><small>{alert.message}</small></div></article>)}</div> : <DashboardEmpty message="Nao existem alertas abertos." />}
    </section>
  )
}

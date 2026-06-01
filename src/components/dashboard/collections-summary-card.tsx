import { ArrowRight, CalendarClock, CheckCheck, Siren } from 'lucide-react'
import { Link } from 'react-router-dom'

import type { PremiumDashboardData } from '../../services/dashboard-service'

export function CollectionsSummaryCard({ data }: { data: PremiumDashboardData }) {
  const items = [
    { label: 'Vencem hoje', value: data.dueTodayCount, icon: CalendarClock, tone: 'due' },
    { label: 'Em cobranca', value: data.inCollectionCount, icon: Siren, tone: 'collection' },
    { label: 'Parcelas atrasadas', value: data.overdueCount, icon: Siren, tone: 'late' },
    { label: 'Parcelas pagas', value: data.paidCount, icon: CheckCheck, tone: 'paid' },
  ]
  return (
    <section className="dashboard-panel dashboard-collections">
      <header className="dashboard-panel-header"><div><span className="dashboard-eyebrow">Operacao</span><h2>Cobrancas</h2></div><Link to="/cobrancas">Abrir <ArrowRight size={15} /></Link></header>
      <div className="collections-grid">
        {items.map((item) => <div className={`collection-${item.tone}`} key={item.label}><item.icon size={17} /><strong>{item.value}</strong><span>{item.label}</span></div>)}
      </div>
    </section>
  )
}

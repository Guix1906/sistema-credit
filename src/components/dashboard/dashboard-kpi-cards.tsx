import { BadgeCheck, CalendarCheck, CircleDollarSign, HandCoins, Landmark, TrendingUp, TriangleAlert, UserRoundCheck, WalletCards, type LucideIcon } from 'lucide-react'

import { formatCurrency } from '../../lib/formatters'
import type { PremiumDashboardData } from '../../services/dashboard-service'

export function DashboardKpiCards({ data }: { data: PremiumDashboardData }) {
  const cards = [
    { label: 'A receber', value: data.totalReceivable, icon: CircleDollarSign, tone: 'receivable' },
    { label: 'Recebido', value: data.totalReceived, icon: BadgeCheck, tone: 'received' },
    { label: 'Lucro previsto', value: data.expectedProfit, icon: TrendingUp, tone: 'profit' },
    { label: 'Atrasado', value: data.overdueTotal, icon: TriangleAlert, tone: 'overdue' },
  ]
  const variation = data.monthlyVariation

  return (
    <>
      <section className="dashboard-kpi-grid" aria-label="Indicadores principais">
        <article className="dashboard-primary-kpi">
        <div className="dashboard-kpi-topline">
          <span className="dashboard-kpi-icon"><WalletCards size={19} /></span>
          {variation === null ? <small>Sem comparativo mensal</small> : <small className={variation >= 0 ? 'kpi-positive' : 'kpi-danger'}>{variation >= 0 ? '+' : ''}{variation.toFixed(1)}% no mes</small>}
        </div>
        <span>Carteira total</span>
        <strong>{formatCurrency(data.totalPortfolio)}</strong>
        <div className="kpi-progress-track"><i style={{ width: `${portfolioProgress(data)}%` }} /></div>
        <small>{formatCurrency(data.totalReceivable)} ainda em aberto</small>
        </article>
        {cards.map((card) => <KpiCard key={card.label} {...card} />)}
      </section>
      <section className="dashboard-operational-grid" aria-label="Resumo operacional">
        <OperationalCard icon={Landmark} label="Capital emprestado" value={formatCurrency(data.totalBorrowed)} />
        <OperationalCard icon={CalendarCheck} label="Recebido hoje" value={formatCurrency(data.receivedToday)} />
        <OperationalCard icon={HandCoins} label="Recebido no mes" value={formatCurrency(data.receivedMonth)} />
        <OperationalCard icon={TrendingUp} label="Lucro realizado" value={formatCurrency(data.realizedProfit)} />
        <OperationalCard icon={WalletCards} label="Vendas ativas" value={String(data.activeLoansCount)} />
        <OperationalCard icon={UserRoundCheck} label="Clientes ativos" value={String(data.activeClientsCount)} />
      </section>
    </>
  )
}

function OperationalCard({ label, value, icon: Icon }: { label: string; value: string; icon: LucideIcon }) {
  return <article className="dashboard-operational-card"><Icon size={17} /><div><span>{label}</span><strong>{value}</strong></div></article>
}

function KpiCard({ label, value, icon: Icon, tone }: { label: string; value: number; icon: LucideIcon; tone: string }) {
  return (
    <article className={`dashboard-kpi-card dashboard-kpi-${tone}`}>
      <div className="dashboard-kpi-topline">
        <span className="dashboard-kpi-icon"><Icon size={18} /></span>
      </div>
      <span>{label}</span>
      <strong>{formatCurrency(value)}</strong>
    </article>
  )
}

function portfolioProgress(data: PremiumDashboardData) {
  if (!data.totalPortfolio) return 0
  return Math.min(100, Math.max(0, ((data.totalPortfolio - data.totalReceivable) / data.totalPortfolio) * 100))
}

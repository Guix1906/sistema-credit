import { BadgeCheck, CalendarCheck, CircleDollarSign, HandCoins, Landmark, TrendingUp, TriangleAlert, UserRoundCheck, WalletCards, type LucideIcon } from 'lucide-react'
import { Link } from 'react-router-dom'

import { formatCurrency } from '../../lib/formatters'
import type { PremiumDashboardData } from '../../services/dashboard-service'

export function DashboardKpiCards({ data }: { data: PremiumDashboardData }) {
  const cards = [
    { label: 'A receber', value: data.totalReceivable, icon: CircleDollarSign, tone: 'receivable', to: '/carteira' },
    { label: 'Recebido', value: data.totalReceived, icon: BadgeCheck, tone: 'received', to: '/pagamentos' },
    { label: 'Lucro previsto', value: data.expectedProfit, icon: TrendingUp, tone: 'profit', to: '/relatorios' },
    { label: 'Atrasado', value: data.overdueTotal, icon: TriangleAlert, tone: 'overdue', to: '/cobrancas?queue=overdue' },
  ]
  const variation = data.monthlyVariation

  return (
    <>
      <section className="dashboard-kpi-grid" aria-label="Indicadores principais">
        <Link className="dashboard-primary-kpi dashboard-card-link" to="/carteira">
        <div className="dashboard-kpi-topline">
          <span className="dashboard-kpi-icon"><WalletCards size={19} /></span>
          {variation === null ? <small>Sem comparativo mensal</small> : <small className={variation >= 0 ? 'kpi-positive' : 'kpi-danger'}>{variation >= 0 ? '+' : ''}{variation.toFixed(1)}% no mes</small>}
        </div>
        <span>Carteira total</span>
        <strong>{formatCurrency(data.totalPortfolio)}</strong>
        <div className="kpi-progress-track"><i style={{ width: `${portfolioProgress(data)}%` }} /></div>
        <small>{formatCurrency(data.totalReceivable)} ainda em aberto</small>
        </Link>
        {cards.map((card) => <KpiCard key={card.label} {...card} />)}
      </section>
      <section className="dashboard-operational-grid" aria-label="Resumo operacional">
        <OperationalCard icon={Landmark} label="Capital emprestado" to="/carteira" value={formatCurrency(data.totalBorrowed)} />
        <OperationalCard icon={CalendarCheck} label="Recebido hoje" to="/pagamentos" value={formatCurrency(data.receivedToday)} />
        <OperationalCard icon={HandCoins} label="Recebido no mes" to="/pagamentos" value={formatCurrency(data.receivedMonth)} />
        <OperationalCard icon={TrendingUp} label="Lucro realizado" to="/relatorios" value={formatCurrency(data.realizedProfit)} />
        <OperationalCard icon={WalletCards} label="Vendas ativas" to="/carteira" value={String(data.activeLoansCount)} />
        <OperationalCard icon={UserRoundCheck} label="Clientes ativos" to="/clientes" value={String(data.activeClientsCount)} />
      </section>
    </>
  )
}

function OperationalCard({ label, value, icon: Icon, to }: { label: string; value: string; icon: LucideIcon; to: string }) {
  return <Link className="dashboard-operational-card dashboard-card-link" to={to}><Icon size={17} /><div><span>{label}</span><strong>{value}</strong></div></Link>
}

function KpiCard({ label, value, icon: Icon, tone, to }: { label: string; value: number; icon: LucideIcon; tone: string; to: string }) {
  return (
    <Link className={`dashboard-kpi-card dashboard-card-link dashboard-kpi-${tone}`} to={to}>
      <div className="dashboard-kpi-topline">
        <span className="dashboard-kpi-icon"><Icon size={18} /></span>
      </div>
      <span>{label}</span>
      <strong>{formatCurrency(value)}</strong>
    </Link>
  )
}

function portfolioProgress(data: PremiumDashboardData) {
  if (!data.totalPortfolio) return 0
  return Math.min(100, Math.max(0, ((data.totalPortfolio - data.totalReceivable) / data.totalPortfolio) * 100))
}

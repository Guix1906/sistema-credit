import { useCallback, useState } from 'react'

import { AlertsCard } from '../components/dashboard/alerts-card'
import { CollectionsSummaryCard } from '../components/dashboard/collections-summary-card'
import { DashboardHeader } from '../components/dashboard/dashboard-header'
import { DashboardKpiCards } from '../components/dashboard/dashboard-kpi-cards'
import { DashboardMainChart } from '../components/dashboard/dashboard-main-chart'
import { LatestPaymentsTable } from '../components/dashboard/latest-payments-table'
import { LatestSalesTable } from '../components/dashboard/latest-sales-table'
import { RiskClientsCard } from '../components/dashboard/risk-clients-card'
import { useAsyncData } from '../hooks/use-async-data'
import { localIsoDate } from '../lib/dates'
import { getDashboardFallback, getPremiumDashboardData, type DashboardPeriod } from '../services/dashboard-service'

export function DashboardPage() {
  const [period, setPeriod] = useState<DashboardPeriod>('12m')
  const [referenceDate, setReferenceDate] = useState(() => localIsoDate())
  const loader = useCallback(() => getPremiumDashboardData(period, referenceDate), [period, referenceDate])
  const { data, loading, error } = useAsyncData(loader, getDashboardFallback(), {
    cacheKey: `dashboard:${period}:${referenceDate}`,
    staleTime: 2 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  })

  return (
    <section className="dashboard-premium">
      <DashboardHeader date={referenceDate} onDateChange={setReferenceDate} />
      {error ? <p className="form-message">{error}</p> : null}
      {loading ? <div className="dashboard-loading-grid"><div className="skeleton-card" /><div className="skeleton-card" /><div className="skeleton-card" /></div> : (
        <>
          <DashboardKpiCards data={data} />
          <div className="dashboard-main-grid">
            <DashboardMainChart data={data.chart} onPeriodChange={setPeriod} period={period} />
            <div className="dashboard-side-stack">
              <CollectionsSummaryCard data={data} />
              <AlertsCard alerts={data.alerts} />
            </div>
          </div>
          <div className="dashboard-bottom-grid">
            <RiskClientsCard clients={data.riskClients} />
            <LatestSalesTable sales={data.latestSales} />
            <LatestPaymentsTable payments={data.latestPayments} />
          </div>
        </>
      )}
    </section>
  )
}
